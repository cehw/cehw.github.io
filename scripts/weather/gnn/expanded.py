"""Independent all-station GNN experiment; never changes CLP's 12-node baseline.

Code is maintained here; datasets, checkpoints and metrics live on climet3.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import zipfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import torch
from torch import nn

from forecast import CLP, API, BUILD, CHECKPOINT, VARIABLES, read_csv
from stellerus_clp.clp_10min_dataset import NormalizationStats, cyclic_time_features, build_spatial_adjacency
from stellerus_clp.clp_10min_model import MaskedTemporalEncoder, DenseGraphAggregation, AutoregressiveGRUDecoder, masked_multitarget_loss
from stellerus_clp.hko_core_10min import compass_8_to_degrees

ROOT = Path('/workspace/wanghan/personal/weather/expanded')
SOURCE = API / 'derived/hko_10min/builds/20260826T101358747697Z'
TARGETS = (0, 1, 3, 4)
# HKO station catalogue; HSS from the official regional map's station-config-aws.js.
EXTRA_COORDS = {
    'CCB': (22+12/60+39/3600, 114+1/60+45/3600),
    'NP': (22+17/60+40/3600, 114+11/60+59/3600),
    'SC': (22+20/60+45/3600, 113+53/60+28/3600),
    'SHL': (22+20/60+48/3600, 114+5/60+11/3600),
    'SF': (22+17/60+35/3600, 114+10/60+7/3600),
    'TPK': (22+26/60+33/3600, 114+11/60+2/3600),
    'TUN': (22+23/60+26/3600, 113+58/60+36/3600),
    'TME': (22+28/60+6/3600, 114+21/60+47/3600),
    'HSS': (22.218300, 114.214290),
}


def station_metadata():
    coords = {r['abbreviation']: (float(r['latitude']), float(r['longitude']))
              for r in read_csv('/workspace/wanghan/data/HKO2025/station_info.csv')}
    coords.update(EXTRA_COORDS)
    nodes = {}
    for r in read_csv(CLP / 'config/hko_station_map.csv'):
        if r['feed'] not in ('temperature', 'humidity', 'wind', 'pressure'):
            continue
        code = r['hko2025_station_code']
        if r['api_station_name'] == 'Hong Kong Sea School':
            code = 'HSS'
        if not code:
            raise ValueError(f"Unmapped station: {r['api_station_name']}")
        lat, lon = coords[code]
        node = nodes.setdefault(code, dict(code=code, name=r['api_station_name'], lat=lat, lon=lon, feeds=[]))
        node['feeds'].append(r['feed'])
    for code, name in {'HKP': 'Hong Kong Park', 'HKO': 'Hong Kong Observatory',
                       'SHL': 'Tsing Yi (Shell Oil Depot)', 'TUN': 'Tuen Mun (Government Offices)',
                       'BHD': 'Stanley (Bluff Head)', 'TME': 'Tap Mun East'}.items():
        nodes[code]['name'] = name
    return [nodes[code] for code in sorted(nodes)]


class ExpandedGNN(nn.Module):
    """The same shared CLP modules on a separately constructed station graph."""
    def __init__(self, saved, nodes):
        super().__init__()
        cfg = dict(saved['model_config'])
        cfg.update(n_nodes=len(nodes), n_lead=36)
        self.config = SimpleNamespace(**cfg, n_targets=len(cfg['target_names']))
        c = self.config
        adj = build_spatial_adjacency(np.array([[n['lat'], n['lon']] for n in nodes]), k_neighbors=4)
        self.register_buffer('adjacency', torch.tensor(adj))
        self.temporal_encoder = MaskedTemporalEncoder(c)
        self.graph_layers = nn.ModuleList(DenseGraphAggregation(c.hidden_dim, c.dropout) for _ in range(c.graph_layers))
        self.decoder = AutoregressiveGRUDecoder(c)
        weights = dict(saved['model_state'])
        weights['adjacency'] = self.adjacency
        weights['decoder.step_embedding.weight'] = weights['decoder.step_embedding.weight'][:36]
        self.load_state_dict(weights, strict=True)

    def forward(self, x, mask, times):
        state = self.temporal_encoder(x, mask, times)
        for layer in self.graph_layers:
            state = layer(state, self.adjacency)
        return self.decoder(state)


def normalization(saved):
    s = saved['normalization']
    return NormalizationStats(tuple(VARIABLES), np.array(s['means'], dtype=np.float32),
                              np.array(s['scales'], dtype=np.float32),
                              np.datetime64(s['fit_start']), np.datetime64(s['fit_end']))


def anchor_temperature(physical, history):
    """Anchor the learned temperature trajectory to the latest measured state.

    The original lowland checkpoint has large absolute biases at mountain sites.
    This removes the initial offset, retaining its subsequent GNN-predicted changes.
    It uses observations available at issue time only; no future observations.
    """
    result=physical.copy()
    latest=np.full(history.shape[1],np.nan,dtype=np.float32)
    for t in range(-6,0):
        value=history[t,:,0]
        latest=np.where(np.isfinite(value),value,latest)
    valid=np.isfinite(latest)
    result[valid,:,0] = latest[valid,None] + (result[valid,:,0]-result[valid,0,0,None])
    return result


def original_core_runtime(nodes):
    from stellerus_clp.clp_10min_infer import load_runtime
    _,stats,model,saved=load_runtime(BUILD,CHECKPOINT,torch.device('cpu'))
    indices=[next(i for i,n in enumerate(nodes) if n['code']==code) for code in saved['source_nodes']]
    return model.eval(),stats,indices


def retain_original_core(physical,history,times,runtime):
    """Preserve the established model at its original physical source nodes."""
    model,stats,indices=runtime
    raw=history[:,indices];mask=np.isfinite(raw);x=np.where(mask,stats.normalize(raw),0)
    with torch.inference_mode():
        pred=model(torch.tensor(x.transpose(1,0,2)[None]),torch.tensor(mask.transpose(1,0,2)[None]),
                   torch.tensor(cyclic_time_features(times)[None])).numpy()
    result=physical.copy()
    result[indices]=stats.denormalize_targets(pred,model.config.target_names)[0,:,:36,:physical.shape[-1]]
    return result


def prepare(root):
    root.mkdir(parents=True, exist_ok=True)
    nodes = station_metadata()
    (root / 'stations.json').write_text(json.dumps(nodes, indent=2) + '\n')
    start, end = np.datetime64('2025-11-01T00:10', 'm'), np.datetime64('2026-08-25T23:50', 'm')
    times = np.arange(start, end + np.timedelta64(10, 'm'), np.timedelta64(10, 'm'))
    raw = np.full((len(times), len(nodes), len(VARIABLES)), np.nan, dtype=np.float32)
    ni = {n['code']: i for i, n in enumerate(nodes)}
    vi = {v: i for i, v in enumerate(VARIABLES)}
    vi['wind_direction_compass'] = 4
    columns = ['time_10min_hkt','station_abbr','variable','value','unit']
    for file in sorted((SOURCE / 'observations').rglob('*.csv.gz')):
        for df in pd.read_csv(file, usecols=columns, chunksize=250000):
            df = df[df.variable.isin(vi) & df.station_abbr.isin(ni)]
            ti = ((pd.to_datetime(df.time_10min_hkt).dt.tz_localize(None).to_numpy(dtype='datetime64[m]') - start)
                  / np.timedelta64(10, 'm')).astype(int)
            vals = pd.to_numeric(df.value, errors='coerce').to_numpy(dtype=np.float32)
            direction = df.variable.eq('wind_direction_compass').to_numpy()
            vals[direction] = [compass_8_to_degrees(str(x)) if pd.notna(x) else np.nan
                               for x in df.value[direction]]
            # Derived tables already use m/s. Never convert a second time.
            speed = df.variable.isin(['wind_speed_10min_mean','wind_gust_10min_max'])
            if not df.loc[speed, 'unit'].eq('m/s').all():
                raise ValueError('Unexpected derived wind unit')
            raw[ti, df.station_abbr.map(ni), df.variable.map(vi)] = vals
        print('loaded', file.name, flush=True)
    # HSS was excluded by the old HKO2025 station mapping. Read only its own rows.
    hss = ni['HSS']
    for file in sorted((API / 'historical_packages').glob('*/wind/wind_*.zip')):
        month = file.parent.parent.name
        if not '202511' <= month <= '202608':
            continue
        with zipfile.ZipFile(file) as z:
            for member in z.namelist():
                if not member.endswith('.csv'):
                    continue
                content = z.read(member).decode('utf-8-sig')
                for row in csv.reader(content.splitlines()):
                    if 'Hong Kong Sea School' not in row:
                        continue
                    # Native CSV: YYYYMMDDHHMM, station, direction, mean km/h, gust km/h.
                    stamp, name, direction, speed, gust = row[:5]
                    t = np.datetime64(f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}T{stamp[8:10]}:{stamp[10:12]}', 'm')
                    delta = int((t - start) / np.timedelta64(1, 'm'))
                    if delta % 10 or not 0 <= delta // 10 < len(times):
                        continue
                    index = delta // 10
                    for variable, value in [(3, speed), (5, gust)]:
                        try: raw[index, hss, variable] = float(value) / 3.6
                        except ValueError: pass
                    raw[index, hss, 4] = compass_8_to_degrees(direction)
        print('HSS loaded', file.name, flush=True)
    np.save(root / 'raw.npy', raw)
    np.save(root / 'times.npy', times)
    coverage = {n['code']: {VARIABLES[v]: round(float(np.isfinite(raw[:, i, v]).mean()), 4)
                            for v in TARGETS[:3]} for i, n in enumerate(nodes)}
    (root / 'coverage.json').write_text(json.dumps(coverage, indent=2) + '\n')
    print('prepared', raw.shape, coverage['HSS'], flush=True)


def evaluate(root, stride, checkpoint=CHECKPOINT, start=None, end=None, anchored=False, retain_core=False):
    torch.set_num_threads(4)
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    nodes = json.loads((root / 'stations.json').read_text())
    raw = np.load(root / 'raw.npy', mmap_mode='r')
    times = np.load(root / 'times.npy')
    stats = normalization(saved)
    model = ExpandedGNN(saved, nodes).eval()
    core_runtime=original_core_runtime(nodes) if retain_core else None
    sums = np.zeros((len(nodes), 36, 3, 3), dtype=np.float64)  # model abs, persistence abs, count
    first = max(431, int(np.searchsorted(times, np.datetime64(start, 'm')))-1) if start else 431
    last=min(len(raw)-36,int(np.searchsorted(times,np.datetime64(end,'m')))-36) if end else len(raw)-36
    origins = list(range(first, last, stride))
    started = time.monotonic()
    for count, origin in enumerate(origins, 1):
        history = np.asarray(raw[origin-431:origin+1])
        mask = np.isfinite(history)
        x = np.where(mask, stats.normalize(history), 0)
        with torch.inference_mode():
            pred = model(torch.tensor(x.transpose(1,0,2)[None]),
                         torch.tensor(mask.transpose(1,0,2)[None]),
                         torch.tensor(cyclic_time_features(times[origin-431:origin+1])[None])).numpy()
        physical = stats.denormalize_targets(pred, model.config.target_names)[0,:,:,:3]
        if anchored: physical=anchor_temperature(physical,history)
        if core_runtime: physical=retain_original_core(physical,history,times[origin-431:origin+1],core_runtime)
        physical[:,:,1] = np.clip(physical[:,:,1],0,100)
        physical[:,:,2] = np.maximum(physical[:,:,2],0)
        truth = np.asarray(raw[origin+1:origin+37,:,[0,1,3]]).transpose(1,0,2)
        last = np.full((len(nodes),3), np.nan)
        for t in range(-6,0):
            candidate = history[t][:,[0,1,3]]
            last = np.where(np.isfinite(candidate),candidate,last)
        valid_history = mask[:,:,[0,1,3]].mean(axis=0) >= .9
        valid = np.isfinite(truth) & np.isfinite(last[:,None,:]) & valid_history[:,None,:]
        sums[:,:,:,0] += np.where(valid,np.abs(physical-truth),0)
        sums[:,:,:,1] += np.where(valid,np.abs(last[:,None,:]-truth),0)
        sums[:,:,:,2] += valid
        if count % 20 == 0:
            print('evaluated',count,'/',len(origins),'seconds',round(time.monotonic()-started),flush=True)
    result = {'checkpoint':str(checkpoint),'temperatureAnchored':anchored,'originalCoreRetained':retain_core,
              'start':str(times[origins[0]]),
              'end':str(times[origins[-1]]), 'origins':len(origins), 'strideMinutes':stride*10,
              'variables':{}, 'stations':{}}
    def metrics(a):
        count = a[...,2].sum()
        return {'mae':float(a[...,0].sum()/count), 'persistenceMae':float(a[...,1].sum()/count),
                'count':int(count)} if count else {'count':0}
    for v,name in enumerate(['temperature','humidity','wind']):
        result['variables'][name] = metrics(sums[:,:,v])
    for i,n in enumerate(nodes):
        result['stations'][n['code']] = {name:metrics(sums[i,:,v]) for v,name in enumerate(['temperature','humidity','wind'])}
    prefix = 'zero-shot' if checkpoint == CHECKPOINT else 'finetuned'
    if anchored: prefix+='-anchored'
    if retain_core: prefix='deployed'
    if end: prefix+='-validation'
    (root/f'{prefix}-evaluation.json').write_text(json.dumps(result,indent=2)+'\n')
    np.save(root/f'{prefix}-errors.npy',sums)
    print(json.dumps(result['variables']),flush=True)


def finetune(root):
    """Freeze the pretrained temporal encoder; adapt graph and decoder on new nodes.

    Training targets: Nov 2025–Mar 2026; validation: Apr; test: May–Aug.
    All windows retain 72h inputs and 6h targets. No test labels select epochs.
    """
    torch.set_num_threads(4)
    torch.manual_seed(42)
    np.random.seed(42)
    saved = torch.load(CHECKPOINT, map_location='cpu', weights_only=False)
    nodes = json.loads((root/'stations.json').read_text())
    raw = np.load(root/'raw.npy', mmap_mode='r')
    times = np.load(root/'times.npy')
    stats = normalization(saved)
    model = ExpandedGNN(saved,nodes)
    model.temporal_encoder.requires_grad_(False)
    model.eval()
    origins = np.arange(431, int(np.searchsorted(times,np.datetime64('2026-05-01T00:00')))-36, 18)
    cache_path = root/'training-features.pt'
    if cache_path.exists():
        cached = torch.load(cache_path,map_location='cpu',weights_only=False)
        if not np.array_equal(cached['origins'],origins):
            raise ValueError('Feature cache does not match the selected training windows')
        states,targets,masks = cached['states'],cached['targets'],cached['masks']
    else:
        states,targets,masks = [],[],[]
        for count,o in enumerate(origins,1):
            hist=np.asarray(raw[o-431:o+1]); mask=np.isfinite(hist)
            x=np.where(mask,stats.normalize(hist),0)
            with torch.no_grad():
                states.append(model.temporal_encoder(torch.tensor(x.transpose(1,0,2)[None]),
                    torch.tensor(mask.transpose(1,0,2)[None]),torch.tensor(cyclic_time_features(times[o-431:o+1])[None]))[0])
            future=np.asarray(raw[o+1:o+37]); valid=np.isfinite(future)
            y=stats.normalize(future)[:,:,[0,1,3,4]].transpose(1,0,2)
            ym=valid[:,:,[0,1,3,4]].transpose(1,0,2)
            ym &= (mask[:,:,[0,1,3,4]].mean(axis=0)>=.9)[:,None,:]
            ym[:,:,3] &= future[:,:,3].T >= .5
            targets.append(torch.tensor(np.nan_to_num(y)))
            masks.append(torch.tensor(ym))
            if count%200==0: print('encoded',count,'/',len(origins),flush=True)
        states,targets,masks=map(torch.stack,(states,targets,masks))
        torch.save(dict(origins=origins,states=states,targets=targets,masks=masks),cache_path)
    train=np.flatnonzero(times[origins+36] < np.datetime64('2026-04-01T00:00'))
    validation=np.flatnonzero(times[origins+1] >= np.datetime64('2026-04-01T00:00'))
    optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=0.0001,weight_decay=0.0001)
    def predict(idx):
        state=states[idx]
        for layer in model.graph_layers: state=layer(state,model.adjacency)
        return model.decoder(state)
    def loss(idx):
        return masked_multitarget_loss(predict(idx),targets[idx],masks[idx],model.config.target_names)[0]
    def validate():
        model.eval()
        with torch.no_grad():
            terms=[(float(loss(idx)),len(idx)) for idx in np.array_split(validation,max(1,len(validation)//16))]
        return sum(v*n for v,n in terms)/sum(n for _,n in terms)
    best=validate(); logs=[dict(epoch=0,validationLoss=best)]
    print('baseline validation',best,'train',len(train),'validation',len(validation),flush=True)
    for epoch in range(1,13):
        model.train(); model.temporal_encoder.eval()
        total=0
        for idx in np.array_split(np.random.permutation(train),max(1,len(train)//16)):
            optimizer.zero_grad(); value=loss(idx); value.backward()
            nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad],1.)
            optimizer.step(); total+=float(value.detach())*len(idx)
        score=validate()
        logs.append(dict(epoch=epoch,trainLoss=total/len(train),validationLoss=score))
        print(json.dumps(logs[-1]),flush=True)
        if score<best:
            best=score
            payload=dict(saved)
            payload.update(model_state=model.state_dict(),model_config={k:v for k,v in vars(model.config).items() if k!='n_targets'},
                source_nodes=[n['code'] for n in nodes],stage='expanded-graph-finetuning',epoch=epoch,
                validation_loss=score,source_build=str(SOURCE),
                training_config=dict(seed=42,epochs=12,learning_rate=.0001,encoder='frozen pretrained CLP',
                    train_target_start='2025-11-04',train_target_end_exclusive='2026-04-01',
                    validation_target_start='2026-04-01',validation_target_end_exclusive='2026-05-01',
                    test_target_start='2026-05-01',test_target_end='2026-08-25T23:50',stride_minutes=180))
            torch.save(payload,root/'best.pt')
        (root/'training.json').write_text(json.dumps(logs,indent=2)+'\n')
    if not (root/'best.pt').exists(): raise RuntimeError('Fine-tuning did not improve validation loss')



if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare','evaluate','finetune'])
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--stride', type=int, default=144)
    parser.add_argument('--checkpoint', type=Path, default=CHECKPOINT)
    parser.add_argument('--start')
    parser.add_argument('--end')
    parser.add_argument('--anchor-temperature', action='store_true')
    parser.add_argument('--retain-core', action='store_true')
    args = parser.parse_args()
    if args.command == 'prepare': prepare(args.root)
    elif args.command == 'finetune': finetune(args.root)
    else: evaluate(args.root,args.stride,args.checkpoint,args.start,args.end,args.anchor_temperature,args.retain_core)

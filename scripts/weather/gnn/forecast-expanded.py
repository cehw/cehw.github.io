"""Hourly six-hour forecasts from the independently evaluated all-station GNN."""
from __future__ import annotations

import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import torch

from forecast import API, ROOT, VARIABLES, OUTPUTS, HKT, read_csv, load_history, history_health, atomic_json
from expanded import ROOT as EXPERIMENT, ExpandedGNN, normalization, anchor_temperature, original_core_runtime, retain_original_core
from stellerus_clp.clp_10min_dataset import cyclic_time_features


def run(output_path):
    torch.set_num_threads(2)
    now = datetime.now(HKT)
    latest = read_csv(API / 'latest/hko_observations.csv')
    latest_time = max(datetime.fromisoformat(r['observation_time_hkt']) for r in latest
                      if r['feed'] in ('temperature', 'humidity', 'pressure', 'wind'))
    origin = latest_time.replace(minute=50, second=0, microsecond=0)
    if origin > latest_time: origin -= timedelta(hours=1)
    nodes = json.loads((EXPERIMENT/'stations.json').read_text())
    evaluation=json.loads((EXPERIMENT/'deployed-evaluation.json').read_text())
    saved = torch.load(EXPERIMENT/'best.pt', map_location='cpu', weights_only=False)
    if saved['source_nodes'] != [n['code'] for n in nodes] or tuple(saved['input_variables']) != VARIABLES:
        raise ValueError('Expanded checkpoint station/variable order mismatch')
    raw, errors = load_history(origin, saved['model_config']['n_hist'], saved['source_nodes'], ROOT/'archives')
    coverage, gap = history_health(raw, saved['source_nodes'])
    output = dict(schemaVersion=1,status='warming_up',generatedAt=now.isoformat(),
        originTime=origin.isoformat(),lastObservationTime=latest_time.isoformat(),
        updateIntervalHours=1,stepMinutes=10,horizonHours=6,
        model=dict(name='Observation-only GNN',version='allstations53_v1',
            architecture='Temporal GRU · GraphSAGE-style aggregation · autoregressive GRU',
            historyHours=72,experimental=True,usesAurora=False,physicalNodes=len(nodes),
            temperaturePostprocessing='New temperature stations: latest-observation anchor with GNN-predicted changes',
            originalCoreRetained=True,coreModelVersion='pilot3y_joint4_e10e5_cal20260826',
            evaluation={k:evaluation[k] for k in ('start','end','origins','variables')},
            availableStations={key:sum(feed in n['feeds'] for n in nodes) for key,(_,feed,_) in OUTPUTS.items()},
            fineTuning=saved['training_config']),
        sources=[dict(name='Hong Kong Observatory',url='https://www.hko.gov.hk/en/abouthko/opendata_intro.htm'),
                 dict(name='DATA.GOV.HK historical archive',url='https://data.gov.hk/en/'),
                 dict(name='Hong Kong Sea School · Co-WIN wind observations via HKO',
                      url='https://www.hko.gov.hk/en/wxinfo/awsgis/regional_weather_gis.html')],
        inputCoverage=coverage,longestInputGapMinutes=gap,validTimes=[],stations=[],
        message='Collecting the 72-hour observation history required by the model.')
    if errors: print('Archive warnings:', '; '.join(errors))
    if (now-latest_time).total_seconds()>1800:
        output.update(status='unavailable',message='HKO input observations are delayed. Waiting for fresh inputs.')
    elif min(coverage.values())>=.9 and gap<=60:
        model = ExpandedGNN(saved,nodes).eval()
        stats = normalization(saved)
        mask = np.isfinite(raw)
        x = np.where(mask,stats.normalize(raw),0)
        times=np.array([np.datetime64((origin-timedelta(minutes=10*i)).replace(tzinfo=None),'m')
                        for i in range(len(raw)-1,-1,-1)])
        with torch.inference_mode():
            pred=model(torch.tensor(x.transpose(1,0,2)[None]),torch.tensor(mask.transpose(1,0,2)[None]),
                       torch.tensor(cyclic_time_features(times)[None])).numpy()
        physical=stats.denormalize_targets(pred,model.config.target_names)[0]
        physical=anchor_temperature(physical,raw)
        physical=retain_original_core(physical,raw,times,original_core_runtime(nodes))
        if not np.isfinite(physical).all(): raise ValueError('Non-finite GNN output')
        output['validTimes']=[(origin+timedelta(minutes=10*i)).isoformat() for i in range(1,37)]
        for i,node in enumerate(nodes):
            series={}
            for key,(variable,feed,unit) in OUTPUTS.items():
                column=VARIABLES.index(variable)
                if feed not in node['feeds'] or mask[:,i,column].mean()<.9 or not mask[-6:,i,column].any(): continue
                values=physical[i,:,model.config.target_names.index(variable)]
                if key=='humidity': values=np.clip(values,0,100)
                elif key=='wind': values=np.maximum(values,0)
                series[key]=[round(float(v),1) for v in values]
            if series: output['stations'].append({k:node[k] for k in ('code','name','lat','lon')} | {'forecasts':series})
        if not output['stations']: raise ValueError('No station has sufficient observation history')
        output.update(status='ready',message='A research playground for experimental local weather predictions. Not an official HKO forecast.')
    atomic_json(output_path,output)
    print(json.dumps(dict(status=output['status'],originTime=output['originTime'],
        counts={key:sum(key in n['forecasts'] for n in output['stations']) for key in OUTPUTS})))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'output/gnn.json')
    run(parser.parse_args().output)

"""Publish six hours from the existing CLP observation-only GNN on climet3.

No training, Aurora, or changes to the CLP experiment artifacts. Public output
contains predictions and provenance only; checkpoints stay on the server.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

CLP = Path('/workspace/wanghan/Stellerus_CLP')
ROOT = Path('/workspace/wanghan/personal/weather')
API = Path('/workspace/wanghan/data/HKO_API_ingestion')
BUILD = Path('/workspace/wanghan/data/HKO_core_stations_10min/builds/20260826T143504804067Z-calibrated')
CHECKPOINT = CLP / 'experiments/clp_10min/pilot3y_joint4_e10e5_cal20260826/ar_best.pt'
sys.path.insert(0, str(CLP / 'src'))

import numpy as np
import torch
from stellerus_clp.hko_observations import CSV_FEEDS, HKT, canonical_station_name, parse_csv_feed
from stellerus_clp.hko_archive import list_versions, download_archive
from stellerus_clp.hko_core_10min import compass_8_to_degrees
from stellerus_clp.clp_10min_infer import load_runtime
from stellerus_clp.clp_10min_dataset import cyclic_time_features

VARIABLES = ('air_temperature', 'relative_humidity', 'mean_sea_level_pressure',
             'wind_speed_10min_mean', 'wind_direction_degrees', 'wind_gust_10min_max')
OUTPUTS = {'temperature': ('air_temperature', 'temperature', '°C'),
           'humidity': ('relative_humidity', 'humidity', '%'),
           'wind': ('wind_speed_10min_mean', 'wind', 'm/s')}


def read_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def load_history(origin, n_hist, nodes, archive_root, *, backfill=True):
    """Keep physical station identities, source times, native units and masks."""
    start = origin - timedelta(minutes=(n_hist - 1) * 10)
    data = np.full((n_hist, len(nodes), len(VARIABLES)), np.nan, dtype=np.float32)
    mappings = {(r['feed'], canonical_station_name(r['api_station_name'])): r['hko2025_station_code']
                for r in read_csv(CLP / 'config/hko_station_map.csv') if r['mapping_status'] == 'mapped'}
    allowed = {(r['feed'], r['source_station_code']) for r in read_csv(CLP / 'config/projection_targets.csv')
               if r['status'] == 'available'}
    indexes = {code: i for i, code in enumerate(nodes)}
    errors = []

    def ingest(rows):
        for r in rows:
            feed = r['feed']
            code = mappings.get((feed, canonical_station_name(r['station_name'])))
            if code not in indexes or (feed, code) not in allowed:
                continue
            variable = r['variable']
            if variable in ('wind_direction', 'wind_direction_compass'):
                variable = 'wind_direction_degrees'
            if variable not in VARIABLES:
                continue
            observed = datetime.fromisoformat(r['observation_time_hkt'])
            minutes = (observed - start).total_seconds() / 60
            if minutes % 10 or not 0 <= minutes / 10 < n_hist:
                continue
            raw = r['value'].strip()
            value = np.nan
            if raw not in ('', 'N/A', 'M', '-'):
                value = compass_8_to_degrees(raw) if variable == 'wind_direction_degrees' else float(raw)
                if variable in ('wind_speed_10min_mean', 'wind_gust_10min_max'):
                    value /= 3.6
            data[int(minutes / 10), indexes[code], VARIABLES.index(variable)] = value

    day = start.date()
    today = datetime.now(HKT).date()
    while day <= origin.date():
        for feed in CSV_FEEDS[:4]:
            zip_path = archive_root / day.strftime('%Y%m') / feed.name / f'{feed.name}_{day:%Y%m%d}.zip'
            monthly = zip_path.with_name(f'{feed.name}_{day:%Y%m}.zip')
            if not zip_path.exists() and monthly.exists():
                zip_path = monthly
            if not zip_path.exists() and backfill and day < today:
                try:
                    records = list_versions(feed.name, feed.url, start=day, end=day, timeout=25, attempts=2)
                    for record in records:
                        result = download_archive(archive_root, record, timeout=25, attempts=2)
                        zip_path = Path(result['path'])
                except Exception as e:
                    errors.append(f'{day}/{feed.name}: {type(e).__name__}')
            if zip_path.exists():
                with zipfile.ZipFile(zip_path) as archive:
                    for name in sorted(archive.namelist()):
                        if name.endswith('.csv'):
                            ingest(parse_csv_feed(feed, archive.read(name), datetime.now(timezone.utc).isoformat()))
        live = API / 'processed' / day.strftime('%Y/%m/%d')
        for path in sorted(live.glob('hko_observations_*.csv')):
            ingest(read_csv(path))
        day += timedelta(days=1)
    return data, errors


def history_health(raw, nodes):
    """An entire network outage is not ordinary missing-station input."""
    present = np.isfinite(raw)
    # Require actual observations in each of the four core feeds over the window.
    coverage = {name: round(float(present[:, :, index].any(axis=1).mean()), 4)
                for name, index in [('temperature', 0), ('humidity', 1), ('pressure', 2), ('wind', 3)]}
    longest_gap = 0
    for index in (0, 1, 2, 3):
        gap = 0
        for ok in present[:, :, index].any(axis=1):
            gap = 0 if ok else gap + 1
            longest_gap = max(longest_gap, gap)
    return coverage, longest_gap * 10


def run(args):
    torch.set_num_threads(2)
    now = datetime.now(HKT)
    latest = read_csv(API / 'latest/hko_observations.csv')
    latest_time = max(datetime.fromisoformat(r['observation_time_hkt']) for r in latest
                      if r['feed'] in ('temperature', 'humidity', 'pressure', 'wind'))
    origin = latest_time.replace(minute=50, second=0, microsecond=0)
    if origin > latest_time:
        origin -= timedelta(hours=1)
    if args.origin:
        origin = datetime.fromisoformat(args.origin).replace(tzinfo=HKT)
    metadata = read_csv(CLP / 'config/core_source_nodes.csv')
    node_codes = [r['source_station_code'] for r in metadata]
    # Inspect the saved model config; do not silently replace its history length.
    checkpoint = torch.load(CHECKPOINT, map_location='cpu', weights_only=False)
    if tuple(checkpoint['source_nodes']) != tuple(node_codes) or tuple(checkpoint['input_variables']) != VARIABLES:
        raise ValueError('Model node/variable order differs from the CLP metadata')
    n_hist = int(checkpoint['model_config']['n_hist'])
    raw, errors = load_history(origin, n_hist, node_codes, args.archive_root, backfill=not args.no_backfill)
    coverage, gap_minutes = history_health(raw, node_codes)
    output = {
        'schemaVersion': 1, 'status': 'warming_up', 'generatedAt': now.isoformat(),
        'originTime': origin.isoformat(), 'lastObservationTime': latest_time.isoformat(),
        'updateIntervalHours': 3, 'stepMinutes': 10, 'horizonHours': 6,
        'model': {'name': 'CLP observation-only GNN', 'version': 'pilot3y_joint4_e10e5_cal20260826',
                  'architecture': 'Temporal GRU · GraphSAGE-style aggregation · autoregressive GRU',
                  'historyHours': n_hist / 6, 'experimental': True, 'usesAurora': False},
        'sources': [{'name': 'Hong Kong Observatory', 'url': 'https://www.hko.gov.hk/en/abouthko/opendata_intro.htm'},
                    {'name': 'DATA.GOV.HK historical archive', 'url': 'https://data.gov.hk/en/'}],
        'inputCoverage': coverage, 'longestInputGapMinutes': gap_minutes,
        'validTimes': [], 'stations': [],
        'message': 'Collecting the 72-hour observation history required by the model. Forecast values are not yet available.',
    }
    if errors:
        print('Archive fetch issues:', '; '.join(errors), file=sys.stderr)
    if not args.origin and (now - latest_time).total_seconds() > 1800:
        output.update(status='unavailable', message='HKO input observations are delayed. Waiting for fresh inputs.')
    elif min(coverage.values()) >= .9 and gap_minutes <= 60:
        build, stats, model, saved = load_runtime(BUILD, CHECKPOINT, torch.device('cpu'))
        mask = np.isfinite(raw)
        normalized = np.where(mask, stats.normalize(raw), 0.0)
        times = np.array([np.datetime64((origin - timedelta(minutes=10 * i)).replace(tzinfo=None), 'm')
                          for i in range(n_hist - 1, -1, -1)])
        with torch.inference_mode():
            prediction = model(torch.from_numpy(normalized.transpose(1, 0, 2).copy())[None],
                               torch.from_numpy(mask.transpose(1, 0, 2).copy())[None],
                               torch.from_numpy(cyclic_time_features(times).copy())[None]).numpy()
        physical = stats.denormalize_targets(prediction, model.config.target_names)[0, :, :36, :]
        if not np.isfinite(physical).all():
            raise ValueError('Model returned non-finite predictions')
        output['validTimes'] = [(origin + timedelta(minutes=10 * i)).isoformat() for i in range(1, 37)]
        supported = {(r['source_station_code'], r['feed']) for r in read_csv(CLP / 'config/projection_targets.csv')
                     if r['status'] == 'available'}
        for i, node in enumerate(metadata):
            series = {}
            for key, (variable, feed, unit) in OUTPUTS.items():
                if (node_codes[i], feed) not in supported:
                    continue
                column = VARIABLES.index(variable)
                # A learned output for an unobserved target is not published as a supported forecast.
                if mask[:, i, column].mean() < .9 or not mask[-6:, i, column].any():
                    continue
                values = physical[i, :, model.config.target_names.index(variable)]
                if key == 'humidity':
                    values = np.clip(values, 0, 100)
                elif key == 'wind':
                    values = np.maximum(values, 0)
                series[key] = [round(float(v), 1) for v in values]
            if series:
                output['stations'].append({'code': node_codes[i], 'name': node['station_name'],
                    'lat': float(node['latitude']), 'lon': float(node['longitude']), 'forecasts': series})
        if not output['stations']:
            raise ValueError('No station has enough target-variable input history')
        output.update(status='ready', message='Experimental forecasts from an observation-only GNN. Not an official HKO forecast.')
    if args.origin:
        output['historicalReplay'] = True
    atomic_json(args.output, output)
    print(json.dumps({k: output[k] for k in ('status', 'originTime', 'inputCoverage', 'longestInputGapMinutes')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'output/gnn.json')
    parser.add_argument('--archive-root', type=Path, default=ROOT / 'archives')
    parser.add_argument('--origin', help='Historical replay for validation only; never publish as live')
    parser.add_argument('--no-backfill', action='store_true')
    run(parser.parse_args())

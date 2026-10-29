"""Export real ten-minute station temperatures from the existing HKO collector."""
import csv
import json
import math
from pathlib import Path

SOURCE = Path('/workspace/wanghan/data/HKO_API_ingestion/latest/hko_observations.csv')
OUTPUT = Path('/workspace/wanghan/personal/weather/output/stations.json')


def temperatures(rows):
    data = []
    for row in rows:
        if row['variable'] != 'air_temperature':
            continue
        try:
            value = float(row['value'])
        except ValueError:
            continue
        if not math.isfinite(value):
            continue
        name = {'HK Park': 'Hong Kong Park'}.get(row['station_name'], row['station_name'])
        data.append({'place': name, 'value': value, 'unit': 'C',
                     'recordTime': row['observation_time_hkt']})
    if not data:
        raise ValueError('No valid ten-minute station temperatures')
    return {'temperature': {'data': data, 'recordTime': max(row['recordTime'] for row in data)},
            'source': 'https://data.weather.gov.hk/weatherAPI/hko_data/regional-weather/latest_1min_temperature.csv'}


if __name__ == '__main__':
    with SOURCE.open(encoding='utf-8-sig', newline='') as source:
        result = temperatures(csv.DictReader(source))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')

#!/usr/bin/env bash
set -euo pipefail
cd /workspace/wanghan/personal/weather
mkdir -p output logs
exec 9>observations.lock
flock -n 9 || exit 0
python3 station-observations.py
/usr/local/bin/node update-weather.mjs --output output/weather.json --archive-dir archives/website --station-observations output/stations.json
bash publish.sh weather

#!/usr/bin/env bash
set -euo pipefail
cd /workspace/wanghan/personal/weather
mkdir -p output logs
exec 9>run.lock
flock -n 9 || exit 0
PYTHON=/workspace/wanghan/miniconda3/envs/han-fdn/bin/python
# This collector also runs every ten minutes from the existing CLP cron entry.
/workspace/wanghan/Stellerus_CLP/scripts/fetch_hko.sh
"$PYTHON" forecast.py
cd publish
git pull --rebase origin weather-data
mkdir -p data
cp ../output/gnn.json data/gnn.json
git add data/gnn.json
if ! git diff --cached --quiet; then
  git commit -m "Update observation-only GNN forecast"
  for attempt in 1 2 3; do
    if git push origin HEAD:weather-data; then exit 0; fi
    git pull --rebase origin weather-data
  done
  exit 1
fi

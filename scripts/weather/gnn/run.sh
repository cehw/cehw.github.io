#!/usr/bin/env bash
set -euo pipefail
cd /workspace/wanghan/personal/weather
mkdir -p output logs
exec 9>run.lock
flock -n 9 || exit 0
PYTHON=/workspace/wanghan/miniconda3/envs/han-fdn/bin/python
# The existing CLP cron collects and archives all station feeds every ten minutes.
"$PYTHON" forecast.py
bash publish.sh gnn

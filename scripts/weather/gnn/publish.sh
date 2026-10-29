#!/usr/bin/env bash
set -euo pipefail
cd /workspace/wanghan/personal/weather
case "${1:-}" in weather|gnn) product=$1 ;; *) exit 2 ;; esac
# Both publishers share one checkout; serialize Git operations, not inference.
exec 8>publish.lock
flock -w 120 8
cd publish
git pull --rebase origin weather-data
mkdir -p data
cp "../output/$product.json" "data/$product.json"
git add "data/$product.json"
if ! git diff --cached --quiet; then
  git commit -m "Update $product snapshot"
fi
for attempt in 1 2 3; do
  if git push origin HEAD:weather-data; then exit 0; fi
  git pull --rebase origin weather-data
done
exit 1

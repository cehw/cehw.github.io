#!/usr/bin/env bash
# Headless-Chrome screenshot helper for visual QA.
# usage: qa_shot.sh <page.html> <dark|light> <width> <weather|none> <day 0|1|none> <out.png> [extra-query]
set -euo pipefail
PAGE=$1; THEME=$2; W=$3; WX=$4; DAY=$5; OUT=$6; EXTRA=${7:-}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
PORT=${QA_PORT:-8765}
( cd "$ROOT" && python -m http.server "$PORT" >/dev/null 2>&1 ) & SRV=$!
sleep 1
Q="theme=$THEME"
[ "$WX" != none ] && Q="$Q&weather=$WX"
[ "$DAY" != none ] && Q="$Q&day=$DAY"
[ -n "$EXTRA" ] && Q="$Q&$EXTRA"
"$CH" --headless=new --disable-gpu --hide-scrollbars --window-size="${W},2400" \
  --virtual-time-budget=8000 --screenshot="$(cygpath -w "$OUT")" \
  "http://localhost:$PORT/$PAGE?$Q" >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
echo "$OUT"

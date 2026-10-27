"""Install the personal forecast schedule without changing other cron jobs."""
from pathlib import Path
from datetime import datetime
import subprocess

root = Path('/workspace/wanghan/personal/weather')
previous = subprocess.run(['crontab', '-l'], text=True, capture_output=True, check=True).stdout
line = '27 */3 * * * /usr/bin/timeout 15m /bin/bash /workspace/wanghan/personal/weather/run.sh >> /workspace/wanghan/personal/weather/logs/run.log 2>&1'
if line not in previous.splitlines():
    if any('/workspace/wanghan/personal/weather/run.sh' in item for item in previous.splitlines()):
        raise RuntimeError('A different personal-weather schedule already exists; inspect before replacing it')
    backup = root / '_tmp' / f'crontab-{datetime.now():%Y%m%d-%H%M%S}.txt'
    backup.parent.mkdir(parents=True, exist_ok=True)
    backup.write_text(previous)
    updated = previous.rstrip() + '\n\n# Personal observation-only GNN: every three hours (server HKT)\n' + line + '\n'
    subprocess.run(['crontab', '-'], input=updated, text=True, check=True)
installed = subprocess.run(['crontab', '-l'], text=True, capture_output=True, check=True).stdout
assert line in installed.splitlines()
print(line)

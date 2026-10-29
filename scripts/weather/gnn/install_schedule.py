"""Update only personal-weather cron entries; preserve all other collectors."""
from pathlib import Path
from datetime import datetime
import subprocess

ROOT = '/workspace/wanghan/personal/weather'
GNN = f'7 * * * * /usr/bin/timeout 15m /bin/bash {ROOT}/run.sh >> {ROOT}/logs/run.log 2>&1'
OBS = f'3-59/10 * * * * /usr/bin/timeout 5m /bin/bash {ROOT}/observations.sh >> {ROOT}/logs/observations.log 2>&1'


def updated_crontab(previous):
    kept = [line for line in previous.splitlines()
            if not any(f'{ROOT}/{script}' in line for script in ('run.sh', 'observations.sh'))
            and not line.startswith(('# Personal observation-only GNN:', '# Personal HKO website:'))]
    return '\n'.join(kept).rstrip() + '\n\n# Personal observation-only GNN: hourly (server HKT)\n' + GNN + '\n# Personal HKO website: every ten minutes (server HKT)\n' + OBS + '\n'


if __name__ == '__main__':
    previous = subprocess.run(['crontab', '-l'], text=True, capture_output=True, check=True).stdout
    updated = updated_crontab(previous)
    if updated != previous:
        backup = Path(ROOT) / '_tmp' / f'crontab-{datetime.now():%Y%m%d-%H%M%S}.txt'
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(previous)
        subprocess.run(['crontab', '-'], input=updated, text=True, check=True)
    installed = subprocess.run(['crontab', '-l'], text=True, capture_output=True, check=True).stdout
    assert GNN in installed.splitlines() and OBS in installed.splitlines()
    print(GNN)
    print(OBS)

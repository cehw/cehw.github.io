"""Pull the climet3 HKO archive to local data; never delete or upload observations."""
from __future__ import annotations

import json
import logging
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

SITE = Path(__file__).resolve().parents[2]
DESTINATION = SITE / 'data' / 'weather-archive'
SCRATCH = SITE / '_tmp' / 'weather-sync'
SOURCES = {
    'hko-api': '/workspace/wanghan/data/HKO_API_ingestion',
    'website-archives': '/workspace/wanghan/personal/weather/archives',
}
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'climet3']
INVENTORY = '''import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
if not root.is_dir():
    raise SystemExit('Missing archive: ' + str(root))
files = []
for path in root.rglob('*'):
    if path.is_file() and not path.is_symlink() and not path.name.endswith('.tmp'):
        stat = path.stat()
        files.append([path.relative_to(root).as_posix(), stat.st_size, int(stat.st_mtime)])
print(json.dumps(files))
'''


def needs_copy(path, size, mtime):
    if not path.is_file():
        return True
    stat = path.stat()
    return stat.st_size != size or int(stat.st_mtime) != mtime


def sync_source(name, source):
    command = f'python3 -c {shlex.quote(INVENTORY)} {shlex.quote(source)}'
    inventory = json.loads(subprocess.run(SSH + [command], check=True, capture_output=True,
                                         text=True, encoding='utf-8', timeout=180).stdout)
    local = DESTINATION / name
    local.mkdir(parents=True, exist_ok=True)
    changed = [rel for rel, size, mtime in inventory if needs_copy(local / rel, size, mtime)]
    logging.info('%s: %s new/changed of %s files', name, len(changed), len(inventory))
    if changed:
        file_list = SCRATCH / f'{name}-files.txt'
        file_list.write_bytes(b'\0'.join(rel.encode('utf-8') for rel in changed) + b'\0')
        command = f'tar -czf - -C {shlex.quote(source)} --null -T -'
        with file_list.open('rb') as names:
            process = subprocess.Popen(SSH + [command], stdin=names, stdout=subprocess.PIPE)
            try:
                with tarfile.open(fileobj=process.stdout, mode='r|gz') as archive:
                    archive.extractall(local, filter='data')
            except BaseException:
                process.kill()
                process.wait()
                raise
            finally:
                process.stdout.close()
            if process.wait() != 0:
                raise RuntimeError(f'Archive transfer failed: {name}; retry next run')
    # Verify the actual transfer against file sizes/mtimes, not a second remote scan.
    missing = [rel for rel, size, mtime in inventory if needs_copy(local / rel, size, mtime)]
    if missing:
        raise RuntimeError(f'{name}: {len(missing)} files need a retry')
    return {'files': len(inventory), 'copied': len(changed), 'bytes': sum(row[1] for row in inventory)}


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=DESTINATION / 'sync.log', level=logging.INFO,
                        format='%(asctime)s %(levelname)s %(message)s')
    if sys.stderr is not None:
        logging.getLogger().addHandler(logging.StreamHandler())
    try:
        result = {name: sync_source(name, source) for name, source in SOURCES.items()}
        status = {'syncedAt': datetime.now(timezone.utc).isoformat(), 'sources': result}
        (DESTINATION / 'last-sync.json').write_text(json.dumps(status, indent=2) + '\n', encoding='utf-8')
        logging.info('Local archive sync complete: %s', result)
    except Exception:
        logging.exception('Sync failed; previous archive retained')
        raise


if __name__ == '__main__':
    main()

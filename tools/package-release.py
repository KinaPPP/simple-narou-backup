"""Create a source release ZIP without private backups or local dependencies."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['version']
target = root.parent / ('simple-narou-backup-v' + version + '.zip')
excluded = {'.git', 'work', 'test-data', 'node_modules', '__pycache__'}
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root)
        if not file.is_file() or any(part in excluded for part in relative.parts):
            continue
        if file.suffix.lower() == '.zip' or '-simple-narou-backup-' in file.name:
            continue
        archive.write(file, 'simple-narou-backup/' + relative.as_posix())
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Release ZIP verification failed')
print(target.name)

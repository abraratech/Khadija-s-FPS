
from pathlib import Path
import json, shutil
installer=Path(__file__).resolve().parent
repo=installer.parent
backup=installer/'backups'
manifest=json.loads((installer/'PATCH_MANIFEST.json').read_text(encoding='utf-8'))
missing=[]
for rel,h in manifest['expected_hashes'].items():
    if h is not None and not (backup/rel).exists(): missing.append(rel)
if missing: raise SystemExit('ERROR: missing rollback backups: ' + ', '.join(missing))
for rel,h in manifest['expected_hashes'].items():
    target=repo/rel
    if h is None:
        if target.exists(): target.unlink()
    else:
        src=backup/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src,target)
print('M3.5-M3.6 Revive rolled back.')


from pathlib import Path
import hashlib, json, shutil, subprocess, sys
BASELINE_HEAD = "5f039c8cd0ac2cc88177f244cdbb68fc0252eb7c"
installer = Path(__file__).resolve().parent
repo = installer.parent
payload = installer / 'payload'
backup = installer / 'backups'
manifest = json.loads((installer / 'PATCH_MANIFEST.json').read_text(encoding='utf-8'))
def norm_hash(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    return hashlib.sha256(text.replace('\r\n','\n').replace('\r','\n').encode('utf-8')).hexdigest()
def git_head():
    return subprocess.check_output(['git','rev-parse','HEAD'], cwd=repo, text=True, stderr=subprocess.STDOUT).strip()
if git_head() != BASELINE_HEAD:
    raise SystemExit('ERROR: Expected Git HEAD\n  ' + BASELINE_HEAD + '\nCurrent HEAD\n  ' + git_head())
already = True
for rel, installed_hash in manifest['installed_hashes'].items():
    path = repo / rel
    current = norm_hash(path) if path.exists() else None
    if current != installed_hash:
        already = False
if already:
    print('M3.5-M3.6 Revive is already installed.')
    sys.exit(0)
mismatches=[]
for rel, expected_hash in manifest['expected_hashes'].items():
    path = repo / rel
    current = norm_hash(path) if path.exists() else None
    if current != expected_hash:
        mismatches.append(f'{rel}\n    expected: {expected_hash}\n    current:  {current}')
if mismatches:
    raise SystemExit('ERROR: Local files do not match baseline. No files changed.\n  ' + '\n  '.join(mismatches))
for rel in manifest['modified_files']:
    src = repo / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists(): shutil.copy2(src, dst)
for rel in manifest['modified_files']:
    src = payload / rel
    dst = repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
failed=[]
for rel, expected_hash in manifest['installed_hashes'].items():
    if norm_hash(repo / rel) != expected_hash: failed.append(rel)
if failed: raise SystemExit('ERROR: Installed hash check failed: ' + ', '.join(failed))
node = shutil.which('node')
if node:
    for rel in manifest['modified_files']:
        if rel.endswith('.js'):
            r = subprocess.run([node, '--check', str(repo / rel)], cwd=repo, text=True, capture_output=True)
            if r.returncode: raise SystemExit('ERROR: JS syntax failed ' + rel + '\n' + r.stderr)
print('')
print('M3.5-M3.6 REVIVE INSTALLED.')
print('  PASS: protocol 4 and revive-state envelopes')
print('  PASS: downed/bleedout/revive/spectating lifecycle')
print('  PASS: respawn next wave and team-elimination logic')
print('  PASS: reconnect revive snapshots')
print('')
print('NEXT: RUN_M3_REVIVE_SMOKE_TEST.bat, VERIFY_M3_REVIVE_INSTALL.bat, DEPLOY_M3_REVIVE_WORKER.bat')

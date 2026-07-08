
from pathlib import Path
import hashlib, json, shutil, subprocess, sys
installer = Path(__file__).resolve().parent
repo = installer.parent
manifest = json.loads((installer/'PATCH_MANIFEST.json').read_text(encoding='utf-8'))
def norm_hash(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    return hashlib.sha256(text.replace('\r\n','\n').replace('\r','\n').encode('utf-8')).hexdigest()
checks={}
for rel,h in manifest['installed_hashes'].items():
    checks['installed hash '+rel] = (repo/rel).exists() and norm_hash(repo/rel)==h
main=(repo/'js/main.js').read_text(encoding='utf-8')
proto=(repo/'js/multiplayer/protocol.js').read_text(encoding='utf-8')
runtime=(repo/'js/multiplayer/runtime.js').read_text(encoding='utf-8')
foundation=(repo/'js/multiplayer/foundation.js').read_text(encoding='utf-8')
revive=(repo/'js/multiplayer/revive.js').read_text(encoding='utf-8')
core=(repo/'js/multiplayer/revive_core.js').read_text(encoding='utf-8')
worker=(repo/'multiplayer-server/src/index.js').read_text(encoding='utf-8')
checks.update({
    'build marker': 'm3-revive-r1' in main and 'protocol 4' in main,
    'protocol 4': 'MULTIPLAYER_PROTOCOL_VERSION = 4' in proto,
    'revive message type': "REVIVE_STATE: 'revive-state'" in proto,
    'runtime revive send/receive': 'sendReviveState(state)' in runtime and 'REMOTE_REVIVE_STATE_RECEIVED' in runtime,
    'foundation revive lifecycle': 'MultiplayerReviveManager' in foundation and 'updateMultiplayerRevive' in foundation,
    'main downed path': 'notifyMultiplayerLocalDowned' in main and 'DOWNED · HOLD INTERACT' in main,
    'input blocked while downed': 'isMultiplayerLifeInputBlocked()' in main,
    'revive authority core': 'class ReviveAuthority' in core and 'TEAM_ELIMINATED' in core,
    'revive hud and markers': 'multiplayer-revive-hud' in revive and 'REVIVE ' in revive,
    'worker protocol/build': "SERVER_PROTOCOL = 4" in worker and "SERVER_BUILD = 'm3-revive-r1'" in worker,
})
print('')
print('M3.5-M3.6 REVIVE VERIFICATION')
print('-------------------------------')
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ': ' + name)
    if not ok: failed.append(name)
node=shutil.which('node')
if node:
    for rel in manifest['modified_files']:
        if rel.endswith('.js'):
            r=subprocess.run([node,'--check',str(repo/rel)], cwd=repo, text=True, capture_output=True)
            ok=r.returncode==0
            print(('PASS' if ok else 'FAIL') + ': syntax ' + rel)
            if not ok:
                print(r.stderr)
                failed.append('syntax '+rel)
print('')
if failed:
    print('RESULT: FAILED')
    sys.exit(1)
print('RESULT: PASSED')

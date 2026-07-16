KHADIJA'S ARENA — FINAL.2 MULTIPLAYER + PLATFORM WORKER

Repository
----------
Worker source:
C:\wamp64\www\multiplayer-server

The Worker is part of the main Khadija's Arena Git repository. It is not a
nested repository or submodule. Commit from C:\wamp64\www only.

Certified release
-----------------
Protocol: 6
Build: final2-consolidated-production-r1
Patch: final2-r1-full-product-certification
Source seal: dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e
Status: CERTIFIED

Systems certified together
--------------------------
PROG.1, PROG.2, SOCIAL.1, MATCH.3, LOADOUT.1, COOP.2, CONTENT.1, LIVE.1,
and OPS.1.

Worker deployment
-----------------
1. cd /d C:\wamp64\www\multiplayer-server
2. npm ci
3. npm run check
4. npx wrangler login     (only when required)
5. npx wrangler deploy

OPS.1 administrator secret
--------------------------
OPS_ADMIN_TOKEN must remain a Cloudflare Worker secret. The local copy is
stored outside the web root at:
C:\wamp64\MInstall\OPS1_ADMIN_TOKEN.txt

Never place the token in source, wrangler.jsonc, screenshots, logs, release
packages, or the Pages build.

Public verification
-------------------
/release
/health
/ops/health
/ops/privacy
/live/manifest

The Worker and frontend multiplayer-release.json must report matching protocol,
build, patch, certified baseline, and certified source seal.

Production frontend
-------------------
Cloudflare Pages deploys from the main repository or from the certified
FINAL2_PRODUCTION_BUILD output. Tests, Worker source, scripts, source maps,
preview pages, voice runtime, administrator tools, and secrets must remain
excluded.

Voice status
------------
Voice runtime, microphone access, signaling, and TURN fallback are removed.
Text chat and authored quick messages remain supported.

Privacy and operations
----------------------
- No raw IP, email, precise location, passkey detail, microphone data, or
  default private-chat transcript storage.
- Telemetry failure never blocks gameplay.
- Operational events expire after 14 days.
- Reports expire after 180 days.
- Moderation audit records expire after 365 days.

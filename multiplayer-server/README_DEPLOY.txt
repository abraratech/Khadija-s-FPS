KHADIJA'S ARENA MULTIPLAYER + CLOUD PROFILE WORKER

The Worker source lives inside the main repository:
C:\wamp64\www\multiplayer-server

It is not a nested Git repository or submodule. Commit only from:
C:\wamp64\www

DEPLOY WORKER
1. Open Command Prompt.
2. Run: cd /d C:\wamp64\www\multiplayer-server
3. Run: npm ci
4. Run: npm run check
5. Run: npx wrangler login   (only when login is required)
6. Run: npm run deploy

The Cloudflare Pages frontend still deploys from the main GitHub repository.
The Worker must be deployed separately whenever multiplayer-server changes.

CURRENT RELEASE
Protocol: 6
Build: m4-passkey-account-upgrade-r1
Patch: m4-passkey-account-upgrade-r1

CLOUD PROFILE SECURITY
CloudProfileHub stores guest profiles, linked-device records, one-time recovery
codes, profile revision history, and security activity. Recovery codes and device
tokens are stored only as SHA-256 hashes. Never copy device tokens into source
files, screenshots, support messages, or Git commits.

SECURITY
ALLOWED_ORIGINS is currently "*". Before public launch, set it to the exact
Cloudflare Pages origin in wrangler.jsonc.

HEALTH CHECK
curl -s https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev/health

Expected fields:
{"ok":true,"service":"khadijas-arena-multiplayer","protocol":6,"build":"m4-passkey-account-upgrade-r1","patch":"m4-passkey-account-upgrade-r1"}

RELEASE CHECK
curl -s https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev/release

The Worker and frontend multiplayer-release.json must report matching protocol,
build, patch, certified baseline, leaderboard capability, and cloud-profile patch.

M4.51-M4.54 CLOUD RELIABILITY
Persistent client retry queue, multi-tab lease, staged profile chunks, checksum verification, deletion tombstones, and history-integrity checks are active.
Expected build: m4-cloud-sync-reliability-r1; protocol remains 6.


M4.55-M4.58 PASSKEY ACCOUNT UPGRADE
Existing cloud guest accounts can be upgraded in place with WebAuthn passkeys.
The Worker stores only public passkey material, counters, labels, and activity;
private keys remain inside the player’s authenticator. Passkey sign-in issues a
new per-device cloud token and preserves the same profile, devices, history,
recovery code, and leaderboard identity.

Passkey registration and sign-in must be initiated from the HTTPS Pages origin.
The Worker derives and verifies the WebAuthn RP ID from the trusted Origin header.
Expected build: m4-passkey-account-upgrade-r1; protocol remains 6.

# Khadija's Arena — M5.1-M5.4 Certification

- Baseline: `b10075c9b9634685b8d73531fe3d62ad7bfde7cc`
- Patch/build: `m5-coop-quick-message-wheel-r1`
- Protocol: `6`
- Worker package: `0.6.1`

## Scope

- Six-item co-op tactical quick-message wheel:
  - Enemy here
  - Need help
  - Need ammo
  - Revive me
  - Buy / open this
  - Follow me
- Desktop input: hold `C`, then press `1`–`6`.
- Mobile `COMMS` button and touch-selectable messages.
- Reuses the existing protocol-6 tactical-ping relay.
- Preserves tactical-ping validation, cooldown, spam limiting, deduplication,
  reconnect behavior, and host-migration rebroadcast.
- Allows `Need help` and `Revive me` while downed.
- Frontend and Worker release manifests advance together.
- The WebSocket welcome-handshake identity in `protocol.js` advances to the same M5 build.
- Online leaderboard player IDs no longer require `crypto.randomUUID`.
- LAN/IP and older-browser clients use `crypto.getRandomValues` or a compatibility fallback,
  preventing match startup from aborting in non-secure contexts.

## Required browser verification

1. Create a two-player room as Abrar and join as Khadija.
2. Start a run and hold `C` on each desktop client.
3. Send every message with keys `1`–`6`.
4. Confirm both players see the sender name, message label, marker, and distance.
5. Confirm Enemy here and Buy/open this use the aimed world position.
6. Confirm Help, Ammo, Revive, and Follow use the sender position.
7. Down one player and verify Revive me and Need help still send.
8. Confirm rapid repeated messages are rate-limited.
9. Transfer host or reconnect and confirm active markers do not duplicate.
10. Confirm `/release` matches frontend build, patch, protocol, and baseline.
11. Confirm room creation accepts the Worker welcome handshake and opens the room lobby.
12. Join from a LAN/IP or browser context without `crypto.randomUUID` and confirm the run starts.

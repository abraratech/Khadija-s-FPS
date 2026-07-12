# Khadija's Arena — M5.17-M5.20 Certification

- Baseline: `d2840511b7eb6c9ae3e8f051072f2fa807240db5`
- Patch/build: `m5-coop-live-voice-r1`
- Protocol: `6`
- Worker package: `0.6.5`

## Scope

- Enables live lobby and in-game push-to-talk teammate audio.
- Uses `T` exclusively for push-to-talk; `V` remains the FPP/TPP camera toggle.
- Uses a browser WebRTC peer-to-peer mesh for up to four connected room players.
- Uses targeted, authenticated Worker control messages only for WebRTC signaling.
- Uses Cloudflare's public STUN endpoint at `stun.cloudflare.com:3478`.
- Keeps microphone tracks disabled except while the player holds `T`.
- Adds local mute-all and per-player voice mute controls.
- Stops tracks and peer connections on user stop, room loss, refresh, or disconnect.
- Never records, stores, uploads, or relays microphone audio through the Worker.
- TURN relay is not configured in this milestone; restrictive NAT/firewall cases may
  still require a later TURN hardening phase.
- Protocol remains 6.

## Required browser verification

1. Deploy the Worker and hard-refresh two HTTPS clients.
2. Join the same room as Abrar and Khadija.
3. Open Voice on both clients and click `START LIVE VOICE`.
4. Grant microphone permission and confirm both clients show a connected voice peer.
5. Hold `T` on Abrar and confirm Khadija hears audio only while `T` is held.
6. Repeat from Khadija to Abrar.
7. Confirm `V` changes FPP/TPP without transmitting voice.
8. Test lobby voice and in-run voice.
9. Test mute-all and per-player mute locally.
10. Stop live voice and confirm the browser microphone indicator turns off.
11. Reconnect one client and confirm voice can be restarted without duplicate audio.
12. Confirm both consoles have no new uncaught errors.
13. Confirm frontend and Worker release manifests match.

# Khadija's Arena — M5.21-M5.24 Certification

- Baseline: `04984d114ff649494be12151a6d22e9abe429687`
- Patch/build: `m5-coop-voice-reliability-r1`
- Protocol: `6`
- Worker package: `0.6.6`

## Scope

- Adds bounded automatic repair for failed and prolonged-disconnected WebRTC peers.
- Tries ICE restart first, then performs a clean peer rebuild without duplicate audio.
- Uses a four-attempt, rolling repair budget with increasing retry delays.
- Mutes PTT immediately while offline, hidden, or recovering.
- Samples WebRTC inbound-audio stats for RTT, jitter, packet loss, and quality labels.
- Adds a local `RETRY VOICE` control and per-peer connection diagnostics.
- Retries after network return or page visibility recovery.
- Clearly reports when direct peer-to-peer voice remains blocked and TURN may be required.
- Does not add a TURN relay, record audio, or send microphone audio through the Worker.
- Protocol remains 6.

## Required browser verification

1. Deploy the Worker and hard-refresh two HTTPS clients.
2. Join the same room as Abrar and Khadija and start live voice on both.
3. Confirm `VOICE HEALTH · 1/1` appears with a quality label.
4. Hold `T` in each direction and confirm audio remains push-to-talk only.
5. Temporarily disable one client's network, confirm PTT mutes and recovery appears.
6. Restore the network and confirm voice reconnects without duplicate audio.
7. Use `RETRY VOICE` and confirm the peer reconnects cleanly.
8. Refresh or reconnect one client and confirm voice can be restarted normally.
9. Confirm `V` remains camera-only and the co-op HUD remains clear.
10. Confirm both consoles have no new uncaught errors.
11. Confirm frontend and Worker release manifests match.

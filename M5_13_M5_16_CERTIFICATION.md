# Khadija's Arena — M5.13-M5.16 Certification

- Baseline: `c0e1b744dbb25ec236b8a532903707da6e1571d1`
- Patch/build: `m5-coop-voice-readiness-r1`
- Protocol: `6`
- Worker package: `0.6.4`

## Scope

- Adds a co-op `VOICE` setup panel beside text chat.
- Clearly diagnoses HTTPS/localhost requirements before requesting microphone access.
- Requests microphone permission only after a user clicks `CHECK / TEST MIC`.
- Enumerates microphone input devices and persists the selected device locally.
- Provides a five-second local microphone-level test and always stops its tracks.
- Adds a local push-to-talk input test on `V`.
- Persists voice-enabled and mute-all-voice preferences for the later live-audio phase.
- Does not transmit, record, upload, or relay audio in this milestone.
- Protocol remains 6; the Worker changes only release identity/version.

## Required browser verification

1. Create a room as Abrar and join as Khadija.
2. Confirm a `VOICE` button appears beside co-op chat on both clients.
3. On HTTPS or localhost, open Voice and click `CHECK / TEST MIC`.
4. Grant permission and confirm microphone devices populate and the level meter moves.
5. Select another microphone when available, refresh normally, and confirm it remains selected.
6. Hold `V` while the panel is open and confirm the PTT input indicator activates.
7. Confirm the panel explicitly says live teammate audio is not active yet.
8. On a LAN-IP HTTP client, confirm it shows `VOICE REQUIRES HTTPS OR LOCALHOST` without throwing an error.
9. Confirm closing the panel stops the microphone indicator/browser capture icon.
10. Confirm frontend and Worker release identities match.

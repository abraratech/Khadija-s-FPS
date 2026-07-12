# Khadija's Arena — M5.9-M5.12 Certification

- Baseline: `9e2db2f06fce3804b435c5f98eb4ce9bd625bc84`
- Patch/build: `m5-coop-communication-safety-r1`
- Protocol: `6`
- Worker package: `0.6.3`

## Scope

- Local `MUTE ALL` control for co-op text chat.
- Per-player text mute/unmute using server-authoritative player IDs.
- Mute preferences persist locally across normal refreshes.
- Muting is private and local; the sender is not notified.
- Muted messages remain excluded from visible chat and notifications.
- Local chat history can be cleared without affecting other players.
- All message and player labels continue to render with `textContent`, never HTML.
- Existing server validation, cooldown, rate limiting, and ephemeral history remain unchanged.
- Protocol remains 6.

## Required browser verification

1. Create a room as Abrar and join as Khadija.
2. Open chat and confirm `MUTE ALL`, `CLEAR`, and player mute controls appear.
3. Mute Khadija on Abrar's client and confirm her new messages are hidden only for Abrar.
4. Confirm Khadija can still see Abrar's messages and receives no mute notification.
5. Unmute Khadija and confirm her messages display again.
6. Enable `MUTE ALL`, refresh normally, and confirm the setting remains enabled.
7. Disable `MUTE ALL` and confirm messages display again.
8. Press `CLEAR` and confirm only the local visible history is cleared.
9. Send HTML-like text and confirm it remains literal text.
10. Confirm frontend and Worker release identities match.

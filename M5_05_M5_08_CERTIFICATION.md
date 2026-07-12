# Khadija's Arena — M5.5-M5.8 Certification

- Baseline: `8da251c37c061f359e747e442fcdabc23d3c7287`
- Patch/build: `m5-coop-text-chat-r1`
- Protocol: `6`
- Worker package: `0.6.2`

## Scope

- Lobby and in-game team text chat.
- `Enter` opens chat; `Enter` sends; `Escape` closes.
- A persistent `CHAT` button is available while connected to a room.
- Server-authoritative sender ID and display name.
- 160-character messages and 50-message local history.
- Control characters removed; UI renders with `textContent`, never HTML.
- Dedicated server cooldown and burst rate limit.
- Chat is ephemeral and is not stored in Durable Object persistence.
- Protocol remains 6 because chat uses the existing authenticated room control channel.

## Required browser verification

1. Create a room as Abrar and join as Khadija.
2. Exchange messages in the lobby from both clients.
3. Start the run and exchange messages in-game with `Enter`.
4. Confirm sending closes chat and gameplay pointer lock can resume.
5. Confirm names cannot be forged by client payloads.
6. Send blank/control-character text and confirm rejection.
7. Send rapid messages and confirm cooldown/rate-limit feedback without disconnecting.
8. Confirm HTML-like text displays literally and does not render markup.
9. Reconnect one client and confirm new messages work without duplicate old messages.
10. Confirm frontend and Worker release identities match.

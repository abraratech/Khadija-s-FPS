# Khadija's Arena — C7 Dedicated Sound Asset Guide

This patch adds optional dedicated sound hooks. The game will still run if these MP3 files are missing because every cue falls back to the current placeholder sounds.

Place future MP3 files here:

```text
assets/sounds/heartbeat_low_health.mp3
assets/sounds/wood_plank_snap.mp3
assets/sounds/hammer_nail_wood.mp3
assets/sounds/mystery_box_open.mp3
assets/sounds/roulette_spin.mp3
assets/sounds/teddy_squeak.mp3
assets/sounds/box_gun_chime.mp3
assets/sounds/arcade_sparkle_ping.mp3
assets/sounds/perk_retro_jingle.mp3
assets/sounds/electric_trap_hum.mp3
assets/sounds/round_start.mp3
assets/sounds/round_clear.mp3
```

## Recommended sound length

```text
heartbeat_low_health.mp3   0.25–0.60s
wood_plank_snap.mp3        0.15–0.50s
hammer_nail_wood.mp3       0.12–0.35s
mystery_box_open.mp3       0.60–1.50s
roulette_spin.mp3          0.10–0.35s tick/loopable tick
teddy_squeak.mp3           0.25–0.90s
box_gun_chime.mp3          0.50–1.20s
arcade_sparkle_ping.mp3    0.40–1.20s
perk_retro_jingle.mp3      0.80–2.50s
electric_trap_hum.mp3      0.60–2.00s
round_start.mp3            0.60–1.80s
round_clear.mp3            0.60–1.80s
```

## Licensing rule

Only use sounds that are:

- created by you
- purchased with game-use rights
- from a clearly licensed royalty-free source
- Creative Commons with compatible terms and attribution if required

Do not use ripped sounds from Call of Duty, Zombies, Halo, Resident Evil, or other commercial games.

## Notes

- `electric_trap_hum.mp3` is currently triggered as a short activation cue, not a true continuous positional loop.
- A real looping trap hum can be added later once the final sound file is chosen.
- Music is separate from this patch and should get its own menu/combat/special-round system later.

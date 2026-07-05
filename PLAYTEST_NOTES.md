# Khadija's Arena — Public Playtest Notes

Use this file when sharing the current public demo with testers.

## Public Demo Message

```text
Khadija's Arena is a browser-based single-player zombie wave-survival FPS demo.

Recommended setup:
- Desktop Chrome first
- Hard refresh before testing
- Graphics Quality: Auto
- FOV: 82° for baseline testing
- Mouse Sensitivity: 100% for baseline testing

The current demo focuses on single-player survival, five playable maps, shops, perks, Pack-a-Punch, Mystery Box, barricades, traps, and basic wave progression.

Multiplayer, PVP, PVPVE, online leaderboards, region/server leaderboards, and FPP/TPP view switching are planned future systems, not bugs in this demo.
```

## What Testers Should Try

Ask each tester to complete at least one normal run, then optionally test a second map.

Priority test path:

1. Start on **Grid Bunker** using **Normal** difficulty.
2. Confirm movement, mouse look, sprint, jump, shoot, reload, ADS, interact, and pause.
3. Buy or use at least one shop interaction.
4. Reach at least wave 3 if possible.
5. Die or quit to menu and confirm restart/menu flow.
6. Try one additional map if they have time.

Extra coverage:

- Test **Hospital Wing** or **Parking Garage** for tighter map flow.
- Test **Auto graphics** first, then Low/Medium/High only if needed.
- Test FOV and sensitivity only after the baseline run.
- Test Mystery Box by accepting one weapon and also letting one roll expire.
- Test wall buys, ammo refill, perks, Pack-a-Punch, barricades, doors, and traps when found.

## What Counts as a Bug

Report these immediately:

- Red console errors
- Game does not load
- Assets/models fail to appear
- Player spawns inside a wall or outside the map
- Zombies cannot reach the player
- Weapon disappears or becomes unusable
- Reload, ADS, shooting, or interaction stops working
- Mystery Box gets stuck
- Death/restart/quit flow breaks
- Settings do not save after refresh
- Serious FPS drops that make the game unplayable
- White boxes, giant particles, or broken visuals

## What Is Not a Bug Yet

Do not count these as bugs unless they break the current demo:

- No multiplayer mode yet
- No PVP/PVPVE yet
- No online leaderboard yet
- No map-wise/region-wise/server-wide leaderboard yet
- No FPP/TPP camera toggle yet
- No full music system yet
- No keybind remapping yet
- No crosshair customization yet
- AI is still simple and not navmesh-based
- High graphics is a preset, not an ultra/next-gen mode
- Desktop Chrome is the primary target

## Tester Feedback Template

```text
Tester name:
Device:
Browser:
OS:
Graphics Quality:
FOV:
Mouse Sensitivity:
Map:
Difficulty:
Highest wave reached:
Average FPS if known:
Worst FPS moment if known:

What felt fun:
What felt confusing:
What felt too hard/easy:
Best map:
Worst map:
Weapon/shop feedback:
Any bugs/errors:
Screenshot/video/console error:
Would you play another round? Why/why not?
```

## Quick Bug Report Format

```text
Bug title:
Map:
Wave:
What happened:
What you expected:
Can you reproduce it?
Screenshot/video:
Console error:
```

## Minimum Acceptance Before Wider Sharing

Before sending the link to a larger group:

- One local run passes with no red console errors.
- One Cloudflare run passes after hard refresh.
- Grid Bunker starts and reaches wave 3.
- One newer map starts successfully.
- Pause, resume, death, restart, and quit to menu work.
- Public demo safety is enabled:
  - score starts normally
  - `0` does not nuke enemies
  - `F4` does not toggle post-processing
  - `F6` still cycles graphics quality
- Settings persist after refresh:
  - Graphics Quality
  - Master Volume
  - Mouse Sensitivity
  - FOV
  - Damage Indicators
  - Performance Stats

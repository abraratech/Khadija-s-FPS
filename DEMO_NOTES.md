# Khadija's Arena — Playable Demo Notes

## Current Demo Features

- Single-player wave survival mode
- Five playable maps:
  - Grid Bunker
  - Industrial Yard
  - Neon Depot
  - Parking Garage
  - Hospital Wing
- Map-specific lighting and visual dressing
- Low / Medium / High / Auto graphics quality setting
- Procedural zombie visuals
- Multiple enemy types:
  - Shambler
  - Crawler
  - Runner
  - Exploder
  - Ranged
  - Goliath
- Mystery Box system
- Wall-buy weapons
- Pack-a-Punch weapon upgrades
- Procedural weapon system for pistol, SMG, assault rifle, and shotgun
- Perks:
  - Juggernog
  - Speed Cola
- Barricade repair system with hologram locator and cooldown timer
- Doors / gates
- Electric traps
- Minimap enemy indicators
- Pause, death screen, and demo-flow polish

## Procedural Weapons Milestone

The active demo weapon set has moved from weapon GLB viewmodels to procedural ES-module weapons:

- Starting Pistol
- Tactical SMG
- Assault Rifle
- Pump Shotgun

Each weapon now lives in its own module under `js/weapons/`, with shared helpers in `js/weapons/procedural_helpers.js`.

Active weapon GLB preloads for pistol, SMG, rifle, and shotgun have been removed from `js/main.js`. Mystery Box previews and wall-buy chalk outlines now use procedural weapon meshes instead of GLB weapon models.

Sniper remains planned as a future Mystery Box-only weapon after the current procedural weapon baseline is fully stabilized.

## Recommended Demo Test

Use desktop Chrome first.

Mouse sensitivity and FOV are active settings. For baseline demo testing, use 100% sensitivity and 82° FOV first, then confirm both save after refresh.

Use `DEMO_CHECKLIST.md` for the full D3 public-demo checklist before sharing the build publicly.

Suggested graphics setting:

- Auto Recommended for normal use; it can promote or downgrade based on FPS
- Low Performance if FPS drops during combat
- Medium Balanced for default desktop testing
- High Quality for stronger desktops

## Controls

- WASD: Move
- Mouse: Aim
- Left Click: Shoot
- Right Click: Aim down sights
- R: Reload
- E: Interact
- Q: Switch weapon
- Shift: Sprint
- Space: Jump
- ESC: Pause
- F6: Cycle graphics quality

## Public Demo Acceptance Summary

Before sharing the demo link publicly, the build should pass:

- Menu loads with no red console errors.
- All five maps can start a run.
- At least two maps are tested through wave 3.
- One map reaches wave 5+ to confirm swarm/special-round flow.
- Pause, resume, quit to menu, death screen, and restart all work.
- Graphics Quality saves after refresh and Auto can promote/downgrade based on FPS.
- Public demo safety remains enabled: no instant points and no public nuke hotkey.

## Public Playtest

Use `PLAYTEST_NOTES.md` when sharing the demo with testers. It includes:

- tester-facing demo message
- what testers should try
- what counts as a bug
- what is intentionally not part of the demo yet
- full feedback template
- quick bug report format

Before wider sharing, confirm public demo safety: normal starting score, no public nuke hotkey, no public F4 post-processing toggle, and F6 graphics cycling still available.

## Deployment Model

This demo is currently a static browser ES-module project. The public entry file is `index.html`, and the main game module starts from `js/main.js`. Three.js and its addons are loaded through the import map in `index.html`.

For the current Cloudflare Pages demo, no `package.json`, `wrangler.toml`, `_headers`, or `_redirects` file is required. Those files are optional future deployment tools only if the project later needs a build step, custom cache headers, redirects, or Worker-based backend behavior.

## Deployment Smoke Test

After each Cloudflare deploy:

- Hard refresh with Ctrl + F5.
- Open browser console and confirm no red errors.
- Confirm `index.html` loads the menu.
- Start Grid Bunker and one newer map, such as Hospital Wing or Parking Garage.
- Confirm assets load, weapons appear, zombies spawn, and the pause/death flow still works.
- Confirm Graphics Quality persists after refresh.


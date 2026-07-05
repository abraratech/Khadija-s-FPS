# Khadija's Arena — D3 Demo Build Checklist

Use this checklist before sending a public demo link or asking testers for feedback.

## 1. Pre-Test Setup

- Use desktop Chrome first.
- Open DevTools Console before starting.
- Hard refresh with Ctrl + F5.
- Set Graphics Quality to Auto for the default test.
- Keep Performance Stats off for normal play, then turn it on only for performance checks.
- Confirm no public dev cheat behavior:
  - Score starts normally.
  - Pressing `0` does not nuke enemies.
  - Pressing `F4` does not toggle post-processing in the public build.
  - Pressing `F6` still cycles graphics quality.

## 2. Main Menu Checklist

- Menu loads without red console errors.
- High score and max wave display correctly.
- Single Player flow is clear.
- Multiplayer / future modes remain locked or clearly marked as future.
- Five maps are visible:
  - Grid Bunker
  - Industrial Yard
  - Neon Depot
  - Parking Garage
  - Hospital Wing
- Difficulty selection works:
  - Easy
  - Normal
  - Hard
- Start button deploys into the selected map.
- Settings screen opens and returns cleanly.

## 3. Settings Checklist

Currently active settings:

- Graphics Quality:
  - Auto
  - Low
  - Medium
  - High
- Master Volume
- Damage Indicators
- Performance Stats
- Mobile button size / layout support where available

Expected behavior:

- Settings save after refresh.
- Main menu and pause menu show the same saved values.
- Auto graphics can promote or downgrade based on FPS.
- Damage indicators can be turned off and back on.
- Performance panel appears only when enabled.
- Disabled/future settings are visibly not active yet, not broken.

D4 settings/polish status:

- Mouse sensitivity is active.
- FOV slider is active.
- ADS alignment tuning is complete for the current demo baseline.
- Crosshair presets remain future polish.
- Music volume remains future work once music exists.
- Keybind remapping or improved keybind display remains future work.

## 4. Core Gameplay Checklist

Test on at least two maps before public sharing:

- Player spawns safely.
- WASD movement works.
- Sprint works.
- Jump works.
- Mouse look works.
- Shooting works.
- Reload works.
- ADS works.
- Weapon switching works after acquiring another gun.
- Zombies spawn and path toward player.
- Damage, death, and restart flow work.
- Score, kills, health, ammo, wave, and minimap update correctly.
- No obvious white-box particles or missing visuals.
- No red console errors during combat.

## 5. Map-by-Map Smoke Test

Run a short smoke test on every map.

### Grid Bunker

- Start run successfully.
- Confirm both SMG and shotgun wall buys are visible.
- Confirm doors/gates work where available.
- Confirm zombie flow feels stable.

### Industrial Yard

- Start run successfully.
- Confirm map dressing appears on Medium/High/Auto when effective quality allows.
- Confirm zombie spawns are reachable.
- Confirm shops are not inside walls.

### Neon Depot

- Start run successfully.
- Confirm neon lighting/bloom looks acceptable on Medium/High.
- Confirm Low graphics remains readable without bloom.
- Confirm combat does not create extreme FPS drops.

### Parking Garage

- Start run successfully.
- Test height changes/stairs/ramps.
- Confirm player does not fall through floors.
- Confirm enemies remain reachable.

### Hospital Wing

- Start run successfully.
- Confirm tight corridors remain playable.
- Confirm wall buys/shops are readable.
- Confirm wave flow works through at least wave 3.

## 6. Wave / Enemy Checklist

At least once before public sharing:

- Reach wave 3 to confirm runners.
- Reach wave 4 to confirm heavier pressure.
- Reach wave 5 to confirm swarm/special-round flow.
- Confirm each enemy type, when encountered, gives readable feedback:
  - Shambler
  - Crawler
  - Runner
  - Exploder
  - Ranged / Spitter
  - Brute
  - Goliath
- Confirm powerups can appear and be collected.
- Confirm round clear and next-wave start flow.

## 7. Shops / Interactions Checklist

- Ammo refill works.
- Health purchase works when damaged.
- Mystery Box spins, shows feedback, gives weapon, and relocates.
- Wall-buy purchase works.
- Wall-buy ammo refill works after owning that weapon.
- Pack-a-Punch upgrade works.
- Juggernog applies and disappears after purchase in single-player.
- Speed Cola applies and disappears after purchase in single-player.
- Barricade repair gives points and cooldown feedback.
- Electric trap activates, runs, cools down, and becomes ready again.
- Doors/gates open when player has enough points.
- Not-enough-points feedback appears when expected.

## 8. Pause / Death / Restart Checklist

- ESC pauses the game.
- Pause screen shows current map, wave, score, kills, status, and graphics setting.
- Resume returns to gameplay.
- Quit returns to main menu cleanly.
- Death screen appears after player dies.
- Death screen shows kills, score, wave, best score, and best wave.
- Restart begins a clean run.
- Returning to menu does not leave old enemies, decals, or weapon state visible.

## 9. Cloudflare Deployment Checklist

After pushing to GitHub and waiting for Cloudflare Pages deploy:

- Open the deployed URL.
- Hard refresh with Ctrl + F5.
- Confirm menu loads.
- Confirm no red console errors.
- Confirm assets/models load.
- Start Grid Bunker.
- Start one newer map, preferably Parking Garage or Hospital Wing.
- Confirm pause/death/restart flow.
- Confirm settings persist after browser refresh.
- Confirm mobile portrait blocker still appears on portrait phone screens.
- Confirm static ES-module deployment works without `package.json`, `wrangler.toml`, `_headers`, or `_redirects`.

## 10. Known Not-In-Demo Items

Do not treat these as demo bugs unless they break the current public build:

- Multiplayer, PVP, and PVPVE are future work.
- Online/global leaderboards are future work.
- Region-wise, map-wise, and server-wide leaderboards are future work.
- FPP/TPP view switching is future work.
- Full settings menu completion is D4 work.
- ADS alignment tuning for every gun is D4 work.
- Babylon.js V2 evaluation is a later research branch, not part of the current three.js demo.
- Ultra/next-gen graphics mode is not promised by the current High preset.
- Advanced navmesh AI is future work.

## 11. Tester Feedback Template

Ask testers to report:

```text
Device / browser:
Graphics Quality:
Map:
Difficulty:
Highest wave reached:
Average FPS if known:
What felt fun:
What felt confusing:
Any bugs/errors:
Screenshot or console error if available:
```

## 12. Public Demo Handoff Notes

When sharing the link, include:

- Desktop Chrome is the primary target.
- Use landscape mode on mobile.
- Use Auto graphics first.
- Press F6 only if performance feels poor or visuals look too low.
- Current build is a single-player survival demo.
- Multiplayer, leaderboards, and TPP/FPP camera view switching are planned future systems.

## 13. D5 Public Playtest Checklist

Before sending the demo to testers:

- Include `PLAYTEST_NOTES.md` with the public demo link.
- Ask testers to use desktop Chrome first.
- Ask testers to start with Graphics Quality on Auto.
- Ask testers to report device, browser, map, difficulty, highest wave, FPS if known, and screenshots/errors.
- Tell testers that multiplayer, online leaderboards, FPP/TPP, music volume, keybind remapping, and crosshair customization are future work.
- Confirm DEV_MODE is off in public builds before sharing.

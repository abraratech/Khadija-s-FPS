# Khadija's Arena — Roadmap Additions

These items were captured during D-series planning and should be considered after the public demo is stable.

## Future Leaderboard System

- Start with local/single-player leaderboard support.
- Add map-wise leaderboard filtering.
- Add difficulty-based filtering.
- Add region-wise and global/server-wide leaderboard planning.
- Extend later for multiplayer, PVP, and PVPVE.

## Future FPP / TPP Camera System

- Support first-person and third-person view modes.
- Add a clean toggle between FPP and TPP.
- Handle third-person camera collision so the camera does not clip through walls.
- Decide player body and weapon visibility rules for each view.
- Define ADS behavior separately for FPP and TPP.
- Validate desktop and mobile controls.
- Keep multiplayer/PVP/PVPVE compatibility in mind before implementation.


## Public Playtest Feedback Queue

After D5, collect tester reports into clear buckets:

- Bugs / crashes
- Performance issues
- Map flow issues
- Weapon and shop feedback
- Settings/input feedback
- Difficulty and wave pacing feedback
- Future feature requests

Prioritize fixes that block the public demo before adding new systems.

## C9 Side Quest — Procedural Weapon Prototype

Explore replacing GLB weapon viewmodels with stylized procedural weapons, starting with one prototype weapon before converting the full arsenal.

Recommended prototype order:

1. Starting Pistol or Tactical SMG
2. Rifle
3. Shotgun
4. Upgraded variants and skins

Prototype goals:

- Keep current GLB weapon system as fallback during testing.
- Build the weapon from named procedural parts such as barrel, slide, magazine, grip, muzzle point, stock, pump, and hands.
- Improve reload animations using movable named parts instead of trying to animate unknown GLB meshes.
- Improve ADS, sprint, recoil, muzzle flash, shell ejection, and upgrade glow alignment.
- Compare FPS, visual style, and player feel against the current GLB weapon.
- Keep the stylized arcade look consistent with procedural zombies, shops, maps, and VFX.

Acceptance criteria for the first prototype:

- Weapon looks good enough for the current demo style.
- Reload animation is clearer than the GLB version.
- ADS and sprint poses are stable.
- No hand alignment gaps.
- Muzzle flash and hit feedback remain aligned.
- Performance is equal or better than the GLB version.
- GLB fallback can still be restored if the prototype is rejected.

Decision after prototype:

- If the first procedural weapon looks and feels better, gradually convert SMG, rifle, shotgun, and upgraded variants.
- If it looks too plain, keep GLB weapons and use procedural parts only for hands, reload helpers, muzzle points, and upgrade effects.

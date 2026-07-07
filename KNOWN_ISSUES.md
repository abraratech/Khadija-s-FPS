# Khadija's Arena — Known Issues / Future Work

## Known Demo Limitations

- Audio uses temporary reused sound effects for some interactions.
- High graphics mode is a quality preset, not a full ultra/next-gen mode.
- Enemy AI is functional but still simple compared to full navigation mesh AI.
- Multiplayer / PVP / PVPVE modes are planned but not included in this demo.
- Procedural zombie visuals are optimized for performance; more detailed enemy models may be revisited later.
- Mobile support exists, but desktop Chrome is the primary demo target for now.

## Future Improvements

- ADS tuning pass for all current weapons is complete for the D4 demo baseline; revisit only after new weapon models or FPP/TPP camera work
- Public demo checklist and playtest notes should be kept current whenever maps, enemies, shops, settings, or deployment flow change
- Dedicated sounds for:
  - Barricade repair
  - Mystery Box teddy bear
  - Perk purchase
  - Trap activation
  - Door opening
- More enemy animation variety
- More weapon feedback and weapon-specific effects
- Procedural sniper weapon planned as Mystery Box-only future addition
- More maps
- Settings screen remaining expansion for music volume, crosshair presets, and keybinds
- Longer auto graphics benchmarking across more hardware
- Optional deployment files later only if needed: `_headers` for cache/security headers, `_redirects` for routing, `package.json` for a build step, or `wrangler.toml` for Worker/Wrangler workflows
- Leaderboard system planning after demo stabilization: local/single-player first, then map-wise, difficulty-filtered, region-wise, and global/server-wide leaderboards
- FPP / TPP camera-view system planning after demo stabilization and ADS polish: first-person and third-person toggle, third-person camera collision, player body visibility, ADS behavior per view, and multiplayer/PVP/PVPVE compatibility
- Babylon.js V2 rebuild branch after this three.js demo is stable

## Recently Completed

- Active pistol, SMG, assault rifle, and shotgun viewmodels converted to procedural ES modules.
- Active weapon GLB preloads removed from the playable demo.

# C8 Tactical Map Placement Notes

C8 responds to playtest feedback that maps felt like objects were simply placed instead of being tactically arranged.

## What changed

- Shop candidate lists are now ordered by tactical intent.
- Weapons.js now respects authored placement priority instead of shuffling shop candidates.
- Mystery Box, ammo, health, upgrade, perks, SMG wall buy, and shotgun wall buy each have role-specific placement priority.
- Shop spacing was increased so interactables feel less clustered.
- Wall buys use separate tactical priority orders for SMG and shotgun.
- Added `window.KAShopPlacements()` for quick testing.

## How to test

Open DevTools console after starting a run:

```js
KAShopPlacements()
```

Check that:
- shops are not clustered together
- wall buys are mounted
- Mystery Box feels like a risk/reward route
- ammo/health are useful but not too free
- upgrade/perks require committing to a route
- each map feels more intentionally arranged

## No combat-balance change

This patch does not change weapon damage, enemy health, enemy speed, prices, waves, or FPS logic.

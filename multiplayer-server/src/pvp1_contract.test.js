// PVP.1 R1 Worker integration and isolation contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('./pvp1_core.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const release = JSON.parse(
  fs.readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8')
);

assert.match(index, /PVP1_SERVER_INFO/);
assert.match(index, /gameMode: 'coop'/);
assert.match(index, /normalizePvp1Mode/);
assert.match(index, /createPvp1MatchState/);
assert.match(index, /action === 'pvp-shot'/);
assert.match(index, /POSITION_UNAVAILABLE/);
assert.match(index, /pvpDistanceBetweenPlayers/);
assert.match(index, /FRIENDLY_FIRE_BLOCKED|friendlyFireBlocked/);
assert.match(index, /AI Wingman is disabled in PvP rooms/);
assert.match(index, /Co-Op authority messages are disabled in PvP rooms/);
assert.match(index, /Team Elimination requires at least two players/);
assert.match(index, /publicMatchmaking: false/);
assert.match(index, /pvp1: \{ \.\.\.PVP1_SERVER_INFO, featureEnabled: pvp1Enabled\(env\) \}/);
assert.match(index, /PVP1_ENABLED/);
assert.match(index, /pvp1Enabled/);
assert.match(wrangler, /PVP1_ENABLED/);
assert.match(wrangler, /\"PVP1_ENABLED\"\s*:\s*\"true\"/);
assert.match(core, /PVP1_WEAPON_PROFILES/);
assert.match(core, /minimumIntervalMs/);
assert.match(core, /pvp1ForfeitTeam/);

assert.equal(release.pvp1.patch, 'pvp1-r1-isolated-team-elimination-foundation');
assert.equal(release.pvp1.mode, 'pvp-team-elimination');
assert.equal(release.pvp1.serverAuthoritativeDamage, true);
assert.equal(release.pvp1.serverDistanceValidation, true);
assert.equal(release.pvp1.friendlyFireBlocked, true);
assert.equal(release.pvp1.aiWingmanDisabled, true);
assert.equal(release.pvp1.coopRewardReceiptsDisabled, true);
assert.equal(release.pvp1.protocolUnchanged, true);

console.log('PVP.1 Worker integration contract tests passed');

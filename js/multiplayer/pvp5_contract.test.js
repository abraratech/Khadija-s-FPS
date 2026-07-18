import assert from 'node:assert/strict';
import fs from 'node:fs';
const runtime = fs.readFileSync(new URL('./pvp1.js', import.meta.url), 'utf8');
const clientCore = fs.readFileSync(new URL('./pvp1_core.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('./pvp5_core.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../../release-version.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));
for (const marker of [
  'updateSpectatorCamera', 'cycleSpectator', 'Q/E TO SPECTATE',
  'pvp-rematch-vote', 'VOTE REMATCH', 'RETURN TO LOBBY',
  'data-pvp-summary-scoreboard', 'ASSISTS', 'escapeHtml'
]) assert.ok(runtime.includes(marker), `missing frontend PVP.5 runtime marker: ${marker}`);
for (const marker of ['localAssists', 'spectatorTargetId', 'scoreboard', 'normalizePvp5State']) {
  assert.ok(clientCore.includes(marker), `missing frontend state marker: ${marker}`);
}
for (const marker of ['registerPvp5RematchVote', 'buildPvp5Scoreboard', 'selectPvp5SpectatorTarget']) {
  assert.ok(core.includes(marker), `missing frontend core marker: ${marker}`);
}
assert.ok(main.includes('pvp5-r1-competitive-match-completion-stabilization'));
assert.ok(main.includes('pvpAdapter: {\n    camera,'));
assert.ok([
  'pvp5-r1-competitive-match-completion-stabilization',
  'pvp6-r1-final-pvp-certification-candidate'
].includes(release.releaseId));
assert.equal(metadata.pvp5?.frontendBaselineSha, '9c57f5ab6516ac8fef0b1e70a0e9e0bf0d53ef87');
assert.equal(metadata.pvp5?.workerBaselineSha, 'deecf81e933d3d9bcd4e3bc5a33da8dcc8aa00b7');
for (const field of [
  'completeOneVsOneLifecycle','completeTwoVsTwoLifecycle','eliminatedPlayerSpectating',
  'serverAuthoritativeRoundReset','serverAuthoritativeMatchCompletion','assists',
  'competitiveScoreboard','rematchVoting','rematchMapVoting','reconnectRestoration',
  'abandonmentForfeit','idempotentRatedResultSubmission','workerRepositoryCleanup'
]) assert.equal(metadata.pvp5?.[field], true, `missing PVP.5 policy: ${field}`);
console.log('PVP.5 R1 frontend match completion and stabilization contract: PASS');

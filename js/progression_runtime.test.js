import assert from 'node:assert/strict';

class StorageMock {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new StorageMock({
  ka_progression_v1: JSON.stringify({
    version: 1,
    xp: 700,
    totalRuns: 2,
    totalKills: 15,
    bestWave: 4,
    bestScore: 900
  })
});
globalThis.window = {
  dispatchEvent() {}
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

const progression = await import(`./progression.js?prog1-runtime=${Date.now()}`);

let snapshot = progression.getProgressionSnapshot();
assert.equal(snapshot.version, 5);
assert.equal(snapshot.profile.totalRuns, 2);
assert.ok(localStorage.getItem('ka_progression_backup_v1'));

progression.resetProgressionRun({
  mapId: 'grid_bunker',
  difficulty: 1.5,
  mode: 'multiplayer'
});
progression.recordProgressionKill({ headshot: true });
progression.recordProgressionWaveClear(2);
progression.recordProgressionDamageDealt(500);
progression.recordProgressionDamageTaken(30);
progression.recordProgressionPointsEarned(250);
progression.recordProgressionObjective();
progression.recordProgressionChallenge();
progression.recordProgressionRevive({ revivedSelf: false });
progression.recordProgressionRevive({ revivedSelf: true });
progression.markProgressionBotAssisted(true);

const worldResult = progression.recordProgressionGameplay6WorldContribution({
  receiptId: 'runtime-world-receipt',
  runId: snapshot.run.runId,
  mapId: 'grid_bunker',
  sectorId: 'BLACK-VAULT',
  sectorLabel: 'Black Vault Sector',
  region: 'NORTHERN FRONT',
  points: 180,
  gradeRank: 4,
  outcomeId: 'DECISIVE_VICTORY',
  branchId: 'ASSET_SECURED',
  decisive: true,
  secured: true,
  bossVictory: true,
  mutationOperation: true,
  evolvedMapOperation: true,
  completedAt: Date.now()
});
assert.equal(worldResult.applied, true);
assert.equal(worldResult.profile.points, 180);
assert.equal(progression.getProgressionSnapshot().profile.world6.points, 180);

const campaignResult = progression.recordProgressionGameplay7CampaignContribution({
  receiptId: 'runtime-campaign-receipt',
  runId: snapshot.run.runId,
  mapId: 'grid_bunker',
  sectorId: 'BLACK-VAULT',
  sectorLabel: 'Black Vault Sector',
  region: 'NORTHERN FRONT',
  factionId: 'MACHINE_COLLECTIVE',
  playerInfluence: 26,
  enemyInfluence: 7,
  campaignPoints: 120,
  decisive: true,
  securedBranch: true,
  bossVictory: true,
  previousControlState: 'CONTESTED',
  projectedControlState: 'SECURED',
  completedAt: Date.now()
});
assert.equal(campaignResult.applied, true);
assert.equal(campaignResult.profile.campaignPoints, 120);
assert.equal(progression.getProgressionSnapshot().profile.campaign7.campaignPoints, 120);

snapshot = progression.finalizeProgressionRun({
  score: 1800,
  wave: 3,
  reason: 'DEATH',
  mode: 'multiplayer',
  botAssisted: true,
  summary: {
    kills: 1,
    headshotKills: 1,
    highestWave: 3,
    damageDealt: 500,
    damageTaken: 30,
    pointsEarned: 250,
    pointsSpent: 0,
    objectivesCompleted: 1,
    challengesCompleted: 1,
    weaponUpgrades: 0,
    perksPurchased: 0,
    durationSeconds: 120,
    accuracy: 42.5,
    botAssisted: true,
    factionId: 'MACHINE_COLLECTIVE',
    bossDefeated: 'SIEGE WALKER',
    bossWeakPointHits: 2,
    bossStaggers: 1,
    replayModifiers: ['HEAVY ARMOR', 'AGGRESSIVE BOSS'],
    replayMasteryGrade: 'A',
    missionRiskChoice: 'OVERDRIVE',
    missionChainsCompleted: 1,
    missionStagesCompleted: 6,
    missionOptionalStagesCompleted: 1,
    loadoutId: 'runtime-loadout',
    primaryWeaponId: 'AR',
    missionId: 'BLACK-VAULT'
  }
});
assert.equal(snapshot.run.finalized, true);
assert.equal(snapshot.profile.totalRuns, 3);
assert.equal(snapshot.profile.multiplayerRuns, 1);
assert.equal(snapshot.profile.botAssistedRuns, 1);
assert.equal(snapshot.profile.totalKills, 16);
assert.equal(snapshot.profile.totalHeadshots, 1);
assert.equal(snapshot.profile.totalRevives, 1);
assert.equal(snapshot.profile.timesRevived, 1);
assert.equal(snapshot.profile.objectivesCompleted, 1);
assert.equal(snapshot.profile.challengesCompleted, 1);
assert.ok(snapshot.run.xpEarned > 0);
assert.ok(Object.keys(snapshot.run.xpBreakdown).length > 0);
assert.equal(snapshot.profile.recentRuns[0].mapId, 'grid_bunker');
assert.ok(snapshot.run.economyAward.credits > 0);
assert.ok(snapshot.profile.economy.currencies.arenaCredits > 0);
assert.ok(snapshot.profile.economy.weaponMastery.AR.xp > 0);

const equip = progression.equipProgressionCosmetic('TITLE_SURVIVOR');
assert.equal(equip.ok, true);
assert.equal(progression.getProgressionSnapshot().equipped.title, 'TITLE_SURVIVOR');

console.log('PROG.1 progression runtime tests: PASS');

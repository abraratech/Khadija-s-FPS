// js/multiplayer/coop_stats_core.test.js

import assert from 'node:assert/strict';
import {
  COOP_COUNTER_KEYS,
  CoopStatsCore,
  sanitizeStatsName
} from './coop_stats_core.js';

function counters(overrides = {}) {
  const result = {};
  COOP_COUNTER_KEYS.forEach((key) => {
    result[key] = 0;
  });
  return { ...result, ...overrides };
}

function report(playerId, sequence, overrides = {}) {
  return {
    kind: 'report',
    reportId: `${playerId}:report:${sequence}`,
    playerId,
    displayName: overrides.displayName || 'Player',
    sequence,
    counters: counters(overrides.counters)
  };
}

function core(now = 1000) {
  const instance = new CoopStatsCore({ now: () => now });
  instance.reset({
    runId: 'run-alpha',
    authorityEpoch: 3,
    startedAt: 0
  });
  return instance;
}

{
  assert.equal(sanitizeStatsName('<Khadija>\u0000Alpha'), 'KhadijaAlpha');
  const stats = core();
  const result = stats.applyLocalReport(report('player-a', 1, {
    displayName: '<Ace>\u0000',
    counters: { shots: 3.8, hits: 2, headshotHits: 1 }
  }), {
    playerId: 'player-a',
    authorityEpoch: 3,
    now: 100
  });
  assert.equal(result.accepted, true);
  const player = stats.getSnapshot(100).players[0];
  assert.equal(player.displayName, 'Ace');
  assert.equal(player.counters.shots, 3);
  assert.equal(player.accuracyPct, 2 / 3 * 100);
}

{
  const stats = core();
  const mismatch = stats.applyLocalReport(report('player-b', 1), {
    playerId: 'player-a',
    authorityEpoch: 3,
    now: 100
  });
  assert.equal(mismatch.accepted, false);
  assert.equal(mismatch.reason, 'player-mismatch');

  const staleAuthority = stats.applyLocalReport(report('player-a', 1), {
    playerId: 'player-a',
    authorityEpoch: 2,
    now: 100
  });
  assert.equal(staleAuthority.accepted, false);
  assert.equal(staleAuthority.reason, 'stale-authority-epoch');

  const invalid = stats.applyLocalReport(report('player-a', 1, {
    counters: { damageDealt: Number.POSITIVE_INFINITY }
  }), {
    playerId: 'player-a',
    authorityEpoch: 3,
    now: 100
  });
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.reason, 'invalid-counter');
}

{
  const stats = core();
  assert.equal(stats.applyLocalReport(report('player-a', 1, {
    counters: { shots: 1 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 100 }).accepted, true);

  const duplicate = stats.applyLocalReport({
    ...report('player-a', 2, { counters: { shots: 2 } }),
    reportId: 'player-a:report:1'
  }, { playerId: 'player-a', authorityEpoch: 3, now: 110 });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'duplicate');

  const stale = stats.applyLocalReport({
    ...report('player-a', 1, { counters: { shots: 1 } }),
    reportId: 'player-a:report:stale'
  }, { playerId: 'player-a', authorityEpoch: 3, now: 120 });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'stale-sequence');
}

{
  const stats = core();
  assert.equal(stats.applyLocalReport(report('player-a', 1, {
    counters: { shots: 5, hits: 4 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 100 }).accepted, true);

  const rollback = stats.applyLocalReport(report('player-a', 2, {
    counters: { shots: 4, hits: 4 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 150 });
  assert.equal(rollback.accepted, false);
  assert.equal(rollback.reason, 'rollback:shots');

  const oversized = stats.applyLocalReport(report('player-a', 3, {
    counters: { shots: 700, hits: 4 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 160 });
  assert.equal(oversized.accepted, false);
  assert.equal(oversized.reason, 'delta-limit:shots');
}

{
  const stats = core();
  for (let index = 1; index <= 12; index += 1) {
    assert.equal(stats.applyLocalReport(report('player-a', index, {
      counters: { shots: index }
    }), { playerId: 'player-a', authorityEpoch: 3, now: 100 }).accepted, true);
  }
  const limited = stats.applyLocalReport(report('player-a', 13, {
    counters: { shots: 13 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 100 });
  assert.equal(limited.accepted, false);
  assert.equal(limited.reason, 'rate-limit');
}

{
  const stats = core();
  stats.applyRoom({
    hostPlayerId: 'player-host',
    settings: { mapId: 'grid_bunker', difficulty: 1.5 },
    players: [
      { playerId: 'player-b', displayName: 'Bravo', connected: true },
      { playerId: 'player-host', displayName: 'Host', connected: true },
      { playerId: 'player-c', displayName: 'Charlie', connected: false }
    ],
    authorityEpoch: 4
  }, 100);
  stats.applyEconomySnapshot({
    accounts: [
      {
        playerId: 'player-host',
        score: 1200,
        kills: 8,
        profile: { perks: ['juggernog'], upgrades: { PISTOL: 1 } }
      }
    ]
  });
  stats.applyReviveSnapshot({
    players: [
      { playerId: 'player-b', connected: true, lifeState: 'DOWNED', health: 20, maxHealth: 100 }
    ]
  }, 150);
  stats.applyReviveSnapshot({
    players: [
      { playerId: 'player-b', connected: true, lifeState: 'DOWNED', health: 20, maxHealth: 100 }
    ]
  }, 175);
  stats.recordReviveCompleted('player-host', 'revive-1');
  stats.recordReviveCompleted('player-host', 'revive-1');

  const snapshot = stats.getSnapshot(200);
  assert.equal(snapshot.players[0].playerId, 'player-host');
  assert.equal(snapshot.players[0].role, 'HOST');
  assert.equal(snapshot.players[0].currentPoints, 1200);
  assert.equal(snapshot.players[0].counters.kills, 8);
  assert.equal(snapshot.players[0].counters.revives, 1);
  assert.equal(snapshot.players.find((entry) => entry.playerId === 'player-b').counters.timesDowned, 1);
  assert.equal(snapshot.players.find((entry) => entry.playerId === 'player-c').lifeState, 'RECONNECTING');
}

{
  const stats = core();
  stats.applyLocalReport(report('player-a', 1, {
    counters: {
      kills: 3,
      headshotKills: 1,
      damageDealt: 900,
      pointsEarned: 500,
      pointsSpent: 250
    }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 100 });
  const first = stats.finalize({ reason: 'team-eliminated', now: 500, wave: 8 });
  const second = stats.finalize({ reason: 'ignored', now: 700, wave: 9 });
  assert.equal(first, second);
  assert.equal(first.team.highestWave, 8);
  assert.equal(first.team.totalKills, 3);
  assert.equal(first.endReason, 'team-eliminated');
}

{
  const stats = core();
  stats.applyLocalReport(report('player-a', 1, {
    counters: { kills: 2, damageDealt: 450 }
  }), { playerId: 'player-a', authorityEpoch: 3, now: 100 });
  const snapshot = stats.getSnapshot(200);
  const migrated = new CoopStatsCore();
  assert.equal(migrated.replaceSnapshot(snapshot), true);
  assert.equal(migrated.getSnapshot(220).team.totalKills, 2);
  const final = stats.finalize({ reason: 'ended', now: 300, wave: 4 });
  assert.equal(migrated.restoreFinal(final), true);
  assert.equal(migrated.getSnapshot(320).finalSummary.team.highestWave, 4);
  migrated.reset({ runId: 'run-next', authorityEpoch: 0, startedAt: 0 });
  assert.equal(migrated.getSnapshot(0).players.length, 0);
  assert.equal(migrated.getSnapshot(0).finalSummary, null);
}

console.log('coop_stats_core tests passed');

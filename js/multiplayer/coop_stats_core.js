// js/multiplayer/coop_stats_core.js

export const COOP_STATS_MESSAGE_KIND = Object.freeze({
  REPORT: 'report',
  SNAPSHOT: 'snapshot',
  FINAL: 'final'
});

export const COOP_COUNTER_KEYS = Object.freeze([
  'shots',
  'hits',
  'headshotHits',
  'kills',
  'headshotKills',
  'damageDealt',
  'damageTaken',
  'pointsEarned',
  'pointsSpent',
  'revives',
  'timesDowned',
  'deaths',
  'perksPurchased',
  'weaponUpgrades'
]);

const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 24;
const MAX_COUNTER = 1_000_000_000;
const MAX_REPORTS_PER_SECOND = 12;
const MAX_SEEN_REPORT_IDS = 512;
const DELTA_LIMITS = Object.freeze({
  shots: 600,
  hits: 600,
  headshotHits: 600,
  kills: 200,
  headshotKills: 200,
  damageDealt: 200_000,
  damageTaken: 20_000,
  pointsEarned: 200_000,
  pointsSpent: 200_000,
  revives: 20,
  timesDowned: 20,
  deaths: 20,
  perksPurchased: 20,
  weaponUpgrades: 20
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim();
  return text || fallback;
}

export function sanitizeStatsId(value, fallback = null) {
  const text = cleanText(value)
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, MAX_ID_LENGTH);
  return text || fallback;
}

export function sanitizeStatsName(value, fallback = 'Player') {
  return cleanText(value, fallback).slice(0, MAX_NAME_LENGTH) || fallback;
}

export function normalizeStatsCounter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(MAX_COUNTER, Math.floor(parsed));
}

function makeCounters(source = {}) {
  const counters = {};
  for (const key of COOP_COUNTER_KEYS) {
    const value = normalizeStatsCounter(source[key] ?? 0);
    if (value === null) return null;
    counters[key] = value;
  }
  return counters;
}

function cloneCounters(source = {}) {
  const counters = {};
  for (const key of COOP_COUNTER_KEYS) counters[key] = Math.max(0, Math.floor(finite(source[key])));
  return counters;
}

function accuracy(shots, hits) {
  const shotCount = Math.max(0, finite(shots));
  if (shotCount <= 0) return 0;
  return Math.max(0, Math.min(100, finite(hits) / shotCount * 100));
}

function clonePlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    role: player.role,
    isBot: player.isBot === true,
    connected: player.connected === true,
    lifeState: player.lifeState,
    health: Math.max(0, finite(player.health)),
    maxHealth: Math.max(1, finite(player.maxHealth, 100)),
    currentPoints: Math.max(0, Math.floor(finite(player.currentPoints))),
    networkRttMs: player.networkRttMs === null ? null : Math.max(0, Math.floor(finite(player.networkRttMs))),
    counters: cloneCounters(player.counters),
    accuracyPct: accuracy(player.counters.shots, player.counters.hits),
    lastReportSequence: Math.max(0, Math.floor(finite(player.lastReportSequence))),
    lastUpdatedAt: Math.max(0, finite(player.lastUpdatedAt))
  };
}

function defaultPlayer(playerId, details = {}) {
  return {
    playerId,
    displayName: sanitizeStatsName(details.displayName),
    role: details.role === 'HOST'
      ? 'HOST'
      : details.role === 'COMPANION' || details.isBot === true
        ? 'COMPANION'
        : 'OPERATIVE',
    isBot: details.isBot === true,
    connected: details.connected !== false,
    lifeState: details.lifeState || 'ACTIVE',
    health: Math.max(0, finite(details.health, 100)),
    maxHealth: Math.max(1, finite(details.maxHealth, 100)),
    currentPoints: Math.max(0, Math.floor(finite(details.currentPoints))),
    networkRttMs: null,
    counters: cloneCounters(details.counters),
    lastReportSequence: 0,
    lastUpdatedAt: Math.max(0, finite(details.now))
  };
}

function playerSortValue(player) {
  if (player.role === 'HOST') return 0;
  if (player.role === 'OPERATIVE' && player.connected && player.lifeState !== 'RECONNECTING' && player.lifeState !== 'ELIMINATED') return 1;
  if (player.role === 'COMPANION' && player.connected && player.lifeState !== 'RECONNECTING' && player.lifeState !== 'ELIMINATED') return 2;
  return 3;
}

export function sortCoopPlayers(players = []) {
  return [...players].sort((a, b) => {
    const roleDelta = playerSortValue(a) - playerSortValue(b);
    if (roleDelta !== 0) return roleDelta;
    const nameDelta = String(a.displayName || '').localeCompare(String(b.displayName || ''));
    if (nameDelta !== 0) return nameDelta;
    return String(a.playerId || '').localeCompare(String(b.playerId || ''));
  });
}

function normalizeLifeState(value, connected = true) {
  if (!connected) return 'RECONNECTING';
  const text = String(value || '').toUpperCase();
  if (text === 'DOWNED') return 'DOWNED';
  if (text === 'SPECTATING') return 'SPECTATING';
  if (text === 'ELIMINATED') return 'ELIMINATED';
  return 'ACTIVE';
}

export class CoopStatsCore {
  constructor({
    runId = null,
    authorityEpoch = 0,
    now = () => Date.now()
  } = {}) {
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.players = new Map();
    this.reportWindows = new Map();
    this.seenReportIds = new Set();
    this.seenEventIds = new Set();
    this.reset({ runId, authorityEpoch });
  }

  reset({
    runId = null,
    authorityEpoch = 0,
    mapId = 'grid_bunker',
    difficulty = 1,
    startedAt = this.now()
  } = {}) {
    this.runId = sanitizeStatsId(runId, null);
    this.authorityEpoch = Math.max(0, Math.floor(finite(authorityEpoch)));
    this.mapId = String(mapId || 'grid_bunker').slice(0, 80);
    this.difficulty = Math.max(0.5, Math.min(3, finite(difficulty, 1)));
    this.startedAt = Math.max(0, finite(startedAt, this.now()));
    this.highestWave = 1;
    this.version = 0;
    this.finalSummary = null;
    this.players.clear();
    this.reportWindows.clear();
    this.seenReportIds.clear();
    this.seenEventIds.clear();
    return this.getSnapshot(this.startedAt);
  }

  ensurePlayer(playerId, details = {}) {
    const id = sanitizeStatsId(playerId);
    if (!id) return null;
    let player = this.players.get(id);
    if (!player) {
      player = defaultPlayer(id, details);
      this.players.set(id, player);
    } else {
      if (details.displayName !== undefined) player.displayName = sanitizeStatsName(details.displayName);
      if (details.role !== undefined || details.isBot !== undefined) {
        player.role = details.role === 'HOST'
          ? 'HOST'
          : details.role === 'COMPANION' || details.isBot === true
            ? 'COMPANION'
            : 'OPERATIVE';
      }
      if (details.isBot !== undefined) player.isBot = details.isBot === true;
      if (details.connected !== undefined) player.connected = details.connected === true;
      if (details.lifeState !== undefined || details.connected !== undefined) {
        player.lifeState = normalizeLifeState(details.lifeState || player.lifeState, player.connected);
      }
      if (details.health !== undefined) player.health = Math.max(0, finite(details.health, player.health));
      if (details.maxHealth !== undefined) player.maxHealth = Math.max(1, finite(details.maxHealth, player.maxHealth));
      if (details.currentPoints !== undefined) player.currentPoints = Math.max(0, Math.floor(finite(details.currentPoints)));
      if (details.networkRttMs !== undefined) {
        player.networkRttMs = details.networkRttMs === null ? null : Math.max(0, Math.floor(finite(details.networkRttMs)));
      }
      if (details.now !== undefined) player.lastUpdatedAt = Math.max(0, finite(details.now));
    }
    return player;
  }

  allowReport(playerId, now = this.now()) {
    const id = sanitizeStatsId(playerId);
    if (!id) return false;
    let window = this.reportWindows.get(id);
    if (!window || now - window.startedAt >= 1000) {
      window = { startedAt: now, count: 0 };
      this.reportWindows.set(id, window);
    }
    window.count += 1;
    return window.count <= MAX_REPORTS_PER_SECOND;
  }

  rememberReport(reportId) {
    this.seenReportIds.add(reportId);
    if (this.seenReportIds.size <= MAX_SEEN_REPORT_IDS) return;
    const oldest = this.seenReportIds.values().next().value;
    if (oldest) this.seenReportIds.delete(oldest);
  }

  applyLocalReport(report = {}, {
    playerId,
    authorityEpoch = this.authorityEpoch,
    now = this.now()
  } = {}) {
    if (Math.floor(finite(authorityEpoch, -1)) < this.authorityEpoch) {
      return { accepted: false, reason: 'stale-authority-epoch' };
    }
    const actorId = sanitizeStatsId(playerId);
    const reportPlayerId = sanitizeStatsId(report.playerId || actorId);
    if (!actorId || !reportPlayerId || actorId !== reportPlayerId) {
      return { accepted: false, reason: 'player-mismatch' };
    }
    const sequence = Math.max(0, Math.floor(finite(report.sequence, -1)));
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return { accepted: false, reason: 'invalid-sequence' };
    }
    const reportId = sanitizeStatsId(report.reportId, `${actorId}:${sequence}`);
    if (this.seenReportIds.has(reportId)) {
      return { accepted: false, reason: 'duplicate' };
    }
    const player = this.ensurePlayer(actorId, {
      displayName: report.displayName,
      now
    });
    if (!player) return { accepted: false, reason: 'invalid-player' };
    if (sequence <= player.lastReportSequence) {
      return { accepted: false, reason: 'stale-sequence' };
    }
    if (!this.allowReport(actorId, now)) {
      return { accepted: false, reason: 'rate-limit' };
    }
    const counters = makeCounters(report.counters || {});
    if (!counters) return { accepted: false, reason: 'invalid-counter' };
    for (const key of COOP_COUNTER_KEYS) {
      const previous = player.counters[key] || 0;
      const next = counters[key];
      if (next < previous) return { accepted: false, reason: `rollback:${key}` };
      if (next - previous > (DELTA_LIMITS[key] || MAX_COUNTER)) {
        return { accepted: false, reason: `delta-limit:${key}` };
      }
    }
    player.counters = counters;
    player.lastReportSequence = sequence;
    player.lastUpdatedAt = now;
    this.rememberReport(reportId);
    this.version += 1;
    return { accepted: true, player: clonePlayer(player) };
  }

  applyRoom(room = {}, now = this.now()) {
    const hostId = room.hostPlayerId || null;
    const seen = new Set();
    (room.players || []).forEach((entry) => {
      const playerId = sanitizeStatsId(entry?.playerId);
      if (!playerId) return;
      seen.add(playerId);
      this.ensurePlayer(playerId, {
        displayName: entry.displayName,
        role: playerId === hostId || entry.isHost === true
          ? 'HOST'
          : entry.isBot === true
            ? 'COMPANION'
            : 'OPERATIVE',
        isBot: entry.isBot === true,
        connected: entry.connected !== false,
        lifeState: entry.connected === false ? 'RECONNECTING' : undefined,
        now
      });
    });
    this.players.forEach((player, playerId) => {
      if (!seen.has(playerId)) {
        player.connected = false;
        player.lifeState = 'RECONNECTING';
      }
    });
    if (room.settings?.mapId) this.mapId = String(room.settings.mapId).slice(0, 80);
    if (room.settings?.difficulty !== undefined) this.difficulty = Math.max(0.5, Math.min(3, finite(room.settings.difficulty, this.difficulty)));
    if (room.authorityEpoch !== undefined) this.authorityEpoch = Math.max(this.authorityEpoch, Math.floor(finite(room.authorityEpoch)));
  }

  applyEconomySnapshot(snapshot = {}) {
    (snapshot.players || snapshot.accounts || []).forEach((entry) => {
      const player = this.ensurePlayer(entry?.playerId);
      if (!player) return;
      player.currentPoints = Math.max(0, Math.floor(finite(entry.score)));
      player.counters.kills = Math.max(player.counters.kills, Math.floor(finite(entry.kills)));
      player.counters.perksPurchased = Math.max(player.counters.perksPurchased, (entry.profile?.perks || []).length);
      player.counters.weaponUpgrades = Math.max(
        player.counters.weaponUpgrades,
        Object.values(entry.profile?.upgrades || {}).filter((tier) => finite(tier) > 0).length
      );
    });
  }

  applyReviveSnapshot(snapshot = {}, now = this.now()) {
    (snapshot.players || []).forEach((entry) => {
      const player = this.ensurePlayer(entry?.playerId, {
        displayName: entry?.displayName,
        connected: entry?.connected !== false,
        now
      });
      if (!player) return;
      const nextLife = normalizeLifeState(entry.lifeState, entry.connected !== false);
      const previousLife = player.lifeState;
      if (nextLife === 'DOWNED' && previousLife !== 'DOWNED') {
        player.counters.timesDowned += 1;
      }
      if (
        (nextLife === 'SPECTATING' || nextLife === 'ELIMINATED')
        && previousLife !== 'SPECTATING'
        && previousLife !== 'ELIMINATED'
      ) {
        player.counters.deaths += 1;
      }
      player.lifeState = nextLife;
      player.health = Math.max(0, finite(entry.health));
      player.maxHealth = Math.max(1, finite(entry.maxHealth, 100));
      player.connected = entry.connected !== false;
      player.lastUpdatedAt = now;
    });
  }

  recordReviveCompleted(reviverId, eventId = null) {
    const id = sanitizeStatsId(reviverId);
    if (!id) return false;
    const key = sanitizeStatsId(eventId, `revive:${id}:${this.seenEventIds.size + 1}`);
    if (this.seenEventIds.has(key)) return false;
    const player = this.ensurePlayer(id);
    if (!player) return false;
    player.counters.revives += 1;
    this.seenEventIds.add(key);
    this.version += 1;
    return true;
  }

  updateMeta({ wave, mapId, difficulty, authorityEpoch } = {}) {
    if (wave !== undefined) this.highestWave = Math.max(this.highestWave, Math.max(1, Math.floor(finite(wave, 1))));
    if (mapId) this.mapId = String(mapId).slice(0, 80);
    if (difficulty !== undefined) this.difficulty = Math.max(0.5, Math.min(3, finite(difficulty, this.difficulty)));
    if (authorityEpoch !== undefined) this.authorityEpoch = Math.max(this.authorityEpoch, Math.floor(finite(authorityEpoch)));
  }

  teamTotals() {
    const totals = {
      kills: 0,
      revives: 0,
      damage: 0,
      pointsEarned: 0,
      pointsSpent: 0
    };
    this.players.forEach((player) => {
      totals.kills += Math.max(0, finite(player.counters.kills));
      totals.revives += Math.max(0, finite(player.counters.revives));
      totals.damage += Math.max(0, finite(player.counters.damageDealt));
      totals.pointsEarned += Math.max(0, finite(player.counters.pointsEarned));
      totals.pointsSpent += Math.max(0, finite(player.counters.pointsSpent));
    });
    return totals;
  }

  getPlayers() {
    return sortCoopPlayers(Array.from(this.players.values(), clonePlayer));
  }

  getSnapshot(now = this.now()) {
    const players = this.getPlayers();
    const totals = this.teamTotals();
    return {
      kind: COOP_STATS_MESSAGE_KIND.SNAPSHOT,
      runId: this.runId,
      authorityEpoch: this.authorityEpoch,
      version: this.version,
      finalized: Boolean(this.finalSummary),
      mapId: this.mapId,
      difficulty: this.difficulty,
      highestWave: this.highestWave,
      durationSeconds: Math.max(0, (finite(now, this.startedAt) - this.startedAt) / 1000),
      startedAt: this.startedAt,
      players,
      team: {
        mapId: this.mapId,
        difficulty: this.difficulty,
        highestWave: this.highestWave,
        durationSeconds: Math.max(0, (finite(now, this.startedAt) - this.startedAt) / 1000),
        totalKills: totals.kills,
        totalRevives: totals.revives,
        totalDamage: totals.damage,
        totalPointsEarned: totals.pointsEarned,
        totalPointsSpent: totals.pointsSpent
      },
      finalSummary: this.finalSummary
    };
  }

  finalize({ reason = 'ended', now = this.now(), wave = this.highestWave } = {}) {
    if (this.finalSummary) return this.finalSummary;
    this.updateMeta({ wave });
    const snapshot = this.getSnapshot(now);
    this.finalSummary = Object.freeze({
      kind: COOP_STATS_MESSAGE_KIND.FINAL,
      runId: this.runId,
      authorityEpoch: this.authorityEpoch,
      version: snapshot.version,
      finalizedAt: Math.max(0, finite(now)),
      endReason: String(reason || 'ended').slice(0, 80),
      players: snapshot.players.map((player) => Object.freeze({
        playerId: player.playerId,
        displayName: player.displayName,
        role: player.role,
        isBot: player.isBot === true,
        kills: player.counters.kills,
        headshotKills: player.counters.headshotKills,
        shots: player.counters.shots,
        hits: player.counters.hits,
        accuracyPct: player.accuracyPct,
        damageDealt: player.counters.damageDealt,
        damageTaken: player.counters.damageTaken,
        pointsEarned: player.counters.pointsEarned,
        pointsSpent: player.counters.pointsSpent,
        revives: player.counters.revives,
        timesDowned: player.counters.timesDowned,
        deaths: player.counters.deaths,
        perksPurchased: player.counters.perksPurchased,
        weaponUpgrades: player.counters.weaponUpgrades
      })),
      team: Object.freeze({
        mapId: snapshot.mapId,
        difficulty: snapshot.difficulty,
        highestWave: Math.max(snapshot.highestWave, Math.max(1, Math.floor(finite(wave, snapshot.highestWave)))),
        durationSeconds: snapshot.durationSeconds,
        endReason: String(reason || 'ended').slice(0, 80),
        totalKills: snapshot.team.totalKills,
        totalDamage: snapshot.team.totalDamage,
        totalPointsEarned: snapshot.team.totalPointsEarned,
        totalPointsSpent: snapshot.team.totalPointsSpent,
        totalRevives: snapshot.team.totalRevives
      })
    });
    return this.finalSummary;
  }

  replaceSnapshot(snapshot = {}) {
    if (!snapshot || !Array.isArray(snapshot.players)) return false;
    this.runId = sanitizeStatsId(snapshot.runId, this.runId);
    this.authorityEpoch = Math.max(this.authorityEpoch, Math.floor(finite(snapshot.authorityEpoch)));
    this.version = Math.max(this.version, Math.floor(finite(snapshot.version)));
    this.mapId = String(snapshot.mapId || this.mapId || 'grid_bunker').slice(0, 80);
    this.difficulty = Math.max(0.5, Math.min(3, finite(snapshot.difficulty, this.difficulty)));
    this.highestWave = Math.max(1, Math.floor(finite(snapshot.highestWave, this.highestWave)));
    this.startedAt = Math.max(0, finite(snapshot.startedAt, this.startedAt));
    this.players.clear();
    snapshot.players.forEach((entry) => {
      const playerId = sanitizeStatsId(entry?.playerId);
      if (!playerId) return;
      const counters = makeCounters(entry.counters || {});
      this.players.set(playerId, defaultPlayer(playerId, {
        ...entry,
        counters: counters || {},
        now: entry.lastUpdatedAt
      }));
      const player = this.players.get(playerId);
      player.currentPoints = Math.max(0, Math.floor(finite(entry.currentPoints)));
      player.networkRttMs = entry.networkRttMs === null ? null : Math.max(0, Math.floor(finite(entry.networkRttMs)));
      player.lastReportSequence = Math.max(0, Math.floor(finite(entry.lastReportSequence)));
    });
    if (snapshot.finalSummary) this.finalSummary = snapshot.finalSummary;
    return true;
  }

  restoreFinal(finalSummary = null) {
    if (!finalSummary?.players || !finalSummary?.team) return false;
    if (!this.finalSummary) this.finalSummary = finalSummary;
    return true;
  }
}

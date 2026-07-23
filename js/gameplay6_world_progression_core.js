// GAMEPLAY.6 R1 — deterministic persistent world progression.
// World state is profile-owned, cloud-merge-safe, and host-authoritative in active co-op runs.

export const GAMEPLAY6_PATCH = 'gameplay6-r1-world-progression';
export const GAMEPLAY6_SCHEMA = 1;

export const GAMEPLAY6_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE'
});

export const GAMEPLAY6_TIER = Object.freeze({
  RECON: 1,
  COUNTEROFFENSIVE: 2,
  DOMINANCE: 3,
  SECURED: 4
});

const MAX_RECEIPTS = 64;
const GLOBAL_MILESTONES = Object.freeze([
  Object.freeze({ id: 'WORLD-FOOTHOLD', points: 250, tier: 1, label: 'World Foothold' }),
  Object.freeze({ id: 'WORLD-COUNTEROFFENSIVE', points: 700, tier: 2, label: 'Counteroffensive Network' }),
  Object.freeze({ id: 'WORLD-DOMINANCE', points: 1400, tier: 3, label: 'Containment Dominance' }),
  Object.freeze({ id: 'WORLD-SECURED', points: 2400, tier: 4, label: 'World Secured' })
]);

const SECTOR_TIERS = Object.freeze([
  Object.freeze({ tier: 1, points: 0, label: 'Recon' }),
  Object.freeze({ tier: 2, points: 220, label: 'Counteroffensive' }),
  Object.freeze({ tier: 3, points: 520, label: 'Dominance' }),
  Object.freeze({ tier: 4, points: 900, label: 'Secured' })
]);

export const GAMEPLAY6_SECTORS = Object.freeze({
  grid_bunker: Object.freeze({ id: 'BLACK-VAULT', label: 'Black Vault Sector', region: 'NORTHERN FRONT' }),
  industrial_yard: Object.freeze({ id: 'IRON-YARD', label: 'Iron Yard Sector', region: 'NORTHERN FRONT' }),
  neon_depot: Object.freeze({ id: 'NEON-RELAY', label: 'Neon Relay Sector', region: 'URBAN CORRIDOR' }),
  parking_garage: Object.freeze({ id: 'CONCRETE-ROUTE', label: 'Concrete Route Sector', region: 'URBAN CORRIDOR' }),
  hospital_wing: Object.freeze({ id: 'WHITE-WING', label: 'White Wing Sector', region: 'CONTAINMENT CORE' }),
  reactor_courtyard: Object.freeze({ id: 'RED-CORE', label: 'Red Core Sector', region: 'CONTAINMENT CORE' }),
  stormbreak_canal: Object.freeze({ id: 'STORMBREAK', label: 'Stormbreak Sector', region: 'COASTAL DEFENSE' })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maximum);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function isPvpMode(gameMode) {
  const value = cleanText(gameMode, 'survival', 40).toLowerCase();
  return value === 'pvp' || value.startsWith('pvp-');
}

function sectorDefinition(mapId) {
  const key = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return GAMEPLAY6_SECTORS[key] || GAMEPLAY6_SECTORS.grid_bunker;
}

function gradeRank(value) {
  const grade = cleanText(value, 'UNRANKED', 12).toUpperCase();
  if (grade === 'A+' || grade === 'A') return 4;
  if (grade === 'A-') return 3;
  if (grade.startsWith('B')) return 2;
  if (grade.startsWith('C')) return 1;
  return 0;
}

function sectorTier(points) {
  const value = integer(points, 0);
  let current = SECTOR_TIERS[0];
  for (const entry of SECTOR_TIERS) {
    if (value >= entry.points) current = entry;
  }
  return current;
}

function worldTier(points) {
  const value = integer(points, 0);
  let tier = 0;
  for (const entry of GLOBAL_MILESTONES) {
    if (value >= entry.points) tier = entry.tier;
  }
  return tier;
}

function defaultSector(mapId) {
  const definition = sectorDefinition(mapId);
  return {
    mapId: cleanText(mapId, 'grid_bunker', 80).toLowerCase(),
    sectorId: definition.id,
    points: 0,
    tier: 1,
    operationsCompleted: 0,
    decisiveVictories: 0,
    securedBranches: 0,
    bossVictories: 0,
    mutationOperations: 0,
    evolvedMapOperations: 0,
    bestGradeRank: 0,
    lastContributionAt: 0
  };
}

export function createDefaultGameplay6WorldProfile(now = Date.now()) {
  const sectors = {};
  Object.keys(GAMEPLAY6_SECTORS).forEach((mapId) => {
    sectors[mapId] = defaultSector(mapId);
  });
  return {
    patch: GAMEPLAY6_PATCH,
    schema: GAMEPLAY6_SCHEMA,
    points: 0,
    tier: 0,
    operationsCompleted: 0,
    decisiveVictories: 0,
    securedBranches: 0,
    bossVictories: 0,
    mutationOperations: 0,
    evolvedMapOperations: 0,
    sectors,
    milestones: {},
    receipts: [],
    createdAt: integer(now, Date.now(), 1),
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizeGameplay6WorldProfile(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = createDefaultGameplay6WorldProfile(source.createdAt || now);
  output.points = integer(source.points, 0);
  output.operationsCompleted = integer(source.operationsCompleted, 0);
  output.decisiveVictories = integer(source.decisiveVictories, 0);
  output.securedBranches = integer(source.securedBranches, 0);
  output.bossVictories = integer(source.bossVictories, 0);
  output.mutationOperations = integer(source.mutationOperations, 0);
  output.evolvedMapOperations = integer(source.evolvedMapOperations, 0);
  output.tier = worldTier(output.points);
  output.createdAt = integer(source.createdAt, output.createdAt, 1);
  output.updatedAt = Math.max(output.createdAt, integer(source.updatedAt, output.createdAt, 1));

  Object.keys(GAMEPLAY6_SECTORS).forEach((mapId) => {
    const input = source.sectors?.[mapId] || {};
    const sector = defaultSector(mapId);
    sector.points = integer(input.points, 0);
    sector.operationsCompleted = integer(input.operationsCompleted, 0);
    sector.decisiveVictories = integer(input.decisiveVictories, 0);
    sector.securedBranches = integer(input.securedBranches, 0);
    sector.bossVictories = integer(input.bossVictories, 0);
    sector.mutationOperations = integer(input.mutationOperations, 0);
    sector.evolvedMapOperations = integer(input.evolvedMapOperations, 0);
    sector.bestGradeRank = integer(input.bestGradeRank, 0, 0, 4);
    sector.lastContributionAt = integer(input.lastContributionAt, 0);
    sector.tier = sectorTier(sector.points).tier;
    output.sectors[mapId] = sector;
  });

  output.milestones = {};
  GLOBAL_MILESTONES.forEach((entry) => {
    const unlockedAt = integer(source.milestones?.[entry.id], 0);
    if (unlockedAt > 0 || output.points >= entry.points) {
      output.milestones[entry.id] = unlockedAt || output.updatedAt;
    }
  });

  const seen = new Set();
  output.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map((entry) => ({
      receiptId: cleanText(entry?.receiptId, '', 220),
      mapId: cleanText(entry?.mapId, '', 80).toLowerCase(),
      points: integer(entry?.points, 0),
      appliedAt: integer(entry?.appliedAt, 0)
    }))
    .filter((entry) => entry.receiptId && !seen.has(entry.receiptId) && seen.add(entry.receiptId))
    .sort((left, right) => right.appliedAt - left.appliedAt || left.receiptId.localeCompare(right.receiptId))
    .slice(0, MAX_RECEIPTS);

  return output;
}

export function computeGameplay6Contribution({
  runId = 'run',
  mapId = 'grid_bunker',
  gameMode = 'survival',
  narrative = null,
  gameplay2 = null,
  gameplay3 = null,
  gameplay4 = null,
  now = Date.now()
} = {}) {
  if (isPvpMode(gameMode) || narrative?.pvpExcluded === false) return null;
  if (narrative?.status !== 'COMPLETE' || !narrative?.completionId) return null;

  const grade = gradeRank(narrative.outcomeGrade);
  const secured = narrative.branchId === 'ASSET_SECURED';
  const decisive = narrative.outcomeId === 'DECISIVE_VICTORY';
  const bossVictory = gameplay4?.status === 'DEFEATED' || Boolean(gameplay4?.completionId);
  const mutationCount = integer(gameplay2?.history?.length ?? gameplay2?.mutationHistoryCount, 0, 0, 8);
  const evolved = integer(gameplay3?.revision, 0) > 0 || integer(gameplay3?.stage, 0) > 0;

  const points = Math.min(260, Math.max(80,
    90
    + grade * 18
    + (secured ? 24 : 0)
    + (decisive ? 26 : 0)
    + (bossVictory ? 30 : 0)
    + Math.min(24, mutationCount * 8)
    + (evolved ? 16 : 0)
  ));

  const normalizedMapId = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  const definition = sectorDefinition(normalizedMapId);
  return freezeClone({
    patch: GAMEPLAY6_PATCH,
    schema: GAMEPLAY6_SCHEMA,
    receiptId: `${cleanText(narrative.completionId, cleanText(runId, 'run', 120), 180)}:gameplay6`,
    runId: cleanText(runId, 'run', 160),
    mapId: normalizedMapId,
    sectorId: definition.id,
    sectorLabel: definition.label,
    region: definition.region,
    points,
    gradeRank: grade,
    outcomeId: cleanText(narrative.outcomeId, 'MISSION_RESOLVED', 60),
    branchId: cleanText(narrative.branchId, 'UNRESOLVED', 40),
    decisive,
    secured,
    bossVictory,
    mutationOperation: mutationCount > 0,
    mutationCount,
    evolvedMapOperation: evolved,
    completedAt: integer(narrative.completedAt || now, now, 1)
  });
}

export function applyGameplay6Contribution(profileValue, receiptValue, now = Date.now()) {
  const profile = normalizeGameplay6WorldProfile(profileValue, now);
  const receipt = receiptValue && typeof receiptValue === 'object' ? receiptValue : null;
  if (!receipt?.receiptId || !receipt?.mapId || integer(receipt.points, 0) <= 0) {
    return Object.freeze({ applied: false, idempotent: false, profile: freezeClone(profile), receipt: null, unlocked: [] });
  }
  if (profile.receipts.some((entry) => entry.receiptId === receipt.receiptId)) {
    return Object.freeze({ applied: false, idempotent: true, profile: freezeClone(profile), receipt: freezeClone(receipt), unlocked: [] });
  }

  const beforeTier = profile.tier;
  const mapId = GAMEPLAY6_SECTORS[receipt.mapId] ? receipt.mapId : 'grid_bunker';
  const sector = profile.sectors[mapId];
  const beforeSectorTier = sector.tier;
  const points = integer(receipt.points, 0, 1, 260);
  const appliedAt = integer(receipt.completedAt || now, now, 1);

  profile.points += points;
  profile.operationsCompleted += 1;
  profile.decisiveVictories += receipt.decisive === true ? 1 : 0;
  profile.securedBranches += receipt.secured === true ? 1 : 0;
  profile.bossVictories += receipt.bossVictory === true ? 1 : 0;
  profile.mutationOperations += receipt.mutationOperation === true ? 1 : 0;
  profile.evolvedMapOperations += receipt.evolvedMapOperation === true ? 1 : 0;

  sector.points += points;
  sector.operationsCompleted += 1;
  sector.decisiveVictories += receipt.decisive === true ? 1 : 0;
  sector.securedBranches += receipt.secured === true ? 1 : 0;
  sector.bossVictories += receipt.bossVictory === true ? 1 : 0;
  sector.mutationOperations += receipt.mutationOperation === true ? 1 : 0;
  sector.evolvedMapOperations += receipt.evolvedMapOperation === true ? 1 : 0;
  sector.bestGradeRank = Math.max(sector.bestGradeRank, integer(receipt.gradeRank, 0, 0, 4));
  sector.lastContributionAt = Math.max(sector.lastContributionAt, appliedAt);
  sector.tier = sectorTier(sector.points).tier;
  profile.tier = worldTier(profile.points);
  profile.updatedAt = Math.max(profile.updatedAt, appliedAt);
  profile.receipts = [
    { receiptId: cleanText(receipt.receiptId, '', 220), mapId, points, appliedAt },
    ...profile.receipts
  ].slice(0, MAX_RECEIPTS);

  const unlocked = [];
  GLOBAL_MILESTONES.forEach((entry) => {
    if (profile.points >= entry.points && !profile.milestones[entry.id]) {
      profile.milestones[entry.id] = appliedAt;
      unlocked.push({ type: 'WORLD', id: entry.id, tier: entry.tier, label: entry.label });
    }
  });
  if (sector.tier > beforeSectorTier) {
    const tier = SECTOR_TIERS.find((entry) => entry.tier === sector.tier);
    unlocked.push({
      type: 'SECTOR',
      id: `${sector.sectorId}-TIER-${sector.tier}`,
      tier: sector.tier,
      label: `${sectorDefinition(mapId).label} · ${tier?.label || `Tier ${sector.tier}`}`
    });
  }
  if (profile.tier > beforeTier && !unlocked.some((entry) => entry.type === 'WORLD' && entry.tier === profile.tier)) {
    unlocked.push({ type: 'WORLD', id: `WORLD-TIER-${profile.tier}`, tier: profile.tier, label: `World Tier ${profile.tier}` });
  }

  return Object.freeze({
    applied: true,
    idempotent: false,
    profile: freezeClone(normalizeGameplay6WorldProfile(profile, appliedAt)),
    receipt: freezeClone({ ...receipt, points, appliedAt }),
    unlocked: freezeClone(unlocked)
  });
}

export function getGameplay6WorldPresentation(profileValue, mapId = 'grid_bunker') {
  const profile = normalizeGameplay6WorldProfile(profileValue);
  const normalizedMapId = GAMEPLAY6_SECTORS[mapId] ? mapId : 'grid_bunker';
  const sector = profile.sectors[normalizedMapId];
  const definition = sectorDefinition(normalizedMapId);
  const tier = sectorTier(sector.points);
  const next = SECTOR_TIERS.find((entry) => entry.tier === tier.tier + 1) || null;
  const globalNext = GLOBAL_MILESTONES.find((entry) => profile.points < entry.points) || null;
  return freezeClone({
    patch: GAMEPLAY6_PATCH,
    schema: GAMEPLAY6_SCHEMA,
    worldPoints: profile.points,
    worldTier: profile.tier,
    worldOperationsCompleted: profile.operationsCompleted,
    worldNextMilestone: globalNext,
    sector: {
      ...sector,
      label: definition.label,
      region: definition.region,
      tierLabel: tier.label,
      nextTier: next,
      pointsToNextTier: next ? Math.max(0, next.points - sector.points) : 0
    },
    milestones: clone(profile.milestones)
  });
}

export function createGameplay6SessionState({
  runId = 'run',
  mapId = 'grid_bunker',
  gameMode = 'survival',
  profile = null,
  now = Date.now()
} = {}) {
  const active = !isPvpMode(gameMode);
  const normalizedMapId = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return {
    patch: GAMEPLAY6_PATCH,
    schema: GAMEPLAY6_SCHEMA,
    runId: cleanText(runId, 'run', 160),
    mapId: normalizedMapId,
    gameMode: cleanText(gameMode, 'survival', 40).toLowerCase(),
    active,
    pvpExcluded: true,
    hostAuthoritative: true,
    profileOwned: true,
    cloudMergeSafe: true,
    status: active ? GAMEPLAY6_STATUS.ACTIVE : GAMEPLAY6_STATUS.INACTIVE,
    presentation: getGameplay6WorldPresentation(profile || {}, normalizedMapId),
    contribution: null,
    completionId: null,
    completedAt: 0,
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizeGameplay6SessionState(value = {}, now = Date.now()) {
  const base = createGameplay6SessionState({
    runId: value.runId,
    mapId: value.mapId,
    gameMode: value.gameMode,
    profile: value.presentation?.profile || {},
    now
  });
  return {
    ...base,
    active: value.active === true && !isPvpMode(value.gameMode),
    status: Object.values(GAMEPLAY6_STATUS).includes(value.status) ? value.status : base.status,
    presentation: clone(value.presentation || base.presentation),
    contribution: value.contribution ? clone(value.contribution) : null,
    completionId: cleanText(value.completionId, '', 240) || null,
    completedAt: integer(value.completedAt, 0),
    updatedAt: integer(value.updatedAt, now, 1),
    pvpExcluded: true,
    hostAuthoritative: true,
    profileOwned: true,
    cloudMergeSafe: true
  };
}

export class Gameplay6WorldDirector {
  constructor(value = null) {
    this.state = normalizeGameplay6SessionState(value || createGameplay6SessionState());
    this.events = [];
  }

  reset(details = {}) {
    this.state = createGameplay6SessionState(details);
    this.events = [];
    if (this.state.active) {
      this.events.push({
        type: 'GAMEPLAY6_WORLD_LINKED',
        sector: clone(this.state.presentation.sector),
        worldTier: this.state.presentation.worldTier
      });
    }
    return this.getSnapshot();
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== GAMEPLAY6_PATCH) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizeGameplay6SessionState(snapshot, now);
    this.events = [];
    return true;
  }

  update(now = Date.now(), {
    profile = null,
    narrative = null,
    gameplay2 = null,
    gameplay3 = null,
    gameplay4 = null
  } = {}) {
    if (!this.state.active) return this.getSnapshot();
    if (profile) {
      this.state.presentation = getGameplay6WorldPresentation(profile, this.state.mapId);
    }
    if (this.state.status !== GAMEPLAY6_STATUS.COMPLETE) {
      const contribution = computeGameplay6Contribution({
        runId: this.state.runId,
        mapId: this.state.mapId,
        gameMode: this.state.gameMode,
        narrative,
        gameplay2,
        gameplay3,
        gameplay4,
        now
      });
      if (contribution) {
        this.state.contribution = clone(contribution);
        this.state.completionId = contribution.receiptId;
        this.state.completedAt = contribution.completedAt;
        this.state.status = GAMEPLAY6_STATUS.COMPLETE;
        this.events.push({
          type: 'GAMEPLAY6_CONTRIBUTION_READY',
          contribution: clone(contribution),
          sector: clone(this.state.presentation.sector)
        });
      }
    }
    this.state.updatedAt = integer(now, Date.now(), 1);
    return this.getSnapshot();
  }

  consumeEvents() {
    const output = this.events.map(clone);
    this.events = [];
    return output;
  }

  getSnapshot() {
    return freezeClone(normalizeGameplay6SessionState(this.state, this.state.updatedAt));
  }
}

// GAMEPLAY.7 R1 — deterministic dynamic campaign and faction control.
// Campaign state is profile-owned, merge-safe, host-authoritative in co-op, and excluded from PvP.

export const GAMEPLAY7_PATCH = 'gameplay7-r1-dynamic-campaign-faction-control';
export const GAMEPLAY7_SCHEMA = 1;

export const GAMEPLAY7_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE'
});

export const GAMEPLAY7_CONTROL = Object.freeze({
  SECURED: 'SECURED',
  CONTESTED: 'CONTESTED',
  OVERRUN: 'OVERRUN'
});

export const GAMEPLAY7_FACTIONS = Object.freeze({
  VANGUARD_CORPS: 'VANGUARD_CORPS',
  WASTELAND_RAIDERS: 'WASTELAND_RAIDERS',
  BIOHAZARD_SWARM: 'BIOHAZARD_SWARM',
  MACHINE_COLLECTIVE: 'MACHINE_COLLECTIVE'
});

const MAX_RECEIPTS = 96;
const CONTROL_THRESHOLD = 35;
const SUPPORTED_FACTIONS = new Set(Object.values(GAMEPLAY7_FACTIONS));

export const GAMEPLAY7_SECTORS = Object.freeze({
  grid_bunker: Object.freeze({ id: 'BLACK-VAULT', label: 'Black Vault Sector', region: 'NORTHERN FRONT', defaultFactionId: GAMEPLAY7_FACTIONS.MACHINE_COLLECTIVE }),
  industrial_yard: Object.freeze({ id: 'IRON-YARD', label: 'Iron Yard Sector', region: 'NORTHERN FRONT', defaultFactionId: GAMEPLAY7_FACTIONS.WASTELAND_RAIDERS }),
  neon_depot: Object.freeze({ id: 'NEON-RELAY', label: 'Neon Relay Sector', region: 'URBAN CORRIDOR', defaultFactionId: GAMEPLAY7_FACTIONS.MACHINE_COLLECTIVE }),
  parking_garage: Object.freeze({ id: 'CONCRETE-ROUTE', label: 'Concrete Route Sector', region: 'URBAN CORRIDOR', defaultFactionId: GAMEPLAY7_FACTIONS.WASTELAND_RAIDERS }),
  hospital_wing: Object.freeze({ id: 'WHITE-WING', label: 'White Wing Sector', region: 'CONTAINMENT CORE', defaultFactionId: GAMEPLAY7_FACTIONS.BIOHAZARD_SWARM }),
  reactor_courtyard: Object.freeze({ id: 'RED-CORE', label: 'Red Core Sector', region: 'CONTAINMENT CORE', defaultFactionId: GAMEPLAY7_FACTIONS.BIOHAZARD_SWARM })
});

const CONTROL_TUNING = Object.freeze({
  [GAMEPLAY7_CONTROL.SECURED]: Object.freeze({
    enemyHealthScale: 0.94,
    enemyDamageScale: 0.95,
    specialWeightScale: 0.90,
    hazardScale: 0.90,
    rewardMultiplier: 0.95,
    label: 'Secured'
  }),
  [GAMEPLAY7_CONTROL.CONTESTED]: Object.freeze({
    enemyHealthScale: 1.00,
    enemyDamageScale: 1.00,
    specialWeightScale: 1.00,
    hazardScale: 1.00,
    rewardMultiplier: 1.08,
    label: 'Contested'
  }),
  [GAMEPLAY7_CONTROL.OVERRUN]: Object.freeze({
    enemyHealthScale: 1.16,
    enemyDamageScale: 1.12,
    specialWeightScale: 1.20,
    hazardScale: 1.18,
    rewardMultiplier: 1.32,
    label: 'Overrun'
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 180) {
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

function normalizedMapId(mapId) {
  const key = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return GAMEPLAY7_SECTORS[key] ? key : 'grid_bunker';
}

function sectorDefinition(mapId) {
  return GAMEPLAY7_SECTORS[normalizedMapId(mapId)];
}

function normalizedFactionId(value, mapId = 'grid_bunker') {
  const id = cleanText(value, '', 80).toUpperCase();
  return SUPPORTED_FACTIONS.has(id) ? id : sectorDefinition(mapId).defaultFactionId;
}

function controlState(playerInfluence, enemyInfluence) {
  const difference = integer(playerInfluence, 0) - integer(enemyInfluence, 0);
  if (difference >= CONTROL_THRESHOLD) return GAMEPLAY7_CONTROL.SECURED;
  if (difference <= -CONTROL_THRESHOLD) return GAMEPLAY7_CONTROL.OVERRUN;
  return GAMEPLAY7_CONTROL.CONTESTED;
}

function controlLevel(state) {
  if (state === GAMEPLAY7_CONTROL.SECURED) return 3;
  if (state === GAMEPLAY7_CONTROL.OVERRUN) return 1;
  return 2;
}

function defaultFactionInfluence() {
  return Object.fromEntries(Object.values(GAMEPLAY7_FACTIONS).map((id) => [id, 0]));
}

function defaultSector(mapId) {
  const definition = sectorDefinition(mapId);
  return {
    mapId: normalizedMapId(mapId),
    sectorId: definition.id,
    playerInfluence: 50,
    enemyInfluence: 50,
    controlState: GAMEPLAY7_CONTROL.CONTESTED,
    controlLevel: 2,
    operationsCompleted: 0,
    decisiveVictories: 0,
    securedOperations: 0,
    overrunRecoveries: 0,
    dominantFactionId: definition.defaultFactionId,
    factionInfluence: defaultFactionInfluence(),
    campaignPoints: 0,
    lastContributionAt: 0
  };
}

export function createDefaultGameplay7CampaignProfile(now = Date.now()) {
  const sectors = {};
  Object.keys(GAMEPLAY7_SECTORS).forEach((mapId) => {
    sectors[mapId] = defaultSector(mapId);
  });
  return {
    patch: GAMEPLAY7_PATCH,
    schema: GAMEPLAY7_SCHEMA,
    campaignId: 'CONTAINMENT-FRONT-R1',
    campaignPoints: 0,
    operationsCompleted: 0,
    decisiveVictories: 0,
    securedSectors: 0,
    overrunSectors: 0,
    factionInfluence: defaultFactionInfluence(),
    sectors,
    receipts: [],
    createdAt: integer(now, Date.now(), 1),
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizeGameplay7CampaignProfile(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = createDefaultGameplay7CampaignProfile(source.createdAt || now);
  output.campaignId = cleanText(source.campaignId, output.campaignId, 100);
  output.campaignPoints = integer(source.campaignPoints, 0);
  output.operationsCompleted = integer(source.operationsCompleted, 0);
  output.decisiveVictories = integer(source.decisiveVictories, 0);
  output.createdAt = integer(source.createdAt, output.createdAt, 1);
  output.updatedAt = Math.max(output.createdAt, integer(source.updatedAt, output.createdAt, 1));

  Object.values(GAMEPLAY7_FACTIONS).forEach((factionId) => {
    output.factionInfluence[factionId] = integer(source.factionInfluence?.[factionId], 0);
  });

  Object.keys(GAMEPLAY7_SECTORS).forEach((mapId) => {
    const input = source.sectors?.[mapId] || {};
    const sector = defaultSector(mapId);
    sector.playerInfluence = integer(input.playerInfluence, 50);
    sector.enemyInfluence = integer(input.enemyInfluence, 50);
    sector.operationsCompleted = integer(input.operationsCompleted, 0);
    sector.decisiveVictories = integer(input.decisiveVictories, 0);
    sector.securedOperations = integer(input.securedOperations, 0);
    sector.overrunRecoveries = integer(input.overrunRecoveries, 0);
    sector.campaignPoints = integer(input.campaignPoints, 0);
    sector.lastContributionAt = integer(input.lastContributionAt, 0);
    Object.values(GAMEPLAY7_FACTIONS).forEach((factionId) => {
      sector.factionInfluence[factionId] = integer(input.factionInfluence?.[factionId], 0);
    });
    sector.dominantFactionId = normalizedFactionId(input.dominantFactionId, mapId);
    const highestFaction = Object.entries(sector.factionInfluence)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    if (highestFaction?.[1] > 0) sector.dominantFactionId = highestFaction[0];
    sector.controlState = controlState(sector.playerInfluence, sector.enemyInfluence);
    sector.controlLevel = controlLevel(sector.controlState);
    output.sectors[mapId] = sector;
  });

  output.securedSectors = Object.values(output.sectors)
    .filter((sector) => sector.controlState === GAMEPLAY7_CONTROL.SECURED).length;
  output.overrunSectors = Object.values(output.sectors)
    .filter((sector) => sector.controlState === GAMEPLAY7_CONTROL.OVERRUN).length;

  const seen = new Set();
  output.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map((entry) => ({
      receiptId: cleanText(entry?.receiptId, '', 240),
      mapId: normalizedMapId(entry?.mapId),
      campaignPoints: integer(entry?.campaignPoints, 0),
      appliedAt: integer(entry?.appliedAt, 0)
    }))
    .filter((entry) => entry.receiptId && !seen.has(entry.receiptId) && seen.add(entry.receiptId))
    .sort((left, right) => right.appliedAt - left.appliedAt || left.receiptId.localeCompare(right.receiptId))
    .slice(0, MAX_RECEIPTS);

  return output;
}

export function getGameplay7CampaignPresentation(profileValue, mapId = 'grid_bunker') {
  const profile = normalizeGameplay7CampaignProfile(profileValue);
  const key = normalizedMapId(mapId);
  const sector = profile.sectors[key];
  const definition = sectorDefinition(key);
  const state = sector.controlState;
  return freezeClone({
    patch: GAMEPLAY7_PATCH,
    schema: GAMEPLAY7_SCHEMA,
    campaignId: profile.campaignId,
    campaignPoints: profile.campaignPoints,
    operationsCompleted: profile.operationsCompleted,
    securedSectors: profile.securedSectors,
    overrunSectors: profile.overrunSectors,
    sector: {
      ...sector,
      label: definition.label,
      region: definition.region,
      controlDifference: sector.playerInfluence - sector.enemyInfluence,
      controlLabel: CONTROL_TUNING[state].label,
      tuning: clone(CONTROL_TUNING[state])
    }
  });
}

export function computeGameplay7Contribution({
  runId = 'run',
  mapId = 'grid_bunker',
  gameMode = 'survival',
  world = null,
  narrative = null,
  replay = null,
  profile = null,
  now = Date.now()
} = {}) {
  if (isPvpMode(gameMode)) return null;
  if (world?.status !== 'COMPLETE' || !world?.completionId || !world?.contribution?.receiptId) return null;

  const key = normalizedMapId(mapId);
  const presentation = getGameplay7CampaignPresentation(profile || {}, key);
  const beforeState = presentation.sector.controlState;
  const decisive = narrative?.outcomeId === 'DECISIVE_VICTORY' || world?.contribution?.decisive === true;
  const securedBranch = narrative?.branchId === 'ASSET_SECURED' || world?.contribution?.secured === true;
  const bossVictory = world?.contribution?.bossVictory === true;
  const gradeRank = integer(world?.contribution?.gradeRank, 0, 0, 4);
  const worldPoints = integer(world?.contribution?.points, 80, 0, 260);
  const factionId = normalizedFactionId(replay?.faction?.id, key);

  const playerInfluence = Math.min(34, Math.max(8,
    8
    + Math.floor(worldPoints / 32)
    + gradeRank * 2
    + (decisive ? 5 : 0)
    + (securedBranch ? 4 : 0)
    + (bossVictory ? 3 : 0)
  ));
  const enemyInfluence = Math.min(28, Math.max(3,
    13
    - gradeRank
    - (decisive ? 3 : 0)
    - (securedBranch ? 2 : 0)
    + (beforeState === GAMEPLAY7_CONTROL.OVERRUN ? 4 : 0)
  ));
  const campaignPoints = Math.min(190, Math.max(60,
    55
    + Math.floor(worldPoints * 0.35)
    + (decisive ? 18 : 0)
    + (beforeState === GAMEPLAY7_CONTROL.OVERRUN ? 16 : 0)
  ));

  const projectedPlayer = presentation.sector.playerInfluence + playerInfluence;
  const projectedEnemy = presentation.sector.enemyInfluence + enemyInfluence;
  const projectedControlState = controlState(projectedPlayer, projectedEnemy);

  return freezeClone({
    patch: GAMEPLAY7_PATCH,
    schema: GAMEPLAY7_SCHEMA,
    receiptId: `${cleanText(world.completionId, cleanText(runId, 'run', 160), 210)}:gameplay7`,
    runId: cleanText(runId, 'run', 160),
    mapId: key,
    sectorId: presentation.sector.sectorId,
    sectorLabel: presentation.sector.label,
    region: presentation.sector.region,
    factionId,
    playerInfluence,
    enemyInfluence,
    campaignPoints,
    decisive,
    securedBranch,
    bossVictory,
    previousControlState: beforeState,
    projectedControlState,
    worldReceiptId: cleanText(world.contribution.receiptId, '', 240),
    completedAt: integer(world.completedAt || narrative?.completedAt || now, now, 1)
  });
}

export function applyGameplay7Contribution(profileValue, receiptValue, now = Date.now()) {
  const profile = normalizeGameplay7CampaignProfile(profileValue, now);
  const receipt = receiptValue && typeof receiptValue === 'object' ? receiptValue : null;
  if (!receipt?.receiptId || !receipt?.mapId || integer(receipt.campaignPoints, 0) <= 0) {
    return Object.freeze({ applied: false, idempotent: false, profile: freezeClone(profile), receipt: null, controlShift: null });
  }
  if (profile.receipts.some((entry) => entry.receiptId === receipt.receiptId)) {
    return Object.freeze({ applied: false, idempotent: true, profile: freezeClone(profile), receipt: freezeClone(receipt), controlShift: null });
  }

  const mapId = normalizedMapId(receipt.mapId);
  const sector = profile.sectors[mapId];
  const previousControlState = sector.controlState;
  const factionId = normalizedFactionId(receipt.factionId, mapId);
  const playerInfluence = integer(receipt.playerInfluence, 0, 1, 34);
  const enemyInfluence = integer(receipt.enemyInfluence, 0, 1, 28);
  const campaignPoints = integer(receipt.campaignPoints, 0, 1, 190);
  const appliedAt = integer(receipt.completedAt || now, now, 1);

  profile.campaignPoints += campaignPoints;
  profile.operationsCompleted += 1;
  profile.decisiveVictories += receipt.decisive === true ? 1 : 0;
  profile.factionInfluence[factionId] += enemyInfluence;

  sector.playerInfluence += playerInfluence;
  sector.enemyInfluence += enemyInfluence;
  sector.operationsCompleted += 1;
  sector.decisiveVictories += receipt.decisive === true ? 1 : 0;
  sector.campaignPoints += campaignPoints;
  sector.factionInfluence[factionId] += enemyInfluence;
  sector.dominantFactionId = factionId;
  sector.lastContributionAt = Math.max(sector.lastContributionAt, appliedAt);
  sector.controlState = controlState(sector.playerInfluence, sector.enemyInfluence);
  sector.controlLevel = controlLevel(sector.controlState);
  sector.securedOperations += sector.controlState === GAMEPLAY7_CONTROL.SECURED ? 1 : 0;
  sector.overrunRecoveries += previousControlState === GAMEPLAY7_CONTROL.OVERRUN
    && sector.controlState !== GAMEPLAY7_CONTROL.OVERRUN ? 1 : 0;

  profile.updatedAt = Math.max(profile.updatedAt, appliedAt);
  profile.receipts = [{ receiptId: cleanText(receipt.receiptId, '', 240), mapId, campaignPoints, appliedAt }, ...profile.receipts]
    .slice(0, MAX_RECEIPTS);

  const normalized = normalizeGameplay7CampaignProfile(profile, appliedAt);
  const nextControlState = normalized.sectors[mapId].controlState;
  const controlShift = nextControlState !== previousControlState
    ? freezeClone({
        mapId,
        sectorId: normalized.sectors[mapId].sectorId,
        previousControlState,
        nextControlState,
        label: `${sectorDefinition(mapId).label} · ${CONTROL_TUNING[nextControlState].label}`
      })
    : null;

  return Object.freeze({
    applied: true,
    idempotent: false,
    profile: freezeClone(normalized),
    receipt: freezeClone({ ...receipt, playerInfluence, enemyInfluence, campaignPoints, appliedAt }),
    controlShift
  });
}

export function createGameplay7SessionState({
  runId = 'run',
  mapId = 'grid_bunker',
  gameMode = 'survival',
  profile = null,
  now = Date.now()
} = {}) {
  const active = !isPvpMode(gameMode);
  const key = normalizedMapId(mapId);
  return {
    patch: GAMEPLAY7_PATCH,
    schema: GAMEPLAY7_SCHEMA,
    runId: cleanText(runId, 'run', 160),
    mapId: key,
    gameMode: cleanText(gameMode, 'survival', 40).toLowerCase(),
    active,
    pvpExcluded: true,
    hostAuthoritative: true,
    profileOwned: true,
    cloudMergeSafe: true,
    protocolUnchanged: true,
    status: active ? GAMEPLAY7_STATUS.ACTIVE : GAMEPLAY7_STATUS.INACTIVE,
    presentation: getGameplay7CampaignPresentation(profile || {}, key),
    contribution: null,
    completionId: null,
    completedAt: 0,
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizeGameplay7SessionState(value = {}, now = Date.now()) {
  const base = createGameplay7SessionState({
    runId: value.runId,
    mapId: value.mapId,
    gameMode: value.gameMode,
    profile: {},
    now
  });
  const active = value.active === true && !isPvpMode(value.gameMode);
  return {
    ...base,
    active,
    status: active && Object.values(GAMEPLAY7_STATUS).includes(value.status) ? value.status : (active ? base.status : GAMEPLAY7_STATUS.INACTIVE),
    presentation: clone(value.presentation || base.presentation),
    contribution: value.contribution ? clone(value.contribution) : null,
    completionId: cleanText(value.completionId, '', 260) || null,
    completedAt: integer(value.completedAt, 0),
    updatedAt: integer(value.updatedAt, now, 1),
    pvpExcluded: true,
    hostAuthoritative: true,
    profileOwned: true,
    cloudMergeSafe: true,
    protocolUnchanged: true
  };
}

export class Gameplay7CampaignDirector {
  constructor(value = null) {
    this.state = normalizeGameplay7SessionState(value || createGameplay7SessionState());
    this.events = [];
  }

  reset(details = {}) {
    this.state = createGameplay7SessionState(details);
    this.events = [];
    if (this.state.active) {
      this.events.push({
        type: 'GAMEPLAY7_CAMPAIGN_LINKED',
        sector: clone(this.state.presentation.sector),
        campaignPoints: this.state.presentation.campaignPoints
      });
    }
    return this.getSnapshot();
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== GAMEPLAY7_PATCH) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizeGameplay7SessionState(snapshot, now);
    this.events = [];
    return true;
  }

  update(now = Date.now(), {
    profile = null,
    world = null,
    narrative = null,
    replay = null
  } = {}) {
    if (!this.state.active) return this.getSnapshot();
    if (profile) this.state.presentation = getGameplay7CampaignPresentation(profile, this.state.mapId);
    if (this.state.status !== GAMEPLAY7_STATUS.COMPLETE) {
      const contribution = computeGameplay7Contribution({
        runId: this.state.runId,
        mapId: this.state.mapId,
        gameMode: this.state.gameMode,
        world,
        narrative,
        replay,
        profile,
        now
      });
      if (contribution) {
        this.state.contribution = clone(contribution);
        this.state.completionId = contribution.receiptId;
        this.state.completedAt = contribution.completedAt;
        this.state.status = GAMEPLAY7_STATUS.COMPLETE;
        this.events.push({
          type: 'GAMEPLAY7_CAMPAIGN_CONTRIBUTION_READY',
          contribution: clone(contribution),
          sector: clone(this.state.presentation.sector)
        });
      }
    }
    this.state.updatedAt = integer(now, Date.now(), 1);
    return this.getSnapshot();
  }

  getEncounterTuning() {
    const state = this.state.presentation?.sector?.controlState || GAMEPLAY7_CONTROL.CONTESTED;
    return freezeClone({
      patch: GAMEPLAY7_PATCH,
      controlState: state,
      dominantFactionId: this.state.presentation?.sector?.dominantFactionId || '',
      ...(CONTROL_TUNING[state] || CONTROL_TUNING[GAMEPLAY7_CONTROL.CONTESTED])
    });
  }

  consumeEvents() {
    const output = this.events.map(clone);
    this.events = [];
    return output;
  }

  getSnapshot() {
    return freezeClone(normalizeGameplay7SessionState(this.state, this.state.updatedAt));
  }
}

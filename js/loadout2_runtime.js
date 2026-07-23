// LOADOUT.2 R1 — live weapon mastery, operator specialization, and Field Knife runtime.
import {
  LOADOUT2_PATCH,
  LOADOUT2_WEAPON_FAMILIES,
  getLoadout2CombatTuning,
  getLoadout2MasteryPresentation,
  getLoadout2Specialization
} from './loadout2_mastery_core.js';
import {
  getProgressionSnapshot,
  recordProgressionLoadout2MasteryReceipt,
  setProgressionLoadout2Specialization
} from './progression.js';
import { recordRunLoadout2Mastery } from './run_summary.js';

const FAMILY_SET = new Set(LOADOUT2_WEAPON_FAMILIES);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maximum);
}

function familyId(value, fallback = 'PISTOL') {
  const token = cleanText(value, fallback, 32).toUpperCase();
  return FAMILY_SET.has(token) ? token : fallback;
}

function isPvpMode(gameMode) {
  const token = cleanText(gameMode, 'survival', 40).toLowerCase();
  return token === 'pvp' || token.startsWith('pvp-');
}

function createFamilyRunState(family) {
  return {
    familyId: family,
    shots: 0,
    hits: 0,
    kills: 0,
    damage: 0,
    objectives: 0,
    bossKills: 0,
    strikes: 0,
    hitStrikes: 0,
    xp: 0
  };
}

function createRunState() {
  return {
    active: false,
    finalized: false,
    pvpExcluded: false,
    runId: '',
    mapId: 'unknown',
    gameMode: 'survival',
    difficulty: 1,
    selectedSpecializationId: 'FIELD_OPERATIVE',
    startedAt: 0,
    endedAt: 0,
    receiptId: '',
    applied: false,
    idempotent: false,
    unlocked: [],
    totalXp: 0,
    families: Object.fromEntries(LOADOUT2_WEAPON_FAMILIES.map((family) => [
      family,
      createFamilyRunState(family)
    ]))
  };
}

let run = createRunState();

function profile() {
  return getProgressionSnapshot()?.profile?.loadout2 || {};
}

function activeSpecializationId() {
  return cleanText(
    run.selectedSpecializationId
      || profile()?.selectedSpecializationId,
    'FIELD_OPERATIVE',
    48
  ).toUpperCase();
}

function masteryScale(family) {
  return getLoadout2CombatTuning(profile(), family, {
    specializationId: activeSpecializationId(),
    gameMode: run.gameMode
  }).masteryScale || 1;
}

function addXp(family, amount) {
  if (!run.active || run.pvpExcluded) return 0;
  const id = familyId(family);
  const value = integer(amount * masteryScale(id), 0, 0, 10000);
  run.families[id].xp += value;
  run.totalXp += value;
  return value;
}

export function beginLoadout2Run({
  runId = '',
  mapId = 'unknown',
  gameMode = 'survival',
  difficulty = 1,
  loadout = null
} = {}) {
  const progression = getProgressionSnapshot();
  const profileSpecialization = progression?.profile?.loadout2?.selectedSpecializationId
    || 'FIELD_OPERATIVE';
  const selectedSpecializationId = cleanText(
    loadout?.specializationId || profileSpecialization,
    profileSpecialization,
    48
  ).toUpperCase();
  run = createRunState();
  Object.assign(run, {
    active: !isPvpMode(gameMode),
    finalized: false,
    pvpExcluded: isPvpMode(gameMode),
    runId: cleanText(runId, `run-${Date.now().toString(36)}`, 180),
    mapId: cleanText(mapId, 'unknown', 100),
    gameMode: cleanText(gameMode, 'survival', 40).toLowerCase(),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    selectedSpecializationId,
    startedAt: Date.now()
  });
  return getLoadout2RuntimeSnapshot();
}

export function recordLoadout2Shot(family) {
  if (!run.active || run.pvpExcluded) return false;
  const id = familyId(family);
  run.families[id].shots += 1;
  return true;
}

export function recordLoadout2Hit(family, {
  damage = 0,
  killed = false,
  boss = false,
  headshot = false
} = {}) {
  if (!run.active || run.pvpExcluded) return false;
  const id = familyId(family);
  const entry = run.families[id];
  const appliedDamage = integer(damage, 0, 0, 1000000);
  entry.hits += 1;
  entry.damage += appliedDamage;
  if (killed) entry.kills += 1;
  if (boss && killed) entry.bossKills += 1;
  addXp(id, 2 + Math.min(12, Math.floor(appliedDamage / 120)) + (headshot ? 2 : 0) + (killed ? 8 : 0) + (boss && killed ? 70 : 0));
  return true;
}

export function recordLoadout2MeleeStrike({
  hit = false,
  damage = 0,
  killed = false,
  boss = false
} = {}) {
  if (!run.active || run.pvpExcluded) return false;
  const entry = run.families.MELEE;
  entry.strikes += 1;
  if (hit) entry.hitStrikes += 1;
  if (hit) {
    entry.hits += 1;
    entry.damage += integer(damage, 0, 0, 1000000);
  }
  if (killed) entry.kills += 1;
  if (boss && killed) entry.bossKills += 1;
  addXp('MELEE', 1 + (hit ? 5 : 0) + (killed ? 12 : 0) + (boss && killed ? 75 : 0));
  return true;
}

export function recordLoadout2Objective(family = 'PISTOL', amount = 1) {
  if (!run.active || run.pvpExcluded) return false;
  const id = familyId(family);
  const value = integer(amount, 1, 1, 100);
  run.families[id].objectives += value;
  const specialization = activeSpecializationId();
  addXp(id, value * (specialization === 'ENGINEER' ? 38 : (specialization === 'SUPPORT' ? 34 : 28)));
  return true;
}

function buildReceipt() {
  const endgameSnapshot = globalThis.KAGetEndgame1Snapshot?.() || null;
  const endgameMasteryScale = (
    endgameSnapshot?.active === true
    && endgameSnapshot?.pvpExcluded !== true
  ) ? Math.max(1, Math.min(2, Number(endgameSnapshot?.tuning?.masteryScale) || 1)) : 1;
  const families = {};
  LOADOUT2_WEAPON_FAMILIES.forEach((family) => {
    const entry = run.families[family];
    if (
      entry.xp > 0
      || entry.shots > 0
      || entry.hits > 0
      || entry.kills > 0
      || entry.damage > 0
      || entry.objectives > 0
      || entry.bossKills > 0
      || entry.strikes > 0
    ) {
      families[family] = {
        xp: integer(entry.xp * endgameMasteryScale, entry.xp, 0, 100000),
        shots: entry.shots,
        hits: entry.hits,
        kills: entry.kills,
        damage: entry.damage,
        objectives: entry.objectives,
        bossKills: entry.bossKills,
        strikes: entry.strikes
      };
    }
  });
  const scaledTotalXp = Object.values(families).reduce((sum, entry) => sum + integer(entry.xp, 0), 0);
  const specializationPoints = integer(
    scaledTotalXp * 0.28
      + Object.values(run.families).reduce((sum, entry) => sum + entry.objectives * 8 + entry.bossKills * 18, 0),
    0,
    0,
    5000
  );
  return {
    receiptId: `loadout2:${run.runId}:${activeSpecializationId()}`.slice(0, 240),
    runId: run.runId,
    gameMode: run.gameMode,
    specializationId: activeSpecializationId(),
    specializationPoints,
    families,
    endgameTierId: String(endgameSnapshot?.tier?.id || 'NONE').slice(0, 40),
    endgameMasteryScale,
    createdAt: Date.now()
  };
}

export function finalizeLoadout2Run({ reason = 'ENDED' } = {}) {
  if (run.finalized) return getLoadout2RuntimeSnapshot();
  run.active = false;
  run.finalized = true;
  run.endedAt = Date.now();

  if (run.pvpExcluded) {
    recordRunLoadout2Mastery({
      applied: false,
      pvpExcluded: true,
      reason,
      snapshot: getLoadout2RuntimeSnapshot()
    });
    return getLoadout2RuntimeSnapshot();
  }

  const receipt = buildReceipt();
  run.receiptId = receipt.receiptId;
  const result = recordProgressionLoadout2MasteryReceipt(receipt);
  run.applied = result?.applied === true;
  run.idempotent = result?.idempotent === true;
  run.unlocked = Array.isArray(result?.unlocked) ? result.unlocked.map((entry) => ({ ...entry })) : [];
  run.totalXp = integer(result?.totalXp, run.totalXp);

  recordRunLoadout2Mastery({
    applied: run.applied,
    idempotent: run.idempotent,
    pvpExcluded: false,
    receipt,
    result,
    reason,
    snapshot: getLoadout2RuntimeSnapshot()
  });
  return getLoadout2RuntimeSnapshot();
}

export function getLoadout2CombatTuningForFamily(family = 'PISTOL') {
  return getLoadout2CombatTuning(profile(), familyId(family), {
    specializationId: activeSpecializationId(),
    gameMode: run.gameMode || 'survival'
  });
}

export function selectLoadout2Specialization(id) {
  if (run.active) return Object.freeze({ ok: false, reason: 'RUN_ACTIVE', snapshot: getLoadout2RuntimeSnapshot() });
  const result = setProgressionLoadout2Specialization(id);
  return Object.freeze({
    ok: result?.changed === true || result?.profile?.selectedSpecializationId === cleanText(id, '', 48).toUpperCase(),
    changed: result?.changed === true,
    profile: result?.profile || null,
    snapshot: getLoadout2RuntimeSnapshot()
  });
}

export function getLoadout2RuntimeSnapshot() {
  const masteryProfile = profile();
  return Object.freeze({
    patch: LOADOUT2_PATCH,
    active: run.active,
    finalized: run.finalized,
    pvpExcluded: run.pvpExcluded,
    meleeEnabled: !run.pvpExcluded,
    hostAuthoritativeMeleeDamage: true,
    protocolUnchanged: true,
    workerChangeRequired: false,
    runId: run.runId,
    mapId: run.mapId,
    gameMode: run.gameMode,
    selectedSpecializationId: activeSpecializationId(),
    specialization: getLoadout2Specialization(activeSpecializationId()),
    totalXp: run.totalXp,
    receiptId: run.receiptId,
    applied: run.applied,
    idempotent: run.idempotent,
    unlocked: Object.freeze(run.unlocked.map((entry) => Object.freeze({ ...entry }))),
    families: Object.freeze(Object.fromEntries(LOADOUT2_WEAPON_FAMILIES.map((family) => [
      family,
      Object.freeze({ ...run.families[family] })
    ]))),
    mastery: getLoadout2MasteryPresentation(masteryProfile)
  });
}

if (typeof window !== 'undefined') {
  window.KAGetLoadout2Snapshot = getLoadout2RuntimeSnapshot;
  window.KAGetLoadout2CombatTuning = getLoadout2CombatTuningForFamily;
  window.KASelectLoadout2Specialization = selectLoadout2Specialization;
  window.KARecordLoadout2Objective = recordLoadout2Objective;
}

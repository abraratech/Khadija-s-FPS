// js/challenges.js
// C11 — Run challenges plus persistent achievements.

import { awardProgressionXP, recordProgressionChallenge } from './progression.js';

const STORAGE_KEY = 'ka_challenges_v1';
const VERSION = 1;

const RUN_CHALLENGE_DEFS = Object.freeze([
  Object.freeze({ id: 'ELIMINATOR', label: 'Eliminator', description: 'Eliminate 30 enemies.', kind: 'KILLS', target: 30, xp: 100 }),
  Object.freeze({ id: 'SHARPSHOOTER', label: 'Sharpshooter', description: 'Score 10 headshot eliminations.', kind: 'HEADSHOTS', target: 10, xp: 120 }),
  Object.freeze({ id: 'SURVIVOR', label: 'Survivor', description: 'Clear 5 waves.', kind: 'WAVES', target: 5, xp: 150 })
]);

const ACHIEVEMENTS = Object.freeze({
  FIRST_BLOOD: Object.freeze({ label: 'First Blood', description: 'Eliminate your first enemy.', xp: 25, category: 'COMBAT', rarity: 'COMMON', icon: '✦', tone: '#ff6b6b' }),
  HEAD_HUNTER: Object.freeze({ label: 'Head Hunter', description: 'Score 25 headshot kills in one run.', xp: 75, category: 'MASTERY', rarity: 'RARE', icon: '◎', tone: '#7dd3fc' }),
  WAVE_10: Object.freeze({ label: 'Holding the Line', description: 'Reach wave 10.', xp: 100, category: 'SURVIVAL', rarity: 'RARE', icon: '▲', tone: '#fbbf24' }),
  GOLIATH_DOWN: Object.freeze({ label: 'Giant Slayer', description: 'Eliminate a Goliath.', xp: 100, category: 'HUNTER', rarity: 'EPIC', icon: '◆', tone: '#c084fc' }),
  PACKED: Object.freeze({ label: 'Powered Up', description: 'Pack-a-Punch a weapon.', xp: 50, category: 'ARSENAL', rarity: 'COMMON', icon: '⚙', tone: '#34d399' }),
  TIER_III: Object.freeze({ label: 'Maximum Output', description: 'Upgrade a weapon to Tier III.', xp: 125, category: 'ARSENAL', rarity: 'EPIC', icon: '▣', tone: '#fb7185' }),
  CONTRACTOR: Object.freeze({ label: 'Contractor', description: 'Complete a map objective.', xp: 75, category: 'OPERATIONS', rarity: 'RARE', icon: '⌖', tone: '#22d3ee' }),
  PERKED_UP: Object.freeze({ label: 'Perked Up', description: 'Activate all four perks in one run.', xp: 100, category: 'SURVIVAL', rarity: 'EPIC', icon: '✚', tone: '#a3e635' })
});

function defaultPersistent() {
  return { version: VERSION, unlocked: {}, totalUnlocked: 0 };
}

function readPersistent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed?.version === VERSION ? { ...defaultPersistent(), ...parsed } : defaultPersistent();
  } catch {
    return defaultPersistent();
  }
}

let persistent = readPersistent();
const state = {
  active: false,
  challenges: [],
  runHeadshots: 0,
  pendingEvents: [],
  lastEvent: 'IDLE'
};

function savePersistent() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent)); } catch { /* ignore */ }
}

function completeRunChallenge(challenge) {
  if (!challenge || challenge.completed) return;
  challenge.completed = true;
  challenge.progress = challenge.target;
  recordProgressionChallenge();
  awardProgressionXP(challenge.xp, 'CHALLENGE');
  state.pendingEvents.push({ type: 'CHALLENGE', ...challenge });
  state.lastEvent = `${challenge.id} COMPLETE`;
}

function addProgress(kind, amount = 1) {
  for (const challenge of state.challenges) {
    if (challenge.kind !== kind || challenge.completed) continue;
    challenge.progress = Math.min(challenge.target, challenge.progress + Math.max(0, Number(amount) || 0));
    if (challenge.progress >= challenge.target) completeRunChallenge(challenge);
  }
}

function unlockAchievement(id) {
  const def = ACHIEVEMENTS[id];
  if (!def || persistent.unlocked[id]) return false;
  persistent.unlocked[id] = Date.now();
  persistent.totalUnlocked = Object.keys(persistent.unlocked).length;
  savePersistent();
  awardProgressionXP(def.xp, 'ACHIEVEMENT');
  state.pendingEvents.push({ type: 'ACHIEVEMENT', id, ...def });
  state.lastEvent = `${id} UNLOCKED`;
  return true;
}

export function resetChallengesRun() {
  state.active = true;
  state.challenges = RUN_CHALLENGE_DEFS.map((def) => ({ ...def, progress: 0, completed: false }));
  state.runHeadshots = 0;
  state.pendingEvents = [];
  state.lastEvent = 'CHALLENGES READY';
  return getChallengesSnapshot();
}

export function endChallengesRun() {
  state.active = false;
}

export function recordChallengeKill({ headshot = false, enemyType = 'UNKNOWN' } = {}) {
  if (!state.active) return;
  addProgress('KILLS', 1);
  unlockAchievement('FIRST_BLOOD');
  if (headshot) {
    state.runHeadshots++;
    addProgress('HEADSHOTS', 1);
    if (state.runHeadshots >= 25) unlockAchievement('HEAD_HUNTER');
  }
  if (enemyType === 'GOLIATH') unlockAchievement('GOLIATH_DOWN');
}

export function recordChallengeWaveClear(wave = 1) {
  if (!state.active) return;
  addProgress('WAVES', 1);
  if (Number(wave) >= 10) unlockAchievement('WAVE_10');
}

export function recordChallengeWeaponUpgrade(tier = 1) {
  if (!state.active) return;
  unlockAchievement('PACKED');
  if (Number(tier) >= 3) unlockAchievement('TIER_III');
}

export function recordChallengeObjective() {
  if (!state.active) return;
  unlockAchievement('CONTRACTOR');
}

export function recordChallengePerkCount(count = 0) {
  if (!state.active) return;
  if (Number(count) >= 4) unlockAchievement('PERKED_UP');
}

export function consumeChallengeEvents() {
  const events = state.pendingEvents.slice();
  state.pendingEvents.length = 0;
  return events;
}

export function getChallengesSnapshot() {
  return {
    active: state.active,
    challenges: state.challenges.map((entry) => ({ ...entry })),
    runHeadshots: state.runHeadshots,
    achievements: Object.entries(ACHIEVEMENTS).map(([id, def]) => ({
      id,
      ...def,
      unlocked: Boolean(persistent.unlocked[id]),
      unlockedAt: persistent.unlocked[id] || 0
    })),
    totalUnlocked: persistent.totalUnlocked,
    lastEvent: state.lastEvent
  };
}

export function resetPersistentChallenges() {
  persistent = defaultPersistent();
  savePersistent();
  return getChallengesSnapshot();
}

if (typeof window !== 'undefined') {
  window.KAGetChallenges = getChallengesSnapshot;
  window.KAResetChallenges = resetPersistentChallenges;
}

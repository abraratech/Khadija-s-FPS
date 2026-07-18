// PVP.2 R1 — public matchmaking, competitive stats and balance policy.

import { PVP1_MODE } from './pvp1_core.js';

export const PVP2_PATCH = 'pvp2-r2-public-custom-pvp-rooms';
export const PVP2_PRODUCT_VERSION = '1.1.0-pvp2';
export const PVP2_SOURCE_BASELINE_SHA = '014b0cf1921a3df3d8fbc3df9ad3be93e7e4fb0b';
export const PVP2_CERTIFIED_FRONTEND_BASELINE_SHA = '5511d393d7249b5487affa3616716ccb64593e99';
export const PVP2_SCHEMA = 1;
export const PVP2_MODE = PVP1_MODE;
export const PVP2_PUBLIC_MATCHMAKING_ENABLED = true;
export const PVP2_FEATURE_FLAG = 'PVP2_PUBLIC_MATCHMAKING_ENABLED';
export const PVP2_INITIAL_RATING = 1000;
export const PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED = true;
export const PVP2_CUSTOM_ROOM_FEATURE_FLAG = 'PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED';
export const PVP2_CUSTOM_ROOM_TEAM_SIZES = Object.freeze([1, 2]);

export const PVP2_RANK_TIERS = Object.freeze([
  Object.freeze({ id: 'RECRUIT', label: 'Recruit', floor: 100, ceiling: 899, tone: '#94a3b8', emblem: '◇' }),
  Object.freeze({ id: 'BRONZE', label: 'Bronze', floor: 900, ceiling: 1099, tone: '#d08a5b', emblem: '◆' }),
  Object.freeze({ id: 'SILVER', label: 'Silver', floor: 1100, ceiling: 1299, tone: '#cbd5e1', emblem: '✦' }),
  Object.freeze({ id: 'GOLD', label: 'Gold', floor: 1300, ceiling: 1499, tone: '#fbbf24', emblem: '✶' }),
  Object.freeze({ id: 'PLATINUM', label: 'Platinum', floor: 1500, ceiling: 1699, tone: '#67e8f9', emblem: '⬡' }),
  Object.freeze({ id: 'DIAMOND', label: 'Diamond', floor: 1700, ceiling: 1899, tone: '#a78bfa', emblem: '◈' }),
  Object.freeze({ id: 'VANGUARD', label: 'Vanguard', floor: 1900, ceiling: Number.POSITIVE_INFINITY, tone: '#fb7185', emblem: '♛' })
]);

export function pvp2RankPresentation(ratingValue = PVP2_INITIAL_RATING) {
  const rating = Math.max(100, Math.trunc(finite(ratingValue, PVP2_INITIAL_RATING)));
  const tierIndex = Math.max(0, PVP2_RANK_TIERS.findIndex((entry) => rating >= entry.floor && rating <= entry.ceiling));
  const tier = PVP2_RANK_TIERS[tierIndex] || PVP2_RANK_TIERS[0];
  const next = PVP2_RANK_TIERS[tierIndex + 1] || null;
  const span = Number.isFinite(tier.ceiling) ? Math.max(1, tier.ceiling - tier.floor + 1) : 1;
  const progressPercent = next
    ? Math.max(0, Math.min(100, Math.round(((rating - tier.floor) / span) * 100)))
    : 100;
  return Object.freeze({
    id: tier.id,
    label: tier.label,
    tone: tier.tone,
    emblem: tier.emblem,
    floor: tier.floor,
    ceiling: tier.ceiling,
    progressPercent,
    nextLabel: next?.label || 'Maximum Rank',
    nextRating: next?.floor || rating,
    ratingToNext: next ? Math.max(0, next.floor - rating) : 0,
    capped: !next
  });
}

export function normalizePvp2CustomRoomTeamSize(value) {
  return Number(value) >= 2 ? 2 : 1;
}

export function createPvp2CustomRoomPolicy(value = {}) {
  const teamSize = normalizePvp2CustomRoomTeamSize(value.teamSize);
  return Object.freeze({
    gameMode: PVP2_MODE,
    teamSize,
    maxPlayers: teamSize * 2,
    publicListing: true,
    allowLateJoin: false,
    botsAllowed: false,
    ranked: false,
    status: 'waiting'
  });
}

function cleanText(value, fallback = '', limit = 160) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizePvp2QueueMode(value) {
  return String(value || '').trim().toLowerCase() === PVP2_MODE
    ? PVP2_MODE
    : 'coop';
}

export function createPvp2PublicQueuePreferences(value = {}) {
  return Object.freeze({
    mode: PVP2_MODE,
    mapId: cleanText(value.mapId, 'grid_bunker', 80),
    difficulty: 1,
    maxPlayers: 2,
    partySize: 1,
    searchPriority: ['quality', 'balanced', 'fast'].includes(value.searchPriority)
      ? value.searchPriority
      : 'balanced',
    regionPolicy: ['auto', 'regional-only', 'global'].includes(value.regionPolicy)
      ? value.regionPolicy
      : 'auto',
    preferredRegion: cleanText(value.preferredRegion, 'AUTO', 12).toUpperCase(),
    allowBackfill: false,
    joinInProgress: false
  });
}

export function normalizePvp2Stats(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const matchesPlayed = Math.max(0, Math.trunc(finite(source.matchesPlayed)));
  const wins = Math.max(0, Math.trunc(finite(source.wins)));
  const losses = Math.max(0, Math.trunc(finite(source.losses)));
  const eliminations = Math.max(0, Math.trunc(finite(source.eliminations)));
  const deaths = Math.max(0, Math.trunc(finite(source.deaths)));
  return Object.freeze({
    schema: Math.max(1, Math.trunc(finite(source.schema, PVP2_SCHEMA))),
    patch: cleanText(source.patch, PVP2_PATCH, 120),
    playerId: cleanText(source.playerId, '', 160),
    displayName: cleanText(source.displayName, 'Player', 24),
    region: cleanText(source.region, 'ZZ', 16).toUpperCase(),
    matchesPlayed,
    wins,
    losses,
    roundWins: Math.max(0, Math.trunc(finite(source.roundWins))),
    roundLosses: Math.max(0, Math.trunc(finite(source.roundLosses))),
    eliminations,
    deaths,
    damageDealt: Math.max(0, Math.trunc(finite(source.damageDealt))),
    headshots: Math.max(0, Math.trunc(finite(source.headshots))),
    rating: Math.max(100, Math.trunc(finite(source.rating, PVP2_INITIAL_RATING))),
    bestRating: Math.max(100, Math.trunc(finite(source.bestRating, source.rating || PVP2_INITIAL_RATING))),
    winStreak: Math.max(0, Math.trunc(finite(source.winStreak))),
    bestWinStreak: Math.max(0, Math.trunc(finite(source.bestWinStreak))),
    winRate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
    eliminationDeathRatio: deaths > 0 ? eliminations / deaths : eliminations,
    updatedAt: Math.max(0, finite(source.updatedAt))
  });
}

export function normalizePvp2Leaderboard(value = {}) {
  const entries = Array.isArray(value.entries) ? value.entries : [];
  return Object.freeze({
    ok: value.ok === true,
    schema: Math.max(1, Math.trunc(finite(value.schema, PVP2_SCHEMA))),
    patch: cleanText(value.patch, PVP2_PATCH, 120),
    scope: ['regional', 'global'].includes(value.scope) ? value.scope : 'global',
    region: cleanText(value.region, 'ZZ', 16).toUpperCase(),
    entries: Object.freeze(entries.map((entry, index) => Object.freeze({
      rank: Math.max(1, Math.trunc(finite(entry.rank, index + 1))),
      ...normalizePvp2Stats(entry)
    }))),
    refreshedAt: Math.max(0, finite(value.refreshedAt))
  });
}

export function pvp2StatsPresentation(statsValue = {}) {
  const stats = normalizePvp2Stats(statsValue);
  const rank = pvp2RankPresentation(stats.rating);
  const milestones = Object.freeze([
    Object.freeze({ id: 'FIRST_WIN', label: 'First Victory', icon: '✦', unlocked: stats.wins >= 1 }),
    Object.freeze({ id: 'HOT_STREAK', label: 'Hot Streak', icon: '⚡', unlocked: stats.bestWinStreak >= 3 }),
    Object.freeze({ id: 'GOLD_PATH', label: 'Gold Path', icon: '✶', unlocked: stats.bestRating >= 1300 }),
    Object.freeze({ id: 'RELENTLESS', label: 'Relentless', icon: '♛', unlocked: stats.bestWinStreak >= 5 })
  ]);
  return Object.freeze({
    headline: `${rank.label.toUpperCase()} · ${stats.rating}`,
    rating: stats.rating,
    bestRating: stats.bestRating,
    matchesPlayed: stats.matchesPlayed,
    record: `${stats.wins}W · ${stats.losses}L`,
    performance: `${stats.eliminations} ELIMS · ${stats.deaths} DEATHS`,
    streak: stats.winStreak > 0 ? `${stats.winStreak} WIN STREAK` : 'NO ACTIVE STREAK',
    winRateText: `${Math.round(stats.winRate * 100)}% WIN RATE`,
    kdText: `${stats.eliminationDeathRatio.toFixed(2)} E/D`,
    rank,
    milestones
  });
}

// PVP.2 R1 — public matchmaking, competitive stats and balance policy.

import { PVP1_MODE } from './pvp1_core.js';

export const PVP2_PATCH = 'pvp2-r1-public-matchmaking-competitive-stats-balance';
export const PVP2_PRODUCT_VERSION = '1.1.0-pvp2';
export const PVP2_SOURCE_BASELINE_SHA = '014b0cf1921a3df3d8fbc3df9ad3be93e7e4fb0b';
export const PVP2_CERTIFIED_FRONTEND_BASELINE_SHA = '5511d393d7249b5487affa3616716ccb64593e99';
export const PVP2_SCHEMA = 1;
export const PVP2_MODE = PVP1_MODE;
export const PVP2_PUBLIC_MATCHMAKING_ENABLED = true;
export const PVP2_FEATURE_FLAG = 'PVP2_PUBLIC_MATCHMAKING_ENABLED';
export const PVP2_INITIAL_RATING = 1000;

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
  return Object.freeze({
    headline: `RATING ${stats.rating}`,
    record: `${stats.wins}W · ${stats.losses}L`,
    performance: `${stats.eliminations} ELIMS · ${stats.deaths} DEATHS`,
    streak: stats.winStreak > 0 ? `${stats.winStreak} WIN STREAK` : 'NO ACTIVE STREAK',
    winRateText: `${Math.round(stats.winRate * 100)}% WIN RATE`,
    kdText: `${stats.eliminationDeathRatio.toFixed(2)} E/D`
  });
}

// PVP.2 R1 — competitive statistics and leaderboard client.

import { matchmakingEndpoint } from './matchmaking_core.js';
import {
  PVP2_PATCH,
  normalizePvp2Leaderboard,
  normalizePvp2Stats
} from './pvp2_core.js';

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(String(payload?.message || payload?.error || `HTTP_${response.status}`));
  }
  return payload;
}

export class Pvp2CompetitiveClient {
  constructor({ fetchImpl = null, onChange = null } = {}) {
    this.fetchImpl = typeof fetchImpl === 'function'
      ? fetchImpl
      : typeof globalThis.fetch === 'function'
        ? (...args) => globalThis.fetch(...args)
        : null;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.state = Object.freeze({
      patch: PVP2_PATCH,
      status: 'idle',
      stats: normalizePvp2Stats({}),
      leaderboard: normalizePvp2Leaderboard({}),
      error: null,
      refreshedAt: 0
    });
  }

  getSnapshot() {
    return this.state;
  }

  publish(patch = {}) {
    this.state = Object.freeze({ ...this.state, ...patch });
    try {
      this.onChange?.(this.state);
    } catch {
      // Competitive UI observers cannot break multiplayer state.
    }
    return this.state;
  }

  async refresh({ serverUrl, playerId, scope = 'global', region = 'ZZ' } = {}) {
    if (!this.fetchImpl || !serverUrl || !playerId) return this.getSnapshot();
    this.publish({ status: 'loading', error: null });
    try {
      const [statsPayload, boardPayload] = await Promise.all([
        this.fetchImpl(matchmakingEndpoint(serverUrl, '/pvp2/stats', { playerId }), {
          cache: 'no-store', credentials: 'omit'
        }).then(readJson),
        this.fetchImpl(matchmakingEndpoint(serverUrl, '/pvp2/leaderboard', {
          scope,
          region,
          limit: 10
        }), { cache: 'no-store', credentials: 'omit' }).then(readJson)
      ]);
      return this.publish({
        status: 'ready',
        stats: normalizePvp2Stats(statsPayload.stats || {}),
        leaderboard: normalizePvp2Leaderboard(boardPayload),
        error: null,
        refreshedAt: Date.now()
      });
    } catch (error) {
      return this.publish({
        status: 'error',
        error: String(error?.message || error || 'PVP2_STATS_UNAVAILABLE').slice(0, 180)
      });
    }
  }
}

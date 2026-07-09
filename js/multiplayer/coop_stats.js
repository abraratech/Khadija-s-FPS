// js/multiplayer/coop_stats.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import {
  COOP_COUNTER_KEYS,
  COOP_STATS_MESSAGE_KIND,
  CoopStatsCore,
  sanitizeStatsId
} from './coop_stats_core.js';

const LOCAL_REPORT_INTERVAL_MS = 250;
const HOST_SNAPSHOT_INTERVAL_MS = 300;

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function counterFromSummary(summary = {}) {
  const counters = {};
  COOP_COUNTER_KEYS.forEach((key) => {
    counters[key] = Math.max(0, Math.floor(Number(summary[key]) || 0));
  });
  counters.timesDowned = Math.max(
    counters.timesDowned,
    Math.max(0, Math.floor(Number(summary.timesDowned ?? summary.downs) || 0))
  );
  counters.deaths = Math.max(
    counters.deaths,
    Math.max(0, Math.floor(Number(summary.deaths ?? summary.bleedOuts) || 0))
  );
  return counters;
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

export class MultiplayerCoopStatsManager {
  constructor({
    eventBus,
    runtime,
    session,
    players,
    getEconomySnapshot = () => null,
    getReviveSnapshot = () => null,
    getRunSummarySnapshot = () => null,
    getWave = () => 1
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.players = players;
    this.getEconomySnapshot = getEconomySnapshot;
    this.getReviveSnapshot = getReviveSnapshot;
    this.getRunSummarySnapshot = getRunSummarySnapshot;
    this.getWave = getWave;
    this.core = new CoopStatsCore();
    this.active = false;
    this.reportSequence = 0;
    this.snapshotVersion = 0;
    this.lastReportAt = -Infinity;
    this.lastSnapshotAt = -Infinity;
    this.lastSnapshot = null;
    this.finalSummary = null;
    this.closedFinalRunId = null;
    this.metrics = {
      reportsSent: 0,
      reportsAccepted: 0,
      reportsRejected: 0,
      snapshotsSent: 0,
      snapshotsReceived: 0,
      finalsSent: 0,
      finalsReceived: 0
    };
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_RUN_STATS_RECEIVED,
        (event) => this.handleStatsEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
        (event) => this.handleRoomState(event?.payload?.room)
      ) || (() => {})
    );
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  isAuthority() {
    return this.session?.mode === 'host';
  }

  beginRun() {
    const run = this.session?.run || {};
    this.active = this.isOnlineRun();
    this.reportSequence = 0;
    this.snapshotVersion = 0;
    this.lastReportAt = -Infinity;
    this.lastSnapshotAt = -Infinity;
    this.closedFinalRunId = null;
    this.finalSummary = null;
    this.core.reset({
      runId: run.runId,
      authorityEpoch: this.runtime?.authorityEpoch || run.authorityEpoch || 0,
      mapId: run.mapId || 'grid_bunker',
      difficulty: run.difficulty || 1,
      startedAt: nowMs()
    });
    this.applyHostSources(nowMs());
    this.lastSnapshot = this.core.getSnapshot(nowMs());
    if (this.active && this.isAuthority()) this.publishSnapshot(true);
  }

  endRun({ preserveFinal = true } = {}) {
    this.active = false;
    this.lastReportAt = -Infinity;
    this.lastSnapshotAt = -Infinity;
    if (!preserveFinal) {
      this.finalSummary = null;
      this.lastSnapshot = null;
      this.core.reset();
    }
  }

  clearFinalSummary() {
    this.finalSummary = null;
    this.closedFinalRunId = null;
    if (this.lastSnapshot) this.lastSnapshot.finalSummary = null;
  }

  closeFinalSummary() {
    this.closedFinalRunId = this.finalSummary?.runId || this.lastSnapshot?.runId || null;
  }

  shouldShowFinalSummary() {
    return Boolean(
      this.finalSummary
      && this.finalSummary.runId !== this.closedFinalRunId
    );
  }

  localReport(now = nowMs()) {
    if (!this.active || !this.isOnlineRun()) return null;
    if (now - this.lastReportAt < LOCAL_REPORT_INTERVAL_MS) return null;
    const localPlayerId = this.runtime?.localPlayerId;
    if (!localPlayerId) return null;
    const summary = this.getRunSummarySnapshot?.() || {};
    this.reportSequence += 1;
    const report = {
      kind: COOP_STATS_MESSAGE_KIND.REPORT,
      reportId: `${localPlayerId}:stats:${this.reportSequence}`,
      playerId: localPlayerId,
      displayName:
        this.players?.getLocalPlayerSnapshot?.()?.displayName
        || this.runtime?.room?.getSnapshot?.()?.players?.find((entry) => entry?.playerId === localPlayerId)?.displayName
        || 'Player',
      sequence: this.reportSequence,
      counters: counterFromSummary(summary),
      clientTime: now
    };
    this.lastReportAt = now;
    if (this.isAuthority()) {
      const result = this.core.applyLocalReport(report, {
        playerId: localPlayerId,
        authorityEpoch: this.runtime?.authorityEpoch || 0,
        now
      });
      if (result.accepted) this.metrics.reportsAccepted += 1;
      else this.metrics.reportsRejected += 1;
      return report;
    }
    this.runtime?.sendRunStats?.(report);
    this.metrics.reportsSent += 1;
    return report;
  }

  applyHostSources(now = nowMs()) {
    const room = this.runtime?.room?.getSnapshot?.() || {};
    this.core.applyRoom(room, now);
    this.core.updateMeta({
      wave: this.getWave?.() || 1,
      mapId: this.session?.run?.mapId || room.settings?.mapId,
      difficulty: this.session?.run?.difficulty ?? room.settings?.difficulty,
      authorityEpoch: this.runtime?.authorityEpoch || room.authorityEpoch
    });
    const economy = this.getEconomySnapshot?.() || null;
    if (economy?.accounts) this.core.applyEconomySnapshot(economy);
    const revive = this.getReviveSnapshot?.() || null;
    if (revive?.state) this.core.applyReviveSnapshot(revive.state, now);
    const localId = this.runtime?.localPlayerId;
    const local = localId ? this.core.ensurePlayer(localId) : null;
    const network = this.runtime?.getNetworkQualitySnapshot?.(Date.now()) || {};
    if (local) local.networkRttMs = Number.isFinite(Number(network.rttMs))
      ? Math.round(Number(network.rttMs))
      : null;
  }

  publishSnapshot(force = false, now = nowMs()) {
    if (!this.active || !this.isAuthority()) return null;
    if (!force && now - this.lastSnapshotAt < HOST_SNAPSHOT_INTERVAL_MS) return null;
    this.applyHostSources(now);
    this.lastSnapshotAt = now;
    this.snapshotVersion += 1;
    this.lastSnapshot = this.core.getSnapshot(now);
    this.runtime?.sendRunStats?.({
      kind: COOP_STATS_MESSAGE_KIND.SNAPSHOT,
      snapshot: this.lastSnapshot
    });
    this.metrics.snapshotsSent += 1;
    return this.lastSnapshot;
  }

  update(now = nowMs()) {
    if (!this.active || !this.isOnlineRun()) return;
    this.localReport(now);
    if (this.isAuthority()) {
      this.publishSnapshot(false, now);
    }
  }

  handleStatsEnvelope(envelope) {
    if (!envelope?.payload) return;
    const payload = envelope.payload;
    if (envelope.runId && this.session?.run?.runId && envelope.runId !== this.session.run.runId) {
      return;
    }

    if (payload.kind === COOP_STATS_MESSAGE_KIND.REPORT) {
      if (!this.active || !this.isAuthority()) return;
      const result = this.core.applyLocalReport(payload, {
        playerId: envelope.playerId,
        authorityEpoch: envelope.authorityEpoch,
        now: nowMs()
      });
      if (result.accepted) this.metrics.reportsAccepted += 1;
      else this.metrics.reportsRejected += 1;
      return;
    }

    const expectedHost = this.runtime?.room?.hostPlayerId || this.session?.hostPlayerId || null;
    if (expectedHost && envelope.playerId !== expectedHost) return;

    if (payload.kind === COOP_STATS_MESSAGE_KIND.SNAPSHOT && payload.snapshot) {
      if (this.isAuthority()) return;
      this.core.replaceSnapshot(payload.snapshot);
      this.lastSnapshot = clone(payload.snapshot);
      if (payload.snapshot.finalSummary) {
        this.finalSummary = clone(payload.snapshot.finalSummary);
      }
      this.metrics.snapshotsReceived += 1;
      return;
    }

    if (payload.kind === COOP_STATS_MESSAGE_KIND.FINAL && payload.summary) {
      this.core.restoreFinal(payload.summary);
      this.finalSummary = clone(payload.summary);
      if (this.lastSnapshot) this.lastSnapshot.finalSummary = clone(payload.summary);
      this.metrics.finalsReceived += 1;
    }
  }

  handleRoomState(room = null) {
    if (!room) return false;
    const now = nowMs();
    this.core.applyRoom(room, now);
    if (room.status === 'in-run' && !room.finalSummary) {
      this.finalSummary = null;
      this.closedFinalRunId = null;
      if (this.lastSnapshot) this.lastSnapshot.finalSummary = null;
    }
    if (room.finalSummary) {
      this.core.restoreFinal(room.finalSummary);
      this.finalSummary = clone(room.finalSummary);
      this.lastSnapshot = this.core.getSnapshot(now);
      this.lastSnapshot.finalSummary = clone(room.finalSummary);
    } else if (this.active) {
      this.lastSnapshot = this.core.getSnapshot(now);
    }
    return true;
  }

  finalizeRun(reason = 'ended', {
    now = nowMs(),
    forceLocal = false
  } = {}) {
    if (!this.isAuthority() && !forceLocal) return this.finalSummary;
    this.applyHostSources(now);
    const summary = this.core.finalize({
      reason,
      now,
      wave: this.getWave?.() || 1
    });
    this.finalSummary = clone(summary);
    this.lastSnapshot = this.core.getSnapshot(now);
    this.lastSnapshot.finalSummary = this.finalSummary;
    if (this.active && this.isAuthority()) {
      this.runtime?.sendRunStats?.({
        kind: COOP_STATS_MESSAGE_KIND.FINAL,
        summary: this.finalSummary
      });
      this.metrics.finalsSent += 1;
      this.publishSnapshot(true, now);
    }
    return this.finalSummary;
  }

  handleHostMigration({
    authorityEpoch = 0,
    checkpoint = null,
    becameHost = false
  } = {}) {
    this.core.authorityEpoch = Math.max(
      this.core.authorityEpoch,
      Math.max(0, Math.floor(Number(authorityEpoch) || 0))
    );
    const stats = checkpoint?.stats || null;
    if (stats) {
      this.core.replaceSnapshot(stats);
      this.lastSnapshot = clone(stats);
      if (stats.finalSummary) this.finalSummary = clone(stats.finalSummary);
    }
    if (checkpoint?.finalSummary) {
      this.core.restoreFinal(checkpoint.finalSummary);
      this.finalSummary = clone(checkpoint.finalSummary);
    }
    if (becameHost && this.active) {
      this.applyHostSources(nowMs());
      this.publishSnapshot(true);
    }
    return true;
  }

  recordReviveEvent(event = {}) {
    if (!this.active || !this.isAuthority()) return false;
    if (event.type !== 'REVIVED' || !event.reviverId) return false;
    return this.core.recordReviveCompleted(
      event.reviverId,
      event.eventId || `${event.reviverId}:${event.playerId}:${event.at || nowMs()}`
    );
  }

  getCheckpointSnapshot(now = nowMs()) {
    if (!this.lastSnapshot && this.active) this.lastSnapshot = this.core.getSnapshot(now);
    return this.lastSnapshot ? clone(this.lastSnapshot) : null;
  }

  getSnapshot(now = nowMs()) {
    const snapshot = this.lastSnapshot || this.core.getSnapshot(now);
    return {
      active: this.active,
      authority: this.isAuthority(),
      snapshot: clone(snapshot),
      finalSummary: clone(this.finalSummary || snapshot.finalSummary),
      showFinalSummary: this.shouldShowFinalSummary(),
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.endRun({ preserveFinal: false });
  }
}

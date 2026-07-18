// js/multiplayer/economy.js

import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js'; import { getLateJoinCatchUpScore } from './coop_scaling_core.js';
import { getEconomyBalanceSnapshot, scaleEconomyReward } from '../economy_balance.js';
import {
  MPNET1_MAX_TRANSACTION_RESULTS,
  MPNET1_TRANSACTION_RETENTION_MS,
  evaluateEmergencyResupply,
  normalizeEmergencyState,
  normalizeTransactionResult,
  pruneTransactionResults
} from './mpnet1_core.js';

const SNAPSHOT_INTERVAL_MS = 220;
const REQUEST_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_PROCESSED_REQUESTS = 512;
const PENDING_REQUEST_RETRY_MS = Object.freeze([1200, 2800, 5200, 9000]);
const TRANSACTION_RESEND_INTERVAL_MS = 900;
const EMERGENCY_POLL_INTERVAL_MS = 900;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function cleanId(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).slice(0, 160);
}

function normalizeScore(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeKills(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function makeRequestId(playerId, sequence) {
  return `${playerId || 'player'}:economy:${sequence}:${Date.now().toString(36)}`;
}

function cloneProfile(profile) {
  return {
    weapons: Array.from(profile?.weapons || ['PISTOL']),
    perks: Array.from(profile?.perks || []),
    upgrades: { ...(profile?.upgrades || {}) }
  };
}

function makeAccount({ score = 0, kills = 0, emergencyResupply = null } = {}) {
  return {
    score: normalizeScore(score),
    kills: normalizeKills(kills),
    emergencyResupply: normalizeEmergencyState(emergencyResupply),
    profile: {
      weapons: new Set(['PISTOL']),
      perks: new Set(),
      upgrades: {}
    }
  };
}

function makeAccountFromSnapshot(entry = {}) {
  const account = makeAccount({
    score: entry.score,
    kills: entry.kills,
    emergencyResupply: entry.emergencyResupply
  });
  account.profile.weapons = new Set(entry.profile?.weapons || ['PISTOL']);
  account.profile.perks = new Set(entry.profile?.perks || []);
  account.profile.upgrades = { ...(entry.profile?.upgrades || {}) };
  return account;
}

export class MultiplayerEconomyManager {
  constructor({
    eventBus,
    runtime,
    session,
    players,
    player,
    adapter
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.players = players;
    this.player = player;
    this.adapter = adapter || {};
    this.active = false;
    this.worldReady = false;
    this.accounts = new Map();
    this.processedRequests = new Set();
    this.requestWindows = new Map();
    this.requestSequence = 0;
    this.pendingRequests = new Map();
    this.transactionResults = new Map();
    this.transactionOrder = [];
    this.appliedResultIds = new Set();
    this.lastEmergencyPollAt = -Infinity;
    this.snapshotVersion = 0;
    this.lastSnapshotAt = -Infinity;
    this.snapshotDirty = false;
    this.latestSnapshot = null;
    this.authorityEpoch = 0;
    this.unsubscribe = [];
    this.metrics = {
      requestsSent: 0,
      requestsAccepted: 0,
      requestsRejected: 0,
      snapshotsSent: 0,
      snapshotsReceived: 0,
      combatAwards: 0,
      lateJoinGrants: 0,
      transactionRetries: 0,
      transactionReplays: 0,
      transactionAcks: 0,
      emergencyResupplies: 0
    };

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_REQUEST_RECEIVED,
        (event) => this.handleRemoteRequest(event?.payload?.envelope)
      ) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_RESULT_RECEIVED,
        (event) => this.handleRemoteResult(event?.payload?.envelope)
      ) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_SNAPSHOT_RECEIVED,
        (event) => this.handleRemoteSnapshot(event?.payload?.envelope)
      ) || (() => {})
    );
  }

  isOnline() {
    return this.session?.mode === 'host' || this.session?.mode === 'client';
  }

  isAuthority() {
    return this.session?.mode !== 'client';
  }

  beginRun() {
    this.active = true;
    this.worldReady = false;
    this.accounts.clear();
    this.processedRequests.clear();
    this.requestWindows.clear();
    this.requestSequence = 0;
    this.pendingRequests.clear();
    this.transactionResults.clear();
    this.transactionOrder.length = 0;
    this.appliedResultIds.clear();
    this.lastEmergencyPollAt = -Infinity;
    this.snapshotVersion = 0;
    this.lastSnapshotAt = -Infinity;
    this.snapshotDirty = true;
    this.latestSnapshot = null;
    this.authorityEpoch = Math.max(0, Number(this.runtime?.authorityEpoch) || 0);

    const localPlayerId = this.runtime?.localPlayerId;
    if (localPlayerId) {
      this.accounts.set(localPlayerId, makeAccount({
        score: this.player?.score,
        kills: this.player?.kills
      }));
    }

    if (this.isAuthority()) {
      this.ensureRoomAccounts();
    }
  }

  initializeWorld() {
    if (!this.active || this.worldReady) return;
    this.worldReady = true;
    this.adapter.prepareMultiplayerWorld?.();
    this.snapshotDirty = true;

    if (this.isAuthority()) {
      this.sendSnapshot(true);
    }
  }

  endRun() {
    this.active = false;
    this.worldReady = false;
    this.accounts.clear();
    this.processedRequests.clear();
    this.requestWindows.clear();
    this.pendingRequests.clear();
    this.transactionResults.clear();
    this.transactionOrder.length = 0;
    this.appliedResultIds.clear();
    this.adapter.endMultiplayerEconomy?.();
  }

  ensureRoomAccounts() {
    const room = this.runtime?.room?.getSnapshot?.() || {};
    const roomPlayers = room.players || [];
    roomPlayers.forEach((roomPlayer) => {
      if (!roomPlayer?.playerId || this.accounts.has(roomPlayer.playerId)) {
        return;
      }

      const catchUpScore = (
        room.status === 'in-run'
        && roomPlayer.lateJoin === true
      )
        ? normalizeScore(scaleEconomyReward(
            roomPlayer.catchUpScore
            || getLateJoinCatchUpScore(roomPlayer.joinedWave || 1),
            'LATE_JOIN_CATCH_UP'
          ))
        : 0;

      const account = makeAccount({ score: catchUpScore });
      this.accounts.set(roomPlayer.playerId, account);

      if (catchUpScore > 0) {
        this.metrics.lateJoinGrants += 1;
        this.snapshotDirty = true;
        this.deliverResult({
          kind: 'late-join-catch-up',
          targetPlayerId: cleanId(roomPlayer.playerId),
          accepted: true,
          pointsAwarded: catchUpScore,
          score: account.score,
          kills: account.kills,
          label: 'LATE JOIN CATCH-UP'
        });
      }
    });
  }

  ensureAccount(playerId) {
    const id = cleanId(playerId);
    if (!id) return null;
    if (!this.accounts.has(id)) this.accounts.set(id, makeAccount());
    return this.accounts.get(id);
  }

  replaceAccountsFromSnapshot(snapshot) {
    if (!Array.isArray(snapshot?.players)) return false;
    const next = new Map();
    snapshot.players.forEach((entry) => {
      const playerId = cleanId(entry?.playerId);
      if (!playerId) return;
      next.set(playerId, makeAccountFromSnapshot(entry));
    });
    this.accounts.clear();
    next.forEach((account, playerId) => this.accounts.set(playerId, account));
    return true;
  }

  update(now = nowMs()) {
    if (!this.active || !this.worldReady) return;

    const wallNow = Date.now();
    this.pollPendingRequests(wallNow);
    this.pollEmergencyResupply(wallNow);

    if (!this.isAuthority()) return;
    this.ensureRoomAccounts();
    this.pruneTransactionLedger(wallNow);
    this.resendUnacknowledgedTransactions(wallNow);

    const localId = this.runtime?.localPlayerId;
    const localAccount = localId ? this.ensureAccount(localId) : null;
    if (localAccount && this.player) {
      localAccount.score = normalizeScore(this.player.score);
      localAccount.kills = normalizeKills(this.player.kills);
    }

    if (
      this.snapshotDirty
      || now - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS
    ) {
      this.sendSnapshot(this.snapshotDirty);
    }
  }

  getLocalAccountSnapshot() {
    const account = this.accounts.get(this.runtime?.localPlayerId);
    if (!account) return null;
    return {
      score: account.score,
      kills: account.kills,
      emergencyResupply: normalizeEmergencyState(account.emergencyResupply),
      profile: cloneProfile(account.profile)
    };
  }

  requestInteraction(request = {}) {
    if (!this.active || !this.worldReady || !this.isOnline()) return false;

    this.requestSequence += 1;
    const localPlayerId = this.runtime?.localPlayerId;
    const requestId = cleanId(
      request.requestId,
      makeRequestId(localPlayerId, this.requestSequence)
    );
    const payload = {
      ...request,
      requestId,
      actor: this.adapter.getLocalPurchaseState?.() || {}
    };

    this.pendingRequests.set(requestId, {
      requestId,
      payload,
      createdAt: Date.now(),
      nextRetryAt: Date.now() + PENDING_REQUEST_RETRY_MS[0],
      retryIndex: 0
    });
    this.metrics.requestsSent += 1;

    if (this.isAuthority()) {
      this.processAuthorityRequest({
        playerId: localPlayerId,
        runId: this.session?.run?.runId || null,
        payload
      });
      return true;
    }

    return Boolean(this.runtime?.sendEconomyRequest?.(payload));
  }

  awardCombat({
    playerId,
    points = 0,
    kills = 0,
    label = '',
    headshot = false
  } = {}) {
    if (!this.active || !this.isAuthority()) return false;

    const account = this.ensureAccount(playerId);
    if (!account) return false;

    const awardedPoints = normalizeScore(points);
    const awardedKills = normalizeKills(kills);
    if (awardedPoints <= 0 && awardedKills <= 0) return false;

    account.score += awardedPoints;
    account.kills += awardedKills;
    this.metrics.combatAwards += 1;

    const result = {
      kind: 'combat-award',
      targetPlayerId: cleanId(playerId),
      accepted: true,
      pointsAwarded: awardedPoints,
      killsAwarded: awardedKills,
      score: account.score,
      kills: account.kills,
      label: String(label || '').slice(0, 80),
      headshot: headshot === true
    };

    this.deliverResult(result);
    this.snapshotDirty = true;
    return true;
  }

  refundPlayer(playerId, points, label = 'REFUND') {
    if (!this.active || !this.isAuthority()) return false;
    const account = this.ensureAccount(playerId);
    if (!account) return false;

    const refund = normalizeScore(points);
    if (refund <= 0) return false;

    account.score += refund;
    this.deliverResult({
      kind: 'refund',
      targetPlayerId: cleanId(playerId),
      accepted: true,
      pointsAwarded: refund,
      score: account.score,
      kills: account.kills,
      label: String(label || 'REFUND').slice(0, 80)
    });
    this.snapshotDirty = true;
    return true;
  }

  handleRemoteRequest(envelope) {
    if (!this.active || !this.isAuthority()) return;
    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;
    this.processAuthorityRequest(envelope);
  }

  processAuthorityRequest(envelope) {
    const playerId = cleanId(envelope?.playerId);
    const request = envelope?.payload || {};
    const requestId = cleanId(request.requestId);

    if (!playerId || !requestId) return;

    if (request.kind === 'transaction-ack') {
      this.acknowledgeTransaction(request.transactionId, playerId);
      return;
    }

    if (this.processedRequests.has(requestId)) {
      const cached = this.transactionResults.get(requestId)?.result || null;
      if (cached) {
        this.metrics.transactionReplays += 1;
        this.deliverResult(cached, { replay: true });
      }
      return;
    }
    this.rememberProcessedRequest(requestId);

    if (!this.allowRequest(playerId)) {
      this.rejectRequest(playerId, requestId, 'TOO MANY INTERACTIONS');
      return;
    }

    const account = this.ensureAccount(playerId);
    const sampledPlayerState = playerId === this.runtime?.localPlayerId
      ? this.adapter.getLocalPurchaseState?.() || {}
      : this.runtime?.sampleRemotePlayer?.(playerId, nowMs())?.state || {};
    const playerState = {
      ...(request.actor && typeof request.actor === 'object' ? request.actor : {}),
      ...sampledPlayerState
    };

    const context = {
      playerId,
      account,
      balance: account?.score || 0,
      playerState,
      request,
      now: Date.now()
    };

    const validation = this.adapter.validateMultiplayerInteraction?.(
      request,
      context
    ) || { ok: false, reason: 'INTERACTION NOT SUPPORTED' };

    const cost = normalizeScore(validation.cost);
    if (!validation.ok) {
      this.rejectRequest(
        playerId,
        requestId,
        validation.reason || 'INTERACTION REJECTED',
        validation.feedback
      );
      return;
    }

    if (cost > account.score) {
      this.rejectRequest(
        playerId,
        requestId,
        'NOT ENOUGH POINTS',
        {
          title: 'NOT ENOUGH POINTS',
          body: `${cost} required · ${account.score} available`,
          tone: 'warning'
        }
      );
      return;
    }

    const committed = this.adapter.commitMultiplayerInteraction?.(
      request,
      validation,
      context
    ) || { ok: false, reason: 'INTERACTION COMMIT FAILED' };

    if (!committed.ok) {
      this.rejectRequest(
        playerId,
        requestId,
        committed.reason || 'INTERACTION FAILED',
        committed.feedback
      );
      return;
    }

    const grant = committed.grant || validation.grant || null;
    let authoritativeState = null;
    if (grant?.type === 'health') {
      const resourceCommit = this.adapter.commitAuthorityResourceGrant?.({
        playerId,
        requestId,
        grant,
        context,
        now: Date.now()
      }) || { ok: false, reason: 'HEALTH AUTHORITY UNAVAILABLE' };
      if (resourceCommit.ok !== true) {
        this.rejectRequest(
          playerId,
          requestId,
          resourceCommit.reason || 'HEALTH RESTORE FAILED',
          resourceCommit.feedback || null
        );
        return;
      }
      authoritativeState = resourceCommit.state || null;
    }

    const reward = normalizeScore(committed.reward ?? validation.reward);
    account.score = Math.max(0, account.score - cost + reward);
    this.applyProfilePatch(account.profile, committed.profilePatch);

    const result = {
      kind: 'interaction-result',
      requestId,
      targetPlayerId: playerId,
      accepted: true,
      interactionKind: cleanId(request.kind, 'unknown'),
      cost,
      reward,
      score: account.score,
      kills: account.kills,
      grant,
      authoritativeState,
      feedback: committed.feedback || validation.feedback || null,
      committedAt: Date.now()
    };

    this.metrics.requestsAccepted += 1;
    if (request.kind === 'emergency-resupply') {
      this.metrics.emergencyResupplies += 1;
    }
    this.rememberTransactionResult(result);
    this.deliverResult(result);
    this.snapshotDirty = true;
    this.sendSnapshot(true);
  }

  rejectRequest(playerId, requestId, reason, feedback = null) {
    const account = this.ensureAccount(playerId);
    this.metrics.requestsRejected += 1;
    const result = {
      kind: 'interaction-result',
      requestId,
      targetPlayerId: playerId,
      accepted: false,
      reason: String(reason || 'REJECTED').slice(0, 120),
      score: account?.score || 0,
      kills: account?.kills || 0,
      feedback,
      committedAt: Date.now()
    };
    this.rememberTransactionResult(result);
    this.deliverResult(result);
  }

  deliverResult(result, { replay = false } = {}) {
    if (result.targetPlayerId === this.runtime?.localPlayerId) {
      this.applyLocalResult(result);
      const record = result.requestId
        ? this.transactionResults.get(result.requestId)
        : null;
      if (record) record.acknowledged = true;
      return;
    }
    const sent = this.runtime?.sendEconomyResult?.(result);
    const record = result.requestId
      ? this.transactionResults.get(result.requestId)
      : null;
    if (record) {
      record.lastSentAt = Date.now();
      record.sendCount = Math.max(0, Number(record.sendCount) || 0) + 1;
      if (replay) record.replayed = true;
    }
    return sent;
  }

  handleRemoteResult(envelope) {
    if (!this.active || this.isAuthority()) return;
    const expectedHost = this.runtime?.room?.hostPlayerId
      || this.session?.hostPlayerId
      || null;
    if (expectedHost && envelope?.playerId !== expectedHost) return;
    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;

    const result = envelope?.payload;
    if (result?.targetPlayerId !== this.runtime?.localPlayerId) return;
    this.applyLocalResult(result);
  }

  applyLocalResult(result) {
    if (!result || result.targetPlayerId !== this.runtime?.localPlayerId) return;

    const requestId = cleanId(result.requestId);
    const alreadyApplied = Boolean(
      requestId && this.appliedResultIds.has(requestId)
    );

    if (this.player) {
      this.player.score = normalizeScore(result.score);
      this.player.kills = normalizeKills(result.kills);
    }
    this.adapter.applyLocalEconomyState?.({
      score: normalizeScore(result.score),
      kills: normalizeKills(result.kills)
    });

    if (!alreadyApplied) {
      if (requestId) this.appliedResultIds.add(requestId);
      this.adapter.applyMultiplayerInteractionResult?.(result);
    }

    if (requestId) {
      this.pendingRequests.delete(requestId);
      this.sendTransactionAck(requestId);
    }
  }

  sendSnapshot(force = false) {
    if (!this.active || !this.worldReady || !this.isAuthority()) return null;

    const now = nowMs();
    if (!force && now - this.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return null;

    this.ensureRoomAccounts();
    this.snapshotVersion += 1;
    this.lastSnapshotAt = now;
    this.snapshotDirty = false;

    const players = Array.from(this.accounts.entries(), ([playerId, account]) => ({
      playerId,
      score: account.score,
      kills: account.kills,
      emergencyResupply: normalizeEmergencyState(account.emergencyResupply),
      profile: cloneProfile(account.profile)
    }));

    const snapshot = {
      version: this.snapshotVersion,
      authorityEpoch: this.authorityEpoch,
      processedRequestIds: Array.from(this.processedRequests).slice(-256),
      transactionResults: this.getTransactionSnapshot(Date.now()),
      players,
      world: this.adapter.buildMultiplayerWorldState?.() || null,
      economyBalance: getEconomyBalanceSnapshot()
    };
    this.latestSnapshot = JSON.parse(JSON.stringify(snapshot));

    this.metrics.snapshotsSent += 1;
    return this.runtime?.sendEconomySnapshot?.(snapshot);
  }

  handleRemoteSnapshot(envelope) {
    if (!this.active || this.isAuthority()) return;

    const expectedHost = this.runtime?.room?.hostPlayerId
      || this.session?.hostPlayerId
      || null;
    if (expectedHost && envelope?.playerId !== expectedHost) return;
    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;

    const snapshot = envelope?.payload;
    if (!snapshot || !Array.isArray(snapshot.players)) return;

    this.metrics.snapshotsReceived += 1;
    this.latestSnapshot = JSON.parse(JSON.stringify(snapshot));
    this.replaceAccountsFromSnapshot(snapshot);
    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(envelope?.authorityEpoch ?? snapshot.authorityEpoch) || 0
    );
    this.snapshotVersion = Math.max(
      this.snapshotVersion,
      Number(snapshot.version) || 0
    );

    const local = snapshot.players.find(
      (entry) => entry?.playerId === this.runtime?.localPlayerId
    );

    if (local) {
      if (this.player) {
        this.player.score = normalizeScore(local.score);
        this.player.kills = normalizeKills(local.kills);
      }
      this.adapter.applyLocalEconomyState?.({
        score: normalizeScore(local.score),
        kills: normalizeKills(local.kills)
      });
      this.adapter.applyMultiplayerProfile?.(local.profile || {});
    }

    this.adapter.applyMultiplayerWorldState?.(snapshot.world || {});
    this.replaySnapshotTransactions(snapshot);
  }

  applyMigrationCheckpoint(checkpoint = null, {
    becameHost = this.isAuthority()
  } = {}) {
    const snapshot = checkpoint?.economy || this.latestSnapshot;
    if (!snapshot || !Array.isArray(snapshot.players)) return false;

    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(checkpoint?.authorityEpoch ?? snapshot.authorityEpoch) || 0
    );
    this.latestSnapshot = JSON.parse(JSON.stringify(snapshot));
    if (!this.worldReady) {
      this.adapter.prepareMultiplayerWorld?.();
      this.worldReady = true;
    }
    this.snapshotVersion = Math.max(
      this.snapshotVersion,
      Number(snapshot.version) || 0
    );

    this.replaceAccountsFromSnapshot(snapshot);
    if (becameHost) {
      this.processedRequests = new Set(
        Array.isArray(snapshot.processedRequestIds)
          ? snapshot.processedRequestIds.slice(-256)
          : []
      );
      this.ensureRoomAccounts();
      this.snapshotDirty = true;
    }

    const local = snapshot.players.find(
      (entry) => entry?.playerId === this.runtime?.localPlayerId
    );
    if (local) {
      if (this.player) {
        this.player.score = normalizeScore(local.score);
        this.player.kills = normalizeKills(local.kills);
      }
      this.adapter.applyLocalEconomyState?.({
        score: normalizeScore(local.score),
        kills: normalizeKills(local.kills)
      });
      this.adapter.applyMultiplayerProfile?.(local.profile || {});
    }
    this.adapter.applyMultiplayerWorldState?.(snapshot.world || {});
    this.replaySnapshotTransactions(snapshot);

    if (becameHost) {
      this.restoreTransactionLedger(snapshot.transactionResults || []);
      this.sendSnapshot(true);
    }
    return true;
  }

  handleHostMigration({
    authorityEpoch = 0,
    checkpoint = null,
    becameHost = false
  } = {}) {
    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(authorityEpoch) || 0
    );
    if (!this.active) return false;
    return this.applyMigrationCheckpoint(checkpoint, { becameHost });
  }

  rememberTransactionResult(result) {
    const normalized = normalizeTransactionResult(result, Date.now());
    if (!normalized) return null;
    const existing = this.transactionResults.get(normalized.requestId);
    const record = existing || {
      result: normalized,
      acknowledged: false,
      lastSentAt: 0,
      sendCount: 0,
      replayed: false
    };
    record.result = normalized;
    this.transactionResults.set(normalized.requestId, record);
    if (!existing) this.transactionOrder.push(normalized.requestId);
    this.pruneTransactionLedger(Date.now());
    return record;
  }

  restoreTransactionLedger(values = []) {
    pruneTransactionResults(values, { now: Date.now() }).forEach((result) => {
      this.rememberTransactionResult(result);
    });
  }

  getTransactionSnapshot(now = Date.now()) {
    return pruneTransactionResults(
      this.transactionOrder
        .map((requestId) => this.transactionResults.get(requestId)?.result)
        .filter(Boolean),
      {
        now,
        maxRecords: MPNET1_MAX_TRANSACTION_RESULTS,
        retentionMs: MPNET1_TRANSACTION_RETENTION_MS
      }
    );
  }

  pruneTransactionLedger(now = Date.now()) {
    const retained = this.getTransactionSnapshot(now);
    const retainedIds = new Set(retained.map((entry) => entry.requestId));
    this.transactionOrder = this.transactionOrder.filter((requestId) => retainedIds.has(requestId));
    Array.from(this.transactionResults.keys()).forEach((requestId) => {
      if (!retainedIds.has(requestId)) this.transactionResults.delete(requestId);
    });
  }

  acknowledgeTransaction(transactionId, playerId) {
    const id = cleanId(transactionId);
    const record = id ? this.transactionResults.get(id) : null;
    if (!record || record.result.targetPlayerId !== cleanId(playerId)) return false;
    record.acknowledged = true;
    this.metrics.transactionAcks += 1;
    return true;
  }

  sendTransactionAck(transactionId) {
    if (!transactionId || this.isAuthority()) return false;
    this.requestSequence += 1;
    const ack = {
      requestId: makeRequestId(this.runtime?.localPlayerId, this.requestSequence),
      kind: 'transaction-ack',
      transactionId: cleanId(transactionId),
      actor: {}
    };
    return Boolean(this.runtime?.sendEconomyRequest?.(ack));
  }

  replaySnapshotTransactions(snapshot = {}) {
    const localPlayerId = this.runtime?.localPlayerId;
    pruneTransactionResults(snapshot.transactionResults || [], { now: Date.now() })
      .filter((result) => result.targetPlayerId === localPlayerId)
      .forEach((result) => this.applyLocalResult(result));
  }

  resendUnacknowledgedTransactions(now = Date.now()) {
    this.transactionOrder.forEach((requestId) => {
      const record = this.transactionResults.get(requestId);
      if (!record || record.acknowledged) return;
      if (record.result.targetPlayerId === this.runtime?.localPlayerId) {
        record.acknowledged = true;
        return;
      }
      if (now - Number(record.lastSentAt || 0) < TRANSACTION_RESEND_INTERVAL_MS) return;
      this.deliverResult(record.result, { replay: true });
    });
  }

  pollPendingRequests(now = Date.now()) {
    if (this.isAuthority() || !this.pendingRequests.size) return;
    for (const pending of this.pendingRequests.values()) {
      if (now < pending.nextRetryAt) continue;
      this.runtime?.sendStateResyncRequest?.({
        reason: 'economy-transaction-timeout',
        transactionId: pending.requestId,
        requireEconomySnapshot: true
      });
      this.runtime?.sendEconomyRequest?.(pending.payload);
      this.metrics.transactionRetries += 1;
      pending.retryIndex = Math.min(
        pending.retryIndex + 1,
        PENDING_REQUEST_RETRY_MS.length - 1
      );
      pending.nextRetryAt = now + PENDING_REQUEST_RETRY_MS[pending.retryIndex];
    }
  }

  pollEmergencyResupply(now = Date.now()) {
    if (now - this.lastEmergencyPollAt < EMERGENCY_POLL_INTERVAL_MS) return;
    this.lastEmergencyPollAt = now;
    if (Array.from(this.pendingRequests.values()).some(
      (entry) => entry.payload?.kind === 'emergency-resupply'
    )) return;

    const actor = this.adapter.getLocalPurchaseState?.() || {};
    const localAccount = this.ensureAccount(this.runtime?.localPlayerId);
    const eligibility = evaluateEmergencyResupply({
      allAmmoEmpty: actor.allAmmoEmpty === true,
      balance: localAccount?.score ?? this.player?.score,
      cheapestAmmoCost: actor.cheapestAmmoCost,
      currentWave: actor.currentWave,
      emergencyState: localAccount?.emergencyResupply,
      now
    });
    if (!eligibility.ok) return;
    this.requestInteraction({
      kind: 'emergency-resupply',
      automatic: true,
      currentWave: actor.currentWave
    });
  }

  applyProfilePatch(profile, patch = null) {
    if (!profile || !patch) return;

    (patch.addWeapons || []).forEach((weapon) => {
      const key = cleanId(weapon);
      if (key) profile.weapons.add(key.replace('_UPG', ''));
    });

    (patch.addPerks || []).forEach((perk) => {
      const id = cleanId(perk);
      if (id) profile.perks.add(id);
    });

    Object.entries(patch.upgrades || {}).forEach(([family, tier]) => {
      const key = cleanId(family);
      if (!key) return;
      profile.upgrades[key] = Math.max(
        Number(profile.upgrades[key]) || 0,
        Math.max(0, Math.min(3, Math.floor(Number(tier) || 0)))
      );
      profile.weapons.add(key);
    });
  }

  allowRequest(playerId) {
    const now = nowMs();
    let window = this.requestWindows.get(playerId);

    if (!window || now - window.startedAt >= REQUEST_WINDOW_MS) {
      window = { startedAt: now, count: 0 };
      this.requestWindows.set(playerId, window);
    }

    window.count += 1;
    return window.count <= MAX_REQUESTS_PER_WINDOW;
  }

  rememberProcessedRequest(requestId) {
    this.processedRequests.add(requestId);
    if (this.processedRequests.size <= MAX_PROCESSED_REQUESTS) return;
    const oldest = this.processedRequests.values().next().value;
    if (oldest) this.processedRequests.delete(oldest);
  }

  getSnapshot() {
    return {
      active: this.active,
      worldReady: this.worldReady,
      authority: this.isAuthority(),
      authorityEpoch: this.authorityEpoch,
      hasMigrationCheckpoint: Boolean(this.latestSnapshot),
      snapshotVersion: this.snapshotVersion,
      accounts: Array.from(this.accounts.entries(), ([playerId, account]) => ({
        playerId,
        score: account.score,
        kills: account.kills,
        emergencyResupply: normalizeEmergencyState(account.emergencyResupply),
        profile: cloneProfile(account.profile)
      })),
      pendingTransactions: this.pendingRequests.size,
      retainedTransactionResults: this.transactionResults.size,
      metrics: { ...this.metrics },
      economyBalance: getEconomyBalanceSnapshot()
    };
  }

  destroy() {
    this.endRun();
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}

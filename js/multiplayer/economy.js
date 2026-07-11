// js/multiplayer/economy.js

import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js'; import { getLateJoinCatchUpScore } from './coop_scaling_core.js';
import { getEconomyBalanceSnapshot, scaleEconomyReward } from '../economy_balance.js';

const SNAPSHOT_INTERVAL_MS = 220;
const REQUEST_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_PROCESSED_REQUESTS = 512;

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

function makeAccount({ score = 0, kills = 0 } = {}) {
  return {
    score: normalizeScore(score),
    kills: normalizeKills(kills),
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
    kills: entry.kills
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
      combatAwards: 0, lateJoinGrants: 0
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

  update(now = nowMs()) {
    if (!this.active || !this.worldReady || !this.isAuthority()) return;

    this.ensureRoomAccounts();

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
      profile: cloneProfile(account.profile)
    };
  }

  requestInteraction(request = {}) {
    if (!this.active || !this.worldReady || !this.isOnline()) return false;

    this.requestSequence += 1;
    const localPlayerId = this.runtime?.localPlayerId;
    const payload = {
      ...request,
      requestId: cleanId(
        request.requestId,
        makeRequestId(localPlayerId, this.requestSequence)
      ),
      actor: this.adapter.getLocalPurchaseState?.() || {}
    };

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
    if (this.processedRequests.has(requestId)) return;
    this.rememberProcessedRequest(requestId);

    if (!this.allowRequest(playerId)) {
      this.rejectRequest(playerId, requestId, 'TOO MANY INTERACTIONS');
      return;
    }

    const account = this.ensureAccount(playerId);
    const playerState = playerId === this.runtime?.localPlayerId
      ? this.adapter.getLocalPurchaseState?.() || {}
      : this.runtime?.sampleRemotePlayer?.(playerId, nowMs())?.state || {};

    const context = {
      playerId,
      account,
      balance: account?.score || 0,
      playerState,
      request
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
      grant: committed.grant || validation.grant || null,
      feedback: committed.feedback || validation.feedback || null
    };

    this.metrics.requestsAccepted += 1;
    this.deliverResult(result);
    this.snapshotDirty = true;
    this.sendSnapshot(true);
  }

  rejectRequest(playerId, requestId, reason, feedback = null) {
    const account = this.ensureAccount(playerId);
    this.metrics.requestsRejected += 1;
    this.deliverResult({
      kind: 'interaction-result',
      requestId,
      targetPlayerId: playerId,
      accepted: false,
      reason: String(reason || 'REJECTED').slice(0, 120),
      score: account?.score || 0,
      kills: account?.kills || 0,
      feedback
    });
  }

  deliverResult(result) {
    if (result.targetPlayerId === this.runtime?.localPlayerId) {
      this.applyLocalResult(result);
      return;
    }
    this.runtime?.sendEconomyResult?.(result);
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

    if (this.player) {
      this.player.score = normalizeScore(result.score);
      this.player.kills = normalizeKills(result.kills);
    }

    this.adapter.applyLocalEconomyState?.({
      score: normalizeScore(result.score),
      kills: normalizeKills(result.kills)
    });
    this.adapter.applyMultiplayerInteractionResult?.(result);
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
      profile: cloneProfile(account.profile)
    }));

    const snapshot = {
      version: this.snapshotVersion,
      authorityEpoch: this.authorityEpoch,
      processedRequestIds: Array.from(this.processedRequests).slice(-256),
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

    if (becameHost) {
      this.accounts.clear();
      this.processedRequests = new Set(
        Array.isArray(snapshot.processedRequestIds)
          ? snapshot.processedRequestIds.slice(-256)
          : []
      );
      snapshot.players.forEach((entry) => {
        if (!entry?.playerId) return;
        this.accounts.set(entry.playerId, makeAccountFromSnapshot(entry));
      });
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

    if (becameHost) this.sendSnapshot(true);
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
        profile: cloneProfile(account.profile)
      })),
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

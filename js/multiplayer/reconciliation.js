// js/multiplayer/reconciliation.js

const DEFAULT_MAX_MESSAGE_IDS = 2048;
const DEFAULT_RESYNC_COOLDOWN_MS = 2500;
const DEFAULT_WORLD_STALE_MS = 2200;
const DEFAULT_INITIAL_WAIT_MS = 1800;
const DEFAULT_RECOVERY_TIMEOUT_MS = 4000;
const WORLD_GAP_RESYNC_THRESHOLD = 8;

export const MULTIPLAYER_RECONCILIATION_STATUS = Object.freeze({
    WAITING: 'WAITING',
    SYNCED: 'SYNCED',
    RESYNC: 'RESYNC',
    RECOVERING: 'RECOVERING'
});

const AUTHORITATIVE_STREAMS = Object.freeze([
    'world',
    'economy',
    'revive',
    'stats'
]);

function finiteInteger(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function envelopeIdentity(envelope = {}) {
    if (envelope.messageId) {
    return `${finiteInteger(envelope.connectionEpoch)}:${String(envelope.messageId)}`;
  }
    return [
        envelope.sessionId || 'session',
        envelope.runId || 'run',
        envelope.playerId || 'player',
    finiteInteger(envelope.connectionEpoch),
    envelope.type || 'type',
        finiteInteger(envelope.authorityEpoch),
        finiteInteger(envelope.sequence)
    ].join(':');
}

function authoritativeStream(envelope = {}) {
    if (envelope.type === 'world-snapshot') return 'world';
    if (envelope.type === 'economy-snapshot') return 'economy';
    if (
        envelope.type === 'revive-state'
        && envelope.payload?.kind === 'snapshot'
    ) {
        return 'revive';
    }
    if (
        envelope.type === 'run-stats'
        && envelope.payload?.kind === 'snapshot'
    ) {
        return 'stats';
    }
    return null;
}

function streamKey(envelope = {}, stream = authoritativeStream(envelope)) {
    if (!stream) return null;
    return [
        envelope.runId || 'run',
        finiteInteger(envelope.authorityEpoch),
        envelope.playerId || 'authority',
    finiteInteger(envelope.connectionEpoch),
    stream
    ].join(':');
}

export class MultiplayerReconciliationTracker {
    constructor({
        maxMessageIds = DEFAULT_MAX_MESSAGE_IDS,
        resyncCooldownMs = DEFAULT_RESYNC_COOLDOWN_MS,
        worldStaleMs = DEFAULT_WORLD_STALE_MS,
        initialWaitMs = DEFAULT_INITIAL_WAIT_MS,
        recoveryTimeoutMs = DEFAULT_RECOVERY_TIMEOUT_MS
    } = {}) {
        this.maxMessageIds = Math.max(256, finiteInteger(maxMessageIds, 2048));
        this.resyncCooldownMs = Math.max(500, finiteInteger(resyncCooldownMs, 2500));
        this.worldStaleMs = Math.max(1000, finiteInteger(worldStaleMs, 2200));
        this.initialWaitMs = Math.max(500, finiteInteger(initialWaitMs, 1800));
        this.recoveryTimeoutMs = Math.max(
            this.resyncCooldownMs,
            finiteInteger(recoveryTimeoutMs, 4000)
        );
        this.reset();
    }

    reset(now = Date.now()) {
        this.active = false;
        this.startedAt = now;
        this.authorityEpoch = 0;
        this.seenMessageIds = new Set();
        this.seenMessageQueue = [];
        this.streams = new Map();
        this.connectionEpochs = new Map();
        this.lastSnapshots = {
            world: -Infinity,
            economy: -Infinity,
            revive: -Infinity,
            stats: -Infinity
        };
        this.status = MULTIPLAYER_RECONCILIATION_STATUS.WAITING;
        this.pendingReason = null;
        this.pendingDetails = null;
        this.awaitingStreams = new Set();
        this.lastRequestAt = -Infinity;
        this.lastRecoveryAt = -Infinity;
        this.requestCounter = 0;
        this.metrics = {
            duplicatesRejected: 0,
            staleOrderedRejected: 0,
            sequenceGaps: 0,
            largestGap: 0,
            resyncRequests: 0,
            recoveriesCompleted: 0,
            authorityChanges: 0,
            reconnects: 0
        , connectionEpochChanges: 0, staleConnectionEpochRejected: 0};
    }

    beginRun({ now = Date.now(), authorityEpoch = 0 } = {}) {
        this.reset(now);
        this.active = true;
        this.authorityEpoch = finiteInteger(authorityEpoch);
        return this.getSnapshot(now);
    }

    endRun(now = Date.now()) {
        this.active = false;
        this.status = MULTIPLAYER_RECONCILIATION_STATUS.WAITING;
        this.pendingReason = null;
        this.pendingDetails = null;
        this.awaitingStreams.clear();
        return this.getSnapshot(now);
    }

    rememberMessage(messageId) {
        if (!messageId || this.seenMessageIds.has(messageId)) return false;
        this.seenMessageIds.add(messageId);
        this.seenMessageQueue.push(messageId);
        while (this.seenMessageQueue.length > this.maxMessageIds) {
            const oldest = this.seenMessageQueue.shift();
            if (oldest) this.seenMessageIds.delete(oldest);
        }
        return true;
    }

    markPending(reason, details = null) {
        if (!this.active) return false;
        this.pendingReason = String(reason || 'state-resync').slice(0, 80);
        this.pendingDetails = details || null;
        if (this.status !== MULTIPLAYER_RECONCILIATION_STATUS.RECOVERING) {
            this.status = MULTIPLAYER_RECONCILIATION_STATUS.RESYNC;
        }
        return true;
    }

    noteReconnect(now = Date.now()) {
        this.metrics.reconnects += 1;
        this.markPending('transport-reconnected', { at: now });
    }

    noteAuthorityEpoch(authorityEpoch, now = Date.now()) {
        const nextEpoch = finiteInteger(authorityEpoch);
        if (nextEpoch === this.authorityEpoch) return false;
        this.authorityEpoch = nextEpoch;
        this.metrics.authorityChanges += 1;
        this.streams.clear();
        this.seenMessageIds.clear();
        this.seenMessageQueue.length = 0;
        this.lastSnapshots.world = -Infinity;
        this.lastSnapshots.economy = -Infinity;
        this.lastSnapshots.revive = -Infinity;
        this.lastSnapshots.stats = -Infinity;
        this.markPending('authority-epoch-changed', {
            authorityEpoch: nextEpoch,
            at: now
        });
        return true;
    }

    observe(envelope, now = Date.now(), { expectedHostPlayerId = null } = {}) {
    const connectionEpoch = finiteInteger(envelope?.connectionEpoch);
    const playerId = envelope?.playerId || null;
    const previousConnectionEpoch = playerId
      ? this.connectionEpochs.get(playerId)
      : undefined;
    if (
      previousConnectionEpoch !== undefined
      && connectionEpoch < previousConnectionEpoch
    ) {
      this.metrics.staleConnectionEpochRejected += 1;
      return {
        accepted: false,
        reason: 'stale-connection-epoch',
        messageId: envelopeIdentity(envelope),
        gap: 0
      };
    }
    if (
      playerId
      && previousConnectionEpoch !== undefined
      && connectionEpoch > previousConnectionEpoch
    ) {
      this.metrics.connectionEpochChanges += 1;
      Array.from(this.streams.entries()).forEach(([key, entry]) => {
        if (entry?.playerId === playerId) this.streams.delete(key);
      });
    }
    if (playerId) this.connectionEpochs.set(playerId, connectionEpoch);

        const messageId = envelopeIdentity(envelope);
        if (this.seenMessageIds.has(messageId)) {
            this.metrics.duplicatesRejected += 1;
            return {
                accepted: false,
                reason: 'duplicate-message',
                messageId,
                gap: 0
            };
        }
        this.rememberMessage(messageId);

        const stream = authoritativeStream(envelope);
        if (!stream) {
            return { accepted: true, reason: null, messageId, gap: 0 };
        }

        if (
            expectedHostPlayerId
            && envelope.playerId
            && envelope.playerId !== expectedHostPlayerId
        ) {
            return { accepted: true, reason: null, messageId, gap: 0 };
        }

        const key = streamKey(envelope, stream);
        const sequence = finiteInteger(envelope.sequence);
        const previous = this.streams.get(key) || null;
        if (previous && sequence <= previous.sequence) {
            this.metrics.staleOrderedRejected += 1;
            return {
                accepted: false,
                reason: 'stale-ordered-sequence',
                messageId,
                gap: 0,
                stream
            };
        }

        const gap = previous ? Math.max(0, sequence - previous.sequence - 1) : 0;
        if (gap > 0) {
            this.metrics.sequenceGaps += gap;
            this.metrics.largestGap = Math.max(this.metrics.largestGap, gap);
        }
        this.streams.set(key, { sequence, receivedAt: now, stream, playerId, connectionEpoch });
        this.lastSnapshots[stream] = now;

        if (stream === 'world' && gap >= WORLD_GAP_RESYNC_THRESHOLD) {
            this.markPending('world-sequence-gap', {
                gap,
                previousSequence: previous?.sequence ?? null,
                sequence
            });
        }

        if (this.awaitingStreams.has(stream)) {
            this.awaitingStreams.delete(stream);
            if (this.awaitingStreams.size === 0) {
                this.status = MULTIPLAYER_RECONCILIATION_STATUS.SYNCED;
                this.pendingReason = null;
                this.pendingDetails = null;
                this.lastRecoveryAt = now;
                this.metrics.recoveriesCompleted += 1;
            }
        } else if (
            stream === 'world'
            && this.status === MULTIPLAYER_RECONCILIATION_STATUS.WAITING
        ) {
            this.status = MULTIPLAYER_RECONCILIATION_STATUS.SYNCED;
        }

        return { accepted: true, reason: null, messageId, gap, stream };
    }

    poll({
        now = Date.now(),
        active = this.active,
        isClient = false,
        connected = false,
        hostPlayerId = null
    } = {}) {
        if (!active || !this.active || !isClient || !connected) return null;

        const worldAge = Number.isFinite(this.lastSnapshots.world)
            ? Math.max(0, now - this.lastSnapshots.world)
            : Infinity;

        if (
            !Number.isFinite(this.lastSnapshots.world)
            && now - this.startedAt >= this.initialWaitMs
        ) {
            this.markPending('missing-world-snapshot', {
                waitedMs: now - this.startedAt
            });
        } else if (worldAge >= this.worldStaleMs) {
            this.markPending('world-snapshot-stale', { worldAgeMs: worldAge });
        }

        if (
            this.status === MULTIPLAYER_RECONCILIATION_STATUS.RECOVERING
            && now - this.lastRequestAt >= this.recoveryTimeoutMs
        ) {
            this.markPending('resync-timeout', {
                awaiting: Array.from(this.awaitingStreams)
            });
        }

        if (!this.pendingReason) return null;
        if (now - this.lastRequestAt < this.resyncCooldownMs) return null;

        this.requestCounter += 1;
        this.lastRequestAt = now;
        this.metrics.resyncRequests += 1;
        this.status = MULTIPLAYER_RECONCILIATION_STATUS.RECOVERING;
        this.awaitingStreams = new Set(AUTHORITATIVE_STREAMS);

        return {
            kind: 'full-state',
            requestId: `resync-${this.requestCounter}-${now}`,
            reason: this.pendingReason,
            details: this.pendingDetails,
            requestedAt: now,
            requestedStreams: Array.from(this.awaitingStreams),
            targetHostPlayerId: hostPlayerId || null,
            authorityEpoch: this.authorityEpoch,
            lastSequences: Object.fromEntries(
                Array.from(this.streams.entries(), ([key, entry]) => [
                    key,
                    entry.sequence
                ])
            )
        };
    }

    getSnapshot(now = Date.now()) {
        const age = (value) => Number.isFinite(value)
            ? Math.max(0, Math.round(now - value))
            : null;
        return {
            active: this.active,
            status: this.status,
            authorityEpoch: this.authorityEpoch,
            pendingReason: this.pendingReason,
            awaitingStreams: Array.from(this.awaitingStreams),
            lastRequestAt: Number.isFinite(this.lastRequestAt)
                ? this.lastRequestAt
                : null,
            lastRecoveryAt: Number.isFinite(this.lastRecoveryAt)
                ? this.lastRecoveryAt
                : null,
            worldAgeMs: age(this.lastSnapshots.world),
            economyAgeMs: age(this.lastSnapshots.economy),
            reviveAgeMs: age(this.lastSnapshots.revive),
            statsAgeMs: age(this.lastSnapshots.stats),
            trackedMessageIds: this.seenMessageIds.size,
            trackedStreams: this.streams.size,
            metrics: { ...this.metrics }
        };
    }
}

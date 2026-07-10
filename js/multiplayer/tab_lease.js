// js/multiplayer/tab_lease.js
// M3.71-M3.72 — ownership recovery final seal and active fence shutdown.

import {
  evaluateMultiplayerTabLease,
  normalizeMultiplayerTabLease,
  MULTIPLAYER_TAB_LEASE_RENEW_MS
} from './tab_lease_core.js';
import {
  evaluateMultiplayerTabTransport
} from './tab_transport_core.js';
import {
  syncMultiplayerTabResilienceLease,
  syncMultiplayerTabResilienceTransport
} from './tab_resilience.js';
import {
  createMultiplayerTabOwnerProbe,
  evaluateMultiplayerTabOwnerProbe,
  MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS
} from './tab_owner_probe_core.js';
import {
  evaluateMultiplayerTabEpochFence,
  evaluateMultiplayerTabLeaseWriteFence
} from './tab_epoch_fence_core.js';
import {
  syncMultiplayerTabRecoverySealLease,
  syncMultiplayerTabRecoverySealTransport,
  syncMultiplayerTabRecoverySealProbe,
  syncMultiplayerTabRecoverySealFence
} from './tab_recovery_seal.js';

const INSTANCE_STORAGE_KEY = 'khadija:mp-tab-instance-v1';
const LEASE_STORAGE_KEY = 'khadija:mp-tab-lease-v1';
const SIGNAL_STORAGE_KEY = 'khadija:mp-tab-signal-v1';
const CHANNEL_NAME = 'khadija:mp-tab-owner-v1';
const OVERLAY_ID = 'ka-tab-lease-overlay';
const STYLE_ID = 'ka-tab-lease-style';
const COLLISION_SETTLE_MS = 320;

const pageId = createToken();
const pageStartedAt = Date.now();
let instanceId = readOrCreateInstanceId();
let allowSameInstanceHandoff = detectReloadHandoff();
let activeSnapshot = null;
let evaluationBusy = false;
let evaluationQueued = false;
let forceTakeoverPending = false;
let channel = null;
let transportQuiesced = false;
let transportActionPromise = null;
let transportSnapshot = null;
let ownerProbePromise = null;
let ownerProbeSnapshot = null;
const ownerProbeAcks = new Map();
let epochFenceSnapshot = null;
let lastLeaseWriteFailureReason = '';

function createToken() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function readOrCreateInstanceId() {
  if (typeof window === 'undefined') return createToken();
  try {
    const stored = String(
      window.sessionStorage?.getItem(INSTANCE_STORAGE_KEY) || ''
    ).trim();
    if (stored) return stored.slice(0, 160);
    const created = createToken();
    window.sessionStorage?.setItem(INSTANCE_STORAGE_KEY, created);
    return created;
  } catch {
    return createToken();
  }
}

function replaceInstanceId() {
  instanceId = createToken();
  allowSameInstanceHandoff = false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.setItem(INSTANCE_STORAGE_KEY, instanceId);
    } catch {
      // Restricted session storage still permits in-memory isolation.
    }
  }
  return instanceId;
}

function detectReloadHandoff() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.has('mpRefresh')) return true;
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    return navigation?.type === 'reload';
  } catch {
    return false;
  }
}

function readLease() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(LEASE_STORAGE_KEY);
    return raw
      ? normalizeMultiplayerTabLease(JSON.parse(raw))
      : null;
  } catch {
    return null;
  }
}

function publishEpochFence(snapshot) {
  epochFenceSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_EPOCH_FENCE = epochFenceSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership enforcement.
    }
  }
  syncMultiplayerTabRecoverySealFence(epochFenceSnapshot);

  if (
    epochFenceSnapshot?.action === 'QUIESCE'
    && activeSnapshot?.blocking !== true
  ) {
    activeSnapshot = Object.freeze({
      ...(activeSnapshot || {}),
      status: 'CONFLICT',
      health: 'WARN',
      reason: epochFenceSnapshot.reason || 'tab-epoch-fence-owner-superseded',
      action: 'BLOCK',
      owner: false,
      blocking: true,
      final: false,
      checkedAt: Date.now()
    });
    try {
      window.KHADIJA_MULTIPLAYER_TAB_LEASE = activeSnapshot;
    } catch {
      // Diagnostics are best effort.
    }
    syncMultiplayerTabResilienceLease(activeSnapshot);
    syncMultiplayerTabRecoverySealLease(activeSnapshot);
    showOverlay(activeSnapshot);

    queueMicrotask(async () => {
      try {
        const foundation = await import('./foundation.js');
        await quiesceNonOwnerTransport(foundation, activeSnapshot);
      } catch {
        // The input block remains authoritative if transport shutdown fails.
      }
    });
  }

  return epochFenceSnapshot;
}

function writeLease(lease) {
  if (typeof window === 'undefined' || !lease) return false;
  lastLeaseWriteFailureReason = '';

  const current = readLease();
  const fence = publishEpochFence(
    evaluateMultiplayerTabLeaseWriteFence({
      currentLease: current,
      nextLease: lease
    })
  );
  if (fence.allowed !== true) {
    lastLeaseWriteFailureReason = fence.reason || 'tab-epoch-fence-write-blocked';
    return false;
  }

  try {
    window.localStorage?.setItem(LEASE_STORAGE_KEY, JSON.stringify(lease));
    const confirmed = readLease();
    if (
      confirmed?.instanceId !== lease.instanceId
      || confirmed?.pageId !== lease.pageId
      || Number(confirmed?.epoch) !== Number(lease.epoch)
    ) {
      lastLeaseWriteFailureReason = 'tab-epoch-fence-write-lost-race';
      publishEpochFence({
        ...fence,
        status: 'FENCED',
        health: 'WARN',
        reason: lastLeaseWriteFailureReason,
        action: 'BLOCK',
        allowed: false,
        final: true
      });
      return false;
    }
    signalTabs('LEASE_CHANGED');
    return true;
  } catch {
    lastLeaseWriteFailureReason = 'tab-lease-storage-unavailable';
    return false;
  }
}

function releaseLease() {
  if (typeof window === 'undefined') return false;
  const current = readLease();
  if (
    current?.instanceId !== instanceId
    || current?.pageId !== pageId
  ) {
    return false;
  }
  try {
    window.localStorage?.removeItem(LEASE_STORAGE_KEY);
    signalTabs('LEASE_RELEASED');
    return true;
  } catch {
    return false;
  }
}

function signalTabs(type, extra = {}) {
  const message = {
    type,
    instanceId,
    pageId,
    pageStartedAt,
    sentAt: Date.now(),
    ...extra
  };
  try {
    channel?.postMessage?.(message);
  } catch {
    // BroadcastChannel is optional.
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(
        SIGNAL_STORAGE_KEY,
        JSON.stringify({ ...message, nonce: createToken() })
      );
    } catch {
      // Storage-event fallback is optional.
    }
  }
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_LEASE = activeSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership enforcement.
    }
  }
  syncMultiplayerTabResilienceLease(activeSnapshot);
  syncMultiplayerTabRecoverySealLease(activeSnapshot);
  if (activeSnapshot?.blocking === true) {
    showOverlay(activeSnapshot);
  } else {
    hideOverlay();
  }
  publishEpochFence(evaluateMultiplayerTabEpochFence({
    lease: activeSnapshot,
    storedLease: readLease(),
    transport: transportSnapshot,
    now: Date.now()
  }));
  return activeSnapshot;
}

function publishTransport(snapshot) {
  transportSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_TRANSPORT = transportSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership enforcement.
    }
  }
  syncMultiplayerTabResilienceTransport(transportSnapshot);
  syncMultiplayerTabRecoverySealTransport(transportSnapshot);
  publishEpochFence(evaluateMultiplayerTabEpochFence({
    lease: activeSnapshot,
    storedLease: readLease(),
    transport: transportSnapshot,
    now: Date.now()
  }));
  return transportSnapshot;
}

function publishOwnerProbe(snapshot) {
  ownerProbeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_OWNER_PROBE = ownerProbeSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership enforcement.
    }
  }
  syncMultiplayerTabRecoverySealProbe(ownerProbeSnapshot);
  return ownerProbeSnapshot;
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });
}

function leaseMatchesProbe(lease, probe) {
  return Boolean(
    lease
    && probe
    && lease.instanceId === probe.ownerInstanceId
    && lease.pageId === probe.ownerPageId
    && Number(lease.epoch) === Number(probe.ownerEpoch)
  );
}

async function resolveConflictingOwner(result) {
  if (
    result?.status !== 'CONFLICT'
    || !result?.lease
    || result?.lease?.instanceId === instanceId
    && result?.lease?.pageId === pageId
  ) {
    return result;
  }

  if (ownerProbePromise) {
    await ownerProbePromise;
    return null;
  }

  const probe = createMultiplayerTabOwnerProbe({
    probeId: createToken(),
    lease: result.lease,
    challengerInstanceId: instanceId,
    challengerPageId: pageId,
    startedAt: Date.now()
  });
  if (!probe) return result;

  ownerProbePromise = (async () => {
    signalTabs('OWNER_PROBE', {
      probeId: probe.probeId,
      ownerInstanceId: probe.ownerInstanceId,
      ownerPageId: probe.ownerPageId,
      ownerEpoch: probe.ownerEpoch,
      challengerInstanceId: instanceId,
      challengerPageId: pageId
    });

    let state = null;
    while (true) {
      const ack = ownerProbeAcks.get(probe.probeId) || null;
      state = evaluateMultiplayerTabOwnerProbe({
        probe,
        currentLease: readLease(),
        ack,
        now: Date.now()
      });
      publishOwnerProbe(state);

      if (state.final === true) break;
      await sleep(80);
    }

    ownerProbeAcks.delete(probe.probeId);
    return state;
  })();

  let probeResult = null;
  try {
    probeResult = await ownerProbePromise;
  } finally {
    ownerProbePromise = null;
  }

  if (probeResult?.action === 'BLOCK') {
    return {
      ...result,
      reason: 'tab-lease-owner-confirmed-alive',
      ownerProbe: probeResult
    };
  }

  if (probeResult?.action === 'REEVALUATE') {
    return null;
  }

  if (
    probeResult?.action === 'RECLAIM'
    && leaseMatchesProbe(readLease(), probe)
  ) {
    return evaluateMultiplayerTabLease({
      lease: readLease(),
      instanceId,
      pageId,
      now: Date.now(),
      activeRun: true,
      forceTakeover: true,
      takeoverReason: 'stale-owner-reclaim'
    });
  }

  return null;
}

function transportSnapshotFrom(foundation, leaseSnapshot) {
  const transport = foundation?.multiplayerTransport || null;
  return evaluateMultiplayerTabTransport({
    lease: leaseSnapshot,
    transportState: transport?.getState?.() || 'disconnected',
    transportMode: transport?.getMode?.() || 'local',
    hasConnectionOptions: Boolean(transport?.connectionOptions),
    quiesced: transportQuiesced
  });
}

async function quiesceNonOwnerTransport(foundation, leaseSnapshot) {
  const transport = foundation?.multiplayerTransport || null;
  if (!transport) {
    return publishTransport({
      status: 'QUIESCED',
      health: 'PASS',
      reason: 'tab-transport-unavailable',
      action: 'NONE',
      blocking: true,
      final: true
    });
  }

  if (
    transportQuiesced
    || transport.getMode?.() !== 'online'
    || !transport.connectionOptions
  ) {
    transportQuiesced = true;
    return publishTransport(transportSnapshotFrom(foundation, leaseSnapshot));
  }

  transport.manualDisconnect = true;
  transport.cancelReconnect?.();
  transport.closeSocket?.('tab-lease-non-owner');
  if (Array.isArray(transport.outboundQueue)) {
    transport.outboundQueue.length = 0;
  }
  transport.setState?.('disconnected', {
    reason: 'tab-lease-non-owner',
    force: true
  });
  transportQuiesced = true;

  return publishTransport({
    ...transportSnapshotFrom(foundation, leaseSnapshot),
    status: 'QUIESCED',
    health: 'PASS',
    reason: 'tab-transport-non-owner-quiesced',
    action: 'NONE',
    blocking: true,
    final: true
  });
}

async function resumeOwnerTransport(foundation, leaseSnapshot) {
  const transport = foundation?.multiplayerTransport || null;
  if (!transport) {
    return publishTransport({
      status: 'OWNER_WAITING',
      health: 'WARN',
      reason: 'tab-transport-unavailable',
      action: 'NONE',
      blocking: true,
      final: false
    });
  }

  if (
    transport.getMode?.() !== 'online'
    || !transport.connectionOptions
  ) {
    transportQuiesced = false;
    return publishTransport(transportSnapshotFrom(foundation, leaseSnapshot));
  }

  if (
    transport.getState?.() === 'connected'
    && transportQuiesced !== true
  ) {
    return publishTransport(transportSnapshotFrom(foundation, leaseSnapshot));
  }

  transport.manualDisconnect = false;
  transportQuiesced = false;

  try {
    await transport.openSocket?.({ reconnecting: true });
    foundation.multiplayerRuntime?.sendHeartbeatPing?.(Date.now());
    return publishTransport({
      ...transportSnapshotFrom(foundation, leaseSnapshot),
      status: 'OWNER_CONNECTED',
      health: 'PASS',
      reason: 'tab-transport-owner-reconnected',
      action: 'NONE',
      blocking: false,
      final: true
    });
  } catch (error) {
    transportQuiesced = true;
    return publishTransport({
      ...transportSnapshotFrom(foundation, leaseSnapshot),
      status: 'RESUME_FAILED',
      health: 'FAIL',
      reason: String(
        error?.message || error || 'tab-transport-owner-reconnect-failed'
      ).slice(0, 200),
      action: 'RETRY',
      blocking: true,
      final: true
    });
  }
}

async function applyTransportOwnership(foundation, leaseSnapshot) {
  if (transportActionPromise) {
    await transportActionPromise;
  }

  const policy = publishTransport(
    transportSnapshotFrom(foundation, leaseSnapshot)
  );

  if (policy.action === 'QUIESCE') {
    transportActionPromise = quiesceNonOwnerTransport(
      foundation,
      leaseSnapshot
    );
  } else if (policy.action === 'RESUME') {
    transportActionPromise = resumeOwnerTransport(
      foundation,
      leaseSnapshot
    );
  } else {
    return policy;
  }

  try {
    return await transportActionPromise;
  } finally {
    transportActionPromise = null;
  }
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(3, 7, 18, 0.92);
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    }
    #${OVERLAY_ID}[hidden] { display: none !important; }
    #${OVERLAY_ID} .ka-tab-lease-card {
      width: min(520px, 100%);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 14px;
      padding: 24px;
      color: #f8fafc;
      background: #111827;
      text-align: center;
      box-shadow: 0 24px 80px rgba(0,0,0,0.58);
    }
    #${OVERLAY_ID} h2 {
      margin: 0 0 10px;
      font-size: 1.42rem;
    }
    #${OVERLAY_ID} p {
      margin: 0 0 18px;
      color: #cbd5e1;
      line-height: 1.5;
    }
    #${OVERLAY_ID} button {
      min-width: 170px;
      border: 0;
      border-radius: 9px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 750;
      color: #0f172a;
      background: #f8fafc;
      cursor: pointer;
    }
    #${OVERLAY_ID} .ka-tab-lease-note {
      margin-top: 14px;
      color: #94a3b8;
      font-size: 0.82rem;
    }
  `;
  document.head?.appendChild(style);
}

function ensureOverlay() {
  if (typeof document === 'undefined') return null;
  ensureStyle();
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ka-tab-lease-title');
  overlay.innerHTML = `
    <div class="ka-tab-lease-card">
      <h2 id="ka-tab-lease-title">CO-OP IS ACTIVE IN ANOTHER TAB</h2>
      <p>
        This browser profile already has an active Khadija's Arena co-op tab.
        Only one tab can control the player at a time.
      </p>
      <button type="button" data-action="takeover">USE THIS TAB</button>
      <div class="ka-tab-lease-note">
        Taking control will safely block the other tab.
      </div>
    </div>
  `;
  overlay.querySelector('[data-action="takeover"]')?.addEventListener(
    'click',
    () => {
      forceTakeoverPending = true;
      scheduleEvaluation();
    }
  );
  document.body?.appendChild(overlay);
  return overlay;
}

function showOverlay() {
  const overlay = ensureOverlay();
  if (!overlay) return;
  overlay.hidden = false;
  try {
    document.exitPointerLock?.();
  } catch {
    // Pointer-lock release is best effort.
  }
  overlay.querySelector('[data-action="takeover"]')?.focus?.();
}

function hideOverlay() {
  const overlay = typeof document === 'undefined'
    ? null
    : document.getElementById(OVERLAY_ID);
  if (overlay) overlay.hidden = true;
}

function captureInput(event) {
  if (activeSnapshot?.blocking !== true) return;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

function installInputShield() {
  if (typeof window === 'undefined') return;
  for (const type of [
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'touchstart',
    'touchend',
    'wheel'
  ]) {
    window.addEventListener(type, captureInput, {
      capture: true,
      passive: false
    });
  }
}

function handlePeerMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.pageId === pageId) return;

  if (
    message.type === 'HELLO'
    && message.instanceId === instanceId
  ) {
    const remoteStartedAt = Math.max(0, Number(message.pageStartedAt) || 0);
    const thisPageLoses = (
      pageStartedAt > remoteStartedAt
      || (
        pageStartedAt === remoteStartedAt
        && pageId > String(message.pageId || '')
      )
    );
    if (thisPageLoses && !allowSameInstanceHandoff) {
      replaceInstanceId();
      signalTabs('INSTANCE_REPLACED');
    } else {
      signalTabs('HELLO_ACK');
    }
    scheduleEvaluation();
    return;
  }

  if (message.type === 'OWNER_PROBE') {
    const current = readLease();
    const ownsRequestedLease = Boolean(
      current
      && current.instanceId === instanceId
      && current.pageId === pageId
      && current.instanceId === String(message.ownerInstanceId || '')
      && current.pageId === String(message.ownerPageId || '')
      && Number(current.epoch) === Number(message.ownerEpoch)
      && activeSnapshot?.owner === true
      && activeSnapshot?.blocking !== true
    );
    if (ownsRequestedLease) {
      signalTabs('OWNER_ACK', {
        probeId: String(message.probeId || '').slice(0, 160),
        ownerInstanceId: instanceId,
        ownerPageId: pageId,
        ownerEpoch: current.epoch
      });
    }
    return;
  }

  if (message.type === 'OWNER_ACK') {
    const probeId = String(message.probeId || '').slice(0, 160);
    if (probeId) {
      ownerProbeAcks.set(probeId, {
        probeId,
        ownerInstanceId: String(message.ownerInstanceId || '').slice(0, 160),
        ownerPageId: String(message.ownerPageId || '').slice(0, 160),
        ownerEpoch: Math.max(1, Number(message.ownerEpoch) || 1)
      });
    }
    return;
  }

  if (
    [
      'LEASE_CHANGED',
      'LEASE_RELEASED',
      'TAKEOVER',
      'RECLAIM',
      'INSTANCE_REPLACED'
    ].includes(String(message.type || ''))
  ) {
    scheduleEvaluation();
  }
}

function installCoordination() {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', (event) => {
        handlePeerMessage(event.data);
      });
    } catch {
      channel = null;
    }
  }

  window.addEventListener('storage', (event) => {
    if (
      event.key === LEASE_STORAGE_KEY
      || event.key === SIGNAL_STORAGE_KEY
    ) {
      if (event.key === SIGNAL_STORAGE_KEY && event.newValue) {
        try {
          handlePeerMessage(JSON.parse(event.newValue));
        } catch {
          // Ignore malformed cross-tab signals.
        }
      }
      scheduleEvaluation();
    }
  });

  signalTabs('HELLO');
}

async function evaluateOwnership() {
  if (evaluationBusy) {
    evaluationQueued = true;
    return activeSnapshot;
  }
  evaluationBusy = true;

  try {
    const foundation = await import('./foundation.js');
    const activeRun = foundation.isOnlineMultiplayerRun?.() === true;
    const now = Date.now();
    const forceTakeover = forceTakeoverPending;
    forceTakeoverPending = false;

    let result = evaluateMultiplayerTabLease({
      lease: readLease(),
      instanceId,
      pageId,
      now,
      activeRun,
      allowSameInstanceHandoff,
      forceTakeover
    });

    if (
      result.status === 'CONFLICT'
      && forceTakeover !== true
    ) {
      result = await resolveConflictingOwner(result);
      if (!result) {
        evaluationQueued = true;
        return activeSnapshot;
      }
    }

    if (result.action === 'RELEASE') {
      releaseLease();
      allowSameInstanceHandoff = false;
      const published = publish(result);
      await applyTransportOwnership(foundation, published);
      return published;
    }

    if (
      ['ACQUIRE', 'RENEW', 'HANDOFF', 'TAKEOVER', 'RECLAIM']
        .includes(result.action)
      && result.nextLease
    ) {
      if (!writeLease(result.nextLease)) {
        const blocked = publish({
          ...result,
          status: 'STORAGE_BLOCKED',
          health: 'FAIL',
          reason: lastLeaseWriteFailureReason || 'tab-lease-storage-unavailable',
          action: 'BLOCK',
          blocking: true,
          owner: false,
          final: true
        });
        await applyTransportOwnership(foundation, blocked);
        return blocked;
      }

      allowSameInstanceHandoff = false;
      if (result.action === 'TAKEOVER') {
        signalTabs('TAKEOVER', {
          leaseEpoch: result.nextLease.epoch
        });
      } else if (result.action === 'RECLAIM') {
        signalTabs('RECLAIM', {
          leaseEpoch: result.nextLease.epoch
        });
      }

      const confirmed = readLease();
      if (
        confirmed?.instanceId !== instanceId
        || confirmed?.pageId !== pageId
        || Number(confirmed?.epoch) !== Number(result.nextLease.epoch)
      ) {
        const blocked = publish({
          ...result,
          status: 'CONFLICT',
          health: 'WARN',
          reason: 'tab-lease-write-lost-race',
          action: 'BLOCK',
          blocking: true,
          owner: false,
          final: false
        });
        await applyTransportOwnership(foundation, blocked);
        return blocked;
      }
    }

    const published = publish(result);
    await applyTransportOwnership(foundation, published);
    return published;
  } catch (error) {
    const failed = publish({
      status: 'FAILED',
      health: 'FAIL',
      reason: String(error?.message || error || 'tab-lease-runtime-failed')
        .slice(0, 200),
      action: 'BLOCK',
      blocking: true,
      owner: false,
      final: true,
      checkedAt: Date.now()
    });
    try {
      const foundation = await import('./foundation.js');
      await applyTransportOwnership(foundation, failed);
    } catch {
      // The ownership block remains authoritative even if transport cleanup fails.
    }
    return failed;
  } finally {
    evaluationBusy = false;
    if (evaluationQueued) {
      evaluationQueued = false;
      queueMicrotask(() => {
        evaluateOwnership();
      });
    }
  }
}

function scheduleEvaluation() {
  queueMicrotask(() => {
    evaluateOwnership();
  });
}

function initialize() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  installInputShield();
  installCoordination();
  publish({
    status: 'PROBING',
    health: 'PASS',
    reason: 'tab-lease-collision-check',
    action: 'WAIT',
    blocking: true,
    owner: false,
    final: false,
    instanceId,
    pageId,
    checkedAt: Date.now()
  });

  setTimeout(() => {
    evaluateOwnership();
  }, COLLISION_SETTLE_MS);

  setInterval(() => {
    evaluateOwnership();
  }, MULTIPLAYER_TAB_LEASE_RENEW_MS);

  window.addEventListener('focus', scheduleEvaluation);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleEvaluation();
    }
  });
}

initialize();

export function isMultiplayerTabLeaseBlocking() {
  return activeSnapshot?.blocking === true;
}

export function getMultiplayerTabLeaseSnapshot() {
  return activeSnapshot;
}

export function requestMultiplayerTabLeaseTakeover() {
  forceTakeoverPending = true;
  return evaluateOwnership();
}

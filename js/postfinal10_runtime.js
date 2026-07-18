// POST-FINAL.10 R1 — adaptive runtime governor and degraded-network awareness.

import {
  POST_FINAL10_PATCH,
  POST_FINAL10_PRODUCT_VERSION,
  classifyPostFinal10Network,
  createPostFinal10GovernorState,
  derivePostFinal10DeviceClass,
  updatePostFinal10Governor
} from './postfinal10_core.js';

let initialized = false;
let statusNode = null;
let showToast = null;
let lastNetworkStatus = null;
let lastProfile = null;

function connectionSnapshot() {
  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection
    || null;
  return {
    online: navigator.onLine !== false,
    rttMs: Number(connection?.rtt) || 0,
    jitterMs: 0,
    lossPct: 0,
    effectiveType: String(connection?.effectiveType || ''),
    saveData: connection?.saveData === true
  };
}

const device = derivePostFinal10DeviceClass({
  mobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    String(globalThis.navigator?.userAgent || '')
  ),
  hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
  deviceMemory: globalThis.navigator?.deviceMemory,
  effectiveType: globalThis.navigator?.connection?.effectiveType,
  saveData: globalThis.navigator?.connection?.saveData
});

let governor = createPostFinal10GovernorState({
  device,
  now: Date.now()
});
let network = classifyPostFinal10Network({
  online: globalThis.navigator?.onLine !== false
});

function ensureStatusNode() {
  if (statusNode || typeof document === 'undefined') return statusNode;
  statusNode = document.getElementById('postfinal10-runtime-status');
  return statusNode;
}

function publish() {
  const body = typeof document !== 'undefined' ? document.body : null;
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (body) {
    body.dataset.kaPerformanceProfile = governor.profile.toLowerCase();
    body.dataset.kaNetworkHealth = network.status.toLowerCase();
  }
  if (root) {
    root.style.setProperty('--ka-particle-budget', String(governor.particleBudget));
    root.style.setProperty('--ka-animation-budget', String(governor.animationBudget));
  }

  const node = ensureStatusNode();
  if (node) {
    const networkText = network.status === 'HEALTHY'
      ? 'NETWORK READY'
      : `NETWORK ${network.status}`;
    const systemText = governor.profile === 'CONSERVE' ? 'SYSTEM ADAPTING' : 'SYSTEM READY';
    node.textContent = `${systemText} · ${networkText}`;
    node.dataset.tone = network.status === 'OFFLINE' || network.status === 'POOR'
      ? 'danger'
      : network.status === 'DEGRADED' || governor.profile === 'CONSERVE'
        ? 'warning'
        : 'ready';
  }

  const snapshot = getPostFinal10RuntimeSnapshot();
  try {
    globalThis.KHADIJA_POST_FINAL10_RUNTIME = snapshot;
  } catch {
    // Diagnostics are non-fatal.
  }
  globalThis.dispatchEvent?.(new CustomEvent('ka:postfinal10-runtime', {
    detail: snapshot
  }));
  return snapshot;
}

function refreshNetwork({ announce = false } = {}) {
  const previous = network.status;
  const connection = connectionSnapshot();
  network = classifyPostFinal10Network(connection);
  if (announce && previous !== network.status) {
    if (network.status === 'OFFLINE') {
      showToast?.('NETWORK OFFLINE · CO-OP WILL RECOVER WHEN CONNECTION RETURNS');
    } else if (previous === 'OFFLINE' && network.online) {
      showToast?.('NETWORK RESTORED · VERIFYING CO-OP SERVICES');
    }
  }
  lastNetworkStatus = network.status;
  return publish();
}

export function recordPostFinal10Frame({
  fps = 60,
  frameMs = 16.7,
  dt = 0,
  playing = false,
  now = Date.now()
} = {}) {
  if (!playing && document.visibilityState !== 'hidden') return governor;
  const result = updatePostFinal10Governor(governor, {
    fps,
    frameMs,
    dt,
    hidden: document.visibilityState === 'hidden',
    now,
    network
  });
  governor = result.state;
  if (result.changed || lastProfile !== governor.profile) {
    lastProfile = governor.profile;
    publish();
  }
  return governor;
}

export function getPostFinal10ParticleBudgetScale() {
  return Math.max(0.05, Math.min(1, Number(governor.particleBudget) || 1));
}

export function getPostFinal10AnimationBudgetScale() {
  return Math.max(0.05, Math.min(1, Number(governor.animationBudget) || 1));
}

export function getPostFinal10RuntimeSnapshot() {
  return Object.freeze({
    schema: 1,
    patch: POST_FINAL10_PATCH,
    productVersion: POST_FINAL10_PRODUCT_VERSION,
    initialized,
    device,
    governor,
    network,
    visible: typeof document === 'undefined'
      ? true
      : document.visibilityState !== 'hidden',
    checkedAt: Date.now()
  });
}

export function initPostFinal10Runtime({ onToast = null } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return getPostFinal10RuntimeSnapshot();
  }
  if (initialized) return publish();
  initialized = true;
  showToast = typeof onToast === 'function' ? onToast : null;

  window.addEventListener('online', () => refreshNetwork({ announce: true }));
  window.addEventListener('offline', () => refreshNetwork({ announce: true }));
  document.addEventListener('visibilitychange', () => {
    const result = updatePostFinal10Governor(governor, {
      fps: 60,
      frameMs: 16.7,
      dt: 0.1,
      hidden: document.visibilityState === 'hidden',
      now: Date.now(),
      network
    });
    governor = result.state;
    lastProfile = governor.profile;
    publish();
  });

  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection;
  connection?.addEventListener?.('change', () => refreshNetwork());

  lastProfile = governor.profile;
  lastNetworkStatus = network.status;
  refreshNetwork();
  return publish();
}

if (typeof window !== 'undefined') {
  window.KAGetVersion1RuntimeStatus = getPostFinal10RuntimeSnapshot;
}

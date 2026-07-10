// js/multiplayer/launch_observer.js
// M3.33-M3.34 — localhost-only launch-session observability and incident evidence.

import {
  MULTIPLAYER_LAUNCH_OBSERVER_BUILD,
  MULTIPLAYER_LAUNCH_OBSERVER_MAX_EVENTS,
  MULTIPLAYER_LAUNCH_OBSERVER_PATCH,
  MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL,
  buildLaunchObserverFingerprint,
  diffLaunchObserverFingerprints,
  evaluateMultiplayerLaunchHealth
} from './launch_observer_core.js';
import { MULTIPLAYER_BUILD_ID, MULTIPLAYER_PROTOCOL_VERSION } from './protocol.js';

const UPDATE_INTERVAL_MS = 500;
const PANEL_ID = 'mp-launch-observer';

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function downloadJson(name, value) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return true;
}

function environmentSnapshot(debugAllowed) {
  if (typeof window === 'undefined') {
    return {
      hostname: '',
      origin: '',
      loopback: false,
      debugAllowed: false,
      secureContext: false
    };
  }
  const hostname = String(window.location?.hostname || '').toLowerCase();
  const loopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  return {
    hostname,
    origin: String(window.location?.origin || ''),
    loopback,
    debugAllowed: debugAllowed === true,
    secureContext: window.isSecureContext === true
  };
}

function statusOf(result) {
  return String(result?.status || 'UNKNOWN').toUpperCase();
}

export class MultiplayerLaunchObserver {
  constructor({
    runtime,
    session,
    transport,
    lobby,
    releaseGuard,
    releaseCandidate,
    recoveryCertification,
    hostMigration
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.lobby = lobby;
    this.releaseGuard = releaseGuard;
    this.releaseCandidate = releaseCandidate;
    this.recoveryCertification = recoveryCertification;
    this.hostMigration = hostMigration;

    this.initialized = false;
    this.debugAllowed = false;
    this.visible = false;
    this.lastUpdatedAt = -Infinity;
    this.result = null;
    this.evidence = null;
    this.timeline = [];
    this.previousFingerprint = null;
    this.panel = null;

    this.disconnectedSince = null;
    this.recoveringSince = null;
    this.authorityEpochHighWater = 0;
    this.authorityEpochRegressed = false;

    this.keyHandler = (event) => {
      if (event.code !== 'F11' || !this.debugAllowed) return;
      event.preventDefault();
      this.toggle();
    };
  }

  initialize(now = nowMs()) {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    this.refreshPolicy();
    if (this.debugAllowed && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyHandler);
      this.createPanel();
    }
    this.evaluate(now);
    this.lastUpdatedAt = now;
    return this.getSnapshot();
  }

  refreshPolicy() {
    const guardSnapshot = this.releaseGuard?.getSnapshot?.() || {};
    this.debugAllowed = guardSnapshot?.policy?.allowed === true;
    if (!this.debugAllowed) {
      this.visible = false;
      this.panel?.remove?.();
      this.panel = null;
      if (typeof window !== 'undefined') {
        try {
          delete window.KHADIJA_MULTIPLAYER_LAUNCH_OBSERVER;
        } catch {
          window.KHADIJA_MULTIPLAYER_LAUNCH_OBSERVER = undefined;
        }
      }
    }
    return this.debugAllowed;
  }

  updateContinuity(now, session, transport, runtime, hostMigration) {
    const sessionMode = String(session?.mode || 'singleplayer').toLowerCase();
    const onlineMode = sessionMode === 'host' || sessionMode === 'client';
    const runActive = session?.run?.active === true;
    const transportState = String(transport?.state || 'unknown').toLowerCase();
    const streams = Array.isArray(runtime?.reconciliation?.awaitingStreams)
      ? runtime.reconciliation.awaitingStreams.filter(Boolean)
      : [];
    const recoveryActive = String(runtime?.reconciliation?.status || '').toUpperCase() === 'RECOVERING'
      || streams.length > 0;
    const epoch = Math.max(
      0,
      Number(hostMigration?.authorityEpoch) || 0,
      Number(runtime?.authorityEpoch) || 0
    );

    if (onlineMode && runActive && transportState !== 'connected') {
      if (this.disconnectedSince === null) this.disconnectedSince = now;
    } else {
      this.disconnectedSince = null;
    }

    if (runActive && recoveryActive) {
      if (this.recoveringSince === null) this.recoveringSince = now;
    } else {
      this.recoveringSince = null;
    }

    if (!runActive) {
      this.authorityEpochHighWater = epoch;
      this.authorityEpochRegressed = false;
    } else {
      this.authorityEpochRegressed = epoch < this.authorityEpochHighWater;
      this.authorityEpochHighWater = Math.max(this.authorityEpochHighWater, epoch);
    }

    return {
      disconnectedForMs: this.disconnectedSince === null ? 0 : Math.max(0, now - this.disconnectedSince),
      recoveringForMs: this.recoveringSince === null ? 0 : Math.max(0, now - this.recoveringSince),
      authorityEpochHighWater: this.authorityEpochHighWater,
      authorityEpochRegressed: this.authorityEpochRegressed
    };
  }

  capture(now = nowMs()) {
    const releaseGuard = this.releaseGuard?.getSnapshot?.() || null;
    const releaseCandidate = this.releaseCandidate?.getSnapshot?.() || null;
    const recoveryCertification = this.recoveryCertification?.getSnapshot?.() || null;
    const session = this.session?.getSnapshot?.() || null;
    const transport = this.transport?.getConnectionSnapshot?.()
      || {
        state: this.transport?.getState?.() || 'disconnected',
        mode: this.transport?.mode || 'offline'
      };
    const lobby = this.lobby?.getSnapshot?.() || null;
    const runtimeBase = this.runtime?.getSnapshot?.() || {};
    const runtime = {
      ...runtimeBase,
      faultSimulation: this.runtime?.getFaultSimulationSnapshot?.()
        || runtimeBase.faultSimulation
        || null,
      reconciliation: this.runtime?.getReconciliationSnapshot?.(Date.now())
        || runtimeBase.reconciliation
        || null
    };
    const hostMigration = this.hostMigration?.getSnapshot?.() || null;
    const continuity = this.updateContinuity(now, session, transport, runtime, hostMigration);
    const patch = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_PATCH === 'string'
      ? window.KHADIJA_MULTIPLAYER_PATCH
      : MULTIPLAYER_LAUNCH_OBSERVER_PATCH;
    const build = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_BUILD === 'string'
      ? window.KHADIJA_MULTIPLAYER_BUILD
      : MULTIPLAYER_BUILD_ID;

    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      build,
      patch,
      releaseGuard,
      releaseCandidate,
      recoveryCertification,
      session,
      transport,
      lobby,
      runtime,
      hostMigration,
      continuity,
      environment: environmentSnapshot(this.debugAllowed)
    };
  }

  addEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    this.timeline.push(...events);
    if (this.timeline.length > MULTIPLAYER_LAUNCH_OBSERVER_MAX_EVENTS) {
      this.timeline.splice(0, this.timeline.length - MULTIPLAYER_LAUNCH_OBSERVER_MAX_EVENTS);
    }
  }

  evaluate(now = nowMs()) {
    this.evidence = this.capture(now);
    this.result = evaluateMultiplayerLaunchHealth(this.evidence);
    const fingerprint = buildLaunchObserverFingerprint(this.evidence, this.result);
    this.addEvents(diffLaunchObserverFingerprints(
      this.previousFingerprint,
      fingerprint,
      Date.now()
    ));
    this.previousFingerprint = fingerprint;

    if (typeof window !== 'undefined' && this.debugAllowed) {
      try {
        window.KHADIJA_MULTIPLAYER_LAUNCH_OBSERVER = statusOf(this.result);
      } catch {
        // Status publication is informational only.
      }
    }
    return this.result;
  }

  createPanel() {
    if (typeof document === 'undefined' || !document.body || this.panel || !this.debugAllowed) return;
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:10040',
      'width:min(640px,calc(100vw - 36px))',
      'max-height:86vh',
      'overflow:auto',
      'padding:16px',
      'border:1px solid rgba(109,199,255,.65)',
      'border-radius:10px',
      'background:rgba(3,10,18,.97)',
      'color:#eef8ff',
      'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,.58)'
    ].join(';');
    panel.innerHTML = `
      <h3 style="margin:0 0 8px">Launch Session Observer · F11</h3>
      <p style="margin:0 0 12px;color:#b9dfff">Live multiplayer continuity, recovery and release evidence. Available only on loopback with <code>?mpDebug=1</code>.</p>
      <div data-role="summary" style="padding:10px;border:1px solid rgba(109,199,255,.28);border-radius:7px;background:rgba(109,199,255,.06)"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
        <button type="button" data-action="refresh">Refresh</button>
        <button type="button" data-action="clear">Clear timeline</button>
        <button type="button" data-action="export">Export incident JSON</button>
        <button type="button" data-action="close">Close</button>
      </div>
      <div data-role="checks"></div>
      <div data-role="timeline"></div>
    `;
    panel.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'refresh') {
        this.refreshPolicy();
        this.evaluate(nowMs());
        this.render();
      } else if (action === 'clear') {
        this.timeline = [];
        this.previousFingerprint = null;
        this.evaluate(nowMs());
        this.render();
      } else if (action === 'export') {
        const stamp = new Date().toISOString().replaceAll(':', '-');
        downloadJson(`khadijas-arena-multiplayer-launch-${stamp}.json`, this.getExport());
      } else if (action === 'close') {
        this.toggle(false);
      }
    });
    document.body.appendChild(panel);
    this.panel = panel;
  }

  toggle(force = null) {
    if (!this.debugAllowed) return false;
    if (!this.panel) this.createPanel();
    this.visible = typeof force === 'boolean' ? force : !this.visible;
    if (this.panel) this.panel.hidden = !this.visible;
    if (this.visible) {
      this.evaluate(nowMs());
      this.render();
    }
    return this.visible;
  }

  render() {
    if (!this.panel || !this.visible || !this.result) return;
    const summary = this.panel.querySelector('[data-role="summary"]');
    const checks = this.panel.querySelector('[data-role="checks"]');
    const timeline = this.panel.querySelector('[data-role="timeline"]');
    const result = this.result;

    if (summary) {
      summary.innerHTML = [
        `<strong>Health: ${escapeHtml(result.status)}</strong>`,
        `Checks: ${result.summary.passedChecks} pass · ${result.summary.warningChecks} warn · ${result.summary.failedChecks} fail`,
        `Transport: ${escapeHtml(result.summary.transportState)} · Players: ${result.summary.playerCount}`,
        `Recovery: ${escapeHtml(result.summary.reconciliationStatus)} · Awaiting: ${escapeHtml(result.summary.awaitingStreams.join(', ') || 'none')}`,
        `F10 candidate: ${escapeHtml(result.summary.candidateStatus)} · F9 certification: ${escapeHtml(result.summary.certificationStatus)}`,
        `Authority epoch: ${result.summary.authorityEpoch} · High-water: ${result.summary.authorityEpochHighWater}`
      ].join('<br>');
    }

    if (checks) {
      checks.innerHTML = `<h4 style="margin:12px 0 6px">Live checks</h4>${result.checks
        .map((entry) => `<div><strong>${escapeHtml(entry.status)}</strong> · ${escapeHtml(entry.label)}</div>`)
        .join('')}`;
    }

    if (timeline) {
      const recent = [...this.timeline].slice(-40).reverse();
      timeline.innerHTML = `<h4 style="margin:12px 0 6px">Incident timeline (${this.timeline.length}/${MULTIPLAYER_LAUNCH_OBSERVER_MAX_EVENTS})</h4>${recent.length > 0
        ? recent.map((entry) => {
          const stamp = new Date(entry.at).toISOString().slice(11, 23);
          return `<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.08)"><strong>${escapeHtml(entry.severity)}</strong> · ${escapeHtml(stamp)} · ${escapeHtml(entry.message)}</div>`;
        }).join('')
        : '<div>No timeline events captured.</div>'}`;
    }
  }

  update(now = nowMs()) {
    if (!this.initialized || now - this.lastUpdatedAt < UPDATE_INTERVAL_MS) return this.result;
    this.lastUpdatedAt = now;
    const wasAllowed = this.debugAllowed;
    this.refreshPolicy();
    if (this.debugAllowed && !wasAllowed) {
      if (typeof window !== 'undefined') window.addEventListener('keydown', this.keyHandler);
      this.createPanel();
    }
    this.evaluate(now);
    if (this.visible) this.render();
    return this.result;
  }

  getExport() {
    return {
      milestone: 'M3.33-M3.34',
      patch: MULTIPLAYER_LAUNCH_OBSERVER_PATCH,
      build: MULTIPLAYER_LAUNCH_OBSERVER_BUILD,
      protocol: MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL,
      exportedAt: new Date().toISOString(),
      result: this.result,
      timeline: [...this.timeline],
      evidence: this.evidence
    };
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      status: statusOf(this.result),
      result: this.result,
      timeline: [...this.timeline],
      continuity: this.evidence?.continuity ? { ...this.evidence.continuity } : null
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      try {
        delete window.KHADIJA_MULTIPLAYER_LAUNCH_OBSERVER;
      } catch {
        window.KHADIJA_MULTIPLAYER_LAUNCH_OBSERVER = undefined;
      }
    }
    this.panel?.remove?.();
    this.panel = null;
    this.visible = false;
    this.initialized = false;
  }
}

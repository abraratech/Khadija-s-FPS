// js/multiplayer/release_candidate.js
// M3.31-M3.32 — localhost-only release-candidate console and deployment-readiness report.

import {
  MULTIPLAYER_RELEASE_CANDIDATE_BUILD,
  MULTIPLAYER_RELEASE_CANDIDATE_PATCH,
  MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL,
  RELEASE_CANDIDATE_CHECKLIST,
  evaluateMultiplayerReleaseCandidate,
  normalizeReleaseCandidateChecklist
} from './release_candidate_core.js';
import {
  MULTIPLAYER_BUILD_ID,
  MULTIPLAYER_PROTOCOL_VERSION
} from './protocol.js';

const UPDATE_INTERVAL_MS = 750;
const STORAGE_KEY = 'khadija:mp-release-candidate-checklist:v1';
const PANEL_ID = 'mp-release-candidate';

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

function readChecklist() {
  if (typeof window === 'undefined') return normalizeReleaseCandidateChecklist();
  try {
    return normalizeReleaseCandidateChecklist(
      JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || '{}')
    );
  } catch {
    return normalizeReleaseCandidateChecklist();
  }
}

function writeChecklist(checklist) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(checklist));
  } catch {
    // Restricted storage must not interrupt the release-candidate harness.
  }
}

function environmentSnapshot(debugAllowed) {
  if (typeof window === 'undefined') {
    return { hostname: '', loopback: false, debugAllowed: false, secureContext: false };
  }
  const hostname = String(window.location?.hostname || '').toLowerCase();
  const loopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  return {
    hostname,
    loopback,
    debugAllowed: debugAllowed === true,
    secureContext: window.isSecureContext === true,
    origin: String(window.location?.origin || '')
  };
}

function publicReportStatus(result) {
  return result?.status || 'UNKNOWN';
}

export class MultiplayerReleaseCandidate {
  constructor({
    runtime,
    session,
    transport,
    lobby,
    releaseGuard,
    recoveryCertification,
    hostMigration
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.lobby = lobby;
    this.releaseGuard = releaseGuard;
    this.recoveryCertification = recoveryCertification;
    this.hostMigration = hostMigration;
    this.initialized = false;
    this.debugAllowed = false;
    this.visible = false;
    this.lastUpdatedAt = -Infinity;
    this.checklist = readChecklist();
    this.result = null;
    this.panel = null;
    this.keyHandler = (event) => {
      if (event.code !== 'F10' || !this.debugAllowed) return;
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
    this.evaluate();
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
    }
    return this.debugAllowed;
  }

  capture() {
    const guard = this.releaseGuard?.getSnapshot?.() || null;
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
    const session = this.session?.getSnapshot?.() || null;
    const transport = this.transport?.getConnectionSnapshot?.() || {
      state: this.transport?.getState?.() || 'disconnected',
      mode: this.transport?.mode || 'offline'
    };
    const lobby = this.lobby?.getSnapshot?.() || null;
    const recoveryCertification = this.recoveryCertification?.getSnapshot?.() || null;
    const hostMigration = this.hostMigration?.getSnapshot?.() || null;
    const patch = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_PATCH === 'string'
      ? window.KHADIJA_MULTIPLAYER_PATCH
      : MULTIPLAYER_RELEASE_CANDIDATE_PATCH;
    const build = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_BUILD === 'string'
      ? window.KHADIJA_MULTIPLAYER_BUILD
      : MULTIPLAYER_BUILD_ID;
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      build,
      patch,
      releaseGuard: guard,
      recoveryCertification,
      session,
      transport,
      lobby,
      runtime,
      hostMigration,
      checklist: this.checklist,
      environment: environmentSnapshot(this.debugAllowed)
    };
  }

  evaluate() {
    this.result = evaluateMultiplayerReleaseCandidate(this.capture());
    if (typeof window !== 'undefined') {
      try {
        window.KHADIJA_MULTIPLAYER_RELEASE_CANDIDATE = publicReportStatus(this.result);
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
      'left:18px',
      'bottom:18px',
      'z-index:10030',
      'width:min(560px,calc(100vw - 36px))',
      'max-height:84vh',
      'overflow:auto',
      'padding:16px',
      'border:1px solid rgba(126,255,176,.55)',
      'border-radius:10px',
      'background:rgba(4,14,10,.97)',
      'color:#effff5',
      'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,.55)'
    ].join(';');
    panel.innerHTML = `
      <h3 style="margin:0 0 8px">Multiplayer Release Candidate · F10</h3>
      <p style="margin:0 0 12px;color:#bce8cc">
        Complete this on localhost with <code>?mpDebug=1</code>. The final PASS requires
        automated health checks plus every manual two-client/deployment check.
      </p>
      <div data-role="summary" style="white-space:pre-wrap;margin-bottom:12px"></div>
      <div data-role="automated" style="margin-bottom:12px"></div>
      <fieldset style="border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:10px">
        <legend>Manual release checklist</legend>
        <div data-role="checklist"></div>
      </fieldset>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" data-action="refresh">Refresh</button>
        <button type="button" data-action="reset">Reset checklist</button>
        <button type="button" data-action="export">Export JSON</button>
        <button type="button" data-action="close">Close</button>
      </div>`;
    panel.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
      const key = input.dataset.checkKey;
      if (!key || !RELEASE_CANDIDATE_CHECKLIST.some((entry) => entry.key === key)) return;
      this.checklist = normalizeReleaseCandidateChecklist({
        ...this.checklist,
        [key]: input.checked
      });
      writeChecklist(this.checklist);
      this.evaluate();
      this.render();
    });
    panel.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'refresh') {
        this.refreshPolicy();
        this.evaluate();
        this.render();
      } else if (action === 'reset') {
        this.checklist = normalizeReleaseCandidateChecklist();
        writeChecklist(this.checklist);
        this.evaluate();
        this.render();
      } else if (action === 'export') {
        const stamp = new Date().toISOString().replaceAll(':', '-');
        downloadJson(`khadijas-arena-multiplayer-rc-${stamp}.json`, this.getExport());
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
      this.evaluate();
      this.render();
    }
    return this.visible;
  }

  render() {
    if (!this.panel || !this.visible || !this.result) return;
    const summary = this.panel.querySelector('[data-role="summary"]');
    const automated = this.panel.querySelector('[data-role="automated"]');
    const checklist = this.panel.querySelector('[data-role="checklist"]');
    const result = this.result;
    if (summary) {
      summary.innerHTML = [
        `<strong style="font-size:18px">Result: ${escapeHtml(result.status)}</strong>`,
        `Automated: ${result.summary.passedChecks} pass · ${result.summary.warningChecks} warn · ${result.summary.failedChecks} fail`,
        `Manual: ${result.summary.completedManualChecks}/${result.summary.totalManualChecks}`,
        `Players: ${result.summary.playerCount} · Worker handshake: ${result.summary.workerHandshakePassed ? 'accepted' : 'pending'}`,
        `Recovery: ${escapeHtml(result.summary.certificationStatus)} · Authority migrations: ${result.summary.authorityMigrations}`
      ].join('<br>');
    }
    if (automated) {
      automated.innerHTML = `<strong>Automated checks</strong><ul style="padding-left:20px">${result.checks
        .filter((entry) => entry.id !== 'manual-checklist')
        .map((entry) => `<li><strong>${escapeHtml(entry.status)}</strong> · ${escapeHtml(entry.label)}</li>`)
        .join('')}</ul>`;
    }
    if (checklist) {
      checklist.innerHTML = RELEASE_CANDIDATE_CHECKLIST.map(({ key, label }) => `
        <label style="display:flex;gap:8px;align-items:flex-start;margin:7px 0">
          <input type="checkbox" data-check-key="${escapeHtml(key)}" ${this.checklist[key] ? 'checked' : ''}>
          <span>${escapeHtml(label)}</span>
        </label>`).join('');
    }
  }

  update(now = nowMs()) {
    if (!this.initialized || now - this.lastUpdatedAt < UPDATE_INTERVAL_MS) return this.result;
    this.lastUpdatedAt = now;
    const wasAllowed = this.debugAllowed;
    this.refreshPolicy();
    if (this.debugAllowed && !wasAllowed) this.createPanel();
    this.evaluate();
    if (this.visible) this.render();
    return this.result;
  }

  getExport() {
    return {
      milestone: 'M3.31-M3.32',
      patch: MULTIPLAYER_RELEASE_CANDIDATE_PATCH,
      build: MULTIPLAYER_RELEASE_CANDIDATE_BUILD,
      protocol: MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL,
      exportedAt: new Date().toISOString(),
      result: this.result,
      evidence: this.capture()
    };
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      status: publicReportStatus(this.result),
      result: this.result,
      checklist: { ...this.checklist }
    };
  }

  destroy() {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.keyHandler);
    this.panel?.remove?.();
    this.panel = null;
    this.visible = false;
    this.initialized = false;
  }
}

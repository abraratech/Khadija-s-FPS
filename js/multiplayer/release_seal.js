// js/multiplayer/release_seal.js
// M3.37-M3.38 — localhost-only multiplayer release seal and deployment acceptance.

import {
  MULTIPLAYER_RELEASE_SEAL_BUILD,
  MULTIPLAYER_RELEASE_SEAL_PATCH,
  MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
  buildMultiplayerReleaseSealReport,
  evaluateMultiplayerReleaseSeal
} from './release_seal_core.js';
import {
  MULTIPLAYER_BUILD_ID,
  MULTIPLAYER_PROTOCOL_VERSION
} from './protocol.js';

const PANEL_ID = 'mp-release-seal';
const STORAGE_KEY = 'khadija:multiplayer-release-seal';
const EVALUATE_INTERVAL_MS = 750;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function statusOf(value, fallback = 'UNKNOWN') {
  return String(value?.status || value?.result?.status || fallback).trim().toUpperCase();
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

function readSavedSeal() {
  try {
    const value = window.localStorage?.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (parsed?.patch !== MULTIPLAYER_RELEASE_SEAL_PATCH
      || parsed?.build !== MULTIPLAYER_RELEASE_SEAL_BUILD
      || Number(parsed?.protocol) !== MULTIPLAYER_RELEASE_SEAL_PROTOCOL
      || parsed?.status !== 'PASS'
      || typeof parsed?.fingerprint !== 'string') {
      window.localStorage?.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSavedSeal(report) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(report));
    return true;
  } catch {
    return false;
  }
}

function clearSavedSeal() {
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export class MultiplayerReleaseSeal {
  constructor({
    releaseGuard,
    recoveryCertification,
    releaseCandidate,
    launchObserver,
    soakCertification
  } = {}) {
    this.releaseGuard = releaseGuard;
    this.recoveryCertification = recoveryCertification;
    this.releaseCandidate = releaseCandidate;
    this.launchObserver = launchObserver;
    this.soakCertification = soakCertification;
    this.initialized = false;
    this.debugAllowed = false;
    this.visible = false;
    this.panel = null;
    this.evidence = null;
    this.result = evaluateMultiplayerReleaseSeal();
    this.savedSeal = null;
    this.lastEvaluatedAt = -Infinity;
    this.keyHandler = (event) => {
      if (event.code !== 'F12' || event.shiftKey !== true || !this.debugAllowed) return;
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
    };
  }

  initialize(now = nowMs()) {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    this.refreshPolicy();
    if (this.debugAllowed && typeof window !== 'undefined') {
      this.savedSeal = readSavedSeal();
      window.addEventListener('keydown', this.keyHandler);
      this.createPanel();
    }
    this.evaluate(now);
    return this.getSnapshot();
  }

  refreshPolicy() {
    const guard = this.releaseGuard?.getSnapshot?.() || {};
    const allowed = guard?.policy?.allowed === true;
    const changed = allowed !== this.debugAllowed;
    this.debugAllowed = allowed;
    if (!allowed) {
      this.visible = false;
      this.panel?.remove?.();
      this.panel = null;
      if (typeof window !== 'undefined') {
        try {
          delete window.KHADIJA_MULTIPLAYER_RELEASE_SEAL;
          delete window.KHADIJA_MULTIPLAYER_RELEASE_FINGERPRINT;
        } catch {
          window.KHADIJA_MULTIPLAYER_RELEASE_SEAL = undefined;
          window.KHADIJA_MULTIPLAYER_RELEASE_FINGERPRINT = undefined;
        }
      }
    }
    return changed;
  }

  capture() {
    const patch = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_PATCH === 'string'
      ? window.KHADIJA_MULTIPLAYER_PATCH
      : MULTIPLAYER_RELEASE_SEAL_PATCH;
    const build = typeof window !== 'undefined' && typeof window.KHADIJA_MULTIPLAYER_BUILD === 'string'
      ? window.KHADIJA_MULTIPLAYER_BUILD
      : MULTIPLAYER_BUILD_ID;
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      build,
      patch,
      releaseGuard: this.releaseGuard?.getSnapshot?.() || null,
      recoveryCertification: this.recoveryCertification?.getSnapshot?.() || null,
      releaseCandidate: this.releaseCandidate?.getSnapshot?.() || null,
      launchObserver: this.launchObserver?.getSnapshot?.() || null,
      soakCertification: this.soakCertification?.getSnapshot?.() || null
    };
  }

  evaluate(now = nowMs()) {
    this.evidence = this.capture();
    this.result = evaluateMultiplayerReleaseSeal(this.evidence);
    this.lastEvaluatedAt = now;
    this.publishStatus();
    if (this.visible) this.render();
    return this.result;
  }

  publishStatus() {
    if (typeof window === 'undefined' || !this.debugAllowed) return;
    try {
      window.KHADIJA_MULTIPLAYER_RELEASE_SEAL = statusOf(this.result);
      window.KHADIJA_MULTIPLAYER_RELEASE_FINGERPRINT = this.result?.fingerprint || null;
    } catch {
      // Informational debug publication only.
    }
  }

  saveCurrentSeal() {
    if (!this.debugAllowed || this.result?.status !== 'PASS' || !this.result?.fingerprint) return false;
    const report = buildMultiplayerReleaseSealReport(this.evidence, this.result);
    if (!storeSavedSeal(report)) return false;
    this.savedSeal = report;
    this.render();
    return true;
  }

  clearSavedSeal() {
    const cleared = clearSavedSeal();
    if (cleared) this.savedSeal = null;
    this.render();
    return cleared;
  }

  update(now = nowMs()) {
    if (!this.initialized) return this.result;
    const wasAllowed = this.debugAllowed;
    this.refreshPolicy();
    if (this.debugAllowed && !wasAllowed && typeof window !== 'undefined') {
      this.savedSeal = readSavedSeal();
      window.addEventListener('keydown', this.keyHandler);
      this.createPanel();
    }
    if (!this.debugAllowed) return this.result;
    if (now - this.lastEvaluatedAt >= EVALUATE_INTERVAL_MS) this.evaluate(now);
    return this.result;
  }

  createPanel() {
    if (typeof document === 'undefined' || !document.body || this.panel || !this.debugAllowed) return;
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:18px', 'z-index:10060',
      'width:min(680px,calc(100vw - 36px))', 'max-height:88vh', 'overflow:auto',
      'padding:16px', 'border:1px solid rgba(255,214,102,.72)', 'border-radius:10px',
      'background:rgba(18,13,3,.97)', 'color:#fff9e8', 'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,.62)'
    ].join(';');
    panel.innerHTML = `
      <h3 style="margin:0 0 6px">Multiplayer Release Seal · Shift+F12</h3>
      <p style="margin:0 0 12px;opacity:.82">Aggregates F9–F12 certification evidence into a deterministic release fingerprint. Loopback <code>?mpDebug=1</code> only.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button type="button" data-seal-refresh>Refresh evidence</button>
        <button type="button" data-seal-save>Save PASS seal</button>
        <button type="button" data-seal-export>Export JSON</button>
        <button type="button" data-seal-clear>Clear saved seal</button>
        <button type="button" data-seal-close>Close</button>
      </div>
      <div data-seal-summary></div>
      <div data-seal-checks></div>
      <div data-seal-findings></div>`;
    panel.querySelector('[data-seal-refresh]')?.addEventListener('click', () => this.evaluate());
    panel.querySelector('[data-seal-save]')?.addEventListener('click', () => this.saveCurrentSeal());
    panel.querySelector('[data-seal-export]')?.addEventListener('click', () => {
      const report = buildMultiplayerReleaseSealReport(this.evidence, this.result);
      downloadJson(`khadija-multiplayer-release-seal-${Date.now()}.json`, report);
    });
    panel.querySelector('[data-seal-clear]')?.addEventListener('click', () => this.clearSavedSeal());
    panel.querySelector('[data-seal-close]')?.addEventListener('click', () => this.hide());
    document.body.appendChild(panel);
    this.panel = panel;
    this.render();
  }

  render() {
    if (!this.panel) return;
    const summary = this.panel.querySelector('[data-seal-summary]');
    const checks = this.panel.querySelector('[data-seal-checks]');
    const findings = this.panel.querySelector('[data-seal-findings]');
    const result = this.result || evaluateMultiplayerReleaseSeal(this.evidence || {});
    if (summary) {
      const saved = this.savedSeal?.fingerprint
        ? `<div>Saved seal: <code>${escapeHtml(this.savedSeal.fingerprint)}</code></div>`
        : '<div>Saved seal: none</div>';
      summary.innerHTML = `
        <div style="font-size:22px;font-weight:800;margin-bottom:6px">${escapeHtml(result.status)}</div>
        <div>Current fingerprint: <code>${escapeHtml(result.fingerprint || 'pending')}</code></div>
        <div>Patch: <code>${escapeHtml(MULTIPLAYER_RELEASE_SEAL_PATCH)}</code> · Build: <code>${escapeHtml(MULTIPLAYER_RELEASE_SEAL_BUILD)}</code> · Protocol: ${MULTIPLAYER_RELEASE_SEAL_PROTOCOL}</div>
        ${saved}`;
    }
    if (checks) {
      checks.innerHTML = `<h4 style="margin:12px 0 6px">Acceptance checks</h4>${(result.checks || []).map((entry) => (
        `<div style="padding:5px 0;border-top:1px solid rgba(255,255,255,.08)"><strong>${escapeHtml(entry.status)}</strong> · ${escapeHtml(entry.label)}</div>`
      )).join('') || '<div>No checks available.</div>'}`;
    }
    if (findings) {
      const rows = [
        ...(result.errors || []).map((entry) => ({ ...entry, severity: 'FAIL' })),
        ...(result.warnings || []).map((entry) => ({ ...entry, severity: 'WARN' }))
      ];
      findings.innerHTML = `<h4 style="margin:12px 0 6px">Blocking and pending findings</h4>${rows.length
        ? rows.map((entry) => `<div style="padding:5px 0"><strong>${escapeHtml(entry.severity)}</strong> · ${escapeHtml(entry.code)} · ${escapeHtml(entry.message)}</div>`).join('')
        : '<div>No findings. The release may be sealed.</div>'}`;
    }
  }

  show() {
    if (!this.debugAllowed) return false;
    this.createPanel();
    if (!this.panel) return false;
    this.visible = true;
    this.panel.hidden = false;
    this.evaluate();
    return true;
  }

  hide() {
    this.visible = false;
    if (this.panel) this.panel.hidden = true;
    return true;
  }

  toggle() {
    return this.visible ? this.hide() : this.show();
  }

  getExport() {
    return buildMultiplayerReleaseSealReport(this.evidence || this.capture(), this.result);
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      status: statusOf(this.result),
      fingerprint: this.result?.fingerprint || null,
      result: this.result,
      savedSeal: this.savedSeal ? {
        status: this.savedSeal.status,
        fingerprint: this.savedSeal.fingerprint,
        createdAt: this.savedSeal.createdAt,
        patch: this.savedSeal.patch,
        build: this.savedSeal.build,
        protocol: this.savedSeal.protocol
      } : null
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      try {
        delete window.KHADIJA_MULTIPLAYER_RELEASE_SEAL;
        delete window.KHADIJA_MULTIPLAYER_RELEASE_FINGERPRINT;
      } catch {
        window.KHADIJA_MULTIPLAYER_RELEASE_SEAL = undefined;
        window.KHADIJA_MULTIPLAYER_RELEASE_FINGERPRINT = undefined;
      }
    }
    this.panel?.remove?.();
    this.panel = null;
    this.visible = false;
    this.initialized = false;
  }
}

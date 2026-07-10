// js/multiplayer/soak_certification.js
// M3.35-M3.36 — localhost-only multiplayer burn-in soak certification and replay export.

import {
  MULTIPLAYER_SOAK_CERTIFICATION_BUILD,
  MULTIPLAYER_SOAK_CERTIFICATION_PATCH,
  MULTIPLAYER_SOAK_CERTIFICATION_PROTOCOL,
  MULTIPLAYER_SOAK_DEFAULT_TARGET_MS,
  MULTIPLAYER_SOAK_SAMPLE_INTERVAL_MS,
  createMultiplayerSoakState,
  recordMultiplayerSoakSample,
  evaluateMultiplayerSoakCertification,
  buildMultiplayerSoakIncidentReplay,
  normalizeMultiplayerSoakTargetMs,
  setMultiplayerSoakRunState
} from './soak_certification_core.js';

const PANEL_ID = 'mp-soak-certification';
const RENDER_INTERVAL_MS = 250;

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

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
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

function connectedPlayers(lobby = {}) {
  const players = lobby?.room?.players;
  return Array.isArray(players) ? players.filter((entry) => entry && entry.connected !== false).length : 0;
}

function networkMetric(snapshot, names, fallback = 0) {
  for (const name of names) {
    const value = Number(snapshot?.[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

export class MultiplayerSoakCertification {
  constructor({
    runtime,
    session,
    transport,
    lobby,
    releaseGuard,
    releaseCandidate,
    recoveryCertification,
    launchObserver
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.lobby = lobby;
    this.releaseGuard = releaseGuard;
    this.releaseCandidate = releaseCandidate;
    this.recoveryCertification = recoveryCertification;
    this.launchObserver = launchObserver;
    this.initialized = false;
    this.debugAllowed = false;
    this.visible = false;
    this.panel = null;
    this.state = createMultiplayerSoakState();
    this.result = evaluateMultiplayerSoakCertification(this.state);
    this.lastSampleAt = -Infinity;
    this.lastRenderedAt = -Infinity;
    this.keyHandler = (event) => {
      if (event.code !== 'F12' || event.shiftKey || !this.debugAllowed) return;
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
    this.lastSampleAt = now;
    this.publishStatus();
    return this.getSnapshot();
  }

  refreshPolicy() {
    const snapshot = this.releaseGuard?.getSnapshot?.() || {};
    this.debugAllowed = snapshot?.policy?.allowed === true;
    if (!this.debugAllowed) {
      this.visible = false;
      this.panel?.remove?.();
      this.panel = null;
      if (typeof window !== 'undefined') {
        try {
          delete window.KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION;
        } catch {
          window.KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION = undefined;
        }
      }
    }
    return this.debugAllowed;
  }

  captureSample(now = nowMs()) {
    const launch = this.launchObserver?.getSnapshot?.() || {};
    const session = this.session?.getSnapshot?.() || {};
    const transport = this.transport?.getConnectionSnapshot?.()
      || { state: this.transport?.getState?.() || 'disconnected' };
    const lobby = this.lobby?.getSnapshot?.() || {};
    const quality = this.runtime?.getNetworkQualitySnapshot?.(Date.now()) || {};
    const fault = this.runtime?.getFaultSimulationSnapshot?.() || {};
    const reconciliation = this.runtime?.getReconciliationSnapshot?.(Date.now()) || {};
    const continuity = launch?.continuity || {};
    let lossPct = networkMetric(quality, ['lossPct', 'packetLossPct', 'lossPercent'], NaN);
    if (!Number.isFinite(lossPct)) {
      const lossRate = networkMetric(quality, ['lossRate', 'packetLossRate'], 0);
      lossPct = lossRate <= 1 ? lossRate * 100 : lossRate;
    }
    return {
      at: now,
      deltaMs: Math.max(0, now - this.lastSampleAt),
      launchStatus: statusOf(launch),
      releaseCandidateStatus: statusOf(this.releaseCandidate?.getSnapshot?.()),
      recoveryCertificationStatus: statusOf(this.recoveryCertification?.getSnapshot?.()),
      transportState: String(transport?.state || this.transport?.getState?.() || 'unknown'),
      playerCount: connectedPlayers(lobby),
      runActive: session?.run?.active === true,
      faultActive: fault?.active === true || fault?.config?.enabled === true,
      queuedPackets: Number(fault?.queuedPackets) || 0,
      authorityEpochRegressed: continuity?.authorityEpochRegressed === true,
      disconnectedForMs: Number(continuity?.disconnectedForMs) || 0,
      recoveringForMs: Number(continuity?.recoveringForMs) || 0,
      rttMs: networkMetric(quality, ['rttMs', 'smoothedRttMs', 'roundTripMs', 'rtt'], 0),
      jitterMs: networkMetric(quality, ['jitterMs', 'smoothedJitterMs', 'jitter'], 0),
      lossPct,
      awaitingStreams: Array.isArray(reconciliation?.awaitingStreams) ? reconciliation.awaitingStreams.length : 0
    };
  }

  start(targetMs = MULTIPLAYER_SOAK_DEFAULT_TARGET_MS, now = nowMs()) {
    if (!this.debugAllowed) return false;
    this.state = createMultiplayerSoakState({
      targetMs: normalizeMultiplayerSoakTargetMs(targetMs),
      startedAt: now,
      running: true
    });
    this.state = setMultiplayerSoakRunState(this.state, { running: true, paused: false, complete: false, at: now, reason: 'manual-start' });
    this.result = evaluateMultiplayerSoakCertification(this.state);
    this.lastSampleAt = now;
    this.render();
    this.publishStatus();
    return true;
  }

  pause(now = nowMs()) {
    if (!this.state.running || this.state.paused || this.state.complete) return false;
    this.state = setMultiplayerSoakRunState(this.state, { running: true, paused: true, complete: false, at: now, reason: 'manual-pause' });
    this.result = evaluateMultiplayerSoakCertification(this.state);
    this.publishStatus();
    this.render();
    return true;
  }

  resume(now = nowMs()) {
    if (!this.state.running || !this.state.paused || this.state.complete) return false;
    this.state = setMultiplayerSoakRunState(this.state, { running: true, paused: false, complete: false, at: now, reason: 'manual-resume' });
    this.lastSampleAt = now;
    this.result = evaluateMultiplayerSoakCertification(this.state);
    this.publishStatus();
    this.render();
    return true;
  }

  finalize(now = nowMs()) {
    if (this.state.sampleCount === 0) return false;
    this.state = setMultiplayerSoakRunState(this.state, { running: false, paused: false, complete: true, at: now, reason: 'manual-finalize' });
    this.result = evaluateMultiplayerSoakCertification(this.state, { final: true });
    this.publishStatus();
    this.render();
    return true;
  }

  reset() {
    this.state = createMultiplayerSoakState();
    this.result = evaluateMultiplayerSoakCertification(this.state);
    this.lastSampleAt = nowMs();
    this.publishStatus();
    this.render();
    return true;
  }

  update(now = nowMs()) {
    if (!this.initialized) return this.result;
    const wasAllowed = this.debugAllowed;
    this.refreshPolicy();
    if (this.debugAllowed && !wasAllowed && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyHandler);
      this.createPanel();
    }
    if (!this.debugAllowed) return this.result;

    if (this.state.running && !this.state.paused && !this.state.complete && now - this.lastSampleAt >= MULTIPLAYER_SOAK_SAMPLE_INTERVAL_MS) {
      const sample = this.captureSample(now);
      this.state = recordMultiplayerSoakSample(this.state, sample);
      this.lastSampleAt = now;
      if (this.state.elapsedMs >= this.state.targetMs) {
        this.state = setMultiplayerSoakRunState(this.state, { running: false, paused: false, complete: true, at: now, reason: 'target-reached' });
        this.result = evaluateMultiplayerSoakCertification(this.state, { final: true });
      } else {
        this.result = evaluateMultiplayerSoakCertification(this.state);
      }
      this.publishStatus();
    }

    if (this.visible && now - this.lastRenderedAt >= RENDER_INTERVAL_MS) {
      this.lastRenderedAt = now;
      this.render();
    }
    return this.result;
  }

  publishStatus() {
    if (typeof window === 'undefined' || !this.debugAllowed) return;
    try {
      window.KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION = String(this.result?.status || 'IDLE');
    } catch {
      // Informational debug publication only.
    }
  }

  createPanel() {
    if (typeof document === 'undefined' || !document.body || this.panel || !this.debugAllowed) return;
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.style.cssText = [
      'position:fixed', 'left:18px', 'bottom:18px', 'z-index:10050',
      'width:min(660px,calc(100vw - 36px))', 'max-height:86vh', 'overflow:auto',
      'padding:16px', 'border:1px solid rgba(122,232,167,.68)', 'border-radius:10px',
      'background:rgba(3,14,12,.97)', 'color:#effff7', 'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,.58)'
    ].join(';');
    panel.innerHTML = `
      <h3 style="margin:0 0 6px">Multiplayer Burn-In Soak · F12</h3>
      <p style="margin:0 0 12px;opacity:.82">Clean two-client long-session certification and incident replay. Loopback <code>?mpDebug=1</code> only.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <label>Target <select data-soak-target>
          <option value="120000">2 minutes</option>
          <option value="300000" selected>5 minutes</option>
          <option value="900000">15 minutes</option>
          <option value="1800000">30 minutes</option>
        </select></label>
        <button type="button" data-soak-start>Start</button>
        <button type="button" data-soak-pause>Pause / Resume</button>
        <button type="button" data-soak-finalize>Finalize</button>
        <button type="button" data-soak-reset>Reset</button>
        <button type="button" data-soak-export>Export replay JSON</button>
        <button type="button" data-soak-close>Close</button>
      </div>
      <div data-soak-summary></div>
      <div data-soak-issues></div>
      <div data-soak-events></div>`;
    panel.querySelector('[data-soak-start]')?.addEventListener('click', () => {
      const value = Number(panel.querySelector('[data-soak-target]')?.value) || MULTIPLAYER_SOAK_DEFAULT_TARGET_MS;
      this.start(value);
    });
    panel.querySelector('[data-soak-pause]')?.addEventListener('click', () => {
      if (this.state.paused) this.resume(); else this.pause();
    });
    panel.querySelector('[data-soak-finalize]')?.addEventListener('click', () => this.finalize());
    panel.querySelector('[data-soak-reset]')?.addEventListener('click', () => this.reset());
    panel.querySelector('[data-soak-export]')?.addEventListener('click', () => {
      downloadJson(`khadija-multiplayer-soak-${Date.now()}.json`, this.getExport());
    });
    panel.querySelector('[data-soak-close]')?.addEventListener('click', () => this.hide());
    document.body.appendChild(panel);
    this.panel = panel;
    this.render();
  }

  render() {
    if (!this.panel) return;
    const summary = this.panel.querySelector('[data-soak-summary]');
    const issues = this.panel.querySelector('[data-soak-issues]');
    const events = this.panel.querySelector('[data-soak-events]');
    const result = this.result || evaluateMultiplayerSoakCertification(this.state);
    if (summary) {
      const progress = Math.round((result.progress || 0) * 100);
      summary.innerHTML = `
        <div style="font-size:20px;font-weight:700;margin-bottom:8px">${escapeHtml(result.status)}</div>
        <div>Progress: <strong>${progress}%</strong> · ${formatDuration(result.elapsedMs)} / ${formatDuration(result.targetMs)} · ${result.sampleCount} samples</div>
        <div>Coverage: connected ${Math.round((result.ratios?.connected || 0) * 100)}% · two-player ${Math.round((result.ratios?.twoPlayer || 0) * 100)}% · active run ${Math.round((result.ratios?.activeRun || 0) * 100)}%</div>
        <div>Worst network: RTT ${Math.round(result.metrics?.maxRttMs || 0)} ms · jitter ${Math.round(result.metrics?.maxJitterMs || 0)} ms · loss ${(result.metrics?.maxLossPct || 0).toFixed(1)}%</div>`;
    }
    if (issues) {
      const rows = [
        ...(result.errors || []).map((entry) => ({ ...entry, severity: 'FAIL' })),
        ...(result.warnings || []).map((entry) => ({ ...entry, severity: 'WARN' }))
      ];
      issues.innerHTML = `<h4 style="margin:12px 0 6px">Certification findings</h4>${rows.length
        ? rows.map((entry) => `<div style="padding:5px 0"><strong>${escapeHtml(entry.severity)}</strong> · ${escapeHtml(entry.code)} · ${escapeHtml(entry.message)}</div>`).join('')
        : '<div>No findings.</div>'}`;
    }
    if (events) {
      const recent = [...(this.state.events || [])].slice(-30).reverse();
      events.innerHTML = `<h4 style="margin:12px 0 6px">Incident replay (${this.state.events.length})</h4>${recent.length
        ? recent.map((entry) => `<div style="padding:5px 0;border-top:1px solid rgba(255,255,255,.08)"><strong>${escapeHtml(entry.severity)}</strong> · ${escapeHtml(entry.code)} · ${escapeHtml(entry.message)}</div>`).join('')
        : '<div>No transitions captured.</div>'}`;
    }
  }

  show() {
    if (!this.debugAllowed) return false;
    this.createPanel();
    if (!this.panel) return false;
    this.visible = true;
    this.panel.hidden = false;
    this.render();
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
    return {
      milestone: 'M3.35-M3.36',
      patch: MULTIPLAYER_SOAK_CERTIFICATION_PATCH,
      build: MULTIPLAYER_SOAK_CERTIFICATION_BUILD,
      protocol: MULTIPLAYER_SOAK_CERTIFICATION_PROTOCOL,
      exportedAt: new Date().toISOString(),
      result: this.result,
      replay: buildMultiplayerSoakIncidentReplay(this.state, this.result),
      launchObserver: this.launchObserver?.getSnapshot?.() || null,
      releaseCandidate: this.releaseCandidate?.getSnapshot?.() || null,
      recoveryCertification: this.recoveryCertification?.getSnapshot?.() || null
    };
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      status: String(this.result?.status || 'IDLE'),
      result: this.result,
      state: {
        running: this.state.running,
        paused: this.state.paused,
        complete: this.state.complete,
        elapsedMs: this.state.elapsedMs,
        targetMs: this.state.targetMs,
        sampleCount: this.state.sampleCount,
        events: [...(this.state.events || [])]
      }
    };
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      try {
        delete window.KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION;
      } catch {
        window.KHADIJA_MULTIPLAYER_SOAK_CERTIFICATION = undefined;
      }
    }
    this.panel?.remove?.();
    this.panel = null;
    this.visible = false;
    this.initialized = false;
  }
}

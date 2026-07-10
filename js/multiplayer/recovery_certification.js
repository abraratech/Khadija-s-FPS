// js/multiplayer/recovery_certification.js
import {
  RECOVERY_CERTIFICATION_STATES,
  createCertificationMetrics,
  evaluateRecoveryCertification,
  observeCertificationSample
} from './recovery_certification_core.js';

const SAMPLE_INTERVAL_MS = 250;
const STAGES = Object.freeze({
  BASELINE_MS: 4000,
  WIFI_MS: 8000,
  LOSSY_MS: 10000,
  DISCONNECT_SETTLE_MS: 1500,
  RECOVERY_TIMEOUT_MS: 25000,
  FINALIZE_MS: 5000
});

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export class MultiplayerRecoveryCertification {
  constructor({ runtime, session, transport, diagnostics } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.diagnostics = diagnostics;
    this.debugAllowed = runtime?.faultSimulator?.debugAllowed === true;
    this.initialized = false;
    this.visible = false;
    this.running = false;
    this.state = RECOVERY_CERTIFICATION_STATES.IDLE;
    this.stageStartedAt = null;
    this.lastSampleAt = -Infinity;
    this.metrics = createCertificationMetrics();
    this.result = null;
    this.samples = [];
    this.panel = null;
    this.disconnectTriggeredAt = null;
    this.recoveryStartedAt = null;
    this.keyHandler = (event) => {
      if (event.code !== 'F9' || !this.debugAllowed) return;
      event.preventDefault();
      this.toggle();
    };
  }

  initialize() {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    if (!this.debugAllowed) return this.getSnapshot();
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.keyHandler);
    this.createPanel();
    this.record('Certification harness initialized. Press F9 to open it.');
    return this.getSnapshot();
  }

  record(message, details = {}) {
    this.diagnostics?.record?.('certification', message, details);
  }

  createPanel() {
    if (typeof document === 'undefined' || !document.body || this.panel) return;
    const panel = document.createElement('section');
    panel.id = 'mp-recovery-certification';
    panel.hidden = true;
    panel.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:18px', 'z-index:10020',
      'width:min(440px,calc(100vw - 36px))', 'max-height:78vh', 'overflow:auto',
      'padding:16px', 'border:1px solid rgba(128,220,255,.55)', 'border-radius:10px',
      'background:rgba(4,11,18,.96)', 'color:#eaf7ff', 'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 18px 50px rgba(0,0,0,.5)'
    ].join(';');
    panel.innerHTML = `
      <h3 style="margin:0 0 8px">Multiplayer Recovery Certification · F9</h3>
      <p style="margin:0 0 10px;color:#a9c3d1">Run with two clients already inside an active co-op match. The harness applies Clean, Wi-Fi and Lossy stages, forces one reconnect, restores Clean, then issues PASS/WARN/FAIL.</p>
      <pre data-role="status" style="white-space:pre-wrap;background:#07131d;padding:10px;border-radius:6px;min-height:88px"></pre>
      <div data-role="result" style="margin:10px 0"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-action="start">Start certification</button>
        <button type="button" data-action="abort">Abort & restore clean</button>
        <button type="button" data-action="export">Export JSON</button>
        <button type="button" data-action="close">Close</button>
      </div>
      <p style="margin:10px 0 0;color:#8399a7">Debug-only. Activate the game with <code>?mpDebug=1</code>. Faults always return to Clean after completion or abort.</p>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    panel.querySelector('[data-action="start"]')?.addEventListener('click', () => this.start());
    panel.querySelector('[data-action="abort"]')?.addEventListener('click', () => this.abort('manual-abort'));
    panel.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      downloadJson(`khadija-mp-certification-${Date.now()}.json`, this.getExport());
    });
    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.toggle(false));
  }

  toggle(force = null) {
    if (!this.debugAllowed || !this.panel) return false;
    this.visible = force === null ? !this.visible : force === true;
    this.panel.hidden = !this.visible;
    if (this.visible) this.render();
    return this.visible;
  }

  preflight() {
    const mode = this.session?.mode;
    const active = this.session?.run?.active === true;
    const connected = this.transport?.getState?.() === 'connected';
    if (!active || (mode !== 'host' && mode !== 'client')) {
      return { accepted: false, reason: 'Start an online co-op run before certification.' };
    }
    if (!connected) {
      return { accepted: false, reason: 'Transport must be connected before certification.' };
    }
    return { accepted: true };
  }

  start(now = nowMs()) {
    if (!this.debugAllowed || this.running) return false;
    const preflight = this.preflight();
    if (!preflight.accepted) {
      this.result = { status: 'BLOCKED', failures: [{ message: preflight.reason }], warnings: [] };
      this.record('Certification blocked by preflight.', preflight);
      this.render();
      return false;
    }

    this.runtime?.configureFaultSimulation?.({ enabled: false });
    this.runtime?.clearFaultSimulationMetrics?.();
    const snapshot = this.captureSample();
    this.metrics = createCertificationMetrics();
    this.metrics.startedAt = Date.now();
    this.metrics.initialEnvelopeCount = snapshot.envelopesAccepted;
    this.metrics.initialResyncCount = snapshot.resyncRequestsSent;
    this.metrics.initialGapCount = snapshot.sequenceGapsDetected;
    this.samples = [];
    this.result = null;
    this.running = true;
    this.disconnectTriggeredAt = null;
    this.recoveryStartedAt = null;
    this.transition(RECOVERY_CERTIFICATION_STATES.BASELINE, now, 'Clean baseline started.');
    this.toggle(true);
    return true;
  }

  transition(state, now, message) {
    this.state = state;
    this.stageStartedAt = now;
    if (message) this.record(message, { state });
    this.render();
  }

  captureSample() {
    const runtime = this.runtime?.getSnapshot?.() || {};
    const reconciliation = runtime.reconciliation || {};
    const quality = runtime.networkQuality || {};
    const fault = this.runtime?.getFaultSimulationSnapshot?.() || {};
    return {
      at: Date.now(),
      state: this.state,
      transportState: this.transport?.getState?.() || 'unknown',
      authorityEpoch: runtime.authorityEpoch ?? 0,
      reconciliationStatus: reconciliation.status || 'WAITING',
      awaitingStreams: Array.isArray(reconciliation.awaitingStreams)
        ? reconciliation.awaitingStreams.slice()
        : [],
      worldAgeMs: Number.isFinite(Number(reconciliation.worldAgeMs))
        ? Number(reconciliation.worldAgeMs)
        : null,
      rttMs: quality.rttMs ?? null,
      jitterMs: quality.jitterMs ?? null,
      lossPercent: quality.lossPercent ?? 0,
      queuedPackets: fault.queuedPackets || 0,
      faultActive: fault.active === true,
      envelopesAccepted: Number(runtime.metrics?.envelopesAccepted) || 0,
      resyncRequestsSent: Number(runtime.metrics?.resyncRequestsSent) || 0,
      sequenceGapsDetected: Number(runtime.metrics?.sequenceGapsDetected) || 0
    };
  }

  observe(sample) {
    this.metrics = observeCertificationSample(this.metrics, sample);
    this.samples.push(sample);
    while (this.samples.length > 480) this.samples.shift();
  }

  recovered(sample) {
    const worldFresh = sample.worldAgeMs === null || sample.worldAgeMs <= 4000;
    return sample.transportState === 'connected'
      && sample.reconciliationStatus !== 'RECOVERING'
      && sample.awaitingStreams.length === 0
      && worldFresh;
  }

  update(now = nowMs()) {
    if (!this.initialized || !this.debugAllowed) return;
    if (!this.running) return;
    if (this.session?.run?.active !== true) {
      this.abort('run-ended');
      return;
    }
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = now;

    const sample = this.captureSample();
    this.observe(sample);
    const elapsed = now - this.stageStartedAt;

    if (sample.transportState !== 'connected' && this.disconnectTriggeredAt !== null) {
      this.metrics.disconnectObserved = true;
    }
    if (this.metrics.disconnectObserved && sample.transportState === 'connected') {
      this.metrics.reconnectObserved = true;
    }

    switch (this.state) {
      case RECOVERY_CERTIFICATION_STATES.BASELINE:
        if (elapsed >= STAGES.BASELINE_MS) {
          this.runtime?.faultSimulator?.applyPreset?.('wifi');
          this.transition(RECOVERY_CERTIFICATION_STATES.WIFI, now, 'Wi-Fi fault stage started.');
        }
        break;
      case RECOVERY_CERTIFICATION_STATES.WIFI:
        if (elapsed >= STAGES.WIFI_MS) {
          this.runtime?.faultSimulator?.applyPreset?.('lossy');
          this.transition(RECOVERY_CERTIFICATION_STATES.LOSSY, now, 'Lossy fault stage started.');
        }
        break;
      case RECOVERY_CERTIFICATION_STATES.LOSSY:
        if (elapsed >= STAGES.LOSSY_MS) {
          this.runtime?.faultSimulator?.applyPreset?.('wifi');
          this.disconnectTriggeredAt = now;
          this.recoveryStartedAt = Date.now();
          this.metrics.forcedDisconnectAccepted = this.runtime?.triggerSimulatedDisconnect?.() === true;
          this.transition(RECOVERY_CERTIFICATION_STATES.DISCONNECT, now, 'Forced reconnect stage started.');
        }
        break;
      case RECOVERY_CERTIFICATION_STATES.DISCONNECT:
        if (elapsed >= STAGES.DISCONNECT_SETTLE_MS || sample.transportState !== 'connected') {
          this.transition(RECOVERY_CERTIFICATION_STATES.RECOVERY, now, 'Waiting for authoritative recovery.');
        }
        break;
      case RECOVERY_CERTIFICATION_STATES.RECOVERY:
        if (this.recovered(sample)) {
          this.metrics.reconnectObserved = true;
          this.metrics.recoveryCompleted = true;
          this.metrics.recoveryDurationMs = Math.max(0, Date.now() - this.recoveryStartedAt);
          this.runtime?.faultSimulator?.applyPreset?.('clean');
          this.transition(RECOVERY_CERTIFICATION_STATES.FINALIZE, now, 'Recovery complete; final clean verification started.');
        } else if (Date.now() - this.recoveryStartedAt >= STAGES.RECOVERY_TIMEOUT_MS) {
          this.metrics.recoveryTimedOut = true;
          this.finish(now);
        }
        break;
      case RECOVERY_CERTIFICATION_STATES.FINALIZE:
        if (elapsed >= STAGES.FINALIZE_MS) this.finish(now);
        break;
      default:
        break;
    }

    if (this.visible) this.render();
  }

  finish(now = nowMs()) {
    this.runtime?.faultSimulator?.applyPreset?.('clean');
    this.runtime?.faultSimulator?.flush?.('certification-finished');
    const final = this.captureSample();
    this.observe(final);
    this.metrics.finishedAt = Date.now();
    this.metrics.finalEnvelopeCount = final.envelopesAccepted;
    this.metrics.finalResyncCount = final.resyncRequestsSent;
    this.metrics.finalGapCount = final.sequenceGapsDetected;
    this.metrics.finalTransportState = final.transportState;
    this.metrics.finalReconciliationStatus = final.reconciliationStatus;
    this.metrics.finalAwaitingStreams = final.awaitingStreams.slice();
    this.metrics.finalWorldAgeMs = final.worldAgeMs;
    this.metrics.finalFaultActive = final.faultActive;
    this.metrics.finalQueuedPackets = final.queuedPackets;
    this.result = evaluateRecoveryCertification(this.metrics);
    this.running = false;
    this.transition(RECOVERY_CERTIFICATION_STATES.COMPLETE, now, `Certification ${this.result.status}.`);
  }

  abort(reason = 'aborted') {
    if (!this.initialized) return false;
    this.runtime?.faultSimulator?.applyPreset?.('clean');
    this.runtime?.faultSimulator?.flush?.(`certification-${reason}`);
    const wasRunning = this.running;
    this.running = false;
    this.state = RECOVERY_CERTIFICATION_STATES.ABORTED;
    this.result = {
      status: 'ABORTED',
      failures: [],
      warnings: [{ code: 'ABORTED', message: `Certification stopped: ${reason}` }],
      summary: {}
    };
    this.record('Certification aborted and faults restored to Clean.', { reason });
    this.render();
    return wasRunning;
  }

  handleRunEnded() {
    if (this.running) this.abort('run-ended');
    else {
      this.runtime?.faultSimulator?.applyPreset?.('clean');
      this.runtime?.faultSimulator?.flush?.('run-ended');
    }
  }

  render() {
    if (!this.panel || !this.visible) return;
    const status = this.panel.querySelector('[data-role="status"]');
    const result = this.panel.querySelector('[data-role="result"]');
    const elapsed = this.stageStartedAt === null ? 0 : Math.max(0, nowMs() - this.stageStartedAt);
    if (status) {
      status.textContent = [
        `state=${this.state} running=${this.running ? 'yes' : 'no'}`,
        `stageElapsed=${Math.round(elapsed)}ms samples=${this.metrics.samples || 0}`,
        `disconnect=${this.metrics.disconnectObserved ? 'seen' : 'pending'} reconnect=${this.metrics.reconnectObserved ? 'seen' : 'pending'}`,
        `maxWorldAge=${Math.round(this.metrics.maxWorldAgeMs || 0)}ms maxRTT=${Math.round(this.metrics.maxRttMs || 0)}ms`,
        `authorityEpochRegressions=${this.metrics.authorityEpochRegressions || 0}`
      ].join('\n');
    }
    if (result) {
      if (!this.result) {
        result.innerHTML = '<strong>Result:</strong> pending';
      } else {
        const issues = [...(this.result.failures || []), ...(this.result.warnings || [])];
        result.innerHTML = `<strong>Result: ${escapeHtml(this.result.status)}</strong>${issues.length
          ? `<ul>${issues.map((entry) => `<li>${escapeHtml(entry.message)}</li>`).join('')}</ul>`
          : '<p>No recovery faults detected.</p>'}`;
      }
    }
  }

  getExport() {
    return {
      milestone: 'M3.27-M3.28',
      build: 'm3-recovery-certification-r1',
      exportedAt: new Date().toISOString(),
      state: this.state,
      running: this.running,
      result: this.result,
      metrics: { ...this.metrics },
      samples: this.samples.slice(),
      session: this.session?.getSnapshot?.() || null,
      transport: this.transport?.getConnectionSnapshot?.() || null,
      runtime: this.runtime?.getSnapshot?.() || null
    };
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      running: this.running,
      state: this.state,
      result: this.result,
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.handleRunEnded();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.keyHandler);
    this.panel?.remove?.();
    this.panel = null;
    this.initialized = false;
  }
}

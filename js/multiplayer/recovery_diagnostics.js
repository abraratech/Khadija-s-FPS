// js/multiplayer/recovery_diagnostics.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { MULTIPLAYER_FAULT_PRESETS } from './fault_simulator.js';

const MAX_TIMELINE = 240;
const POLL_INTERVAL_MS = 250;
const STUCK_RECOVERY_MS = 8000;
const STALE_WORLD_WARNING_MS = 6000;
const QUIET_ENVELOPE_WARNING_MS = 8000;

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

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${Math.max(0, Math.round(number))}ms`;
}

function downloadJson(name, value) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json'
  });
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

export class MultiplayerRecoveryDiagnostics {
  constructor({ eventBus, runtime, session, transport } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.debugAllowed = runtime?.faultSimulator?.debugAllowed === true;
    this.initialized = false;
    this.visible = false;
    this.timeline = [];
    this.unsubscribe = [];
    this.panel = null;
    this.lastPollAt = -Infinity;
    this.lastStatus = null;
    this.lastTransportState = null;
    this.lastAuthorityEpoch = null;
    this.lastAcceptedEnvelopeCount = 0;
    this.lastEnvelopeProgressAt = Date.now();
    this.recoveryStartedAt = null;
    this.warningKeys = new Map();
    this.keyHandler = (event) => {
      if (event.code !== 'F8' || !this.debugAllowed) return;
      event.preventDefault();
      this.toggle();
    };
  }

  initialize() {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    if (!this.debugAllowed) return this.getSnapshot();

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, (event) => {
        const payload = event?.payload || {};
        this.record('transport', `${payload.previousState || 'unknown'} → ${payload.state || 'unknown'}`, payload.details || {});
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        const room = event?.payload?.room || event?.payload || {};
        this.record('room', 'Room state changed', {
          hostPlayerId: room.hostPlayerId || null,
          playerCount: Array.isArray(room.players) ? room.players.length : null,
          runState: room.runState || null
        });
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_RUNTIME_EVENTS.AUTHORITY_EPOCH_CHANGED, (event) => {
        this.record('migration', 'Authority epoch changed', event?.payload || {});
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_RUNTIME_EVENTS.NETWORK_QUALITY_CHANGED, (event) => {
        const payload = event?.payload || {};
        this.record('quality', `${payload.previousLevel || 'WAITING'} → ${payload.snapshot?.level || 'WAITING'}`, payload.snapshot || {});
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_STATE_RESYNC_REQUEST_RECEIVED, (event) => {
        this.record('resync', 'Host received state resync request', event?.payload?.envelope?.payload || {});
      }) || (() => {})
    );
    this.unsubscribe.push(
      this.runtime?.faultSimulator?.subscribe((event) => {
        this.record('fault', event.kind, event.details || {});
      }) || (() => {})
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyHandler);
    }
    this.createPanel();
    this.record('diagnostics', 'M3.25–M3.26 diagnostics initialized', {
      shortcut: 'F8'
    });
    return this.getSnapshot();
  }

  record(category, message, details = {}) {
    const entry = {
      at: Date.now(),
      category: String(category || 'event'),
      message: String(message || ''),
      details
    };
    this.timeline.push(entry);
    while (this.timeline.length > MAX_TIMELINE) this.timeline.shift();
    if (this.visible) this.render();
    return entry;
  }

  warnOnce(key, message, details = {}, cooldownMs = 6000) {
    const now = Date.now();
    const previous = this.warningKeys.get(key) || -Infinity;
    if (now - previous < cooldownMs) return;
    this.warningKeys.set(key, now);
    this.record('warning', message, details);
  }

  update(now = nowMs()) {
    if (!this.initialized || !this.debugAllowed) return;
    if (now - this.lastPollAt < POLL_INTERVAL_MS) return;
    this.lastPollAt = now;

    const wallNow = Date.now();
    const runtime = this.runtime?.getSnapshot?.() || {};
    const reconciliation = runtime.reconciliation || {};
    const transportState = this.transport?.getState?.() || 'unknown';
    const authorityEpoch = runtime.authorityEpoch ?? null;
    const accepted = Number(runtime.metrics?.envelopesAccepted) || 0;

    if (reconciliation.status !== this.lastStatus) {
      this.record('reconciliation', `${this.lastStatus || 'NONE'} → ${reconciliation.status || 'WAITING'}`, {
        reason: reconciliation.pendingReason || null,
        awaiting: reconciliation.awaitingStreams || []
      });
      this.lastStatus = reconciliation.status || null;
    }
    if (transportState !== this.lastTransportState) {
      this.lastTransportState = transportState;
    }
    if (authorityEpoch !== this.lastAuthorityEpoch) {
      this.lastAuthorityEpoch = authorityEpoch;
    }

    if (accepted !== this.lastAcceptedEnvelopeCount) {
      this.lastAcceptedEnvelopeCount = accepted;
      this.lastEnvelopeProgressAt = wallNow;
    }

    if (reconciliation.status === 'RECOVERING') {
      if (this.recoveryStartedAt === null) this.recoveryStartedAt = wallNow;
      if (wallNow - this.recoveryStartedAt >= STUCK_RECOVERY_MS) {
        this.warnOnce('stuck-recovery', 'Recovery has remained stuck for more than 8 seconds', {
          pendingReason: reconciliation.pendingReason || null,
          awaitingStreams: reconciliation.awaitingStreams || [],
          recoveryAgeMs: wallNow - this.recoveryStartedAt
        });
      }
    } else {
      this.recoveryStartedAt = null;
    }

    const active = this.session?.run?.active === true;
    const connected = transportState === 'connected';
    if (active && connected && this.session?.mode === 'client') {
      if (
        Number.isFinite(reconciliation.worldAgeMs)
        && reconciliation.worldAgeMs >= STALE_WORLD_WARNING_MS
      ) {
        this.warnOnce('world-stale', 'Authoritative world snapshots are stale', {
          worldAgeMs: reconciliation.worldAgeMs,
          status: reconciliation.status
        });
      }
      if (wallNow - this.lastEnvelopeProgressAt >= QUIET_ENVELOPE_WARNING_MS) {
        this.warnOnce('envelope-stall', 'No accepted multiplayer envelopes for more than 8 seconds', {
          quietMs: wallNow - this.lastEnvelopeProgressAt,
          transportState
        });
      }
    }

    if (this.visible) this.render();
  }

  createPanel() {
    if (typeof document === 'undefined' || !document.body || this.panel) return;
    const panel = document.createElement('section');
    panel.id = 'mp-recovery-diagnostics';
    panel.hidden = true;
    panel.innerHTML = `
      <style>
        #mp-recovery-diagnostics{position:fixed;right:12px;top:12px;z-index:99999;width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:rgba(8,12,18,.96);color:#e7f2ff;border:1px solid #5a7b99;border-radius:10px;padding:12px;font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 12px 40px rgba(0,0,0,.5)}
        #mp-recovery-diagnostics h3{margin:0 0 8px;font:700 14px/1.2 system-ui,sans-serif;color:#8dd9ff}
        #mp-recovery-diagnostics .mp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:8px}
        #mp-recovery-diagnostics label{display:grid;gap:3px;color:#b9d3e8}
        #mp-recovery-diagnostics input,#mp-recovery-diagnostics select,#mp-recovery-diagnostics button{background:#111b26;color:#e7f2ff;border:1px solid #36516a;border-radius:5px;padding:5px;font:inherit}
        #mp-recovery-diagnostics button{cursor:pointer}
        #mp-recovery-diagnostics button:hover{border-color:#8dd9ff}
        #mp-recovery-diagnostics .mp-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
        #mp-recovery-diagnostics .mp-status{white-space:pre-wrap;background:#0b1118;border-radius:6px;padding:7px;margin:7px 0;color:#d4f3cf}
        #mp-recovery-diagnostics .mp-timeline{display:grid;gap:4px;max-height:250px;overflow:auto}
        #mp-recovery-diagnostics .mp-entry{border-left:3px solid #456b86;padding:4px 6px;background:rgba(255,255,255,.035)}
        #mp-recovery-diagnostics .mp-entry[data-category="warning"]{border-color:#ffba4d;color:#ffe0a7}
        #mp-recovery-diagnostics .mp-entry[data-category="fault"]{border-color:#d982ff}
        #mp-recovery-diagnostics .mp-help{color:#91a8ba;margin-top:6px}
      </style>
      <h3>Multiplayer Recovery Lab · F8</h3>
      <div class="mp-grid">
        <label>Preset<select data-field="preset"><option value="clean">Clean</option><option value="wifi">Wi-Fi</option><option value="highLatency">High latency</option><option value="lossy">Lossy</option><option value="chaos">Chaos</option></select></label>
        <label>Enabled<select data-field="enabled"><option value="false">Off</option><option value="true">On</option></select></label>
        <label>Outbound latency<input data-field="outboundLatencyMs" type="number" min="0" max="3000"></label>
        <label>Inbound latency<input data-field="inboundLatencyMs" type="number" min="0" max="3000"></label>
        <label>Jitter<input data-field="jitterMs" type="number" min="0" max="2000"></label>
        <label>Loss %<input data-field="lossPercent" type="number" min="0" max="95" step="0.25"></label>
        <label>Duplicate %<input data-field="duplicatePercent" type="number" min="0" max="25" step="0.25"></label>
        <label>Seed<input data-field="seed" type="number" min="1"></label>
      </div>
      <div class="mp-actions">
        <button data-action="apply">Apply</button>
        <button data-action="disconnect">Force reconnect</button>
        <button data-action="clear">Clear timeline</button>
        <button data-action="export">Export JSON</button>
        <button data-action="close">Close</button>
      </div>
      <div class="mp-status" data-role="status"></div>
      <div class="mp-timeline" data-role="timeline"></div>
      <div class="mp-help">Debug-only. Activate with <b>?mpDebug=1</b>. Faults are off by default and queues are flushed between runs.</div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;

    panel.querySelector('[data-field="preset"]')?.addEventListener('change', (event) => {
      const preset = MULTIPLAYER_FAULT_PRESETS[event.target.value] || MULTIPLAYER_FAULT_PRESETS.clean;
      this.fillConfig(preset);
    });
    panel.querySelector('[data-action="apply"]')?.addEventListener('click', () => this.applyForm());
    panel.querySelector('[data-action="disconnect"]')?.addEventListener('click', () => {
      this.runtime?.triggerSimulatedDisconnect?.();
    });
    panel.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      this.timeline.length = 0;
      this.runtime?.clearFaultSimulationMetrics?.();
      this.record('diagnostics', 'Timeline and fault counters cleared');
    });
    panel.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      downloadJson(`khadija-mp-diagnostics-${Date.now()}.json`, this.getExport());
    });
    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.toggle(false));
    this.fillConfig(this.runtime?.getFaultSimulationSnapshot?.()?.config || {});
  }

  fillConfig(config = {}) {
    if (!this.panel) return;
    Object.entries(config).forEach(([key, value]) => {
      const input = this.panel.querySelector(`[data-field="${key}"]`);
      if (input) input.value = String(value);
    });
  }

  applyForm() {
    if (!this.panel) return;
    const value = (name) => this.panel.querySelector(`[data-field="${name}"]`)?.value;
    const config = {
      enabled: value('enabled') === 'true',
      outboundLatencyMs: Number(value('outboundLatencyMs')),
      inboundLatencyMs: Number(value('inboundLatencyMs')),
      jitterMs: Number(value('jitterMs')),
      lossPercent: Number(value('lossPercent')),
      duplicatePercent: Number(value('duplicatePercent')),
      seed: Number(value('seed'))
    };
    const snapshot = this.runtime?.configureFaultSimulation?.(config);
    this.fillConfig(snapshot?.config || config);
    this.record('fault', 'Fault configuration applied', snapshot?.config || config);
  }

  toggle(force = null) {
    if (!this.debugAllowed || !this.panel) return false;
    this.visible = force === null ? !this.visible : force === true;
    this.panel.hidden = !this.visible;
    if (this.visible) {
      this.fillConfig(this.runtime?.getFaultSimulationSnapshot?.()?.config || {});
      this.render();
    }
    return this.visible;
  }

  render() {
    if (!this.panel || !this.visible) return;
    const runtime = this.runtime?.getSnapshot?.() || {};
    const reconciliation = runtime.reconciliation || {};
    const quality = runtime.networkQuality || {};
    const fault = this.runtime?.getFaultSimulationSnapshot?.() || {};
    const status = this.panel.querySelector('[data-role="status"]');
    if (status) {
      status.textContent = [
        `transport=${this.transport?.getState?.() || 'unknown'} mode=${this.session?.mode || 'local'}`,
        `sync=${reconciliation.status || 'WAITING'} reason=${reconciliation.pendingReason || 'none'}`,
        `worldAge=${formatMs(reconciliation.worldAgeMs)} awaiting=${(reconciliation.awaitingStreams || []).join(',') || 'none'}`,
        `RTT=${formatMs(quality.rttMs)} jitter=${formatMs(quality.jitterMs)} loss=${quality.lossPercent ?? 0}%`,
        `faults=${fault.active ? 'ON' : 'OFF'} queued=${fault.queuedPackets || 0} droppedOut=${fault.metrics?.outboundDropped || 0} droppedIn=${fault.metrics?.inboundDropped || 0}`,
        `authorityEpoch=${runtime.authorityEpoch ?? 0} gaps=${runtime.metrics?.sequenceGapsDetected || 0} resyncSent=${runtime.metrics?.resyncRequestsSent || 0}`
      ].join('\n');
    }
    const timeline = this.panel.querySelector('[data-role="timeline"]');
    if (timeline) {
      timeline.innerHTML = this.timeline.slice(-60).reverse().map((entry) => {
        const time = new Date(entry.at).toLocaleTimeString();
        return `<div class="mp-entry" data-category="${escapeHtml(entry.category)}"><b>${escapeHtml(time)} · ${escapeHtml(entry.category)}</b><br>${escapeHtml(entry.message)}</div>`;
      }).join('');
    }
  }

  getExport() {
    return {
      exportedAt: new Date().toISOString(),
      session: this.session?.getSnapshot?.() || null,
      transport: this.transport?.getConnectionSnapshot?.() || null,
      runtime: this.runtime?.getSnapshot?.() || null,
      faultSimulation: this.runtime?.getFaultSimulationSnapshot?.() || null,
      timeline: this.timeline.slice()
    };
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      debugAllowed: this.debugAllowed,
      visible: this.visible,
      timelineEntries: this.timeline.length,
      latest: this.timeline.at(-1) || null
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
    }
    this.panel?.remove?.();
    this.panel = null;
    this.initialized = false;
  }
}

// js/multiplayer/tab_transport_core.js
// M3.63-M3.64 — deterministic non-owner transport quiescence policy.

export const MULTIPLAYER_TAB_TRANSPORT_PATCH = 'm3-tab-ownership-seal-r1';
export const MULTIPLAYER_TAB_TRANSPORT_PROTOCOL = 6;
export const MULTIPLAYER_TAB_TRANSPORT_BUILD = 'm3-team-final-world-reconnect-r3';

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeState(value = '') {
  return cleanText(value).toLowerCase().slice(0, 40);
}

function normalizeMode(value = '') {
  return cleanText(value).toLowerCase().slice(0, 40);
}

export function evaluateMultiplayerTabTransport({
  lease = null,
  transportState = '',
  transportMode = '',
  hasConnectionOptions = false,
  quiesced = false
} = {}) {
  const leaseStatus = cleanText(lease?.status).toUpperCase().slice(0, 60);
  const leaseOwner = lease?.owner === true;
  const leaseBlocking = lease?.blocking === true;
  const state = normalizeState(transportState);
  const mode = normalizeMode(transportMode);
  const online = mode === 'online';
  const resumable = online && hasConnectionOptions === true;

  const base = {
    leaseStatus: leaseStatus || null,
    leaseOwner,
    leaseBlocking,
    transportState: state || null,
    transportMode: mode || null,
    hasConnectionOptions: hasConnectionOptions === true,
    quiesced: quiesced === true
  };

  if (!lease || typeof lease !== 'object') {
    return Object.freeze({
      ...base,
      status: 'WAITING',
      health: 'WARN',
      reason: 'tab-transport-awaiting-lease',
      action: 'NONE',
      blocking: true,
      final: false
    });
  }

  if (
    ['FAILED', 'STORAGE_BLOCKED', 'INVALID'].includes(leaseStatus)
    || (leaseBlocking && !leaseOwner)
  ) {
    if (!online || !hasConnectionOptions) {
      return Object.freeze({
        ...base,
        status: 'QUIESCED',
        health: 'PASS',
        reason: 'tab-transport-non-owner-no-online-socket',
        action: 'NONE',
        blocking: true,
        final: true
      });
    }

    if (quiesced === true || state === 'disconnected') {
      return Object.freeze({
        ...base,
        status: 'QUIESCED',
        health: 'PASS',
        reason: 'tab-transport-non-owner-quiesced',
        action: 'NONE',
        blocking: true,
        final: true
      });
    }

    return Object.freeze({
      ...base,
      status: 'QUIESCING',
      health: 'WARN',
      reason: 'tab-transport-non-owner-socket-active',
      action: 'QUIESCE',
      blocking: true,
      final: false
    });
  }

  if (leaseOwner) {
    if (!online) {
      return Object.freeze({
        ...base,
        status: 'OWNER_LOCAL',
        health: 'PASS',
        reason: 'tab-transport-owner-local-mode',
        action: 'NONE',
        blocking: false,
        final: true
      });
    }

    if (state === 'connected' && quiesced !== true) {
      return Object.freeze({
        ...base,
        status: 'OWNER_CONNECTED',
        health: 'PASS',
        reason: 'tab-transport-owner-connected',
        action: 'NONE',
        blocking: false,
        final: true
      });
    }

    if (resumable) {
      return Object.freeze({
        ...base,
        status: 'RESUMING',
        health: 'WARN',
        reason: 'tab-transport-owner-reconnect-required',
        action: 'RESUME',
        blocking: true,
        final: false
      });
    }

    return Object.freeze({
      ...base,
      status: 'OWNER_WAITING',
      health: 'WARN',
      reason: 'tab-transport-owner-connection-options-missing',
      action: 'NONE',
      blocking: true,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'INACTIVE',
    health: 'PASS',
    reason: 'tab-transport-no-active-owner',
    action: 'NONE',
    blocking: false,
    final: true
  });
}

// js/multiplayer/launch_observer_core.js
// M3.33-M3.34 — deterministic launch-session health evaluation and transition evidence.

export const MULTIPLAYER_LAUNCH_OBSERVER_PATCH = 'm3-suspend-resilience-seal-r1';
export const MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL = 6;
export const MULTIPLAYER_LAUNCH_OBSERVER_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_LAUNCH_OBSERVER_MAX_EVENTS = 160;

const RECOVERY_FAIL_AFTER_MS = 15000;
const DISCONNECT_FAIL_AFTER_MS = 12000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function check(id, status, label, details = {}) {
  return Object.freeze({
    id,
    status: cleanStatus(status),
    label,
    details: Object.freeze({ ...details })
  });
}

function issue(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function roomPlayers(lobby = {}) {
  const players = lobby?.room?.players;
  return Array.isArray(players)
    ? players.filter((entry) => entry && entry.connected !== false)
    : [];
}

function awaitingStreams(runtime = {}) {
  const streams = runtime?.reconciliation?.awaitingStreams;
  return Array.isArray(streams) ? streams.filter(Boolean).map(String) : [];
}

function releaseGate(releaseGuard = {}) {
  return releaseGuard?.gate && typeof releaseGuard.gate === 'object'
    ? releaseGuard.gate
    : null;
}

export function evaluateMultiplayerLaunchHealth({
  expectedProtocol = MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL,
  protocolVersion = expectedProtocol,
  expectedBuild = MULTIPLAYER_LAUNCH_OBSERVER_BUILD,
  build = expectedBuild,
  expectedPatch = MULTIPLAYER_LAUNCH_OBSERVER_PATCH,
  patch = expectedPatch,
  releaseGuard = null,
  releaseCandidate = null,
  recoveryCertification = null,
  session = null,
  transport = null,
  lobby = null,
  runtime = null,
  hostMigration = null,
  continuity = null,
  environment = null
} = {}) {
  const errors = [];
  const warnings = [];
  const passes = [];
  const checks = [];

  const guard = releaseGuard || {};
  const gate = releaseGate(guard);
  const candidate = releaseCandidate || {};
  const certification = recoveryCertification || {};
  const sessionSnapshot = session || {};
  const transportSnapshot = transport || {};
  const lobbySnapshot = lobby || {};
  const runtimeSnapshot = runtime || {};
  const migrationSnapshot = hostMigration || {};
  const continuitySnapshot = continuity || {};
  const context = environment || {};

  const players = roomPlayers(lobbySnapshot);
  const streams = awaitingStreams(runtimeSnapshot);
  const transportState = String(transportSnapshot.state || 'unknown').toLowerCase();
  const transportMode = String(transportSnapshot.mode || 'unknown').toLowerCase();
  const sessionMode = String(sessionSnapshot.mode || 'singleplayer').toLowerCase();
  const onlineMode = sessionMode === 'host' || sessionMode === 'client';
  const runActive = sessionSnapshot.run?.active === true;
  const fault = runtimeSnapshot.faultSimulation || {};
  const queuedPackets = finite(fault.queuedPackets);
  const faultActive = fault.active === true || fault.config?.enabled === true;
  const reconciliationStatus = cleanStatus(runtimeSnapshot?.reconciliation?.status, 'IDLE');
  const authorityEpoch = finite(
    migrationSnapshot?.authorityEpoch,
    finite(runtimeSnapshot?.authorityEpoch)
  );
  const disconnectedForMs = Math.max(0, finite(continuitySnapshot.disconnectedForMs));
  const recoveringForMs = Math.max(0, finite(continuitySnapshot.recoveringForMs));
  const authorityEpochRegressed = continuitySnapshot.authorityEpochRegressed === true;
  const candidateStatus = cleanStatus(candidate?.result?.status || candidate?.status, 'MISSING');
  const certificationStatus = cleanStatus(
    certification?.result?.status || certification?.state,
    'MISSING'
  );

  if (Number(protocolVersion) !== Number(expectedProtocol)) {
    errors.push(issue('PROTOCOL_MISMATCH', `Expected protocol ${expectedProtocol}, received ${protocolVersion}.`));
    checks.push(check('identity-protocol', 'FAIL', 'Frontend protocol identity'));
  } else {
    passes.push(issue('PROTOCOL_MATCH', `Protocol ${expectedProtocol} matches the launch observer.`));
    checks.push(check('identity-protocol', 'PASS', 'Frontend protocol identity'));
  }

  if (String(build || '') !== String(expectedBuild || '')) {
    errors.push(issue('BUILD_MISMATCH', `Expected build ${expectedBuild}, received ${build || 'missing'}.`));
    checks.push(check('identity-build', 'FAIL', 'Frontend build identity'));
  } else {
    passes.push(issue('BUILD_MATCH', `Build ${expectedBuild} matches the launch observer.`));
    checks.push(check('identity-build', 'PASS', 'Frontend build identity'));
  }

  if (String(patch || '') !== String(expectedPatch || '')) {
    errors.push(issue('PATCH_MISMATCH', `Expected patch ${expectedPatch}, received ${patch || 'missing'}.`));
    checks.push(check('identity-patch', 'FAIL', 'Frontend patch identity'));
  } else {
    passes.push(issue('PATCH_MATCH', `Patch ${expectedPatch} matches the launch observer.`));
    checks.push(check('identity-patch', 'PASS', 'Frontend patch identity'));
  }

  const gateErrors = Array.isArray(gate?.errors) ? gate.errors.filter(Boolean) : [];
  if (!gate) {
    errors.push(issue('RELEASE_GUARD_MISSING', 'The public-release guard has not published a gate result.'));
    checks.push(check('release-guard', 'FAIL', 'Public release guard'));
  } else if (cleanStatus(gate.status) === 'FAIL' || gateErrors.length > 0) {
    errors.push(issue('RELEASE_GUARD_FAILED', 'The public-release guard reports a blocking failure.', {
      errors: gateErrors.map(String)
    }));
    checks.push(check('release-guard', 'FAIL', 'Public release guard', { gateStatus: gate.status }));
  } else {
    passes.push(issue('RELEASE_GUARD_READY', 'The public-release guard has no blocking error.'));
    checks.push(check('release-guard', 'PASS', 'Public release guard', {
      gateStatus: gate.status,
      localDebug: guard?.policy?.allowed === true
    }));
  }

  if (faultActive || queuedPackets > 0) {
    errors.push(issue('FAULT_STATE_DIRTY', 'Fault simulation must be disabled with an empty packet queue.', {
      faultActive,
      queuedPackets
    }));
    checks.push(check('fault-state', 'FAIL', 'Fault simulator clean state'));
  } else {
    passes.push(issue('FAULT_STATE_CLEAN', 'Fault simulation is disabled and its queue is empty.'));
    checks.push(check('fault-state', 'PASS', 'Fault simulator clean state'));
  }

  if (candidateStatus === 'FAIL') {
    errors.push(issue('RELEASE_CANDIDATE_FAILED', 'The F10 release-candidate result is FAIL.'));
    checks.push(check('release-candidate', 'FAIL', 'Release-candidate approval'));
  } else if (candidateStatus !== 'PASS') {
    warnings.push(issue('RELEASE_CANDIDATE_PENDING', `The F10 release-candidate result is ${candidateStatus}.`));
    checks.push(check('release-candidate', 'WARN', 'Release-candidate approval', { candidateStatus }));
  } else {
    passes.push(issue('RELEASE_CANDIDATE_PASS', 'The F10 release-candidate result is PASS.'));
    checks.push(check('release-candidate', 'PASS', 'Release-candidate approval'));
  }

  if (certificationStatus === 'FAIL') {
    errors.push(issue('RECOVERY_CERTIFICATION_FAILED', 'Recovery certification reports FAIL.'));
    checks.push(check('recovery-certification', 'FAIL', 'Recovery certification'));
  } else if (certificationStatus !== 'PASS') {
    warnings.push(issue('RECOVERY_CERTIFICATION_PENDING', `Recovery certification is ${certificationStatus}.`));
    checks.push(check('recovery-certification', 'WARN', 'Recovery certification', { certificationStatus }));
  } else {
    passes.push(issue('RECOVERY_CERTIFICATION_PASS', 'Recovery certification reports PASS.'));
    checks.push(check('recovery-certification', 'PASS', 'Recovery certification'));
  }

  if (authorityEpochRegressed) {
    errors.push(issue('AUTHORITY_EPOCH_REGRESSION', 'Authority epoch moved backwards during the active session.', {
      authorityEpoch,
      highWaterEpoch: finite(continuitySnapshot.authorityEpochHighWater)
    }));
    checks.push(check('authority-continuity', 'FAIL', 'Authority epoch continuity'));
  } else {
    passes.push(issue('AUTHORITY_EPOCH_STABLE', 'No authority-epoch regression was detected.'));
    checks.push(check('authority-continuity', 'PASS', 'Authority epoch continuity', { authorityEpoch }));
  }

  if (onlineMode && runActive && transportState !== 'connected') {
    const details = { transportState, disconnectedForMs };
    if (disconnectedForMs >= DISCONNECT_FAIL_AFTER_MS) {
      errors.push(issue('ACTIVE_RUN_DISCONNECTED', 'The active online run has remained disconnected too long.', details));
      checks.push(check('transport-continuity', 'FAIL', 'Active-run transport continuity', details));
    } else {
      warnings.push(issue('ACTIVE_RUN_RECONNECTING', `The active online run transport is ${transportState}.`, details));
      checks.push(check('transport-continuity', 'WARN', 'Active-run transport continuity', details));
    }
  } else if (onlineMode && runActive) {
    passes.push(issue('ACTIVE_RUN_CONNECTED', 'The active online run transport is connected.'));
    checks.push(check('transport-continuity', 'PASS', 'Active-run transport continuity'));
  } else {
    passes.push(issue('NO_ACTIVE_ONLINE_RUN', 'No active online run requires transport continuity.'));
    checks.push(check('transport-continuity', 'PASS', 'Active-run transport continuity'));
  }

  const recovering = reconciliationStatus === 'RECOVERING' || streams.length > 0;
  if (runActive && recovering) {
    const details = { reconciliationStatus, awaitingStreams: streams, recoveringForMs };
    if (recoveringForMs >= RECOVERY_FAIL_AFTER_MS) {
      errors.push(issue('AUTHORITATIVE_RECOVERY_STALLED', 'Authoritative recovery has exceeded the launch-session threshold.', details));
      checks.push(check('authoritative-recovery', 'FAIL', 'Authoritative stream recovery', details));
    } else {
      warnings.push(issue('AUTHORITATIVE_RECOVERY_ACTIVE', 'Authoritative recovery is in progress.', details));
      checks.push(check('authoritative-recovery', 'WARN', 'Authoritative stream recovery', details));
    }
  } else {
    passes.push(issue('AUTHORITATIVE_RECOVERY_STABLE', 'No authoritative stream is awaiting recovery.'));
    checks.push(check('authoritative-recovery', 'PASS', 'Authoritative stream recovery', {
      reconciliationStatus,
      awaitingStreams: streams
    }));
  }

  if (onlineMode && runActive && players.length < 2) {
    warnings.push(issue('ROOM_PEER_COUNT_LOW', 'The active co-op run currently has fewer than two connected room players.', {
      playerCount: players.length
    }));
    checks.push(check('room-presence', 'WARN', 'Two-client room presence', { playerCount: players.length }));
  } else {
    passes.push(issue('ROOM_PRESENCE_OK', `${players.length} connected room player(s) observed.`));
    checks.push(check('room-presence', 'PASS', 'Two-client room presence', { playerCount: players.length }));
  }

  const handshakePassed = lobbySnapshot.connected === true
    && transportMode === 'online'
    && transportState === 'connected'
    && onlineMode;
  if (handshakePassed) {
    passes.push(issue('WORKER_HANDSHAKE_ACCEPTED', 'The online Worker/frontend handshake is active.'));
    checks.push(check('worker-handshake', 'PASS', 'Worker/frontend handshake'));
  } else if (onlineMode || runActive) {
    warnings.push(issue('WORKER_HANDSHAKE_PENDING', 'The online Worker/frontend handshake is not currently confirmed.', {
      lobbyConnected: lobbySnapshot.connected === true,
      transportMode,
      transportState,
      sessionMode
    }));
    checks.push(check('worker-handshake', 'WARN', 'Worker/frontend handshake'));
  } else {
    passes.push(issue('WORKER_HANDSHAKE_NOT_REQUIRED', 'No online room is currently active.'));
    checks.push(check('worker-handshake', 'PASS', 'Worker/frontend handshake'));
  }

  if (context.loopback === true && context.debugAllowed === true) {
    passes.push(issue('LOCAL_OBSERVER_HARNESS', 'F11 is running in explicit loopback debug mode.'));
    checks.push(check('observer-environment', 'PASS', 'Launch-observer environment'));
  } else if (context.debugAllowed === true) {
    errors.push(issue('NON_LOOPBACK_OBSERVER_EXPOSURE', 'The launch observer is enabled outside loopback.'));
    checks.push(check('observer-environment', 'FAIL', 'Launch-observer environment'));
  } else {
    passes.push(issue('PUBLIC_OBSERVER_LOCKED', 'The F11 observer surface is locked in public mode.'));
    checks.push(check('observer-environment', 'PASS', 'Launch-observer environment'));
  }

  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  return Object.freeze({
    status,
    checkedAt: Date.now(),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    passes: Object.freeze(passes),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      failedChecks: checks.filter((entry) => entry.status === 'FAIL').length,
      warningChecks: checks.filter((entry) => entry.status === 'WARN').length,
      passedChecks: checks.filter((entry) => entry.status === 'PASS').length,
      playerCount: players.length,
      runActive,
      onlineMode,
      transportState,
      reconciliationStatus,
      awaitingStreams: Object.freeze([...streams]),
      candidateStatus,
      certificationStatus,
      authorityEpoch,
      authorityEpochHighWater: finite(continuitySnapshot.authorityEpochHighWater, authorityEpoch),
      disconnectedForMs,
      recoveringForMs,
      handshakePassed
    })
  });
}

export function buildLaunchObserverFingerprint(evidence = {}, result = null) {
  const session = evidence.session || {};
  const transport = evidence.transport || {};
  const lobby = evidence.lobby || {};
  const runtime = evidence.runtime || {};
  const migration = evidence.hostMigration || {};
  const streams = awaitingStreams(runtime);
  const players = roomPlayers(lobby);
  const fault = runtime.faultSimulation || {};
  return Object.freeze({
    healthStatus: cleanStatus(result?.status, 'UNKNOWN'),
    transportState: String(transport.state || 'unknown').toLowerCase(),
    transportMode: String(transport.mode || 'unknown').toLowerCase(),
    sessionMode: String(session.mode || 'singleplayer').toLowerCase(),
    runActive: session.run?.active === true,
    roomCode: String(lobby?.room?.code || lobby?.roomCode || ''),
    playerCount: players.length,
    authorityEpoch: finite(migration.authorityEpoch, finite(runtime.authorityEpoch)),
    reconciliationStatus: cleanStatus(runtime?.reconciliation?.status, 'IDLE'),
    awaitingStreams: streams.join(','),
    releaseGuardStatus: cleanStatus(evidence.releaseGuard?.gate?.status, 'MISSING'),
    releaseCandidateStatus: cleanStatus(
      evidence.releaseCandidate?.result?.status || evidence.releaseCandidate?.status,
      'MISSING'
    ),
    certificationStatus: cleanStatus(
      evidence.recoveryCertification?.result?.status || evidence.recoveryCertification?.state,
      'MISSING'
    ),
    faultActive: fault.active === true || fault.config?.enabled === true,
    queuedPackets: finite(fault.queuedPackets)
  });
}

function event(at, type, severity, message, details = {}) {
  return Object.freeze({
    at: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
    type,
    severity,
    message,
    details: Object.freeze({ ...details })
  });
}

export function diffLaunchObserverFingerprints(previous, current, at = Date.now()) {
  if (!current) return Object.freeze([]);
  if (!previous) {
    return Object.freeze([
      event(at, 'observer-baseline', 'INFO', 'Launch-session observer baseline captured.', current)
    ]);
  }

  const events = [];
  const changed = (key) => previous[key] !== current[key];

  if (changed('healthStatus')) {
    const severity = current.healthStatus === 'FAIL'
      ? 'ERROR'
      : current.healthStatus === 'WARN'
        ? 'WARN'
        : 'INFO';
    events.push(event(at, 'health-status', severity, `Launch health changed from ${previous.healthStatus} to ${current.healthStatus}.`, {
      from: previous.healthStatus,
      to: current.healthStatus
    }));
  }

  if (changed('transportState')) {
    const severity = current.transportState === 'connected' ? 'INFO' : 'WARN';
    events.push(event(at, 'transport-state', severity, `Transport changed from ${previous.transportState} to ${current.transportState}.`, {
      from: previous.transportState,
      to: current.transportState
    }));
  }

  if (changed('sessionMode') || changed('runActive')) {
    events.push(event(at, 'session-state', 'INFO', `Session is ${current.sessionMode}; run active: ${current.runActive}.`, {
      previousMode: previous.sessionMode,
      mode: current.sessionMode,
      previousRunActive: previous.runActive,
      runActive: current.runActive
    }));
  }

  if (changed('roomCode')) {
    events.push(event(at, 'room-code', 'INFO', current.roomCode
      ? `Joined room ${current.roomCode}.`
      : 'Left the multiplayer room.', {
      from: previous.roomCode,
      to: current.roomCode
    }));
  }

  if (changed('playerCount')) {
    const severity = current.runActive && current.playerCount < 2 ? 'WARN' : 'INFO';
    events.push(event(at, 'player-count', severity, `Connected room player count changed to ${current.playerCount}.`, {
      from: previous.playerCount,
      to: current.playerCount
    }));
  }

  if (changed('authorityEpoch')) {
    const severity = current.authorityEpoch < previous.authorityEpoch ? 'ERROR' : 'INFO';
    events.push(event(at, 'authority-epoch', severity, `Authority epoch changed from ${previous.authorityEpoch} to ${current.authorityEpoch}.`, {
      from: previous.authorityEpoch,
      to: current.authorityEpoch
    }));
  }

  if (changed('reconciliationStatus') || changed('awaitingStreams')) {
    const recovering = current.reconciliationStatus === 'RECOVERING' || Boolean(current.awaitingStreams);
    events.push(event(at, 'reconciliation', recovering ? 'WARN' : 'INFO', recovering
      ? `Recovery active (${current.reconciliationStatus}); awaiting: ${current.awaitingStreams || 'none'}.`
      : `Reconciliation returned to ${current.reconciliationStatus}.`, {
      status: current.reconciliationStatus,
      awaitingStreams: current.awaitingStreams
    }));
  }

  if (changed('releaseGuardStatus')) {
    events.push(event(at, 'release-guard', current.releaseGuardStatus === 'FAIL' ? 'ERROR' : 'INFO', `Release guard changed to ${current.releaseGuardStatus}.`, {
      from: previous.releaseGuardStatus,
      to: current.releaseGuardStatus
    }));
  }

  if (changed('releaseCandidateStatus')) {
    const severity = current.releaseCandidateStatus === 'FAIL'
      ? 'ERROR'
      : current.releaseCandidateStatus === 'WARN'
        ? 'WARN'
        : 'INFO';
    events.push(event(at, 'release-candidate', severity, `Release candidate changed to ${current.releaseCandidateStatus}.`, {
      from: previous.releaseCandidateStatus,
      to: current.releaseCandidateStatus
    }));
  }

  if (changed('certificationStatus')) {
    const severity = current.certificationStatus === 'FAIL'
      ? 'ERROR'
      : current.certificationStatus === 'PASS'
        ? 'INFO'
        : 'WARN';
    events.push(event(at, 'recovery-certification', severity, `Recovery certification changed to ${current.certificationStatus}.`, {
      from: previous.certificationStatus,
      to: current.certificationStatus
    }));
  }

  if (changed('faultActive') || changed('queuedPackets')) {
    const dirty = current.faultActive || current.queuedPackets > 0;
    events.push(event(at, 'fault-simulator', dirty ? 'ERROR' : 'INFO', dirty
      ? `Fault simulator is dirty (active: ${current.faultActive}, queued: ${current.queuedPackets}).`
      : 'Fault simulator returned to a clean state.', {
      faultActive: current.faultActive,
      queuedPackets: current.queuedPackets
    }));
  }

  return Object.freeze(events);
}

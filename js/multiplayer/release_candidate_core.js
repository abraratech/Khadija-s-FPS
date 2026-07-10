// js/multiplayer/release_candidate_core.js
// M3.31-M3.32 — deterministic multiplayer release-candidate readiness evaluation.

export const MULTIPLAYER_RELEASE_CANDIDATE_PATCH = 'm3-final-certification-seal-r1';
export const MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL = 6;
export const MULTIPLAYER_RELEASE_CANDIDATE_BUILD = 'm3-team-final-world-reconnect-r3';

export const RELEASE_CANDIDATE_CHECKLIST = Object.freeze([
  Object.freeze({ key: 'twoClientsConnected', label: 'Two clients joined the same online room' }),
  Object.freeze({ key: 'remotePlayerVisible', label: 'Remote player movement and facing remain visible' }),
  Object.freeze({ key: 'sharedCombatWorld', label: 'Shared enemies, damage and world state stay synchronized' }),
  Object.freeze({ key: 'sharedEconomy', label: 'Score, purchases, doors, traps and Mystery Box stay synchronized' }),
  Object.freeze({ key: 'downedReviveSpectate', label: 'Downed, revive, spectating and team elimination behave correctly' }),
  Object.freeze({ key: 'reconnectRecovery', label: 'Forced disconnect reconnects and restores authoritative streams' }),
  Object.freeze({ key: 'hostMigration', label: 'Host migration preserves the active run and authority epoch' }),
  Object.freeze({ key: 'runSummary', label: 'Co-op scoreboard and final run summary are correct on both clients' }),
  Object.freeze({ key: 'publicDebugLockdown', label: 'Public build blocks F8/F9/F10/F11/F12/Shift+F12 and legacy debug activation routes' }),
  Object.freeze({ key: 'deploymentSmoke', label: 'Deployed frontend connects to the deployed Worker and starts a run' })
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function issue(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function check(id, status, label, details = {}) {
  return Object.freeze({
    id,
    status: cleanStatus(status),
    label,
    details: Object.freeze({ ...details })
  });
}

export function normalizeReleaseCandidateChecklist(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {};
  RELEASE_CANDIDATE_CHECKLIST.forEach(({ key }) => {
    normalized[key] = source[key] === true;
  });
  return Object.freeze(normalized);
}

function roomPlayers(lobby = {}) {
  const players = lobby?.room?.players;
  return Array.isArray(players) ? players.filter(Boolean) : [];
}

function awaitingStreams(runtime = {}) {
  const streams = runtime?.reconciliation?.awaitingStreams;
  return Array.isArray(streams) ? streams.filter(Boolean).map(String) : [];
}

function releaseGuardGate(releaseGuard = {}) {
  return releaseGuard?.gate && typeof releaseGuard.gate === 'object'
    ? releaseGuard.gate
    : null;
}

export function evaluateMultiplayerReleaseCandidate({
  expectedProtocol = MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL,
  protocolVersion = expectedProtocol,
  expectedBuild = MULTIPLAYER_RELEASE_CANDIDATE_BUILD,
  build = expectedBuild,
  expectedPatch = MULTIPLAYER_RELEASE_CANDIDATE_PATCH,
  patch = expectedPatch,
  releaseGuard = null,
  recoveryCertification = null,
  session = null,
  transport = null,
  lobby = null,
  runtime = null,
  hostMigration = null,
  checklist = null,
  environment = null
} = {}) {
  const errors = [];
  const warnings = [];
  const passes = [];
  const checks = [];
  const normalizedChecklist = normalizeReleaseCandidateChecklist(checklist);
  const guard = releaseGuard || {};
  const gate = releaseGuardGate(guard);
  const certification = recoveryCertification || {};
  const sessionSnapshot = session || {};
  const transportSnapshot = transport || {};
  const lobbySnapshot = lobby || {};
  const runtimeSnapshot = runtime || {};
  const migrationSnapshot = hostMigration || {};
  const context = environment || {};
  const players = roomPlayers(lobbySnapshot);
  const streams = awaitingStreams(runtimeSnapshot);
  const transportState = String(transportSnapshot.state || 'unknown');
  const transportMode = String(transportSnapshot.mode || 'unknown');
  const sessionMode = String(sessionSnapshot.mode || 'singleplayer');
  const runActive = sessionSnapshot.run?.active === true;
  const onlineMode = sessionMode === 'host' || sessionMode === 'client';
  const guardErrors = Array.isArray(gate?.errors) ? gate.errors.filter(Boolean) : [];
  const fault = runtimeSnapshot.faultSimulation || {};
  const queuedPackets = finite(fault.queuedPackets);
  const faultActive = fault.active === true || fault.config?.enabled === true;

  if (Number(protocolVersion) !== Number(expectedProtocol)) {
    errors.push(issue('PROTOCOL_MISMATCH', `Expected protocol ${expectedProtocol}, received ${protocolVersion}.`));
    checks.push(check('identity-protocol', 'FAIL', 'Frontend protocol identity'));
  } else {
    passes.push(issue('PROTOCOL_MATCH', `Protocol ${expectedProtocol} matches the release candidate.`));
    checks.push(check('identity-protocol', 'PASS', 'Frontend protocol identity'));
  }

  if (String(build || '') !== String(expectedBuild || '')) {
    errors.push(issue('BUILD_MISMATCH', `Expected build ${expectedBuild}, received ${build || 'missing'}.`));
    checks.push(check('identity-build', 'FAIL', 'Frontend build identity'));
  } else {
    passes.push(issue('BUILD_MATCH', `Build ${expectedBuild} matches the release candidate.`));
    checks.push(check('identity-build', 'PASS', 'Frontend build identity'));
  }

  if (String(patch || '') !== String(expectedPatch || '')) {
    errors.push(issue('PATCH_MISMATCH', `Expected patch ${expectedPatch}, received ${patch || 'missing'}.`));
    checks.push(check('identity-patch', 'FAIL', 'Frontend patch identity'));
  } else {
    passes.push(issue('PATCH_MATCH', `Patch ${expectedPatch} matches the release candidate.`));
    checks.push(check('identity-patch', 'PASS', 'Frontend patch identity'));
  }

  if (!gate) {
    errors.push(issue('RELEASE_GUARD_MISSING', 'The multiplayer public-release guard did not publish a gate result.'));
    checks.push(check('release-guard', 'FAIL', 'Public release guard'));
  } else if (cleanStatus(gate.status) === 'FAIL' || guardErrors.length > 0) {
    errors.push(issue('RELEASE_GUARD_FAILED', 'The multiplayer public-release guard reports a failure.', {
      errors: guardErrors.map(String)
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
    errors.push(issue('FAULT_SIMULATION_NOT_CLEAN', 'Fault simulation must be clean before release-candidate approval.', {
      faultActive,
      queuedPackets
    }));
    checks.push(check('fault-state', 'FAIL', 'Fault simulator clean state'));
  } else {
    passes.push(issue('FAULT_SIMULATION_CLEAN', 'Fault simulation is disabled and its queue is empty.'));
    checks.push(check('fault-state', 'PASS', 'Fault simulator clean state'));
  }

  const workerHandshakePassed = lobbySnapshot.connected === true
    && transportMode === 'online'
    && transportState === 'connected'
    && onlineMode;
  if (workerHandshakePassed) {
    passes.push(issue('WORKER_HANDSHAKE_ACCEPTED', 'The online Worker welcome handshake was accepted by the frontend.'));
    checks.push(check('worker-handshake', 'PASS', 'Worker/frontend build handshake'));
  } else {
    warnings.push(issue('WORKER_HANDSHAKE_PENDING', 'Connect to the deployed Worker before approving the release candidate.', {
      lobbyConnected: lobbySnapshot.connected === true,
      transportMode,
      transportState,
      sessionMode
    }));
    checks.push(check('worker-handshake', 'WARN', 'Worker/frontend build handshake'));
  }

  if (players.length >= 2) {
    passes.push(issue('TWO_CLIENT_ROOM', `${players.length} players are present in the online room.`));
    checks.push(check('room-player-count', 'PASS', 'Two-client room presence', { playerCount: players.length }));
  } else {
    warnings.push(issue('TWO_CLIENT_ROOM_PENDING', 'The release-candidate check requires at least two players in the room.', {
      playerCount: players.length
    }));
    checks.push(check('room-player-count', 'WARN', 'Two-client room presence', { playerCount: players.length }));
  }

  if (onlineMode && runActive && transportState === 'connected') {
    passes.push(issue('ACTIVE_ONLINE_RUN', 'An active online co-op run is connected.'));
    checks.push(check('active-online-run', 'PASS', 'Active online co-op run'));
  } else {
    warnings.push(issue('ACTIVE_ONLINE_RUN_PENDING', 'Start an online co-op run before final approval.', {
      onlineMode,
      runActive,
      transportState
    }));
    checks.push(check('active-online-run', 'WARN', 'Active online co-op run'));
  }

  const certificationStatus = cleanStatus(certification?.result?.status || certification?.state, 'MISSING');
  if (certificationStatus === 'PASS') {
    passes.push(issue('RECOVERY_CERTIFICATION_PASS', 'Recovery certification reports PASS.'));
    checks.push(check('recovery-certification', 'PASS', 'Recovery certification'));
  } else if (certificationStatus === 'FAIL') {
    errors.push(issue('RECOVERY_CERTIFICATION_FAIL', 'Recovery certification reports FAIL.'));
    checks.push(check('recovery-certification', 'FAIL', 'Recovery certification'));
  } else {
    warnings.push(issue('RECOVERY_CERTIFICATION_PENDING', `Recovery certification is ${certificationStatus}.`));
    checks.push(check('recovery-certification', 'WARN', 'Recovery certification', { certificationStatus }));
  }

  const reconciliationStatus = cleanStatus(runtimeSnapshot?.reconciliation?.status, 'WAITING');
  if (runActive && (reconciliationStatus === 'RECOVERING' || streams.length > 0)) {
    errors.push(issue('AUTHORITATIVE_RECOVERY_INCOMPLETE', 'Authoritative recovery is incomplete.', {
      reconciliationStatus,
      awaitingStreams: streams
    }));
    checks.push(check('authoritative-recovery', 'FAIL', 'Authoritative stream recovery'));
  } else {
    passes.push(issue('AUTHORITATIVE_RECOVERY_STABLE', 'No authoritative stream is currently waiting for recovery.'));
    checks.push(check('authoritative-recovery', 'PASS', 'Authoritative stream recovery', {
      reconciliationStatus,
      awaitingStreams: streams
    }));
  }

  const authorityMigrations = finite(runtimeSnapshot?.metrics?.authorityMigrations);
  const migrationEpoch = finite(
    migrationSnapshot?.authorityEpoch,
    finite(runtimeSnapshot?.authorityEpoch)
  );
  if (authorityMigrations > 0 || normalizedChecklist.hostMigration) {
    passes.push(issue('HOST_MIGRATION_EVIDENCE', 'Host migration evidence is present.', {
      authorityMigrations,
      authorityEpoch: migrationEpoch
    }));
    checks.push(check('host-migration-evidence', 'PASS', 'Host migration evidence'));
  } else {
    warnings.push(issue('HOST_MIGRATION_PENDING', 'Complete and confirm a host migration before final approval.'));
    checks.push(check('host-migration-evidence', 'WARN', 'Host migration evidence'));
  }

  if (context.loopback === true && context.debugAllowed === true) {
    passes.push(issue('LOCAL_DEBUG_HARNESS', 'The F10 release-candidate console is running in explicit loopback debug mode.'));
    checks.push(check('test-environment', 'PASS', 'Local release-candidate test environment'));
  } else if (context.loopback === false && context.debugAllowed === false) {
    passes.push(issue('PUBLIC_ENVIRONMENT', 'The runtime is in public mode with debug controls disabled.'));
    checks.push(check('test-environment', 'PASS', 'Public runtime environment'));
  } else {
    warnings.push(issue('ENVIRONMENT_UNCONFIRMED', 'The release-candidate environment could not be fully confirmed.', {
      loopback: context.loopback === true,
      debugAllowed: context.debugAllowed === true
    }));
    checks.push(check('test-environment', 'WARN', 'Release-candidate test environment'));
  }

  const incompleteChecklist = RELEASE_CANDIDATE_CHECKLIST
    .filter(({ key }) => normalizedChecklist[key] !== true)
    .map(({ key, label }) => ({ key, label }));
  if (incompleteChecklist.length > 0) {
    warnings.push(issue('MANUAL_CHECKLIST_INCOMPLETE', `${incompleteChecklist.length} manual release check(s) remain incomplete.`, {
      incomplete: incompleteChecklist
    }));
    checks.push(check('manual-checklist', 'WARN', 'Manual two-client and deployment checklist', {
      completed: RELEASE_CANDIDATE_CHECKLIST.length - incompleteChecklist.length,
      total: RELEASE_CANDIDATE_CHECKLIST.length
    }));
  } else {
    passes.push(issue('MANUAL_CHECKLIST_COMPLETE', 'All manual two-client and deployment checks are complete.'));
    checks.push(check('manual-checklist', 'PASS', 'Manual two-client and deployment checklist', {
      completed: RELEASE_CANDIDATE_CHECKLIST.length,
      total: RELEASE_CANDIDATE_CHECKLIST.length
    }));
  }

  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  return Object.freeze({
    status,
    checkedAt: Date.now(),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    passes: Object.freeze(passes),
    checks: Object.freeze(checks),
    checklist: normalizedChecklist,
    summary: Object.freeze({
      automatedChecks: checks.length,
      failedChecks: checks.filter((entry) => entry.status === 'FAIL').length,
      warningChecks: checks.filter((entry) => entry.status === 'WARN').length,
      passedChecks: checks.filter((entry) => entry.status === 'PASS').length,
      completedManualChecks: RELEASE_CANDIDATE_CHECKLIST.filter(({ key }) => normalizedChecklist[key]).length,
      totalManualChecks: RELEASE_CANDIDATE_CHECKLIST.length,
      playerCount: players.length,
      workerHandshakePassed,
      certificationStatus,
      authorityMigrations,
      authorityEpoch: migrationEpoch
    })
  });
}

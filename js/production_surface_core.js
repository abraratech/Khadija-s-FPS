// js/production_surface_core.js
// PROG.2 R1 — pure production-surface policy used by certification.

export const PRODUCTION_SURFACE_PATCH = 'prog2-r1-production-hardening-cloud-integrity';

export const REMOVED_PRODUCTION_PATHS = Object.freeze([
  'map_preview.html',
  'weapon_preview.html',
  'procedural_zombie_preview.html',
  'game/',
  '.wrangler/',
  'js/multiplayer/live_voice.js',
  'js/multiplayer/voice_readiness.js',
  'js/multiplayer/recovery_diagnostics.js',
  'js/multiplayer/recovery_certification.js',
  'js/multiplayer/release_candidate.js',
  'js/multiplayer/release_seal.js',
  'js/multiplayer/soak_certification.js',
  'js/multiplayer/fault_simulator.js',
  'multiplayer-server/src/voice_signal_core.js',
  'multiplayer-server/src/voice_turn_core.js'
]);

export const FORBIDDEN_PRODUCTION_GLOBALS = Object.freeze([
  'KHADIJA_LIVE_VOICE',
  'KHADIJA_VOICE_READINESS',
  'KASetAIDirectorDebug',
  'KAGetAIFinalDiagnostics',
  'KAExportAIDiagnostics',
  'KAGetCloudProfileDiagnostics',
  'KAGetCloudSyncQueue',
  'KAGetCloudSyncLease'
]);

export function inspectProductionSurface({
  mainSource = '',
  foundationSource = '',
  workerSource = '',
  releaseManifest = {}
} = {}) {
  const combined = `${mainSource}\n${foundationSource}\n${workerSource}`;
  const voiceTokens = [
    'getUserMedia',
    'RTCPeerConnection',
    'voice-signal',
    'voice-ice-config',
    'live_voice',
    'voice_readiness'
  ].filter((token) => combined.includes(token));
  const developmentTokens = [
    'recovery_diagnostics.js',
    'recovery_certification.js',
    'release_candidate.js',
    'release_seal.js',
    'soak_certification.js',
    'fault_simulator.js',
    'certification_pairing.js',
    'certification_session.js',
    'final_certification.js'
  ].filter((token) => combined.includes(token));
  const voiceManifest = releaseManifest?.m5Communication?.liveVoice
    || releaseManifest?.m5Communication?.voiceReadiness
    || null;
  return Object.freeze({
    patch: PRODUCTION_SURFACE_PATCH,
    voiceRemoved: voiceTokens.length === 0 && !voiceManifest,
    developmentRuntimeRemoved: developmentTokens.length === 0,
    textChatPreserved: foundationSource.includes("from './text_chat.js'"),
    progressionCommitExposed: workerSource.includes('/profiles/progression/commit'),
    voiceTokens: Object.freeze(voiceTokens),
    developmentTokens: Object.freeze(developmentTokens)
  });
}

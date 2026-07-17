// multiplayer-server/src/index.js

import { DurableObject } from 'cloudflare:workers';
import { LeaderboardHub } from './leaderboard_hub.js';
import { CloudProfileHub, CLOUD_PROFILE_SERVER_INFO } from './cloud_profile_hub.js';
import { buildTextChatMessage, consumeTextChatRate, sanitizeTextChatText } from './text_chat_core.js';
import { MatchmakingHub } from './matchmaking_hub.js';
import { SocialHub, SOCIAL1_SERVER_INFO } from './social_hub.js';
import {
  INTERNAL_SOCIAL_PROFILE_AUTH_HEADER,
  INTERNAL_SOCIAL_PROFILE_AUTH_PATH,
  buildSocialCredentialEnvelope
} from './social_auth_bridge_core.js';
import { OpsHub, OPS1_SERVER_INFO } from './ops_hub.js';
import { LIVE1_PATCH, LIVE1_SCHEMA, resolveLive1Manifest } from './live1_core.js';
import { POST_FINAL9_PATCH } from './postfinal9_economy_core.js';
import {
  PVP1_FEATURE_ENABLED,
  PVP1_MODE,
  PVP1_PATCH,
  PVP1_SCHEMA,
  assignPvp1Teams,
  createPvp1MatchState,
  isPvp1Mode,
  normalizePvp1Mode,
  pvp1ForfeitTeam,
  resolvePvp1Shot
} from './pvp1_core.js';
import { MATCHMAKING_PATCH, MATCHMAKING_SCHEMA } from './matchmaking_core.js';
import {
  BOT1_VIRTUAL_PLAYER_ID,
  isAuthoritativeTeamEliminated
} from './bot_team_elimination_core.js';
import { resolveRelayActorIdentity } from './bot_virtual_actor_core.js';
import {
  expiredHostRequiresElection,
  hostFlagsForPlayers,
  resolvePinnedHostPlayerId,
  shouldRetainHostDuringDisconnect
} from './host_authority_core.js';
import {
  ROOM_DIRECTORY_ADMISSION_TTL_MS,
  activeRoomAdmissionReservation,
  cleanupRoomAdmissionReservations,
  countActiveRoomAdmissionReservations,
  evaluateRoomDirectoryAdmission,
  roomKickActive
} from './room_directory_core.js';

export { LeaderboardHub, CloudProfileHub, MatchmakingHub, OpsHub };

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 64 * 1024;
const RATE_LIMIT_PER_SECOND = 180;
const DISCONNECT_GRACE_MS = 45_000;
const CHECKPOINT_WRITE_INTERVAL_MS = 750;
export { SocialHub };

const SERVER_PROTOCOL = 6;
const SERVER_BUILD = 'final2-consolidated-production-r1';
const SERVER_PATCH = 'final2-r1-full-product-certification';
const CERTIFIED_FRONTEND_SHA = '5511d393d7249b5487affa3616716ccb64593e99';
const CERTIFIED_SOURCE_SEAL = 'dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e';
const RELEASE_STATUS = 'CERTIFIED';
const COMPATIBLE_PROTOCOLS = new Set([5, 6]);

function pvp1Enabled(env) {
  const token = String(env?.PVP1_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled'].includes(token);
}

const POST_FINAL1_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: 'post-final1-r1-mobile-clarity-social-recovery',
  mobileClarity: true,
  socialRecovery: true,
  socialAuthErrorsPreserved: true,
  baseFinal2IdentityPreserved: true
});

const POST_FINAL2_R1_2_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: 'post-final2-r1-2-social-credential-envelope',
  workerLevelSocialAuthentication: true,
  deterministicCredentialEnvelope: true,
  authorizationHeaderNotForwardedAcrossDurableObjects: true,
  nestedDurableObjectAuthRemovedFromPublicPath: true,
  spoofedInternalAuthHeadersStripped: true,
  passkeyOnlySocialPolicyPreserved: true,
  baseFinal2IdentityPreserved: true
});

const POST_FINAL5_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: 'post-final5-r1-moderation-player-safety-operations',
  protectedModerationDashboard: true,
  pendingQueueAlerts: true,
  privacyReducedReportHistory: true,
  duplicateReportGrouping: true,
  falseReportAbuseSignals: true,
  reportForwardRetryQueue: true,
  accountRestrictionEnforcement: 'authenticated-online-surfaces',
  playerAppeals: true,
  reporterStatusPrivacy: 'received-or-review-complete-only',
  protocolUnchanged: true,
  workerChangeRequired: true
});

const POST_FINAL6_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: 'post-final6-r1-production-operations-hardening',
  sourceBaselineSha: CERTIFIED_FRONTEND_SHA,
  administratorAuthentication: 'passkey',
  administratorRoles: ['viewer', 'moderator', 'senior-moderator', 'owner'],
  administratorSessionHours: 8,
  sessionRevocation: true,
  staffInvitations: true,
  destructiveActionConfirmation: true,
  moderatorAssignment: true,
  internalCaseNotes: true,
  caseTimeline: true,
  restrictionExpiryManagement: true,
  auditExport: ['json', 'csv'],
  optionalWebhookAlerts: true,
  secretPresenceOnly: true,
  operationalVisibility: true,
  pagesWorkerCompatibilityVerification: true,
  protocolUnchanged: true,
  workerChangeRequired: true
});

const POST_FINAL9_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: POST_FINAL9_PATCH,
  sourceBaselineSha: 'bde3ff8d8fa5f29948c82ec4fa20959685e92846',
  certifiedFrontendBaselineSha: CERTIFIED_FRONTEND_SHA,
  serverAuthoritativeCurrencies: true,
  rewardReceiptLedger: 'idempotent-per-account-run-id',
  accountPrestige: true,
  factionReputationTracks: 4,
  weaponLoadoutMissionMastery: true,
  deterministicCollectionDrops: true,
  duplicateConversion: 'salvage',
  dailyWeeklyEconomyGoals: true,
  supportRoleBonuses: true,
  offlineReceiptReconciliation: true,
  cloudProfileSynchronization: true,
  lateJoinReconnectHostMigrationRewardIntegrity: true,
  protocolUnchanged: true,
  workerChangeRequired: true,
  frontendOnly: false
});

const POST_FINAL10_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: 'post-final10-r1-version1-stabilization-accessibility-performance',
  productVersion: '1.0.0',
  sourceBaselineSha: '56e98d32e0bf2587a592e1e45faab218bbfbfda4',
  certifiedFrontendBaselineSha: CERTIFIED_FRONTEND_SHA,
  accessibilityCertification: Object.freeze({
    textScale: true,
    captionScale: true,
    reducedMotion: true,
    reducedFlashes: true,
    highContrast: true,
    colorVisionModes: 5,
    colorIndependentSignals: true,
    focusAssist: true
  }),
  performanceGovernor: true,
  dynamicParticleBudget: true,
  backgroundTabConservation: true,
  degradedNetworkClassification: true,
  releasePreflightRetries: 3,
  controllerKeyboardMobileCertification: true,
  frontendWorkerCompatibilityVerification: true,
  certification: Object.freeze({
    javascriptSyntaxChecks: 388,
    frontendDeterministicTests: 137,
    workerDeterministicTests: 37,
    productionRuntimeFiles: 252,
    mapHeroChecks: 6,
    mp3AssetChecks: 43,
    status: 'CERTIFIED'
  }),
  finalProductCertification: 'VERSION_1_0',
  protocolUnchanged: true,
  workerChangeRequired: true,
  frontendOnly: false
});

const PVP1_SERVER_INFO = Object.freeze({
  schema: PVP1_SCHEMA,
  patch: PVP1_PATCH,
  productVersion: '1.1.0-pvp1',
  sourceBaselineSha: 'ddbdc3a4b478aa26a515e2dd8dbfc9449885c466',
  certifiedFrontendBaselineSha: CERTIFIED_FRONTEND_SHA,
  featureEnabled: PVP1_FEATURE_ENABLED,
  featureFlag: 'PVP1_ENABLED',
  mode: PVP1_MODE,
  privateRooms: true,
  publicMatchmaking: false,
  supportedTeamSizes: Object.freeze([1, 2]),
  bestOf: 5,
  roundsToWin: 3,
  serverAuthoritativeDamage: true,
  serverDistanceValidation: true,
  friendlyFireBlocked: true,
  separateWeaponBalance: true,
  aiEnemiesDisabled: true,
  aiWingmanDisabled: true,
  reviveDisabled: true,
  coopObjectivesDisabled: true,
  coopRewardReceiptsDisabled: true,
  reconnectGraceMs: DISCONNECT_GRACE_MS,
  hostMigrationPreserved: true,
  protocolUnchanged: true,
  workerChangeRequired: true,
  frontendOnly: false
});

const FINAL2_SERVER_INFO = Object.freeze({
  schema: 1,
  patch: SERVER_PATCH,
  status: 'CERTIFIED',
  sourceSeal: CERTIFIED_SOURCE_SEAL,
  deterministicTests: 140,
  javascriptSyntaxChecks: 339,
  productionRuntimeFiles: 236,
  mapHeroChecks: 6,
  systems: Object.freeze(['PROG.1','PROG.2','SOCIAL.1','MATCH.3','LOADOUT.1','COOP.2','CONTENT.1','LIVE.1','OPS.1']),
  voiceRuntimeRemoved: true,
  developmentArtifactsExcluded: true,
  workerSourceExcludedFromPages: true,
  administratorToolsExcludedFromPages: false,
  protectedAdministratorToolIncluded: true,
  secretsExcludedFromPages: true,
  crawlerLowProfilePreserved: true,
  baseModesPreserved: true,
  rollbackReady: true
});

const PRODUCTION_HARDENING = Object.freeze({
  patch: 'prog2-r1-production-hardening-cloud-integrity',
  voiceRuntimeRemoved: true,
  microphonePermissionRequested: false,
  textChatOnly: true,
  developmentRuntimeRemoved: true,
  progressionReceipts: 'server-validated-idempotent'
});

const CONTENT1_SERVER_INFO = Object.freeze({
  patch: 'content1-r1-objective-operations-encounter-variety',
  schema: 1,
  arenaCount: 6,
  objectiveOperations: true,
  dynamicEncounters: true,
  eliteTargets: true,
  hostAuthoritativeSnapshots: true,
  protectedProgressionReceipts: true
});

const LIVE1_SERVER_INFO = Object.freeze({
  patch: LIVE1_PATCH,
  schema: LIVE1_SCHEMA,
  manifestEndpoint: '/live/manifest',
  serverTimeAuthority: true,
  rollingSeasonLengthDays: 84,
  dailyRotation: true,
  weeklyRotation: true,
  longFormContracts: true,
  automaticProtectedClaims: true,
  clientClockTrusted: false
});

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

function safeName(value) {
  return String(value || 'Player')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 24) || 'Player';
}
function normalizeMaxPlayers(value) {
  return Math.max(2, Math.min(4, Math.floor(Number(value) || 4)));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageBytes(message) {
  if (typeof message === 'string') {
    return new TextEncoder().encode(message).byteLength;
  }
  if (message instanceof ArrayBuffer) return message.byteLength;
  if (ArrayBuffer.isView(message)) return message.byteLength;
  return Number.POSITIVE_INFINITY;
}

function parseAllowedOrigins(value) {
  const text = String(value || '*').trim();
  if (!text || text === '*') return null;
  return new Set(
    text.split(',').map((origin) => origin.trim()).filter(Boolean)
  );
}

function originAllowed(request, env) {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowed) return true;
  const origin = request.headers.get('origin');
  return !origin || allowed.has(origin);
}

function corsify(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function shortRequestHash(request) {
  const source = `${request.headers.get('cf-connecting-ip') || 'unknown'}|${request.headers.get('user-agent') || 'unknown'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function proxyLeaderboardRequest(request, env) {
  if (!env.LEADERBOARDS) return json({ ok: false, error: 'LEADERBOARD_BINDING_UNAVAILABLE' }, { status: 503 });
  const sourceUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('x-ka-region', String(request.cf?.country || 'ZZ'));
  headers.set('x-ka-rate-key', await shortRequestHash(request));
  headers.delete('cf-connecting-ip');
  const internal = new Request(`https://leaderboards.internal${sourceUrl.pathname}${sourceUrl.search}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual'
  });
  const id = env.LEADERBOARDS.idFromName('global-v1');
  const response = await env.LEADERBOARDS.get(id).fetch(internal);
  return corsify(response);
}

async function proxyCloudProfileRequest(request, env) {
  if (!env.CLOUD_PROFILES) return json({ ok: false, error: 'CLOUD_PROFILE_BINDING_UNAVAILABLE' }, { status: 503 });
  try {
    const sourceUrl = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('x-ka-rate-key', await shortRequestHash(request));
    headers.set('x-ka-region', String(request.cf?.country || 'ZZ'));
    const requestOrigin = String(request.headers.get('origin') || '').trim();
    headers.set('x-ka-origin', requestOrigin);
    try {
      headers.set('x-ka-rp-id', requestOrigin ? new URL(requestOrigin).hostname.toLowerCase() : '');
    } catch {
      headers.set('x-ka-rp-id', '');
    }
    headers.delete('cf-connecting-ip');
    const internal = new Request(`https://profiles.internal${sourceUrl.pathname}${sourceUrl.search}`, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual'
    });
    const id = env.CLOUD_PROFILES.idFromName('global-v1');
    const response = await env.CLOUD_PROFILES.get(id).fetch(internal);
    return corsify(response);
  } catch (error) {
    return json({
      ok: false,
      error: 'CLOUD_PROFILE_UPSTREAM_UNAVAILABLE',
      detail: String(error?.message || error || 'UNKNOWN').slice(0, 160)
    }, { status: 502 });
  }
}


const INTERNAL_SOCIAL_AUTH_HEADER = 'x-ka-internal-social-auth';
const INTERNAL_SOCIAL_ACCOUNT_HEADER = 'x-ka-social-account-id';
const INTERNAL_SOCIAL_NAME_HEADER = 'x-ka-social-display-name';

async function authenticateSocialProxyRequest(request, env) {
  if (!env.CLOUD_PROFILES) {
    return {
      ok: false,
      response: json({ ok: false, error: 'SOCIAL_AUTH_BINDING_UNAVAILABLE' }, { status: 503 })
    };
  }

  const sourceUrl = new URL(request.url);
  let rpId = '';
  try {
    const requestOrigin = String(request.headers.get('origin') || '').trim();
    rpId = requestOrigin ? new URL(requestOrigin).hostname.toLowerCase() : '';
  } catch {
    rpId = '';
  }

  const envelope = buildSocialCredentialEnvelope(request.headers, {
    region: String(request.cf?.country || 'ZZ').toUpperCase(),
    origin: String(request.headers.get('origin') || '').trim(),
    rpId
  });
  if (!envelope.ok) {
    return {
      ok: false,
      response: json({ ok: false, error: envelope.error }, { status: 401 })
    };
  }

  const internalHeaders = new Headers({
    'content-type': 'application/json; charset=utf-8',
    [INTERNAL_SOCIAL_PROFILE_AUTH_HEADER]: '1',
    'x-ka-rate-key': `social-proxy-auth-${envelope.value.accountId.slice(0, 64)}`
  });
  const id = env.CLOUD_PROFILES.idFromName('global-v1');
  const response = await env.CLOUD_PROFILES.get(id).fetch(
    new Request(`https://profiles.internal${INTERNAL_SOCIAL_PROFILE_AUTH_PATH}`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify(envelope.value)
    })
  );
  const value = await response.json().catch(() => ({}));
  if (!response.ok || value.ok !== true) {
    return {
      ok: false,
      response: json(
        { ok: false, error: String(value.error || `HTTP_${response.status}`).slice(0, 160) },
        { status: response.status || 401 }
      )
    };
  }
  const accountId = String(value.account?.accountId || '').trim();
  if (!/^cloud-[a-f0-9]{32}$/i.test(accountId) || value.account?.accountType !== 'passkey') {
    return {
      ok: false,
      response: json({ ok: false, error: 'PASSKEY_SOCIAL_REQUIRED' }, { status: 401 })
    };
  }
  const displayName = String(
    value.profile?.identity?.displayName
    || value.account?.accountLabel
    || 'Player'
  ).replace(/[<>\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24) || 'Player';
  return { ok: true, accountId, displayName };
}

async function proxySocialRequest(request, env) {
  if (!env.SOCIAL) {
    return json({ ok: false, error: 'SOCIAL_BINDING_UNAVAILABLE' }, { status: 503 });
  }
  try {
    const sourceUrl = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('x-ka-region', String(request.cf?.country || 'ZZ').toUpperCase());
    headers.set('x-ka-origin', String(request.headers.get('origin') || '').trim());
    headers.delete('cf-connecting-ip');

    // Public callers may never supply trusted Social identity context.
    headers.delete(INTERNAL_SOCIAL_AUTH_HEADER);
    headers.delete(INTERNAL_SOCIAL_ACCOUNT_HEADER);
    headers.delete(INTERNAL_SOCIAL_NAME_HEADER);

    const auth = await authenticateSocialProxyRequest(request, env);
    if (!auth.ok) return corsify(auth.response);

    headers.set(INTERNAL_SOCIAL_AUTH_HEADER, '1');
    headers.set(INTERNAL_SOCIAL_ACCOUNT_HEADER, auth.accountId);
    headers.set(INTERNAL_SOCIAL_NAME_HEADER, encodeURIComponent(auth.displayName));

    const internal = new Request(
      `https://social.internal${sourceUrl.pathname}${sourceUrl.search}`,
      {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual'
      }
    );
    const id = env.SOCIAL.idFromName('global-v1');
    const response = await env.SOCIAL.get(id).fetch(internal);
    return corsify(response);
  } catch (error) {
    return json({
      ok: false,
      error: 'SOCIAL_UPSTREAM_UNAVAILABLE',
      detail: String(error?.message || error || 'UNKNOWN').slice(0, 160)
    }, { status: 502 });
  }
}

async function proxyMatchmakingRequest(request, env) {
  if (!env.MATCHMAKING) {
    return json({
      ok: false,
      error: 'MATCHMAKING_BINDING_UNAVAILABLE'
    }, { status: 503 });
  }

  try {
    const sourceUrl = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set(
      'x-ka-region',
      String(
        request.cf?.continent
        || request.cf?.country
        || request.headers.get('x-ka-region')
        || 'ZZ'
      ).toUpperCase()
    );
    headers.delete('cf-connecting-ip');
    const internal = new Request(
      `https://matchmaking.internal${sourceUrl.pathname}${sourceUrl.search}`,
      {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : request.body,
        redirect: 'manual'
      }
    );
    const id = env.MATCHMAKING.idFromName('public-v1');
    const response = await env.MATCHMAKING.get(id).fetch(internal);
    return corsify(response);
  } catch (error) {
    return json({
      ok: false,
      error: 'MATCHMAKING_UPSTREAM_UNAVAILABLE',
      detail: String(error?.message || error || 'UNKNOWN').slice(0, 160)
    }, { status: 502 });
  }
}


async function proxyOpsRequest(request, env) {
  if (!env.OPS) {
    return json({ ok: false, error: 'OPS_BINDING_UNAVAILABLE' }, {
      status: 503
    });
  }
  try {
    const sourceUrl = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set(
      'x-ka-region',
      String(request.cf?.country || 'ZZ').toUpperCase()
    );
    headers.set('x-ka-ops-key', await shortRequestHash(request));
    const requestOrigin = String(request.headers.get('origin') || '').trim();
    if (requestOrigin) {
      headers.set('x-ka-origin', requestOrigin);
      try {
        headers.set('x-ka-rp-id', new URL(requestOrigin).hostname);
      } catch {}
    }
    headers.delete('cf-connecting-ip');
    const internal = new Request(
      `https://ops.internal${sourceUrl.pathname}${sourceUrl.search}`,
      {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : request.body,
        redirect: 'manual'
      }
    );
    const id = env.OPS.idFromName('global-v1');
    const response = await env.OPS.get(id).fetch(internal);
    return corsify(response);
  } catch {
    return json({
      ok: false,
      error: 'OPS_UPSTREAM_UNAVAILABLE'
    }, { status: 502 });
  }
}

function opsDurationBucket(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  if (value <= 120) return 'fast';
  if (value <= 500) return 'normal';
  if (value <= 1500) return 'slow';
  return 'very-slow';
}

async function recordOpsRouteMetric(request, env, {
  routeGroup,
  status,
  startedAt,
  reason = ''
} = {}) {
  if (!env.OPS) return false;
  try {
    const sourceHash = await shortRequestHash(request);
    const id = env.OPS.idFromName('global-v1');
    const response = await env.OPS.get(id).fetch(
      new Request('https://ops.internal/internal/ops/route', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-ops': '1'
        },
        body: JSON.stringify({
          eventId: `route-${crypto.randomUUID()}`,
          sourceHash,
          routeGroup: String(routeGroup || 'other').slice(0, 80),
          status: Math.max(0, Math.floor(Number(status) || 0)),
          method: String(request.method || 'GET').slice(0, 12),
          durationBucket: opsDurationBucket(Date.now() - startedAt),
          reason: String(reason || '').slice(0, 120),
          region: String(request.cf?.country || 'ZZ').slice(0, 16),
          releasePatch: SERVER_PATCH,
          timestamp: Date.now()
        })
      })
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function observeOpsResponse(
  responsePromise,
  request,
  env,
  ctx,
  routeGroup
) {
  const startedAt = Date.now();
  try {
    const response = await responsePromise;
    const record = recordOpsRouteMetric(request, env, {
      routeGroup,
      status: response.status,
      startedAt
    });
    if (ctx?.waitUntil) ctx.waitUntil(record);
    return response;
  } catch (error) {
    const record = recordOpsRouteMetric(request, env, {
      routeGroup,
      status: 599,
      startedAt,
      reason: 'UPSTREAM_EXCEPTION'
    });
    if (ctx?.waitUntil) ctx.waitUntil(record);
    throw error;
  }
}

function publicPlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    ready: player.ready === true,
    connected: player.connected === true,
    isHost: player.isHost === true,
    isBot: player.isBot === true,
    socialId: player.isBot === true
      ? ''
      : String(player.socialId || '').slice(0, 40),
    botProfile: player.botProfile ? String(player.botProfile).slice(0, 80) : null,
    joinedAt: Math.max(0, Number(player.joinedAt) || 0),
    joinedWave: Math.max(1, Math.floor(Number(player.joinedWave) || 1)),
    lateJoin: player.lateJoin === true,
    lateJoinProtectionUntil: Math.max(0, Number(player.lateJoinProtectionUntil) || 0),
    catchUpScore: Math.max(0, Math.floor(Number(player.catchUpScore) || 0)),
    connectionEpoch: player.isBot === true
      ? 0
      : Math.max(1, Math.floor(Number(player.connectionEpoch) || 1)),
    team: ['ALPHA', 'BRAVO'].includes(String(player.team || '').toUpperCase())
      ? String(player.team).toUpperCase()
      : null,
    pvpSlot: Math.max(0, Math.floor(Number(player.pvpSlot) || 0))
  };
}

function validStatsSnapshot(value) {
  return Boolean(value && Array.isArray(value.players) && value.team);
}

function validFinalSummary(value) {
  return Boolean(value && Array.isArray(value.players) && value.team);
}

function defaultRoom(roomCode) {
  return {
    roomId: makeId('room'),
    roomCode,
    sessionId: makeId('session'),
    status: 'waiting',
    hostPlayerId: null,
    settings: { maxPlayers: MAX_PLAYERS, mapId: 'grid_bunker', difficulty: 1, privacy: 'private', publicListing: false, locked: false, allowLateJoin: true, gameMode: 'coop' },
    players: {}, virtualPlayers: {}, kickedPlayers: {}, directoryAdmissions: {},
    runId: null,
    pvp: null,
    authorityEpoch: 0,
    authorityCheckpoint: null,
    finalSummary: null,
    matchmaking: null,
    revision: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export class ArenaRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.lastCheckpointWriteAt = 0;
    this.directoryFingerprintValue = null;

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ka-ping', 'ka-pong')
    );

    this.ctx.blockConcurrencyWhile(async () => {
      this.room = await this.ctx.storage.get('room') || null;
      if (this.room) {
        this.reconcileConnections();
      }
      if (this.room) {
        this.room.settings ||= {};
        this.room.settings.maxPlayers = normalizeMaxPlayers(
          this.room.settings.maxPlayers
        );
        this.room.settings.locked =
          this.room.settings.locked === true;
        this.room.settings.allowLateJoin =
          this.room.settings.allowLateJoin !== false;
        this.room.settings.publicListing =
          this.room.settings.publicListing === true;
        this.room.settings.gameMode = normalizePvp1Mode(
          this.room.settings.gameMode
        );
        if (isPvp1Mode(this.room.settings.gameMode)) {
          this.room.settings.maxPlayers = PVP1_FEATURE_ENABLED ? 4 : 2;
          this.room.settings.publicListing = false;
          this.room.settings.privacy = 'private';
          this.room.settings.allowLateJoin = false;
        }
        this.room.pvp ||= null;
        this.room.kickedPlayers ||= {};
        this.room.directoryAdmissions ||= {};
        this.room.virtualPlayers ||= {};
      }
    });
  }

  reconcileConnections() {
    if (!this.room) return;
    const connected = new Set();

    this.ctx.getWebSockets().forEach((socket) => {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment?.playerId) connected.add(attachment.playerId);
      } catch {
        // Ignore malformed old attachments.
      }
    });

    Object.values(this.room.players || {}).forEach((player) => {
      player.connected = connected.has(player.playerId);
    });
  }

  async resolveSocialIdentity({
    ticket,
    roomCode,
    playerId,
    displayName
  } = {}) {
    const cleanTicket = String(ticket || '').slice(0, 220);
    if (!cleanTicket) return null;
    if (!this.env.SOCIAL) throw new Error('SOCIAL_BINDING_UNAVAILABLE');
    const otherAccountIds = Object.values(this.room?.players || {})
      .map((entry) => String(entry?.socialAccountId || ''))
      .filter(Boolean);
    const id = this.env.SOCIAL.idFromName('global-v1');
    const response = await this.env.SOCIAL.get(id).fetch(
      new Request('https://social.internal/internal/social/tickets/consume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-room-social': '1'
        },
        body: JSON.stringify({
          ticket: cleanTicket,
          roomCode,
          playerId,
          displayName,
          otherAccountIds,
          context: `room:${String(this.room?.roomId || roomCode || '').slice(0, 100)}`
        })
      })
    );
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) {
      throw new Error(String(value.error || 'SOCIAL_IDENTITY_REJECTED'));
    }
    return {
      accountId: String(value.identity?.accountId || '').slice(0, 120),
      socialId: String(value.identity?.socialId || '').slice(0, 40),
      displayName: safeName(value.identity?.displayName || displayName)
    };
  }

  async checkExistingSocialAdmission(accountId) {
    const cleanId = String(accountId || '').slice(0, 120);
    if (!cleanId || !this.env.SOCIAL) return true;
    const otherAccountIds = Object.values(this.room?.players || {})
      .map((entry) => String(entry?.socialAccountId || ''))
      .filter((entry) => entry && entry !== cleanId);
    const id = this.env.SOCIAL.idFromName('global-v1');
    const response = await this.env.SOCIAL.get(id).fetch(
      new Request('https://social.internal/internal/social/admission/check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-room-social': '1'
        },
        body: JSON.stringify({
          accountId: cleanId,
          otherAccountIds
        })
      })
    );
    const value = await response.json().catch(() => ({}));
    return response.ok && value.ok === true && value.allowed !== false;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (
      request.method === 'POST'
      && url.pathname === '/matchmaking-reserve'
      && request.headers.get('x-ka-internal-matchmaking') === '1'
    ) {
      let reservation;
      try {
        reservation = await request.json();
      } catch {
        return json({ ok: false, error: 'INVALID_RESERVATION_JSON' }, {
          status: 400
        });
      }

      const roomCode = normalizeRoomCode(reservation?.roomCode);
      const matchId = String(reservation?.matchId || '').slice(0, 200);
      if (!ROOM_CODE_PATTERN.test(roomCode) || !matchId) {
        return json({ ok: false, error: 'INVALID_MATCH_RESERVATION' }, {
          status: 400
        });
      }

      const connected = this.connectedPlayers();
      if (
        connected.length > 0
        && this.room?.matchmaking?.matchId !== matchId
      ) {
        return json({ ok: false, error: 'ROOM_ALREADY_ACTIVE' }, {
          status: 409
        });
      }

      if (this.room?.matchmaking?.matchId === matchId) {
        return json({
          ok: true,
          roomCode,
          matchId,
          room: this.snapshot()
        });
      }

      this.room = defaultRoom(roomCode);
      this.room.settings = {
        ...this.room.settings,
        maxPlayers: normalizeMaxPlayers(reservation?.maxPlayers),
        mapId: String(reservation?.mapId || 'grid_bunker').slice(0, 80),
        difficulty: Number(reservation?.difficulty) || 1,
        privacy: 'public',
        publicListing: false,
        locked: false,
        allowLateJoin: true,
        gameMode: 'coop'
      };
      this.room.matchmaking = {
        matchId,
        region: String(reservation?.region || 'ZZ').slice(0, 16),
        reservedAt: Math.max(0, Number(reservation?.reservedAt) || Date.now()),
        expiresAt: Math.max(0, Number(reservation?.expiresAt) || 0)
      };
      await this.commit();
      return json({
        ok: true,
        roomCode,
        matchId,
        room: this.snapshot()
      });
    }

    if (
      request.method === 'POST'
      && url.pathname === '/directory-admission'
      && request.headers.get('x-ka-internal-room-directory') === '1'
    ) {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
      }
      const now = Date.now();
      this.cleanupDirectoryAdmissions(now);
      const playerId = String(body?.playerId || '').slice(0, 160);
      const admission = evaluateRoomDirectoryAdmission({
        room: this.room,
        playerId,
        now
      });
      if (!admission.ok) {
        return json(admission, { status: 409 });
      }
      const existingReservation = activeRoomAdmissionReservation(
        this.room.directoryAdmissions,
        playerId,
        { now }
      );
      const reservation = existingReservation || {
        playerId,
        token: makeId('room-admission'),
        listingId: String(body?.listingId || '').slice(0, 220),
        createdAt: now,
        expiresAt: now + ROOM_DIRECTORY_ADMISSION_TTL_MS
      };
      reservation.expiresAt = now + ROOM_DIRECTORY_ADMISSION_TTL_MS;
      this.room.directoryAdmissions[playerId] = reservation;
      await this.commit();
      await this.scheduleCleanup();
      return json({
        ...admission,
        admissionToken: reservation.token,
        admissionExpiresAt: reservation.expiresAt,
        reservedHumans: countActiveRoomAdmissionReservations(
          this.room.directoryAdmissions,
          { now }
        )
      });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade.' }, { status: 426 });
    }
    const roomCode = normalizeRoomCode(url.searchParams.get('room'));
    const playerId = String(url.searchParams.get('playerId') || '').slice(0, 160);
    const displayName = safeName(url.searchParams.get('name'));
    const mode = url.searchParams.get('mode') === 'create' ? 'create' : 'join';
    const requestedGameMode = normalizePvp1Mode(
      url.searchParams.get('gameMode')
    );
    const reconnectToken = String(
      url.searchParams.get('reconnectToken') || ''
    ).slice(0, 160);
    const admissionToken = String(
      url.searchParams.get('admissionToken') || ''
    ).slice(0, 280);
    const socialTicket = String(
      url.searchParams.get('socialTicket') || ''
    ).slice(0, 220);

    if (!ROOM_CODE_PATTERN.test(roomCode) || !playerId) {
      return json(
        { error: 'Invalid room code or player ID.' },
        { status: 400 }
      );
    }

    const priorSocial = this.room?.players?.[playerId] || null;
    let socialIdentity = priorSocial?.socialAccountId
      ? {
          accountId: priorSocial.socialAccountId,
          socialId: priorSocial.socialId || '',
          displayName: priorSocial.displayName || displayName
        }
      : null;
    try {
      if (socialTicket) {
        const resolved = await this.resolveSocialIdentity({
          ticket: socialTicket,
          roomCode,
          playerId,
          displayName
        });
        if (
          priorSocial?.socialAccountId
          && resolved?.accountId
          && resolved.accountId !== priorSocial.socialAccountId
        ) {
          return json(
            { error: 'Social identity does not match reconnecting player.' },
            { status: 403 }
          );
        }
        socialIdentity = resolved;
      } else if (
        priorSocial?.socialAccountId
        && !await this.checkExistingSocialAdmission(priorSocial.socialAccountId)
      ) {
        return json({ error: 'Blocked-player admission denied.' }, { status: 403 });
      }
    } catch (error) {
      return json({
        error: String(error?.message || error || 'Social identity rejected.').slice(0, 120)
      }, { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`player:${playerId}`]);

    const rejection = this.validateAdmission({
      roomCode,
      playerId,
      mode,
      reconnectToken,
      admissionToken
    });

    if (rejection) {
      server.serializeAttachment({
        playerId,
        rejected: true,
        connectedAt: Date.now()
      });
      server.send(JSON.stringify({
        kind: 'control',
        action: 'error',
        payload: { message: rejection }
      }));
      server.close(4001, rejection.slice(0, 120));
      return new Response(null, { status: 101, webSocket: client });
    }

    const acceptedReservation = activeRoomAdmissionReservation(
      this.room?.directoryAdmissions,
      playerId,
      { now: Date.now() }
    );
    if (
      acceptedReservation
      && admissionToken
      && acceptedReservation.token === admissionToken
    ) {
      delete this.room.directoryAdmissions[playerId];
    }

    if (
      !this.room
      || (
        this.connectedPlayers().length === 0
        && mode === 'create'
        && !this.room.players?.[playerId]
        && !this.room.matchmaking?.matchId
      )
    ) {
      this.room = defaultRoom(roomCode);
      this.room.settings.gameMode = (
        mode === 'create'
        && PVP1_FEATURE_ENABLED
        && pvp1Enabled(this.env)
      )
        ? requestedGameMode
        : 'coop';
      if (isPvp1Mode(this.room.settings.gameMode)) {
        this.room.settings.maxPlayers = 4;
        this.room.settings.privacy = 'private';
        this.room.settings.publicListing = false;
        this.room.settings.allowLateJoin = false;
        this.room.virtualPlayers = {};
      }
    }

    const existing = this.room.players[playerId] || null;
    const connectionEpoch = Math.max(
      1,
      Math.floor(Number(existing?.connectionEpoch) || 0) + 1
    );
    const isLateJoin = this.room.status === 'in-run' && !existing;
    const joinedWave = Math.max(
      1,
      Math.floor(
        Number(this.room.authorityCheckpoint?.world?.wave) || 1
      )
    );
    const catchUpScore = isLateJoin
      ? Math.max(500, Math.min(3500, 500 + (joinedWave - 1) * 250))
      : Math.max(0, Math.floor(Number(existing?.catchUpScore) || 0));
    const lateJoinProtectionUntil = isLateJoin
      ? Date.now() + 8_000
      : Math.max(
          0,
          Number(existing?.lateJoinProtectionUntil) || 0
        );
    const previousHostPlayerId = this.room.hostPlayerId || null;
    const token = existing?.reconnectToken || makeId('reconnect');
    const pinnedHostPlayerId = resolvePinnedHostPlayerId({
      currentHostPlayerId: previousHostPlayerId,
      joiningPlayerId: playerId,
      players: this.room.players
    });
    const isHost = pinnedHostPlayerId === playerId;

    this.room.hostPlayerId = pinnedHostPlayerId;
    const hostFlags = hostFlagsForPlayers(
      this.room.players,
      pinnedHostPlayerId
    );
    Object.values(this.room.players).forEach((entry) => {
      entry.isHost = hostFlags[entry.playerId] === true;
    });

    if (
      this.room.status === 'in-run'
      && previousHostPlayerId
      && previousHostPlayerId !== pinnedHostPlayerId
    ) {
      this.room.authorityEpoch = Math.max(
        0,
        Number(this.room.authorityEpoch) || 0
      ) + 1;
    }

    this.closeDuplicateSocket(playerId, server);

    this.room.players[playerId] = {
      playerId,
      displayName,
      ready: isHost ? true : existing?.ready === true,
      connected: true,
      isHost,
      reconnectToken: token, connectionEpoch,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      joinedAt: existing?.joinedAt || Date.now(), joinedWave: isLateJoin ? joinedWave : Math.max(1, Math.floor(Number(existing?.joinedWave) || 1)), lateJoin: isLateJoin || existing?.lateJoin === true, lateJoinProtectionUntil, catchUpScore,
      socialAccountId: socialIdentity?.accountId || existing?.socialAccountId || '',
      socialId: socialIdentity?.socialId || existing?.socialId || '',
      team: existing?.team || null,
      pvpSlot: Math.max(0, Math.floor(Number(existing?.pvpSlot) || 0)),
      pvpPose: existing?.pvpPose || null,
      lastSeenAt: Date.now()
    };

    if (isPvp1Mode(this.room.settings?.gameMode)) {
      const assignments = assignPvp1Teams(
        Object.values(this.room.players)
      );
      Object.values(this.room.players).forEach((entry) => {
        const assignment = assignments[entry.playerId] || null;
        entry.team = assignment?.team || null;
        entry.pvpSlot = assignment?.slot || 0;
      });
      this.room.virtualPlayers = {};
    }

    server.serializeAttachment({ playerId, reconnectToken: token, connectionEpoch,
      windowStartedAt: Date.now(),
      messagesInWindow: 0,
      connectedAt: Date.now()
    });

    await this.commit();

    server.send(JSON.stringify({
      kind: 'control',
      action: 'welcome',
      payload: {
        sessionId: this.room.sessionId,
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        reconnectToken: token, connectionEpoch,
        checkpoint: this.room.status === 'in-run'
          ? this.room.authorityCheckpoint
          : null, lateJoin: isLateJoin ? { playerId, joinedWave, catchUpScore, protectionUntil: lateJoinProtectionUntil, protectionMs: 8000 } : null,
        room: this.snapshot()
      }
    }));

    if (
      this.room.status === 'in-run'
      && isHost
      && previousHostPlayerId !== playerId
    ) {
      this.broadcastHostMigration({
        previousHostPlayerId,
        hostPlayerId: playerId,
        reason: 'host-reconnected-or-elected'
      });
    }
    this.broadcastRoomState();
    return new Response(null, { status: 101, webSocket: client });
  }

  cleanupDirectoryAdmissions(now = Date.now()) {
    if (!this.room) return false;
    const cleaned = cleanupRoomAdmissionReservations(
      this.room.directoryAdmissions,
      { now }
    );
    if (!cleaned.changed) return false;
    this.room.directoryAdmissions = { ...cleaned.reservations };
    return true;
  }

  validateAdmission({ roomCode, playerId, mode, reconnectToken, admissionToken }) {
    if (!this.room) {
      return mode === 'join' ? 'Room was not found.' : null;
    }

    const now = Date.now();
    this.cleanupDirectoryAdmissions(now);
    const connected = this.connectedPlayers();
    const existing = this.room.players?.[playerId];

    if (mode === 'create' && connected.length > 0) {
      return 'Room code is already in use. Create another room.';
    }

    if (this.room.roomCode !== roomCode) {
      return 'Room code mismatch.';
    }

    if (roomKickActive(this.room.kickedPlayers, playerId, this.room.sessionId, { now })) {
      return 'You were removed from this room by the host.';
    }

    const maxPlayers = normalizeMaxPlayers(this.room.settings?.maxPlayers);
    const reservation = activeRoomAdmissionReservation(
      this.room.directoryAdmissions,
      playerId,
      { now }
    );
    const hasAdmissionToken = Boolean(admissionToken);
    if (hasAdmissionToken) {
      if (!reservation || reservation.token !== admissionToken) {
        return 'Public room admission expired. Refresh the room list.';
      }
      const directoryAdmission = evaluateRoomDirectoryAdmission({
        room: this.room,
        playerId,
        now
      });
      if (!directoryAdmission.ok) {
        return 'This public room is no longer available. Refresh the room list.';
      }
    }

    if (!existing && this.room.settings?.locked === true) {
      return 'This room is locked by the host.';
    }
    if (
      !existing
      && this.room.status === 'in-run'
      && this.room.settings?.allowLateJoin === false
    ) {
      return 'Late joining is disabled for this run.';
    }

    const reservedHumans = countActiveRoomAdmissionReservations(
      this.room.directoryAdmissions,
      { now, excludePlayerId: playerId }
    );
    if (!existing && connected.length + reservedHumans >= maxPlayers) {
      return 'Room is full.';
    }

    if (existing) {
      const tokenMatches = Boolean(
        reconnectToken
        && existing.reconnectToken
        && reconnectToken === existing.reconnectToken
      );
      if (existing.connected && !tokenMatches) {
        return 'This player is already connected.';
      }
      if (!existing.connected && existing.reconnectToken && !tokenMatches) {
        return 'Reconnect token was rejected. Rejoin with a new browser session.';
      }
    }

    return null;
  }

  closeDuplicateSocket(playerId, keepSocket) {
    this.ctx.getWebSockets(`player:${playerId}`).forEach((socket) => {
      if (socket === keepSocket) return;
      try {
        socket.send(JSON.stringify({
          kind: 'control',
          action: 'error',
          payload: { message: 'Connection replaced by a reconnect.' }
        }));
        socket.close(4002, 'Reconnected elsewhere');
      } catch {
        // Ignore already-closed sockets.
      }
    });
  }

  connectedPlayers() {
    if (!this.room) return [];
    return Object.values(this.room.players || {}).filter(
      (player) => player.connected === true
    );
  }

  snapshot() {
    return {
      roomId: this.room.roomId,
      roomCode: this.room.roomCode,
      status: this.room.status,
      hostPlayerId: this.room.hostPlayerId,
      settings: { ...this.room.settings },
      players: [
        ...Object.values(this.room.players).map(publicPlayer),
        ...Object.values(this.room.virtualPlayers || {}).map(publicPlayer)
      ],
      virtualPlayersAuthoritative: true,
      runId: this.room.runId,
      authorityEpoch: Math.max(0, Number(this.room.authorityEpoch) || 0),
      revision: this.room.revision,
      finalSummary: this.room.finalSummary || null,
      pvp: this.room.pvp || null,
      matchmaking: this.room.matchmaking
        ? {
            public: true,
            matchId: this.room.matchmaking.matchId,
            region: this.room.matchmaking.region || 'ZZ'
          }
        : null
    };
  }

  async webSocketMessage(socket, message) {
    if (!this.room || messageBytes(message) > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Message too large');
      return;
    }

    const attachment = this.readAttachment(socket);
    if (!attachment?.playerId || attachment.rejected) return;

    if (!this.consumeRateLimit(socket, attachment)) {
      socket.close(4008, 'Message rate exceeded');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(
        typeof message === 'string'
          ? message
          : new TextDecoder().decode(message)
      );
    } catch {
      this.sendError(socket, 'Malformed JSON.');
      return;
    }

    const player = this.room.players[attachment.playerId];
    if (!player || player.connected !== true) return; if (Math.max(0, Math.floor(Number(player.connectionEpoch) || 0)) > 0 && Math.max(0, Math.floor(Number(attachment.connectionEpoch) || 0)) !== Math.max(0, Math.floor(Number(player.connectionEpoch) || 0))) return;
    player.lastSeenAt = Date.now();

    if (parsed?.kind === 'control') {
      await this.handleControl(socket, player, parsed.action, parsed.payload || {});
      return;
    }

    if (parsed?.kind === 'envelope' && parsed.envelope) {
      if (!COMPATIBLE_PROTOCOLS.has(Number(parsed.envelope.protocolVersion))) {
        this.sendError(socket, 'Unsupported multiplayer protocol.');
        return;
      }

      const relayIdentity = resolveRelayActorIdentity({
        senderPlayerId: player.playerId,
        hostPlayerId: this.room.hostPlayerId,
        envelope: parsed.envelope
      });
      if (!relayIdentity.accepted) {
        this.sendError(
          socket,
          `Virtual actor rejected: ${relayIdentity.reason || 'invalid identity'}.`
        );
        return;
      }

      const envelope = {
        ...parsed.envelope,
        protocolVersion: SERVER_PROTOCOL,
        sessionId: this.room.sessionId,
        runId: this.room.runId || parsed.envelope.runId || null,
        playerId: relayIdentity.actorPlayerId,
        senderPlayerId: relayIdentity.senderPlayerId,
        virtualActor: relayIdentity.virtualActor === true,
        authorityEpoch: Math.max(
          0,
          Number(this.room.authorityEpoch) || 0
        ),
        connectionEpoch: Math.max(
          1,
          Math.floor(Number(player.connectionEpoch) || 1)
        ),
        messageId: `${String(
          parsed.envelope.messageId
          || `${relayIdentity.actorPlayerId}:${parsed.envelope.type}:${parsed.envelope.sequence}`
        )}:sender-${player.playerId}:connection-${Math.max(
          1,
          Math.floor(Number(player.connectionEpoch) || 1)
        )}`,
        serverReceivedAt: Date.now()
      };

      const pvpRoom = isPvp1Mode(this.room.settings?.gameMode);
      if (pvpRoom && relayIdentity.virtualActor) {
        this.sendError(socket, 'AI virtual actors are disabled in PvP rooms.');
        return;
      }

      if (
        pvpRoom
        && envelope.type === 'player-snapshot'
        && envelope.payload?.state?.position
      ) {
        const position = envelope.payload.state.position;
        const numeric = {
          x: Number(position.x),
          y: Number(position.y),
          z: Number(position.z)
        };
        if (
          Number.isFinite(numeric.x)
          && Number.isFinite(numeric.y)
          && Number.isFinite(numeric.z)
        ) {
          player.pvpPose = {
            position: numeric,
            updatedAt: Date.now()
          };
        }
      }

      if (
        pvpRoom
        && [
          'world-snapshot',
          'economy-snapshot',
          'revive-state',
          'coop2-state',
          'content1-state',
          'run-stats'
        ].includes(envelope.type)
      ) {
        this.sendError(
          socket,
          'Co-Op authority messages are disabled in PvP rooms.'
        );
        return;
      }

      if (relayIdentity.virtualActor) {
        this.room.virtualPlayers ||= {};
        const state = envelope.payload?.state || {};
        const previous = this.room.virtualPlayers[BOT1_VIRTUAL_PLAYER_ID] || null;
        const nextVirtual = {
          playerId: BOT1_VIRTUAL_PLAYER_ID,
          displayName: safeName(state.displayName || previous?.displayName || 'ARENA WINGMATE'),
          ready: true,
          connected: true,
          isHost: false,
          isBot: true,
          botProfile: String(
            state.botProfile
            || envelope.payload?.botProfile
            || previous?.botProfile
            || 'bot1-late-join-companion-integrity-r2-8'
          ).slice(0, 80),
          joinedAt: previous?.joinedAt || Date.now(),
          joinedWave: Math.max(
            1,
            Math.floor(Number(previous?.joinedWave) || Number(this.room.authorityCheckpoint?.world?.wave) || 1)
          ),
          lateJoin: false,
          lateJoinProtectionUntil: 0,
          catchUpScore: 0
        };
        const rosterChanged = !previous
          || previous.displayName !== nextVirtual.displayName
          || previous.botProfile !== nextVirtual.botProfile
          || previous.connected !== true;
        this.room.virtualPlayers[BOT1_VIRTUAL_PLAYER_ID] = nextVirtual;
        if (rosterChanged) {
          await this.commit();
          this.broadcastRoomState();
        }
      }

      if (
        envelope.type === 'coop2-state'
        && envelope.payload?.kind === 'snapshot'
        && player.playerId !== this.room.hostPlayerId
      ) {
        this.sendError(socket, 'Only the current host can publish COOP.2 snapshots.');
        return;
      }

      if (
        envelope.type === 'content1-state'
        && envelope.payload?.kind === 'snapshot'
        && player.playerId !== this.room.hostPlayerId
      ) {
        this.sendError(socket, 'Only the current host can publish CONTENT.1 snapshots.');
        return;
      }

      if (
        envelope.type === 'run-stats'
        && (
          envelope.payload?.kind === 'snapshot'
          || envelope.payload?.kind === 'final'
        )
        && player.playerId !== this.room.hostPlayerId
      ) {
        this.sendError(socket, 'Only the current host can publish run statistics snapshots.');
        return;
      }

      if (
        envelope.type === 'run-stats'
        && envelope.payload?.kind === 'final'
        && validFinalSummary(envelope.payload.summary)
        && this.room.status !== 'in-run'
        && !this.room.finalSummary
      ) {
        this.room.finalSummary = envelope.payload.summary;
        await this.commit();
        this.broadcastRoomState();
      }

      if (this.isAuthorityCheckpointEnvelope(envelope)) {
        if (player.playerId !== this.room.hostPlayerId) {
          this.sendError(socket, 'Only the current host can publish authority snapshots.');
          return;
        }
        await this.captureAuthorityCheckpoint(envelope);
      }
      if (this.isTeamEliminatedReviveEnvelope(envelope)) {
        await this.finishRun({
          reason: 'team-eliminated',
          endedByPlayerId: player.playerId
        });
        return;
      }
      this.broadcast({
        kind: 'envelope',
        envelope
      }, { exclude: socket });
      return;
    }

    this.sendError(socket, 'Unsupported message type.');
  }

  isTeamEliminatedReviveEnvelope(envelope) {
    if (isPvp1Mode(this.room?.settings?.gameMode)) return false;
    if (
      envelope?.type !== 'revive-state'
      || envelope?.payload?.kind !== 'snapshot'
    ) return false;

    // BOT.1 R2.3: the AI wingmate is a host-authoritative virtual operative,
    // not a separate WebSocket connection. Mirror the revive authority's
    // terminal-state semantics and include that virtual operative so a
    // DOWNED host cannot be mistaken for a fully eliminated one-player team.
    return isAuthoritativeTeamEliminated({
      snapshotPlayers: envelope.payload?.snapshot?.players,
      connectedPlayerIds: this.connectedPlayers().map(
        (entry) => entry.playerId
      ),
      virtualPlayerIds: Object.values(this.room?.virtualPlayers || {})
        .filter((entry) => entry?.isBot === true && entry.connected !== false)
        .map((entry) => entry.playerId)
        .concat(BOT1_VIRTUAL_PLAYER_ID)
    });
  }

isAuthorityCheckpointEnvelope(envelope) {
    if (
      !envelope
      || this.room?.status !== 'in-run'
      || isPvp1Mode(this.room?.settings?.gameMode)
    ) return false;
    if (envelope.type === 'world-snapshot') return true;
    if (envelope.type === 'economy-snapshot') return true;
    if (
      envelope.type === 'coop2-state'
      && envelope.payload?.kind === 'snapshot'
    ) return true;
    if (
      envelope.type === 'content1-state'
      && envelope.payload?.kind === 'snapshot'
    ) return true;
    if (
      envelope.type === 'run-stats'
      && (
        envelope.payload?.kind === 'snapshot'
        || envelope.payload?.kind === 'final'
      )
    ) {
      return true;
    }
    return envelope.type === 'revive-state'
      && envelope.payload?.kind === 'snapshot';
  }

  async captureAuthorityCheckpoint(envelope) {
    if (!this.room || !this.room.runId) return false;
    const checkpoint = this.room.authorityCheckpoint || {
      runId: this.room.runId,
      authorityEpoch: this.room.authorityEpoch || 0, authorityConnectionEpoch: Math.max(1, Math.floor(Number(envelope.connectionEpoch) || 1)),
      updatedAt: 0,
      world: null,
      economy: null,
      revive: null,
      coop2: null,
      content1: null,
      stats: null,
      finalSummary: this.room.finalSummary || null
    };

    checkpoint.runId = this.room.runId;
    checkpoint.authorityEpoch = Math.max(
      0,
      Number(this.room.authorityEpoch) || 0
    ); checkpoint.authorityConnectionEpoch = Math.max(1, Math.floor(Number(envelope.connectionEpoch) || 1));
    checkpoint.updatedAt = Date.now();

    if (envelope.type === 'world-snapshot') {
      checkpoint.world = envelope.payload;
    } else if (envelope.type === 'economy-snapshot') {
      checkpoint.economy = envelope.payload;
    } else if (envelope.type === 'revive-state') {
      checkpoint.revive = envelope.payload?.snapshot || null;
    } else if (envelope.type === 'coop2-state') {
      checkpoint.coop2 = envelope.payload?.snapshot || null;
    } else if (envelope.type === 'content1-state') {
      checkpoint.content1 = envelope.payload?.snapshot || null;
    } else if (envelope.type === 'run-stats') {
      if (
        envelope.payload?.kind === 'snapshot'
        && validStatsSnapshot(envelope.payload.snapshot)
      ) {
        checkpoint.stats = envelope.payload.snapshot;
        if (validFinalSummary(envelope.payload.snapshot.finalSummary)) {
          this.room.finalSummary = envelope.payload.snapshot.finalSummary;
          checkpoint.finalSummary = this.room.finalSummary;
        }
      } else if (
        envelope.payload?.kind === 'final'
        && validFinalSummary(envelope.payload.summary)
      ) {
        this.room.finalSummary = envelope.payload.summary;
        checkpoint.finalSummary = this.room.finalSummary;
      }
    }

    this.room.authorityCheckpoint = checkpoint;
    const now = Date.now();
    if (now - this.lastCheckpointWriteAt >= CHECKPOINT_WRITE_INTERVAL_MS) {
      this.lastCheckpointWriteAt = now;
      await this.ctx.storage.put('room', this.room);
    }
    return true;
  }

  electHost(excludePlayerId = null) {
    return this.connectedPlayers()
      .filter((entry) => entry.playerId !== excludePlayerId)
      .slice()
      .sort((a, b) => {
        const joinedDelta = (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0);
        if (joinedDelta !== 0) return joinedDelta;
        return String(a.playerId).localeCompare(String(b.playerId));
      })[0] || null;
  }

  promoteHost(replacement, previousHostPlayerId = null) {
    Object.values(this.room.players || {}).forEach((entry) => {
      entry.isHost = false;
    });
    this.room.hostPlayerId = replacement?.playerId || null;
    if (replacement) {
      replacement.isHost = true;
      replacement.ready = true;
    }
    if (
      replacement
      && this.room.status === 'in-run'
      && replacement.playerId !== previousHostPlayerId
    ) {
      this.room.authorityEpoch = Math.max(
        0,
        Number(this.room.authorityEpoch) || 0
      ) + 1;
      if (this.room.authorityCheckpoint) {
        this.room.authorityCheckpoint.authorityEpoch = this.room.authorityEpoch;
      }
    }
    return replacement;
  }

  broadcastHostMigration({
    previousHostPlayerId = null,
    hostPlayerId = this.room?.hostPlayerId || null,
    reason = 'host-disconnected'
  } = {}) {
    if (!this.room || this.room.status !== 'in-run' || !hostPlayerId) return;
    this.broadcast({
      kind: 'control',
      action: 'host-migrated',
      payload: {
        previousHostPlayerId,
        hostPlayerId,
        authorityEpoch: Math.max(0, Number(this.room.authorityEpoch) || 0),
        checkpoint: this.room.authorityCheckpoint || null,
        reason,
        room: this.snapshot(),
        serverTime: Date.now()
      }
    });
  }

  consumeRateLimit(socket, attachment) {
    const now = Date.now();
    if (now - Number(attachment.windowStartedAt || 0) >= 1000) {
      attachment.windowStartedAt = now;
      attachment.messagesInWindow = 0;
    }

    attachment.messagesInWindow = Number(attachment.messagesInWindow || 0) + 1;
    socket.serializeAttachment(attachment);
    return attachment.messagesInWindow <= RATE_LIMIT_PER_SECOND;
  }

  pvpDistanceBetweenPlayers(shooterId, targetId) {
    const shooter = this.room?.players?.[String(shooterId || '')];
    const target = this.room?.players?.[String(targetId || '')];
    const left = shooter?.pvpPose?.position;
    const right = target?.pvpPose?.position;
    if (!left || !right) return null;
    const dx = Number(left.x) - Number(right.x);
    const dy = Number(left.y) - Number(right.y);
    const dz = Number(left.z) - Number(right.z);
    if (![dx, dy, dz].every(Number.isFinite)) return null;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  async finishPvpMatch({
    reason = 'pvp-match-complete',
    endedByPlayerId = null,
    event = null
  } = {}) {
    if (
      !this.room
      || this.room.status !== 'in-run'
      || !isPvp1Mode(this.room.settings?.gameMode)
    ) return false;

    const state = this.room.pvp || null;
    this.room.finalSummary = state
      ? {
          kind: 'pvp-team-elimination',
          patch: PVP1_PATCH,
          runId: state.runId,
          winnerTeam: state.winnerTeam || null,
          reason: String(reason || state.reason || 'pvp-match-complete'),
          rounds: {
            ALPHA: Math.max(0, Number(state.teams?.ALPHA?.roundWins) || 0),
            BRAVO: Math.max(0, Number(state.teams?.BRAVO?.roundWins) || 0)
          },
          players: Object.values(state.players || {}).map((entry) => ({
            playerId: entry.playerId,
            team: entry.team,
            eliminations: Math.max(0, Number(entry.eliminations) || 0),
            deaths: Math.max(0, Number(entry.deaths) || 0),
            damageDealt: Math.max(0, Number(entry.damageDealt) || 0)
          })),
          endedAt: Date.now()
        }
      : null;

    this.room.status = 'waiting';
    this.room.runId = null;
    this.room.authorityCheckpoint = null;

    Object.values(this.room.players).forEach((entry) => {
      entry.ready = entry.isHost === true && entry.connected === true;
      entry.pvpPose = null;
    });

    await this.commit();
    const room = this.snapshot();
    this.broadcast({
      kind: 'control',
      action: 'run-ended',
      payload: {
        reason: String(reason || 'pvp-match-complete'),
        endedByPlayerId,
        event,
        pvp: state,
        room
      }
    });
    this.broadcastRoomState();
    return true;
  }

  async finishRun({
    reason = 'ended',
    endedByPlayerId = null
  } = {}) {
    if (!this.room || this.room.status !== 'in-run') return false;

    this.room.status = 'waiting';
    this.room.runId = null;
    this.room.authorityCheckpoint = null;

    Object.values(this.room.players).forEach((entry) => {
      entry.ready = entry.isHost === true && entry.connected === true;
    });

    await this.commit();
    const room = this.snapshot();

    this.broadcast({
      kind: 'control',
      action: 'run-ended',
      payload: {
        reason: String(reason || 'ended'),
        endedByPlayerId,
        room
      }
    });
    this.broadcastRoomState();
    return true;
  }

  async handleControl(socket, player, action, payload) {
    if (action === 'ping') {
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'pong',
        payload: { serverTime: Date.now() }
      }));
      return;
    }

    if (action === 'chat-message') {
  const chatText = sanitizeTextChatText(payload?.text);
  if (!chatText) {
    socket.send(JSON.stringify({ kind: 'control', action: 'chat-rejected', payload: { reason: 'invalid-text' } }));
    return;
  }
  const attachment = this.readAttachment(socket) || {};
  const rate = consumeTextChatRate(attachment, Date.now());
  socket.serializeAttachment({ ...attachment, ...rate.state });
  if (!rate.allowed) {
    socket.send(JSON.stringify({ kind: 'control', action: 'chat-rejected', payload: { reason: rate.reason, retryAfterMs: rate.retryAfterMs } }));
    return;
  }
  const message = buildTextChatMessage({
    messageId: makeId('chat'),
    playerId: player.playerId,
    displayName: player.displayName,
    text: chatText,
    roomCode: this.room.roomCode,
    runId: this.room.runId || null,
    sentAt: Date.now()
  });
  this.broadcast({ kind: 'control', action: 'chat-message', payload: { message } });
  return;
}
        if (action === 'directory-heartbeat') {
      if (player.isHost && this.room.settings?.publicListing === true) {
        await this.syncDirectoryListing({ force: true });
      }
      return;
    }

    if (action === 'set-ready') {
      if (this.room.status === 'in-run') return;
      player.ready = player.isHost ? true : payload.ready === true;
      await this.commit();
      this.broadcastRoomState();
      return;
    }

    if (action === 'update-settings') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can change room settings.');
        return;
      }

      const connectedCount = this.connectedPlayers().length;
      if (
        payload.maxPlayers !== undefined
        && this.room.status !== 'in-run'
      ) {
        this.room.settings.maxPlayers = Math.max(
          connectedCount,
          normalizeMaxPlayers(payload.maxPlayers)
        );
      }
      if (payload.locked !== undefined) {
        this.room.settings.locked = payload.locked === true;
      }
      if (payload.allowLateJoin !== undefined) {
        this.room.settings.allowLateJoin =
          payload.allowLateJoin === true;
      }
      if (payload.publicListing !== undefined) {
        this.room.settings.publicListing =
          payload.publicListing === true;
        if (this.room.settings.publicListing) {
          this.room.settings.privacy = 'public';
          this.room.settings.locked = false;
        }
      }

      if (this.room.status !== 'in-run') {
        if (payload.mapId) {
          this.room.settings.mapId = String(payload.mapId).slice(0, 80);
        }
        if (payload.difficulty !== undefined) {
          this.room.settings.difficulty =
            Number(payload.difficulty) || 1;
        }
      }

      if (isPvp1Mode(this.room.settings?.gameMode)) {
        this.room.settings.maxPlayers = 4;
        this.room.settings.allowLateJoin = false;
        this.room.settings.publicListing = false;
        this.room.settings.privacy = 'private';
        this.room.virtualPlayers = {};
      }

      await this.commit();
      this.broadcastRoomState();
      return;
    }


    if (action === 'set-virtual-companion') {
      if (isPvp1Mode(this.room.settings?.gameMode)) {
        this.sendError(socket, 'AI Wingman is disabled in PvP rooms.');
        return;
      }
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can configure the AI companion.');
        return;
      }
      const active = payload.active === true;
      this.room.virtualPlayers ||= {};
      if (active) {
        this.room.virtualPlayers[BOT1_VIRTUAL_PLAYER_ID] = {
          playerId: BOT1_VIRTUAL_PLAYER_ID,
          displayName: safeName(payload.displayName || 'ARENA WINGMATE'),
          ready: true,
          connected: true,
          isHost: false,
          isBot: true,
          botProfile: String(
            payload.botProfile || 'bot1-late-join-companion-integrity-r2-8'
          ).slice(0, 80),
          joinedAt: this.room.virtualPlayers[BOT1_VIRTUAL_PLAYER_ID]?.joinedAt || Date.now(),
          joinedWave: Math.max(
            1,
            Math.floor(Number(this.room.authorityCheckpoint?.world?.wave) || 1)
          ),
          lateJoin: false,
          lateJoinProtectionUntil: 0,
          catchUpScore: 0
        };
      } else {
        delete this.room.virtualPlayers[BOT1_VIRTUAL_PLAYER_ID];
      }
      await this.commit();
      this.broadcastRoomState();
      return;
    }

    if (action === 'kick-player') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can remove players.');
        return;
      }
      const targetPlayerId = String(payload.playerId || '').slice(0, 160);
      const target = this.room.players?.[targetPlayerId] || null;
      if (
        !target
        || targetPlayerId === player.playerId
        || target.isHost === true
      ) {
        this.sendError(socket, 'Choose a valid operative to remove.');
        return;
      }

      const pvpForfeit = (
        this.room.status === 'in-run'
        && isPvp1Mode(this.room.settings?.gameMode)
      )
        ? pvp1ForfeitTeam(this.room.pvp, targetPlayerId, {
            now: Date.now(),
            reason: 'player-kicked-from-pvp-match'
          })
        : { changed: false };
      if (pvpForfeit.changed) this.room.pvp = pvpForfeit.state;

      this.room.kickedPlayers ||= {};
      this.room.kickedPlayers[targetPlayerId] = {
        sessionId: this.room.sessionId,
        kickedAt: Date.now(),
        reason: 'host-kick'
      };
      delete this.room.directoryAdmissions?.[targetPlayerId];
      delete this.room.players[targetPlayerId];

      this.ctx.getWebSockets(`player:${targetPlayerId}`).forEach(
        (targetSocket) => {
          try {
            targetSocket.send(JSON.stringify({
              kind: 'control',
              action: 'kicked',
              payload: { message: 'Removed from room by host.' }
            }));
            targetSocket.close(4003, 'Removed by host');
          } catch {
            // Ignore already-closed sockets.
          }
        }
      );

      await this.commit();
      if (pvpForfeit.changed) {
        await this.finishPvpMatch({
          reason: pvpForfeit.state.reason,
          endedByPlayerId: player.playerId,
          event: pvpForfeit.event
        });
      }
      this.broadcastRoomState();
      return;
    }

    if (action === 'transfer-host') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can transfer authority.');
        return;
      }
      const targetPlayerId = String(payload.playerId || '').slice(0, 160);
      const target = this.room.players?.[targetPlayerId] || null;
      if (
        !target
        || targetPlayerId === player.playerId
        || target.connected !== true
      ) {
        this.sendError(socket, 'Choose a connected operative.');
        return;
      }

      const previousHostPlayerId = player.playerId;
      const requestedReason = String(payload.reason || '').slice(0, 80);
      const transferReason = [
        'host-tab-hidden',
        'host-page-hidden'
      ].includes(requestedReason)
        ? requestedReason
        : 'manual-host-transfer';
      this.promoteHost(target, previousHostPlayerId);
      await this.commit();

      if (this.room.status === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId,
          hostPlayerId: target.playerId,
          reason: transferReason
        });
      }
      this.broadcastRoomState();
      return;
    }

    if (action === 'pvp-shot') {
      if (
        this.room.status !== 'in-run'
        || !isPvp1Mode(this.room.settings?.gameMode)
        || !this.room.pvp
      ) {
        this.sendError(socket, 'PvP shot rejected outside an active PvP match.');
        return;
      }

      const targetPlayerId = String(payload.targetPlayerId || '').slice(0, 160);
      const measuredDistance = this.pvpDistanceBetweenPlayers(
        player.playerId,
        targetPlayerId
      );
      if (!Number.isFinite(measuredDistance)) {
        socket.send(JSON.stringify({
          kind: 'control',
          action: 'pvp-shot-rejected',
          payload: { reason: 'POSITION_UNAVAILABLE', retryAfterMs: 50 }
        }));
        return;
      }
      const result = resolvePvp1Shot({
        state: this.room.pvp,
        shooterId: player.playerId,
        targetId: targetPlayerId,
        weaponFamily: payload.weaponFamily,
        shotId: payload.shotId,
        headshot: payload.headshot === true,
        distance: measuredDistance,
        now: Date.now()
      });

      if (!result.accepted) {
        socket.send(JSON.stringify({
          kind: 'control',
          action: 'pvp-shot-rejected',
          payload: {
            reason: result.reason,
            retryAfterMs: Math.max(0, Number(result.retryAfterMs) || 0)
          }
        }));
        return;
      }

      this.room.pvp = result.state;
      if (this.room.authorityCheckpoint) {
        this.room.authorityCheckpoint.pvp = this.room.pvp;
        this.room.authorityCheckpoint.updatedAt = Date.now();
      }
      await this.commit();
      this.broadcast({
        kind: 'control',
        action: 'pvp-hit-result',
        payload: {
          event: result.event,
          state: this.room.pvp
        }
      });
      this.broadcast({
        kind: 'control',
        action: 'pvp-state',
        payload: { state: this.room.pvp }
      });

      if (result.event?.matchEnded) {
        await this.finishPvpMatch({
          reason: 'pvp-team-eliminated',
          endedByPlayerId: player.playerId,
          event: result.event
        });
      }
      return;
    }

    if (action === 'start-run') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can start the run.');
        return;
      }
      if (this.room.status === 'in-run') return;

      const connected = this.connectedPlayers();
      if (!connected.length || !connected.every((entry) => entry.ready === true)) {
        this.sendError(socket, 'Every connected player must be ready.');
        return;
      }

      const pvpRoom = isPvp1Mode(this.room.settings?.gameMode);
      if (pvpRoom && !pvp1Enabled(this.env)) {
        this.sendError(socket, 'PvP is temporarily disabled. Co-Op remains available.');
        return;
      }
      if (pvpRoom && connected.length < 2) {
        this.sendError(socket, 'Team Elimination requires at least two players.');
        return;
      }

      this.room.status = 'in-run';
      this.room.runId = makeId('run');
      this.room.authorityEpoch = 0;
      this.room.finalSummary = null;

      if (pvpRoom) {
        this.room.virtualPlayers = {};
        this.room.settings.allowLateJoin = false;
        this.room.settings.publicListing = false;
        const assignments = assignPvp1Teams(connected);
        connected.forEach((entry) => {
          const assignment = assignments[entry.playerId];
          entry.team = assignment?.team || null;
          entry.pvpSlot = assignment?.slot || 0;
          entry.pvpPose = null;
        });
        this.room.pvp = createPvp1MatchState({
          runId: this.room.runId,
          players: connected,
          now: Date.now()
        });
        this.room.authorityCheckpoint = {
          runId: this.room.runId,
          authorityEpoch: 0,
          authorityConnectionEpoch: Math.max(
            1,
            Math.floor(Number(player.connectionEpoch) || 1)
          ),
          updatedAt: Date.now(),
          pvp: this.room.pvp
        };
      } else {
        this.room.pvp = null;
        this.room.authorityCheckpoint = {
          runId: this.room.runId,
          authorityEpoch: 0,
          authorityConnectionEpoch: Math.max(
            1,
            Math.floor(Number(player.connectionEpoch) || 1)
          ),
          updatedAt: Date.now(),
          world: null,
          economy: null,
          revive: null,
          stats: null,
          finalSummary: null
        };
      }
      await this.commit();

      this.broadcast({
        kind: 'control',
        action: 'start-run',
        payload: {
          roomCode: this.room.roomCode,
          runId: this.room.runId,
          mapId: this.room.settings.mapId,
          difficulty: this.room.settings.difficulty,
          gameMode: this.room.settings.gameMode,
          pvp: this.room.pvp,
          authorityEpoch: this.room.authorityEpoch,
          serverTime: Date.now()
        }
      });
      if (pvpRoom) {
        this.broadcast({
          kind: 'control',
          action: 'pvp-state',
          payload: { state: this.room.pvp }
        });
      }
      this.broadcastRoomState();
      return;
    }

    if (action === 'player-death') {
      if (isPvp1Mode(this.room.settings?.gameMode)) {
        this.broadcastRoomState();
        return;
      }
      // Individual down/bleedout state is authoritative in revive snapshots.
      // Never finish the whole co-op run from a single client death notice.
      this.broadcastRoomState();
      return;
    }

    if (action === 'end-run') {
      if (!player.isHost) return;
      if (isPvp1Mode(this.room.settings?.gameMode)) {
        const forfeited = pvp1ForfeitTeam(this.room.pvp, player.playerId, {
          now: Date.now(),
          reason: String(payload.reason || 'host-ended-pvp-match')
        });
        if (forfeited.changed) {
          this.room.pvp = forfeited.state;
          await this.finishPvpMatch({
            reason: forfeited.state.reason,
            endedByPlayerId: player.playerId,
            event: forfeited.event
          });
        }
        return;
      }
      await this.finishRun({
        reason: String(payload.reason || 'ended'),
        endedByPlayerId: player.playerId
      });
      return;
    }

    if (action === 'leave') {
      const leavingPlayerId = player.playerId;
      const wasHost = player.isHost === true;
      const previousStatus = this.room.status;
      const pvpForfeit = (
        previousStatus === 'in-run'
        && isPvp1Mode(this.room.settings?.gameMode)
      )
        ? pvp1ForfeitTeam(this.room.pvp, leavingPlayerId, {
            now: Date.now(),
            reason: 'player-left-pvp-match'
          })
        : { changed: false };
      if (pvpForfeit.changed) this.room.pvp = pvpForfeit.state;
      delete this.room.players[leavingPlayerId];
      const checkpoint = this.room.authorityCheckpoint;
      if (previousStatus === 'in-run') {
        // A voluntary leave is not a completed team run. Remove any final
        // summary that the departing authority may have published locally.
        this.room.finalSummary = null;
        if (checkpoint) checkpoint.finalSummary = null;
        if (checkpoint?.stats) checkpoint.stats.finalSummary = null;
      }
      if (checkpoint?.revive && Array.isArray(checkpoint.revive.players)) {
        checkpoint.revive.players = checkpoint.revive.players.filter(
          (entry) => entry?.playerId !== leavingPlayerId
        );
      }
      if (checkpoint?.stats && Array.isArray(checkpoint.stats.players)) {
        checkpoint.stats.players = checkpoint.stats.players.filter(
          (entry) => entry?.playerId !== leavingPlayerId
        );
      }
      if (checkpoint?.world && Array.isArray(checkpoint.world.enemies)) {
        checkpoint.world.enemies.forEach((enemy) => {
          if (enemy?.targetPlayerId === leavingPlayerId) enemy.targetPlayerId = null;
        });
      }

      let replacement = null;
      if (wasHost) {
        replacement = this.electHost(leavingPlayerId);
        this.promoteHost(replacement, leavingPlayerId);
      }

      if (!this.connectedPlayers().length) {
        this.room.status = 'waiting';
        this.room.runId = null;
        this.room.authorityCheckpoint = null;
        this.room.virtualPlayers = {};
      }

      await this.commit();

      if (pvpForfeit.changed) {
        await this.finishPvpMatch({
          reason: pvpForfeit.state.reason,
          endedByPlayerId: leavingPlayerId,
          event: pvpForfeit.event
        });
      }

      if (wasHost && replacement && previousStatus === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId: leavingPlayerId,
          hostPlayerId: replacement.playerId,
          reason: 'host-left-room'
        });
      }

      this.broadcastRoomState();
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'left-room',
        payload: {}
      }));
      socket.close(1000, 'Left room');
      return;
    }

    this.sendError(socket, 'Unsupported control action.');
  }

  readAttachment(socket) {
    try {
      return socket.deserializeAttachment() || null;
    } catch {
      return null;
    }
  }

  sendError(socket, message) {
    try {
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'error',
        payload: { message }
      }));
    } catch {
      // Ignore closed sockets.
    }
  }

  broadcast(message, { exclude = null } = {}) {
    const encoded = JSON.stringify(message);
    this.ctx.getWebSockets().forEach((socket) => {
      if (socket === exclude) return;
      const attachment = this.readAttachment(socket);
      if (!attachment?.playerId || attachment.rejected) return;
      try {
        socket.send(encoded);
      } catch {
        // The close handler will reconcile the player.
      }
    });
  }

  broadcastRoomState() {
    if (!this.room) return;
    this.broadcast({
      kind: 'control',
      action: 'room-state',
      payload: {
        room: this.snapshot(),
        checkpoint: this.room.status === 'in-run'
          ? this.room.authorityCheckpoint
          : null
      }
    });
  }

  async webSocketClose(socket) {
    await this.markDisconnected(socket);
  }

  async webSocketError(socket) {
    await this.markDisconnected(socket);
  }

  async markDisconnected(socket) {
    if (!this.room) return;

    const attachment = this.readAttachment(socket);
    const playerId = attachment?.playerId;
    const player = this.room.players?.[playerId];
    if (!player || player.connected === false) return; if (Math.max(0, Math.floor(Number(player.connectionEpoch) || 0)) > 0 && Math.max(0, Math.floor(Number(attachment?.connectionEpoch) || 0)) !== Math.max(0, Math.floor(Number(player.connectionEpoch) || 0))) return;

    const wasInRun = this.room.status === 'in-run';
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    player.disconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;
    const checkpointWorld = this.room.authorityCheckpoint?.world;
    if (Array.isArray(checkpointWorld?.enemies)) {
      checkpointWorld.enemies.forEach((enemy) => {
        if (enemy?.targetPlayerId === playerId) enemy.targetPlayerId = null;
      });
    }


    let replacement = null;
    const wasHost = (
      player.isHost === true
      || this.room.hostPlayerId === playerId
    );
    const retainHostLease = shouldRetainHostDuringDisconnect({
      roomStatus: this.room.status,
      wasHost
    });
    if (wasHost && !retainHostLease) {
      player.isHost = false;
      replacement = this.electHost(playerId);
      this.promoteHost(replacement, playerId);
    } else if (retainHostLease) {
      // Keep the current host identity pinned for the reconnect grace period.
      // A temporary network loss or tab transport wake-up must not promote an
      // ally and move authoritative simulation into that ally's browser.
      player.isHost = true;
      this.room.hostPlayerId = playerId;
    }

    if (wasInRun) {
      await this.commit();
      if (replacement) {
        this.broadcastHostMigration({
          previousHostPlayerId: playerId,
          hostPlayerId: replacement.playerId,
          reason: 'host-disconnected'
        });
      }
      await this.scheduleCleanup();
      this.broadcastRoomState();
      return;
    }

    if (this.connectedPlayers().length === 0) {
      this.room.status = 'waiting';
      this.room.runId = null;
    }

    await this.commit();
    await this.scheduleCleanup();
    this.broadcastRoomState();
  }

  async scheduleCleanup() {
    if (!this.room) return;
    const expiries = Object.values(this.room.players)
      .filter((player) => player.connected === false && player.disconnectExpiresAt)
      .map((player) => player.disconnectExpiresAt);
    Object.values(this.room.directoryAdmissions || {}).forEach((reservation) => {
      if (Number(reservation?.expiresAt) > Date.now()) {
        expiries.push(Number(reservation.expiresAt));
      }
    });

    if (expiries.length) {
      await this.ctx.storage.setAlarm(Math.min(...expiries));
    }
  }

  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    let changed = this.cleanupDirectoryAdmissions(now);
    const expiredPlayerIds = [];

    let pvpForfeit = null;
    Object.entries(this.room.players).forEach(([playerId, player]) => {
      if (
        player.connected === false
        && Number(player.disconnectExpiresAt || 0) <= now
      ) {
        expiredPlayerIds.push(playerId);
        if (
          !pvpForfeit
          && this.room.status === 'in-run'
          && isPvp1Mode(this.room.settings?.gameMode)
        ) {
          const result = pvp1ForfeitTeam(this.room.pvp, playerId, {
            now,
            reason: 'pvp-reconnect-grace-expired'
          });
          if (result.changed) {
            pvpForfeit = result;
            this.room.pvp = result.state;
          }
        }
        delete this.room.players[playerId];
        changed = true;
      }
    });

    const expiredHostPlayerId = expiredHostRequiresElection({
      hostPlayerId: this.room.hostPlayerId,
      expiredPlayerIds
    }) ? this.room.hostPlayerId : null;
    if (expiredHostPlayerId) {
      this.room.hostPlayerId = null;
    }

    let migrated = null;
    if (!this.room.hostPlayerId) {
      const replacement = this.electHost();
      if (replacement) {
        this.promoteHost(replacement, expiredHostPlayerId);
        migrated = replacement;
        changed = true;
      }
    }

    if (this.connectedPlayers().length === 0 && Object.keys(this.room.players).length === 0) {
      this.room.status = 'waiting';
      this.room.runId = null;
      this.room.authorityCheckpoint = null;
      this.room.finalSummary = null;
      changed = true;
    }

    if (changed) {
      await this.commit();
      if (pvpForfeit?.changed) {
        await this.finishPvpMatch({
          reason: pvpForfeit.state.reason,
          endedByPlayerId: pvpForfeit.event?.forfeitingPlayerId || null,
          event: pvpForfeit.event
        });
        await this.scheduleCleanup();
        return;
      }
      if (migrated && this.room.status === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId: null,
          hostPlayerId: migrated.playerId,
          reason: 'host-reconnect-grace-expired'
        });
      }
      this.broadcastRoomState();
    }

    await this.scheduleCleanup();
  }

  directorySnapshot() {
    const room = this.room;
    if (!room) return null;
    const host = room.players?.[room.hostPlayerId] || null;
    const connectedHumans = Object.values(room.players || {}).filter(
      (entry) => entry?.connected === true && entry?.isBot !== true
    ).length;
    const hasBot = Object.values(room.virtualPlayers || {}).some(
      (entry) => entry?.connected !== false && entry?.isBot === true
    );
    const maxPlayers = normalizeMaxPlayers(room.settings?.maxPlayers);
    this.cleanupDirectoryAdmissions(Date.now());
    const reservedHumans = countActiveRoomAdmissionReservations(
      room.directoryAdmissions,
      { now: Date.now() }
    );
    const listed = Boolean(
      room.settings?.publicListing === true
      && room.settings?.locked !== true
      && host?.connected === true
      && connectedHumans + reservedHumans < maxPlayers
      && ['waiting', 'in-run'].includes(room.status)
      && (room.status !== 'in-run' || room.settings?.allowLateJoin === true)
    );
    return {
      roomCode: room.roomCode,
      listed,
      protocol: SERVER_PROTOCOL,
      build: SERVER_BUILD,
      mapId: room.settings?.mapId || 'grid_bunker',
      difficulty: Number(room.settings?.difficulty) || 1,
      status: room.status,
      connectedHumans,
      reservedHumans,
      maxPlayers,
      hasBot,
      allowLateJoin: room.settings?.allowLateJoin !== false,
      locked: room.settings?.locked === true,
      hostConnected: host?.connected === true,
      region: room.matchmaking?.region || 'ZZ',
      createdAt: room.createdAt || Date.now(),
      updatedAt: room.updatedAt || Date.now()
    };
  }

  async syncDirectoryListing({ force = false } = {}) {
    const snapshot = this.directorySnapshot();
    if (!snapshot || !this.env.MATCHMAKING) return false;
    const fingerprint = JSON.stringify({
      ...snapshot,
      updatedAt: 0
    });
    if (!force && fingerprint === this.directoryFingerprintValue) return true;
    this.directoryFingerprintValue = fingerprint;
    try {
      const id = this.env.MATCHMAKING.idFromName('public-v1');
      const response = await this.env.MATCHMAKING.get(id).fetch(
        new Request('https://matchmaking.internal/matchmaking/rooms/sync', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ka-internal-room-directory': '1'
          },
          body: JSON.stringify(snapshot)
        })
      );
      if (!response.ok) {
        this.directoryFingerprintValue = null;
        return false;
      }
      return true;
    } catch {
      this.directoryFingerprintValue = null;
      return false;
    }
  }

  async commit() {
    if (!this.room) return;
    this.cleanupDirectoryAdmissions(Date.now());
    this.room.revision = Number(this.room.revision || 0) + 1;
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put('room', this.room);
    await this.syncDirectoryListing();
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id',
        'access-control-max-age': '86400'
      }});
    }
    if (!originAllowed(request, env)) {
      return json({ error: 'Origin not allowed.' }, { status: 403 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/leaderboards' || url.pathname === '/leaderboards/challenge' || url.pathname === '/leaderboards/submit') {
      return observeOpsResponse(
        proxyLeaderboardRequest(request, env),
        request,
        env,
        ctx,
        'leaderboards'
      );
    }

    if (request.method === 'GET' && url.pathname === '/live/manifest') {
      return observeOpsResponse(
        Promise.resolve(json(resolveLive1Manifest(Date.now()))),
        request,
        env,
        ctx,
        'live-manifest'
      );
    }

    if (url.pathname.startsWith('/profiles/')) {
      return observeOpsResponse(
        proxyCloudProfileRequest(request, env),
        request,
        env,
        ctx,
        'profiles'
      );
    }

    if (url.pathname.startsWith('/matchmaking/')) {
      return observeOpsResponse(
        proxyMatchmakingRequest(request, env),
        request,
        env,
        ctx,
        'matchmaking'
      );
    }

    if (url.pathname.startsWith('/social/')) {
      return observeOpsResponse(
        proxySocialRequest(request, env),
        request,
        env,
        ctx,
        'social'
      );
    }

    if (url.pathname.startsWith('/ops/')) {
      return proxyOpsRequest(request, env);
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'khadijas-arena-multiplayer',
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        patch: SERVER_PATCH,
        certifiedFrontendSha: CERTIFIED_FRONTEND_SHA,
        certifiedSourceSeal: CERTIFIED_SOURCE_SEAL,
        releaseStatus: RELEASE_STATUS,
        matchmaking: {
          schema: MATCHMAKING_SCHEMA,
          patch: MATCHMAKING_PATCH,
          endpoints: [
            '/matchmaking/enqueue',
            '/matchmaking/status',
            '/matchmaking/cancel',
            '/matchmaking/ack',
            '/matchmaking/health',
            '/matchmaking/rooms/list',
            '/matchmaking/rooms/join'
          ]
        },
        leaderboards: { schema: 1, patch: 'm4-online-leaderboards-r1', endpoints: ['/leaderboards', '/leaderboards/challenge', '/leaderboards/submit'] },
        productionHardening: PRODUCTION_HARDENING,
        cloudProfiles: { ...CLOUD_PROFILE_SERVER_INFO, endpoints: ['/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/progression/commit', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity'] },
        social: SOCIAL1_SERVER_INFO,
        content: CONTENT1_SERVER_INFO,
        live: LIVE1_SERVER_INFO,
        operations: OPS1_SERVER_INFO,
        postFinalHotfix: POST_FINAL1_SERVER_INFO,
        socialSessionHotfix: POST_FINAL2_R1_2_SERVER_INFO,
        playerSafetyOperations: POST_FINAL5_SERVER_INFO,
        productionOperationsHardening: POST_FINAL6_SERVER_INFO,
        economyRewardsProgression: POST_FINAL9_SERVER_INFO,
        version1Certification: POST_FINAL10_SERVER_INFO,
        pvp1: { ...PVP1_SERVER_INFO, featureEnabled: pvp1Enabled(env) },
        fullProductCertification: FINAL2_SERVER_INFO
      });
    }

    if (url.pathname === '/release') {
      return json({
        ok: true,
        service: 'khadijas-arena-multiplayer',
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        patch: SERVER_PATCH,
        certifiedFrontendSha: CERTIFIED_FRONTEND_SHA,
        certifiedSourceSeal: CERTIFIED_SOURCE_SEAL,
        releaseStatus: RELEASE_STATUS,
        matchmaking: {
          schema: MATCHMAKING_SCHEMA,
          patch: MATCHMAKING_PATCH,
          endpoints: [
            '/matchmaking/enqueue',
            '/matchmaking/status',
            '/matchmaking/cancel',
            '/matchmaking/ack',
            '/matchmaking/health',
            '/matchmaking/rooms/list',
            '/matchmaking/rooms/join'
          ]
        },
        leaderboards: { schema: 1, patch: 'm4-online-leaderboards-r1', endpoints: ['/leaderboards', '/leaderboards/challenge', '/leaderboards/submit'] },
        productionHardening: PRODUCTION_HARDENING,
        cloudProfiles: { ...CLOUD_PROFILE_SERVER_INFO, endpoints: ['/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/progression/commit', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity'] },
        social: SOCIAL1_SERVER_INFO,
        content: CONTENT1_SERVER_INFO,
        live: LIVE1_SERVER_INFO,
        operations: OPS1_SERVER_INFO,
        postFinalHotfix: POST_FINAL1_SERVER_INFO,
        socialSessionHotfix: POST_FINAL2_R1_2_SERVER_INFO,
        playerSafetyOperations: POST_FINAL5_SERVER_INFO,
        productionOperationsHardening: POST_FINAL6_SERVER_INFO,
        economyRewardsProgression: POST_FINAL9_SERVER_INFO,
        version1Certification: POST_FINAL10_SERVER_INFO,
        pvp1: { ...PVP1_SERVER_INFO, featureEnabled: pvp1Enabled(env) },
        fullProductCertification: FINAL2_SERVER_INFO,
        deployedAt: new Date().toISOString()
      });
    }

    if (url.pathname !== '/ws') {
      return json({
        service: 'Khadija’s Arena Multiplayer',
        endpoints: ['/health', '/release', '/ops/health', '/ops/privacy', '/ops/events', '/live/manifest', '/matchmaking/enqueue', '/matchmaking/status', '/matchmaking/cancel', '/matchmaking/ack', '/matchmaking/health', '/matchmaking/rooms/list', '/matchmaking/rooms/join', '/leaderboards', '/leaderboards/challenge', '/leaderboards/submit', '/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/progression/commit', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity', ...SOCIAL1_SERVER_INFO.endpoints, '/ws']
      });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade.' }, { status: 426 });
    }

    const roomCode = normalizeRoomCode(url.searchParams.get('room'));
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      return json({ error: 'Invalid room code.' }, { status: 400 });
    }

    const id = env.ROOMS.idFromName(roomCode);
    const stub = env.ROOMS.get(id);
    return observeOpsResponse(
      stub.fetch(request),
      request,
      env,
      ctx,
      'websocket'
    );
  }
};

import { DurableObject } from 'cloudflare:workers';
import {
  OPS1_APPEAL_RETENTION_MS,
  OPS1_EVENT_RETENTION_MS,
  OPS1_MAX_BODY_BYTES,
  OPS1_MAX_RECENT_ERRORS,
  OPS1_REPORT_RETENTION_MS,
  OPS1_SERVER_PATCH,
  OPS1_SERVER_SCHEMA,
  addEventToOpsBucket,
  applyModerationAction,
  applyModerationAppealAction,
  cleanOpsString,
  consumeOpsRate,
  normalizeModerationAppeal,
  normalizeModerationReport,
  moderationReportGroup,
  moderationReporterHistory,
  moderationRestrictionForAction,
  normalizeOpsRateState,
  normalizeOpsServerEvent,
  opsHourKey,
  redactOpsServerText,
  summarizeOpsHealth
} from './ops1_core.js';
import {
  createPasskeyAuthenticationOptions,
  createPasskeyRegistrationOptions,
  createRandomChallenge,
  normalizePasskeys,
  publicPasskeys,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration
} from './cloud_profile_auth_core.js';
import {
  ADMIN_CHALLENGE_TTL_MS,
  ADMIN_INVITE_TTL_MS,
  ADMIN_MAX_PASSKEYS,
  ADMIN_SESSION_TTL_MS,
  POST_FINAL6_PATCH,
  appendInternalNote,
  createAdminSession,
  filterModerationReports,
  inviteActive,
  moderationAuditCsv,
  moderationPriority,
  normalizeAdminHandle,
  normalizeAdminInvite,
  normalizeAdminRecord,
  normalizeAdminRole,
  publicAdmin,
  roleAllows,
  sessionActive,
  validateDecisionConfirmation
} from './postfinal6_admin_core.js';

const encoder = new TextEncoder();

export const OPS1_SERVER_INFO = Object.freeze({
  patch: OPS1_SERVER_PATCH,
  schema: OPS1_SERVER_SCHEMA,
  healthEndpoint: '/ops/health',
  privacyEndpoint: '/ops/privacy',
  eventEndpoint: '/ops/events',
  adminRoutesProtected: true,
  rawIpStored: false,
  rawEmailStored: false,
  preciseLocationStored: false,
  passkeyDetailsStored: false,
  chatTranscriptCollectedByDefault: false,
  eventRetentionDays: 14,
  reportRetentionDays: 180,
  appealRetentionDays: 365,
  moderationDashboard: true,
  duplicateReportGrouping: true,
  falseReportSignals: true,
  reportForwardRetry: true,
  reporterStatus: true,
  appeals: true,
  accountWideAuthenticatedRestriction: true,
  administratorPasskeys: true,
  administratorRoles: ['viewer', 'moderator', 'senior-moderator', 'owner'],
  administratorSessionTtlHours: 8,
  administratorSessionRevocation: true,
  administratorInvitations: true,
  administratorAccessHistory: true,
  destructiveActionConfirmation: true,
  moderatorAssignment: true,
  internalCaseNotes: true,
  caseTimeline: true,
  auditExport: ['json', 'csv'],
  optionalWebhookAlerts: true,
  compatibilityVerifier: true,
  telemetryFailureBlocksGameplay: false
});

function responseJson(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function requestJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > OPS1_MAX_BODY_BYTES) throw new Error('OPS_REQUEST_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > OPS1_MAX_BODY_BYTES) {
    throw new Error('OPS_REQUEST_TOO_LARGE');
  }
  if (!bytes.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('OPS_INVALID_JSON');
  }
}

function secureEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  if (a.byteLength !== b.byteLength || a.byteLength === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(String(value || 'unknown'))
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');
}

async function fullHash(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(String(value || ''))
  );
  return [...new Uint8Array(digest)]
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');
}

function randomOpaqueToken(bytes = 48) {
  const value = new Uint8Array(Math.max(32, Math.min(64, Number(bytes) || 48)));
  crypto.getRandomValues(value);
  return [...value].map((entry) => entry.toString(16).padStart(2, '0')).join('');
}

function requestOrigin(request) {
  const value = String(request.headers.get('x-ka-origin') || '').trim();
  if (!/^https?:\/\//i.test(value)) throw new Error('OPS_ADMIN_ORIGIN_INVALID');
  const origin = new URL(value).origin;
  const rpId = new URL(origin).hostname;
  if (!rpId) throw new Error('OPS_ADMIN_RP_ID_INVALID');
  return { origin, rpId };
}

function adminRegistrationOptions(value) {
  const options = createPasskeyRegistrationOptions(value);
  return {
    ...options,
    authenticatorSelection: {
      ...(options.authenticatorSelection || {}),
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'required'
    }
  };
}

function adminAuthenticationOptions(value) {
  return {
    ...createPasskeyAuthenticationOptions(value),
    userVerification: 'required'
  };
}

function bucketKey(timestamp) {
  return `bucket:${opsHourKey(timestamp)}`;
}

function reportKey(reportId) {
  return `report:${reportId}`;
}

function auditKey(createdAt, auditId) {
  return `audit:${String(createdAt).padStart(16, '0')}:${auditId}`;
}

function appealKey(appealId) {
  return `appeal:${appealId}`;
}

function errorKey(receivedAt, eventId) {
  return `error:${String(receivedAt).padStart(16, '0')}:${eventId}`;
}

function dedupeKey(eventId) {
  return `dedupe:${eventId}`;
}

function rateKey(sourceHash) {
  return `rate:${sourceHash || 'unknown'}`;
}

function restrictionKey(targetHash) {
  return `restriction:${targetHash}`;
}

function adminKey(adminId) {
  return `admin:${adminId}`;
}

function adminHandleKey(handle) {
  return `admin-handle:${normalizeAdminHandle(handle)}`;
}

function adminCredentialKey(credentialId) {
  return `admin-credential:${credentialId}`;
}

function adminChallengeKey(challengeId) {
  return `admin-challenge:${challengeId}`;
}

function adminSessionKey(tokenHash) {
  return `admin-session:${tokenHash}`;
}

function adminInviteKey(codeHash) {
  return `admin-invite:${codeHash}`;
}

function adminAccessKey(createdAt, accessId) {
  return `admin-access:${String(createdAt).padStart(16, '0')}:${accessId}`;
}

function normalizeAdminToken(request) {
  const header = String(request.headers.get('authorization') || '');
  return header.replace(/^Bearer\s+/i, '').trim();
}

export class OpsHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (
        request.headers.get('x-ka-internal-ops') === '1'
        && request.method === 'POST'
      ) {
        if (url.pathname === '/internal/ops/route') {
          return this.ingestRoute(request);
        }
        if (url.pathname === '/internal/ops/moderation/report') {
          return this.ingestModerationReport(request);
        }
        if (url.pathname === '/internal/ops/moderation/check') {
          return this.checkModerationRestriction(request);
        }
        if (url.pathname === '/internal/ops/moderation/status') {
          return this.moderationStatus(request);
        }
        if (url.pathname === '/internal/ops/moderation/appeal') {
          return this.ingestModerationAppeal(request);
        }
        return responseJson(
          { ok: false, error: 'OPS_INTERNAL_ENDPOINT_NOT_FOUND' },
          { status: 404 }
        );
      }

      if (request.method === 'POST' && url.pathname === '/ops/events') {
        return this.ingestClientEvent(request);
      }
      if (request.method === 'GET' && url.pathname === '/ops/health') {
        return this.publicHealth();
      }
      if (request.method === 'GET' && url.pathname === '/ops/privacy') {
        return responseJson({
          ok: true,
          patch: OPS1_SERVER_PATCH,
          policy: OPS1_SERVER_INFO
        });
      }

      if (url.pathname === '/ops/admin/auth/bootstrap/status' && request.method === 'GET') {
        return this.adminBootstrapStatus();
      }
      if (url.pathname === '/ops/admin/auth/bootstrap/options' && request.method === 'POST') {
        return this.adminBootstrapOptions(request);
      }
      if (url.pathname === '/ops/admin/auth/bootstrap/verify' && request.method === 'POST') {
        return this.adminBootstrapVerify(request);
      }
      if (url.pathname === '/ops/admin/auth/login/options' && request.method === 'POST') {
        return this.adminLoginOptions(request);
      }
      if (url.pathname === '/ops/admin/auth/login/verify' && request.method === 'POST') {
        return this.adminLoginVerify(request);
      }
      if (url.pathname === '/ops/admin/auth/enroll/options' && request.method === 'POST') {
        return this.adminEnrollOptions(request);
      }
      if (url.pathname === '/ops/admin/auth/enroll/verify' && request.method === 'POST') {
        return this.adminEnrollVerify(request);
      }

      if (url.pathname.startsWith('/ops/admin/')) {
        const actor = await this.requireAdmin(request);
        if (request.method === 'GET' && url.pathname === '/ops/admin/auth/session') {
          return this.adminSession(actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/auth/logout') {
          return this.adminLogout(actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/summary') {
          this.requirePermission(actor, 'dashboard.read');
          return this.adminSummary(actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/reports') {
          this.requirePermission(actor, 'reports.read');
          return this.adminReports(url, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/reports/action') {
          return this.adminReportAction(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/reports/assign') {
          this.requirePermission(actor, 'reports.assign');
          return this.adminReportAssign(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/reports/note') {
          this.requirePermission(actor, 'reports.note');
          return this.adminReportNote(request, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/cases') {
          this.requirePermission(actor, 'cases.read');
          return this.adminCaseTimeline(url, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/appeals') {
          this.requirePermission(actor, 'appeals.read');
          return this.adminAppeals(url, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/appeals/action') {
          this.requirePermission(actor, 'appeals.decide');
          return this.adminAppealAction(request, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/restrictions') {
          this.requirePermission(actor, 'restrictions.read');
          return this.adminRestrictions(actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/restrictions/action') {
          this.requirePermission(actor, 'restrictions.manage');
          return this.adminRestrictionAction(request, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/audit') {
          this.requirePermission(actor, 'audit.read');
          return this.adminAudit(url, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/audit/export') {
          this.requirePermission(actor, 'audit.export');
          return this.adminAuditExport(url, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/platform') {
          this.requirePermission(actor, 'platform.read');
          return this.adminPlatform(actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/staff') {
          this.requirePermission(actor, 'staff.read');
          return this.adminStaff(actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/staff/invite') {
          this.requirePermission(actor, 'staff.manage');
          return this.adminStaffInvite(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/staff/role') {
          this.requirePermission(actor, 'staff.manage');
          return this.adminStaffRole(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/staff/status') {
          this.requirePermission(actor, 'staff.manage');
          return this.adminStaffStatus(request, actor);
        }
        if (request.method === 'GET' && url.pathname === '/ops/admin/sessions') {
          return this.adminSessions(url, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/sessions/revoke') {
          return this.adminSessionRevoke(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/passkeys/register/options') {
          return this.adminAdditionalPasskeyOptions(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/passkeys/register/verify') {
          return this.adminAdditionalPasskeyVerify(request, actor);
        }
        if (request.method === 'POST' && url.pathname === '/ops/admin/passkeys/revoke') {
          return this.adminPasskeyRevoke(request, actor);
        }
        return responseJson(
          { ok: false, error: 'OPS_ADMIN_ENDPOINT_NOT_FOUND' },
          { status: 404 }
        );
      }

      return responseJson(
        { ok: false, error: 'OPS_ENDPOINT_NOT_FOUND' },
        { status: 404 }
      );
    } catch (error) {
      const code = cleanOpsString(
        error?.message || error || 'OPS_ERROR',
        'OPS_ERROR',
        160
      );
      if (
        url.pathname.startsWith('/ops/admin/auth/')
        && url.pathname !== '/ops/admin/auth/bootstrap/status'
      ) {
        this.ctx.waitUntil(this.writeAdminAccess({
          event: cleanOpsString(url.pathname, 'admin-auth', 80),
          success: false,
          reason: code
        }));
      }
      const status = code.includes('AUTH') || code.includes('SESSION_EXPIRED') ? 401
        : code.includes('FORBIDDEN') || code.includes('DISABLED') ? 403
          : code.includes('NOT_FOUND') ? 404
            : code.includes('RATE') ? 429
              : code.includes('CLOSED') || code.includes('EXISTS') ? 409
                : code.includes('INVALID') || code.includes('TOO_LARGE') || code.includes('CONFIRMATION') ? 400
                  : 500;
      return responseJson({ ok: false, error: code }, { status });
    }
  }

  requirePermission(actor, permission) {
    if (!actor?.admin || !roleAllows(actor.admin.role, permission)) {
      throw new Error('OPS_ADMIN_FORBIDDEN');
    }
    return true;
  }

  async requireBootstrapToken(request) {
    const configured = String(this.env.OPS_ADMIN_TOKEN || '').trim();
    if (configured.length < 32) throw new Error('OPS_ADMIN_BOOTSTRAP_NOT_CONFIGURED');
    if (!secureEqual(normalizeAdminToken(request), configured)) {
      throw new Error('OPS_ADMIN_BOOTSTRAP_AUTH_REQUIRED');
    }
    return true;
  }

  async listAdmins() {
    const listed = await this.ctx.storage.list({ prefix: 'admin:' });
    return [...listed.values()]
      .map((value) => normalizeAdminRecord(value))
      .filter((value) => value.adminId && value.handle)
      .sort((left, right) => left.handle.localeCompare(right.handle));
  }

  async writeAdminAccess({
    adminId = '',
    event = '',
    role = '',
    sessionId = '',
    success = true,
    reason = ''
  } = {}) {
    const createdAt = Date.now();
    const accessId = `access-${crypto.randomUUID()}`;
    await this.ctx.storage.put(adminAccessKey(createdAt, accessId), {
      accessId,
      adminId: cleanOpsString(adminId, '', 120),
      event: cleanOpsString(event, '', 80),
      role: normalizeAdminRole(role),
      sessionId: cleanOpsString(sessionId, '', 120),
      success: success === true,
      reason: redactOpsServerText(reason, 160),
      createdAt,
      expiresAt: createdAt + 365 * 24 * 60 * 60 * 1000
    });
  }

  async issueAdminSession(adminValue, request) {
    const admin = normalizeAdminRecord(adminValue);
    const rawToken = randomOpaqueToken(48);
    const tokenHash = await fullHash(rawToken);
    const sessionId = `admin-session-${crypto.randomUUID()}`;
    const userAgentHash = await shortHash(
      request.headers.get('user-agent') || 'unknown'
    );
    const session = createAdminSession({
      sessionId,
      tokenHash,
      adminId: admin.adminId,
      role: admin.role,
      userAgentHash,
      now: Date.now()
    });
    await Promise.all([
      this.ctx.storage.put(adminSessionKey(tokenHash), session, {
        expirationTtl: Math.max(60, Math.ceil((session.expiresAt - Date.now()) / 1000))
      }),
      this.writeAdminAccess({
        adminId: admin.adminId,
        event: 'session-created',
        role: admin.role,
        sessionId,
        success: true
      })
    ]);
    return {
      token: rawToken,
      session: {
        sessionId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      },
      admin: publicAdmin(admin)
    };
  }

  async requireAdmin(request) {
    const rawToken = normalizeAdminToken(request);
    if (rawToken.length < 32) throw new Error('OPS_ADMIN_AUTH_REQUIRED');
    const tokenHash = await fullHash(rawToken);
    const stored = await this.ctx.storage.get(adminSessionKey(tokenHash));
    if (!sessionActive(stored, Date.now())) {
      if (stored) await this.ctx.storage.delete(adminSessionKey(tokenHash));
      throw new Error('OPS_ADMIN_SESSION_EXPIRED');
    }
    const admin = normalizeAdminRecord(
      await this.ctx.storage.get(adminKey(stored.adminId)) || {}
    );
    if (!admin.adminId || admin.enabled === false) {
      throw new Error('OPS_ADMIN_ACCOUNT_DISABLED');
    }
    const updatedSession = {
      ...stored,
      role: admin.role,
      lastSeenAt: Date.now(),
      updatedAt: Date.now()
    };
    this.ctx.waitUntil(
      this.ctx.storage.put(adminSessionKey(tokenHash), updatedSession, {
        expirationTtl: Math.max(60, Math.ceil((updatedSession.expiresAt - Date.now()) / 1000))
      })
    );
    return {
      admin,
      session: updatedSession,
      tokenHash,
      actorHash: await shortHash(`admin:${admin.adminId}`)
    };
  }

  async adminBootstrapStatus() {
    const admins = await this.listAdmins();
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      bootstrapRequired: !admins.some((admin) => admin.enabled && admin.role === 'owner'),
      adminCount: admins.length,
      passkeySupported: true,
      breakGlassConfigured: String(this.env.OPS_ADMIN_TOKEN || '').trim().length >= 32,
      webhookConfigured: String(this.env.OPS_ALERT_WEBHOOK_URL || '').trim().length > 0
    });
  }

  async adminBootstrapOptions(request) {
    await this.requireBootstrapToken(request);
    const admins = await this.listAdmins();
    if (admins.some((admin) => admin.enabled && admin.role === 'owner')) {
      throw new Error('OPS_ADMIN_BOOTSTRAP_CLOSED');
    }
    const payload = await requestJson(request);
    const handle = normalizeAdminHandle(payload.handle);
    if (handle.length < 3) throw new Error('OPS_ADMIN_HANDLE_INVALID');
    const displayName = cleanOpsString(payload.displayName, 'Arena Owner', 48);
    const { origin, rpId } = requestOrigin(request);
    const challenge = createRandomChallenge();
    const challengeId = `admin-challenge-${crypto.randomUUID()}`;
    const record = {
      challengeId,
      type: 'bootstrap',
      challenge,
      handle,
      displayName,
      role: 'owner',
      origin,
      rpId,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_CHALLENGE_TTL_MS
    };
    await this.ctx.storage.put(adminChallengeKey(challengeId), record, {
      expirationTtl: Math.ceil(ADMIN_CHALLENGE_TTL_MS / 1000)
    });
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      challengeId,
      options: adminRegistrationOptions({
        accountId: `ops-admin:${handle}`,
        accountLabel: displayName,
        challenge,
        rpId,
        rpName: 'Khadija’s Arena Staff'
      })
    });
  }

  async adminBootstrapVerify(request) {
    await this.requireBootstrapToken(request);
    const payload = await requestJson(request);
    const challengeId = cleanOpsString(payload.challengeId, '', 120);
    const challengeRecord = await this.ctx.storage.get(adminChallengeKey(challengeId));
    if (
      !challengeRecord
      || challengeRecord.type !== 'bootstrap'
      || Number(challengeRecord.expiresAt || 0) <= Date.now()
    ) throw new Error('OPS_ADMIN_CHALLENGE_INVALID');
    const admins = await this.listAdmins();
    if (admins.some((admin) => admin.enabled && admin.role === 'owner')) {
      throw new Error('OPS_ADMIN_BOOTSTRAP_CLOSED');
    }
    const credential = await verifyPasskeyRegistration({
      response: payload.credential,
      challenge: challengeRecord.challenge,
      origin: challengeRecord.origin,
      rpId: challengeRecord.rpId,
      name: cleanOpsString(payload.passkeyName, 'Owner Passkey', 48),
      now: Date.now()
    });
    if (credential.userVerified !== true) {
      throw new Error('OPS_ADMIN_USER_VERIFICATION_REQUIRED');
    }
    const adminId = `admin-${crypto.randomUUID()}`;
    const admin = normalizeAdminRecord({
      adminId,
      handle: challengeRecord.handle,
      displayName: challengeRecord.displayName,
      role: 'owner',
      enabled: true,
      passkeys: [credential],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAuthenticatedAt: Date.now()
    });
    await Promise.all([
      this.ctx.storage.put(adminKey(adminId), admin),
      this.ctx.storage.put(adminHandleKey(admin.handle), { adminId }),
      this.ctx.storage.put(adminCredentialKey(credential.credentialId), { adminId }),
      this.ctx.storage.delete(adminChallengeKey(challengeId))
    ]);
    const issued = await this.issueAdminSession(admin, request);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, ...issued });
  }

  async adminLoginOptions(request) {
    const sourceHash = cleanOpsString(request.headers.get('x-ka-ops-key'), '', 64);
    const rate = await this.consumeSourceRate(`admin-login:${sourceHash}`, {
      limit: 20,
      windowMs: 60_000,
      blockMs: 10 * 60_000
    });
    if (!rate.allowed) throw new Error('OPS_ADMIN_LOGIN_RATE_LIMITED');
    const payload = await requestJson(request);
    const handle = normalizeAdminHandle(payload.handle);
    const handleRecord = await this.ctx.storage.get(adminHandleKey(handle));
    const admin = normalizeAdminRecord(
      handleRecord?.adminId
        ? await this.ctx.storage.get(adminKey(handleRecord.adminId)) || {}
        : {}
    );
    if (!admin.adminId || admin.enabled === false || !admin.passkeys.length) {
      throw new Error('OPS_ADMIN_SIGNIN_UNAVAILABLE');
    }
    const { origin, rpId } = requestOrigin(request);
    const challenge = createRandomChallenge();
    const challengeId = `admin-challenge-${crypto.randomUUID()}`;
    await this.ctx.storage.put(adminChallengeKey(challengeId), {
      challengeId,
      type: 'login',
      challenge,
      adminId: admin.adminId,
      origin,
      rpId,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_CHALLENGE_TTL_MS
    }, { expirationTtl: Math.ceil(ADMIN_CHALLENGE_TTL_MS / 1000) });
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      challengeId,
      options: adminAuthenticationOptions({
        challenge,
        rpId,
        passkeys: admin.passkeys
      })
    });
  }

  async adminLoginVerify(request) {
    const payload = await requestJson(request);
    const challengeId = cleanOpsString(payload.challengeId, '', 120);
    const challengeRecord = await this.ctx.storage.get(adminChallengeKey(challengeId));
    if (
      !challengeRecord
      || challengeRecord.type !== 'login'
      || Number(challengeRecord.expiresAt || 0) <= Date.now()
    ) throw new Error('OPS_ADMIN_CHALLENGE_INVALID');
    const admin = normalizeAdminRecord(
      await this.ctx.storage.get(adminKey(challengeRecord.adminId)) || {}
    );
    if (!admin.adminId || admin.enabled === false) throw new Error('OPS_ADMIN_SIGNIN_UNAVAILABLE');
    const credentialId = cleanOpsString(
      payload.credential?.id || payload.credential?.rawId,
      '',
      1024
    );
    const current = normalizePasskeys(admin.passkeys)
      .find((entry) => entry.credentialId === credentialId);
    if (!current) throw new Error('OPS_ADMIN_PASSKEY_NOT_FOUND');
    const verified = await verifyPasskeyAuthentication({
      response: payload.credential,
      credential: current,
      challenge: challengeRecord.challenge,
      origin: challengeRecord.origin,
      rpId: challengeRecord.rpId,
      accountId: `ops-admin:${admin.handle}`,
      now: Date.now()
    });
    if (verified.userVerified !== true) {
      throw new Error('OPS_ADMIN_USER_VERIFICATION_REQUIRED');
    }
    const updated = normalizeAdminRecord({
      ...admin,
      passkeys: normalizePasskeys(admin.passkeys).map((entry) => (
        entry.credentialId === verified.credentialId ? verified : entry
      )),
      updatedAt: Date.now(),
      lastAuthenticatedAt: Date.now()
    });
    await Promise.all([
      this.ctx.storage.put(adminKey(updated.adminId), updated),
      this.ctx.storage.delete(adminChallengeKey(challengeId))
    ]);
    const issued = await this.issueAdminSession(updated, request);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, ...issued });
  }

  async adminEnrollOptions(request) {
    const payload = await requestJson(request);
    const code = cleanOpsString(payload.code, '', 240);
    if (code.length < 24) throw new Error('OPS_ADMIN_INVITE_INVALID');
    const codeHash = await fullHash(code);
    const invite = normalizeAdminInvite(
      await this.ctx.storage.get(adminInviteKey(codeHash)) || {}
    );
    if (!inviteActive(invite, Date.now())) throw new Error('OPS_ADMIN_INVITE_INVALID');
    if (await this.ctx.storage.get(adminHandleKey(invite.handle))) {
      throw new Error('OPS_ADMIN_HANDLE_EXISTS');
    }
    const { origin, rpId } = requestOrigin(request);
    const challenge = createRandomChallenge();
    const challengeId = `admin-challenge-${crypto.randomUUID()}`;
    await this.ctx.storage.put(adminChallengeKey(challengeId), {
      challengeId,
      type: 'enroll',
      challenge,
      codeHash,
      origin,
      rpId,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_CHALLENGE_TTL_MS
    }, { expirationTtl: Math.ceil(ADMIN_CHALLENGE_TTL_MS / 1000) });
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      challengeId,
      options: adminRegistrationOptions({
        accountId: `ops-admin:${invite.handle}`,
        accountLabel: invite.displayName,
        challenge,
        rpId,
        rpName: 'Khadija’s Arena Staff'
      })
    });
  }

  async adminEnrollVerify(request) {
    const payload = await requestJson(request);
    const code = cleanOpsString(payload.code, '', 240);
    const challengeId = cleanOpsString(payload.challengeId, '', 120);
    const codeHash = await fullHash(code);
    const [challengeRecord, inviteValue] = await Promise.all([
      this.ctx.storage.get(adminChallengeKey(challengeId)),
      this.ctx.storage.get(adminInviteKey(codeHash))
    ]);
    const invite = normalizeAdminInvite(inviteValue || {});
    if (
      !challengeRecord
      || challengeRecord.type !== 'enroll'
      || challengeRecord.codeHash !== codeHash
      || Number(challengeRecord.expiresAt || 0) <= Date.now()
      || !inviteActive(invite, Date.now())
    ) throw new Error('OPS_ADMIN_INVITE_INVALID');
    if (await this.ctx.storage.get(adminHandleKey(invite.handle))) {
      throw new Error('OPS_ADMIN_HANDLE_EXISTS');
    }
    const credential = await verifyPasskeyRegistration({
      response: payload.credential,
      challenge: challengeRecord.challenge,
      origin: challengeRecord.origin,
      rpId: challengeRecord.rpId,
      name: cleanOpsString(payload.passkeyName, 'Staff Passkey', 48),
      now: Date.now()
    });
    if (credential.userVerified !== true) {
      throw new Error('OPS_ADMIN_USER_VERIFICATION_REQUIRED');
    }
    const adminId = `admin-${crypto.randomUUID()}`;
    const admin = normalizeAdminRecord({
      adminId,
      handle: invite.handle,
      displayName: invite.displayName,
      role: invite.role,
      enabled: true,
      passkeys: [credential],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAuthenticatedAt: Date.now()
    });
    await Promise.all([
      this.ctx.storage.put(adminKey(adminId), admin),
      this.ctx.storage.put(adminHandleKey(admin.handle), { adminId }),
      this.ctx.storage.put(adminCredentialKey(credential.credentialId), { adminId }),
      this.ctx.storage.put(adminInviteKey(codeHash), { ...invite, consumedAt: Date.now() }),
      this.ctx.storage.delete(adminChallengeKey(challengeId))
    ]);
    const issued = await this.issueAdminSession(admin, request);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, ...issued });
  }

  async adminSession(actor) {
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      admin: publicAdmin(actor.admin),
      session: {
        sessionId: actor.session.sessionId,
        createdAt: actor.session.createdAt,
        lastSeenAt: actor.session.lastSeenAt,
        expiresAt: actor.session.expiresAt
      },
      passkeys: publicPasskeys(actor.admin.passkeys),
      permissions: {
        canReview: roleAllows(actor.admin.role, 'reports.review'),
        canSuspend: roleAllows(actor.admin.role, 'reports.suspension'),
        canBan: roleAllows(actor.admin.role, 'reports.ban'),
        canManageStaff: roleAllows(actor.admin.role, 'staff.manage')
      }
    });
  }

  async adminLogout(actor) {
    await Promise.all([
      this.ctx.storage.delete(adminSessionKey(actor.tokenHash)),
      this.writeAdminAccess({
        adminId: actor.admin.adminId,
        event: 'session-revoked-self',
        role: actor.admin.role,
        sessionId: actor.session.sessionId
      })
    ]);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH });
  }

  async consumeSourceRate(sourceHash, {
    limit = 60,
    windowMs = 60_000,
    blockMs = 5 * 60_000
  } = {}) {
    const key = rateKey(sourceHash);
    const current = normalizeOpsRateState(
      await this.ctx.storage.get(key) || {},
      Date.now()
    );
    const result = consumeOpsRate(current, {
      now: Date.now(),
      limit,
      windowMs,
      blockMs
    });
    await this.ctx.storage.put(key, result.state);
    return result;
  }

  async storeEvent(event) {
    const duplicate = await this.ctx.storage.get(dedupeKey(event.eventId));
    if (duplicate) return { duplicate: true };

    const key = bucketKey(event.receivedAt);
    const bucket = addEventToOpsBucket(
      await this.ctx.storage.get(key) || null,
      event
    );

    const writes = [
      this.ctx.storage.put(key, bucket),
      this.ctx.storage.put(dedupeKey(event.eventId), {
        receivedAt: event.receivedAt
      })
    ];

    if (event.severity === 'error' || event.severity === 'critical') {
      const errorRecord = {
        eventId: event.eventId,
        fingerprint: event.fingerprint,
        type: event.type,
        severity: event.severity,
        message: event.message,
        stack: event.stack,
        context: event.context,
        source: event.source,
        releasePatch: event.releasePatch,
        region: event.region,
        receivedAt: event.receivedAt
      };
      writes.push(
        this.ctx.storage.put(
          errorKey(event.receivedAt, event.eventId),
          errorRecord
        )
      );
    }

    await Promise.all(writes);
    await this.trimRecentErrors();
    if (bucket.events % 50 === 0) await this.cleanup();
    return { duplicate: false, bucket };
  }

  async ingestClientEvent(request) {
    const sourceHash = cleanOpsString(
      request.headers.get('x-ka-ops-key'),
      '',
      64
    );
    if (!sourceHash) throw new Error('OPS_SOURCE_INVALID');

    const rate = await this.consumeSourceRate(sourceHash, {
      limit: 40,
      windowMs: 60_000,
      blockMs: 10 * 60_000
    });
    if (!rate.allowed) {
      return responseJson({
        ok: false,
        error: rate.reason,
        retryAfterMs: rate.retryAfterMs
      }, {
        status: 429,
        headers: {
          'retry-after': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000)))
        }
      });
    }

    const payload = await requestJson(request);
    const event = normalizeOpsServerEvent(payload.event || payload, {
      now: Date.now(),
      sourceHash,
      region: request.headers.get('x-ka-region') || 'ZZ'
    });
    if (!event) throw new Error('OPS_EVENT_INVALID');

    const result = await this.storeEvent(event);
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      accepted: !result.duplicate,
      duplicate: result.duplicate === true
    });
  }

  async ingestRoute(request) {
    const payload = await requestJson(request);
    const event = normalizeOpsServerEvent({
      eventId: payload.eventId,
      fingerprint: payload.fingerprint,
      type: 'worker-route',
      severity: Number(payload.status) >= 500 ? 'error' : 'info',
      message: Number(payload.status) >= 500
        ? `Worker route failure ${payload.routeGroup || 'unknown'}`
        : 'Worker route observation',
      context: {
        routeGroup: payload.routeGroup,
        status: payload.status,
        method: payload.method,
        durationBucket: payload.durationBucket,
        reason: payload.reason,
        source: 'worker-edge'
      },
      source: 'worker-edge',
      releasePatch: payload.releasePatch,
      timestamp: payload.timestamp
    }, {
      now: Date.now(),
      sourceHash: cleanOpsString(payload.sourceHash, 'worker', 64),
      region: cleanOpsString(payload.region, 'ZZ', 16)
    });
    if (!event) throw new Error('OPS_ROUTE_EVENT_INVALID');
    const result = await this.storeEvent(event);
    return responseJson({
      ok: true,
      accepted: !result.duplicate,
      duplicate: result.duplicate === true
    });
  }

  async ingestModerationReport(request) {
    const payload = await requestJson(request);
    const reporterHash = await shortHash(
      `reporter:${payload.reporterAccountId || ''}`
    );
    const targetHash = await shortHash(
      `target:${payload.targetAccountId || ''}`
    );
    const roomRef = payload.context?.roomId
      ? await shortHash(`room:${payload.context.roomId}`)
      : '';

    const report = normalizeModerationReport({
      reportId: payload.reportId,
      category: payload.category,
      note: payload.note,
      context: {
        mapId: payload.context?.mapId,
        mode: payload.context?.mode,
        wave: payload.context?.wave,
        roomRef
      },
      createdAt: payload.createdAt,
      expiresAt: Math.min(
        Number(payload.expiresAt) || Date.now() + OPS1_REPORT_RETENTION_MS,
        Date.now() + OPS1_REPORT_RETENTION_MS
      )
    }, {
      now: Date.now(),
      reporterHash,
      targetHash
    });

    const existing = await this.ctx.storage.get(reportKey(report.reportId));
    if (!existing) {
      await this.ctx.storage.put(reportKey(report.reportId), report);
      if (['hate', 'cheating'].includes(report.category)) {
        this.ctx.waitUntil(this.sendOpsWebhook({
          event: 'urgent-moderation-report',
          severity: 'warning',
          subjectId: report.reportId,
          category: report.category,
          createdAt: report.createdAt
        }));
      }
    }
    await this.cleanup();
    return responseJson({
      ok: true,
      reportId: report.reportId,
      duplicate: Boolean(existing)
    });
  }

  async checkModerationRestriction(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) {
      return responseJson({ ok: true, allowed: true, anonymous: true });
    }
    const targetHash = await shortHash(`target:${accountId}`);
    const key = restrictionKey(targetHash);
    const restriction = await this.ctx.storage.get(key);
    if (!restriction) {
      return responseJson({ ok: true, allowed: true });
    }
    if (
      Number(restriction.expiresAt || 0) > 0
      && Number(restriction.expiresAt) <= Date.now()
    ) {
      await this.ctx.storage.delete(key);
      return responseJson({ ok: true, allowed: true, expired: true });
    }
    return responseJson({
      ok: true,
      allowed: false,
      action: cleanOpsString(restriction.action, 'restricted', 40),
      reason: 'OPS_MODERATION_RESTRICTED',
      expiresAt: Math.max(0, Number(restriction.expiresAt) || 0)
    });
  }


  async moderationStatus(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) throw new Error('OPS_ACCOUNT_ID_INVALID');
    const [reporterHash, targetHash] = await Promise.all([
      shortHash(`reporter:${accountId}`),
      shortHash(`target:${accountId}`)
    ]);
    const [reportsListed, appealsListed, restriction] = await Promise.all([
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.get(restrictionKey(targetHash))
    ]);
    const now = Date.now();
    let activeRestriction = restriction || null;
    if (
      activeRestriction
      && Number(activeRestriction.expiresAt || 0) > 0
      && Number(activeRestriction.expiresAt) <= now
    ) {
      await this.ctx.storage.delete(restrictionKey(targetHash));
      activeRestriction = null;
    }
    const reports = [...reportsListed.values()]
      .filter((report) => report?.reporterHash === reporterHash)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 24)
      .map((report) => ({
        reportId: report.reportId,
        category: report.category,
        status: ['actioned', 'dismissed'].includes(report.status)
          ? 'review-complete'
          : 'received',
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      }));
    const appeals = [...appealsListed.values()]
      .filter((appeal) => appeal?.targetHash === targetHash)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 12)
      .map((appeal) => ({
        appealId: appeal.appealId,
        reportId: appeal.reportId,
        status: appeal.status,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt
      }));
    return responseJson({
      ok: true,
      patch: OPS1_SERVER_PATCH,
      reports,
      appeals,
      restriction: activeRestriction
        ? {
            active: true,
            action: activeRestriction.action,
            expiresAt: Math.max(0, Number(activeRestriction.expiresAt) || 0),
            reportId: cleanOpsString(activeRestriction.reportId, '', 120),
            appealEligible: true
          }
        : { active: false, action: '', expiresAt: 0, reportId: '', appealEligible: false }
    });
  }

  async ingestModerationAppeal(request) {
    const payload = await requestJson(request);
    const accountId = cleanOpsString(payload.accountId, '', 140);
    if (!accountId) throw new Error('OPS_ACCOUNT_ID_INVALID');
    const targetHash = await shortHash(`target:${accountId}`);
    const restriction = await this.ctx.storage.get(restrictionKey(targetHash));
    if (!restriction) throw new Error('OPS_APPEAL_NOT_ELIGIBLE');
    if (
      Number(restriction.expiresAt || 0) > 0
      && Number(restriction.expiresAt) <= Date.now()
    ) {
      await this.ctx.storage.delete(restrictionKey(targetHash));
      throw new Error('OPS_APPEAL_NOT_ELIGIBLE');
    }
    const listed = await this.ctx.storage.list({ prefix: 'appeal:' });
    const existing = [...listed.values()].find((appeal) => (
      appeal?.targetHash === targetHash
      && appeal?.reportId === restriction.reportId
      && ['pending', 'reviewing'].includes(appeal?.status)
    ));
    if (existing) {
      return responseJson({
        ok: true,
        duplicate: true,
        appeal: {
          appealId: existing.appealId,
          reportId: existing.reportId,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt
        }
      });
    }
    const now = Date.now();
    const appeal = normalizeModerationAppeal({
      appealId: `appeal-${crypto.randomUUID()}`,
      reportId: restriction.reportId,
      note: payload.note,
      status: 'pending',
      action: 'none',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + OPS1_APPEAL_RETENTION_MS
    }, { now, targetHash });
    await this.ctx.storage.put(appealKey(appeal.appealId), appeal);
    this.ctx.waitUntil(this.sendOpsWebhook({
      event: 'moderation-appeal-received',
      severity: 'info',
      subjectId: appeal.appealId,
      category: 'appeal',
      createdAt: appeal.createdAt
    }));
    return responseJson({
      ok: true,
      duplicate: false,
      appeal: {
        appealId: appeal.appealId,
        reportId: appeal.reportId,
        status: appeal.status,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt
      }
    });
  }

  async listBuckets() {
    const listed = await this.ctx.storage.list({ prefix: 'bucket:' });
    return [...listed.values()];
  }

  async pendingReportCount() {
    const listed = await this.ctx.storage.list({ prefix: 'report:' });
    let pending = 0;
    for (const report of listed.values()) {
      if (report?.status === 'pending' || report?.status === 'reviewing') {
        pending += 1;
      }
    }
    return pending;
  }

  async publicHealth() {
    const [buckets, pendingReports] = await Promise.all([
      this.listBuckets(),
      this.pendingReportCount()
    ]);
    return responseJson(
      summarizeOpsHealth({
        buckets,
        pendingReports,
        now: Date.now(),
        releasePatch: OPS1_SERVER_PATCH
      })
    );
  }

  async adminSummary(actor) {
    const [buckets, pendingReports, errors, reportsListed, appealsListed, restrictionsListed, admins] = await Promise.all([
      this.listBuckets(),
      this.pendingReportCount(),
      this.ctx.storage.list({ prefix: 'error:' }),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.list({ prefix: 'restriction:' }),
      this.listAdmins()
    ]);
    const reports = [...reportsListed.values()];
    const appeals = [...appealsListed.values()];
    const openReports = reports.filter((report) => ['pending', 'reviewing'].includes(report?.status));
    const urgentReports = openReports.filter((report) => (
      ['hate', 'cheating'].includes(report?.category)
      || moderationReportGroup(reports, report).coordinatedSignal
    ));
    const oldestPendingAt = openReports.length
      ? Math.min(...openReports.map((report) => Number(report?.createdAt || Date.now())))
      : 0;
    const pendingAppeals = appeals.filter((appeal) => ['pending', 'reviewing'].includes(appeal?.status));
    return responseJson({
      admin: publicAdmin(actor?.admin || {}),
      sessionExpiresAt: Number(actor?.session?.expiresAt || 0),
      webhookConfigured: String(this.env.OPS_ALERT_WEBHOOK_URL || '').trim().length > 0,
      assignees: admins
        .filter((entry) => entry.enabled && roleAllows(entry.role, 'reports.review'))
        .map((entry) => publicAdmin(entry)),
      ...summarizeOpsHealth({
        buckets,
        pendingReports,
        now: Date.now(),
        releasePatch: OPS1_SERVER_PATCH
      }),
      buckets: buckets
        .sort((left, right) => Number(right.startedAt) - Number(left.startedAt))
        .slice(0, 48),
      recentErrors: [...errors.values()]
        .sort((left, right) => Number(right.receivedAt) - Number(left.receivedAt))
        .slice(0, OPS1_MAX_RECENT_ERRORS),
      reportCounts: reports.reduce((output, report) => {
        const status = cleanOpsString(report?.status, 'pending', 24);
        output[status] = (output[status] || 0) + 1;
        return output;
      }, {}),
      appealCounts: appeals.reduce((output, appeal) => {
        const status = cleanOpsString(appeal?.status, 'pending', 24);
        output[status] = (output[status] || 0) + 1;
        return output;
      }, {}),
      restrictionCount: [...restrictionsListed.values()].filter((restriction) => (
        Number(restriction?.expiresAt || 0) === 0
        || Number(restriction?.expiresAt) > Date.now()
      )).length,
      moderationAlerts: {
        pendingReports: openReports.length,
        urgentReports: urgentReports.length,
        pendingAppeals: pendingAppeals.length,
        oldestPendingAt,
        attentionRequired: openReports.length > 0 || pendingAppeals.length > 0
      }
    });
  }

  async adminReports(url, actor) {
    const listed = await this.ctx.storage.list({ prefix: 'report:' });
    const allReports = [...listed.values()];
    const enriched = allReports.map((report) => {
      const group = moderationReportGroup(allReports, report);
      return {
        ...report,
        group,
        reporterHistory: moderationReporterHistory(allReports, report.reporterHash),
        priority: moderationPriority({ ...report, group }, Date.now())
      };
    });
    const reports = filterModerationReports(enriched, {
      status: url.searchParams.get('status'),
      category: url.searchParams.get('category'),
      assignedTo: url.searchParams.get('assignedTo'),
      query: url.searchParams.get('q')
    })
      .sort((left, right) => (
        Number(right.priority?.score || 0) - Number(left.priority?.score || 0)
        || Number(right.createdAt) - Number(left.createdAt)
      ))
      .slice(0, 300);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor?.admin || {}),
      reports
    });
  }

  async adminReportAction(request, actor) {
    const payload = await requestJson(request);
    const reportId = cleanOpsString(payload.reportId, '', 120);
    if (!reportId) throw new Error('OPS_REPORT_ID_INVALID');
    const current = await this.ctx.storage.get(reportKey(reportId));
    if (!current) throw new Error('OPS_REPORT_NOT_FOUND');

    const requestedAction = cleanOpsString(payload.action, 'none', 40);
    const requestedStatus = cleanOpsString(payload.status, '', 24);
    if (requestedStatus === 'reviewing' || requestedAction === 'none') {
      this.requirePermission(actor, 'reports.review');
    } else if (requestedAction === 'warning') {
      this.requirePermission(actor, 'reports.warning');
    } else if (requestedAction === 'temporary-restriction') {
      this.requirePermission(actor, 'reports.temporary-restriction');
    } else if (requestedAction === 'suspension') {
      this.requirePermission(actor, 'reports.suspension');
    } else if (requestedAction === 'ban') {
      this.requirePermission(actor, 'reports.ban');
    } else if (requestedAction === 'dismissed') {
      this.requirePermission(actor, 'reports.dismiss');
    } else {
      throw new Error('OPS_MODERATION_ACTION_INVALID');
    }

    if (!validateDecisionConfirmation({
      subjectType: 'report',
      action: requestedAction,
      subjectId: reportId,
      confirmation: payload.confirmation
    })) throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');

    const result = applyModerationAction(current, {
      auditId: `audit-${crypto.randomUUID()}`,
      status: requestedStatus,
      action: requestedAction,
      note: payload.note
    }, {
      now: Date.now(),
      actorHash: actor.actorHash
    });
    result.report.assignedToAdminId = cleanOpsString(
      result.report.assignedToAdminId || actor.admin.adminId,
      actor.admin.adminId,
      120
    );
    result.audit.actorAdminId = actor.admin.adminId;
    result.audit.actorRole = actor.admin.role;

    const restriction = moderationRestrictionForAction({
      action: result.report.action,
      note: payload.note
    }, {
      now: result.audit.createdAt,
      reportId,
      targetHash: result.report.targetHash
    });
    const restrictionStorageKey = restrictionKey(result.report.targetHash);
    const writes = [
      this.ctx.storage.put(reportKey(reportId), result.report),
      this.ctx.storage.put(
        auditKey(result.audit.createdAt, result.audit.auditId),
        result.audit
      )
    ];
    if (restriction) {
      writes.push(this.ctx.storage.put(restrictionStorageKey, restriction));
    } else if (result.report.action === 'dismissed') {
      const currentRestriction = await this.ctx.storage.get(restrictionStorageKey);
      if (currentRestriction?.reportId === reportId) {
        writes.push(this.ctx.storage.delete(restrictionStorageKey));
      }
    }
    await Promise.all(writes);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      report: result.report,
      restriction
    });
  }

  async adminReportAssign(request, actor) {
    const payload = await requestJson(request);
    const reportId = cleanOpsString(payload.reportId, '', 120);
    const assignedToAdminId = cleanOpsString(payload.assignedToAdminId, '', 120);
    const current = await this.ctx.storage.get(reportKey(reportId));
    if (!current) throw new Error('OPS_REPORT_NOT_FOUND');
    if (assignedToAdminId) {
      const assignee = normalizeAdminRecord(
        await this.ctx.storage.get(adminKey(assignedToAdminId)) || {}
      );
      if (!assignee.adminId || assignee.enabled === false) {
        throw new Error('OPS_ADMIN_ASSIGNEE_INVALID');
      }
    }
    const updated = {
      ...current,
      assignedToAdminId,
      updatedAt: Date.now()
    };
    const audit = {
      auditId: `audit-${crypto.randomUUID()}`,
      subjectType: 'report',
      subjectId: reportId,
      reportId,
      status: updated.status,
      action: assignedToAdminId ? 'assigned' : 'unassigned',
      note: assignedToAdminId,
      actorHash: actor.actorHash,
      actorAdminId: actor.admin.adminId,
      actorRole: actor.admin.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    };
    await Promise.all([
      this.ctx.storage.put(reportKey(reportId), updated),
      this.ctx.storage.put(auditKey(audit.createdAt, audit.auditId), audit)
    ]);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, report: updated });
  }

  async adminReportNote(request, actor) {
    const payload = await requestJson(request);
    const reportId = cleanOpsString(payload.reportId, '', 120);
    const current = await this.ctx.storage.get(reportKey(reportId));
    if (!current) throw new Error('OPS_REPORT_NOT_FOUND');
    const updated = appendInternalNote(current, {
      noteId: `note-${crypto.randomUUID()}`,
      actorHash: actor.actorHash,
      actorAdminId: actor.admin.adminId,
      text: payload.note,
      now: Date.now()
    });
    const audit = {
      auditId: `audit-${crypto.randomUUID()}`,
      subjectType: 'report',
      subjectId: reportId,
      reportId,
      status: updated.status,
      action: 'internal-note',
      note: 'Internal note added',
      actorHash: actor.actorHash,
      actorAdminId: actor.admin.adminId,
      actorRole: actor.admin.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    };
    await Promise.all([
      this.ctx.storage.put(reportKey(reportId), updated),
      this.ctx.storage.put(auditKey(audit.createdAt, audit.auditId), audit)
    ]);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, report: updated });
  }

  async adminCaseTimeline(url, actor) {
    const targetHash = cleanOpsString(url.searchParams.get('targetHash'), '', 64);
    if (!targetHash) throw new Error('OPS_CASE_TARGET_INVALID');
    const [reportsListed, appealsListed, restrictionsListed, auditListed] = await Promise.all([
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.list({ prefix: 'restriction:' }),
      this.ctx.storage.list({ prefix: 'audit:' })
    ]);
    const reports = [...reportsListed.values()]
      .filter((report) => report?.targetHash === targetHash)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const reportIds = new Set(reports.map((report) => report.reportId));
    const appeals = [...appealsListed.values()]
      .filter((appeal) => appeal?.targetHash === targetHash || reportIds.has(appeal?.reportId))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const restrictions = [...restrictionsListed.values()]
      .filter((restriction) => restriction?.targetHash === targetHash)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const audit = [...auditListed.values()]
      .filter((entry) => reportIds.has(entry?.reportId))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor.admin),
      targetHash,
      reports,
      appeals,
      restrictions,
      audit
    });
  }

  async adminAppeals(url, actor) {
    const statusFilter = cleanOpsString(url.searchParams.get('status'), '', 24);
    const listed = await this.ctx.storage.list({ prefix: 'appeal:' });
    const appeals = [...listed.values()]
      .filter((appeal) => !statusFilter || appeal.status === statusFilter)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 200);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor?.admin || {}),
      appeals
    });
  }

  async adminAppealAction(request, actor) {
    const payload = await requestJson(request);
    const appealId = cleanOpsString(payload.appealId, '', 120);
    if (!appealId) throw new Error('OPS_APPEAL_ID_INVALID');
    const current = await this.ctx.storage.get(appealKey(appealId));
    if (!current) throw new Error('OPS_APPEAL_NOT_FOUND');
    const requestedAction = cleanOpsString(payload.action, 'none', 40);
    const requestedStatus = cleanOpsString(payload.status, '', 24);
    if (
      requestedStatus !== 'reviewing'
      && !['uphold', 'reduce', 'lift'].includes(requestedAction)
    ) throw new Error('OPS_APPEAL_ACTION_INVALID');
    if (!validateDecisionConfirmation({
      subjectType: 'appeal',
      action: requestedAction,
      subjectId: appealId,
      confirmation: payload.confirmation
    })) throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');

    const result = applyModerationAppealAction(current, {
      auditId: `audit-${crypto.randomUUID()}`,
      status: requestedStatus,
      action: requestedAction,
      note: payload.note
    }, {
      now: Date.now(),
      actorHash: actor.actorHash
    });
    result.audit.actorAdminId = actor.admin.adminId;
    result.audit.actorRole = actor.admin.role;
    const restrictionStorageKey = restrictionKey(result.appeal.targetHash);
    const currentRestriction = await this.ctx.storage.get(restrictionStorageKey);
    const writes = [
      this.ctx.storage.put(appealKey(appealId), result.appeal),
      this.ctx.storage.put(
        auditKey(result.audit.createdAt, result.audit.auditId),
        result.audit
      )
    ];
    let restriction = currentRestriction || null;
    if (result.appeal.action === 'lift') {
      writes.push(this.ctx.storage.delete(restrictionStorageKey));
      restriction = null;
    } else if (result.appeal.action === 'reduce' && currentRestriction) {
      restriction = {
        ...currentRestriction,
        action: 'temporary-restriction',
        reason: redactOpsServerText(payload.note || currentRestriction.reason, 160),
        appealId,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
      writes.push(this.ctx.storage.put(restrictionStorageKey, restriction));
    }
    await Promise.all(writes);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      appeal: result.appeal,
      restriction
    });
  }

  async adminRestrictions(actor) {
    const listed = await this.ctx.storage.list({ prefix: 'restriction:' });
    const now = Date.now();
    const restrictions = [...listed.values()]
      .filter((restriction) => (
        Number(restriction?.expiresAt || 0) === 0
        || Number(restriction?.expiresAt) > now
      ))
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 200);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor?.admin || {}),
      restrictions
    });
  }

  async adminAudit(url, actor) {
    const limit = Math.max(
      1,
      Math.min(200, Math.floor(Number(url.searchParams.get('limit')) || 100))
    );
    const listed = await this.ctx.storage.list({ prefix: 'audit:' });
    const audit = [...listed.values()]
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, limit);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor?.admin || {}),
      audit
    });
  }


  async adminRestrictionAction(request, actor) {
    const payload = await requestJson(request);
    const targetHash = cleanOpsString(payload.targetHash, '', 64);
    const action = cleanOpsString(payload.action, '', 40);
    if (!targetHash) throw new Error('OPS_RESTRICTION_TARGET_INVALID');
    const key = restrictionKey(targetHash);
    const current = await this.ctx.storage.get(key);
    if (!current) throw new Error('OPS_RESTRICTION_NOT_FOUND');
    if (!validateDecisionConfirmation({
      subjectType: 'restriction',
      action: 'ban',
      subjectId: targetHash,
      confirmation: payload.confirmation
    })) throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');

    let restriction = null;
    if (action === 'lift') {
      await this.ctx.storage.delete(key);
    } else if (['extend-24-hours', 'extend-7-days'].includes(action)) {
      const duration = action === 'extend-7-days'
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
      restriction = {
        ...current,
        action: action === 'extend-7-days' ? 'suspension' : 'temporary-restriction',
        updatedAt: Date.now(),
        expiresAt: Date.now() + duration,
        reason: redactOpsServerText(payload.note || current.reason, 160)
      };
      await this.ctx.storage.put(key, restriction);
    } else {
      throw new Error('OPS_RESTRICTION_ACTION_INVALID');
    }
    const audit = {
      auditId: `audit-${crypto.randomUUID()}`,
      subjectType: 'restriction',
      subjectId: targetHash,
      reportId: cleanOpsString(current.reportId, '', 120),
      status: restriction ? 'active' : 'lifted',
      action,
      note: redactOpsServerText(payload.note, 240),
      actorHash: actor.actorHash,
      actorAdminId: actor.admin.adminId,
      actorRole: actor.admin.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    };
    await this.ctx.storage.put(auditKey(audit.createdAt, audit.auditId), audit);
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, restriction });
  }

  async adminAuditExport(url, actor) {
    const format = cleanOpsString(url.searchParams.get('format'), 'json', 12).toLowerCase();
    const listed = await this.ctx.storage.list({ prefix: 'audit:' });
    const audit = [...listed.values()]
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 5000);
    if (format === 'csv') {
      return new Response(moderationAuditCsv(audit), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="khadijas-arena-moderation-audit-${Date.now()}.csv"`,
          'cache-control': 'no-store'
        }
      });
    }
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      exportedBy: publicAdmin(actor.admin),
      exportedAt: Date.now(),
      audit
    });
  }

  async adminPlatform(actor) {
    const [buckets, errors, access, admins, sessions] = await Promise.all([
      this.listBuckets(),
      this.ctx.storage.list({ prefix: 'error:' }),
      this.ctx.storage.list({ prefix: 'admin-access:' }),
      this.listAdmins(),
      this.ctx.storage.list({ prefix: 'admin-session:' })
    ]);
    const now = Date.now();
    const recentAccess = [...access.values()]
      .filter((entry) => Number(entry?.createdAt || 0) >= now - 24 * 60 * 60 * 1000);
    const failedAccess = recentAccess.filter((entry) => entry?.success === false);
    let social = {
      available: Boolean(this.env.SOCIAL),
      retryingReports: null,
      reportForwardFailures: null
    };
    if (this.env.SOCIAL) {
      try {
        const id = this.env.SOCIAL.idFromName('global-v1');
        const response = await this.env.SOCIAL.get(id).fetch(
          new Request('https://social.internal/internal/social/ops/summary', {
            method: 'GET',
            headers: { 'x-ka-internal-ops': '1' }
          })
        );
        const value = await response.json().catch(() => ({}));
        if (response.ok && value.ok === true) social = value;
      } catch {
        social = { ...social, available: false };
      }
    }
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor.admin),
      generatedAt: now,
      services: {
        worker: true,
        opsBinding: true,
        socialBinding: Boolean(this.env.SOCIAL),
        matchmakingBinding: Boolean(this.env.MATCHMAKING),
        webhookConfigured: String(this.env.OPS_ALERT_WEBHOOK_URL || '').trim().length > 0,
        breakGlassConfigured: String(this.env.OPS_ADMIN_TOKEN || '').trim().length >= 32
      },
      administratorSecurity: {
        enabledAdmins: admins.filter((admin) => admin.enabled).length,
        activeSessions: [...sessions.values()].filter((entry) => sessionActive(entry, now)).length,
        accessAttempts24h: recentAccess.length,
        failedAccessAttempts24h: failedAccess.length
      },
      telemetry: {
        buckets: buckets
          .sort((a, b) => Number(b.startedAt) - Number(a.startedAt))
          .slice(0, 24),
        recentErrors: [...errors.values()]
          .sort((a, b) => Number(b.receivedAt) - Number(a.receivedAt))
          .slice(0, 60)
      },
      social
    });
  }

  async adminStaff(actor) {
    const [admins, sessions, access] = await Promise.all([
      this.listAdmins(),
      this.ctx.storage.list({ prefix: 'admin-session:' }),
      this.ctx.storage.list({ prefix: 'admin-access:' })
    ]);
    const now = Date.now();
    const publicRecords = admins.map((admin) => ({
      ...publicAdmin(admin),
      activeSessions: [...sessions.values()].filter((entry) => (
        entry?.adminId === admin.adminId && sessionActive(entry, now)
      )).length,
      recentAccess: [...access.values()]
        .filter((entry) => entry?.adminId === admin.adminId)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .slice(0, 12)
    }));
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      actor: publicAdmin(actor.admin),
      staff: publicRecords
    });
  }

  async adminStaffInvite(request, actor) {
    const payload = await requestJson(request);
    const handle = normalizeAdminHandle(payload.handle);
    if (handle.length < 3) throw new Error('OPS_ADMIN_HANDLE_INVALID');
    if (await this.ctx.storage.get(adminHandleKey(handle))) {
      throw new Error('OPS_ADMIN_HANDLE_EXISTS');
    }
    const role = normalizeAdminRole(payload.role, 'viewer');
    const code = randomOpaqueToken(32);
    const codeHash = await fullHash(code);
    const invite = normalizeAdminInvite({
      inviteId: `admin-invite-${crypto.randomUUID()}`,
      codeHash,
      handle,
      displayName: cleanOpsString(payload.displayName, 'Arena Staff', 48),
      role,
      createdByAdminId: actor.admin.adminId,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_INVITE_TTL_MS
    });
    await this.ctx.storage.put(adminInviteKey(codeHash), invite, {
      expirationTtl: Math.ceil(ADMIN_INVITE_TTL_MS / 1000)
    });
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      invite: {
        inviteId: invite.inviteId,
        handle: invite.handle,
        displayName: invite.displayName,
        role: invite.role,
        code,
        expiresAt: invite.expiresAt
      }
    });
  }

  async adminStaffRole(request, actor) {
    const payload = await requestJson(request);
    const adminId = cleanOpsString(payload.adminId, '', 120);
    const role = normalizeAdminRole(payload.role, '');
    if (!adminId || !role) throw new Error('OPS_ADMIN_ROLE_INVALID');
    if (adminId === actor.admin.adminId && role !== 'owner') {
      throw new Error('OPS_ADMIN_SELF_DEMOTION_FORBIDDEN');
    }
    if (cleanOpsString(payload.confirmation, '', 160) !== adminId) {
      throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');
    }
    const current = normalizeAdminRecord(
      await this.ctx.storage.get(adminKey(adminId)) || {}
    );
    if (!current.adminId) throw new Error('OPS_ADMIN_NOT_FOUND');
    if (current.role === 'owner' && role !== 'owner') {
      const admins = await this.listAdmins();
      const enabledOwners = admins.filter((entry) => entry.enabled && entry.role === 'owner');
      if (enabledOwners.length <= 1) throw new Error('OPS_ADMIN_LAST_OWNER_FORBIDDEN');
    }
    const updated = normalizeAdminRecord({
      ...current,
      role,
      updatedAt: Date.now()
    });
    await this.ctx.storage.put(adminKey(adminId), updated);
    await this.revokeAdminSessions(adminId, { exceptSessionId: '' });
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, admin: publicAdmin(updated) });
  }

  async adminStaffStatus(request, actor) {
    const payload = await requestJson(request);
    const adminId = cleanOpsString(payload.adminId, '', 120);
    const enabled = payload.enabled === true;
    if (!adminId || adminId === actor.admin.adminId) {
      throw new Error('OPS_ADMIN_STATUS_INVALID');
    }
    if (cleanOpsString(payload.confirmation, '', 160) !== adminId) {
      throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');
    }
    const current = normalizeAdminRecord(
      await this.ctx.storage.get(adminKey(adminId)) || {}
    );
    if (!current.adminId) throw new Error('OPS_ADMIN_NOT_FOUND');
    if (current.role === 'owner' && current.enabled && !enabled) {
      const admins = await this.listAdmins();
      const enabledOwners = admins.filter((entry) => entry.enabled && entry.role === 'owner');
      if (enabledOwners.length <= 1) throw new Error('OPS_ADMIN_LAST_OWNER_FORBIDDEN');
    }
    const updated = normalizeAdminRecord({
      ...current,
      enabled,
      updatedAt: Date.now()
    });
    await this.ctx.storage.put(adminKey(adminId), updated);
    if (!enabled) await this.revokeAdminSessions(adminId, { exceptSessionId: '' });
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, admin: publicAdmin(updated) });
  }

  async revokeAdminSessions(adminId, { exceptSessionId = '' } = {}) {
    const listed = await this.ctx.storage.list({ prefix: 'admin-session:' });
    const removals = [...listed.entries()]
      .filter(([, value]) => (
        value?.adminId === adminId
        && (!exceptSessionId || value?.sessionId !== exceptSessionId)
      ))
      .map(([key]) => key);
    if (removals.length) await this.ctx.storage.delete(removals);
    return removals.length;
  }

  async adminSessions(url, actor) {
    const requestedAdminId = cleanOpsString(url.searchParams.get('adminId'), '', 120);
    const canManageAll = roleAllows(actor.admin.role, 'sessions.manage-all');
    const adminId = requestedAdminId || (canManageAll ? '' : actor.admin.adminId);
    if (
      adminId
      && adminId !== actor.admin.adminId
      && !canManageAll
    ) throw new Error('OPS_ADMIN_FORBIDDEN');
    const listed = await this.ctx.storage.list({ prefix: 'admin-session:' });
    const sessions = [...listed.values()]
      .filter((entry) => !adminId || entry?.adminId === adminId)
      .map((entry) => ({
        sessionId: entry.sessionId,
        adminId: entry.adminId,
        role: entry.role,
        createdAt: entry.createdAt,
        lastSeenAt: entry.lastSeenAt,
        expiresAt: entry.expiresAt,
        active: sessionActive(entry, Date.now()),
        current: entry.sessionId === actor.session.sessionId,
        userAgentHash: entry.userAgentHash
      }))
      .sort((a, b) => Number(b.lastSeenAt) - Number(a.lastSeenAt));
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, sessions });
  }

  async adminSessionRevoke(request, actor) {
    const payload = await requestJson(request);
    const sessionId = cleanOpsString(payload.sessionId, '', 120);
    if (!sessionId) throw new Error('OPS_ADMIN_SESSION_ID_INVALID');
    const listed = await this.ctx.storage.list({ prefix: 'admin-session:' });
    const found = [...listed.entries()].find(([, value]) => value?.sessionId === sessionId);
    if (!found) return responseJson({ ok: true, patch: POST_FINAL6_PATCH, revoked: false });
    const [key, session] = found;
    if (
      session.adminId !== actor.admin.adminId
      && !roleAllows(actor.admin.role, 'sessions.manage-all')
    ) throw new Error('OPS_ADMIN_FORBIDDEN');
    await this.ctx.storage.delete(key);
    await this.writeAdminAccess({
      adminId: session.adminId,
      event: 'session-revoked',
      role: session.role,
      sessionId,
      success: true
    });
    return responseJson({ ok: true, patch: POST_FINAL6_PATCH, revoked: true });
  }

  async adminAdditionalPasskeyOptions(request, actor) {
    if (normalizePasskeys(actor.admin.passkeys).length >= ADMIN_MAX_PASSKEYS) {
      throw new Error('OPS_ADMIN_PASSKEY_LIMIT');
    }
    const payload = await requestJson(request);
    const { origin, rpId } = requestOrigin(request);
    const challenge = createRandomChallenge();
    const challengeId = `admin-challenge-${crypto.randomUUID()}`;
    await this.ctx.storage.put(adminChallengeKey(challengeId), {
      challengeId,
      type: 'add-passkey',
      challenge,
      adminId: actor.admin.adminId,
      name: cleanOpsString(payload.name, 'Additional Staff Passkey', 48),
      origin,
      rpId,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_CHALLENGE_TTL_MS
    }, { expirationTtl: Math.ceil(ADMIN_CHALLENGE_TTL_MS / 1000) });
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      challengeId,
      options: adminRegistrationOptions({
        accountId: `ops-admin:${actor.admin.handle}`,
        accountLabel: actor.admin.displayName,
        challenge,
        rpId,
        rpName: 'Khadija’s Arena Staff',
        passkeys: actor.admin.passkeys
      })
    });
  }

  async adminAdditionalPasskeyVerify(request, actor) {
    const payload = await requestJson(request);
    const challengeId = cleanOpsString(payload.challengeId, '', 120);
    const challengeRecord = await this.ctx.storage.get(adminChallengeKey(challengeId));
    if (
      !challengeRecord
      || challengeRecord.type !== 'add-passkey'
      || challengeRecord.adminId !== actor.admin.adminId
      || Number(challengeRecord.expiresAt || 0) <= Date.now()
    ) throw new Error('OPS_ADMIN_CHALLENGE_INVALID');
    const credential = await verifyPasskeyRegistration({
      response: payload.credential,
      challenge: challengeRecord.challenge,
      origin: challengeRecord.origin,
      rpId: challengeRecord.rpId,
      name: challengeRecord.name,
      now: Date.now()
    });
    if (credential.userVerified !== true) {
      throw new Error('OPS_ADMIN_USER_VERIFICATION_REQUIRED');
    }
    const updated = normalizeAdminRecord({
      ...actor.admin,
      passkeys: normalizePasskeys([...actor.admin.passkeys, credential]),
      updatedAt: Date.now()
    });
    await Promise.all([
      this.ctx.storage.put(adminKey(updated.adminId), updated),
      this.ctx.storage.put(adminCredentialKey(credential.credentialId), { adminId: updated.adminId }),
      this.ctx.storage.delete(adminChallengeKey(challengeId))
    ]);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      admin: publicAdmin(updated),
      passkeys: publicPasskeys(updated.passkeys)
    });
  }

  async adminPasskeyRevoke(request, actor) {
    const payload = await requestJson(request);
    const credentialId = cleanOpsString(payload.credentialId, '', 1024);
    if (!credentialId) throw new Error('OPS_ADMIN_PASSKEY_ID_INVALID');
    const passkeys = normalizePasskeys(actor.admin.passkeys);
    if (passkeys.length <= 1) throw new Error('OPS_ADMIN_LAST_PASSKEY_FORBIDDEN');
    if (cleanOpsString(payload.confirmation, '', 120) !== 'REVOKE') {
      throw new Error('OPS_ADMIN_CONFIRMATION_REQUIRED');
    }
    const updated = normalizeAdminRecord({
      ...actor.admin,
      passkeys: passkeys.filter((entry) => entry.credentialId !== credentialId),
      updatedAt: Date.now()
    });
    if (updated.passkeys.length === passkeys.length) {
      throw new Error('OPS_ADMIN_PASSKEY_NOT_FOUND');
    }
    await Promise.all([
      this.ctx.storage.put(adminKey(updated.adminId), updated),
      this.ctx.storage.delete(adminCredentialKey(credentialId)),
      this.revokeAdminSessions(updated.adminId, {
        exceptSessionId: actor.session.sessionId
      })
    ]);
    return responseJson({
      ok: true,
      patch: POST_FINAL6_PATCH,
      admin: publicAdmin(updated),
      passkeys: publicPasskeys(updated.passkeys)
    });
  }

  async sendOpsWebhook(event) {
    const webhookUrl = String(this.env.OPS_ALERT_WEBHOOK_URL || '').trim();
    if (!/^https:\/\//i.test(webhookUrl)) return false;
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service: 'Khadija’s Arena',
          patch: POST_FINAL6_PATCH,
          event: cleanOpsString(event?.event, 'moderation-alert', 80),
          severity: cleanOpsString(event?.severity, 'warning', 24),
          subjectId: cleanOpsString(event?.subjectId, '', 120),
          category: cleanOpsString(event?.category, '', 40),
          createdAt: Math.max(0, Number(event?.createdAt) || Date.now()),
          privacy: 'No report note, player identity, token or credential is included.'
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async trimRecentErrors() {
    const listed = await this.ctx.storage.list({ prefix: 'error:' });
    const entries = [...listed.entries()].sort(
      (left, right) => Number(right[1]?.receivedAt) - Number(left[1]?.receivedAt)
    );
    const removals = entries
      .slice(OPS1_MAX_RECENT_ERRORS)
      .map(([key]) => key);
    if (removals.length) await this.ctx.storage.delete(removals);
  }

  async cleanup() {
    const now = Date.now();
    const [
      buckets,
      errors,
      dedupe,
      reports,
      appeals,
      audit,
      rates,
      restrictions,
      adminAccess,
      adminSessions,
      adminChallenges,
      adminInvites
    ] = await Promise.all([
      this.ctx.storage.list({ prefix: 'bucket:' }),
      this.ctx.storage.list({ prefix: 'error:' }),
      this.ctx.storage.list({ prefix: 'dedupe:' }),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'appeal:' }),
      this.ctx.storage.list({ prefix: 'audit:' }),
      this.ctx.storage.list({ prefix: 'rate:' }),
      this.ctx.storage.list({ prefix: 'restriction:' }),
      this.ctx.storage.list({ prefix: 'admin-access:' }),
      this.ctx.storage.list({ prefix: 'admin-session:' }),
      this.ctx.storage.list({ prefix: 'admin-challenge:' }),
      this.ctx.storage.list({ prefix: 'admin-invite:' })
    ]);

    const removals = [];
    for (const [key, value] of buckets) {
      if (Number(value?.startedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of errors) {
      if (Number(value?.receivedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of dedupe) {
      if (Number(value?.receivedAt || 0) < now - OPS1_EVENT_RETENTION_MS) {
        removals.push(key);
      }
    }
    for (const [key, value] of reports) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of appeals) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of audit) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of rates) {
      const state = normalizeOpsRateState(value, now);
      if (
        state.blockedUntil < now
        && state.startedAt < now - 24 * 60 * 60 * 1000
      ) {
        removals.push(key);
      }
    }
    for (const [key, value] of restrictions) {
      if (
        Number(value?.expiresAt || 0) > 0
        && Number(value.expiresAt) < now
      ) {
        removals.push(key);
      }
    }
    for (const [key, value] of adminAccess) {
      if (Number(value?.expiresAt || 0) > 0 && Number(value.expiresAt) < now) {
        removals.push(key);
      }
    }
    for (const [key, value] of adminSessions) {
      if (!sessionActive(value, now)) removals.push(key);
    }
    for (const [key, value] of adminChallenges) {
      if (Number(value?.expiresAt || 0) < now) removals.push(key);
    }
    for (const [key, value] of adminInvites) {
      if (
        Number(value?.expiresAt || 0) < now
        || Number(value?.consumedAt || 0) > 0
      ) removals.push(key);
    }
    if (removals.length) await this.ctx.storage.delete(removals);
  }
}

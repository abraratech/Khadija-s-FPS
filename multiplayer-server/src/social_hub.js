import { DurableObject } from 'cloudflare:workers';
import {
  SOCIAL1_BLOCK_LIMIT,
  SOCIAL1_FRIEND_LIMIT,
  SOCIAL1_PARTY_LIMIT,
  SOCIAL1_PRESENCE_TTL_MS,
  SOCIAL1_SERVER_PATCH,
  SOCIAL1_SERVER_SCHEMA,
  SOCIAL1_TICKET_TTL_MS,
  SOCIAL_MATCH3_PARTY_TICKET_TTL_MS,
  SOCIAL_MATCH3_PATCH,
  addRecentOpponent,
  blocksPair,
  canReceiveFriendRequest,
  cleanAccountId,
  cleanFriendCode,
  cleanPartyCode,
  cleanSocialId,
  cleanSocialString,
  normalizeParty,
  normalizePartyMatchmakingClaim,
  normalizePresence,
  normalizePrivacy,
  normalizeSocialRecord
} from './social_core.js';

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 32_000;
const REPORT_NOTE_LIMIT = 240;
const REPORT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const APPEAL_NOTE_LIMIT = 500;
const REPORT_FORWARD_BASE_RETRY_MS = 60_000;
const REPORT_FORWARD_MAX_RETRY_MS = 6 * 60 * 60 * 1000;
const PARTY_ROOM_TTL_MS = 20 * 60 * 1000;
const SOCIAL_RATE_WINDOW_MS = 60_000;
const INTERNAL_SOCIAL_AUTH_HEADER = 'x-ka-internal-social-auth';
const INTERNAL_SOCIAL_ACCOUNT_HEADER = 'x-ka-social-account-id';
const INTERNAL_SOCIAL_NAME_HEADER = 'x-ka-social-display-name';

function trustedProxyAuthentication(request) {
  if (request.headers.get(INTERNAL_SOCIAL_AUTH_HEADER) !== '1') return null;
  const accountId = cleanAccountId(request.headers.get(INTERNAL_SOCIAL_ACCOUNT_HEADER));
  if (!accountId) throw new Error('SOCIAL_AUTH_CONTEXT_INVALID');
  let displayName = 'Player';
  try {
    displayName = decodeURIComponent(String(request.headers.get(INTERNAL_SOCIAL_NAME_HEADER) || 'Player'));
  } catch {
    displayName = 'Player';
  }
  displayName = cleanSocialString(displayName, 'Player', 24);
  return {
    accountId,
    displayName,
    account: { accountId, accountType: 'passkey' },
    profile: null,
    trustedProxy: true
  };
}

function responseJson(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function requestJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('SOCIAL_REQUEST_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('SOCIAL_REQUEST_TOO_LARGE');
  if (!bytes.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('SOCIAL_INVALID_JSON');
  }
}

function randomHex(bytes = 12) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((entry) => entry.toString(16).padStart(2, '0')).join('');
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((entry) => alphabet[entry % alphabet.length]).join('');
}

function recordKey(accountId) {
  return `social-record:${accountId}`;
}

function socialIdKey(socialId) {
  return `social-id:${socialId}`;
}

function friendCodeKey(code) {
  return `friend-code:${code}`;
}

function presenceKey(accountId) {
  return `presence:${accountId}`;
}

function partyKey(partyId) {
  return `party:${partyId}`;
}

function partyCodeKey(code) {
  return `party-code:${code}`;
}

function ticketKey(ticket) {
  return `ticket:${ticket}`;
}

function partyMatchmakingTicketKey(ticket) {
  return `match3-party-ticket:${ticket}`;
}

function reportKey(reportId) {
  return `report:${reportId}`;
}

function reportForwardKey(reportId) {
  return `report-forward:${reportId}`;
}

function rateKey(accountId, action) {
  return `rate:${accountId}:${action}`;
}

function publicPresence(value, {
  viewerRecord = null,
  targetRecord = null,
  sameParty = false,
  now = Date.now()
} = {}) {
  const presence = normalizePresence(value, now);
  if (!presence.online) {
    return {
      online: false,
      status: 'offline',
      mapId: '',
      difficulty: 1,
      joinable: false,
      updatedAt: presence.updatedAt,
      expiresAt: presence.expiresAt
    };
  }
  const privacy = normalizePrivacy(targetRecord?.privacy);
  const isFriend = Boolean(
    viewerRecord?.friends?.includes?.(targetRecord?.accountId)
  );
  const canSee = privacy.presenceVisibility === 'friends'
    ? isFriend || sameParty
    : privacy.presenceVisibility === 'party'
      ? sameParty
      : false;
  if (!canSee && viewerRecord?.accountId !== targetRecord?.accountId) {
    return {
      online: false,
      status: 'offline',
      mapId: '',
      difficulty: 1,
      joinable: false,
      updatedAt: presence.updatedAt,
      expiresAt: presence.expiresAt
    };
  }
  return {
    online: true,
    status: presence.status,
    mapId: presence.mapId,
    difficulty: presence.difficulty,
    joinable: Boolean(
      presence.joinable
      && privacy.allowFriendJoin
      && (isFriend || sameParty)
    ),
    updatedAt: presence.updatedAt,
    expiresAt: presence.expiresAt
  };
}

function notification(kind, text) {
  return {
    id: `social-note-${crypto.randomUUID()}`,
    kind: cleanSocialString(kind, 'SOCIAL', 40),
    text: cleanSocialString(text, '', 140),
    at: Date.now()
  };
}

export class SocialHub extends DurableObject {
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
        && request.method === 'GET'
        && url.pathname === '/internal/social/ops/summary'
      ) {
        return await this.internalOpsSummary();
      }
      if (
        request.headers.get('x-ka-internal-room-social') === '1'
        || request.headers.get('x-ka-internal-matchmaking-social') === '1'
      ) {
        if (request.method === 'POST' && url.pathname === '/internal/social/tickets/consume') {
          return await this.consumeIdentityTicket(request);
        }
        if (request.method === 'POST' && url.pathname === '/internal/social/admission/check') {
          return await this.internalAdmissionCheck(request);
        }
        if (
          request.method === 'POST'
          && url.pathname === '/internal/social/party/matchmaking/consume'
        ) {
          return await this.consumePartyMatchmakingTicket(request);
        }
        return responseJson({ ok: false, error: 'SOCIAL_INTERNAL_ENDPOINT_NOT_FOUND' }, { status: 404 });
      }

      if (request.method === 'GET' && url.pathname === '/social/bootstrap') return await this.bootstrap(request);
      if (request.method === 'POST' && url.pathname === '/social/identity/ticket') return await this.createIdentityTicket(request);
      if (request.method === 'POST' && url.pathname === '/social/presence') return await this.updatePresence(request);
      if (request.method === 'POST' && url.pathname === '/social/privacy') return await this.updatePrivacy(request);
      if (request.method === 'POST' && url.pathname === '/social/friends/request') return await this.friendRequest(request);
      if (request.method === 'POST' && url.pathname === '/social/friends/respond') return await this.friendRespond(request);
      if (request.method === 'POST' && url.pathname === '/social/friends/remove') return await this.friendRemove(request);
      if (request.method === 'POST' && url.pathname === '/social/blocks/add') return await this.blockAdd(request);
      if (request.method === 'POST' && url.pathname === '/social/blocks/remove') return await this.blockRemove(request);
      if (request.method === 'POST' && url.pathname === '/social/reports/create') return await this.reportCreate(request);
      if (request.method === 'GET' && url.pathname === '/social/safety/status') return await this.safetyStatus(request);
      if (request.method === 'POST' && url.pathname === '/social/appeals/create') return await this.appealCreate(request);
      if (request.method === 'POST' && url.pathname === '/social/party/create') return await this.partyCreate(request);
      if (request.method === 'POST' && url.pathname === '/social/party/invite') return await this.partyInvite(request);
      if (request.method === 'POST' && url.pathname === '/social/party/respond') return await this.partyRespond(request);
      if (request.method === 'POST' && url.pathname === '/social/party/leave') return await this.partyLeave(request);
      if (request.method === 'POST' && url.pathname === '/social/party/kick') return await this.partyKick(request);
      if (request.method === 'POST' && url.pathname === '/social/party/transfer') return await this.partyTransfer(request);
      if (request.method === 'POST' && url.pathname === '/social/party/matchmaking-ticket') return await this.createPartyMatchmakingTicket(request);

      return responseJson({ ok: false, error: 'SOCIAL_ENDPOINT_NOT_FOUND' }, { status: 404 });
    } catch (error) {
      const code = String(error?.message || error || 'SOCIAL_ERROR').slice(0, 160);
      const status = code.includes('AUTH') || code === 'PASSKEY_SOCIAL_REQUIRED' ? 401
        : code.endsWith('_REQUIRED') || code.includes('INVALID') ? 400
          : code.includes('FORBIDDEN') || code.includes('BLOCKED') || code.includes('RESTRICTED') ? 403
            : code.includes('NOT_FOUND') ? 404
              : code.includes('FULL') || code.includes('CONFLICT') ? 409
                : code.includes('RATE_LIMITED') ? 429
                  : 500;
      return responseJson({ ok: false, error: code }, { status });
    }
  }

  async internalOpsSummary() {
    const [forwardQueue, reports, profiles] = await Promise.all([
      this.ctx.storage.list({ prefix: 'report-forward:' }),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'profile:' })
    ]);
    const now = Date.now();
    const retryEntries = [...forwardQueue.values()];
    return responseJson({
      ok: true,
      patch: SOCIAL1_SERVER_PATCH,
      available: true,
      retryingReports: retryEntries.length,
      reportForwardFailures: retryEntries.filter((entry) => Number(entry?.attempts || 0) > 0).length,
      oldestRetryAt: retryEntries.length
        ? Math.min(...retryEntries.map((entry) => Number(entry?.createdAt || now)))
        : 0,
      storedReports: reports.size,
      socialProfiles: profiles.size,
      generatedAt: now
    });
  }

  async cloudAuthenticate(request, { allowRestricted = false } = {}) {
    const trusted = trustedProxyAuthentication(request);
    if (trusted) {
      const moderation = await this.checkOpsRestriction(trusted.accountId);
      if (moderation.allowed === false && !allowRestricted) {
        throw new Error('SOCIAL_ACCOUNT_RESTRICTED');
      }
      return { ...trusted, moderation };
    }
    if (!this.env.CLOUD_PROFILES) {
      throw new Error('SOCIAL_AUTH_BINDING_UNAVAILABLE');
    }
    const headers = new Headers();
    for (const name of (
      'authorization',
      'x-ka-account-id',
      'x-ka-device-id',
      'x-ka-client-time',
      'x-ka-origin',
      'x-ka-rp-id',
      'x-ka-region'
    )) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('x-ka-rate-key', `social-auth-${cleanAccountId(request.headers.get('x-ka-account-id')) || 'unknown'}`);
    const id = this.env.CLOUD_PROFILES.idFromName('global-v1');
    const response = await this.env.CLOUD_PROFILES.get(id).fetch(
      new Request('https://profiles.internal/profiles/auth/session', {
        method: 'GET',
        headers
      })
    );
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) {
      throw new Error(String(value.error || 'SOCIAL_AUTH_REQUIRED'));
    }
    const accountId = cleanAccountId(value.account?.accountId);
    if (!accountId || value.account?.accountType !== 'passkey') {
      throw new Error('PASSKEY_SOCIAL_REQUIRED');
    }
    const displayName = cleanSocialString(
      value.profile?.identity?.displayName
      || value.account?.accountLabel
      || 'Player',
      'Player',
      24
    );
    const moderation = await this.checkOpsRestriction(accountId);
    if (moderation.allowed === false && !allowRestricted) {
      throw new Error('SOCIAL_ACCOUNT_RESTRICTED');
    }
    return {
      accountId,
      displayName,
      account: value.account,
      profile: value.profile,
      moderation
    };
  }

  async forwardReportToOps(report) {
    if (!this.env.OPS || !report) return { ok: false, error: 'OPS_BINDING_UNAVAILABLE' };
    try {
      const id = this.env.OPS.idFromName('global-v1');
      const response = await this.env.OPS.get(id).fetch(
        new Request('https://ops.internal/internal/ops/moderation/report', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ka-internal-ops': '1'
          },
          body: JSON.stringify(report)
        })
      );
      const value = await response.json().catch(() => ({}));
      return response.ok && value.ok !== false
        ? { ok: true, value }
        : { ok: false, error: cleanSocialString(value.error, `HTTP_${response.status}`, 120) };
    } catch (error) {
      // Moderation telemetry must never block the player-facing report flow.
      return { ok: false, error: cleanSocialString(error?.message, 'OPS_FORWARD_FAILED', 120) };
    }
  }

  async scheduleReportForward(report, attempts = 0) {
    if (!report?.reportId) return false;
    const now = Date.now();
    const safeAttempts = Math.max(0, Math.min(20, Math.floor(Number(attempts) || 0)));
    const delay = Math.min(
      REPORT_FORWARD_MAX_RETRY_MS,
      REPORT_FORWARD_BASE_RETRY_MS * (2 ** Math.min(12, safeAttempts))
    );
    const queued = {
      report,
      attempts: safeAttempts,
      nextAttemptAt: now + delay,
      createdAt: Math.max(0, Number(report.createdAt) || now),
      expiresAt: Math.max(now + delay, Number(report.expiresAt) || now + REPORT_RETENTION_MS)
    };
    await this.ctx.storage.put(reportForwardKey(report.reportId), queued, {
      expirationTtl: Math.max(60, Math.ceil((queued.expiresAt - now) / 1000))
    });
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || Number(alarm) > queued.nextAttemptAt) {
      await this.ctx.storage.setAlarm(queued.nextAttemptAt);
    }
    return true;
  }

  async retryPendingReportForwards({ limit = 20 } = {}) {
    const now = Date.now();
    const listed = await this.ctx.storage.list({ prefix: 'report-forward:' });
    const due = [...listed.entries()]
      .filter(([, value]) => Number(value?.nextAttemptAt || 0) <= now)
      .sort((left, right) => Number(left[1]?.nextAttemptAt || 0) - Number(right[1]?.nextAttemptAt || 0))
      .slice(0, Math.max(1, Math.min(50, Math.floor(Number(limit) || 20))));
    for (const [key, queued] of due) {
      const result = await this.forwardReportToOps(queued?.report);
      if (result.ok) {
        await this.ctx.storage.delete(key);
        const report = await this.ctx.storage.get(reportKey(queued.report.reportId));
        if (report) {
          await this.ctx.storage.put(reportKey(report.reportId), {
            ...report,
            opsForwardedAt: now,
            opsForwardAttempts: Math.max(1, Number(queued.attempts || 0) + 1),
            opsForwardError: ''
          }, { expirationTtl: Math.max(60, Math.ceil((Number(report.expiresAt || now) - now) / 1000)) });
        }
      } else {
        await this.scheduleReportForward(queued?.report, Number(queued?.attempts || 0) + 1);
      }
    }
    const remaining = await this.ctx.storage.list({ prefix: 'report-forward:' });
    const next = [...remaining.values()]
      .map((entry) => Number(entry?.nextAttemptAt || 0))
      .filter((entry) => entry > now)
      .sort((left, right) => left - right)[0];
    if (next) await this.ctx.storage.setAlarm(next);
    return remaining.size;
  }

  async alarm() {
    await this.retryPendingReportForwards({ limit: 30 });
  }

  async opsSafetyStatus(accountId) {
    const cleanId = cleanAccountId(accountId);
    if (!cleanId || !this.env.OPS) {
      return {
        available: false,
        reports: [],
        appeals: [],
        restriction: { active: false, action: '', expiresAt: 0, reportId: '', appealEligible: false }
      };
    }
    try {
      const id = this.env.OPS.idFromName('global-v1');
      const response = await this.env.OPS.get(id).fetch(
        new Request('https://ops.internal/internal/ops/moderation/status', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ka-internal-ops': '1'
          },
          body: JSON.stringify({ accountId: cleanId })
        })
      );
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok !== true) throw new Error(value.error || 'OPS_STATUS_UNAVAILABLE');
      return {
        available: true,
        reports: Array.isArray(value.reports) ? value.reports : [],
        appeals: Array.isArray(value.appeals) ? value.appeals : [],
        restriction: value.restriction || { active: false }
      };
    } catch {
      return {
        available: false,
        reports: [],
        appeals: [],
        restriction: { active: false, action: '', expiresAt: 0, reportId: '', appealEligible: false }
      };
    }
  }

  async submitAppealToOps(accountId, note) {
    const cleanId = cleanAccountId(accountId);
    if (!cleanId || !this.env.OPS) throw new Error('SOCIAL_APPEAL_SERVICE_UNAVAILABLE');
    const id = this.env.OPS.idFromName('global-v1');
    const response = await this.env.OPS.get(id).fetch(
      new Request('https://ops.internal/internal/ops/moderation/appeal', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-ops': '1'
        },
        body: JSON.stringify({
          accountId: cleanId,
          note: cleanSocialString(note, '', APPEAL_NOTE_LIMIT)
        })
      })
    );
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) {
      throw new Error(cleanSocialString(value.error, 'SOCIAL_APPEAL_FAILED', 120));
    }
    return value;
  }

  async checkOpsRestriction(accountId) {
    const cleanId = cleanAccountId(accountId);
    if (!cleanId || !this.env.OPS) {
      return { allowed: true };
    }
    try {
      const id = this.env.OPS.idFromName('global-v1');
      const response = await this.env.OPS.get(id).fetch(
        new Request('https://ops.internal/internal/ops/moderation/check', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ka-internal-ops': '1'
          },
          body: JSON.stringify({ accountId: cleanId })
        })
      );
      const value = await response.json().catch(() => ({}));
      if (!response.ok || value.ok !== true) {
        return { allowed: true, unavailable: true };
      }
      return {
        allowed: value.allowed !== false,
        action: cleanSocialString(value.action, '', 40),
        expiresAt: Math.max(0, Number(value.expiresAt) || 0)
      };
    } catch {
      // Operations telemetry failure must not make the social service unavailable.
      return { allowed: true, unavailable: true };
    }
  }

  async consumeRate(accountId, action, limit, windowMs = SOCIAL_RATE_WINDOW_MS) {
    const key = rateKey(accountId, action);
    const now = Date.now();
    const current = await this.ctx.storage.get(key) || {
      startedAt: now,
      count: 0
    };
    if (now - Number(current.startedAt || 0) >= windowMs) {
      current.startedAt = now;
      current.count = 0;
    }
    if (Number(current.count || 0) >= limit) return false;
    current.count = Number(current.count || 0) + 1;
    await this.ctx.storage.put(key, current, {
      expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) + 60)
    });
    return true;
  }

  async ensureRecord(accountId, displayName = 'Player') {
    const cleanAccount = cleanAccountId(accountId);
    if (!cleanAccount) throw new Error('SOCIAL_ACCOUNT_INVALID');
    const now = Date.now();
    let record = normalizeSocialRecord(
      await this.ctx.storage.get(recordKey(cleanAccount)) || {},
      { accountId: cleanAccount, now }
    );
    let changed = false;

    if (!record.socialId) {
      record.socialId = `social-${randomHex(12)}`;
      changed = true;
    }
    if (!record.friendCode) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = randomCode(8);
        if (!await this.ctx.storage.get(friendCodeKey(candidate))) {
          record.friendCode = candidate;
          changed = true;
          break;
        }
      }
      if (!record.friendCode) throw new Error('SOCIAL_CODE_GENERATION_FAILED');
    }
    const cleanName = cleanSocialString(displayName, 'Player', 24);
    if (record.displayName !== cleanName) {
      record.displayName = cleanName;
      changed = true;
    }
    if (changed) {
      record.updatedAt = now;
      await this.ctx.storage.put({
        [recordKey(cleanAccount)]: record,
        [socialIdKey(record.socialId)]: cleanAccount,
        [friendCodeKey(record.friendCode)]: cleanAccount
      });
    } else {
      await this.ctx.storage.put({
        [socialIdKey(record.socialId)]: cleanAccount,
        [friendCodeKey(record.friendCode)]: cleanAccount
      });
    }
    return record;
  }

  async loadRecord(accountId) {
    const cleanAccount = cleanAccountId(accountId);
    if (!cleanAccount) return null;
    const raw = await this.ctx.storage.get(recordKey(cleanAccount));
    return raw ? normalizeSocialRecord(raw, { accountId: cleanAccount }) : null;
  }

  async saveRecords(records) {
    const values = {};
    for (const record of records) {
      if (!record?.accountId) continue;
      const normalized = normalizeSocialRecord(record, {
        accountId: record.accountId,
        now: Date.now()
      });
      normalized.updatedAt = Date.now();
      values[recordKey(normalized.accountId)] = normalized;
      if (normalized.socialId) values[socialIdKey(normalized.socialId)] = normalized.accountId;
      if (normalized.friendCode) values[friendCodeKey(normalized.friendCode)] = normalized.accountId;
    }
    if (Object.keys(values).length) await this.ctx.storage.put(values);
  }

  async resolveAccount(payload = {}) {
    const direct = cleanAccountId(payload.accountId);
    if (direct) return direct;
    const socialId = cleanSocialId(payload.socialId);
    if (socialId) return cleanAccountId(await this.ctx.storage.get(socialIdKey(socialId)));
    const code = cleanFriendCode(payload.friendCode);
    if (code) return cleanAccountId(await this.ctx.storage.get(friendCodeKey(code)));
    return '';
  }

  async partyForRecord(record) {
    if (!record?.partyId) return null;
    const raw = await this.ctx.storage.get(partyKey(record.partyId));
    if (!raw) {
      record.partyId = '';
      await this.saveRecords([record]);
      return null;
    }
    const party = normalizeParty(raw);
    if (!party.members.includes(record.accountId)) {
      record.partyId = '';
      await this.saveRecords([record]);
      return null;
    }
    return party;
  }

  async publicPlayer(targetRecord, viewerRecord, relationship, {
    sameParty = false,
    lastPlayedAt = 0,
    context = ''
  } = {}) {
    const presence = await this.ctx.storage.get(presenceKey(targetRecord.accountId)) || {};
    return {
      socialId: targetRecord.socialId,
      displayName: targetRecord.displayName,
      friendCode: relationship === 'self' ? targetRecord.friendCode : '',
      relationship,
      presence: publicPresence(presence, {
        viewerRecord,
        targetRecord,
        sameParty
      }),
      lastPlayedAt,
      lastContext: cleanSocialString(context, '', 100),
      mutualFriends: viewerRecord
        ? viewerRecord.friends.filter((entry) => targetRecord.friends.includes(entry)).length
        : 0
    };
  }

  async publicParty(party, viewerRecord) {
    if (!party) return null;
    const members = [];
    for (const accountId of party.members) {
      const record = await this.loadRecord(accountId);
      if (!record) continue;
      members.push(await this.publicPlayer(record, viewerRecord, 'friend', {
        sameParty: true
      }));
    }
    return {
      partyId: party.partyId,
      partyCode: party.partyCode,
      leaderSocialId: (await this.loadRecord(party.leaderAccountId))?.socialId || '',
      localSocialId: viewerRecord.socialId,
      members,
      invites: [],
      room: party.room && Number(party.room.expiresAt) > Date.now()
        ? { ...party.room }
        : null,
      createdAt: party.createdAt,
      updatedAt: party.updatedAt
    };
  }

  async buildBootstrap(auth) {
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const party = await this.partyForRecord(self);
    const friends = [];
    const incoming = [];
    const outgoing = [];
    const recent = [];
    const blocked = [];
    const partyInvites = [];

    for (const accountId of self.friends) {
      const record = await this.loadRecord(accountId);
      if (record) friends.push(await this.publicPlayer(record, self, 'friend', {
        sameParty: Boolean(party?.members.includes(accountId))
      }));
    }
    for (const accountId of self.incoming) {
      const record = await this.loadRecord(accountId);
      if (record) incoming.push(await this.publicPlayer(record, self, 'incoming'));
    }
    for (const accountId of self.outgoing) {
      const record = await this.loadRecord(accountId);
      if (record) outgoing.push(await this.publicPlayer(record, self, 'outgoing'));
    }
    for (const entry of self.recent) {
      const record = await this.loadRecord(entry.accountId);
      if (record) recent.push(await this.publicPlayer(record, self, 'recent', {
        lastPlayedAt: entry.lastPlayedAt,
        context: entry.context,
        sameParty: Boolean(party?.members.includes(entry.accountId))
      }));
    }
    for (const accountId of self.blocks) {
      const record = await this.loadRecord(accountId);
      if (record) blocked.push(await this.publicPlayer(record, self, 'blocked'));
    }

    const parties = await this.ctx.storage.list({ prefix: 'party:' });
    for (const [, raw] of parties) {
      const invite = normalizeParty(raw);
      if (!invite.invites.includes(self.accountId)) continue;
      partyInvites.push(await this.publicParty(invite, self));
    }

    const [opsSafety, storedReports, forwardQueue] = await Promise.all([
      this.opsSafetyStatus(self.accountId),
      this.ctx.storage.list({ prefix: 'report:' }),
      this.ctx.storage.list({ prefix: 'report-forward:' })
    ]);
    const localReports = [...storedReports.values()]
      .filter((report) => report?.reporterAccountId === self.accountId)
      .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
      .slice(0, 24)
      .map((report) => ({
        reportId: report.reportId,
        category: report.category,
        status: 'received',
        createdAt: report.createdAt,
        updatedAt: report.opsForwardedAt || report.createdAt
      }));
    const safety = {
      ...opsSafety,
      reports: opsSafety.available ? opsSafety.reports : localReports,
      retryingReports: [...forwardQueue.values()].filter((entry) => (
        entry?.report?.reporterAccountId === self.accountId
      )).length
    };

    return {
      ok: true,
      patch: SOCIAL1_SERVER_PATCH,
      schema: SOCIAL1_SERVER_SCHEMA,
      authenticated: true,
      accountType: 'passkey',
      self: await this.publicPlayer(self, self, 'self', { sameParty: true }),
      privacy: self.privacy,
      friends,
      incoming,
      outgoing,
      recent,
      blocked,
      party: await this.publicParty(party, self),
      partyInvites,
      safety,
      notifications: self.notifications
    };
  }

  async bootstrap(request) {
    const auth = await this.cloudAuthenticate(request, { allowRestricted: true });
    if (!await this.consumeRate(auth.accountId, 'bootstrap', 90)) {
      throw new Error('SOCIAL_BOOTSTRAP_RATE_LIMITED');
    }
    this.ctx.waitUntil(this.retryPendingReportForwards({ limit: 8 }));
    return responseJson(await this.buildBootstrap(auth));
  }

  async createIdentityTicket(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'ticket', 30)) {
      throw new Error('SOCIAL_TICKET_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const record = await this.ensureRecord(auth.accountId, auth.displayName);
    const ticket = `social-ticket-${randomHex(24)}`;
    const value = {
      ticket,
      accountId: auth.accountId,
      socialId: record.socialId,
      displayName: record.displayName,
      roomCode: String(payload.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
      playerId: cleanSocialString(payload.playerId, '', 160),
      requestedName: cleanSocialString(payload.displayName, record.displayName, 24),
      createdAt: Date.now(),
      expiresAt: Date.now() + SOCIAL1_TICKET_TTL_MS
    };
    await this.ctx.storage.put(ticketKey(ticket), value, {
      expirationTtl: Math.ceil(SOCIAL1_TICKET_TTL_MS / 1000) + 30
    });
    return responseJson({
      ok: true,
      patch: SOCIAL1_SERVER_PATCH,
      ticket,
      expiresAt: value.expiresAt,
      identity: {
        socialId: record.socialId,
        displayName: record.displayName
      }
    });
  }

  async consumeIdentityTicket(request) {
    const payload = await requestJson(request);
    const ticket = String(payload.ticket || '').slice(0, 220);
    if (!/^social-ticket-[a-f0-9]{48}$/i.test(ticket)) {
      return responseJson({ ok: false, error: 'SOCIAL_TICKET_INVALID' }, { status: 400 });
    }
    const stored = await this.ctx.storage.get(ticketKey(ticket));
    if (!stored || Number(stored.expiresAt || 0) <= Date.now()) {
      await this.ctx.storage.delete(ticketKey(ticket));
      return responseJson({ ok: false, error: 'SOCIAL_TICKET_EXPIRED' }, { status: 410 });
    }
    if (
      stored.roomCode
      && String(payload.roomCode || '').toUpperCase() !== stored.roomCode
    ) {
      return responseJson({ ok: false, error: 'SOCIAL_TICKET_ROOM_MISMATCH' }, { status: 403 });
    }
    if (stored.playerId && String(payload.playerId || '') !== stored.playerId) {
      return responseJson({ ok: false, error: 'SOCIAL_TICKET_PLAYER_MISMATCH' }, { status: 403 });
    }

    const joining = await this.loadRecord(stored.accountId);
    if (!joining) {
      return responseJson({ ok: false, error: 'SOCIAL_ACCOUNT_NOT_FOUND' }, { status: 404 });
    }
    const moderation = await this.checkOpsRestriction(joining.accountId);
    if (moderation.allowed === false) {
      await this.ctx.storage.delete(ticketKey(ticket));
      return responseJson({
        ok: false,
        error: 'SOCIAL_ACCOUNT_RESTRICTED',
        action: moderation.action,
        expiresAt: moderation.expiresAt
      }, { status: 403 });
    }
    const otherAccountIds = Array.isArray(payload.otherAccountIds)
      ? payload.otherAccountIds.map(cleanAccountId).filter(Boolean)
      : [];
    const others = [];
    for (const accountId of otherAccountIds) {
      const record = await this.loadRecord(accountId);
      if (!record) continue;
      if (blocksPair(joining, record)) {
        return responseJson({
          ok: false,
          error: 'SOCIAL_ADMISSION_BLOCKED'
        }, { status: 403 });
      }
      others.push(record);
    }

    const context = cleanSocialString(payload.context, 'co-op', 100);
    const updates = [];
    let nextJoining = joining;
    for (const other of others) {
      nextJoining = addRecentOpponent(nextJoining, other.accountId, {
        now: Date.now(),
        context
      });
      const nextOther = addRecentOpponent(other, joining.accountId, {
        now: Date.now(),
        context
      });
      updates.push(nextOther);
    }
    updates.push(nextJoining);
    await this.saveRecords(updates);
    await this.ctx.storage.delete(ticketKey(ticket));

    return responseJson({
      ok: true,
      identity: {
        accountId: joining.accountId,
        socialId: joining.socialId,
        displayName: joining.displayName
      }
    });
  }

  async internalAdmissionCheck(request) {
    const payload = await requestJson(request);
    const accountId = cleanAccountId(payload.accountId);
    if (!accountId) return responseJson({ ok: true, allowed: true, anonymous: true });
    const joining = await this.loadRecord(accountId);
    if (!joining) return responseJson({ ok: true, allowed: true, unknown: true });
    const moderation = await this.checkOpsRestriction(accountId);
    if (moderation.allowed === false) {
      return responseJson({
        ok: true,
        allowed: false,
        reason: 'SOCIAL_ACCOUNT_RESTRICTED',
        action: moderation.action,
        expiresAt: moderation.expiresAt
      });
    }
    for (const otherId of Array.isArray(payload.otherAccountIds) ? payload.otherAccountIds : []) {
      const other = await this.loadRecord(otherId);
      if (other && blocksPair(joining, other)) {
        return responseJson({ ok: true, allowed: false, reason: 'SOCIAL_ADMISSION_BLOCKED' });
      }
    }
    return responseJson({ ok: true, allowed: true });
  }

  async createPartyMatchmakingTicket(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'party-matchmaking-ticket', 12)) {
      throw new Error('SOCIAL_PARTY_MATCHMAKING_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const party = await this.partyForRecord(self);
    if (!party || party.leaderAccountId !== self.accountId) {
      throw new Error('SOCIAL_PARTY_LEADER_REQUIRED');
    }
    if (party.members.length > 2) {
      throw new Error('SOCIAL_PARTY_TOO_LARGE_FOR_CURRENT_COOP');
    }
    const playerId = cleanSocialString(payload.playerId, '', 160);
    const tabId = cleanSocialString(payload.tabId, '', 160);
    const protocol = Math.max(1, Math.trunc(Number(payload.protocol) || 0));
    const build = cleanSocialString(payload.build, '', 120);
    if (!playerId || !tabId || !protocol || !build) {
      throw new Error('SOCIAL_PARTY_MATCHMAKING_CONTEXT_INVALID');
    }

    const memberRecords = (
      await Promise.all(party.members.map((accountId) => this.loadRecord(accountId)))
    ).filter(Boolean);
    if (memberRecords.length !== party.members.length) {
      throw new Error('SOCIAL_PARTY_MEMBER_MISSING');
    }
    for (const member of memberRecords) {
      const moderation = await this.checkOpsRestriction(member.accountId);
      if (moderation.allowed === false) {
        throw new Error('SOCIAL_PARTY_MEMBER_RESTRICTED');
      }
    }
    for (let left = 0; left < memberRecords.length; left += 1) {
      for (let right = left + 1; right < memberRecords.length; right += 1) {
        if (blocksPair(memberRecords[left], memberRecords[right])) {
          throw new Error('SOCIAL_PARTY_BLOCKED');
        }
      }
    }

    const now = Date.now();
    const expiresAt = now + SOCIAL_MATCH3_PARTY_TICKET_TTL_MS;
    const ticket = `party-match-${crypto.randomUUID()}-${randomHex(8)}`;
    const claim = normalizePartyMatchmakingClaim({
      partyId: party.partyId,
      leaderAccountId: self.accountId,
      leaderSocialId: self.socialId,
      playerId,
      tabId,
      protocol,
      build,
      memberAccountIds: memberRecords.map((record) => record.accountId),
      memberSocialIds: memberRecords.map((record) => record.socialId),
      memberCount: memberRecords.length,
      createdAt: now,
      expiresAt
    }, { now });
    await this.ctx.storage.put(
      partyMatchmakingTicketKey(ticket),
      claim,
      { expirationTtl: Math.ceil(SOCIAL_MATCH3_PARTY_TICKET_TTL_MS / 1000) + 30 }
    );
    return responseJson({
      ok: true,
      patch: SOCIAL_MATCH3_PATCH,
      ticket,
      expiresAt,
      party: await this.publicParty(party, self)
    });
  }

  async consumePartyMatchmakingTicket(request) {
    const payload = await requestJson(request);
    const ticket = cleanSocialString(payload.ticket, '', 240);
    if (!ticket) throw new Error('SOCIAL_PARTY_TICKET_REQUIRED');
    const key = partyMatchmakingTicketKey(ticket);
    const stored = await this.ctx.storage.get(key);
    const now = Date.now();
    const claim = normalizePartyMatchmakingClaim(stored || {}, { now });
    if (
      !claim.partyId
      || !claim.leaderAccountId
      || claim.expiresAt <= now
    ) {
      await this.ctx.storage.delete(key);
      throw new Error('SOCIAL_PARTY_TICKET_EXPIRED');
    }
    if (
      claim.playerId !== cleanSocialString(payload.playerId, '', 160)
      || claim.tabId !== cleanSocialString(payload.tabId, '', 160)
      || claim.protocol !== Math.max(1, Math.trunc(Number(payload.protocol) || 0))
      || claim.build !== cleanSocialString(payload.build, '', 120)
    ) {
      throw new Error('SOCIAL_PARTY_TICKET_CONTEXT_MISMATCH');
    }

    const party = normalizeParty(
      await this.ctx.storage.get(partyKey(claim.partyId)) || {}
    );
    if (
      !party.partyId
      || party.leaderAccountId !== claim.leaderAccountId
      || party.members.length !== claim.memberCount
      || party.members.some((accountId) => !claim.memberAccountIds.includes(accountId))
    ) {
      throw new Error('SOCIAL_PARTY_CHANGED');
    }

    const consumed = normalizePartyMatchmakingClaim({
      ...claim,
      consumedAt: claim.consumedAt || now
    }, { now });
    await this.ctx.storage.put(
      key,
      consumed,
      { expirationTtl: Math.max(30, Math.ceil((claim.expiresAt - now) / 1000) + 30) }
    );
    return responseJson({
      ok: true,
      patch: SOCIAL_MATCH3_PATCH,
      claim: consumed
    });
  }

  async updatePresence(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'presence', 20)) {
      throw new Error('SOCIAL_PRESENCE_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const record = await this.ensureRecord(auth.accountId, auth.displayName);
    const presence = normalizePresence({
      ...payload,
      online: true,
      updatedAt: Date.now(),
      expiresAt: Date.now() + SOCIAL1_PRESENCE_TTL_MS
    });
    await this.ctx.storage.put(presenceKey(auth.accountId), presence, {
      expirationTtl: Math.ceil(SOCIAL1_PRESENCE_TTL_MS / 1000) + 60
    });

    const party = await this.partyForRecord(record);
    if (
      party
      && party.leaderAccountId === record.accountId
      && presence.room?.roomCode?.length === 6
    ) {
      party.room = {
        roomCode: presence.room.roomCode,
        mapId: presence.room.mapId,
        difficulty: presence.room.difficulty,
        inRun: presence.room.inRun === true,
        updatedAt: Date.now(),
        expiresAt: Date.now() + PARTY_ROOM_TTL_MS
      };
      party.updatedAt = Date.now();
      await this.ctx.storage.put(partyKey(party.partyId), party);
    }

    return responseJson({
      ok: true,
      presence: publicPresence(presence, {
        viewerRecord: record,
        targetRecord: record,
        sameParty: true
      }),
      party: await this.publicParty(party, record)
    });
  }

  async updatePrivacy(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'privacy', 12)) {
      throw new Error('SOCIAL_PRIVACY_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const record = await this.ensureRecord(auth.accountId, auth.displayName);
    record.privacy = normalizePrivacy(payload.privacy);
    await this.saveRecords([record]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async friendRequest(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'friend-request', 12, 10 * 60 * 1000)) {
      throw new Error('SOCIAL_FRIEND_REQUEST_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    if (!targetId) throw new Error('SOCIAL_PLAYER_NOT_FOUND');
    const target = await this.loadRecord(targetId);
    if (!target) throw new Error('SOCIAL_PLAYER_NOT_FOUND');
    if (target.accountId === self.accountId) throw new Error('SOCIAL_SELF_REQUEST_INVALID');
    const mutualFriends = self.friends.filter((entry) => target.friends.includes(entry)).length;
    if (!canReceiveFriendRequest(target, self, { mutualFriends })) {
      throw new Error('SOCIAL_FRIEND_REQUEST_FORBIDDEN');
    }

    if (target.outgoing.includes(self.accountId) || self.incoming.includes(target.accountId)) {
      self.friends = [...new Set([...self.friends, target.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      target.friends = [...new Set([...target.friends, self.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      self.incoming = self.incoming.filter((entry) => entry !== target.accountId);
      self.outgoing = self.outgoing.filter((entry) => entry !== target.accountId);
      target.incoming = target.incoming.filter((entry) => entry !== self.accountId);
      target.outgoing = target.outgoing.filter((entry) => entry !== self.accountId);
      self.notifications.push(notification('FRIEND_ACCEPTED', `${target.displayName} is now your friend`));
      target.notifications.push(notification('FRIEND_ACCEPTED', `${self.displayName} is now your friend`));
    } else {
      self.outgoing = [...new Set([...self.outgoing, target.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      target.incoming = [...new Set([...target.incoming, self.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      target.notifications.push(notification('FRIEND_REQUEST', `${self.displayName} sent a friend request`));
    }
    await this.saveRecords([self, target]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async friendRespond(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    const target = await this.loadRecord(targetId);
    if (!target || !self.incoming.includes(target.accountId)) {
      throw new Error('SOCIAL_FRIEND_REQUEST_NOT_FOUND');
    }
    const accept = payload.accept === true;
    self.incoming = self.incoming.filter((entry) => entry !== target.accountId);
    target.outgoing = target.outgoing.filter((entry) => entry !== self.accountId);
    if (accept && !blocksPair(self, target)) {
      self.friends = [...new Set([...self.friends, target.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      target.friends = [...new Set([...target.friends, self.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
      self.notifications.push(notification('FRIEND_ACCEPTED', `${target.displayName} is now your friend`));
      target.notifications.push(notification('FRIEND_ACCEPTED', `${self.displayName} accepted your request`));
    }
    await this.saveRecords([self, target]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async friendRemove(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    const target = await this.loadRecord(targetId);
    if (target) {
      self.friends = self.friends.filter((entry) => entry !== target.accountId);
      target.friends = target.friends.filter((entry) => entry !== self.accountId);
      self.incoming = self.incoming.filter((entry) => entry !== target.accountId);
      self.outgoing = self.outgoing.filter((entry) => entry !== target.accountId);
      target.incoming = target.incoming.filter((entry) => entry !== self.accountId);
      target.outgoing = target.outgoing.filter((entry) => entry !== self.accountId);
      await this.saveRecords([self, target]);
    }
    return responseJson(await this.buildBootstrap(auth));
  }

  async removeFromParty(record, {
    targetAccountId = record.accountId,
    initiatedBy = record.accountId
  } = {}) {
    const party = await this.partyForRecord(record);
    if (!party || !party.members.includes(targetAccountId)) return null;
    party.members = party.members.filter((entry) => entry !== targetAccountId);
    party.invites = party.invites.filter((entry) => entry !== targetAccountId);
    const target = await this.loadRecord(targetAccountId);
    if (target) {
      target.partyId = '';
      target.notifications.push(notification('PARTY_LEFT', 'You left the party'));
      await this.saveRecords([target]);
    }
    if (!party.members.length) {
      await this.ctx.storage.delete([
        partyKey(party.partyId),
        partyCodeKey(party.partyCode)
      ]);
      return null;
    }
    if (party.leaderAccountId === targetAccountId) {
      party.leaderAccountId = party.members[0];
      const nextLeader = await this.loadRecord(party.leaderAccountId);
      if (nextLeader) {
        nextLeader.notifications.push(notification('PARTY_LEADER', 'You are now party leader'));
        await this.saveRecords([nextLeader]);
      }
    }
    party.updatedAt = Date.now();
    await this.ctx.storage.put(partyKey(party.partyId), party);
    return party;
  }

  async blockAdd(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    const target = await this.loadRecord(targetId);
    if (!target || target.accountId === self.accountId) throw new Error('SOCIAL_PLAYER_NOT_FOUND');

    self.blocks = [...new Set([...self.blocks, target.accountId])].slice(0, SOCIAL1_BLOCK_LIMIT);
    self.friends = self.friends.filter((entry) => entry !== target.accountId);
    self.incoming = self.incoming.filter((entry) => entry !== target.accountId);
    self.outgoing = self.outgoing.filter((entry) => entry !== target.accountId);
    target.friends = target.friends.filter((entry) => entry !== self.accountId);
    target.incoming = target.incoming.filter((entry) => entry !== self.accountId);
    target.outgoing = target.outgoing.filter((entry) => entry !== self.accountId);
    await this.saveRecords([self, target]);

    if (self.partyId && self.partyId === target.partyId) {
      const party = await this.partyForRecord(self);
      if (party?.leaderAccountId === self.accountId) {
        await this.removeFromParty(self, {
          targetAccountId: target.accountId,
          initiatedBy: self.accountId
        });
      } else {
        await this.removeFromParty(self);
      }
    }
    return responseJson(await this.buildBootstrap(auth));
  }

  async blockRemove(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    self.blocks = self.blocks.filter((entry) => entry !== targetId);
    await this.saveRecords([self]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async reportCreate(request) {
    const auth = await this.cloudAuthenticate(request);
    if (!await this.consumeRate(auth.accountId, 'report', 5, 24 * 60 * 60 * 1000)) {
      throw new Error('SOCIAL_REPORT_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const targetId = await this.resolveAccount(payload);
    const target = await this.loadRecord(targetId);
    if (!target || target.accountId === self.accountId) throw new Error('SOCIAL_REPORT_TARGET_INVALID');
    const allowed = new Set(['harassment', 'hate', 'cheating', 'griefing', 'inappropriate-name', 'spam', 'other']);
    const category = allowed.has(payload.category) ? payload.category : 'other';
    const reportId = `report-${crypto.randomUUID()}`;
    const report = {
      reportId,
      reporterAccountId: self.accountId,
      targetAccountId: target.accountId,
      category,
      note: cleanSocialString(payload.note, '', REPORT_NOTE_LIMIT),
      context: {
        roomId: cleanSocialString(payload.context?.roomId, '', 120),
        mapId: cleanSocialString(payload.context?.mapId, '', 80),
        mode: cleanSocialString(payload.context?.mode, '', 40),
        wave: Math.max(0, Math.min(999, Math.floor(Number(payload.context?.wave) || 0)))
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + REPORT_RETENTION_MS
    };
    await this.ctx.storage.put(reportKey(reportId), report, {
      expirationTtl: Math.ceil(REPORT_RETENTION_MS / 1000)
    });
    const forward = await this.forwardReportToOps(report);
    if (forward.ok) {
      await this.ctx.storage.put(reportKey(reportId), {
        ...report,
        opsForwardedAt: Date.now(),
        opsForwardAttempts: 1,
        opsForwardError: ''
      }, { expirationTtl: Math.ceil(REPORT_RETENTION_MS / 1000) });
    } else {
      await this.scheduleReportForward(report, 0);
      await this.ctx.storage.put(reportKey(reportId), {
        ...report,
        opsForwardedAt: 0,
        opsForwardAttempts: 1,
        opsForwardError: cleanSocialString(forward.error, 'OPS_FORWARD_PENDING', 120)
      }, { expirationTtl: Math.ceil(REPORT_RETENTION_MS / 1000) });
    }
    self.notifications.push(notification('REPORT_SUBMITTED', `Report ${reportId.slice(-8)} submitted`));
    await this.saveRecords([self]);
    return responseJson({
      ...(await this.buildBootstrap(auth)),
      report: {
        reportId,
        category,
        createdAt: report.createdAt
      }
    });
  }

  async safetyStatus(request) {
    const auth = await this.cloudAuthenticate(request, { allowRestricted: true });
    if (!await this.consumeRate(auth.accountId, 'safety-status', 90)) {
      throw new Error('SOCIAL_SAFETY_STATUS_RATE_LIMITED');
    }
    this.ctx.waitUntil(this.retryPendingReportForwards({ limit: 8 }));
    const bootstrap = await this.buildBootstrap(auth);
    return responseJson({
      ok: true,
      patch: SOCIAL1_SERVER_PATCH,
      safety: bootstrap.safety
    });
  }

  async appealCreate(request) {
    const auth = await this.cloudAuthenticate(request, { allowRestricted: true });
    if (!await this.consumeRate(auth.accountId, 'appeal', 3, 30 * 24 * 60 * 60 * 1000)) {
      throw new Error('SOCIAL_APPEAL_RATE_LIMITED');
    }
    const payload = await requestJson(request);
    const note = cleanSocialString(payload.note, '', APPEAL_NOTE_LIMIT);
    if (note.length < 12) throw new Error('SOCIAL_APPEAL_NOTE_REQUIRED');
    const value = await this.submitAppealToOps(auth.accountId, note);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    self.notifications.push(notification('APPEAL_SUBMITTED', 'Your appeal was received'));
    await this.saveRecords([self]);
    return responseJson({
      ...(await this.buildBootstrap(auth)),
      appeal: value.appeal || null,
      duplicate: value.duplicate === true
    });
  }

  async partyCreate(request) {
    const auth = await this.cloudAuthenticate(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const existing = await this.partyForRecord(self);
    if (existing) return responseJson(await this.buildBootstrap(auth));

    let partyCode = '';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = randomCode(6);
      if (!await this.ctx.storage.get(partyCodeKey(candidate))) {
        partyCode = candidate;
        break;
      }
    }
    if (!partyCode) throw new Error('SOCIAL_PARTY_CODE_FAILED');
    const party = normalizeParty({
      partyId: `party-${randomHex(18)}`,
      partyCode,
      leaderAccountId: self.accountId,
      members: [self.accountId],
      invites: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    self.partyId = party.partyId;
    await this.ctx.storage.put({
      [partyKey(party.partyId)]: party,
      [partyCodeKey(party.partyCode)]: party.partyId
    });
    await this.saveRecords([self]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async partyInvite(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const party = await this.partyForRecord(self);
    if (!party || party.leaderAccountId !== self.accountId) throw new Error('SOCIAL_PARTY_LEADER_REQUIRED');
    const targetId = await this.resolveAccount(payload);
    const target = await this.loadRecord(targetId);
    if (!target || !self.friends.includes(target.accountId)) throw new Error('SOCIAL_PARTY_FRIEND_REQUIRED');
    if (blocksPair(self, target)) throw new Error('SOCIAL_PARTY_BLOCKED');
    if (target.privacy.partyInvites === 'nobody') throw new Error('SOCIAL_PARTY_INVITES_DISABLED');
    if (party.members.length >= SOCIAL1_PARTY_LIMIT) throw new Error('SOCIAL_PARTY_FULL');
    if (target.partyId && target.partyId !== party.partyId) throw new Error('SOCIAL_PLAYER_ALREADY_IN_PARTY');
    party.invites = [...new Set([...party.invites, target.accountId])].slice(0, SOCIAL1_FRIEND_LIMIT);
    party.updatedAt = Date.now();
    target.notifications.push(notification('PARTY_INVITE', `${self.displayName} invited you to a party`));
    await this.ctx.storage.put(partyKey(party.partyId), party);
    await this.saveRecords([target]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async partyRespond(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const partyId = cleanSocialString(payload.partyId, '', 120).replace(/[^a-zA-Z0-9:_-]/g, '');
    const party = normalizeParty(await this.ctx.storage.get(partyKey(partyId)) || {});
    if (!party.partyId || !party.invites.includes(self.accountId)) throw new Error('SOCIAL_PARTY_INVITE_NOT_FOUND');

    party.invites = party.invites.filter((entry) => entry !== self.accountId);
    if (payload.accept === true) {
      if (party.members.length >= SOCIAL1_PARTY_LIMIT) throw new Error('SOCIAL_PARTY_FULL');
      const leader = await this.loadRecord(party.leaderAccountId);
      if (!leader || blocksPair(self, leader)) throw new Error('SOCIAL_PARTY_BLOCKED');
      if (self.partyId && self.partyId !== party.partyId) await this.removeFromParty(self);
      party.members = [...new Set([...party.members, self.accountId])].slice(0, SOCIAL1_PARTY_LIMIT);
      self.partyId = party.partyId;
      self.notifications.push(notification('PARTY_JOINED', 'You joined the party'));
    }
    party.updatedAt = Date.now();
    await this.ctx.storage.put(partyKey(party.partyId), party);
    await this.saveRecords([self]);
    return responseJson(await this.buildBootstrap(auth));
  }

  async partyLeave(request) {
    const auth = await this.cloudAuthenticate(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    await this.removeFromParty(self);
    return responseJson(await this.buildBootstrap(auth));
  }

  async partyKick(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const party = await this.partyForRecord(self);
    if (!party || party.leaderAccountId !== self.accountId) throw new Error('SOCIAL_PARTY_LEADER_REQUIRED');
    const targetId = await this.resolveAccount(payload);
    if (!targetId || targetId === self.accountId || !party.members.includes(targetId)) throw new Error('SOCIAL_PARTY_MEMBER_NOT_FOUND');
    await this.removeFromParty(self, {
      targetAccountId: targetId,
      initiatedBy: self.accountId
    });
    return responseJson(await this.buildBootstrap(auth));
  }

  async partyTransfer(request) {
    const auth = await this.cloudAuthenticate(request);
    const payload = await requestJson(request);
    const self = await this.ensureRecord(auth.accountId, auth.displayName);
    const party = await this.partyForRecord(self);
    if (!party || party.leaderAccountId !== self.accountId) throw new Error('SOCIAL_PARTY_LEADER_REQUIRED');
    const targetId = await this.resolveAccount(payload);
    if (!targetId || targetId === self.accountId || !party.members.includes(targetId)) throw new Error('SOCIAL_PARTY_MEMBER_NOT_FOUND');
    party.leaderAccountId = targetId;
    party.updatedAt = Date.now();
    const target = await this.loadRecord(targetId);
    if (target) {
      target.notifications.push(notification('PARTY_LEADER', 'You are now party leader'));
      await this.saveRecords([target]);
    }
    await this.ctx.storage.put(partyKey(party.partyId), party);
    return responseJson(await this.buildBootstrap(auth));
  }
}

export const SOCIAL1_SERVER_INFO = Object.freeze({
  schema: SOCIAL1_SERVER_SCHEMA,
  patch: SOCIAL1_SERVER_PATCH,
  authentication: 'passkey-required',
  friendLimit: SOCIAL1_FRIEND_LIMIT,
  blockLimit: SOCIAL1_BLOCK_LIMIT,
  partyLimit: SOCIAL1_PARTY_LIMIT,
  presenceTtlMs: SOCIAL1_PRESENCE_TTL_MS,
  ticketTtlMs: SOCIAL1_TICKET_TTL_MS,
  reportForwardRetry: true,
  reporterStatus: true,
  appeals: true,
  restrictedAccountsCanAccessSafetyCenter: true,
  authenticatedRestrictionEnforcedOnTickets: true,
  endpoints: Object.freeze([
    '/social/bootstrap',
    '/social/identity/ticket',
    '/social/presence',
    '/social/privacy',
    '/social/friends/request',
    '/social/friends/respond',
    '/social/friends/remove',
    '/social/blocks/add',
    '/social/blocks/remove',
    '/social/reports/create',
    '/social/safety/status',
    '/social/appeals/create',
    '/social/party/create',
    '/social/party/invite',
    '/social/party/respond',
    '/social/party/leave',
    '/social/party/kick',
    '/social/party/transfer',
    '/social/party/matchmaking-ticket'
  ])
});

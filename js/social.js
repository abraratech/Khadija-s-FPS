// SOCIAL.1 — Friends, recent players, parties and player safety.

import { ONLINE_LEADERBOARD_WORKER_URL } from './online_leaderboards_core.js';
import {
  getCloudProfileAuthContext,
  getCloudProfileDiagnostics
} from './cloud_profile.js';
import {
  addLocalRecentPlayer,
  buildSocialReport,
  normalizePrivacy,
  normalizeSocialBootstrap,
  normalizeSocialId,
  SOCIAL1_PATCH,
  socialStatusLabel
} from './social_core.js';
import { setSocialRuntimeProvider } from './social_bridge.js';
import {
  getMultiplayerSocialContext,
  joinMultiplayerSocialRoom,
  multiplayerEvents
} from './multiplayer/foundation.js';
import { MULTIPLAYER_EVENTS } from './multiplayer/event_bus.js';

const LOCAL_RECENT_KEY = 'ka_social_recent_local_v1';
const LOCAL_BLOCK_KEY = 'ka_social_block_local_v1';
const PRESENCE_INTERVAL_MS = 20_000;
const REFRESH_INTERVAL_MS = 24_000;
const REQUEST_TIMEOUT_MS = 12_000;

let initialized = false;
let state = normalizeSocialBootstrap({});
let statusText = 'SOCIAL OFFLINE';
let statusTone = 'neutral';
let refreshTimer = null;
let presenceTimer = null;
let unsubscribeRoom = null;
let lastPresenceFingerprint = '';
let lastRoomFingerprint = '';
let busy = false;
let toastHandler = null;
let cloudAuthListenerBound = false;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function localBlockedIds() {
  const entries = readJson(LOCAL_BLOCK_KEY, []);
  return new Set(
    Array.isArray(entries)
      ? entries.map(normalizeSocialId).filter(Boolean)
      : []
  );
}

function saveLocalBlockedIds(ids) {
  writeJson(LOCAL_BLOCK_KEY, [...ids].slice(-100));
}

function localRecentPlayers() {
  const value = readJson(LOCAL_RECENT_KEY, []);
  return Array.isArray(value) ? value : [];
}

function authContext() {
  try {
    return getCloudProfileAuthContext();
  } catch {
    return {
      valid: false,
      accountType: 'guest',
      displayName: 'Player',
      accountId: '',
      token: '',
      deviceId: '',
      connected: false
    };
  }
}

function socialHeaders({ json = false } = {}) {
  const auth = authContext();
  const headers = {
    'x-ka-client-time': String(Date.now()),
    'x-ka-device-id': String(auth.deviceId || '').slice(0, 120)
  };
  if (json) headers['content-type'] = 'application/json';
  if (auth.valid) {
    headers.authorization = `Bearer ${auth.token}`;
    headers['x-ka-account-id'] = auth.accountId;
  }
  return headers;
}

async function socialRequest(path, {
  method = 'GET',
  body = null,
  authenticated = true
} = {}) {
  const auth = authContext();
  if (authenticated && (!auth.valid || auth.accountType !== 'passkey')) {
    throw new Error('PASSKEY_SOCIAL_REQUIRED');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers: socialHeaders({ json: body !== null }),
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) {
      const code = String(value.error || `HTTP_${response.status}`);
      const failure = new Error(code);
      failure.code = code;
      failure.status = response.status;
      throw failure;
    }
    return value;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('SOCIAL_REQUEST_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function socialFailureLabel(error) {
  const code = String(error?.code || error?.message || error || 'SOCIAL_UNAVAILABLE').toUpperCase();
  if (
    code === 'PROFILE_AUTH_REQUIRED'
    || code === 'SOCIAL_AUTH_REQUIRED'
    || code === 'PASSKEY_SOCIAL_REQUIRED'
    || Number(error?.status) === 401
  ) return 'PASSKEY SESSION REQUIRED — SIGN IN AGAIN';
  if (code.includes('RESTRICTED') || code.includes('BLOCKED')) return 'SOCIAL ACCESS RESTRICTED';
  if (code === 'SOCIAL_REQUEST_TIMEOUT') return 'SOCIAL SERVICE TIMED OUT — RETRY';
  if (code === 'SOCIAL_UPSTREAM_UNAVAILABLE') return 'SOCIAL SERVICE TEMPORARILY UNAVAILABLE';
  return code.replaceAll('_', ' ').slice(0, 140);
}

function socialAuthFailure(error) {
  const code = String(error?.code || error?.message || error || '').toUpperCase();
  return Number(error?.status) === 401
    || code === 'PROFILE_AUTH_REQUIRED'
    || code === 'SOCIAL_AUTH_REQUIRED'
    || code === 'PASSKEY_SOCIAL_REQUIRED';
}

function setStatus(text, tone = 'neutral', { toast = false } = {}) {
  statusText = String(text || '').toUpperCase().slice(0, 140);
  statusTone = tone;
  render();
  if (toast && typeof toastHandler === 'function') {
    toastHandler(statusText);
  }
}

function socialPlayerForRoomPlayer(playerId, room = null) {
  const context = room || getMultiplayerSocialContext();
  return (context?.players || []).find((entry) => entry?.playerId === playerId) || null;
}

function blockedSocialIds() {
  const ids = localBlockedIds();
  (state.blocked || []).forEach((entry) => ids.add(entry.socialId));
  return ids;
}

function isPlayerBlocked(playerId, room = null) {
  const player = socialPlayerForRoomPlayer(playerId, room);
  const socialId = normalizeSocialId(player?.socialId);
  return Boolean(socialId && blockedSocialIds().has(socialId));
}


function getMatchmakingPartyContext() {
  const party = state.party;
  if (!party) {
    return Object.freeze({
      active: false,
      isLeader: true,
      partyId: '',
      partyCode: '',
      memberCount: 1,
      members: Object.freeze([])
    });
  }
  return Object.freeze({
    active: true,
    isLeader: party.isLeader === true,
    partyId: String(party.partyId || '').slice(0, 120),
    partyCode: String(party.partyCode || '').slice(0, 12),
    memberCount: Math.max(1, party.members?.length || 1),
    members: Object.freeze((party.members || []).map((member) => Object.freeze({
      socialId: String(member?.socialId || '').slice(0, 48),
      displayName: String(member?.displayName || 'Player').slice(0, 24)
    })))
  });
}

async function getPartyMatchmakingTicket(context = {}) {
  const party = getMatchmakingPartyContext();
  if (!party.active) return null;
  if (!party.isLeader) throw new Error('PARTY_LEADER_REQUIRED');
  if (party.memberCount > 2) throw new Error('PARTY_TOO_LARGE_FOR_CURRENT_COOP');
  const value = await socialRequest('/social/party/matchmaking-ticket', {
    method: 'POST',
    body: {
      playerId: String(context.playerId || '').slice(0, 160),
      tabId: String(context.tabId || '').slice(0, 160),
      protocol: Math.max(1, Math.trunc(Number(context.protocol) || 0)),
      build: String(context.build || '').slice(0, 120)
    }
  });
  return Object.freeze({
    ticket: String(value.ticket || '').slice(0, 240),
    expiresAt: Math.max(0, Number(value.expiresAt) || 0),
    party: value.party || null
  });
}

async function getIdentityTicket(context = {}) {
  const auth = authContext();
  if (!auth.valid || auth.accountType !== 'passkey') return null;
  try {
    const value = await socialRequest('/social/identity/ticket', {
      method: 'POST',
      body: {
        roomCode: String(context.roomCode || '').slice(0, 6),
        playerId: String(context.playerId || '').slice(0, 160),
        displayName: String(context.displayName || auth.displayName || 'Player').slice(0, 24)
      }
    });
    return String(value.ticket || '').slice(0, 220) || null;
  } catch {
    return null;
  }
}

function getSnapshot() {
  return Object.freeze({
    patch: SOCIAL1_PATCH,
    state,
    status: statusText,
    tone: statusTone,
    blockedSocialIds: [...blockedSocialIds()]
  });
}

function displayTime(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return 'NEVER';
  const age = Date.now() - value;
  if (age < 60_000) return 'NOW';
  if (age < 3_600_000) return `${Math.max(1, Math.floor(age / 60_000))}M AGO`;
  if (age < 86_400_000) return `${Math.max(1, Math.floor(age / 3_600_000))}H AGO`;
  return new Date(value).toLocaleDateString();
}

function clearElement(element) {
  if (element) element.replaceChildren();
}

function makeButton(label, action, id = '', danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = danger
    ? 'ka-social-btn ka-social-btn-danger'
    : 'ka-social-btn';
  button.textContent = label;
  button.dataset.action = action;
  if (id) button.dataset.id = id;
  return button;
}

function makePlayerCard(player, actions = []) {
  const card = document.createElement('article');
  card.className = 'ka-social-player-card';

  const copy = document.createElement('div');
  copy.className = 'ka-social-player-copy';
  const name = document.createElement('strong');
  name.textContent = player.displayName || 'Player';
  const meta = document.createElement('small');
  meta.textContent = `${socialStatusLabel(player.presence)}${player.lastPlayedAt ? ` · ${displayTime(player.lastPlayedAt)}` : ''}`;
  if (player.presence?.online) card.dataset.online = 'true';
  copy.append(name, meta);

  const buttons = document.createElement('div');
  buttons.className = 'ka-social-card-actions';
  actions.forEach((entry) => {
    buttons.append(makeButton(entry.label, entry.action, player.socialId, entry.danger));
  });
  card.append(copy, buttons);
  return card;
}

function renderPlayerList(id, players, actions, emptyText) {
  const root = document.getElementById(id);
  if (!root) return;
  clearElement(root);
  if (!players?.length) {
    const empty = document.createElement('small');
    empty.className = 'ka-social-empty';
    empty.textContent = emptyText;
    root.append(empty);
    return;
  }
  players.forEach((player) => root.append(makePlayerCard(player, actions)));
}

function renderParty() {
  const partyRoot = document.getElementById('social-party-state');
  const memberRoot = document.getElementById('social-party-members');
  const inviteRoot = document.getElementById('social-party-invites');
  if (!partyRoot || !memberRoot || !inviteRoot) return;

  clearElement(partyRoot);
  clearElement(memberRoot);
  clearElement(inviteRoot);

  const party = state.party;
  if (!party) {
    const note = document.createElement('p');
    note.className = 'ka-social-empty';
    note.textContent = 'No active party. Create one or accept an invitation.';
    partyRoot.append(note, makeButton('CREATE PARTY', 'party-create'));

    state.partyInvites.forEach((invite) => {
      const row = document.createElement('article');
      row.className = 'ka-social-player-card';
      const label = document.createElement('div');
      label.className = 'ka-social-player-copy';
      const leader = invite.members.find((entry) => entry.socialId === invite.leaderSocialId);
      const strong = document.createElement('strong');
      strong.textContent = `${leader?.displayName || 'Player'} invited you`;
      const small = document.createElement('small');
      small.textContent = `PARTY ${invite.partyCode}`;
      label.append(strong, small);
      const controls = document.createElement('div');
      controls.className = 'ka-social-card-actions';
      controls.append(
        makeButton('ACCEPT', 'party-accept', invite.partyId),
        makeButton('DECLINE', 'party-decline', invite.partyId, true)
      );
      row.append(label, controls);
      inviteRoot.append(row);
    });
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'ka-social-party-summary';
  const heading = document.createElement('strong');
  heading.textContent = `PARTY ${party.partyCode}`;
  const detail = document.createElement('small');
  detail.textContent = `${party.members.length}/${4} MEMBERS · ${party.isLeader ? 'YOU ARE LEADER' : 'MEMBER'}`;
  summary.append(heading, detail);

  const controls = document.createElement('div');
  controls.className = 'ka-social-card-actions';
  if (party.isLeader) controls.append(makeButton('DISBAND', 'party-leave', '', true));
  else controls.append(makeButton('LEAVE', 'party-leave', '', true));
  summary.append(controls);
  partyRoot.append(summary);

  if (party.room) {
    const room = document.createElement('div');
    room.className = 'ka-social-party-room';
    const roomCopy = document.createElement('div');
    const roomTitle = document.createElement('strong');
    roomTitle.textContent = party.room.inRun ? 'PARTY MATCH IN PROGRESS' : 'PARTY LOBBY READY';
    const roomMeta = document.createElement('small');
    roomMeta.textContent = `${party.room.mapId || 'ARENA'} · ${party.room.roomCode}`;
    roomCopy.append(roomTitle, roomMeta);
    room.append(roomCopy, makeButton('JOIN PARTY ROOM', 'party-join-room'));
    partyRoot.append(room);
  }

  party.members.forEach((member) => {
    const actions = [];
    if (party.isLeader && member.socialId !== party.localSocialId) {
      actions.push({ label: 'LEADER', action: 'party-transfer' });
      actions.push({ label: 'REMOVE', action: 'party-kick', danger: true });
    }
    memberRoot.append(makePlayerCard(member, actions));
  });

  if (party.isLeader) {
    state.friends
      .filter((friend) => !party.members.some((member) => member.socialId === friend.socialId))
      .forEach((friend) => {
        inviteRoot.append(makePlayerCard(friend, [
          { label: 'INVITE', action: 'party-invite' }
        ]));
      });
    if (!inviteRoot.children.length) {
      const empty = document.createElement('small');
      empty.className = 'ka-social-empty';
      empty.textContent = 'No additional friends available to invite.';
      inviteRoot.append(empty);
    }
  }
}

function renderPrivacy() {
  const privacy = state.privacy || normalizePrivacy({});
  const presence = document.getElementById('social-privacy-presence');
  const requests = document.getElementById('social-privacy-requests');
  const invites = document.getElementById('social-privacy-invites');
  const friendJoin = document.getElementById('social-privacy-friend-join');
  const recent = document.getElementById('social-privacy-recent');
  if (presence) presence.value = privacy.presenceVisibility;
  if (requests) requests.value = privacy.friendRequests;
  if (invites) invites.value = privacy.partyInvites;
  if (friendJoin) friendJoin.checked = privacy.allowFriendJoin === true;
  if (recent) recent.checked = privacy.showRecentPlayers !== false;
}

function render() {
  if (typeof document === 'undefined') return;
  const auth = authContext();
  const status = document.getElementById('social-status');
  if (status) {
    status.textContent = statusText;
    status.dataset.tone = statusTone;
  }
  const authNote = document.getElementById('social-auth-note');
  if (authNote) {
    authNote.textContent = auth.valid && auth.accountType === 'passkey'
      ? 'PASSKEY SOCIAL PROFILE ACTIVE'
      : 'PASSKEY ACCOUNT REQUIRED FOR FRIENDS, PARTIES, BLOCKS AND REPORTS';
  }
  const code = document.getElementById('social-friend-code');
  if (code) code.textContent = state.self?.friendCode || 'SIGN IN REQUIRED';

  renderPlayerList('social-friends-list', state.friends, [
    { label: 'PARTY', action: 'party-invite' },
    { label: 'REMOVE', action: 'friend-remove', danger: true },
    { label: 'BLOCK', action: 'block-add', danger: true }
  ], 'No friends yet. Share your Friend Code or add another player.');

  renderPlayerList('social-incoming-list', state.incoming, [
    { label: 'ACCEPT', action: 'friend-accept' },
    { label: 'DECLINE', action: 'friend-decline', danger: true }
  ], 'No incoming requests.');

  const recent = state.authenticated && state.recent.length
    ? state.recent
    : localRecentPlayers();
  renderPlayerList('social-recent-list', recent, [
    { label: 'ADD', action: 'friend-request-id' },
    { label: 'BLOCK', action: 'block-add', danger: true },
    { label: 'REPORT', action: 'report-select', danger: true }
  ], 'Recent authenticated co-op players will appear here.');

  renderPlayerList('social-blocked-list', state.blocked, [
    { label: 'UNBLOCK', action: 'block-remove' }
  ], 'No blocked players.');

  renderParty();
  renderPrivacy();

  const reportTarget = document.getElementById('social-report-target');
  if (reportTarget) {
    const selected = reportTarget.value;
    reportTarget.replaceChildren();
    const candidates = [
      ...state.recent,
      ...state.friends,
      ...state.blocked
    ];
    const seen = new Set();
    candidates.forEach((player) => {
      if (!player.socialId || seen.has(player.socialId)) return;
      seen.add(player.socialId);
      const option = document.createElement('option');
      option.value = player.socialId;
      option.textContent = player.displayName;
      reportTarget.append(option);
    });
    if (selected && seen.has(selected)) reportTarget.value = selected;
  }
}

async function refreshSocial({ silent = false } = {}) {
  const auth = authContext();
  if (!auth.valid || auth.accountType !== 'passkey') {
    state = normalizeSocialBootstrap({
      authenticated: false,
      accountType: 'guest',
      recent: localRecentPlayers()
    });
    if (!silent) setStatus('PASSKEY SOCIAL SIGN-IN REQUIRED', 'warning');
    else render();
    return state;
  }
  if (busy && silent) return state;
  busy = true;
  try {
    const value = await socialRequest('/social/bootstrap');
    state = normalizeSocialBootstrap(value);
    setStatus('SOCIAL PROFILE SYNCED', 'good');
  } catch (error) {
    if (socialAuthFailure(error)) {
      state = normalizeSocialBootstrap({
        authenticated: false,
        accountType: 'guest',
        recent: localRecentPlayers()
      });
      setStatus(socialFailureLabel(error), 'warning');
    } else {
      setStatus(socialFailureLabel(error), 'error');
    }
  } finally {
    busy = false;
  }
  return state;
}

async function mutate(path, body, successMessage) {
  if (busy) return false;
  busy = true;
  setStatus('UPDATING SOCIAL PROFILE…', 'neutral');
  try {
    const value = await socialRequest(path, {
      method: 'POST',
      body
    });
    state = normalizeSocialBootstrap(value);
    setStatus(successMessage, 'good', { toast: true });
    return true;
  } catch (error) {
    setStatus(
      socialFailureLabel(error),
      socialAuthFailure(error) ? 'warning' : 'error',
      { toast: true }
    );
    return false;
  } finally {
    busy = false;
  }
}

function currentPresencePayload() {
  const context = getMultiplayerSocialContext();
  const mapId = document.getElementById('map-select')?.value || 'grid_bunker';
  const difficulty = Number(document.getElementById('diff-select')?.value) || 1;
  return {
    status: context.runActive
      ? 'match'
      : context.online && context.connected
        ? 'room'
        : 'menu',
    online: true,
    mapId,
    difficulty,
    joinable: Boolean(
      context.online
      && context.connected
      && context.roomCode
      && !context.runActive
    ),
    room: context.online && context.connected
      ? {
          roomCode: context.roomCode,
          roomId: context.roomId,
          inRun: context.runActive,
          mapId,
          difficulty
        }
      : null
  };
}

async function publishPresence({ force = false } = {}) {
  const auth = authContext();
  if (!auth.valid || auth.accountType !== 'passkey') return false;
  const payload = currentPresencePayload();
  const fingerprint = JSON.stringify(payload);
  if (!force && fingerprint === lastPresenceFingerprint) return true;
  try {
    const value = await socialRequest('/social/presence', {
      method: 'POST',
      body: payload
    });
    lastPresenceFingerprint = fingerprint;
    if (value.party) state = normalizeSocialBootstrap({ ...state, party: value.party });
    render();
    return true;
  } catch {
    return false;
  }
}

function recordRoomPlayers(room) {
  const context = getMultiplayerSocialContext();
  const localPlayerId = context.localPlayerId;
  const roomId = String(room?.roomId || context.roomId || '');
  const fingerprint = JSON.stringify(
    (room?.players || [])
      .filter((entry) => entry?.connected !== false)
      .map((entry) => [entry.playerId, entry.socialId, entry.displayName])
  );
  if (fingerprint === lastRoomFingerprint) return;
  lastRoomFingerprint = fingerprint;

  let recent = localRecentPlayers();
  for (const player of room?.players || []) {
    if (
      !player?.socialId
      || player.playerId === localPlayerId
      || player.isBot === true
    ) continue;
    recent = addLocalRecentPlayer(recent, {
      socialId: player.socialId,
      displayName: player.displayName,
      lastPlayedAt: Date.now(),
      lastContext: roomId ? `room:${roomId}` : 'co-op'
    });
  }
  writeJson(LOCAL_RECENT_KEY, recent);
  render();
  void publishPresence({ force: true });
}

async function handleAction(action, id = '') {
  switch (action) {
    case 'refresh':
      await refreshSocial();
      break;
    case 'copy-code':
      if (state.self?.friendCode && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(state.self.friendCode);
        setStatus('FRIEND CODE COPIED', 'good');
      }
      break;
    case 'friend-request': {
      const input = document.getElementById('social-friend-code-input');
      const code = String(input?.value || '').trim();
      if (await mutate('/social/friends/request', { friendCode: code }, 'FRIEND REQUEST SENT')) {
        if (input) input.value = '';
      }
      break;
    }
    case 'friend-request-id':
      await mutate('/social/friends/request', { socialId: id }, 'FRIEND REQUEST SENT');
      break;
    case 'friend-accept':
      await mutate('/social/friends/respond', { socialId: id, accept: true }, 'FRIEND REQUEST ACCEPTED');
      break;
    case 'friend-decline':
      await mutate('/social/friends/respond', { socialId: id, accept: false }, 'FRIEND REQUEST DECLINED');
      break;
    case 'friend-remove':
      await mutate('/social/friends/remove', { socialId: id }, 'FRIEND REMOVED');
      break;
    case 'block-add': {
      const ids = localBlockedIds();
      if (id) ids.add(id);
      saveLocalBlockedIds(ids);
      await mutate('/social/blocks/add', { socialId: id }, 'PLAYER BLOCKED');
      break;
    }
    case 'block-remove': {
      const ids = localBlockedIds();
      ids.delete(id);
      saveLocalBlockedIds(ids);
      await mutate('/social/blocks/remove', { socialId: id }, 'PLAYER UNBLOCKED');
      break;
    }
    case 'party-create':
      await mutate('/social/party/create', {}, 'PARTY CREATED');
      break;
    case 'party-invite':
      await mutate('/social/party/invite', { socialId: id }, 'PARTY INVITATION SENT');
      break;
    case 'party-accept':
      await mutate('/social/party/respond', { partyId: id, accept: true }, 'PARTY JOINED');
      break;
    case 'party-decline':
      await mutate('/social/party/respond', { partyId: id, accept: false }, 'PARTY INVITATION DECLINED');
      break;
    case 'party-leave':
      await mutate('/social/party/leave', {}, 'PARTY LEFT');
      break;
    case 'party-kick':
      await mutate('/social/party/kick', { socialId: id }, 'PARTY MEMBER REMOVED');
      break;
    case 'party-transfer':
      await mutate('/social/party/transfer', { socialId: id }, 'PARTY LEADER TRANSFERRED');
      break;
    case 'party-join-room': {
      const room = state.party?.room;
      if (!room) break;
      const context = getMultiplayerSocialContext();
      const joined = await joinMultiplayerSocialRoom({
        roomCode: room.roomCode,
        displayName: authContext().displayName,
        serverUrl: context.serverUrl || ONLINE_LEADERBOARD_WORKER_URL
      });
      setStatus(joined ? 'JOINING PARTY ROOM' : 'UNABLE TO JOIN PARTY ROOM', joined ? 'good' : 'error');
      break;
    }
    case 'report-select': {
      const select = document.getElementById('social-report-target');
      if (select) select.value = id;
      document.getElementById('social-report-note')?.focus?.();
      break;
    }
    case 'report-submit': {
      const target = document.getElementById('social-report-target')?.value || '';
      const category = document.getElementById('social-report-category')?.value || 'other';
      const note = document.getElementById('social-report-note')?.value || '';
      const context = getMultiplayerSocialContext();
      const report = buildSocialReport({
        targetSocialId: target,
        category,
        note,
        context: {
          roomId: context.roomId,
          mapId: document.getElementById('map-select')?.value || '',
          mode: context.runActive ? 'match' : 'lobby',
          wave: 0
        }
      });
      if (!report.valid) {
        setStatus(report.reason, 'error');
        break;
      }
      if (await mutate('/social/reports/create', report, 'REPORT SUBMITTED')) {
        const input = document.getElementById('social-report-note');
        if (input) input.value = '';
      }
      break;
    }
    case 'privacy-save': {
      const privacy = {
        presenceVisibility: document.getElementById('social-privacy-presence')?.value,
        friendRequests: document.getElementById('social-privacy-requests')?.value,
        partyInvites: document.getElementById('social-privacy-invites')?.value,
        allowFriendJoin: document.getElementById('social-privacy-friend-join')?.checked === true,
        showRecentPlayers: document.getElementById('social-privacy-recent')?.checked !== false
      };
      await mutate('/social/privacy', { privacy }, 'PRIVACY SETTINGS SAVED');
      break;
    }
    default:
      break;
  }
}

function handleCloudAuthChanged(event) {
  const authenticated = event?.detail?.authenticated === true;
  lastPresenceFingerprint = '';
  lastRoomFingerprint = '';
  if (!authenticated) {
    state = normalizeSocialBootstrap({
      authenticated: false,
      accountType: 'guest',
      recent: localRecentPlayers()
    });
    setStatus('PASSKEY SOCIAL SIGN-IN REQUIRED', 'warning');
    return;
  }
  setStatus('REFRESHING SOCIAL PROFILE…', 'neutral');
  void refreshSocial({ silent: true }).then(() => publishPresence({ force: true }));
}

function bindCloudAuthEvents() {
  if (cloudAuthListenerBound || typeof window === 'undefined') return;
  cloudAuthListenerBound = true;
  window.addEventListener('ka:cloud-auth-changed', handleCloudAuthChanged);
}

function bindUi() {
  document.getElementById('social-screen')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-action]')
      : null;
    if (!target) return;
    event.preventDefault();
    void handleAction(target.dataset.action || '', target.dataset.id || '');
  });
}

export function initSocialSystems({ showToast = null } = {}) {
  if (initialized) return getSnapshot();
  initialized = true;
  toastHandler = typeof showToast === 'function' ? showToast : null;
  bindUi();
  bindCloudAuthEvents();

  setSocialRuntimeProvider({
    getSnapshot,
    getIdentityTicket,
    getMatchmakingPartyContext,
    getPartyMatchmakingTicket,
    isPlayerBlocked
  });

  unsubscribeRoom = multiplayerEvents?.on?.(
    MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
    (event) => recordRoomPlayers(event?.payload?.room || null)
  );

  refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') void refreshSocial({ silent: true });
  }, REFRESH_INTERVAL_MS);
  presenceTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') void publishPresence();
  }, PRESENCE_INTERVAL_MS);

  void refreshSocial({ silent: true }).then(() => publishPresence({ force: true }));
  render();
  return getSnapshot();
}

export function getSocialSnapshot() {
  return getSnapshot();
}

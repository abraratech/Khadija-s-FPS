// CG.1 R1 — pure CrazyGames platform policy helpers.
export const CG1_SCHEMA = 1;
export const CG1_PATCH = 'cg1-r1-crazygames-basic-launch-readiness';
export const CG1_PRODUCT_VERSION = '1.3.0-cg1-r1';

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;

export function normalizeCrazyGamesEnvironment(value) {
  const token = String(value || '').trim().toLowerCase();
  return ['local', 'crazygames'].includes(token) ? token : 'disabled';
}

export function isCrazyGamesEnabledEnvironment(value) {
  return normalizeCrazyGamesEnvironment(value) !== 'disabled';
}

export function normalizeCrazyGamesUsername(value, fallback = 'Player') {
  const cleaned = String(value || '')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned || String(fallback || 'Player').slice(0, 24) || 'Player';
}

export function normalizeCrazyGamesInviteParams(input = {}) {
  const roomCode = String(input.roomCode || input.room || '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
  const serverUrl = String(input.serverUrl || input.server || '').trim().slice(0, 320);
  const mode = String(input.mode || 'coop').trim().slice(0, 40);
  return {
    roomCode: ROOM_CODE_PATTERN.test(roomCode) ? roomCode : '',
    serverUrl: /^(https|wss):\/\//i.test(serverUrl) ? serverUrl : '',
    mode
  };
}

export function buildCrazyGamesRoomUpdate(context = {}) {
  const roomId = String(context.roomId || '').trim();
  const roomCode = String(context.roomCode || '').trim().toUpperCase();
  if (!roomId && !ROOM_CODE_PATTERN.test(roomCode)) return null;

  const humans = (Array.isArray(context.players) ? context.players : [])
    .filter((entry) => entry?.isBot !== true && entry?.connected !== false);
  const configuredMax = Math.max(1, Number(context.maxPlayers || context.settings?.maxPlayers) || 2);
  const status = String(context.roomStatus || context.status || '').toLowerCase();
  const closedStatuses = new Set(['completed', 'closed', 'ended', 'terminating']);
  const isJoinable = !closedStatuses.has(status) && humans.length < configuredMax;

  return {
    roomId: roomId || `ka-${roomCode}`,
    isJoinable,
    inviteParams: {
      roomCode,
      serverUrl: String(context.serverUrl || '').trim().slice(0, 320),
      mode: String(context.mode || 'coop').trim().slice(0, 40)
    }
  };
}

export function classifyCrazyGamesAdError(error) {
  const code = String(error?.code || error || 'other').trim();
  const nonFatal = new Set([
    'adsDisabledBasicLaunch',
    'unfilled',
    'adblock',
    'adCooldown'
  ]);
  return Object.freeze({
    code,
    nonFatal: nonFatal.has(code),
    shouldResume: true
  });
}

export function shouldUseCrazyGamesPlatformUi(environment) {
  return normalizeCrazyGamesEnvironment(environment) === 'crazygames';
}

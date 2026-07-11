// M4.47-M4.50 — pure cloud-account security, device, recovery, and audit helpers.

export const CLOUD_SECURITY_PATCH = 'm4-cloud-account-security-r1';
export const CLOUD_DEVICE_LIMIT = 8;
export const CLOUD_HISTORY_LIMIT = 8;
export const CLOUD_ACTIVITY_LIMIT = 50;

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? Math.floor(number) : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function cleanDeviceId(value) {
  const text = String(value || '').trim().slice(0, 120);
  return /^device-[a-zA-Z0-9_-]{8,120}$/.test(text) ? text : '';
}

export function cleanDeviceName(value, fallback = 'Browser Device') {
  const text = String(value || '').trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  return text || String(fallback || 'Browser Device').slice(0, 40);
}

export function normalizeRegion(value) {
  const text = String(value || 'ZZ').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return text.length === 2 ? text : 'ZZ';
}

export function cleanRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 16);
}

export function formatRecoveryCode(value) {
  const clean = cleanRecoveryCode(value);
  return clean.match(/.{1,4}/g)?.join('-') || clean;
}

export function normalizeDevices(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const deviceId = cleanDeviceId(entry.deviceId);
    const tokenHash = String(entry.tokenHash || '').trim().slice(0, 128);
    if (!deviceId || !/^[a-f0-9]{64}$/i.test(tokenHash)) continue;
    const normalized = {
      deviceId,
      tokenHash: tokenHash.toLowerCase(),
      name: cleanDeviceName(entry.name),
      region: normalizeRegion(entry.region),
      createdAt: integer(entry.createdAt, 0),
      lastUsedAt: integer(entry.lastUsedAt, 0),
      revokedAt: integer(entry.revokedAt, 0)
    };
    const previous = byId.get(deviceId);
    if (!previous || normalized.lastUsedAt >= previous.lastUsedAt) byId.set(deviceId, normalized);
  }
  return [...byId.values()]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt || left.deviceId.localeCompare(right.deviceId))
    .slice(0, CLOUD_DEVICE_LIMIT);
}

export function upsertDevice(devices, {
  deviceId,
  tokenHash,
  name = 'Browser Device',
  region = 'ZZ',
  now = Date.now()
} = {}) {
  const cleanId = cleanDeviceId(deviceId);
  const cleanHash = String(tokenHash || '').trim().toLowerCase();
  if (!cleanId || !/^[a-f0-9]{64}$/.test(cleanHash)) throw new TypeError('DEVICE_RECORD_INVALID');
  const list = normalizeDevices(devices).filter((entry) => entry.deviceId !== cleanId && entry.tokenHash !== cleanHash);
  list.unshift({
    deviceId: cleanId,
    tokenHash: cleanHash,
    name: cleanDeviceName(name),
    region: normalizeRegion(region),
    createdAt: integer(now, Date.now(), 1),
    lastUsedAt: integer(now, Date.now(), 1),
    revokedAt: 0
  });
  return normalizeDevices(list);
}

export function touchDevice(devices, tokenHash, {
  deviceId = '',
  name = '',
  region = 'ZZ',
  now = Date.now()
} = {}) {
  const hash = String(tokenHash || '').trim().toLowerCase();
  const list = normalizeDevices(devices);
  const index = list.findIndex((entry) => entry.tokenHash === hash);
  if (index < 0) return { found: false, devices: list, device: null };
  const previous = list[index];
  const next = {
    ...previous,
    deviceId: cleanDeviceId(deviceId) || previous.deviceId,
    name: name ? cleanDeviceName(name, previous.name) : previous.name,
    region: normalizeRegion(region || previous.region),
    lastUsedAt: integer(now, Date.now(), 1)
  };
  list[index] = next;
  return { found: true, devices: normalizeDevices(list), device: next };
}

export function renameDevice(devices, deviceId, name) {
  const cleanId = cleanDeviceId(deviceId);
  const list = normalizeDevices(devices);
  let changed = false;
  const output = list.map((entry) => {
    if (entry.deviceId !== cleanId) return entry;
    changed = true;
    return { ...entry, name: cleanDeviceName(name, entry.name) };
  });
  return { changed, devices: normalizeDevices(output) };
}

export function revokeDevice(devices, deviceId) {
  const cleanId = cleanDeviceId(deviceId);
  const list = normalizeDevices(devices);
  const output = list.filter((entry) => entry.deviceId !== cleanId);
  return { changed: output.length !== list.length, devices: output };
}

export function revokeOtherDevices(devices, currentDeviceId) {
  const cleanId = cleanDeviceId(currentDeviceId);
  const list = normalizeDevices(devices);
  const output = list.filter((entry) => entry.deviceId === cleanId);
  return { changed: output.length !== list.length, devices: output };
}

export function publicDevices(devices, currentDeviceId = '') {
  const cleanId = cleanDeviceId(currentDeviceId);
  return normalizeDevices(devices).map((entry) => Object.freeze({
    deviceId: entry.deviceId,
    name: entry.name,
    region: entry.region,
    createdAt: entry.createdAt,
    lastUsedAt: entry.lastUsedAt,
    current: entry.deviceId === cleanId
  }));
}

export function normalizeActivity(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || '').slice(0, 120),
      kind: String(entry.kind || 'EVENT').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 60) || 'EVENT',
      at: integer(entry.at, 0),
      deviceId: cleanDeviceId(entry.deviceId),
      region: normalizeRegion(entry.region),
      detail: String(entry.detail || '').replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, 180)
    }))
    .sort((left, right) => right.at - left.at || left.id.localeCompare(right.id))
    .slice(0, CLOUD_ACTIVITY_LIMIT);
}

export function appendActivity(activity, entry, now = Date.now()) {
  const next = {
    id: String(entry?.id || `activity-${integer(now, Date.now(), 1).toString(36)}`).slice(0, 120),
    kind: entry?.kind || 'EVENT',
    at: integer(entry?.at, integer(now, Date.now(), 1), 1),
    deviceId: entry?.deviceId || '',
    region: entry?.region || 'ZZ',
    detail: entry?.detail || ''
  };
  return normalizeActivity([next, ...normalizeActivity(activity)]);
}

export function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const byRevision = new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const revision = Math.floor(Number(entry.revision) || 0);
    const chunks = Math.floor(Number(entry.chunks) || 0);
    if (revision < 1 || chunks < 1 || chunks > 1000) continue;
    byRevision.set(revision, {
      revision,
      chunks,
      bytes: integer(entry.bytes, 0, 0),
      checksum: String(entry.checksum || '').slice(0, 128),
      createdAt: integer(entry.createdAt, 0),
      reason: String(entry.reason || 'snapshot').replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, 100)
    });
  }
  return [...byRevision.values()]
    .sort((left, right) => right.revision - left.revision)
    .slice(0, CLOUD_HISTORY_LIMIT);
}

export function publicHistory(value) {
  return normalizeHistory(value).map((entry) => Object.freeze({ ...entry }));
}

// POST-LAUNCH.4 R1 — deterministic release comparison and refresh safety policy.
export const CURRENT_RELEASE = Object.freeze({
  schema: 1,
  releaseId: 'pvp3-r1-public-room-discovery-matchmaking-repair',
  releaseSequence: 2026071803,
  productVersion: '1.1.0-pvp2'
});

function cleanText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function safeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeReleaseDescriptor(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    schema: safeInteger(source.schema),
    releaseId: cleanText(source.releaseId),
    releaseSequence: safeInteger(source.releaseSequence),
    productVersion: cleanText(source.productVersion, 48)
  });
}

export function compareReleaseDescriptors(currentValue, remoteValue) {
  const current = normalizeReleaseDescriptor(currentValue);
  const remote = normalizeReleaseDescriptor(remoteValue);

  if (!remote.releaseId || remote.schema !== 1 || remote.releaseSequence <= 0) {
    return Object.freeze({ updateAvailable: false, reason: 'INVALID_REMOTE', current, remote });
  }
  if (!current.releaseId || current.releaseSequence <= 0) {
    return Object.freeze({ updateAvailable: true, reason: 'CURRENT_UNKNOWN', current, remote });
  }
  if (remote.releaseSequence > current.releaseSequence) {
    return Object.freeze({ updateAvailable: true, reason: 'NEWER_SEQUENCE', current, remote });
  }
  if (remote.releaseSequence === current.releaseSequence && remote.releaseId !== current.releaseId) {
    return Object.freeze({ updateAvailable: true, reason: 'REPLACED_RELEASE', current, remote });
  }
  return Object.freeze({
    updateAvailable: false,
    reason: remote.releaseSequence < current.releaseSequence ? 'REMOTE_OLDER' : 'CURRENT',
    current,
    remote
  });
}

export function shouldDeferUpdate({
  documentVisible = true,
  menuVisible = true,
  activeLobby = false,
  matchmakingActive = false
} = {}) {
  return !documentVisible || !menuVisible || activeLobby || matchmakingActive;
}

export function createRefreshUrl(locationValue, releaseId) {
  const fallback = 'http://localhost/';
  const href = typeof locationValue === 'string'
    ? locationValue
    : String(locationValue?.href || fallback);
  const url = new URL(href, fallback);
  url.searchParams.set('ka_release', cleanText(releaseId, 96) || 'latest');
  return url.href;
}

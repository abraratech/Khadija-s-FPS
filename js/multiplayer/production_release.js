// js/multiplayer/production_release.js
// M3.79-M3.80 — production Worker release-manifest preflight and join gate.

import {
  createMultiplayerFrontendReleaseManifest,
  evaluateMultiplayerProductionRelease,
  normalizeMultiplayerReleaseEndpoint
} from './production_release_core.js';

const CACHE_MS = 60000;
const REQUEST_TIMEOUT_MS = 6000;

let snapshot = Object.freeze({
  status: 'IDLE',
  ready: false,
  blocking: false,
  checkedAt: null,
  endpoint: null,
  reason: 'release-preflight-not-run'
});
let cachedEndpoint = null;
let cachedAt = 0;
let pending = null;

const listeners = new Set();

function publish(next) {
  snapshot = Object.freeze({ ...next });
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_PRODUCTION_RELEASE = snapshot;
    } catch {
      // Release diagnostics must never interrupt single-player startup.
    }
  }
  listeners.forEach((listener) => {
    try { listener(snapshot); } catch { /* UI listeners are non-fatal. */ }
  });
  return snapshot;
}

async function fetchManifest(endpoint, fetchImpl) {
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeout = setTimeout(
    () => controller?.abort(),
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal
    });
    if (!response.ok) {
      throw new Error(
        `Worker release endpoint returned HTTP ${response.status}.`
      );
    }
    const contentType = String(
      response.headers?.get?.('content-type') || ''
    ).toLowerCase();
    if (!contentType.includes('application/json')) {
      throw new Error('Worker release endpoint did not return JSON.');
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkMultiplayerProductionRelease(
  serverUrl,
  {
    force = false,
    fetchImpl = globalThis.fetch
  } = {}
) {
  const endpoint = normalizeMultiplayerReleaseEndpoint(serverUrl);
  const now = Date.now();

  if (
    !force
    && cachedEndpoint === endpoint
    && now - cachedAt < CACHE_MS
    && snapshot.ready === true
  ) {
    return snapshot;
  }
  if (pending && cachedEndpoint === endpoint) return pending;
  if (typeof fetchImpl !== 'function') {
    return publish({
      status: 'FAIL',
      ready: false,
      blocking: true,
      checkedAt: now,
      endpoint,
      reason: 'release-preflight-fetch-unavailable',
      errors: Object.freeze([{
        code: 'FETCH_UNAVAILABLE',
        message: 'This browser cannot check the multiplayer Worker release.'
      }]),
      warnings: Object.freeze([])
    });
  }

  cachedEndpoint = endpoint;
  pending = (async () => {
    publish({
      status: 'CHECKING',
      ready: false,
      blocking: true,
      checkedAt: now,
      endpoint,
      reason: 'release-preflight-running'
    });
    try {
      const workerManifest = await fetchManifest(endpoint, fetchImpl);
      const evaluation = evaluateMultiplayerProductionRelease({
        workerManifest,
        frontendManifest: createMultiplayerFrontendReleaseManifest()
      });
      cachedAt = Date.now();
      return publish({
        ...evaluation,
        checkedAt: cachedAt,
        endpoint,
        reason: evaluation.ready
          ? 'release-preflight-passed'
          : 'release-preflight-identity-mismatch'
      });
    } catch (error) {
      cachedAt = 0;
      return publish({
        status: 'FAIL',
        ready: false,
        blocking: true,
        checkedAt: Date.now(),
        endpoint,
        reason: 'release-preflight-request-failed',
        errors: Object.freeze([{
          code: 'WORKER_RELEASE_REQUEST_FAILED',
          message: String(
            error?.name === 'AbortError'
              ? 'Worker release preflight timed out.'
              : error?.message || error
          ).slice(0, 320)
        }]),
        warnings: Object.freeze([])
      });
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export async function requireMultiplayerProductionReleaseReady(
  serverUrl,
  options = {}
) {
  const result = await checkMultiplayerProductionRelease(
    serverUrl,
    options
  );
  if (result.ready !== true) {
    const first = result.errors?.[0];
    const message = String(
      first?.message
      || 'Multiplayer Worker release does not match this certified game build.'
    ).toUpperCase();
    throw new Error(message);
  }
  return result;
}

export function getMultiplayerProductionReleaseSnapshot() {
  return snapshot;
}

export function subscribeMultiplayerProductionRelease(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  try { listener(snapshot); } catch { /* Initial publication is non-fatal. */ }
  return () => listeners.delete(listener);
}

publish(snapshot);

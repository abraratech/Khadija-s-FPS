// POST-FINAL.10 R1 — Version 1.0 stabilization, accessibility, performance and resilience core.

export const POST_FINAL10_PATCH = 'post-final10-r1-version1-stabilization-accessibility-performance';
export const POST_FINAL10_PRODUCT_VERSION = '1.0.0';
export const POST_FINAL10_SOURCE_BASELINE_SHA = '56e98d32e0bf2587a592e1e45faab218bbfbfda4';
export const POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA = '5511d393d7249b5487affa3616716ccb64593e99';

export const POST_FINAL10_COLOR_VISION_MODES = Object.freeze([
  'standard',
  'deuteranopia',
  'protanopia',
  'tritanopia',
  'monochrome'
]);

export const POST_FINAL10_PERFORMANCE_PROFILES = Object.freeze({
  SUSPENDED: Object.freeze({ particleBudget: 0.08, animationBudget: 0.1, networkPollingScale: 2.5 }),
  RECOVERY: Object.freeze({ particleBudget: 0.3, animationBudget: 0.4, networkPollingScale: 1.6 }),
  CONSERVE: Object.freeze({ particleBudget: 0.42, animationBudget: 0.55, networkPollingScale: 1.25 }),
  BALANCED: Object.freeze({ particleBudget: 0.72, animationBudget: 0.82, networkPollingScale: 1 }),
  QUALITY: Object.freeze({ particleBudget: 1, animationBudget: 1, networkPollingScale: 1 })
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

function bool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 'on' || value === 'true' || value === 1) return true;
  if (value === 'off' || value === 'false' || value === 0) return false;
  return fallback;
}

function cleanMode(value, supported, fallback) {
  const token = String(value || '').trim().toLowerCase();
  return supported.includes(token) ? token : fallback;
}

export function normalizePostFinal10Accessibility(
  value = {},
  system = {}
) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const prefersReducedMotion = bool(system.prefersReducedMotion, false);
  const prefersHighContrast = bool(system.prefersHighContrast, false);

  return Object.freeze({
    schema: 2,
    reducedMotion: bool(source.reducedMotion, prefersReducedMotion),
    highContrast: bool(source.highContrast, prefersHighContrast),
    hudScale: Math.round(clamp(source.hudScale, 85, 135, 100)),
    textScale: Math.round(clamp(source.textScale, 90, 140, 100)),
    captionScale: Math.round(clamp(source.captionScale, 90, 150, 100)),
    colorVision: cleanMode(
      source.colorVision,
      POST_FINAL10_COLOR_VISION_MODES,
      'standard'
    ),
    focusAssist: bool(source.focusAssist, true),
    damageFlash: cleanMode(source.damageFlash, ['normal', 'low', 'off'], 'normal'),
    crosshairStyle: cleanMode(source.crosshairStyle, ['classic', 'dot', 'ring'], 'classic'),
    crosshairColor: cleanMode(source.crosshairColor, ['white', 'cyan', 'green', 'yellow'], 'white'),
    crosshairSize: Math.round(clamp(source.crosshairSize, 80, 150, 100))
  });
}

export function derivePostFinal10DeviceClass(value = {}) {
  const mobile = bool(value.mobile, false);
  const saveData = bool(value.saveData, false);
  const cores = Math.max(1, Math.floor(finite(value.hardwareConcurrency, 4)));
  const memory = Math.max(0, finite(value.deviceMemory, 0));
  const connection = String(value.effectiveType || '').toLowerCase();
  const slowConnection = ['slow-2g', '2g'].includes(connection);
  const constrained = mobile || saveData || slowConnection || cores <= 4 || (memory > 0 && memory <= 4);
  const high = !mobile && !saveData && cores >= 8 && (memory === 0 || memory >= 8);

  return Object.freeze({
    tier: constrained ? 'LOW' : (high ? 'HIGH' : 'BALANCED'),
    mobile,
    saveData,
    slowConnection,
    hardwareConcurrency: cores,
    deviceMemory: memory
  });
}

export function classifyPostFinal10Network(value = {}) {
  const online = value.online !== false;
  const rttMs = Math.max(0, finite(value.rttMs, 0));
  const jitterMs = Math.max(0, finite(value.jitterMs, 0));
  const lossPct = clamp(value.lossPct, 0, 100, 0);
  let status = 'HEALTHY';

  if (!online) status = 'OFFLINE';
  else if (rttMs >= 900 || jitterMs >= 300 || lossPct >= 15) status = 'POOR';
  else if (rttMs >= 350 || jitterMs >= 120 || lossPct >= 5) status = 'DEGRADED';

  const retryBaseMs = status === 'OFFLINE'
    ? 1500
    : status === 'POOR'
      ? 1000
      : status === 'DEGRADED'
        ? 650
        : 350;

  return Object.freeze({
    status,
    online,
    rttMs,
    jitterMs,
    lossPct,
    retryBaseMs,
    blocking: status === 'OFFLINE'
  });
}

export function postFinal10RetryDelay(attempt = 0, network = {}) {
  const quality = classifyPostFinal10Network(network);
  const exponent = Math.min(5, Math.max(0, Math.floor(finite(attempt, 0))));
  return Math.min(8000, quality.retryBaseMs * (2 ** exponent));
}

export function createPostFinal10GovernorState({ device = {}, now = 0 } = {}) {
  const deviceClass = derivePostFinal10DeviceClass(device);
  const profile = deviceClass.tier === 'LOW' ? 'CONSERVE' : 'BALANCED';
  const budget = POST_FINAL10_PERFORMANCE_PROFILES[profile];
  return Object.freeze({
    schema: 1,
    profile,
    deviceClass,
    weakSeconds: 0,
    stableSeconds: 0,
    lastChangedAt: Math.max(0, finite(now, 0)),
    particleBudget: budget.particleBudget,
    animationBudget: budget.animationBudget,
    networkPollingScale: budget.networkPollingScale,
    reason: deviceClass.tier === 'LOW' ? 'constrained-device-start' : 'balanced-device-start'
  });
}

export function updatePostFinal10Governor(previous, sample = {}) {
  const base = previous && typeof previous === 'object'
    ? previous
    : createPostFinal10GovernorState({ device: sample.device, now: sample.now });
  const dt = clamp(sample.dt, 0, 1, 0);
  const fps = clamp(sample.fps, 0, 240, 60);
  const frameMs = clamp(sample.frameMs, 0, 1000, fps > 0 ? 1000 / fps : 1000);
  const hidden = sample.hidden === true;
  const network = classifyPostFinal10Network(sample.network || {});
  const now = Math.max(0, finite(sample.now, base.lastChangedAt));
  const deviceClass = base.deviceClass || derivePostFinal10DeviceClass(sample.device || {});

  let profile = base.profile || 'BALANCED';
  let weakSeconds = Math.max(0, finite(base.weakSeconds, 0));
  let stableSeconds = Math.max(0, finite(base.stableSeconds, 0));
  let reason = base.reason || 'runtime-sample';

  if (hidden) {
    profile = 'SUSPENDED';
    weakSeconds = 0;
    stableSeconds = 0;
    reason = 'document-hidden';
  } else if (!network.online) {
    profile = 'RECOVERY';
    weakSeconds = 0;
    stableSeconds = 0;
    reason = 'network-offline';
  } else {
    const weak = fps < 32 || frameMs > 46;
    const stable = fps >= 55 && frameMs <= 24;
    weakSeconds = weak ? weakSeconds + dt : Math.max(0, weakSeconds - dt * 1.75);
    stableSeconds = stable ? stableSeconds + dt : Math.max(0, stableSeconds - dt * 1.25);

    if (weakSeconds >= 2.25) {
      profile = 'CONSERVE';
      reason = 'sustained-low-frame-rate';
      stableSeconds = 0;
    } else if (
      stableSeconds >= 12
      && deviceClass.tier === 'HIGH'
      && network.status === 'HEALTHY'
    ) {
      profile = 'QUALITY';
      reason = 'sustained-high-frame-rate';
      weakSeconds = 0;
    } else if (
      stableSeconds >= 7
      || (profile === 'SUSPENDED' && !hidden)
      || (profile === 'RECOVERY' && network.online)
    ) {
      profile = deviceClass.tier === 'LOW' ? 'CONSERVE' : 'BALANCED';
      reason = 'runtime-recovered';
      weakSeconds = 0;
    }
  }

  const budget = POST_FINAL10_PERFORMANCE_PROFILES[profile]
    || POST_FINAL10_PERFORMANCE_PROFILES.BALANCED;
  const changed = profile !== base.profile;

  return Object.freeze({
    state: Object.freeze({
      schema: 1,
      profile,
      deviceClass,
      weakSeconds,
      stableSeconds,
      lastChangedAt: changed ? now : Math.max(0, finite(base.lastChangedAt, now)),
      particleBudget: budget.particleBudget,
      animationBudget: budget.animationBudget,
      networkPollingScale: budget.networkPollingScale,
      reason
    }),
    changed,
    network,
    sample: Object.freeze({ fps, frameMs, hidden, dt, now })
  });
}

export function evaluatePostFinal10ReleaseCertification({
  frontend = {},
  worker = {}
} = {}) {
  const errors = [];
  const workerInfo = worker.version1Certification || {};
  const frontendInfo = frontend.version1Certification || {};
  const comparisons = [
    ['PATCH', POST_FINAL10_PATCH, workerInfo.patch],
    ['PRODUCT_VERSION', POST_FINAL10_PRODUCT_VERSION, workerInfo.productVersion],
    ['SOURCE_BASELINE', POST_FINAL10_SOURCE_BASELINE_SHA, workerInfo.sourceBaselineSha],
    ['CERTIFIED_FRONTEND_BASELINE', POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA, workerInfo.certifiedFrontendBaselineSha],
    ['CERTIFICATION_STATUS', 'CERTIFIED', workerInfo.certification?.status],
    ['FRONTEND_PATCH', POST_FINAL10_PATCH, frontendInfo.patch],
    ['FRONTEND_PRODUCT_VERSION', POST_FINAL10_PRODUCT_VERSION, frontendInfo.productVersion],
    ['FRONTEND_CERTIFICATION_STATUS', 'CERTIFIED', frontendInfo.certification?.status]
  ];

  comparisons.forEach(([code, expected, received]) => {
    if (String(received || '') !== String(expected)) {
      errors.push(Object.freeze({ code, expected, received: received ?? null }));
    }
  });

  return Object.freeze({
    status: errors.length ? 'FAIL' : 'PASS',
    ready: errors.length === 0,
    blocking: errors.length > 0,
    errors: Object.freeze(errors)
  });
}

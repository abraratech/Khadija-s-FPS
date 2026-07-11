export const CAMERA_MODE_FIRST = 'first';
export const CAMERA_MODE_THIRD = 'third';
export const CAMERA_SHOULDER_LEFT = 'left';
export const CAMERA_SHOULDER_RIGHT = 'right';

export const CAMERA_PRESENTATION_DEFAULTS = Object.freeze({
  mode: CAMERA_MODE_FIRST,
  shoulder: CAMERA_SHOULDER_RIGHT,
  distance: 4.2,
  smoothing: 12
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function normalizeCameraMode(value) {
  return String(value || '').toLowerCase() === CAMERA_MODE_THIRD
    ? CAMERA_MODE_THIRD
    : CAMERA_MODE_FIRST;
}

export function normalizeCameraShoulder(value) {
  return String(value || '').toLowerCase() === CAMERA_SHOULDER_LEFT
    ? CAMERA_SHOULDER_LEFT
    : CAMERA_SHOULDER_RIGHT;
}

export function normalizeCameraPresentationSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    mode: normalizeCameraMode(source.mode),
    shoulder: normalizeCameraShoulder(source.shoulder),
    distance: Math.round(clamp(source.distance, 3.0, 6.0, CAMERA_PRESENTATION_DEFAULTS.distance) * 10) / 10,
    smoothing: Math.round(clamp(source.smoothing, 6, 20, CAMERA_PRESENTATION_DEFAULTS.smoothing))
  });
}

export function cameraForwardFromYawPitch(yaw = 0, pitch = 0) {
  const safeYaw = finite(yaw, 0);
  const safePitch = clamp(pitch, -1.54, 1.54, 0);
  const cosPitch = Math.cos(safePitch);
  return Object.freeze({
    x: -Math.sin(safeYaw) * cosPitch,
    y: Math.sin(safePitch),
    z: -Math.cos(safeYaw) * cosPitch
  });
}

export function cameraRightFromYaw(yaw = 0) {
  const safeYaw = finite(yaw, 0);
  return Object.freeze({
    x: Math.cos(safeYaw),
    y: 0,
    z: -Math.sin(safeYaw)
  });
}

export function computeThirdPersonCameraPose({
  playerPosition = { x: 0, y: 1.75, z: 0 },
  yaw = 0,
  pitch = 0,
  shoulder = CAMERA_SHOULDER_RIGHT,
  distance = CAMERA_PRESENTATION_DEFAULTS.distance,
  ads = false,
  sprinting = false,
  gaitPhase = 0,
  collisionDistance = null
} = {}) {
  const position = playerPosition && typeof playerPosition === 'object'
    ? playerPosition
    : { x: 0, y: 1.75, z: 0 };
  const forward = cameraForwardFromYawPitch(yaw, pitch);
  const right = cameraRightFromYaw(yaw);
  const normalizedShoulder = normalizeCameraShoulder(shoulder);
  const sideSign = normalizedShoulder === CAMERA_SHOULDER_LEFT ? -1 : 1;
  const requestedDistance = clamp(distance, 3.0, 6.0, CAMERA_PRESENTATION_DEFAULTS.distance);
  const desiredDistance = ads ? Math.min(requestedDistance, 2.55) : requestedDistance;
  const resolvedDistance = collisionDistance === null || collisionDistance === undefined
    ? desiredDistance
    : clamp(collisionDistance, 0.55, desiredDistance, desiredDistance);
  const shoulderOffset = (ads ? 0.62 : 0.92) * sideSign;
  const heightOffset = ads ? 0.12 : 0.42;
  const bobStrength = sprinting ? 0.035 : 0.018;
  const bob = Math.sin(finite(gaitPhase, 0)) * bobStrength;

  const pivot = Object.freeze({
    x: finite(position.x, 0),
    y: finite(position.y, 1.75) + heightOffset + bob,
    z: finite(position.z, 0)
  });

  const camera = Object.freeze({
    x: pivot.x - forward.x * resolvedDistance + right.x * shoulderOffset,
    y: pivot.y - forward.y * resolvedDistance,
    z: pivot.z - forward.z * resolvedDistance + right.z * shoulderOffset
  });

  return Object.freeze({
    pivot,
    camera,
    forward,
    right,
    desiredDistance,
    resolvedDistance,
    shoulderOffset
  });
}

export function cameraSmoothingAlpha(dt, smoothing = CAMERA_PRESENTATION_DEFAULTS.smoothing) {
  const safeDt = clamp(dt, 0, 0.1, 0);
  const safeSmoothing = clamp(smoothing, 1, 40, CAMERA_PRESENTATION_DEFAULTS.smoothing);
  return 1 - Math.exp(-safeSmoothing * safeDt);
}

export function resolveCameraCollisionDistance({
  desiredDistance,
  hitDistance = null,
  padding = 0.24,
  minimum = 0.55
} = {}) {
  const safeMinimum = clamp(minimum, 0, 4, 0.55);
  const desired = clamp(desiredDistance, safeMinimum, 12, CAMERA_PRESENTATION_DEFAULTS.distance);
  const hit = Number(hitDistance);
  if (!Number.isFinite(hit) || hit <= 0 || hit >= desired) return desired;
  return clamp(hit - clamp(padding, 0, 1, 0.24), safeMinimum, desired, desired);
}

export function updateCameraCollisionLatch({
  currentTarget = null,
  candidateTarget,
  desiredDistance,
  blocked = false,
  clearSeconds = 0,
  dt = 0,
  releaseDelay = 0.18,
  deadband = 0.08
} = {}) {
  const desired = clamp(desiredDistance, 0, 12, CAMERA_PRESENTATION_DEFAULTS.distance);
  const candidate = clamp(candidateTarget, 0, desired, desired);
  const hasCurrent = currentTarget !== null
    && currentTarget !== undefined
    && Number.isFinite(Number(currentTarget));
  const current = hasCurrent
    ? clamp(Number(currentTarget), 0, desired, candidate)
    : candidate;
  const safeDt = clamp(dt, 0, 0.1, 0);
  const safeDelay = clamp(releaseDelay, 0, 2, 0.18);
  const safeDeadband = clamp(deadband, 0, 1, 0.08);
  const nextClearSeconds = blocked
    ? 0
    : Math.max(0, finite(clearSeconds, 0)) + safeDt;

  let targetDistance = current;
  if (blocked) {
    // Obstructions may retract immediately, but an intermittent farther hit
    // cannot expand the camera again until the path has remained clear.
    if (candidate < current - safeDeadband) targetDistance = candidate;
    else if (candidate <= current + safeDeadband) targetDistance = Math.min(current, candidate);
  } else if (nextClearSeconds >= safeDelay) {
    targetDistance = desired;
  }

  return Object.freeze({
    targetDistance,
    clearSeconds: nextClearSeconds,
    blocked: blocked === true,
    releaseReady: blocked !== true && nextClearSeconds >= safeDelay
  });
}

export function cameraCollisionSmoothingAlpha(dt, currentDistance, targetDistance) {
  const current = Math.max(0, finite(currentDistance, targetDistance));
  const target = Math.max(0, finite(targetDistance, current));
  // Pull in quickly to avoid wall clipping, but ease back out to prevent
  // narrow-corridor collision chatter from looking like camera jumping.
  return cameraSmoothingAlpha(dt, target < current ? 28 : 8);
}

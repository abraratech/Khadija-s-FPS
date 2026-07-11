export const THIRD_PERSON_ADS_POLICY = 'first-person';

const FAMILY_ALIASES = Object.freeze({
  PISTOL_UPG: 'PISTOL',
  RIFLE_UPG: 'RIFLE',
  SMG_UPG: 'SMG',
  SHOTGUN_UPG: 'SHOTGUN',
  SNIPER_UPG: 'SNIPER'
});

const WEAPON_PROFILES = Object.freeze({
  PISTOL: Object.freeze({
    family: 'PISTOL',
    targetLength: 0.72,
    mount: Object.freeze({ x: 0.10, y: 1.31, z: -0.46 }),
    rotation: Object.freeze({ x: -0.04, y: 0.00, z: 0.00 }),
    rightGrip: Object.freeze({ x: 0.12, y: 1.24, z: -0.30 }),
    leftGrip: Object.freeze({ x: -0.03, y: 1.22, z: -0.36 })
  }),
  SMG: Object.freeze({
    family: 'SMG',
    targetLength: 0.94,
    mount: Object.freeze({ x: 0.08, y: 1.30, z: -0.54 }),
    rotation: Object.freeze({ x: -0.035, y: 0.00, z: 0.00 }),
    rightGrip: Object.freeze({ x: 0.15, y: 1.22, z: -0.29 }),
    leftGrip: Object.freeze({ x: -0.09, y: 1.18, z: -0.59 })
  }),
  RIFLE: Object.freeze({
    family: 'RIFLE',
    targetLength: 1.10,
    mount: Object.freeze({ x: 0.08, y: 1.29, z: -0.60 }),
    rotation: Object.freeze({ x: -0.035, y: 0.00, z: 0.00 }),
    rightGrip: Object.freeze({ x: 0.15, y: 1.21, z: -0.30 }),
    leftGrip: Object.freeze({ x: -0.10, y: 1.17, z: -0.68 })
  }),
  SHOTGUN: Object.freeze({
    family: 'SHOTGUN',
    targetLength: 1.18,
    mount: Object.freeze({ x: 0.08, y: 1.28, z: -0.64 }),
    rotation: Object.freeze({ x: -0.045, y: 0.00, z: 0.00 }),
    rightGrip: Object.freeze({ x: 0.15, y: 1.20, z: -0.31 }),
    leftGrip: Object.freeze({ x: -0.11, y: 1.14, z: -0.74 })
  }),
  SNIPER: Object.freeze({
    family: 'SNIPER',
    targetLength: 1.34,
    mount: Object.freeze({ x: 0.08, y: 1.29, z: -0.72 }),
    rotation: Object.freeze({ x: -0.035, y: 0.00, z: 0.00 }),
    rightGrip: Object.freeze({ x: 0.15, y: 1.20, z: -0.32 }),
    leftGrip: Object.freeze({ x: -0.11, y: 1.13, z: -0.82 })
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

function vec(value = {}) {
  return {
    x: finite(value.x, 0),
    y: finite(value.y, 0),
    z: finite(value.z, 0)
  };
}

function rotatePoint(point, rotation) {
  let { x, y, z } = vec(point);
  const rx = finite(rotation?.x, 0);
  const ry = finite(rotation?.y, 0);
  const rz = finite(rotation?.z, 0);

  let c = Math.cos(rx);
  let s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];

  c = Math.cos(ry);
  s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];

  c = Math.cos(rz);
  s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];

  return { x, y, z };
}

function transformGrip(grip, baseMount, weaponPosition, weaponRotation) {
  const local = {
    x: grip.x - baseMount.x,
    y: grip.y - baseMount.y,
    z: grip.z - baseMount.z
  };
  const rotated = rotatePoint(local, weaponRotation);
  return Object.freeze({
    x: weaponPosition.x + rotated.x,
    y: weaponPosition.y + rotated.y,
    z: weaponPosition.z + rotated.z
  });
}

export function computeWeaponFirePulse(ageSeconds = Infinity, durationSeconds = 0.12) {
  const age = Math.max(0, finite(ageSeconds, Infinity));
  const duration = clamp(durationSeconds, 0.04, 0.30, 0.12);
  if (!Number.isFinite(age) || age >= duration) return 0;
  const normalized = 1 - age / duration;
  return Math.sin(normalized * Math.PI * 0.5) * normalized;
}

export function computeWeaponSwitchBlend(progress = 1) {
  const t = clamp(progress, 0, 1, 1);
  return t * t * (3 - 2 * t);
}

export function computeThirdPersonOcclusionOpacity({
  cameraDistance = 4,
  nearDistance = 0.90,
  farDistance = 2.05,
  minimumOpacity = 0.08
} = {}) {
  const near = clamp(nearDistance, 0.25, 4, 0.90);
  const far = Math.max(near + 0.05, clamp(farDistance, near + 0.05, 8, 2.05));
  const minimum = clamp(minimumOpacity, 0, 1, 0.08);
  const distance = Math.max(0, finite(cameraDistance, far));
  const t = clamp((distance - near) / (far - near), 0, 1, 1);
  const eased = t * t * (3 - 2 * t);
  return minimum + (1 - minimum) * eased;
}

export function normalizeThirdPersonWeaponFamily(value) {
  const token = String(value || 'PISTOL')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
  const normalized = FAMILY_ALIASES[token] || token.replace(/_UPG$/, '');
  return WEAPON_PROFILES[normalized] ? normalized : 'PISTOL';
}

export function getThirdPersonWeaponProfile(value) {
  return WEAPON_PROFILES[normalizeThirdPersonWeaponFamily(value)];
}

export function shouldUseFirstPersonAds({
  preferredMode = 'first',
  isADS = false
} = {}) {
  return String(preferredMode || '').toLowerCase() === 'third'
    && isADS === true;
}

export function computeThirdPersonAvatarPose({
  weaponFamily = 'PISTOL',
  pitch = 0,
  horizontalSpeed = 0,
  onGround = true,
  sprinting = false,
  gaitPhase = 0,
  reloading = false,
  reloadProgress = 0,
  firePulse = 0,
  switchProgress = 1
} = {}) {
  const profile = getThirdPersonWeaponProfile(weaponFamily);
  const speed = Math.max(0, finite(horizontalSpeed, 0));
  const moving = speed > 0.25 && onGround === true;
  const gait = moving
    ? Math.sin(finite(gaitPhase, 0)) * Math.min(0.70, speed * 0.045)
    : 0;
  const sprint = sprinting === true ? 1 : 0;
  const reloadT = reloading === true
    ? Math.sin(clamp(reloadProgress, 0, 1, 0) * Math.PI)
    : 0;
  const visualPitch = clamp(pitch, -0.85, 0.75, 0);
  const fire = clamp(firePulse, 0, 1, 0);
  const switchBlend = computeWeaponSwitchBlend(switchProgress);
  const switchDip = (1 - switchBlend) * 0.20;

  const weaponPosition = Object.freeze({
    x: profile.mount.x + sprint * 0.13 + reloadT * 0.07,
    y: profile.mount.y - sprint * 0.18 - reloadT * 0.05 - switchDip,
    z: profile.mount.z + sprint * 0.13 + reloadT * 0.04 + fire * 0.10 + switchDip * 0.25
  });
  const weaponRotation = Object.freeze({
    x: profile.rotation.x + visualPitch * 0.74 - sprint * 0.42 + reloadT * 0.20 + fire * 0.12,
    y: profile.rotation.y + sprint * 0.18 - reloadT * 0.08,
    z: profile.rotation.z - sprint * 0.20 + reloadT * 0.46 + fire * 0.035
  });

  const rightHand = transformGrip(
    profile.rightGrip,
    profile.mount,
    weaponPosition,
    weaponRotation
  );
  const leftHand = transformGrip(
    profile.leftGrip,
    profile.mount,
    weaponPosition,
    weaponRotation
  );

  const torsoBob = moving ? Math.sin(finite(gaitPhase, 0) * 2) * 0.018 : 0;
  const rightShoulder = Object.freeze({
    x: 0.34,
    y: 1.40 + torsoBob,
    z: -0.01
  });
  const leftShoulder = Object.freeze({
    x: -0.34,
    y: 1.40 + torsoBob,
    z: -0.01
  });

  const rightElbow = Object.freeze({
    x: Math.max(0.24, (rightShoulder.x + rightHand.x) * 0.5 + 0.12),
    y: (rightShoulder.y + rightHand.y) * 0.5 - 0.07,
    z: (rightShoulder.z + rightHand.z) * 0.5 + 0.05
  });
  const leftElbow = Object.freeze({
    x: Math.min(-0.18, (leftShoulder.x + leftHand.x) * 0.5 - 0.08),
    y: (leftShoulder.y + leftHand.y) * 0.5 - 0.09,
    z: (leftShoulder.z + leftHand.z) * 0.5 + 0.03
  });

  return Object.freeze({
    family: profile.family,
    targetLength: profile.targetLength,
    moving,
    gait,
    firePulse: fire,
    switchBlend,
    torso: Object.freeze({
      x: sprint * 0.10,
      z: moving ? Math.sin(finite(gaitPhase, 0) * 0.5) * 0.025 : 0,
      y: torsoBob
    }),
    headPitch: visualPitch * 0.38,
    weapon: Object.freeze({
      position: weaponPosition,
      rotation: weaponRotation
    }),
    rightArm: Object.freeze({
      shoulder: rightShoulder,
      elbow: rightElbow,
      hand: rightHand
    }),
    leftArm: Object.freeze({
      shoulder: leftShoulder,
      elbow: leftElbow,
      hand: leftHand
    }),
    legs: Object.freeze({
      left: gait,
      right: -gait
    })
  });
}

import * as THREE from 'three';
import {
  CAMERA_MODE_FIRST,
  CAMERA_MODE_THIRD,
  CAMERA_SHOULDER_LEFT,
  CAMERA_SHOULDER_RIGHT,
  cameraCollisionSmoothingAlpha,
  cameraSmoothingAlpha,
  computeThirdPersonCameraPose,
  normalizeCameraPresentationSettings,
  resolveCameraCollisionDistance,
  updateCameraCollisionLatch
} from './camera_presentation_core.js';

const STORAGE_KEY = 'ka_camera_presentation_v1';

let initialized = false;
let settings = readSettings();
let refs = null;
let avatarRoot = null;
let avatarParts = null;
let cameraInitialized = false;
let gaitPhase = 0;
let lastContext = { gameState: 'menu', coOpMenuOpen: false, inputBlocked: false };
let collisionState = 'clear';
let smoothedBoomDistance = null;
let smoothedShoulderDistance = null;
let latchedBoomTarget = null;
let latchedShoulderTarget = null;
let boomClearSeconds = 0;
let shoulderClearSeconds = 0;

const collisionRay = new THREE.Raycaster();
const desiredPosition = new THREE.Vector3();
const smoothedCameraPosition = new THREE.Vector3();
const pivotPosition = new THREE.Vector3();
const direction = new THREE.Vector3();
const centerDesiredPosition = new THREE.Vector3();
const boomPosition = new THREE.Vector3();
const shoulderTargetPosition = new THREE.Vector3();
const rightDirection = new THREE.Vector3();

function resetCameraSolver() {
  cameraInitialized = false;
  collisionState = 'clear';
  smoothedBoomDistance = null;
  smoothedShoulderDistance = null;
  latchedBoomTarget = null;
  latchedShoulderTarget = null;
  boomClearSeconds = 0;
  shoulderClearSeconds = 0;
  smoothedCameraPosition.set(0, 0, 0);
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeCameraPresentationSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeCameraPresentationSettings();
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Restricted/private storage should not block gameplay.
  }
}

function makeButton(id, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.textContent = text;
  return button;
}

function installStyles() {
  if (document.getElementById('ka-camera-presentation-style')) return;
  const style = document.createElement('style');
  style.id = 'ka-camera-presentation-style';
  style.textContent = `
    .ka-camera-settings{margin-top:14px;padding:14px;border:1px solid rgba(0,212,255,.28);border-radius:10px;background:rgba(7,16,27,.72)}
    .ka-camera-settings h3{margin:0 0 10px;color:#8beeff;font-size:14px;letter-spacing:.08em}.ka-camera-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.ka-camera-row button,.ka-camera-row select,.ka-camera-row input{min-height:38px}.ka-camera-active{outline:2px solid #00d4ff;box-shadow:0 0 12px rgba(0,212,255,.35)}
    .ka-camera-distance{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:#bcd2df}
    #ka-camera-mobile-toggle{position:absolute;right:14px;top:78px;z-index:30;min-width:58px;min-height:40px;border-radius:10px;background:rgba(5,12,20,.8);border:1px solid rgba(0,212,255,.55);color:#dffaff;font-weight:700}
    #ka-camera-mode-indicator{position:fixed;right:18px;bottom:18px;z-index:40;padding:7px 10px;border-radius:8px;background:rgba(3,8,14,.72);border:1px solid rgba(0,212,255,.35);color:#bfefff;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.08em;pointer-events:none;opacity:.75}
    @media(max-width:700px){.ka-camera-row{grid-template-columns:1fr}.ka-camera-settings{padding:10px}#ka-camera-mode-indicator{display:none}}
  `;
  document.head.append(style);
}

function createAvatar() {
  if (!refs?.scene || avatarRoot) return;
  const root = new THREE.Group();
  root.name = 'ka-third-person-avatar';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1a6f86, roughness: 0.78, metalness: 0.08 });
  const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x152836, roughness: 0.85 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xb88767, roughness: 0.9 });
  const weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.52, metalness: 0.45 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.34), bodyMaterial);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), skinMaterial);
  head.position.y = 1.68;

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), limbMaterial);
  const rightArm = leftArm.clone();
  leftArm.position.set(-0.46, 1.08, -0.02);
  rightArm.position.set(0.46, 1.08, -0.02);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.28), limbMaterial);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-0.2, 0.43, 0);
  rightLeg.position.set(0.2, 0.43, 0);

  const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.92), weaponMaterial);
  weapon.position.set(0.1, 1.12, -0.43);
  weapon.rotation.x = -0.08;

  [torso, head, leftArm, rightArm, leftLeg, rightLeg, weapon].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    root.add(mesh);
  });

  avatarParts = { torso, head, leftArm, rightArm, leftLeg, rightLeg, weapon };
  root.visible = false;
  refs.scene.add(root);
  avatarRoot = root;
}

function setWeaponVisible(visible) {
  const weapon = refs?.getActiveWeapon?.();
  if (weapon?.meshGroup) weapon.meshGroup.visible = visible === true;
}

function activeWeaponIsScopedSniper() {
  const weapon = refs?.getActiveWeapon?.();
  const token = `${weapon?.id || ''} ${weapon?.name || ''} ${weapon?.type || ''}`.toLowerCase();
  return token.includes('sniper');
}

function effectiveMode() {
  if (!refs?.player?.alive || refs.player.isDowned || refs.player.isSpectating) return CAMERA_MODE_FIRST;
  if (settings.mode === CAMERA_MODE_THIRD && refs.player.isADS && activeWeaponIsScopedSniper()) {
    return CAMERA_MODE_FIRST;
  }
  return settings.mode;
}

function publishDiagnostics(mode = effectiveMode()) {
  const root = document.documentElement;
  root.dataset.kaCameraPresentation = initialized ? 'ready' : 'idle';
  root.dataset.kaCameraMode = mode;
  root.dataset.kaCameraPreferredMode = settings.mode;
  root.dataset.kaCameraShoulder = settings.shoulder;
  root.dataset.kaCameraCollision = collisionState;
  const indicator = document.getElementById('ka-camera-mode-indicator');
  if (indicator) {
    indicator.textContent = mode === CAMERA_MODE_THIRD
      ? `THIRD PERSON · ${settings.shoulder.toUpperCase()} SHOULDER`
      : 'FIRST PERSON';
  }
}

function syncUi() {
  const mode = settings.mode;
  document.querySelectorAll('[data-ka-camera-mode]').forEach((button) => {
    button.classList.toggle('ka-camera-active', button.dataset.kaCameraMode === mode);
    button.setAttribute('aria-pressed', button.dataset.kaCameraMode === mode ? 'true' : 'false');
  });
  document.querySelectorAll('[data-ka-camera-shoulder]').forEach((button) => {
    button.classList.toggle('ka-camera-active', button.dataset.kaCameraShoulder === settings.shoulder);
    button.setAttribute('aria-pressed', button.dataset.kaCameraShoulder === settings.shoulder ? 'true' : 'false');
  });
  document.querySelectorAll('[data-ka-camera-distance]').forEach((slider) => {
    slider.value = String(settings.distance);
  });
  document.querySelectorAll('[data-ka-camera-distance-label]').forEach((label) => {
    label.textContent = `${settings.distance.toFixed(1)} m`;
  });
  const mobile = document.getElementById('ka-camera-mobile-toggle');
  if (mobile) mobile.textContent = mode === CAMERA_MODE_THIRD ? 'TPP' : 'FPP';
  publishDiagnostics();
}

function updateSettings(next, toast = '') {
  settings = normalizeCameraPresentationSettings({ ...settings, ...next });
  saveSettings();
  resetCameraSolver();
  syncUi();
  if (toast) refs?.showToast?.(toast, '#00d4ff', 1300);
  return settings;
}

function buildSettingsPanel(parent, suffix) {
  if (!parent || document.getElementById(`ka-camera-settings-${suffix}`)) return;
  const panel = document.createElement('section');
  panel.className = 'ka-camera-settings';
  panel.id = `ka-camera-settings-${suffix}`;
  panel.innerHTML = `<h3>CAMERA & PRESENTATION</h3>`;

  const modeRow = document.createElement('div');
  modeRow.className = 'ka-camera-row';
  const first = makeButton(`ka-camera-first-${suffix}`, 'FIRST PERSON');
  const third = makeButton(`ka-camera-third-${suffix}`, 'THIRD PERSON');
  first.dataset.kaCameraMode = CAMERA_MODE_FIRST;
  third.dataset.kaCameraMode = CAMERA_MODE_THIRD;
  first.addEventListener('click', () => updateSettings({ mode: CAMERA_MODE_FIRST }, 'FIRST-PERSON CAMERA'));
  third.addEventListener('click', () => updateSettings({ mode: CAMERA_MODE_THIRD }, 'THIRD-PERSON CAMERA'));
  modeRow.append(first, third);

  const shoulderRow = document.createElement('div');
  shoulderRow.className = 'ka-camera-row';
  const left = makeButton(`ka-camera-left-${suffix}`, 'LEFT SHOULDER');
  const right = makeButton(`ka-camera-right-${suffix}`, 'RIGHT SHOULDER');
  left.dataset.kaCameraShoulder = CAMERA_SHOULDER_LEFT;
  right.dataset.kaCameraShoulder = CAMERA_SHOULDER_RIGHT;
  left.addEventListener('click', () => updateSettings({ shoulder: CAMERA_SHOULDER_LEFT }, 'LEFT SHOULDER'));
  right.addEventListener('click', () => updateSettings({ shoulder: CAMERA_SHOULDER_RIGHT }, 'RIGHT SHOULDER'));
  shoulderRow.append(left, right);

  const distance = document.createElement('label');
  distance.className = 'ka-camera-distance';
  const distanceText = document.createElement('span');
  distanceText.textContent = 'DISTANCE';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '3';
  slider.max = '6';
  slider.step = '0.1';
  slider.dataset.kaCameraDistance = 'true';
  const value = document.createElement('span');
  value.dataset.kaCameraDistanceLabel = 'true';
  slider.addEventListener('input', () => updateSettings({ distance: Number(slider.value) }));
  distance.append(distanceText, slider, value);

  const note = document.createElement('p');
  note.style.cssText = 'margin:9px 0 0;color:#9fb4c5;font-size:11px';
  note.textContent = 'V toggles view · B switches shoulder · Camera collision prevents wall clipping.';

  panel.append(modeRow, shoulderRow, distance, note);
  parent.append(panel);
}

function buildUi() {
  installStyles();
  const settingsScreen = document.querySelector('[data-menu-screen="settings"]');
  buildSettingsPanel(settingsScreen, 'menu');

  const pause = document.getElementById('pause-screen');
  const pauseTarget = pause?.querySelector('.pause-panel,.pause-content,.panel') || pause;
  buildSettingsPanel(pauseTarget, 'pause');

  if (refs?.isMobile) {
    const mobileUi = document.getElementById('mobile-ui');
    if (mobileUi && !document.getElementById('ka-camera-mobile-toggle')) {
      const button = makeButton('ka-camera-mobile-toggle', 'FPP');
      button.setAttribute('aria-label', 'Toggle first-person and third-person camera');
      button.addEventListener('touchstart', (event) => {
        event.preventDefault();
        toggleCameraMode();
      }, { passive: false });
      mobileUi.append(button);
    }
  }

  if (!document.getElementById('ka-camera-mode-indicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'ka-camera-mode-indicator';
    document.body.append(indicator);
  }
  syncUi();
}

function editableTarget(target) {
  return target instanceof Element && target.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
}

function toggleCameraMode() {
  const mode = settings.mode === CAMERA_MODE_THIRD ? CAMERA_MODE_FIRST : CAMERA_MODE_THIRD;
  updateSettings({ mode }, mode === CAMERA_MODE_THIRD ? 'THIRD-PERSON CAMERA' : 'FIRST-PERSON CAMERA');
}

function toggleShoulder() {
  const shoulder = settings.shoulder === CAMERA_SHOULDER_RIGHT
    ? CAMERA_SHOULDER_LEFT
    : CAMERA_SHOULDER_RIGHT;
  updateSettings({ shoulder }, `${shoulder.toUpperCase()} SHOULDER`);
}

function onKeyDown(event) {
  if (event.repeat || editableTarget(event.target)) return;
  if (lastContext.gameState !== 'playing' || lastContext.coOpMenuOpen || lastContext.inputBlocked) return;
  if (event.code === 'KeyV') {
    event.preventDefault();
    toggleCameraMode();
  } else if (event.code === 'KeyB' && settings.mode === CAMERA_MODE_THIRD) {
    event.preventDefault();
    toggleShoulder();
  }
}

function animateAvatar(dt) {
  if (!avatarRoot || !avatarParts || !refs?.player) return;
  const player = refs.player;
  const horizontalSpeed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
  const moving = horizontalSpeed > 0.25 && player.onGround;
  gaitPhase += moving ? dt * Math.min(15, 5 + horizontalSpeed * 0.7) : dt * 2;
  const swing = moving ? Math.sin(gaitPhase) * Math.min(0.72, horizontalSpeed * 0.045) : 0;
  const armSwing = swing * 0.62;

  avatarRoot.position.set(player.pos.x, player.pos.y - 1.75, player.pos.z);
  avatarRoot.rotation.y = player.yaw;
  avatarParts.leftLeg.rotation.x = swing;
  avatarParts.rightLeg.rotation.x = -swing;
  avatarParts.leftArm.rotation.x = -armSwing - 0.35;
  avatarParts.rightArm.rotation.x = armSwing - 0.35;
  avatarParts.torso.rotation.z = moving ? Math.sin(gaitPhase * 0.5) * 0.025 : 0;
  avatarParts.head.rotation.x = THREE.MathUtils.clamp(player.pitch * 0.35, -0.35, 0.35);
  avatarParts.weapon.rotation.y = player.isADS ? -0.08 : 0.05;
}

function objectIsDescendant(root, object) {
  let current = object || null;
  while (current) {
    if (current === root) return true;
    current = current.parent || null;
  }
  return false;
}

function collisionHit(origin, target) {
  direction.copy(target).sub(origin);
  const distance = direction.length();
  if (distance <= 0.001) return { distance, hitDistance: null };

  collisionRay.set(origin, direction.normalize());
  collisionRay.near = 0.08;
  collisionRay.far = distance;
  const firstPersonWeapon = refs?.getActiveWeapon?.()?.meshGroup || null;
  const hit = collisionRay.intersectObjects(refs?.mapMeshes || [], true).find((entry) => {
    const object = entry?.object;
    if (!object || object.visible === false || entry.distance <= 0.08) return false;
    if (object.userData?.cameraIgnore === true || object.userData?.nonSolid === true) return false;
    if (avatarRoot && objectIsDescendant(avatarRoot, object)) return false;
    if (firstPersonWeapon && objectIsDescendant(firstPersonWeapon, object)) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length && materials.every((material) => material?.transparent === true && Number(material.opacity) <= 0.08)) return false;
    return true;
  });
  return { distance, hitDistance: hit?.distance ?? null };
}

function resolveCollisionPosition(pose, dt) {
  pivotPosition.set(pose.pivot.x, pose.pivot.y, pose.pivot.z);
  rightDirection.set(pose.right.x, pose.right.y, pose.right.z).normalize();

  // Resolve backward distance independently from shoulder clearance.
  centerDesiredPosition.set(pose.camera.x, pose.camera.y, pose.camera.z)
    .addScaledVector(rightDirection, -pose.shoulderOffset);
  const boomHit = collisionHit(pivotPosition, centerDesiredPosition);
  const boomCandidate = resolveCameraCollisionDistance({
    desiredDistance: boomHit.distance,
    hitDistance: boomHit.hitDistance,
    padding: 0.28,
    minimum: 0.85
  });
  const boomBlockedNow = boomCandidate + 0.02 < boomHit.distance;
  const boomLatch = updateCameraCollisionLatch({
    currentTarget: latchedBoomTarget,
    candidateTarget: boomCandidate,
    desiredDistance: boomHit.distance,
    blocked: boomBlockedNow,
    clearSeconds: boomClearSeconds,
    dt,
    releaseDelay: 0.22,
    deadband: 0.10
  });
  latchedBoomTarget = boomLatch.targetDistance;
  boomClearSeconds = boomLatch.clearSeconds;

  if (!Number.isFinite(smoothedBoomDistance)) {
    smoothedBoomDistance = latchedBoomTarget;
  }
  smoothedBoomDistance = THREE.MathUtils.lerp(
    smoothedBoomDistance,
    latchedBoomTarget,
    cameraCollisionSmoothingAlpha(dt, smoothedBoomDistance, latchedBoomTarget)
  );
  smoothedBoomDistance = THREE.MathUtils.clamp(
    smoothedBoomDistance,
    0.85,
    boomHit.distance
  );

  direction.copy(centerDesiredPosition).sub(pivotPosition);
  if (direction.lengthSq() > 0.000001) direction.normalize();
  boomPosition.copy(pivotPosition).addScaledVector(direction, smoothedBoomDistance);

  // Shoulder clearance uses its own latch. A side-wall ray that alternates
  // between touching and missing therefore cannot pull the camera in and out.
  const desiredShoulderDistance = Math.abs(pose.shoulderOffset);
  shoulderTargetPosition.copy(boomPosition)
    .addScaledVector(rightDirection, pose.shoulderOffset);
  const shoulderHit = collisionHit(boomPosition, shoulderTargetPosition);
  const shoulderCandidate = resolveCameraCollisionDistance({
    desiredDistance: shoulderHit.distance,
    hitDistance: shoulderHit.hitDistance,
    padding: 0.12,
    minimum: 0
  });
  const shoulderBlockedNow = shoulderCandidate + 0.02 < shoulderHit.distance;
  const shoulderLatch = updateCameraCollisionLatch({
    currentTarget: latchedShoulderTarget,
    candidateTarget: shoulderCandidate,
    desiredDistance: desiredShoulderDistance,
    blocked: shoulderBlockedNow,
    clearSeconds: shoulderClearSeconds,
    dt,
    releaseDelay: 0.18,
    deadband: 0.06
  });
  latchedShoulderTarget = shoulderLatch.targetDistance;
  shoulderClearSeconds = shoulderLatch.clearSeconds;

  if (!Number.isFinite(smoothedShoulderDistance)) {
    smoothedShoulderDistance = latchedShoulderTarget;
  }
  smoothedShoulderDistance = THREE.MathUtils.lerp(
    smoothedShoulderDistance,
    latchedShoulderTarget,
    cameraCollisionSmoothingAlpha(
      dt,
      smoothedShoulderDistance,
      latchedShoulderTarget
    )
  );
  smoothedShoulderDistance = THREE.MathUtils.clamp(
    smoothedShoulderDistance,
    0,
    desiredShoulderDistance
  );

  const shoulderSign = Math.sign(pose.shoulderOffset) || 1;
  desiredPosition.copy(boomPosition)
    .addScaledVector(
      rightDirection,
      smoothedShoulderDistance * shoulderSign
    );

  const boomLatched = latchedBoomTarget + 0.02 < boomHit.distance;
  const shoulderLatched =
    latchedShoulderTarget + 0.02 < desiredShoulderDistance;
  collisionState = (
    boomBlockedNow
    || shoulderBlockedNow
    || boomLatched
    || shoulderLatched
  ) ? 'blocked' : 'clear';

  return desiredPosition;
}

export function initCameraPresentation(options = {}) {
  if (initialized) return getCameraPresentationSnapshot();
  refs = {
    isMobile: options.isMobile === true,
    camera: options.camera,
    scene: options.scene,
    mapMeshes: options.mapMeshes,
    player: options.player,
    getActiveWeapon: options.getActiveWeapon,
    showToast: options.showToast
  };
  if (!refs.camera || !refs.scene || !refs.player) {
    throw new TypeError('Camera presentation requires camera, scene, and player references.');
  }
  initialized = true;
  createAvatar();
  buildUi();
  window.addEventListener('keydown', onKeyDown, true);
  publishDiagnostics();
  window.KAGetCameraPresentation = getCameraPresentationSnapshot;
  window.KASetCameraMode = (mode) => updateSettings({ mode });
  window.KAToggleCameraShoulder = toggleShoulder;
  return getCameraPresentationSnapshot();
}

export function resetCameraPresentation() {
  resetCameraSolver();
  gaitPhase = 0;
  createAvatar();
  if (avatarRoot) avatarRoot.visible = false;
  publishDiagnostics();
}

export function updateCameraPresentation(dt, context = {}) {
  if (!initialized || !refs?.camera || !refs?.player) return;
  lastContext = {
    gameState: String(context.gameState || 'menu'),
    coOpMenuOpen: context.coOpMenuOpen === true,
    inputBlocked: context.inputBlocked === true
  };

  const player = refs.player;
  const mode = effectiveMode();
  const activeGameplay = lastContext.gameState === 'playing' && player.alive === true;

  if (!activeGameplay || player.isDowned || player.isSpectating) {
    if (avatarRoot) avatarRoot.visible = false;
    setWeaponVisible(false);
    publishDiagnostics(mode);
    return;
  }

  if (mode === CAMERA_MODE_FIRST) {
    if (avatarRoot) avatarRoot.visible = false;
    setWeaponVisible(true);
    refs.camera.rotation.z = THREE.MathUtils.lerp(refs.camera.rotation.z || 0, 0, cameraSmoothingAlpha(dt, 16));
    // Shooting happens later in the same frame. Refresh the matrix now so
    // Raycaster.setFromCamera uses the visible FPP transform rather than the
    // previous rendered frame.
    refs.camera.updateMatrixWorld?.(true);
    resetCameraSolver();
    publishDiagnostics(mode);
    return;
  }

  createAvatar();
  if (avatarRoot) avatarRoot.visible = true;
  setWeaponVisible(false);
  animateAvatar(dt);

  const initialPose = computeThirdPersonCameraPose({
    playerPosition: player.pos,
    yaw: player.yaw,
    pitch: player.pitch,
    shoulder: settings.shoulder,
    distance: settings.distance,
    ads: player.isADS === true,
    sprinting: player.isSprinting === true,
    gaitPhase
  });
  resolveCollisionPosition(initialPose, dt);
  if (!cameraInitialized) {
    smoothedCameraPosition.copy(desiredPosition);
    cameraInitialized = true;
  } else {
    // updatePlayer restores the render camera to the eye position every frame.
    // Keep presentation smoothing in an independent vector so that reset can
    // never make the third-person camera pulse toward first person.
    smoothedCameraPosition.lerp(
      desiredPosition,
      cameraSmoothingAlpha(dt, settings.smoothing)
    );
  }
  refs.camera.position.copy(smoothedCameraPosition);
  const shoulderLean = settings.shoulder === CAMERA_SHOULDER_LEFT ? -0.012 : 0.012;
  refs.camera.rotation.z = THREE.MathUtils.lerp(
    refs.camera.rotation.z || 0,
    player.isADS ? shoulderLean : shoulderLean * 0.35,
    cameraSmoothingAlpha(dt, 10)
  );
  // The hitscan ray is evaluated before render(), so synchronize matrixWorld
  // immediately after applying the stable third-person camera transform.
  refs.camera.updateMatrixWorld?.(true);
  publishDiagnostics(mode);
}

export function enforceCameraPresentationVisibility() {
  if (!initialized || !refs?.player) return;

  const player = refs.player;
  const mode = effectiveMode();
  const activeGameplay = (
    lastContext.gameState === 'playing'
    && player.alive === true
    && !player.isDowned
    && !player.isSpectating
  );

  if (!activeGameplay) {
    if (avatarRoot) avatarRoot.visible = false;
    setWeaponVisible(false);
    return;
  }

  if (mode === CAMERA_MODE_THIRD) {
    if (avatarRoot) avatarRoot.visible = true;
    setWeaponVisible(false);
  } else {
    if (avatarRoot) avatarRoot.visible = false;
    setWeaponVisible(true);
  }
}

export function endCameraPresentation() {
  if (avatarRoot) avatarRoot.visible = false;
  if (refs?.camera) refs.camera.rotation.z = 0;
  setWeaponVisible(false);
  resetCameraSolver();
  publishDiagnostics(CAMERA_MODE_FIRST);
}

export function getCameraPresentationSnapshot() {
  return Object.freeze({
    initialized,
    mode: settings.mode,
    effectiveMode: effectiveMode(),
    shoulder: settings.shoulder,
    distance: settings.distance,
    smoothing: settings.smoothing,
    collision: collisionState,
    boomDistance: Number.isFinite(smoothedBoomDistance)
      ? Math.round(smoothedBoomDistance * 100) / 100
      : null,
    shoulderDistance: Number.isFinite(smoothedShoulderDistance)
      ? Math.round(smoothedShoulderDistance * 100) / 100
      : null,
    avatarVisible: avatarRoot?.visible === true
  });
}

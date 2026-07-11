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
import {
  computeThirdPersonAvatarPose,
  computeThirdPersonOcclusionOpacity,
  computeWeaponFirePulse,
  getThirdPersonWeaponProfile,
  normalizeThirdPersonWeaponFamily,
  shouldUseFirstPersonAds
} from './third_person_avatar_core.js';

const STORAGE_KEY = 'ka_camera_presentation_v1';

let initialized = false;
let settings = readSettings();
let refs = null;
let avatarRoot = null;
let avatarParts = null;
let thirdPersonWeaponVisual = null;
let thirdPersonWeaponIdentity = '';
let thirdPersonWeaponFamily = 'PISTOL';
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
let thirdPersonMuzzleFlash = null;
let thirdPersonTracer = null;
let thirdPersonShotSerial = 0;
let thirdPersonShotAge = Infinity;
let thirdPersonTracerAge = Infinity;
let pendingThirdPersonTracer = false;
let weaponSwitchProgress = 1;
let avatarOpacity = 1;
let firstPersonAdsTransitionActive = false;

const collisionRay = new THREE.Raycaster();
const desiredPosition = new THREE.Vector3();
const smoothedCameraPosition = new THREE.Vector3();
const pivotPosition = new THREE.Vector3();
const direction = new THREE.Vector3();
const centerDesiredPosition = new THREE.Vector3();
const boomPosition = new THREE.Vector3();
const shoulderTargetPosition = new THREE.Vector3();
const rightDirection = new THREE.Vector3();
const avatarPointA = new THREE.Vector3();
const avatarPointB = new THREE.Vector3();
const avatarPointC = new THREE.Vector3();
const avatarPointD = new THREE.Vector3();
const avatarBox = new THREE.Box3();
const avatarBoxPart = new THREE.Box3();
const avatarBoxSize = new THREE.Vector3();
const avatarBoxCenter = new THREE.Vector3();
const avatarUp = new THREE.Vector3(0, 1, 0);
const thirdPersonMuzzleWorld = new THREE.Vector3();
const thirdPersonTracerEnd = new THREE.Vector3();
const thirdPersonShotDirection = new THREE.Vector3(0, 0, -1);

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
    #ka-camera-ads-transition{position:fixed;inset:0;z-index:35;background:rgba(2,7,12,.34);opacity:0;pointer-events:none}
    @media(max-width:700px){.ka-camera-row{grid-template-columns:1fr}.ka-camera-settings{padding:10px}#ka-camera-mode-indicator{display:none}}
  `;
  document.head.append(style);
}

function createAvatar() {
  if (!refs?.scene || avatarRoot) return;

  const root = new THREE.Group();
  root.name = 'ka-third-person-avatar';
  root.userData.cameraIgnore = true;
  root.userData.isThirdPersonAvatar = true;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x176f88,
    roughness: 0.76,
    metalness: 0.06
  });
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: 0x123448,
    roughness: 0.70,
    metalness: 0.14
  });
  const limbMaterial = new THREE.MeshStandardMaterial({
    color: 0x152836,
    roughness: 0.86
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xb88767,
    roughness: 0.92
  });
  const bootMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b141c,
    roughness: 0.88
  });

  const hips = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.26, 0.32),
    armorMaterial
  );
  hips.position.y = 0.76;

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.30, 0.36, 0.74, 8),
    bodyMaterial
  );
  torso.position.y = 1.17;
  torso.scale.z = 0.72;

  const vest = new THREE.Mesh(
    new THREE.BoxGeometry(0.61, 0.48, 0.28),
    armorMaterial
  );
  vest.position.set(0, 1.18, -0.025);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.11, 0.14, 8),
    skinMaterial
  );
  neck.position.y = 1.56;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    skinMaterial
  );
  head.position.y = 1.76;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    bootMaterial
  );
  hair.position.set(0, 1.80, 0);

  const makeSegment = (material, radius = 0.09) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius, 1, 8),
      material
    );
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return mesh;
  };

  const leftUpperArm = makeSegment(limbMaterial, 0.095);
  const leftForearm = makeSegment(limbMaterial, 0.082);
  const rightUpperArm = makeSegment(limbMaterial, 0.095);
  const rightForearm = makeSegment(limbMaterial, 0.082);
  const leftUpperLeg = makeSegment(limbMaterial, 0.12);
  const leftLowerLeg = makeSegment(limbMaterial, 0.105);
  const rightUpperLeg = makeSegment(limbMaterial, 0.12);
  const rightLowerLeg = makeSegment(limbMaterial, 0.105);

  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.092, 10, 8),
    skinMaterial
  );
  const rightHand = leftHand.clone();
  const leftBoot = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.16, 0.38),
    bootMaterial
  );
  const rightBoot = leftBoot.clone();

  const weaponMount = new THREE.Group();
  weaponMount.name = 'ka-third-person-weapon-mount';
  weaponMount.userData.cameraIgnore = true;

  [
    hips,
    torso,
    vest,
    neck,
    head,
    hair,
    leftUpperArm,
    leftForearm,
    rightUpperArm,
    rightForearm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    leftHand,
    rightHand,
    leftBoot,
    rightBoot,
    weaponMount
  ].forEach((object) => {
    object.userData.cameraIgnore = true;
    object.userData.isThirdPersonAvatar = true;
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = false;
    }
    root.add(object);
  });

  avatarParts = {
    hips,
    torso,
    vest,
    neck,
    head,
    hair,
    leftUpperArm,
    leftForearm,
    rightUpperArm,
    rightForearm,
    leftUpperLeg,
    leftLowerLeg,
    rightUpperLeg,
    rightLowerLeg,
    leftHand,
    rightHand,
    leftBoot,
    rightBoot,
    weaponMount
  };

  root.visible = false;
  refs.scene.add(root);
  avatarRoot = root;
}

function setSegmentBetween(mesh, start, end) {
  if (!mesh) return;
  avatarPointA.copy(start);
  avatarPointB.copy(end);
  avatarPointC.copy(avatarPointB).sub(avatarPointA);
  const length = avatarPointC.length();
  if (length <= 0.0001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.copy(avatarPointA).add(avatarPointB).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(avatarUp, avatarPointC.normalize());
  mesh.scale.set(1, length, 1);
}

function clearThirdPersonWeaponVisual() {
  if (thirdPersonWeaponVisual?.parent) {
    thirdPersonWeaponVisual.parent.remove(thirdPersonWeaponVisual);
  }
  thirdPersonWeaponVisual = null;
  thirdPersonMuzzleFlash = null;
  thirdPersonWeaponIdentity = '';
  thirdPersonWeaponFamily = 'PISTOL';
  weaponSwitchProgress = 1;
}

function ensureThirdPersonTracer() {
  if (thirdPersonTracer || !refs?.scene) return thirdPersonTracer;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3()
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0xffd36a,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    toneMapped: false
  });
  material.userData.kaIgnoreAvatarFade = true;
  const line = new THREE.Line(geometry, material);
  line.name = 'ka-third-person-tracer';
  line.userData.cameraIgnore = true;
  line.frustumCulled = false;
  line.visible = false;
  refs.scene.add(line);
  thirdPersonTracer = line;
  return line;
}

function setAvatarOpacity(nextOpacity) {
  const opacity = THREE.MathUtils.clamp(Number(nextOpacity) || 0, 0, 1);
  avatarOpacity = opacity;
  if (!avatarRoot) return;

  avatarRoot.traverse((child) => {
    if (!child?.isMesh) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      if (!material || material.userData?.kaIgnoreAvatarFade === true) return;
      material.userData = material.userData || {};
      if (material.userData.kaBaseOpacity === undefined) {
        material.userData.kaBaseOpacity = Number.isFinite(Number(material.opacity))
          ? Number(material.opacity)
          : 1;
        material.userData.kaBaseTransparent = material.transparent === true;
        material.userData.kaBaseDepthWrite = material.depthWrite !== false;
      }
      material.opacity = material.userData.kaBaseOpacity * opacity;
      material.transparent = material.userData.kaBaseTransparent || opacity < 0.995;
      material.depthWrite = material.userData.kaBaseDepthWrite && opacity > 0.24;
      material.needsUpdate = true;
    });
  });
}

function playAdsPresentationTransition() {
  const overlay = document.getElementById('ka-camera-ads-transition');
  if (!overlay) return;
  overlay.getAnimations?.().forEach((animation) => animation.cancel());
  if (typeof overlay.animate === 'function') {
    overlay.animate(
      [
        { opacity: 0 },
        { opacity: 0.20, offset: 0.42 },
        { opacity: 0 }
      ],
      {
        duration: 145,
        easing: 'ease-out'
      }
    );
  }
}

function weaponFamilyForPresentation(weapon) {
  return normalizeThirdPersonWeaponFamily(
    weapon?.meshGroup?.userData?.weaponFamily
    || weapon?.key
    || weapon?.type
    || weapon?.name
  );
}

function expandVisibleWeaponBounds(root) {
  avatarBox.makeEmpty();
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (!child?.isMesh || child.visible === false || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;
    avatarBoxPart.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    avatarBox.union(avatarBoxPart);
  });

  return avatarBox;
}

function syncThirdPersonWeaponVisual() {
  if (!avatarParts?.weaponMount) return null;
  const weapon = refs?.getActiveWeapon?.();
  const source = weapon?.meshGroup;
  if (!source) {
    clearThirdPersonWeaponVisual();
    return null;
  }

  const family = weaponFamilyForPresentation(weapon);
  const muzzleMeta = source.userData?.thirdPersonMuzzle || {
    x: 0,
    y: 0.03,
    z: -getThirdPersonWeaponProfile(family).targetLength * 0.5
  };
  const muzzleSize = THREE.MathUtils.clamp(
    Number(source.userData?.thirdPersonMuzzleSize) || 0.16,
    0.08,
    0.34
  );
  const identity = `${weapon?.key || family}:${source.uuid}`;
  if (
    thirdPersonWeaponVisual
    && thirdPersonWeaponIdentity === identity
  ) {
    thirdPersonWeaponVisual.visible = true;
    return thirdPersonWeaponVisual;
  }

  clearThirdPersonWeaponVisual();

  const clonedSource = source.clone(true);
  clonedSource.position.set(0, 0, 0);
  clonedSource.rotation.set(0, 0, 0);
  clonedSource.scale.set(1, 1, 1);

  clonedSource.traverse((child) => {
    child.userData = {
      ...(child.userData || {}),
      cameraIgnore: true,
      isThirdPersonAvatar: true,
      isThirdPersonWeapon: true
    };

    const name = String(child.name || '').toLowerCase();
    if (
      child.userData?.isProceduralHand
      || name.includes('hand')
      || name === 'muzzleflashmesh'
      || name.includes('ejected_shell')
      || name.includes('reload_shell')
      || name.includes('muzzle_flash')
    ) {
      child.visible = false;
      return;
    }

    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material?.clone?.() || material)
        : (child.material?.clone?.() || child.material);
      child.castShadow = true;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });

  const normalized = new THREE.Group();
  normalized.name = `ka-third-person-${family.toLowerCase()}-visual`;
  normalized.userData.cameraIgnore = true;
  normalized.userData.isThirdPersonWeapon = true;
  normalized.add(clonedSource);

  const bounds = expandVisibleWeaponBounds(normalized);
  const profile = getThirdPersonWeaponProfile(family);
  avatarBoxCenter.set(0, 0, 0);
  if (!bounds.isEmpty()) {
    bounds.getSize(avatarBoxSize);
    bounds.getCenter(avatarBoxCenter);
    clonedSource.position.sub(avatarBoxCenter);
    const sourceLength = Math.max(0.001, avatarBoxSize.z);
    normalized.scale.setScalar(
      THREE.MathUtils.clamp(profile.targetLength / sourceLength, 0.42, 2.8)
    );
  }

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: weapon?.isUpgraded ? 0xff66ff : 0xffc24d,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  flashMaterial.userData.kaIgnoreAvatarFade = true;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(muzzleSize, muzzleSize),
    flashMaterial
  );
  flash.name = 'ka-third-person-muzzle-flash';
  flash.userData.cameraIgnore = true;
  flash.userData.isThirdPersonWeapon = true;
  flash.position.set(
    Number(muzzleMeta.x) - avatarBoxCenter.x,
    Number(muzzleMeta.y) - avatarBoxCenter.y,
    Number(muzzleMeta.z) - avatarBoxCenter.z
  );
  flash.rotation.y = Math.PI;
  flash.visible = false;
  normalized.add(flash);

  avatarParts.weaponMount.add(normalized);
  thirdPersonWeaponVisual = normalized;
  thirdPersonMuzzleFlash = flash;
  thirdPersonWeaponIdentity = identity;
  thirdPersonWeaponFamily = family;
  thirdPersonShotSerial = Number(weapon?.presentationShotSerial) || 0;
  thirdPersonShotAge = Infinity;
  thirdPersonTracerAge = Infinity;
  pendingThirdPersonTracer = false;
  weaponSwitchProgress = 0;
  ensureThirdPersonTracer();
  return normalized;
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
  if (!refs?.player?.alive || refs.player.isDowned || refs.player.isSpectating) {
    return CAMERA_MODE_FIRST;
  }
  if (shouldUseFirstPersonAds({
    preferredMode: settings.mode,
    isADS: refs.player.isADS === true
  })) {
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
  const firstPersonAds = shouldUseFirstPersonAds({
    preferredMode: settings.mode,
    isADS: refs?.player?.isADS === true
  });
  root.dataset.kaCameraAdsPresentation = firstPersonAds
    ? 'first-person'
    : 'inactive';
  root.dataset.kaThirdPersonWeapon = thirdPersonWeaponFamily;
  root.dataset.kaThirdPersonTracer = thirdPersonTracer?.visible === true
    ? 'active'
    : 'idle';
  root.dataset.kaThirdPersonAvatarOpacity = avatarOpacity.toFixed(2);
  const indicator = document.getElementById('ka-camera-mode-indicator');
  if (indicator) {
    indicator.textContent = firstPersonAds
      ? 'FIRST PERSON ADS · TPP RETURNS ON RELEASE'
      : (mode === CAMERA_MODE_THIRD
        ? `THIRD PERSON · ${settings.shoulder.toUpperCase()} SHOULDER`
        : 'FIRST PERSON');
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
  if (!document.getElementById('ka-camera-ads-transition')) {
    const transition = document.createElement('div');
    transition.id = 'ka-camera-ads-transition';
    transition.setAttribute('aria-hidden', 'true');
    document.body.append(transition);
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
  const weapon = refs?.getActiveWeapon?.();
  const horizontalSpeed = Math.hypot(
    Number(player.vel?.x) || 0,
    Number(player.vel?.z) || 0
  );
  const moving = horizontalSpeed > 0.25 && player.onGround;
  gaitPhase += moving
    ? dt * Math.min(15, 5 + horizontalSpeed * 0.7)
    : dt * 2;

  syncThirdPersonWeaponVisual();

  const shotSerial = Number(weapon?.presentationShotSerial) || 0;
  if (shotSerial !== thirdPersonShotSerial) {
    thirdPersonShotSerial = shotSerial;
    thirdPersonShotAge = 0;
    thirdPersonTracerAge = 0;
    pendingThirdPersonTracer = true;
    thirdPersonShotDirection.set(
      Number(weapon?.presentationShotDirection?.x) || 0,
      Number(weapon?.presentationShotDirection?.y) || 0,
      Number(weapon?.presentationShotDirection?.z) || -1
    );
    if (thirdPersonShotDirection.lengthSq() < 0.000001) {
      thirdPersonShotDirection.set(0, 0, -1);
    } else {
      thirdPersonShotDirection.normalize();
    }
  } else {
    thirdPersonShotAge += Math.max(0, Number(dt) || 0);
    thirdPersonTracerAge += Math.max(0, Number(dt) || 0);
  }
  weaponSwitchProgress = Math.min(
    1,
    weaponSwitchProgress + Math.max(0, Number(dt) || 0) / 0.16
  );
  const firePulse = computeWeaponFirePulse(thirdPersonShotAge, 0.12);

  const reloadDuration = Math.max(
    0.001,
    Number(weapon?.reloadDuration || weapon?.RELOAD_DUR || 1)
  );
  const reloadProgress = weapon?.reloading
    ? THREE.MathUtils.clamp(
      Number(weapon?.reloadT || 0) / reloadDuration,
      0,
      1
    )
    : 0;

  const pose = computeThirdPersonAvatarPose({
    weaponFamily: weaponFamilyForPresentation(weapon),
    pitch: player.pitch,
    horizontalSpeed,
    onGround: player.onGround,
    sprinting: player.isSprinting === true && !player.isADS,
    gaitPhase,
    reloading: weapon?.reloading === true,
    reloadProgress,
    firePulse,
    switchProgress: weaponSwitchProgress
  });

  avatarRoot.position.set(
    player.pos.x,
    player.pos.y - 1.75,
    player.pos.z
  );
  avatarRoot.rotation.y = player.yaw;

  avatarParts.hips.rotation.x = pose.torso.x * 0.45;
  avatarParts.torso.position.y = 1.17 + pose.torso.y;
  avatarParts.torso.rotation.x = pose.torso.x;
  avatarParts.torso.rotation.z = pose.torso.z;
  avatarParts.vest.position.y = 1.18 + pose.torso.y;
  avatarParts.vest.rotation.x = pose.torso.x;
  avatarParts.vest.rotation.z = pose.torso.z;
  avatarParts.head.rotation.x = pose.headPitch;
  avatarParts.hair.rotation.x = pose.headPitch;

  avatarParts.weaponMount.position.set(
    pose.weapon.position.x,
    pose.weapon.position.y,
    pose.weapon.position.z
  );
  avatarParts.weaponMount.rotation.set(
    pose.weapon.rotation.x,
    pose.weapon.rotation.y,
    pose.weapon.rotation.z
  );
  if (thirdPersonWeaponVisual) {
    thirdPersonWeaponVisual.visible = true;
  }
  if (thirdPersonMuzzleFlash) {
    thirdPersonMuzzleFlash.visible = firePulse > 0.025;
    const flashScale = 0.82 + firePulse * 0.88;
    thirdPersonMuzzleFlash.scale.setScalar(flashScale);
    thirdPersonMuzzleFlash.rotation.z += dt * 18;
    if (thirdPersonMuzzleFlash.material) {
      thirdPersonMuzzleFlash.material.opacity = 0.30 + firePulse * 0.66;
    }
  }

  const rightShoulder = avatarPointA.set(
    pose.rightArm.shoulder.x,
    pose.rightArm.shoulder.y,
    pose.rightArm.shoulder.z
  ).clone();
  const rightElbow = avatarPointB.set(
    pose.rightArm.elbow.x,
    pose.rightArm.elbow.y,
    pose.rightArm.elbow.z
  ).clone();
  const rightHand = avatarPointC.set(
    pose.rightArm.hand.x,
    pose.rightArm.hand.y,
    pose.rightArm.hand.z
  ).clone();

  const leftShoulder = avatarPointA.set(
    pose.leftArm.shoulder.x,
    pose.leftArm.shoulder.y,
    pose.leftArm.shoulder.z
  ).clone();
  const leftElbow = avatarPointB.set(
    pose.leftArm.elbow.x,
    pose.leftArm.elbow.y,
    pose.leftArm.elbow.z
  ).clone();
  const leftHand = avatarPointD.set(
    pose.leftArm.hand.x,
    pose.leftArm.hand.y,
    pose.leftArm.hand.z
  ).clone();

  setSegmentBetween(
    avatarParts.rightUpperArm,
    rightShoulder,
    rightElbow
  );
  setSegmentBetween(
    avatarParts.rightForearm,
    rightElbow,
    rightHand
  );
  setSegmentBetween(
    avatarParts.leftUpperArm,
    leftShoulder,
    leftElbow
  );
  setSegmentBetween(
    avatarParts.leftForearm,
    leftElbow,
    leftHand
  );
  avatarParts.rightHand.position.copy(rightHand);
  avatarParts.leftHand.position.copy(leftHand);

  const leftHip = new THREE.Vector3(-0.18, 0.78, 0);
  const rightHip = new THREE.Vector3(0.18, 0.78, 0);
  const leftKnee = new THREE.Vector3(
    -0.18,
    0.42,
    -Math.sin(pose.legs.left) * 0.15
  );
  const rightKnee = new THREE.Vector3(
    0.18,
    0.42,
    -Math.sin(pose.legs.right) * 0.15
  );
  const leftFoot = new THREE.Vector3(
    -0.18,
    0.08,
    -Math.sin(pose.legs.left) * 0.27
  );
  const rightFoot = new THREE.Vector3(
    0.18,
    0.08,
    -Math.sin(pose.legs.right) * 0.27
  );

  setSegmentBetween(
    avatarParts.leftUpperLeg,
    leftHip,
    leftKnee
  );
  setSegmentBetween(
    avatarParts.leftLowerLeg,
    leftKnee,
    leftFoot
  );
  setSegmentBetween(
    avatarParts.rightUpperLeg,
    rightHip,
    rightKnee
  );
  setSegmentBetween(
    avatarParts.rightLowerLeg,
    rightKnee,
    rightFoot
  );

  avatarParts.leftBoot.position.copy(leftFoot);
  avatarParts.leftBoot.position.y = 0.04;
  avatarParts.leftBoot.position.z -= 0.08;
  avatarParts.rightBoot.position.copy(rightFoot);
  avatarParts.rightBoot.position.y = 0.04;
  avatarParts.rightBoot.position.z -= 0.08;

  if (thirdPersonMuzzleFlash && thirdPersonTracer) {
    avatarRoot.updateMatrixWorld(true);
    if (pendingThirdPersonTracer) {
      thirdPersonMuzzleFlash.getWorldPosition(thirdPersonMuzzleWorld);
      thirdPersonTracerEnd.copy(thirdPersonMuzzleWorld)
        .addScaledVector(thirdPersonShotDirection, 7.5);
      thirdPersonTracer.geometry.setFromPoints([
        thirdPersonMuzzleWorld,
        thirdPersonTracerEnd
      ]);
      thirdPersonTracer.visible = true;
      pendingThirdPersonTracer = false;
    }
    if (thirdPersonTracer.visible) {
      const tracerLife = Math.max(0, 1 - thirdPersonTracerAge / 0.075);
      thirdPersonTracer.material.opacity = tracerLife * 0.82;
      if (tracerLife <= 0) thirdPersonTracer.visible = false;
    }
  }
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
  clearThirdPersonWeaponVisual();
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
  const firstPersonAds = shouldUseFirstPersonAds({
    preferredMode: settings.mode,
    isADS: player.isADS === true
  });
  if (firstPersonAds !== firstPersonAdsTransitionActive) {
    firstPersonAdsTransitionActive = firstPersonAds;
    playAdsPresentationTransition();
  }
  const mode = effectiveMode();
  const activeGameplay = lastContext.gameState === 'playing' && player.alive === true;

  if (!activeGameplay || player.isDowned || player.isSpectating) {
    if (avatarRoot) avatarRoot.visible = false;
    if (thirdPersonTracer) thirdPersonTracer.visible = false;
    setAvatarOpacity(1);
    setWeaponVisible(false);
    publishDiagnostics(mode);
    return;
  }

  if (mode === CAMERA_MODE_FIRST) {
    if (avatarRoot) avatarRoot.visible = false;
    if (thirdPersonWeaponVisual) thirdPersonWeaponVisual.visible = false;
    if (thirdPersonTracer) thirdPersonTracer.visible = false;
    setAvatarOpacity(1);
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
  setAvatarOpacity(computeThirdPersonOcclusionOpacity({
    cameraDistance: refs.camera.position.distanceTo(player.pos)
  }));
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
    syncThirdPersonWeaponVisual();
    if (avatarRoot) avatarRoot.visible = true;
    if (thirdPersonWeaponVisual) thirdPersonWeaponVisual.visible = true;
    setWeaponVisible(false);
  } else {
    if (avatarRoot) avatarRoot.visible = false;
    if (thirdPersonWeaponVisual) thirdPersonWeaponVisual.visible = false;
    setWeaponVisible(true);
  }
}

export function endCameraPresentation() {
  if (avatarRoot) avatarRoot.visible = false;
  if (thirdPersonTracer) thirdPersonTracer.visible = false;
  setAvatarOpacity(1);
  clearThirdPersonWeaponVisual();
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
    adsPresentation: shouldUseFirstPersonAds({
      preferredMode: settings.mode,
      isADS: refs?.player?.isADS === true
    }) ? 'first-person' : 'inactive',
    thirdPersonWeaponFamily,
    thirdPersonWeaponVisible: thirdPersonWeaponVisual?.visible === true,
    avatarVisible: avatarRoot?.visible === true,
    avatarOpacity: Math.round(avatarOpacity * 100) / 100,
    tracerVisible: thirdPersonTracer?.visible === true,
    weaponSwitchProgress: Math.round(weaponSwitchProgress * 100) / 100,
    firePulse: Math.round(computeWeaponFirePulse(thirdPersonShotAge, 0.12) * 100) / 100
  });
}

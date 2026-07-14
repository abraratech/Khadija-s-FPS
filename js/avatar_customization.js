import * as THREE from 'three';
import { scene } from './map.js';
import {
  AVATAR_OPTIONS,
  AVATAR_PROFILE_KEY,
  DEFAULT_AVATAR_PROFILE,
  avatarProfileFingerprint,
  getAvatarOption,
  getAvatarPalette,
  normalizeAvatarProfile,
  parseAvatarProfile,
  randomizeAvatarProfile,
  serializeAvatarProfile,
} from './avatar_customization_core.js';
import {
  SURVIVOR_OPERATOR_PATCH,
  applyOperatorHeadwear,
  applyOperatorPalette,
  createOperatorPreviewRig,
} from './actors/survivor_operator.js';

const root = document.documentElement;
let savedProfile = loadProfile();
let draftProfile = savedProfile;
let turnDegrees = -12;
let applyTimer = null;
let previewRuntime = null;

function loadProfile() {
  try {
    return parseAvatarProfile(localStorage.getItem(AVATAR_PROFILE_KEY));
  } catch {
    return DEFAULT_AVATAR_PROFILE;
  }
}

function persistProfile(profile) {
  const normalized = normalizeAvatarProfile(profile);
  try {
    localStorage.setItem(AVATAR_PROFILE_KEY, serializeAvatarProfile(normalized));
  } catch {
    return { ok: false, profile: normalized };
  }
  return { ok: true, profile: normalized };
}

function paletteCss(profile) {
  const palette = getAvatarPalette(profile);
  return {
    '--avatar-skin': palette.skin,
    '--avatar-suit': palette.suit,
    '--avatar-armor': palette.armor,
    '--avatar-accent': palette.accent,
    '--avatar-hair': palette.hair,
  };
}

function setStatus(message, state = 'saved') {
  const status = document.getElementById('ka-avatar-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function applyCssVariables(element, profile) {
  if (!element) return;
  Object.entries(paletteCss(profile)).forEach(([key, value]) => element.style.setProperty(key, value));
  element.dataset.hairStyle = profile.hairStyle;
}

function updateLabel(field, value) {
  const label = document.getElementById(`ka-avatar-${field}-label`);
  if (label) label.textContent = getAvatarOption(field, value)?.label || String(value || '');
}

function updateSelectionUi() {
  const preview = document.getElementById('ka-avatar-preview');
  applyCssVariables(preview, draftProfile);
  applyCssVariables(root, draftProfile);
  if (preview) preview.style.setProperty('--avatar-turn', `${turnDegrees}deg`);
  applyProfileToPreview(draftProfile);

  Object.keys(AVATAR_OPTIONS).forEach((field) => {
    updateLabel(field, draftProfile[field]);
    document.querySelectorAll(`[data-avatar-field="${field}"]`).forEach((button) => {
      const selected = button.dataset.avatarValue === draftProfile[field];
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  });

  const dirty = avatarProfileFingerprint(draftProfile) !== avatarProfileFingerprint(savedProfile);
  setStatus(
    dirty ? 'UNSAVED APPEARANCE CHANGES' : 'SAVED LOCALLY · INCLUDED IN CLOUD PROFILE SYNC',
    dirty ? 'dirty' : 'saved',
  );
}

function createChoice(field, option) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ka-avatar-choice${option.color ? ' swatch' : ''}`;
  button.dataset.avatarField = field;
  button.dataset.avatarValue = option.id;
  button.setAttribute('aria-label', `${option.label} ${field}`);
  button.title = option.label;
  if (option.color) button.style.setProperty('--swatch', option.color);
  else button.textContent = option.label.toUpperCase();
  button.addEventListener('click', () => {
    draftProfile = normalizeAvatarProfile({ ...draftProfile, [field]: option.id });
    updateSelectionUi();
  });
  return button;
}

function buildChoiceRows() {
  Object.entries(AVATAR_OPTIONS).forEach(([field, options]) => {
    const container = document.getElementById(`ka-avatar-${field}-options`);
    if (!container || container.dataset.avatarReady === 'true') return;
    options.forEach((option) => container.append(createChoice(field, option)));
    container.dataset.avatarReady = 'true';
  });
}

function radiansFromDegrees(value) {
  return THREE.MathUtils.degToRad(Number(value) || 0);
}

function setTurn(next) {
  turnDegrees = Number.isFinite(Number(next)) ? Number(next) : 0;
  const preview = document.getElementById('ka-avatar-preview');
  if (preview) preview.style.setProperty('--avatar-turn', `${turnDegrees}deg`);
  if (previewRuntime) previewRuntime.targetRotation = radiansFromDegrees(turnDegrees);
}

function markAvatarObject(object) {
  object.userData = {
    ...(object.userData || {}),
    cameraIgnore: true,
    isThirdPersonAvatar: true,
  };
  if (object.isMesh) {
    object.castShadow = true;
    object.receiveShadow = false;
  }
  return object;
}

function makeFaceDetails({ front = 1, name = 'ka-avatar-face-details' } = {}) {
  const direction = front >= 0 ? 1 : -1;
  const face = new THREE.Group();
  face.name = name;
  markAvatarObject(face);

  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xc7d1cf, roughness: 0.74, flatShading: true });
  const eyeDark = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.82, flatShading: true });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x45272a, roughness: 0.92, flatShading: true });
  const skinDetail = new THREE.MeshStandardMaterial({ color: 0x8c5f49, roughness: 0.94, flatShading: true });
  skinDetail.userData.kaAvatarSkinDetail = true;

  [-0.055, 0.055].forEach((x) => {
    const eye = markAvatarObject(new THREE.Mesh(new THREE.SphereGeometry(0.020, 8, 6), eyeWhite));
    eye.scale.set(1.05, 0.46, 0.22);
    eye.position.set(x, 0.034, direction * 0.180);
    face.add(eye);

    const pupil = markAvatarObject(new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 5), eyeDark));
    pupil.scale.set(1.0, 0.88, 0.36);
    pupil.position.set(x, 0.034, direction * 0.187);
    face.add(pupil);

    const brow = markAvatarObject(new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.007, 0.006), eyeDark));
    brow.position.set(x, 0.069, direction * 0.177);
    brow.rotation.z = x < 0 ? 0.06 : -0.06;
    face.add(brow);
  });

  const nose = markAvatarObject(new THREE.Mesh(new THREE.DodecahedronGeometry(0.023, 0), skinDetail));
  nose.scale.set(0.56, 0.92, 0.54);
  nose.position.set(0, -0.006, direction * 0.181);
  face.add(nose);

  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.032, -0.060, direction * 0.176),
    new THREE.Vector3(0, -0.062, direction * 0.178),
    new THREE.Vector3(0.032, -0.060, direction * 0.176),
  );
  const mouth = markAvatarObject(new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 8, 0.0032, 5, false), mouthMaterial));
  face.add(mouth);

  const chinPlane = markAvatarObject(new THREE.Mesh(new THREE.DodecahedronGeometry(0.022, 0), skinDetail));
  chinPlane.scale.set(1.25, 0.34, 0.18);
  chinPlane.position.set(0, -0.105, direction * 0.145);
  face.add(chinPlane);
  return face;
}

function makePreviewMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.74,
    metalness: options.metalness ?? 0.04,
    flatShading: true,
  });
}

function buildPreviewAvatar() {
  const rig = createOperatorPreviewRig(THREE, {
    faceFactory: ({ front, name }) => makeFaceDetails({ front, name }),
  });
  rig.model.userData.visualPatch = SURVIVOR_OPERATOR_PATCH;
  return rig;
}

function applyProfileToPreview(profileInput = draftProfile) {
  if (!previewRuntime?.avatar) return false;
  const profile = normalizeAvatarProfile(profileInput);
  const palette = getAvatarPalette(profile);
  applyOperatorPalette(THREE, previewRuntime.avatar, palette);
  previewRuntime.avatar.model.traverse((object) => {
    if (object.material?.userData?.kaAvatarSkinDetail && object.material.color?.set) {
      object.material.color.set(palette.skin).multiplyScalar(0.82);
      object.material.needsUpdate = true;
    }
  });
  applyOperatorHeadwear(previewRuntime.avatar, profile.hairStyle, 1);
  return true;
}

function resizePreviewRenderer() {
  if (!previewRuntime) return false;
  const { canvas, renderer, camera } = previewRuntime;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (width < 4 || height < 4) return false;
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  return true;
}

function initializeThreePreview() {
  const stage = document.getElementById('ka-avatar-stage');
  const canvas = document.getElementById('ka-avatar-canvas');
  if (!stage || !canvas || previewRuntime) return;
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const previewScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 1.18, 4.15);
    camera.lookAt(0, 1.00, 0);

    previewScene.add(new THREE.HemisphereLight(0xc6efff, 0x07111a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(2.8, 4.5, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    previewScene.add(key);
    const cyanRim = new THREE.PointLight(0x10d8ff, 15, 8, 2);
    cyanRim.position.set(-2.0, 2.2, -1.6);
    previewScene.add(cyanRim);
    const warmFill = new THREE.PointLight(0xffad6a, 7, 7, 2);
    warmFill.position.set(2.2, 1.5, 2.2);
    previewScene.add(warmFill);

    const avatar = buildPreviewAvatar();
    avatar.model.rotation.y = radiansFromDegrees(turnDegrees);
    previewScene.add(avatar.model);

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x07121b, roughness: 0.72, metalness: 0.16, transparent: true, opacity: 0.92 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    previewScene.add(floor);

    previewRuntime = {
      stage,
      canvas,
      renderer,
      scene: previewScene,
      camera,
      avatar,
      currentRotation: radiansFromDegrees(turnDegrees),
      targetRotation: radiansFromDegrees(turnDegrees),
      pointerId: null,
      pointerX: 0,
      resizeObserver: null,
      animationFrame: 0,
      startedAt: performance.now(),
    };

    const onPointerDown = (event) => {
      previewRuntime.pointerId = event.pointerId;
      previewRuntime.pointerX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!previewRuntime || previewRuntime.pointerId !== event.pointerId) return;
      const delta = event.clientX - previewRuntime.pointerX;
      previewRuntime.pointerX = event.clientX;
      setTurn(turnDegrees + delta * 0.55);
    };
    const releasePointer = (event) => {
      if (!previewRuntime || previewRuntime.pointerId !== event.pointerId) return;
      previewRuntime.pointerId = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);

    if (typeof ResizeObserver === 'function') {
      previewRuntime.resizeObserver = new ResizeObserver(resizePreviewRenderer);
      previewRuntime.resizeObserver.observe(stage);
    }

    const renderFrame = (now) => {
      if (!previewRuntime) return;
      previewRuntime.animationFrame = requestAnimationFrame(renderFrame);
      const avatarScreenActive = stage.closest('[data-menu-screen="avatar"]')?.classList.contains('active');
      if (!avatarScreenActive || document.hidden || !resizePreviewRenderer()) return;

      const reducedMotion = root.dataset.reducedMotion === 'on' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const delta = Math.atan2(
        Math.sin(previewRuntime.targetRotation - previewRuntime.currentRotation),
        Math.cos(previewRuntime.targetRotation - previewRuntime.currentRotation),
      );
      previewRuntime.currentRotation += reducedMotion ? delta : delta * 0.16;
      previewRuntime.avatar.model.rotation.y = previewRuntime.currentRotation;

      const elapsed = (now - previewRuntime.startedAt) / 1000;
      previewRuntime.avatar.model.position.y = reducedMotion ? 0 : Math.sin(elapsed * 1.65) * 0.012;
      previewRuntime.avatar.leftArm.rotation.x = reducedMotion ? 0 : Math.sin(elapsed * 1.25) * 0.025;
      previewRuntime.avatar.rightArm.rotation.x = reducedMotion ? 0 : -Math.sin(elapsed * 1.25) * 0.025;
      renderer.render(previewScene, camera);
    };

    stage.dataset.previewEngine = 'webgl';
    applyProfileToPreview(draftProfile);
    previewRuntime.animationFrame = requestAnimationFrame(renderFrame);
    root.dataset.kaAvatarPreview = 'three-dimensional';
  } catch (error) {
    stage.dataset.previewEngine = 'fallback';
    root.dataset.kaAvatarPreview = 'fallback';
    console.warn('[Avatar Studio] WebGL preview unavailable; using lightweight fallback.', error);
  }
}

function disposeThreePreview() {
  if (!previewRuntime) return;
  cancelAnimationFrame(previewRuntime.animationFrame);
  previewRuntime.resizeObserver?.disconnect();
  previewRuntime.scene.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
  previewRuntime.renderer.dispose();
  previewRuntime = null;
}

function cloneMaterialForRole(mesh, role) {
  if (!mesh?.material) return null;
  if (mesh.userData?.kaAvatarMaterialRole === role) return mesh.material;
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!source?.clone) return source || null;
  const material = source.clone();
  material.name = `ka-avatar-${role}`;
  mesh.material = material;
  mesh.userData = { ...(mesh.userData || {}), kaAvatarMaterialRole: role };
  return material;
}

function setMaterialColor(mesh, role, color) {
  const material = cloneMaterialForRole(mesh, role);
  if (!material?.color?.set) return;
  material.color.set(color);
  material.needsUpdate = true;
}

function ensureThirdPersonFaceDetails(avatar, palette) {
  const head = avatar?.getObjectByName?.('ka-avatar-head') || avatar?.children?.[4];
  if (!head?.add) return null;
  let face = head.getObjectByName?.('ka-avatar-face-details') || null;
  if (!face) {
    face = makeFaceDetails({ front: -1 });
    face.scale.setScalar(0.82);
    head.add(face);
  }
  face.traverse((child) => {
    if (child.material?.userData?.kaAvatarSkinDetail && child.material.color?.set) {
      child.material.color.set(palette.skin).multiplyScalar(0.82);
      child.material.needsUpdate = true;
    }
  });
  return face;
}

function applyProfileToThirdPersonAvatar(profileInput = savedProfile) {
  const avatar = scene?.getObjectByName?.('ka-third-person-avatar');
  if (!avatar?.traverse) return false;
  const profile = normalizeAvatarProfile(profileInput);
  const palette = getAvatarPalette(profile);
  ensureThirdPersonFaceDetails(avatar, palette);
  if (avatar.userData?.kaAvatarFingerprint === avatarProfileFingerprint(profile)) return true;

  avatar.traverse((object) => {
    if (!object?.isMesh) return;
    const role = object.userData?.kaAvatarPaletteRole;
    if (!role) return;
    let color = null;
    if (role === 'skin') color = palette.skin;
    else if (role === 'suit') color = palette.suit;
    else if (role === 'suit-dark') color = new THREE.Color(palette.suit).multiplyScalar(0.46);
    else if (role === 'armor') color = palette.armor;
    else if (role === 'accent') color = palette.accent;
    else if (role === 'hair') color = palette.hair;
    else if (role === 'boot' || role === 'glove') color = '#0a1219';
    else if (role === 'utility') color = new THREE.Color(palette.armor).multiplyScalar(0.60);
    if (!color) return;
    const material = cloneMaterialForRole(object, role);
    material?.color?.set?.(color);
    if (role === 'accent' && material?.emissive?.set) material.emissive.set(palette.accent);
    if (material) material.needsUpdate = true;
  });

  applyOperatorHeadwear(avatar, profile.hairStyle, -1);

  avatar.userData = {
    ...(avatar.userData || {}),
    kaAvatarFingerprint: avatarProfileFingerprint(profile),
    visualPatch: SURVIVOR_OPERATOR_PATCH,
  };
  root.dataset.kaAvatarApplied = 'true';
  return true;
}

function saveDraft() {
  const result = persistProfile(draftProfile);
  savedProfile = result.profile;
  draftProfile = savedProfile;
  updateSelectionUi();
  applyProfileToThirdPersonAvatar(savedProfile);
  window.dispatchEvent(new CustomEvent('ka-avatar-profile-change', { detail: { profile: savedProfile } }));
  setStatus(
    result.ok ? 'AVATAR SAVED · CLOUD PROFILE WILL INCLUDE THIS LOOK' : 'AVATAR APPLIED · LOCAL STORAGE UNAVAILABLE',
    result.ok ? 'saved' : 'error',
  );
}

function bindActions() {
  document.getElementById('ka-avatar-turn-left')?.addEventListener('click', () => setTurn(turnDegrees - 22.5));
  document.getElementById('ka-avatar-turn-right')?.addEventListener('click', () => setTurn(turnDegrees + 22.5));
  document.getElementById('ka-avatar-turn-reset')?.addEventListener('click', () => setTurn(-12));
  document.getElementById('ka-avatar-randomize')?.addEventListener('click', () => {
    draftProfile = randomizeAvatarProfile();
    updateSelectionUi();
  });
  document.getElementById('ka-avatar-reset')?.addEventListener('click', () => {
    draftProfile = DEFAULT_AVATAR_PROFILE;
    updateSelectionUi();
  });
  document.getElementById('ka-avatar-save')?.addEventListener('click', saveDraft);
}

function init() {
  if (root.dataset.kaAvatarStudio === 'ready') return;
  root.dataset.kaAvatarStudio = 'ready';
  buildChoiceRows();
  bindActions();
  applyCssVariables(root, savedProfile);
  updateSelectionUi();
  initializeThreePreview();
  applyProfileToThirdPersonAvatar(savedProfile);
  applyTimer = window.setInterval(() => applyProfileToThirdPersonAvatar(savedProfile), 500);
  window.addEventListener('storage', (event) => {
    if (event.key !== AVATAR_PROFILE_KEY) return;
    savedProfile = parseAvatarProfile(event.newValue || '');
    draftProfile = savedProfile;
    updateSelectionUi();
    applyProfileToThirdPersonAvatar(savedProfile);
  });
}

window.KHADIJA_AVATAR = Object.freeze({
  getProfile: () => savedProfile,
  getDraft: () => draftProfile,
  setProfile: (next) => {
    draftProfile = normalizeAvatarProfile(next);
    saveDraft();
    return savedProfile;
  },
  reset: () => {
    draftProfile = DEFAULT_AVATAR_PROFILE;
    saveDraft();
    return savedProfile;
  },
  randomize: () => {
    draftProfile = randomizeAvatarProfile();
    saveDraft();
    return savedProfile;
  },
  applyNow: () => applyProfileToThirdPersonAvatar(savedProfile),
  rotatePreview: (degrees) => {
    setTurn(turnDegrees + Number(degrees || 0));
    return turnDegrees;
  },
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

window.addEventListener('beforeunload', () => {
  if (applyTimer) window.clearInterval(applyTimer);
  disposeThreePreview();
}, { once: true });

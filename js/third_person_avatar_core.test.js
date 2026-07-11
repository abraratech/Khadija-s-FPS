import assert from 'node:assert/strict';
import {
  THIRD_PERSON_ADS_POLICY,
  computeThirdPersonAvatarPose,
  computeThirdPersonOcclusionOpacity,
  computeWeaponFirePulse,
  computeWeaponSwitchBlend,
  getThirdPersonWeaponProfile,
  normalizeThirdPersonWeaponFamily,
  shouldUseFirstPersonAds
} from './third_person_avatar_core.js';

assert.equal(THIRD_PERSON_ADS_POLICY, 'first-person');
assert.equal(normalizeThirdPersonWeaponFamily('rifle_upg'), 'RIFLE');
assert.equal(normalizeThirdPersonWeaponFamily('unknown'), 'PISTOL');
assert.equal(getThirdPersonWeaponProfile('SNIPER').targetLength, 1.34);

assert.equal(
  shouldUseFirstPersonAds({ preferredMode: 'third', isADS: true }),
  true
);
assert.equal(
  shouldUseFirstPersonAds({ preferredMode: 'third', isADS: false }),
  false
);
assert.equal(
  shouldUseFirstPersonAds({ preferredMode: 'first', isADS: true }),
  false
);

{
  const pose = computeThirdPersonAvatarPose({
    weaponFamily: 'RIFLE',
    pitch: 0.3,
    horizontalSpeed: 5,
    onGround: true,
    gaitPhase: Math.PI / 2
  });
  assert.equal(pose.family, 'RIFLE');
  assert.equal(pose.moving, true);
  assert.ok(pose.targetLength > 1);
  assert.ok(pose.rightArm.hand.z < pose.rightArm.shoulder.z);
  assert.ok(pose.leftArm.hand.z < pose.leftArm.shoulder.z);
  assert.ok(pose.weapon.rotation.x > 0);
}

{
  const ready = computeThirdPersonAvatarPose({
    weaponFamily: 'PISTOL',
    sprinting: false
  });
  const sprint = computeThirdPersonAvatarPose({
    weaponFamily: 'PISTOL',
    sprinting: true
  });
  assert.ok(sprint.weapon.position.y < ready.weapon.position.y);
  assert.ok(sprint.weapon.position.z > ready.weapon.position.z);
}

{
  const ready = computeThirdPersonAvatarPose({
    weaponFamily: 'SHOTGUN',
    reloading: false
  });
  const reload = computeThirdPersonAvatarPose({
    weaponFamily: 'SHOTGUN',
    reloading: true,
    reloadProgress: 0.5
  });
  assert.ok(reload.weapon.rotation.z > ready.weapon.rotation.z);
}


{
  assert.equal(computeWeaponFirePulse(0.20, 0.12), 0);
  assert.ok(computeWeaponFirePulse(0.02, 0.12) > 0.5);
  assert.equal(computeWeaponSwitchBlend(0), 0);
  assert.equal(computeWeaponSwitchBlend(1), 1);
  assert.ok(computeWeaponSwitchBlend(0.5) > 0.45);
}

{
  assert.ok(computeThirdPersonOcclusionOpacity({ cameraDistance: 0.75 }) < 0.15);
  assert.ok(computeThirdPersonOcclusionOpacity({ cameraDistance: 1.45 }) > 0.20);
  assert.equal(computeThirdPersonOcclusionOpacity({ cameraDistance: 4 }), 1);
}

{
  const ready = computeThirdPersonAvatarPose({
    weaponFamily: 'RIFLE',
    firePulse: 0,
    switchProgress: 1
  });
  const firing = computeThirdPersonAvatarPose({
    weaponFamily: 'RIFLE',
    firePulse: 1,
    switchProgress: 1
  });
  const switching = computeThirdPersonAvatarPose({
    weaponFamily: 'RIFLE',
    firePulse: 0,
    switchProgress: 0
  });
  assert.ok(firing.weapon.position.z > ready.weapon.position.z);
  assert.ok(firing.weapon.rotation.x > ready.weapon.rotation.x);
  assert.ok(switching.weapon.position.y < ready.weapon.position.y);
  assert.ok(switching.switchBlend < ready.switchBlend);
}

console.log('third_person_avatar_core.test.js: PASS');

import assert from 'node:assert/strict';
import {
  THIRD_PERSON_ADS_POLICY,
  computeThirdPersonAvatarPose,
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

console.log('third_person_avatar_core.test.js: PASS');

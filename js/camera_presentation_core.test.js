import assert from 'node:assert/strict';
import {
  CAMERA_MODE_FIRST,
  CAMERA_MODE_THIRD,
  CAMERA_SHOULDER_LEFT,
  CAMERA_SHOULDER_RIGHT,
  cameraCollisionSmoothingAlpha,
  cameraForwardFromYawPitch,
  cameraSmoothingAlpha,
  computeThirdPersonCameraPose,
  normalizeCameraPresentationSettings,
  resolveCameraCollisionDistance,
  updateCameraCollisionLatch
} from './camera_presentation_core.js';

{
  const settings = normalizeCameraPresentationSettings({
    mode: 'THIRD', shoulder: 'LEFT', distance: 99, smoothing: -4
  });
  assert.equal(settings.mode, CAMERA_MODE_THIRD);
  assert.equal(settings.shoulder, CAMERA_SHOULDER_LEFT);
  assert.equal(settings.distance, 6);
  assert.equal(settings.smoothing, 6);
}

{
  const settings = normalizeCameraPresentationSettings({ mode: 'invalid', shoulder: 'invalid' });
  assert.equal(settings.mode, CAMERA_MODE_FIRST);
  assert.equal(settings.shoulder, CAMERA_SHOULDER_RIGHT);
}

{
  const forward = cameraForwardFromYawPitch(0, 0);
  assert.ok(Math.abs(forward.x) < 1e-9);
  assert.ok(Math.abs(forward.y) < 1e-9);
  assert.ok(Math.abs(forward.z + 1) < 1e-9);
}

{
  const pose = computeThirdPersonCameraPose({
    playerPosition: { x: 2, y: 1.75, z: 3 },
    yaw: 0,
    pitch: 0,
    shoulder: 'right',
    distance: 4.2
  });
  assert.ok(pose.camera.x > 2);
  assert.ok(pose.camera.z > 3);
  assert.equal(pose.resolvedDistance, 4.2);
}

{
  const pose = computeThirdPersonCameraPose({
    playerPosition: { x: 0, y: 1.75, z: 0 },
    yaw: 0,
    shoulder: 'left',
    distance: 5,
    ads: true,
    collisionDistance: 1.4
  });
  assert.ok(pose.camera.x < 0);
  assert.equal(pose.resolvedDistance, 1.4);
  assert.equal(pose.desiredDistance, 2.55);
}

assert.equal(resolveCameraCollisionDistance({ desiredDistance: 4.2, hitDistance: 2, padding: 0.25 }), 1.75);
assert.equal(resolveCameraCollisionDistance({ desiredDistance: 4.2, hitDistance: 9 }), 4.2);
assert.equal(resolveCameraCollisionDistance({ desiredDistance: 4.2, hitDistance: 0.2 }), 0.55);
assert.ok(Math.abs(resolveCameraCollisionDistance({ desiredDistance: 0.92, hitDistance: 0.35, padding: 0.12, minimum: 0 }) - 0.23) < 1e-9);
assert.equal(resolveCameraCollisionDistance({ desiredDistance: 0.92, hitDistance: null, minimum: 0 }), 0.92);

{
  const retract = cameraCollisionSmoothingAlpha(1 / 60, 4.2, 1.2);
  const release = cameraCollisionSmoothingAlpha(1 / 60, 1.2, 4.2);
  assert.ok(retract > release);
}

{
  const alpha = cameraSmoothingAlpha(1 / 60, 12);
  assert.ok(alpha > 0 && alpha < 1);
  assert.equal(cameraSmoothingAlpha(0, 12), 0);
}

{
  const initial = updateCameraCollisionLatch({
    currentTarget: null,
    candidateTarget: 4.2,
    desiredDistance: 4.2,
    blocked: false,
    dt: 1 / 60
  });
  assert.equal(initial.targetDistance, 4.2);
}

{
  const blocked = updateCameraCollisionLatch({
    currentTarget: 4.2,
    candidateTarget: 1.35,
    desiredDistance: 4.2,
    blocked: true,
    dt: 1 / 60
  });
  assert.equal(blocked.targetDistance, 1.35);
  assert.equal(blocked.clearSeconds, 0);

  const chatterClear = updateCameraCollisionLatch({
    currentTarget: blocked.targetDistance,
    candidateTarget: 4.2,
    desiredDistance: 4.2,
    blocked: false,
    clearSeconds: blocked.clearSeconds,
    dt: 0.05,
    releaseDelay: 0.2
  });
  assert.equal(chatterClear.targetDistance, 1.35);
  assert.equal(chatterClear.releaseReady, false);

  const fartherBlockedHit = updateCameraCollisionLatch({
    currentTarget: chatterClear.targetDistance,
    candidateTarget: 3.9,
    desiredDistance: 4.2,
    blocked: true,
    clearSeconds: chatterClear.clearSeconds,
    dt: 1 / 60
  });
  assert.equal(fartherBlockedHit.targetDistance, 1.35);

  const released = updateCameraCollisionLatch({
    currentTarget: chatterClear.targetDistance,
    candidateTarget: 4.2,
    desiredDistance: 4.2,
    blocked: false,
    clearSeconds: 0.17,
    dt: 0.05,
    releaseDelay: 0.2
  });
  assert.equal(released.targetDistance, 4.2);
  assert.equal(released.releaseReady, true);
}

{
  const closer = updateCameraCollisionLatch({
    currentTarget: 1.4,
    candidateTarget: 0.8,
    desiredDistance: 4.2,
    blocked: true,
    dt: 1 / 60,
    deadband: 0.1
  });
  assert.equal(closer.targetDistance, 0.8);
}

console.log('camera_presentation_core.test.js: PASS');

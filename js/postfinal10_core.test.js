import assert from 'node:assert/strict';
import {
  POST_FINAL10_PATCH,
  POST_FINAL10_PRODUCT_VERSION,
  POST_FINAL10_SOURCE_BASELINE_SHA,
  classifyPostFinal10Network,
  createPostFinal10GovernorState,
  derivePostFinal10DeviceClass,
  evaluatePostFinal10ReleaseCertification,
  normalizePostFinal10Accessibility,
  postFinal10RetryDelay,
  updatePostFinal10Governor
} from './postfinal10_core.js';

const accessibility = normalizePostFinal10Accessibility({
  textScale: 200,
  captionScale: 40,
  colorVision: 'deuteranopia',
  focusAssist: 'off',
  damageFlash: 'low'
}, {
  prefersReducedMotion: true,
  prefersHighContrast: true
});
assert.equal(accessibility.schema, 2);
assert.equal(accessibility.textScale, 140);
assert.equal(accessibility.captionScale, 90);
assert.equal(accessibility.colorVision, 'deuteranopia');
assert.equal(accessibility.focusAssist, false);
assert.equal(accessibility.reducedMotion, true);
assert.equal(accessibility.highContrast, true);

assert.equal(derivePostFinal10DeviceClass({ mobile: true, hardwareConcurrency: 8 }).tier, 'LOW');
assert.equal(derivePostFinal10DeviceClass({ hardwareConcurrency: 12, deviceMemory: 16 }).tier, 'HIGH');
assert.equal(classifyPostFinal10Network({ online: false }).status, 'OFFLINE');
assert.equal(classifyPostFinal10Network({ online: true, rttMs: 500 }).status, 'DEGRADED');
assert.ok(postFinal10RetryDelay(3, { online: true, rttMs: 500 }) > postFinal10RetryDelay(0, { online: true, rttMs: 500 }));

let governor = createPostFinal10GovernorState({
  device: { hardwareConcurrency: 8, deviceMemory: 8 },
  now: 1
});
for (let i = 0; i < 30; i += 1) {
  governor = updatePostFinal10Governor(governor, {
    fps: 20,
    frameMs: 55,
    dt: 0.1,
    now: 2 + i / 10,
    network: { online: true }
  }).state;
}
assert.equal(governor.profile, 'CONSERVE');
assert.ok(governor.particleBudget < 0.5);

let suspended = updatePostFinal10Governor(governor, {
  fps: 60,
  frameMs: 16,
  dt: 0.1,
  hidden: true,
  network: { online: true }
}).state;
assert.equal(suspended.profile, 'SUSPENDED');

const certification = evaluatePostFinal10ReleaseCertification({
  frontend: {
    version1Certification: {
      patch: POST_FINAL10_PATCH,
      productVersion: POST_FINAL10_PRODUCT_VERSION,
      certification: { status: 'CERTIFIED' }
    }
  },
  worker: {
    version1Certification: {
      patch: POST_FINAL10_PATCH,
      productVersion: POST_FINAL10_PRODUCT_VERSION,
      sourceBaselineSha: POST_FINAL10_SOURCE_BASELINE_SHA,
      certifiedFrontendBaselineSha: '5511d393d7249b5487affa3616716ccb64593e99',
      certification: { status: 'CERTIFIED' }
    }
  }
});
assert.equal(certification.ready, true);

console.log('POST-FINAL.10 stabilization core tests passed');

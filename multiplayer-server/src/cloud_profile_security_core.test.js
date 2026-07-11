import assert from 'node:assert/strict';
import {
  CLOUD_SECURITY_PATCH,
  appendActivity,
  cleanDeviceName,
  cleanRecoveryCode,
  formatRecoveryCode,
  normalizeActivity,
  normalizeDevices,
  normalizeHistory,
  publicDevices,
  renameDevice,
  revokeDevice,
  revokeOtherDevices,
  touchDevice,
  upsertDevice
} from './cloud_profile_security_core.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
let devices = upsertDevice([], {
  deviceId: 'device-primary-12345678', tokenHash: hashA, name: 'Main <PC>', region: 'us', now: 1000
});
devices = upsertDevice(devices, {
  deviceId: 'device-laptop-12345678', tokenHash: hashB, name: 'Laptop', region: 'ca', now: 2000
});
assert.equal(CLOUD_SECURITY_PATCH, 'm4-cloud-account-security-r1');
assert.equal(devices.length, 2);
assert.equal(cleanDeviceName('  Main <PC>  '), 'Main PC');
assert.equal(publicDevices(devices, 'device-primary-12345678').find((entry) => entry.current).name, 'Main PC');
const touched = touchDevice(devices, hashA, { region: 'pk', now: 3000 });
assert.equal(touched.found, true);
assert.equal(touched.device.region, 'PK');
const renamed = renameDevice(touched.devices, 'device-primary-12345678', 'Desktop');
assert.equal(renamed.changed, true);
assert.equal(renamed.devices.find((entry) => entry.deviceId === 'device-primary-12345678').name, 'Desktop');
assert.equal(revokeDevice(renamed.devices, 'device-laptop-12345678').devices.length, 1);
assert.equal(revokeOtherDevices(renamed.devices, 'device-primary-12345678').devices.length, 1);
assert.equal(normalizeDevices([{ deviceId: 'bad', tokenHash: hashA }]).length, 0);
assert.equal(cleanRecoveryCode('ABCD-EFGH-IJKL-MNPQ'), 'ABCDEFGHIJKLMNPQ');
assert.equal(formatRecoveryCode('ABCDEFGHIJKLMNPQ'), 'ABCD-EFGH-IJKL-MNPQ');
const activity = appendActivity([], { kind: 'sync-conflict', deviceId: 'device-primary-12345678', region: 'us', detail: '<merged>' }, 5000);
assert.equal(activity[0].kind, 'SYNC-CONFLICT');
assert.equal(activity[0].detail, 'merged');
assert.equal(normalizeActivity(activity).length, 1);
assert.equal(normalizeHistory([{ revision: 2, chunks: 1 }, { revision: 1, chunks: 1 }])[0].revision, 2);
console.log('Cloud profile security core tests: PASS');

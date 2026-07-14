import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../avatar_customization.js', import.meta.url), 'utf8');

assert.equal((index.match(/id="ka-avatar-canvas"/g) || []).length, 1, '3D preview canvas must exist once');
assert.equal((index.match(/id="ka-avatar-stage"/g) || []).length, 1, 'Avatar stage must exist once');
assert.match(index, /data-preview-engine="fallback"/, 'Lightweight fallback must remain available');
assert.match(index, /ka-avatar-eye left/, 'Fallback face must include a left eye');
assert.match(index, /ka-avatar-eye right/, 'Fallback face must include a right eye');
assert.match(index, /ka-avatar-nose/, 'Fallback face must include a nose');
assert.match(index, /ka-avatar-smile/, 'Fallback face must include a smile');
assert.match(index, /\.ka-avatar-stage\[data-preview-engine="webgl"\] \.ka-avatar-canvas/, 'WebGL activation styling missing');

assert.match(runtime, /import \* as THREE from 'three'/, 'Avatar runtime must use Three.js');
assert.match(runtime, /new THREE\.WebGLRenderer/, 'True 3D renderer missing');
assert.match(runtime, /buildPreviewAvatar/, 'Procedural 3D preview model missing');
assert.match(runtime, /makeFaceDetails/, 'Facial-detail builder missing');
assert.match(runtime, /ensureThirdPersonFaceDetails/, 'In-game facial-detail application missing');
assert.match(runtime, /pointerdown/, 'Drag rotation input missing');
assert.match(runtime, /setPointerCapture/, 'Pointer capture missing');
assert.match(runtime, /targetRotation/, 'Smooth turntable target missing');
assert.match(runtime, /Math\.atan2\(/, 'Shortest-path yaw interpolation missing');
assert.match(runtime, /kaAvatarPreview = 'three-dimensional'/, '3D preview diagnostic missing');
assert.doesNotMatch(runtime, /scaleX\s*\(/, 'Preview must not fake rotation with a flat horizontal flip');

console.log('Avatar Studio facial detail and 3D turntable contract: PASS');

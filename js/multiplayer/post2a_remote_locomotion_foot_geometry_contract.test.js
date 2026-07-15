import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./remote_players.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('if (child?.isMesh === true) child.visible = false;'), 'original boot meshes must be hidden');
assert(source.includes('remote-boot-sole-${index}'), 'compact boots require attached soles');
assert(!source.includes('remote-boot-cap-${index}'), 'detached light boot cap must be removed');
assert(source.includes('velocityX: state.velocity?.x') && source.includes('velocityZ: state.velocity?.z'), 'gait must consume network velocity');
assert(source.includes('gait.smoothedSpeed / Math.max(0.11, amplitude)'), 'cadence must scale with travel speed');
assert(source.includes('localVelocityX') && source.includes('localVelocityZ') && source.includes('moveX * leftStride') && source.includes('moveZ * leftStride'), 'stride must follow movement direction');
assert(source.includes("visualPatch: 'post2a-r1-remote-locomotion-foot-geometry'"), 'POST.2A patch marker missing');

console.log('POST.2A remote locomotion and foot geometry contract tests passed');

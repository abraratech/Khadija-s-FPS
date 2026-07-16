import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const builder = readFileSync(new URL('../scripts/build_production.py', import.meta.url), 'utf8');
assert.match(builder, /ROOT_FILES = \("index\.html", "favicon\.ico", "multiplayer-release\.json"\)/);
assert.match(builder, /ROOT_DIRS = \("assets", "css", "js"\)/);
assert.match(builder, /\.test\.js/);
assert.match(builder, /multiplayer-server/);
assert.match(builder, /voice_runtime_included/);
assert.match(builder, /production-build-manifest\.json/);
assert.doesNotMatch(builder, /copytree\(project/);
console.log('production build contract tests passed');

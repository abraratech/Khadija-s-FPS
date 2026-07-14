// POST.1A R1 - Worker cloud-profile CORS containment contract.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
assert.match(source, /CLOUD_PROFILE_UPSTREAM_UNAVAILABLE/);
assert.match(source, /return json\(\{[\s\S]*CLOUD_PROFILE_UPSTREAM_UNAVAILABLE[\s\S]*status: 502/);
assert.match(source, /function corsify\(response\)/);
assert.match(source, /access-control-allow-origin/);
console.log('POST.1A Worker CORS containment contract tests passed');

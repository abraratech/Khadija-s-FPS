import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./startup_guard.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = new Map();
  const nodes = new Map();
  const element = () => ({ textContent: '', hidden: false, disabled: false, style: {}, attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, fn) { this[k] = fn; } });
  const buttons = [element(), element()];
  let timeout, reloads = 0;
  const document = { documentElement: { dataset: {} },
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    querySelectorAll() { return buttons; },
    addEventListener(k, fn) { listeners.set(`document:${k}`, fn); } };
  const window = { location: { reload() { reloads++; } },
    addEventListener(k, fn) { listeners.set(k, fn); } };
  vm.runInNewContext(source, { document, window, setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() { timeout = null; } });
  return { document, window, buttons, nodes, emit: (k, event = {}) => listeners.get(k)(event),
    expire: () => timeout?.(), reloads: () => reloads };
}

test('Play requires both assets and complete runtime, in either order', () => {
  for (const assetsFirst of [true, false]) {
    const f = fixture();
    assert.ok(f.buttons.every(b => b.disabled));
    const assets = () => f.emit('ka:arena-assets-ready');
    const runtime = () => f.window.KAStartup.runtimeReady();
    (assetsFirst ? assets : runtime)();
    assert.ok(f.buttons.every(b => b.disabled));
    (assetsFirst ? runtime : assets)();
    assert.ok(f.buttons.every(b => !b.disabled));
    assert.equal(f.nodes.get('startup-status').textContent, 'GAME READY');
    assert.equal(f.nodes.get('startup-notice').hidden, true);
    f.expire();
    assert.equal(f.document.documentElement.dataset.startupState, 'ready');
  }
});

test('WebGL failure explains recovery, ends loading and blocks launch', () => {
  const f = fixture();
  f.emit('error', { message: 'THREE.WebGLRenderer: Error creating WebGL context.' });
  assert.match(f.nodes.get('startup-message').textContent, /hardware acceleration/);
  assert.equal(f.nodes.get('loading-container').style.display, 'none');
  assert.match(f.nodes.get('ka-multiplayer-hub-mount').textContent, /startup did not complete/);
  assert.ok(f.buttons.every(b => b.disabled));
  let prevented = false, stopped = false;
  f.emit('document:click', { target: { closest: () => true }, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  f.nodes.get('startup-retry').click();
  assert.equal(f.reloads(), 1);
});

test('timeout stays failed even if initialization completes late', () => {
  const f = fixture();
  f.expire();
  f.emit('ka:arena-assets-ready');
  f.window.KAStartup.runtimeReady();
  assert.equal(f.document.documentElement.dataset.startupState, 'failed');
  assert.ok(f.buttons.every(b => b.disabled));
});

test('script loading failure is surfaced; non-script resource failure is ignored', () => {
  const f = fixture();
  f.emit('error', { target: { tagName: 'IMG' } });
  assert.equal(f.document.documentElement.dataset.startupState, 'loading');
  f.emit('error', { target: { tagName: 'SCRIPT' } });
  assert.equal(f.document.documentElement.dataset.startupState, 'failed');
});

test('later unrelated errors do not overwrite a successfully initialized game', () => {
  const f = fixture();
  f.window.KAStartup.runtimeReady();
  f.emit('ka:arena-assets-ready');
  f.emit('error', { message: 'An unrelated runtime error' });
  assert.equal(f.document.documentElement.dataset.startupState, 'ready');
});

test('browser extension errors do not block game initialization', () => {
  const f = fixture();
  f.emit('error', { message: 'Extension metadata error', filename: 'chrome-extension://example/content.js' });
  f.window.KAStartup.runtimeReady();
  f.emit('ka:arena-assets-ready');
  assert.equal(f.document.documentElement.dataset.startupState, 'ready');
});

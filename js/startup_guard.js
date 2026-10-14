// Independent of the WebGL module graph: this must run before gameplay imports.
(() => {
  'use strict';
  let state = 'loading';
  let runtimeReady = false;
  let assetsReady = false;
  const playSelector = '[data-onboarding1-quick-play], #start-btn';
  const status = document.getElementById('startup-status');
  const detail = document.getElementById('startup-detail');
  const panel = document.getElementById('startup-notice');
  const title = document.getElementById('startup-title');
  const message = document.getElementById('startup-message');
  const retry = document.getElementById('startup-retry');
  const deadline = setTimeout(() => fail('timeout'), 45000);

  function updateButtons() {
    document.querySelectorAll(playSelector).forEach(button => {
      button.disabled = state !== 'ready';
      button.setAttribute('aria-disabled', String(state !== 'ready'));
    });
  }

  function fail(reason) {
    if (state !== 'loading') return;
    state = 'failed';
    clearTimeout(deadline);
    document.documentElement.dataset.startupState = state;
    status.textContent = 'STARTUP BLOCKED';
    detail.textContent = 'Game initialization did not complete';
    title.textContent = reason === 'graphics' ? '3D graphics could not start' : 'The game could not finish loading';
    message.textContent = reason === 'graphics'
      ? 'This browser could not create the graphics context needed to play. Check that hardware acceleration is enabled, restart the browser, or try a browser and device with WebGL 2 support.'
      : 'A required game component did not load. Check your connection and reload. If this continues, try another supported browser.';
    panel.hidden = false;
    retry.hidden = false;
    const loading = document.getElementById('loading-container');
    if (loading) loading.style.display = 'none';
    const mount = document.getElementById('ka-multiplayer-hub-mount');
    if (mount) mount.textContent = 'Multiplayer controls are unavailable because game startup did not complete. Resolve the startup issue above and reload.';
    updateButtons();
  }

  function maybeReady() {
    if (state !== 'loading' || !runtimeReady || !assetsReady) return;
    state = 'ready';
    clearTimeout(deadline);
    document.documentElement.dataset.startupState = state;
    status.textContent = 'GAME READY';
    // Renderer readiness does not imply online service connectivity.
    detail.textContent = 'Online connection status is available in Multiplayer';
    panel.hidden = true;
    updateButtons();
  }

  window.KAStartup = Object.freeze({
    runtimeReady() { runtimeReady = true; maybeReady(); },
  });
  window.addEventListener('ka:arena-assets-ready', () => {
    assetsReady = true;
    maybeReady();
  });
  window.addEventListener('error', event => {
    if (/^(chrome|moz|safari)-extension:/.test(event.filename || '')) return;
    const text = String(event.message || event.error?.message || '');
    const resource = event.target;
    if (/webgl|graphics context/i.test(text)) fail('graphics');
    else if (text || resource?.tagName === 'SCRIPT') fail('component');
  }, true);
  window.addEventListener('unhandledrejection', event => {
    const text = String(event.reason?.message || event.reason || '');
    if (/webgl|graphics context/i.test(text)) fail('graphics');
    else if (/failed to fetch dynamically imported module|importing a module script/i.test(text)) fail('component');
  });
  // Capture also protects keyboard/programmatic activation after a late timeout.
  document.addEventListener('click', event => {
    if (state !== 'ready' && event.target.closest?.(playSelector)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  retry.addEventListener('click', () => window.location.reload());
  document.documentElement.dataset.startupState = state;
  updateButtons();
})();

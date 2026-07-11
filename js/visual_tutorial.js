import { getVisualTutorialCue } from './visual_tutorial_core.js';

let controller = null;

const STYLE = `
#ka-visual-tutorial{position:fixed;inset:0;z-index:970;pointer-events:none;display:none;font-family:system-ui,sans-serif;--ka-vt-accent:#00d4ff}
#ka-visual-tutorial.is-visible{display:block}
#ka-visual-tutorial .ka-vt-card{position:absolute;left:50%;top:16%;transform:translateX(-50%);min-width:180px;padding:10px 18px;border:1px solid color-mix(in srgb,var(--ka-vt-accent) 70%,white 10%);border-radius:14px;background:rgba(3,9,18,.78);box-shadow:0 0 26px color-mix(in srgb,var(--ka-vt-accent) 35%,transparent);text-align:center;backdrop-filter:blur(5px)}
#ka-visual-tutorial .ka-vt-stage{font-size:12px;letter-spacing:.22em;color:var(--ka-vt-accent);font-weight:900}
#ka-visual-tutorial .ka-vt-control{display:inline-grid;place-items:center;min-width:64px;height:38px;margin-top:7px;padding:0 10px;border:2px solid var(--ka-vt-accent);border-radius:8px;color:white;font-weight:1000;font-size:17px;box-shadow:inset 0 0 12px rgba(255,255,255,.08),0 0 18px color-mix(in srgb,var(--ka-vt-accent) 42%,transparent);animation:kaVTPulse 1s ease-in-out infinite}
#ka-visual-tutorial .ka-vt-progress{margin-top:7px;font-size:10px;color:#9eb6ca;letter-spacing:.18em}
#ka-visual-tutorial .ka-vt-visual{position:absolute;left:50%;top:50%;width:150px;height:150px;transform:translate(-50%,-50%)}
#ka-visual-tutorial .ka-vt-ring{position:absolute;inset:18px;border:3px solid var(--ka-vt-accent);border-radius:50%;opacity:.72;animation:kaVTRing 1.25s ease-out infinite}
#ka-visual-tutorial .ka-vt-ring.second{animation-delay:.42s}
#ka-visual-tutorial .ka-vt-symbol{position:absolute;inset:0;display:grid;place-items:center;color:white;text-shadow:0 0 18px var(--ka-vt-accent);font-size:44px;font-weight:1000}
#ka-visual-tutorial[data-icon="ARROWS"] .ka-vt-symbol{font-size:34px;line-height:1.05;white-space:pre}
#ka-visual-tutorial[data-icon="TARGET"] .ka-vt-symbol::before{content:'＋';font-size:58px}
#ka-visual-tutorial[data-icon="RELOAD"] .ka-vt-symbol::before{content:'↻';animation:kaVTRotate 1.1s linear infinite}
#ka-visual-tutorial[data-icon="HAND"] .ka-vt-symbol::before{content:'☝'}
#ka-visual-tutorial[data-icon="SHIELD"] .ka-vt-symbol::before{content:'◆'}
#ka-visual-tutorial .ka-vt-enemy-dot{display:none;position:absolute;width:12px;height:12px;border-radius:50%;background:#ff3b30;box-shadow:0 0 12px #ff3b30}
#ka-visual-tutorial[data-icon="SHIELD"] .ka-vt-enemy-dot{display:block;animation:kaVTOrbit 2.4s linear infinite;left:69px;top:4px;transform-origin:6px 71px}
#ka-visual-tutorial[data-icon="SHIELD"] .ka-vt-enemy-dot.d2{animation-delay:-.8s}
#ka-visual-tutorial[data-icon="SHIELD"] .ka-vt-enemy-dot.d3{animation-delay:-1.6s}
.ka-tutorial-highlight{position:relative!important;z-index:980!important;outline:4px solid #00d4ff!important;box-shadow:0 0 25px #00d4ff!important;animation:kaVTHighlight .9s ease-in-out infinite!important}
@keyframes kaVTPulse{50%{transform:scale(1.08);filter:brightness(1.25)}}
@keyframes kaVTRing{0%{transform:scale(.55);opacity:.9}100%{transform:scale(1.3);opacity:0}}
@keyframes kaVTRotate{to{transform:rotate(360deg)}}
@keyframes kaVTOrbit{to{transform:rotate(360deg)}}
@keyframes kaVTHighlight{50%{outline-offset:7px;filter:brightness(1.25)}}
@media(max-width:700px){#ka-visual-tutorial .ka-vt-card{top:8%;transform:translateX(-50%) scale(.88)}#ka-visual-tutorial .ka-vt-visual{top:43%;transform:translate(-50%,-50%) scale(.82)}}
@media(prefers-reduced-motion:reduce){#ka-visual-tutorial *, .ka-tutorial-highlight{animation-duration:0.001ms!important;animation-iteration-count:1!important}}
`;

function ensureUi() {
  if (document.getElementById('ka-visual-tutorial')) return document.getElementById('ka-visual-tutorial');
  const style = document.createElement('style');
  style.id = 'ka-visual-tutorial-style';
  style.textContent = STYLE;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'ka-visual-tutorial';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="ka-vt-card"><div class="ka-vt-stage"></div><div class="ka-vt-control"></div><div class="ka-vt-progress"></div></div><div class="ka-vt-visual"><span class="ka-vt-ring"></span><span class="ka-vt-ring second"></span><span class="ka-vt-symbol">↑\n← ↓ →</span><i class="ka-vt-enemy-dot"></i><i class="ka-vt-enemy-dot d2"></i><i class="ka-vt-enemy-dot d3"></i></div>`;
  document.body.append(root);
  return root;
}

function clearHighlight() {
  controller?.highlighted?.classList.remove('ka-tutorial-highlight');
  controller.highlighted = null;
}

function setHighlight(id) {
  if (controller?.highlighted?.id === id) return;
  clearHighlight();
  if (!id) return;
  const element = document.getElementById(id);
  if (element) {
    element.classList.add('ka-tutorial-highlight');
    controller.highlighted = element;
  }
}

function render(cue) {
  const root = controller.root;
  root.classList.toggle('is-visible', cue.visible === true);
  if (!cue.visible) {
    clearHighlight();
    document.documentElement.dataset.kaVisualTutorialStage = 'hidden';
    return;
  }
  root.style.setProperty('--ka-vt-accent', cue.accent);
  root.dataset.icon = cue.icon;
  root.querySelector('.ka-vt-stage').textContent = cue.stage;
  root.querySelector('.ka-vt-control').textContent = cue.control;
  root.querySelector('.ka-vt-progress').textContent = `${cue.progress} / ${cue.total}`;
  const symbol = root.querySelector('.ka-vt-symbol');
  symbol.textContent = cue.icon === 'ARROWS' ? '↑\n← ↓ →' : '';
  setHighlight(cue.highlightId);
  document.documentElement.dataset.kaVisualTutorialStage = cue.stage.toLowerCase();
}

export function initVisualTutorial({ isMobile = false } = {}) {
  if (controller) {
    controller.isMobile = isMobile === true;
    return controller;
  }
  controller = { root: ensureUi(), isMobile: isMobile === true, highlighted: null, lastStage: '' };
  document.documentElement.dataset.kaVisualTutorial = 'ready';
  return controller;
}

export function resetVisualTutorial() {
  if (!controller) return;
  controller.lastStage = '';
  updateVisualTutorial();
}

export function updateVisualTutorial() {
  if (!controller) return null;
  let snapshot = null;
  try { snapshot = window.KAGetTutorial?.() || null; } catch { snapshot = null; }
  const cue = getVisualTutorialCue(snapshot || {}, { isMobile: controller.isMobile });
  render(cue);
  controller.lastStage = cue.stage || '';
  return cue;
}

export function endVisualTutorial() {
  if (!controller) return;
  render({ visible: false });
}

export function destroyVisualTutorial() {
  if (!controller) return;
  clearHighlight();
  controller.root.remove();
  document.getElementById('ka-visual-tutorial-style')?.remove();
  controller = null;
  document.documentElement.dataset.kaVisualTutorial = 'stopped';
}

import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../../css/ui9-responsive.css', import.meta.url), 'utf8');
const marker = 'UI.9 R2 — keep the primary pause action visible';
assert.equal(css.split(marker).length - 1, 1, 'R2 marker must appear once');
const r2 = css.slice(css.indexOf(marker));
for (const fragment of [
  '#pause-screen {',
  'justify-content: flex-start !important;',
  'overflow-y: auto !important;',
  'scroll-padding-bottom: calc(94px + var(--ka-ui9-safe-bottom));',
  '#resume-btn {',
  'position: fixed !important;',
  'bottom: max(10px, var(--ka-ui9-safe-bottom)) !important;',
  'transform: translateX(-50%) !important;',
  'z-index: 110 !important;',
  '@media (max-height: 430px) and (orientation: landscape)',
]) assert.ok(r2.includes(fragment), `missing mobile pause contract: ${fragment}`);
assert.ok(r2.indexOf('#resume-btn {') > r2.indexOf('@media (max-width: 920px)'), 'resume override must stay inside mobile media rules');
console.log('UI.9 R2 mobile pause visibility contract: PASS');

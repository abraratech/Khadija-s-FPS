import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./text_chat.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  source.includes("this.open({ releasePointerLock: false, keyboardShortcut: true });"),
  'T/Enter shortcut must open chat without releasing pointer lock during gameplay'
);
assert(
  source.includes('const shouldReleasePointer = releasePointerLock && !runActive;'),
  'chat open must only release pointer lock outside active runs'
);
assert(
  source.includes('document.exitPointerLock?.();') && source.includes('if (shouldReleasePointer)'),
  'pointer-lock exit must be gated by active-run state'
);
assert(
  source.includes('window.KHADIJA_TEXT_CHAT_INPUT_ACTIVE = Boolean(active);'),
  'chat input active flag should be exposed for input systems'
);
assert(
  source.includes("this.showStatus('Chat open - gameplay stays active');"),
  'keyboard shortcut should confirm gameplay remains active'
);

console.log('POST.1B R1.2 chat pointer-lock contract tests passed');

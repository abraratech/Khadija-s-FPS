// SOCIAL.2 — local, dependency-free Arena ID QR rendering.
// QR encoder adapted from Kazuhiko Arase's MIT-licensed QRCode for JavaScript.

import QRCode from './vendor/qrcode/index.js';
import QRErrorCorrectLevel from './vendor/qrcode/QRErrorCorrectLevel.js';

export const SOCIAL2_QR_PATCH = 'social2-r1-arena-id-friend-discovery';

export function buildArenaShareUrl(arenaId, locationLike = null) {
  const cleanId = String(arenaId || '').trim().toUpperCase();
  if (!cleanId) return '';
  const fallback = 'https://khadija-s-fps.pages.dev/';
  let base = fallback;
  try {
    const source = locationLike || (typeof window !== 'undefined' ? window.location : null);
    if (source?.origin && source?.pathname) {
      base = `${source.origin}${source.pathname}`;
    }
  } catch {
    base = fallback;
  }
  const url = new URL(base, fallback);
  url.searchParams.set('friend', cleanId);
  url.hash = 'social';
  return url.toString();
}

export function createQrMatrix(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const qr = new QRCode(0, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) => (
    Array.from({ length: count }, (_, col) => qr.isDark(row, col) === true)
  ));
}

export function renderQrCanvas(canvas, value, {
  size = 184,
  margin = 4,
  dark = '#04131b',
  light = '#f4fdff'
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return false;
  const matrix = createQrMatrix(value);
  if (!matrix.length) {
    const context = canvas.getContext('2d');
    context?.clearRect?.(0, 0, canvas.width || size, canvas.height || size);
    return false;
  }
  const ratio = Math.max(1, Math.min(3, Number(globalThis.devicePixelRatio) || 1));
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.fillStyle = light;
  context.fillRect(0, 0, size, size);

  const modules = matrix.length + margin * 2;
  const unit = size / modules;
  context.fillStyle = dark;
  matrix.forEach((row, rowIndex) => {
    row.forEach((filled, colIndex) => {
      if (!filled) return;
      const left = Math.floor((colIndex + margin) * unit);
      const top = Math.floor((rowIndex + margin) * unit);
      const right = Math.ceil((colIndex + margin + 1) * unit);
      const bottom = Math.ceil((rowIndex + margin + 1) * unit);
      context.fillRect(left, top, right - left, bottom - top);
    });
  });
  canvas.dataset.qrValue = String(value || '');
  return true;
}

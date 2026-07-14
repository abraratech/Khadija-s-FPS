export function normalizeAxis(value, deadzone = 0.58) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) < deadzone) return 0;
  return numeric > 0 ? 1 : -1;
}

export function edgePressed(currentButtons = [], previousButtons = [], index = 0) {
  const current = Boolean(currentButtons[index]?.pressed || (Number(currentButtons[index]?.value) || 0) > 0.65);
  const previous = Boolean(previousButtons[index]?.pressed || (Number(previousButtons[index]?.value) || 0) > 0.65);
  return current && !previous;
}

function center(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function chooseDirectionalTarget(currentRect, candidates = [], direction = 'right') {
  if (!currentRect || !Array.isArray(candidates) || candidates.length === 0) return null;
  const origin = center(currentRect);
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate?.rect) continue;
    const point = center(candidate.rect);
    const primary = (point[axis] - origin[axis]) * sign;
    if (primary <= 2) continue;
    const secondary = axis === 'x' ? Math.abs(point.y - origin.y) : Math.abs(point.x - origin.x);
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    const overlapBonus = axis === 'x'
      ? Math.max(0, Math.min(currentRect.bottom, candidate.rect.bottom) - Math.max(currentRect.top, candidate.rect.top))
      : Math.max(0, Math.min(currentRect.right, candidate.rect.right) - Math.max(currentRect.left, candidate.rect.left));
    const score = primary + secondary * 1.65 + distance * 0.08 - overlapBonus * 0.32;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function classifyViewport(width, height) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  if ((w <= 920 && w > h) || h <= 560) return 'handheld';
  if (w <= 1366 || h <= 760) return 'compact';
  if (w >= 1800 && h >= 900) return 'wide';
  return 'standard';
}

export const AVATAR_PROFILE_KEY = 'ka_avatar_profile_v1';
export const AVATAR_PROFILE_VERSION = 1;

function freezeOptions(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export const AVATAR_OPTIONS = Object.freeze({
  skin: freezeOptions([
    { id: 'warm', label: 'Warm', color: '#b88767' },
    { id: 'golden', label: 'Golden', color: '#c8966f' },
    { id: 'bronze', label: 'Bronze', color: '#9a6548' },
    { id: 'deep', label: 'Deep', color: '#6f4334' },
    { id: 'pale', label: 'Pale', color: '#e2b899' },
  ]),
  suit: freezeOptions([
    { id: 'arena-cyan', label: 'Arena Cyan', color: '#176f88' },
    { id: 'emerald', label: 'Emerald', color: '#19795f' },
    { id: 'crimson', label: 'Crimson', color: '#8b3040' },
    { id: 'violet', label: 'Violet', color: '#5d438f' },
    { id: 'sand', label: 'Sand', color: '#8f7248' },
    { id: 'slate', label: 'Slate', color: '#40586b' },
  ]),
  armor: freezeOptions([
    { id: 'midnight', label: 'Midnight', color: '#123448' },
    { id: 'graphite', label: 'Graphite', color: '#2a3540' },
    { id: 'cobalt', label: 'Cobalt', color: '#204a78' },
    { id: 'maroon', label: 'Maroon', color: '#562b37' },
    { id: 'olive', label: 'Olive', color: '#44513c' },
    { id: 'ivory', label: 'Ivory', color: '#a5a69f' },
  ]),
  accent: freezeOptions([
    { id: 'protocol-cyan', label: 'Protocol Cyan', color: '#10d8ff' },
    { id: 'team-green', label: 'Team Green', color: '#21ed91' },
    { id: 'warning-orange', label: 'Warning Orange', color: '#ff9b2f' },
    { id: 'neon-pink', label: 'Neon Pink', color: '#ff3bcf' },
    { id: 'reactor-yellow', label: 'Reactor Yellow', color: '#ffd84a' },
    { id: 'white', label: 'White', color: '#eaf8ff' },
  ]),
  hairStyle: freezeOptions([
    { id: 'crop', label: 'Field Crop' },
    { id: 'cap', label: 'Close Cap' },
    { id: 'none', label: 'No Hair' },
  ]),
  hairColor: freezeOptions([
    { id: 'black', label: 'Black', color: '#101820' },
    { id: 'brown', label: 'Brown', color: '#4c2f24' },
    { id: 'auburn', label: 'Auburn', color: '#713827' },
    { id: 'silver', label: 'Silver', color: '#aeb7bf' },
  ]),
});

export const DEFAULT_AVATAR_PROFILE = Object.freeze({
  version: AVATAR_PROFILE_VERSION,
  skin: 'warm',
  suit: 'arena-cyan',
  armor: 'midnight',
  accent: 'protocol-cyan',
  hairStyle: 'crop',
  hairColor: 'black',
});

function optionMap(field) {
  return new Map((AVATAR_OPTIONS[field] || []).map((entry) => [entry.id, entry]));
}

const OPTION_MAPS = Object.freeze(Object.fromEntries(
  Object.keys(AVATAR_OPTIONS).map((field) => [field, optionMap(field)]),
));

function normalizeChoice(field, value, fallback) {
  const token = String(value || '').trim().toLowerCase();
  return OPTION_MAPS[field]?.has(token) ? token : fallback;
}

export function normalizeAvatarProfile(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.freeze({
    version: AVATAR_PROFILE_VERSION,
    skin: normalizeChoice('skin', source.skin, DEFAULT_AVATAR_PROFILE.skin),
    suit: normalizeChoice('suit', source.suit, DEFAULT_AVATAR_PROFILE.suit),
    armor: normalizeChoice('armor', source.armor, DEFAULT_AVATAR_PROFILE.armor),
    accent: normalizeChoice('accent', source.accent, DEFAULT_AVATAR_PROFILE.accent),
    hairStyle: normalizeChoice('hairStyle', source.hairStyle, DEFAULT_AVATAR_PROFILE.hairStyle),
    hairColor: normalizeChoice('hairColor', source.hairColor, DEFAULT_AVATAR_PROFILE.hairColor),
  });
}

export function parseAvatarProfile(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_AVATAR_PROFILE;
  try {
    return normalizeAvatarProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_AVATAR_PROFILE;
  }
}

export function serializeAvatarProfile(profile) {
  return JSON.stringify(normalizeAvatarProfile(profile));
}

export function getAvatarOption(field, id) {
  return OPTION_MAPS[field]?.get(String(id || '').trim().toLowerCase()) || null;
}

export function getAvatarPalette(profileInput) {
  const profile = normalizeAvatarProfile(profileInput);
  return Object.freeze({
    skin: getAvatarOption('skin', profile.skin)?.color || '#b88767',
    suit: getAvatarOption('suit', profile.suit)?.color || '#176f88',
    armor: getAvatarOption('armor', profile.armor)?.color || '#123448',
    accent: getAvatarOption('accent', profile.accent)?.color || '#10d8ff',
    hair: getAvatarOption('hairColor', profile.hairColor)?.color || '#101820',
  });
}

export function avatarProfileFingerprint(profileInput) {
  const profile = normalizeAvatarProfile(profileInput);
  return [profile.skin, profile.suit, profile.armor, profile.accent, profile.hairStyle, profile.hairColor].join('|');
}

export function randomizeAvatarProfile(random = Math.random) {
  const choose = (field) => {
    const entries = AVATAR_OPTIONS[field] || [];
    const raw = Number(random());
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    return entries[Math.floor(normalized * entries.length)]?.id || DEFAULT_AVATAR_PROFILE[field];
  };
  return normalizeAvatarProfile({
    skin: choose('skin'),
    suit: choose('suit'),
    armor: choose('armor'),
    accent: choose('accent'),
    hairStyle: choose('hairStyle'),
    hairColor: choose('hairColor'),
  });
}

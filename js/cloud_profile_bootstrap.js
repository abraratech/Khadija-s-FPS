// M4.39-M4.42 — early guest-profile hydration before ES modules read legacy settings.
(() => {
  const PRIMARY_KEY = 'ka_cloud_profile_v1';
  const FORCE_KEY = 'ka_cloud_profile_force_hydrate_v1';
  const REVISION_KEY = 'ka_cloud_profile_revision_v1';
  const SCHEMA = 'khadijas-arena-player-profile';
  try {
    const raw = localStorage.getItem(PRIMARY_KEY);
    if (!raw) return;
    const profile = JSON.parse(raw);
    if (
      !profile
      || profile.schema !== SCHEMA
      || Number(profile.version) !== 1
      || !profile.legacyStorage
      || typeof profile.legacyStorage !== 'object'
    ) return;

    const force = localStorage.getItem(FORCE_KEY) === '1';
    for (const [key, value] of Object.entries(profile.legacyStorage)) {
      if (typeof value !== 'string') continue;
      if (force || localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
    localStorage.setItem(REVISION_KEY, String(Math.max(1, Number(profile.revision) || 1)));
    localStorage.removeItem(FORCE_KEY);
    document.documentElement.dataset.kaCloudProfileBootstrap = force ? 'forced' : 'restored-missing';
  } catch {
    document.documentElement.dataset.kaCloudProfileBootstrap = 'skipped-invalid';
  }
})();

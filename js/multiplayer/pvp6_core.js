// PVP.6 R1 — final PvP certification candidate and paired production seal core.

export const PVP6_SCHEMA = 1;
export const PVP6_PATCH = 'pvp6-r1-final-pvp-certification-candidate';
export const PVP6_PRODUCT_VERSION = '1.1.0-pvp6-rc1';
export const PVP6_FRONTEND_BASELINE_SHA = '36c020aeddcf2c10bf117063167d6f6d2d59b556';
export const PVP6_WORKER_BASELINE_SHA = '334268d77dbd30b3ca1d7e3c3ad883cf27235944';
export const PVP6_BASELINE_WORKER_VERSION_ID = '76fbfcdc-178a-4394-97c9-5872fd0de52d';
export const PVP6_RELEASE_SEQUENCE = 2026071808;
export const PVP6_CERTIFICATION_STATUS = 'STATIC_CERTIFIED_LIVE_PENDING';
export const PVP6_LIVE_CERTIFICATION_STATUS = 'PENDING';
export const PVP6_OPERATIONAL_FEATURE_FLAGS = Object.freeze([
  'PVP1_ENABLED',
  'PVP2_PUBLIC_MATCHMAKING_ENABLED',
  'PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED'
]);
export const PVP6_CERTIFICATION_MATRIX = Object.freeze([
  'ONE_VS_ONE_LIFECYCLE',
  'TWO_VS_TWO_LIFECYCLE',
  'PUBLIC_MATCHMAKING',
  'OPEN_ROOM_DISCOVERY',
  'SPECTATING_AND_SCOREBOARD',
  'REMATCH_AND_MAP_VOTING',
  'DISCONNECT_RECONNECT_FORFEIT',
  'HOST_MIGRATION_AND_TAB_RECOVERY',
  'SPAWN_AND_HOT_DROP_SAFETY',
  'RATING_AND_STAT_IDEMPOTENCY',
  'RELAY_DEGRADATION_AND_RECONCILIATION',
  'DESKTOP_MOBILE_CONTROLLER_BROWSER'
]);

function clean(value, limit = 180) {
  return String(value ?? '').trim().slice(0, limit);
}

export function normalizePvp6VersionMetadata(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const timestamp = clean(source.timestamp, 80);
  return Object.freeze({
    versionId: clean(source.id || source.versionId, 80) || null,
    versionTag: clean(source.tag || source.versionTag, 120) || null,
    versionTimestamp: timestamp || null
  });
}

export function createPvp6SealDescriptor(overrides = {}) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return Object.freeze({
    schema: PVP6_SCHEMA,
    patch: PVP6_PATCH,
    productVersion: PVP6_PRODUCT_VERSION,
    releaseSequence: PVP6_RELEASE_SEQUENCE,
    frontendBaselineSha: PVP6_FRONTEND_BASELINE_SHA,
    workerBaselineSha: PVP6_WORKER_BASELINE_SHA,
    baselineWorkerVersionId: PVP6_BASELINE_WORKER_VERSION_ID,
    certificationStatus: clean(source.certificationStatus || PVP6_CERTIFICATION_STATUS, 80),
    liveCertificationStatus: clean(source.liveCertificationStatus || PVP6_LIVE_CERTIFICATION_STATUS, 80),
    productionSealCandidate: true,
    finalProductionSeal: false,
    completePvpFoundation: true,
    completeCompetitiveLifecycle: true,
    realTwoClientCertificationRequired: true,
    versionMetadataBinding: 'CF_VERSION_METADATA',
    workerVersionMetadataExposed: true,
    operationalRollbackFlagsRetained: true,
    deadPvpFlagsFound: 0,
    operationalFeatureFlags: PVP6_OPERATIONAL_FEATURE_FLAGS,
    certificationMatrix: PVP6_CERTIFICATION_MATRIX,
    workerChangeRequired: true,
    frontendAndWorker: true
  });
}

export function evaluatePvp6SealPair({ frontendSeal = {}, workerInfo = {} } = {}) {
  const expected = createPvp6SealDescriptor();
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  check(Number(frontendSeal.schema) === expected.schema, 'FRONTEND_SCHEMA_MISMATCH');
  check(clean(frontendSeal.patch) === expected.patch, 'FRONTEND_PATCH_MISMATCH');
  check(clean(frontendSeal.productVersion) === expected.productVersion, 'FRONTEND_VERSION_MISMATCH');
  check(clean(frontendSeal.frontendBaselineSha) === expected.frontendBaselineSha, 'FRONTEND_BASELINE_MISMATCH');
  check(clean(frontendSeal.workerBaselineSha) === expected.workerBaselineSha, 'FRONTEND_WORKER_BASELINE_MISMATCH');
  check(Number(workerInfo.schema) === expected.schema, 'WORKER_SCHEMA_MISMATCH');
  check(clean(workerInfo.patch) === expected.patch, 'WORKER_PATCH_MISMATCH');
  check(clean(workerInfo.productVersion) === expected.productVersion, 'WORKER_VERSION_MISMATCH');
  check(clean(workerInfo.frontendBaselineSha) === expected.frontendBaselineSha, 'WORKER_FRONTEND_BASELINE_MISMATCH');
  check(clean(workerInfo.workerBaselineSha) === expected.workerBaselineSha, 'WORKER_BASELINE_MISMATCH');
  const deployment = normalizePvp6VersionMetadata(workerInfo.deployment || workerInfo.versionMetadata);
  check(Boolean(deployment.versionId), 'WORKER_VERSION_METADATA_MISSING');
  return Object.freeze({
    ready: errors.length === 0,
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors: Object.freeze(errors),
    deployment
  });
}

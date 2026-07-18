// js/multiplayer/production_release_ui_core.js
// PVP.2 R2.1 — launch-safe service status. Compatibility validation remains internal.
export const MULTIPLAYER_PRODUCTION_RELEASE_UI_PATCH = 'm3-production-release-ui-r2-launch';
function cleanText(value, fallback = '', limit = 320) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}
function cleanStatus(value, fallback = 'IDLE') {
  return cleanText(value, fallback, 80).toUpperCase();
}
export function deriveMultiplayerProductionReleaseUiState({
  productionRelease = null, connecting = false, online = false, error = null
} = {}) {
  const status = cleanStatus(productionRelease?.status);
  const ready = productionRelease?.ready === true;
  const blocking = productionRelease?.blocking === true;
  if (online) return Object.freeze({status,statusText:'ONLINE ROOM READY',tone:'success',blockActions:true,retryVisible:false,retryDisabled:true});
  if (connecting || status === 'CHECKING') return Object.freeze({status:'CHECKING',statusText:'CONNECTING TO ONLINE SERVICES…',tone:'warning',blockActions:true,retryVisible:false,retryDisabled:true});
  if (status === 'FAIL' || blocking) return Object.freeze({status:'FAIL',statusText:'ONLINE SERVICES TEMPORARILY UNAVAILABLE',tone:'danger',blockActions:true,retryVisible:false,retryDisabled:true});
  if (status === 'PASS' && ready) return Object.freeze({status:'PASS',statusText:'ONLINE SERVICES READY',tone:'success',blockActions:false,retryVisible:false,retryDisabled:true});
  if (error) return Object.freeze({status,statusText:'ONLINE CONNECTION INTERRUPTED',tone:'danger',blockActions:false,retryVisible:false,retryDisabled:true});
  return Object.freeze({status,statusText:'ONLINE SERVICES STANDBY',tone:'neutral',blockActions:false,retryVisible:false,retryDisabled:true});
}

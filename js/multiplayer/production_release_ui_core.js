// js/multiplayer/production_release_ui_core.js
export const MULTIPLAYER_PRODUCTION_RELEASE_UI_PATCH = 'm3-production-release-ui-r1';
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
  const firstError = cleanText(productionRelease?.errors?.[0]?.message, '', 260);
  if (online) return Object.freeze({status,statusText:'ONLINE ROOM READY',tone:'success',blockActions:true,retryVisible:false,retryDisabled:true});
  if (connecting || status === 'CHECKING') return Object.freeze({status:'CHECKING',statusText:'VERIFYING CERTIFIED MULTIPLAYER SERVER…',tone:'warning',blockActions:true,retryVisible:true,retryDisabled:true});
  if (status === 'FAIL' || blocking) return Object.freeze({status:'FAIL',statusText:cleanText(firstError || error,'CERTIFIED SERVER CHECK FAILED').toUpperCase(),tone:'danger',blockActions:true,retryVisible:true,retryDisabled:false});
  if (status === 'PASS' && ready) return Object.freeze({status:'PASS',statusText:'CERTIFIED MULTIPLAYER SERVER READY',tone:'success',blockActions:false,retryVisible:true,retryDisabled:false});
  if (error) return Object.freeze({status,statusText:cleanText(error).toUpperCase(),tone:'danger',blockActions:false,retryVisible:true,retryDisabled:false});
  return Object.freeze({status,statusText:'CERTIFIED SERVER CHECK NOT RUN',tone:'neutral',blockActions:false,retryVisible:true,retryDisabled:false});
}

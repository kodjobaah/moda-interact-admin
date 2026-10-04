export function storeCategoryAuthoringNow() {
  return new Date().toISOString();
}

export function createStoreCategoryAuthoringClientId() {
  return window.crypto.randomUUID();
}

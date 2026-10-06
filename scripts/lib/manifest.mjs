// Helpers for reading file references out of a Manifest V3 manifest.

/**
 * Lists every extension file path a manifest references (relative to the extension root).
 * Wildcard resources (e.g. "assets/sprites/*.png") are returned as-is.
 * @param {object} manifest
 * @returns {string[]}
 */
export function manifestFiles(manifest) {
  const files = new Set();
  const add = (value) => value && files.add(value.replace(/^\//, ''));

  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  Object.values(manifest.action?.default_icon ?? {}).forEach(add);
  Object.values(manifest.icons ?? {}).forEach(add);
  for (const script of manifest.content_scripts ?? []) {
    (script.js ?? []).forEach(add);
    (script.css ?? []).forEach(add);
  }
  for (const entry of manifest.web_accessible_resources ?? []) {
    (entry.resources ?? []).forEach(add);
  }

  return [...files];
}

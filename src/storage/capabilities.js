/**
 * Requirements check (storage.md, File System Access decision).
 *
 * The app REQUIRES File System Access. Without it we do not start: the
 * requirements screen is shown instead. There is no degraded mode, and that is
 * deliberate — a family archive app that sometimes loses the data is worse than
 * one that refuses to open.
 *
 * Detection is always by capability, NEVER by user agent.
 */

export function isSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    typeof window.showSaveFilePicker === 'function' &&
    typeof indexedDB !== 'undefined' &&
    typeof crypto?.subtle?.digest === 'function'
  );
}

/** Which capability is missing, so the user can be told precisely. */
export function missingCapabilities() {
  const missing = [];
  if (typeof window?.showDirectoryPicker !== 'function') missing.push('showDirectoryPicker');
  if (typeof window?.showSaveFilePicker !== 'function') missing.push('showSaveFilePicker');
  if (typeof indexedDB === 'undefined') missing.push('indexedDB');
  if (typeof crypto?.subtle?.digest !== 'function') missing.push('crypto.subtle');
  return missing;
}

/** ES modules do not load over file:// and there is no service worker either. */
export function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

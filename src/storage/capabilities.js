/**
 * Requirements check (storage.md, storage modes).
 *
 * The app needs somewhere durable to keep a family archive and a way to stream
 * files into it. Two things provide that — File System Access on the desktop,
 * the origin private file system everywhere else — and either will do.
 *
 * What it will NOT do is start without one. A family archive app that sometimes
 * loses the data is worse than one that refuses to open.
 *
 * Detection is always by capability, NEVER by user agent.
 */

import { storageMode } from './backend.js';

export function isSupported() {
  return (
    storageMode() !== null &&
    canStreamToFiles() &&
    typeof indexedDB !== 'undefined' &&
    typeof crypto?.subtle?.digest === 'function'
  );
}

/**
 * Writing a file in chunks, rather than building it in memory first.
 *
 * Safari had the origin private file system for two years before it could do
 * this outside a worker, and without it every photo and every export would have
 * to be buffered whole. Checked on the prototype so nothing has to be written
 * to find out.
 */
function canStreamToFiles() {
  return (
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.createWritable === 'function'
  );
}

/** Which capability is missing, so the user can be told precisely. */
export function missingCapabilities() {
  const missing = [];
  if (storageMode() === null) missing.push('showDirectoryPicker / navigator.storage.getDirectory');
  if (!canStreamToFiles()) missing.push('FileSystemFileHandle.createWritable');
  if (typeof indexedDB === 'undefined') missing.push('indexedDB');
  if (typeof crypto?.subtle?.digest !== 'function') missing.push('crypto.subtle');
  return missing;
}

/** ES modules do not load over file:// and there is no service worker either. */
export function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

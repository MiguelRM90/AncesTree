/**
 * Which storage backend this browser can offer (storage.md, storage modes).
 *
 *   DISK     the project is a folder the user picked on their own filesystem.
 *            Needs File System Access: Chromium on the desktop.
 *   BROWSER  the project lives in the origin private file system, a sandbox
 *            the browser owns and the user cannot see. Every current browser
 *            has it, phones included.
 *
 * The reason the rest of storage/ does not care which one it got: both hand
 * back a FileSystemDirectoryHandle with the same methods — getFileHandle,
 * getDirectoryHandle, createWritable, entries, removeEntry. Everything below
 * the pickers is written against that interface and runs unchanged on either.
 *
 * DISK wins wherever both are available. It is the only one where the archive
 * is a folder the user can see, copy and back up, which is the whole promise of
 * the app; BROWSER is what makes it work at all on a phone.
 */

export const StorageMode = { DISK: 'DISK', BROWSER: 'BROWSER' };

export function storageMode() {
  if (typeof window === 'undefined') return null;

  if (
    typeof window.showDirectoryPicker === 'function' &&
    typeof window.showSaveFilePicker === 'function' &&
    typeof window.showOpenFilePicker === 'function'
  ) {
    return StorageMode.DISK;
  }

  if (typeof navigator?.storage?.getDirectory === 'function') return StorageMode.BROWSER;

  return null;
}

export const isBrowserStorage = () => storageMode() === StorageMode.BROWSER;
export const isDiskStorage = () => storageMode() === StorageMode.DISK;

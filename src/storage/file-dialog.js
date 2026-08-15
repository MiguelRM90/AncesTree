/**
 * Getting files in and out of the app, with or without File System Access.
 *
 * Two implementations of three operations, chosen by capability:
 *
 *              DISK (File System Access)      BROWSER (everything else)
 *   open       showOpenFilePicker             <input type="file">
 *   save       showSaveFilePicker             <a download>
 *
 * The save callback is handed a FileSystemWritableFileStream in BOTH cases —
 * the fallback streams into a scratch file in the origin private file system
 * and downloads that. So a 2 GB archive full of photos is written the same way
 * on a phone as on a desktop: chunk by chunk, never held in memory. The cost is
 * transient disk, not RAM.
 *
 * Every function here needs a user gesture, because both pickers do.
 */

import { StorageError } from './error.js';

const SCRATCH_DIR = '.downloads';

/** How long a finished download may keep its scratch file before it is swept. */
const SCRATCH_TTL_MS = 10 * 60 * 1000;

// --- Opening ---------------------------------------------------------------

/**
 * One file, or null if the user backed out.
 *
 * @param {{types: object[]}} options  File System Access `types` descriptors;
 *   the accept attribute of the fallback input is derived from them, so there
 *   is only one list to keep correct.
 */
export async function openFile({ types }) {
  const files = await open({ types, multiple: false });
  return files[0] ?? null;
}

/** Zero or more files. An empty array means cancelled. */
export function openFiles({ types }) {
  return open({ types, multiple: true });
}

async function open({ types, multiple }) {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker({ types, multiple });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (cause) {
      if (cause.name === 'AbortError') return [];
      throw new StorageError('PICKER_FAILED', 'Could not open the file picker', cause);
    }
  }

  return openWithInput({ accept: acceptAttribute(types), multiple });
}

/**
 * The fallback picker.
 *
 * The input is created, used and thrown away rather than kept around: a stale
 * input holds on to the last selection, which makes picking the same file twice
 * in a row do nothing.
 */
function openWithInput({ accept, multiple }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;

    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(files);
    };

    // Dismissing a file input fires `cancel` in current browsers. Where it does
    // not, the window coming back into focus with nothing chosen means the same
    // thing; the delay is there to let a `change` event arrive first.
    const onFocus = () => setTimeout(() => finish([]), 500);

    input.addEventListener('change', () => finish([...input.files]));
    input.addEventListener('cancel', () => finish([]));

    document.body.append(input);
    input.click();
    window.addEventListener('focus', onFocus, { once: true });
  });
}

/** 'image/jpeg,.jpg,.jpeg,image/png,.png' — both halves, since phones use each. */
function acceptAttribute(types) {
  return types
    .flatMap((type) => Object.entries(type.accept))
    .flatMap(([mime, extensions]) => [mime, ...extensions])
    .join(',');
}

// --- Saving ----------------------------------------------------------------

/**
 * Writes a file wherever the platform can put one.
 *
 * @param {object} options
 * @param {string} options.suggestedName
 * @param {object[]} options.types
 * @param {string} options.mime
 * @param {(writable: FileSystemWritableFileStream) => Promise<void>} options.write
 *   called with an open stream; it must close it.
 * @returns {Promise<{ok: boolean, cancelled?: boolean}>}
 */
export async function saveFile({ suggestedName, types, mime, write }) {
  if (typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName, types });
    } catch (cause) {
      if (cause.name === 'AbortError') return { ok: false, cancelled: true };
      throw new StorageError('PICKER_FAILED', 'Could not open the save dialog', cause);
    }

    await write(await handle.createWritable());
    return { ok: true };
  }

  return saveByDownload({ suggestedName, mime, write });
}

/**
 * No save dialog: build the file in the browser's own storage and hand it to
 * the download shelf.
 *
 * The scratch file is NOT deleted when the download starts. A blob URL is a
 * reference to the bytes, not a copy of them, so removing the file underneath a
 * download in progress can truncate it. It is left behind and swept on the next
 * export instead, which also cleans up after a tab that was closed mid-download.
 */
async function saveByDownload({ suggestedName, mime, write }) {
  const scratch = await scratchDirectory();
  await sweep(scratch);

  const name = `${crypto.randomUUID()}.part`;
  const handle = await scratch.getFileHandle(name, { create: true });

  try {
    await write(await handle.createWritable());
  } catch (cause) {
    await scratch.removeEntry(name).catch(() => {});
    throw cause;
  }

  // Re-wrapped only to carry the MIME type: a file read out of OPFS has none,
  // and iOS decides what to do with a download partly by that. The wrap is a
  // reference to the same bytes, not a second copy of them.
  const file = await handle.getFile();
  const url = URL.createObjectURL(mime ? new Blob([file], { type: mime }) : file);

  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), SCRATCH_TTL_MS);

  return { ok: true };
}

async function scratchDirectory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(SCRATCH_DIR, { create: true });
}

/** Removes leftovers old enough that nothing can still be downloading them. */
async function sweep(scratch) {
  const cutoff = Date.now() - SCRATCH_TTL_MS;

  for await (const [name, entry] of scratch.entries()) {
    if (entry.kind !== 'file') continue;
    try {
      if ((await entry.getFile()).lastModified < cutoff) await scratch.removeEntry(name);
    } catch {
      // Being unable to tidy up is never a reason to fail the export.
    }
  }
}

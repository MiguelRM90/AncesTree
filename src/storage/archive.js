/**
 * ZIP export and import for a project folder (storage.md, ZIP section).
 *
 * With the project already living as a folder on disk, the ZIP is not the
 * persistence layer — it is the way to hand the archive to a relative as a
 * single file. Compressing the folder from the file explorer produces an
 * equally valid archive; what the app adds is a fresh manifest, the GEDCOM
 * (phase 2) and integrity checking.
 */

import { ZipWriter } from './zip/write.js';
import { openArchive, findEntry, ZipError } from './zip/read.js';
import { Crc32 } from './zip/crc32.js';
import {
  FAMILY_FILE,
  MANIFEST_FILE,
  BACKUPS_DIR,
  StorageError,
  buildManifest,
  loadProject,
} from './project-store.js';
import { parseProject } from '../domain/model/schema.js';
import { SCHEMA_VERSION } from '../domain/model/factories.js';
import { exportGedcom } from '../domain/gedcom/export.js';
import { MAX_ZIP_ENTRIES, MAX_UNZIPPED_BYTES } from '../config/limits.js';

export const GEDCOM_FILE = 'family.ged';

const ZIP_TYPES = [{ description: 'AncesTree archive', accept: { 'application/zip': ['.zip'] } }];
const GEDCOM_TYPES = [
  { description: 'GEDCOM file', accept: { 'text/vnd.familysearch.gedcom': ['.ged'] } },
];

/**
 * Writes family.ged next to family.json, so the project folder always carries a
 * copy other genealogy software can read. Called on save and included in the
 * ZIP; the JSON remains the source of truth.
 */
export async function writeGedcom(dirHandle, project) {
  const handle = await dirHandle.getFileHandle(GEDCOM_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(exportGedcom(project));
  await writable.close();
}

/** Exports a standalone .ged to wherever the user chooses. Requires a gesture. */
export async function exportGedcomFile(project) {
  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: `${safeFileName(project.project.title)}.ged`,
      types: GEDCOM_TYPES,
    });
  } catch (cause) {
    if (cause.name === 'AbortError') return { ok: false, cancelled: true };
    throw new StorageError('PICKER_FAILED', 'Could not open the save dialog', cause);
  }

  const writable = await fileHandle.createWritable();
  await writable.write(exportGedcom(project));
  await writable.close();

  return { ok: true, persons: project.persons.length };
}

// --- Export ----------------------------------------------------------------

/**
 * Writes the whole project to a ZIP chosen by the user.
 *
 * The archive is streamed straight to disk, so project size is bounded by the
 * disk rather than by RAM. Requires a user gesture.
 *
 * @returns {Promise<{ok: boolean, cancelled?: boolean, entries?: number}>}
 */
export async function exportProject(dirHandle, project) {
  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: `${safeFileName(project.project.title)}.zip`,
      types: ZIP_TYPES,
    });
  } catch (cause) {
    if (cause.name === 'AbortError') return { ok: false, cancelled: true };
    throw new StorageError('PICKER_FAILED', 'Could not open the save dialog', cause);
  }

  const writable = await fileHandle.createWritable();
  const zip = new ZipWriter(writable);
  const encoder = new TextEncoder();
  let entries = 0;

  // The manifest goes first so a reader can identify the archive without
  // decompressing anything else.
  await zip.addBytes(MANIFEST_FILE, encoder.encode(stringify(buildManifest(project))));
  await zip.addBytes(FAMILY_FILE, encoder.encode(stringify(project)));

  // Regenerated rather than copied: whatever is on disk may predate the last
  // edits, and an archive handed to a relative should carry a current GEDCOM.
  await zip.addBytes(GEDCOM_FILE, encoder.encode(exportGedcom(project)));
  entries += 3;

  for await (const { path, handle } of walk(dirHandle)) {
    // Skipped: rebuilt on export, or local history that should not travel.
    if (path === FAMILY_FILE || path === MANIFEST_FILE || path === GEDCOM_FILE) continue;
    if (path === BACKUPS_DIR || path.startsWith(`${BACKUPS_DIR}/`)) continue;

    await zip.addFile(path, await handle.getFile());
    entries += 1;
  }

  await zip.close();
  return { ok: true, entries };
}

async function* walk(dirHandle, prefix = '') {
  for await (const [name, entry] of dirHandle.entries()) {
    const path = prefix === '' ? name : `${prefix}/${name}`;
    if (entry.kind === 'file') yield { path, handle: entry };
    else yield* walk(entry, path);
  }
}

// --- Import ----------------------------------------------------------------

/** Opens the file picker for an archive. Requires a user gesture. */
export async function pickArchive() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: ZIP_TYPES, multiple: false });
    return await handle.getFile();
  } catch (cause) {
    if (cause.name === 'AbortError') return null;
    throw new StorageError('PICKER_FAILED', 'Could not open the file picker', cause);
  }
}

/**
 * Reads the central directory and family.json without extracting anything, so
 * the user can be shown what they are about to import and the limits can be
 * enforced before any content is touched.
 *
 * @returns {Promise<{archive: object, manifest: object|null, project: object, counts: object}>}
 */
export async function inspectArchive(file) {
  let archive;
  try {
    archive = await openArchive(file);
  } catch (cause) {
    if (cause instanceof ZipError) throw new StorageError(cause.code, cause.message, cause);
    throw cause;
  }

  if (archive.entries.length > MAX_ZIP_ENTRIES) {
    throw new StorageError('TOO_MANY_ENTRIES', `Archive holds more than ${MAX_ZIP_ENTRIES} files`);
  }

  // A zip bomb expands to gigabytes from a few kilobytes: the declared sizes
  // are checked before anything is decompressed.
  if (archive.totalBytes > MAX_UNZIPPED_BYTES) {
    throw new StorageError('TOO_LARGE', 'Archive expands beyond the allowed maximum');
  }

  const familyEntry = findEntry(archive, FAMILY_FILE);
  if (!familyEntry) {
    throw new StorageError('NOT_A_PROJECT', 'This ZIP has no family.json at its root');
  }

  const manifest = await readJsonEntry(archive, MANIFEST_FILE);
  if (manifest && manifest.schemaVersion > SCHEMA_VERSION) {
    throw new StorageError(
      'FUTURE_VERSION',
      `This archive was created with a newer version of AncesTree (schema v${manifest.schemaVersion}).`,
    );
  }

  const parsed = parseProject(new TextDecoder().decode(await archive.bytes(familyEntry)));
  if (!parsed.ok) {
    throw new StorageError('INVALID_PROJECT', parsed.errors.map((e) => e.message).join('; '));
  }

  return {
    archive,
    manifest,
    project: parsed.data,
    counts: {
      persons: parsed.data.persons.length,
      unions: parsed.data.unions.length,
      media: parsed.data.media.length,
      files: archive.entries.length,
      bytes: archive.totalBytes,
    },
  };
}

/**
 * Extracts every entry into a folder chosen by the user, then opens it.
 *
 * This is the default strategy: it never touches anything that already exists.
 */
export async function importAsNewProject(inspection) {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'ancestree-import' });
  } catch (cause) {
    if (cause.name === 'AbortError') return { ok: false, cancelled: true };
    throw new StorageError('PICKER_FAILED', 'Could not open the folder picker', cause);
  }

  if (await hasEntry(dirHandle, FAMILY_FILE)) {
    throw new StorageError('NOT_EMPTY', 'That folder already contains an AncesTree project');
  }

  const warnings = await extractAll(inspection.archive, dirHandle);
  const project = await loadProject(dirHandle);

  return { ok: true, project, dirHandle, warnings };
}

/**
 * Copies the media the current project is missing and returns the merged graph.
 *
 * Files are written before the graph is updated, so there is never a moment
 * where a MediaObject points at a file that is not on disk yet.
 */
export async function importByMerging(inspection, dirHandle, currentProject) {
  const { archive, project: incoming } = inspection;
  const known = new Set(currentProject.media.map((item) => item.path));
  const warnings = [];

  for (const item of incoming.media) {
    if (known.has(item.path)) continue;
    const entry = findEntry(archive, item.path);
    if (!entry) {
      warnings.push({ path: item.path, reason: 'MISSING_IN_ARCHIVE' });
      continue;
    }
    warnings.push(...(await extractEntry(archive, entry, dirHandle)));
  }

  return { ok: true, incoming, warnings };
}

// --- Extraction ------------------------------------------------------------

async function extractAll(archive, dirHandle) {
  const warnings = [];

  for (const entry of archive.entries) {
    if (entry.isDirectory) continue;
    warnings.push(...(await extractEntry(archive, entry, dirHandle)));
  }

  return warnings;
}

/**
 * Writes one entry to disk, verifying its CRC-32 as it streams.
 *
 * Integrity is checked with the CRC the ZIP format already carries rather than
 * by re-hashing the file: it can be computed incrementally, so a 50 MB photo is
 * verified without ever being held in memory. WebCrypto has no streaming
 * SHA-256, so hash checking would have meant buffering every file.
 */
async function extractEntry(archive, entry, dirHandle) {
  const stream = await archive.stream(entry);
  const fileHandle = await resolveFile(dirHandle, entry.path);
  const writable = await fileHandle.createWritable();

  const crc = new Crc32();
  const tap = new TransformStream({
    transform(chunk, controller) {
      crc.update(chunk);
      controller.enqueue(chunk);
    },
  });

  await stream.pipeThrough(tap).pipeTo(writable);

  // A mismatch is reported, not thrown: one damaged photo must not abort the
  // import of an entire family archive.
  return crc.value === entry.crc ? [] : [{ path: entry.path, reason: 'CRC_MISMATCH' }];
}

/** Creates the intermediate folders and returns the file handle. */
async function resolveFile(dirHandle, path) {
  const segments = path.split('/');
  const fileName = segments.pop();

  let current = dirHandle;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }

  return current.getFileHandle(fileName, { create: true });
}

// --- Helpers ---------------------------------------------------------------

async function readJsonEntry(archive, path) {
  const entry = findEntry(archive, path);
  if (!entry) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await archive.bytes(entry)));
  } catch {
    return null;
  }
}

async function hasEntry(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

const stringify = (value) => JSON.stringify(value, null, 2);

/** Keeps the family name recognisable while staying a valid file name. */
function safeFileName(title) {
  const cleaned = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim();
  return cleaned === '' ? 'family' : cleaned;
}

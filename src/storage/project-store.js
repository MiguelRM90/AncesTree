/**
 * Reading and writing the project folder (storage.md).
 *
 * The WHOLE project is a folder on disk. family.json is read when opening, kept
 * in memory while working, and rewritten on save.
 */

import { parseProject, validateProject } from '../domain/model/schema.js';
import { createProject, APP_VERSION, SCHEMA_VERSION } from '../domain/model/factories.js';
import { MAX_JSON_BYTES, BACKUP_COPIES } from '../config/limits.js';

export const FAMILY_FILE = 'family.json';
export const MANIFEST_FILE = 'manifest.json';
export const PHOTOS_DIR = 'photos';
export const DOCUMENTS_DIR = 'documents';
export const BACKUPS_DIR = 'backups';

export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.code = code;
  }
}

/** Opens the folder picker. Requires a user gesture. */
export async function pickDirectory() {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite', id: 'ancestree-project' });
  } catch (cause) {
    if (cause.name === 'AbortError') return null; // user cancelled
    throw new StorageError('PICKER_FAILED', 'Could not open the folder picker', cause);
  }
}

/** Creates the structure of a new project inside an empty folder. */
export async function createProjectIn(dirHandle, title) {
  const existing = await fileIfExists(dirHandle, FAMILY_FILE);
  if (existing) {
    throw new StorageError('NOT_EMPTY', 'That folder already contains an AncesTree project');
  }

  const project = createProject({ title });
  await dirHandle.getDirectoryHandle(PHOTOS_DIR, { create: true });
  await dirHandle.getDirectoryHandle(DOCUMENTS_DIR, { create: true });
  await dirHandle.getDirectoryHandle(BACKUPS_DIR, { create: true });
  await writeProject(dirHandle, project);

  return project;
}

/**
 * Loads an existing project.
 *
 * manifest.json is read FIRST: it validates the version and detects a folder
 * that is not ours without reading the whole graph.
 */
export async function loadProject(dirHandle) {
  const manifest = await readManifest(dirHandle);
  if (manifest && manifest.schemaVersion > SCHEMA_VERSION) {
    throw new StorageError(
      'FUTURE_VERSION',
      `This project was created with a newer version of AncesTree (schema v${manifest.schemaVersion}).`,
    );
  }

  const file = await fileIfExists(dirHandle, FAMILY_FILE);
  if (!file) throw new StorageError('NOT_A_PROJECT', 'No family.json in that folder');

  if (file.size > MAX_JSON_BYTES) {
    throw new StorageError('TOO_LARGE', 'family.json is larger than the allowed maximum');
  }

  const result = parseProject(await file.text());
  if (!result.ok) {
    throw new StorageError('INVALID_PROJECT', result.errors.map((e) => e.message).join('; '));
  }

  return result.data;
}

/**
 * Writes family.json in full, plus the manifest.
 *
 * The whole file is rewritten on every save: it is small, and a complete write
 * avoids an entire class of partial-consistency bugs. createWritable() writes
 * to a temporary file and commits on close(), so a failure half-way does not
 * corrupt the existing file.
 */
export async function writeProject(dirHandle, project) {
  const shaped = validateProject(project);
  if (!shaped.ok) {
    throw new StorageError('INVALID_PROJECT', shaped.errors.map((e) => e.message).join('; '));
  }

  await rotateBackup(dirHandle);

  const payload = {
    ...project,
    project: { ...project.project, updatedAt: new Date().toISOString() },
  };

  await writeFile(dirHandle, FAMILY_FILE, JSON.stringify(payload, null, 2));
  await writeFile(dirHandle, MANIFEST_FILE, JSON.stringify(buildManifest(payload), null, 2));

  return payload;
}

export function buildManifest(project) {
  return {
    schemaVersion: project.schemaVersion,
    projectId: project.project.id,
    title: project.project.title,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    encrypted: false,
    counts: {
      persons: project.persons.length,
      unions: project.unions.length,
      parentChildren: project.parentChildren.length,
      media: project.media.length,
    },
  };
}

async function readManifest(dirHandle) {
  const file = await fileIfExists(dirHandle, MANIFEST_FILE);
  if (!file) return null;
  try {
    return JSON.parse(await file.text());
  } catch {
    return null; // an unreadable manifest does not block opening: family.json wins
  }
}

/** Rotating copy before overwriting. Keeps the last BACKUP_COPIES. */
async function rotateBackup(dirHandle) {
  const current = await fileIfExists(dirHandle, FAMILY_FILE);
  if (!current) return;

  const backups = await dirHandle.getDirectoryHandle(BACKUPS_DIR, { create: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  await writeFile(backups, `family-${stamp}.json`, await current.text());

  const names = [];
  for await (const [name, entry] of backups.entries()) {
    if (entry.kind === 'file' && name.startsWith('family-')) names.push(name);
  }
  names.sort();
  for (const name of names.slice(0, Math.max(0, names.length - BACKUP_COPIES))) {
    await backups.removeEntry(name);
  }
}

async function writeFile(dirHandle, name, contents) {
  const handle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close(); // atomic commit
}

async function fileIfExists(dirHandle, name) {
  try {
    const handle = await dirHandle.getFileHandle(name);
    return await handle.getFile();
  } catch (cause) {
    if (cause.name === 'NotFoundError') return null;
    throw new StorageError('READ_FAILED', `Could not read ${name}`, cause);
  }
}

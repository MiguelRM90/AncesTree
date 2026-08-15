/**
 * Projects kept in the browser's own storage (storage.md, BROWSER mode).
 *
 * Where there is no folder picker there is no folder to pick, so the app keeps
 * its archives under `projects/<slug>/` in the origin private file system. Each
 * one has exactly the same layout as a folder on disk — family.json, photos/,
 * documents/, backups/ — because it is handed to the same code.
 *
 * What is different, and what the interface has to be honest about: this is
 * browser storage. The user cannot see it in a file manager, cannot copy it,
 * and can wipe all of it by clearing site data. Exporting a ZIP is the only way
 * a copy leaves the browser, which is why the app keeps saying so.
 */

import { StorageError } from './error.js';
import { MANIFEST_FILE } from './names.js';

const PROJECTS_DIR = 'projects';

/** The folder holding every browser-stored project. */
async function projectsRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(PROJECTS_DIR, { create: true });
}

/**
 * A fresh, empty folder for a new project.
 *
 * The name is derived from the title so that the ZIP a user exports and the
 * folder it came from are recognisably the same archive, with a counter to keep
 * two families called "Gil" apart.
 */
export async function createBrowserFolder(title) {
  const root = await projectsRoot();
  const name = await freeName(root, slug(title));
  return root.getDirectoryHandle(name, { create: true });
}

/** Reopens one by folder name. */
export async function browserFolder(name) {
  try {
    return await (await projectsRoot()).getDirectoryHandle(name);
  } catch (cause) {
    if (cause.name === 'NotFoundError') return null;
    throw new StorageError('READ_FAILED', 'Could not open that archive', cause);
  }
}

/**
 * Every project in browser storage, most recently saved first.
 *
 * Read from the folders themselves rather than from the list in IndexedDB: the
 * folders are the truth, and a user who cleared IndexedDB but not their storage
 * would otherwise be told they have no archives while the data is still there.
 */
export async function browserProjects() {
  const root = await projectsRoot();
  const found = [];

  for await (const [name, entry] of root.entries()) {
    if (entry.kind !== 'directory') continue;
    const manifest = await readManifest(entry);
    if (!manifest) continue; // a folder of ours always has one
    found.push({
      name,
      title: manifest.title ?? name,
      savedAt: manifest.exportedAt ?? null,
      persons: manifest.counts?.persons ?? 0,
    });
  }

  return found.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

/** Deletes a project and everything in it. There is no undo for this. */
export async function removeBrowserFolder(name) {
  const root = await projectsRoot();
  await root.removeEntry(name, { recursive: true });
}

/**
 * Asks the browser to stop counting this origin as evictable.
 *
 * Chromium grants it silently to an installed or well-used site and refuses it
 * otherwise; Safari has never granted it and evicts after seven days without a
 * visit unless the site is on the Home Screen. So the answer is reported, never
 * relied upon — the export is what actually keeps the data.
 */
export async function requestPersistence() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Bytes used and available, or null where the browser will not say. */
export async function storageEstimate() {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    return usage === undefined ? null : { usage, quota: quota ?? null };
  } catch {
    return null;
  }
}

// --- Naming ----------------------------------------------------------------

async function readManifest(dirHandle) {
  try {
    const file = await (await dirHandle.getFileHandle(MANIFEST_FILE)).getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

/**
 * A file name that survives every filesystem: accents folded rather than
 * dropped, so "Muñoz" becomes "munoz" and not "muoz".
 */
function slug(title) {
  const folded = String(title ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return folded === '' ? 'family' : folded;
}

async function freeName(root, base) {
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const name = suffix === 0 ? base : `${base}-${suffix}`;
    if (!(await exists(root, name))) return name;
  }
  throw new StorageError('NAME_TAKEN', 'Too many archives with that name');
}

async function exists(root, name) {
  try {
    await root.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Persistence and permissions for FileSystemDirectoryHandle
 * (storage.md, remembering the folder between sessions).
 *
 * A handle is structured-cloneable, so it can be stored in IndexedDB and
 * recovered next session. The user does not have to hunt for their folder every
 * time.
 */

import { Stores, get, put, getAll, remove } from './idb.js';

export const Permission = { GRANTED: 'granted', PROMPT: 'prompt', DENIED: 'denied' };

export async function rememberProject(projectId, title, handle) {
  await put(Stores.HANDLES, { key: projectId, handle });
  await put(Stores.PROJECTS, {
    id: projectId,
    title,
    folderName: handle.name,
    openedAt: new Date().toISOString(),
  });
}

/** Most recently opened first. */
export async function recentProjects() {
  const projects = await getAll(Stores.PROJECTS);
  return projects.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
}

/**
 * The last project is simply the most recent one. It used to be recorded
 * separately, which was a third store and a second thing to keep in step for
 * information already present in the first.
 */
export const lastProjectId = async () => (await recentProjects())[0]?.id ?? null;

export async function handleFor(projectId) {
  const row = await get(Stores.HANDLES, projectId);
  return row?.handle ?? null;
}

export async function forgetProject(projectId) {
  await remove(Stores.HANDLES, projectId);
  await remove(Stores.PROJECTS, projectId);
}

/**
 * Permission state without prompting. Safe to call on startup.
 *
 * A handle from the origin private file system has no queryPermission at all,
 * and that absence is the answer rather than a failure: the browser owns that
 * storage, so there is no one to ask. Only a handle to the user's own disk
 * carries a permission to check.
 */
export async function permissionState(handle) {
  if (!handle) return Permission.DENIED;
  if (typeof handle.queryPermission !== 'function') return Permission.GRANTED;
  return handle.queryPermission({ mode: 'readwrite' });
}

/**
 * Requests write permission.
 *
 * IMPORTANT: requestPermission() requires a user gesture. It is called from the
 * "Reopen <project>" button, NEVER automatically on page load.
 */
export async function requestPermission(handle) {
  if (!handle) return Permission.DENIED;
  if (typeof handle.requestPermission !== 'function') return Permission.GRANTED;
  return handle.requestPermission({ mode: 'readwrite' });
}

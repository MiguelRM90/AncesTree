/**
 * High-level operations on the project.
 *
 * The UI never talks to storage/ directly (architecture.md > Regla de
 * dependencias): everything that touches the disk goes through here.
 */

import { store } from './store.js';
import { pickDirectory, createProjectIn, StorageError } from '../storage/project-store.js';
import {
  handleFor,
  lastProjectId,
  permissionState,
  requestPermission,
  forgetProject,
  recentProjects,
  Permission,
} from '../storage/handles.js';
import {
  exportProject,
  pickArchive,
  inspectArchive,
  importAsNewProject,
  importByMerging,
} from '../storage/archive.js';
import { createPerson, createUnion, createParentChild } from '../domain/model/factories.js';
import { unionsOf, partnerIn } from '../domain/graph/queries.js';

export { recentProjects };

// --- Project lifecycle -----------------------------------------------------

/** Creates a project in a folder chosen by the user. Requires a user gesture. */
export async function newProject(title) {
  const dirHandle = await pickDirectory();
  if (!dirHandle) return { ok: false, cancelled: true };

  const project = await createProjectIn(dirHandle, title);
  await store.adoptNew(project, dirHandle);
  return { ok: true };
}

/** Opens an existing project. Requires a user gesture. */
export async function openProject() {
  const dirHandle = await pickDirectory();
  if (!dirHandle) return { ok: false, cancelled: true };

  await store.open(dirHandle);
  return { ok: true };
}

/**
 * Reopens the last project using the stored handle.
 *
 * Called from a button, never on page load: requestPermission() requires a
 * user gesture.
 */
export async function reopenProject(projectId) {
  const id = projectId ?? (await lastProjectId());
  if (!id) return { ok: false, reason: 'none' };

  const handle = await handleFor(id);
  if (!handle) return { ok: false, reason: 'none' };

  let state = await permissionState(handle);
  if (state === Permission.PROMPT) state = await requestPermission(handle);
  if (state !== Permission.GRANTED) return { ok: false, reason: 'denied' };

  try {
    await store.open(handle);
    return { ok: true };
  } catch (error) {
    // Folder moved or deleted: the stored handle is worthless now.
    if (error instanceof StorageError && error.code !== 'FUTURE_VERSION') {
      await forgetProject(id);
    }
    return { ok: false, reason: 'missing', error };
  }
}

/** Is there a recent project worth offering to reopen? */
export async function lastProjectSummary() {
  const id = await lastProjectId();
  if (!id) return null;
  const projects = await recentProjects();
  return projects.find((p) => p.id === id) ?? null;
}

// --- Archives --------------------------------------------------------------

/** Exports the open project to a ZIP. Requires a user gesture. */
export function exportArchive() {
  if (!store.isOpen) return Promise.resolve({ ok: false, reason: 'none' });
  return exportProject(store.directoryHandle, store.project);
}

/**
 * Picks an archive and reads what is inside it, without extracting anything.
 * The caller shows the summary and decides the strategy: the app always asks,
 * it never decides on its own (storage.md, merge on import).
 */
export async function beginImport() {
  const file = await pickArchive();
  if (!file) return null;
  return inspectArchive(file);
}

/** Extracts into a fresh folder and opens it. Nothing existing is touched. */
export async function finishImportAsNew(inspection) {
  const result = await importAsNewProject(inspection);
  if (result.ok) await store.adoptNew(result.project, result.dirHandle);
  return result;
}

/** Folds the archive into the open project: missing media first, then the graph. */
export async function finishImportByMerge(inspection) {
  const copied = await importByMerging(inspection, store.directoryHandle, store.project);
  if (!copied.ok) return copied;

  const merged = store.mergeIn(copied.incoming);
  return { ...copied, ...merged };
}

// --- Graph mutations -------------------------------------------------------

export function addPerson(fields = {}) {
  const person = createPerson(fields);
  const result = store.apply((p) => ({ ...p, persons: [...p.persons, person] }), {
    label: 'add person',
  });

  if (result.ok && store.focalPersonId === null) store.setFocalPerson(person.id);
  return result.ok ? { ...result, person } : result;
}

export function updatePerson(personId, changes) {
  return store.apply(
    (p) => ({
      ...p,
      persons: p.persons.map((person) =>
        person.id === personId
          ? { ...person, ...changes, updatedAt: new Date().toISOString() }
          : person,
      ),
    }),
    { label: 'edit person' },
  );
}

/** Adds a new parent for an existing person, in one mutation. */
export function addParentFor(childId) {
  const parent = createPerson();
  const link = createParentChild({ parentId: parent.id, childId });

  const result = store.apply(
    (p) => ({
      ...p,
      persons: [...p.persons, parent],
      parentChildren: [...p.parentChildren, link],
    }),
    { label: 'add parent' },
  );

  return result.ok ? { ...result, person: parent } : result;
}

/** Adds a new partner and the union that joins them. */
export function addPartnerFor(personId) {
  const partner = createPerson();
  const union = createUnion({ partner1Id: personId, partner2Id: partner.id });

  const result = store.apply(
    (p) => ({
      ...p,
      persons: [...p.persons, partner],
      unions: [...p.unions, union],
    }),
    { label: 'add partner' },
  );

  return result.ok ? { ...result, person: partner, union } : result;
}

/**
 * Adds a child of an existing person.
 *
 * When that person has exactly one union, the partner is linked as the second
 * parent and both links carry its unionId — which is what makes the sibling
 * rules work later (data-model.md > Consultas derivadas). With zero or several
 * unions the second parent is ambiguous, so only one link is created.
 */
export function addChildFor(parentId) {
  const child = createPerson();
  const unions = unionsOf(store.graph, parentId);
  const union = unions.length === 1 ? unions[0] : null;

  const links = [createParentChild({ parentId, childId: child.id, unionId: union?.id ?? null })];
  if (union) {
    links.push(
      createParentChild({
        parentId: partnerIn(union, parentId),
        childId: child.id,
        unionId: union.id,
      }),
    );
  }

  const result = store.apply(
    (p) => ({
      ...p,
      persons: [...p.persons, child],
      parentChildren: [...p.parentChildren, ...links],
    }),
    { label: 'add child' },
  );

  return result.ok ? { ...result, person: child } : result;
}

export function removeEntity(kind, id) {
  return store.apply(
    (p) => {
      if (kind === 'person') {
        return {
          ...p,
          persons: p.persons.filter((x) => x.id !== id),
          unions: p.unions.filter((u) => u.partner1Id !== id && u.partner2Id !== id),
          parentChildren: p.parentChildren.filter((l) => l.parentId !== id && l.childId !== id),
          settings:
            p.settings.focalPersonId === id
              ? { ...p.settings, focalPersonId: nextFocalAfter(p, id) }
              : p.settings,
        };
      }

      if (kind === 'union') {
        return {
          ...p,
          unions: p.unions.filter((x) => x.id !== id),
          parentChildren: p.parentChildren.map((l) =>
            l.unionId === id ? { ...l, unionId: null } : l,
          ),
        };
      }

      return { ...p, parentChildren: p.parentChildren.filter((x) => x.id !== id) };
    },
    { label: `remove ${kind}` },
  );
}

/** Deleting the focal person must not leave the tree without a root. */
function nextFocalAfter(project, removedId) {
  const survivor = project.persons.find((p) => p.id !== removedId);
  return survivor?.id ?? null;
}

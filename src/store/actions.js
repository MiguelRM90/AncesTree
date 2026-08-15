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
  exportGedcomFile,
  pickArchive,
  inspectArchive,
  importAsNewProject,
  importByMerging,
} from '../storage/archive.js';
import { pickImages, importPhoto } from '../storage/media.js';
import { release } from '../storage/media-cache.js';
import {
  createPerson,
  createUnion,
  createParentChild,
  mediaLink,
  MediaRole,
} from '../domain/model/factories.js';
import { unionsOf, partnerIn, mediaOf } from '../domain/graph/queries.js';

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
 * Exports a GEDCOM for other genealogy software.
 *
 * A projection of the project, not a copy of it: the format cannot hold
 * everything the model does (gedcom-mapping.md). The ZIP is the faithful copy.
 */
export function exportGedcom() {
  if (!store.isOpen) return Promise.resolve({ ok: false, reason: 'none' });
  return exportGedcomFile(store.project);
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

/**
 * How many generations the tree renders around the centred person.
 *
 * This is the only real defence against a huge archive: the window bounds how
 * much is on screen, and therefore how much has to be laid out and painted.
 * Not recorded in the undo history — it is a view setting, not an edit.
 */
export function setGenerationWindow({ up, down }) {
  return store.apply(
    (project) => ({
      ...project,
      settings: {
        ...project.settings,
        maxGenerationsUp: up ?? project.settings.maxGenerationsUp,
        maxGenerationsDown: down ?? project.settings.maxGenerationsDown,
      },
    }),
    { label: 'view depth', record: false },
  );
}

// --- Photos ----------------------------------------------------------------

/**
 * Adds one or more photos to a person.
 *
 * Files are written to disk first and the graph is updated afterwards, in a
 * single mutation: there is never a moment where a MediaObject points at a file
 * that does not exist yet.
 *
 * @returns {Promise<{ok: boolean, added?: number, reused?: number, failed?: object[]}>}
 */
export async function addPhotosFor(personId) {
  if (!store.isOpen) return { ok: false, reason: 'none' };

  const files = await pickImages();
  if (files.length === 0) return { ok: false, cancelled: true };

  const stripExif = store.project.settings.stripExifOnImport;
  const known = store.project.media;

  const fresh = [];
  const reused = [];
  const failed = [];

  for (const file of files) {
    try {
      const result = await importPhoto(store.directoryHandle, file, [...known, ...fresh], {
        stripExif,
      });
      (result.reused ? reused : fresh).push(result.media);
    } catch (error) {
      // One unreadable file must not lose the rest of the selection.
      failed.push({ name: file.name, message: error.message });
    }
  }

  const attaching = [...fresh, ...reused];
  if (attaching.length === 0) return { ok: false, failed };

  const hasPortrait = mediaOf(store.graph, personId).length > 0;

  const result = store.apply(
    (project) => {
      const byId = new Map(project.media.map((item) => [item.id, item]));

      for (const [index, item] of attaching.entries()) {
        const existing = byId.get(item.id) ?? item;
        const alreadyLinked = existing.links.some((link) => link.targetId === personId);

        // The first photo a person gets becomes their portrait.
        const role = !hasPortrait && index === 0 ? MediaRole.PORTRAIT : MediaRole.ATTACHMENT;

        byId.set(item.id, {
          ...existing,
          links: alreadyLinked ? existing.links : [...existing.links, mediaLink(personId, role)],
        });
      }

      return { ...project, media: [...byId.values()] };
    },
    { label: 'add photos' },
  );

  return { ...result, added: fresh.length, reused: reused.length, failed };
}

/** Promotes one photo to be the person's portrait. */
export function setPortrait(mediaId, personId) {
  return store.apply(
    (project) => ({
      ...project,
      media: project.media.map((item) => ({
        ...item,
        links: item.links.map((link) =>
          link.targetId !== personId
            ? link
            : { ...link, role: item.id === mediaId ? MediaRole.PORTRAIT : MediaRole.ATTACHMENT },
        ),
      })),
    }),
    { label: 'set portrait' },
  );
}

/**
 * Detaches a photo from a person.
 *
 * The file on disk is left alone: it may still belong to someone else, and a
 * photo of a group is exactly the case where it does. Files nobody references
 * any more are surfaced as ORPHAN_MEDIA and removed by an explicit maintenance
 * pass, never silently (storage.md, binaries).
 */
export function removePhotoFrom(mediaId, personId) {
  const item = store.graph?.media.get(mediaId);
  const stillUsed = item?.links.some((link) => link.targetId !== personId);
  if (item && !stillUsed) release(item.path);

  return store.apply(
    (project) => ({
      ...project,
      media: project.media
        .map((media) =>
          media.id !== mediaId
            ? media
            : { ...media, links: media.links.filter((link) => link.targetId !== personId) },
        )
        .filter((media) => media.links.length > 0),
    }),
    { label: 'remove photo' },
  );
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

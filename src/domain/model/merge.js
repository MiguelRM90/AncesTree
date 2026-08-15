/**
 * Merging two projects (storage.md, merge on import).
 *
 * Merging is by `Person.id`. Since ids are UUIDs, two projects created
 * independently NEVER collide even when they describe the same person. So this
 * only resolves the real case — one project that diverged across two machines,
 * which is exactly what a family passing the ZIP around ends up with.
 *
 * Detecting duplicates by name and date similarity is deliberately out of
 * scope: that is a data-quality problem and deserves its own review interface.
 */

const COLLECTIONS = ['persons', 'unions', 'parentChildren', 'media'];

/**
 * @returns {{project: object, added: Record<string, number>, kept: Record<string, number>}}
 */
export function mergeProjects(current, incoming) {
  const project = { ...current };
  const added = {};
  const kept = {};

  for (const key of COLLECTIONS) {
    const byId = new Map(current[key].map((item) => [item.id, item]));

    added[key] = 0;
    kept[key] = 0;

    for (const item of incoming[key]) {
      if (byId.has(item.id)) {
        // The local version wins. Overwriting an edit the user made here with
        // an older copy from someone else's ZIP would be the worse surprise.
        kept[key] += 1;
        continue;
      }
      byId.set(item.id, item);
      added[key] += 1;
    }

    project[key] = [...byId.values()];
  }

  return { project, added, kept };
}

/** Media entries in `incoming` that the current project does not already have. */
export function newMediaOf(current, incoming) {
  const known = new Set(current.media.map((item) => item.path));
  return incoming.media.filter((item) => !known.has(item.path));
}

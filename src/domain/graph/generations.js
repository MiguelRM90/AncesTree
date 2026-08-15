/**
 * Phases 0 and 1 of the layout engine (architecture.md, layout section).
 *
 * Prunes the graph around the focal person and assigns a generational level to
 * every survivor. This is what makes performance depend on the visible window
 * rather than on the total size of the tree.
 */

import { parentLinksOf, childLinksOf, unionsOf, partnerIn } from './queries.js';

/**
 * @returns {Map<string, number>} personId -> level. The focal person is 0,
 *   parents are -1, children are +1.
 */
export function assignGenerations(g, focalId, { up = 4, down = 4 } = {}) {
  const levels = new Map();
  if (!focalId || !g.persons.has(focalId)) return levels;

  levels.set(focalId, 0);

  // BFS by distance from the focal person. The first path to reach someone is
  // the shortest, which is exactly the tie-breaker needed when someone is
  // reachable by two routes at different levels (common in consanguineous
  // unions).
  const queue = [focalId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const level = levels.get(currentId);

    if (level > -up) {
      for (const link of parentLinksOf(g, currentId)) {
        visit(link.parentId, level - 1);
      }
    }

    if (level < down) {
      for (const link of childLinksOf(g, currentId)) {
        visit(link.childId, level + 1);
      }
    }

    // Generational offset normalisation: both members of a union are forced to
    // the SAME visual row, whatever their age difference.
    for (const union of unionsOf(g, currentId)) {
      visit(partnerIn(union, currentId), level);
    }
  }

  return levels;

  function visit(personId, level) {
    if (levels.has(personId)) return;
    if (level < -up || level > down) return;
    if (!g.persons.has(personId)) return;
    levels.set(personId, level);
    queue.push(personId);
  }
}

/** Groups by level and returns the rows ordered oldest (top) to newest. */
export function groupByLevel(levels) {
  const rows = new Map();
  for (const [personId, level] of levels) {
    const row = rows.get(level);
    if (row) row.push(personId);
    else rows.set(level, [personId]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

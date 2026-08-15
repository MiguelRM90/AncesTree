/**
 * Graph traversals: ancestors, descendants and cycle detection.
 *
 * Important: cycles are checked over the COMPLETE graph, without filtering by
 * link type. A loop through an adoption is still a loop
 * (validation-rules.md, CYCLE).
 */

import { parentLinksOf, childLinksOf, isBiological } from './queries.js';

/**
 * Ancestors of a person, with the generation they sit at.
 * @returns {Map<string, number>} personId -> generational distance (>= 1)
 */
export function ancestorsOf(g, personId, { maxDepth = Infinity, biologicalOnly = false } = {}) {
  return walk(g, personId, maxDepth, (id) =>
    parentLinksOf(g, id)
      .filter((link) => !biologicalOnly || isBiological(link))
      .map((link) => link.parentId),
  );
}

/** @returns {Map<string, number>} personId -> generational distance (>= 1) */
export function descendantsOf(g, personId, { maxDepth = Infinity, biologicalOnly = false } = {}) {
  return walk(g, personId, maxDepth, (id) =>
    childLinksOf(g, id)
      .filter((link) => !biologicalOnly || isBiological(link))
      .map((link) => link.childId),
  );
}

function walk(g, startId, maxDepth, nextIds) {
  const seen = new Map();
  let frontier = [startId];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    depth += 1;
    const next = [];
    for (const id of frontier) {
      for (const neighbourId of nextIds(id)) {
        if (neighbourId === startId || seen.has(neighbourId)) continue;
        seen.set(neighbourId, depth);
        next.push(neighbourId);
      }
    }
    frontier = next;
  }

  return seen;
}

/**
 * Would adding parentId -> childId create a cycle?
 * Checked BEFORE confirming any new link.
 */
export function wouldCreateCycle(g, parentId, childId) {
  if (parentId === childId) return true;
  return descendantsOf(g, childId).has(parentId);
}

/**
 * Closest common ancestor of two people, for the consanguinity warning.
 * Biological line only.
 *
 * @returns {{ancestorId: string, depthA: number, depthB: number}|null}
 */
export function closestCommonAncestor(g, personAId, personBId, maxDepth) {
  const a = ancestorsOf(g, personAId, { maxDepth, biologicalOnly: true });
  const b = ancestorsOf(g, personBId, { maxDepth, biologicalOnly: true });

  let best = null;
  let bestScore = Infinity;

  for (const [ancestorId, depthA] of a) {
    const depthB = b.get(ancestorId);
    if (depthB === undefined) continue;
    const score = depthA + depthB;
    if (score < bestScore) {
      bestScore = score;
      best = { ancestorId, depthA, depthB };
    }
  }

  return best;
}

/**
 * Phases 0 and 1 of the layout engine (architecture.md, layout section).
 *
 * Picks which people are on screen around the focal person and what row each
 * one sits in. This is the only thing standing between a large archive and an
 * unusable one, so what it does NOT reach matters as much as what it does.
 *
 * The view is a pedigree: ancestors upwards, descendants downwards, the focal
 * person's own siblings and partners for context. It deliberately does not
 * spread sideways through cousins.
 *
 * That distinction is the whole point. A plain breadth-first walk bounded only
 * by generation looks reasonable and is not: from any one person it reaches an
 * ancestor, then every child of that ancestor, then their partners, then their
 * children, and so on across the entire generational band. Measured on a
 * 10,000-person archive, one generation up and down reached 2,439 people, and
 * four reached 9,981 — the whole file. Bounding depth without bounding breadth
 * bounds nothing.
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

  /** @returns {boolean} whether this person was newly placed */
  const place = (personId, level) => {
    if (levels.has(personId) || !g.persons.has(personId)) return false;
    if (level < -up || level > down) return false;
    levels.set(personId, level);
    return true;
  };

  // Generational offset normalisation: both members of a union are forced to
  // the SAME visual row, whatever their age difference.
  const placePartners = (personId, level) => {
    for (const union of unionsOf(g, personId)) place(partnerIn(union, personId), level);
  };

  placePartners(focalId, 0);

  // --- Upwards: parents, their parents, and so on ---------------------------
  // Both parents come along naturally, so couples stay intact. Their other
  // partners and their siblings do not: that is where the sideways explosion
  // used to start.
  let frontier = [focalId];

  for (let depth = 1; depth <= up && frontier.length > 0; depth += 1) {
    const next = [];
    for (const personId of frontier) {
      for (const link of parentLinksOf(g, personId)) {
        if (place(link.parentId, -depth)) next.push(link.parentId);
      }
    }
    frontier = next;
  }

  // --- Sideways, exactly once: the focal person's own siblings --------------
  if (up >= 1) {
    for (const link of parentLinksOf(g, focalId)) {
      for (const sibling of childLinksOf(g, link.parentId)) place(sibling.childId, 0);
    }
  }

  // --- Downwards: children, their children, and so on -----------------------
  // Each descendant brings their partner, without which the union node and the
  // generation below it would make no sense.
  frontier = [focalId];

  for (let depth = 1; depth <= down && frontier.length > 0; depth += 1) {
    const next = [];
    for (const personId of frontier) {
      for (const link of childLinksOf(g, personId)) {
        if (!place(link.childId, depth)) continue;
        placePartners(link.childId, depth);
        next.push(link.childId);
      }
    }
    frontier = next;
  }

  return levels;
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

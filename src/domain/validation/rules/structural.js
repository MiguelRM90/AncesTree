/**
 * Structural rules: all ERROR (validation-rules.md).
 *
 * These are integrity violations, not judgements about the data. They block
 * saving.
 */

import { Severity, issue, subject } from '../issue.js';
import { wouldCreateCycle } from '../../graph/traversal.js';
import { isBiological } from '../../graph/queries.js';

const E = Severity.ERROR;

/** A person cannot be their own parent. */
function selfParent(g) {
  const found = [];
  for (const link of g.parentChildren.values()) {
    if (link.parentId === link.childId) {
      found.push(
        issue('SELF_PARENT', E, [subject('parentChild', link.id), subject('person', link.parentId)],
          'validation.selfParent'),
      );
    }
  }
  return found;
}

/** Both members of a union cannot be the same person. */
function selfUnion(g) {
  const found = [];
  for (const union of g.unions.values()) {
    if (union.partner1Id === union.partner2Id) {
      found.push(issue('SELF_UNION', E, [subject('union', union.id)], 'validation.selfUnion'));
    }
  }
  return found;
}

/**
 * An ancestor cannot be a descendant of their own descendants.
 *
 * Evaluated over the complete graph without filtering by type: a loop through
 * an adoption is still a loop.
 */
function cycles(g) {
  const found = [];
  const reported = new Set();

  for (const link of g.parentChildren.values()) {
    if (link.parentId === link.childId) continue; // covered by SELF_PARENT
    const key = [link.parentId, link.childId].sort().join('|');
    if (reported.has(key)) continue;

    // The link itself is removed from the graph before asking, otherwise every
    // edge would detect itself as a cycle.
    if (reachesThroughOtherPath(g, link)) {
      reported.add(key);
      found.push(
        issue('CYCLE', E, [subject('parentChild', link.id)], 'validation.cycle', {
          parentId: link.parentId,
          childId: link.childId,
        }),
      );
    }
  }

  return found;
}

function reachesThroughOtherPath(g, link) {
  const trimmed = {
    ...g,
    parentChildren: new Map([...g.parentChildren].filter(([id]) => id !== link.id)),
    childrenByParent: filterLinks(g.childrenByParent, link.id),
    parentsByChild: filterLinks(g.parentsByChild, link.id),
  };
  return wouldCreateCycle(trimmed, link.parentId, link.childId);
}

function filterLinks(map, excludeId) {
  const next = new Map();
  for (const [key, links] of map) {
    const kept = links.filter((l) => l.id !== excludeId);
    if (kept.length > 0) next.set(key, kept);
  }
  return next;
}

/** There cannot be two links with the same parent + child pair. */
function duplicateEdges(g) {
  const seen = new Map();
  const found = [];

  for (const link of g.parentChildren.values()) {
    const key = `${link.parentId}|${link.childId}`;
    const first = seen.get(key);
    if (first) {
      found.push(
        issue('DUPLICATE_EDGE', E, [subject('parentChild', first), subject('parentChild', link.id)],
          'validation.duplicateEdge'),
      );
    } else {
      seen.set(key, link.id);
    }
  }

  return found;
}

/** At most two biological parents per child. */
function tooManyBiologicalParents(g) {
  const found = [];
  for (const [childId, links] of g.parentsByChild) {
    const count = links.filter(isBiological).length;
    if (count > 2) {
      found.push(
        issue('TOO_MANY_BIO_PARENTS', E, [subject('person', childId)],
          'validation.tooManyBiologicalParents', { count }),
      );
    }
  }
  return found;
}

/** Every id reference must resolve to an existing entity. */
function danglingRefs(g) {
  const found = [];

  const check = (ownerType, ownerId, refType, refId, field) => {
    if (refId === null || refId === undefined) return;
    const pool = refType === 'person' ? g.persons : g.unions;
    if (!pool.has(refId)) {
      found.push(
        issue('DANGLING_REF', E, [subject(ownerType, ownerId)], 'validation.danglingRef', {
          field,
          refId,
        }),
      );
    }
  };

  for (const link of g.parentChildren.values()) {
    check('parentChild', link.id, 'person', link.parentId, 'parentId');
    check('parentChild', link.id, 'person', link.childId, 'childId');
    check('parentChild', link.id, 'union', link.unionId, 'unionId');
  }

  for (const union of g.unions.values()) {
    check('union', union.id, 'person', union.partner1Id, 'partner1Id');
    check('union', union.id, 'person', union.partner2Id, 'partner2Id');
  }

  return found;
}

export const structuralRules = [
  selfParent,
  selfUnion,
  cycles,
  duplicateEdges,
  tooManyBiologicalParents,
  danglingRefs,
];

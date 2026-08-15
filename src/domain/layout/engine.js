/**
 * Layout engine, phases 0 to 3 (architecture.md, layout section).
 *
 * NO DOM. It produces a description of rows, nodes and edges; painting it is
 * the job of ui/components/tree-canvas.js. That separation is what allows the
 * layout to be tested without a browser.
 *
 *   Phase 0  Prune around the focal person -> generations.js
 *   Phase 1  Level assignment              -> generations.js
 *   Phase 2  Synthetic union nodes         -> here
 *   Phase 3  Ordering and spacers          -> here
 */

import { assignGenerations, groupByLevel } from '../graph/generations.js';
import { childrenOfUnion, sortByBirth, unionsOf, partnerIn } from '../graph/queries.js';

export const NodeType = { PERSON: 'person', UNION: 'union', SPACER: 'spacer' };

/**
 * @typedef {Object} LayoutNode
 * @property {string} type  'person' | 'union' | 'spacer'
 * @property {string} id    node id, unique within the layout
 * @property {string} [entityId]
 * @property {number} level
 *
 * @typedef {Object} LayoutEdge
 * @property {string} id
 * @property {'partner'|'descent'} kind
 * @property {string} fromNodeId
 * @property {string} toNodeId
 */

/**
 * @returns {{rows: Array<{level: number, nodes: LayoutNode[]}>, edges: LayoutEdge[], levels: Map<string, number>}}
 */
export function buildLayout(g, focalId, { up = 4, down = 4 } = {}) {
  const levels = assignGenerations(g, focalId, { up, down });
  if (levels.size === 0) return { rows: [], edges: [], levels };

  const visible = new Set(levels.keys());
  const rows = [];
  const edges = [];
  const placed = new Set();

  for (const [level, personIds] of groupByLevel(levels)) {
    const nodes = [];

    // Phase 2: unions do not connect the cards to each other. An intermediate
    // node is inserted, and a single vertical line descends from it towards the
    // children. Without it, N children x 2 parents produce 2N crossing lines.
    for (const personId of sortRow(g, personIds)) {
      if (placed.has(personId)) continue;

      const unions = unionsOf(g, personId).filter((u) => visible.has(partnerIn(u, personId)));

      if (unions.length === 0) {
        nodes.push(personNode(personId, level));
        placed.add(personId);
        continue;
      }

      nodes.push(personNode(personId, level));
      placed.add(personId);

      for (const union of unions) {
        const partnerId = partnerIn(union, personId);
        if (placed.has(partnerId)) continue;

        const unionNodeId = `u:${union.id}`;
        nodes.push({ type: NodeType.UNION, id: unionNodeId, entityId: union.id, level });
        nodes.push(personNode(partnerId, level));
        placed.add(partnerId);

        edges.push(edge('partner', `p:${personId}`, unionNodeId));
        edges.push(edge('partner', `p:${partnerId}`, unionNodeId));

        for (const child of childrenOfUnion(g, union)) {
          if (!visible.has(child.id)) continue;
          edges.push(edge('descent', unionNodeId, `p:${child.id}`));
        }
      }

      // Phase 3: separator between family branches. An empty, invisible element
      // that reserves space to avoid overlap and keep the layout symmetric.
      // NOT to be confused with the model's placeholder people: this is purely
      // visual.
      nodes.push({ type: NodeType.SPACER, id: `s:${personId}`, level });
    }

    rows.push({ level, nodes });
  }

  // Parents with no visible union: the line descends straight from the card.
  for (const link of g.parentChildren.values()) {
    if (!visible.has(link.parentId) || !visible.has(link.childId)) continue;
    if (link.unionId && g.unions.has(link.unionId)) continue;
    edges.push(edge('descent', `p:${link.parentId}`, `p:${link.childId}`));
  }

  return { rows, edges, levels };
}

const personNode = (personId, level) => ({
  type: NodeType.PERSON,
  id: `p:${personId}`,
  entityId: personId,
  level,
});

const edge = (kind, fromNodeId, toNodeId) => ({
  id: `${kind}:${fromNodeId}->${toNodeId}`,
  kind,
  fromNodeId,
  toNodeId,
});

/**
 * Ordering within the row. For now by birth date, unknown dates last.
 *
 * TODO: barycentre heuristic to minimise crossings between branches
 * (architecture.md, phase 3). It needs the previous row's layout, so it is left
 * until the basic render is stable.
 */
function sortRow(g, personIds) {
  const persons = personIds.map((id) => g.persons.get(id)).filter(Boolean);
  return sortByBirth(persons).map((p) => p.id);
}

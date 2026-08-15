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
import {
  childrenOfUnion,
  sortByBirth,
  unionsOf,
  partnerIn,
  parentLinksOf,
  childLinksOf,
} from '../graph/queries.js';

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

  const grouped = groupByLevel(levels);
  const visible = new Set(levels.keys());

  // Phase 2: unions do not connect the cards to each other. Each couple gets an
  // intermediate node, and a single vertical line descends from it towards the
  // children. Without it, N children x 2 parents produce 2N crossing lines.
  const blocksByLevel = new Map(
    grouped.map(([level, ids]) => [level, buildBlocks(g, new Set(ids))]),
  );

  const ordered = orderRows(g, blocksByLevel, levels);

  return { ...emit(g, ordered, visible), levels };
}

/**
 * A block is one couple, or one person with no visible partner. Blocks are the
 * unit that gets ordered, because a couple that drifts apart in a row is a
 * couple whose connecting line crosses everyone in between.
 */
function buildBlocks(g, ids) {
  const placed = new Set();
  const blocks = [];

  for (const person of sortByBirth([...ids].map((id) => g.persons.get(id)).filter(Boolean))) {
    if (placed.has(person.id)) continue;
    placed.add(person.id);

    const items = [{ type: NodeType.PERSON, entityId: person.id }];
    const members = [person.id];

    for (const union of unionsOf(g, person.id)) {
      const partnerId = partnerIn(union, person.id);
      if (!ids.has(partnerId) || placed.has(partnerId)) continue;

      placed.add(partnerId);
      items.push(
        { type: NodeType.UNION, entityId: union.id },
        { type: NodeType.PERSON, entityId: partnerId },
      );
      members.push(partnerId);
    }

    blocks.push({ items, members, birth: person.birth?.date?.earliest ?? null });
  }

  return blocks;
}

/**
 * Phase 3: put each row in an order that keeps families together.
 *
 * Ordering rows by birth date alone looked harmless and was not: the three
 * children of one couple ended up first, sixth and ninth in their row, with
 * other people's spouses in between, so the bar joining them ran straight over
 * three strangers and read as though they were all siblings.
 *
 * Descendant rows follow the position of their parents; ancestor rows follow
 * the position of their children. Both directions radiate outwards from the
 * focal row, which is what makes a pedigree read correctly.
 */
function orderRows(g, blocksByLevel, levels) {
  const position = new Map();
  const result = new Map();

  /** The leading member decides where the block sorts, so birth follows it. */
  const withLead = (block) => ({
    ...block,
    birth: g.persons.get(block.members[0])?.birth?.date?.earliest ?? null,
  });

  const commit = (level, blocks) => {
    result.set(level, blocks);
    let index = 0;
    for (const block of blocks) {
      for (const memberId of block.members) position.set(memberId, index);
      index += 1;
    }
  };

  /** Where in the neighbouring row this person's relatives sit. */
  const anchorOfPerson = (personId, linksOf, endOf) => {
    let nearest = Infinity;
    for (const link of linksOf(g, personId)) {
      const at = position.get(endOf(link));
      if (at !== undefined && at < nearest) nearest = at;
    }
    return nearest;
  };

  const anchorOf = (block, linksOf, endOf) =>
    Math.min(...block.members.map((id) => anchorOfPerson(id, linksOf, endOf)));

  /**
   * Within a couple, the one connected to the neighbouring row goes first.
   * Otherwise the married-in spouse sits between their partner and their
   * partner's siblings, stretching the bar that joins them for no reason.
   */
  const orient = (block, rank) => {
    if (block.members.length !== 2) return block;

    const [first, second] = block.members;
    if (rank(first) <= rank(second)) return block;

    return withLead({ ...block, members: [second, first], items: [...block.items].reverse() });
  };

  /**
   * `group` records which family a block belongs to — the position of the
   * relatives it hangs from. Blocks sharing it are siblings, and the renderer
   * uses it to put real space between one set of children and the next.
   */
  const sortBy = (blocks, linksOf, endOf) =>
    [...blocks]
      .map((block) => orient(block, (id) => anchorOfPerson(id, linksOf, endOf)))
      .map((block) => ({ ...block, group: anchorOf(block, linksOf, endOf) }))
      .sort((a, b) => a.group - b.group || compareBirth(a, b));

  const present = [...blocksByLevel.keys()].sort((a, b) => a - b);
  const lowest = present[0];
  const highest = present[present.length - 1];

  const toParents = [parentLinksOf, (link) => link.parentId];
  const toChildren = [childLinksOf, (link) => link.childId];

  /**
   * The focal row anchors nothing — it is the row everything else radiates
   * from — so it cannot be oriented by position: the row above has not been
   * placed yet. Blood relation is enough here, and needs no positions: whoever
   * has a parent on screen is the sibling, and the sibling leads the pair.
   *
   * Without this the focal person's spouse sat between them and their
   * brothers and sisters, and the bar joining the siblings had to reach over
   * her.
   */
  const isBloodRelative = (personId) =>
    parentLinksOf(g, personId).some((link) => levels.has(link.parentId)) ? 0 : 1;

  commit(
    0,
    [...(blocksByLevel.get(0) ?? [])]
      .map((block) => orient(block, isBloodRelative))
      .sort(compareBirth)
      .map((block) => ({ ...block, group: 0 })),
  );

  for (let level = 1; level <= highest; level += 1) {
    const blocks = blocksByLevel.get(level);
    if (blocks) commit(level, sortBy(blocks, ...toParents));
  }

  for (let level = -1; level >= lowest; level -= 1) {
    const blocks = blocksByLevel.get(level);
    if (blocks) commit(level, sortBy(blocks, ...toChildren));
  }

  return [...result.entries()].sort((a, b) => a[0] - b[0]);
}

function compareBirth(a, b) {
  if (a.birth === b.birth) return 0;
  if (a.birth === null) return 1;
  if (b.birth === null) return -1;
  return a.birth < b.birth ? -1 : 1;
}

/** Phases 2 and 3 turned into nodes and edges. */
function emit(g, ordered, visible) {
  const rows = [];
  const edges = [];
  const drawnUnions = new Set();

  for (const [level, blocks] of ordered) {
    const nodes = [];

    for (const [index, block] of blocks.entries()) {
      for (const item of block.items) {
        nodes.push({
          type: item.type,
          id: `${item.type === NodeType.UNION ? 'u' : 'p'}:${item.entityId}`,
          entityId: item.entityId,
          level,
        });

        if (item.type !== NodeType.UNION) continue;

        const union = g.unions.get(item.entityId);
        drawnUnions.add(union.id);

        edges.push(
          edge('partner', `p:${union.partner1Id}`, `u:${union.id}`),
          edge('partner', `p:${union.partner2Id}`, `u:${union.id}`),
        );

        for (const child of childrenOfUnion(g, union)) {
          if (visible.has(child.id)) edges.push(edge('descent', `u:${union.id}`, `p:${child.id}`));
        }
      }

      // Separator: an empty, invisible element reserving space. NOT to be
      // confused with the model's placeholder people — this is purely visual.
      //
      // A wide one goes between families and a narrow one between couples of
      // the same family. With a single uniform gap, one couple's children sat
      // exactly as far from each other as from the neighbouring family's, so
      // there was no way to see where one set of siblings ended.
      const next = blocks[index + 1];
      if (!next) continue;

      nodes.push({
        type: NodeType.SPACER,
        id: `s:${block.members[0]}`,
        level,
        size: next.group === block.group ? 'couple' : 'family',
      });
    }

    rows.push({ level, nodes });
  }

  // A parent whose union is not on screen: the line descends straight from
  // their card instead of from a union node.
  for (const link of g.parentChildren.values()) {
    if (!visible.has(link.parentId) || !visible.has(link.childId)) continue;
    if (link.unionId && drawnUnions.has(link.unionId)) continue;
    edges.push(edge('descent', `p:${link.parentId}`, `p:${link.childId}`));
  }

  return { rows, edges };
}

const edge = (kind, fromNodeId, toNodeId) => ({
  id: `${kind}:${fromNodeId}->${toNodeId}`,
  kind,
  fromNodeId,
  toNodeId,
});

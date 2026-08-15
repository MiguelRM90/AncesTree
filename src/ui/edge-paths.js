/**
 * Geometry for the kinship lines.
 *
 * Kept apart from the component that paints them so it can be tested without a
 * browser. Three separate bugs have shipped in these few lines, every one of
 * them looking like "the lines are a bit wrong" and none of them pointing at
 * its own cause, so they are now covered by tests over synthetic rectangles.
 *
 * A "box" is `{cx, top, bottom, left, right}` in the coordinate space of the
 * SVG layer.
 */

/** Distance from the children up to their sibling bar. */
export const BAR_GAP = 18;

/**
 * Neighbouring families are staggered across three heights. Without it their
 * bars sit on one continuous horizontal line and the whole row reads as a
 * single set of siblings.
 */
export const BAR_STEP = 14;

/** Horizontal run between a card and its union node, at the same height. */
export function partnerPath(from, to) {
  const y = (from.top + from.bottom) / 2;
  const x = from.cx < to.cx ? from.right : from.left;
  return `M ${x} ${y} L ${to.cx} ${y}`;
}

/**
 * One path per set of siblings: a stem down from the parents, a bar, and a drop
 * onto each child.
 *
 * @param {Array<{kind: string, fromNodeId: string, toNodeId: string}>} edges
 * @param {Map<string, object>} boxes  node id -> measured box
 * @returns {Array<{id: string, d: string}>}
 */
export function descentPaths(edges, boxes) {
  const groups = new Map();

  for (const edge of edges) {
    if (edge.kind !== 'descent') continue;

    const from = boxes.get(edge.fromNodeId);
    const to = boxes.get(edge.toNodeId);
    if (!from || !to) continue;

    const group = groups.get(edge.fromNodeId);
    if (group) group.children.push(to);
    else groups.set(edge.fromNodeId, { from, children: [to] });
  }

  // Ordered left to right so the stagger alternates between neighbours rather
  // than at random.
  const ordered = [...groups.entries()].sort(
    (a, b) => leftmost(a[1].children) - leftmost(b[1].children),
  );

  return ordered.map(([fromNodeId, group], index) => ({
    id: `descent:${fromNodeId}`,
    d: familyPath(group, index),
    // Which cards hang off this bar, so hovering one can light up the route
    // back to its parents.
    children: group.children.map((child) => child.nodeId).filter(Boolean),
  }));
}

function familyPath({ from, children }, index) {
  const childTop = Math.min(...children.map((child) => child.top));
  const barY = childTop - (BAR_GAP + (index % 3) * BAR_STEP);

  // The stem's own x belongs in the bar's span. Leaving it out — which is what
  // skipping the bar for an only child amounted to — left the line hanging from
  // the parents and the line entering the child as two disconnected strokes
  // whenever the union was not directly above the child.
  const xs = [from.cx, ...children.map((child) => child.cx)];
  const left = Math.min(...xs);
  const right = Math.max(...xs);

  const stem = `M ${from.cx} ${from.bottom} V ${barY}`;
  const bar = right > left ? ` M ${left} ${barY} H ${right}` : '';
  const drops = children.map((child) => ` M ${child.cx} ${barY} V ${child.top}`).join('');

  return `${stem}${bar}${drops}`;
}

const leftmost = (children) => Math.min(...children.map((child) => child.cx));

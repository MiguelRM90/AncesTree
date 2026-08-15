/**
 * SVG layer for the kinship lines (architecture.md, layout phase 5).
 *
 * Hybrid rendering: the cards are native HTML with flex/grid, and the lines are
 * drawn in this absolute layer with orthogonal <path> routes.
 *
 * MEASUREMENT RULES, which is where this always breaks:
 *  - paint() is invoked strictly inside a requestAnimationFrame AFTER the cards
 *    have been inserted into the DOM. Measuring earlier returns zeros or stale
 *    values.
 *  - Every getBoundingClientRect() call happens TOGETHER, in one batch, before
 *    any write. Interleaving reads and writes causes layout thrashing.
 *  - Coordinates are relative to the container, not the viewport, so scrolling
 *    does not force a recalculation.
 */

import { svg, clear } from '../dom.js';
import { partnerPath, descentPaths } from '../edge-paths.js';
import { base, sheet } from '../styles/sheets.js';
import css from './tree-edges.css?inline';

const styles = sheet(css);

export class TreeEdges extends HTMLElement {
  #svg;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#svg = svg('svg', { xmlns: 'http://www.w3.org/2000/svg' });
    root.append(this.#svg);
  }

  connectedCallback() {
    // Pure decoration: the relationships are already in the accessible DOM.
    // Attributes are touched here, not in the constructor, because the element
    // may not be ready yet (wc/no-constructor-attributes).
    this.setAttribute('aria-hidden', 'true');
  }

  /**
   * @param {Array<{id: string, kind: string, fromNodeId: string, toNodeId: string}>} edges
   * @param {HTMLElement} container  element holding the nodes
   */
  paint(edges, container) {
    // Measured against this layer's own box, not the container's. The two can
    // differ by the canvas padding, and a systematic offset in every line is
    // exactly the kind of bug that looks like "the lines are slightly wrong"
    // without ever pointing at its cause.
    const bounds = this.getBoundingClientRect();

    // --- Read phase: the whole measurement batch together ------------------
    const centres = new Map();
    for (const node of container.querySelectorAll('[data-node-id]')) {
      const rect = node.getBoundingClientRect();
      centres.set(node.dataset.nodeId, {
        nodeId: node.dataset.nodeId,
        cx: rect.left - bounds.left + rect.width / 2,
        top: rect.top - bounds.top,
        bottom: rect.bottom - bounds.top,
        left: rect.left - bounds.left,
        right: rect.right - bounds.left,
      });
    }

    // --- Write phase -------------------------------------------------------
    this.#svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    clear(this.#svg);

    for (const edge of edges) {
      if (edge.kind !== 'partner') continue;

      const from = centres.get(edge.fromNodeId);
      const to = centres.get(edge.toNodeId);
      if (!from || !to) continue;

      this.#svg.append(
        svg('path', { d: partnerPath(from, to), class: 'partner', 'data-edge-id': edge.id }),
      );
    }

    for (const path of descentPaths(edges, centres)) {
      this.#svg.append(
        svg('path', {
          d: path.d,
          class: 'descent',
          'data-edge-id': path.id,
          'data-children': path.children.join(' '),
        }),
      );
    }
  }

  /**
   * Lights up one family's lines.
   *
   * With several families sharing a row, tracing a line by eye to find out
   * whose child someone is takes real effort. Pointing at them should answer
   * it.
   *
   * @param {string|null} nodeId  a person, whose bar is lit, or a union node,
   *   whose own bar is lit
   * @param {{pinned?: boolean}} [options]
   * @returns {string[]} the node ids the lit bar descends from
   */
  highlight(nodeId, { pinned = false } = {}) {
    let source = [];

    for (const path of this.#svg.querySelectorAll('path.descent')) {
      const from = path.dataset.edgeId.replace(/^descent:/, '');
      const owns =
        nodeId !== null && (from === nodeId || path.dataset.children.split(' ').includes(nodeId));

      path.classList.toggle('lit', owns);
      path.classList.toggle('pinned', owns && pinned);
      if (owns) source = [from];
    }

    return source;
  }
}


customElements.define('tree-edges', TreeEdges);

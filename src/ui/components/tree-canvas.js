/**
 * Layout phases 4 and 5: emit the LayoutTree as DOM and draw the lines
 * (architecture.md, layout section).
 *
 * Coordinates are NOT computed by hand: CSS places the boxes and the engine
 * only decides order and grouping. That is what keeps the tree accessible and
 * clickable with ordinary events.
 *
 * Accessibility: role="tree" with a roving tabindex, so the whole tree is a
 * single tab stop and the arrow keys move within it. The row wrappers are
 * role="none" because a tree may only contain treeitems and groups — an
 * unmarked div in between breaks the parent/child relationship.
 */

import { el, clear, debounce } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';
import { buildLayout, NodeType } from '../../domain/layout/engine.js';
import { RESIZE_DEBOUNCE_MS } from '../../config/limits.js';
import './person-card.js';
import './union-node.js';
import './tree-edges.js';

const styles = sheet(`
  :host { display: block; position: relative; padding: var(--s-8); }

  .rows { position: relative; display: grid; gap: var(--row-gap); justify-items: center; }

  .row {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: var(--node-gap);
  }

  /* Layout spacers: empty, invisible elements that reserve room between
     branches to avoid overlap and keep the layout symmetric. NOT to be confused
     with the model's placeholder people. */
  .spacer { width: var(--s-8); flex: 0 0 auto; }

  .hint {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
`);

export class TreeCanvas extends HTMLElement {
  #graph = null;
  #focalId = null;
  #issuesFor = () => [];
  #rows;
  #edgesLayer;
  #onResize;
  #lastEdges = [];
  /** Cards laid out by row, for keyboard navigation. */
  #grid = [];
  #cursor = { row: 0, column: 0 };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];

    const hint = el('p', { class: 'hint', text: S.a11y.treeHint, attrs: { id: 'tree-hint' } });

    this.#rows = el('div', {
      class: 'rows',
      attrs: { role: 'tree', 'aria-label': S.a11y.tree, 'aria-describedby': 'tree-hint' },
    });

    this.#edgesLayer = document.createElement('tree-edges');
    root.append(hint, this.#edgesLayer, this.#rows);

    this.#onResize = debounce(() => this.#paintEdges(), RESIZE_DEBOUNCE_MS);
  }

  connectedCallback() {
    window.addEventListener('resize', this.#onResize);
    this.#rows.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.#onResize);
    this.#rows.removeEventListener('keydown', this.#onKeyDown);
  }

  /** @param {{graph: object, focalId: string|null, issuesFor: Function}} view */
  render(view) {
    this.#graph = view.graph;
    this.#focalId = view.focalId;
    this.#issuesFor = view.issuesFor ?? (() => []);
    this.#paint();
  }

  #paint() {
    clear(this.#rows);
    this.#grid = [];
    if (!this.#graph || !this.#focalId) return;

    const { rows, edges } = buildLayout(this.#graph, this.#focalId, {
      up: this.#graph.settings.maxGenerationsUp,
      down: this.#graph.settings.maxGenerationsDown,
    });

    // ARIA levels are 1-based and must not depend on how far the window was
    // pruned, so they are counted from the topmost row actually rendered.
    const topLevel = rows.length > 0 ? rows[0].level : 0;

    for (const row of rows) {
      const rowEl = el('div', { class: 'row', attrs: { role: 'none' } });
      const cards = [];

      for (const node of row.nodes) {
        const element = this.#nodeElement(node, row.level - topLevel + 1);
        if (node.type === NodeType.PERSON) cards.push(element);
        rowEl.append(element);
      }

      this.#grid.push(cards);
      this.#rows.append(rowEl);
    }

    this.#placeCursorOnFocal();

    // Drawing happens strictly inside a rAF after insertion: measuring earlier
    // returns zeros.
    requestAnimationFrame(() => this.#paintEdges(edges));
  }

  #paintEdges(edges) {
    if (edges) this.#lastEdges = edges;
    this.#edgesLayer.paint(this.#lastEdges, this.#rows);
  }

  #nodeElement(node, level) {
    if (node.type === NodeType.SPACER) {
      return el('div', { class: 'spacer', attrs: { 'aria-hidden': 'true' } });
    }

    if (node.type === NodeType.UNION) {
      const unionEl = document.createElement('union-node');
      unionEl.dataset.nodeId = node.id;
      unionEl.union = this.#graph.unions.get(node.entityId);
      return unionEl;
    }

    const person = this.#graph.persons.get(node.entityId);
    const card = document.createElement('person-card');
    card.dataset.nodeId = node.id;
    card.toggleAttribute('focal', person.id === this.#focalId);
    card.graph = this.#graph;
    card.level = level;
    card.focusable = false;
    card.person = person;
    card.issues = this.#issuesFor(person.id);
    return card;
  }

  // --- Keyboard navigation -------------------------------------------------

  /** The tab stop starts on the focal person, which is where attention is. */
  #placeCursorOnFocal() {
    for (const [row, cards] of this.#grid.entries()) {
      const column = cards.findIndex((card) => card.hasAttribute('focal'));
      if (column !== -1) {
        this.#cursor = { row, column };
        cards[column].focusable = true;
        return;
      }
    }

    if (this.#grid[0]?.[0]) {
      this.#cursor = { row: 0, column: 0 };
      this.#grid[0][0].focusable = true;
    }
  }

  #onKeyDown = (event) => {
    const moves = {
      ArrowRight: () => this.#step(0, 1),
      ArrowLeft: () => this.#step(0, -1),
      ArrowDown: () => this.#stepRow(1),
      ArrowUp: () => this.#stepRow(-1),
      Home: () => this.#moveTo(this.#cursor.row, 0),
      End: () => this.#moveTo(this.#cursor.row, Infinity),
    };

    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    move();
  };

  #step(rowDelta, columnDelta) {
    this.#moveTo(this.#cursor.row + rowDelta, this.#cursor.column + columnDelta);
  }

  /**
   * Moving between generations keeps the horizontal position: it lands on the
   * card nearest to the current one, which is almost always the relative the
   * user meant.
   */
  #stepRow(delta) {
    const row = this.#cursor.row + delta;
    const target = this.#grid[row];
    if (!target || target.length === 0) return;

    const current = this.#grid[this.#cursor.row]?.[this.#cursor.column];
    if (!current) return;

    const x = centreOf(current);
    let best = 0;
    let bestDistance = Infinity;

    for (const [index, card] of target.entries()) {
      const distance = Math.abs(centreOf(card) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }

    this.#moveTo(row, best);
  }

  #moveTo(row, column) {
    const cards = this.#grid[row];
    if (!cards || cards.length === 0) return;

    const clamped = Math.max(0, Math.min(cards.length - 1, column));
    const previous = this.#grid[this.#cursor.row]?.[this.#cursor.column];

    if (previous) previous.focusable = false;

    this.#cursor = { row, column: clamped };
    cards[clamped].focusable = true;
    cards[clamped].focus();
  }
}

const centreOf = (element) => {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2;
};

customElements.define('tree-canvas', TreeCanvas);

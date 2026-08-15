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
import css from './tree-canvas.css?inline';
import { S } from '../../config/strings.js';
import { buildLayout, NodeType } from '../../domain/layout/engine.js';
import { portraitOf, displayName } from '../../domain/graph/queries.js';
import { RESIZE_DEBOUNCE_MS } from '../../config/limits.js';
import './person-card.js';
import './union-node.js';
import './tree-edges.js';

const styles = sheet(css);

export class TreeCanvas extends HTMLElement {
  #graph = null;
  #focalId = null;
  #issuesFor = () => [];
  #resolvePhoto = null;
  #rows;
  #edgesLayer;
  #onResize;
  #lastEdges = [];
  /** Cards laid out by row, for keyboard navigation. */
  #grid = [];
  #cursor = { row: 0, column: 0 };
  #lit = null;
  #pinned = null;

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
    this.#rows.addEventListener('pointerover', this.#onPointOver);
    this.#rows.addEventListener('pointerleave', this.#onPointOut);
    this.#rows.addEventListener('focusin', this.#onPointOver);
    this.#rows.addEventListener('union:pin', this.#onPin);
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.#onResize);
    this.#rows.removeEventListener('keydown', this.#onKeyDown);
    this.#rows.removeEventListener('pointerover', this.#onPointOver);
    this.#rows.removeEventListener('pointerleave', this.#onPointOut);
    this.#rows.removeEventListener('focusin', this.#onPointOver);
    this.#rows.removeEventListener('union:pin', this.#onPin);
  }

  /**
   * Pointing at a person lights up the bar they hang from and outlines their
   * parents. Working out whose child someone is by following a line across a
   * crowded row is real effort; pointing at them should just answer it.
   */
  #onPointOver = (event) => {
    if (this.#pinned) return; // a pin outranks whatever the pointer is over
    const card = event.target.closest('person-card');
    this.#light(card?.dataset.nodeId ?? null);
  };

  #onPointOut = () => {
    if (!this.#pinned) this.#light(null);
  };

  /** Clicking a union node keeps its family lit; clicking it again lets go. */
  #onPin = (event) => {
    const { nodeId } = event.detail;
    this.#pinned = this.#pinned === nodeId ? null : nodeId;

    this.#light(this.#pinned, { force: true });
    this.#syncPins();
  };

  #syncPins() {
    for (const node of this.#rows.querySelectorAll('union-node')) {
      node.pinned = node.dataset.nodeId === this.#pinned;
    }
  }

  #light(nodeId, { force = false } = {}) {
    if (nodeId === this.#lit && !force) return;
    this.#lit = nodeId;

    const source = this.#edgesLayer.highlight(nodeId, { pinned: this.#pinned !== null });
    const related = new Set(source.flatMap((id) => this.#cardsOf(id)));

    for (const row of this.#grid) {
      for (const node of row) {
        if (node.tagName === 'PERSON-CARD') {
          node.toggleAttribute('related', related.has(node.dataset.nodeId));
        }
      }
    }
  }

  /** A union node stands for two people; a bare card stands for itself. */
  #cardsOf(nodeId) {
    if (!nodeId.startsWith('u:')) return [nodeId];
    const union = this.#graph.unions.get(nodeId.slice(2));
    return union ? [`p:${union.partner1Id}`, `p:${union.partner2Id}`] : [];
  }

  /**
   * @param {{graph: object, focalId: string|null, issuesFor: Function,
   *          resolvePhoto: Function}} view
   */
  render(view) {
    this.#graph = view.graph;
    this.#focalId = view.focalId;
    this.#issuesFor = view.issuesFor ?? (() => []);
    this.#resolvePhoto = view.resolvePhoto ?? null;
    this.#paint();
  }

  #paint() {
    // Re-rooting throws away every card, so whoever had keyboard focus loses
    // it. If the user was working inside the tree, focus follows them to the
    // new centre; if the change came from a dialog, it is left alone.
    const hadFocus = this.shadowRoot.activeElement !== null;

    clear(this.#rows);
    this.#grid = [];

    // The node ids are rebuilt from scratch, so a pin on the old tree means
    // nothing on the new one.
    this.#pinned = null;
    this.#lit = null;

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
      const focusable = [];

      for (const node of row.nodes) {
        const element = this.#nodeElement(node, row.level - topLevel + 1);
        // Union nodes are treeitems too: they can be pinned, so the arrow keys
        // have to be able to reach them.
        if (node.type !== NodeType.SPACER) focusable.push(element);
        rowEl.append(element);
      }

      this.#grid.push(focusable);
      this.#rows.append(rowEl);
    }

    this.#placeCursorOnFocal();

    // Drawing happens strictly inside a rAF after insertion: measuring earlier
    // returns zeros.
    requestAnimationFrame(() => {
      this.#paintEdges(edges);
      this.#revealFocal(hadFocus);
    });
  }

  /**
   * Brings the centred person into view.
   *
   * Re-rooting the tree rebuilds the entire layout, so without this the person
   * just clicked can land anywhere — often off-screen. The view then looks like
   * it changed at random, which is precisely how it felt.
   */
  #revealFocal(restoreFocus = false) {
    const card = this.#grid[this.#cursor.row]?.[this.#cursor.column];
    if (!card) return;

    // Instant, not smooth: animating a scroll across a tree this wide is both
    // slow and disorienting.
    card.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    if (restoreFocus) card.focus({ preventScroll: true });
  }

  #paintEdges(edges) {
    if (edges) this.#lastEdges = edges;
    this.#edgesLayer.paint(this.#lastEdges, this.#rows);
  }

  #nodeElement(node, level) {
    if (node.type === NodeType.SPACER) {
      return el('div', {
        class: 'spacer',
        dataset: { size: node.size ?? 'couple' },
        attrs: { 'aria-hidden': 'true' },
      });
    }

    if (node.type === NodeType.UNION) {
      const union = this.#graph.unions.get(node.entityId);
      const unionEl = document.createElement('union-node');
      unionEl.dataset.nodeId = node.id;
      unionEl.union = union;
      unionEl.level = level;
      unionEl.focusable = false;
      unionEl.partners = [union.partner1Id, union.partner2Id].map((id) =>
        displayName(this.#graph.persons.get(id)),
      );
      return unionEl;
    }

    const person = this.#graph.persons.get(node.entityId);
    const card = document.createElement('person-card');
    card.dataset.nodeId = node.id;
    card.toggleAttribute('focal', person.id === this.#focalId);
    card.graph = this.#graph;
    card.level = level;
    card.focusable = false;
    card.resolvePhoto = this.#resolvePhoto;
    card.portrait = portraitOf(this.#graph, person.id)?.path ?? null;
    card.person = person;
    card.issues = this.#issuesFor(person.id);
    return card;
  }

  // --- Keyboard navigation -------------------------------------------------

  /** The tab stop starts on the focal person, which is where attention is. */
  #placeCursorOnFocal() {
    for (const [row, nodes] of this.#grid.entries()) {
      const column = nodes.findIndex((node) => node.hasAttribute('focal'));
      if (column !== -1) {
        this.#cursor = { row, column };
        nodes[column].focusable = true;
        return;
      }
    }

    if (this.#grid[0]?.[0]) {
      this.#cursor = { row: 0, column: 0 };
      this.#grid[0][0].focusable = true;
    }
  }

  #onKeyDown = (event) => {
    if (event.key === 'Escape' && this.#pinned) {
      event.preventDefault();
      this.#pinned = null;
      this.#light(null, { force: true });
      this.#syncPins();
      return;
    }

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

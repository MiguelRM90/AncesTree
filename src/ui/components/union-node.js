/**
 * Synthetic union node (architecture.md, layout phase 2).
 *
 * Unions do not connect the cards to each other: they attach to this
 * intermediate point, from which a single vertical line descends and branches
 * out to the children. Without it, N children x 2 parents produce 2N crossing
 * lines; with it, 2 + N.
 *
 * Clicking it pins the highlight on that family's lines. Following a line
 * across a wide row means scrolling, and scrolling means the pointer leaves —
 * so a hover-only highlight disappears exactly when it is needed.
 *
 * Like person-card, the role lives on the inner button and the host is
 * role="none", so the button is exposed as a direct child of role="tree".
 */

import { el, emit } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import css from './union-node.css?inline';
import { S } from '../../config/strings.js';

const styles = sheet(css);

export class UnionNode extends HTMLElement {
  #button;
  #names = [];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    root.adoptedStyleSheets = [base, styles];

    this.#button = el('button', {
      class: 'dot',
      attrs: { type: 'button', role: 'treeitem', tabindex: '-1' },
    });

    root.append(this.#button);
  }

  connectedCallback() {
    this.setAttribute('role', 'none');
    this.#button.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    this.#button.removeEventListener('click', this.#onClick);
  }

  set union(value) {
    if (!value) return;
    this.setAttribute('type', value.type);
  }

  /** Depth in the tree, 1-based, as ARIA requires. */
  set level(value) {
    this.#button.setAttribute('aria-level', String(Math.max(1, value)));
  }

  /**
   * Naming the couple.
   *
   * Following a sibling bar up to a dot tells you these people share parents,
   * but not which parents — and if the couple is off to the side of a wide row,
   * the answer is not obvious from looking.
   */
  set partners(names) {
    this.#names = names.filter(Boolean);

    const couple = this.#names.join('  +  ');
    this.#button.title = couple;
    this.#button.setAttribute('aria-label', S.tree.pinUnion(couple));
  }

  set pinned(value) {
    this.toggleAttribute('pinned', value);
    this.#button.setAttribute('aria-pressed', String(Boolean(value)));
  }

  /**
   * Part of the tree's roving tabindex, like the cards.
   *
   * A treeitem the arrow keys cannot reach would be a hole in the structure,
   * and pinning would be a pointer-only feature.
   */
  set focusable(value) {
    this.#button.tabIndex = value ? 0 : -1;
  }

  focus(options) {
    this.#button.focus(options);
  }

  #onClick = (event) => {
    // The card behind must not also take the click and re-centre the tree.
    event.stopPropagation();
    emit(this, 'union:pin', { nodeId: this.dataset.nodeId });
  };
}

customElements.define('union-node', UnionNode);

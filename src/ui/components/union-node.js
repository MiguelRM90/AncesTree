/**
 * Synthetic union node (architecture.md, layout phase 2).
 *
 * Unions do not connect the cards to each other: they attach to this
 * intermediate point, from which a single vertical line descends and branches
 * out to the children. Without it, N children x 2 parents produce 2N crossing
 * lines; with it, 2 + N.
 */

import { base, sheet } from '../styles/sheets.js';
import css from './union-node.css?inline';

const styles = sheet(css);

export class UnionNode extends HTMLElement {
  #dot;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#dot = document.createElement('span');
    this.#dot.className = 'dot';
    root.append(this.#dot);
  }

  connectedCallback() {
    // Decoration: the relationship is expressed in the accessible DOM, not here.
    this.setAttribute('aria-hidden', 'true');
  }

  set union(value) {
    if (!value) return;
    this.setAttribute('type', value.type);
  }
}

customElements.define('union-node', UnionNode);

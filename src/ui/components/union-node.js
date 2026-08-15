/**
 * Synthetic union node (architecture.md, layout phase 2).
 *
 * Unions do not connect the cards to each other: they attach to this
 * intermediate point, from which a single vertical line descends and branches
 * out to the children. Without it, N children x 2 parents produce 2N crossing
 * lines; with it, 2 + N.
 */

import { base, sheet } from '../styles/sheets.js';

const styles = sheet(`
  :host {
    display: grid;
    place-items: center;
    width: var(--s-6);
    align-self: center;
  }

  /* Marriage versus an informal union is signalled by fill, not only by
     colour: a filled dot for a marriage, a hollow ring otherwise. Hue alone
     would be invisible to a colour-blind reader and in forced colours mode. */
  .dot {
    width: var(--s-3);
    height: var(--s-3);
    border-radius: 50%;
    border: 2px solid var(--c-line);
    background: var(--c-bg);
  }

  :host([type='MARRIED']) .dot {
    background: var(--c-accent);
    border-color: var(--c-accent);
  }
`);

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

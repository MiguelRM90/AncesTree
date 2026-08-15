/**
 * Person card.
 *
 * It is a real <button>, not a div with onclick: focus, keyboard and screen
 * reader support come for free (architecture.md, accessibility section).
 *
 * The ARIA roles live on the inner button, not on the host. A treeitem host
 * wrapping a button would be announced as "button, inside tree item", which is
 * noise; the host is marked role="none" so the button is exposed as the tree's
 * direct child. delegatesFocus lets the parent call card.focus() without
 * reaching into the shadow root.
 *
 * Every card is the same height whatever it holds. A row of cards that jump
 * around according to who happens to have a death date reads as broken, and the
 * SVG lines are measured off these boxes, so uneven heights bend the tree too.
 */

import { el, setChildren, emit } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';
import { issueLine } from '../issue-text.js';
import { displayName } from '../../domain/graph/queries.js';
import { formatLifespan } from '../../domain/date/format.js';
import { Severity } from '../../domain/validation/engine.js';

const styles = sheet(`
  :host { display: block; }

  button {
    position: relative;
    width: var(--card-width);
    min-height: var(--card-height);
    padding: var(--s-3);
    text-align: left;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: grid;
    grid-template-rows: auto auto;
    align-content: center;
    gap: var(--s-1);
  }

  :host([focal]) button {
    border-color: var(--c-accent);
    box-shadow: 0 0 0 2px var(--c-accent-soft), var(--shadow);
  }

  /* Placeholder people are drawn differently and can be materialised */
  :host([placeholder]) button {
    border-style: dashed;
    background: var(--c-surface-sunken);
    color: var(--c-text-muted);
  }

  /* A long name is truncated rather than wrapped: wrapping would make this
     card taller than its neighbours. The full name stays in the tooltip and
     in the accessible name. */
  .name {
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Always rendered, even when empty, so the second row always occupies the
     same space. */
  .dates {
    font-size: var(--fs-sm);
    color: var(--c-text-muted);
    font-variant-numeric: tabular-nums;
    min-height: 1.2em;
  }

  /* Out of the flow: the badge must not change the height of the card. */
  .flag {
    position: absolute;
    top: var(--s-1);
    right: var(--s-1);
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.4;
    padding: 0 var(--s-1);
    border-radius: var(--radius-sm);
    border: 1px solid currentColor;
  }

  /* Severity is not signalled by hue alone: an error badge is filled, a
     warning badge is outlined. Colour-blind users and anyone in a forced
     colours mode still get the distinction. */
  .flag.error {
    background: var(--c-error);
    color: var(--c-surface);
    border-color: var(--c-error);
  }
  .flag.warning {
    background: var(--c-warning-soft);
    color: var(--c-warning);
  }
`);

export class PersonCard extends HTMLElement {
  #person = null;
  #issues = [];
  #graph = null;
  #button;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    root.adoptedStyleSheets = [base, styles];
    this.#button = el('button', { attrs: { type: 'button', role: 'treeitem' } });
    root.append(this.#button);
  }

  connectedCallback() {
    // The host is skipped in the accessibility tree so the button becomes a
    // direct child of role="tree".
    this.setAttribute('role', 'none');
    this.#button.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    this.#button.removeEventListener('click', this.#onClick);
  }

  set person(value) {
    this.#person = value;
    this.#render();
  }

  /** Only ERROR and WARNING reach the card. INFO lives in the review panel. */
  set issues(value) {
    this.#issues = value.filter((i) => i.severity !== Severity.INFO);
    this.#render();
  }

  /** Indexed graph, used to name the people an issue is about. */
  set graph(value) {
    this.#graph = value;
  }

  /** Depth in the tree, 1-based, as ARIA requires. */
  set level(value) {
    this.#button.setAttribute('aria-level', String(Math.max(1, value)));
  }

  /**
   * Roving tabindex: a tree is a single tab stop, and the arrow keys move
   * within it. Only one card is reachable with Tab at any moment.
   */
  set focusable(value) {
    this.#button.tabIndex = value ? 0 : -1;
  }

  focus(options) {
    this.#button.focus(options);
  }

  #onClick = () => {
    if (this.#person) emit(this, 'person:focus', { personId: this.#person.id });
  };

  #render() {
    const person = this.#person;
    if (!person) return;

    this.toggleAttribute('placeholder', person.isPlaceholder);

    const name = displayName(person);
    const lifespan = formatLifespan(person.birth, person.death);
    const notes = this.#issues.map((issue) => issueLine(issue, this.#graph));

    setChildren(this.#button, [
      el('span', { class: 'name', text: name, attrs: { title: name } }),
      el('span', { class: 'dates', text: lifespan }),
      this.#flag(notes),
    ]);

    // aria-label replaces the whole content for a screen reader, so anything
    // meaningful shown visually has to be repeated here — including the notes,
    // which would otherwise be silently dropped.
    this.#button.setAttribute('aria-label', [name, lifespan, ...notes].filter(Boolean).join('. '));
    this.#button.setAttribute('aria-selected', String(this.hasAttribute('focal')));
  }

  /**
   * Count of validation notes. A bare number means nothing on its own, so the
   * badge carries a tooltip spelling out what it is and what the notes say.
   */
  #flag(notes) {
    if (notes.length === 0) return null;

    const severity = this.#issues.some((i) => i.severity === Severity.ERROR)
      ? 'error'
      : 'warning';

    return el('span', {
      class: ['flag', severity],
      text: String(notes.length),
      attrs: { title: [S.card.issues(notes.length), ...notes].join('\n'), 'aria-hidden': 'true' },
    });
  }
}

customElements.define('person-card', PersonCard);

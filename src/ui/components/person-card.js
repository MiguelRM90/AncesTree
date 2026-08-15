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

import { el, svg, setChildren, emit } from '../dom.js';
import { base, flags, sheet } from '../styles/sheets.js';
import css from './person-card.css?inline';
import { S } from '../../config/strings.js';
import { issueLine } from '../issue-text.js';
import { displayName } from '../../domain/graph/queries.js';
import { countryFlag, countryName } from '../../domain/model/countries.js';
import { supportsFlagEmoji } from '../flag-support.js';
import { formatLifespan } from '../../domain/date/format.js';
import { Severity } from '../../domain/validation/engine.js';
import './person-photo.js';

const styles = sheet(css);

export class PersonCard extends HTMLElement {
  #person = null;
  #issues = [];
  #graph = null;
  #portraitPath = null;
  #resolvePhoto = null;
  #button;
  #photo;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    root.adoptedStyleSheets = [base, flags, styles];
    this.#button = el('button', { attrs: { type: 'button', role: 'treeitem' } });
    this.#photo = document.createElement('person-photo');
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

  /** Project-relative path of the portrait, or null for the silhouette. */
  set portrait(value) {
    this.#portraitPath = value;
    this.#photo.path = value;
  }

  /** @param {(path: string) => Promise<string|null>} fn */
  set resolvePhoto(fn) {
    this.#resolvePhoto = fn;
    this.#photo.resolve = fn;
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

    this.#photo.person = person;
    this.#photo.path = this.#portraitPath;
    if (this.#resolvePhoto) this.#photo.resolve = this.#resolvePhoto;

    setChildren(this.#button, [
      this.#photo,
      el('span', {
        class: 'line',
        children: [
          el('span', { class: 'name', text: name, attrs: { title: name } }),
          this.#nationality(person.nationality),
        ],
      }),
      el('span', { class: 'dates', text: lifespan }),
      this.#noteMark(person.notes),
      this.#flag(notes),
    ]);

    // aria-label replaces the whole content for a screen reader, so anything
    // meaningful shown visually has to be repeated here — including the notes,
    // which would otherwise be silently dropped.
    this.#button.setAttribute(
      'aria-label',
      [name, countryName(person.nationality), lifespan, person.notes && S.card.hasNote, ...notes]
        .filter(Boolean)
        .join('. '),
    );
    this.#button.setAttribute('aria-selected', String(this.hasAttribute('focal')));
  }

  /**
   * The nationality: a flag where the platform draws one, and a deliberate
   * badge where it does not.
   *
   * Windows has no flag glyphs, so `🇪🇸` there is two loose boxed letters that
   * read as a rendering failure. The badge is the same information, framed so
   * it looks meant — and the moment a flag-capable font is installed, the real
   * flag appears instead.
   */
  #nationality(code) {
    if (!code) return null;

    const flag = supportsFlagEmoji() ? countryFlag(code) : '';

    return el('span', {
      class: flag ? 'flagchip' : 'codechip',
      text: flag || code,
      dataset: flag ? {} : { country: code },
      attrs: { title: countryName(code), 'aria-hidden': 'true' },
    });
  }

  /**
   * A written note on this person.
   *
   * Free text is the one field with no other trace on the card — a whole
   * paragraph of research could sit there completely invisible. The mark says
   * it exists; hovering shows it; opening the person reads it in full.
   */
  #noteMark(note) {
    if (!note || note.trim() === '') return null;

    const mark = svg('svg', {
      class: 'note',
      viewBox: '0 0 16 16',
      fill: 'currentColor',
      'aria-hidden': 'true',
      focusable: 'false',
    });

    mark.append(
      svg('path', {
        d: 'M3 1.5h7.2L14 5.3V14a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 3 14V2a.5.5 0 0 1 .5-.5Zm6.5 1.2V5.5H12.3ZM5.5 8h5v1.1h-5Zm0 2.6h3.4v1.1H5.5Z',
      }),
    );

    // Long research notes are trimmed in the tooltip; the editor has them all.
    const preview = note.length > 300 ? `${note.slice(0, 300)}…` : note;
    mark.append(svg('title', {}));
    mark.lastChild.textContent = `${S.card.hasNote}\n${preview}`;

    return mark;
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

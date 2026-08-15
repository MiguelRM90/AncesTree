/**
 * A person's portrait, or the placeholder silhouette when there is none.
 *
 * Size comes from --photo-size, so the same component serves the small circle
 * on a tree card and the larger one in the editor.
 *
 * Resolving a path to a displayable URL is asynchronous and belongs to the
 * storage layer, which the UI must not import (architecture.md, dependency
 * rule). The parent passes a `resolve` function instead.
 */

import { el, setChildren } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import css from './person-photo.css?inline';
import { avatarSvg, avatarKindFor } from '../avatars.js';

const styles = sheet(css);

export class PersonPhoto extends HTMLElement {
  #frame;
  #person = null;
  #path = null;
  #resolve = null;
  /** Guards against a slow load overwriting a newer one. */
  #generation = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#frame = el('div', { class: 'frame' });
    root.append(this.#frame);
  }

  /** @param {(path: string) => Promise<string|null>} fn */
  set resolve(fn) {
    this.#resolve = fn;
  }

  set person(value) {
    this.#person = value;
    this.#render();
  }

  /** Project-relative path of the portrait, or null. */
  set path(value) {
    if (value === this.#path) return;
    this.#path = value;
    this.#render();
  }

  #render() {
    const kind = avatarKindFor(this.#person);
    this.setAttribute('kind', kind);

    // The silhouette is shown first and replaced if a photo arrives, so the
    // card never flashes empty while the file is read from disk.
    setChildren(this.#frame, [avatarSvg(kind)]);

    if (!this.#path || !this.#resolve) return;

    const generation = ++this.#generation;

    void this.#resolve(this.#path).then((url) => {
      if (!url || generation !== this.#generation) return;
      setChildren(this.#frame, [el('img', { attrs: { src: url, alt: '', decoding: 'async' } })]);
    });
  }
}

customElements.define('person-photo', PersonPhoto);

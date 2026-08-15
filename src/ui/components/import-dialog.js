/**
 * Import strategy chooser.
 *
 * The app always asks and never decides on its own (storage.md, merge on
 * import). The dialog shows what is actually inside the archive first, so the
 * choice is made with the numbers in view rather than blind.
 */

import { el, emit } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';

const styles = sheet(`
  dialog {
    border: 1px solid var(--c-border-subtle);
    border-radius: var(--radius);
    background: var(--c-surface);
    color: var(--c-text);
    padding: 0;
    width: min(28rem, 90vw);
    box-shadow: var(--shadow);
  }
  dialog::backdrop { background: rgb(0 0 0 / 35%); }

  .body { display: grid; gap: var(--s-4); padding: var(--s-6); }
  h2 { margin: 0; font-size: var(--fs-lg); }

  .card {
    border: 1px solid var(--c-border-subtle);
    border-radius: var(--radius-sm);
    background: var(--c-surface-sunken);
    padding: var(--s-3);
    display: grid;
    gap: var(--s-1);
  }
  .title { font-weight: 600; }
  .summary { font-size: var(--fs-sm); color: var(--c-text-muted); }

  .choices { display: grid; gap: var(--s-2); }
  .choice {
    display: grid;
    gap: var(--s-1);
    text-align: left;
    padding: var(--s-3);
  }
  .choice .hint { font-size: var(--fs-sm); color: var(--c-text-muted); font-weight: 400; }
  .choice .label { font-weight: 600; }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--s-3) var(--s-6);
    border-top: 1px solid var(--c-border);
    background: var(--c-surface-sunken);
  }
`);

export class ImportDialog extends HTMLElement {
  #dialog;
  #card;
  #choices;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#dialog = this.#build();
    root.append(this.#dialog);
  }

  /**
   * @param {object} inspection  result of storage/archive.js inspectArchive()
   * @param {boolean} canMerge   whether a project is currently open
   */
  open(inspection, canMerge) {
    const title = inspection.manifest?.title ?? S.archive.unnamedArchive;

    this.#card.replaceChildren(
      el('span', { class: 'title', text: title }),
      el('span', { class: 'summary', text: S.archive.summary(inspection.counts) }),
      el('span', { class: 'summary', text: formatBytes(inspection.counts.bytes) }),
    );

    this.#choices.firstElementChild.hidden = !canMerge;
    this.#dialog.showModal();
  }

  close() {
    this.#dialog.close();
  }

  #build() {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'import-title');

    this.#card = el('div', { class: 'card' });

    const merge = choiceButton(S.archive.mergeHere, S.archive.mergeHint);
    const asNew = choiceButton(S.archive.openAsNew, S.archive.openAsNewHint);

    merge.addEventListener('click', () => {
      this.close();
      emit(this, 'import:merge');
    });
    asNew.addEventListener('click', () => {
      this.close();
      emit(this, 'import:new');
    });

    this.#choices = el('div', { class: 'choices', children: [merge, asNew] });

    const cancel = el('button', { text: S.editor.cancel, attrs: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());

    dialog.append(
      el('div', {
        class: 'body',
        children: [
          el('h2', { text: S.archive.importTitle, attrs: { id: 'import-title' } }),
          this.#card,
          el('p', { class: 'summary', text: S.archive.chooseStrategy }),
          this.#choices,
        ],
      }),
      el('footer', { children: [cancel] }),
    );

    return dialog;
  }
}

function choiceButton(label, hint) {
  return el('button', {
    class: 'choice',
    attrs: { type: 'button' },
    children: [el('span', { class: 'label', text: label }), el('span', { class: 'hint', text: hint })],
  });
}

function formatBytes(bytes) {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

customElements.define('import-dialog', ImportDialog);

/**
 * Person editor, as a native <dialog>. No dependencies, no custom modal.
 *
 * Dates are entered through <date-field>, which offers a proper control per
 * kind of date and composes the GEDCOM `raw` string the model stores
 * (data-model.md, genealogical dates).
 */

import { el, emit } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';
import { parseDate } from '../../domain/date/parse.js';
import { Sex } from '../../domain/model/factories.js';
import './date-field.js';

const styles = sheet(`
  dialog {
    border: 1px solid var(--c-border-subtle);
    border-radius: var(--radius);
    background: var(--c-surface);
    color: var(--c-text);
    padding: 0;
    width: min(32rem, 92vw);
    box-shadow: var(--shadow);
  }
  dialog::backdrop { background: rgb(0 0 0 / 35%); }

  .body { display: grid; gap: var(--s-4); padding: var(--s-6); }
  h2 { margin: 0; font-size: var(--fs-lg); }

  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
  label { display: grid; gap: var(--s-1); font-size: var(--fs-sm); color: var(--c-text-muted); }

  input, select, textarea {
    font: inherit;
    color: var(--c-text);
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    padding: var(--s-2);
  }
  textarea { resize: vertical; min-height: 4rem; }

  fieldset {
    border: 1px solid var(--c-border-subtle);
    border-radius: var(--radius-sm);
    padding: var(--s-3);
    display: grid;
    gap: var(--s-3);
    margin: 0;
  }
  legend { font-size: var(--fs-sm); color: var(--c-text-muted); padding: 0 var(--s-1); }

  .note { font-size: var(--fs-sm); color: var(--c-text-muted); }

  footer {
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
    padding: var(--s-3) var(--s-6);
    border-top: 1px solid var(--c-border-subtle);
    background: var(--c-surface-sunken);
  }
  footer .danger { margin-right: auto; color: var(--c-error); border-color: var(--c-error); }
`);

export class PersonEditor extends HTMLElement {
  #dialog;
  #fields = {};
  #person = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#dialog = this.#build();
    root.append(this.#dialog);
  }

  /** Opens the editor for a person. The caller keeps ownership of the data. */
  open(person) {
    this.#person = person;

    this.#fields.firstName.value = person.firstName;
    this.#fields.lastName.value = person.lastName;
    this.#fields.sex.value = person.sex;
    this.#fields.notes.value = person.notes;

    // A missing event is a missing event: the controls show empty, never the
    // word "null".
    this.#fields.birthDate.value = person.birth?.date ?? null;
    this.#fields.deathDate.value = person.death?.date ?? null;
    this.#fields.birthPlace.value = person.birth?.place ?? '';
    this.#fields.deathPlace.value = person.death?.place ?? '';

    this.#fields.placeholderNote.hidden = !person.isPlaceholder;

    this.#dialog.showModal();
    this.#fields.firstName.focus();
  }

  close() {
    this.#dialog.close();
  }

  #build() {
    const dialog = document.createElement('dialog');
    // Native <dialog> already traps focus and closes on Escape; what it cannot
    // infer is its own name.
    dialog.setAttribute('aria-labelledby', 'editor-title');

    this.#fields.firstName = input();
    this.#fields.lastName = input();
    this.#fields.sex = select();
    this.#fields.birthDate = document.createElement('date-field');
    this.#fields.deathDate = document.createElement('date-field');
    this.#fields.birthPlace = input();
    this.#fields.deathPlace = input();
    this.#fields.notes = document.createElement('textarea');
    this.#fields.placeholderNote = el('p', { class: 'note', text: S.editor.materialise });

    const save = el('button', { class: 'primary', text: S.editor.save, attrs: { type: 'button' } });
    const cancel = el('button', { text: S.editor.cancel, attrs: { type: 'button' } });
    const remove = el('button', {
      class: 'danger',
      text: S.editor.remove,
      attrs: { type: 'button' },
    });

    save.addEventListener('click', () => this.#save());
    cancel.addEventListener('click', () => this.close());
    remove.addEventListener('click', () => this.#remove());

    // Enter saves from any single-line field; Escape closes via the dialog.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        this.#save();
      }
    });

    dialog.append(
      el('div', {
        class: 'body',
        children: [
          el('h2', { text: S.editor.title, attrs: { id: 'editor-title' } }),
          this.#fields.placeholderNote,
          el('div', {
            class: 'pair',
            children: [
              labelled(S.editor.firstName, this.#fields.firstName),
              labelled(S.editor.lastName, this.#fields.lastName),
            ],
          }),
          labelled(S.editor.sex, this.#fields.sex),
          this.#eventFieldset(S.editor.birth, 'birth'),
          this.#eventFieldset(S.editor.death, 'death'),
          labelled(S.editor.notes, this.#fields.notes),
        ],
      }),
      el('footer', { children: [remove, cancel, save] }),
    );

    return dialog;
  }

  #eventFieldset(legendText, prefix) {
    const fieldset = document.createElement('fieldset');
    fieldset.append(
      el('legend', { text: legendText }),
      this.#fields[`${prefix}Date`],
      labelled(S.editor.place, this.#fields[`${prefix}Place`]),
    );
    return fieldset;
  }

  #save() {
    if (!this.#person) return;

    const firstName = this.#fields.firstName.value.trim();

    emit(this, 'person:save', {
      personId: this.#person.id,
      changes: {
        firstName,
        lastName: this.#fields.lastName.value.trim(),
        sex: this.#fields.sex.value,
        birth: eventFrom(this.#fields.birthDate.raw, this.#fields.birthPlace.value),
        death: eventFrom(this.#fields.deathDate.raw, this.#fields.deathPlace.value),
        notes: this.#fields.notes.value,
        // Filling in a name materialises a placeholder, keeping its id and
        // every existing link (data-model.md, placeholders section).
        isPlaceholder: this.#person.isPlaceholder && firstName === '',
      },
    });

    this.close();
  }

  #remove() {
    if (!this.#person) return;
    if (!window.confirm(S.editor.confirmRemove)) return;
    emit(this, 'person:delete', { personId: this.#person.id });
    this.close();
  }
}

/** Returns null when nothing was entered: an absent event, not an empty one. */
function eventFrom(rawDate, place) {
  const date = (rawDate ?? '').trim();
  const where = place.trim();
  if (date === '' && where === '') return null;
  return { date: parseDate(date), place: where };
}

function input(attrs = {}) {
  const node = document.createElement('input');
  node.type = 'text';
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function select() {
  const node = document.createElement('select');
  for (const value of Object.values(Sex)) {
    node.append(el('option', { text: S.sex[value], attrs: { value } }));
  }
  return node;
}

function labelled(text, field) {
  return el('label', { children: [el('span', { text }), field] });
}

customElements.define('person-editor', PersonEditor);

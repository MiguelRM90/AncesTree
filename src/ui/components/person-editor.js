/**
 * Person editor, as a native <dialog>. No dependencies, no custom modal.
 *
 * Dates are entered through <date-field>, which offers a proper control per
 * kind of date and composes the GEDCOM `raw` string the model stores
 * (data-model.md, genealogical dates).
 */

import { el, emit, setChildren } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import css from './person-editor.css?inline';
import { S } from '../../config/strings.js';
import { describeIssue } from '../issue-text.js';
import { parseDate } from '../../domain/date/parse.js';
import { Sex, MediaRole } from '../../domain/model/factories.js';
import { countriesByName, countryFlag } from '../../domain/model/countries.js';
import { supportsFlagEmoji } from '../flag-support.js';
import './date-field.js';
import './person-photo.js';

const styles = sheet(css);

export class PersonEditor extends HTMLElement {
  #dialog;
  #fields = {};
  #person = null;
  #photos = [];
  #issues = [];
  #graph = null;
  #resolvePhoto = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];
    this.#dialog = this.#build();
    root.append(this.#dialog);
  }

  /** @param {(path: string) => Promise<string|null>} fn */
  set resolvePhoto(fn) {
    this.#resolvePhoto = fn;
  }

  /**
   * Opens the editor for a person. The caller keeps ownership of the data.
   * @param {object} person
   * @param {{photos?: object[], issues?: object[], graph?: object}} [context]
   */
  open(person, { photos = [], issues = [], graph = null } = {}) {
    this.#person = person;
    this.#photos = photos;
    this.#issues = issues;
    this.#graph = graph;
    this.#renderGallery();
    this.#renderReview();

    this.#fields.firstName.value = person.firstName;
    this.#fields.lastName.value = person.lastName;
    this.#fields.secondLastName.value = person.secondLastName ?? '';
    this.#fields.sex.value = person.sex;
    this.#fields.nationality.value = person.nationality ?? '';
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

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });


    this.#fields.firstName = input();
    this.#fields.lastName = input();
    this.#fields.secondLastName = input();
    this.#fields.sex = select();
    this.#fields.nationality = countrySelect();
    this.#fields.birthDate = document.createElement('date-field');
    this.#fields.deathDate = document.createElement('date-field');
    this.#fields.birthPlace = input();
    this.#fields.deathPlace = input();
    this.#fields.notes = document.createElement('textarea');
    this.#fields.placeholderNote = el('p', { class: 'note', text: S.editor.materialise });
    this.#fields.gallery = el('div', { class: 'gallery' });
    this.#fields.review = el('div', { class: 'issues' });

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
          labelled(S.editor.firstName, this.#fields.firstName),
          // Two surnames, side by side and in the order they are said.
          el('div', {
            class: 'pair',
            children: [
              labelled(S.editor.lastName, this.#fields.lastName),
              labelled(S.editor.secondLastName, this.#fields.secondLastName),
            ],
          }),
          el('div', {
            class: 'pair',
            children: [
              labelled(S.editor.sex, this.#fields.sex),
              labelled(S.editor.nationality, this.#fields.nationality),
            ],
          }),
          this.#eventFieldset(S.editor.birth, 'birth'),
          this.#eventFieldset(S.editor.death, 'death'),
          this.#photoFieldset(),
          labelled(S.editor.notes, this.#fields.notes),
          this.#reviewFieldset(),
        ],
      }),
      el('footer', { children: [remove, cancel, save] }),
    );

    return dialog;
  }

  #reviewFieldset() {
    const fieldset = document.createElement('fieldset');
    fieldset.append(el('legend', { text: S.editor.review }), this.#fields.review);
    return fieldset;
  }

  /**
   * The validation notes for this person, with every named person turned into
   * a button that centres the tree on them.
   *
   * "These partners share a common ancestor" is useless on its own — the whole
   * question it raises is *which* ancestor, and finding them by hand across a
   * large archive is a chore.
   */
  #renderReview() {
    if (this.#issues.length === 0) {
      setChildren(this.#fields.review, [el('p', { class: 'note', text: S.editor.noIssues })]);
      return;
    }

    setChildren(
      this.#fields.review,
      this.#issues.map((found) => {
        const { title, context, people } = describeIssue(found, this.#graph);

        const chips = people
          .filter((person) => person.id !== this.#person.id)
          .map((person) => {
            const button = el('button', {
              text: person.name,
              attrs: { type: 'button', title: S.editor.showPerson(person.name) },
            });
            button.addEventListener('click', () =>
              emit(this, 'person:reveal', { personId: person.id }),
            );
            return button;
          });

        return el('div', {
          class: 'issue',
          attrs: { 'data-severity': found.severity },
          children: [
            el('p', { class: 'what', text: [title, context].filter(Boolean).join(' ') }),
            chips.length > 0 ? el('div', { class: 'who', children: chips }) : null,
          ],
        });
      }),
    );
  }

  #photoFieldset() {
    const add = el('button', { text: S.editor.addPhotos, attrs: { type: 'button' } });
    // The dialog stays open: adding photos is a side operation on a person who
    // already exists, not part of saving the form.
    add.addEventListener('click', () => emit(this, 'photos:add', { personId: this.#person.id }));

    const fieldset = document.createElement('fieldset');
    fieldset.append(
      el('legend', { text: S.editor.photos }),
      this.#fields.gallery,
      el('div', { children: [add] }),
      el('p', { class: 'note', text: S.editor.exifStripped }),
    );

    return fieldset;
  }

  /** Rebuilt whenever the person's photos change. */
  #renderGallery() {
    const person = this.#person;

    if (this.#photos.length === 0) {
      setChildren(this.#fields.gallery, [el('p', { class: 'note', text: S.editor.noPhotos })]);
      return;
    }

    setChildren(
      this.#fields.gallery,
      this.#photos.map((item) => {
        const isPortrait = item.links.some(
          (link) => link.targetId === person.id && link.role === MediaRole.PORTRAIT,
        );

        const photo = document.createElement('person-photo');
        photo.resolve = this.#resolvePhoto;
        photo.person = person;
        photo.path = item.path;

        const promote = el('button', {
          text: '★',
          attrs: { type: 'button', title: S.editor.makePortrait, 'aria-label': S.editor.makePortrait },
        });
        promote.disabled = isPortrait;
        promote.addEventListener('click', () =>
          emit(this, 'photo:portrait', { mediaId: item.id, personId: person.id }),
        );

        const drop = el('button', {
          text: '×',
          attrs: { type: 'button', title: S.editor.removePhoto, 'aria-label': S.editor.removePhoto },
        });
        drop.addEventListener('click', () =>
          emit(this, 'photo:remove', { mediaId: item.id, personId: person.id }),
        );

        return el('div', {
          class: 'shot',
          attrs: { 'data-portrait': isPortrait || null },
          children: [
            photo,
            isPortrait ? el('span', { class: 'tag', text: S.editor.portrait }) : null,
            el('div', { class: 'shot-actions', children: [promote, drop] }),
          ],
        });
      }),
    );
  }

  /** Called by the parent after the photo list changed, without reopening. */
  refreshPhotos(photos) {
    this.#photos = photos;
    this.#renderGallery();
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
        secondLastName: this.#fields.secondLastName.value.trim(),
        sex: this.#fields.sex.value,
        nationality: this.#fields.nationality.value,
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

/**
 * Every country, named in the reader's own language and sorted by that name.
 *
 * The flag is only prefixed where the platform draws one. An option list of
 * boxed letter pairs is noise, and a dropdown cannot be styled into badges the
 * way a card can, so there the name carries it alone.
 */
function countrySelect() {
  const node = document.createElement('select');
  node.append(el('option', { text: S.editor.noNationality, attrs: { value: '' } }));

  const flags = supportsFlagEmoji();

  for (const { code, name } of countriesByName()) {
    const label = flags ? `${countryFlag(code)}  ${name}` : `${name}  (${code})`;
    node.append(el('option', { text: label, attrs: { value: code } }));
  }

  return node;
}

function labelled(text, field) {
  return el('label', { children: [el('span', { text }), field] });
}

customElements.define('person-editor', PersonEditor);

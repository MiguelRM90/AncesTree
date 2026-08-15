/**
 * Application root: decides which screen is shown and turns the components'
 * intent events into store calls.
 *
 * Components never talk to each other: intent bubbles up as CustomEvent, state
 * comes down as properties (architecture.md, store section).
 */

import { el, clear } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';
import { describeIssue } from '../issue-text.js';
import { store } from '../../store/store.js';
import * as actions from '../../store/actions.js';
import './tree-canvas.js';
import './person-editor.js';
import './import-dialog.js';
import './app-notice.js';

const styles = sheet(`
  :host { display: grid; grid-template-rows: auto 1fr; height: 100vh; }

  header {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--c-border-subtle);
    background: var(--c-surface);
  }
  h1 { font-size: var(--fs-base); margin: 0 var(--s-4) 0 0; font-weight: 600; }
  .spacer { flex: 1; }
  .status { font-size: var(--fs-sm); color: var(--c-text-muted); }
  .divider { width: 1px; height: 1.5rem; background: var(--c-border-subtle); margin: 0 var(--s-1); }

  .actions-inline { display: flex; gap: var(--s-2); align-items: center; }
  .actions-inline[hidden] { display: none; }

  /* A disabled control still has to be legible: 0.45 opacity pushed the label
     under 3:1. Muted colours say "unavailable" without dissolving the text. */
  button[disabled] {
    cursor: default;
    color: var(--c-text-muted);
    border-color: var(--c-border-subtle);
    background: var(--c-surface-sunken);
  }
  button[disabled]:hover { border-color: var(--c-border-subtle); }

  main { overflow: auto; }

  .screen {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--s-4);
    padding: var(--s-12);
    text-align: center;
    max-width: 34rem;
    margin: 0 auto;
  }
  .screen h2 { margin: 0; font-size: var(--fs-xl); }
  .screen p { margin: 0; color: var(--c-text-muted); }
  .actions { display: flex; gap: var(--s-3); margin-top: var(--s-4); }
  code { font-family: var(--font-mono); font-size: var(--fs-sm); }
  .error { color: var(--c-error); }
`);

export class AppRoot extends HTMLElement {
  #main;
  #status;
  #toolbar;
  #notices;
  #buttons = {};
  #tree = null;
  #editor = null;
  #importer = null;
  #pendingImport = null;
  #message = '';

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];

    // Save state is a quiet, self-replacing line rather than a notification:
    // autosave fires constantly and must never demand attention.
    this.#status = el('span', {
      class: 'status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });

    this.#main = el('main');
    this.#notices = document.createElement('app-notice');

    root.append(this.#header(), this.#main, this.#notices);
  }

  connectedCallback() {
    for (const type of ['open', 'close', 'change']) {
      store.addEventListener(type, this.#render);
    }
    store.addEventListener('saving', this.#onSaving);
    store.addEventListener('saved', this.#onSaved);
    store.addEventListener('save-error', this.#onSaveError);

    this.addEventListener('person:focus', this.#onPersonFocus);
    this.addEventListener('person:save', this.#onPersonSave);
    this.addEventListener('person:delete', this.#onPersonDelete);
    this.addEventListener('import:merge', this.#onImportMerge);
    this.addEventListener('import:new', this.#onImportNew);

    this.#render();
  }

  disconnectedCallback() {
    for (const type of ['open', 'close', 'change']) {
      store.removeEventListener(type, this.#render);
    }
    store.removeEventListener('saving', this.#onSaving);
    store.removeEventListener('saved', this.#onSaved);
    store.removeEventListener('save-error', this.#onSaveError);

    this.removeEventListener('person:focus', this.#onPersonFocus);
    this.removeEventListener('person:save', this.#onPersonSave);
    this.removeEventListener('person:delete', this.#onPersonDelete);
    this.removeEventListener('import:merge', this.#onImportMerge);
    this.removeEventListener('import:new', this.#onImportNew);
  }

  /** The requirements screen is set by main.js before anything else starts. */
  set unsupported(detail) {
    this.#showUnsupported(detail);
  }

  // --- Chrome --------------------------------------------------------------

  #header() {
    const make = (key, label, onClick) => {
      const button = el('button', { text: label, attrs: { type: 'button' } });
      button.addEventListener('click', onClick);
      this.#buttons[key] = button;
      return button;
    };

    this.#toolbar = el('div', {
      class: 'actions-inline',
      attrs: { role: 'toolbar', 'aria-label': S.a11y.toolbar },
      children: [
        make('edit', S.toolbar.edit, () => this.#editFocal()),
        el('div', { class: 'divider' }),
        make('addParent', S.toolbar.addParent, () => this.#add(actions.addParentFor)),
        make('addPartner', S.toolbar.addPartner, () => this.#add(actions.addPartnerFor)),
        make('addChild', S.toolbar.addChild, () => this.#add(actions.addChildFor)),
        el('div', { class: 'divider' }),
        make('undo', S.toolbar.undo, () => store.undo()),
        make('redo', S.toolbar.redo, () => store.redo()),
        el('div', { class: 'divider' }),
        make('export', S.toolbar.exportZip, () => this.#exportArchive()),
        make('import', S.toolbar.importZip, () => this.#startImport()),
      ],
    });

    return el('header', {
      children: [
        el('h1', { text: S.app.name }),
        this.#toolbar,
        el('div', { class: 'spacer' }),
        this.#status,
      ],
    });
  }

  #syncToolbar() {
    const open = store.isOpen && store.focalPersonId !== null;
    this.#toolbar.hidden = !open;
    if (!open) return;

    this.#buttons.undo.disabled = !store.canUndo;
    this.#buttons.redo.disabled = !store.canRedo;
  }

  #onSaving = () => this.#setStatus(S.tree.saving);
  #onSaved = () => this.#setStatus(S.tree.saved);

  #onSaveError = () => {
    this.#setStatus('');
    this.#notices.show({ severity: 'error', title: S.tree.saveError });
  };

  #setStatus(text) {
    this.#status.textContent = text;
  }

  // --- Intent handlers -----------------------------------------------------

  /**
   * Clicking a person centres the tree on them. Clicking the person who is
   * already centred opens the editor — one click, two obvious meanings, and no
   * extra affordance on every card.
   */
  #onPersonFocus = (event) => {
    const { personId } = event.detail;
    if (personId === store.focalPersonId) this.#editPerson(personId);
    else store.setFocalPerson(personId);
  };

  #onPersonSave = (event) => {
    const { personId, changes } = event.detail;
    const result = actions.updatePerson(personId, changes);
    if (!result.ok) this.#reportBlocked(result.errors);
  };

  #onPersonDelete = (event) => {
    actions.removeEntity('person', event.detail.personId);
  };

  #add(action) {
    const focalId = store.focalPersonId;
    if (focalId === null) return;

    const result = action(focalId);
    if (!result.ok) {
      this.#reportBlocked(result.errors);
      return;
    }
    // A new relative starts blank, so the editor opens straight away: creating
    // an unnamed person and leaving the user to find them is not useful.
    this.#editPerson(result.person.id);
  }

  #editFocal() {
    if (store.focalPersonId !== null) this.#editPerson(store.focalPersonId);
  }

  #editPerson(personId) {
    const person = store.graph?.persons.get(personId);
    if (!person) return;

    if (!this.#editor) {
      this.#editor = document.createElement('person-editor');
      this.shadowRoot.append(this.#editor);
    }
    this.#editor.open(person);
  }

  /**
   * Blocking errors are rare by design — only structurally impossible data —
   * so when one happens it must say what actually went wrong, in words, naming
   * the people involved. Never the raw rule id.
   */
  #reportBlocked(errors = []) {
    const issue = errors[0];

    if (!issue) {
      this.#notices.show({
        severity: 'error',
        title: S.notice.changeRejected,
        detail: S.notice.changeRejectedDetail,
      });
      return;
    }

    const { title, detail } = describeIssue(issue, store.graph);
    this.#notices.show({ severity: 'error', title, detail });
  }

  // --- Archives ------------------------------------------------------------

  #exportArchive() {
    this.#notices.show({ title: S.archive.exporting });

    void this.#guarded(async () => {
      const result = await actions.exportArchive();
      if (result.cancelled) this.#notices.clearTransient();
      else if (result.ok) {
        this.#notices.show({ severity: 'success', title: S.archive.exported(result.entries) });
      }
    });
  }

  /**
   * Import happens in two steps: read what is inside the archive, then let the
   * user pick the strategy. Nothing is written before that choice.
   */
  #startImport() {
    void this.#guarded(async () => {
      const inspection = await actions.beginImport();
      if (!inspection) return;

      this.#pendingImport = inspection;

      if (!this.#importer) {
        this.#importer = document.createElement('import-dialog');
        this.shadowRoot.append(this.#importer);
      }
      this.#importer.open(inspection, store.isOpen);
    });
  }

  #onImportMerge = () => this.#finishImport(actions.finishImportByMerge);
  #onImportNew = () => this.#finishImport(actions.finishImportAsNew);

  #finishImport(strategy) {
    const inspection = this.#pendingImport;
    if (!inspection) return;
    this.#pendingImport = null;

    void this.#guarded(async () => {
      const result = await strategy(inspection);
      if (result?.cancelled) return;

      if (!result?.ok) {
        this.#reportBlocked(result?.errors);
        return;
      }

      const damaged = result.warnings?.length ?? 0;

      this.#notices.show({
        severity: damaged > 0 ? 'warning' : 'success',
        title: result.added ? S.archive.merged(result.added) : S.archive.imported,
        detail: damaged > 0 ? S.archive.damaged(damaged) : '',
      });
    });
  }

  /** Turns a failure into a readable notice instead of an unhandled rejection. */
  async #guarded(operation) {
    try {
      return await operation();
    } catch (error) {
      this.#notices.show({ severity: 'error', title: error?.message ?? String(error) });
      return null;
    }
  }

  // --- Screens -------------------------------------------------------------

  #render = () => {
    this.#syncToolbar();

    if (!store.isOpen) {
      void this.#showWelcome();
      return;
    }

    if (store.focalPersonId === null) {
      this.#showEmptyProject();
      return;
    }

    if (!this.#tree) this.#tree = document.createElement('tree-canvas');
    if (this.#main.firstElementChild !== this.#tree) clear(this.#main).append(this.#tree);

    this.#tree.render({
      graph: store.graph,
      focalId: store.focalPersonId,
      issuesFor: (id) => store.issuesFor(id),
    });
  };

  async #showWelcome() {
    const last = await actions.lastProjectSummary();

    const buttons = [
      el('button', { class: 'primary', text: S.welcome.newProject, attrs: { type: 'button' } }),
      el('button', { text: S.welcome.openProject, attrs: { type: 'button' } }),
      el('button', { text: S.welcome.importArchive, attrs: { type: 'button' } }),
    ];

    buttons[0].addEventListener('click', () =>
      this.#run(() => actions.newProject(S.welcome.defaultName)),
    );
    buttons[1].addEventListener('click', () => this.#run(() => actions.openProject()));
    buttons[2].addEventListener('click', () => this.#startImport());

    if (last) {
      const reopen = el('button', {
        text: `${S.welcome.reopen} ${last.title}`,
        attrs: { type: 'button' },
      });
      // requestPermission() needs a user gesture: only from this button.
      reopen.addEventListener('click', () => this.#run(() => actions.reopenProject(last.id)));
      buttons.push(reopen);
    }

    clear(this.#main).append(
      el('div', {
        class: 'screen',
        children: [
          el('h2', { text: S.app.name }),
          el('p', { text: S.app.tagline }),
          el('p', { text: S.welcome.pickFolderHint }),
          this.#message ? el('p', { class: 'error', text: this.#message }) : null,
          el('div', { class: 'actions', children: buttons }),
        ],
      }),
    );
  }

  #showEmptyProject() {
    const add = el('button', {
      class: 'primary',
      text: S.tree.addFirstPerson,
      attrs: { type: 'button' },
    });

    add.addEventListener('click', () => {
      const result = actions.addPerson();
      if (result.ok) this.#editPerson(result.person.id);
    });

    clear(this.#main).append(
      el('div', {
        class: 'screen',
        children: [
          el('p', { text: S.tree.empty }),
          el('div', { class: 'actions', children: [add] }),
        ],
      }),
    );
  }

  #showUnsupported({ missing = [], fileProtocol = false } = {}) {
    this.#toolbar.hidden = true;
    clear(this.#main).append(
      el('div', {
        class: 'screen',
        children: [
          el('h2', { text: S.unsupported.title }),
          el('p', { text: fileProtocol ? S.unsupported.fileProtocol : S.unsupported.body }),
          el('p', { text: S.unsupported.supported }),
          missing.length > 0
            ? el('p', {
                children: [
                  el('span', { text: `${S.unsupported.missing} ` }),
                  el('code', { text: missing.join(', ') }),
                ],
              })
            : null,
        ],
      }),
    );
  }

  async #run(operation) {
    this.#message = '';
    try {
      const result = await operation();
      if (result?.ok === false && result.reason === 'denied') {
        this.#message = S.welcome.deniedFolder;
      } else if (result?.ok === false && result.reason === 'missing') {
        this.#message = S.welcome.missingFolder;
      }
    } catch (error) {
      // The UI catches at the edge and turns failures into something
      // actionable. A raw stack trace is never shown.
      this.#message = error?.message ?? String(error);
    }
    if (!store.isOpen) void this.#showWelcome();
  }
}

customElements.define('app-root', AppRoot);

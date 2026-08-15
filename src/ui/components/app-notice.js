/**
 * Notification stack.
 *
 * Replaces the one-line status text, which was showing raw rule ids such as
 * PARENT_BORN_AFTER_CHILD to the user.
 *
 * Accessibility: errors go into a role="alert" region so they interrupt and are
 * announced immediately; everything else into role="status", which is polite
 * and waits for a pause. Only errors persist — success and progress messages
 * dismiss themselves, because a notice you have to clear after every save is
 * worse than no notice.
 */

import { el, setChildren } from '../dom.js';
import { base, sheet } from '../styles/sheets.js';
import { S } from '../../config/strings.js';

const AUTO_DISMISS_MS = 6_000;

const styles = sheet(`
  :host {
    position: fixed;
    right: var(--s-4);
    bottom: var(--s-4);
    z-index: 10;
    display: grid;
    gap: var(--s-2);
    justify-items: end;
    pointer-events: none;
    max-width: min(26rem, calc(100vw - var(--s-8)));
  }

  .notice {
    pointer-events: auto;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--s-1) var(--s-3);
    align-items: start;
    padding: var(--s-3);
    border: 1px solid var(--c-border-subtle);
    border-left-width: 4px;
    border-radius: var(--radius);
    background: var(--c-surface);
    box-shadow: var(--shadow);
  }

  .notice.error { border-left-color: var(--c-error); }
  .notice.warning { border-left-color: var(--c-warning); }
  .notice.success { border-left-color: var(--c-accent); }

  .title { font-weight: 600; line-height: 1.35; }
  .detail {
    grid-column: 1;
    font-size: var(--fs-sm);
    color: var(--c-text-muted);
    line-height: 1.35;
  }

  .close {
    grid-row: 1;
    grid-column: 2;
    padding: 0 var(--s-2);
    border: 0;
    background: none;
    color: var(--c-text-muted);
    font-size: var(--fs-lg);
    line-height: 1;
  }
  .close:hover { color: var(--c-text); border: 0; }

  @media (prefers-reduced-motion: no-preference) {
    .notice { animation: rise 120ms ease-out; }
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(var(--s-2)); }
    to { opacity: 1; transform: none; }
  }
`);

export class AppNotice extends HTMLElement {
  #alerts;
  #statuses;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [base, styles];

    // Two separate live regions: assertive for errors, polite for the rest.
    // A single region cannot do both.
    this.#alerts = el('div', { attrs: { role: 'alert', 'aria-live': 'assertive' } });
    this.#statuses = el('div', { attrs: { role: 'status', 'aria-live': 'polite' } });

    root.append(this.#alerts, this.#statuses);
  }

  /**
   * @param {{severity?: 'error'|'warning'|'success'|'info', title: string, detail?: string}} notice
   */
  show({ severity = 'info', title, detail = '' }) {
    const isError = severity === 'error';
    const region = isError ? this.#alerts : this.#statuses;

    const close = el('button', {
      class: 'close',
      text: '×',
      attrs: { type: 'button', 'aria-label': S.notice.dismiss },
    });

    const notice = el('div', {
      class: ['notice', severity],
      children: [
        el('span', { class: 'title', text: title }),
        close,
        detail ? el('span', { class: 'detail', text: detail }) : null,
      ],
    });

    close.addEventListener('click', () => notice.remove());

    // Progress and success messages replace each other instead of stacking:
    // "Saving…" then "Saved" should be one line, not two.
    if (!isError) setChildren(region, [notice]);
    else region.append(notice);

    if (!isError) {
      setTimeout(() => notice.remove(), AUTO_DISMISS_MS);
    }

    return notice;
  }

  /** Clears the polite region, for transient progress messages. */
  clearTransient() {
    setChildren(this.#statuses, []);
  }
}

customElements.define('app-notice', AppNotice);

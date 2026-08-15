/**
 * UI literals, in the reader's language.
 *
 * Every visible piece of text goes through here — nothing is written into the
 * markup — which is what made adding a second language a matter of writing one
 * more dictionary rather than hunting through components.
 *
 * The choice is fixed for the life of the page. Components read `S.x` while
 * rendering but several capture labels when they are built, so switching
 * language reloads rather than trying to repaint everything and missing some.
 */

import { en } from './locales/en.js';
import { es } from './locales/es.js';

const DICTIONARIES = { en, es };

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const STORAGE_KEY = 'ancestree.locale';

/**
 * localStorage, not IndexedDB — this is one short string, which is exactly
 * what localStorage is for. IndexedDB exists in this app only because folder
 * handles cannot be serialised, and that reason does not apply here.
 */
function chooseLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (DICTIONARIES[stored]) return stored;
  } catch {
    // Private modes can refuse storage; the detected language still works.
  }

  const detected = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
  return DICTIONARIES[detected] ? detected : 'en';
}

export const locale = chooseLocale();

export const S = DICTIONARIES[locale];

export function setLocale(code) {
  if (!DICTIONARIES[code] || code === locale) return;

  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    return; // nothing to persist to, so nothing would change after a reload
  }

  globalThis.location.reload();
}

/** Turns a ValidationIssue into text. Rules never build the message themselves. */
export function messageFor(issue) {
  const [group, key] = issue.messageKey.split('.');
  return S[group]?.[key] ?? issue.ruleId;
}

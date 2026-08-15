/**
 * Shared constructable stylesheets.
 *
 * Styles are defined ONCE at module level and adopted by every instance
 * (decisions.md, styles section):
 *
 *  1. CSP: a <style> inside a shadow root DOES count as an inline style for
 *     style-src; the shadow root does not exempt it. Constructable stylesheets
 *     fall outside that check.
 *  2. Performance: the CSSOM is parsed once and shared across all instances.
 *     With hundreds of cards on screen the difference is measurable.
 */

export function sheet(css) {
  const styles = new CSSStyleSheet();
  styles.replaceSync(css);
  return styles;
}

/** Shared base: inherited typography and a visible focus ring everywhere. */
export const base = sheet(`
  :host { font: inherit; color: var(--c-text); }
  :host([hidden]) { display: none; }

  button {
    font: inherit;
    cursor: pointer;
    border-radius: var(--radius-sm);
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text);
    padding: var(--s-2) var(--s-3);
  }
  button:hover { border-color: var(--c-accent); }

  button.primary {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: var(--c-on-accent);
  }

  /**
   * The ring sits OUTSIDE the control thanks to outline-offset, so it is drawn
   * against the surrounding surface rather than against the button's own
   * colour. That is what keeps it visible on the primary button too, where an
   * accent-coloured ring on an accent-coloured background would vanish.
   */
  :focus-visible {
    outline: 3px solid var(--c-focus);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  @media (forced-colors: active) {
    :focus-visible { outline-color: Highlight; }
    button { border-color: CanvasText; }
  }
`);

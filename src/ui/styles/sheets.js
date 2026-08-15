/**
 * Constructable stylesheets, built from real CSS files.
 *
 * Each component keeps its styles in a sibling `.css` file and imports it with
 * Vite's `?inline`, which hands back the file's text at build time. That keeps
 * editor tooling, syntax highlighting and formatting working on actual CSS
 * instead of on a template literal, and adds nothing to the runtime.
 *
 * The stylesheet itself is then built ONCE at module level and adopted by every
 * instance (decisions.md, styles section):
 *
 *  1. CSP: a <style> inside a shadow root DOES count as an inline style for
 *     style-src; the shadow root does not exempt it. Constructable stylesheets
 *     fall outside that check.
 *  2. Performance: the CSSOM is parsed once and shared across all instances.
 *     With hundreds of cards on screen the difference is measurable.
 */

import baseCss from './base.css?inline';
import flagsCss from './flags.css?inline';

/** @param {string} css  the text of a stylesheet */
export function sheet(css) {
  const styles = new CSSStyleSheet();
  styles.replaceSync(css);
  return styles;
}

export const base = sheet(baseCss);

/** Country swatches, adopted only where a nationality is shown. */
export const flags = sheet(flagsCss);

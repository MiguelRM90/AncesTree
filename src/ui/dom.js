/**
 * Safe DOM helpers.
 *
 * FIRM RULE (decisions.md, XSS section): innerHTML with user data is
 * forbidden. And in this app EVERYTHING is user data: names, notes, file names,
 * values from an imported GEDCOM.
 *
 * These helpers exist so that writing safe code is more convenient than writing
 * unsafe code.
 */

/**
 * Creates an element. Text always goes through textContent.
 *
 * @param {string} tag
 * @param {Object} [options]
 * @param {string} [options.text]        textual content, escaped by the DOM
 * @param {string|string[]} [options.class]
 * @param {Object} [options.attrs]
 * @param {Object} [options.dataset]
 * @param {Node[]} [options.children]
 */
export function el(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.text !== undefined) node.textContent = options.text;

  if (options.class) {
    const names = Array.isArray(options.class) ? options.class : [options.class];
    node.classList.add(...names.filter(Boolean));
  }

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }

  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[name] = String(value);
  }

  for (const child of options.children ?? []) {
    if (child) node.append(child);
  }

  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(name, String(value));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/**
 * Replaces the children, dropping anything falsy.
 *
 * Always use this instead of node.replaceChildren(...) directly: passing null
 * to replaceChildren does not skip it, it stringifies it into a literal "null"
 * text node. Conditional children (`cond ? el(...) : null`) are the normal way
 * to write this, so the helper has to absorb them.
 */
export function setChildren(node, children) {
  node.replaceChildren(...children.filter(Boolean));
  return node;
}

/** Intent event travelling upwards. State always comes down as properties. */
export function emit(node, type, detail = {}) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

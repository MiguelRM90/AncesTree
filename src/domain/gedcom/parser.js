/**
 * GEDCOM lexer and parser (decisions.md, GEDCOM import).
 *
 * Real GEDCOM files are dirty. Every rule below exists because files in the
 * wild break it: mixed line endings, a byte-order mark, blank lines, values
 * that begin with meaningful spaces, `@@` as an escaped at-sign, and vendors
 * that invent tags. Aborting on the first bad line would reject most real
 * archives, so errors are collected and the import continues.
 */

/** LEVEL [XREF] TAG [VALUE] — the value may contain anything at all. */
const LINE = /^(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

/**
 * @typedef {Object} GedcomNode
 * @property {string} tag
 * @property {string} xref     '' when the record is not addressable
 * @property {string} value
 * @property {GedcomNode[]} children
 * @property {number} line     for error messages
 */

/**
 * @returns {{records: GedcomNode[], errors: Array<{line: number, text: string, reason: string}>,
 *            encoding: string, version: string}}
 */
export function parseGedcom(text) {
  const errors = [];
  const records = [];
  const stack = [];

  // A byte-order mark survives more round trips than anyone expects.
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);

  lines.forEach((raw, index) => {
    if (raw.trim() === '') return;

    const match = LINE.exec(raw);
    if (!match) {
      errors.push({ line: index + 1, text: raw.slice(0, 120), reason: 'MALFORMED' });
      return;
    }

    const level = Number(match[1]);
    const node = {
      tag: match[3].toUpperCase(),
      xref: match[2] ?? '',
      value: unescapeAt(match[4] ?? ''),
      children: [],
      line: index + 1,
    };

    // CONC continues the previous value; CONT starts a new line within it.
    // Both carry text that may legitimately begin with spaces, which is why
    // the value is taken raw rather than trimmed.
    if (node.tag === 'CONC' || node.tag === 'CONT') {
      const target = stack[level - 1];
      if (!target) {
        errors.push({ line: index + 1, text: raw.slice(0, 120), reason: 'ORPHAN_CONTINUATION' });
        return;
      }
      target.value += node.tag === 'CONT' ? `\n${node.value}` : node.value;
      return;
    }

    stack.length = level;

    if (level === 0) records.push(node);
    else if (stack[level - 1]) stack[level - 1].children.push(node);
    else errors.push({ line: index + 1, text: raw.slice(0, 120), reason: 'ORPHAN_LEVEL' });

    stack[level] = node;
  });

  const head = records.find((record) => record.tag === 'HEAD');

  return {
    records,
    errors,
    encoding: childValue(head, 'CHAR') || 'UNKNOWN',
    version: childValue(child(head, 'GEDC'), 'VERS') || 'UNKNOWN',
  };
}

/** `@@` is how a literal at-sign is written inside a value. */
const unescapeAt = (value) => value.replace(/@@/g, '@');

export const child = (node, tag) => node?.children.find((c) => c.tag === tag) ?? null;
export const children = (node, tag) => node?.children.filter((c) => c.tag === tag) ?? [];
export const childValue = (node, tag) => child(node, tag)?.value ?? '';

/**
 * Shape of a validation issue.
 *
 * It lives in its own module, separate from engine.js, to break the import
 * cycle: engine.js imports the rules, and the rules need Severity.
 */

export const Severity = { ERROR: 'ERROR', WARNING: 'WARNING', INFO: 'INFO' };

/**
 * @typedef {Object} ValidationIssue
 * @property {string} ruleId
 * @property {'ERROR'|'WARNING'|'INFO'} severity
 * @property {Array<{type: string, id: string}>} subjects
 * @property {string} messageKey   literal key, NEVER already-translated text,
 *                                 so future i18n does not force a rewrite
 * @property {Object} params       values to interpolate into the message
 */

/** @returns {ValidationIssue} */
export function issue(ruleId, severity, subjects, messageKey, params = {}) {
  return { ruleId, severity, subjects, messageKey, params };
}

/** `subjects` lets the UI highlight every entity involved, not just one. */
export const subject = (type, id) => ({ type, id });

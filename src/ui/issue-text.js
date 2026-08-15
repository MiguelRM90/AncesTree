/**
 * Turns a ValidationIssue into something a person can read.
 *
 * Rules deliberately carry a `messageKey` and ids rather than prose, so that
 * i18n stays possible (validation-rules.md, engine contract). Resolving that
 * into text belongs here, at the edge, where the graph is available to look up
 * who the issue is actually about.
 */

import { messageFor } from '../config/strings.js';
import { displayName } from '../domain/graph/queries.js';

/**
 * @param {import('../domain/validation/issue.js').ValidationIssue} issue
 * @param {object} [graph]  indexed graph, to resolve names
 * @returns {{title: string, detail: string}}
 */
export function describeIssue(issue, graph) {
  return {
    title: messageFor(issue),
    detail: peopleIn(issue, graph).join(' · '),
  };
}

/** Single line, for tooltips and dense lists. */
export function issueLine(issue, graph) {
  const { title, detail } = describeIssue(issue, graph);
  return detail === '' ? title : `${title} (${detail})`;
}

function peopleIn(issue, graph) {
  if (!graph) return [];

  return issue.subjects
    .filter((subject) => subject.type === 'person')
    .map((subject) => displayName(graph.persons.get(subject.id)))
    .filter(Boolean);
}

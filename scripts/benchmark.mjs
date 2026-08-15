/**
 * Measures the pure pipeline against the performance budget in
 * architecture.md.
 *
 *   node scripts/benchmark.mjs ./stress-10k
 *
 * Everything under domain/ is pure and DOM-free, which is exactly what lets it
 * be timed here instead of through a browser. What this cannot measure is
 * painting; for that, open the generated folder in the app.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateProject } from '../src/domain/model/schema.js';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { validateAll, Severity } from '../src/domain/validation/engine.js';
import { buildLayout } from '../src/domain/layout/engine.js';
import { assignGenerations } from '../src/domain/graph/generations.js';

const folder = process.argv[2] ?? './stress-10k';

const time = (label, fn) => {
  const started = performance.now();
  const result = fn();
  return { label, ms: performance.now() - started, result };
};

const row = (label, ms, budget, note = '') => {
  const verdict = budget === null ? '    ' : ms <= budget ? 'PASS' : 'FAIL';
  const limit = budget === null ? '' : `(budget ${budget} ms)`;
  console.log(
    `  ${verdict} ${ms.toFixed(1).padStart(8)} ms  ${label.padEnd(34)} ${limit.padEnd(18)} ${note}`,
  );
};

// --- Load ------------------------------------------------------------------

const rawText = await readFile(join(folder, 'family.json'), 'utf8');
console.log(`\n${folder} — ${(Buffer.byteLength(rawText) / 1024 / 1024).toFixed(2)} MB on disk\n`);

const parsed = time('JSON.parse', () => JSON.parse(rawText));

// normalizeProject re-derives every date interval from its raw string, which is
// the single most expensive part of opening a project.
const normalised = time('validate + normalise', () => validateProject(parsed.result));
if (!normalised.result.ok) {
  console.error('Invalid project:', normalised.result.errors.map((e) => e.message).join('; '));
  process.exit(1);
}

const project = normalised.result.data;
const indexed = time('buildIndexes', () => buildIndexes(project));
const graph = indexed.result;

console.log('OPENING A PROJECT');
row('JSON.parse', parsed.ms, null);
row('validate + normalise dates', normalised.ms, null);
row('buildIndexes', indexed.ms, null);

const openMs = parsed.ms + normalised.ms + indexed.ms;
row('total, to interactive', openMs, 2000, `${project.persons.length.toLocaleString()} people`);

// --- Validation ------------------------------------------------------------

const validated = time('validateAll', () => validateAll(graph));
const issues = validated.result;
const counts = {
  errors: issues.filter((i) => i.severity === Severity.ERROR).length,
  warnings: issues.filter((i) => i.severity === Severity.WARNING).length,
  info: issues.filter((i) => i.severity === Severity.INFO).length,
};

console.log('\nVALIDATION');
row('validateAll', validated.ms, 1000, `${issues.length.toLocaleString()} issues`);
console.log(
  `       ${counts.errors} errors · ${counts.warnings.toLocaleString()} warnings · ${counts.info.toLocaleString()} notes`,
);

// --- Layout ----------------------------------------------------------------

/**
 * Changing the focal person re-runs the whole layout, so this is the number
 * that decides whether navigating a large tree feels instant.
 */
const sample = [];
for (let i = 0; i < 200; i += 1) {
  sample.push(project.persons[Math.floor((i / 200) * project.persons.length)].id);
}

const settings = project.settings;
const layoutTimes = [];
let visibleTotal = 0;

for (const focalId of sample) {
  const started = performance.now();
  const layout = buildLayout(graph, focalId, {
    up: settings.maxGenerationsUp,
    down: settings.maxGenerationsDown,
  });
  layoutTimes.push(performance.now() - started);
  visibleTotal += layout.rows.reduce((sum, r) => sum + r.nodes.length, 0);
}

layoutTimes.sort((a, b) => a - b);
const median = layoutTimes[Math.floor(layoutTimes.length / 2)];
const p95 = layoutTimes[Math.floor(layoutTimes.length * 0.95)];
const worst = layoutTimes[layoutTimes.length - 1];

console.log('\nCHANGING THE FOCAL PERSON (200 samples)');
row('median', median, 150, `${Math.round(visibleTotal / sample.length)} nodes visible on average`);
row('95th percentile', p95, 150);
row('worst case', worst, 150);

// --- Pruning ---------------------------------------------------------------

/**
 * How much of the archive the Up/Down setting actually puts on screen. This is
 * the number to look at when the app feels slow: the layout is cheap, painting
 * thousands of cards is not.
 */
console.log('\nWHAT YOU SEE FROM THE OPENING PERSON');
console.log('  Up/Down    people    nodes    layout');

for (const window of [1, 2, 3, 4, 5, 6, 8]) {
  const started = performance.now();
  const layout = buildLayout(graph, settings.focalPersonId, { up: window, down: window });
  const ms = performance.now() - started;

  const nodes = layout.rows.reduce((sum, r) => sum + r.nodes.length, 0);
  console.log(
    `    ${String(window).padStart(2)}     ${layout.levels.size.toLocaleString().padStart(8)} ${nodes.toLocaleString().padStart(8)} ${`${ms.toFixed(1)} ms`.padStart(9)}`,
  );
}

const unpruned = time('no window', () =>
  assignGenerations(graph, settings.focalPersonId, { up: 99, down: 99 }),
);
console.log(
  `  no limit ${unpruned.result.size.toLocaleString().padStart(8)}          ${unpruned.ms.toFixed(1)} ms`,
);
console.log('');

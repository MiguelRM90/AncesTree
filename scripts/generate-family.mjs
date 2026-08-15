/**
 * Generates a large, structurally realistic project folder for stress testing.
 *
 *   node scripts/generate-family.mjs --people 10000 --out ./stress-10k
 *   node scripts/generate-family.mjs --people 500 --photos 200 --out ./stress-small
 *   node scripts/generate-family.mjs --people 10000 --generations 10
 *
 * The result is a real AncesTree project: open it with "Open a folder".
 *
 * It builds on the project's own factories and date parser rather than
 * hand-writing JSON, so whatever it produces is guaranteed to match the model.
 * A seeded PRNG keeps runs reproducible, which is what makes benchmark numbers
 * comparable between them.
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

import {
  createProject,
  createPerson,
  createUnion,
  createParentChild,
  createMediaObject,
  mediaLink,
  MediaRole,
  ParentType,
  UnionType,
  Sex,
} from '../src/domain/model/factories.js';
import { parseDate, unknownDate } from '../src/domain/date/parse.js';

// --- Arguments -------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith('--')) pairs.push([token.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

const TARGET = Number(args.people ?? 10_000);
const GENERATIONS = Number(args.generations ?? 9);
const PHOTOS = Number(args.photos ?? 0);
const OUT = args.out ?? `./stress-${TARGET}`;
const SEED = Number(args.seed ?? 20260815);

// --- Seeded randomness -----------------------------------------------------

let state = SEED >>> 0;
const reseed = () => {
  state = SEED >>> 0;
};

const rand = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (probability) => rand() < probability;
const between = (low, high) => low + Math.floor(rand() * (high - low + 1));

/** Deterministic ids, so two runs of the same seed produce the same file. */
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- Vocabulary ------------------------------------------------------------

const MALE_NAMES = ['Antonio', 'José', 'Manuel', 'Francisco', 'Juan', 'Luis', 'Miguel', 'Rafael', 'Pedro', 'Ángel', 'Ramón', 'Vicente', 'Tomás', 'Andrés', 'Emilio'];
const FEMALE_NAMES = ['María', 'Carmen', 'Josefa', 'Isabel', 'Dolores', 'Pilar', 'Teresa', 'Rosa', 'Concepción', 'Encarnación', 'Mercedes', 'Antonia', 'Manuela', 'Rosario', 'Julia'];
const SURNAMES = ['García', 'Fernández', 'Rodríguez', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Gil', 'Vázquez'];
const PLACES = ['Cuenca', 'Toledo', 'Ávila', 'Segovia', 'Soria', 'Teruel', 'Zamora', 'Palencia', 'Huesca', 'Lugo'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const GENERATION_YEARS = 28;
const FIRST_BIRTH_YEAR = 1700;

/**
 * Real genealogy is mostly imprecise, and the validator's cost depends on how
 * many dates carry usable bounds, so this mix matters for the benchmark.
 */
function fuzzyDate(year) {
  const roll = rand();

  if (roll < 0.12) return unknownDate();
  if (roll < 0.3) return parseDate(`ABT ${year}`);
  if (roll < 0.36) return parseDate(`BEF ${year + between(1, 4)}`);
  if (roll < 0.4) return parseDate(`AFT ${year - between(1, 4)}`);
  if (roll < 0.44) return parseDate(`BET ${year - 2} AND ${year + 2}`);
  if (roll < 0.6) return parseDate(String(year));
  if (roll < 0.75) return parseDate(`${pick(MONTHS)} ${year}`);

  return parseDate(`${between(1, 28)} ${pick(MONTHS)} ${year}`);
}

const event = (year) => ({ date: fuzzyDate(year), place: chance(0.7) ? pick(PLACES) : '' });

// --- Tree construction -----------------------------------------------------

let persons = [];
let unions = [];
let parentChildren = [];
const media = [];

/**
 * @param {number} minLifespan  someone who goes on to have children has to
 *   outlive them being born. Without this the generator produced women who
 *   died at five and then had descendants — genealogically impossible data
 *   that the validator was right to reject.
 */
function makePerson(generation, sex, surname, { minLifespan = 0 } = {}) {
  const birthYear = FIRST_BIRTH_YEAR + generation * GENERATION_YEARS + between(-4, 4);

  // Historical infant mortality, but only for people who never became parents.
  const diesYoung = minLifespan === 0 && between(1, 100) <= 12;
  const lifespan = diesYoung ? between(0, 12) : between(Math.max(45, minLifespan), 92);
  const deathYear = birthYear + lifespan;
  const stillLiving = deathYear > 2010 && chance(0.7);

  const person = createPerson({
    id: uuid(),
    firstName: sex === Sex.MALE ? pick(MALE_NAMES) : pick(FEMALE_NAMES),
    lastName: surname ?? pick(SURNAMES),
    sex,
    birth: event(birthYear),
    death: stillLiving ? null : event(deathYear),
    notes: chance(0.06) ? 'Recorded from the parish register.' : '',
  });

  persons.push(person);
  return person;
}

function marry(a, b, year) {
  const union = createUnion({
    id: uuid(),
    partner1Id: a.id,
    partner2Id: b.id,
    type: chance(0.88) ? UnionType.MARRIED : UnionType.PARTNERS,
    startDate: chance(0.8) ? fuzzyDate(year) : null,
  });
  unions.push(union);
  return union;
}

function descend(parentA, parentB, child, union) {
  for (const parent of [parentA, parentB]) {
    parentChildren.push(
      createParentChild({
        id: uuid(),
        parentId: parent.id,
        childId: child.id,
        unionId: union?.id ?? null,
        // A few adoptions, which is what makes the per-parent edge design worth
        // having in the first place.
        type: chance(0.03) ? ParentType.ADOPTED : ParentType.BIOLOGICAL,
      }),
    );
  }
}

/**
 * Someone who married into the family. A share of them have one known parent
 * and one placeholder, which is the everyday case of a half-documented line.
 */
function makeSpouse(generation, partnerSex) {
  const spouse = makePerson(generation, partnerSex === Sex.MALE ? Sex.FEMALE : Sex.MALE, undefined, {
    minLifespan: 45,
  });

  if (chance(0.3) && persons.length + 2 <= TARGET) {
    const known = makePerson(generation - 1, chance(0.5) ? Sex.MALE : Sex.FEMALE, undefined, {
      minLifespan: 45,
    });
    const unknown = createPerson({ id: uuid(), isPlaceholder: true });
    persons.push(unknown);
    descend(known, unknown, spouse, null);
  }

  return spouse;
}

function build(founderCouples) {
  reseed();
  persons = [];
  unions = [];
  parentChildren = [];

  let couples = [];

  for (let i = 0; i < founderCouples; i += 1) {
    const surname = pick(SURNAMES);
    const husband = makePerson(0, Sex.MALE, surname, { minLifespan: 45 });
    const wife = makePerson(0, Sex.FEMALE, undefined, { minLifespan: 45 });
    couples.push({ union: marry(husband, wife, FIRST_BIRTH_YEAR + 24), a: husband, b: wife });
  }

  let generation = 0;

  while (persons.length < TARGET && couples.length > 0 && generation < GENERATIONS) {
    generation += 1;

    // Every child of this generation is born first, and only then are the
    // marriages arranged. Pairing as we go would force a brand new spouse for
    // each one, and every one of those is a person with no ancestry: an early
    // version left 44% of the archive parentless.
    const marrying = [];

    for (const couple of couples) {
      if (persons.length >= TARGET) break;

      const childCount = [0, 1, 2, 2, 3, 3, 4, 5][between(0, 7)];

      for (let i = 0; i < childCount && persons.length < TARGET; i += 1) {
        const sex = chance(0.5) ? Sex.MALE : Sex.FEMALE;

        // Decided before the person is built, because whether they go on to
        // have a family determines how long they have to live.
        const willMarry = chance(0.78) && persons.length + 1 < TARGET;

        const child = makePerson(generation, sex, sex === Sex.MALE ? couple.a.lastName : undefined, {
          minLifespan: willMarry ? 45 : 0,
        });
        descend(couple.a, couple.b, child, couple.union);

        if (willMarry) marrying.push({ person: child, family: couple.union.id });
      }
    }

    const next = [];
    const pool = shuffle(marrying);
    const weddingYear = FIRST_BIRTH_YEAR + generation * GENERATION_YEARS + 24;

    while (pool.length > 0 && persons.length < TARGET) {
      const groom = pool.pop();

      // Nearly half marry someone already in the archive rather than a stranger
      // invented for the purpose. It is what actually happened in small towns,
      // it stops the tree fragmenting into unconnected lines, and the shared
      // ancestors it creates are what exercise the consanguinity rule.
      let bride = null;
      if (pool.length > 0 && chance(0.45)) {
        const at = pool.findIndex(
          (candidate) =>
            candidate.family !== groom.family && candidate.person.sex !== groom.person.sex,
        );
        if (at !== -1) bride = pool.splice(at, 1)[0].person;
      }

      bride ??= makeSpouse(generation, groom.person.sex);

      const union = marry(groom.person, bride, weddingYear);
      next.push({ union, a: groom.person, b: bride });
    }

    couples = next;
  }
}

/**
 * How many founder couples produce TARGET people.
 *
 * Solving this analytically means encoding the fertility, marriage and pairing
 * rates as constants, and every one of them drifts the moment the algorithm
 * changes — which is exactly how an earlier version ended up producing a fifth
 * of the people it claimed. Measuring and correcting is shorter and cannot go
 * stale.
 */
let founders = Math.max(1, Math.round(TARGET / 400));

for (let attempt = 0; attempt < 8; attempt += 1) {
  build(founders);
  if (persons.length >= TARGET * 0.97) break;
  founders = Math.max(founders + 1, Math.round(founders * (TARGET / Math.max(1, persons.length))));
}

// --- Measuring what came out -----------------------------------------------

/**
 * Everything below is measured from the finished data, never counted off the
 * generating loop. An earlier version reported its loop counter as the number
 * of generations and was wrong by half.
 */
function analyse() {
  const parentsOf = new Map();
  const childrenOf = new Map();
  const partnersOf = new Map();
  const add = (map, key, value) => map.set(key, [...(map.get(key) ?? []), value]);

  for (const link of parentChildren) {
    add(parentsOf, link.childId, link.parentId);
    add(childrenOf, link.parentId, link.childId);
  }
  for (const union of unions) {
    add(partnersOf, union.partner1Id, union.partner2Id);
    add(partnersOf, union.partner2Id, union.partner1Id);
  }

  // The longest chain of ancestors and of descendants each person has. This is
  // what "how many generations" means in a family tree — not the distance to
  // the nearest person who happens to have no parents recorded.
  const reach = (map) => {
    const memo = new Map();
    const walk = (id, guard = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      if (guard.has(id)) return 0;
      guard.add(id);

      let deepest = 0;
      for (const next of map.get(id) ?? []) deepest = Math.max(deepest, 1 + walk(next, guard));

      guard.delete(id);
      memo.set(id, deepest);
      return deepest;
    };
    return walk;
  };

  const upFrom = reach(parentsOf);
  const downFrom = reach(childrenOf);

  const neighbours = (id) => [
    ...(parentsOf.get(id) ?? []),
    ...(childrenOf.get(id) ?? []),
    ...(partnersOf.get(id) ?? []),
  ];

  const seen = new Set();
  const lines = [];

  for (const person of persons) {
    if (seen.has(person.id)) continue;

    const line = [];
    const stack = [person.id];
    seen.add(person.id);

    while (stack.length > 0) {
      const id = stack.pop();
      line.push(id);
      for (const next of neighbours(id)) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }

    lines.push(line);
  }

  lines.sort((a, b) => b.length - a.length);
  const largest = lines[0];

  // Open on whoever has the most to show in BOTH directions: a person with
  // deep ancestry but no descendants makes a large archive look empty.
  let focalId = largest[0];
  let best = -1;

  for (const id of largest) {
    const score = Math.min(upFrom(id), downFrom(id)) * 100 + upFrom(id) + downFrom(id);
    if (score > best) {
      best = score;
      focalId = id;
    }
  }

  return {
    depth: Math.max(...persons.map((p) => upFrom(p.id))) + 1,
    lines: lines.length,
    largest: largest.length,
    rootless: persons.filter((p) => !parentsOf.has(p.id)).length,
    focalId,
    focalUp: upFrom(focalId),
    focalDown: downFrom(focalId),
  };
}

const structure = analyse();

// --- Photos ----------------------------------------------------------------

/** A minimal valid PNG: one solid colour, so every file differs by content. */
function solidPng(size, [r, g, b]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const at = row + 1 + x * 3;
      raw[at] = (r + x) & 0xff;
      raw[at + 1] = (g + y) & 0xff;
      raw[at + 2] = b & 0xff;
    }
  }

  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// --- Write it out ----------------------------------------------------------

const project = createProject({ title: `Stress test · ${TARGET} people` });
project.project.id = uuid();

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'photos'), { recursive: true });
await mkdir(join(OUT, 'documents'), { recursive: true });
await mkdir(join(OUT, 'backups'), { recursive: true });

for (let i = 0; i < PHOTOS && i < persons.length; i += 1) {
  const subject = persons[Math.floor((i / PHOTOS) * persons.length)];
  const bytes = solidPng(96, [between(40, 220), between(40, 220), between(40, 220)]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path = `photos/${hash.slice(0, 2)}/${hash}.png`;

  await mkdir(join(OUT, 'photos', hash.slice(0, 2)), { recursive: true });
  await writeFile(join(OUT, path), bytes);

  media.push(
    createMediaObject({
      id: uuid(),
      path,
      hash,
      mime: 'image/png',
      bytes: bytes.length,
      width: 96,
      height: 96,
      caption: `Portrait of ${subject.firstName} ${subject.lastName}`,
      links: [mediaLink(subject.id, MediaRole.PORTRAIT)],
    }),
  );
}

Object.assign(project, { persons, unions, parentChildren, media });
project.settings.focalPersonId = structure.focalId;

const familyJson = JSON.stringify(project, null, 2);
await writeFile(join(OUT, 'family.json'), familyJson);
await writeFile(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      schemaVersion: project.schemaVersion,
      projectId: project.project.id,
      title: project.project.title,
      exportedAt: new Date().toISOString(),
      appVersion: project.app.version,
      encrypted: false,
      counts: {
        persons: persons.length,
        unions: unions.length,
        parentChildren: parentChildren.length,
        media: media.length,
      },
    },
    null,
    2,
  ),
);

const focal = persons.find((p) => p.id === structure.focalId);
const percent = (n) => `${Math.round((n / persons.length) * 100)}%`;

console.log(`Wrote ${OUT}`);
console.log(`  persons          ${persons.length.toLocaleString()}`);
console.log(`  unions           ${unions.length.toLocaleString()}`);
console.log(`  parent links     ${parentChildren.length.toLocaleString()}`);
console.log(`  placeholders     ${persons.filter((p) => p.isPlaceholder).length.toLocaleString()}`);
console.log(`  photos           ${media.length.toLocaleString()}`);
console.log('');
console.log(`  generations      ${structure.depth}  (founder couples: ${founders})`);
console.log(`  family lines     ${structure.lines}  (largest ${structure.largest.toLocaleString()})`);
console.log(`  without parents  ${structure.rootless.toLocaleString()} (${percent(structure.rootless)})`);
console.log(
  `  opens on         ${focal.firstName} ${focal.lastName} — ${structure.focalUp} generations up, ${structure.focalDown} down`,
);
console.log(`  family.json      ${(Buffer.byteLength(familyJson) / 1024 / 1024).toFixed(2)} MB`);

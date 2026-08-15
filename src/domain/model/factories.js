/**
 * Constructors for the model entities (data-model.md, entities section).
 *
 * Pure functions: each returns a complete entity with valid defaults. No entity
 * is ever built from loose literals scattered through the code.
 */

import { unknownDate } from '../date/parse.js';

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0';

export const Sex = { MALE: 'M', FEMALE: 'F', UNKNOWN: 'U', OTHER: 'X' };

export const UnionType = {
  MARRIED: 'MARRIED',
  PARTNERS: 'PARTNERS',
  CASUAL: 'CASUAL',
  UNKNOWN: 'UNKNOWN',
};

export const ParentType = {
  BIOLOGICAL: 'BIOLOGICAL',
  ADOPTED: 'ADOPTED',
  FOSTER: 'FOSTER',
  STEP: 'STEP',
  GUARDIAN: 'GUARDIAN',
};

export const Certainty = { CONFIRMED: 'CONFIRMED', PROBABLE: 'PROBABLE', DISPUTED: 'DISPUTED' };

export const MediaKind = { PHOTO: 'PHOTO', DOCUMENT: 'DOCUMENT' };

/** A person has at most one PORTRAIT; everything else is an attachment. */
export const MediaRole = { PORTRAIT: 'PORTRAIT', ATTACHMENT: 'ATTACHMENT' };

export const mediaLink = (targetId, role = MediaRole.ATTACHMENT) => ({
  targetType: 'person',
  targetId,
  role,
});

export const newId = () => crypto.randomUUID();

const now = () => new Date().toISOString();

/** Life event: an uncertain date plus a free-text place, same as GEDCOM PLAC. */
export function createLifeEvent({ date = unknownDate(), place = '' } = {}) {
  return { date, place };
}

export function createPerson(overrides = {}) {
  const timestamp = now();
  return {
    id: newId(),
    firstName: '',
    lastName: '',
    alsoKnownAs: [],
    sex: Sex.UNKNOWN,
    birth: null,
    death: null,
    isPlaceholder: false,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

/**
 * Placeholder person: created ON DEMAND to express "there was a mother here,
 * but I do not know who". NEVER generates its own parents in cascade
 * (data-model.md, placeholders section).
 */
export function createPlaceholder(overrides = {}) {
  return createPerson({ isPlaceholder: true, ...overrides });
}

export function createUnion({ partner1Id, partner2Id, ...overrides } = {}) {
  return {
    id: newId(),
    partner1Id,
    partner2Id,
    type: UnionType.UNKNOWN,
    startDate: null,
    endDate: null,
    notes: '',
    ...overrides,
  };
}

/**
 * ONE EDGE PER PARENT, not one row per couple. It is the only shape that can
 * express a child with a biological father and an adoptive mother. Do not
 * "simplify" it back (data-model.md, ParentChild section).
 */
export function createParentChild({ parentId, childId, ...overrides } = {}) {
  return {
    id: newId(),
    parentId,
    childId,
    type: ParentType.BIOLOGICAL,
    unionId: null,
    certainty: Certainty.CONFIRMED,
    ...overrides,
  };
}

export function createMediaObject({ path, hash, mime, bytes, ...overrides } = {}) {
  return {
    id: newId(),
    kind: MediaKind.PHOTO,
    path,
    hash,
    mime,
    bytes,
    width: null,
    height: null,
    caption: '',
    takenDate: null,
    links: [],
    exifStripped: false,
    ...overrides,
  };
}

export function createProject({ title = 'Untitled family' } = {}) {
  const timestamp = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    app: { name: 'AncesTree', version: APP_VERSION },
    project: { id: newId(), title, createdAt: timestamp, updatedAt: timestamp },
    settings: {
      focalPersonId: null,
      maxGenerationsUp: 4,
      maxGenerationsDown: 4,
      stripExifOnImport: true,
    },
    persons: [],
    unions: [],
    parentChildren: [],
    media: [],
  };
}

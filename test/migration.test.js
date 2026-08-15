import { expect } from '@open-wc/testing';
import { parseProject, validateProject } from '../src/domain/model/schema.js';
import { v1ToV2 } from '../src/domain/migrations/v1-to-v2.js';
import { SCHEMA_VERSION } from '../src/domain/model/factories.js';
import { displayName, surnamesOf } from '../src/domain/graph/queries.js';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { exportGedcom } from '../src/domain/gedcom/export.js';
import { person, project } from './fixtures/families.js';

/** A file as version 1 wrote it: one surname, no second. */
const asV1 = () => ({
  schemaVersion: 1,
  app: { name: 'AncesTree', version: '0.1.0' },
  project: { id: 'p1', title: 'Old file' },
  settings: { focalPersonId: null },
  persons: [
    { id: 'a', firstName: 'Ramón', lastName: 'García', sex: 'M' },
    { id: 'b', firstName: 'Carmen', lastName: 'De la Fuente', sex: 'F' },
  ],
  unions: [],
  parentChildren: [],
  media: [],
});

describe('schema migration', () => {
  it('brings a v1 file forward when it is opened', () => {
    const result = validateProject(asV1());

    expect(result.ok).to.equal(true);
    expect(result.data.schemaVersion).to.equal(SCHEMA_VERSION);
    expect(result.data.persons[0].secondLastName).to.equal('');
  });

  /**
   * "De la Fuente" and "García Pérez" look identical to anything that splits
   * on a space. Guessing wrong would quietly corrupt somebody's family record,
   * so the old value is kept whole and the user fills in the rest.
   */
  it('never guesses how to split an existing surname', () => {
    const migrated = v1ToV2(asV1());

    expect(migrated.persons[1].lastName).to.equal('De la Fuente');
    expect(migrated.persons[1].secondLastName).to.equal('');
  });

  it('leaves a file that is already current alone', () => {
    const current = project({ persons: [person('Ramón')] });
    const result = validateProject(current);

    expect(result.ok).to.equal(true);
    expect(result.data.persons[0].lastName).to.equal('Doe');
  });

  it('still refuses a file from the future', () => {
    const result = validateProject({ ...asV1(), schemaVersion: SCHEMA_VERSION + 1 });

    expect(result.ok).to.equal(false);
    expect(result.errors[0].code).to.equal('FUTURE_VERSION');
  });

  it('migrates through parseProject as well', () => {
    const result = parseProject(JSON.stringify(asV1()));
    expect(result.ok).to.equal(true);
    expect(result.data.schemaVersion).to.equal(SCHEMA_VERSION);
  });
});

describe('two surnames', () => {
  const ramon = () => {
    const p = person('Ramón');
    p.lastName = 'García';
    p.secondLastName = 'Pérez';
    return p;
  };

  it('reads back in the order a name is said', () => {
    expect(displayName(ramon())).to.equal('Ramón García Pérez');
  });

  it('drops the gap when only one surname is known', () => {
    const p = ramon();
    p.secondLastName = '';
    expect(displayName(p)).to.equal('Ramón García');
    expect(surnamesOf(p)).to.eql(['García']);
  });

  it('exports both to GEDCOM, with the split kept as an extension', () => {
    const text = exportGedcom(project({ persons: [ramon()] }), { now: new Date(Date.UTC(2026, 0, 1)) });
    const lines = text.split('\r\n');

    // One surname field is all GEDCOM has, so both go in it.
    expect(lines).to.include('1 NAME Ramón /García Pérez/');
    expect(lines).to.include('2 SURN García Pérez');
    expect(lines).to.include('2 _SURN2 Pérez');
  });

  it('is searchable by either surname', async () => {
    const { searchPeople } = await import('../src/domain/graph/search.js');
    const g = buildIndexes(project({ persons: [ramon()] }));

    expect(searchPeople(g, 'garcia')).to.have.lengthOf(1);
    expect(searchPeople(g, 'perez')).to.have.lengthOf(1);
    expect(searchPeople(g, 'garcia perez')).to.have.lengthOf(1);
  });
});

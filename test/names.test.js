import { expect } from '@open-wc/testing';
import { validateProject } from '../src/domain/model/schema.js';
import { displayName, surnamesOf } from '../src/domain/graph/queries.js';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { searchPeople } from '../src/domain/graph/search.js';
import { exportGedcom } from '../src/domain/gedcom/export.js';
import { person, project } from './fixtures/families.js';

const ramon = () => {
  const p = person('Ramón');
  p.lastName = 'García';
  p.secondLastName = 'Pérez';
  return p;
};

describe('two surnames', () => {
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
    const text = exportGedcom(project({ persons: [ramon()] }), {
      now: new Date(Date.UTC(2026, 0, 1)),
    });
    const lines = text.split('\r\n');

    // One surname field is all GEDCOM has, so both go in it.
    expect(lines).to.include('1 NAME Ramón /García Pérez/');
    expect(lines).to.include('2 SURN García Pérez');
    expect(lines).to.include('2 _SURN2 Pérez');
  });

  it('is searchable by either surname', () => {
    const g = buildIndexes(project({ persons: [ramon()] }));

    expect(searchPeople(g, 'garcia')).to.have.lengthOf(1);
    expect(searchPeople(g, 'perez')).to.have.lengthOf(1);
    expect(searchPeople(g, 'garcia perez')).to.have.lengthOf(1);
  });
});

/**
 * The schema is still being designed and changes in place, so a file written
 * by an older build has to keep opening. Every field is additive with a safe
 * default, and this is the test that keeps it that way.
 */
describe('older files', () => {
  it('opens a file that predates the newest fields', () => {
    const older = {
      schemaVersion: 1,
      persons: [{ id: 'a', firstName: 'Ramón', lastName: 'García', sex: 'M' }],
      unions: [],
      parentChildren: [],
      media: [],
    };

    const result = validateProject(older);

    expect(result.ok).to.equal(true);
    expect(result.data.persons[0].secondLastName).to.equal('');
    expect(result.data.persons[0].nationality).to.equal('');
  });

  it('drops a nationality code that is not a country', () => {
    const result = validateProject({
      schemaVersion: 1,
      persons: [
        { id: 'a', nationality: 'ES' },
        { id: 'b', nationality: 'Atlantis' },
      ],
      unions: [],
      parentChildren: [],
      media: [],
    });

    expect(result.data.persons[0].nationality).to.equal('ES');
    expect(result.data.persons[1].nationality).to.equal('');
  });

  it('still refuses a file with no version at all', () => {
    const result = validateProject({ persons: [], unions: [], parentChildren: [], media: [] });

    expect(result.ok).to.equal(false);
    expect(result.errors[0].code).to.equal('MISSING_VERSION');
  });
});

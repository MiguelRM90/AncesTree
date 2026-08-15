import { expect } from '@open-wc/testing';
import { searchPeople } from '../src/domain/graph/search.js';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { createPlaceholder, Sex } from '../src/domain/model/factories.js';
import { person, project } from './fixtures/families.js';

const named = (first, last, born = '') => {
  const p = person(first, { born, sex: Sex.MALE });
  p.lastName = last;
  return p;
};

const graphOf = (persons) => buildIndexes(project({ persons }));

describe('person search', () => {
  it('finds someone by either part of their name', () => {
    const g = graphOf([named('Ramón', 'Gil'), named('Carmen', 'Díaz')]);

    expect(searchPeople(g, 'ramon').map((r) => r.name)).to.eql(['Ramón Gil']);
    expect(searchPeople(g, 'gil').map((r) => r.name)).to.eql(['Ramón Gil']);
  });

  /**
   * Nobody types the accents when they are searching, and in a Spanish archive
   * requiring them would make the search close to useless.
   */
  it('ignores accents in both the query and the names', () => {
    const g = graphOf([named('Ramón', 'Vázquez'), named('Ángel', 'Jiménez')]);

    expect(searchPeople(g, 'vazquez').map((r) => r.name)).to.eql(['Ramón Vázquez']);
    expect(searchPeople(g, 'jimenez').map((r) => r.name)).to.eql(['Ángel Jiménez']);
    expect(searchPeople(g, 'ángel').map((r) => r.name)).to.eql(['Ángel Jiménez']);
  });

  it('matches the words in any order', () => {
    const g = graphOf([named('Ramón', 'Gil'), named('Gil', 'Ramírez')]);
    expect(searchPeople(g, 'gil ramon').map((r) => r.name)).to.eql(['Ramón Gil']);
  });

  it('puts names that start with the query first', () => {
    const g = graphOf([named('Carmen', 'Gil'), named('Gil', 'Moreno')]);
    expect(searchPeople(g, 'gil')[0].name).to.equal('Gil Moreno');
  });

  it('returns the dates alongside, so two people of a name can be told apart', () => {
    const g = graphOf([named('Ramón', 'Gil', '1780'), named('Ramón', 'Gil', '1820')]);
    const found = searchPeople(g, 'ramon gil');

    expect(found).to.have.lengthOf(2);
    expect(found.map((r) => r.lifespan)).to.not.eql(['', '']);
  });

  it('finds nothing for an empty query rather than everything', () => {
    const g = graphOf([named('Ramón', 'Gil')]);
    expect(searchPeople(g, '')).to.eql([]);
    expect(searchPeople(g, '   ')).to.eql([]);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => named('Ramón', `Gil${i}`));
    expect(searchPeople(graphOf(many), 'ramon', { limit: 5 })).to.have.lengthOf(5);
  });

  // They are gaps in the record, so they are findable but marked as such.
  it('marks placeholder people', () => {
    const ghost = createPlaceholder();
    const g = graphOf([ghost]);

    const found = searchPeople(g, 'unknown');
    expect(found).to.have.lengthOf(1);
    expect(found[0].isPlaceholder).to.equal(true);
  });
});

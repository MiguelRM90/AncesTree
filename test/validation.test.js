import { expect } from '@open-wc/testing';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { validateAll, validateBlocking, Severity } from '../src/domain/validation/engine.js';
import { describeIssue, issueLine } from '../src/ui/issue-text.js';
import { createParentChild, createUnion, Sex } from '../src/domain/model/factories.js';
import { parseDate } from '../src/domain/date/parse.js';
import { minimalFamily, person, project } from './fixtures/families.js';

const run = (data) => validateAll(buildIndexes(data));
const idsOf = (issues) => issues.map((i) => i.ruleId);
const find = (issues, ruleId) => issues.find((i) => i.ruleId === ruleId);

describe('structural rules (all ERROR)', () => {
  it('flags a person who is their own parent', () => {
    const p = person('Loop');
    const data = project({
      persons: [p],
      parentChildren: [createParentChild({ parentId: p.id, childId: p.id })],
    });
    expect(find(run(data), 'SELF_PARENT').severity).to.equal(Severity.ERROR);
  });

  it('flags a cycle', () => {
    const a = person('A');
    const b = person('B');
    const data = project({
      persons: [a, b],
      parentChildren: [
        createParentChild({ parentId: a.id, childId: b.id }),
        createParentChild({ parentId: b.id, childId: a.id }),
      ],
    });
    expect(idsOf(run(data))).to.include('CYCLE');
  });

  it('flags duplicate parent-child links', () => {
    const parent = person('P');
    const child = person('C');
    const data = project({
      persons: [parent, child],
      parentChildren: [
        createParentChild({ parentId: parent.id, childId: child.id }),
        createParentChild({ parentId: parent.id, childId: child.id }),
      ],
    });
    expect(idsOf(run(data))).to.include('DUPLICATE_EDGE');
  });

  it('flags more than two biological parents', () => {
    const child = person('C');
    const parents = ['A', 'B', 'C'].map((n) => person(n));
    const data = project({
      persons: [child, ...parents],
      parentChildren: parents.map((p) => createParentChild({ parentId: p.id, childId: child.id })),
    });
    expect(idsOf(run(data))).to.include('TOO_MANY_BIO_PARENTS');
  });

  it('flags references to missing entities', () => {
    const child = person('C');
    const data = project({
      persons: [child],
      parentChildren: [createParentChild({ parentId: 'nope', childId: child.id })],
    });
    expect(idsOf(run(data))).to.include('DANGLING_REF');
  });

  it('a clean family produces no blocking issues', () => {
    const { data } = minimalFamily();
    expect(validateBlocking(buildIndexes(data))).to.eql([]);
  });
});

describe('temporal rules', () => {
  it('ERRORs when death is impossibly before birth', () => {
    const p = person('X', { born: '1900', died: '1890' });
    const data = project({ persons: [p] });
    expect(find(run(data), 'DEATH_BEFORE_BIRTH').severity).to.equal(Severity.ERROR);
  });

  // The core case of the whole severity policy: overlapping fuzzy dates NEVER
  // block a save.
  it('only WARNs when fuzzy dates overlap', () => {
    const p = person('X', { born: 'ABT 1900', died: '1898' });
    const data = project({ persons: [p] });
    expect(find(run(data), 'DEATH_BEFORE_BIRTH').severity).to.equal(Severity.WARNING);
  });

  it('never blocks on a very young parent', () => {
    const parent = person('P', { born: '1900' });
    const child = person('C', { born: '1908' });
    const data = project({
      persons: [parent, child],
      parentChildren: [createParentChild({ parentId: parent.id, childId: child.id })],
    });
    expect(find(run(data), 'PARENT_TOO_YOUNG').severity).to.equal(Severity.WARNING);
  });

  it('ERRORs when a parent is born after their child', () => {
    const parent = person('P', { born: '1950' });
    const child = person('C', { born: '1920' });
    const data = project({
      persons: [parent, child],
      parentChildren: [createParentChild({ parentId: parent.id, childId: child.id })],
    });
    expect(find(run(data), 'PARENT_BORN_AFTER_CHILD').severity).to.equal(Severity.ERROR);
  });

  it('allows a posthumous birth within the margin', () => {
    const mother = person('M', { sex: Sex.FEMALE, born: '1900', died: '1 MAY 1930' });
    const child = person('C', { born: '1 JAN 1931' });
    const data = project({
      persons: [mother, child],
      parentChildren: [createParentChild({ parentId: mother.id, childId: child.id })],
    });
    expect(idsOf(run(data))).to.not.include('CHILD_AFTER_MOTHER_DEATH');
  });

  it('ERRORs on a birth long after the mother died', () => {
    const mother = person('M', { sex: Sex.FEMALE, born: '1900', died: '1930' });
    const child = person('C', { born: '1935' });
    const data = project({
      persons: [mother, child],
      parentChildren: [createParentChild({ parentId: mother.id, childId: child.id })],
    });
    expect(find(run(data), 'CHILD_AFTER_MOTHER_DEATH').severity).to.equal(Severity.ERROR);
  });

  it('only WARNs for the father in the same situation', () => {
    const father = person('F', { sex: Sex.MALE, born: '1900', died: '1930' });
    const child = person('C', { born: '1935' });
    const data = project({
      persons: [father, child],
      parentChildren: [createParentChild({ parentId: father.id, childId: child.id })],
    });
    expect(find(run(data), 'CHILD_LONG_AFTER_FATHER_DEATH').severity).to.equal(Severity.WARNING);
  });

  it('stays quiet when every date is unknown', () => {
    const a = person('A');
    const b = person('B');
    const data = project({
      persons: [a, b],
      parentChildren: [createParentChild({ parentId: a.id, childId: b.id })],
    });
    const temporal = run(data).filter((i) => i.severity !== Severity.INFO);
    expect(temporal).to.eql([]);
  });
});

describe('coherence rules', () => {
  it('warns about a consanguineous union with children, but never blocks', () => {
    const ancestor = person('Ancestor', { born: '1850' });
    const a = person('A', { born: '1880' });
    const b = person('B', { born: '1882' });
    const child = person('Child', { born: '1910' });

    const union = createUnion({ partner1Id: a.id, partner2Id: b.id });
    const data = project({
      persons: [ancestor, a, b, child],
      unions: [union],
      parentChildren: [
        createParentChild({ parentId: ancestor.id, childId: a.id }),
        createParentChild({ parentId: ancestor.id, childId: b.id }),
        createParentChild({ parentId: a.id, childId: child.id, unionId: union.id }),
        createParentChild({ parentId: b.id, childId: child.id, unionId: union.id }),
      ],
    });

    const issues = run(data);
    expect(find(issues, 'CONSANGUINEOUS_UNION').severity).to.equal(Severity.WARNING);
    expect(validateBlocking(buildIndexes(data))).to.eql([]);
  });

  it('keeps completeness notes at INFO', () => {
    const p = person('Nameless');
    p.lastName = '';
    p.birth = null;
    const issues = run(project({ persons: [p] }));
    for (const ruleId of ['MISSING_BIRTH_DATE', 'MISSING_SURNAME', 'ORPHAN_PERSON']) {
      expect(find(issues, ruleId).severity).to.equal(Severity.INFO);
    }
  });

  it('never nags about placeholders', () => {
    const p = person('Ghost');
    p.isPlaceholder = true;
    p.lastName = '';
    p.birth = null;
    expect(idsOf(run(project({ persons: [p] })))).to.not.include('MISSING_BIRTH_DATE');
  });
});

/**
 * Rules carry a messageKey and ids, never prose, so i18n stays possible. The
 * flip side is that the UI must always resolve them: showing a raw
 * PARENT_BORN_AFTER_CHILD to a user is a bug, not a fallback.
 */
describe('issue text', () => {
  const scenarios = () => {
    const parent = person('Parent', { sex: Sex.MALE, born: '1950' });
    const child = person('Child', { born: '1920' });
    const old = person('Methuselah', { born: '1800', died: '1990' });
    const lonely = person('Lonely');

    return project({
      persons: [parent, child, old, lonely],
      parentChildren: [createParentChild({ parentId: parent.id, childId: child.id })],
    });
  };

  it('never surfaces a raw rule id', () => {
    const graph = buildIndexes(scenarios());
    const issues = validateAll(graph);

    expect(issues.length).to.be.above(0);

    for (const found of issues) {
      const { title } = describeIssue(found, graph);
      expect(title, found.ruleId).to.not.equal(found.ruleId);
      expect(title, found.ruleId).to.match(/[.!?]$/);
    }
  });

  it('names the people an issue is about', () => {
    const graph = buildIndexes(scenarios());
    const issues = validateAll(graph);
    const blocking = issues.find((i) => i.ruleId === 'PARENT_BORN_AFTER_CHILD');

    const { title, detail } = describeIssue(blocking, graph);

    expect(title).to.equal('This parent was born after their child.');
    expect(detail).to.equal('Parent Doe · Child Doe');
    expect(issueLine(blocking, graph)).to.equal(`${title} (${detail})`);
  });

  it('degrades to the message alone when no graph is given', () => {
    const graph = buildIndexes(scenarios());
    const blocking = validateAll(graph).find((i) => i.ruleId === 'PARENT_BORN_AFTER_CHILD');

    expect(describeIssue(blocking).detail).to.equal('');
    expect(issueLine(blocking)).to.equal('This parent was born after their child.');
  });
});

describe('union dates', () => {
  it('ERRORs when a union starts after a partner died', () => {
    const a = person('A', { born: '1900', died: '1930' });
    const b = person('B', { born: '1905' });
    const union = createUnion({ partner1Id: a.id, partner2Id: b.id, startDate: parseDate('1940') });
    const data = project({ persons: [a, b], unions: [union] });
    expect(find(run(data), 'UNION_AFTER_DEATH').severity).to.equal(Severity.ERROR);
  });
});

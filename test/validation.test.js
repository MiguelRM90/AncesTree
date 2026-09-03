import { expect } from '@open-wc/testing';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import {
  validateAll,
  validateBlocking,
  blockingKeys,
  introducedBy,
  issueKey,
  Severity,
} from '../src/domain/validation/engine.js';
import { describeIssue, issueLine } from '../src/ui/issue-text.js';
import { S } from '../src/config/strings.js';
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

  it('flags duplicate unions between the same people', () => {
    const a = person('A');
    const b = person('B');
    const data = project({
      persons: [a, b],
      unions: [
        createUnion({ partner1Id: a.id, partner2Id: b.id }),
        createUnion({ partner1Id: b.id, partner2Id: a.id }),
      ],
    });
    expect(idsOf(run(data))).to.include('DUPLICATE_UNION');
  });

  it('allows duplicate unions if dates do not overlap', () => {
    const a = person('A');
    const b = person('B');
    const data = project({
      persons: [a, b],
      unions: [
        createUnion({ partner1Id: a.id, partner2Id: b.id, endDate: parseDate('1940') }),
        createUnion({ partner1Id: a.id, partner2Id: b.id, startDate: parseDate('1950') }),
      ],
    });
    expect(idsOf(run(data))).to.not.include('DUPLICATE_UNION');
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
  it('only WARNs when the written dates look inverted', () => {
    const p = person('X', { born: 'ABT 1900', died: '1898' });
    const data = project({ persons: [p] });
    expect(find(run(data), 'DEATH_BEFORE_BIRTH').severity).to.equal(Severity.WARNING);
  });

  /**
   * "Cannot be ruled out" is the normal state of a genealogical date, not a
   * problem. AFT 1700 and BEF 1755 overlap as intervals — [1701, ∞) against
   * (-∞, 1754] — and there is nothing odd about them.
   */
  it('stays quiet when open-ended dates merely overlap', () => {
    const p = person('X', { born: 'AFT 1700', died: 'BEF 1755' });
    expect(idsOf(run(project({ persons: [p] })))).to.not.include('DEATH_BEFORE_BIRTH');
  });

  it('still catches an inversion hidden behind open bounds', () => {
    const p = person('X', { born: 'AFT 1900', died: 'BEF 1880' });
    expect(find(run(project({ persons: [p] })), 'DEATH_BEFORE_BIRTH').severity).to.equal(
      Severity.ERROR,
    );
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

  /**
   * The ancestor is named for context, not accused of anything. Listing them
   * as a subject put every descendant's cousin marriage on their card: one
   * founder carried eleven notes, none of which were about him.
   */
  it('puts a consanguinity note on the couple, not on their ancestor', () => {
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

    const found = find(run(data), 'CONSANGUINEOUS_UNION');
    const subjects = found.subjects.map((s) => s.id);

    expect(subjects).to.include(a.id);
    expect(subjects).to.include(b.id);
    expect(subjects).to.not.include(ancestor.id);
    expect(found.params.ancestorId).to.equal(ancestor.id);
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

    // Compared against the active dictionary, not a hardcoded English string:
    // the interface follows the reader's language, and so does this.
    expect(title).to.equal(S.validation.parentBornAfterChild);
    expect(detail).to.equal('Parent Doe · Child Doe');
    expect(issueLine(blocking, graph)).to.equal(`${title} (${detail})`);
  });

  /**
   * "These partners share a common ancestor" is useless on its own: the whole
   * question it raises is which ancestor. The name has to be in the text, and
   * the person has to be reachable from it.
   */
  it('names the shared ancestor and offers them as somewhere to go', () => {
    const ancestor = person('Ancestor', { born: '1850' });
    const a = person('A', { born: '1880' });
    const b = person('B', { born: '1882' });
    const child = person('Child', { born: '1910' });
    const union = createUnion({ partner1Id: a.id, partner2Id: b.id });

    const graph = buildIndexes(
      project({
        persons: [ancestor, a, b, child],
        unions: [union],
        parentChildren: [
          createParentChild({ parentId: ancestor.id, childId: a.id }),
          createParentChild({ parentId: ancestor.id, childId: b.id }),
          createParentChild({ parentId: a.id, childId: child.id, unionId: union.id }),
          createParentChild({ parentId: b.id, childId: child.id, unionId: union.id }),
        ],
      }),
    );

    const found = validateAll(graph).find((i) => i.ruleId === 'CONSANGUINEOUS_UNION');
    const readable = describeIssue(found, graph);

    expect(readable.context).to.contain('Ancestor Doe');
    expect(issueLine(found, graph)).to.contain('Ancestor Doe');
    expect(readable.people.map((p) => p.id)).to.include(ancestor.id);
    expect(readable.people.find((p) => p.id === ancestor.id).role).to.equal('ancestor');
  });

  it('degrades to the message alone when no graph is given', () => {
    const graph = buildIndexes(scenarios());
    const blocking = validateAll(graph).find((i) => i.ruleId === 'PARENT_BORN_AFTER_CHILD');

    expect(describeIssue(blocking).detail).to.equal('');
    expect(issueLine(blocking)).to.equal(S.validation.parentBornAfterChild);
  });
});

/**
 * A project imported from another application arrives with impossible data in
 * it — that is normal, not exceptional. If every later edit were refused until
 * all of it was fixed, the archive would be read-only exactly when the user
 * needs to repair it.
 */
describe('pre-existing damage', () => {
  let damaged;
  let known;

  beforeEach(() => {
    // A parent born after their child: a blocking error, already in the file.
    const parent = person('Parent', { born: '1950' });
    const child = person('Child', { born: '1920' });

    damaged = project({
      persons: [parent, child],
      parentChildren: [createParentChild({ parentId: parent.id, childId: child.id })],
    });

    known = blockingKeys(validateAll(buildIndexes(damaged)));
  });

  it('does not count an error that was already there', () => {
    expect(known.size).to.equal(1);
    expect(introducedBy(known, validateBlocking(buildIndexes(damaged)))).to.eql([]);
  });

  it('still catches a new error in an already damaged project', () => {
    const loop = damaged.persons[0];
    damaged.parentChildren.push(createParentChild({ parentId: loop.id, childId: loop.id }));

    const introduced = introducedBy(known, validateBlocking(buildIndexes(damaged)));
    expect(introduced.map((i) => i.ruleId)).to.include('SELF_PARENT');
  });

  // Two runs of the validator produce different objects for the same problem,
  // so identity has to come from the rule and the people, not the reference.
  it('identifies an issue by rule and subjects, not by object identity', () => {
    const first = validateAll(buildIndexes(damaged))[0];
    const second = validateAll(buildIndexes(damaged))[0];

    expect(first).to.not.equal(second);
    expect(issueKey(first)).to.equal(issueKey(second));
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

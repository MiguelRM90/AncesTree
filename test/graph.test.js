import { expect } from '@open-wc/testing';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { parentsOf, childrenOf, siblingsOf, childrenOfUnion } from '../src/domain/graph/queries.js';
import { ancestorsOf, wouldCreateCycle, closestCommonAncestor } from '../src/domain/graph/traversal.js';
import { assignGenerations } from '../src/domain/graph/generations.js';
import { buildLayout, NodeType } from '../src/domain/layout/engine.js';
import { ParentType } from '../src/domain/model/factories.js';
import {
  minimalFamily,
  mixedAdoptionFamily,
  halfSiblingsFamily,
  familyWithPlaceholder,
} from './fixtures/families.js';

describe('queries', () => {
  it('finds both parents of a child', () => {
    const { father, mother, child, data } = minimalFamily();
    const g = buildIndexes(data);
    const ids = parentsOf(g, child.id).map((p) => p.id);
    expect(ids).to.have.members([father.id, mother.id]);
  });

  it('separates the genetic line from the legal one', () => {
    const { father, mother, child, data } = mixedAdoptionFamily();
    const g = buildIndexes(data);

    const all = parentsOf(g, child.id).map((p) => p.id);
    const biological = parentsOf(g, child.id, { biologicalOnly: true }).map((p) => p.id);

    expect(all).to.have.members([father.id, mother.id]);
    expect(biological).to.eql([father.id]);
    expect(childrenOf(g, mother.id, { biologicalOnly: true })).to.eql([]);
  });

  it('tells full siblings from half siblings', () => {
    const { childA, childB, data } = halfSiblingsFamily();
    const g = buildIndexes(data);

    const { full, half } = siblingsOf(g, childA.id);
    expect(full).to.eql([]);
    expect(half.map((p) => p.id)).to.eql([childB.id]);
  });

  it('lists the children of a union', () => {
    const { union, child, data } = minimalFamily();
    const g = buildIndexes(data);
    expect(childrenOfUnion(g, union).map((p) => p.id)).to.eql([child.id]);
  });

  it('treats a placeholder as a normal parent', () => {
    const { ghost, child, data } = familyWithPlaceholder();
    const g = buildIndexes(data);
    expect(parentsOf(g, child.id).map((p) => p.id)).to.include(ghost.id);
    expect(g.persons.get(ghost.id).isPlaceholder).to.equal(true);
  });
});

describe('traversal', () => {
  it('reports ancestors with their distance', () => {
    const { father, child, data } = minimalFamily();
    const g = buildIndexes(data);
    expect(ancestorsOf(g, child.id).get(father.id)).to.equal(1);
  });

  it('detects a cycle before it is created', () => {
    const { father, child, data } = minimalFamily();
    const g = buildIndexes(data);
    expect(wouldCreateCycle(g, child.id, father.id)).to.equal(true);
    expect(wouldCreateCycle(g, father.id, child.id)).to.equal(false);
  });

  // A loop through an adoption is still a loop.
  it('does not filter by link type when detecting cycles', () => {
    const { father, child, data } = mixedAdoptionFamily();
    data.parentChildren[0].type = ParentType.ADOPTED;
    const g = buildIndexes(data);
    expect(wouldCreateCycle(g, child.id, father.id)).to.equal(true);
  });

  it('finds the closest common ancestor', () => {
    const { father, childA, childB, data } = halfSiblingsFamily();
    const g = buildIndexes(data);
    const common = closestCommonAncestor(g, childA.id, childB.id, 8);
    expect(common.ancestorId).to.equal(father.id);
  });
});

describe('generations', () => {
  it('puts the focal person at level 0 and parents above', () => {
    const { father, mother, child, data } = minimalFamily();
    const g = buildIndexes(data);
    const levels = assignGenerations(g, child.id);

    expect(levels.get(child.id)).to.equal(0);
    expect(levels.get(father.id)).to.equal(-1);
    expect(levels.get(mother.id)).to.equal(-1);
  });

  // Both members of a union are forced into the same visual row, whatever
  // their age difference.
  it('normalises partners to the same level', () => {
    const { father, mother, data } = minimalFamily();
    const g = buildIndexes(data);
    const levels = assignGenerations(g, father.id);
    expect(levels.get(mother.id)).to.equal(levels.get(father.id));
  });

  it('honours the generation window', () => {
    const { father, child, data } = minimalFamily();
    const g = buildIndexes(data);
    const levels = assignGenerations(g, child.id, { up: 0, down: 0 });
    expect(levels.has(father.id)).to.equal(false);
  });
});

describe('layout', () => {
  it('inserts a synthetic union node between partners', () => {
    const { union, data } = minimalFamily();
    const g = buildIndexes(data);
    const { rows, edges } = buildLayout(g, data.settings.focalPersonId);

    const unionNodes = rows
      .flatMap((r) => r.nodes)
      .filter((n) => n.type === NodeType.UNION);

    expect(unionNodes).to.have.lengthOf(1);
    expect(unionNodes[0].entityId).to.equal(union.id);

    // Two partner edges and one descent edge: 2 + N, not 2N.
    expect(edges.filter((e) => e.kind === 'partner')).to.have.lengthOf(2);
    expect(edges.filter((e) => e.kind === 'descent')).to.have.lengthOf(1);
  });

  it('returns nothing when there is no focal person', () => {
    const { data } = minimalFamily();
    const g = buildIndexes(data);
    expect(buildLayout(g, null).rows).to.eql([]);
  });
});

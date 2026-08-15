import { expect } from '@open-wc/testing';
import { buildIndexes } from '../src/domain/graph/indexes.js';
import { parentsOf, childrenOf, siblingsOf, childrenOfUnion } from '../src/domain/graph/queries.js';
import { ancestorsOf, wouldCreateCycle, closestCommonAncestor } from '../src/domain/graph/traversal.js';
import { assignGenerations } from '../src/domain/graph/generations.js';
import { buildLayout, NodeType } from '../src/domain/layout/engine.js';
import { ParentType, Sex, createUnion, createParentChild } from '../src/domain/model/factories.js';
import {
  minimalFamily,
  mixedAdoptionFamily,
  halfSiblingsFamily,
  familyWithPlaceholder,
  person,
  project,
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

  it('shows the focal person their own siblings', () => {
    const { childA, childB, data } = halfSiblingsFamily();
    const g = buildIndexes(data);
    const levels = assignGenerations(g, childA.id, { up: 1, down: 1 });
    expect(levels.get(childB.id)).to.equal(0);
  });

  /**
   * The view is a pedigree, not a sweep of the whole generational band. A walk
   * bounded only by depth reaches an ancestor, then all of their children, then
   * those children's partners, then their children — and so on until it has the
   * entire archive. On 10,000 people that was 2,439 at one generation.
   */
  it('does not spread sideways into cousins', () => {
    const { father, motherA, motherB, childA, childB, data } = halfSiblingsFamily();

    // childB's mother is a different woman: reachable only by going up to the
    // shared father and back down. A pedigree view must not do that.
    const g = buildIndexes(data);
    const levels = assignGenerations(g, childA.id, { up: 4, down: 4 });

    expect(levels.get(father.id)).to.equal(-1);
    expect(levels.get(motherA.id)).to.equal(-1);
    expect(levels.get(childB.id)).to.equal(0, 'half sibling is still shown');
    expect(levels.has(motherB.id)).to.equal(false, "the half sibling's other parent is not");
  });

  it('brings each descendant their partner, so unions still render', () => {
    const { father, mother, child, data } = minimalFamily();
    const g = buildIndexes(data);
    const levels = assignGenerations(g, father.id, { up: 0, down: 1 });

    expect(levels.get(mother.id)).to.equal(0);
    expect(levels.get(child.id)).to.equal(1);
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

  /**
   * Ordering a row by birth date alone scattered siblings among other people's
   * spouses, so the bar joining them ran over three strangers and read as
   * though they were all siblings. Families have to stay contiguous.
   */
  describe('row ordering', () => {
    /** One couple, three married children, each with their own spouse. */
    const threeMarriedChildren = () => {
      const father = person('Father', { sex: Sex.MALE, born: '1900' });
      const mother = person('Mother', { sex: Sex.FEMALE, born: '1902' });
      const union = createUnion({ partner1Id: father.id, partner2Id: mother.id });

      const children = ['1925', '1928', '1931'].map((year, index) =>
        person(`Child${index}`, { born: year }),
      );
      const spouses = children.map((_, index) => person(`Spouse${index}`, { born: '1930' }));

      return {
        father,
        children,
        spouses,
        data: project({
          persons: [father, mother, ...children, ...spouses],
          unions: [
            union,
            ...children.map((child, index) =>
              createUnion({ partner1Id: child.id, partner2Id: spouses[index].id }),
            ),
          ],
          parentChildren: children.flatMap((child) => [
            createParentChild({ parentId: father.id, childId: child.id, unionId: union.id }),
            createParentChild({ parentId: mother.id, childId: child.id, unionId: union.id }),
          ]),
        }),
      };
    };

    const rowOf = (layout, level) =>
      layout.rows
        .find((row) => row.level === level)
        .nodes.filter((node) => node.type === NodeType.PERSON)
        .map((node) => node.entityId);

    it('keeps each couple together and in birth order', () => {
      const { father, children, spouses, data } = threeMarriedChildren();
      const g = buildIndexes(data);
      const order = rowOf(buildLayout(g, father.id, { up: 0, down: 1 }), 1);

      // Each child immediately followed by their own spouse, oldest first.
      expect(order).to.eql([
        children[0].id, spouses[0].id,
        children[1].id, spouses[1].id,
        children[2].id, spouses[2].id,
      ]);
    });

    /**
     * With one uniform gap, one couple's children sat exactly as far from each
     * other as from the next family's, so there was no way to see where a set
     * of siblings ended.
     */
    it('separates families more than it separates couples', () => {
      const { father, data } = threeMarriedChildren();
      const g = buildIndexes(data);

      const spacers = buildLayout(g, father.id, { up: 0, down: 1 })
        .rows.find((row) => row.level === 1)
        .nodes.filter((node) => node.type === NodeType.SPACER);

      // All three children share parents, so every gap here is a couple gap.
      expect(spacers.map((s) => s.size)).to.eql(['couple', 'couple']);
    });

    it('does not leave a trailing spacer at the end of a row', () => {
      const { father, data } = threeMarriedChildren();
      const g = buildIndexes(data);

      for (const row of buildLayout(g, father.id, { up: 0, down: 1 }).rows) {
        expect(row.nodes[row.nodes.length - 1].type).to.not.equal(NodeType.SPACER);
      }
    });

    // The sibling comes first in the pair, not the person who married in.
    it('puts the blood relative on the side facing their siblings', () => {
      const { father, children, data } = threeMarriedChildren();
      const g = buildIndexes(data);
      const order = rowOf(buildLayout(g, father.id, { up: 0, down: 1 }), 1);

      for (const child of children) {
        expect(order.indexOf(child.id) % 2).to.equal(0, `${child.firstName} leads its pair`);
      }
    });

    /**
     * The focal row cannot be oriented by position, because the row above has
     * not been placed yet. Without a rule of its own, the focal person's
     * spouse sat between them and their siblings and the bar joining the
     * siblings had to reach over her.
     */
    it('puts the focal person ahead of their own spouse', () => {
      const { children, spouses, data } = threeMarriedChildren();
      const focal = children[1];

      const g = buildIndexes(data);
      const order = rowOf(buildLayout(g, focal.id, { up: 1, down: 0 }), 0);

      expect(order.indexOf(focal.id)).to.be.below(order.indexOf(spouses[1].id));

      // And the siblings are still there, in birth order, after the pair.
      expect(order.filter((id) => children.some((c) => c.id === id))).to.eql([
        children[0].id,
        children[1].id,
        children[2].id,
      ]);
    });
  });
});

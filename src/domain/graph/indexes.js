/**
 * In-memory indexes of the graph (architecture.md, collections as Map).
 *
 * On disk the collections are flat arrays; here they become Maps plus derived
 * indexes. This is the only boundary where that conversion happens.
 */

/**
 * @typedef {Object} GraphIndexes
 * @property {Map<string, object>} persons
 * @property {Map<string, object>} unions
 * @property {Map<string, object>} parentChildren
 * @property {Map<string, object>} media
 * @property {Map<string, object[]>} childrenByParent   parentId -> ParentChild[]
 * @property {Map<string, object[]>} parentsByChild     childId  -> ParentChild[]
 * @property {Map<string, object[]>} childrenByUnion    unionId  -> ParentChild[]
 * @property {Map<string, object[]>} unionsByPerson     personId -> Union[]
 * @property {Map<string, object[]>} mediaByTarget      targetId -> MediaObject[]
 * @property {object} settings
 */

/** @returns {GraphIndexes} */
export function buildIndexes(project) {
  const persons = byId(project.persons);
  const unions = byId(project.unions);
  const parentChildren = byId(project.parentChildren);
  const media = byId(project.media);

  const childrenByParent = new Map();
  const parentsByChild = new Map();
  // Without this index, "the children of this union" means scanning every
  // parent-child link once per union. That is the layout engine's inner loop,
  // and on a 10,000-person tree it cost more than the rest of the layout put
  // together.
  const childrenByUnion = new Map();

  for (const link of project.parentChildren) {
    push(childrenByParent, link.parentId, link);
    push(parentsByChild, link.childId, link);
    if (link.unionId) push(childrenByUnion, link.unionId, link);
  }

  const unionsByPerson = new Map();
  for (const union of project.unions) {
    push(unionsByPerson, union.partner1Id, union);
    push(unionsByPerson, union.partner2Id, union);
  }

  const mediaByTarget = new Map();
  for (const item of project.media) {
    for (const link of item.links) push(mediaByTarget, link.targetId, item);
  }

  return {
    persons,
    unions,
    parentChildren,
    media,
    childrenByParent,
    parentsByChild,
    childrenByUnion,
    unionsByPerson,
    mediaByTarget,
    settings: project.settings,
  };
}

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

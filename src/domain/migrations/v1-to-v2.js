/**
 * v1 -> v2: a second surname.
 *
 * Spanish records carry two: the father's first surname and the mother's
 * first surname. v1 had a single `lastName`, which made it impossible to tell
 * a compound surname from two separate ones, or to know which one a child
 * inherits (data-model.md, Person).
 *
 * The migration is deliberately conservative: it does NOT try to split
 * existing values on a space. "De la Fuente" and "García Pérez" look identical
 * to a splitter, and guessing wrong would silently corrupt somebody's family
 * record. Whatever was there stays as the first surname, and the second is
 * left empty for the user to fill in.
 */
export function v1ToV2(project) {
  return {
    ...project,
    schemaVersion: 2,
    persons: project.persons.map((person) => ({
      ...person,
      secondLastName: person.secondLastName ?? '',
    })),
  };
}

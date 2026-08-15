/**
 * UI literals.
 *
 * The UI is English-only for the MVP and i18n is out of scope, but strings are
 * never hardcoded in the markup: every visible piece of text goes through this
 * module so translation is not blocked later (decisions.md > Idioma).
 */

export const S = {
  app: {
    name: 'AncesTree',
    tagline: 'A family tree that lives on your own computer.',
  },

  unsupported: {
    title: 'This browser is not supported',
    body:
      'AncesTree stores your family archive in a folder on your own disk, using the File System Access API. ' +
      'That API is only available in Chromium-based desktop browsers.',
    supported: 'Use Chrome, Edge, Opera, Brave or Vivaldi on a desktop computer.',
    missing: 'Missing capabilities:',
    fileProtocol:
      'AncesTree cannot run from a file:// URL. Serve it over http(s) or install it as an app.',
  },

  welcome: {
    newProject: 'New family',
    openProject: 'Open a folder',
    importArchive: 'Import a ZIP',
    reopen: 'Reopen',
    pickFolderHint: 'Choose an empty folder. AncesTree will create the project files inside it.',
    defaultName: 'My family',
    deniedFolder: 'Permission to that folder was not granted.',
    missingFolder: 'That folder is no longer available. Choose it again.',
  },

  tree: {
    empty: 'No one here yet.',
    addFirstPerson: 'Add the first person',
    focusHint: 'Click a person to centre the tree on them. Click again to edit.',
    saving: 'Saving…',
    saved: 'Saved',
    saveError: 'Could not save. Check that the folder is still available.',
  },

  toolbar: {
    edit: 'Edit',
    addParent: 'Add parent',
    addPartner: 'Add partner',
    addChild: 'Add child',
    addPerson: 'Add person',
    undo: 'Undo',
    redo: 'Redo',
    exportZip: 'Export ZIP',
    importZip: 'Import ZIP',
    ancestors: 'Up',
    descendants: 'Down',
    centredOn: 'Centred on',
    generationsUp: 'Generations shown above the centred person',
    generationsDown: 'Generations shown below the centred person',
  },

  archive: {
    exporting: 'Writing archive…',
    exported: (n) => `Archive written · ${n} files`,
    importTitle: 'Import archive',
    summary: (c) =>
      `${c.persons} people · ${c.unions} unions · ${c.media} media · ${c.files} files`,
    unnamedArchive: 'Untitled archive',
    chooseStrategy: 'How should this archive be brought in?',
    mergeHere: 'Merge into this family',
    mergeHint:
      'Adds anything missing, matching by id. Anything already here keeps the local version.',
    openAsNew: 'Open as a new family',
    openAsNewHint: 'Extracts into an empty folder you choose. Nothing existing is touched.',
    merged: (added) =>
      `Imported · ${added.persons} people, ${added.unions} unions, ${added.media} media added`,
    imported: 'Archive imported',
    // A damaged file is reported rather than aborting the whole import.
    damaged: (n) => `${n} ${n === 1 ? 'file was' : 'files were'} damaged and may be incomplete`,
  },

  editor: {
    title: 'Edit person',
    firstName: 'First name',
    lastName: 'Last name',
    sex: 'Sex',
    birth: 'Born',
    death: 'Died',
    place: 'Place',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Delete person',
    confirmRemove: 'Delete this person and every link to them?',
    materialise: 'This is a placeholder for an unknown person. Filling in a name makes them real.',
    year: 'Year',
    rangeSeparator: 'and',
    review: 'Review',
    noIssues: 'Nothing to flag.',
    showPerson: (name) => `Centre the tree on ${name}`,
    photos: 'Photos',
    addPhotos: 'Add photos',
    noPhotos: 'No photos yet.',
    portrait: 'Portrait',
    makePortrait: 'Use as portrait',
    removePhoto: 'Remove photo',
    photoOf: (name) => `Photo of ${name}`,
    exifStripped: 'Location and camera data are removed from photos as they are added.',
    photosAdded: (n) => `${n} ${n === 1 ? 'photo' : 'photos'} added`,
    photosReused: (n) => `${n} already in this archive`,
    photosFailed: (n) => `${n} could not be read`,
    // Only shown for the free-text mode: everything else has its own control.
    dateHint: '12 MAY 1912 · ABT 1885 · BET 1900 AND 1905',
    dateUnrecognised: 'Kept as written, but not understood as a date.',
  },

  /**
   * Kinds of date offered by the editor. Real genealogy is mostly imprecise, so
   * the uncertain forms are first-class here, not an afterthought.
   */
  dateMode: {
    UNKNOWN: 'Unknown',
    EXACT: 'Exact date',
    MONTH: 'Month and year',
    YEAR: 'Year only',
    ABOUT: 'About a year (ABT)',
    ESTIMATED: 'Estimated (EST)',
    BEFORE: 'Before a year (BEF)',
    AFTER: 'After a year (AFT)',
    BETWEEN: 'Between two years (BET)',
    RAW: 'GEDCOM text',
  },

  card: {
    issues: (n) => `${n} ${n === 1 ? 'note' : 'notes'} on this person`,
  },

  notice: {
    dismiss: 'Dismiss',
    changeRejected: 'That change was not saved',
    changeRejectedDetail: 'It would leave the tree in an impossible state.',
  },

  /** Accessible names for things whose meaning is only visual. */
  a11y: {
    tree: 'Family tree',
    treeHint: 'Use the arrow keys to move between people. Press Enter to centre the tree.',
    toolbar: 'Family actions',
    dateKind: 'Kind of date',
    notifications: 'Notifications',
  },

  sex: {
    M: 'Male',
    F: 'Female',
    U: 'Unknown',
    X: 'Other',
  },

  // Validation messages. Keys match the `messageKey` of each rule
  // (validation-rules.md, engine contract section).
  validation: {
    selfParent: 'A person cannot be their own parent.',
    selfUnion: 'A union requires two different people.',
    cycle: 'This link would create a loop in the tree.',
    duplicateEdge: 'This parent-child link already exists.',
    tooManyBiologicalParents: 'A person cannot have more than two biological parents.',
    danglingRef: 'This record points to something that no longer exists.',
    deathBeforeBirth: 'Death date is before the birth date.',
    implausibleLifespan: 'Lifespan over 120 years — check the dates.',
    parentBornAfterChild: 'This parent was born after their child.',
    parentTooYoung: 'This parent would have been very young.',
    parentTooOld: 'This mother would have been unusually old.',
    childAfterMotherDeath: 'This child was born after their mother died.',
    childLongAfterFatherDeath: 'This child was born long after their father died.',
    unionEndBeforeStart: 'The union ends before it starts.',
    unionAfterDeath: 'This union starts after one partner had died.',
    unionBeforeBirth: 'This union starts before one partner was born.',
    unionTooYoung: 'One partner would have been very young.',
    consanguineousUnion: 'These partners share a common ancestor.',
    commonAncestor: (name, generations) =>
      `Common ancestor: ${name}${generations ? `, ${generations} generations back` : ''}.`,
    siblingAsParent: 'Someone is listed as a parent of their own sibling.',
    missingBirthDate: 'No birth date recorded.',
    missingSurname: 'No surname recorded.',
    missingSex: 'Sex not recorded.',
    orphanPerson: 'Not connected to anyone else.',
    livingPersonNoDeath: 'Born over 120 years ago with no death date.',
  },
};

/** Turns a ValidationIssue into text. Rules never build the message themselves. */
export function messageFor(issue) {
  const [group, key] = issue.messageKey.split('.');
  return S[group]?.[key] ?? issue.ruleId;
}

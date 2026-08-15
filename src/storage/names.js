/**
 * The fixed names inside a project folder (storage.md, folder layout).
 *
 * Split out of project-store.js so that modules underneath it can refer to a
 * file without importing the reader that would import them back.
 */

export const FAMILY_FILE = 'family.json';
export const MANIFEST_FILE = 'manifest.json';
export const GEDCOM_FILE = 'family.ged';
export const PHOTOS_DIR = 'photos';
export const DOCUMENTS_DIR = 'documents';
export const BACKUPS_DIR = 'backups';

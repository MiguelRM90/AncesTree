/**
 * The one error type the storage layer throws.
 *
 * It lives on its own so that modules at the bottom of the layer (opfs.js,
 * file-dialog.js) can throw it without importing project-store.js, which
 * imports them back. The same reason issue.js was split out of the validation
 * engine.
 */

export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.code = code;
  }
}

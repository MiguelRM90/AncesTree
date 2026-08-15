/**
 * Minimal IndexedDB wrapper (architecture.md, IndexedDB schema section).
 *
 * IndexedDB does NOT store family data — only the recent projects and their
 * folder handles. The graph lives in family.json, in the user's own folder.
 *
 * It cannot be replaced by localStorage, which is the obvious question. A
 * FileSystemDirectoryHandle is an object, not a string: it survives structured
 * cloning and nothing else. JSON.stringify on one yields `{}`. IndexedDB is
 * the only place in the browser where a handle can be kept, and keeping it is
 * what lets the app reopen your folder instead of asking for it every session.
 */

const DB_NAME = 'ancestree';
const DB_VERSION = 1;

export const Stores = {
  PROJECTS: 'projects',
  HANDLES: 'handles',
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Versioning happens ONLY here, with cumulative migrations.
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        const projects = db.createObjectStore(Stores.PROJECTS, { keyPath: 'id' });
        projects.createIndex('openedAt', 'openedAt');
        db.createObjectStore(Stores.HANDLES, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function run(storeName, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    tx.onerror = () => reject(tx.error);
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve(undefined);
    }
  });
}

export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

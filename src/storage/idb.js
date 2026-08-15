/**
 * Minimal IndexedDB wrapper (architecture.md, IndexedDB schema section).
 *
 * IndexedDB does NOT store family data. Only folder handles, recent projects
 * and interface preferences. The graph lives in family.json, in the user's own
 * folder.
 */

const DB_NAME = 'ancestree';
const DB_VERSION = 1;

export const Stores = {
  PROJECTS: 'projects',
  HANDLES: 'handles',
  PREFS: 'prefs',
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
        db.createObjectStore(Stores.PREFS, { keyPath: 'key' });
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

/** Interface preferences. Not part of the project: they never travel in the ZIP. */
export async function getPref(key, fallback = null) {
  const row = await get(Stores.PREFS, key);
  return row ? row.value : fallback;
}

export const setPref = (key, value) => put(Stores.PREFS, { key, value });

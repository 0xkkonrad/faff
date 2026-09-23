import { createState, updateState, validateState } from './model.js';
import { readLegacyState } from './migration.js';

const DATABASE = 'faff';
let opening;

function database() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => { opening = null; reject(new Error('Close another Faff window, then retry.')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      initialize(db).then(() => resolve(db), error => { db.close(); opening = null; reject(error); });
    };
  });
  return opening;
}

async function initialize(db) {
  const existing = await new Promise((resolve, reject) => {
    const request = db.transaction('state', 'readonly').objectStore('state').get('app');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (existing !== undefined) return;
  const legacy = await readLegacyState();
  if (!legacy) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const request = store.get('app');
    // Another tab may have finished migration while the old database was being read.
    request.onsuccess = () => { if (request.result === undefined) store.put(legacy, 'app'); };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

// A single read/write transaction serializes actions from multiple tabs.
export async function change(action = { type: 'SYNC' }, now = Date.now()) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const request = store.get('app');
    let output, failure;
    request.onsuccess = () => {
      try {
        const initial = request.result === undefined;
        const previous = initial ? createState(now) : validateState(request.result);
        output = updateState(previous, action, now);
        if (initial || output.changed) store.put(output.state, 'app');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(output);
    transaction.onabort = () => reject(failure || transaction.error || new Error('Faff could not save that change.'));
    transaction.onerror = () => { failure ||= transaction.error; };
  });
}

export async function restoreBackup(value) {
  const restored = structuredClone(validateState(value));
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite'), store = transaction.objectStore('state');
    const request = store.get('app');
    let output, failure;
    request.onsuccess = () => {
      try {
        const previous = request.result;
        if (previous) store.put(previous, 'before-restore');
        restored.revision = Math.max(restored.revision, previous?.revision || 0) + 1;
        output = updateState(restored);
        store.put(output.state, 'app');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(output);
    transaction.onabort = () => reject(failure || transaction.error || new Error('The backup could not be restored.'));
    transaction.onerror = () => { failure ||= transaction.error; };
  });
}

import { createState, updateState, validateState } from './model.js';

const DATABASE = 'waffle';
let opening;

function database() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => { opening = null; reject(new Error('Close another Waffle window, then retry.')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  });
  return opening;
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
    transaction.onabort = () => reject(failure || transaction.error || new Error('Waffle could not save that change.'));
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

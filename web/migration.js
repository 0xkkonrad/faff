import { validateState } from './model.js';

// These legacy names are needed to recover existing installations and backups.
export function migrateState(value) {
  if (value?.schemaVersion !== 1) return validateState(value);
  const state = structuredClone(value);
  const renamePlan = plan => {
    if (!plan || typeof plan !== 'object') return;
    plan.faff = plan.waffle;
    delete plan.waffle;
  };
  renamePlan(state.defaults);
  for (const day of Object.values(state.days || {})) {
    renamePlan(day);
    for (const session of day.sessions || []) {
      if (session.grade === 'waffle') session.grade = 'faff';
    }
  }
  state.schemaVersion = 2;
  return validateState(state);
}

export function readBackup(value) {
  if (!['faff-backup', 'waffle-backup'].includes(value?.kind)) throw new Error('Choose a Faff backup file.');
  return structuredClone(migrateState(value.data));
}

export async function readLegacyState() {
  if (indexedDB.databases && !(await indexedDB.databases()).some(db => db.name === 'waffle')) return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('waffle');
    let missing = false;
    // Abort creation when the browser cannot list databases and this is a new user.
    request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
    request.onerror = () => missing ? resolve(undefined) : reject(request.error);
    request.onblocked = () => reject(new Error('Close the older app window, then retry.'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) { db.close(); resolve(undefined); return; }
      const transaction = db.transaction('state', 'readonly');
      const saved = transaction.objectStore('state').get('app');
      transaction.oncomplete = () => {
        db.close();
        try { resolve(saved.result === undefined ? undefined : migrateState(saved.result)); }
        catch (error) { reject(error); }
      };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

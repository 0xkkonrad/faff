import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, updateState, SESSION_MS, dateKey, validateState } from '../web/model.js';
import { migrateState, readBackup } from '../web/migration.js';
const now = new Date('2026-09-22T09:00:00Z').getTime();
function legacyState() {
  let state = createState(now);
  for (const [action,time] of [
    [{type:'COMMIT',focus:2,faff:1},now],
    [{type:'START',id:'done'},now],
    [{type:'RATE',id:'done',grade:'faff'},now+SESSION_MS],
    [{type:'START',id:'active'},now+SESSION_MS],
    [{type:'PAUSE',id:'active'},now+SESSION_MS+60000],
  ]) state = updateState(state,action,time).state;
  return JSON.parse(JSON.stringify(state).replaceAll('"faff"','"waffle"').replace('"schemaVersion":2','"schemaVersion":1'));
}
test('legacy plans, ratings, and paused timers migrate without mutating the backup',()=>{
  const original=legacyState(),before=structuredClone(original),state=migrateState(original);
  assert.deepEqual(original,before);
  assert.equal(state.schemaVersion,2);
  assert.deepEqual(state.defaults,{focus:2,faff:1});
  assert.equal(state.days[dateKey(now)].sessions[0].grade,'faff');
  assert.deepEqual(state.active,original.active);
  assert.equal(state.revision,original.revision);
  assert(!JSON.stringify(state).includes('waffle'));
  validateState(state);
});
test('old and current backup envelopes are accepted and invalid backups are rejected',()=>{
  const migrated=readBackup({kind:'waffle-backup',data:legacyState()});
  assert.deepEqual(readBackup({kind:'faff-backup',data:migrated}),migrated);
  assert.throws(()=>readBackup({kind:'other',data:migrated}));
  assert.throws(()=>readBackup({kind:'waffle-backup',data:{...legacyState(),defaults:{focus:1,waffle:-1}}}));
  assert.throws(()=>migrateState({...migrated,schemaVersion:99}));
});
test('migrating a current state is idempotent',()=>{
  const state=migrateState(legacyState());
  assert.deepEqual(migrateState(state),state);
});

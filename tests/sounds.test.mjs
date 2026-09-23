import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, updateState, validateState } from '../web/model.js';
import { SOUND_DEFAULTS } from '../web/sound-settings.js';
import { readBackup } from '../web/migration.js';

test('older saves gain sound defaults without losing the timer, history, or mute preference', () => {
  let old = updateState(createState(), { type: 'COMMIT', focus: 2, faff: 1 }).state;
  old = updateState(old, { type: 'START', id: 'existing-session' }).state;
  old.settings = { sound: false, keepAwake: true, alerts: false };
  const before = structuredClone(old);
  const restored = readBackup({ kind: 'faff-backup', data: old });
  const result = updateState(restored);
  assert.deepEqual(result.state.settings, { ...before.settings, ...SOUND_DEFAULTS });
  assert.deepEqual(result.state.active, before.active);
  assert.deepEqual(result.state.days, before.days);
  assert.deepEqual(old, before);
  assert.equal(result.changed, true);
  assert.equal(updateState(result.state).changed, false);
});

test('sound choices and volumes survive backup restore; malformed values are rejected', () => {
  let state = createState();
  for (const [key, value] of Object.entries({ chime: 'chime', soundVolume: 0, ambience: 'rain', ambienceVolume: 100 })) {
    state = updateState(state, { type: 'SETTING', key, value }).state;
  }
  assert.deepEqual(readBackup(JSON.parse(JSON.stringify({ kind: 'faff-backup', data: state }))), state);
  for (const [key, value] of [['chime', 'missing'], ['chime', ['bell']], ['ambience', 'music'], ['soundVolume', -1], ['soundVolume', 101], ['soundVolume', '50'], ['ambienceVolume', 1.5]]) {
    assert.throws(() => updateState(state, { type: 'SETTING', key, value }));
    const invalid = structuredClone(state);
    invalid.settings[key] = value;
    assert.throws(() => validateState(invalid));
  }
});

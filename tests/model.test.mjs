import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_MS, createState, updateState, dateKey, totals, streak, result, remaining, addDays, validateState } from '../web/model.js';

const morning = new Date('2026-09-22T09:00:00').getTime();
function setup(focus = 8, waffle = 4, now = morning) {
  return updateState(createState(now), { type: 'COMMIT', focus, waffle }, now).state;
}
function act(state, action, now = morning) { return updateState(state, action, now).state; }
function complete(state, id, grade, now = morning) {
  state = act(state, { type: 'START', id }, now);
  return act(state, { type: 'RATE', id, grade }, now + SESSION_MS);
}

test('pause, persist and resume retain only active elapsed time', () => {
  let state = act(setup(), { type: 'START', id: 'one' });
  state = act(state, { type: 'PAUSE', id: 'one' }, morning + 5 * 60000);
  state = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(remaining(state.active, morning + 60 * 60000), 25 * 60000);
  state = act(state, { type: 'RESUME', id: 'one' }, morning + 60 * 60000);
  const output = updateState(state, { type: 'SYNC' }, morning + 86 * 60000);
  assert.equal(output.state.active.phase, 'review');
  assert.equal(output.events.length, 1);
  assert.equal(updateState(output.state, { type: 'SYNC' }, morning + 90 * 60000).events.length, 0);
});

test('rating converts the completed slot to waffle without extending the ceiling', () => {
  let state = setup(1, 1);
  state = complete(state, 'one', 'waffle');
  state = complete(state, 'two', 'waffle', morning + SESSION_MS);
  assert.deepEqual(totals(state.days[dateKey(morning)]), { focus: 0, waffle: 2 });
  assert.equal(result(state.days[dateKey(morning)]), 'missed');
  assert.equal(state.active, null);
  assert.throws(() => act(state, { type: 'START', id: 'three' }, morning + 2 * SESSION_MS));
  assert.throws(() => act(state, { type: 'RATE', id: 'two', grade: 'focus' }, morning + 2 * SESSION_MS));
});

test('edits reserve completed and active slots without resetting the timer', () => {
  let state = complete(setup(2, 1), 'one', 'focus');
  state = act(state, { type: 'START', id: 'two' }, morning + SESSION_MS);
  const active = structuredClone(state.active);
  assert.throws(() => act(state, { type: 'TARGETS', focus: 1, waffle: 0 }, morning + SESSION_MS));
  state = act(state, { type: 'TARGETS', focus: 1, waffle: 1 }, morning + SESSION_MS);
  assert.deepEqual(state.active, active);
  state = act(state, { type: 'RATE', id: 'two', grade: 'focus' }, morning + 2 * SESSION_MS);
  assert.equal(result(state.days[dateKey(morning)]), 'met');
  state = act(state, { type: 'TARGETS', focus: 2, waffle: 1 }, morning + 2 * SESSION_MS);
  assert.equal(state.days[dateKey(morning)].endedAt, null);
});

test('ending early allows unused waffle and records partial work without a full session', () => {
  let state = complete(setup(1, 2), 'one', 'focus');
  state = act(state, { type: 'START', id: 'two' }, morning + SESSION_MS);
  assert.throws(() => act(state, { type: 'END' }, morning + SESSION_MS + 60000));
  state = act(state, { type: 'PAUSE', id: 'two' }, morning + SESSION_MS + 60000);
  state = act(state, { type: 'END' }, morning + SESSION_MS + 60000);
  const day = state.days[dateKey(morning)];
  assert.equal(result(day), 'met');
  assert.equal(day.sessions.length, 1);
  assert.equal(day.partials[0].durationMs, 60000);
});

test('a session crossing midnight stays on the day it was started', () => {
  const before = new Date('2026-09-22T23:50:00').getTime(), after = before + SESSION_MS;
  let state = act(setup(1, 1, before), { type: 'START', id: 'late' }, before);
  state = act(state, { type: 'SYNC' }, after);
  assert.equal(state.active.date, '2026-09-22');
  assert.equal(state.active.phase, 'review');
  assert.equal(state.days['2026-09-23'].committedAt, null);
  state = act(state, { type: 'RATE', id: 'late', grade: 'focus' }, after);
  assert.equal(result(state.days['2026-09-22']), 'met');
  assert.equal(state.days['2026-09-23'].sessions.length, 0);
});

test('missed days break streaks, off days hold them, historical corrections recalculate', () => {
  let state = complete(setup(1, 0), 'one', 'focus');
  const tomorrow = morning + 86400000, third = morning + 2 * 86400000;
  state = act(state, { type: 'DAY_OFF' }, tomorrow);
  assert.equal(streak(state, dateKey(tomorrow)), 1);
  state = act(state, { type: 'COMMIT', focus: 1, waffle: 0 }, third);
  state = complete(state, 'three', 'focus', third);
  assert.equal(streak(state, dateKey(third)), 2);
  state = act(state, { type: 'CORRECT', date: dateKey(morning), id: 'one', grade: 'waffle' }, third + SESSION_MS);
  assert.equal(streak(state, dateKey(third)), 1);
  state = act(state, { type: 'SYNC' }, morning + 4 * 86400000);
  assert.equal(streak(state, dateKey(morning + 4 * 86400000)), 0);
});

test('undo is scoped to the last revision and returns to mandatory review', () => {
  let state = act(setup(1, 0), { type: 'START', id: 'one' });
  const rated = updateState(state, { type: 'RATE', id: 'one', grade: 'waffle' }, morning + SESSION_MS);
  state = act(rated.state, { type: 'UNDO_RATE', ...rated.undo }, morning + SESSION_MS);
  assert.equal(state.active.phase, 'review');
  assert.equal(state.days[dateKey(morning)].sessions.length, 0);
  const changed = act(rated.state, { type: 'SETTING', key: 'sound', value: false }, morning + SESSION_MS);
  assert.throws(() => act(changed, { type: 'UNDO_RATE', ...rated.undo }, morning + SESSION_MS));
});

test('unclosed days archive as missed and cannot receive new sessions', () => {
  let state = act(setup(), { type: 'SYNC' }, morning + 86400000);
  assert.equal(result(state.days[dateKey(morning)]), 'missed');
  assert.throws(() => act(state, { type: 'START', date: dateKey(morning), id: 'late' }, morning + 86400000));
});

test('date arithmetic crosses leap days and DST boundaries', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
});

test('invalid backups and impossible daily limits are rejected', () => {
  const invalid = setup(); invalid.days[dateKey(morning)].focus = -1;
  assert.throws(() => validateState(invalid));
  assert.throws(() => act(setup(), { type: 'TARGETS', focus: 24, waffle: 1 }));
  assert.throws(() => act(setup(), { type: 'TARGETS', focus: 0, waffle: 4 }));
  assert.throws(() => act(setup(), { type: 'DAY_OFF' }));
  const duplicate = complete(setup(), 'one', 'focus');
  duplicate.days[dateKey(morning)].sessions.push(structuredClone(duplicate.days[dateKey(morning)].sessions[0]));
  assert.throws(() => validateState(duplicate));
});

test('state transitions preserve earlier snapshots, including historical corrections and rollover', () => {
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  let state = freeze(createState(morning));
  function run(action, now = morning) {
    const before = JSON.stringify(state);
    const output = updateState(state, action, now);
    assert.equal(JSON.stringify(state), before);
    state = freeze(output.state);
    return output;
  }
  run({ type: 'DRAFT', focus: 2, waffle: 1 });
  run({ type: 'COMMIT', focus: 2, waffle: 1 });
  run({ type: 'START', id: 'immutable' });
  run({ type: 'PAUSE', id: 'immutable' }, morning + 60000);
  run({ type: 'RESUME', id: 'immutable' }, morning + 120000);
  const rated = run({ type: 'RATE', id: 'immutable', grade: 'focus' }, morning + SESSION_MS + 60000);
  run({ type: 'UNDO_RATE', ...rated.undo }, morning + SESSION_MS + 60000);
  run({ type: 'RATE', id: 'immutable', grade: 'waffle' }, morning + SESSION_MS + 60000);
  run({ type: 'TARGETS', focus: 2, waffle: 2 }, morning + SESSION_MS + 60000);
  run({ type: 'START', id: 'partial' }, morning + SESSION_MS + 60000);
  run({ type: 'PAUSE', id: 'partial' }, morning + SESSION_MS + 120000);
  run({ type: 'END' }, morning + SESSION_MS + 120000);
  run({ type: 'DAY_OFF' }, morning + 86400000);
  run({ type: 'CORRECT', date: dateKey(morning), id: 'immutable', grade: 'focus' }, morning + 86400000);
  run({ type: 'SETTING', key: 'sound', value: false }, morning + 86400000);
  run({ type: 'COMMIT', focus: 1, waffle: 0 }, morning + 2 * 86400000);
  run({ type: 'SYNC' }, morning + 3 * 86400000);
  assert.equal(state.days[dateKey(morning)].sessions[0].grade, 'focus');
  assert.equal(state.days[dateKey(morning)].partials.length, 1);
  assert.equal(result(state.days[dateKey(morning + 2 * 86400000)]), 'missed');
});

test('ending reopened days preserves more than 24 partial sessions', () => {
  let state = setup(1, 0);
  for (let index = 0; index < 30; index++) {
    const now = morning + index * 120000;
    state = act(state, { type: 'START', id: `partial-${index}` }, now);
    state = act(state, { type: 'PAUSE', id: `partial-${index}` }, now + 60000);
    state = act(state, { type: 'END' }, now + 60000);
    assert.equal(state.days[dateKey(now)].partials.length, index + 1);
    if (index < 29) {
      state = act(state, { type: 'TARGETS', focus: 1, waffle: 0 }, now + 60000);
      state = act(state, { type: 'TARGETS', focus: 2, waffle: 0 }, now + 60000);
    }
  }
  assert.equal(state.active, null);
  assert.equal(state.days[dateKey(morning)].sessions.length, 0);
  validateState(JSON.parse(JSON.stringify(state)));
});

test('a rejected action cannot modify an earlier state snapshot', () => {
  const state = complete(setup(1, 0), 'duplicate', 'focus');
  const snapshot = structuredClone(state);
  assert.throws(() => act(state, { type: 'TARGETS', focus: 24, waffle: 1 }));
  assert.deepEqual(state, snapshot);
  const reopened = act(state, { type: 'TARGETS', focus: 2, waffle: 0 });
  const reopenedSnapshot = structuredClone(reopened);
  assert.throws(() => act(reopened, { type: 'START', id: 'duplicate' }));
  assert.deepEqual(reopened, reopenedSnapshot);
});

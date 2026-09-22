export const SESSION_MS = 30 * 60 * 1000;
export const MAX_SESSIONS = 24;

export function dateKey(time = Date.now()) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(key, amount) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function validDate(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

export function newDay(date, defaults) {
  return { date, focus: defaults.focus, waffle: defaults.waffle, committedAt: null, endedAt: null, off: false, sessions: [], partials: [] };
}

export function createState(now = Date.now()) {
  const defaults = { focus: 8, waffle: 4 };
  return { schemaVersion: 1, revision: 0, defaults, settings: { sound: true, keepAwake: false, alerts: false }, days: { [dateKey(now)]: newDay(dateKey(now), defaults) }, active: null };
}

export function totals(day) {
  return { focus: day.sessions.filter(session => session.grade === 'focus').length, waffle: day.sessions.filter(session => session.grade === 'waffle').length };
}

export function result(day) {
  if (!day || !day.committedAt) return 'empty';
  if (day.off) return 'off';
  if (!day.endedAt) return 'open';
  const counts = totals(day);
  return counts.focus >= day.focus && counts.waffle <= day.waffle ? 'met' : 'missed';
}

export function streak(state, today = dateKey()) {
  let date = result(state.days[today]) === 'open' || result(state.days[today]) === 'empty' ? addDays(today, -1) : today;
  let count = 0;
  while (state.days[date]) {
    const status = result(state.days[date]);
    if (status === 'met') count++;
    else if (status !== 'off') break;
    date = addDays(date, -1);
  }
  return count;
}

export function remaining(active, now = Date.now()) {
  if (!active) return SESSION_MS;
  if (active.phase === 'review') return 0;
  return active.phase === 'running' ? Math.max(0, Math.min(SESSION_MS, active.deadline - now)) : active.remainingMs;
}

export function minimumTotal(state, date) {
  return state.days[date].sessions.length + (state.active?.date === date ? 1 : 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validTargets(focus, waffle) {
  return Number.isInteger(focus) && focus >= 1 && Number.isInteger(waffle) && waffle >= 0 && focus + waffle <= MAX_SESSIONS;
}

export function validateState(state) {
  assert(state?.schemaVersion === 1, 'This backup uses an unsupported version.');
  assert(Number.isSafeInteger(state.revision) && state.revision >= 0, 'Invalid saved revision.');
  assert(validTargets(state.defaults?.focus, state.defaults?.waffle), 'Invalid saved plan.');
  assert(state.settings && ['sound', 'keepAwake', 'alerts'].every(key => typeof state.settings[key] === 'boolean'), 'Invalid saved settings.');
  assert(state.days && typeof state.days === 'object' && !Array.isArray(state.days) && Object.keys(state.days).length <= 50000, 'Invalid saved days.');
  const ids = new Set();
  const timestamp = value => Number.isFinite(value) && value > 0;
  for (const [date, day] of Object.entries(state.days)) {
    assert(validDate(date) && day.date === date, 'Invalid saved date.');
    assert(typeof day.off === 'boolean' && (day.off ? day.focus === 0 && day.waffle === 0 : validTargets(day.focus, day.waffle)), 'Invalid daily plan.');
    assert(day.committedAt === null || timestamp(day.committedAt), 'Invalid commitment date.');
    assert(day.endedAt === null || timestamp(day.endedAt), 'Invalid end date.');
    assert(Array.isArray(day.sessions) && day.sessions.length <= MAX_SESSIONS && Array.isArray(day.partials) && day.partials.length <= MAX_SESSIONS, 'Invalid saved sessions.');
    assert(!day.off || (day.sessions.length === 0 && day.partials.length === 0 && day.committedAt && day.endedAt), 'Invalid day off.');
    assert(day.committedAt || (!day.sessions.length && !day.partials.length && !day.endedAt), 'Uncommitted day contains work.');
    assert(day.sessions.length <= day.focus + day.waffle, 'Saved sessions exceed the plan.');
    for (const session of day.sessions) {
      assert(typeof session.id === 'string' && session.id.length > 0 && session.id.length <= 80 && !ids.has(session.id), 'Invalid session identity.');
      ids.add(session.id);
      assert(['focus', 'waffle'].includes(session.grade) && session.durationMs === SESSION_MS && timestamp(session.completedAt) && timestamp(session.ratedAt), 'Invalid session rating.');
    }
    for (const partial of day.partials) assert(Number.isFinite(partial.durationMs) && partial.durationMs > 0 && partial.durationMs < SESSION_MS && timestamp(partial.endedAt), 'Invalid unfinished session.');
  }
  if (state.active !== null) {
    const active = state.active, day = state.days[active?.date];
    assert(day?.committedAt && !day.endedAt && !day.off && day.sessions.length < day.focus + day.waffle, 'The active session has no available slot.');
    assert(typeof active.id === 'string' && active.id.length > 0 && active.id.length <= 80 && !ids.has(active.id), 'Invalid active session identity.');
    assert(['running', 'paused', 'review'].includes(active.phase) && timestamp(active.startedAt), 'Invalid active timer.');
    assert(Number.isFinite(active.remainingMs) && active.remainingMs >= 0 && active.remainingMs <= SESSION_MS, 'Invalid timer duration.');
    assert(active.phase !== 'running' || timestamp(active.deadline), 'Invalid timer deadline.');
    assert(active.phase !== 'review' || (active.remainingMs === 0 && timestamp(active.completedAt)), 'Invalid completed timer.');
  }
  return state;
}

function reconcile(state, now, events) {
  let changed = false;
  const today = dateKey(now);
  if (!state.days[today]) { state.days[today] = newDay(today, state.defaults); changed = true; }
  if (state.active?.phase === 'running' && state.active.deadline <= now) {
    state.active.phase = 'review';
    state.active.remainingMs = 0;
    state.active.completedAt = state.active.deadline;
    events.push({ type: 'finished', id: state.active.id, completedAt: state.active.completedAt });
    changed = true;
  }
  for (const day of Object.values(state.days)) {
    if (day.date < today && day.committedAt && !day.endedAt && state.active?.date !== day.date) {
      day.endedAt = new Date(`${day.date}T23:59:59.999`).getTime();
      changed = true;
    }
  }
  return changed;
}

export function updateState(previous, action = { type: 'SYNC' }, now = Date.now()) {
  const state = structuredClone(previous), events = [];
  let changed = reconcile(state, now, events), undo = null;
  const today = dateKey(now), date = action.date || today, day = state.days[date];
  const editable = date === today || state.active?.date === date;
  const active = state.active;
  switch (action.type) {
    case 'SYNC': break;
    case 'DRAFT':
      assert(date === today && day && !day.committedAt, 'The plan has already been committed.');
      assert(validTargets(action.focus, action.waffle), 'Choose between 1 and 24 sessions.');
      day.focus = action.focus; day.waffle = action.waffle;
      changed = true; break;
    case 'COMMIT':
      assert(day && date === today && !day.committedAt && !active, 'Finish the current day first.');
      assert(validTargets(action.focus, action.waffle), 'Choose between 1 and 24 sessions.');
      day.focus = action.focus; day.waffle = action.waffle; day.committedAt = now;
      state.defaults = { focus: day.focus, waffle: day.waffle };
      changed = true; break;
    case 'DAY_OFF':
      assert(day && date === today && !day.committedAt && !active, 'A day off must be set before committing work.');
      Object.assign(day, { focus: 0, waffle: 0, off: true, committedAt: now, endedAt: now });
      changed = true; break;
    case 'TARGETS': {
      assert(day?.committedAt && !day.off && editable, 'This plan cannot be edited.');
      assert(validTargets(action.focus, action.waffle), 'Choose between 1 and 24 sessions.');
      const total = action.focus + action.waffle, previousTotal = day.focus + day.waffle;
      assert(total >= minimumTotal(state, date), 'Keep a slot for every completed or active session.');
      day.focus = action.focus; day.waffle = action.waffle;
      if (day.endedAt && total > previousTotal && total > day.sessions.length) day.endedAt = null;
      if (total === day.sessions.length && active?.date !== date) day.endedAt = now;
      state.defaults = { focus: day.focus, waffle: day.waffle };
      changed = true; break;
    }
    case 'START':
      assert(day?.committedAt && !day.endedAt && !day.off && date === today && !active, 'A session is already active, or the day is finished.');
      assert(day.sessions.length < day.focus + day.waffle, 'Today’s session limit is reached.');
      assert(typeof action.id === 'string' && action.id.length > 0 && action.id.length <= 80, 'A session identity is required.');
      state.active = { id: action.id, date, phase: 'running', startedAt: now, deadline: now + SESSION_MS, remainingMs: SESSION_MS, completedAt: null };
      changed = true; break;
    case 'PAUSE':
      assert(active?.id === action.id, 'The timer changed in another window.');
      if (active.phase === 'review') break;
      assert(active.phase === 'running', 'This timer is already paused.');
      active.remainingMs = remaining(active, now); active.deadline = null; active.phase = 'paused';
      changed = true; break;
    case 'RESUME':
      assert(active?.id === action.id && active.phase === 'paused', 'This timer has already changed.');
      active.deadline = now + active.remainingMs; active.phase = 'running';
      changed = true; break;
    case 'RATE': {
      assert(active?.id === action.id && active.phase === 'review', 'This session is not waiting for a rating.');
      assert(['focus', 'waffle'].includes(action.grade), 'Choose focused or waffle.');
      const owner = state.days[active.date];
      owner.sessions.push({ id: active.id, grade: action.grade, durationMs: SESSION_MS, completedAt: active.completedAt, ratedAt: now });
      state.active = null;
      if (owner.sessions.length === owner.focus + owner.waffle || owner.date < today) owner.endedAt = now;
      undo = { date: owner.date, id: active.id, expectedRevision: state.revision + 1 };
      changed = true; break;
    }
    case 'CORRECT': {
      assert(day && ['focus', 'waffle'].includes(action.grade), 'Invalid rating.');
      const session = day.sessions.find(item => item.id === action.id);
      assert(session, 'That session is no longer available.');
      session.grade = action.grade; session.ratedAt = now;
      changed = true; break;
    }
    case 'UNDO_RATE': {
      assert(state.revision === action.expectedRevision && !active, 'This rating can no longer be undone.');
      const session = day?.sessions.at(-1);
      assert(session?.id === action.id, 'This rating can no longer be undone.');
      day.sessions.pop(); day.endedAt = null;
      state.active = { id: session.id, date, phase: 'review', startedAt: session.completedAt - SESSION_MS, deadline: null, remainingMs: 0, completedAt: session.completedAt };
      changed = true; break;
    }
    case 'END':
      assert(day?.committedAt && !day.endedAt && editable, 'This day is already finished.');
      assert(!active || (active.date === date && active.phase === 'paused'), 'Pause or rate the current session first.');
      if (active) {
        const durationMs = SESSION_MS - remaining(active, now);
        if (durationMs > 0) day.partials.push({ durationMs, endedAt: now });
        state.active = null;
      }
      day.endedAt = now; changed = true; break;
    case 'SETTING':
      assert(['sound', 'keepAwake', 'alerts'].includes(action.key) && typeof action.value === 'boolean', 'Unknown setting.');
      state.settings[action.key] = action.value; changed = true; break;
    default: throw new Error('Unknown action.');
  }
  if (changed) state.revision++;
  validateState(state);
  return { state, changed, events, undo };
}

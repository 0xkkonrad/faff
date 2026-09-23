import { SESSION_MS, dateKey, remaining, totals, result, streak, minimumTotal } from './model.js';
import { icon, logo } from './icons.js';

export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const labelDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
export const hours = count => count % 2 ? `${Math.floor(count / 2)}h 30m` : `${count / 2}h`;
export const homeDate = state => state.active?.date || dateKey();
export function clock(active, now = Date.now()) {
  const seconds = Math.ceil(remaining(active, now) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
const primary = (text, action, glyph = '', disabled = false) => `<button class="primary" data-action="${action}" ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph) : ''}${text}</button>`;
const back = (action, text = '') => `<button class="back" data-action="${action}" aria-label="${text || 'Back to timer'}">${icon('back')}${text}</button>`;
const row = (text, action, disabled = false) => `<button class="inline-row" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}${icon('arrow')}</button>`;

function budget(state, day, ui) {
  const counts = totals(day), editable = day.committedAt && !day.off && (day.date === dateKey() || state.active?.date === day.date) && !ui.sheet;
  return `<div class="budget-list">${['focus', 'faff'].map(mode => {
    const amount = Math.max(day[mode], counts[mode]), extra = counts[mode] - day[mode];
    return `<button class="budget" data-action="${editable ? 'targets' : 'history'}" data-date="${day.date}" data-mode="${mode}" aria-label="${counts[mode]} of ${day[mode]} ${mode} sessions. ${editable ? 'Edit plan.' : 'Open history.'}"><span class="budget-label">${mode}${extra > 0 ? ` <em>+${extra}</em>` : ''}</span><span class="budget-cells" style="--columns:${Math.max(1, Math.min(10, amount))}" aria-hidden="true">${Array.from({ length: amount }, (_, index) => `<i class="cell ${index < counts[mode] ? mode : ''} ${index >= day[mode] ? 'excess' : ''}"></i>`).join('') || '<span class="zero">-</span>'}</span></button>`;
  }).join('')}</div>`;
}

function planFields(plan, mode, minimum = 1, selected = '') {
  return `<div class="${mode === 'draft' ? 'plan-fields' : 'adjust-fields'}">${['focus', 'faff'].map(kind => `<div class="plan-field ${selected === kind ? 'chosen-field' : ''}"><div><span>${kind}</span><small>${hours(plan[kind])}</small></div><div class="stepper"><button data-step="-1" data-field="${kind}" data-plan="${mode}" aria-label="Fewer ${kind} sessions" ${plan[kind] <= (kind === 'focus' ? 1 : 0) || plan.focus + plan.faff <= minimum ? 'disabled' : ''}>${icon('minus')}</button><output aria-label="${kind} sessions">${plan[kind]}</output><button data-step="1" data-field="${kind}" data-plan="${mode}" aria-label="More ${kind} sessions" ${plan.focus + plan.faff >= 24 ? 'disabled' : ''}>${icon('plus')}</button></div></div>`).join('')}</div>`;
}

function gradeButtons(extra = '') {
  return `<div class="rating-options"><button data-grade="focus" ${extra}>${icon('check')}<span>focused</span></button><button data-grade="faff" ${extra}>${logo('rating-mark')}<span>faff</span></button></div>`;
}

function home(state, ui, currentStreak) {
  const date = homeDate(state), day = state.days[date], active = state.active, counts = totals(day);
  if (!day.committedAt) return `<main class="app-body planning"><div class="page-title"><h1>today.</h1><span>30 min each</span></div><div class="plan-mascot">${logo('mascot')}</div>${planFields(day, 'draft')}<div class="app-bottom">${primary(`commit · ${hours(day.focus + day.faff)}`, 'commit', 'check')}<button class="text-button" data-action="day-off">day off</button></div></main>`;
  const previousDay = date !== dateKey() ? `<p class="previous-date">${labelDate(date)}</p>` : '';
  if (active?.phase === 'review') return `<main class="app-body rating-page"><div class="rating-center">${previousDay}<div class="countdown">00:00</div><h1>focused?</h1></div><div class="rating-bottom">${gradeButtons(`data-session="${escape(active.id)}"`)}${budget(state, day, ui)}</div></main>`;
  if (day.endedAt) return `<main class="app-body result-page"><div class="result-center">${logo('result-mascot')}<h1>${day.off ? 'day off.' : 'day done.'}</h1>${day.off ? '' : budget(state, day, ui)}<p>${day.off ? `${currentStreak} day streak · held` : result(day) === 'met' ? `${currentStreak} day streak` : day.sessions.length === day.focus + day.faff ? 'daily limit reached' : 'focus target missed'}</p></div><div class="app-bottom">${primary('calendar', 'calendar', 'calendar')}</div></main>`;
  const action = active?.phase === 'running' ? 'pause' : active?.phase === 'paused' ? 'resume' : 'start';
  return `<main class="app-body timer-page"><div class="timer-center">${previousDay}<div class="countdown live-clock" role="timer" aria-label="Time left in this session">${clock(active)}</div>${budget(state, day, ui)}</div><div class="app-bottom">${primary(action, action, action === 'pause' ? 'pause' : 'play')}${!active && counts.focus >= day.focus ? '<button class="text-button" data-action="end">end day</button>' : ''}</div></main>`;
}

function patch(day) {
  const counts = totals(day), total = counts.focus + counts.faff;
  if (!total) return '<span class="day-empty">-</span>';
  const columns = Math.ceil(Math.sqrt(total)), rows = Math.ceil(total / columns), size = 5.5, gap = 1.5;
  const left = (40 - (columns * size + (columns - 1) * gap)) / 2, top = 25 - (rows * size + (rows - 1) * gap) / 2;
  return `<svg class="day-mark" viewBox="0 0 40 44" aria-hidden="true">${Array.from({ length: total }, (_, index) => `<rect data-unit="${index < counts.focus ? 'focus' : 'faff'}" x="${left + index % columns * (size + gap)}" y="${top + Math.floor(index / columns) * (size + gap)}" width="${size}" height="${size}" rx="1.4" fill="${index < counts.focus ? '#252a26' : '#d9ef78'}"/>`).join('')}</svg>`;
}

function dock(state) {
  if (!state.active) return '';
  return `<div class="session-dock"><button data-action="home">${state.active.phase === 'review' ? 'rate session' : `<span class="live-clock">${clock(state.active)}</span>`}${icon('arrow')}</button></div>`;
}

function calendar(state, ui, currentStreak) {
  const first = new Date(`${ui.month}-01T12:00:00Z`), year = first.getUTCFullYear(), month = first.getUTCMonth();
  const title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toLowerCase();
  const offset = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), selected = state.days[ui.selectedDay];
  const selectedStatus = result(selected), text = selectedStatus === 'met' ? 'target met' : selectedStatus === 'missed' ? 'target missed' : selectedStatus === 'off' ? 'day off' : selectedStatus === 'open' ? 'in progress' : 'not planned';
  return `<main class="app-body calendar-page calendar-counts calendar-visual"><div class="calendar-top">${back('home')}<div class="streak-total"><strong>${currentStreak}</strong><span>day streak</span></div></div><div class="month-row"><button data-month="-1" aria-label="Previous month" ${ui.month <= '2000-01' ? 'disabled' : ''}>‹</button><h1>${title}</h1><button data-month="1" aria-label="Next month" ${ui.month >= dateKey().slice(0, 7) ? 'disabled' : ''}>›</button></div><div class="counts-key"><span><i class="cell focus"></i>focus</span><span><i class="cell faff"></i>faff</span></div><div class="weekdays" aria-hidden="true">${['m', 't', 'w', 't', 'f', 's', 's'].map(letter => `<span>${letter}</span>`).join('')}</div><div class="calendar-grid">${'<span></span>'.repeat(offset)}${Array.from({ length: count }, (_, index) => {
    const date = `${ui.month}-${String(index + 1).padStart(2, '0')}`, day = state.days[date], counts = day ? totals(day) : null, status = result(day);
    const description = day?.off ? 'day off' : counts && day.committedAt ? `${counts.focus} focus and ${counts.faff} faff sessions` : 'no recorded sessions';
    return `<button class="calendar-day ${status} ${ui.selectedDay === date ? 'selected' : ''}" data-day="${date}" aria-label="${labelDate(date)}, ${description}" ${date === dateKey() ? 'aria-current="date"' : ''} ${!day?.committedAt && date !== dateKey() ? 'disabled' : ''}><span class="day-number">${index + 1}</span>${day?.off ? '<span class="day-off-label">-</span>' : day?.committedAt ? patch(day) : '<span class="day-empty">-</span>'}</button>`;
  }).join('')}</div>${ui.selectedDay.slice(0, 7) === ui.month ? `<div class="selected-day visual-day-detail"><button class="inline-row" data-action="${selected?.committedAt ? 'history' : 'home'}" data-date="${ui.selectedDay}" aria-label="${labelDate(ui.selectedDay)}, ${selected?.committedAt ? 'open sessions' : 'open today'}"><span class="selected-label">${labelDate(ui.selectedDay)}<small>${text}</small></span>${icon('arrow')}</button></div>` : ''}</main>${dock(state)}`;
}

function history(state, ui) {
  const day = state.days[ui.selectedDay];
  if (!day) return `<main class="app-body history-page">${back('calendar')}<p class="empty-history">no sessions yet</p></main>${dock(state)}`;
  return `<main class="app-body history-page"><div class="back-row">${back('calendar', labelDate(ui.selectedDay))}<span>sessions</span></div>${day.off ? '' : budget(state, day, ui)}<div class="session-list">${day.sessions.map((session, index) => `<button class="session-row" data-correct="${escape(session.id)}" data-date="${day.date}" aria-label="Edit session ${index + 1}, ${session.grade}"><small>${String(index + 1).padStart(2, '0')}</small><span><i class="cell ${session.grade}"></i>${session.grade === 'focus' ? 'focused' : 'faff'}</span><small>30m</small>${icon('edit')}</button>`).join('') || `<p class="empty-history">${day.off ? 'day off' : 'no sessions yet'}</p>`}${day.partials.map(partial => `<div class="session-row incomplete-row"><small>-</small><span>unfinished</span><small>${Math.floor(partial.durationMs / 60000)}m</small></div>`).join('')}</div></main>${dock(state)}`;
}

function settings(state, ui) {
  const alertHint = !ui.notificationSupported ? 'Not supported in this browser.'
    : ui.permission === 'denied' ? 'Blocked. Allow notifications in browser settings.'
    : ui.alertsPending ? 'Waiting for permission…' : '';
  const switches = [
    { key: 'sound', label: 'sound', checked: state.settings.sound },
    { key: 'keepAwake', label: 'keep screen on', checked: state.settings.keepAwake && ui.wakeLockSupported,
      hint: ui.wakeLockSupported ? 'While the timer runs.' : 'Not supported in this browser.', disabled: !ui.wakeLockSupported },
    { key: 'alerts', label: 'timer alerts', checked: state.settings.alerts && ui.permission === 'granted', hint: alertHint,
      disabled: !ui.notificationSupported || ui.permission === 'denied' || ui.alertsPending },
  ];
  return `<div class="settings-list"><div class="settings-toggles">${switches.map(({ key, label, checked, hint, disabled }) => `<button type="button" class="setting-switch" role="switch" aria-checked="${checked}" aria-labelledby="setting-${key}-label" ${hint ? `aria-describedby="setting-${key}-hint"` : ''} ${key === 'alerts' ? 'data-action="alerts"' : `data-setting="${key}"`} ${disabled ? 'disabled' : ''} ${key === 'alerts' && ui.alertsPending ? 'aria-busy="true"' : ''}><span class="setting-label"><span id="setting-${key}-label">${label}</span>${hint ? `<small id="setting-${key}-hint">${hint}</small>` : ''}</span><span class="switch-box" aria-hidden="true">${icon('check')}</span></button>`).join('')}</div><p class="setting-note">Alerts may be delayed when Android suspends Faff.</p><div class="settings-actions">${row(ui.protected ? 'device storage protected' : 'protect local saves', 'protect', ui.protected)}${row('download backup', 'export')}${row('restore backup', 'import')}</div><p class="setting-note">Saved on this device. No account or sync.</p></div>`;
}

function sheet(state, ui, currentStreak) {
  if (!ui.sheet) return '';
  const { type } = ui.sheet, date = ui.sheet.date || homeDate(state), day = state.days[date];
  let title = '', content = '';
  if (type === 'options') {
    title = date === dateKey() ? 'today' : labelDate(date);
    content = `<div class="locked-heading">${icon('check')}<span>${day.committedAt ? 'committed' : 'draft'} · ${hours(day.focus + day.faff)}</span></div><div class="locked-row"><span>focus</span><strong>${day.focus} × 30m</strong></div><div class="locked-row"><span>faff</span><strong>${day.faff} × 30m</strong></div><div class="sheet-links">${day.committedAt && !day.off ? row('edit sessions', 'targets') : ''}${row('sessions', 'history')}${row('end day', 'end', !day.committedAt || !!day.endedAt || state.active?.phase === 'running' || state.active?.phase === 'review')}${!ui.standalone ? row('install faff', 'install') : ''}${row('settings', 'settings')}${ui.updateReady ? row('update available', 'update') : ''}</div>`;
  }
  if (type === 'targets') {
    title = 'today’s plan';
    const draft = ui.sheet.draft, min = minimumTotal(state, date), active = state.active?.date === date ? state.active : null;
    content = `${planFields(draft, 'targets', min, ui.sheet.mode)}<p class="adjust-note">${day.sessions.length} completed${active ? active.phase === 'review' ? ' · 1 to rate' : ' · 1 in progress' : ''}</p>${primary(`save · ${hours(draft.focus + draft.faff)}`, 'save-plan', '', draft.focus + draft.faff < min)}`;
  }
  if (type === 'off') {
    title = 'day off?';
    content = `${logo('sheet-mascot')}<p class="sheet-note">${currentStreak} day streak · held</p>${primary('commit day off', 'confirm-off', 'check')}`;
  }
  if (type === 'end') {
    title = 'end day?';
    const counts = totals(day), partial = state.active?.date === date ? SESSION_MS - remaining(state.active) : 0;
    content = `${budget(state, day, ui)}<p class="sheet-note">${counts.focus >= day.focus && counts.faff <= day.faff ? 'focus target met' : 'focus target missed'}${partial ? `<br><span class="muted">${Math.floor(partial / 60000)}m unfinished · not counted</span>` : ''}</p>${primary('end day', 'confirm-end', 'check')}`;
  }
  if (type === 'correct') {
    title = `session ${day.sessions.findIndex(session => session.id === ui.sheet.id) + 1}`;
    content = `<p class="sheet-note">${labelDate(date)}${day.endedAt ? ' · updates the streak' : ''}</p>${gradeButtons(`data-correction="${escape(ui.sheet.id)}" data-date="${date}"`)}`;
  }
  if (type === 'settings') { title = 'settings'; content = settings(state, ui); }
  if (type === 'install') {
    title = 'install faff';
    content = `<p class="sheet-note">${ui.installReady ? 'Add Faff to your home screen.' : 'Open your browser menu and choose “Add to Home screen” or “Install app”.'}</p>${ui.installReady ? primary('install', 'install-now') : ''}`;
  }
  if (type === 'restore') {
    title = 'restore backup?';
    content = `<p class="sheet-note">Replace this device’s history with the selected backup?</p>${primary('restore backup', 'confirm-restore')}`;
  }
  return `<div class="sheet-backdrop"><section class="app-sheet" role="dialog" aria-modal="true" aria-label="${escape(title)}" tabindex="-1"><div class="sheet-grip"></div><div class="sheet-title"><h2>${title}</h2><button class="icon-button" data-action="close-sheet" aria-label="Close">${icon('close')}</button></div>${content}</section></div>`;
}

export function render(state, ui) {
  const currentStreak = streak(state);
  return `<header class="app-header"><button class="wordmark" data-action="home" aria-label="Faff, back to timer">${logo()}<span>faff</span></button><div><button class="icon-button calendar-button" data-action="calendar" aria-label="Calendar, ${currentStreak} day streak">${icon('calendar')}<span class="streak-badge">${currentStreak}</span></button><button class="icon-button" data-action="options" aria-label="Daily plan and options">${icon('more')}</button></div></header>${ui.page === 'calendar' ? calendar(state, ui, currentStreak) : ui.page === 'history' ? history(state, ui) : home(state, ui, currentStreak)}${sheet(state, ui, currentStreak)}${ui.toast && (!ui.sheet || !ui.toast.undo) ? `<div class="app-toast" role="status"><span>${escape(ui.toast.message)}</span>${ui.toast.undo ? '<button data-action="undo">undo</button>' : ''}</div>` : ''}`;
}

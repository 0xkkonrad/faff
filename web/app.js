import { dateKey, validateState } from './model.js';
import { change, restoreBackup } from './storage.js';
import { render, escape, homeDate, clock } from './view.js';
import { logo } from './icons.js';

const root = document.querySelector('#waffle-app');
const fileInput = document.querySelector('#backup-file');
const standalone = matchMedia('(display-mode: standalone)');
const ui = {
  page: location.hash === '#calendar' ? 'calendar' : 'home', selectedDay: dateKey(), month: dateKey().slice(0, 7),
  sheet: null, toast: null, standalone: standalone.matches || navigator.standalone === true,
  installReady: false, updateReady: false, notificationSupported: 'Notification' in window && 'serviceWorker' in navigator,
  wakeLockSupported: Boolean(navigator.wakeLock), alertsPending: false,
  permission: 'Notification' in window ? Notification.permission : 'denied', protected: false,
};
let state, busy = false, toastTimer, installPrompt, registration, backup, audio, wakeLock, wakePending = false, reloading = false;
let currentDate = dateKey(), returnFocus, pendingSync = false;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('waffle-sync-v1') : null;

function focusKey(element) {
  if (!element?.matches('button')) return null;
  return ['action', 'step', 'field', 'plan', 'grade', 'session', 'correction', 'date', 'mode', 'correct', 'day', 'month', 'setting'].map(key => element.dataset[key] === undefined ? '' : `[data-${key}="${CSS.escape(element.dataset[key])}"]`).join('') || null;
}

function paint() {
  if (!state) return;
  const focus = focusKey(document.activeElement), scroll = root.querySelector('.app-body')?.scrollTop || 0;
  const hadDialog = !!root.querySelector('[role=dialog]');
  root.innerHTML = render(state, ui);
  const body = root.querySelector('.app-body');
  if (body) body.scrollTop = scroll;
  const dialog = root.querySelector('[role=dialog]');
  root.querySelector('.app-header').inert = !!dialog;
  body.inert = !!dialog;
  const dock = root.querySelector('.session-dock');
  if (dock) dock.inert = !!dialog;
  const target = focus && root.querySelector(focus);
  if (dialog && !hadDialog) dialog.focus({ preventScroll: true });
  else if (target && !target.closest('[inert]')) target.focus({ preventScroll: true });
  else if (!dialog && hadDialog && returnFocus) root.querySelector(returnFocus)?.focus({ preventScroll: true });
  else if (dialog) dialog.focus({ preventScroll: true });
  tick();
  void maintainWakeLock();
}

function toast(message, undo = null) {
  clearTimeout(toastTimer);
  ui.toast = { message, undo };
  paint();
  toastTimer = setTimeout(() => { ui.toast = null; paint(); }, undo ? 9000 : 5000);
}

function openSheet(type, details = {}) {
  if (!ui.sheet) returnFocus = focusKey(document.activeElement);
  ui.sheet = { type, ...details };
  paint();
}

function closeSheet() { ui.sheet = null; backup = null; paint(); }

function navigate(page, date) {
  ui.sheet = null;
  ui.page = page;
  if (date) { ui.selectedDay = date; ui.month = date.slice(0, 7); }
  const hash = page === 'home' ? '' : `#${page}`;
  if (location.hash !== hash) history.pushState({ page, date: ui.selectedDay }, '', `${location.pathname}${location.search}${hash}`);
  paint();
  root.querySelector('.app-body').scrollTop = 0;
}

function publishRevision() {
  channel?.postMessage(state.revision);
  try { localStorage.setItem('waffle-revision', String(state.revision)); } catch { /* IndexedDB remains the source of truth. */ }
}

async function apply(action, after) {
  if (busy) return false;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  try {
    const output = await change(action);
    state = output.state;
    if (output.changed) publishRevision();
    if (ui.toast?.undo && ui.toast.undo.expectedRevision !== state.revision) ui.toast = null;
    after?.(output);
    paint();
    for (const event of output.events) void finished(event);
    return true;
  } catch (error) {
    if (!state) storageError(error);
    else {
      try { state = (await change()).state; } catch { /* Keep the last saved view if storage is unavailable. */ }
      toast(error.message || 'That change could not be saved.');
    }
    return false;
  } finally {
    busy = false;
    root.removeAttribute('aria-busy');
    if (pendingSync) { pendingSync = false; void sync(); }
  }
}

function sync() {
  if (busy) { pendingSync = true; return Promise.resolve(false); }
  if ('Notification' in window) ui.permission = Notification.permission;
  return apply({ type: 'SYNC' });
}

function storageError(error) {
  root.innerHTML = `<div class="loading-screen">${logo('mascot')}<p>Waffle could not open your saved data.<br>${escape(error.message || 'Device storage is unavailable.')}</p><button class="primary" data-action="retry">retry</button></div>`;
}

function tick() {
  if (!state) return;
  const label = clock(state.active);
  root.querySelectorAll('.live-clock').forEach(element => { if (element.textContent !== label) element.textContent = label; });
  document.title = state.active ? state.active.phase === 'review' ? 'Rate your session · Waffle' : `${label} · Waffle` : 'Waffle';
  if (!busy && (dateKey() !== currentDate || state.active?.phase === 'running' && state.active.deadline <= Date.now())) {
    currentDate = dateKey();
    void sync();
  }
}

function unlockAudio() {
  if (!state?.settings.sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) { audio ||= new AudioContext(); void audio.resume().catch(() => {}); }
  } catch { /* The countdown still works without sound. */ }
}

async function finished(event) {
  if (Date.now() - event.completedAt > 60000) return;
  if (state.settings.sound && audio?.state === 'running') {
    for (const delay of [0, 0.27]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + delay;
      oscillator.type = 'sine'; oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.18, start + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + 0.24);
    }
    navigator.vibrate?.([100, 70, 100]);
  }
  if (state.settings.alerts && ui.permission === 'granted' && document.hidden) {
    try {
      const worker = await navigator.serviceWorker.ready;
      await worker.showNotification('Focused?', { body: 'Your 30 minutes are up. Rate your session.', icon: './icons/icon-192.png', tag: `waffle-${event.id}`, data: { url: new URL('./', location.href).href } });
    } catch { /* Review is saved even if Android declines the alert. */ }
  }
}

async function maintainWakeLock() {
  const wanted = state?.settings.keepAwake && state.active?.phase === 'running' && !document.hidden;
  if (!wanted && wakeLock) { await wakeLock.release().catch(() => {}); wakeLock = null; }
  if (!wanted || wakeLock || wakePending || !navigator.wakeLock) return;
  wakePending = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    if (document.hidden || !state.settings.keepAwake || state.active?.phase !== 'running') { await wakeLock.release(); wakeLock = null; }
  } catch { /* Android may decline while battery saver is on. */ }
  finally { wakePending = false; }
}

root.addEventListener('click', async event => {
  if (event.target.classList.contains('sheet-backdrop')) { closeSheet(); return; }
  const button = event.target.closest('button');
  if (!button || button.disabled || busy) return;
  if (button.dataset.action === 'retry') { await sync(); return; }
  if (!state) return;
  const data = button.dataset, date = data.date || ui.sheet?.date || homeDate(state), day = state.days[date];
  if (data.step) {
    const draft = { ...(data.plan === 'targets' ? ui.sheet.draft : day) };
    draft[data.field] += Number(data.step);
    if (data.plan === 'targets') { ui.sheet.draft = { focus: draft.focus, waffle: draft.waffle }; paint(); }
    else await apply({ type: 'DRAFT', date, focus: draft.focus, waffle: draft.waffle });
    return;
  }
  if (data.grade) {
    await apply({ type: data.correction ? 'CORRECT' : 'RATE', date, id: data.correction || data.session, grade: data.grade }, output => {
      ui.sheet = null;
      if (data.correction) toast('rating updated');
      else toast(data.grade === 'focus' ? 'focused' : 'waffle', output.undo);
    });
    return;
  }
  if (data.correct) { openSheet('correct', { date, id: data.correct }); return; }
  if (data.day) { ui.selectedDay = data.day; paint(); return; }
  if (data.month) {
    const month = new Date(`${ui.month}-01T12:00:00Z`);
    month.setUTCMonth(month.getUTCMonth() + Number(data.month));
    ui.month = month.toISOString().slice(0, 7); paint(); return;
  }
  if (data.setting) {
    unlockAudio();
    if (data.setting === 'keepAwake' && !navigator.wakeLock) { toast('This browser cannot keep the screen on.'); return; }
    await apply({ type: 'SETTING', key: data.setting, value: !state.settings[data.setting] }); return;
  }
  switch (data.action) {
    case 'home': navigate('home'); break;
    case 'calendar': navigate('calendar'); break;
    case 'history': navigate('history', date); break;
    case 'close-sheet': closeSheet(); break;
    case 'options': openSheet('options', { date: homeDate(state) }); break;
    case 'settings': openSheet('settings'); break;
    case 'targets': openSheet('targets', { date, mode: data.mode, draft: { focus: day.focus, waffle: day.waffle } }); break;
    case 'save-plan': await apply({ type: 'TARGETS', date, ...ui.sheet.draft }, () => { ui.sheet = null; }); break;
    case 'commit': unlockAudio(); await apply({ type: 'COMMIT', date, focus: day.focus, waffle: day.waffle }); break;
    case 'day-off': openSheet('off', { date }); break;
    case 'confirm-off': await apply({ type: 'DAY_OFF', date }, () => { ui.sheet = null; }); break;
    case 'start': unlockAudio(); await apply({ type: 'START', date, id: crypto.randomUUID() }); break;
    case 'pause': await apply({ type: 'PAUSE', id: state.active?.id }); break;
    case 'resume': unlockAudio(); await apply({ type: 'RESUME', id: state.active?.id }); break;
    case 'end': openSheet('end', { date }); break;
    case 'confirm-end': await apply({ type: 'END', date }, () => { ui.sheet = null; }); break;
    case 'undo': if (ui.toast?.undo) await apply({ type: 'UNDO_RATE', ...ui.toast.undo }, () => { ui.toast = null; navigate('home'); }); break;
    case 'install': openSheet('install'); break;
    case 'install-now':
      if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; ui.installReady = false; closeSheet(); }
      break;
    case 'alerts':
      if (state.settings.alerts && ui.permission === 'granted') await apply({ type: 'SETTING', key: 'alerts', value: false });
      else {
        ui.alertsPending = true; paint();
        try {
          // Returning from the browser prompt also triggers a focus refresh.
          busy = true;
          try { ui.permission = await Notification.requestPermission(); }
          finally { busy = false; }
          if (ui.permission === 'granted') await apply({ type: 'SETTING', key: 'alerts', value: true });
          else if (ui.permission === 'default') toast('Notifications weren’t enabled.');
        } catch { toast('Notifications could not be enabled.'); }
        finally {
          ui.alertsPending = false; paint();
          if (pendingSync && !busy) { pendingSync = false; void sync(); }
        }
      }
      break;
    case 'protect':
      try { ui.protected = await navigator.storage?.persist?.() || false; toast(ui.protected ? 'local saves protected' : 'Download a backup to keep another copy.'); }
      catch { toast('Download a backup to keep another copy.'); }
      break;
    case 'export': {
      if (!await sync()) break;
      const blob = new Blob([JSON.stringify({ kind: 'waffle-backup', exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `waffle-${dateKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      break;
    }
    case 'import': fileInput.click(); break;
    case 'confirm-restore':
      if (!backup) break;
      busy = true;
      try { state = (await restoreBackup(backup)).state; backup = null; ui.sheet = null; publishRevision(); navigate('home'); toast('backup restored'); }
      catch (error) { toast(error.message); }
      finally { busy = false; if (pendingSync) { pendingSync = false; void sync(); } }
      break;
    case 'update': registration?.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' }); break;
  }
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; fileInput.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('This backup is too large.');
    const value = JSON.parse(await file.text());
    if (value.kind !== 'waffle-backup') throw new Error('Choose a Waffle backup file.');
    backup = structuredClone(validateState(value.data));
    openSheet('restore');
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not a valid backup.' : error.message); }
});

document.addEventListener('keydown', event => {
  if (!ui.sheet) return;
  if (event.key === 'Escape') { closeSheet(); event.preventDefault(); }
  if (event.key === 'Tab') {
    const dialog = root.querySelector('[role=dialog]'), buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { first?.focus(); event.preventDefault(); }
  }
});

window.addEventListener('popstate', () => {
  ui.sheet = null; ui.page = location.hash === '#calendar' ? 'calendar' : location.hash === '#history' ? 'history' : 'home';
  if (history.state?.date) { ui.selectedDay = history.state.date; ui.month = ui.selectedDay.slice(0, 7); }
  paint();
});
channel?.addEventListener('message', event => { if (!state || event.data > state.revision) void sync(); });
window.addEventListener('storage', event => { if (event.key === 'waffle-revision' && Number(event.newValue) > (state?.revision ?? -1)) void sync(); });
window.addEventListener('focus', () => { if (state) void sync(); });
window.addEventListener('pageshow', () => { if (state) void sync(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); void maintainWakeLock(); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; ui.installReady = true; paint(); });
window.addEventListener('appinstalled', () => { installPrompt = null; ui.installReady = false; ui.standalone = true; if (ui.sheet?.type === 'install') ui.sheet = null; paint(); });
standalone.addEventListener('change', event => { ui.standalone = event.matches; paint(); });

async function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const updateReady = () => { if (registration.waiting && navigator.serviceWorker.controller) { ui.updateReady = true; paint(); } };
    updateReady();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') updateReady(); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (ui.updateReady && !reloading) { reloading = true; location.reload(); }
    });
  } catch { toast('Offline setup failed. Reopen Waffle when you’re online.'); }
}

await sync();
void registerWorker();
if (navigator.storage?.persisted) navigator.storage.persisted().then(value => { ui.protected = value; }).catch(() => {});
setInterval(tick, 250);

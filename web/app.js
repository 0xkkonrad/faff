import { dateKey, validDate } from './model.js';
import { change, restoreBackup } from './storage.js';
import { render, escape, homeDate, clock } from './view.js';
import { logo } from './icons.js';
import { readBackup } from './migration.js';
import { Sounds } from './sounds.js';

const root = document.querySelector('#faff-app');
const fileInput = document.querySelector('#backup-file');
const standalone = matchMedia('(display-mode: standalone)');
const selectedDay = validDate(history.state?.date) ? history.state.date : dateKey();
const ui = {
  page: pageFromHash(), selectedDay, month: selectedDay.slice(0, 7),
  sheet: null, toast: null, standalone: standalone.matches || navigator.standalone === true,
  installReady: false, updateReady: false, notificationSupported: 'Notification' in window && 'serviceWorker' in navigator,
  wakeLockSupported: Boolean(navigator.wakeLock), alertsPending: false,
  permission: 'Notification' in window ? Notification.permission : 'denied', protected: false,
  audioReady: false, previewing: false,
};
let state, busy = false, toastTimer, installPrompt, registration, backup, wakeLock, wakePending = false, reloading = false;
const sounds = new Sounds();
let backgroundOwner = false, soundLockPending = false, releaseSoundLock;
let currentDate = dateKey(), returnFocus, pendingSync = false, pendingRevision = 0;
const pendingSettings = new Map();
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('faff-sync-v1') : null;

function pageFromHash() {
  return ['#calendar', '#history'].includes(location.hash) ? location.hash.slice(1) : 'home';
}

function focusKey(element) {
  if (!element?.matches('button, input, select')) return null;
  return ['action', 'step', 'field', 'plan', 'grade', 'session', 'correction', 'date', 'mode', 'correct', 'day', 'month', 'setting'].map(key => element.dataset[key] === undefined ? '' : `[data-${key}="${CSS.escape(element.dataset[key])}"]`).join('') || null;
}

function paint() {
  if (!state) return;
  if (ui.sheet?.date) {
    const day = state.days[ui.sheet.date];
    if (!day || (ui.sheet.type === 'correct' && !day.sessions.some(session => session.id === ui.sheet.id))) ui.sheet = null;
  }
  const focus = focusKey(document.activeElement), scroll = root.querySelector('.app-body')?.scrollTop || 0;
  const action = document.activeElement?.dataset.action;
  const sheetScroll = root.querySelector('.app-sheet')?.scrollTop || 0;
  const sessionsScroll = root.querySelector('.session-list')?.scrollTop || 0;
  const hadDialog = !!root.querySelector('[role=dialog]');
  root.innerHTML = render(state, ui);
  const body = root.querySelector('.app-body');
  if (body) body.scrollTop = scroll;
  const dialog = root.querySelector('[role=dialog]');
  if (dialog) dialog.scrollTop = sheetScroll;
  const sessions = root.querySelector('.session-list');
  if (sessions) sessions.scrollTop = sessionsScroll;
  root.querySelector('.app-header').inert = !!dialog;
  body.inert = !!dialog;
  const dock = root.querySelector('.session-dock');
  if (dock) dock.inert = !!dialog;
  const target = focus && root.querySelector(focus);
  if (dialog && !hadDialog) dialog.focus({ preventScroll: true });
  else if (target && !target.closest('[inert]')) target.focus({ preventScroll: true });
  else if (!dialog && hadDialog && returnFocus) root.querySelector(returnFocus)?.focus({ preventScroll: true });
  else if (dialog) dialog.focus({ preventScroll: true });
  else if (focus) {
    const nextAction = { commit: 'start', start: 'pause', pause: 'resume', resume: 'pause' }[action];
    const next = (nextAction && root.querySelector(`[data-action="${nextAction}"]`)) || root.querySelector('[data-grade], .app-body .primary');
    next?.focus({ preventScroll: true });
  }
  const status = document.querySelector('#session-status');
  const announcement = state.active?.phase === 'review' ? 'Session finished. Rate your session as focused or faff.' : '';
  if (status.textContent !== announcement) status.textContent = announcement;
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
  if (type !== 'sounds') stopPreview();
  if (!ui.sheet) returnFocus = focusKey(document.activeElement);
  ui.sheet = { type, ...details };
  paint();
}

function closeSheet() { stopPreview(); ui.sheet = null; backup = null; paint(); }

function navigate(page, date) {
  stopPreview();
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
  try { localStorage.setItem('faff-revision', String(state.revision)); } catch { /* IndexedDB remains the source of truth. */ }
}

function flushSync() {
  if (pendingSettings.size) {
    const [key, value] = pendingSettings.entries().next().value;
    pendingSettings.delete(key);
    void apply({ type: 'SETTING', key, value });
    return;
  }
  const needed = pendingSync || pendingRevision > (state?.revision ?? -1);
  pendingSync = false;
  pendingRevision = 0;
  if (needed) void sync();
}

function syncRevision(revision) {
  if (revision <= (state?.revision ?? -1)) return;
  if (busy) pendingRevision = Math.max(pendingRevision, revision);
  else void sync();
}

async function apply(action, after, refresh = false) {
  if (busy) return false;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  try {
    const output = await change(action);
    const needsPaint = !state || state.revision !== output.state.revision || refresh || action.type !== 'SYNC';
    const completed = output.events.find(event => event.type === 'finished') ||
      (state?.active?.phase === 'running' && state.active.id === output.state.active?.id && output.state.active.phase === 'review' ? output.state.active : null);
    if (state?.active?.phase !== output.state.active?.phase) stopPreview();
    state = output.state;
    if (!state.settings.sound) sounds.stopChime();
    if (output.changed) publishRevision();
    if (ui.toast?.undo && ui.toast.undo.expectedRevision !== state.revision) ui.toast = null;
    after?.(output);
    if (needsPaint) paint();
    if (completed) void playFinishedSound(completed);
    for (const event of output.events) void finished(event);
    return true;
  } catch (error) {
    if (!state) storageError(error);
    else {
      try { state = (await change()).state; } catch { /* Keep the last saved view if storage is unavailable. */ }
      toast(error.message || 'Couldn’t save changes.');
    }
    return false;
  } finally {
    busy = false;
    root.removeAttribute('aria-busy');
    flushSync();
  }
}

function sync() {
  if (busy) { pendingSync = true; return Promise.resolve(false); }
  const previousPermission = ui.permission;
  if ('Notification' in window) ui.permission = Notification.permission;
  return apply({ type: 'SYNC' }, null, previousPermission !== ui.permission);
}

function storageError(error) {
  root.innerHTML = `<div class="loading-screen">${logo('mascot')}<p>Couldn’t load saved data.<br>${escape(error.message || 'Storage unavailable.')}</p><button class="primary" data-action="retry">retry</button></div>`;
}

function tick() {
  if (!state) return;
  maintainSounds();
  if (ui.audioReady !== sounds.ready) { ui.audioReady = sounds.ready; paint(); return; }
  const label = clock(state.active);
  root.querySelectorAll('.live-clock').forEach(element => { if (element.textContent !== label) element.textContent = label; });
  const title = state.active ? state.active.phase === 'review' ? 'Rate session · Faff' : `${label} · Faff` : 'Faff';
  if (document.title !== title) document.title = title;
  if (!busy && (dateKey() !== currentDate || state.active?.phase === 'running' && state.active.deadline <= Date.now())) {
    currentDate = dateKey();
    void sync();
  }
}

async function unlockAudio(force = false) {
  if (!force && !state?.settings.sound && state?.settings.ambience === 'off') return false;
  const ready = await sounds.unlock();
  ui.audioReady = ready;
  maintainSounds();
  return ready;
}

function stopPreview() {
  sounds.cancelPreview();
  ui.previewing = false;
}

function maintainSounds() {
  if (!state) return;
  const wanted = sounds.ready && state.active?.phase === 'running' && state.active.deadline > Date.now()
    && state.settings.ambience !== 'off' && state.settings.ambienceVolume > 0;
  if (!wanted) {
    releaseSoundLock?.(); releaseSoundLock = null; backgroundOwner = false;
    sounds.ambience(state.settings, null);
    return;
  }
  if (!navigator.locks || backgroundOwner) { sounds.ambience(state.settings, state.active); return; }
  if (soundLockPending) return;
  // Only one Faff window plays background sound for the shared timer.
  soundLockPending = true;
  void navigator.locks.request('faff-background-sound', { ifAvailable: true }, async lock => {
    if (!lock) return;
    backgroundOwner = true;
    const released = new Promise(resolve => { releaseSoundLock = resolve; });
    maintainSounds();
    await released;
  }).catch(() => {}).finally(() => { soundLockPending = false; });
}

async function playFinishedSound(event) {
  if (Date.now() - event.completedAt > 60000 || !state.settings.sound || !sounds.ready || !state.settings.soundVolume) return;
  const play = () => {
    if (!state.settings.sound || !sounds.ready || !state.settings.soundVolume) return;
    try {
      if (localStorage.getItem('faff-last-chime') === event.id) return;
      localStorage.setItem('faff-last-chime', event.id);
    } catch { /* Sound still works when browser storage protection blocks localStorage. */ }
    sounds.chime(state.settings);
    navigator.vibrate?.([100, 70, 100]);
  };
  if (navigator.locks) await navigator.locks.request('faff-session-chime', play).catch(() => {});
  else play();
}

async function finished(event) {
  if (Date.now() - event.completedAt > 60000) return;
  if (state.settings.alerts && ui.permission === 'granted' && document.hidden) {
    try {
      const worker = await navigator.serviceWorker.ready;
      await worker.showNotification('Focused?', { body: 'Session finished.', icon: './icons/icon-192.png', tag: `faff-${event.id}`, data: { url: new URL('./', location.href).href } });
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
    if (data.plan === 'targets') { ui.sheet.draft = { focus: draft.focus, faff: draft.faff }; paint(); }
    else await apply({ type: 'DRAFT', date, focus: draft.focus, faff: draft.faff });
    return;
  }
  if (data.grade) {
    await apply({ type: data.correction ? 'CORRECT' : 'RATE', date, id: data.correction || data.session, grade: data.grade }, output => {
      ui.sheet = null;
      if (!data.correction) toast(data.grade === 'focus' ? 'focused' : 'faff', output.undo);
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
    if (data.setting === 'sound' && !state.settings.sound) void unlockAudio(true);
    if (data.setting === 'keepAwake' && !navigator.wakeLock) { toast('Unavailable in this browser.'); return; }
    await apply({ type: 'SETTING', key: data.setting, value: !state.settings[data.setting] }); return;
  }
  switch (data.action) {
    case 'home': navigate('home'); break;
    case 'calendar': navigate('calendar'); break;
    case 'history': navigate('history', date); break;
    case 'close-sheet': closeSheet(); break;
    case 'options': openSheet('options', { date: homeDate(state) }); break;
    case 'settings': openSheet('settings'); break;
    case 'sounds': openSheet('sounds'); break;
    case 'enable-sound':
      if (!await unlockAudio(true)) toast('Couldn’t play sound. Try again.');
      else paint();
      break;
    case 'preview-chime':
      if (await unlockAudio(true)) sounds.chime(state.settings);
      else toast('Couldn’t play sound. Try again.');
      break;
    case 'preview-ambience':
      if (ui.previewing) { stopPreview(); paint(); }
      else if (await unlockAudio(true)) {
        ui.previewing = true;
        sounds.previewAmbience(state.settings, () => { ui.previewing = false; paint(); });
        paint();
      } else toast('Couldn’t play sound. Try again.');
      break;
    case 'targets': openSheet('targets', { date, mode: data.mode, draft: { focus: day.focus, faff: day.faff } }); break;
    case 'save-plan': await apply({ type: 'TARGETS', date, ...ui.sheet.draft }, () => { ui.sheet = null; }); break;
    case 'commit': unlockAudio(); await apply({ type: 'COMMIT', date, focus: day.focus, faff: day.faff }); break;
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
        } catch { toast('Couldn’t enable notifications.'); }
        finally {
          ui.alertsPending = false; paint();
          if (!busy) flushSync();
        }
      }
      break;
    case 'protect':
      try {
        ui.protected = await navigator.storage?.persist?.() || false;
        if (ui.protected) paint();
        else toast('Couldn’t protect saves. Download a backup.');
      } catch { toast('Couldn’t protect saves. Download a backup.'); }
      break;
    case 'export': {
      if (!await sync()) break;
      const blob = new Blob([JSON.stringify({ kind: 'faff-backup', exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `faff-${dateKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      break;
    }
    case 'import': fileInput.click(); break;
    case 'confirm-restore':
      if (!backup) break;
      busy = true;
      try { state = (await restoreBackup(backup)).state; backup = null; ui.sheet = null; publishRevision(); navigate('home'); toast('backup restored'); }
      catch (error) { toast(error.message); }
      finally { busy = false; flushSync(); }
      break;
    case 'update': registration?.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' }); break;
  }
});

root.addEventListener('input', event => {
  const input = event.target;
  if (!input.matches('input[type=range][data-setting]') || !state) return;
  input.setAttribute('aria-valuetext', `${input.value} percent`);
  input.closest('.sound-volume').querySelector('output').textContent = `${input.value}%`;
  if (input.dataset.setting === 'ambienceVolume' && (backgroundOwner || ui.previewing || !navigator.locks)) {
    sounds.playBackground(ui.previewing || state.active?.phase === 'running' ? state.settings.ambience : 'off', Number(input.value));
  }
});

root.addEventListener('change', async event => {
  const input = event.target;
  if (!input.matches('input[data-setting], select[data-setting]') || !state) return;
  const key = input.dataset.setting, value = input.type === 'range' ? Number(input.value) : input.value;
  stopPreview();
  void unlockAudio(true);
  if (busy) pendingSettings.set(key, value);
  else await apply({ type: 'SETTING', key, value });
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; fileInput.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup too large.');
    const value = JSON.parse(await file.text());
    backup = readBackup(value);
    openSheet('restore');
  } catch (error) { toast(error instanceof SyntaxError ? 'Invalid backup file.' : error.message); }
});

document.addEventListener('keydown', event => {
  if (!ui.sheet) return;
  if (event.key === 'Escape') { closeSheet(); event.preventDefault(); }
  if (event.key === 'Tab') {
    const dialog = root.querySelector('[role=dialog]'), buttons = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { first?.focus(); event.preventDefault(); }
  }
});

window.addEventListener('popstate', () => {
  stopPreview();
  ui.sheet = null; ui.page = pageFromHash();
  if (history.state?.date) { ui.selectedDay = history.state.date; ui.month = ui.selectedDay.slice(0, 7); }
  paint();
});
channel?.addEventListener('message', event => syncRevision(Number(event.data)));
window.addEventListener('storage', event => { if (event.key === 'faff-revision') syncRevision(Number(event.newValue)); });
window.addEventListener('focus', () => { if (state) void sync(); });
window.addEventListener('pageshow', () => { if (state) void sync(); });
window.addEventListener('pagehide', () => { stopPreview(); sounds.stop(); releaseSoundLock?.(); releaseSoundLock = null; backgroundOwner = false; });
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
  } catch { toast('Offline setup failed. Reopen when online.'); }
}

await sync();
void registerWorker();
if (navigator.storage?.persisted) navigator.storage.persisted().then(value => { ui.protected = value; }).catch(() => {});
setInterval(tick, 1000);

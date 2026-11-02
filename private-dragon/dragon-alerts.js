// Optional, client-only enhancement for the authenticated DFO private dragon tracker.
// Identifies each spawn by the relay's hourly watch. No changes to the observer/feed.
const KEY = 'dfo-private-dragon-spawn-responses-v1';
const AUDIO_KEY = 'dfo-private-dragon-audio-v1';
const MAX_RECORDS = 600;
const $ = (id) => document.getElementById(id);
const make = (tag, className, value) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (value !== undefined) e.textContent = value;
  return e;
};
const date = (ms) => Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString() : '—';
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
};
function validWatch(n) { return Number.isSafeInteger(n) && n >= 0; }
function cleanRecord(x) {
  if (!x || !validWatch(x.watch)) return null;
  return {
    watch: x.watch,
    landAt: Number.isFinite(x.landAt) ? x.landAt : 0,
    leaveAt: Number.isFinite(x.leaveAt) ? x.leaveAt : 0,
    province: String(x.province || 'Unknown province').slice(0, 80),
    variant: String(x.variant || 'Dwarven Dragon').slice(0, 80),
    responded: x.responded === true,
    respondedAt: Number.isFinite(x.respondedAt) ? x.respondedAt : 0,
  };
}
function loadRecords() {
  try {
    const raw = JSON.parse(storage.get(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const unique = new Map();
    for (const x of raw) { const c = cleanRecord(x); if (c) unique.set(c.watch, c); }
    return [...unique.values()].sort((a, b) => b.watch - a.watch).slice(0, MAX_RECORDS);
  } catch { return []; }
}
let records = loadRecords();
let audio = null;
let audioUnlocked = false;
let lastError = '';
let currentWatch = null;
const originalTitle = document.title;
let pollBusy = false;

function persist() { storage.set(KEY, JSON.stringify(records)); }
function upsert(d, notify) {
  if (!d || !validWatch(d.watch)) return false;
  const idx = records.findIndex((x) => x.watch === d.watch);
  if (idx !== -1) {
    records[idx] = { ...records[idx], landAt: d.landAt, leaveAt: d.leaveAt,
      province: d.province || records[idx].province, variant: d.variant || records[idx].variant };
    return false;
  }
  const x = cleanRecord(d);
  if (!x) return false;
  records.unshift(x);
  records.sort((a, b) => b.watch - a.watch);
  records = records.slice(0, MAX_RECORDS);
  persist();
  if (notify && audioUnlocked && storage.get(AUDIO_KEY) === 'on') playSound();
  return true;
}
async function enableSound() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { $('da-sound-caption').textContent = 'This browser does not support audio alerts.'; return; }
  try {
    audio ??= new Ctx();
    await audio.resume();
    audioUnlocked = audio.state === 'running';
    if (!audioUnlocked) throw new Error('Audio is blocked by your browser');
    storage.set(AUDIO_KEY, 'on');
    playSound(); // Confirmation chime, also serves as a sound test.
    renderSound();
  } catch {
    $('da-sound-caption').textContent = 'Audio is blocked. Click Enable sound again after interacting with this tab.';
  }
}
function playSound() {
  if (!audioUnlocked || !audio || audio.state !== 'running') return;
  try {
    const t = audio.currentTime + 0.02;
    for (const [offset, hz] of [[0, 660], [0.16, 880], [0.36, 990]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.10, t + offset + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.19);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.20);
    }
  } catch { /* Sound never prevents a spawn from being logged. */ }
}
function renderSound() {
  const on = audioUnlocked && storage.get(AUDIO_KEY) === 'on';
  $('da-sound').textContent = on ? 'Mute sound' : 'Enable sound';
  $('da-sound').setAttribute('aria-pressed', String(on));
  $('da-sound-caption').textContent = on
    ? 'Chime armed for new dragon spawns while this page remains open.'
    : storage.get(AUDIO_KEY) === 'on'
      ? 'Click Enable sound to re-arm the chime after this page reloads (browser requirement).'
      : 'Click Enable sound once to allow chimes in this tab.';
}
function toggleResponded(w) {
  const x = records.find((r) => r.watch === w);
  if (!x) return;
  x.responded = !x.responded;
  x.respondedAt = x.responded ? Date.now() : 0;
  persist();
  render();
}
function render() {
  const list = $('da-spawns');
  if (!list) return;
  list.replaceChildren();
  const outstanding = records.filter((x) => !x.responded).length;
  $('da-count').textContent = records.length ? `${outstanding} not marked responded · ${records.length} recorded` : 'No dragon spawns recorded yet';
  $('da-feed').textContent = lastError || (currentWatch != null ? 'Dragon watch received from the server' : 'Waiting for the next server-revealed dragon');
  for (const x of records.slice(0, 50)) {
    const item = make('li', 'da-spawn' + (x.watch === currentWatch ? ' da-current' : ''));
    const info = make('div', 'da-info');
    const title = make('strong', '', `${x.variant} · ${x.province}`);
    const when = make('span', 'da-time', `${date(x.landAt)} · watch #${x.watch}`);
    const note = make('span', 'da-state ' + (x.responded ? 'da-done' : 'da-pending'), x.responded ? `Responded${x.respondedAt ? ' · ' + date(x.respondedAt) : ''}` : 'Not marked responded');
    info.append(title, when, note);
    const button = make('button', x.responded ? 'da-action da-undo' : 'da-action', x.responded ? 'Undo' : 'Mark responded');
    button.type = 'button';
    button.setAttribute('aria-label', `${x.responded ? 'Undo responded' : 'Mark responded'} for ${x.variant} in ${x.province} on ${date(x.landAt)}`);
    button.addEventListener('click', () => toggleResponded(x.watch));
    item.append(info, button);
    list.append(item);
  }
  document.title = outstanding && currentWatch != null && records.find(x => x.watch === currentWatch && !x.responded)
    ? '● Dragon detected · ' + originalTitle : originalTitle;
  renderSound();
}
async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const r = await fetch('status.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    if (s?.version !== 2) throw new Error('Unexpected status version');
    const now = Date.now();
    const fresh = s.connected === true && Number.isFinite(s.updatedAt) && now - s.updatedAt < 75000 && s.updatedAt - now < 30000;
    lastError = fresh ? '' : 'Observer is offline or status is stale — history is retained';
    currentWatch = fresh && s.dragon && now < s.dragon.leaveAt && validWatch(s.dragon.watch) ? s.dragon.watch : null;
    // Remember the last completed spawn without alarming on a historical sighting.
    if (s.previous && validWatch(s.previous.watch) && s.previous.watch !== currentWatch) upsert(s.previous, false);
    if (currentWatch != null) upsert(s.dragon, true);
  } catch {
    currentWatch = null;
    lastError = 'Unable to read the live dragon feed — saved history is still available';
  } finally { pollBusy = false; render(); }
}
function init() {
  const panel = make('article', 'da-panel');
  panel.id = 'dragon-alert-panel';
  const heading = make('h2', '', 'Spawn notifications & responses');
  const intro = make('p', 'da-explain', 'A short chime for each new server-revealed dragon, plus a personal checklist of spawns you responded to. Marking is manual; it does not change the game.');
  const toolbar = make('div', 'da-toolbar');
  const soundButton = make('button', 'da-action', 'Enable sound'); soundButton.id = 'da-sound'; soundButton.type = 'button';
  soundButton.addEventListener('click', () => {
    if (audioUnlocked && storage.get(AUDIO_KEY) === 'on') {
      storage.set(AUDIO_KEY, 'off'); renderSound();
    } else { enableSound(); }
  });
  const caption = make('span', 'da-caption', ''); caption.id = 'da-sound-caption';
  toolbar.append(soundButton, caption);
  const count = make('p', 'da-count', ''); count.id = 'da-count';
  const feed = make('p', 'da-caption', ''); feed.id = 'da-feed'; feed.setAttribute('role','status');
  const list = make('ol', 'da-spawns'); list.id = 'da-spawns';
  panel.append(heading, intro, toolbar, count, feed, list);
  const articles = document.querySelectorAll('main > article');
  if (articles.length) articles[0].insertAdjacentElement('afterend', panel);
  else document.querySelector('main')?.append(panel);
  render();
  poll();
  setInterval(poll, 15000);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { records = loadRecords(); render(); }
    if (e.key === AUDIO_KEY) renderSound();
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

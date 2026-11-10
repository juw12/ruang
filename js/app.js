// Ruang app controller: state, steps, panels, photo editor, undo, share and export.
import { Viewer, STYLES, kelvinToHex } from './viewer.js';
import { REGIONS, SOURCES, CATALOG, CATALOG_ORDER, TEMPLATES, PRICES, RATES_DATE } from './data.js';
import { t, setLang, getLang, LANGS, guessLang, regionName } from './i18n.js';
import { solarPosition, sunVector, fitsThroughDoor, luminance, saturation, overlapDepth, outOfRoom } from './geom.js';
import * as P from './photo.js';
import * as A from './architect.js';

const $ = (s, r = document) => r.querySelector(s);
const STEPS = ['photos', 'room', 'look', 'arrange', 'renovate', 'cost'];
const STORE = 'ruang:v1';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let uid = 1;
const newId = () => 'i' + Date.now().toString(36) + (uid++).toString(36);

// ---------- default room ----------
function sampleItems() {
  const mk = (type, x, z, rot = 0, extra = {}) => ({ id: newId(), type, w: CATALOG[type].w, d: CATALOG[type].d, h: CATALOG[type].h, x, z, rot, ...extra });
  return [
    mk('bed', -0.55, -1.05, 0),
    mk('nightstand', -1.62, -1.85, 0),
    mk('nightstand', 0.53, -1.85, 0),
    mk('wardrobe', 1.45, -0.2, -Math.PI / 2),
    mk('desk', 1.15, 1.6, Math.PI),
    mk('officeChair', 1.15, 1.05, Math.PI),
    mk('rug', -0.55, 0.2, 0),
    mk('plant', -1.5, 1.75, 0),
  ];
}

function defaultState(region, lang) {
  const reg = REGIONS[region] || REGIONS.US;
  return {
    v: 1, region, lang, step: 'photos', style: 'realistic', mode: 'model', northDeg: 0, eye: 1.6,
    lens: reg.lens, rentSafe: false, budget: null, priceOverride: {},
    room: { w: 3.6, d: 4.2, h: 2.7, doors: [{ wall: 'S', offset: 2.4, width: 0.9, height: 2.05 }], windows: [{ wall: 'N', offset: 2.2, width: 1.2, sill: 0.9, height: 1.3 }] },
    finish: { wall: { finish: 'paint', color: '#e9e4da' }, floor: { type: 'laminate', color: '#b08a62' }, ceiling: '#f6f4ef', lightK: 3000,
      pal: { wood: '#a57f57', fabric: '#c9c3b8', accent: '#a84b25', lowBed: false } },
    items: sampleItems(),
    plan: null, renoTab: 'templates', showFlow: false,
    sun: { month: new Date().getMonth(), hour: 9.5, lights: false },
    photoInfo: null,
  };
}

let S;
let viewer;
let photos = [];
let activePhoto = 0;
let photoTool = 'wall';
let undo = [];
let redo = [];
let after = null;
let notes = { list: [] };
let lastAuto = null;
let lastOpt = null;
let refPalette = null;
let aiState = '';

// ---------- persistence ----------
function save() {
  try {
    const { plan, ...rest } = S;
    localStorage.setItem(STORE, JSON.stringify({ ...rest, plan }));
  } catch { /* storage full or blocked */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function encodeShare() {
  const data = { v: 1, region: S.region, lang: S.lang, room: S.room, finish: S.finish, items: S.items, style: S.style, northDeg: S.northDeg, plan: S.plan, lens: S.lens };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let out;
  let tag = 'j';
  if (window.CompressionStream) {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    out = new Uint8Array(await new Response(cs).arrayBuffer());
    tag = 'z';
  } else {
    out = bytes;
  }
  let bin = '';
  out.forEach((b) => { bin += String.fromCharCode(b); });
  return tag + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decodeShare(s) {
  const tag = s[0];
  const b64 = s.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let txt;
  if (tag === 'z') {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    txt = await new Response(ds).text();
  } else {
    txt = new TextDecoder().decode(bytes);
  }
  return JSON.parse(txt);
}

// ---------- units + money ----------
const reg = () => REGIONS[S.region] || REGIONS.US;
const imperial = () => !!reg().imperial;

function fmtLen(m) {
  if (imperial()) {
    const inch = Math.round(m / 0.0254);
    return `${Math.floor(inch / 12)}' ${inch % 12}"`;
  }
  return m.toFixed(2) + ' m';
}

function toDisp(m) {
  return imperial() ? +(m / 0.3048).toFixed(2) : +m.toFixed(2);
}

function fromDisp(v) {
  return imperial() ? v * 0.3048 : v;
}

const unitLabel = () => (imperial() ? 'ft' : 'm');

function fmtMoney(v) {
  const r = reg();
  try {
    return new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.cur, maximumSignificantDigits: 3 }).format(v);
  } catch {
    return r.cur + ' ' + Math.round(v);
  }
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- undo ----------
function snap() {
  return JSON.stringify({ room: S.room, finish: S.finish, items: S.items });
}

function pushUndo(prev = snap()) {
  undo.push(prev);
  if (undo.length > 60) undo.shift();
  redo = [];
}

function restore(sn) {
  const o = JSON.parse(sn);
  S.room = o.room;
  S.finish = o.finish;
  S.items = o.items;
}

function doUndo() {
  if (!undo.length) return;
  redo.push(snap());
  restore(undo.pop());
  refreshAll();
}

function doRedo() {
  if (!redo.length) return;
  undo.push(snap());
  restore(redo.pop());
  refreshAll();
}

// ---------- 3D sync ----------
function itemsForView(items) {
  return items.map((it) => ({ ...it, flat: !!CATALOG[it.type]?.flat }));
}

function rebuild3D() {
  viewer.setRoom(S.room, S.finish);
  viewer.setItems(itemsForView(S.items), S.finish.pal);
  rebuildAfter();
  updateSun();
}

function rebuildAfter() {
  if (S.plan) {
    const plan = S.rentSafe ? A.rentSafePlan(S.plan) : S.plan;
    after = A.applyPlan(S, plan, newId);
    viewer.setAfter(after.room, after.finish, itemsForView(after.items), after.finish.pal);
  } else {
    after = null;
    viewer.setAfter(null);
  }
}

function sunDate(hour) {
  const r = reg();
  const y = new Date().getFullYear();
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  return new Date(Date.UTC(y, S.sun.month, 15, hh, mm) - r.tz * 3600000);
}

function sunVecAt(hour) {
  const r = reg();
  const sp = solarPosition(sunDate(hour), r.lat, r.lon);
  return sp.altitude > 0 ? sunVector(sp.altitude, sp.azimuth, S.northDeg) : null;
}

function updateSun() {
  const r = reg();
  const sp = solarPosition(sunDate(S.sun.hour), r.lat, r.lon);
  const vec = sunVector(sp.altitude, sp.azimuth, S.northDeg);
  const k = S.mode === 'split' && after ? after.finish.lightK : S.finish.lightK;
  viewer.setSun(vec, sp.altitude > 0, k, S.sun.lights || sp.altitude < 4);
  const lab = $('#sunTimeLabel');
  if (lab) lab.textContent = fmtHour(S.sun.hour) + (sp.altitude <= 0 ? ' · ' + t('sun.night') : '');
}

function fmtHour(hr) {
  const hh = Math.floor(hr);
  const mm = Math.round((hr - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

let analyseTimer = null;
function scheduleAnalyse() {
  clearTimeout(analyseTimer);
  analyseTimer = setTimeout(runAnalyse, 120);
}

function runAnalyse() {
  const its = itemsForView(S.items);
  let sun = null;
  try {
    sun = viewer.sunHours(its, sunVecAt);
  } catch { sun = null; }
  notes = A.analyse(S, { sun });
  const bad = new Set();
  for (const n of notes.list) if (n.sev === 'bad' && (n.key === 'chk.overlap' || n.key === 'chk.outside' || n.key === 'chk.door')) (n.ids || []).forEach((i) => bad.add(i));
  viewer.setInvalid([...bad]);
  viewer.setFlow(S.showFlow ? notes.grid : null, S.room);
  if (S.step === 'cost' || S.step === 'arrange') renderPanel();
}

function refreshAll() {
  rebuild3D();
  renderPanel();
  renderChrome();
  scheduleAnalyse();
  save();
}

// ---------- chrome ----------
function renderChrome() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  $('#btnRegion').textContent = `${regionName(S.region)} · ${reg().cur} · ${LANGS.find((l) => l[0] === getLang())?.[1] || 'English'}`;
  const nav = $('.steps');
  nav.replaceChildren(...STEPS.map((s, i) => h('button', {
    class: 'step', 'aria-current': S.step === s ? 'step' : null, onclick: () => goStep(s),
  }, h('b', {}, String(i + 1).padStart(2, '0')), h('span', {}, t('step.' + s)))));
  const tb = $('#titleblock');
  tb.replaceChildren(
    h('div', { class: 'name' }, 'Ruang'),
    h('div', { class: 'k' }, t('onb.region')), h('div', {}, regionName(S.region)),
    h('div', { class: 'k' }, 'CUR / UNIT'), h('div', {}, `${reg().cur} / ${unitLabel()}`),
    h('div', { class: 'k' }, t('look.title')), h('div', {}, t('style.' + S.style)),
    h('div', { class: 'k' }, 'ROOM'), h('div', {}, `${fmtLen(S.room.w)} x ${fmtLen(S.room.d)}`),
  );
  renderViewbar();
  renderSunbar();
}

function renderViewbar() {
  const vb = $('#viewbar');
  const modes = [['model', 'view.model'], ['photo', 'view.photo'], ['split', 'view.split'], ['walk', 'view.walk']];
  const cams = [['dollhouse', 'cam.dollhouse'], ['top', 'cam.top'], ['eye', 'cam.eye']];
  const showPhotoEd = S.step === 'photos' && photos.length;
  if (showPhotoEd) {
    vb.replaceChildren();
    return;
  }
  vb.replaceChildren(
    h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, ...modes.map(([m, k]) => h('button', {
      'aria-pressed': S.mode === m ? 'true' : 'false',
      disabled: (m === 'photo' && !viewer.photoPose) || (m === 'split' && !S.plan),
      onclick: () => setMode(m),
    }, t(k)))),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Camera' }, ...cams.map(([c, k]) => h('button', {
      onclick: () => {
        if (S.mode === 'walk' || S.mode === 'photo') setMode('model');
        viewer.setCameraPreset(c);
      },
    }, t(k)))),
    h('div', { class: 'right' },
      h('select', { class: 'btn small', 'aria-label': t('look.title'), onchange: (e) => setStyle(e.target.value) },
        ...STYLES.map((s) => h('option', { value: s, selected: S.style === s }, t('style.' + s)))),
      h('button', { class: 'btn small', onclick: doUndo, disabled: !undo.length, title: t('arrange.undo') }, t('arrange.undo')),
    ),
  );
}

function renderSunbar() {
  const sb = $('#sunbar');
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(getLang(), { month: 'short' }).format(new Date(2026, i, 15)));
  sb.hidden = S.step === 'photos' && photos.length > 0;
  sb.replaceChildren(
    h('b', {}, t('sun.title')),
    h('input', { type: 'range', min: 5, max: 21, step: 0.25, value: S.sun.hour, 'aria-label': t('sun.time'), oninput: (e) => {
      S.sun.hour = +e.target.value;
      updateSun();
    }, onchange: () => {
      save();
      scheduleAnalyse();
    } }),
    h('span', { class: 'mono', id: 'sunTimeLabel' }, fmtHour(S.sun.hour)),
    h('select', { 'aria-label': t('sun.month'), onchange: (e) => {
      S.sun.month = +e.target.value;
      updateSun();
      scheduleAnalyse();
      save();
    } }, ...months.map((m, i) => h('option', { value: i, selected: S.sun.month === i }, m))),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: S.sun.lights, onchange: (e) => {
      S.sun.lights = e.target.checked;
      updateSun();
      save();
    } }), t('sun.lights')),
  );
  updateSun();
}

function setMode(m) {
  S.mode = m;
  viewer.setMode(m);
  if (m === 'model') viewer.setCameraPreset('dollhouse');
  $('#splitHandle').hidden = m !== 'split';
  $('#walkpad').hidden = m !== 'walk';
  positionSplit();
  renderViewbar();
  updateSun();
}

function setStyle(s) {
  S.style = s;
  viewer.setStyle(s);
  viewer.setCameraPreset(S.mode === 'walk' ? 'eye' : 'dollhouse');
  if (S.mode === 'walk' || S.mode === 'photo') viewer.setMode(S.mode);
  renderChrome();
  if (S.step === 'look') renderPanel();
  save();
}

function goStep(s) {
  S.step = s;
  const ed = s === 'photos' && photos.length > 0;
  $('#photoEd').hidden = !ed;
  $('#view').hidden = ed;
  $('#titleblock').hidden = ed;
  if (s === 'renovate' && S.plan && S.mode !== 'split') setMode('split');
  renderChrome();
  renderPanel();
  if (ed) drawPhoto();
  if (s === 'cost' || s === 'arrange') scheduleAnalyse();
  save();
}

// ---------- panels ----------
function sec(key) {
  return h('div', { class: 'sec' }, t(key));
}

function renderPanel() {
  const p = $('#panel');
  const body = ({ photos: panelPhotos, room: panelRoom, look: panelLook, arrange: panelArrange, renovate: panelRenovate, cost: panelCost })[S.step]();
  p.replaceChildren(...body);
}

function nextBtn(step, key) {
  return h('button', { class: 'btn primary', onclick: () => goStep(step) }, t(key || 'step.' + step) + '  >');
}

// 01 photos
function panelPhotos() {
  const out = [h('h2', {}, t('photos.title')), h('p', { class: 'muted' }, t('photos.help'))];
  out.push(h('div', { class: 'drop' },
    h('div', { class: 'row', style: 'justify-content:center' },
      h('button', { class: 'btn primary', onclick: () => $('#filePhotos').click() }, t('photos.add')),
      h('button', { class: 'btn', id: 'btnSample', onclick: loadSample }, t('photos.sample'))),
    h('p', { class: 'muted', style: 'font-size:13px' }, t('photos.privacy'))));
  if (!photos.length) return out;
  const ph = photos[activePhoto];
  out.push(sec('step.photos'), h('div', { class: 'thumbs' }, ...photos.map((q, i) => h('button', {
    class: 'thumb', 'aria-pressed': i === activePhoto ? 'true' : 'false', onclick: () => {
      activePhoto = i;
      renderPanel();
      drawPhoto();
    },
  }, h('img', { src: q.url, alt: '' }), h('b', {}, 'ABCD'[P.WALLS.indexOf(q.wall)] || '?')))));
  out.push(h('div', { class: 'field' }, h('span', {}, t('photos.faces')), wallPicker(ph.wall, (w) => {
    ph.wall = w;
    renderPanel();
  })));
  out.push(h('div', { class: 'field' }, h('span', {}, t('photos.ceil') + ` (${unitLabel()})`),
    h('input', { class: 'num', type: 'number', step: 0.05, min: 2, max: 6, value: toDisp(S.room.h), onchange: (e) => {
      S.room.h = fromDisp(+e.target.value);
      drawPhoto();
    } })));
  out.push(h('div', { class: 'seg', role: 'group', style: 'margin:8px 0' }, ...[['wall', 'photos.tool.wall'], ['mark', 'photos.tool.mark'], ['opening', 'photos.tool.opening']].map(([k, key]) => h('button', {
    'aria-pressed': photoTool === k ? 'true' : 'false', onclick: () => {
      photoTool = k;
      $('#pickPop').hidden = true;
      renderPanel();
      drawPhoto();
    },
  }, t(key)))));
  out.push(h('p', { class: 'muted' }, t(photoTool === 'wall' ? 'photos.drag' : photoTool === 'mark' ? 'photos.pick' : 'photos.pickOpening')));
  const nItems = photos.reduce((s, q) => s + q.markers.filter((m) => m.type).length, 0);
  if (nItems) out.push(h('p', {}, t('photos.found', { n: nItems })));
  out.push(h('button', { class: 'btn', onclick: runAI, disabled: aiState === 'loading' || aiState === 'running' }, t('photos.ai')));
  if (aiState) out.push(h('p', { class: 'muted' }, t(aiState === 'loading' ? 'photos.aiLoading' : aiState === 'running' ? 'photos.aiRunning' : aiState === 'fail' ? 'photos.aiFail' : 'photos.found', { n: nItems })));
  out.push(h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn primary', id: 'btnBuild', onclick: buildFromPhotos }, t('photos.build'))));
  return out;
}

function wallPicker(cur, onPick) {
  const svg = (w) => {
    const pos = { N: 'M14 10h46', E: 'M64 14v46', S: 'M14 64h46', W: 'M10 14v46' }[w];
    return `<svg viewBox="0 0 74 74"><rect x="10" y="10" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><path d="${pos}" stroke="var(--accent)" stroke-width="5"/></svg>`;
  };
  return h('div', { class: 'seg' }, ...P.WALLS.map((w, i) => h('button', { 'aria-pressed': cur === w ? 'true' : 'false', title: 'ABCD'[i], onclick: () => onPick(w) }, 'ABCD'[i])), h('span', { class: 'wallpick', html: svg(cur), style: 'display:none' }));
}

// 02 room
function panelRoom() {
  const r = S.room;
  const u = unitLabel();
  const num = (val, set, step = 0.05) => h('input', { class: 'num', type: 'number', step, value: toDisp(val), onchange: (e) => {
    pushUndo();
    set(fromDisp(+e.target.value));
    refreshAll();
  } });
  const out = [h('h2', {}, t('room.title'))];
  if (S.photoInfo) out.push(h('p', { class: 'muted' }, t('room.fromPhoto', { w: fmtLen(S.photoInfo.w), c: fmtLen(S.photoInfo.camH) })), h('p', { class: 'hint', id: 'depthHint' }, t('room.depthHint')));
  out.push(
    h('div', { class: 'field' }, h('span', {}, `${t('room.w')} (${u})`), num(r.w, (v) => { r.w = Math.max(1.5, v); })),
    h('div', { class: 'field' }, h('span', {}, `${t('room.d')} (${u})`), num(r.d, (v) => { r.d = Math.max(1.5, v); })),
    h('div', { class: 'field' }, h('span', {}, `${t('room.h')} (${u})`), num(r.h, (v) => { r.h = Math.max(2, v); })),
    h('div', { class: 'field' }, h('span', {}, t('room.north')), h('select', { onchange: (e) => {
      S.northDeg = +e.target.value;
      updateSun();
      scheduleAnalyse();
      save();
    } }, ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => h('option', { value: d, selected: S.northDeg === d }, ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][d / 45] + ` (${d}°)`)))),
    h('div', { class: 'field' }, h('span', {}, `${t('room.eye')} (${u})`), h('input', { class: 'num', type: 'number', step: 0.05, value: toDisp(S.eye), onchange: (e) => {
      S.eye = fromDisp(+e.target.value);
      save();
    } })),
  );
  const openingRows = (o, isDoor, idx) => h('div', { style: 'border:1px solid var(--line);border-radius:4px;padding:6px 8px;margin:6px 0' },
    h('div', { class: 'field' }, h('span', {}, t('room.wall')), h('select', { onchange: (e) => {
      pushUndo();
      o.wall = e.target.value;
      refreshAll();
    } }, ...P.WALLS.map((w, i) => h('option', { value: w, selected: o.wall === w }, 'ABCD'[i] + ' · ' + w)))),
    h('div', { class: 'field' }, h('span', {}, `${t('room.offset')} (${u})`), num(o.offset, (v) => { o.offset = Math.max(0, v); })),
    h('div', { class: 'field' }, h('span', {}, `${t('room.width')} (${u})`), num(o.width, (v) => { o.width = Math.max(0.4, v); })),
    isDoor ? null : h('div', { class: 'field' }, h('span', {}, `${t('room.sill')} (${u})`), num(o.sill, (v) => { o.sill = Math.max(0, v); })),
    isDoor ? null : h('div', { class: 'field' }, h('span', {}, `${t('room.wheight')} (${u})`), num(o.height, (v) => { o.height = Math.max(0.3, v); })),
    isDoor ? null : h('button', { class: 'btn small', onclick: () => {
      pushUndo();
      r.windows.splice(idx, 1);
      refreshAll();
    } }, t('room.remove')),
  );
  out.push(sec('room.doors'), ...r.doors.slice(0, 1).map((o) => openingRows(o, true, 0)));
  out.push(sec('room.windows'), ...r.windows.map((o, i) => openingRows(o, false, i)),
    h('button', { class: 'btn small', onclick: () => {
      pushUndo();
      r.windows.push({ wall: 'E', offset: 0.8, width: 1.2, sill: 0.9, height: 1.3 });
      refreshAll();
    } }, t('room.addWin')));
  out.push(sec('reno.swatches'),
    h('div', { class: 'field' }, h('span', {}, t('cost.wall.paint')), h('input', { type: 'color', value: S.finish.wall.color, onchange: (e) => {
      pushUndo();
      S.finish.wall.color = e.target.value;
      refreshAll();
    } })),
    h('div', { class: 'field' }, h('span', {}, t('cost.floor.' + S.finish.floor.type)), h('select', { onchange: (e) => {
      pushUndo();
      S.finish.floor.type = e.target.value;
      refreshAll();
    } }, ...['laminate', 'vinyl', 'parquet', 'oak', 'walnut', 'tile', 'terracotta', 'stone', 'terrazzo', 'concrete', 'carpet', 'tatami'].map((f) => h('option', { value: f, selected: S.finish.floor.type === f }, t('cost.floor.' + f))))),
    h('div', { class: 'field' }, h('span', {}, t('arrange.color')), h('input', { type: 'color', value: S.finish.floor.color, onchange: (e) => {
      pushUndo();
      S.finish.floor.color = e.target.value;
      refreshAll();
    } })),
  );
  out.push(h('div', { style: 'margin-top:16px' }, nextBtn('look')));
  return out;
}

// 03 look
function panelLook() {
  const out = [h('h2', {}, t('look.title'))];
  out.push(h('div', { class: 'styles' }, ...STYLES.map((s) => h('button', {
    class: 'stile', 'aria-pressed': S.style === s ? 'true' : 'false', 'data-style': s, onclick: () => setStyle(s),
  }, h('img', { src: `assets/styles/${s}.jpg`, alt: '', loading: 'lazy', width: 320, height: 200 }), h('span', {}, t('style.' + s))))));
  out.push(sec('sun.title'), h('p', { class: 'muted' }, t('sun.hours')));
  out.push(h('div', { style: 'margin-top:16px' }, nextBtn('arrange')));
  return out;
}

// Style thumbnails are pre-rendered (assets/styles/*.jpg) so the Look step costs no extra GPU work.

// 04 arrange
function selectedItem() {
  return S.items.find((x) => x.id === viewer.selected);
}

function panelArrange() {
  const out = [h('h2', {}, t('arrange.title')), h('p', { class: 'muted' }, t('arrange.hint'))];
  const score = A.layoutScore(S);
  out.push(h('div', { class: 'row' },
    h('div', {}, h('div', { class: 'sec', style: 'margin:0' }, t('arrange.score')), h('div', { class: 'score', id: 'layoutScore' }, String(score))),
    h('div', { class: 'grow' }),
    h('button', { class: 'btn primary', id: 'btnAuto', onclick: () => {
      const prev = snap();
      const before = A.layoutScore(S);
      const res = A.autoArrange(S, (Date.now() & 0xffff) + 3);
      pushUndo(prev);
      S.items = res.items;
      lastAuto = { a: before, b: A.layoutScore(S) };
      refreshAll();
      toast(t('arrange.autoRes', lastAuto));
    } }, t('arrange.auto'))));
  if (lastAuto) out.push(h('p', { class: 'muted' }, t('arrange.autoRes', lastAuto)));
  out.push(h('div', { class: 'row', style: 'margin:8px 0' },
    h('label', { class: 'row' }, h('input', { type: 'checkbox', id: 'chkFlow', checked: S.showFlow, onchange: (e) => {
      S.showFlow = e.target.checked;
      viewer.setFlow(S.showFlow ? notes.grid : null, S.room);
      if (S.showFlow) viewer.setCameraPreset('top');
      save();
    } }), t('arrange.flow')),
    h('button', { class: 'btn small', onclick: doUndo, disabled: !undo.length }, t('arrange.undo')),
    h('button', { class: 'btn small', onclick: doRedo, disabled: !redo.length }, t('arrange.redo'))));
  const it = selectedItem();
  out.push(sec('arrange.selected'));
  if (!it) {
    out.push(h('p', { class: 'muted' }, t('arrange.none')));
  } else {
    const dims = (k) => h('input', { class: 'num', type: 'number', step: 0.05, value: toDisp(it[k]), onchange: (e) => {
      pushUndo();
      it[k] = Math.max(0.05, fromDisp(+e.target.value));
      refreshAll();
    } });
    const door = S.room.doors[0];
    const fits = door ? fitsThroughDoor(it, door) : true;
    out.push(h('p', {}, h('b', {}, t('item.' + it.type))),
      h('div', { class: 'field' }, h('span', {}, `${t('room.width')} (${unitLabel()})`), dims('w')),
      h('div', { class: 'field' }, h('span', {}, `${t('room.d')} (${unitLabel()})`), dims('d')),
      h('div', { class: 'field' }, h('span', {}, `${t('room.h')} (${unitLabel()})`), dims('h')),
      h('div', { class: 'field' }, h('span', {}, t('arrange.color')), h('input', { type: 'color', value: it.color || (CATALOG[it.type].kind === 'wood' ? S.finish.pal.wood : S.finish.pal.fabric), onchange: (e) => {
        pushUndo();
        it.color = e.target.value;
        it.colorKind = CATALOG[it.type].kind;
        refreshAll();
      } })),
      door ? h('p', { class: fits ? 'muted' : '', style: fits ? '' : 'color:var(--bad)' }, t(fits ? 'arrange.fits' : 'arrange.noFit', { w: Math.round(door.width * 100) })) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => rotateSel(Math.PI / 2) }, t('arrange.rotate') + ' 90°'),
        h('button', { class: 'btn small', onclick: () => rotateSel(Math.PI / 12) }, '15°'),
        h('button', { class: 'btn small', onclick: dupSel }, t('arrange.dup')),
        h('button', { class: 'btn small', onclick: delSel }, t('arrange.del'))));
  }
  out.push(sec('arrange.add'), h('div', { class: 'catalog' }, ...CATALOG_ORDER.map((type) => h('button', { class: 'cat', 'data-type': type, onclick: () => addItem(type) },
    t('item.' + type), h('small', {}, `${Math.round(CATALOG[type].w * 100)} x ${Math.round(CATALOG[type].d * 100)} cm`)))));
  out.push(h('div', { style: 'margin-top:16px' }, nextBtn('renovate')));
  return out;
}

function addItem(type) {
  pushUndo();
  const it = A.placeNew(S.room, S.items, type, newId);
  S.items.push(it);
  viewer.select(it.id);
  refreshAll();
}

function rotateSel(d) {
  const it = selectedItem();
  if (!it) return;
  pushUndo();
  it.rot = ((it.rot || 0) + d) % (Math.PI * 2);
  A.clampInside(S.room, it);
  refreshAll();
}

function dupSel() {
  const it = selectedItem();
  if (!it) return;
  pushUndo();
  const c = { ...it, id: newId(), x: it.x + 0.3, z: it.z + 0.3, isNew: true };
  A.clampInside(S.room, c);
  S.items.push(c);
  viewer.select(c.id);
  refreshAll();
}

function delSel() {
  const it = selectedItem();
  if (!it) return;
  pushUndo();
  S.items = S.items.filter((x) => x.id !== it.id);
  viewer.select(null);
  refreshAll();
}

// 05 renovate
function panelRenovate() {
  const out = [h('h2', {}, t('reno.title'))];
  out.push(h('div', { class: 'seg', role: 'tablist' }, ...[['templates', 'reno.templates'], ['describe', 'reno.describe'], ['reference', 'reno.reference']].map(([k, key]) => h('button', {
    role: 'tab', 'aria-pressed': S.renoTab === k ? 'true' : 'false', onclick: () => {
      S.renoTab = k;
      renderPanel();
    },
  }, t(key)))));
  out.push(h('label', { class: 'row', style: 'margin:10px 0' }, h('input', { type: 'checkbox', id: 'chkRent', checked: S.rentSafe, onchange: (e) => {
    S.rentSafe = e.target.checked;
    rebuildAfter();
    renderPanel();
    save();
  } }), t('reno.rentSafe')));
  if (S.renoTab === 'templates') {
    out.push(h('div', { class: 'tpls' }, ...TEMPLATES.map((tp) => h('button', {
      class: 'tpl', 'data-tpl': tp.id, 'aria-pressed': S.plan && S.plan.templateId === tp.id ? 'true' : 'false', onclick: () => applyPlan(A.planFromTemplate(tp.id)),
    }, h('span', { class: 'sw' }, h('i', { style: `background:${tp.wall.color}` }), h('i', { style: `background:${tp.floor.color}` }), h('i', { style: `background:${tp.wood}` }), h('i', { style: `background:${tp.accent}` })),
    h('b', {}, t('tpl.' + tp.id)), h('small', {}, tp.cc === 'XX' ? '' : regionName(tp.cc))))));
  } else if (S.renoTab === 'describe') {
    const ta = h('textarea', { id: 'describeBox', placeholder: t('reno.describePh') }, S.plan?.text || '');
    out.push(ta, h('button', { class: 'btn primary', id: 'btnDescribe', onclick: () => applyPlan(A.planFromText(ta.value, S.finish)) }, t('reno.apply')));
  } else {
    out.push(h('p', { class: 'muted' }, t('reno.refHelp')), h('button', { class: 'btn', onclick: () => $('#fileRef').click() }, t('reno.pickRef')));
    if (refPalette) {
      out.push(h('p', {}, t('reno.swatches')), h('div', { class: 'swatches' }, ...refPalette.map((c) => h('i', { style: `background:${c.hex}`, title: c.hex }))),
        h('button', { class: 'btn primary', onclick: () => applyPlan(A.planFromPalette(refPalette, S.finish)) }, t('reno.apply')));
    }
  }
  if (S.plan) {
    out.push(sec('reno.title'));
    if (S.plan.templateId) out.push(h('p', {}, t('reno.matched', { t: t('tpl.' + S.plan.templateId) })));
    out.push(h('div', { class: 'swatches' }, ...[S.plan.wall.color, S.plan.floor.color, S.plan.pal.wood, S.plan.pal.fabric, S.plan.pal.accent].map((c) => h('i', { style: `background:${c}` }))),
      h('p', { class: 'muted' }, t('reno.applied')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', id: 'btnKeep', onclick: keepPlan }, t('reno.keep')),
        h('button', { class: 'btn', onclick: () => {
          S.plan = null;
          rebuildAfter();
          setMode('model');
          renderPanel();
          save();
        } }, t('reno.clear')),
        h('button', { class: 'btn', onclick: () => goStep('cost') }, t('step.cost') + '  >')));
  }
  return out;
}

function applyPlan(plan) {
  S.plan = plan;
  rebuildAfter();
  setMode('split');
  viewer.setCameraPreset('dollhouse');
  renderPanel();
  save();
  toast(t('reno.applied'));
}

function keepPlan() {
  if (!after) return;
  pushUndo();
  S.room = after.room;
  S.finish = after.finish;
  S.items = after.items;
  S.keptPlan = S.rentSafe ? A.rentSafePlan(S.plan) : S.plan;
  S.basePrev = JSON.parse(undo[undo.length - 1]);
  S.plan = null;
  setMode('model');
  refreshAll();
}

// 06 cost & tips
function currentLines() {
  if (S.plan) {
    const plan = S.rentSafe ? A.rentSafePlan(S.plan) : S.plan;
    return A.costLines(S, plan, after);
  }
  if (S.keptPlan && S.basePrev) {
    const base = { ...S, room: S.basePrev.room, finish: S.basePrev.finish, items: S.basePrev.items };
    return A.costLines(base, S.keptPlan, { items: S.items });
  }
  return A.costLines(S, null, null);
}

function panelCost() {
  const out = [h('h2', {}, t('cost.title'))];
  const lines = currentLines();
  if (lastOpt) for (const l of lines) l.on = lastOpt.ids.includes(l.id);
  if (!lines.length) {
    out.push(h('p', { class: 'muted' }, t('cost.none')));
  } else {
    const tot = A.totals(lines);
    out.push(h('table', { class: 'cost', id: 'costTable' },
      h('tbody', {}, ...lines.map((l) => h('tr', { class: l.on ? '' : 'off' },
        h('td', {}, h('input', { type: 'checkbox', checked: l.on, 'aria-label': t(l.key), onchange: (e) => {
          lastOpt = { ids: lines.filter((x) => (x.id === l.id ? e.target.checked : x.on)).map((x) => x.id) };
          renderPanel();
        } })),
        h('td', {}, t(l.key), l.proxy ? h('span', { class: 'tagp', title: SOURCES[l.src] }, t('cost.proxy')) : null,
          h('br'), h('small', { class: 'muted mono' }, `${l.unit === 'm2' ? l.qty.toFixed(1) + ' m²' : l.qty + ' x'} · `,
            h('a', { href: '#', onclick: (e) => {
              e.preventDefault();
              editPrice(l);
            } }, `${fmtMoney(l.unitLow)} – ${fmtMoney(l.unitHigh)}`))),
        h('td', { class: 'amt' }, `${fmtMoney(l.low)}`, h('br'), h('small', { class: 'muted' }, `– ${fmtMoney(l.high)}`))))),
      h('tfoot', {}, h('tr', {}, h('td', {}), h('td', {}, t('cost.total')), h('td', { class: 'amt', id: 'costTotal' }, fmtMoney(tot.low), h('br'), '– ' + fmtMoney(tot.high))))));
    const bud = h('input', { class: 'num', type: 'number', id: 'budgetInput', value: S.budget ?? Math.round((tot.low + tot.high) / 4), 'aria-label': t('cost.budget') });
    out.push(h('div', { class: 'row', style: 'margin:10px 0' }, h('span', {}, t('cost.budget') + ` (${reg().cur})`), h('div', { style: 'width:150px' }, bud),
      h('button', { class: 'btn', id: 'btnOptimise', onclick: () => {
        S.budget = +bud.value;
        const res = A.optimiseBudget(lines, S.budget);
        lastOpt = res;
        renderPanel();
        toast(t('cost.optRes', { n: res.ids.length }));
      } }, t('cost.optimise'))));
    if (lastOpt && lastOpt.impact !== undefined) out.push(h('p', { class: 'muted' }, t('cost.optRes', { n: lastOpt.ids.length })));
    out.push(h('button', { class: 'btn small', onclick: () => downloadCSV(lines) }, t('cost.csv')));
    const r = reg();
    out.push(h('details', { style: 'margin-top:10px' }, h('summary', {}, t('cost.basis')),
      h('p', { class: 'muted', style: 'font-size:13px' }, t('cost.basisText', { country: regionName(S.region), plr: r.plr.toFixed(2), rate: r.rate.toLocaleString(), cur: r.cur, date: RATES_DATE })),
      r.plrAssumed ? h('p', { class: 'muted', style: 'font-size:13px' }, t('cost.assumedPlr')) : null,
      h('ul', { class: 'muted', style: 'font-size:12px;padding-left:18px' }, ...Object.values(SOURCES).map((s) => h('li', {}, s)))),
    h('p', { class: 'muted', style: 'font-size:13px' }, t('cost.note')));
  }
  // architect notes
  out.push(h('h2', { style: 'margin-top:24px' }, t('tips.title')));
  out.push(sec('tips.layout'), notesList(notes.list.filter((n) => n.sev !== 'lens')));
  out.push(sec('tips.lens'), h('div', { class: 'seg' }, ...['none', 'fengshui', 'vastu'].map((l) => h('button', { 'aria-pressed': S.lens === l ? 'true' : 'false', onclick: () => {
    S.lens = l;
    save();
    scheduleAnalyse();
  } }, t('lens.' + l)))));
  if (S.lens !== 'none') out.push(h('p', { class: 'muted', style: 'font-size:13px' }, t('tips.lensNote')), notesList(notes.list.filter((n) => n.sev === 'lens')));
  out.push(sec('tips.region'), simpleList(A.regionTips(S)));
  out.push(sec('tips.design'), simpleList(A.DESIGN_TIPS));
  out.push(sec('tips.money'), simpleList(A.MONEY_TIPS));
  out.push(sec('share.title'), h('div', { class: 'row' },
    h('button', { class: 'btn', id: 'btnShare', onclick: shareLink }, t('share.link')),
    h('button', { class: 'btn', onclick: savePNG }, t('share.png')),
    h('button', { class: 'btn', onclick: saveGLB }, t('share.glb'))));
  return out;
}

// price range of one sourced catalogue price, in local currency (respects user overrides)
function priceRange(key) {
  const p = PRICES[key];
  if (!p) return '';
  const ov = S.priceOverride?.[key];
  const low = ov ? ov.low : A.money(p.low, reg());
  const high = ov ? ov.high : A.money(p.high, reg());
  return `${fmtMoney(low)} – ${fmtMoney(high)}`;
}

function runFix(fix) {
  if (fix.kind === 'arrange') {
    const prev = snap();
    const before = A.layoutScore(S);
    const res = A.autoArrange(S, (Date.now() & 0xffff) + 3);
    pushUndo(prev);
    S.items = res.items;
    lastAuto = { a: before, b: A.layoutScore(S) };
    refreshAll();
    toast(t('arrange.autoRes', lastAuto));
    return;
  }
  if (fix.kind === 'add') {
    addItem(fix.type);
    return;
  }
  pushUndo();
  A.applyFix(S, fix);
  refreshAll();
}

function notesList(list) {
  return h('ul', { class: 'notes', id: 'notesList' }, ...list.map((n) => {
    const adds = n.fix && n.fix.kind === 'add';
    const label = adds ? t('tips.addIt', { a: { t: 'item.' + n.fix.type } }) : t('tips.fix');
    const costText = n.fix ? (adds && n.cost ? priceRange(n.cost) : t('tips.free')) : null;
    return h('li', { class: n.sev },
      t(n.key, n.p),
      n.fix ? h('div', { class: 'fixrow' },
        h('button', { class: 'btn small', onclick: () => runFix(n.fix) }, label),
        h('span', { class: 'fixcost' }, costText)) : null,
      !n.fix && n.cost ? h('div', { class: 'fixrow' }, h('span', { class: 'fixcost' }, t('tips.typical', { cost: priceRange(n.cost) }))) : null);
  }));
}

function simpleList(keys) {
  return h('ul', { class: 'notes' }, ...keys.map((k) => h('li', {}, t(k))));
}

function editPrice(l) {
  const v = prompt(`${t(l.key)} (${reg().cur}/${l.unit === 'm2' ? 'm²' : 'x'}) low, high`, `${Math.round(l.unitLow)}, ${Math.round(l.unitHigh)}`);
  if (!v) return;
  const [lo, hi] = v.split(/[,;\s]+/).map(Number);
  if (!(lo >= 0) || !(hi >= lo)) return;
  S.priceOverride[l.priceKey] = { low: lo, high: hi };
  save();
  renderPanel();
}

function downloadCSV(lines) {
  const rows = [['item', 'qty', 'unit', 'low', 'high', 'currency', 'source']];
  for (const l of lines.filter((x) => x.on)) rows.push([t(l.key), l.unit === 'm2' ? l.qty.toFixed(1) : l.qty, l.unit, Math.round(l.low), Math.round(l.high), reg().cur, (l.proxy ? 'proxy: ' : '') + (SOURCES[l.src] || l.src)]);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  download(new Blob(['\ufeff' + csv], { type: 'text/csv' }), 'ruang-shopping-list.csv');
}

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

async function shareLink() {
  const code = await encodeShare();
  const url = location.origin + location.pathname + '#r=' + code;
  try {
    await navigator.clipboard.writeText(url);
  } catch { /* clipboard blocked */ }
  history.replaceState(null, '', '#r=' + code);
  toast(t('share.copied'));
}

function savePNG() {
  fetch(viewer.snapshot()).then((r) => r.blob()).then((b) => download(b, 'ruang-room.png'));
}

async function saveGLB() {
  const { GLTFExporter } = await import('three/addons/GLTFExporter.js');
  const THREE = await import('three');
  const g = new THREE.Group();
  g.add(viewer.roomGroup.clone(), viewer.itemsGroup.clone());
  new GLTFExporter().parse(g, (res) => download(new Blob([res], { type: 'model/gltf-binary' }), 'ruang-room.glb'), (err) => toast(String(err)), { binary: true });
}

// ---------- photo editor ----------
const ed = { scale: 1, ox: 0, oy: 0, drag: null };

function drawPhoto() {
  const cv = $('#photoCanvas');
  const ph = photos[activePhoto];
  if (!ph || $('#photoEd').hidden) return;
  const box = $('#photoEd').getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const sc = Math.min((box.width - 24) / ph.w, (box.height - 24) / ph.h);
  cv.style.width = Math.round(ph.w * sc) + 'px';
  cv.style.height = Math.round(ph.h * sc) + 'px';
  cv.width = Math.round(ph.w * sc * dpr);
  cv.height = Math.round(ph.h * sc * dpr);
  ed.scale = sc * dpr;
  const g = cv.getContext('2d');
  g.setTransform(ed.scale, 0, 0, ed.scale, 0, 0);
  g.drawImage(ph.canvas, 0, 0);
  const r = ph.rect;
  const lw = 1.5 / ed.scale;
  // shade the side planes lightly so the 5 surfaces read
  const cx = ph.w / 2;
  const cy = ph.h / 2;
  const ray = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const tx = dx > 0 ? (ph.w - cx) / dx : dx < 0 ? -cx / dx : Infinity;
    const ty = dy > 0 ? (ph.h - cy) / dy : dy < 0 ? -cy / dy : Infinity;
    const k = Math.min(tx, ty);
    return [cx + dx * k, cy + dy * k];
  };
  const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.setLineDash([6 / ed.scale, 5 / ed.scale]);
  g.lineWidth = lw;
  for (const [x, y] of corners) {
    const [ex, ey] = ray(x, y);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = '#e0814f';
  g.lineWidth = 2.5 / ed.scale;
  g.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  if (photoTool === 'wall') {
    for (const [x, y] of corners) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, 10 / ed.scale, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#a84b25';
      g.lineWidth = 3 / ed.scale;
      g.stroke();
    }
  }
  // markers
  g.font = `${13 / ed.scale}px ui-monospace, Consolas, monospace`;
  for (const m of ph.markers) {
    g.fillStyle = m.type ? '#a84b25' : '#285a86';
    g.beginPath();
    g.arc(m.u, m.v, 7 / ed.scale, 0, Math.PI * 2);
    g.fill();
    const label = m.type ? t('item.' + m.type) : t(m.kind === 'door' ? 'photos.door' : 'photos.window');
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(20,22,24,0.8)';
    g.fillRect(m.u + 10 / ed.scale, m.v - 10 / ed.scale, tw + 8 / ed.scale, 18 / ed.scale);
    g.fillStyle = '#fff';
    g.fillText(label, m.u + 14 / ed.scale, m.v + 3 / ed.scale);
  }
}

function edPoint(e) {
  const cv = $('#photoCanvas');
  const b = cv.getBoundingClientRect();
  const k = cv.width / b.width / ed.scale;
  return { u: (e.clientX - b.left) * k, v: (e.clientY - b.top) * k, sx: e.clientX - $('#photoEd').getBoundingClientRect().left, sy: e.clientY - $('#photoEd').getBoundingClientRect().top };
}

function installPhotoEditor() {
  const cv = $('#photoCanvas');
  cv.addEventListener('pointerdown', (e) => {
    const ph = photos[activePhoto];
    if (!ph) return;
    const p = edPoint(e);
    const r = ph.rect;
    const tol = 22 / ed.scale * Math.min(2, window.devicePixelRatio || 1);
    if (photoTool === 'wall') {
      const cs = [['x0', 'y0'], ['x1', 'y0'], ['x1', 'y1'], ['x0', 'y1']];
      for (const [kx, ky] of cs) {
        if (Math.hypot(p.u - r[kx], p.v - r[ky]) < tol) {
          ed.drag = { kx, ky };
          cv.setPointerCapture(e.pointerId);
          return;
        }
      }
      if (p.u > r.x0 && p.u < r.x1 && p.v > r.y0 && p.v < r.y1) {
        ed.drag = { move: true, u: p.u, v: p.v };
        cv.setPointerCapture(e.pointerId);
      }
      return;
    }
    const hit = ph.markers.findIndex((m) => Math.hypot(m.u - p.u, m.v - p.v) < tol);
    if (hit >= 0) {
      ph.markers.splice(hit, 1);
      drawPhoto();
      renderPanel();
      return;
    }
    const room = { ...S.room };
    if (photoTool === 'mark') {
      if (!P.photoFloorPoint(ph, roomForPhoto(), p.u, p.v)) {
        toast(t('photos.notFloor'));
        return;
      }
      showPick(p, ['bed', 'singleBed', 'sofa', 'armchair', 'desk', 'officeChair', 'chair', 'wardrobe', 'bookshelf', 'dresser', 'nightstand', 'tvStand', 'diningTable', 'coffeeTable', 'plant', 'floorLamp', 'rug'].map((ty) => [t('item.' + ty), () => {
        ph.markers.push({ u: p.u, v: p.v, type: ty });
      }]));
    } else {
      if (!P.photoWallPoint(ph, roomForPhoto(), p.u, p.v)) {
        toast(t('photos.notWall'));
        return;
      }
      showPick(p, [[t('photos.window'), () => ph.markers.push({ u: p.u, v: p.v, kind: 'window' })], [t('photos.door'), () => ph.markers.push({ u: p.u, v: p.v, kind: 'door' })]]);
    }
    void room;
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ed.drag) return;
    const ph = photos[activePhoto];
    const p = edPoint(e);
    const r = ph.rect;
    const minS = 30;
    if (ed.drag.move) {
      const du = p.u - ed.drag.u;
      const dv = p.v - ed.drag.v;
      r.x0 += du;
      r.x1 += du;
      r.y0 += dv;
      r.y1 += dv;
      ed.drag.u = p.u;
      ed.drag.v = p.v;
    } else {
      const { kx, ky } = ed.drag;
      r[kx] = Math.max(0, Math.min(ph.w, p.u));
      r[ky] = Math.max(0, Math.min(ph.h, p.v));
      if (r.x1 - r.x0 < minS) r[kx] = kx === 'x0' ? r.x1 - minS : r.x0 + minS;
      if (r.y1 - r.y0 < minS) r[ky] = ky === 'y0' ? r.y1 - minS : r.y0 + minS;
    }
    drawPhoto();
  });
  const end = () => {
    ed.drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  window.addEventListener('resize', drawPhoto);
}

function showPick(p, options) {
  const pop = $('#pickPop');
  pop.replaceChildren(...options.map(([label, fn]) => h('button', { class: 'chip', onclick: () => {
    fn();
    pop.hidden = true;
    drawPhoto();
    renderPanel();
  } }, label)), h('button', { class: 'chip', onclick: () => { pop.hidden = true; } }, 'x'));
  pop.hidden = false;
  const box = $('#photoEd').getBoundingClientRect();
  pop.style.left = Math.min(box.width - 300, Math.max(8, p.sx + 12)) + 'px';
  pop.style.top = Math.min(box.height - 160, Math.max(8, p.sy + 12)) + 'px';
}

function roomForPhoto() {
  // room size implied by the current photos, used to map taps before "Build"
  const r = { ...S.room };
  const dims = photos.map((ph) => P.suggestDims(ph, r.h));
  const ws = dims.filter((d) => d.along === 'w').map((d) => d.length);
  const ds = dims.filter((d) => d.along === 'd').map((d) => d.length);
  r.w = ws.length ? ws.reduce((a, b) => a + b) / ws.length : r.w;
  r.d = ds.length ? ds.reduce((a, b) => a + b) / ds.length : dims[0] ? dims[0].depth : r.d;
  return r;
}

async function addPhotos(files) {
  for (const f of files) {
    const ph = await P.preparePhoto(f);
    ph.rect = P.defaultRect(ph.w, ph.h);
    ph.wall = P.WALLS[photos.length % 4];
    ph.markers = [];
    photos.push(ph);
  }
  activePhoto = photos.length - 1;
  photoTool = 'wall';
  goStep('photos');
}

async function loadSample() {
  const meta = await (await fetch('assets/sample-room.json')).json();
  const ph = await P.preparePhoto('assets/sample-room.jpg');
  const k = ph.w / meta.w;
  ph.rect = { x0: meta.rect.x0 * k, y0: meta.rect.y0 * k, x1: meta.rect.x1 * k, y1: meta.rect.y1 * k };
  ph.wall = 'N';
  ph.markers = meta.markers.map((m) => ({ ...m, u: m.u * k, v: m.v * k }));
  ph.sample = true;
  photos = [ph];
  activePhoto = 0;
  photoTool = 'wall';
  S.room.h = meta.roomH;
  goStep('photos');
}

function buildFromPhotos() {
  if (!photos.length) return;
  pushUndo();
  const room = roomForPhoto();
  room.w = Math.round(room.w * 20) / 20;
  room.d = Math.round(room.d * 20) / 20;
  const main = photos[0];
  const col = P.sampleColors(main, room.h);
  if (col.wall) S.finish.wall.color = col.wall;
  if (col.floor) {
    S.finish.floor.color = col.floor;
    S.finish.floor.type = saturation(col.floor) < 0.15 ? (luminance(col.floor) > 0.35 ? 'tile' : 'concrete') : 'laminate';
  }
  if (col.ceiling) S.finish.ceiling = col.ceiling;
  const items = [];
  const doors = [];
  const windows = [];
  for (const ph of photos) {
    for (const m of ph.markers) {
      if (m.type) {
        const fp = P.photoFloorPoint(ph, room, m.u, m.v);
        if (!fp) continue;
        const c = CATALOG[m.type];
        const it = { id: newId(), type: m.type, w: c.w, d: c.d, h: c.h, x: fp.x, z: fp.z, rot: 0 };
        if (m.wpx) {
          const mpp = P.metresPerPixel(ph, room, m.u, m.v);
          it.w = Math.min(c.w * 1.6, Math.max(c.w * 0.5, m.wpx * mpp));
        }
        // the base point is the front edge seen by the camera: push the item back by half its depth
        const facing = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[ph.wall];
        it.x += facing[0] * it.d / 2;
        it.z += facing[1] * it.d / 2;
        it.rot = Math.atan2(-facing[0], -facing[1]);
        const nearWall = Math.min(room.w / 2 - Math.abs(it.x), room.d / 2 - Math.abs(it.z));
        if (c.wall && nearWall < 0.6) A.snapToNearestWall(room, it);
        A.clampInside(room, it);
        items.push(it);
      } else {
        const wp = P.photoWallPoint(ph, room, m.u, m.v);
        if (!wp) continue;
        if (m.kind === 'door') doors.push({ wall: wp.wall, offset: Math.max(0, wp.offset - 0.45), width: 0.9, height: 2.05 });
        else windows.push({ wall: wp.wall, offset: Math.max(0, wp.offset - 0.6), width: 1.2, sill: 0.9, height: 1.3 });
      }
    }
  }
  S.room = { ...S.room, w: room.w, d: room.d, h: room.h, doors: doors.length ? doors : S.room.doors, windows: windows.length ? windows : S.room.windows };
  if (items.length) S.items = items;
  for (const it of S.items) A.clampInside(S.room, it);
  const sd = P.suggestDims(main, room.h);
  S.photoInfo = { w: sd.length, camH: sd.camH };
  const shell = P.buildPhotoMesh(photos[activePhoto], S.room);
  viewer.setPhotoShell(shell.mesh, shell.pose);
  refreshAll();
  goStep('room');
  setMode('photo');
  toast(t('room.fromPhoto', { w: fmtLen(sd.length), c: fmtLen(sd.camH) }));
}

async function runAI() {
  const ph = photos[activePhoto];
  if (!ph) return;
  try {
    aiState = 'loading';
    renderPanel();
    const dets = await P.aiDetect(ph, (s) => {
      aiState = s;
      renderPanel();
    });
    for (const d of dets) {
      const u = (d.box.xmin + d.box.xmax) / 2;
      const v = d.box.ymax - 4;
      if (P.photoFloorPoint(ph, roomForPhoto(), u, v)) ph.markers.push({ u, v, type: d.type, wpx: d.box.xmax - d.box.xmin, ai: true });
    }
    aiState = 'done';
  } catch (err) {
    console.warn('AI detect failed', err);
    aiState = 'fail';
  }
  renderPanel();
  drawPhoto();
}

// ---------- onboarding ----------
function openOnboard(first) {
  const dlg = $('#onboard');
  const selR = $('#selRegion');
  const selL = $('#selLang');
  selR.replaceChildren(...Object.keys(REGIONS).sort((a, b) => regionName(a).localeCompare(regionName(b))).map((c) => h('option', { value: c, selected: S.region === c }, `${regionName(c)} · ${REGIONS[c].cur}`)));
  selL.replaceChildren(...LANGS.map(([c, n]) => h('option', { value: c, selected: getLang() === c }, n)));
  selR.onchange = () => {
    const r = REGIONS[selR.value];
    if (first && r.lang) {
      selL.value = r.lang;
      setLang(r.lang);
      renderChrome();
    }
  };
  selL.onchange = () => {
    setLang(selL.value);
    renderChrome();
  };
  $('#onboardForm').onsubmit = () => {
    const changed = S.region !== selR.value;
    S.region = selR.value;
    S.lang = selL.value;
    if (changed || first) S.lens = REGIONS[S.region].lens;
    setLang(S.lang);
    save();
    refreshAll();
  };
  dlg.showModal();
}

// ---------- keyboard ----------
function installKeys() {
  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
    } else if (S.mode !== 'walk' && e.key.toLowerCase() === 'r') {
      rotateSel(e.shiftKey ? Math.PI / 12 : Math.PI / 2);
    } else if (S.mode !== 'walk' && (e.key === 'Delete' || e.key === 'Backspace')) {
      delSel();
    }
  });
}

function positionSplit() {
  const hdl = $('#splitHandle');
  hdl.style.left = (viewer.split * 100) + '%';
}

function installSplit() {
  const hdl = $('#splitHandle');
  let dragging = false;
  hdl.addEventListener('pointerdown', (e) => {
    dragging = true;
    hdl.setPointerCapture(e.pointerId);
  });
  hdl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const b = $('.stage').getBoundingClientRect();
    viewer.split = Math.min(0.95, Math.max(0.05, (e.clientX - b.left) / b.width));
    viewer.invalidate();
    positionSplit();
  });
  hdl.addEventListener('pointerup', () => { dragging = false; });
  const fwd = $('#walkFwd');
  fwd.addEventListener('pointerdown', () => { viewer.walk.fwd = 1; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => fwd.addEventListener(ev, () => { viewer.walk.fwd = 0; }));
}

// ---------- boot ----------
async function boot() {
  let loaded = null;
  let fromLink = false;
  if (location.hash.startsWith('#r=')) {
    try {
      loaded = await decodeShare(location.hash.slice(3));
      fromLink = true;
    } catch (err) {
      console.warn('bad share link', err);
    }
  }
  const stored = load();
  const lang0 = (loaded && loaded.lang) || (stored && stored.lang) || guessLang();
  const region0 = (loaded && loaded.region) || (stored && stored.region) || 'ID';
  S = { ...defaultState(region0, lang0), ...(stored || {}), ...(loaded || {}) };
  if (fromLink) S.step = 'look';
  if (S.step === 'photos' && !photos.length && stored && stored.photoInfo) S.step = 'room';
  setLang(S.lang);
  viewer = new Viewer($('#view'), {
    formatLength: fmtLen,
    eyeHeight: () => S.eye,
    onSelect: () => {
      if (S.step !== 'arrange' && S.mode === 'model' && viewer.selected) goStep('arrange');
      else renderPanel();
    },
    onDrag: (it) => {
      const real = S.items.find((x) => x.id === it.id);
      real.x = it.x;
      real.z = it.z;
      const bad = S.items.filter((o) => o.id !== it.id && !CATALOG[o.type].flat && !CATALOG[it.type].flat && overlapDepth(o, real) > 0.03).map((o) => o.id);
      if (outOfRoom(real, S.room) > 0.03 || bad.length) bad.push(it.id);
      viewer.setInvalid(bad);
    },
    onDragEnd: (id, start) => {
      const prev = JSON.parse(snap());
      const pi = prev.items.find((x) => x.id === id);
      pi.x = start.x;
      pi.z = start.z;
      pushUndo(JSON.stringify(prev));
      save();
      scheduleAnalyse();
      renderViewbar();
      const el = $('#layoutScore');
      if (el) el.textContent = String(A.layoutScore(S));
    },
  });
  viewer.setStyle(S.style);
  rebuild3D();
  viewer.setCameraPreset('dollhouse');
  if (S.mode !== 'model' && !(S.mode === 'split' && S.plan)) S.mode = 'model';
  setMode(S.mode);
  installPhotoEditor();
  installKeys();
  installSplit();
  $('#filePhotos').addEventListener('change', (e) => {
    addPhotos([...e.target.files]);
    e.target.value = '';
  });
  $('#fileRef').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const ph = await P.preparePhoto(f);
    refPalette = P.imagePalette(ph, 5);
    e.target.value = '';
    renderPanel();
  });
  $('#btnRegion').addEventListener('click', () => openOnboard(false));
  $('#btnNew').addEventListener('click', () => {
    if (!confirm(t('common.new') + '?')) return;
    const keep = { region: S.region, lang: S.lang };
    S = { ...defaultState(keep.region, keep.lang) };
    photos = [];
    undo = [];
    redo = [];
    lastAuto = null;
    lastOpt = null;
    history.replaceState(null, '', location.pathname);
    viewer.setPhotoShell(null, null);
    viewer.photoPose = null;
    refreshAll();
    goStep('photos');
  });
  renderChrome();
  goStep(S.step);
  scheduleAnalyse();
  if (!stored && !fromLink) openOnboard(true);
  window.__ruang = { get S() { return S; }, viewer, A, P, photos: () => photos, setStyle, goStep, setMode, buildFromPhotos, loadSample, applyPlan, keepPlan, encodeShare, decodeShare, currentLines, runAnalyse, notes: () => notes };
  document.body.dataset.ready = '1';
}

boot();
export { kelvinToHex, PRICES };

// The "architect": layout checks, culture lenses, climate + design + money tips, auto-arrange,
// renovation plans (template / words / reference photo), cost lines and the budget optimiser.
import { CATALOG, TEMPLATES, DESCRIBE_MODIFIERS, COLOR_WORDS, PRICES, FLOOR_PRICE_KEY, WALL_PRICE_KEY, IMPACT, REGIONS } from './data.js';
import { overlapDepth, outOfRoom, flowGrid, accessPoint, reachableAt, wallPoint, knapsack, mix, luminance, saturation, hexToRgb, footprint } from './geom.js';

const isSolid = (it) => !CATALOG[it.type]?.flat;

// ---------- door / window geometry ----------
function openingCenter(room, o) {
  const p = wallPoint(room, o.wall, o.offset + o.width / 2);
  return p;
}

function inDoorSwing(room, door, it) {
  const hinge = wallPoint(room, door.wall, door.offset);
  const r = door.width;
  // sample the item's footprint corners + centre: inside quarter disc in front of the door?
  const pts = [...footprint(it), { x: it.x, z: it.z }];
  return pts.some((p) => {
    const dx = p.x - hinge.x;
    const dz = p.z - hinge.z;
    const into = dx * hinge.nx + dz * hinge.nz; // distance into the room
    return into > 0 && Math.hypot(dx, dz) < r && into < r;
  }) && (() => {
    // and along the wall within the door span
    const c = openingCenter(room, door);
    return Math.hypot(it.x - c.x, it.z - c.z) < r + Math.max(it.w, it.d) / 2;
  })();
}

function blocksWindow(room, win, it) {
  if (it.h < 1.0 || !isSolid(it)) return false;
  const c = openingCenter(room, win);
  const dist = Math.abs((it.x - c.x) * c.nx + (it.z - c.z) * c.nz) - it.d / 2;
  const along = Math.abs((it.x - c.x) * -c.nz + (it.z - c.z) * c.nx);
  return dist < 0.4 && along < win.width / 2 + Math.max(it.w, it.d) / 2 - 0.1 && it.h > (win.sill || 0.9) + 0.1;
}

function distBackToWall(room, it) {
  // back of the item is local -z
  const c = Math.cos(it.rot || 0);
  const s = Math.sin(it.rot || 0);
  const bx = it.x + -it.d / 2 * s;
  const bz = it.z + -it.d / 2 * c;
  return Math.min(room.w / 2 - Math.abs(bx), room.d / 2 - Math.abs(bz));
}

function facingVector(it) {
  // front (+z local) in room frame
  return { x: Math.sin(it.rot || 0), z: Math.cos(it.rot || 0) };
}

// compass bearing (deg) of a room-frame direction, given the bearing the back wall (-z) faces
function bearing(dir, northDeg) {
  const a = Math.atan2(dir.x, -dir.z) * 180 / Math.PI; // clockwise from -z
  return ((northDeg + a) % 360 + 360) % 360;
}

// ---------- path bottleneck from the door to a point ----------
function bottleneck(grid, room, door, target) {
  const { nx, nz, cell, blocked, clear } = grid;
  const toCell = (x, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x + room.w / 2) / cell)));
    const k = Math.min(nz - 1, Math.max(0, Math.floor((z + room.d / 2) / cell)));
    return k * nx + i;
  };
  const p = wallPoint(room, door.wall, door.offset + door.width / 2);
  const start = toCell(p.x + p.nx * 0.35, p.z + p.nz * 0.35);
  const goal = toCell(target.x, target.z);
  // widest-path search (maximise the minimum clearance along the path)
  const best = new Float32Array(nx * nz).fill(-1);
  best[start] = clear[start];
  const heap = [[clear[start], start]];
  while (heap.length) {
    heap.sort((a, b) => b[0] - a[0]);
    const [w, c] = heap.shift();
    if (c === goal) return w * 2;
    if (w < best[c]) continue;
    const i = c % nx;
    const k = (c - i) / nx;
    for (const [a, b] of [[i + 1, k], [i - 1, k], [i, k + 1], [i, k - 1]]) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (blocked[n] && n !== goal) continue;
      const nw = Math.min(w, clear[n] > 0 ? clear[n] : w);
      if (nw > best[n]) {
        best[n] = nw;
        heap.push([nw, n]);
      }
    }
    if (heap.length > 4000) heap.length = 4000;
  }
  return 0;
}

// ---------- checks ----------
// Returns [{ sev: 'bad'|'warn'|'good'|'info', key, p: {params}, fix?: { kind, id } }]
export function analyse(state, extra = {}) {
  const { room, items } = state;
  const reg = REGIONS[state.region] || REGIONS.US;
  const out = [];
  const name = (it) => ({ t: 'item.' + it.type });
  const solids = items.filter(isSolid);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const d = overlapDepth(solids[i], solids[j]);
      if (d > 0.03) out.push({ sev: 'bad', key: 'chk.overlap', p: { a: name(solids[i]), b: name(solids[j]) }, fix: { kind: 'separate', id: solids[j].id, other: solids[i].id }, ids: [solids[i].id, solids[j].id] });
    }
  }
  for (const it of items) {
    if (outOfRoom(it, room) > 0.03) out.push({ sev: 'bad', key: 'chk.outside', p: { a: name(it) }, fix: { kind: 'clamp', id: it.id }, ids: [it.id] });
  }
  const door = room.doors[0];
  const grid = door ? flowGrid(room, items.map((it) => ({ ...it, flat: CATALOG[it.type]?.flat })), door, 0.1) : null;
  if (door && grid) {
    for (const it of items) {
      const sides = CATALOG[it.type]?.access;
      if (!sides) continue;
      const pts = sides.map((s) => accessPoint(it, s, 0.4));
      const ok = pts.filter((p) => Math.abs(p.x) < room.w / 2 && Math.abs(p.z) < room.d / 2 && reachableAt(grid, room, p, 0.2));
      if (!ok.length) {
        out.push({ sev: 'bad', key: 'chk.blocked', p: { a: name(it) }, fix: { kind: 'arrange' }, ids: [it.id] });
      } else {
        const w = Math.max(...ok.map((p) => bottleneck(grid, room, door, p)));
        if (w > 0 && w < 0.6) out.push({ sev: 'warn', key: 'chk.narrow', p: { a: name(it), cm: Math.round(w * 100) }, fix: { kind: 'arrange' }, ids: [it.id] });
      }
    }
    for (const it of solids) {
      if (inDoorSwing(room, door, it)) out.push({ sev: 'bad', key: 'chk.door', p: { a: name(it) }, fix: { kind: 'clearDoor', id: it.id }, ids: [it.id] });
    }
  }
  room.windows.forEach((win, wi) => {
    for (const it of items) {
      if (blocksWindow(room, win, it)) out.push({ sev: 'warn', key: 'chk.window', p: { a: name(it) }, fix: { kind: 'clearWindow', id: it.id, win: wi }, ids: [it.id] });
    }
  });
  // bed against a wall
  for (const it of items.filter((x) => x.type === 'bed' || x.type === 'singleBed')) {
    if (distBackToWall(room, it) > 0.2) out.push({ sev: 'warn', key: 'chk.bedwall', p: {}, fix: { kind: 'toWall', id: it.id }, ids: [it.id] });
  }
  // desk vs window light
  const desk = items.find((x) => x.type === 'desk');
  if (desk && room.windows.length) {
    const f = facingVector(desk); // where the user's back is (+z local) ; they look toward -z
    const look = { x: -f.x, z: -f.z };
    const wins = room.windows.map((wi, i) => ({ ...openingCenter(room, wi), i }));
    const w = wins.sort((a, b) => Math.hypot(a.x - desk.x, a.z - desk.z) - Math.hypot(b.x - desk.x, b.z - desk.z))[0];
    const to = { x: w.x - desk.x, z: w.z - desk.z };
    const len = Math.hypot(to.x, to.z) || 1;
    const cos = (to.x * look.x + to.z * look.z) / len;
    const turn = { kind: 'turnDesk', id: desk.id, win: w.i };
    if (cos > 0.7) out.push({ sev: 'warn', key: 'chk.deskFacing', p: {}, fix: turn, ids: [desk.id] });
    else if (cos < -0.7) out.push({ sev: 'warn', key: 'chk.deskGlare', p: {}, fix: turn, ids: [desk.id] });
    else out.push({ sev: 'good', key: 'chk.deskSide', p: {}, ids: [desk.id] });
  }
  // TV distance
  const tv = items.find((x) => x.type === 'tvStand');
  const seat = items.find((x) => x.type === 'sofa') || items.find((x) => x.type === 'bed');
  if (tv && seat) {
    const diag = Math.min(1.25, tv.w - 0.1) / 0.87; // 16:9 width -> diagonal
    const dist = Math.hypot(tv.x - seat.x, tv.z - seat.z);
    const lo = 1.2 * diag;
    const hi = 1.63 * diag;
    const inch = Math.round(diag / 0.0254);
    if (dist < lo - 0.15 || dist > hi + 0.6) out.push({ sev: 'warn', key: 'chk.tv', p: { m: dist.toFixed(1), lo: lo.toFixed(1), hi: hi.toFixed(1), inch }, ids: [tv.id] });
    else out.push({ sev: 'good', key: 'chk.tvOk', p: { m: dist.toFixed(1), inch }, ids: [tv.id] });
  }
  // crowding
  const used = solids.reduce((s, it) => s + it.w * it.d, 0);
  const ratio = used / (room.w * room.d);
  if (ratio > 0.45) out.push({ sev: 'warn', key: 'chk.crowded', p: { pct: Math.round(ratio * 100) } });
  else out.push({ sev: 'good', key: 'chk.freeFloor', p: { pct: Math.round((1 - ratio) * 100) } });
  // lighting layers
  if (!items.some((x) => CATALOG[x.type]?.light || x.type === 'nightstand')) out.push({ sev: 'info', key: 'tip.layers', p: {}, fix: { kind: 'add', type: 'floorLamp' }, cost: 'floorLamp' });
  // rug
  const rug = items.find((x) => x.type === 'rug');
  if (rug) {
    const seats = items.filter((x) => ['sofa', 'bed', 'armchair', 'diningTable'].includes(x.type));
    if (seats.length && !seats.some((s2) => overlapDepth(rug, s2) > 0.1)) out.push({ sev: 'info', key: 'tip.rug', p: {}, ids: [rug.id] });
  }
  // earthquake anchoring
  if (reg.quake) {
    for (const it of items.filter((x) => CATALOG[x.type]?.tall)) out.push({ sev: 'warn', key: 'tip.anchor', p: { a: name(it) }, ids: [it.id] });
  }
  // sun on desk / bed
  if (extra.sun) {
    for (const it of items.filter((x) => x.type === 'desk' || x.type === 'bed' || x.type === 'singleBed' || x.type === 'tvStand')) {
      const s = extra.sun[it.id];
      if (!s) continue;
      if (s.hours >= 0.5) out.push({ sev: it.type === 'bed' ? 'info' : 'warn', key: it.type === 'bed' ? 'chk.sunBed' : 'chk.sunGlare', p: { a: name(it), h: s.hours, from: fmtH(s.from), to: fmtH(s.to + 0.5) }, cost: 'curtains', ids: [it.id] });
    }
  }
  // culture lens
  const lens = state.lens || 'none';
  if (lens === 'fengshui') out.push(...fengShui(state));
  if (lens === 'vastu') out.push(...vastu(state));
  return { list: out, grid };
}

function fmtH(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function fengShui(state) {
  const { room, items } = state;
  const out = [];
  const door = room.doors[0];
  const bed = items.find((x) => x.type === 'bed' || x.type === 'singleBed');
  if (bed && door) {
    const dc = openingCenter(room, door);
    const f = facingVector(bed);
    const to = { x: dc.x - bed.x, z: dc.z - bed.z };
    const len = Math.hypot(to.x, to.z) || 1;
    if ((to.x * f.x + to.z * f.z) / len > 0.93) out.push({ sev: 'lens', key: 'fs.coffin', p: {}, ids: [bed.id] });
    // headboard under a window
    for (const w of room.windows) {
      const wc = openingCenter(room, w);
      const back = { x: bed.x - f.x * bed.d / 2, z: bed.z - f.z * bed.d / 2 };
      if (Math.hypot(back.x - wc.x, back.z - wc.z) < w.width / 2 + 0.3) out.push({ sev: 'lens', key: 'fs.window', p: {}, ids: [bed.id] });
    }
    // can see the door from bed?
    out.push({ sev: 'lens', key: 'fs.command', p: {} });
  }
  const mirror = items.find((x) => x.type === 'mirror');
  if (mirror && bed) {
    const f = facingVector(mirror);
    const to = { x: bed.x - mirror.x, z: bed.z - mirror.z };
    const len = Math.hypot(to.x, to.z) || 1;
    if ((to.x * f.x + to.z * f.z) / len > 0.8) out.push({ sev: 'lens', key: 'fs.mirror', p: {}, ids: [mirror.id] });
  }
  return out;
}

function vastu(state) {
  const { items } = state;
  const out = [];
  const bed = items.find((x) => x.type === 'bed' || x.type === 'singleBed');
  if (bed) {
    const f = facingVector(bed);
    const head = { x: -f.x, z: -f.z };
    const b = bearing(head, state.northDeg || 0);
    const dir = ['N', 'E', 'S', 'W'][Math.round(b / 90) % 4];
    out.push({ sev: 'lens', key: dir === 'S' || dir === 'E' ? 'vastu.ok' : 'vastu.head', p: { dir: { t: 'dir.' + dir } }, ids: [bed.id] });
  }
  return out;
}

// Region / climate / design / money tips (keys only; text in i18n).
export function regionTips(state) {
  const reg = REGIONS[state.region] || REGIONS.US;
  const tips = [];
  const c = reg.climate;
  if (c === 'tropical' || c === 'subtropical') tips.push('rt.mould', 'rt.cross', 'rt.fan', 'rt.westsun');
  if (c === 'tropical') tips.push('rt.floorHumid');
  if (c === 'cold') tips.push('rt.insulate', 'rt.warmLight', reg.lat > 0 ? 'rt.southLight' : 'rt.northLight');
  if (c === 'temperate') tips.push('rt.layersSeason', reg.lat > 0 ? 'rt.southLight' : 'rt.northLight');
  if (c === 'hot') tips.push('rt.shade', 'rt.tileCool');
  if (reg.quake) tips.push('rt.quake');
  return tips;
}

export const DESIGN_TIPS = ['dt.6030', 'dt.curtains', 'dt.mirror', 'dt.vertical', 'dt.repeat', 'dt.scale', 'dt.paths'];
export const MONEY_TIPS = ['mt.paintLight', 'mt.waste', 'mt.quotes', 'mt.secondhand', 'mt.phase'];

// ---------- quick fixes ----------
export function applyFix(state, fix) {
  const it = state.items.find((x) => x.id === fix.id);
  if (!it) return;
  const { room } = state;
  if (fix.kind === 'clamp') {
    clampInside(room, it);
  } else if (fix.kind === 'separate') {
    const o = state.items.find((x) => x.id === fix.other);
    const dx = it.x - o.x;
    const dz = it.z - o.z;
    const len = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 40 && overlapDepth(it, o) > 0.01; k++) {
      it.x += (dx / len) * 0.05;
      it.z += (dz / len) * 0.05;
    }
    clampInside(room, it);
  } else if (fix.kind === 'toWall') {
    snapToNearestWall(room, it);
  } else if (fix.kind === 'clearDoor') {
    const door = room.doors[0];
    for (let k = 0; k < 60 && inDoorSwing(room, door, it); k++) {
      const c = openingCenter(room, door);
      const dx = it.x - c.x;
      const dz = it.z - c.z;
      const len = Math.hypot(dx, dz) || 1;
      it.x += (dx / len) * 0.05 + -c.nz * 0.03;
      it.z += (dz / len) * 0.05 + c.nx * 0.03;
      clampInside(room, it);
    }
  } else if (fix.kind === 'clearWindow') {
    const win = room.windows[fix.win];
    if (!win) return;
    const c = openingCenter(room, win);
    const tx = -c.nz;
    const tz = c.nx;
    const side = Math.sign((it.x - c.x) * tx + (it.z - c.z) * tz) || 1;
    const start = { x: it.x, z: it.z };
    for (let k = 0; k < 80 && blocksWindow(room, win, it); k++) {
      it.x += tx * side * 0.05;
      it.z += tz * side * 0.05;
      clampInside(room, it);
    }
    if (blocksWindow(room, win, it)) {
      // wall too short on that side: try the other side
      it.x = start.x;
      it.z = start.z;
      for (let k = 0; k < 80 && blocksWindow(room, win, it); k++) {
        it.x -= tx * side * 0.05;
        it.z -= tz * side * 0.05;
        clampInside(room, it);
      }
    }
  } else if (fix.kind === 'turnDesk') {
    // put the desk against a wall beside the window wall, far enough into the room that the
    // window sits to the user's side (direction to window less than 45 deg off the side axis)
    const win = room.windows[fix.win];
    if (!win) return;
    const c = openingCenter(room, win);
    const alongZ = Math.abs(c.nz) > Math.abs(c.nx); // window on a front/back wall
    if (alongZ) {
      const right = c.x >= 0; // side wall nearer the window keeps the sideways offset small
      const deskX = right ? room.w / 2 - it.d / 2 : -room.w / 2 + it.d / 2;
      const inward = c.z > 0 ? -1 : 1;
      const dz = Math.max(0.35 + it.w / 2, 1.3 * Math.abs(c.x - deskX));
      it.rot = right ? -Math.PI / 2 : Math.PI / 2;
      it.x = deskX;
      it.z = c.z + inward * dz;
    } else {
      const back = c.z < 0;
      const deskZ = back ? -room.d / 2 + it.d / 2 : room.d / 2 - it.d / 2;
      const inward = c.x > 0 ? -1 : 1;
      const dx = Math.max(0.35 + it.w / 2, 1.3 * Math.abs(c.z - deskZ));
      it.rot = back ? 0 : Math.PI;
      it.z = deskZ;
      it.x = c.x + inward * dx;
    }
    clampInside(room, it);
  }
}

export function clampInside(room, it) {
  for (let k = 0; k < 3; k++) {
    let mx = 0;
    let mz = 0;
    for (const p of footprint(it)) {
      if (p.x > room.w / 2) mx = Math.min(mx, room.w / 2 - p.x);
      if (p.x < -room.w / 2) mx = Math.max(mx, -room.w / 2 - p.x);
      if (p.z > room.d / 2) mz = Math.min(mz, room.d / 2 - p.z);
      if (p.z < -room.d / 2) mz = Math.max(mz, -room.d / 2 - p.z);
    }
    it.x += mx;
    it.z += mz;
  }
}

export function snapToNearestWall(room, it) {
  const opts = [
    { rot: 0, x: it.x, z: -room.d / 2 + it.d / 2, d: Math.abs(it.z + room.d / 2) },
    { rot: Math.PI, x: it.x, z: room.d / 2 - it.d / 2, d: Math.abs(room.d / 2 - it.z) },
    { rot: -Math.PI / 2, x: room.w / 2 - it.d / 2, z: it.z, d: Math.abs(room.w / 2 - it.x) },
    { rot: Math.PI / 2, x: -room.w / 2 + it.d / 2, z: it.z, d: Math.abs(it.x + room.w / 2) },
  ].sort((a, b) => a.d - b.d)[0];
  it.rot = opts.rot;
  it.x = opts.x;
  it.z = opts.z;
  clampInside(room, it);
}

// ---------- auto-arrange (simulated annealing) ----------
function layoutCost(room, items, door) {
  let cost = 0;
  const solids = items.filter(isSolid);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) cost += overlapDepth(solids[i], solids[j]) * 40;
  }
  for (const it of items) {
    cost += outOfRoom(it, room) * 60;
    const cat = CATALOG[it.type] || {};
    if (cat.wall) cost += Math.max(0, distBackToWall(room, it) - 0.02) * 6;
    if (door && isSolid(it) && inDoorSwing(room, door, it)) cost += 12;
    for (const w of room.windows) if (blocksWindow(room, w, it)) cost += 5;
    if (cat.access && door) {
      for (const s of cat.access.slice(0, 1)) {
        const p = accessPoint(it, s, 0.45);
        if (Math.abs(p.x) > room.w / 2 - 0.2 || Math.abs(p.z) > room.d / 2 - 0.2) cost += 4;
        for (const o of solids) {
          if (o.id !== it.id && overlapDepth({ x: p.x, z: p.z, w: 0.5, d: 0.5, rot: 0 }, o) > 0) cost += 3;
        }
      }
    }
  }
  const tv = items.find((x) => x.type === 'tvStand');
  const seat = items.find((x) => x.type === 'sofa') || items.find((x) => x.type === 'bed');
  if (tv && seat) {
    const d = Math.hypot(tv.x - seat.x, tv.z - seat.z);
    cost += Math.abs(d - 2.2) * 1.5;
    const f = facingVector(tv);
    const to = { x: seat.x - tv.x, z: seat.z - tv.z };
    cost += (1 - (f.x * to.x + f.z * to.z) / (d || 1)) * 2;
  }
  const desk = items.find((x) => x.type === 'desk');
  if (desk && room.windows.length) {
    const w = openingCenter(room, room.windows[0]);
    cost += Math.hypot(desk.x - w.x, desk.z - w.z) * 0.6;
  }
  const chair = items.find((x) => x.type === 'officeChair');
  if (desk && chair) {
    const f = facingVector(desk);
    const tx = desk.x + f.x * (desk.d / 2 + 0.25);
    const tz = desk.z + f.z * (desk.d / 2 + 0.25);
    cost += Math.hypot(chair.x - tx, chair.z - tz) * 4;
  }
  return cost;
}

export function autoArrange(state, seed = 7, iters = 2600) {
  const room = state.room;
  const door = room.doors[0];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const items = state.items.map((it) => ({ ...it, flat: CATALOG[it.type]?.flat }));
  const movable = items.filter((it) => !it.flat);
  let cur = layoutCost(room, items, door);
  const start = cur;
  let T = 2;
  for (let k = 0; k < iters; k++) {
    const it = movable[Math.floor(rnd() * movable.length)];
    if (!it) break;
    const old = { x: it.x, z: it.z, rot: it.rot };
    const r = rnd();
    if (r < 0.45 && CATALOG[it.type]?.wall) {
      const wall = ['N', 'E', 'S', 'W'][Math.floor(rnd() * 4)];
      const len = wall === 'N' || wall === 'S' ? room.w : room.d;
      const p = wallPoint(room, wall, it.w / 2 + rnd() * Math.max(0.01, len - it.w));
      it.rot = Math.atan2(p.nx, p.nz);
      it.x = p.x + p.nx * it.d / 2;
      it.z = p.z + p.nz * it.d / 2;
    } else if (r < 0.75) {
      it.x += (rnd() - 0.5) * 0.6;
      it.z += (rnd() - 0.5) * 0.6;
    } else if (r < 0.9) {
      it.rot = Math.round(((it.rot || 0) + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
    } else {
      it.x = (rnd() - 0.5) * (room.w - it.w);
      it.z = (rnd() - 0.5) * (room.d - it.d);
    }
    const c = layoutCost(room, items, door);
    if (c < cur || rnd() < Math.exp((cur - c) / T)) {
      cur = c;
    } else {
      Object.assign(it, old);
    }
    T = Math.max(0.01, T * 0.9975);
  }
  // rugs: centre under the main seating
  const rug = items.find((x) => x.type === 'rug');
  const anchor = items.find((x) => x.type === 'sofa') || items.find((x) => x.type === 'bed');
  if (rug && anchor) {
    const f = facingVector(anchor);
    rug.rot = anchor.rot;
    rug.x = anchor.x + f.x * (anchor.type === 'bed' ? anchor.d * 0.25 : anchor.d / 2 + 0.25);
    rug.z = anchor.z + f.z * (anchor.type === 'bed' ? anchor.d * 0.25 : anchor.d / 2 + 0.25);
    clampInside(room, rug);
  }
  for (const it of items) {
    it.x = Math.round(it.x * 100) / 100;
    it.z = Math.round(it.z * 100) / 100;
    delete it.flat;
  }
  return { items, before: start, after: cur };
}

export function layoutScore(state) {
  const c = layoutCost(state.room, state.items.map((it) => ({ ...it, flat: CATALOG[it.type]?.flat })), state.room.doors[0]);
  return Math.max(0, Math.round(100 - c * 4));
}

// ---------- renovation plans ----------
export function planFromTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  return {
    source: 'template', templateId: id,
    wall: { ...t.wall, accent: t.accent }, floor: { ...t.floor }, ceiling: mix(t.wall.color, '#ffffff', 0.6),
    lightK: t.light, pal: { wood: t.wood, fabric: t.fabric, accent: t.accent, lowBed: !!t.lowBed },
    adds: [...t.adds], curtains: true, lighting: true,
  };
}

export function planFromText(text, current) {
  const q = (text || '').toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const t of TEMPLATES) {
    const hits = t.kw.filter((k) => q.includes(k.toLowerCase())).length;
    if (hits > bestHits) {
      best = t;
      bestHits = hits;
    }
  }
  const plan = best ? planFromTemplate(best.id) : {
    source: 'text', wall: { finish: 'paint', color: current.wall.color }, floor: { ...current.floor }, ceiling: '#f6f4ef',
    lightK: current.lightK || 3000, pal: { ...current.pal }, adds: [], curtains: true, lighting: true,
  };
  plan.source = 'text';
  plan.text = text;
  const mods = DESCRIBE_MODIFIERS.filter((m) => m.kw.some((k) => q.includes(k.toLowerCase()))).map((m) => m.mod);
  const colors = COLOR_WORDS.filter((c) => c.kw.some((k) => q.includes(k.toLowerCase())));
  if (colors.length) {
    const c = colors[0].hex;
    if (/(wall|dinding|tembok|牆|墙|壁|벽|pared)/.test(q) || luminance(c) > 0.35) plan.wall.color = mix(c, '#ffffff', luminance(c) > 0.5 ? 0.1 : 0.45);
    plan.pal.accent = c;
    if (plan.wall.finish === 'wallpaper') plan.wall.accent = c;
  }
  for (const m of mods) {
    if (m === 'brighter') {
      plan.wall.color = mix(plan.wall.color, '#ffffff', 0.45);
      plan.lightK = Math.max(plan.lightK, 3500);
    }
    if (m === 'darker') plan.wall.color = mix(plan.wall.color, '#2b2a28', 0.45);
    if (m === 'warmer') {
      plan.lightK = 2700;
      plan.wall.color = mix(plan.wall.color, '#e8c9a0', 0.2);
    }
    if (m === 'cooler') {
      plan.lightK = 4000;
      plan.wall.color = mix(plan.wall.color, '#cfdde6', 0.25);
    }
    if (m === 'cozy') plan.adds.push('rug', 'floorLamp');
    if (m === 'plants') plan.adds.push('plant', 'plant');
    if (m === 'luxury') {
      plan.floor = { type: 'parquet', color: '#8a5f3a' };
      plan.pal.accent = '#b8892e';
    }
    if (m === 'budget') {
      plan.floor = { ...current.floor };
      plan.keepFloor = true;
      plan.adds = plan.adds.slice(0, 2);
    }
    if (m === 'colorful') plan.pal.accent = mix(plan.pal.accent, '#d0402b', 0.4);
    if (m === 'work') plan.adds.push('desk', 'officeChair', 'floorLamp');
  }
  plan.mods = mods;
  return plan;
}

export function planFromPalette(pal, current) {
  const cols = pal.map((p) => p.hex);
  const byLum = [...cols].sort((a, b) => luminance(b) - luminance(a));
  let wall = byLum[0];
  if (luminance(wall) < 0.45) wall = mix(wall, '#ffffff', 0.55);
  const accent = [...cols].sort((a, b) => saturation(b) - saturation(a))[0];
  const mid = byLum[Math.floor(byLum.length / 2)];
  const dark = byLum[byLum.length - 1];
  const [r, , b] = hexToRgb(mid);
  const warm = r - b;
  const floorColor = mix(dark, mid, 0.5);
  const [fr, fg, fb] = hexToRgb(floorColor);
  let floorType = 'oak';
  if (Math.abs(fr - fb) < 18 && Math.abs(fg - fb) < 18) floorType = luminance(floorColor) > 0.4 ? 'tile' : 'concrete';
  else if (fr - fb > 60) floorType = 'parquet';
  return {
    source: 'photo', wall: { finish: 'paint', color: wall, accent }, floor: { type: floorType, color: floorColor }, ceiling: mix(wall, '#ffffff', 0.6),
    lightK: warm > 30 ? 2700 : warm < 0 ? 4000 : 3000, pal: { wood: dark, fabric: mid, accent, lowBed: false },
    adds: ['rug', 'plant'], curtains: true, lighting: true, swatches: cols,
  };
}

export function rentSafePlan(plan) {
  const p = JSON.parse(JSON.stringify(plan));
  p.rentSafe = true;
  if (p.wall.finish !== 'paint') p.wall.finish = 'wallpaper';
  p.wall.removable = true;
  p.keepFloor = true;
  if (!p.adds.includes('rug')) p.adds.push('rug');
  p.rugColor = plan.floor.color;
  p.lighting = false;
  p.plugLamps = true;
  if (!p.adds.includes('floorLamp')) p.adds.push('floorLamp');
  return p;
}

// Place new items: try spots along walls first, then free floor; avoid overlaps and the door swing.
export function placeNew(room, items, type, idGen) {
  const cat = CATALOG[type];
  const it = { id: idGen(), type, w: cat.w, d: cat.d, h: cat.h, x: 0, z: 0, rot: 0, isNew: true };
  const door = room.doors[0];
  let best = null;
  let bestCost = Infinity;
  const tries = [];
  for (const wall of ['N', 'E', 'S', 'W']) {
    const len = wall === 'N' || wall === 'S' ? room.w : room.d;
    for (let o = it.w / 2 + 0.05; o <= len - it.w / 2 - 0.05; o += 0.2) tries.push({ wall, o });
  }
  for (const tr of tries) {
    const p = wallPoint(room, tr.wall, tr.o);
    const cand = { ...it, rot: Math.atan2(p.nx, p.nz), x: p.x + p.nx * (it.d / 2 + 0.02), z: p.z + p.nz * (it.d / 2 + 0.02) };
    let c = 0;
    if (!cat.flat) {
      for (const o of items) if (isSolid(o)) c += overlapDepth(cand, o) * 50;
      if (door && inDoorSwing(room, door, cand)) c += 20;
      for (const w of room.windows) if (blocksWindow(room, w, cand)) c += 8;
    }
    if (cat.flat) {
      c = Math.hypot(cand.x, cand.z);
    }
    if (c < bestCost) {
      bestCost = c;
      best = cand;
    }
  }
  if (cat.flat) {
    const anchor = items.find((x) => x.type === 'sofa') || items.find((x) => x.type === 'bed');
    if (anchor) {
      const f = facingVector(anchor);
      best = { ...it, rot: anchor.rot, x: anchor.x + f.x * anchor.d * 0.35, z: anchor.z + f.z * anchor.d * 0.35 };
    } else {
      best = { ...it, x: 0, z: 0 };
    }
    clampInside(room, best);
  }
  return best || it;
}

// Build the "after" state from the current one + a plan.
export function applyPlan(state, plan, idGen) {
  const room = JSON.parse(JSON.stringify(state.room));
  const finish = {
    wall: { ...plan.wall }, floor: plan.keepFloor ? { ...state.finish.floor } : { ...plan.floor },
    ceiling: plan.ceiling || state.finish.ceiling, lightK: plan.lightK || state.finish.lightK,
    pal: { ...state.finish.pal, ...plan.pal },
  };
  const items = state.items.map((it) => ({ ...it, color: undefined }));
  for (const type of plan.adds) {
    if (type === 'desk' && items.some((x) => x.type === 'desk')) continue;
    if (type === 'officeChair' && items.some((x) => x.type === 'officeChair')) continue;
    const n = placeNew(room, items, type, idGen);
    if (type === 'rug' && plan.rugColor) n.color = plan.rugColor;
    items.push(n);
  }
  if (plan.pal.lowBed) {
    for (const it of items) if (it.type === 'bed' || it.type === 'singleBed') it.h = 0.32;
  }
  return { room, finish, items };
}

// ---------- cost ----------
export function money(usd, reg) {
  return usd * reg.plr * reg.rate;
}

function wallArea(room) {
  const gross = 2 * (room.w + room.d) * room.h;
  const open = room.doors.reduce((s, o) => s + o.width * (o.height || 2.05), 0) + room.windows.reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, gross - open);
}

export function costLines(state, plan, after) {
  const reg = REGIONS[state.region] || REGIONS.US;
  const lines = [];
  const add = (id, key, qty, priceKey, impact, opts = {}) => {
    const p = PRICES[priceKey];
    if (!p || qty <= 0) return;
    const ov = state.priceOverride?.[priceKey];
    const low = ov ? ov.low : money(p.low, reg);
    const high = ov ? ov.high : money(p.high, reg);
    lines.push({ id, key, qty, unit: p.unit, priceKey, low: low * qty, high: high * qty, unitLow: low, unitHigh: high, src: ov ? 'user' : p.src, proxy: !!opts.proxy, impact, label: opts.label, on: true });
  };
  if (plan) {
    const r = state.room;
    if (plan.wall.color !== state.finish.wall.color || plan.wall.finish !== state.finish.wall.finish) {
      const [k, proxy] = WALL_PRICE_KEY[plan.wall.finish] || ['paint'];
      add('wall', plan.wall.removable && plan.wall.finish === 'wallpaper' ? 'cost.wallRemovable' : 'cost.wall.' + plan.wall.finish, wallArea(r), k, IMPACT.wall, { proxy: !!proxy || plan.wall.removable });
    }
    if (!plan.keepFloor && (plan.floor.type !== state.finish.floor.type || plan.floor.color !== state.finish.floor.color)) {
      const [k, proxy] = FLOOR_PRICE_KEY[plan.floor.type] || ['laminate'];
      add('floor', 'cost.floor.' + plan.floor.type, r.w * r.d * 1.1, k, IMPACT.floor, { proxy: !!proxy });
    }
    if (plan.ceiling && plan.ceiling !== state.finish.ceiling) add('ceiling', 'cost.ceiling', r.w * r.d, 'ceilingPaint', IMPACT.ceiling);
    if (plan.lighting) {
      add('light', 'cost.light', 1, 'ceilingLight', IMPACT.lighting);
      add('lightInstall', 'cost.lightInstall', 1, 'lightInstall', 2);
    }
    if (plan.curtains && r.windows.length) add('curtains', 'cost.curtains', r.windows.length, 'curtains', IMPACT.curtains);
  }
  const newItems = (after ? after.items : state.items).filter((it) => it.isNew);
  newItems.forEach((it, i) => {
    const cat = CATALOG[it.type];
    add('item-' + it.id, 'item.' + it.type, 1, cat.price, it.type === 'rug' ? IMPACT.rug : it.type === 'plant' ? IMPACT.plant : IMPACT.add, { proxy: !!cat.proxy });
  });
  return lines;
}

export function totals(lines) {
  const on = lines.filter((l) => l.on);
  return { low: on.reduce((s, l) => s + l.low, 0), high: on.reduce((s, l) => s + l.high, 0) };
}

export function optimiseBudget(lines, budget) {
  const items = lines.map((l) => ({ id: l.id, cost: (l.low + l.high) / 2, impact: l.impact }));
  return knapsack(items, budget);
}

// Pure math used by Ruang. No DOM, no three.js: unit-tested in tests/unit.html.

const D2R = Math.PI / 180;

// ---------- Photo -> 3D (single-view "tour into the picture") ----------
// Camera at the origin looking down -z, principal point = vanishing point (vx, vy).
// rect = back wall in image pixels {x0, y0, x1, y1} (y grows down). roomH = ceiling height (m).
// fovDeg = horizontal field of view of the photo (26 mm-equivalent phone lens = 69.4 deg).
export function reconstruct({ imgW, imgH, rect, roomH = 2.6, fovDeg = 69.4, vp = null }) {
  const f = (imgW / 2) / Math.tan((fovDeg / 2) * D2R);
  // level phone held square to the far wall: the vanishing point is the image centre
  const vx = vp ? vp.x : imgW / 2;
  const vy = vp ? vp.y : imgH / 2;
  const hr = Math.max(4, rect.y1 - rect.y0);
  const wr = Math.max(4, rect.x1 - rect.x0);
  const Zb = f * roomH / hr;                 // distance to back wall
  const roomW = wr * Zb / f;                 // back wall width
  const camH = (rect.y1 - vy) * Zb / f;      // camera height above floor
  const xL = (rect.x0 - vx) * Zb / f;
  const xR = (rect.x1 - vx) * Zb / f;
  const yF = -camH;                          // floor plane y
  const yC = roomH - camH;                   // ceiling plane y
  // the photo was taken from inside the room; assume the camera stands ~0.4 m from the front wall
  const depthSeen = Zb;
  return { f, vx, vy, Zb, roomW, roomH, camH, xL, xR, yF, yC, depthSeen, imgW, imgH };
}

// 3D point (camera frame) seen at pixel (u, v): the first box face the ray exits through.
export function pixelTo3D(rc, u, v) {
  const dx = (u - rc.vx) / rc.f;
  const dy = -(v - rc.vy) / rc.f;
  const dz = -1;
  let best = Infinity;
  let face = 'back';
  const test = (t, name) => {
    if (t > 1e-6 && t < best) {
      best = t;
      face = name;
    }
  };
  test(rc.Zb, 'back');                           // z = -Zb  -> t = Zb / 1
  if (dy < 0) test(rc.yF / dy, 'floor');
  if (dy > 0) test(rc.yC / dy, 'ceiling');
  if (dx < 0) test(rc.xL / dx, 'left');
  if (dx > 0) test(rc.xR / dx, 'right');
  return { x: dx * best, y: dy * best, z: dz * best, face };
}

// Camera-frame point -> room frame (origin at room centre on the floor, back wall at z = -D/2).
export function camToRoom(rc, p, roomD) {
  return {
    x: p.x - (rc.xL + rc.xR) / 2,
    y: p.y - rc.yF,
    z: p.z + rc.Zb - roomD / 2,
  };
}

// Rotate a room-frame point when the photo faced another wall. wallIndex: 0 = back (N), 1 = right (E), 2 = front (S), 3 = left (W).
// For walls 1 and 3, the photo's "width" is the room depth.
export function photoFrameToRoom(p, wallIndex) {
  const k = ((wallIndex % 4) + 4) % 4;
  if (k === 0) return { x: p.x, y: p.y, z: p.z };
  if (k === 1) return { x: -p.z, y: p.y, z: p.x };
  if (k === 2) return { x: -p.x, y: p.y, z: -p.z };
  return { x: p.z, y: p.y, z: -p.x };
}

// Floor point under pixel (u, v), or null when the pixel is not on the floor.
export function floorPoint(rc, u, v, roomD) {
  const p = pixelTo3D(rc, u, v);
  if (p.face !== 'floor') return null;
  return camToRoom(rc, p, roomD);
}

// ---------- Lens: 35 mm-equivalent focal length -> horizontal field of view ----------
// Phone makers state the lens as "35 mm equivalent", which is defined on the frame diagonal (CIPA DC-008),
// so the same number works for 4:3, 16:9 and portrait photos.
export const FULL_FRAME_DIAG_MM = Math.hypot(36, 24);
export const DEFAULT_F35 = 26; // typical phone main camera (1x)
export const LENS_PRESETS = [[13, '0.5x'], [26, '1x'], [52, '2x']]; // 3x telephoto is useless indoors

export function hfovFromF35(f35, imgW, imgH) {
  const widthMm = (FULL_FRAME_DIAG_MM * imgW) / Math.hypot(imgW, imgH);
  return (2 * Math.atan(widthMm / (2 * f35))) / D2R;
}

// Minimal EXIF reader for JPEG: { f35, focal, orientation } (each may be null), or null when there is no EXIF.
export function readExif(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p);
    const size = v.getUint16(p + 2);
    if (marker === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) return parseTiff(v, p + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    p += 2 + size;
  }
  return null;
}

function parseTiff(v, t) {
  if (t + 8 > v.byteLength) return null;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le);
  const u32 = (o) => v.getUint32(t + o, le);
  const out = { f35: null, focal: null, orientation: null };
  const readIfd = (off, onTag) => {
    if (off <= 0 || t + off + 2 > v.byteLength) return;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (t + e + 12 > v.byteLength) return;
      onTag(u16(e), u16(e + 2), e + 8);
    }
  };
  let exifOff = 0;
  readIfd(u32(4), (tag, type, val) => {
    if (tag === 0x0112) out.orientation = u16(val);
    if (tag === 0x8769) exifOff = u32(val);
  });
  readIfd(exifOff, (tag, type, val) => {
    if (tag === 0xa405) out.f35 = type === 3 ? u16(val) : u32(val);
    if (tag === 0x920a) {
      const ptr = u32(val);
      const den = u32(ptr + 4);
      if (den) out.focal = u32(ptr) / den;
    }
  });
  if (!out.f35) out.f35 = null;
  return out;
}

// Default room depth: back wall distance + 0.4 m behind the photographer (assumed), at least 2 m.
export function defaultDepth(rc) {
  return Math.max(2, rc.Zb + 0.4);
}

// ---------- Sun position (NOAA general solar position, accurate to ~0.5 deg) ----------
export function solarPosition(date, lat, lon) {
  const ms = date.getTime();
  const jd = ms / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * D2R) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * D2R) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * D2R) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R));
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const eqTime = 4 / D2R * (y * Math.sin(2 * L0 * D2R) - 2 * e * Math.sin(M * D2R) +
    4 * e * y * Math.sin(M * D2R) * Math.cos(2 * L0 * D2R) - 0.5 * y * y * Math.sin(4 * L0 * D2R) -
    1.25 * e * e * Math.sin(2 * M * D2R));
  const utcMin = (ms / 60000) % 1440;
  const trueSolar = ((utcMin + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  let ha = trueSolar / 4 - 180;
  if (ha < -180) ha += 360;
  const latR = lat * D2R;
  const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha * D2R);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const altitude = 90 - zen / D2R;
  let az = Math.acos(Math.min(1, Math.max(-1,
    (Math.sin(latR) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(latR) * Math.sin(zen)))));
  az = az / D2R;
  const azimuth = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { altitude, azimuth, declination: decl / D2R };
}

// Unit vector pointing TO the sun in room frame. northDeg = compass bearing the room's back wall (-z) faces.
// Room frame: -z = "back", +x = right. Compass bearing b maps to direction rotated from back.
export function sunVector(altitude, azimuth, northDeg) {
  const rel = (azimuth - northDeg) * D2R; // angle clockwise from the back-wall direction
  const ca = Math.cos(altitude * D2R);
  return { x: Math.sin(rel) * ca, y: Math.sin(altitude * D2R), z: -Math.cos(rel) * ca };
}

// ---------- Footprints and overlap ----------
export function footprint(item) {
  const c = Math.cos(item.rot || 0);
  const s = Math.sin(item.rot || 0);
  const hw = item.w / 2;
  const hd = item.d / 2;
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  return pts.map(([x, z]) => ({ x: item.x + x * c + z * s, z: item.z - x * s + z * c }));
}

function project(poly, ax) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax.x + p.z * ax.z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

// Separating-axis overlap depth between two rotated rectangles (0 = no overlap).
export function overlapDepth(a, b) {
  const pa = footprint(a);
  const pb = footprint(b);
  let minDepth = Infinity;
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % 4];
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1;
      const ax = { x: -(p2.z - p1.z) / len, z: (p2.x - p1.x) / len };
      const [a0, a1] = project(pa, ax);
      const [b0, b1] = project(pb, ax);
      const d = Math.min(a1, b1) - Math.max(a0, b0);
      if (d <= 0) return 0;
      if (d < minDepth) minDepth = d;
    }
  }
  return minDepth;
}

export function outOfRoom(item, room) {
  let worst = 0;
  for (const p of footprint(item)) {
    worst = Math.max(worst, Math.abs(p.x) - room.w / 2, Math.abs(p.z) - room.d / 2);
  }
  return Math.max(0, worst);
}

// Can an item pass a door opening (tilting allowed)? Two smallest dimensions must pass width x height.
export function fitsThroughDoor(dims, door) {
  const s = [dims.w, dims.d, dims.h].sort((a, b) => a - b);
  const dw = door.width;
  const dh = door.height || 2.0;
  return s[0] <= dw - 0.02 && s[1] <= Math.hypot(dw, dh) - 0.02 && (s[1] <= dh - 0.02 || s[0] <= dw - 0.02);
}

// ---------- Flow grid: can you walk from the door to every item? ----------
// Items that you can step on (rug, cushion) do not block. bodyR = half shoulder width (m).
export function flowGrid(room, items, door, cell = 0.1, bodyR = 0.28) {
  const nx = Math.max(2, Math.round(room.w / cell));
  const nz = Math.max(2, Math.round(room.d / cell));
  const blocked = new Uint8Array(nx * nz);
  const clear = new Float32Array(nx * nz);
  const cx = (i) => -room.w / 2 + (i + 0.5) * cell;
  const cz = (k) => -room.d / 2 + (k + 0.5) * cell;
  const solids = items.filter((it) => !it.flat);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const x = cx(i);
      const z = cz(k);
      let dist = Math.min(room.w / 2 - Math.abs(x), room.d / 2 - Math.abs(z));
      for (const it of solids) {
        dist = Math.min(dist, distToItem(it, x, z));
      }
      clear[k * nx + i] = dist;
      if (dist < bodyR) blocked[k * nx + i] = 1;
    }
  }
  // start = cell just inside the door
  const start = doorCell(room, door, cell, nx, nz);
  const reach = new Uint8Array(nx * nz);
  const queue = [];
  const s = nearestFree(start, blocked, nx, nz);
  if (s >= 0) {
    reach[s] = 1;
    queue.push(s);
  }
  while (queue.length) {
    const c = queue.shift();
    const i = c % nx;
    const k = (c - i) / nx;
    const nb = [[i + 1, k], [i - 1, k], [i, k + 1], [i, k - 1]];
    for (const [a, b] of nb) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (!reach[n] && !blocked[n]) {
        reach[n] = 1;
        queue.push(n);
      }
    }
  }
  const reachableArea = reach.reduce((s2, v) => s2 + v, 0) * cell * cell;
  return { nx, nz, cell, blocked, clear, reach, reachableArea, cx, cz };
}

function distToItem(it, x, z) {
  const c = Math.cos(-(it.rot || 0));
  const s = Math.sin(-(it.rot || 0));
  const lx = (x - it.x) * c + (z - it.z) * s;
  const lz = -(x - it.x) * s + (z - it.z) * c;
  const dx = Math.max(Math.abs(lx) - it.w / 2, 0);
  const dz = Math.max(Math.abs(lz) - it.d / 2, 0);
  const inside = Math.abs(lx) <= it.w / 2 && Math.abs(lz) <= it.d / 2;
  return inside ? 0 : Math.hypot(dx, dz);
}

export function wallPoint(room, wall, offset) {
  // offset = distance along the wall from its left end when facing the wall from inside
  if (wall === 'N') return { x: -room.w / 2 + offset, z: -room.d / 2, nx: 0, nz: 1 };
  if (wall === 'S') return { x: room.w / 2 - offset, z: room.d / 2, nx: 0, nz: -1 };
  if (wall === 'E') return { x: room.w / 2, z: -room.d / 2 + offset, nx: -1, nz: 0 };
  return { x: -room.w / 2, z: room.d / 2 - offset, nx: 1, nz: 0 };
}

function doorCell(room, door, cell, nx, nz) {
  const p = wallPoint(room, door.wall, door.offset + door.width / 2);
  const x = p.x + p.nx * 0.35;
  const z = p.z + p.nz * 0.35;
  const i = Math.min(nx - 1, Math.max(0, Math.floor((x + room.w / 2) / cell)));
  const k = Math.min(nz - 1, Math.max(0, Math.floor((z + room.d / 2) / cell)));
  return k * nx + i;
}

function nearestFree(c, blocked, nx, nz) {
  if (!blocked[c]) return c;
  const i0 = c % nx;
  const k0 = (c - i0) / nx;
  for (let r = 1; r < 8; r++) {
    for (let dk = -r; dk <= r; dk++) {
      for (let di = -r; di <= r; di++) {
        const i = i0 + di;
        const k = k0 + dk;
        if (i >= 0 && k >= 0 && i < nx && k < nz && !blocked[k * nx + i]) return k * nx + i;
      }
    }
  }
  return -1;
}

// Point a person needs to stand at to use an item's side (local side -> room point).
export function accessPoint(it, side, gap = 0.45) {
  const local = { front: [0, it.d / 2 + gap], back: [0, -it.d / 2 - gap], left: [-it.w / 2 - gap, 0], right: [it.w / 2 + gap, 0] }[side];
  const c = Math.cos(it.rot || 0);
  const s = Math.sin(it.rot || 0);
  return { x: it.x + local[0] * c + local[1] * s, z: it.z - local[0] * s + local[1] * c };
}

export function reachableAt(grid, room, p, radius = 0.15) {
  for (let dz = -radius; dz <= radius + 1e-9; dz += grid.cell) {
    for (let dx = -radius; dx <= radius + 1e-9; dx += grid.cell) {
      const i = Math.floor((p.x + dx + room.w / 2) / grid.cell);
      const k = Math.floor((p.z + dz + room.d / 2) / grid.cell);
      if (i >= 0 && k >= 0 && i < grid.nx && k < grid.nz && grid.reach[k * grid.nx + i]) return true;
    }
  }
  return false;
}

// ---------- Budget optimiser: 0/1 knapsack on impact ----------
// items: [{ id, cost, impact }]; returns the chosen ids with the highest total impact within budget.
export function knapsack(items, budget, steps = 400) {
  if (budget <= 0 || !items.length) return { ids: [], impact: 0, cost: 0 };
  const unit = budget / steps;
  const w = items.map((it) => Math.ceil(it.cost / unit - 1e-9));
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(steps + 1));
  for (let i = 1; i <= n; i++) {
    for (let c = 0; c <= steps; c++) {
      dp[i][c] = dp[i - 1][c];
      if (w[i - 1] <= c) dp[i][c] = Math.max(dp[i][c], dp[i - 1][c - w[i - 1]] + items[i - 1].impact);
    }
  }
  const ids = [];
  let c = steps;
  for (let i = n; i >= 1; i--) {
    if (dp[i][c] !== dp[i - 1][c]) {
      ids.push(items[i - 1].id);
      c -= w[i - 1];
    }
  }
  const chosen = items.filter((it) => ids.includes(it.id));
  return { ids, impact: dp[n][steps], cost: chosen.reduce((s, it) => s + it.cost, 0) };
}

// ---------- Colour helpers ----------
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

export function saturation(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

// k-means palette from RGB pixel array (Uint8ClampedArray RGBA), deterministic seeds.
export function palette(data, k = 5, stride = 4) {
  const pts = [];
  for (let i = 0; i < data.length; i += 4 * stride) pts.push([data[i], data[i + 1], data[i + 2]]);
  if (!pts.length) return [];
  pts.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  let cents = Array.from({ length: k }, (_, j) => pts[Math.floor((j + 0.5) * pts.length / k)].slice());
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 12; iter++) {
    for (let p = 0; p < pts.length; p++) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < k; j++) {
        const d = (pts[p][0] - cents[j][0]) ** 2 + (pts[p][1] - cents[j][1]) ** 2 + (pts[p][2] - cents[j][2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      assign[p] = bi;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pts.length; p++) {
      const s = sums[assign[p]];
      s[0] += pts[p][0];
      s[1] += pts[p][1];
      s[2] += pts[p][2];
      s[3]++;
    }
    cents = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[j]));
  }
  const counts = new Array(k).fill(0);
  for (let p = 0; p < pts.length; p++) counts[assign[p]]++;
  return cents.map((c, j) => ({ hex: rgbToHex(c), share: counts[j] / pts.length }))
    .filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

// Median colour of pixels in a polygon-ish region given by a predicate over (u, v).
export function medianColor(data, w, h, inRegion, step = 3) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let v = 0; v < h; v += step) {
    for (let u = 0; u < w; u += step) {
      if (!inRegion(u, v)) continue;
      const i = (v * w + u) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  if (!rs.length) return null;
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return rgbToHex([med(rs), med(gs), med(bs)]);
}

// Procedural textures and furniture models (three.js). Origin = floor centre, front = +z.
import * as THREE from 'three';
import { hexToRgb, rgbToHex, mix } from './geom.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(hex, f) {
  return rgbToHex(hexToRgb(hex).map((v) => v * f));
}

const texCache = new Map();

// size = metres covered by one texture tile
export function makeTexture(kind, color, opts = {}) {
  const key = kind + color + (opts.pattern || '') + (opts.accent || '');
  if (texCache.has(key)) return texCache.get(key);
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  const r = rng(kind.length * 977 + parseInt(color.slice(1), 16));
  g.fillStyle = color;
  g.fillRect(0, 0, N, N);
  let size = 1;
  const noise = (amt, n = 2600, sz = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(color, 1 + (r() - 0.5) * amt);
      g.fillRect(r() * N, r() * N, sz, sz);
    }
  };
  if (kind === 'wood' || kind === 'oak' || kind === 'walnut' || kind === 'laminate') {
    for (let y = 0; y < N; y += 2) {
      g.fillStyle = shade(color, 0.9 + 0.2 * Math.sin(y * 0.21 + r() * 2) * r());
      g.fillRect(0, y, N, 1);
    }
    for (let p = 0; p < 4; p++) {
      g.fillStyle = shade(color, 0.72);
      g.fillRect(0, p * 64, N, 1.5);
      const cut = r() * N;
      g.fillRect(cut, p * 64, 1.5, 64);
    }
    size = 1.6;
  } else if (kind === 'parquet') {
    const w = 32;
    for (let y = -N; y < N * 2; y += w) {
      for (let x = -N; x < N * 2; x += w * 2) {
        const off = (y / w) % 2 ? w : 0;
        g.save();
        g.translate(x + off, y);
        g.rotate(Math.PI / 4);
        g.fillStyle = shade(color, 0.86 + r() * 0.24);
        g.fillRect(0, 0, w * 2.1, w * 0.95);
        g.restore();
      }
    }
    size = 1.2;
  } else if (['tile', 'terracotta', 'zellige', 'stone', 'ondol'].includes(kind)) {
    const n = kind === 'zellige' ? 8 : kind === 'stone' ? 2 : 4;
    const s = N / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = kind === 'zellige' ? 0.75 + r() * 0.45 : kind === 'ondol' ? 0.95 + r() * 0.1 : 0.9 + r() * 0.18;
        g.fillStyle = shade(color, v);
        g.fillRect(x * s, y * s, s, s);
      }
    }
    g.strokeStyle = kind === 'zellige' ? '#efe9dc' : shade(color, kind === 'ondol' ? 0.85 : 0.62);
    g.lineWidth = kind === 'ondol' ? 1 : 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, N);
      g.moveTo(0, i * s);
      g.lineTo(N, i * s);
      g.stroke();
    }
    noise(0.12);
    size = kind === 'stone' ? 1.2 : kind === 'zellige' ? 0.8 : 1.2;
  } else if (kind === 'concrete' || kind === 'plaster') {
    noise(kind === 'concrete' ? 0.18 : 0.06, 9000, 3);
    size = 2;
  } else if (kind === 'terrazzo') {
    for (let i = 0; i < 500; i++) {
      g.fillStyle = shade(color, 0.6 + r() * 0.6);
      g.beginPath();
      g.arc(r() * N, r() * N, 1 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'carpet' || kind === 'fabric') {
    noise(0.14, 14000, 1);
    size = 0.5;
  } else if (kind === 'tatami') {
    for (let y = 0; y < N; y += 3) {
      g.fillStyle = shade(color, 0.92 + r() * 0.12);
      g.fillRect(0, y, N, 2);
    }
    g.fillStyle = '#2f3a2a';
    g.fillRect(0, 0, N, 10);
    g.fillRect(0, N / 2, N, 10);
    size = 1.8;
  } else if (kind === 'brick') {
    const bh = 16;
    const bw = 48;
    g.fillStyle = '#d8d0c4';
    g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < N + bw; x += bw) {
        g.fillStyle = shade(color, 0.8 + r() * 0.35);
        g.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    size = 1;
  } else if (kind === 'wallpaper') {
    const acc = opts.accent || shade(color, 0.78);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cx = x * 64 + (y % 2 ? 32 : 0) + 16;
        const cy = y * 64 + 32;
        g.fillStyle = acc;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 6, 3.5, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = shade(acc, 0.7);
        g.beginPath();
        g.arc(cx, cy, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    size = 0.7;
  } else if (kind === 'panel') {
    noise(0.04, 3000, 2);
    g.strokeStyle = shade(color, 0.86);
    g.lineWidth = 4;
    g.strokeRect(24, 24, N - 48, N * 0.42);
    g.strokeRect(24, N * 0.56, N - 48, N * 0.38);
    g.strokeStyle = shade(color, 1.06);
    g.lineWidth = 2;
    g.strokeRect(28, 28, N - 56, N * 0.42 - 8);
    size = 1.1;
  } else if (kind === 'shiplap') {
    for (let y = 0; y < N; y += 32) {
      g.fillStyle = shade(color, 0.8);
      g.fillRect(0, y, N, 2);
    }
    noise(0.04);
    size = 1;
  } else if (kind === 'woodpanel') {
    for (let x = 0; x < N; x += 2) {
      g.fillStyle = shade(color, 0.9 + 0.2 * Math.sin(x * 0.3 + r() * 2) * r());
      g.fillRect(x, 0, 1, N);
    }
    for (let x = 0; x < N; x += 42) {
      g.fillStyle = shade(color, 0.7);
      g.fillRect(x, 0, 2, N);
    }
    size = 1.2;
  } else if (kind === 'paper') {
    g.strokeStyle = shade(color, 0.55);
    g.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * N) / 4, 0);
      g.lineTo((i * N) / 4, N);
      g.moveTo(0, (i * N) / 4);
      g.lineTo(N, (i * N) / 4);
      g.stroke();
    }
    size = 0.9;
  } else if (kind === 'rug') {
    const acc = opts.accent || shade(color, 0.6);
    noise(0.1, 9000, 1);
    g.strokeStyle = acc;
    g.lineWidth = 10;
    g.strokeRect(14, 14, N - 28, N - 28);
    g.lineWidth = 3;
    g.strokeRect(34, 34, N - 68, N - 68);
    g.fillStyle = acc;
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(N / 2, N / 2);
      g.rotate((i * Math.PI) / 3);
      g.fillRect(-4, 20, 8, 46);
      g.restore();
    }
    size = 0;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.userData = { size };
  texCache.set(key, tex);
  return tex;
}

// ---------- furniture ----------
function part(geo, kind, color, opts = {}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
  mesh.castShadow = !opts.noShadow;
  mesh.receiveShadow = true;
  mesh.userData = { kind, baseColor: color, tex: opts.tex || null, emissive: opts.emissive || null };
  return mesh;
}

function box(g, kind, color, w, h, d, x, y, z, opts) {
  const m = part(new THREE.BoxGeometry(w, h, d), kind, color, opts);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

function cyl(g, kind, color, rTop, rBot, h, x, y, z, seg = 16, opts) {
  const m = part(new THREE.CylinderGeometry(rTop, rBot, h, seg), kind, color, opts);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

function legs(g, color, w, d, h, inset = 0.05, r = 0.022) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cyl(g, 'wood', color, r, r * 0.8, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 8);
    }
  }
}

// pal = { wood, fabric, accent, metal, plantGreen }
export function buildItem(it, pal) {
  const g = new THREE.Group();
  const { w, d, h } = it;
  const wood = it.color && it.colorKind === 'wood' ? it.color : pal.wood;
  const fabric = it.color && it.colorKind !== 'wood' ? it.color : pal.fabric;
  const acc = pal.accent;
  const low = pal.lowBed;
  switch (it.type) {
    case 'bed':
    case 'singleBed': {
      const base = low ? 0.12 : 0.3;
      box(g, 'wood', wood, w, base, d, 0, 0, 0);
      box(g, 'fabric', '#f4f1ea', w - 0.06, 0.2, d - 0.08, 0, base, 0.02, { tex: 'fabric' });
      box(g, 'fabric', fabric, w - 0.04, 0.06, d * 0.62, 0, base + 0.2, d * 0.18, { tex: 'fabric' });
      const pw = it.type === 'bed' ? (w - 0.2) / 2 : w - 0.2;
      for (let i = 0; i < (it.type === 'bed' ? 2 : 1); i++) {
        const px = it.type === 'bed' ? (i ? 1 : -1) * (pw / 2 + 0.03) : 0;
        box(g, 'fabric', '#fbfaf6', pw, 0.12, 0.38, px, base + 0.2, -d / 2 + 0.3);
      }
      if (!low) box(g, 'wood', wood, w, 0.95, 0.06, 0, 0, -d / 2 + 0.03);
      break;
    }
    case 'sofa': {
      box(g, 'wood', shade(wood, 0.8), w - 0.1, 0.1, d - 0.1, 0, 0, 0);
      box(g, 'fabric', fabric, w, 0.3, d, 0, 0.1, 0, { tex: 'fabric' });
      box(g, 'fabric', fabric, w, 0.42, 0.2, 0, 0.4, -d / 2 + 0.1, { tex: 'fabric' });
      for (const s of [-1, 1]) box(g, 'fabric', shade(fabric, 0.95), 0.18, 0.24, d, s * (w / 2 - 0.09), 0.4, 0);
      const n = w > 1.6 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const cw = (w - 0.4) / n;
        box(g, 'fabric', shade(fabric, 1.04), cw - 0.02, 0.1, d - 0.28, -w / 2 + 0.2 + cw * (i + 0.5), 0.4, 0.06, { tex: 'fabric' });
      }
      box(g, 'fabric', acc, 0.4, 0.34, 0.12, -w / 2 + 0.45, 0.48, -d / 2 + 0.26);
      break;
    }
    case 'armchair': {
      box(g, 'fabric', fabric, w, 0.42, d, 0, 0.0, 0, { tex: 'fabric' });
      box(g, 'fabric', fabric, w, 0.42, 0.16, 0, 0.42, -d / 2 + 0.08, { tex: 'fabric' });
      for (const s of [-1, 1]) box(g, 'fabric', shade(fabric, 0.94), 0.14, 0.2, d, s * (w / 2 - 0.07), 0.42, 0);
      break;
    }
    case 'coffeeTable':
    case 'lowTable':
    case 'nightstand':
    case 'diningTable':
    case 'desk': {
      const top = 0.035;
      box(g, 'wood', wood, w, top, d, 0, h - top, 0, { tex: 'wood' });
      if (it.type === 'nightstand') {
        box(g, 'wood', shade(wood, 0.92), w - 0.02, h - top - 0.08, d - 0.02, 0, 0.08, 0);
        box(g, 'metal', '#b8a27a', 0.1, 0.015, 0.015, 0, h * 0.6, d / 2);
        legs(g, wood, w, d, 0.08, 0.04, 0.015);
        cyl(g, 'light', '#f3e6c4', 0.08, 0.1, 0.18, 0.08, h, -0.05, 16, { emissive: '#ffd9a0' });
      } else {
        legs(g, wood, w, d, h - top, 0.05, it.type === 'diningTable' ? 0.03 : 0.02);
      }
      if (it.type === 'desk') {
        box(g, 'metal', '#2b2d30', 0.5, 0.3, 0.02, 0, h + 0.08, -d / 2 + 0.12);
        cyl(g, 'metal', '#2b2d30', 0.015, 0.015, 0.08, 0, h, -d / 2 + 0.12, 8);
        box(g, 'metal', '#3a3c40', 0.42, 0.015, 0.14, 0, h, 0.05);
      }
      if (it.type === 'coffeeTable') box(g, 'fabric', acc, 0.22, 0.05, 0.16, 0.2, h, 0);
      break;
    }
    case 'chair': {
      box(g, 'wood', wood, w, 0.04, d, 0, 0.44, 0, { tex: 'wood' });
      legs(g, wood, w, d, 0.44, 0.04, 0.016);
      box(g, 'wood', wood, w, 0.4, 0.03, 0, 0.48, -d / 2 + 0.02);
      break;
    }
    case 'officeChair': {
      cyl(g, 'metal', '#2a2b2e', 0.28, 0.28, 0.04, 0, 0.04, 0, 5);
      cyl(g, 'metal', '#2a2b2e', 0.025, 0.025, 0.36, 0, 0.08, 0, 8);
      box(g, 'fabric', fabric, 0.5, 0.08, 0.48, 0, 0.44, 0, { tex: 'fabric' });
      box(g, 'fabric', fabric, 0.46, 0.5, 0.06, 0, 0.52, -0.22, { tex: 'fabric' });
      break;
    }
    case 'wardrobe':
    case 'dresser':
    case 'bookshelf': {
      if (it.type === 'bookshelf') {
        box(g, 'wood', wood, w, h, 0.02, 0, 0, -d / 2 + 0.01);
        for (const s of [-1, 1]) box(g, 'wood', wood, 0.025, h, d, s * (w / 2 - 0.0125), 0, 0);
        const shelves = 5;
        const r = rng(11);
        for (let i = 0; i <= shelves; i++) {
          const y = (i * (h - 0.03)) / shelves;
          box(g, 'wood', wood, w - 0.05, 0.025, d, 0, y, 0);
          if (i < shelves) {
            let x = -w / 2 + 0.05;
            while (x < w / 2 - 0.12) {
              const bw = 0.025 + r() * 0.03;
              const bh = 0.18 + r() * 0.1;
              const col = [acc, '#e8e1d2', '#5f6b5a', '#a35a3d', '#2f3b48'][Math.floor(r() * 5)];
              box(g, 'fabric', col, bw, bh, d * 0.7, x + bw / 2, y + 0.025, 0.01, { noShadow: true });
              x += bw + 0.004;
              if (r() < 0.12) x += 0.08;
            }
          }
        }
      } else {
        box(g, 'wood', wood, w, h - 0.06, d, 0, 0.06, 0, { tex: 'wood' });
        legs(g, wood, w, d, 0.06, 0.05, 0.02);
        const doors = it.type === 'wardrobe' ? 2 : 1;
        const rows = it.type === 'wardrobe' ? 1 : 3;
        for (let i = 0; i < doors; i++) {
          for (let j = 0; j < rows; j++) {
            const dw = w / doors - 0.03;
            const dh = (h - 0.12) / rows - 0.03;
            const dx = -w / 2 + (i + 0.5) * (w / doors);
            const dy = 0.09 + j * ((h - 0.12) / rows);
            box(g, 'wood', shade(wood, 1.06), dw, dh, 0.012, dx, dy, d / 2 + 0.006);
            const hx = doors === 2 ? dx + (i ? -1 : 1) * (dw / 2 - 0.05) : dx;
            box(g, 'metal', '#b8a27a', 0.02, doors === 2 ? 0.2 : 0.015, 0.02, hx, dy + dh / 2 - 0.08, d / 2 + 0.02);
          }
        }
      }
      break;
    }
    case 'tvStand': {
      box(g, 'wood', wood, w, 0.45, d, 0, 0.0, 0, { tex: 'wood' });
      box(g, 'wood', shade(wood, 0.85), w - 0.04, 0.003, 0.002, 0, 0.22, d / 2);
      box(g, 'metal', '#141518', Math.min(1.25, w - 0.1), 0.66, 0.04, 0, 0.5, -0.05);
      box(g, 'screen', '#0d1a26', Math.min(1.2, w - 0.14), 0.62, 0.005, 0, 0.52, -0.027, { emissive: '#0b1822' });
      break;
    }
    case 'rug': {
      const m = part(new THREE.BoxGeometry(w, 0.012, d), 'rug', it.color || fabric, { tex: 'rug', noShadow: true });
      m.position.y = 0.006;
      g.add(m);
      break;
    }
    case 'cushion': {
      const m = box(g, 'fabric', it.color || acc, w, h, d, 0, 0, 0, { tex: 'fabric' });
      m.scale.set(1, 1, 1);
      break;
    }
    case 'floorLamp': {
      cyl(g, 'metal', '#2a2b2e', 0.14, 0.16, 0.03, 0, 0, 0, 20);
      cyl(g, 'metal', '#2a2b2e', 0.012, 0.012, h - 0.35, 0, 0.03, 0, 8);
      cyl(g, 'light', '#f1e7d3', 0.13, 0.19, 0.3, 0, h - 0.32, 0, 24, { emissive: '#ffdca8' });
      break;
    }
    case 'lantern': {
      cyl(g, 'metal', '#8a6a2e', 0.1, 0.12, 0.04, 0, 0, 0, 8);
      cyl(g, 'light', '#f2c27a', 0.11, 0.11, h - 0.12, 0, 0.04, 0, 8, { emissive: '#ffb860' });
      cyl(g, 'metal', '#8a6a2e', 0.02, 0.12, 0.08, 0, h - 0.08, 0, 8);
      break;
    }
    case 'plant': {
      cyl(g, 'pot', '#b9876a', w * 0.36, w * 0.28, 0.32, 0, 0, 0, 20);
      const r = rng(Math.floor(Math.abs(it.x * 1000 + it.z * 37)) + 5);
      const leaves = 9;
      for (let i = 0; i < leaves; i++) {
        const m = part(new THREE.SphereGeometry(0.11 + r() * 0.08, 10, 8), 'plant', i % 3 ? '#4f7a46' : '#3d6538');
        const a = (i / leaves) * Math.PI * 2;
        const rr = 0.06 + r() * 0.12;
        m.position.set(Math.cos(a) * rr, 0.42 + r() * (h - 0.6), Math.sin(a) * rr);
        m.scale.set(1, 1.4, 1);
        g.add(m);
      }
      cyl(g, 'wood', '#5a4632', 0.015, 0.02, h * 0.6, 0, 0.3, 0, 6);
      break;
    }
    case 'screen': {
      const panels = 3;
      const pw = w / panels;
      for (let i = 0; i < panels; i++) {
        const p = new THREE.Group();
        box(p, 'paper', '#f4efe2', pw - 0.03, h - 0.06, 0.012, 0, 0.03, 0, { tex: 'paper' });
        box(p, 'wood', wood, pw, 0.03, 0.03, 0, 0, 0);
        box(p, 'wood', wood, pw, 0.03, 0.03, 0, h - 0.03, 0);
        for (const s of [-1, 1]) box(p, 'wood', wood, 0.03, h, 0.03, s * (pw / 2 - 0.015), 0, 0);
        p.position.x = -w / 2 + (i + 0.5) * pw;
        p.rotation.y = (i % 2 ? -1 : 1) * 0.18;
        g.add(p);
      }
      break;
    }
    case 'mirror': {
      box(g, 'wood', shade(acc, 1), w, h, d, 0, 0.0, 0);
      box(g, 'mirror', '#cfd8dc', w - 0.06, h - 0.06, 0.005, 0, 0.03, d / 2);
      break;
    }
    default:
      box(g, 'wood', wood, w, h, d, 0, 0, 0);
  }
  g.userData = { itemId: it.id, type: it.type };
  return g;
}

export { shade, mix };

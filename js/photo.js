// Photo -> 3D: load, back-wall rectangle, reconstruction mesh, colour sampling, tap-to-mark, optional AI detection.
import * as THREE from 'three';
import { reconstruct, pixelTo3D, camToRoom, photoFrameToRoom, medianColor, palette, readExif, hfovFromF35, DEFAULT_F35 } from './geom.js';

export const WALLS = ['N', 'E', 'S', 'W'];
export const MAX_SIDE = 1600;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Downscale to MAX_SIDE, return { canvas, data, w, h, url, f35, lensSource, fov }.
// The lens comes from EXIF (FocalLengthIn35mmFilm) when the photo has it; otherwise 26 mm is assumed.
export async function preparePhoto(fileOrUrl) {
  let exif = null;
  if (typeof fileOrUrl !== 'string' && fileOrUrl.arrayBuffer) {
    try {
      exif = readExif(await fileOrUrl.slice(0, 256 * 1024).arrayBuffer());
    } catch {
      exif = null;
    }
  }
  const src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  const img = await loadImage(src);
  const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s);
  const h = Math.round(img.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  const ph = { canvas: c, data, w, h, url: c.toDataURL('image/jpeg', 0.85), exif };
  setLens(ph, exif && exif.f35 ? exif.f35 : DEFAULT_F35, exif && exif.f35 ? 'exif' : 'assumed');
  return ph;
}

// Lens of one photo (35 mm-equivalent focal length) -> its horizontal field of view.
export function setLens(photo, f35, source) {
  photo.f35 = f35;
  photo.lensSource = source;
  photo.fov = hfovFromF35(f35, photo.w, photo.h);
}

export function defaultRect(w, h) {
  return { x0: w * 0.3, y0: h * 0.24, x1: w * 0.7, y1: h * 0.6 };
}

export function photoRecon(photo, roomH) {
  return reconstruct({ imgW: photo.w, imgH: photo.h, rect: photo.rect, roomH, fovDeg: photo.fov || 69.4 });
}

// Room size suggested by one photo: the wall it faces gives that wall's length.
export function suggestDims(photo, roomH) {
  const rc = photoRecon(photo, roomH);
  const along = photo.wall === 'N' || photo.wall === 'S' ? 'w' : 'd';
  return { along, length: rc.roomW, depth: Math.max(2, rc.Zb + 0.4), camH: rc.camH, rc };
}

function toRoom(rc, p, photo, room) {
  // depth along the photo's view axis = the dimension perpendicular to the facing wall
  const facingLen = photo.wall === 'N' || photo.wall === 'S' ? room.d : room.w;
  const q = camToRoom(rc, p, facingLen);
  return photoFrameToRoom(q, WALLS.indexOf(photo.wall));
}

// 3D shell textured with the photo, in room coordinates.
export function buildPhotoMesh(photo, room) {
  const rc = photoRecon(photo, room.h);
  const GX = 96;
  const GY = Math.round((GX * photo.h) / photo.w);
  const pos = new Float32Array((GX + 1) * (GY + 1) * 3);
  const uv = new Float32Array((GX + 1) * (GY + 1) * 2);
  let n = 0;
  for (let j = 0; j <= GY; j++) {
    for (let i = 0; i <= GX; i++) {
      const u = (i / GX) * photo.w;
      const v = (j / GY) * photo.h;
      const p = toRoom(rc, pixelTo3D(rc, u, v), photo, room);
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
      uv[n * 2] = i / GX;
      uv[n * 2 + 1] = 1 - j / GY;
      n++;
    }
  }
  const idx = [];
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const a = j * (GX + 1) + i;
      const b = a + 1;
      const c = a + GX + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = new THREE.CanvasTexture(photo.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  mesh.name = 'photo-shell';
  const cam = toRoom(rc, { x: 0, y: 0, z: 0 }, photo, room);
  const tgt = toRoom(rc, { x: 0, y: 0, z: -rc.Zb }, photo, room);
  const vfov = (2 * Math.atan(photo.h / 2 / rc.f) * 180) / Math.PI;
  return { mesh, pose: { pos: cam, target: tgt, vfov }, rc };
}

// Wall / floor colours from the photo (median, above-horizon walls only to skip furniture).
export function sampleColors(photo, roomH) {
  const rc = photoRecon(photo, roomH);
  const faceAt = (u, v) => pixelTo3D(rc, u, v).face;
  const wall = medianColor(photo.data, photo.w, photo.h, (u, v) => v < rc.vy && ['back', 'left', 'right'].includes(faceAt(u, v)), 5);
  const floor = medianColor(photo.data, photo.w, photo.h, (u, v) => faceAt(u, v) === 'floor' && v > photo.h * 0.8, 5);
  const ceiling = medianColor(photo.data, photo.w, photo.h, (u, v) => faceAt(u, v) === 'ceiling', 6);
  return { wall, floor, ceiling };
}

// Floor point (room frame) under an image pixel; null if the pixel is not on the floor.
export function photoFloorPoint(photo, room, u, v) {
  const rc = photoRecon(photo, room.h);
  const p = pixelTo3D(rc, u, v);
  if (p.face !== 'floor') return null;
  return toRoom(rc, p, photo, room);
}

// Wall hit (for marking windows/doors): returns { wall, offset } in room terms.
export function photoWallPoint(photo, room, u, v) {
  const rc = photoRecon(photo, room.h);
  const p = pixelTo3D(rc, u, v);
  if (!['back', 'left', 'right'].includes(p.face)) return null;
  const q = toRoom(rc, p, photo, room);
  const ax = Math.abs(q.x) / (room.w / 2);
  const az = Math.abs(q.z) / (room.d / 2);
  let wall;
  if (az >= ax) wall = q.z < 0 ? 'N' : 'S';
  else wall = q.x > 0 ? 'E' : 'W';
  let offset;
  if (wall === 'N') offset = q.x + room.w / 2;
  else if (wall === 'S') offset = room.w / 2 - q.x;
  else if (wall === 'E') offset = q.z + room.d / 2;
  else offset = room.d / 2 - q.z;
  return { wall, offset, y: q.y };
}

// Metres per pixel at a floor point (for sizing detected boxes).
export function metresPerPixel(photo, room, u, v) {
  const rc = photoRecon(photo, room.h);
  const p = pixelTo3D(rc, u, v);
  return -p.z / rc.f;
}

export function imagePalette(photo, k = 5) {
  const step = Math.max(1, Math.floor((photo.w * photo.h) / 20000));
  return palette(photo.data, k, step);
}

// ---------- optional on-device AI detection (transformers.js, downloads ~40 MB once) ----------
const LABEL_MAP = { bed: 'bed', couch: 'sofa', chair: 'chair', 'dining table': 'diningTable', tv: 'tvStand',
  'potted plant': 'plant', refrigerator: 'wardrobe', book: null, laptop: null, clock: null, vase: null };

let detector = null;
export async function aiDetect(photo, onStatus) {
  if (!detector) {
    onStatus && onStatus('loading');
    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
    mod.env.allowLocalModels = false;
    detector = await mod.pipeline('object-detection', 'Xenova/detr-resnet-50');
  }
  onStatus && onStatus('running');
  const out = await detector(photo.url, { threshold: 0.7, percentage: false });
  return out.map((d) => ({ type: LABEL_MAP[d.label], label: d.label, score: d.score, box: d.box })).filter((d) => d.type);
}

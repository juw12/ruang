// Ruang 3D viewer: room shell with real openings, furniture, 7 render styles, cutaway, drag, split, sun, flow overlay.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { OutlineEffect } from 'three/addons/OutlineEffect.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { buildItem, makeTexture, shade } from './models.js';
import { wallPoint, hexToRgb, rgbToHex, saturation } from './geom.js';

export const STYLES = ['realistic', 'miniature', 'pixel', 'cartoon', 'clay', 'blueprint', 'sketch'];

const WALL_T = 0.1;
const DOOR_H = 2.05;

export function kelvinToHex(k) {
  const t = k / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * (t - 60) ** -0.1332;
    g = 288.12 * (t - 60) ** -0.0755;
    b = 255;
  }
  return rgbToHex([r, g, b]);
}

function wallTex(finish) {
  const map = { paint: 'plaster', plaster: 'plaster', wallpaper: 'wallpaper', panel: 'panel', brick: 'brick', wood: 'woodpanel', shiplap: 'shiplap', tile: 'tile' };
  return map[finish] || 'plaster';
}

function floorTex(type) {
  const map = { laminate: 'wood', vinyl: 'wood', parquet: 'parquet', oak: 'oak', walnut: 'walnut', tile: 'tile', terracotta: 'terracotta',
    zellige: 'zellige', stone: 'stone', terrazzo: 'terrazzo', concrete: 'concrete', carpet: 'carpet', tatami: 'tatami', ondol: 'ondol' };
  return map[type] || 'wood';
}

function texFor(kind, color, w, h, u0 = 0, v0 = 0, opts) {
  const base = makeTexture(kind, color, opts);
  const t = base.clone();
  t.needsUpdate = true;
  const s = base.userData.size || 1;
  if (s > 0) {
    t.repeat.set(w / s, h / s);
    t.offset.set(u0 / s, v0 / s);
  }
  return t;
}

// ---------- room shell ----------
export function buildRoomGroup(room, finish) {
  const g = new THREE.Group();
  g.name = 'room';
  const wallColor = finish.wall.color;
  const wkind = wallTex(finish.wall.finish);
  const mk = (geo, kind, color, map) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: map || null }));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = { kind, baseColor: color, map: map || null, solid: true };
    return m;
  };
  // floor
  const floorMap = texFor(floorTex(finish.floor.type), finish.floor.color, room.w, room.d);
  const floor = mk(new THREE.PlaneGeometry(room.w, room.d), 'floor', finish.floor.color, floorMap);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  floor.userData.solid = false;
  floor.name = 'floor';
  g.add(floor);
  // ceiling
  const ceil = mk(new THREE.PlaneGeometry(room.w + 2 * WALL_T, room.d + 2 * WALL_T), 'ceiling', finish.ceiling || '#f6f4ef');
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = room.h;
  ceil.name = 'ceiling';
  g.add(ceil);
  // walls with openings
  const walls = { N: room.w, E: room.d, S: room.w, W: room.d };
  for (const wall of Object.keys(walls)) {
    const len = walls[wall];
    const wg = new THREE.Group();
    wg.name = 'wall-' + wall;
    const p0 = wallPoint(room, wall, 0);
    const p1 = wallPoint(room, wall, len);
    const ux = (p1.x - p0.x) / len;
    const uz = (p1.z - p0.z) / len;
    wg.userData = { wall, normal: new THREE.Vector3(p0.nx, 0, p0.nz), center: new THREE.Vector3((p0.x + p1.x) / 2, room.h / 2, (p0.z + p1.z) / 2) };
    const ops = [
      ...room.doors.filter((o) => o.wall === wall).map((o) => ({ ...o, sill: 0, height: o.height || DOOR_H, door: true })),
      ...room.windows.filter((o) => o.wall === wall).map((o) => ({ ...o })),
    ].map((o) => ({ ...o, a: Math.max(0, o.offset), b: Math.min(len, o.offset + o.width) })).filter((o) => o.b > o.a + 0.05)
      .sort((a, b) => a.a - b.a);
    const pieces = [];
    let cursor = -WALL_T;
    for (const o of ops) {
      if (o.a > cursor) pieces.push([cursor, o.a, 0, room.h]);
      if (o.sill > 0) pieces.push([o.a, o.b, 0, o.sill]);
      if (o.sill + o.height < room.h) pieces.push([o.a, o.b, o.sill + o.height, room.h]);
      cursor = Math.max(cursor, o.b);
    }
    if (cursor < len + WALL_T) pieces.push([cursor, len + WALL_T, 0, room.h]);
    for (const [a, b, y0, y1] of pieces) {
      const pw = b - a;
      const ph = y1 - y0;
      if (pw <= 0.001 || ph <= 0.001) continue;
      const map = texFor(wkind, wallColor, pw, ph, a, y0, { accent: finish.wall.accent });
      const m = mk(new THREE.BoxGeometry(pw, ph, WALL_T), 'wall', wallColor, map);
      const mid = (a + b) / 2;
      m.position.set(p0.x + ux * mid - p0.nx * WALL_T / 2, y0 + ph / 2, p0.z + uz * mid - p0.nz * WALL_T / 2);
      m.rotation.y = Math.atan2(-uz, ux);
      wg.add(m);
    }
    // baseboard
    const bb = mk(new THREE.BoxGeometry(len, 0.08, 0.015), 'trim', shade(wallColor, 0.93));
    bb.position.set((p0.x + p1.x) / 2 + p0.nx * 0.0075, 0.04, (p0.z + p1.z) / 2 + p0.nz * 0.0075);
    bb.rotation.y = Math.atan2(-uz, ux);
    bb.userData.solid = false;
    wg.add(bb);
    // frames, glass, door leaves
    for (const o of ops) {
      const mid = (o.a + o.b) / 2;
      const cx = p0.x + ux * mid;
      const cz = p0.z + uz * mid;
      const rotY = Math.atan2(-uz, ux);
      const ow = o.b - o.a;
      const frameC = '#e9e5dc';
      const fr = (fw, fh, x, y) => {
        const f = mk(new THREE.BoxGeometry(fw, fh, WALL_T + 0.02), 'trim', frameC);
        f.position.set(cx + ux * x - p0.nx * WALL_T / 2, y, cz + uz * x - p0.nz * WALL_T / 2);
        f.rotation.y = rotY;
        f.userData.solid = false;
        wg.add(f);
      };
      fr(0.05, o.height, -ow / 2, o.sill + o.height / 2);
      fr(0.05, o.height, ow / 2, o.sill + o.height / 2);
      fr(ow, 0.05, 0, o.sill + o.height);
      if (!o.door) {
        fr(ow, 0.05, 0, o.sill);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(ow - 0.06, o.height - 0.06),
          new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.18, roughness: 0.05 }));
        glass.position.set(cx - p0.nx * WALL_T / 2, o.sill + o.height / 2, cz - p0.nz * WALL_T / 2);
        glass.rotation.y = rotY;
        glass.userData = { kind: 'glass', baseColor: '#cfe3ee', solid: false };
        wg.add(glass);
        // sill shelf
        const sill = mk(new THREE.BoxGeometry(ow + 0.1, 0.03, 0.18), 'trim', frameC);
        sill.position.set(cx + p0.nx * 0.05, o.sill, cz + p0.nz * 0.05);
        sill.rotation.y = rotY;
        sill.userData.solid = false;
        wg.add(sill);
      } else {
        // open door leaf (hinged at the left jamb, swings into the room by 70 deg)
        const leaf = mk(new THREE.BoxGeometry(ow - 0.04, o.height - 0.02, 0.04), 'door', '#d9cdb8');
        leaf.userData.solid = false;
        const hinge = new THREE.Group();
        hinge.position.set(p0.x + ux * o.a, 0, p0.z + uz * o.a);
        hinge.rotation.y = rotY;
        leaf.position.set((ow - 0.04) / 2, (o.height - 0.02) / 2, 0.02);
        const pivot = new THREE.Group();
        pivot.rotation.y = -1.2;
        pivot.add(leaf);
        hinge.add(pivot);
        wg.add(hinge);
        // swing arc on the floor
        const arc = new THREE.Mesh(new THREE.RingGeometry(ow - 0.06, ow - 0.04, 32, 1, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: '#8a8478', side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
        arc.rotation.x = -Math.PI / 2;
        arc.position.y = 0.004;
        const arcG = new THREE.Group();
        arcG.position.copy(hinge.position);
        arcG.rotation.y = rotY - Math.PI / 2;
        arcG.add(arc);
        arc.rotation.z = Math.PI / 2;
        arc.userData = { kind: 'overlay', solid: false };
        wg.add(arcG);
      }
    }
    g.add(wg);
  }
  return g;
}

// ---------- materials per style ----------
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

function boost(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex([l + (r - l) * f, l + (g - l) * f, l + (b - l) * f]);
}

function materialFor(style, ud) {
  const color = ud.baseColor || '#cccccc';
  const kind = ud.kind;
  const emissive = ud.emissive;
  const texKind = ud.tex;
  const map = ud.map || (texKind ? texFor(texKind === 'wood' ? 'wood' : texKind, color, 1, 1) : null);
  if (kind === 'glass') {
    if (style === 'blueprint' || style === 'sketch') return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    return new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: style === 'realistic' ? 0.15 : 0.3, roughness: 0.05 });
  }
  if (kind === 'overlay') return new THREE.MeshBasicMaterial({ color: style === 'blueprint' ? '#dfe9f3' : '#8a8478', side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const rough = { fabric: 0.95, rug: 1, wood: 0.6, floor: 0.55, wall: 0.92, metal: 0.35, plant: 0.7, mirror: 0.05, screen: 0.2, light: 0.6, paper: 0.9, pot: 0.8, trim: 0.6, door: 0.6, ceiling: 0.95 }[kind] ?? 0.7;
  switch (style) {
    case 'realistic': {
      const m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map, roughness: rough, metalness: kind === 'metal' ? 0.6 : kind === 'mirror' ? 0.9 : 0 });
      if (kind === 'ceiling') {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = 0.55;
      }
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = 0.9;
      }
      return m;
    }
    case 'miniature': {
      const m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : boost(color, 1.25), map, roughness: Math.min(rough, 0.55), metalness: 0 });
      if (map) m.color = new THREE.Color(boost('#ffffff', 1));
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = 1;
      }
      return m;
    }
    case 'pixel':
      return new THREE.MeshLambertMaterial({ color: boost(color, 1.15), emissive: emissive ? new THREE.Color(emissive).multiplyScalar(0.6) : undefined, flatShading: true });
    case 'cartoon': {
      const m = new THREE.MeshToonMaterial({ color: boost(color, 1.3), gradientMap, emissive: emissive ? new THREE.Color(emissive).multiplyScalar(0.5) : undefined });
      m.userData.outlineParameters = { thickness: 0.0045, color: [0.12, 0.1, 0.09], alpha: 1, visible: !['floor', 'ceiling', 'overlay'].includes(kind) };
      return m;
    }
    case 'clay': {
      const tint = kind === 'plant' ? '#c9d3bd' : kind === 'floor' ? '#ddd5c8' : kind === 'wall' ? '#ece6dc' : kind === 'fabric' || kind === 'rug' ? '#e6dfd4' : '#efe9e0';
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0, emissive: emissive ? new THREE.Color('#2a2014') : undefined });
    }
    case 'blueprint':
      return new THREE.MeshBasicMaterial({ color: kind === 'floor' ? '#174777' : '#1d5288', transparent: true, opacity: kind === 'floor' ? 1 : 0.35, depthWrite: kind === 'floor' });
    case 'sketch': {
      const m = new THREE.MeshLambertMaterial({ color: kind === 'floor' ? '#efe9dd' : '#fbfaf6' });
      m.userData.outlineParameters = { thickness: 0.003, color: [0.15, 0.15, 0.15], alpha: 1, visible: !['floor', 'ceiling', 'overlay'].includes(kind) };
      return m;
    }
    default:
      return new THREE.MeshStandardMaterial({ color });
  }
}

const POST_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const TILT_FRAG = `
uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus; uniform float amount; varying vec2 vUv;
void main(){
  float d = abs(vUv.y - focus);
  float blur = smoothstep(0.06, 0.42, d) * amount;
  vec4 sum = vec4(0.0); float tot = 0.0;
  for (int i = -4; i <= 4; i++) { for (int j = -4; j <= 4; j++) {
    float wgt = 1.0 - length(vec2(float(i), float(j))) / 6.0;
    if (wgt <= 0.0) continue;
    sum += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * blur / res) * wgt; tot += wgt; } }
  vec4 c = sum / tot;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float l = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor.rgb = mix(vec3(l), gl_FragColor.rgb, 1.3);
  gl_FragColor.rgb = (gl_FragColor.rgb - 0.5) * 1.06 + 0.52;
  float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
  gl_FragColor.rgb *= mix(0.84, 1.0, v);
}`;
const PIXEL_FRAG = `
uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv;
void main(){
  gl_FragColor = texture2D(tDiffuse, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = floor(gl_FragColor.rgb * levels + 0.5) / levels;
}`;

function isShown(o) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
  }
  return true;
}

export class Viewer {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    this.style = 'realistic';
    this.mode = 'model';
    this.split = 0.5;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '3D room view');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.camera.position.set(4, 4.5, 6);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.9, 0);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.outline = new OutlineEffect(this.renderer);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // lights
    this.hemi = new THREE.HemisphereLight('#fffaf0', '#8a7f70', 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3df', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -7;
    this.sun.shadow.camera.right = 7;
    this.sun.shadow.camera.top = 7;
    this.sun.shadow.camera.bottom = -7;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.ceilLight = new THREE.PointLight('#ffe2b8', 6, 12, 1.6);
    this.ceilLight.castShadow = true;
    this.ceilLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.ceilLight);
    this.fill = new THREE.DirectionalLight('#ffffff', 0.35);
    this.fill.position.set(-3, 6, 4);
    this.scene.add(this.fill);
    // groups
    this.roomGroup = new THREE.Group();
    this.itemsGroup = new THREE.Group();
    this.afterRoom = new THREE.Group();
    this.afterItems = new THREE.Group();
    this.photoGroup = new THREE.Group();
    this.helpers = new THREE.Group();
    this.scene.add(this.roomGroup, this.itemsGroup, this.afterRoom, this.afterItems, this.photoGroup, this.helpers);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.53, 48), new THREE.MeshBasicMaterial({ color: '#c2562b', transparent: true, opacity: 0.95, depthTest: false }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.renderOrder = 10;
    this.selRing.visible = false;
    this.helpers.add(this.selRing);
    this.flowMesh = null;
    // post
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.rtSmall = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.tiltMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: TILT_FRAG, uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, focus: { value: 0.45 }, amount: { value: 2.6 } } });
    this.pixMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: PIXEL_FRAG, uniforms: { tDiffuse: { value: null }, levels: { value: 7 } } });
    this.tiltMat.toneMapped = true;
    this.pixMat.toneMapped = true;
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.tiltMat);
    this.postScene.add(this.postQuad);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.items = [];
    this.room = null;
    this.selected = null;
    this.drag = null;
    this.walk = { yaw: 0, pitch: 0, keys: new Set() };
    this.installPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(container);
    this.clock = new THREE.Clock();
    // Render on demand: every public method marks the view dirty, orbit changes fire
    // 'change', and a 1 fps heartbeat catches async texture loads. Saves battery on
    // phones and keeps the page responsive on slow CPUs.
    this.dirty = 3;
    const skip = new Set(['constructor', 'frame', 'tick', 'renderOnce', 'renderOnceDirect', 'snapshot', 'invalidate', 'sunHours', 'updateCutaway', 'walkStep']);
    for (const name of Object.getOwnPropertyNames(Viewer.prototype)) {
      const fn = this[name];
      if (skip.has(name) || typeof fn !== 'function') continue;
      this[name] = (...args) => {
        const out = fn.apply(this, args);
        this.invalidate();
        return out;
      };
    }
    this.controls.addEventListener('change', () => this.invalidate());
    setInterval(() => this.invalidate(1), 1000);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  invalidate(frames = 2) {
    this.dirty = Math.max(this.dirty, frames);
  }

  tick() {
    if (this.mode === 'walk' || this.drag) {
      this.frame();
      return;
    }
    this.controls.update();
    if (this.dirty > 0) {
      this.dirty -= 1;
      this.frame();
    } else {
      this.clock.getDelta();
    }
  }

  resize() {
    const w = Math.max(10, this.container.clientWidth);
    const h = Math.max(10, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(w * pr, h * pr);
    this.tiltMat.uniforms.res.value.set(w * pr, h * pr);
    const ph = 150;
    this.rtSmall.setSize(Math.round((ph * w) / h), ph);
  }

  // ---- content ----
  setRoom(room, finish) {
    this.room = room;
    this.finish = finish;
    this.disposeGroup(this.roomGroup);
    this.roomGroup.add(buildRoomGroup(room, finish));
    this.ceilLight.position.set(0, room.h - 0.55, 0);
    this.ceilLight.color.set(kelvinToHex(finish.lightK || 3000));
    this.addDimensions(room);
    this.applyStyleTo(this.roomGroup);
    this.updateCutaway(true);
  }

  setItems(items, pal) {
    this.items = items;
    this.pal = pal;
    this.disposeGroup(this.itemsGroup);
    for (const it of items) this.itemsGroup.add(this.placeMesh(buildItem(it, pal), it));
    this.applyStyleTo(this.itemsGroup);
    this.refreshSelection();
  }

  setAfter(room, finish, items, pal) {
    this.disposeGroup(this.afterRoom);
    this.disposeGroup(this.afterItems);
    if (!room) {
      this.hasAfter = false;
      return;
    }
    this.hasAfter = true;
    this.afterRoom.add(buildRoomGroup(room, finish));
    for (const it of items) this.afterItems.add(this.placeMesh(buildItem(it, pal), it));
    this.afterLightK = finish.lightK;
    this.applyStyleTo(this.afterRoom);
    this.applyStyleTo(this.afterItems);
  }

  placeMesh(g, it) {
    g.position.set(it.x, 0, it.z);
    g.rotation.y = it.rot || 0;
    return g;
  }

  updateItem(it) {
    const g = this.itemsGroup.children.find((c) => c.userData.itemId === it.id);
    if (g) this.placeMesh(g, it);
    this.refreshSelection();
  }

  disposeGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
  }

  addDimensions(room) {
    const dim = new THREE.Group();
    dim.name = 'dims';
    const mat = new THREE.LineBasicMaterial({ color: '#2a2f33' });
    const label = (text, x, z) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#f4f1ea';
      g.fillRect(40, 10, 176, 44);
      g.fillStyle = '#1e2328';
      g.font = '600 30px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 128, 33);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      sp.scale.set(0.8, 0.2, 1);
      sp.position.set(x, 0.05, z);
      sp.renderOrder = 5;
      dim.add(sp);
    };
    const off = 0.45;
    const line = (pts) => dim.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.01, z))), mat));
    const zN = -room.d / 2 - off;
    line([[-room.w / 2, zN], [room.w / 2, zN]]);
    line([[-room.w / 2, zN - 0.08], [-room.w / 2, zN + 0.08]]);
    line([[room.w / 2, zN - 0.08], [room.w / 2, zN + 0.08]]);
    const xW = -room.w / 2 - off;
    line([[xW, -room.d / 2], [xW, room.d / 2]]);
    line([[xW - 0.08, -room.d / 2], [xW + 0.08, -room.d / 2]]);
    line([[xW - 0.08, room.d / 2], [xW + 0.08, room.d / 2]]);
    const fmt = this.cb.formatLength || ((m) => m.toFixed(2) + ' m');
    label(fmt(room.w), 0, zN);
    label(fmt(room.d), xW, 0);
    dim.userData.isDims = true;
    this.roomGroup.add(dim);
  }

  // ---- photo shell ----
  setPhotoShell(mesh, camPose) {
    this.disposeGroup(this.photoGroup);
    if (mesh) this.photoGroup.add(mesh);
    this.photoPose = camPose;
  }

  // ---- styles ----
  setStyle(style) {
    this.style = style;
    this.applyStyleTo(this.roomGroup);
    this.applyStyleTo(this.itemsGroup);
    this.applyStyleTo(this.afterRoom);
    this.applyStyleTo(this.afterItems);
    const bg = { realistic: '#e9e4da', miniature: '#d9e4e6', pixel: '#2b3a3f', cartoon: '#f3e7cf', clay: '#e6e0d6', blueprint: '#12355b', sketch: '#f6f3ec' }[style];
    this.scene.background = new THREE.Color(bg);
    this.scene.environment = style === 'realistic' || style === 'miniature' ? this.envMap : null;
    this.renderer.shadowMap.enabled = !['blueprint', 'sketch'].includes(style);
    this.renderer.toneMappingExposure = style === 'miniature' ? 1.15 : style === 'clay' ? 1.1 : 1.0;
    this.hemiBase = { realistic: 0.6, miniature: 0.9, pixel: 1.2, cartoon: 1.4, clay: 1.0, blueprint: 1, sketch: 1.6 }[style];
    this.hemi.intensity = this.hemiBase;
    this.camera.fov = style === 'miniature' ? 28 : 45;
    this.camera.updateProjectionMatrix();
    this.selRing.material.color.set(style === 'blueprint' ? '#f4c06a' : '#c2562b');
    this.renderer.shadowMap.needsUpdate = true;
  }

  applyStyleTo(group) {
    const style = this.style;
    group.traverse((o) => {
      if (o.isMesh && o.userData && o.userData.kind) {
        if (o.material) o.material.dispose();
        o.material = materialFor(style, o.userData);
        const edgy = style === 'blueprint' || style === 'sketch';
        let edge = o.children.find((c) => c.userData.edge);
        if (edgy && !['overlay', 'glass'].includes(o.userData.kind)) {
          if (!edge) {
            edge = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), new THREE.LineBasicMaterial({ color: '#ffffff' }));
            edge.userData.edge = true;
            o.add(edge);
          }
          edge.material.color.set(style === 'blueprint' ? '#dfe9f3' : '#2a2a2a');
          edge.visible = true;
        } else if (edge) {
          edge.visible = false;
        }
      }
    });
  }

  // ---- modes / cameras ----
  setMode(mode) {
    this.mode = mode;
    const photo = mode === 'photo';
    this.photoGroup.visible = photo;
    this.roomGroup.visible = !photo;
    if (photo && this.photoPose) this.toPhotoCamera();
    if (mode === 'walk') this.startWalk();
    this.controls.enabled = mode !== 'walk';
    this.updateCutaway(true);
  }

  toPhotoCamera() {
    const p = this.photoPose;
    this.camera.fov = p.vfov;
    this.camera.position.set(p.pos.x, p.pos.y, p.pos.z);
    this.controls.target.set(p.target.x, p.target.y, p.target.z);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setCameraPreset(name) {
    const r = this.room || { w: 4, d: 4, h: 2.7 };
    const span = Math.max(r.w, r.d);
    this.camera.fov = this.style === 'miniature' ? 28 : 45;
    const k = this.style === 'miniature' ? 1.6 : 1;
    if (name === 'top') {
      this.camera.position.set(0.001, span * 2.1 * k, 0.01);
      this.controls.target.set(0, 0, 0);
    } else if (name === 'eye') {
      this.camera.position.set(r.w * 0.3, 1.55, r.d * 0.42);
      this.controls.target.set(-r.w * 0.1, 1.1, -r.d / 2);
    } else {
      this.camera.position.set(span * 0.95 * k, span * 1.05 * k, span * 1.25 * k);
      this.controls.target.set(0, 0.7, 0);
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.updateCutaway(true);
  }

  startWalk() {
    const r = this.room || { w: 4, d: 4 };
    this.camera.fov = 70;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, this.cb.eyeHeight ? this.cb.eyeHeight() : 1.6, r.d / 2 - 0.5);
    this.walk.yaw = 0;
    this.walk.pitch = -0.05;
  }

  updateCutaway(force) {
    const camPos = this.camera.position;
    for (const grp of [this.roomGroup, this.afterRoom]) {
      const room = grp.children[0];
      if (!room) continue;
      for (const c of room.children) {
        if (c.name.startsWith('wall-')) {
          const toCam = camPos.clone().sub(c.userData.center);
          c.visible = this.mode === 'walk' || toCam.dot(c.userData.normal) > -0.05;
        }
        if (c.name === 'ceiling') c.visible = this.mode === 'walk' || (this.room && camPos.y < this.room.h - 0.05);
        if (c.name === 'dims' && this.room) {
          const inside = Math.abs(camPos.x) < this.room.w / 2 && Math.abs(camPos.z) < this.room.d / 2 && camPos.y < this.room.h;
          c.visible = !inside;
        }
      }
    }
    if (force) this.renderer.shadowMap.needsUpdate = true;
  }

  // ---- sun + time ----
  setSun(vec, daylight, lightK, indoorOn) {
    this.sunVec = vec;
    if (vec && vec.y > 0) {
      this.sun.visible = true;
      this.sun.position.set(vec.x * 12, vec.y * 12, vec.z * 12);
      this.sun.target.position.set(0, 0, 0);
      this.sun.intensity = 1.2 + 2.2 * Math.min(1, vec.y * 2);
      this.sun.color.set(vec.y < 0.25 ? '#ffd2a0' : '#fff3df');
    } else {
      this.sun.visible = false;
    }
    this.hemi.intensity = (this.hemiBase || 0.6) * (daylight ? 1 : 0.22);
    this.ceilLight.intensity = indoorOn ? 7 : 0;
    if (lightK) this.ceilLight.color.set(kelvinToHex(lightK));
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Direct-sun hours on items' top surfaces, sampled every 30 min, through real openings.
  sunHours(items, sunVecAt) {
    const solids = [];
    this.roomGroup.traverse((o) => {
      if (o.isMesh && o.userData.solid) solids.push(o);
    });
    const rc = new THREE.Raycaster();
    const res = {};
    for (const it of items) {
      if (it.flat) continue;
      let hours = 0;
      const windows = [];
      for (let t = 6; t <= 18; t += 0.5) {
        const v = sunVecAt(t);
        if (!v || v.y <= 0.02) continue;
        const o = new THREE.Vector3(it.x, Math.min(it.h + 0.02, (this.room?.h || 2.6) - 0.1), it.z);
        rc.set(o, new THREE.Vector3(v.x, v.y, v.z).normalize());
        rc.far = 30;
        const hit = rc.intersectObjects(solids, false);
        if (!hit.length) {
          hours += 0.5;
          windows.push(t);
        }
      }
      res[it.id] = { hours, from: windows[0], to: windows[windows.length - 1] };
    }
    return res;
  }

  // ---- flow overlay ----
  setFlow(grid, room) {
    if (this.flowMesh) {
      this.helpers.remove(this.flowMesh);
      this.flowMesh.geometry.dispose();
      this.flowMesh = null;
    }
    if (!grid) return;
    const data = new Uint8Array(grid.nx * grid.nz * 4);
    for (let k = 0; k < grid.nz; k++) {
      for (let i = 0; i < grid.nx; i++) {
        const c = k * grid.nx + i;
        const o = c * 4;
        if (grid.reach[c]) {
          const cl = grid.clear[c];
          const col = cl >= 0.45 ? [61, 145, 98] : cl >= 0.36 ? [214, 160, 50] : [200, 70, 50];
          data.set([...col, 150], o);
        } else if (!grid.blocked[c]) {
          data.set([120, 120, 120, 90], o);
        } else {
          data.set([0, 0, 0, 0], o);
        }
      }
    }
    const tex = new THREE.DataTexture(data, grid.nx, grid.nz, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.scale.y = -1;
    m.position.y = 0.02;
    m.renderOrder = 4;
    this.flowMesh = m;
    this.helpers.add(m);
  }

  // ---- selection + drag ----
  select(id) {
    this.selected = id;
    this.refreshSelection();
  }

  refreshSelection() {
    const it = this.items.find((x) => x.id === this.selected);
    if (!it || this.mode === 'photo') {
      this.selRing.visible = false;
      return;
    }
    const r = Math.hypot(it.w, it.d) / 2 + 0.08;
    this.selRing.visible = true;
    this.selRing.scale.set(r / 0.5, r / 0.5, 1);
    this.selRing.position.set(it.x, 0.015, it.z);
  }

  setInvalid(ids) {
    const bad = new Set(ids);
    this.itemsGroup.children.forEach((g) => {
      g.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          if (bad.has(g.userData.itemId)) {
            o.material.emissive.set('#9b1c0c');
            o.material.emissiveIntensity = 0.55;
          } else if (!o.userData.emissive) {
            o.material.emissive.set('#000000');
          }
        }
      });
    });
  }

  installPointer() {
    const el = this.canvas;
    const toNdc = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.mode === 'walk') {
        this.walk.look = { x: e.clientX, y: e.clientY };
        return;
      }
      toNdc(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      // three.js raycasting ignores .visible, and hidden edge LineSegments (from the
      // blueprint/sketch styles) use a 1 m line threshold — only pick visible meshes.
      const hits = this.raycaster.intersectObjects(this.itemsGroup.children, true).filter((h) => h.object.isMesh && isShown(h.object));
      if (hits.length) {
        let o = hits[0].object;
        while (o && o.userData.itemId === undefined) o = o.parent;
        if (o) {
          const it = this.items.find((x) => x.id === o.userData.itemId);
          const p = new THREE.Vector3();
          this.raycaster.ray.intersectPlane(this.floorPlane, p);
          this.drag = { id: it.id, dx: it.x - p.x, dz: it.z - p.z, moved: false, start: { x: it.x, z: it.z } };
          this.controls.enabled = false;
          el.setPointerCapture(e.pointerId);
          this.select(it.id);
          this.cb.onSelect && this.cb.onSelect(it.id);
          e.stopPropagation();
          return;
        }
      }
      this.downAt = { x: e.clientX, y: e.clientY };
    }, { capture: true });
    el.addEventListener('pointermove', (e) => {
      if (this.mode === 'walk' && this.walk.look) {
        this.walk.yaw -= (e.clientX - this.walk.look.x) * 0.005;
        this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.pitch - (e.clientY - this.walk.look.y) * 0.004));
        this.walk.look = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!this.drag) return;
      toNdc(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return;
      const it = this.items.find((x) => x.id === this.drag.id);
      const snap = e.shiftKey ? 0.01 : 0.05;
      it.x = Math.round((p.x + this.drag.dx) / snap) * snap;
      it.z = Math.round((p.z + this.drag.dz) / snap) * snap;
      this.drag.moved = true;
      this.updateItem(it);
      this.cb.onDrag && this.cb.onDrag(it);
    });
    const end = (e) => {
      this.walk.look = null;
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        this.controls.enabled = this.mode !== 'walk';
        if (d.moved) this.cb.onDragEnd && this.cb.onDragEnd(d.id, d.start);
      } else if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 4) {
        this.select(null);
        this.cb.onSelect && this.cb.onSelect(null);
      }
      this.downAt = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'walk') this.walk.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.walk.keys.delete(e.key.toLowerCase()));
  }

  walkStep(dt) {
    const k = this.walk.keys;
    const sp = 1.4 * dt;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + (this.walk.fwd || 0);
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const yaw = this.walk.yaw;
    const p = this.camera.position;
    p.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp;
    p.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp;
    if (this.room) {
      p.x = Math.max(-this.room.w / 2 + 0.2, Math.min(this.room.w / 2 - 0.2, p.x));
      p.z = Math.max(-this.room.d / 2 + 0.2, Math.min(this.room.d / 2 - 0.2, p.z));
    }
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(this.walk.pitch), Math.sin(this.walk.pitch), -Math.cos(yaw) * Math.cos(this.walk.pitch));
    this.camera.lookAt(p.clone().add(dir));
  }

  // ---- render ----
  renderOnce(scene, camera) {
    const style = this.style;
    if (style === 'cartoon' || style === 'sketch') {
      this.outline.render(scene, camera);
    } else if (style === 'miniature' || style === 'pixel') {
      const target = style === 'pixel' ? this.rtSmall : this.rt;
      this.renderer.setRenderTarget(target);
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);
      this.postQuad.material = style === 'pixel' ? this.pixMat : this.tiltMat;
      this.postQuad.material.uniforms.tDiffuse.value = target.texture;
      this.renderer.render(this.postScene, this.postCam);
    } else {
      this.renderer.render(scene, camera);
    }
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === 'walk') this.walkStep(dt);
    else this.controls.update();
    this.updateCutaway(false);
    const splitOn = this.mode === 'split' && this.hasAfter;
    if (!splitOn) {
      this.afterRoom.visible = false;
      this.afterItems.visible = false;
      this.itemsGroup.visible = this.mode !== 'photo' || this.showItemsInPhoto;
      this.roomGroup.visible = this.mode !== 'photo';
      this.renderOnce(this.scene, this.camera);
    } else {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      const sx = Math.round(w * this.split);
      this.renderer.setScissorTest(true);
      // before (left)
      this.renderer.setScissor(0, 0, sx, h);
      this.roomGroup.visible = true;
      this.itemsGroup.visible = true;
      this.afterRoom.visible = false;
      this.afterItems.visible = false;
      this.ceilLight.color.set(kelvinToHex(this.finish?.lightK || 3000));
      this.renderOnceDirect();
      // after (right)
      this.renderer.setScissor(sx, 0, w - sx, h);
      this.roomGroup.visible = false;
      this.itemsGroup.visible = false;
      this.afterRoom.visible = true;
      this.afterItems.visible = true;
      this.ceilLight.color.set(kelvinToHex(this.afterLightK || 3000));
      this.renderOnceDirect();
      this.renderer.setScissorTest(false);
      this.roomGroup.visible = true;
      this.itemsGroup.visible = true;
    }
  }

  renderOnceDirect() {
    if (this.style === 'cartoon' || this.style === 'sketch') this.outline.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  snapshot(type = 'image/png') {
    this.frame();
    return this.canvas.toDataURL(type);
  }
}

// 3D cap for the design studio (three.js, loaded on demand). The cap is built procedurally in centimetres:
// a lathe-turned crown + a curved peak (sun shade). Customer artwork is painted into the crown / peak textures,
// so the preview turns in every direction in real time.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GARMENTS, fontCss, hasContent, layout, ensureFonts, luminance, shade } from './garments.js';

// ------------------------------------------------------------------ geometry (cm)
const R = 9.2;          // crown radius at the band (≈ 58 cm head)
const HC = 10.5;        // crown height
const VL = 7.2;         // peak length at the centre
const A0 = (76 * Math.PI) / 180; // peak spans ±76° around the front
const PHI_START = (5 * Math.PI) / 4; // texture seam sits between the back and the right side
const CW = 2048, CH = 1024;  // crown texture
const VW = 1024, VH = 512;   // peak texture

const deg = (d) => (d * Math.PI) / 180;
const mod = (a, m) => ((a % m) + m) % m;

// Crown profile resampled evenly by arc length, so the texture's vertical axis is linear in cm.
const PROFILE = (() => {
  const dense = [];
  for (let i = 0; i <= 400; i++) {
    const t = (i / 400) * (Math.PI / 2);
    dense.push([R * Math.pow(Math.cos(t), 0.72), HC * Math.pow(Math.sin(t), 0.92)]);
  }
  const s = [0];
  for (let i = 1; i < dense.length; i++) s.push(s[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = s[s.length - 1];
  const at = (len) => {
    let i = 1;
    while (i < s.length - 1 && s[i] < len) i++;
    const k = (len - s[i - 1]) / (s[i] - s[i - 1] || 1);
    return [dense[i - 1][0] + (dense[i][0] - dense[i - 1][0]) * k, dense[i - 1][1] + (dense[i][1] - dense[i - 1][1]) * k];
  };
  const pts = [];
  for (let j = 0; j <= 96; j++) pts.push(at((j / 96) * total));
  return { pts, total, radiusAt: (len) => Math.max(at(Math.min(len, total))[0], 0.3) };
})();

function visorPoint(a, v) {
  const sa = Math.sin(a), ca = Math.cos(a);
  const inner = [R * sa, 0, R * ca];
  const outer = [R * sa * 1.05, 0, R * ca + VL * Math.pow(Math.max(ca, 0), 1.15)];
  // the peak curves down towards its sides, less where it is short (near the crown sides)
  const reach = Math.pow(Math.max(ca, 0), 0.5);
  const y = -(v * 0.45 + v * v * 0.35 + v * sa * sa * 1.9) * reach;
  return [inner[0] + (outer[0] - inner[0]) * v, y, inner[2] + (outer[2] - inner[2]) * v];
}
const VISOR_LEN_U = (v) => { let L = 0, p = visorPoint(-A0, v); for (let i = 1; i <= 80; i++) { const q = visorPoint(-A0 + (2 * A0 * i) / 80, v); L += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; } return L; };
const VISOR_LEN_V = (() => { let L = 0, p = visorPoint(0, 0); for (let i = 1; i <= 40; i++) { const q = visorPoint(0, i / 40); L += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; } return L; })();

function visorGeometry(offsetY = 0) {
  const NU = 72, NV = 18, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const a = -A0 + (2 * A0 * i) / NU, v = j / NV;
      const [x, y, z] = visorPoint(a, v);
      pos.push(x, y + offsetY, z);
      uv.push(i / NU, 1 - v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ print zones → texture space
const uOf = (d) => mod(deg(d) - PHI_START, Math.PI * 2) / (Math.PI * 2);
/** Where a zone sits in its texture: centre (px) and px per cm on each axis. */
export function zoneFrame(z) {
  if (z.surface === 'visor') return { surface: 'visor', cx: z.u * VW, cy: z.v * VH, sx: VW / VISOR_LEN_U(z.v), sy: VH / VISOR_LEN_V };
  return { surface: 'crown', cx: uOf(z.deg) * CW, cy: (1 - z.s / PROFILE.total) * CH, sx: CW / (2 * Math.PI * PROFILE.radiusAt(z.s)), sy: CH / PROFILE.total };
}
const capZones = () => GARMENTS.cap.zones;

// ------------------------------------------------------------------ texture painting
const imgCache = new Map();
function getImg(src, onLoad) {
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ok: false, waiters: new Set() };
    img.onload = () => { e.ok = true; e.waiters.forEach((f) => f()); e.waiters.clear(); };
    img.src = src;
    imgCache.set(src, e);
  }
  if (!e.ok && onLoad) e.waiters.add(onLoad);
  return e.ok ? e.img : null;
}

function palette(colors) {
  const base = colors?.[0] || '#ffffff';
  const alt = colors?.[1] || base;
  const light = luminance(base) > 0.8;
  return {
    base, alt,
    seam: light ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.42)',
    stitch: light ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.16)',
    inner: shade(base, light ? -0.25 : -0.45),
    strap: shade(base, light ? -0.12 : -0.25),
  };
}

let weave;
function fabric(ctx, w, h) {
  if (!weave) {
    weave = document.createElement('canvas');
    weave.width = weave.height = 8;
    const c = weave.getContext('2d');
    c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 8); c.lineTo(8, 0); c.stroke();
  }
  ctx.fillStyle = ctx.createPattern(weave, 'repeat');
  ctx.fillRect(0, 0, w, h);
}

function drawDesign(ctx, d, z, f, repaint) {
  const L = layout(d, { box: [-z.w / 2, -z.h / 2, z.w, z.h] });
  ctx.save();
  ctx.translate(f.cx, f.cy); ctx.scale(f.sx, f.sy);
  ctx.beginPath(); ctx.rect(-z.w / 2, -z.h / 2, z.w, z.h); ctx.clip();
  ctx.translate(L.cx, L.cy); ctx.rotate(((d.rotate || 0) * Math.PI) / 180);
  if (d.kind === 'image') {
    const img = getImg(d.src, repaint);
    if (img) ctx.drawImage(img, -L.w / 2, -L.h / 2, L.w, L.h);
  } else {
    ctx.fillStyle = d.color || '#000';
    ctx.font = `${d.bold ? 700 : 400} ${L.fs}px ${fontCss(d.font)}, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    L.lines.forEach((ln, i) => ctx.fillText(ln, 0, -L.h / 2 + (i + 0.5) * L.lineH));
  }
  ctx.restore();
}

function drawGuide(ctx, z, f, on) {
  ctx.save();
  ctx.translate(f.cx, f.cy);
  ctx.lineWidth = on ? 4 : 2.5;
  ctx.strokeStyle = on ? '#c41c00' : 'rgba(120,120,120,.85)';
  ctx.setLineDash(on ? [] : [12, 9]);
  ctx.fillStyle = on ? 'rgba(196,28,0,.07)' : 'rgba(196,28,0,.025)';
  const w = z.w * f.sx, h = z.h * f.sy;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function paintCrown(ctx, colors, designs, active, guides, repaint) {
  const p = palette(colors);
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = p.base; ctx.fillRect(0, 0, CW, CH);
  fabric(ctx, CW, CH);
  const yOf = (s) => (1 - s / PROFILE.total) * CH;
  const pxPerCm = (s) => CW / (2 * Math.PI * PROFILE.radiusAt(s));
  // panel seams with twin stitching
  for (const d of [60, 120, 180, 240, 300]) {
    const x = uOf(d) * CW;
    ctx.strokeStyle = p.seam; ctx.lineWidth = 3; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, d === 180 ? yOf(5.6) : CH); ctx.stroke();
    ctx.strokeStyle = p.stitch; ctx.lineWidth = 1.6; ctx.setLineDash([7, 6]);
    for (const off of [-9, 9]) { ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off, d === 180 ? yOf(5.6) : CH); ctx.stroke(); }
  }
  // band stitching
  ctx.strokeStyle = p.stitch; ctx.lineWidth = 1.6; ctx.setLineDash([7, 6]);
  for (const s of [0.5, 0.95]) { ctx.beginPath(); ctx.moveTo(0, yOf(s)); ctx.lineTo(CW, yOf(s)); ctx.stroke(); }
  ctx.setLineDash([]);
  // eyelets
  for (const d of [90, 150, 210, 270]) {
    const x = uOf(d) * CW, y = yOf(PROFILE.total * 0.74);
    ctx.fillStyle = p.inner; ctx.beginPath(); ctx.ellipse(x, y, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.seam; ctx.lineWidth = 2; ctx.stroke();
  }
  // back opening + strap
  {
    const x = uOf(180) * CW, k = pxPerCm(2.5), sy = CH / PROFILE.total;
    const hw = 3.6 * k, top = yOf(5.4), bottom = CH + 2;
    ctx.fillStyle = p.inner;
    ctx.beginPath(); ctx.moveTo(x - hw, bottom); ctx.lineTo(x - hw, top + 1.6 * sy);
    ctx.quadraticCurveTo(x - hw, top, x, top); ctx.quadraticCurveTo(x + hw, top, x + hw, top + 1.6 * sy);
    ctx.lineTo(x + hw, bottom); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = p.seam; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = p.strap; ctx.fillRect(x - hw - 0.6 * k, yOf(2.6), 2 * hw + 1.2 * k, 1.3 * sy);
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x + hw * 0.35, yOf(2.85), 0.9 * k, 1.8 * sy);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(x + hw * 0.35, yOf(2.85), 0.9 * k, 1.8 * sy);
  }
  for (const z of capZones().filter((x) => x.surface !== 'visor')) if (hasContent(designs[z.id])) drawDesign(ctx, designs[z.id], z, zoneFrame(z), repaint);
  if (guides) for (const z of capZones().filter((x) => x.surface !== 'visor')) if (guides === true || z.id === active) drawGuide(ctx, z, zoneFrame(z), z.id === active);
}

function paintVisor(ctx, colors, designs, active, guides, repaint) {
  const p = palette(colors);
  ctx.clearRect(0, 0, VW, VH);
  ctx.fillStyle = p.alt; ctx.fillRect(0, 0, VW, VH);
  fabric(ctx, VW, VH);
  ctx.strokeStyle = palette([p.alt]).stitch; ctx.lineWidth = 2; ctx.setLineDash([9, 7]);
  for (const v of [0.12, 0.3, 0.5, 0.7, 0.9]) { ctx.beginPath(); ctx.moveTo(0, v * VH); ctx.lineTo(VW, v * VH); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const z of capZones().filter((x) => x.surface === 'visor')) if (hasContent(designs[z.id])) drawDesign(ctx, designs[z.id], z, zoneFrame(z), repaint);
  if (guides) for (const z of capZones().filter((x) => x.surface === 'visor')) if (guides === true || z.id === active) drawGuide(ctx, z, zoneFrame(z), z.id === active);
}

// ------------------------------------------------------------------ scene
const VIEWS = {
  Front: { az: 0, pol: 72 }, Left: { az: 90, pol: 74 }, Back: { az: 180, pol: 72 }, Right: { az: -90, pol: 74 }, Top: { az: 0, pol: 18 },
};
export const viewOf = (name) => VIEWS[name] || VIEWS.Front;

const CROWN_OUT = THREE.FrontSide; // LatheGeometry faces point outwards

function buildCap() {
  const crownCanvas = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  const visorCanvas = Object.assign(document.createElement('canvas'), { width: VW, height: VH });
  const crownTex = new THREE.CanvasTexture(crownCanvas);
  const visorTex = new THREE.CanvasTexture(visorCanvas);
  for (const t of [crownTex, visorTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
  const group = new THREE.Group();
  const lathePts = PROFILE.pts.map(([r, y]) => new THREE.Vector2(r, y));
  const crownGeo = new THREE.LatheGeometry(lathePts, 160, PHI_START, Math.PI * 2);
  const crown = new THREE.Mesh(crownGeo, new THREE.MeshStandardMaterial({ map: crownTex, roughness: 0.92, metalness: 0, side: CROWN_OUT }));
  // inside of the crown: plain lining, so artwork never shows through when the cap is turned upside down
  const inside = new THREE.Mesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1, side: CROWN_OUT === THREE.FrontSide ? THREE.BackSide : THREE.FrontSide }));
  crown.userData.surface = 'crown';
  const visorTop = new THREE.Mesh(visorGeometry(0), new THREE.MeshStandardMaterial({ map: visorTex, roughness: 0.88, side: THREE.DoubleSide }));
  visorTop.userData.surface = 'visor';
  const underMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.95, side: THREE.DoubleSide });
  const visorUnder = new THREE.Mesh(visorGeometry(-0.28), underMat);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 12), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
  button.scale.y = 0.55; button.position.y = HC + 0.08;
  // inside of the band (seen through the bottom / back opening)
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.995, R * 0.995, 1.2, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.BackSide, roughness: 1 }));
  lining.position.y = 0.6;
  group.add(crown, inside, visorTop, visorUnder, button, lining);
  group.position.y = -HC * 0.42;
  return { group, crown, visorTop, crownCanvas, visorCanvas, crownTex, visorTex, underMat, buttonMat: button.material };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(18, 30, 26); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(-24, 8, -14); scene.add(fill);
  const back = new THREE.DirectionalLight(0xffffff, 0.45); back.position.set(0, 10, -30); scene.add(back);
}

const DIST = 54;
const TARGET = () => new THREE.Vector3(0, 0.2, 2.2);
function placeCamera(camera, target, view, dist = DIST) {
  const v = typeof view === 'string' ? viewOf(view) : view;
  const s = new THREE.Spherical(dist, deg(v.pol), deg(v.az));
  camera.position.setFromSpherical(s).add(target);
  camera.lookAt(target);
}

function makePainter(cap, onDirty) {
  const cctx = cap.crownCanvas.getContext('2d'), vctx = cap.visorCanvas.getContext('2d');
  let state = { colors: ['#ffffff'], designs: {}, active: null, guides: false };
  let queued = false;
  const paint = () => {
    queued = false;
    const { colors, designs, active, guides } = state;
    paintCrown(cctx, colors, designs, active, guides, schedule);
    paintVisor(vctx, colors, designs, active, guides, schedule);
    cap.crownTex.needsUpdate = true; cap.visorTex.needsUpdate = true;
    const p = palette(colors);
    cap.underMat.color.set(shade(p.alt, -0.18));
    cap.buttonMat.color.set(p.base);
    onDirty?.();
  };
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
  return {
    set(next) { state = { ...state, ...next }; schedule(); },
    now(next) { state = { ...state, ...next }; paint(); },
    get state() { return state; },
  };
}

// ------------------------------------------------------------------ interactive viewer
/**
 * @param {HTMLElement} el container
 * @param {{onSelectZone?:(id)=>void, onChange?:(id, patch)=>void, onView?:(name)=>void, interactive?:boolean}} cb
 */
export function createCapViewer(el, cb = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  const scene = new THREE.Scene();
  addLights(scene);
  const cap = buildCap();
  scene.add(cap.group);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const target = TARGET();
  placeCamera(camera, target, 'Front');
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.minDistance = 30; controls.maxDistance = 80;
  controls.maxPolarAngle = deg(120);
  controls.rotateSpeed = 0.8;
  controls.autoRotateSpeed = 3;
  controls.update();

  let dirty = true;
  const painter = makePainter(cap, () => { dirty = true; });
  controls.addEventListener('change', () => { dirty = true; });

  let tween = null;
  const setView = (name) => {
    const v = viewOf(name);
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    let dAz = deg(v.az) - from.theta;
    dAz = mod(dAz + Math.PI, Math.PI * 2) - Math.PI;
    tween = { t0: performance.now(), from, az: from.theta + dAz, pol: deg(v.pol) };
  };

  // --- picking: which zone / design is under the pointer
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([cap.crown, cap.visorTop], false)[0];
    if (!hit?.uv) return null;
    const surface = hit.object.userData.surface;
    const px = hit.uv.x * (surface === 'visor' ? VW : CW), py = (1 - hit.uv.y) * (surface === 'visor' ? VH : CH);
    for (const z of capZones()) {
      if ((z.surface === 'visor') !== (surface === 'visor')) continue;
      const f = zoneFrame(z);
      let dx = px - f.cx;
      if (surface === 'crown') dx = mod(dx + CW / 2, CW) - CW / 2;
      const lx = dx / f.sx, ly = (py - f.cy) / f.sy;
      if (Math.abs(lx) <= z.w / 2 && Math.abs(ly) <= z.h / 2) return { zone: z, lx, ly };
    }
    return { zone: null };
  };
  let drag = null, down = null;
  const onDown = (e) => {
    if (cb.interactive === false) return;
    down = { x: e.clientX, y: e.clientY };
    const h = pick(e);
    const { designs, active } = painter.state;
    if (!h?.zone || h.zone.id !== active || !hasContent(designs[active])) return;
    const z = h.zone, d = designs[active];
    const L = layout(d, { box: [-z.w / 2, -z.h / 2, z.w, z.h] });
    const r = -((d.rotate || 0) * Math.PI) / 180;
    const qx = (h.lx - L.cx) * Math.cos(r) - (h.ly - L.cy) * Math.sin(r), qy = (h.lx - L.cx) * Math.sin(r) + (h.ly - L.cy) * Math.cos(r);
    if (Math.abs(qx) > L.w / 2 + 0.4 || Math.abs(qy) > L.h / 2 + 0.4) return;
    controls.enabled = false;
    controls.autoRotate = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    drag = { z, lx: h.lx, ly: h.ly, cx: L.cx, cy: L.cy, fw: Math.max(1e-3, z.w - L.w), fh: Math.max(1e-3, z.h - L.h) };
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!drag) {
      if (cb.interactive !== false) {
        const h = pick(e);
        const { designs, active } = painter.state;
        renderer.domElement.style.cursor = h?.zone?.id === active && hasContent(designs[active]) ? 'move' : h?.zone ? 'pointer' : 'grab';
      }
      return;
    }
    const h = pick(e);
    if (!h?.zone || h.zone.id !== drag.z.id) return;
    const cx = drag.cx + (h.lx - drag.lx), cy = drag.cy + (h.ly - drag.ly);
    const clamp = (n) => Math.max(-0.5, Math.min(0.5, n));
    cb.onChange?.(drag.z.id, { x: clamp(cx / drag.fw), y: clamp(cy / drag.fh) });
  };
  const onUp = (e) => {
    if (drag) { drag = null; controls.enabled = true; renderer.domElement.style.cursor = ''; return; }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && cb.interactive !== false) {
      const h = pick(e);
      if (h?.zone && h.zone.id !== painter.state.active) cb.onSelectZone?.(h.zone.id);
    }
    down = null;
  };
  const cvs = renderer.domElement;
  cvs.addEventListener('pointerdown', onDown, { capture: true });
  cvs.addEventListener('pointermove', onMove);
  cvs.addEventListener('pointerup', onUp);
  controls.addEventListener('start', () => { tween = null; });

  const resize = () => {
    const w = el.clientWidth || 300, h = el.clientHeight || 300;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let raf = 0, alive = true;
  const loop = (t) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (tween) {
      const k = Math.min(1, (t - tween.t0) / 450), e = 1 - Math.pow(1 - k, 3);
      const s = new THREE.Spherical(tween.from.radius, tween.from.phi + (tween.pol - tween.from.phi) * e, tween.from.theta + (tween.az - tween.from.theta) * e);
      camera.position.setFromSpherical(s).add(controls.target);
      camera.lookAt(controls.target);
      if (k >= 1) tween = null;
      dirty = true;
    }
    if (controls.update() || controls.autoRotate) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  };
  raf = requestAnimationFrame(loop);
  const onFonts = () => painter.set({});
  document.fonts?.addEventListener?.('loadingdone', onFonts);

  return {
    update({ colors, designs, active, guides }) {
      painter.set({ colors, designs, active, guides });
      ensureFonts(Object.values(designs || {}).filter(Boolean)).then(() => painter.set({}));
    },
    setView,
    setAutoRotate(on) { controls.autoRotate = !!on; dirty = true; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
      cvs.removeEventListener('pointerdown', onDown, { capture: true });
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
      renderer.dispose(); renderer.forceContextLoss?.(); cvs.remove();
    },
  };
}

// ------------------------------------------------------------------ still renders (thumbnails, mock-ups)
let still;
function stillRig() {
  if (still) return still;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  addLights(scene);
  const cap = buildCap();
  scene.add(cap.group);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  still = { renderer, scene, cap, camera, painter: makePainter(cap) };
  return still;
}

const waitImages = (designs) => Promise.all(Object.values(designs).filter((d) => d?.kind === 'image' && d.src).map((d) => new Promise((res) => {
  const img = getImg(d.src, res);
  if (img) res();
  setTimeout(res, 4000);
})));

/** Renders the cap from the given views; returns one canvas per view. */
export async function renderCapViews(colors, designs, views, { size = 400, guides = false, active = null, zoom = 1 } = {}) {
  await ensureFonts(Object.values(designs).filter(Boolean));
  await waitImages(designs);
  const s = stillRig();
  s.painter.now({ colors, designs, active, guides });
  s.renderer.setPixelRatio(1);
  s.renderer.setSize(size, size, false);
  s.camera.aspect = 1; s.camera.updateProjectionMatrix();
  const target = TARGET();
  return views.map((v) => {
    placeCamera(s.camera, target, v, DIST / zoom);
    s.renderer.render(s.scene, s.camera);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d').drawImage(s.renderer.domElement, 0, 0);
    return c;
  });
}

/** Small picture of each print zone (the zone highlighted), keyed by zone id. */
export async function renderZoneThumbs(colors, designs, size = 160) {
  const out = {};
  for (const z of capZones()) {
    const [c] = await renderCapViews(colors, designs, [z.view || viewOf(z.side)], { size, guides: 'active', active: z.id, zoom: 1.15 });
    out[z.id] = c.toDataURL('image/png');
  }
  return out;
}

/** Four-view strip (front, left, back, right) as a JPEG data URL — the workshop mock-up. */
export async function renderCapMockup(colors, designs, { width = 1200, quality = 0.88 } = {}) {
  const names = ['Front', 'Left', 'Back', 'Right'];
  const cell = Math.round(width / 4);
  const views = await renderCapViews(colors, designs, names, { size: cell * 2 > 1200 ? 600 : cell * 2 });
  const label = Math.round(cell * 0.12);
  const c = document.createElement('canvas');
  c.width = cell * 4; c.height = cell + label;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f3f1'; ctx.fillRect(0, 0, c.width, c.height);
  views.forEach((v, i) => ctx.drawImage(v, i * cell, 0, cell, cell));
  ctx.fillStyle = '#6b6866'; ctx.font = `600 ${Math.round(label * 0.5)}px 'Inter', sans-serif`; ctx.textAlign = 'center';
  names.forEach((n, i) => ctx.fillText(n.toUpperCase(), i * cell + cell / 2, cell + label * 0.55));
  return c.toDataURL('image/jpeg', quality);
}

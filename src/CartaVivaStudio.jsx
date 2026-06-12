/**
 * ═══════════════════════════════════════════════════════════════
 *  CARTAVIVA STUDIO — Cinematic Geopolitical Animation Editor
 *  Palantir × Vox. Canvas 2D engine, dual aspect (16:9 / 9:16),
 *  procedural aged-paper textures, multi-track timeline, audio
 *  narration muxed into export, animation presets, quick actions.
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Play, Pause, SkipBack, Download, Plus, Trash2, Eye, EyeOff,
  ArrowRight, Type, MapPin, Square, Image as ImageIcon, Video,
  Move, BarChart2, Camera as CameraIcon, Layers, Clock, Music,
  Crosshair, Stamp, PieChart, Minus, PanelLeftClose, PanelLeftOpen,
  Smartphone, Monitor, Zap, Flag, Radio, BookMarked, X, ChevronDown,
} from 'lucide-react';

/* ════════════════════════════ CONSTANTS ═══════════════════════ */
const MAP_W = 1000, MAP_H = 500;

const RATIOS = {
  landscape: { W: 1280, H: 720,  dispW: 640,    dispH: 360, label: '16:9' },
  portrait:  { W: 720,  H: 1280, dispW: 303.75, dispH: 540, label: '9:16' },
};

/* ════════════════════════════ MATH ════════════════════════════ */
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const EASES = {
  linear:    t => t,
  smooth:    t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2,
  out:       t => 1 - Math.pow(1 - t, 3),
  overshoot: t => { const c = 1.70158 * 1.2; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); },
};

/** camera = {cx, cy, w}. Height derives from canvas aspect → no distortion. */
function camParams(cam, W, H) {
  const s = W / cam.w;
  return { s, mx0: cam.cx - cam.w / 2, my0: cam.cy - (H / s) / 2 };
}
function getCameraAt(kfs, t) {
  if (!kfs.length) return null;
  if (t <= kfs[0].time) return kfs[0];
  if (t >= kfs[kfs.length-1].time) return kfs[kfs.length-1];
  const ni = kfs.findIndex(k => k.time > t);
  const a = kfs[ni-1], b = kfs[ni];
  const e = EASES.smooth((t - a.time) / (b.time - a.time));
  return { cx: lerp(a.cx,b.cx,e), cy: lerp(a.cy,b.cy,e), w: lerp(a.w,b.w,e) };
}

/** Entrance progress (eased) + overall alpha (handles exit fade). */
function layerPhase(layer, t) {
  const { startTime: s, endTime: e } = layer;
  if (t < s || t > e) return { p: 0, alpha: 0 };
  const animDur = layer.animDur ?? 0.8;
  const raw = clamp((t - s) / animDur, 0, 1);
  const p = (EASES[layer.easing] ?? EASES.smooth)(raw);
  const fadeOut = layer.fadeOut ?? 0.35;
  let alpha = layer.anim === 'fade' ? raw : Math.min(raw * 3, 1);
  if (t > e - fadeOut) alpha *= clamp((e - t) / fadeOut, 0, 1);
  return { p, alpha };
}

/* ════════════════════════════ GEO ═════════════════════════════ */
const proj = (lng, lat) => ({ x: (lng + 180) / 360 * MAP_W, y: (90 - lat) / 180 * MAP_H });

function buildPath2D(geom) {
  const p = new Path2D();
  if (!geom) return p;
  const addRing = ring => {
    for (let i = 0; i < ring.length; i++) {
      const { x, y } = proj(ring[i][0], ring[i][1]);
      if (i === 0 || Math.abs(ring[i][0] - ring[i-1][0]) > 180) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
  };
  if (geom.type === 'Polygon') geom.coordinates.forEach(addRing);
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(addRing));
  return p;
}

function pointInFeature(mx, my, feat) {
  const geom = feat.geometry;
  if (!geom) return false;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  return polys.some(([outer]) => {
    let inside = false;
    for (let i = 0, j = outer.length-1; i < outer.length; j = i++) {
      const a = proj(outer[i][0], outer[i][1]), b = proj(outer[j][0], outer[j][1]);
      if ((a.y > my) !== (b.y > my) && mx < ((b.x-a.x)*(my-a.y))/(b.y-a.y)+a.x) inside = !inside;
    }
    return inside;
  });
}

const CN = {
  4:'Afghanistan',8:'Albania',12:'Algeria',24:'Angola',31:'Azerbaijan',32:'Argentina',36:'Australia',
  40:'Austria',50:'Bangladesh',51:'Armenia',56:'Belgio',68:'Bolivia',70:'Bosnia',76:'Brasile',
  100:'Bulgaria',104:'Myanmar',112:'Bielorussia',116:'Cambogia',124:'Canada',144:'Sri Lanka',
  148:'Ciad',152:'Cile',156:'Cina',170:'Colombia',180:'RD Congo',191:'Croazia',192:'Cuba',
  196:'Cipro',203:'Cechia',208:'Danimarca',218:'Ecuador',222:'El Salvador',231:'Etiopia',
  233:'Estonia',246:'Finlandia',250:'Francia',268:'Georgia',276:'Germania',288:'Ghana',
  300:'Grecia',320:'Guatemala',340:'Honduras',348:'Ungheria',352:'Islanda',356:'India',
  360:'Indonesia',364:'Iran',368:'Iraq',372:'Irlanda',376:'Israele',380:'Italia',388:'Giamaica',
  392:'Giappone',398:'Kazakistan',400:'Giordania',404:'Kenya',408:'Corea del Nord',
  410:'Corea del Sud',414:'Kuwait',417:'Kirghizistan',418:'Laos',422:'Libano',428:'Lettonia',
  434:'Libia',440:'Lituania',458:'Malesia',466:'Mali',478:'Mauritania',484:'Messico',
  496:'Mongolia',498:'Moldavia',504:'Marocco',508:'Mozambico',512:'Oman',516:'Namibia',
  524:'Nepal',528:'Paesi Bassi',554:'Nuova Zelanda',558:'Nicaragua',562:'Niger',566:'Nigeria',
  578:'Norvegia',586:'Pakistan',591:'Panama',598:'Papua N.G.',600:'Paraguay',604:'Perù',
  608:'Filippine',616:'Polonia',620:'Portogallo',634:'Qatar',642:'Romania',643:'Russia',
  646:'Ruanda',682:'Arabia Saudita',686:'Senegal',688:'Serbia',694:'Sierra Leone',703:'Slovacchia',
  704:'Vietnam',705:'Slovenia',706:'Somalia',710:'Sudafrica',716:'Zimbabwe',724:'Spagna',
  728:'Sud Sudan',729:'Sudan',740:'Suriname',752:'Svezia',756:'Svizzera',760:'Siria',
  762:'Tagikistan',764:'Thailandia',780:'Trinidad',784:'EAU',788:'Tunisia',792:'Turchia',
  795:'Turkmenistan',800:'Uganda',804:'Ucraina',807:'Macedonia N.',818:'Egitto',826:'Regno Unito',
  834:'Tanzania',840:'USA',854:'Burkina Faso',858:'Uruguay',860:'Uzbekistan',862:'Venezuela',
  887:'Yemen',894:'Zambia',275:'Palestina',squ:'Somalia',
};

/* ═══════════════════════ MAP STYLE PRESETS ════════════════════ */
const PRESETS = {
  carta1800: {
    label: 'Carta Antica 1800', dark: false, paper: true,
    paperA: '#cfb47e', paperB: '#b89a5e', stain: 'rgba(110,72,28,0.16)',
    burnt: 0.9, fibers: true,
    oceanWash: 'rgba(86,118,128,0.30)', landWash: 'rgba(196,160,96,0.42)',
    ink: '#4a3015', graticule: 'rgba(74,48,21,0.35)',
    accent: '#a01f1f', accent2: '#d8801e',
    titleBg: 'rgba(36,22,8,0.88)', titleFg: '#e8d9b0',
    fx: null, titleFont: "'Playfair Display', Georgia, serif",
  },
  pergamena: {
    label: 'Pergamena Medievale', dark: false, paper: true,
    paperA: '#e2cf9e', paperB: '#cdb478', stain: 'rgba(120,80,30,0.22)',
    burnt: 1.2, fibers: true,
    oceanWash: 'rgba(120,130,100,0.18)', landWash: 'rgba(190,158,92,0.36)',
    ink: '#5a3a18', graticule: 'rgba(90,58,24,0.25)',
    accent: '#8e2618', accent2: '#9a7020',
    titleBg: 'rgba(44,28,10,0.88)', titleFg: '#ecdcae',
    fx: null, titleFont: "'IM Fell English', Georgia, serif",
  },
  blueprint: {
    label: 'Blueprint Intelligence', dark: true, paper: false,
    ocean: '#040d1c', land: '#0a1a2e', ink: '#1f5d9c',
    graticule: 'rgba(40,110,190,0.22)',
    accent: '#00d4ff', accent2: '#ff4438',
    titleBg: 'rgba(3,10,20,0.94)', titleFg: '#bfe6ff',
    fx: 'scanlines', titleFont: "'Space Grotesk', system-ui, sans-serif",
  },
  coldwar: {
    label: 'Cold War', dark: false, paper: true,
    paperA: '#c9c4ae', paperB: '#aaa68e', stain: 'rgba(60,60,40,0.14)',
    burnt: 0.5, fibers: true,
    oceanWash: 'rgba(90,105,110,0.28)', landWash: 'rgba(168,162,134,0.42)',
    ink: '#3a3a30', graticule: 'rgba(58,58,48,0.3)',
    accent: '#c41e1e', accent2: '#1e4f9c',
    titleBg: 'rgba(24,24,18,0.92)', titleFg: '#ddd8c2',
    fx: 'halftone', titleFont: "'Space Grotesk', system-ui, sans-serif",
  },
  breaking: {
    label: 'Breaking News', dark: false, paper: false,
    ocean: '#c5d9e8', land: '#eee7d4', ink: '#9a9a92',
    graticule: 'rgba(150,150,140,0.3)',
    accent: '#e02020', accent2: '#101820',
    titleBg: 'rgba(255,255,255,0.97)', titleFg: '#101418',
    fx: null, titleFont: "'Playfair Display', Georgia, serif",
  },
  dossier: {
    label: 'Dossier Top Secret', dark: true, paper: false,
    ocean: '#0a0a0d', land: '#16161c', ink: '#3a3a46',
    graticule: 'rgba(80,80,96,0.18)',
    accent: '#ff3b30', accent2: '#e8a020',
    titleBg: 'rgba(8,8,11,0.95)', titleFg: '#e8e2d2',
    fx: 'scanlines', titleFont: "'Special Elite', 'Courier New', monospace",
  },
};

const REGIONS = {
  world:    { cx: 500, cy: 250, w: 1000 },
  europe:   { cx: 400, cy: 130, w: 300 },
  mideast:  { cx: 510, cy: 200, w: 280 },
  eastasia: { cx: 720, cy: 170, w: 320 },
  africa:   { cx: 420, cy: 270, w: 320 },
  americas: { cx: 200, cy: 220, w: 420 },
  russia:   { cx: 600, cy: 100, w: 420 },
};

const STAMP_TEXTS = ['TOP SECRET', 'DECLASSIFIED', 'CONFIDENTIAL', 'EYES ONLY', 'CLASSIFIED', 'VERIFIED'];
const ICON_KINDS = [
  ['target', 'Bersaglio'], ['radar', 'Radar'], ['jet', 'Caccia'],
  ['tank', 'Tank'], ['ship', 'Nave'], ['blast', 'Esplosione'], ['base', 'Base'],
];
const ANIMS = [
  ['fade', 'Fade'], ['pop', 'Pop'], ['wipe', 'Wipe'],
  ['typewriter', 'Dattilografo'], ['reveal', 'Intel Reveal'],
];
const EASE_OPTS = [['smooth', 'Smooth'], ['out', 'Out'], ['overshoot', 'Overshoot'], ['linear', 'Lineare']];

/* ════════════════ PROCEDURAL AGED-PAPER TEXTURE ═══════════════ */
const paperCache = new Map();

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makePaper(presetKey, W, H) {
  const key = `${presetKey}-${W}x${H}`;
  if (paperCache.has(key)) return paperCache.get(key);
  const ps = PRESETS[presetKey];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rnd = mulberry32(1337);

  // Base parchment gradient
  const g = x.createRadialGradient(W*0.45, H*0.4, 0, W*0.5, H*0.5, Math.max(W,H)*0.75);
  g.addColorStop(0, ps.paperA);
  g.addColorStop(1, ps.paperB);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // Mottled tone patches
  for (let i = 0; i < 70; i++) {
    const px = rnd()*W, py = rnd()*H, r = 30 + rnd()*180;
    const mg = x.createRadialGradient(px, py, 0, px, py, r);
    const dk = rnd() > 0.5;
    mg.addColorStop(0, dk ? 'rgba(90,60,20,0.05)' : 'rgba(255,245,210,0.06)');
    mg.addColorStop(1, 'transparent');
    x.fillStyle = mg;
    x.fillRect(px-r, py-r, r*2, r*2);
  }

  // Stains (coffee-ring style: filled blot + darker rim)
  for (let i = 0; i < 14; i++) {
    const px = rnd()*W, py = rnd()*H, r = 12 + rnd()*55;
    const sg = x.createRadialGradient(px, py, 0, px, py, r);
    sg.addColorStop(0, ps.stain);
    sg.addColorStop(0.75, ps.stain.replace(/[\d.]+\)$/, '0.05)'));
    sg.addColorStop(1, 'transparent');
    x.fillStyle = sg;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI*2); x.fill();
    if (rnd() > 0.5) {
      x.strokeStyle = ps.stain;
      x.lineWidth = 1 + rnd()*1.5;
      x.beginPath(); x.arc(px, py, r*(0.82+rnd()*0.14), rnd()*6, rnd()*6+3+rnd()*2); x.stroke();
    }
  }

  // Paper fibers
  if (ps.fibers) {
    x.strokeStyle = 'rgba(80,55,20,0.07)';
    x.lineWidth = 0.6;
    for (let i = 0; i < 350; i++) {
      const px = rnd()*W, py = rnd()*H, a = rnd()*Math.PI, l = 4 + rnd()*22;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a)*l, py + Math.sin(a)*l);
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,250,225,0.08)';
    for (let i = 0; i < 200; i++) {
      const px = rnd()*W, py = rnd()*H, a = rnd()*Math.PI, l = 3 + rnd()*14;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a)*l, py + Math.sin(a)*l); x.stroke();
    }
  }

  // Fold creases
  for (let i = 0; i < 3; i++) {
    const vertical = rnd() > 0.5;
    const pos = (0.2 + rnd()*0.6) * (vertical ? W : H);
    const cg = vertical
      ? x.createLinearGradient(pos-7, 0, pos+7, 0)
      : x.createLinearGradient(0, pos-7, 0, pos+7);
    cg.addColorStop(0, 'transparent');
    cg.addColorStop(0.5, 'rgba(70,45,15,0.10)');
    cg.addColorStop(0.55, 'rgba(255,248,220,0.10)');
    cg.addColorStop(1, 'transparent');
    x.fillStyle = cg;
    if (vertical) x.fillRect(pos-7, 0, 14, H);
    else x.fillRect(0, pos-7, W, 14);
  }

  // Burnt, irregular darkened edges
  const burnt = ps.burnt;
  x.save();
  const STEPS = 220;
  x.beginPath();
  x.moveTo(-50, -50); x.lineTo(W+50, -50); x.lineTo(W+50, H+50); x.lineTo(-50, H+50); x.closePath();
  // inner jagged ring (hole)
  const inset = () => (14 + rnd()*26) * burnt;
  let first = true;
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    let px, py;
    if (f < 0.25)      { px = (f/0.25)*W;        py = inset(); }
    else if (f < 0.5)  { px = W - inset();        py = ((f-0.25)/0.25)*H; }
    else if (f < 0.75) { px = W - ((f-0.5)/0.25)*W; py = H - inset(); }
    else               { px = inset();            py = H - ((f-0.75)/0.25)*H; }
    if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py);
  }
  x.closePath();
  x.fillStyle = `rgba(30,16,4,${0.5*burnt})`;
  x.filter = 'blur(6px)';
  x.fill('evenodd');
  x.filter = 'none';
  x.restore();

  // Soft edge vignette on top
  const vg = x.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.72);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, `rgba(40,22,6,${0.35*burnt})`);
  x.fillStyle = vg;
  x.fillRect(0, 0, W, H);

  paperCache.set(key, c);
  return c;
}

/* film grain (shared) */
let grainCanvas = null;
function getGrain() {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  const d = x.createImageData(512, 512);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    d.data[i] = d.data[i+1] = d.data[i+2] = v;
    d.data[i+3] = 26;
  }
  x.putImageData(d, 0, 0);
  grainCanvas = c;
  return c;
}

/* halftone dots (cold war) */
let halftoneCanvas = null;
function getHalftone() {
  if (halftoneCanvas) return halftoneCanvas;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,30,24,0.5)';
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      x.beginPath();
      x.arc(i*8 + (j%2)*4 + 2, j*8 + 2, 0.8, 0, Math.PI*2);
      x.fill();
    }
  halftoneCanvas = c;
  return c;
}

/* ═════════════════════ LAYER RENDERERS ════════════════════════ */
/* Map-anchored layers receive cp = {s, mx0, my0} to convert coords. */
const toScreen = (mapX, mapY, cp) => ({ x: (mapX - cp.mx0) * cp.s, y: (mapY - cp.my0) * cp.s });

function sampleBezier(A, B, curve = 0.28) {
  const cpx = (A.x + B.x)/2 - (B.y - A.y) * curve;
  const cpy = (A.y + B.y)/2 + (B.x - A.x) * curve;
  const N = 90;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({ x: u*u*A.x + 2*u*t*cpx + t*t*B.x, y: u*u*A.y + 2*u*t*cpy + t*t*B.y });
  }
  return pts;
}

function partialPolyline(pts, frac) {
  if (frac >= 1) return { drawn: pts, tip: pts[pts.length-1], prev: pts[pts.length-2] || pts[0] };
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y));
  const target = lens[lens.length-1] * frac;
  const drawn = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] >= target) {
      const seg = lens[i] - lens[i-1];
      const f = seg > 0 ? (target - lens[i-1]) / seg : 1;
      const tip = { x: lerp(pts[i-1].x, pts[i].x, f), y: lerp(pts[i-1].y, pts[i].y, f) };
      drawn.push(tip);
      return { drawn, tip, prev: pts[i-1] };
    }
    drawn.push(pts[i]);
  }
  return { drawn, tip: pts[pts.length-1], prev: pts[pts.length-2] || pts[0] };
}

function drawArrow(ctx, L, cp, W, t) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0 || !L.pts || L.pts.length < 2) return;
  const A = toScreen(L.pts[0].x, L.pts[0].y, cp);
  const B = toScreen(L.pts[1].x, L.pts[1].y, cp);
  const drawP = clamp((t - L.startTime) / (L.drawDur ?? 1.4), 0, 1);
  if (drawP <= 0) return;
  const pts = sampleBezier(A, B, L.curve ?? 0.28);
  const { drawn, tip, prev } = partialPolyline(pts, EASES.smooth(drawP));
  const lw = (L.width ?? 3.5) * (W / 640);

  ctx.save();
  ctx.globalAlpha = alpha;
  if (L.glow) { ctx.shadowColor = L.color; ctx.shadowBlur = 16; }
  ctx.strokeStyle = L.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (L.dashed) ctx.setLineDash([lw*3.2, lw*2.2]);
  ctx.beginPath();
  ctx.moveTo(drawn[0].x, drawn[0].y);
  for (let i = 1; i < drawn.length; i++) ctx.lineTo(drawn[i].x, drawn[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  if (drawP > 0.3) {
    const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const sz = lw * 4;
    ctx.fillStyle = L.color;
    ctx.translate(tip.x, tip.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(sz*0.55, 0);
    ctx.lineTo(-sz*0.45, -sz*0.4);
    ctx.lineTo(-sz*0.2, 0);
    ctx.lineTo(-sz*0.45, sz*0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFrontline(ctx, L, cp, W, t) {
  const { alpha } = layerPhase(L, t);
  if (alpha <= 0 || !L.pts || L.pts.length < 2) return;
  const drawP = clamp((t - L.startTime) / (L.drawDur ?? 2), 0, 1);
  if (drawP <= 0) return;
  const screenPts = L.pts.map(pt => toScreen(pt.x, pt.y, cp));
  // densify
  const dense = [];
  for (let i = 0; i < screenPts.length - 1; i++) {
    const a = screenPts[i], b = screenPts[i+1];
    const segs = Math.max(2, Math.ceil(Math.hypot(b.x-a.x, b.y-a.y) / 8));
    for (let j = 0; j < segs; j++) dense.push({ x: lerp(a.x,b.x,j/segs), y: lerp(a.y,b.y,j/segs) });
  }
  dense.push(screenPts[screenPts.length-1]);
  const { drawn } = partialPolyline(dense, EASES.smooth(drawP));
  const lw = (L.width ?? 3) * (W / 640);

  ctx.save();
  ctx.globalAlpha = alpha;
  if (L.glow) { ctx.shadowColor = L.color; ctx.shadowBlur = 10; }
  ctx.strokeStyle = L.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(drawn[0].x, drawn[0].y);
  for (let i = 1; i < drawn.length; i++) ctx.lineTo(drawn[i].x, drawn[i].y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // perpendicular military teeth
  let acc = 0;
  const tickGap = 13 * (W / 640);
  for (let i = 1; i < drawn.length; i++) {
    const a = drawn[i-1], b = drawn[i];
    acc += Math.hypot(b.x-a.x, b.y-a.y);
    if (acc >= tickGap) {
      acc = 0;
      const ang = Math.atan2(b.y-a.y, b.x-a.x) + Math.PI/2;
      const tl = lw * 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(ang)*tl, b.y + Math.sin(ang)*tl);
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawZone(ctx, L, cp, W, t) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const c = toScreen(L.mapX, L.mapY, cp);
  const baseR = (L.radius ?? 45) * cp.s;
  const r = baseR * EASES.out(p);
  const pulse = L.pulse ? 1 + 0.06 * Math.sin(t * 3.2) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * pulse);
  g.addColorStop(0, L.color + '55');
  g.addColorStop(0.7, L.color + '2a');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, r * pulse, 0, Math.PI*2); ctx.fill();

  ctx.strokeStyle = L.color;
  ctx.lineWidth = 1.6 * (W/640);
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(c.x, c.y, r * pulse, 0, Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);

  // expanding pulse ring
  if (L.pulse) {
    const ringP = (t * 0.7) % 1;
    ctx.globalAlpha = alpha * (1 - ringP) * 0.6;
    ctx.beginPath(); ctx.arc(c.x, c.y, r * (0.4 + ringP * 0.85), 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(ctx, L, cp, W, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const c = toScreen(L.mapX, L.mapY, cp);
  const sc = W / 640;
  const fs = (L.fontSize ?? 14) * sc;

  let text = L.text;
  let caret = false;
  if (L.anim === 'typewriter' && p < 1) {
    const n = Math.ceil(L.text.length * p);
    text = L.text.slice(0, n);
    caret = true;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = L.color;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.arc(c.x, c.y, 4 * sc, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  const ty = c.y - 24 * sc;
  ctx.strokeStyle = L.color;
  ctx.lineWidth = 1.4 * sc;
  ctx.beginPath(); ctx.moveTo(c.x, c.y - 4*sc); ctx.lineTo(c.x, ty); ctx.stroke();

  const font = L.mono ? `${fs}px 'Special Elite', monospace` : `700 ${fs}px ${ps.titleFont}`;
  ctx.font = font;
  const fullW = ctx.measureText(L.text + (caret ? '▌' : '')).width;
  const pad = 9 * sc;
  const hasSub = !!L.subtext;
  const subFs = fs * 0.72;
  const bw = fullW + pad*2;
  const bh = fs + pad*1.5 + (hasSub ? subFs + 5*sc : 0);
  const bx = c.x - bw/2, by = ty - bh;

  // pop scale
  if (L.anim === 'pop') {
    ctx.translate(c.x, ty);
    const s = EASES.overshoot(p);
    ctx.scale(s, s);
    ctx.translate(-c.x, -ty);
  }

  ctx.fillStyle = L.boxBg ?? ps.titleBg;
  ctx.strokeStyle = L.color;
  ctx.lineWidth = 1.4 * sc;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3 * sc); ctx.fill(); ctx.stroke();

  ctx.fillStyle = L.color;
  ctx.font = font;
  ctx.fillText(text + (caret ? '▌' : ''), bx + pad, by + fs + pad*0.45);

  if (hasSub && p > 0.55) {
    ctx.font = `500 ${subFs}px 'Space Grotesk', system-ui, sans-serif`;
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = ps.dark ? ps.titleFg : L.color;
    ctx.fillText(L.subtext, bx + pad, by + fs + subFs + pad*0.45 + 3*sc);
  }

  // intel reveal: black bar slides off
  if (L.anim === 'reveal' && p < 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(bx + bw * p, by, bw * (1 - p), bh);
  }
  ctx.restore();
}

function drawTitle(ctx, L, W, H, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const sc = W / 640;
  const isBreaking = L.variant === 'breaking';
  const bh = (L.subtext ? 96 : 66) * sc * (isBreaking ? 0.92 : 1);
  const posY = L.position === 'top' ? 0 : L.position === 'center' ? (H - bh)/2 : H - bh;
  const slide = (1 - Math.min(p / 0.5, 1)) * 26 * sc * (L.position === 'top' ? -1 : 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, slide);

  if (L.anim === 'wipe') {
    ctx.beginPath();
    ctx.rect(0, posY - 10, W * Math.min(p/0.7, 1), bh + 20);
    ctx.clip();
  }

  // panel
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 22 * sc;
  ctx.fillStyle = L.bg ?? ps.titleBg;
  ctx.fillRect(0, posY, W, bh);
  ctx.shadowBlur = 0;

  if (isBreaking) {
    // red strip + LIVE chip
    ctx.fillStyle = L.accent ?? ps.accent;
    ctx.fillRect(0, posY, W, 5 * sc);
    const chipW = 96 * sc, chipH = 22 * sc;
    ctx.fillRect(18 * sc, posY + 13 * sc, chipW, chipH);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${12*sc}px 'Space Grotesk', sans-serif`;
    ctx.fillText('● BREAKING', 26 * sc, posY + 13*sc + 15.5*sc);
    const titleFs = 21 * sc;
    ctx.font = `900 ${titleFs}px ${ps.titleFont}`;
    ctx.fillStyle = L.fg ?? ps.titleFg;
    ctx.fillText(L.text, 18 * sc, posY + 13*sc + chipH + titleFs + 4*sc);
  } else {
    ctx.fillStyle = L.accent ?? ps.accent;
    ctx.fillRect(0, posY, 6 * sc, bh);
    const titleFs = 23 * sc;
    ctx.font = `700 ${titleFs}px ${ps.titleFont}`;
    ctx.fillStyle = L.fg ?? ps.titleFg;
    ctx.fillText(L.text, 20 * sc, posY + titleFs + 14 * sc);
    if (L.subtext) {
      const subFs = 13 * sc;
      ctx.font = `500 ${subFs}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.globalAlpha = alpha * 0.62;
      ctx.fillText(L.subtext.toUpperCase(), 20 * sc, posY + titleFs + subFs + 24 * sc);
    }
  }

  if (L.anim === 'reveal' && p < 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(W * p, posY, W * (1-p), bh);
  }
  ctx.restore();
}

function drawStat(ctx, L, W, H, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const sc = W / 640;
  const bw = 168 * sc, bh = 72 * sc, pad = 14 * sc;
  const pos = {
    tl: [pad, pad + 30*sc], tr: [W-bw-pad, pad + 30*sc],
    bl: [pad, H-bh-pad], br: [W-bw-pad, H-bh-pad],
  }[L.corner ?? 'tr'];
  let [bx, by] = pos;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (L.anim === 'pop') {
    const s = EASES.overshoot(p);
    ctx.translate(bx + bw/2, by + bh/2); ctx.scale(s, s); ctx.translate(-(bx+bw/2), -(by+bh/2));
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16 * sc;
  ctx.fillStyle = L.bg ?? ps.titleBg;
  ctx.strokeStyle = L.color;
  ctx.lineWidth = 1.4 * sc;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6 * sc); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = L.color;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, 3.4*sc, [6*sc, 6*sc, 0, 0]); ctx.fill();

  ctx.font = `600 ${10.5*sc}px 'Space Grotesk', sans-serif`;
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillText((L.label ?? 'DATO').toUpperCase(), bx + 11*sc, by + 19*sc);

  // count-up
  const numStr = String(L.value).replace(/[^\d]/g, '');
  let display = L.value;
  if (numStr && p < 1) {
    const n = Math.floor(parseInt(numStr, 10) * p);
    display = String(L.value).replace(numStr, n.toLocaleString('it-IT'));
  } else if (numStr) {
    display = String(L.value).replace(numStr, parseInt(numStr,10).toLocaleString('it-IT'));
  }
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${27*sc}px 'Space Grotesk', monospace`;
  ctx.fillStyle = L.fg ?? (ps.dark ? '#fff' : '#101418');
  ctx.fillText(display, bx + 11*sc, by + bh - 12*sc);
  ctx.restore();
}

function drawDate(ctx, L, W, H, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const sc = W / 640;
  const fs = 15 * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${fs}px 'Special Elite', monospace`;
  const tw = ctx.measureText(L.text).width;
  const pad = 8 * sc;
  const bx = 16 * sc, by = 14 * sc;
  ctx.fillStyle = ps.dark ? 'rgba(0,0,0,0.6)' : 'rgba(248,240,220,0.85)';
  ctx.strokeStyle = L.color;
  ctx.lineWidth = 1.2 * sc;
  ctx.beginPath(); ctx.roundRect(bx, by, tw + pad*2, fs + pad*1.4, 2*sc); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.color;
  let text = L.text;
  if (L.anim === 'typewriter' && p < 1) text = L.text.slice(0, Math.ceil(L.text.length * p));
  ctx.fillText(text, bx + pad, by + fs + pad*0.35);
  ctx.restore();
}

function drawStamp(ctx, L, W, H, t) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const sc = W / 640;
  const cx = (L.rx ?? 0.5) * W, cy = (L.ry ?? 0.3) * H;
  const fs = (L.fontSize ?? 26) * sc;

  ctx.save();
  // stamp-in: scale from 2.2 → 1 with overshoot, alpha in fast
  const sp = L.anim === 'pop' ? EASES.overshoot(p) : EASES.out(p);
  const scale = lerp(2.4, 1, Math.min(sp, 1.15));
  ctx.translate(cx, cy);
  ctx.rotate((L.angle ?? -12) * Math.PI / 180);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha * 0.92;

  ctx.font = `700 ${fs}px 'Special Elite', 'Courier New', monospace`;
  const tw = ctx.measureText(L.text).width;
  const padX = 14 * sc, padY = 9 * sc;

  ctx.strokeStyle = L.color;
  ctx.lineWidth = 3 * sc;
  ctx.strokeRect(-tw/2 - padX, -fs/2 - padY, tw + padX*2, fs + padY*2);
  ctx.lineWidth = 1.1 * sc;
  ctx.strokeRect(-tw/2 - padX + 4*sc, -fs/2 - padY + 4*sc, tw + padX*2 - 8*sc, fs + padY*2 - 8*sc);
  ctx.fillStyle = L.color;
  ctx.fillText(L.text, -tw/2, fs * 0.36);
  ctx.restore();
}

function drawIconShape(ctx, kind, sz, color, t) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = sz * 0.09;
  ctx.lineCap = 'round';
  switch (kind) {
    case 'target': {
      ctx.beginPath(); ctx.arc(0, 0, sz*0.5, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, sz*0.26, 0, Math.PI*2); ctx.stroke();
      for (const a of [0, Math.PI/2, Math.PI, Math.PI*1.5]) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*sz*0.36, Math.sin(a)*sz*0.36);
        ctx.lineTo(Math.cos(a)*sz*0.62, Math.sin(a)*sz*0.62);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, sz*0.06, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'radar': {
      ctx.beginPath(); ctx.arc(0, 0, sz*0.5, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.arc(0, 0, sz*0.3, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha /= 0.5;
      const sweep = (t * 1.8) % (Math.PI*2);
      ctx.save();
      ctx.rotate(sweep);
      const grd = ctx.createLinearGradient(0, 0, sz*0.5, 0);
      grd.addColorStop(0, color + '00');
      grd.addColorStop(1, color + 'aa');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, sz*0.5, -0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(sz*0.22, -sz*0.18, sz*0.05, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'jet': {
      ctx.beginPath();
      ctx.moveTo(0, -sz*0.5);
      ctx.lineTo(sz*0.14, -sz*0.1);
      ctx.lineTo(sz*0.5, sz*0.18);
      ctx.lineTo(sz*0.14, sz*0.12);
      ctx.lineTo(sz*0.18, sz*0.46);
      ctx.lineTo(0, sz*0.32);
      ctx.lineTo(-sz*0.18, sz*0.46);
      ctx.lineTo(-sz*0.14, sz*0.12);
      ctx.lineTo(-sz*0.5, sz*0.18);
      ctx.lineTo(-sz*0.14, -sz*0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'tank': {
      ctx.beginPath(); ctx.roundRect(-sz*0.42, -sz*0.04, sz*0.84, sz*0.3, sz*0.12); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-sz*0.2, -sz*0.26, sz*0.4, sz*0.24, sz*0.05); ctx.fill();
      ctx.lineWidth = sz*0.07;
      ctx.beginPath(); ctx.moveTo(sz*0.1, -sz*0.16); ctx.lineTo(sz*0.55, -sz*0.22); ctx.stroke();
      break;
    }
    case 'ship': {
      ctx.beginPath();
      ctx.moveTo(-sz*0.5, 0);
      ctx.lineTo(sz*0.5, 0);
      ctx.lineTo(sz*0.32, sz*0.26);
      ctx.lineTo(-sz*0.36, sz*0.26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.roundRect(-sz*0.16, -sz*0.26, sz*0.3, sz*0.24, sz*0.03); ctx.fill();
      ctx.lineWidth = sz*0.06;
      ctx.beginPath(); ctx.moveTo(sz*0.22, -sz*0.06); ctx.lineTo(sz*0.4, -sz*0.34); ctx.stroke();
      break;
    }
    case 'blast': {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? sz*0.55 : sz*0.24;
        const x = Math.cos(a)*r, y = Math.sin(a)*r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'base': {
      ctx.lineWidth = sz * 0.1;
      ctx.beginPath(); ctx.moveTo(-sz*0.3, sz*0.5); ctx.lineTo(-sz*0.3, -sz*0.45); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-sz*0.3, -sz*0.45);
      ctx.lineTo(sz*0.42, -sz*0.26);
      ctx.lineTo(-sz*0.3, -sz*0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

function drawIcon(ctx, L, cp, W, t) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const c = toScreen(L.mapX, L.mapY, cp);
  const sz = (L.size ?? 30) * (W / 640);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(c.x, c.y);
  if (L.anim === 'pop') { const s = EASES.overshoot(p); ctx.scale(s, s); }
  if (L.glow) { ctx.shadowColor = L.color; ctx.shadowBlur = 14; }
  drawIconShape(ctx, L.kind, sz, L.color, t);
  ctx.restore();
}

function drawPie(ctx, L, cp, W, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const c = toScreen(L.mapX, L.mapY, cp);
  const sc = W / 640;
  const r = (L.size ?? 34) * sc;
  const val = clamp(L.value ?? 50, 0, 100) / 100;
  const sweep = val * Math.PI * 2 * EASES.smooth(p);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8 * sc;
  // base disc
  ctx.fillStyle = ps.dark ? '#1a1a22' : '#e8dcc0';
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  // value wedge
  ctx.fillStyle = L.color;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.arc(c.x, c.y, r, -Math.PI/2, -Math.PI/2 + sweep);
  ctx.closePath();
  ctx.fill();
  // vintage double ring
  ctx.strokeStyle = ps.ink;
  ctx.lineWidth = 1.6 * sc;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI*2); ctx.stroke();
  ctx.lineWidth = 0.7 * sc;
  ctx.beginPath(); ctx.arc(c.x, c.y, r + 3.5*sc, 0, Math.PI*2); ctx.stroke();
  // % text
  ctx.fillStyle = ps.dark ? '#fff' : '#221408';
  ctx.font = `700 ${r*0.5}px 'Space Grotesk', sans-serif`;
  const txt = `${Math.round(val * 100 * Math.min(p*1.4,1))}%`;
  ctx.fillText(txt, c.x - ctx.measureText(txt).width/2, c.y + r*0.18);
  // label
  if (L.label) {
    ctx.font = `600 ${11*sc}px 'Space Grotesk', sans-serif`;
    ctx.fillStyle = ps.dark ? ps.titleFg : ps.ink;
    ctx.fillText(L.label, c.x - ctx.measureText(L.label).width/2, c.y + r + 15*sc);
  }
  ctx.restore();
}

function drawLegend(ctx, L, W, H, t, ps) {
  const { p, alpha } = layerPhase(L, t);
  if (alpha <= 0) return;
  const sc = W / 640;
  const entries = L.entries ?? [];
  const fs = 11.5 * sc, row = fs * 1.9, pad = 11 * sc;
  const bw = 130 * sc, bh = entries.length * row + pad * 1.4;
  const bx = 16 * sc, by = H - bh - 16 * sc;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ps.titleBg;
  ctx.strokeStyle = ps.dark ? ps.ink : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1 * sc;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5*sc); ctx.fill(); ctx.stroke();
  entries.forEach((en, i) => {
    const y = by + pad + i * row;
    ctx.fillStyle = en.color;
    ctx.fillRect(bx + pad, y, fs, fs);
    ctx.fillStyle = ps.titleFg;
    ctx.font = `600 ${fs}px 'Space Grotesk', sans-serif`;
    ctx.fillText(en.label, bx + pad + fs + 7*sc, y + fs - 1.5*sc);
  });
  ctx.restore();
}

/* ═════════════════════ MASTER FRAME RENDERER ══════════════════ */
function renderFrame(ctx, W, H, t, cam, layers, presetKey, countryPaths, extras = {}) {
  const ps = PRESETS[presetKey];
  const cp = camParams(cam, W, H);

  /* ── background ── */
  if (ps.paper) {
    ctx.drawImage(makePaper(presetKey, W, H), 0, 0);
  } else {
    ctx.fillStyle = ps.ocean;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── map space ── */
  ctx.save();
  ctx.scale(cp.s, cp.s);
  ctx.translate(-cp.mx0, -cp.my0);

  if (ps.paper) {
    // ocean wash over the paper inside map bounds
    ctx.fillStyle = ps.oceanWash;
    ctx.fillRect(-40, -40, MAP_W + 80, MAP_H + 80);
  }

  // graticule
  ctx.strokeStyle = ps.graticule;
  ctx.lineWidth = 0.45;
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = (lng + 180) / 360 * MAP_W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let lat = -75; lat <= 90; lat += 15) {
    const y = (90 - lat) / 180 * MAP_H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }

  // land
  ctx.fillStyle = ps.paper ? ps.landWash : ps.land;
  for (const { path } of countryPaths) ctx.fill(path, 'evenodd');
  // ink borders
  ctx.strokeStyle = ps.ink;
  ctx.lineWidth = ps.paper ? 0.55 : 0.5;
  for (const { path } of countryPaths) ctx.stroke(path);

  // hover highlight (editor only)
  if (extras.hoverId != null) {
    const f = countryPaths.find(cpp => cpp.id === extras.hoverId);
    if (f) {
      ctx.fillStyle = ps.accent + '3c';
      ctx.fill(f.path, 'evenodd');
      ctx.strokeStyle = ps.accent;
      ctx.lineWidth = 1;
      ctx.stroke(f.path);
    }
  }

  // territory layers
  for (const L of layers) {
    if (L.type !== 'territory' || !L.visible) continue;
    const f = countryPaths.find(cpp => cpp.id === L.countryId);
    if (!f) continue;
    const { p, alpha } = layerPhase(L, t);
    if (alpha <= 0) continue;
    if (L.glow) { ctx.shadowColor = L.fill; ctx.shadowBlur = 20; }
    ctx.globalAlpha = (L.fillOpacity ?? 0.5) * alpha * (L.anim === 'fade' ? 1 : p);
    ctx.fillStyle = L.fill;
    ctx.fill(f.path, 'evenodd');
    ctx.shadowBlur = 0;
    if ((L.strokeWidth ?? 0) > 0) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = L.stroke ?? L.fill;
      ctx.lineWidth = (L.strokeWidth ?? 1.4) / cp.s * (W/640);
      ctx.stroke(f.path);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* ── screen-space map-anchored layers ── */
  for (const L of layers) if (L.type === 'zone'      && L.visible) drawZone(ctx, L, cp, W, t);
  for (const L of layers) if (L.type === 'frontline' && L.visible) drawFrontline(ctx, L, cp, W, t);
  for (const L of layers) if (L.type === 'arrow'     && L.visible) drawArrow(ctx, L, cp, W, t);
  for (const L of layers) if (L.type === 'icon'      && L.visible) drawIcon(ctx, L, cp, W, t);
  for (const L of layers) if (L.type === 'pie'       && L.visible) drawPie(ctx, L, cp, W, t, ps);
  for (const L of layers) if (L.type === 'label'     && L.visible) drawLabel(ctx, L, cp, W, t, ps);

  /* drafts (editor previews) */
  if (extras.arrowStart) {
    const c = toScreen(extras.arrowStart.x, extras.arrowStart.y, cp);
    ctx.fillStyle = ps.accent;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = ps.accent;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (extras.frontDraft?.length) {
    ctx.strokeStyle = ps.accent;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    extras.frontDraft.forEach((pt, i) => {
      const c = toScreen(pt.x, pt.y, cp);
      i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    extras.frontDraft.forEach(pt => {
      const c = toScreen(pt.x, pt.y, cp);
      ctx.fillStyle = ps.accent;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI*2); ctx.fill();
    });
  }

  /* ── pure screen-space layers ── */
  for (const L of layers) if (L.type === 'legend' && L.visible) drawLegend(ctx, L, W, H, t, ps);
  for (const L of layers) if (L.type === 'date'   && L.visible) drawDate(ctx, L, W, H, t, ps);
  for (const L of layers) if (L.type === 'stat'   && L.visible) drawStat(ctx, L, W, H, t, ps);
  for (const L of layers) if (L.type === 'title'  && L.visible) drawTitle(ctx, L, W, H, t, ps);
  for (const L of layers) if (L.type === 'stamp'  && L.visible) drawStamp(ctx, L, W, H, t);

  /* ── cinematic finishing ── */
  // soft key light top-left
  const lg = ctx.createRadialGradient(W*0.3, -H*0.1, 0, W*0.3, -H*0.1, H*1.2);
  lg.addColorStop(0, 'rgba(255,250,235,0.07)');
  lg.addColorStop(1, 'transparent');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);

  // vignette
  const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.34, W/2, H/2, Math.max(W,H)*0.72);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(0,0,0,0.46)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // film grain
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = ps.paper ? 0.16 : 0.1;
  ctx.drawImage(getGrain(), 0, 0, W, H);
  ctx.restore();

  // preset FX
  if (ps.fx === 'scanlines') {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = ps.accent;
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  } else if (ps.fx === 'halftone') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ctx.createPattern(getHalftone(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ═════════════════════════ HELPERS ════════════════════════════ */
let _id = 1;
const nid = () => `L${_id++}`;

const LAYER_GROUPS = [
  ['territory', 'TERRITORI'],
  ['arrow,frontline', 'FRECCE & LINEE'],
  ['label,title,date,stamp', 'TESTI & TIMBRI'],
  ['stat,pie,icon,zone,legend', 'DATI & ICONE'],
];
const LAYER_ICONS = {
  territory: Square, arrow: ArrowRight, frontline: Minus, zone: Radio,
  label: MapPin, title: Type, stat: BarChart2, date: Clock,
  stamp: Stamp, icon: Crosshair, pie: PieChart, legend: Flag,
};

const STORE_KEY = 'cartaviva-v3';

/* ═════════════════════════ COMPONENT ══════════════════════════ */
export default function CartaVivaStudio() {
  /* refs */
  const canvasRef = useRef(null);
  const tlRef     = useRef(null);
  const animRef   = useRef(null);
  const panRef    = useRef(null);
  const dragRef   = useRef(null);   // layer drag on canvas
  const spanRef   = useRef(null);   // timeline span drag
  const movedRef  = useRef(false);
  const audioElRef  = useRef(null);
  const audioSrcRef = useRef(null);
  const waveRef     = useRef(null);

  /* geo */
  const geoFeatures  = useMemo(() => feature(countriesTopo, countriesTopo.objects.countries).features, []);
  const countryPaths = useMemo(() => geoFeatures.map(f => ({ id: f.id, feat: f, path: buildPath2D(f.geometry) })), [geoFeatures]);

  /* persisted project */
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }, []);

  const [projectName, setProjectName] = useState(saved.projectName ?? 'Progetto senza titolo');
  const [ratio,    setRatio]    = useState(saved.ratio ?? 'landscape');
  const [preset,   setPreset]   = useState(saved.preset ?? 'carta1800');
  const [layers,   setLayers]   = useState(saved.layers ?? []);
  const [beats,    setBeats]    = useState(saved.beats ?? []);
  const [cameraKFs, setCameraKFs] = useState(saved.cameraKFs ?? []);
  const [duration, setDuration] = useState(saved.duration ?? 15);

  useEffect(() => {
    const maxId = layers.reduce((m, l) => Math.max(m, parseInt(String(l.id).slice(1)) || 0), 0);
    if (maxId >= _id) _id = maxId + 1;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ projectName, ratio, preset, layers, beats, cameraKFs, duration }));
    } catch { /* quota */ }
  }, [projectName, ratio, preset, layers, beats, cameraKFs, duration]);

  /* ui state */
  const [tool,       setTool]       = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId,    setHoverId]    = useState(null);
  const [leftOpen,   setLeftOpen]   = useState(true);
  const [camera,     setCamera]     = useState(REGIONS.world);
  const [camTouched, setCamTouched] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing,    setPlaying]    = useState(false);
  const [allianceIdx, setAllianceIdx] = useState(0);

  /* drafts */
  const [arrowStart, setArrowStart] = useState(null);
  const [frontDraft, setFrontDraft] = useState([]);
  const [labelPos,   setLabelPos]   = useState(null);
  const [modal,      setModal]      = useState(null); // {kind:'title'|'stat'|'pie'|'export'}
  const [draft,      setDraft]      = useState({});

  /* export */
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);

  /* audio */
  const [audio, setAudio] = useState(null); // {name, url, peaks, dur}

  const ps = PRESETS[preset];
  const R  = RATIOS[ratio];
  const selected = layers.find(l => l.id === selectedId) ?? null;

  const mp4Mime = useMemo(() =>
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4']
      .find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || null, []);

  /* effective camera */
  const effCam = useMemo(() => {
    if (cameraKFs.length && (playing || !camTouched)) {
      return getCameraAt(cameraKFs, currentTime) ?? camera;
    }
    return camera;
  }, [camera, cameraKFs, currentTime, playing, camTouched]);

  /* ── render ── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    renderFrame(ctx, R.W, R.H, currentTime, effCam, layers, preset, countryPaths,
      { hoverId, arrowStart, frontDraft });
  }, [currentTime, effCam, layers, preset, countryPaths, hoverId, arrowStart, frontDraft, R]);

  /* re-render once webfonts are ready */
  const [, forceRender] = useState(0);
  useEffect(() => { document.fonts?.ready?.then(() => forceRender(n => n + 1)); }, []);

  /* ── playback ── */
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(animRef.current);
      audioElRef.current?.pause();
      return;
    }
    setCamTouched(false);
    const startT = currentTime >= duration ? 0 : currentTime;
    if (audioElRef.current) {
      audioElRef.current.currentTime = startT;
      audioElRef.current.play().catch(() => {});
    }
    let wall = null;
    const tick = (now) => {
      if (!wall) wall = now;
      const t = startT + (now - wall) / 1000;
      if (t >= duration) { setCurrentTime(duration); setPlaying(false); return; }
      setCurrentTime(t);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── coordinate helpers ── */
  const cssPoint = useCallback((e) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  }, []);
  const toMap = useCallback((css, cam = effCam) => {
    const cp = camParams(cam, R.W, R.H);
    return {
      x: cp.mx0 + (css.x / R.dispW) * cam.w,
      y: cp.my0 + (css.y / R.dispH) * (R.H / cp.s),
    };
  }, [effCam, R]);
  const toScreenCss = useCallback((mapX, mapY) => {
    const cp = camParams(effCam, R.W, R.H);
    return { x: (mapX - cp.mx0) * cp.s / (R.W / R.dispW), y: (mapY - cp.my0) * cp.s / (R.H / R.dispH) };
  }, [effCam, R]);

  /* ── layer ops ── */
  const upd = useCallback((id, patch) => setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l)), []);
  const del = useCallback((id) => {
    setLayers(ls => ls.filter(l => l.id !== id));
    setSelectedId(s => s === id ? null : s);
  }, []);

  const addLayer = useCallback((type, extra) => {
    const id = nid();
    const defaults = {
      territory: { anim: 'fade', animDur: 0.9 },
      arrow:     { anim: 'fade', animDur: 0.3, drawDur: 1.4 },
      frontline: { anim: 'fade', animDur: 0.3, drawDur: 2 },
      zone:      { anim: 'fade', animDur: 1 },
      label:     { anim: 'typewriter', animDur: 1.1 },
      title:     { anim: 'wipe', animDur: 0.9 },
      stat:      { anim: 'pop', animDur: 1.4 },
      date:      { anim: 'typewriter', animDur: 0.8 },
      stamp:     { anim: 'pop', animDur: 0.5 },
      icon:      { anim: 'pop', animDur: 0.6 },
      pie:       { anim: 'fade', animDur: 1.4 },
      legend:    { anim: 'fade', animDur: 0.8 },
    }[type] ?? {};
    setLayers(ls => [...ls, {
      id, type, name: type, visible: true, easing: 'smooth',
      startTime: Math.min(currentTime, duration - 1), endTime: duration,
      ...defaults, ...extra,
    }]);
    setSelectedId(id);
    return id;
  }, [currentTime, duration]);

  /* ── hit testing (select tool) ── */
  const hitTest = useCallback((css) => {
    const rev = [...layers].reverse();
    for (const L of rev) {
      if (!L.visible) continue;
      if (['label', 'icon', 'pie', 'zone'].includes(L.type)) {
        const sp = toScreenCss(L.mapX, L.mapY);
        const rad = L.type === 'zone' ? Math.max(20, (L.radius ?? 45) * (R.dispW / effCam.w)) : 26;
        if (Math.hypot(css.x - sp.x, css.y - sp.y) < rad) return L;
      } else if (L.type === 'stamp') {
        const sx = (L.rx ?? 0.5) * R.dispW, sy = (L.ry ?? 0.3) * R.dispH;
        if (Math.hypot(css.x - sx, css.y - sy) < 60) return L;
      }
    }
    return null;
  }, [layers, toScreenCss, R, effCam]);

  /* ── canvas mouse ── */
  const onCanvasDown = useCallback((e) => {
    movedRef.current = false;
    if (tool !== 'select') return;
    const css = cssPoint(e);
    const hit = hitTest(css);
    if (hit) {
      dragRef.current = { id: hit.id, type: hit.type, start: css,
        orig: hit.type === 'stamp' ? { rx: hit.rx, ry: hit.ry } : { mapX: hit.mapX, mapY: hit.mapY } };
    } else {
      panRef.current = { start: css, cam: { ...effCam } };
    }
  }, [tool, cssPoint, hitTest, effCam]);

  const onCanvasMove = useCallback((e) => {
    const css = cssPoint(e);
    if (dragRef.current) {
      movedRef.current = true;
      const d = dragRef.current;
      const dx = css.x - d.start.x, dy = css.y - d.start.y;
      if (d.type === 'stamp') {
        upd(d.id, { rx: clamp(d.orig.rx + dx / R.dispW, 0.02, 0.98), ry: clamp(d.orig.ry + dy / R.dispH, 0.02, 0.98) });
      } else {
        const cp = camParams(effCam, R.W, R.H);
        upd(d.id, {
          mapX: d.orig.mapX + dx / R.dispW * effCam.w,
          mapY: d.orig.mapY + dy / R.dispH * (R.H / cp.s),
        });
      }
      return;
    }
    if (panRef.current) {
      movedRef.current = true;
      const { start, cam } = panRef.current;
      const cp = camParams(cam, R.W, R.H);
      setCamTouched(true);
      setCamera({
        cx: clamp(cam.cx - (css.x - start.x) / R.dispW * cam.w, -150, MAP_W + 150),
        cy: clamp(cam.cy - (css.y - start.y) / R.dispH * (R.H / cp.s), -150, MAP_H + 150),
        w: cam.w,
      });
      return;
    }
    if (tool === 'territory') {
      const m = toMap(css);
      const hit = geoFeatures.find(f => pointInFeature(m.x, m.y, f));
      setHoverId(hit?.id ?? null);
    } else if (hoverId) setHoverId(null);
  }, [cssPoint, upd, effCam, R, tool, toMap, geoFeatures, hoverId]);

  const onCanvasUp = useCallback(() => { dragRef.current = null; panRef.current = null; }, []);

  const onCanvasClick = useCallback((e) => {
    if (movedRef.current) return;
    const css = cssPoint(e);
    const m = toMap(css);

    if (tool === 'select') {
      const hit = hitTest(css);
      setSelectedId(hit ? hit.id : null);
      return;
    }
    if (tool === 'territory') {
      const hit = geoFeatures.find(f => pointInFeature(m.x, m.y, f));
      if (!hit) return;
      const allianceColors = [ps.accent, ps.accent2, '#2a6ad4', '#7a28b8'];
      addLayer('territory', {
        name: CN[parseInt(hit.id)] ?? `Paese ${hit.id}`,
        countryId: hit.id, fill: allianceColors[allianceIdx % allianceColors.length],
        stroke: allianceColors[allianceIdx % allianceColors.length],
        fillOpacity: 0.5, strokeWidth: 1.4, glow: true,
      });
      return;
    }
    if (tool === 'arrow') {
      if (!arrowStart) setArrowStart(m);
      else {
        addLayer('arrow', {
          name: 'Freccia', pts: [arrowStart, m],
          color: ps.accent, width: 3.5, glow: true, dashed: false, curve: 0.28,
        });
        setArrowStart(null);
        setTool('select');
      }
      return;
    }
    if (tool === 'frontline') {
      setFrontDraft(d => [...d, m]);
      return;
    }
    if (tool === 'zone') {
      addLayer('zone', {
        name: 'Zona influenza', mapX: m.x, mapY: m.y,
        radius: 45, color: ps.accent, pulse: true,
      });
      setTool('select');
      return;
    }
    if (tool === 'label') {
      setLabelPos(m);
      setDraft({ text: '', subtext: '' });
      return;
    }
  }, [cssPoint, toMap, tool, hitTest, geoFeatures, addLayer, ps, arrowStart, allianceIdx]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const css = cssPoint(e);
    const m = toMap(css, camera);
    const factor = e.deltaY < 0 ? 0.8 : 1.25;
    const w = clamp(camera.w * factor, 40, 1400);
    const cp = camParams({ ...camera, w }, R.W, R.H);
    setCamTouched(true);
    setCamera({
      cx: clamp(m.x - (css.x / R.dispW - 0.5) * w, -150, MAP_W + 150),
      cy: clamp(m.y - (css.y / R.dispH - 0.5) * (R.H / cp.s), -150, MAP_H + 150),
      w,
    });
  }, [cssPoint, toMap, camera, R]);

  /* finish frontline on double-click / Enter */
  const finishFront = useCallback(() => {
    if (frontDraft.length >= 2) {
      addLayer('frontline', {
        name: 'Linea di fronte', pts: frontDraft,
        color: ps.accent, width: 3, glow: false,
      });
    }
    setFrontDraft([]);
    setTool('select');
  }, [frontDraft, addLayer, ps]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && tool === 'frontline') finishFront();
      if (e.key === 'Escape') { setFrontDraft([]); setArrowStart(null); if (tool !== 'select') setTool('select'); }
      if (e.key === ' ' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, finishFront]);

  /* ── tool activation ── */
  const activateTool = (t) => {
    setArrowStart(null); setFrontDraft([]); setLabelPos(null);
    if (t === 'title') { setModal({ kind: 'title' }); setDraft({ text: '', subtext: '', position: 'bottom', variant: 'cinematic' }); return; }
    if (t === 'stat')  { setModal({ kind: 'stat' });  setDraft({ label: '', value: '', corner: 'tr' }); return; }
    if (t === 'pie')   { setModal({ kind: 'pie' });   setDraft({ label: '', value: 50 }); return; }
    if (t === 'date')  {
      addLayer('date', { name: 'Data', text: `${new Date().getFullYear()} — DOSSIER`, color: ps.accent });
      setTool('select');
      return;
    }
    setTool(t);
  };

  /* ── library: stamps & icons ── */
  const addStamp = (text) => {
    addLayer('stamp', {
      name: text, text, color: ps.accent,
      rx: 0.32 + Math.random()*0.36, ry: 0.18 + Math.random()*0.25,
      angle: -16 + Math.random()*10, fontSize: 26,
    });
  };
  const addIcon = (kind, label) => {
    addLayer('icon', {
      name: label, kind, mapX: effCam.cx, mapY: effCam.cy,
      size: 30, color: ps.accent, glow: true,
    });
    setTool('select');
  };

  /* ── quick actions ── */
  const qaBreaking = () => {
    addLayer('title', {
      name: 'BREAKING', text: draftSafe('ULTIME NOTIZIE DAL FRONTE'), variant: 'breaking',
      position: 'top', accent: ps.accent, bg: ps.titleBg, fg: ps.titleFg, anim: 'wipe',
    });
    addLayer('date', { name: 'Data', text: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(), color: ps.accent });
  };
  const draftSafe = (s) => s;
  const qaConflict = () => {
    addLayer('zone', { name: 'Zona conflitto', mapX: effCam.cx, mapY: effCam.cy, radius: 50, color: ps.accent, pulse: true });
    addLayer('icon', { name: 'Bersaglio', kind: 'target', mapX: effCam.cx, mapY: effCam.cy, size: 26, color: ps.accent, glow: true, startTime: Math.min(currentTime + 0.5, duration - 1) });
    addLayer('stat', { name: 'Dato', label: 'FORZE IN CAMPO', value: '120000', corner: 'tr', color: ps.accent, startTime: Math.min(currentTime + 1, duration - 1) });
  };
  const qaAlliances = () => {
    addLayer('legend', {
      name: 'Legenda', entries: [
        { color: ps.accent,  label: 'Blocco A' },
        { color: '#2a6ad4',  label: 'Blocco B' },
      ],
    });
    setAllianceIdx(0);
    setTool('territory');
  };
  const qaHistory = () => {
    addLayer('date', { name: 'Anno', text: '1939', color: ps.accent });
    const t0 = currentTime;
    setCameraKFs(kfs => [...kfs.filter(k => k.time < t0 || k.time > t0 + 3.2),
      { time: t0, ...camera },
      { time: Math.min(t0 + 3, duration), cx: camera.cx, cy: camera.cy, w: Math.max(camera.w * 0.45, 60) },
    ].sort((a,b) => a.time - b.time));
  };

  /* ── modals commit ── */
  const commitLabel = () => {
    if (!draft.text?.trim() || !labelPos) { setLabelPos(null); return; }
    addLayer('label', {
      name: draft.text.slice(0, 20), text: draft.text, subtext: draft.subtext || '',
      mapX: labelPos.x, mapY: labelPos.y, color: ps.accent, fontSize: 14,
      mono: preset === 'dossier',
    });
    setLabelPos(null);
    setTool('select');
  };
  const commitModal = () => {
    const k = modal?.kind;
    if (k === 'title' && draft.text?.trim()) {
      addLayer('title', {
        name: draft.text.slice(0, 22), text: draft.text, subtext: draft.subtext || '',
        position: draft.position ?? 'bottom', variant: draft.variant ?? 'cinematic',
        accent: ps.accent, bg: ps.titleBg, fg: ps.titleFg,
      });
    }
    if (k === 'stat' && draft.value?.trim()) {
      addLayer('stat', {
        name: draft.label || 'Dato', label: draft.label || 'DATO',
        value: draft.value, corner: draft.corner ?? 'tr', color: ps.accent,
      });
    }
    if (k === 'pie') {
      addLayer('pie', {
        name: draft.label || 'Grafico', label: draft.label || '',
        value: Number(draft.value) || 50, mapX: effCam.cx, mapY: effCam.cy,
        size: 34, color: ps.accent,
      });
      setTool('select');
    }
    setModal(null);
  };

  /* ── camera KFs ── */
  const addCameraKF = () => {
    setCameraKFs(kfs => [...kfs.filter(k => Math.abs(k.time - currentTime) > 0.12),
      { time: currentTime, ...camera }].sort((a,b) => a.time - b.time));
    setCamTouched(false);
  };

  /* ── beats ── */
  const addBeat = () => setBeats(bs => [...bs, { id: nid(), time: currentTime, label: `Capitolo ${bs.length + 1}` }].sort((a,b) => a.time - b.time));

  /* ── timeline scrub + span drag ── */
  const scrubTo = (clientX) => {
    const r = tlRef.current?.getBoundingClientRect();
    if (!r) return;
    const t = clamp((clientX - r.left) / r.width, 0, 1) * duration;
    setCurrentTime(t);
    setPlaying(false);
    setCamTouched(false);
    if (audioElRef.current) audioElRef.current.currentTime = t;
  };

  const onSpanDown = (e, L) => {
    e.stopPropagation();
    const spanEl = e.currentTarget;
    const rect = spanEl.getBoundingClientRect();
    const trackRect = spanEl.parentElement.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    const mode = rel < 7 ? 'l' : rel > rect.width - 7 ? 'r' : 'm';
    spanRef.current = { id: L.id, mode, x0: e.clientX, s0: L.startTime, e0: L.endTime, pps: trackRect.width / duration };
    setSelectedId(L.id);
    const onMove = (ev) => {
      const d = spanRef.current;
      if (!d) return;
      const dt = (ev.clientX - d.x0) / d.pps;
      if (d.mode === 'm') {
        const len = d.e0 - d.s0;
        const ns = clamp(d.s0 + dt, 0, duration - len);
        upd(d.id, { startTime: ns, endTime: ns + len });
      } else if (d.mode === 'l') {
        upd(d.id, { startTime: clamp(d.s0 + dt, 0, d.e0 - 0.3) });
      } else {
        upd(d.id, { endTime: clamp(d.e0 + dt, d.s0 + 0.3, duration) });
      }
    };
    const onUp = () => { spanRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ── audio ── */
  const onAudioFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const buf = await file.arrayBuffer();
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await actx.decodeAudioData(buf);
      const ch = decoded.getChannelData(0);
      const N = 480, peaks = new Array(N);
      const block = Math.floor(ch.length / N);
      for (let i = 0; i < N; i++) {
        let max = 0;
        for (let j = 0; j < block; j += 16) max = Math.max(max, Math.abs(ch[i*block + j] || 0));
        peaks[i] = max;
      }
      actx.close();
      setAudio({ name: file.name, url, peaks, dur: decoded.duration });
    } catch {
      setAudio({ name: file.name, url, peaks: [], dur: 0 });
    }
  };

  useEffect(() => {
    const cv = waveRef.current;
    if (!cv || !audio?.peaks?.length) return;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    x.fillStyle = ps.accent + '99';
    const bw = cv.width / audio.peaks.length;
    const audioFrac = Math.min(audio.dur / duration, 1);
    audio.peaks.forEach((pk, i) => {
      const h = Math.max(1, pk * cv.height * 0.9);
      x.fillRect(i * bw * audioFrac, (cv.height - h)/2, Math.max(bw - 0.5, 0.5), h);
    });
  }, [audio, ps, duration]);

  /* ── export ── */
  const startExport = (format) => {
    setModal(null);
    const cv = canvasRef.current;
    if (!cv) return;
    setExporting(true);
    setExportPct(0);
    setPlaying(false);

    const mime = format === 'mp4' && mp4Mime ? mp4Mime
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';

    const stream = cv.captureStream(30);
    // mux narration audio
    if (audio && audioElRef.current) {
      try {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioSrcRef.current || audioSrcRef.current.el !== audioElRef.current) {
          audioSrcRef.current = { el: audioElRef.current, node: actx.createMediaElementSource(audioElRef.current), ctx: actx };
        }
        const dest = audioSrcRef.current.ctx.createMediaStreamDestination();
        audioSrcRef.current.node.connect(dest);
        audioSrcRef.current.node.connect(audioSrcRef.current.ctx.destination);
        dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
        audioElRef.current.currentTime = 0;
        audioElRef.current.play().catch(() => {});
      } catch { /* element already wired */ }
    }

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      audioElRef.current?.pause();
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}_${R.label.replace(':', 'x')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
      setExportPct(0);
    };

    rec.start();
    const ctx = cv.getContext('2d');
    let wall = null;
    const loop = (now) => {
      if (!wall) wall = now;
      const t = (now - wall) / 1000;
      if (t >= duration + 0.1) { rec.stop(); return; }
      const cam = cameraKFs.length ? (getCameraAt(cameraKFs, t) ?? camera) : camera;
      renderFrame(ctx, R.W, R.H, t, cam, layers, preset, countryPaths, {});
      setExportPct(Math.min(99, Math.round(t / duration * 100)));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const exportPNG = () => {
    canvasRef.current?.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${projectName.replace(/\s+/g, '_')}.png`;
      a.click();
    }, 'image/png');
  };

  /* ── derived ── */
  const cursor = tool === 'select' ? (panRef.current ? 'grabbing' : 'grab') : 'crosshair';
  const trackGroups = LAYER_GROUPS.map(([types, label]) => ({
    label, items: layers.filter(l => types.split(',').includes(l.type)),
  })).filter(g => g.items.length);

  /* ════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden select-none"
      style={{ '--cva': ps.accent, '--cva2': ps.accent2, background: 'radial-gradient(ellipse at 50% -20%, #131722 0%, #07090f 55%, #04060a 100%)' }}>

      {/* ═══ STUDIO HEADER ═══ */}
      <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06]"
        style={{ background: 'linear-gradient(180deg, rgba(18,22,32,0.9), rgba(10,12,18,0.9))', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => setLeftOpen(o => !o)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5">
          {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shadow-[0_0_14px_var(--cva)]" style={{ background: ps.accent }}>
            <Layers className="w-3.5 h-3.5 text-black/80" />
          </div>
          <span className="text-[13px] font-bold tracking-wide text-slate-100">CARTAVIVA</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[var(--cva)] tracking-widest">STUDIO</span>
        </div>
        <div className="w-px h-5 bg-white/10" />
        <input value={projectName} onChange={e => setProjectName(e.target.value)}
          className="bg-transparent text-[12px] text-slate-400 outline-none focus:text-slate-100 w-44 border-b border-transparent focus:border-[var(--cva)]/50 transition-colors" />

        <div className="flex-1" />

        {/* ratio toggle */}
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/[0.07]">
          {[['landscape', Monitor, '16:9'], ['portrait', Smartphone, '9:16']].map(([k, Icon, lbl]) => (
            <button key={k} onClick={() => setRatio(k)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all ${ratio === k ? 'text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              style={ratio === k ? { background: ps.accent } : {}}>
              <Icon className="w-3 h-3" /> {lbl}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-mono text-slate-500 tabular-nums">
          <span className="text-slate-200">{currentTime.toFixed(1)}</span> / {duration}s
        </div>

        <button onClick={() => setModal({ kind: 'export' })}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-bold tracking-wide text-black transition-transform active:scale-95 shadow-[0_4px_20px_-4px_var(--cva)]"
          style={{ background: `linear-gradient(135deg, ${ps.accent}, ${ps.accent2 ?? ps.accent})` }}>
          <Download className="w-3.5 h-3.5" /> ESPORTA
        </button>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ═══ LEFT SIDEBAR ═══ */}
        <AnimatePresence initial={false}>
          {leftOpen && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 216, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="border-r border-white/[0.06] flex flex-col shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(180deg, rgba(13,16,24,0.96), rgba(8,10,16,0.96))' }}>
              <div className="w-[216px] flex flex-col flex-1 min-h-0 overflow-y-auto">

                {/* tools */}
                <Section title="Strumenti animazione">
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      ['select', Move, 'Seleziona'], ['territory', Square, 'Territorio'],
                      ['arrow', ArrowRight, 'Freccia'], ['frontline', Minus, 'Fronte'],
                      ['zone', Radio, 'Zona'], ['label', MapPin, 'Etichetta'],
                      ['title', Type, 'Titolo'], ['stat', BarChart2, 'Statistica'],
                      ['date', Clock, 'Data'], ['pie', PieChart, 'Grafico'],
                    ].map(([t, Icon, label]) => (
                      <ToolBtn key={t} active={tool === t} onClick={() => activateTool(t)} Icon={Icon} label={label} />
                    ))}
                  </div>
                  {tool === 'frontline' && (
                    <button onClick={finishFront}
                      className="mt-1.5 w-full py-1.5 rounded-lg text-[10px] font-semibold text-black"
                      style={{ background: ps.accent }}>
                      ✓ CHIUDI LINEA ({frontDraft.length} punti — o premi Invio)
                    </button>
                  )}
                </Section>

                {/* map styles */}
                <Section title="Stili mappa">
                  <div className="space-y-1">
                    {Object.entries(PRESETS).map(([k, v]) => (
                      <button key={k} onClick={() => setPreset(k)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all text-left ${preset === k ? 'border-[var(--cva)]/60 bg-[var(--cva)]/10 text-slate-100' : 'border-white/[0.05] text-slate-500 hover:text-slate-300 hover:border-white/10'}`}>
                        <span className="w-3 h-3 rounded-sm shrink-0 border border-black/30"
                          style={{ background: v.paper ? v.paperA : v.ocean }} />
                        <span className="truncate">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* quick actions */}
                <Section title="Azioni rapide">
                  <div className="space-y-1">
                    {[
                      ['⚡ Aggiungi Breaking News', qaBreaking],
                      ['💥 Crea Conflitto', qaConflict],
                      ['🤝 Mostra Alleanze', qaAlliances],
                      ['📜 Evoluzione Storica', qaHistory],
                    ].map(([label, fn]) => (
                      <button key={label} onClick={fn}
                        className="w-full px-2.5 py-1.5 rounded-lg text-[10.5px] text-left border border-white/[0.05] text-slate-400 hover:text-slate-100 hover:border-[var(--cva)]/40 hover:bg-[var(--cva)]/5 transition-all">
                        {label}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* regions */}
                <Section title="Vai a regione">
                  <div className="grid grid-cols-2 gap-1">
                    {[['world','Mondo'],['europe','Europa'],['mideast','M. Oriente'],['eastasia','Asia Est'],['africa','Africa'],['americas','Americhe'],['russia','Russia']].map(([k, l]) => (
                      <button key={k} onClick={() => { setCamera(REGIONS[k]); setCamTouched(true); }}
                        className="py-1.5 px-1 text-[10px] rounded-lg border border-white/[0.05] text-slate-500 hover:text-slate-200 hover:border-white/15 truncate transition-colors">
                        {l}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* camera */}
                <Section title={`Camera keyframes (${cameraKFs.length})`}>
                  <button onClick={addCameraKF}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[var(--cva)]/40 text-[var(--cva)] text-[11px] font-semibold hover:bg-[var(--cva)]/10 transition-colors">
                    <CameraIcon className="w-3.5 h-3.5" /> KF @ {currentTime.toFixed(1)}s
                  </button>
                  {cameraKFs.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {cameraKFs.map((kf, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] text-slate-500 px-1.5 py-0.5 rounded hover:bg-white/5">
                          <button onClick={() => { setCurrentTime(kf.time); setCamTouched(false); }} className="hover:text-slate-200 font-mono">▸ {kf.time.toFixed(1)}s</button>
                          <span className="font-mono opacity-60">zoom {(MAP_W/kf.w).toFixed(1)}×</span>
                          <button onClick={() => setCameraKFs(kfs => kfs.filter((_, j) => j !== i))} className="text-red-700 hover:text-red-400">✕</button>
                        </div>
                      ))}
                      <button onClick={() => setCameraKFs([])} className="text-[9px] text-red-800 hover:text-red-500 px-1.5">cancella tutti</button>
                    </div>
                  )}
                </Section>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ CENTER ═══ */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

          {/* preview area */}
          <div className="flex-1 flex items-center justify-center min-h-0 relative py-3">
            {/* ambient glow behind canvas */}
            <div className="absolute pointer-events-none rounded-[40px] blur-3xl opacity-20"
              style={{ width: R.dispW * 0.9, height: R.dispH * 0.9, background: ps.accent }} />

            <div className="relative" style={{ width: R.dispW, height: R.dispH }}>
              <canvas
                ref={canvasRef}
                width={R.W} height={R.H}
                className="block rounded-xl"
                style={{
                  width: R.dispW, height: R.dispH, cursor,
                  boxShadow: '0 50px 100px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.08), 0 0 60px -20px var(--cva)',
                }}
                onMouseDown={onCanvasDown}
                onMouseMove={onCanvasMove}
                onMouseUp={onCanvasUp}
                onMouseLeave={onCanvasUp}
                onClick={onCanvasClick}
                onDoubleClick={() => tool === 'frontline' && finishFront()}
                onWheel={onWheel}
              />

              {/* contextual hints */}
              {(arrowStart || tool === 'territory' || tool === 'label' || tool === 'frontline' || tool === 'zone') && (
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-medium pointer-events-none border backdrop-blur-md"
                  style={{ borderColor: ps.accent + '70', color: ps.accent, background: 'rgba(0,0,0,0.65)' }}>
                  {arrowStart ? '⟶ Clicca il punto di arrivo'
                    : tool === 'territory' ? '◼ Clicca un paese per evidenziarlo'
                    : tool === 'frontline' ? '〰 Clicca i punti del fronte • Invio per chiudere'
                    : tool === 'zone' ? '◎ Clicca il centro della zona di influenza'
                    : '📍 Clicca per posizionare l\'etichetta'}
                </div>
              )}
              {hoverId && tool === 'territory' && (
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold pointer-events-none"
                  style={{ background: ps.accent, color: '#000' }}>
                  {CN[parseInt(hoverId)] ?? `#${hoverId}`}
                </div>
              )}
            </div>
          </div>

          {/* transport + timeline */}
          <div className="shrink-0 border-t border-white/[0.06] px-4 pt-2 pb-2.5"
            style={{ background: 'linear-gradient(180deg, rgba(12,15,22,0.97), rgba(7,9,14,0.97))' }}>

            {/* transport row */}
            <div className="flex items-center gap-2.5 mb-1.5">
              <button onClick={() => { setCurrentTime(0); setPlaying(false); setCamTouched(false); if (audioElRef.current) audioElRef.current.currentTime = 0; }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5"><SkipBack className="w-4 h-4" /></button>
              <button onClick={() => setPlaying(p => !p)}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 shadow-[0_0_24px_-4px_var(--cva)]"
                style={{ background: `linear-gradient(135deg, ${ps.accent}, ${ps.accent2 ?? ps.accent})` }}>
                {playing ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black ml-0.5" />}
              </button>

              {/* master scrubber */}
              <div ref={tlRef}
                className="flex-1 h-6 relative cursor-pointer group"
                onMouseDown={e => { scrubTo(e.clientX);
                  const mv = ev => scrubTo(ev.clientX);
                  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
                  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
                }}>
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/[0.07]" />
                <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full left-0"
                  style={{ width: `${currentTime/duration*100}%`, background: `linear-gradient(90deg, ${ps.accent}88, ${ps.accent})` }} />
                {/* beat markers */}
                {beats.map(b => (
                  <div key={b.id} title={b.label}
                    className="absolute top-0 w-[3px] h-2.5 rounded-sm bg-amber-400/90"
                    style={{ left: `${b.time/duration*100}%` }} />
                ))}
                {/* camera KF diamonds */}
                {cameraKFs.map((kf, i) => (
                  <div key={i} className="absolute bottom-0 w-2 h-2 rotate-45 border border-black/40 bg-white"
                    style={{ left: `calc(${kf.time/duration*100}% - 4px)` }} />
                ))}
                {/* playhead */}
                <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none shadow-[0_0_10px_var(--cva)]"
                  style={{ left: `calc(${currentTime/duration*100}% - 7px)`, background: ps.accent }} />
              </div>

              <button onClick={addBeat} title="Aggiungi Narrative Beat"
                className="p-1.5 rounded-lg text-amber-500/80 hover:text-amber-300 hover:bg-white/5"><BookMarked className="w-4 h-4" /></button>

              <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="text-[10px] bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-slate-400 outline-none cursor-pointer">
                {[8, 10, 12, 15, 20, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d}s</option>)}
              </select>
            </div>

            {/* multi-track area */}
            <div className="max-h-[120px] overflow-y-auto pr-1 space-y-1">
              {trackGroups.map(g => (
                <div key={g.label}>
                  <div className="text-[8px] tracking-[0.18em] text-slate-700 font-bold mb-0.5">{g.label}</div>
                  {g.items.map(L => (
                    <div key={L.id} className="flex items-center gap-1.5 h-[15px] group/tr">
                      <button onClick={() => setSelectedId(L.id === selectedId ? null : L.id)}
                        className={`w-24 truncate text-left text-[9px] transition-colors ${selectedId === L.id ? 'text-[var(--cva)]' : 'text-slate-600 hover:text-slate-400'}`}>
                        {L.name}
                      </button>
                      <div className="flex-1 h-[9px] bg-white/[0.04] rounded relative">
                        <div
                          onPointerDown={e => onSpanDown(e, L)}
                          className={`absolute h-full rounded cursor-grab active:cursor-grabbing transition-shadow ${selectedId === L.id ? 'ring-1 ring-white/70' : ''}`}
                          style={{
                            left: `${L.startTime/duration*100}%`,
                            width: `${Math.max(1.2, (L.endTime - L.startTime)/duration*100)}%`,
                            background: `linear-gradient(90deg, ${(L.color || L.fill || L.accent || '#777')}cc, ${(L.color || L.fill || L.accent || '#777')}77)`,
                          }}>
                          <div className="absolute left-0 top-0 bottom-0 w-[5px] cursor-ew-resize" />
                          <div className="absolute right-0 top-0 bottom-0 w-[5px] cursor-ew-resize" />
                        </div>
                        <div className="absolute top-[-2px] bottom-[-2px] w-px bg-white/25 pointer-events-none"
                          style={{ left: `${currentTime/duration*100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* audio track */}
              <div>
                <div className="text-[8px] tracking-[0.18em] text-slate-700 font-bold mb-0.5 flex items-center gap-2">
                  AUDIO / NARRAZIONE
                  <label className="cursor-pointer text-[var(--cva)]/80 hover:text-[var(--cva)] normal-case tracking-normal flex items-center gap-1">
                    <Music className="w-2.5 h-2.5" /> {audio ? 'sostituisci' : 'carica voce narrante'}
                    <input type="file" accept="audio/*" className="hidden" onChange={onAudioFile} />
                  </label>
                  {audio && <button onClick={() => setAudio(null)} className="text-red-800 hover:text-red-500">✕</button>}
                </div>
                <div className="flex items-center gap-1.5 h-[18px]">
                  <div className="w-24 truncate text-[9px] text-slate-600">{audio?.name ?? '—'}</div>
                  <div className="flex-1 h-[16px] bg-white/[0.04] rounded relative overflow-hidden">
                    <canvas ref={waveRef} width={480} height={16} className="w-full h-full" />
                    <div className="absolute top-0 bottom-0 w-px bg-white/30 pointer-events-none"
                      style={{ left: `${currentTime/duration*100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div className="w-[252px] border-l border-white/[0.06] flex flex-col shrink-0 overflow-y-auto"
          style={{ background: 'linear-gradient(180deg, rgba(13,16,24,0.96), rgba(8,10,16,0.96))' }}>

          {/* properties */}
          <Section title={selected ? `Proprietà — ${selected.name}` : 'Proprietà layer'}>
            {!selected ? (
              <div className="text-[10.5px] text-slate-600 leading-relaxed space-y-1">
                <div>① Scegli uno strumento a sinistra</div>
                <div>② Clicca sulla mappa</div>
                <div>③ Regola timing nella timeline</div>
                <div className="pt-1.5 text-slate-700">Scroll = zoom · Trascina = pan<br/>Spazio = play/pausa · Esc = annulla</div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <PropInput label="Nome" value={selected.name} onChange={v => upd(selected.id, { name: v })} />

                <div className="grid grid-cols-2 gap-1.5">
                  <PropNum label="Inizio (s)" value={selected.startTime} min={0} max={duration} step={0.1}
                    onChange={v => upd(selected.id, { startTime: clamp(v, 0, selected.endTime - 0.2) })} />
                  <PropNum label="Fine (s)" value={selected.endTime} min={0} max={duration} step={0.1}
                    onChange={v => upd(selected.id, { endTime: clamp(v, selected.startTime + 0.2, duration) })} />
                </div>

                {/* anim preset */}
                <div>
                  <div className="prop-label">Animazione ingresso</div>
                  <div className="grid grid-cols-3 gap-1">
                    {ANIMS.filter(([a]) => !(a === 'typewriter' && !['label','date','title'].includes(selected.type))).map(([a, lbl]) => (
                      <button key={a} onClick={() => upd(selected.id, { anim: a })}
                        className={`py-1 rounded-md text-[9px] border transition-all ${selected.anim === a ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/[0.07] text-slate-600 hover:text-slate-400'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <PropNum label="Durata anim (s)" value={selected.animDur ?? 0.8} min={0.1} max={4} step={0.1}
                    onChange={v => upd(selected.id, { animDur: v })} />
                  <div>
                    <div className="prop-label">Easing</div>
                    <select value={selected.easing ?? 'smooth'} onChange={e => upd(selected.id, { easing: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-1.5 py-[5px] text-[10px] text-slate-300 outline-none">
                      {EASE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {/* color (universal-ish) */}
                {'color' in selected || 'fill' in selected ? (
                  <div className="flex items-center justify-between">
                    <span className="prop-label !mb-0">Colore</span>
                    <input type="color" value={selected.fill ?? selected.color}
                      onChange={e => upd(selected.id, selected.type === 'territory' ? { fill: e.target.value, stroke: e.target.value } : { color: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-white/15 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                ) : null}

                {/* type-specific */}
                {selected.type === 'territory' && (<>
                  <PropSlider label="Opacità" value={selected.fillOpacity ?? 0.5} min={0.05} max={1} step={0.05}
                    display={`${Math.round((selected.fillOpacity ?? 0.5)*100)}%`} onChange={v => upd(selected.id, { fillOpacity: v })} />
                  <PropSlider label="Bordo" value={selected.strokeWidth ?? 1.4} min={0} max={5} step={0.2}
                    display={`${(selected.strokeWidth ?? 1.4).toFixed(1)}px`} onChange={v => upd(selected.id, { strokeWidth: v })} />
                  <PropToggle label="✦ Glow" active={selected.glow} onClick={() => upd(selected.id, { glow: !selected.glow })} />
                </>)}

                {(selected.type === 'arrow' || selected.type === 'frontline') && (<>
                  <PropSlider label="Spessore" value={selected.width ?? 3.5} min={1} max={9} step={0.5}
                    display={`${selected.width ?? 3.5}px`} onChange={v => upd(selected.id, { width: v })} />
                  <PropSlider label="Durata tracciato" value={selected.drawDur ?? 1.5} min={0.3} max={5} step={0.1}
                    display={`${(selected.drawDur ?? 1.5).toFixed(1)}s`} onChange={v => upd(selected.id, { drawDur: v })} />
                  {selected.type === 'arrow' && (<>
                    <PropSlider label="Curvatura" value={selected.curve ?? 0.28} min={-0.6} max={0.6} step={0.04}
                      display={(selected.curve ?? 0.28).toFixed(2)} onChange={v => upd(selected.id, { curve: v })} />
                    <div className="flex gap-1.5">
                      <PropToggle label="✦ Glow" active={selected.glow} onClick={() => upd(selected.id, { glow: !selected.glow })} half />
                      <PropToggle label="┄ Tratteggio" active={selected.dashed} onClick={() => upd(selected.id, { dashed: !selected.dashed })} half />
                    </div>
                  </>)}
                </>)}

                {selected.type === 'zone' && (<>
                  <PropSlider label="Raggio" value={selected.radius ?? 45} min={8} max={180} step={2}
                    display={`${selected.radius ?? 45}`} onChange={v => upd(selected.id, { radius: v })} />
                  <PropToggle label="◎ Pulsazione" active={selected.pulse} onClick={() => upd(selected.id, { pulse: !selected.pulse })} />
                </>)}

                {selected.type === 'label' && (<>
                  <PropInput label="Testo" value={selected.text} onChange={v => upd(selected.id, { text: v, name: v.slice(0,20) })} />
                  <PropInput label="Sottotesto" value={selected.subtext ?? ''} onChange={v => upd(selected.id, { subtext: v })} />
                  <PropSlider label="Dimensione" value={selected.fontSize ?? 14} min={8} max={30} step={1}
                    display={`${selected.fontSize ?? 14}px`} onChange={v => upd(selected.id, { fontSize: v })} />
                  <PropToggle label="⌨ Font dattilografo" active={selected.mono} onClick={() => upd(selected.id, { mono: !selected.mono })} />
                </>)}

                {selected.type === 'title' && (<>
                  <PropInput label="Titolo" value={selected.text} onChange={v => upd(selected.id, { text: v, name: v.slice(0,22) })} />
                  <PropInput label="Sottotitolo" value={selected.subtext ?? ''} onChange={v => upd(selected.id, { subtext: v })} />
                  <div className="flex gap-1">
                    {['top','center','bottom'].map(pos => (
                      <button key={pos} onClick={() => upd(selected.id, { position: pos })}
                        className={`flex-1 py-1 rounded-md text-[9px] border capitalize ${selected.position === pos ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/[0.07] text-slate-600'}`}>
                        {pos}
                      </button>
                    ))}
                  </div>
                  <PropToggle label="🔴 Variante Breaking" active={selected.variant === 'breaking'}
                    onClick={() => upd(selected.id, { variant: selected.variant === 'breaking' ? 'cinematic' : 'breaking' })} />
                </>)}

                {selected.type === 'stat' && (<>
                  <PropInput label="Etichetta" value={selected.label ?? ''} onChange={v => upd(selected.id, { label: v })} />
                  <PropInput label="Valore" value={String(selected.value ?? '')} onChange={v => upd(selected.id, { value: v })} />
                  <div className="flex gap-1">
                    {[['tl','↖'],['tr','↗'],['bl','↙'],['br','↘']].map(([c, sym]) => (
                      <button key={c} onClick={() => upd(selected.id, { corner: c })}
                        className={`flex-1 py-1 rounded-md text-[11px] border ${selected.corner === c ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/[0.07] text-slate-600'}`}>
                        {sym}
                      </button>
                    ))}
                  </div>
                </>)}

                {selected.type === 'date' && (
                  <PropInput label="Testo" value={selected.text} onChange={v => upd(selected.id, { text: v })} />
                )}

                {selected.type === 'stamp' && (<>
                  <div>
                    <div className="prop-label">Testo timbro</div>
                    <select value={selected.text} onChange={e => upd(selected.id, { text: e.target.value, name: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 outline-none">
                      {STAMP_TEXTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <PropSlider label="Dimensione" value={selected.fontSize ?? 26} min={12} max={52} step={1}
                    display={`${selected.fontSize ?? 26}px`} onChange={v => upd(selected.id, { fontSize: v })} />
                  <PropSlider label="Rotazione" value={selected.angle ?? -12} min={-45} max={45} step={1}
                    display={`${selected.angle ?? -12}°`} onChange={v => upd(selected.id, { angle: v })} />
                </>)}

                {selected.type === 'icon' && (<>
                  <div>
                    <div className="prop-label">Tipo icona</div>
                    <div className="grid grid-cols-4 gap-1">
                      {ICON_KINDS.map(([k]) => (
                        <button key={k} onClick={() => upd(selected.id, { kind: k })}
                          className={`py-1 rounded-md text-[8px] border uppercase ${selected.kind === k ? 'border-[var(--cva)] text-[var(--cva)]' : 'border-white/[0.07] text-slate-600'}`}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PropSlider label="Dimensione" value={selected.size ?? 30} min={12} max={80} step={2}
                    display={`${selected.size ?? 30}px`} onChange={v => upd(selected.id, { size: v })} />
                  <PropToggle label="✦ Glow" active={selected.glow} onClick={() => upd(selected.id, { glow: !selected.glow })} />
                </>)}

                {selected.type === 'pie' && (<>
                  <PropInput label="Etichetta" value={selected.label ?? ''} onChange={v => upd(selected.id, { label: v })} />
                  <PropSlider label="Valore %" value={selected.value ?? 50} min={1} max={100} step={1}
                    display={`${selected.value ?? 50}%`} onChange={v => upd(selected.id, { value: v })} />
                  <PropSlider label="Dimensione" value={selected.size ?? 34} min={16} max={80} step={2}
                    display={`${selected.size ?? 34}px`} onChange={v => upd(selected.id, { size: v })} />
                </>)}

                {selected.type === 'legend' && (selected.entries ?? []).map((en, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="color" value={en.color}
                      onChange={e => upd(selected.id, { entries: selected.entries.map((x,j) => j===i ? { ...x, color: e.target.value } : x) })}
                      className="w-6 h-6 rounded border border-white/15 bg-transparent p-0.5 cursor-pointer shrink-0" />
                    <input value={en.label}
                      onChange={e => upd(selected.id, { entries: selected.entries.map((x,j) => j===i ? { ...x, label: e.target.value } : x) })}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-slate-300 outline-none min-w-0" />
                  </div>
                ))}

                <button onClick={() => del(selected.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-red-900/60 text-red-500 hover:bg-red-950/40 text-[10.5px] transition-colors">
                  <Trash2 className="w-3 h-3" /> Elimina layer
                </button>
              </div>
            )}
          </Section>

          {/* overlay library */}
          <Section title="Libreria overlay">
            <div className="prop-label">Timbri vintage</div>
            <div className="flex flex-wrap gap-1 mb-2.5">
              {STAMP_TEXTS.map(s => (
                <button key={s} onClick={() => addStamp(s)}
                  className="px-2 py-1 rounded border-2 border-double text-[8px] font-bold tracking-wider hover:scale-105 transition-transform"
                  style={{ borderColor: ps.accent + '90', color: ps.accent, transform: 'rotate(-3deg)', fontFamily: "'Special Elite', monospace" }}>
                  {s}
                </button>
              ))}
            </div>
            <div className="prop-label">Icone intelligence</div>
            <div className="grid grid-cols-4 gap-1">
              {ICON_KINDS.map(([k, label]) => (
                <button key={k} onClick={() => addIcon(k, label)} title={label}
                  className="aspect-square rounded-lg border border-white/[0.07] hover:border-[var(--cva)]/50 hover:bg-[var(--cva)]/5 flex items-center justify-center transition-all">
                  <MiniIcon kind={k} color={ps.accent} />
                </button>
              ))}
            </div>
          </Section>

          {/* narrative beats */}
          <Section title={`Narrative beats (${beats.length})`}>
            <button onClick={addBeat}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-amber-700/50 text-amber-500 text-[10.5px] hover:bg-amber-950/30 transition-colors">
              <BookMarked className="w-3 h-3" /> Beat @ {currentTime.toFixed(1)}s
            </button>
            {beats.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {beats.map(b => (
                  <div key={b.id} className="flex items-center gap-1.5 group/b">
                    <button onClick={() => { setCurrentTime(b.time); setCamTouched(false); }}
                      className="text-[9px] font-mono text-amber-600 hover:text-amber-400 shrink-0 w-9">{b.time.toFixed(1)}s</button>
                    <input value={b.label}
                      onChange={e => setBeats(bs => bs.map(x => x.id === b.id ? { ...x, label: e.target.value } : x))}
                      className="flex-1 bg-transparent text-[10px] text-slate-400 outline-none border-b border-transparent focus:border-amber-700/50 min-w-0" />
                    <button onClick={() => setBeats(bs => bs.filter(x => x.id !== b.id))}
                      className="opacity-0 group-hover/b:opacity-100 text-red-800 hover:text-red-500 text-[10px]">✕</button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* layer stack */}
          <Section title={`Stack layer (${layers.length})`} last>
            {layers.length === 0 ? (
              <div className="text-[10px] text-slate-700 text-center py-3 border border-dashed border-white/[0.07] rounded-lg">vuoto</div>
            ) : (
              <Reorder.Group axis="y" values={layers} onReorder={setLayers} className="space-y-0.5">
                {[...layers].reverse().map(L => {
                  const Icon = LAYER_ICONS[L.type] ?? Layers;
                  const { alpha } = layerPhase(L, currentTime);
                  return (
                    <Reorder.Item key={L.id} value={L} whileDrag={{ scale: 1.03, zIndex: 99 }}
                      onClick={() => setSelectedId(L.id === selectedId ? null : L.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer border text-[10px] transition-all group ${selectedId === L.id ? 'bg-white/[0.07] border-white/20' : 'border-transparent hover:bg-white/[0.04]'}`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: L.color || L.fill || L.accent || '#777', opacity: alpha > 0 ? 1 : 0.25 }} />
                      <Icon className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                      <span className="flex-1 truncate text-slate-400">{L.name}</span>
                      <button onClick={e => { e.stopPropagation(); upd(L.id, { visible: !L.visible }); }}
                        className="opacity-0 group-hover:opacity-100">
                        {L.visible ? <Eye className="w-2.5 h-2.5 text-slate-500" /> : <EyeOff className="w-2.5 h-2.5 text-slate-700" />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); del(L.id); }}
                        className="opacity-0 group-hover:opacity-100 text-red-700 hover:text-red-400">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            )}
          </Section>
        </div>
      </div>

      {/* hidden audio element for narration */}
      {audio && <audio ref={audioElRef} src={audio.url} preload="auto" />}

      {/* ═══ EXPORT OVERLAY ═══ */}
      <AnimatePresence>
        {exporting && (
          <motion.div className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(2,3,6,0.96)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center w-80">
              <div className="text-[10px] tracking-[0.3em] text-slate-600 mb-2">CARTAVIVA RENDER ENGINE</div>
              <div className="text-5xl font-bold mb-5 font-mono" style={{ color: ps.accent }}>{exportPct}%</div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${exportPct}%`, background: `linear-gradient(90deg, ${ps.accent}, ${ps.accent2 ?? ps.accent})`, boxShadow: `0 0 16px ${ps.accent}` }} />
              </div>
              <div className="mt-4 text-[11px] text-slate-500">Registrazione in tempo reale — non chiudere il tab</div>
              {audio && <div className="mt-1 text-[10px] text-slate-600">♪ traccia narrazione inclusa</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MODALS ═══ */}
      <AnimatePresence>
        {labelPos && (
          <Modal onClose={() => setLabelPos(null)} title="Etichetta narrante" accent={ps.accent}>
            <ModalInput autoFocus placeholder="Nome luogo, evento…" value={draft.text ?? ''}
              onChange={v => setDraft(d => ({ ...d, text: v }))} onEnter={commitLabel} accent={ps.accent} />
            <ModalInput placeholder="Sottotesto: dati, dettagli (opz)" value={draft.subtext ?? ''}
              onChange={v => setDraft(d => ({ ...d, subtext: v }))} accent={ps.accent} />
            <ModalActions onCancel={() => setLabelPos(null)} onOk={commitLabel} accent={ps.accent} dark={ps.dark} />
          </Modal>
        )}

        {modal?.kind === 'title' && (
          <Modal onClose={() => setModal(null)} title="Titolo cinematic" accent={ps.accent}>
            <ModalInput autoFocus placeholder="Titolo principale…" value={draft.text ?? ''}
              onChange={v => setDraft(d => ({ ...d, text: v }))} onEnter={commitModal} accent={ps.accent} />
            <ModalInput placeholder="Sottotitolo / fonte / data (opz)" value={draft.subtext ?? ''}
              onChange={v => setDraft(d => ({ ...d, subtext: v }))} accent={ps.accent} />
            <div className="flex gap-1.5">
              {['top','center','bottom'].map(pos => (
                <button key={pos} onClick={() => setDraft(d => ({ ...d, position: pos }))}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] capitalize ${(draft.position ?? 'bottom') === pos ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/10 text-slate-500'}`}>
                  {pos}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {[['cinematic','Cinematic'],['breaking','Breaking News']].map(([v, l]) => (
                <button key={v} onClick={() => setDraft(d => ({ ...d, variant: v }))}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] ${(draft.variant ?? 'cinematic') === v ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/10 text-slate-500'}`}>
                  {l}
                </button>
              ))}
            </div>
            <ModalActions onCancel={() => setModal(null)} onOk={commitModal} accent={ps.accent} dark={ps.dark} />
          </Modal>
        )}

        {modal?.kind === 'stat' && (
          <Modal onClose={() => setModal(null)} title="Statistica pop-up" accent={ps.accent}>
            <ModalInput autoFocus placeholder="Etichetta (es. TRUPPE DISPIEGATE)" value={draft.label ?? ''}
              onChange={v => setDraft(d => ({ ...d, label: v }))} accent={ps.accent} />
            <ModalInput placeholder="Valore (es. 120000 o 47 mld $)" value={draft.value ?? ''}
              onChange={v => setDraft(d => ({ ...d, value: v }))} onEnter={commitModal} accent={ps.accent} />
            <div className="flex gap-1.5">
              {[['tl','↖'],['tr','↗'],['bl','↙'],['br','↘']].map(([c, sym]) => (
                <button key={c} onClick={() => setDraft(d => ({ ...d, corner: c }))}
                  className={`flex-1 py-1.5 rounded-lg border text-sm ${(draft.corner ?? 'tr') === c ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/10 text-slate-500'}`}>
                  {sym}
                </button>
              ))}
            </div>
            <ModalActions onCancel={() => setModal(null)} onOk={commitModal} accent={ps.accent} dark={ps.dark} />
          </Modal>
        )}

        {modal?.kind === 'pie' && (
          <Modal onClose={() => setModal(null)} title="Grafico a torta vintage" accent={ps.accent}>
            <ModalInput autoFocus placeholder="Etichetta (es. Riserve di gas)" value={draft.label ?? ''}
              onChange={v => setDraft(d => ({ ...d, label: v }))} accent={ps.accent} />
            <div>
              <div className="text-[10px] text-slate-500 mb-1">Valore: {draft.value ?? 50}%</div>
              <input type="range" min={1} max={100} value={draft.value ?? 50}
                onChange={e => setDraft(d => ({ ...d, value: Number(e.target.value) }))} className="w-full" />
            </div>
            <ModalActions onCancel={() => setModal(null)} onOk={commitModal} accent={ps.accent} dark={ps.dark} />
          </Modal>
        )}

        {modal?.kind === 'export' && (
          <Modal onClose={() => setModal(null)} title="Esporta animazione" accent={ps.accent} wide>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl border border-white/10 p-3 space-y-1">
                <div className="text-slate-500 text-[9px] tracking-widest">FORMATO</div>
                <div className="text-slate-200 font-semibold">{R.label} — {R.W}×{R.H}</div>
                <div className="text-slate-600 text-[10px]">{ratio === 'portrait' ? 'TikTok / Reels / Shorts' : 'YouTube / X'}</div>
              </div>
              <div className="rounded-xl border border-white/10 p-3 space-y-1">
                <div className="text-slate-500 text-[9px] tracking-widest">DURATA</div>
                <div className="text-slate-200 font-semibold">{duration}s @ 30fps</div>
                <div className="text-slate-600 text-[10px]">{audio ? '♪ con narrazione' : 'senza audio'}</div>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              <button onClick={() => startExport('webm')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold text-black transition-transform active:scale-98"
                style={{ background: `linear-gradient(135deg, ${ps.accent}, ${ps.accent2 ?? ps.accent})` }}>
                <Video className="w-4 h-4" /> VIDEO WEBM (VP9 · 12 Mbps)
              </button>
              <button onClick={() => mp4Mime && startExport('mp4')} disabled={!mp4Mime}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold border border-white/15 text-slate-200 hover:bg-white/5 disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
                <Video className="w-4 h-4" /> VIDEO MP4 {mp4Mime ? '(nativo)' : '(non supportato dal browser)'}
              </button>
              <button onClick={() => { setModal(null); exportPNG(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] border border-white/10 text-slate-400 hover:bg-white/5 transition-colors">
                <ImageIcon className="w-3.5 h-3.5" /> Frame corrente PNG
              </button>
            </div>
            {!mp4Mime && <div className="text-[9px] text-slate-600 text-center">Per MP4 esporta WebM e converti con CloudConvert / HandBrake</div>}
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════ UI SUBCOMPONENTS ═════════════════════ */
function Section({ title, children, last }) {
  return (
    <div className={`p-3 ${last ? '' : 'border-b border-white/[0.05]'}`}>
      <div className="text-[8.5px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">{title}</div>
      {children}
    </div>
  );
}

function ToolBtn({ active, onClick, Icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-[7px] rounded-lg text-[10px] border transition-all ${active ? 'border-[var(--cva)] bg-[var(--cva)]/12 text-[var(--cva)] shadow-[0_0_12px_-4px_var(--cva)]' : 'border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/15'}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function PropInput({ label, value, onChange }) {
  return (
    <div>
      <div className="prop-label">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10.5px] text-slate-200 outline-none focus:border-[var(--cva)]/60" />
    </div>
  );
}

function PropNum({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <div className="prop-label">{label}</div>
      <input type="number" min={min} max={max} step={step} value={Number(value).toFixed(1)}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10.5px] text-slate-200 outline-none focus:border-[var(--cva)]/60" />
    </div>
  );
}

function PropSlider({ label, value, min, max, step, display, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="prop-label !mb-0">{label}</span>
        <span className="text-[9px] font-mono text-slate-400">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function PropToggle({ label, active, onClick, half }) {
  return (
    <button onClick={onClick}
      className={`${half ? 'flex-1' : 'w-full'} py-1.5 rounded-lg border text-[10px] transition-all ${active ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-white/[0.07] text-slate-600 hover:text-slate-400'}`}>
      {label}
    </button>
  );
}

function MiniIcon({ kind, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 36, 36);
    x.save();
    x.translate(18, 18);
    x.globalAlpha = 1;
    drawIconShape(x, kind, 26, color, 1.2);
    x.restore();
  }, [kind, color]);
  return <canvas ref={ref} width={36} height={36} className="w-7 h-7" />;
}

function Modal({ title, children, onClose, accent, wide }) {
  return (
    <motion.div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className={`${wide ? 'w-[420px]' : 'w-[340px]'} rounded-2xl p-5 space-y-3 border border-white/10 shadow-2xl`}
        style={{ background: 'linear-gradient(180deg, #141821, #0c0f16)' }}
        initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold text-slate-100">{title}</div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalInput({ value, onChange, placeholder, autoFocus, onEnter, accent }) {
  return (
    <input autoFocus={autoFocus} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onEnter?.()}
      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-slate-200 outline-none transition-colors"
      style={{ caretColor: accent }}
      onFocus={e => e.target.style.borderColor = accent + '99'}
      onBlur={e => e.target.style.borderColor = ''} />
  );
}

function ModalActions({ onCancel, onOk, accent, dark }) {
  return (
    <div className="flex gap-2 pt-1">
      <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-white/10 text-[12px] text-slate-400 hover:bg-white/5">Annulla</button>
      <button onClick={onOk} className="flex-1 py-2 rounded-xl text-[12px] font-bold"
        style={{ background: accent, color: dark ? '#000' : '#fff' }}>Aggiungi</button>
    </div>
  );
}

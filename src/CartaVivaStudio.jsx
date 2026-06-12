/**
 * CartaViva Studio v2 — Vintage Geopolitical Animation Engine
 * Canvas 2D rendering • Video export • Camera zoom • Draw-on layers
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Play, Pause, Download, Plus, Trash2, Eye, EyeOff,
  ArrowRight, Type, MapPin, Square, SkipBack,
  Image as ImageIcon, Video, Move, Zap, Activity,
  BarChart2, Camera as CameraIcon, Layers, Clock,
  Crosshair, AlignCenter,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const MAP_W = 1000;
const MAP_H = 500;
const DISP_W = 640;   // CSS display px
const DISP_H = 360;
const EXP_W  = 1280;  // export / canvas buffer
const EXP_H  = 720;

/* ══════════════════════════════════════════════════════════
   MATH
══════════════════════════════════════════════════════════ */
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease  = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

function getCameraAt(kfs, t) {
  if (!kfs.length) return { x: 0, y: 0, w: MAP_W, h: MAP_H };
  if (t <= kfs[0].time) return kfs[0];
  if (t >= kfs[kfs.length-1].time) return kfs[kfs.length-1];
  const ni = kfs.findIndex(k => k.time > t);
  const a = kfs[ni-1], b = kfs[ni];
  const e = ease((t - a.time) / (b.time - a.time));
  return { x: lerp(a.x,b.x,e), y: lerp(a.y,b.y,e), w: lerp(a.w,b.w,e), h: lerp(a.h,b.h,e) };
}

function getOpacity(layer, t) {
  const { startTime: s, endTime: e, fadeIn = 0.3, fadeOut = 0.3 } = layer;
  if (t < s || t > e) return 0;
  if (t < s + fadeIn)  return (t - s) / fadeIn;
  if (t > e - fadeOut) return (e - t) / fadeOut;
  return 1;
}

function getProgress(layer, t) {
  const dur = layer.drawDur ?? 1.5;
  return clamp((t - layer.startTime) / dur, 0, 1);
}

/* ══════════════════════════════════════════════════════════
   GEO
══════════════════════════════════════════════════════════ */
function proj(lng, lat) {
  return { x: (lng + 180) / 360 * MAP_W, y: (90 - lat) / 180 * MAP_H };
}

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
      const { x: xi, y: yi } = proj(outer[i][0], outer[i][1]);
      const { x: xj, y: yj } = proj(outer[j][0], outer[j][1]);
      if ((yi > my) !== (yj > my) && mx < ((xj-xi)*(my-yi))/(yj-yi)+xi) inside = !inside;
    }
    return inside;
  });
}

/* ══════════════════════════════════════════════════════════
   COUNTRY NAMES
══════════════════════════════════════════════════════════ */
const CN = {
  4:'Afghanistan',12:'Algeria',24:'Angola',32:'Argentina',36:'Australia',40:'Austria',
  50:'Bangladesh',56:'Belgium',76:'Brazil',100:'Bulgaria',104:'Myanmar',
  124:'Canada',144:'Sri Lanka',152:'Chile',156:'China',170:'Colombia',180:'DR Congo',
  191:'Croatia',192:'Cuba',203:'Czechia',208:'Denmark',818:'Egypt',231:'Ethiopia',
  246:'Finland',250:'France',276:'Germany',288:'Ghana',300:'Greece',
  348:'Hungary',356:'India',360:'Indonesia',364:'Iran',368:'Iraq',372:'Ireland',
  376:'Israel',380:'Italy',392:'Japan',400:'Jordan',398:'Kazakhstan',404:'Kenya',
  408:'N. Korea',410:'S. Korea',414:'Kuwait',422:'Lebanon',428:'Latvia',434:'Libya',
  440:'Lithuania',458:'Malaysia',484:'Mexico',504:'Morocco',528:'Netherlands',
  554:'New Zealand',566:'Nigeria',578:'Norway',512:'Oman',586:'Pakistan',
  604:'Peru',608:'Philippines',616:'Poland',620:'Portugal',634:'Qatar',
  642:'Romania',643:'Russia',682:'Saudi Arabia',710:'S. Africa',706:'Somalia',
  724:'Spain',729:'Sudan',752:'Sweden',756:'Switzerland',760:'Syria',
  764:'Thailand',788:'Tunisia',792:'Turkey',804:'Ukraine',784:'UAE',826:'UK',
  840:'USA',860:'Uzbekistan',704:'Vietnam',887:'Yemen',716:'Zimbabwe',
  275:'Palestine',32:'Argentina',68:'Bolivia',
};

/* ══════════════════════════════════════════════════════════
   MAP PRESETS
══════════════════════════════════════════════════════════ */
const PRESETS = {
  carta: {
    label: 'Carta Antica', dark: false,
    ocean: '#8fafc2', land: '#d4bc82', border: '#6b4c2a',
    graticule: '#9a7a50', accent: '#c0392b',
    titleBg: 'rgba(248,242,228,0.94)', titleFg: '#1a0d00',
    grain: true,
  },
  intel: {
    label: 'Intelligence', dark: true,
    ocean: '#050e1c', land: '#0d1a28', border: '#1a4a7a',
    graticule: '#0d2540', accent: '#00cfff',
    titleBg: 'rgba(4,12,22,0.95)', titleFg: '#c8e8ff',
    grain: false,
  },
  vox: {
    label: 'Breaking News', dark: false,
    ocean: '#c8dded', land: '#e8e0ce', border: '#aaa',
    graticule: '#ccc', accent: '#e63030',
    titleBg: 'rgba(255,255,255,0.96)', titleFg: '#111',
    grain: true,
  },
  tactical: {
    label: 'Tattico', dark: true,
    ocean: '#040a04', land: '#0e1a0a', border: '#2a4e18',
    graticule: '#1a3010', accent: '#39ff14',
    titleBg: 'rgba(4,10,4,0.95)', titleFg: '#39ff14',
    grain: false,
  },
};

const PRESET_REGIONS = {
  world:    { x: 0, y: 0, w: MAP_W, h: MAP_H },
  europe:   { x: 250, y: 60, w: 300, h: 180 },
  easteurope: { x: 300, y: 55, w: 280, h: 170 },
  mideast:  { x: 380, y: 140, w: 250, h: 160 },
  eastasia: { x: 580, y: 70, w: 280, h: 200 },
  africa:   { x: 290, y: 150, w: 260, h: 220 },
  americas: { x: 60, y: 20, w: 280, h: 380 },
};

/* ══════════════════════════════════════════════════════════
   RENDERING ENGINE
══════════════════════════════════════════════════════════ */

function drawArrowLayer(ctx, layer, cam, W, H, t) {
  const op = getOpacity(layer, t);
  if (op <= 0 || !layer.pts || layer.pts.length < 2) return;
  const prog = getProgress(layer, t);
  if (prog <= 0) return;

  // Convert map pts to canvas coords
  const toC = (pt) => ({
    x: (pt.x - cam.x) / cam.w * W,
    y: (pt.y - cam.y) / cam.h * H,
  });

  const [A, B] = layer.pts.map(toC);

  // Bezier control point (perpendicular offset)
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  const cp = {
    x: (A.x + B.x) / 2 - dy * 0.28,
    y: (A.y + B.y) / 2 + dx * 0.28,
  };

  // Sample bezier
  const N = 100;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const s = i / N, u = 1 - s;
    return { x: u*u*A.x + 2*u*s*cp.x + s*s*B.x, y: u*u*A.y + 2*u*s*cp.y + s*s*B.y };
  });

  // Arc lengths
  const arcLen = [0];
  for (let i = 1; i <= N; i++)
    arcLen.push(arcLen[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y));
  const total = arcLen[N];
  const target = total * prog;

  // Find endpoint
  let endI = N;
  for (let i = 0; i <= N; i++) { if (arcLen[i] >= target) { endI = i; break; } }
  const overshoot = arcLen[endI] - target;
  const segLen = arcLen[endI] - arcLen[Math.max(0, endI-1)];
  const frac = segLen > 0 ? 1 - overshoot / segLen : 1;
  const endPt = {
    x: pts[Math.max(0,endI-1)].x + (pts[endI].x - pts[Math.max(0,endI-1)].x) * frac,
    y: pts[Math.max(0,endI-1)].y + (pts[endI].y - pts[Math.max(0,endI-1)].y) * frac,
  };

  const lw = (layer.width ?? 3) * (W / 640);
  ctx.save();
  ctx.globalAlpha = op;
  if (layer.glow) { ctx.shadowColor = layer.color; ctx.shadowBlur = 14; }
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (layer.dashed) ctx.setLineDash([lw * 3, lw * 2]);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < endI; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(endPt.x, endPt.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Arrowhead
  if (prog > 0.45) {
    const prevPt = pts[Math.max(0, endI - 5)];
    const angle = Math.atan2(endPt.y - prevPt.y, endPt.x - prevPt.x);
    const sz = lw * 3.8;
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.translate(endPt.x, endPt.y);
    ctx.rotate(angle);
    ctx.moveTo(sz * 0.5, 0);
    ctx.lineTo(-sz * 0.5, -sz * 0.42);
    ctx.lineTo(-sz * 0.5,  sz * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawLabelLayer(ctx, layer, cam, W, H, t) {
  const op = getOpacity(layer, t);
  if (op <= 0) return;
  const prog = getProgress(layer, t);

  const cx = (layer.mapX - cam.x) / cam.w * W;
  const cy = (layer.mapY - cam.y) / cam.h * H;

  const scale   = W / 640;
  const fs      = (layer.fontSize ?? 14) * scale;
  const fsSmall = (layer.fontSize ?? 14) * 0.75 * scale;
  const charProg = Math.ceil(layer.text.length * Math.max(prog, 0.01));
  const displayText = layer.text.slice(0, charProg);

  ctx.save();
  ctx.globalAlpha = op;

  // Dot
  ctx.fillStyle = layer.color;
  ctx.beginPath();
  ctx.arc(cx, cy, 4 * scale, 0, Math.PI * 2);
  ctx.fill();

  if (prog > 0.15) {
    // Leader line
    const ty = cy - 22 * scale;
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.moveTo(cx, cy - 4 * scale); ctx.lineTo(cx, ty); ctx.stroke();

    // Box
    ctx.font = `700 ${fs}px 'Playfair Display', Georgia, serif`;
    const tw = ctx.measureText(displayText).width;
    const pad = 8 * scale;
    const bw = tw + pad * 2;
    const bh = fs + pad * 1.6 + (layer.subtext ? fsSmall + 4 * scale : 0);
    const bx = cx - bw / 2;
    const by = ty - bh;

    ctx.fillStyle = layer.boxBg || (layer.dark ? 'rgba(5,14,26,0.9)' : 'rgba(248,242,228,0.92)');
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4 * scale);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = layer.color;
    ctx.fillText(displayText, bx + pad, by + fs + pad * 0.5);

    if (layer.subtext && prog > 0.5) {
      ctx.font = `500 ${fsSmall}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = op * 0.7;
      ctx.fillText(layer.subtext, bx + pad, by + fs + fsSmall + pad * 0.5 + 2 * scale);
      ctx.globalAlpha = op;
    }
  }
  ctx.restore();
}

function drawTitleLayer(ctx, layer, W, H, t) {
  const op = getOpacity(layer, t);
  if (op <= 0) return;
  const prog = getProgress(layer, t);
  const scale = W / 640;

  const posY = layer.position === 'top'    ? 0
             : layer.position === 'center' ? H * 0.38
             : H - 90 * scale;

  const slideY = (1 - Math.min(prog / 0.4, 1)) * 20 * scale;

  ctx.save();
  ctx.globalAlpha = op;

  const bh = layer.subtext ? 90 * scale : 62 * scale;
  ctx.fillStyle = layer.bg;
  ctx.fillRect(0, posY + slideY, W, bh);

  // Accent bar
  ctx.fillStyle = layer.accent;
  ctx.fillRect(0, posY + slideY, 6 * scale, bh);

  // Title
  const titleFs = 22 * scale;
  ctx.font = `700 ${titleFs}px 'Playfair Display', Georgia, serif`;
  ctx.fillStyle = layer.fg;
  ctx.fillText(layer.text, 18 * scale, posY + slideY + titleFs + 12 * scale);

  if (layer.subtext) {
    const subFs = 13 * scale;
    ctx.font = `500 ${subFs}px 'Space Grotesk', system-ui, sans-serif`;
    ctx.globalAlpha = op * 0.65;
    ctx.fillStyle = layer.fg;
    ctx.fillText(layer.subtext, 18 * scale, posY + slideY + titleFs + subFs + 20 * scale);
  }
  ctx.restore();
}

function drawStatLayer(ctx, layer, W, H, t) {
  const op = getOpacity(layer, t);
  if (op <= 0) return;
  const prog = getProgress(layer, t);
  const scale = W / 640;

  const pad = 14 * scale;
  const valFs = 28 * scale;
  const lblFs = 11 * scale;
  const bw = 160 * scale;
  const bh = 68 * scale;

  const corners = { tl: [pad, pad], tr: [W-bw-pad, pad], bl: [pad, H-bh-pad], br: [W-bw-pad, H-bh-pad] };
  const [bx, by] = corners[layer.corner ?? 'tr'];

  ctx.save();
  ctx.globalAlpha = op;

  ctx.fillStyle = layer.bg || 'rgba(10,16,30,0.9)';
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6 * scale);
  ctx.fill(); ctx.stroke();

  // Accent top bar
  ctx.fillStyle = layer.color;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 3 * scale, [6 * scale, 6 * scale, 0, 0]);
  ctx.fill();

  // Label
  ctx.font = `600 ${lblFs}px 'Space Grotesk', system-ui, sans-serif`;
  ctx.fillStyle = layer.color;
  ctx.globalAlpha = op * 0.7;
  ctx.fillText((layer.label ?? 'DATA').toUpperCase(), bx + 10 * scale, by + 18 * scale);

  // Value (count-up animation)
  const numMatch = String(layer.value).replace(/[^\d]/g, '');
  let displayVal = layer.value;
  if (numMatch && prog < 1) {
    const num = parseInt(numMatch, 10);
    const animated = Math.floor(num * ease(prog));
    displayVal = String(layer.value).replace(numMatch, animated.toLocaleString());
  }
  ctx.font = `700 ${valFs}px 'Space Grotesk', monospace`;
  ctx.fillStyle = layer.fg || '#ffffff';
  ctx.globalAlpha = op;
  ctx.fillText(displayVal, bx + 10 * scale, by + bh - 10 * scale);

  ctx.restore();
}

function drawDateLayer(ctx, layer, W, H, t) {
  const op = getOpacity(layer, t);
  if (op <= 0) return;
  const scale = W / 640;
  ctx.save();
  ctx.globalAlpha = op;
  const fs = 16 * scale;
  ctx.font = `600 ${fs}px 'Space Grotesk', monospace`;
  ctx.fillStyle = layer.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3 * scale;
  const x = 18 * scale;
  const y = 24 * scale;
  ctx.strokeText(layer.text, x, y);
  ctx.fillText(layer.text, x, y);
  ctx.restore();
}

function renderFrame(ctx, W, H, t, cam, layers, preset, countryPaths, grainRef) {
  const s = PRESETS[preset];

  // ── OCEAN ──
  ctx.fillStyle = s.ocean;
  ctx.fillRect(0, 0, W, H);

  // ── MAP TRANSFORM ──
  ctx.save();
  ctx.scale(W / cam.w, H / cam.h);
  ctx.translate(-cam.x, -cam.y);

  // Graticule
  ctx.strokeStyle = s.graticule;
  ctx.lineWidth = 0.4;
  ctx.globalAlpha = 0.4;
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = (lng + 180) / 360 * MAP_W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let lat = -75; lat <= 90; lat += 15) {
    const y = (90 - lat) / 180 * MAP_H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Land
  ctx.fillStyle = s.land;
  for (const { path } of countryPaths) ctx.fill(path, 'evenodd');

  // Borders
  ctx.strokeStyle = s.border;
  ctx.lineWidth = 0.5;
  for (const { path } of countryPaths) ctx.stroke(path);

  // Territory layers
  for (const layer of layers) {
    if (layer.type !== 'territory' || !layer.visible) continue;
    const feat = countryPaths.find(p => p.id === layer.countryId);
    if (!feat) continue;
    const op = getOpacity(layer, t);
    if (op <= 0) continue;
    if (layer.glow) { ctx.shadowColor = layer.fill; ctx.shadowBlur = 18; }
    ctx.globalAlpha = (layer.fillOpacity ?? 0.45) * op;
    ctx.fillStyle = layer.fill;
    ctx.fill(feat.path, 'evenodd');
    ctx.shadowBlur = 0;
    if ((layer.strokeWidth ?? 0) > 0) {
      ctx.globalAlpha = op;
      ctx.strokeStyle = layer.stroke ?? layer.fill;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke(feat.path);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // ── back to canvas space ──

  // Arrow layers
  for (const layer of layers) {
    if (layer.type === 'arrow' && layer.visible) drawArrowLayer(ctx, layer, cam, W, H, t);
  }

  // Label layers
  for (const layer of layers) {
    if (layer.type === 'label' && layer.visible) drawLabelLayer(ctx, layer, cam, W, H, t);
  }

  // Date stamp
  for (const layer of layers) {
    if (layer.type === 'date' && layer.visible) drawDateLayer(ctx, layer, W, H, t);
  }

  // Stat boxes
  for (const layer of layers) {
    if (layer.type === 'stat' && layer.visible) drawStatLayer(ctx, layer, W, H, t);
  }

  // Title cards (last — on top)
  for (const layer of layers) {
    if (layer.type === 'title' && layer.visible) drawTitleLayer(ctx, layer, W, H, t);
  }

  // Vignette
  const vig = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H) * 0.68);
  vig.addColorStop(0.35, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Grain
  if (s.grain && grainRef?.current) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.22;
    ctx.drawImage(grainRef.current, 0, 0, W, H);
    ctx.restore();
  }

  // Intel scan-lines
  if (preset === 'intel') {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#1a6aaa';
    for (let y = 0; y < H; y += 3) { ctx.fillRect(0, y, W, 1); }
    ctx.restore();
  }

  // Tactical crosshair
  if (preset === 'tactical') {
    const cx = W/2, cy = H/2;
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1;
    for (const r of [W * 0.12, W * 0.22]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - W*0.28, cy); ctx.lineTo(cx + W*0.28, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - H*0.4); ctx.lineTo(cx, cy + H*0.4); ctx.stroke();
    ctx.restore();
  }
}

/* ══════════════════════════════════════════════════════════
   ID & DEFAULTS
══════════════════════════════════════════════════════════ */
let _id = 1;
const nid = () => `L${_id++}`;

function defaultLayer(type, extra, duration) {
  return { id: nid(), type, name: type, visible: true, startTime: 0, endTime: duration, ...extra };
}

const TOOL_META = [
  { id: 'select',    Icon: Move,       label: 'Seleziona' },
  { id: 'territory', Icon: Square,     label: 'Territorio' },
  { id: 'arrow',     Icon: ArrowRight, label: 'Freccia' },
  { id: 'label',     Icon: MapPin,     label: 'Etichetta' },
  { id: 'title',     Icon: Type,       label: 'Titolo' },
  { id: 'stat',      Icon: BarChart2,  label: 'Statistica' },
  { id: 'date',      Icon: Clock,      label: 'Data' },
];

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function CartaVivaStudio() {
  // Refs
  const canvasRef  = useRef(null);
  const grainRef   = useRef(null);
  const tlRef      = useRef(null);
  const animRef    = useRef(null);
  const panRef     = useRef(null);
  const arrowRef   = useRef(null); // first arrow point

  // Geo data
  const geoFeatures  = useMemo(() => feature(countriesTopo, countriesTopo.objects.countries).features, []);
  const countryPaths = useMemo(() => geoFeatures.map(f => ({ id: f.id, feat: f, path: buildPath2D(f.geometry) })), [geoFeatures]);

  // Core state
  const [layers,      setLayers]      = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [tool,        setTool]        = useState('select');
  const [preset,      setPreset]      = useState('carta');
  const [camera,      setCamera]      = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const [cameraKFs,   setCameraKFs]   = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(12);
  const [playing,     setPlaying]     = useState(false);
  const [hoverCntry,  setHoverCntry]  = useState(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportPct,   setExportPct]   = useState(0);

  // Modals
  const [titleModal,  setTitleModal]  = useState(null); // null | 'new' | layerId
  const [statModal,   setStatModal]   = useState(null);
  const [labelPos,    setLabelPos]    = useState(null); // {mapX,mapY}

  // Draft state for modals
  const [draft, setDraft] = useState({});

  const style = PRESETS[preset];
  const selectedLayer = layers.find(l => l.id === selectedId) ?? null;

  // Effective camera (animated during playback if KFs exist)
  const effCam = useMemo(() => {
    if (!cameraKFs.length) return camera;
    return getCameraAt(cameraKFs, currentTime);
  }, [camera, cameraKFs, currentTime]);

  /* ── BUILD GRAIN TEXTURE ──────────────────────────────── */
  useEffect(() => {
    const gc = document.createElement('canvas');
    gc.width = 512; gc.height = 512;
    const gctx = gc.getContext('2d');
    const id = gctx.createImageData(512, 512);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      id.data[i] = id.data[i+1] = id.data[i+2] = v;
      id.data[i+3] = 30;
    }
    gctx.putImageData(id, 0, 0);
    grainRef.current = gc;
  }, []);

  /* ── RENDER LOOP ─────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderFrame(ctx, EXP_W, EXP_H, currentTime, effCam, layers, preset, countryPaths, grainRef);
  }, [currentTime, effCam, layers, preset, countryPaths]);

  /* ── PLAY LOOP ──────────────────────────────────────── */
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(animRef.current); return; }
    let startWall = null;
    const startT  = currentTime >= duration ? 0 : currentTime;

    const tick = (now) => {
      if (!startWall) startWall = now;
      const t = startT + (now - startWall) / 1000;
      if (t >= duration) { setCurrentTime(duration); setPlaying(false); return; }
      setCurrentTime(t);

      // Update camera from KFs
      if (cameraKFs.length) setCamera(getCameraAt(cameraKFs, t));

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, duration]);

  /* ── CANVAS COORDINATE HELPERS ─────────────────────── */
  const getCssPoint = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { cssX: 0, cssY: 0 };
    return { cssX: e.clientX - rect.left, cssY: e.clientY - rect.top };
  }, []);

  const cssToMap = useCallback((cssX, cssY, cam = effCam) => ({
    mapX: cam.x + (cssX / DISP_W) * cam.w,
    mapY: cam.y + (cssY / DISP_H) * cam.h,
  }), [effCam]);

  /* ── HOVER ────────────────────────────────────────── */
  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      const { cssX, cssY } = getCssPoint(e);
      const { startX, startY, startCam } = panRef.current;
      const dx = (startX - cssX) / DISP_W * startCam.w;
      const dy = (startY - cssY) / DISP_H * startCam.h;
      setCamera({
        ...startCam,
        x: clamp(startCam.x + dx, 0, MAP_W - startCam.w),
        y: clamp(startCam.y + dy, 0, MAP_H - startCam.h),
      });
      return;
    }
    if (tool === 'territory') {
      const { cssX, cssY } = getCssPoint(e);
      const { mapX, mapY } = cssToMap(cssX, cssY);
      const hit = geoFeatures.find(f => pointInFeature(mapX, mapY, f));
      setHoverCntry(hit?.id ?? null);
    } else {
      setHoverCntry(null);
    }
  }, [tool, getCssPoint, cssToMap, geoFeatures]);

  /* ── WHEEL ZOOM ───────────────────────────────────── */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.78 : 1.28;
    const { cssX, cssY } = getCssPoint(e);
    const { mapX, mapY } = cssToMap(cssX, cssY, camera);
    const newW = clamp(camera.w * factor, 50, MAP_W);
    const newH = clamp(camera.h * factor, 25, MAP_H);
    setCamera({
      x: clamp(mapX - (cssX / DISP_W) * newW, 0, MAP_W - newW),
      y: clamp(mapY - (cssY / DISP_H) * newH, 0, MAP_H - newH),
      w: newW, h: newH,
    });
  }, [camera, getCssPoint, cssToMap]);

  /* ── MOUSE DOWN ───────────────────────────────────── */
  const handleMouseDown = useCallback((e) => {
    if (tool === 'select') {
      panRef.current = {
        startX: getCssPoint(e).cssX,
        startY: getCssPoint(e).cssY,
        startCam: { ...camera },
      };
    }
  }, [tool, camera, getCssPoint]);

  const handleMouseUp = useCallback(() => {
    panRef.current = null;
  }, []);

  /* ── MAP CLICK ────────────────────────────────────── */
  const handleCanvasClick = useCallback((e) => {
    if (panRef.current) return;
    const { cssX, cssY } = getCssPoint(e);
    const { mapX, mapY } = cssToMap(cssX, cssY);

    if (tool === 'territory') {
      const hit = geoFeatures.find(f => pointInFeature(mapX, mapY, f));
      if (!hit) return;
      const name = CN[parseInt(hit.id)] || `Country ${hit.id}`;
      const id = nid();
      setLayers(ls => [...ls, defaultLayer('territory', {
        name, countryId: hit.id,
        fill: style.accent, stroke: style.accent,
        fillOpacity: 0.42, strokeWidth: 1.5, glow: true,
      }, duration)]);
      setSelectedId(id);
      return;
    }

    if (tool === 'arrow') {
      if (!arrowRef.current) {
        arrowRef.current = { mapX, mapY };
      } else {
        const start = arrowRef.current;
        const id = nid();
        setLayers(ls => [...ls, defaultLayer('arrow', {
          name: 'Freccia',
          pts: [{ x: start.mapX, y: start.mapY }, { x: mapX, y: mapY }],
          color: style.accent, width: 3, glow: true,
          dashed: false,
        }, duration)]);
        setSelectedId(id);
        arrowRef.current = null;
        setTool('select');
      }
      return;
    }

    if (tool === 'label') {
      setLabelPos({ mapX, mapY });
      setDraft({ text: '', subtext: '' });
      return;
    }
  }, [tool, getCssPoint, cssToMap, geoFeatures, style, duration]);

  /* ── ADD CAMERA KF ────────────────────────────────── */
  const addCameraKF = () => {
    const kf = { time: currentTime, ...camera };
    setCameraKFs(kfs => {
      const filtered = kfs.filter(k => Math.abs(k.time - currentTime) > 0.1);
      return [...filtered, kf].sort((a, b) => a.time - b.time);
    });
  };

  /* ── LAYER OPS ────────────────────────────────────── */
  const upd = (id, patch) => setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const del = (id) => { setLayers(ls => ls.filter(l => l.id !== id)); if (selectedId === id) setSelectedId(null); };

  /* ── COMMIT LABEL ─────────────────────────────────── */
  const commitLabel = () => {
    if (!draft.text?.trim() || !labelPos) { setLabelPos(null); return; }
    const id = nid();
    setLayers(ls => [...ls, defaultLayer('label', {
      name: draft.text.slice(0, 20), text: draft.text, subtext: draft.subtext || '',
      mapX: labelPos.mapX, mapY: labelPos.mapY,
      color: style.accent, fontSize: 14,
    }, duration)]);
    setSelectedId(id);
    setLabelPos(null);
    setTool('select');
  };

  /* ── COMMIT TITLE ─────────────────────────────────── */
  const commitTitle = () => {
    if (!draft.text?.trim()) { setTitleModal(null); return; }
    if (titleModal === 'new') {
      const id = nid();
      setLayers(ls => [...ls, defaultLayer('title', {
        name: draft.text.slice(0, 24), text: draft.text, subtext: draft.subtext || '',
        position: draft.position || 'bottom',
        accent: style.accent, bg: style.titleBg, fg: style.titleFg,
      }, duration)]);
      setSelectedId(id);
    } else {
      upd(titleModal, { text: draft.text, subtext: draft.subtext, position: draft.position || 'bottom' });
    }
    setTitleModal(null);
  };

  /* ── COMMIT STAT ──────────────────────────────────── */
  const commitStat = () => {
    if (!draft.value?.trim()) { setStatModal(null); return; }
    const id = nid();
    setLayers(ls => [...ls, defaultLayer('stat', {
      name: draft.label || 'Dato',
      label: draft.label || 'DATO', value: draft.value,
      corner: draft.corner || 'tr',
      color: style.accent, fg: style.dark ? '#fff' : '#000',
      bg: style.dark ? 'rgba(4,12,22,0.9)' : 'rgba(248,242,228,0.9)',
    }, duration)]);
    setSelectedId(id);
    setStatModal(null);
  };

  /* ── TOOL CLICK ───────────────────────────────────── */
  const activateTool = (t) => {
    setTool(t);
    arrowRef.current = null;
    setLabelPos(null);
    if (t === 'title')  { setTitleModal('new'); setDraft({ text: '', subtext: '', position: 'bottom' }); return; }
    if (t === 'stat')   { setStatModal('new');  setDraft({ label: '', value: '', corner: 'tr' }); return; }
    if (t === 'date') {
      const id = nid();
      setLayers(ls => [...ls, defaultLayer('date', {
        name: 'Data', text: new Date().getFullYear().toString(),
        color: style.accent,
      }, duration)]);
      setSelectedId(id);
      setTool('select');
    }
  };

  /* ── TIMELINE CLICK ───────────────────────────────── */
  const handleTimelineClick = (e) => {
    const bar = tlRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration;
    setCurrentTime(t);
    setPlaying(false);
    if (cameraKFs.length) setCamera(getCameraAt(cameraKFs, t));
  };

  /* ── ZOOM TO REGION ───────────────────────────────── */
  const zoomToRegion = (key) => {
    const r = PRESET_REGIONS[key];
    if (r) { setCamera(r); setCameraKFs([]); }
  };

  /* ── EXPORT PNG ───────────────────────────────────── */
  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `CartaViva_${Date.now()}.png`;
      a.click();
    }, 'image/png');
  };

  /* ── EXPORT VIDEO ─────────────────────────────────── */
  const exportWebM = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsExporting(true);
    setExportPct(0);

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `CartaViva_${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false); setExportPct(0);
    };

    const FPS = 30;
    const totalFrames = Math.ceil(duration * FPS);
    rec.start();

    const renderNext = (frame) => {
      if (frame > totalFrames) { rec.stop(); return; }
      const t = frame / FPS;
      const cam = cameraKFs.length ? getCameraAt(cameraKFs, t) : camera;
      const ctx = canvas.getContext('2d');
      renderFrame(ctx, EXP_W, EXP_H, t, cam, layers, preset, countryPaths, grainRef);
      setExportPct(Math.round((frame / totalFrames) * 100));
      requestAnimationFrame(() => renderNext(frame + 1));
    };
    renderNext(0);
  };

  /* ── LAYER ICON ───────────────────────────────────── */
  const LIcon = ({ type }) => {
    const meta = TOOL_META.find(t => t.id === type);
    const I = meta?.Icon ?? Layers;
    return <I className="w-3 h-3 flex-shrink-0" />;
  };

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  return (
    <div className="flex flex-1 overflow-hidden min-h-0 bg-[#04060d]"
      style={{ '--cva': style.accent }}>

      {/* ══ LEFT: TOOLS + LAYERS ══════════════════════════════ */}
      <div className="w-56 border-r border-slate-800/70 bg-slate-950 flex flex-col shrink-0 overflow-hidden">

        {/* Tool palette */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2 px-1">Strumenti</div>
          <div className="grid grid-cols-2 gap-1">
            {TOOL_META.map(({ id, Icon, label }) => (
              <button key={id}
                onClick={() => activateTool(id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] border transition-all ${tool === id ? 'border-[var(--cva)] bg-[var(--cva)]/12 text-[var(--cva)]' : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'}`}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          {arrowRef.current && (
            <div className="mt-2 text-[10px] text-center text-amber-400 animate-pulse px-1">
              ✦ Clicca il punto di arrivo
            </div>
          )}
        </div>

        {/* Map style */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2 px-1">Stile mappa</div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(PRESETS).map(([k, v]) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`py-1.5 text-[11px] rounded-lg border transition-all truncate px-1 ${preset === k ? 'border-[var(--cva)] bg-[var(--cva)]/12 text-[var(--cva)]' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Region presets */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2 px-1">Regione</div>
          <div className="grid grid-cols-2 gap-1">
            {[['world','Mondo'],['europe','Europa'],['mideast','Medio Oriente'],['eastasia','Asia Est'],['africa','Africa'],['americas','Americhe']].map(([k, l]) => (
              <button key={k} onClick={() => zoomToRegion(k)}
                className="py-1.5 text-[10px] rounded-lg border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 truncate px-1">
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Layer list */}
        <div className="flex-1 overflow-auto">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Layer ({layers.length})</div>
            <span className="text-[9px] text-slate-700">drag ⇅</span>
          </div>
          {layers.length === 0 && (
            <div className="mx-3 my-2 text-center py-4 text-[11px] text-slate-600 border border-dashed border-slate-800 rounded-xl">
              Nessun layer
            </div>
          )}
          <Reorder.Group axis="y" values={layers} onReorder={setLayers} className="px-2 pb-3 space-y-0.5">
            {[...layers].reverse().map(l => {
              const active = selectedId === l.id;
              const op = getOpacity(l, currentTime);
              return (
                <Reorder.Item key={l.id} value={l} whileDrag={{ scale: 1.03, zIndex: 99 }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer border transition-all group text-[11px] ${active ? 'bg-slate-800 border-slate-600' : 'border-transparent hover:bg-slate-900/70'}`}
                  onClick={() => setSelectedId(active ? null : l.id)}>
                  <div className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: l.color || l.fill || l.accent || '#888', opacity: op > 0 ? 1 : 0.25 }} />
                  <LIcon type={l.type} />
                  <span className="flex-1 truncate text-slate-300">{l.name}</span>
                  <button className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                    onClick={e => { e.stopPropagation(); upd(l.id, { visible: !l.visible }); }}>
                    {l.visible ? <Eye className="w-3 h-3 text-slate-500" /> : <EyeOff className="w-3 h-3 text-slate-700" />}
                  </button>
                  <button className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-red-500"
                    onClick={e => { e.stopPropagation(); del(l.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>

        {/* Camera keyframes */}
        <div className="p-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Camera KF ({cameraKFs.length})</div>
            {cameraKFs.length > 0 && (
              <button onClick={() => setCameraKFs([])} className="text-[9px] text-red-500 hover:text-red-400">clear</button>
            )}
          </div>
          <button onClick={addCameraKF}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[var(--cva)]/40 text-[var(--cva)] text-[11px] hover:bg-[var(--cva)]/10 transition-colors">
            <CameraIcon className="w-3 h-3" /> Aggiungi KF @ {currentTime.toFixed(1)}s
          </button>
          {cameraKFs.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {cameraKFs.map((kf, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                  <span>@ {kf.time.toFixed(1)}s</span>
                  <span className="font-mono">{Math.round(kf.w)}px</span>
                  <button onClick={() => setCameraKFs(kfs => kfs.filter((_, j) => j !== i))}
                    className="text-red-600 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ CENTER: CANVAS + TIMELINE ══════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 min-w-0 overflow-hidden px-4">

        {/* Canvas */}
        <div className="relative shrink-0"
          style={{ width: DISP_W, height: DISP_H, borderRadius: 16, overflow: 'hidden',
            boxShadow: '0 40px 80px -20px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
          <canvas
            ref={canvasRef}
            width={EXP_W}
            height={EXP_H}
            style={{ width: DISP_W, height: DISP_H, display: 'block',
              cursor: tool === 'select' ? 'grab' : 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
            onWheel={handleWheel}
          />
          {/* Hover country overlay */}
          {hoverCntry && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-medium pointer-events-none"
              style={{ background: style.accent + 'dd', color: style.dark ? '#000' : '#fff' }}>
              {CN[parseInt(hoverCntry)] || hoverCntry} — clicca per evidenziare
            </div>
          )}
          {/* Arrow first-point indicator */}
          {arrowRef.current && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] border animate-pulse pointer-events-none"
              style={{ borderColor: style.accent, color: style.accent, background: 'rgba(0,0,0,0.7)' }}>
              Clicca il punto di arrivo
            </div>
          )}
        </div>

        {/* TIMELINE */}
        <div className="w-full max-w-[640px] shrink-0">
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { setCurrentTime(0); setPlaying(false); }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500"><SkipBack className="w-3.5 h-3.5" /></button>
            <button
              onClick={() => setPlaying(p => !p)}
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 transition-transform active:scale-95"
              style={{ background: style.accent }}>
              {playing
                ? <Pause className="w-3.5 h-3.5 text-black" />
                : <Play className="w-3.5 h-3.5 text-black ml-0.5" />}
            </button>
            <div className="text-[11px] font-mono text-slate-500 w-20">
              {currentTime.toFixed(1)}s / {duration}s
            </div>

            {/* Scrubber */}
            <div ref={tlRef} className="flex-1 h-2 bg-slate-800 rounded-full relative cursor-pointer select-none"
              onClick={handleTimelineClick}>
              {/* Layer spans */}
              {layers.map(l => (
                <div key={l.id} className="absolute h-full top-0 rounded-full opacity-50"
                  style={{
                    left: `${(l.startTime / duration) * 100}%`,
                    width: `${Math.max(2, ((l.endTime - l.startTime) / duration) * 100)}%`,
                    background: l.color || l.fill || l.accent || '#666',
                  }} />
              ))}
              {/* Camera KF markers */}
              {cameraKFs.map((kf, i) => (
                <div key={i} className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45"
                  style={{ left: `calc(${(kf.time / duration) * 100}% - 4px)`, background: '#fff' }} />
              ))}
              {/* Playhead */}
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 7px)`, background: style.accent }} />
            </div>

            <select value={duration} onChange={e => setDuration(Number(e.target.value))}
              className="text-[11px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-400 outline-none cursor-pointer">
              {[8, 10, 12, 15, 20, 30, 45, 60].map(d => <option key={d} value={d}>{d}s</option>)}
            </select>
          </div>

          {/* Layer tracks */}
          {layers.length > 0 && (
            <div className="space-y-px">
              {[...layers].reverse().map(l => (
                <div key={l.id} className="flex items-center gap-1.5 h-4">
                  <div className="w-20 truncate text-[9px] text-slate-600">{l.name}</div>
                  <div className="flex-1 h-1.5 bg-slate-900 rounded-full relative">
                    <div className="absolute h-full rounded-full opacity-75"
                      style={{
                        left: `${(l.startTime / duration) * 100}%`,
                        width: `${Math.max(1.5, ((l.endTime - l.startTime) / duration) * 100)}%`,
                        background: l.color || l.fill || l.accent || '#666',
                      }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-white/30 pointer-events-none"
                      style={{ left: `${(currentTime / duration) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ RIGHT: PROPERTIES + EXPORT ══════════════════════════ */}
      <div className="w-72 border-l border-slate-800/70 bg-slate-950 flex flex-col shrink-0 overflow-auto">

        {/* Layer properties */}
        <div className="p-4 border-b border-slate-800/60 flex-1">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-3">
            {selectedLayer ? `${selectedLayer.type.toUpperCase()} — ${selectedLayer.name}` : 'Seleziona un layer'}
          </div>

          {!selectedLayer && (
            <div className="text-[11px] text-slate-600 space-y-1.5">
              <div>① Scegli uno strumento</div>
              <div>② Clicca sulla mappa</div>
              <div>③ Regola le proprietà qui</div>
              <div className="pt-2 text-slate-700">Scroll = zoom • trascina = pan</div>
            </div>
          )}

          {selectedLayer && (
            <div className="space-y-3 text-[11px]">
              {/* Name */}
              <div>
                <label className="text-[9px] text-slate-600 block mb-1">NOME</label>
                <input value={selectedLayer.name}
                  onChange={e => upd(selectedId, { name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
              </div>

              {/* Timing */}
              <div className="grid grid-cols-2 gap-2">
                {[['startTime', 'Inizio (s)'], ['endTime', 'Fine (s)']].map(([k, label]) => (
                  <div key={k}>
                    <label className="text-[9px] text-slate-600 block mb-1">{label}</label>
                    <input type="number" min={0} max={duration} step={0.1}
                      value={selectedLayer[k].toFixed(1)}
                      onChange={e => upd(selectedId, { [k]: clamp(Number(e.target.value), 0, duration) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                ))}
              </div>

              {/* Territory */}
              {selectedLayer.type === 'territory' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Colore</label>
                    <input type="color" value={selectedLayer.fill}
                      onChange={e => upd(selectedId, { fill: e.target.value, stroke: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                  <CV_Slider label="Opacità" value={selectedLayer.fillOpacity} min={0.05} max={1} step={0.05}
                    display={Math.round(selectedLayer.fillOpacity * 100) + '%'}
                    onChange={v => upd(selectedId, { fillOpacity: v })} accent={style.accent} />
                  <CV_Slider label="Bordo" value={selectedLayer.strokeWidth} min={0} max={5} step={0.5}
                    display={selectedLayer.strokeWidth + 'px'}
                    onChange={v => upd(selectedId, { strokeWidth: v })} accent={style.accent} />
                  <div className="flex gap-1.5">
                    <button onClick={() => upd(selectedId, { glow: !selectedLayer.glow })}
                      className={`flex-1 py-1.5 rounded-lg border text-[10px] transition-all ${selectedLayer.glow ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                      ✦ Glow
                    </button>
                  </div>
                </>
              )}

              {/* Arrow */}
              {selectedLayer.type === 'arrow' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                  <CV_Slider label="Spessore" value={selectedLayer.width} min={1} max={8} step={0.5}
                    display={selectedLayer.width + 'px'}
                    onChange={v => upd(selectedId, { width: v })} accent={style.accent} />
                  <CV_Slider label="Durata disegno" value={selectedLayer.drawDur ?? 1.5} min={0.3} max={4} step={0.1}
                    display={(selectedLayer.drawDur ?? 1.5).toFixed(1) + 's'}
                    onChange={v => upd(selectedId, { drawDur: v })} accent={style.accent} />
                  <div className="flex gap-1.5">
                    {[['glow','✦ Glow'],['dashed','⚡ Tratteggio']].map(([k, label]) => (
                      <button key={k} onClick={() => upd(selectedId, { [k]: !selectedLayer[k] })}
                        className={`flex-1 py-1.5 rounded-lg border text-[10px] transition-all ${selectedLayer[k] ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Label */}
              {selectedLayer.type === 'label' && (
                <>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">TESTO</label>
                    <input value={selectedLayer.text}
                      onChange={e => upd(selectedId, { text: e.target.value, name: e.target.value.slice(0,20) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">SOTTOTITOLO</label>
                    <input value={selectedLayer.subtext || ''}
                      onChange={e => upd(selectedId, { subtext: e.target.value })}
                      placeholder="opzionale"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                  <CV_Slider label="Dimensione" value={selectedLayer.fontSize} min={8} max={28} step={1}
                    display={selectedLayer.fontSize + 'px'}
                    onChange={v => upd(selectedId, { fontSize: v })} accent={style.accent} />
                </>
              )}

              {/* Title */}
              {selectedLayer.type === 'title' && (
                <>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">TITOLO</label>
                    <input value={selectedLayer.text}
                      onChange={e => upd(selectedId, { text: e.target.value, name: e.target.value.slice(0,24) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">SOTTOTITOLO</label>
                    <input value={selectedLayer.subtext || ''}
                      onChange={e => upd(selectedId, { subtext: e.target.value })}
                      placeholder="opzionale"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div className="flex gap-1">
                    {['top','center','bottom'].map(pos => (
                      <button key={pos} onClick={() => upd(selectedId, { position: pos })}
                        className={`flex-1 py-1.5 rounded-lg border text-[10px] capitalize transition-all ${selectedLayer.position === pos ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                        {pos}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Accento</label>
                    <input type="color" value={selectedLayer.accent}
                      onChange={e => upd(selectedId, { accent: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                </>
              )}

              {/* Stat */}
              {selectedLayer.type === 'stat' && (
                <>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">ETICHETTA</label>
                    <input value={selectedLayer.label || ''}
                      onChange={e => upd(selectedId, { label: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">VALORE</label>
                    <input value={selectedLayer.value || ''}
                      onChange={e => upd(selectedId, { value: e.target.value })}
                      placeholder="47,000"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div className="flex gap-1">
                    {[['tl','↖'],['tr','↗'],['bl','↙'],['br','↘']].map(([c, sym]) => (
                      <button key={c} onClick={() => upd(selectedId, { corner: c })}
                        className={`flex-1 py-1.5 rounded-lg border text-sm transition-all ${selectedLayer.corner === c ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                        {sym}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                </>
              )}

              {/* Date */}
              {selectedLayer.type === 'date' && (
                <>
                  <div>
                    <label className="text-[9px] text-slate-600 block mb-1">TESTO DATA</label>
                    <input value={selectedLayer.text}
                      onChange={e => upd(selectedId, { text: e.target.value })}
                      placeholder="1939 • Settembre"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-[var(--cva)] text-[11px]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] text-slate-600">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent p-0.5 cursor-pointer" />
                  </div>
                </>
              )}

              {/* Fade controls */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
                <div>
                  <label className="text-[9px] text-slate-600 block mb-1">Fade In (s)</label>
                  <input type="number" min={0} max={2} step={0.1}
                    value={(selectedLayer.fadeIn ?? 0.3).toFixed(1)}
                    onChange={e => upd(selectedId, { fadeIn: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none text-[11px]" />
                </div>
                <div>
                  <label className="text-[9px] text-slate-600 block mb-1">Fade Out (s)</label>
                  <input type="number" min={0} max={2} step={0.1}
                    value={(selectedLayer.fadeOut ?? 0.3).toFixed(1)}
                    onChange={e => upd(selectedId, { fadeOut: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 outline-none text-[11px]" />
                </div>
              </div>

              {/* Delete */}
              <button onClick={() => del(selectedId)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-900 text-red-500 hover:bg-red-950/30 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Elimina layer
              </button>
            </div>
          )}
        </div>

        {/* Export panel */}
        <div className="p-4 border-t border-slate-800/60 space-y-2 shrink-0">
          <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-3">Esporta</div>

          {isExporting ? (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 text-center">Rendering {exportPct}%</div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${exportPct}%`, background: style.accent }} />
              </div>
              <div className="text-[10px] text-slate-600 text-center">Non chiudere il tab</div>
            </div>
          ) : (
            <>
              <button onClick={exportWebM}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-all active:scale-98"
                style={{ background: style.accent, color: style.dark ? '#000' : '#fff' }}>
                <Video className="w-4 h-4" /> ESPORTA VIDEO WEBM
              </button>
              <button onClick={exportPNG}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[12px] font-medium border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors">
                <ImageIcon className="w-3.5 h-3.5" /> PNG 1280×720
              </button>
              <div className="text-[9px] text-slate-600 text-center leading-relaxed">
                WebM 10Mbps VP9 • 1280×720 • {duration}s<br />
                Converti in MP4 con CloudConvert
              </div>
            </>
          )}

          <button onClick={() => zoomToRegion('world')}
            className="w-full py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-[10px] text-slate-500 transition-colors">
            ↺ Reset vista
          </button>
        </div>
      </div>

      {/* ══ LABEL INPUT OVERLAY ══════════════════════════════ */}
      <AnimatePresence>
        {labelPos && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLabelPos(null)}>
            <motion.div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-80 shadow-2xl space-y-3"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="text-sm font-semibold text-slate-200">Aggiungi Etichetta</div>
              <input autoFocus value={draft.text || ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                placeholder="Nome luogo, evento…"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]"
                onKeyDown={e => e.key === 'Enter' && commitLabel()} />
              <input value={draft.subtext || ''} onChange={e => setDraft(d => ({ ...d, subtext: e.target.value }))}
                placeholder="Dati, descrizione (opz)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]" />
              <div className="flex gap-2">
                <button onClick={() => setLabelPos(null)} className="flex-1 py-2 rounded-xl border border-slate-700 text-sm hover:bg-slate-800">Annulla</button>
                <button onClick={commitLabel} className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: style.accent, color: style.dark ? '#000' : '#fff' }}>Aggiungi</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ TITLE MODAL ══════════════════════════════════════ */}
      <AnimatePresence>
        {titleModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setTitleModal(null)}>
            <motion.div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-96 shadow-2xl space-y-3"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="text-sm font-semibold text-slate-200">Titolo / Card Vox-style</div>
              <input autoFocus value={draft.text || ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                placeholder="Titolo principale…"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]"
                onKeyDown={e => e.key === 'Enter' && commitTitle()} />
              <input value={draft.subtext || ''} onChange={e => setDraft(d => ({ ...d, subtext: e.target.value }))}
                placeholder="Sottotitolo / data / fonte (opz)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]" />
              <div className="flex gap-1.5">
                {['top','center','bottom'].map(pos => (
                  <button key={pos} onClick={() => setDraft(d => ({ ...d, position: pos }))}
                    className={`flex-1 py-2 rounded-xl border text-xs capitalize transition-all ${(draft.position || 'bottom') === pos ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                    {pos}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTitleModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm hover:bg-slate-800">Annulla</button>
                <button onClick={commitTitle} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: style.accent, color: style.dark ? '#000' : '#fff' }}>Aggiungi</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ STAT MODAL ═══════════════════════════════════════ */}
      <AnimatePresence>
        {statModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setStatModal(null)}>
            <motion.div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-80 shadow-2xl space-y-3"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="text-sm font-semibold text-slate-200">Box Statistica</div>
              <input autoFocus value={draft.label || ''} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder="Etichetta (es. Truppe dispiegate)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]"
                onKeyDown={e => e.key === 'Enter' && commitStat()} />
              <input value={draft.value || ''} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
                placeholder="Valore (es. 47,000)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[var(--cva)]" />
              <div className="flex gap-1.5">
                {[['tl','↖ Top L'],['tr','↗ Top R'],['bl','↙ Bot L'],['br','↘ Bot R']].map(([c, l]) => (
                  <button key={c} onClick={() => setDraft(d => ({ ...d, corner: c }))}
                    className={`flex-1 py-1.5 rounded-lg border text-[10px] transition-all ${(draft.corner || 'tr') === c ? 'border-[var(--cva)] text-[var(--cva)] bg-[var(--cva)]/10' : 'border-slate-700 text-slate-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStatModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm hover:bg-slate-800">Annulla</button>
                <button onClick={commitStat} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: style.accent, color: style.dark ? '#000' : '#fff' }}>Aggiungi</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SLIDER HELPER
══════════════════════════════════════════════════════════ */
function CV_Slider({ label, value, min, max, step, display, onChange, accent }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-slate-600">{label}</span>
        <span className="text-[9px] font-mono text-slate-400">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

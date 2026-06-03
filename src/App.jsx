import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, Reorder } from 'framer-motion';
import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, getFirstEncodableVideoCodec } from 'mediabunny';
import {
  Play, Pause, Download, Image as ImageIcon, Plus, Trash2, Edit2,
  MapPin, RotateCcw, Globe as GlobeIcon, Route, Grid3x3, Layers, Type, Clock, Cloud
} from 'lucide-react';
import { searchCountries } from './country-centroids.js';

const CATEGORY_COLORS = {
  'Economia': '#22c55e',
  'Conflitto': '#ef4444',
  'Politica': '#a855f7',
  'Clima': '#14b8a6',
  'Tecnologia': '#3b82f6',
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);

// Real Earth textures bundled locally (same-origin -> export never tainted)
const TEXTURES = {
  'blue-marble': { label: 'Blue Marble', url: '/textures/earth-blue-marble.jpg' },
  'day': { label: 'Giorno', url: '/textures/earth-day.jpg' },
  'night': { label: 'Notte', url: '/textures/earth-night.jpg' },
  'topology': { label: 'Rilievo 3D', url: '/textures/earth-blue-marble.jpg', bumpScale: 30 },
};
const BG_URL = '/textures/night-sky.png';
const BUMP_URL = '/textures/earth-topology.png';

// Quick "vibe" presets: set texture + accent + grid/border colors together
const VIBES = {
  warroom: { label: 'War Room', texture: 'night', accent: '#ff3b3b', grid: '#ff6b6b' },
  ocean: { label: 'Oceano', texture: 'blue-marble', accent: '#0ea5e9', grid: '#7dd3fc' },
  amber: { label: 'Notte', texture: 'night', accent: '#f59e0b', grid: '#fbbf24' },
  relief: { label: 'Rilievo 3D', texture: 'topology', accent: '#22d3ee', grid: '#67e8f9' },
};

const FONT_FAMILY = {
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'Space Grotesk': "'Space Grotesk', system-ui, sans-serif",
  'Inter': "Inter, system-ui, sans-serif",
};

const DEFAULT_THEME = {
  texture: 'night',
  accent: '#ff3b3b',
  atmosphere: 0.16,
  planetOverlayColor: '#000000',
  planetOverlayOpacity: 0,
  planetEmissive: '#000000',
  planetEmissiveInt: 0,
  showGrid: true,
  gridColor: '#ff6b6b',
  gridOpacity: 0.22,
  showRoutes: true,
  showBorder: true,
  borderColor: '#ff3b3b',
  borderOpacity: 0.55,
  showCards: true,
  card: {
    position: 'bottom', align: 'left', width: 304, radius: 16,
    titleFont: 'Playfair Display', titleSize: 16, textSize: 12.5,
    titleColor: '#f8fafc', textColor: '#cbd5e1',
    bgColor: '#0b1220', bgOpacity: 0.92, accentColor: '#ff3b3b', borderWidth: 2,
    transitionType: 'slide', transitionMs: 350,
    fields: { category: true, date: true, body: true, nation: true, source: true },
  },
};

const SAMPLE_NEWS = [
  { id: 1, title: "Tensioni al confine ucraino: nuove manovre militari", text: "La Russia intensifica le esercitazioni vicino al confine. L'UE chiede de-escalation immediata.", category: "Conflitto", date: "2026-05-28", source: "Reuters", nation: "Ucraina", lat: 50.4501, lng: 30.5234 },
  { id: 2, title: "Vertice G7 su Taiwan: Pechino risponde con manovre navali", text: "I leader del G7 ribadiscono il sostegno a Taipei. La Cina annuncia esercitazioni nello stretto.", category: "Politica", date: "2026-05-27", source: "Bloomberg", nation: "Taiwan", lat: 25.0330, lng: 121.5654 },
  { id: 3, title: "Crisi petrolifera: Brent oltre i 92$ al barile", text: "L'OPEC+ riduce la produzione. I mercati asiatici reagiscono con forti oscillazioni.", category: "Economia", date: "2026-05-29", source: "Financial Times", nation: "Arabia Saudita", lat: 24.7136, lng: 46.6753 },
  { id: 4, title: "Accordo storico sul clima: 190 nazioni firmano il patto", text: "Al vertice di Nairobi si raggiunge l'intesa per ridurre le emissioni del 45% entro il 2035.", category: "Clima", date: "2026-05-30", source: "The Guardian", nation: "Kenya", lat: -1.2921, lng: 36.8219 },
];

// Detect best video format once at load (MP4 preferred for direct playback)
const VIDEO_MIME =
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4; codecs=avc1') ? 'video/mp4; codecs=avc1' :
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
  'video/webm';
const VIDEO_EXT = VIDEO_MIME.startsWith('video/mp4') ? 'MP4' : 'WEBM';
const HQ_AVAILABLE = typeof window !== 'undefined' && 'VideoEncoder' in window;

// Module-scope helpers (out of render for purity)
const newId = () => Date.now();
const fileStamp = () => Date.now();
const nowMs = () => performance.now();
const todayISO = () => new Date().toISOString().split('T')[0];

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const alphaHex = (o) => Math.round(clamp01(o) * 255).toString(16).padStart(2, '0');
const hexA = (hex, o) => hex + alphaHex(o);
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

// ---------- Country borders ----------
const COUNTRY_FEATURES = feature(countriesTopo, countriesTopo.objects.countries).features;
function pointInPoly(lng, lat, geometry) {
  if (!geometry) return false;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polys.some(([outer]) => {
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i], [xj, yj] = outer[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}
const findCountry = (lat, lng) => COUNTRY_FEATURES.find(f => pointInPoly(lng, lat, f.geometry)) ?? null;
// Memoize per unique lat/lng — point-in-polygon is expensive
function findCountryCached(cacheRef, lat, lng) {
  const key = `${lat}\x00${lng}`;
  if (key in cacheRef.current) return cacheRef.current[key];
  const result = findCountry(lat, lng);
  cacheRef.current[key] = result;
  return result;
}

// ---------- Custom graticule grid (color + opacity controllable) ----------
function buildGraticule(color, opacity) {
  const R = 100.4;
  const v = (lat, lng) => {
    const phi = (90 - lat) * Math.PI / 180, theta = (90 - lng) * Math.PI / 180;
    return [R * Math.sin(phi) * Math.cos(theta), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(theta)];
  };
  const pos = [];
  for (let lng = -180; lng < 180; lng += 15)
    for (let lat = -90; lat < 90; lat += 3) pos.push(...v(lat, lng), ...v(lat + 3, lng));
  for (let lat = -75; lat <= 75; lat += 15)
    for (let lng = -180; lng < 180; lng += 3) pos.push(...v(lat, lng), ...v(lat, lng + 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false });
  const seg = new THREE.LineSegments(geo, mat);
  seg.renderOrder = 1;
  return seg;
}

// ---------- Canvas text wrap ----------
function wrapLines(ctx, text, maxW, maxLines) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let k = 0; k < words.length; k++) {
    const test = line ? line + ' ' + words[k] : words[k];
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = words[k]; if (lines.length === maxLines) { line = ''; break; } }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Storyboard (deterministic camera path for the reel) ----------
const hasGeo = (item) => item && item.type !== 'info' && Number.isFinite(item.lat) && Number.isFinite(item.lng);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpLng = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Slow "satellite filming" orbit applied while the camera holds over a target.
// intensity 0..1 → subtle, slow, never fully stops. Deterministic from holdMs.
const driftPov = (base, holdMs, intensity) => {
  if (!intensity || intensity <= 0) return base;
  const amp = intensity * 2.4; // degrees of sway at 100%
  return {
    lat: base.lat + amp * 0.6 * Math.sin(holdMs * 0.00045),
    lng: base.lng + amp * Math.cos(holdMs * 0.00034),
    alt: base.alt * (1 + intensity * 0.035 * Math.sin(holdMs * 0.00028)),
  };
};

// Living clouds: rotate + gentle wobble + breathing opacity/scale (subtle 3D depth).
// Deterministic from a time in ms so preview and export stay smooth.
const animateCloud = (mesh, baseOpacity, speed, ms) => {
  if (!mesh) return;
  mesh.rotation.y = ms * 0.0000075 * (speed ?? 0.5) * 12;
  mesh.rotation.x = Math.sin(ms * 0.000045) * 0.025;
  const pulse = 1 + Math.sin(ms * 0.00019) * 0.14;
  mesh.material.opacity = baseOpacity * pulse;
  const sc = 1 + Math.sin(ms * 0.00013) * 0.005;
  mesh.scale.setScalar(sc);
};

// Builds time→camera + time→active-card lookup. Mirrors live cinematicTo().
function buildStoryboard(clips, st, cardTransMs) {
  const start = { lat: st.startLat, lng: st.startLng, alt: st.startAlt };
  const segs = [];
  let t = 0;
  segs.push({ t0: 0, t1: st.introMs, kind: 'intro', cam: start, clip: clips.length ? 0 : -1, animate: false });
  t = st.introMs;
  let prev = start;
  clips.forEach((clip, i) => {
    const dur = clip.duration || st.holdMs;
    const to = hasGeo(clip) ? { lat: clip.lat, lng: clip.lng, alt: st.altitude } : prev;
    segs.push({ t0: t, t1: t + dur, kind: 'clip', from: prev, to, clip: i, flyMs: st.flyMs, animate: !(i === 0 && st.introMs > 0) });
    t += dur; prev = to;
  });
  const reelEnd = t;
  let total = t;
  const hasOutro = st.outroType !== 'none' && st.outroMs > 0;
  if (hasOutro) { segs.push({ t0: t, t1: t + st.outroMs, kind: 'outro', cam: prev, clip: clips.length - 1, animate: false }); total += st.outroMs; }

  const segAt = (tms) => segs.find(s => tms >= s.t0 && tms < s.t1) || segs[segs.length - 1];
  const drift = st.driftIntensity ?? 0;
  const povAt = (tms) => {
    const s = segAt(tms);
    if (s.kind !== 'clip') return s.cam;
    const local = tms - s.t0, fly = s.flyMs, { from, to } = s;
    const flyEnd = fly * 1.05;
    if (local >= flyEnd && drift > 0) {
      // Hold phase — slow satellite orbit so the shot never fully freezes
      return driftPov(to, local - flyEnd, drift);
    }
    const llP = Math.min(1, local / (fly * 0.45)), e = easeInOut(llP);
    const lat = lerp(from.lat, to.lat, e);
    const lng = lerpLng(from.lng, to.lng, e);
    const far = Math.min(2.4, to.alt + 0.9);
    let alt;
    if (local <= fly * 0.45) alt = lerp(from.alt, far, easeInOut(Math.min(1, local / (fly * 0.45))));
    else alt = lerp(far, to.alt, easeInOut(Math.min(1, (local - fly * 0.45) / (fly * 0.6))));
    return { lat, lng, alt };
  };
  const cardAt = (tms) => {
    const s = segAt(tms);
    let alpha = 1;
    if (s.kind === 'clip' && s.animate) {
      const local = tms - s.t0;
      alpha = Math.min(1, local / Math.max(1, cardTransMs));
      alpha = 1 - Math.pow(1 - alpha, 3);
    }
    const fadeBlack = (s.kind === 'outro' && st.outroType === 'fade')
      ? Math.pow(Math.min(1, (tms - s.t0) / Math.max(1, st.outroMs)), 2) : 0;
    return { clip: s.clip, alpha, fadeBlack };
  };
  return { total, reelEnd, povAt, cardAt };
}

function App() {
  const [news, setNews] = useState(() => {
    try { const s = localStorage.getItem('georeel-news'); return s ? JSON.parse(s) : SAMPLE_NEWS; }
    catch { return SAMPLE_NEWS; }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  const [isPickingLocation, _setIsPickingLocation] = useState(false);
  const [tab, setTab] = useState('preview'); // preview | planet | card
  const [formData, setFormData] = useState({ title: '', text: '', category: 'Conflitto', date: '', source: '', nation: '', lat: 41.9, lng: 12.5 });
  const [countryQuery, setCountryQuery] = useState('');
  const [countrySuggestions, setCountrySuggestions] = useState([]);

  const [theme, setTheme] = useState(() => {
    try {
      const s = localStorage.getItem('georeel-theme-v2');
      if (s) {
        const p = JSON.parse(s);
        return { ...DEFAULT_THEME, ...p, card: { ...DEFAULT_THEME.card, ...(p.card || {}), fields: { ...DEFAULT_THEME.card.fields, ...((p.card || {}).fields || {}) } } };
      }
    } catch { /* ignore */ }
    return DEFAULT_THEME;
  });

  const [settings, setSettings] = useState(() => {
    const defaults = { holdMs: 3000, flyMs: 1200, altitude: 0.9, startLat: 20, startLng: 10, startAlt: 2.4, introMs: 800, outroType: 'hold', outroMs: 1500, autoSpin: true, driftIntensity: 0, showClouds: false, cloudOpacity: 0.25, cloudSpeed: 0.5 };
    try { const s = localStorage.getItem('georeel-settings-v1'); if (s) return { ...defaults, ...JSON.parse(s) }; } catch { /* ignore */ }
    return defaults;
  });
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formError, setFormError] = useState('');
  const [exportPct, setExportPct] = useState(0);

  const globeEl = useRef(null);
  const globeInstance = useRef(null);
  const gridRef = useRef(null);
  const overlayRef = useRef(null);
  const cloudRef = useRef(null);
  const countryCache = useRef({});
  const cardTransRef = useRef({ active: false, start: 0, dur: 350, type: 'slide' });
  const outroRef = useRef({ active: false, start: 0, dur: 0, type: 'none' });

  const pickingRef = useRef(false);
  const exportingRef = useRef(false);
  const holdRef = useRef({ active: false, lat: 0, lng: 0, alt: 1, t0: 0 });
  const newsRef = useRef(news);
  const settingsRef = useRef(settings);
  const themeRef = useRef(theme);
  const currentNewsRef = useRef(news[0] || null);
  const playState = useRef({ playing: false, slideTimer: null, zoomTimer: null, driftTimer: null });

  useEffect(() => { newsRef.current = news; }, [news]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { currentNewsRef.current = news[currentIndex] || null; }, [news, currentIndex]);

  const accent = theme.accent;
  const card = theme.card;

  const setIsPickingLocation = (v) => { pickingRef.current = v; _setIsPickingLocation(v); };
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 2100); };
  const showConfirm = (message, onConfirm) => setConfirmDialog({ message, onConfirm });

  const setCard = (patch) => setTheme(t => ({ ...t, card: { ...t.card, ...patch } }));
  const setField = (k, v) => setTheme(t => ({ ...t, card: { ...t.card, fields: { ...t.card.fields, [k]: v } } }));
  const applyVibe = (key) => {
    const v = VIBES[key];
    setTheme(t => ({ ...t, texture: v.texture, accent: v.accent, gridColor: v.grid, borderColor: v.accent, card: { ...t.card, accentColor: v.accent } }));
  };

  // Persist
  useEffect(() => { try { localStorage.setItem('georeel-news', JSON.stringify(news)); } catch { /* ignore */ } }, [news]);
  useEffect(() => { try { localStorage.setItem('georeel-theme-v2', JSON.stringify(theme)); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { try { localStorage.setItem('georeel-settings-v1', JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);

  const flyTo = (item, altitude, ms) => {
    if (globeInstance.current && item) globeInstance.current.pointOfView({ lat: item.lat, lng: item.lng, altitude }, ms);
  };
  // Apply max anisotropy + best filters whenever a texture loads
  const enhanceTextures = () => {
    const g = globeInstance.current;
    if (!g) return;
    try {
      const mat = g.globeMaterial();
      const maxAniso = g.renderer().capabilities.getMaxAnisotropy();
      for (const key of ['map', 'bumpMap']) {
        const t = mat?.[key];
        if (!t) continue;
        t.anisotropy = maxAniso;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        t.needsUpdate = true;
      }
      if (mat) mat.needsUpdate = true;
    } catch { /* ignore */ }
  };

  // Cinematic zoom-in: approach pulled-back, then dolly in (info cards hold the camera)
  const cinematicTo = (item) => {
    if (!hasGeo(item)) return;
    const s = settingsRef.current;
    const close = s.altitude;
    const far = Math.min(2.4, close + 0.9);
    flyTo(item, far, s.flyMs * 0.45);
    clearTimeout(playState.current.zoomTimer);
    playState.current.zoomTimer = setTimeout(() => flyTo(item, close, Math.max(350, s.flyMs * 0.6)), s.flyMs * 0.45);
  };

  // ---------- Globe init (once) ----------
  useEffect(() => {
    if (!globeEl.current || globeInstance.current) return;
    const th = themeRef.current;

    const globe = Globe({ rendererConfig: { preserveDrawingBuffer: true, antialias: true } })(globeEl.current)
      .width(360).height(640)
      .globeImageUrl(TEXTURES[th.texture].url)
      .bumpImageUrl(BUMP_URL)
      .backgroundImageUrl(BG_URL)
      .atmosphereColor(th.accent)
      .atmosphereAltitude(th.atmosphere)
      .showGraticules(false)
      .pointOfView({ lat: 20, lng: 10, altitude: 2.4 }, 0)
      .pointAltitude(0.01).pointRadius(0.45).pointColor(d => d.color).pointsTransitionDuration(0)
      .ringColor(() => (t) => `rgba(${hexToRgb(themeRef.current.accent)},${1 - t})`)
      .ringMaxRadius(5).ringPropagationSpeed(3).ringRepeatPeriod(700)
      .arcColor(() => themeRef.current.accent)
      .arcStroke(0.5).arcAltitudeAutoScale(0.4).arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(1800)
      .onGlobeClick((lat, lng) => {
        if (!pickingRef.current) return;
        const rLat = parseFloat(lat.toFixed(4)), rLng = parseFloat(lng.toFixed(4));
        setFormData(prev => ({ ...prev, lat: rLat, lng: rLng }));
        pickingRef.current = false; _setIsPickingLocation(false);
        showToast(`Posizione impostata: ${rLat}°, ${rLng}°`);
      })
      .onPointClick((point) => {
        const idx = newsRef.current.findIndex(n => n.id === point.id);
        if (idx === -1) return;
        setCurrentIndex(idx);
        cinematicTo(newsRef.current[idx]);
      });

    globeInstance.current = globe;
    try { globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2)); } catch { /* ignore */ }
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;

    const grid = buildGraticule(th.gridColor, th.gridOpacity);
    grid.visible = th.showGrid;
    globe.scene().add(grid);
    gridRef.current = grid;

    // Emissive glow (additive — can never blacken the planet)
    try {
      const mat = globe.globeMaterial();
      if (mat?.emissive) { mat.emissive.set(th.planetEmissive || '#000000'); mat.emissiveIntensity = th.planetEmissiveInt ?? 0; }
      if (mat) mat.bumpScale = TEXTURES[th.texture]?.bumpScale ?? 5;
    } catch { /* ignore */ }

    // Color overlay sphere (semi-transparent, depthTest:false — never blackens)
    const overlayGeo = new THREE.SphereGeometry(101, 32, 32);
    const overlayMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(th.planetOverlayColor || '#000000'),
      transparent: true, opacity: th.planetOverlayOpacity ?? 0,
      depthTest: false, depthWrite: false,
    });
    const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    overlayMesh.renderOrder = 2;
    globe.scene().add(overlayMesh);
    overlayRef.current = overlayMesh;

    // Cloud layer — sits a bit higher than the surface for parallax depth.
    // bumpMap gives the clouds real 3D relief; animateCloud makes them live & breathe.
    const st0 = settingsRef.current;
    const cloudTex = new THREE.TextureLoader().load('/textures/earth-clouds.png');
    const cloudGeo = new THREE.SphereGeometry(103, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      map: cloudTex, alphaMap: cloudTex, bumpMap: cloudTex, bumpScale: 1.4,
      transparent: true, opacity: st0.cloudOpacity ?? 0.25,
      depthWrite: false, shininess: 4,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.visible = !!(st0.showClouds);
    cloudMesh.renderOrder = 4;
    cloudMesh.userData.baseOpacity = st0.cloudOpacity ?? 0.25;
    globe.scene().add(cloudMesh);
    cloudRef.current = cloudMesh;

    // Living-cloud animation (preview). Export drives it deterministically per-frame.
    let cloudRafId;
    const rotateCloud = () => {
      const m = cloudRef.current;
      if (m && m.visible && !exportingRef.current) {
        animateCloud(m, m.userData.baseOpacity ?? 0.25, settingsRef.current.cloudSpeed ?? 0.5, nowMs());
      }
      cloudRafId = requestAnimationFrame(rotateCloud);
    };
    cloudRafId = requestAnimationFrame(rotateCloud);

    setTimeout(enhanceTextures, 1200);

    return () => {
      cancelAnimationFrame(cloudRafId);
      try { globe._destructor && globe._destructor(); } catch { /* ignore */ }
      if (globeEl.current) globeEl.current.innerHTML = '';
      globeInstance.current = null;
      gridRef.current = null;
      overlayRef.current = null;
      cloudRef.current = null;
    };
  }, []);

  // Texture + bumpScale + quality
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const tex = TEXTURES[theme.texture];
    g.globeImageUrl(tex.url);
    try { const mat = g.globeMaterial(); if (mat) mat.bumpScale = tex.bumpScale ?? 5; } catch { /* ignore */ }
    setTimeout(enhanceTextures, 600);
  }, [theme.texture]);
  // Atmosphere / accent
  useEffect(() => { globeInstance.current?.atmosphereColor(theme.accent).atmosphereAltitude(theme.atmosphere); }, [theme.accent, theme.atmosphere]);
  // Grid look
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.visible = theme.showGrid;
    grid.material.opacity = theme.gridOpacity;
    grid.material.color.set(theme.gridColor);
  }, [theme.showGrid, theme.gridOpacity, theme.gridColor]);

  // Points + active highlight (info cards have no geo → no point)
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const activeId = news[currentIndex]?.id;
    g.pointsData(news.filter(hasGeo).map((item) => ({ ...item, color: CATEGORY_COLORS[item.category] || '#64748b', __r: item.id === activeId ? 0.75 : 0.4 })))
     .pointRadius(d => d.__r);
  }, [news, currentIndex]);

  // Radar ring
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    g.ringsData(hasGeo(item) ? [{ lat: item.lat, lng: item.lng }] : []);
  }, [news, currentIndex]);

  // Route arcs (only between geo clips)
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const geo = news.filter(hasGeo);
    if (!theme.showRoutes || geo.length < 2) { g.arcsData([]); return; }
    g.arcColor(() => theme.accent).arcsData(geo.map((n, i) => {
      const next = geo[(i + 1) % geo.length];
      return { startLat: n.lat, startLng: n.lng, endLat: next.lat, endLng: next.lng };
    }));
  }, [news, theme.showRoutes, theme.accent]);

  // Country border
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    const country = (theme.showBorder && hasGeo(item)) ? findCountryCached(countryCache, item.lat, item.lng) : null;
    if (country) {
      g.polygonsData([country]).polygonAltitude(0.006)
       .polygonCapColor(() => hexA(theme.borderColor, theme.borderOpacity * 0.28))
       .polygonSideColor(() => 'rgba(0,0,0,0)')
       .polygonStrokeColor(() => hexA(theme.borderColor, theme.borderOpacity))
       .polygonsTransitionDuration(400);
    } else g.polygonsData([]);
  }, [news, currentIndex, theme.showBorder, theme.borderColor, theme.borderOpacity]);

  // Planet emissive glow
  useEffect(() => {
    const mat = globeInstance.current?.globeMaterial();
    if (mat?.emissive) { mat.emissive.set(theme.planetEmissive || '#000000'); mat.emissiveIntensity = theme.planetEmissiveInt ?? 0; }
  }, [theme.planetEmissive, theme.planetEmissiveInt]);
  // Idle auto-spin (paused during preview/export)
  useEffect(() => {
    const ctrl = globeInstance.current?.controls();
    if (ctrl) ctrl.autoRotate = settings.autoSpin && !isPlaying && !isExporting;
  }, [settings.autoSpin, isPlaying, isExporting]);
  // Planet color overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.material.color.set(theme.planetOverlayColor || '#000000');
    overlay.material.opacity = theme.planetOverlayOpacity ?? 0;
  }, [theme.planetOverlayColor, theme.planetOverlayOpacity]);
  // Cloud layer
  useEffect(() => {
    const cloud = cloudRef.current;
    if (!cloud) return;
    cloud.visible = !!settings.showClouds;
    cloud.userData.baseOpacity = settings.cloudOpacity ?? 0.25;
    cloud.material.opacity = settings.cloudOpacity ?? 0.25;
  }, [settings.showClouds, settings.cloudOpacity]);
  // Preview satellite drift — slow orbit while the camera holds over a target
  useEffect(() => {
    if (!settings.driftIntensity || settings.driftIntensity <= 0) return;
    let raf;
    const tick = () => {
      const g = globeInstance.current;
      const h = holdRef.current;
      if (g && h.active && playState.current.playing) {
        const pov = driftPov({ lat: h.lat, lng: h.lng, alt: h.alt }, nowMs() - h.t0, settingsRef.current.driftIntensity);
        g.pointOfView(pov, 0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settings.driftIntensity]);

  useEffect(() => () => { clearTimeout(playState.current.slideTimer); clearTimeout(playState.current.zoomTimer); clearTimeout(playState.current.driftTimer); }, []);

  const getCategoryColor = (c) => CATEGORY_COLORS[c] || '#64748b';

  const playStep = (i) => {
    const list = newsRef.current;
    if (!list.length) { stopPreview(); return; }
    const idx = ((i % list.length) + list.length) % list.length;
    const c = themeRef.current.card;
    const s = settingsRef.current;
    cardTransRef.current = { active: true, start: nowMs(), dur: c.transitionMs ?? 350, type: c.transitionType ?? 'slide' };
    setCurrentIndex(idx);
    const item = list[idx];
    cinematicTo(item);
    // Arm satellite drift once the dolly-in settles (geo clips hold over the target;
    // info clips keep drifting around the previous position).
    holdRef.current = { ...holdRef.current, active: false };
    clearTimeout(playState.current.driftTimer);
    playState.current.driftTimer = setTimeout(() => {
      if (!playState.current.playing) return;
      const base = hasGeo(item)
        ? { lat: item.lat, lng: item.lng, alt: s.altitude }
        : (globeInstance.current?.pointOfView() || holdRef.current);
      holdRef.current = { active: true, lat: base.lat, lng: base.lng, alt: base.alt, t0: nowMs() };
    }, Math.max(350, s.flyMs * 0.6) + s.flyMs * 0.45);
    const dur = item.duration || s.holdMs;
    playState.current.slideTimer = setTimeout(() => { if (playState.current.playing) playStep(idx + 1); }, dur);
  };
  const startPreview = () => {
    if (!newsRef.current.length) { showToast('Aggiungi almeno una notizia', 'error'); return; }
    playState.current.playing = true;
    setIsPlaying(true);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = false;
    playStep(0);
  };
  const stopPreview = () => {
    clearTimeout(playState.current.slideTimer);
    clearTimeout(playState.current.zoomTimer);
    clearTimeout(playState.current.driftTimer);
    holdRef.current = { ...holdRef.current, active: false };
    playState.current = { playing: false, slideTimer: null, zoomTimer: null, driftTimer: null };
    setIsPlaying(false);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = settingsRef.current.autoSpin;
  };
  const togglePlay = () => (isPlaying ? stopPreview() : startPreview());
  const selectNews = (index) => { setCurrentIndex(index); cinematicTo(news[index]); };

  // CRUD
  const openAddModal = () => {
    setEditingNews(null); setFormError(''); setCountryQuery(''); setCountrySuggestions([]);
    setFormData({ title: '', text: '', category: 'Conflitto', date: todayISO(), source: '', nation: '', lat: 41.9028, lng: 12.4964 });
    setShowModal(true); setIsPickingLocation(false);
  };
  const openAddInfo = () => {
    setEditingNews(null); setFormError(''); setCountryQuery(''); setCountrySuggestions([]);
    setFormData({ title: 'Titolo info', text: 'Testo descrittivo aggiuntivo…', type: 'info', category: 'Info', date: '', source: '', nation: '', lat: null, lng: null });
    setShowModal(true); setIsPickingLocation(false);
  };
  const openEditModal = (item) => {
    setEditingNews(item); setFormError('');
    setCountryQuery(item.nation || ''); setCountrySuggestions([]);
    setFormData({ ...item }); setShowModal(true); setIsPickingLocation(false);
  };
  const closeModal = () => { setShowModal(false); setFormError(''); setIsPickingLocation(false); setCountryQuery(''); setCountrySuggestions([]); };
  const saveNews = () => {
    if (!formData.title.trim() || !formData.text.trim()) { setFormError('Titolo e descrizione sono obbligatori'); return; }
    const isInfo = formData.type === 'info';
    const item = { ...formData, id: editingNews ? editingNews.id : newId(),
      lat: isInfo ? null : parseFloat(formData.lat), lng: isInfo ? null : parseFloat(formData.lng) };
    setNews(prev => editingNews ? prev.map(n => n.id === editingNews.id ? item : n) : [...prev, item]);
    closeModal();
  };
  const deleteNews = (id) => showConfirm('Eliminare questa clip?', () => {
    setNews(prev => { const f = prev.filter(n => n.id !== id); if (currentIndex >= f.length) setCurrentIndex(Math.max(0, f.length - 1)); return f; });
  });
  const setClipDuration = (id, ms) => setNews(prev => prev.map(n => n.id === id ? { ...n, duration: ms } : n));
  const loadSampleData = () => showConfirm('Caricare i dati di esempio? (sostituisce le notizie attuali)', () => { setNews(SAMPLE_NEWS); setCurrentIndex(0); });
  const resetCamera = () => {
    stopPreview();
    globeInstance.current?.pointOfView({ lat: settings.startLat, lng: settings.startLng, altitude: settings.startAlt }, 1000);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = settings.autoSpin;
    setCurrentIndex(0);
  };
  const captureCurrentView = () => {
    const pov = globeInstance.current?.pointOfView();
    if (!pov) { showToast('Globo non pronto', 'error'); return; }
    setSettings(s => ({ ...s, startLat: parseFloat(pov.lat.toFixed(4)), startLng: parseFloat(pov.lng.toFixed(4)), startAlt: parseFloat(pov.altitude.toFixed(3)) }));
    showToast('Punto di inizio aggiornato');
  };

  // ---------- Draw card on 2D canvas (matches DOM, for export) ----------
  const drawCard = (ctx, s, item, alpha = 1, offsetY = 0) => {
    if (!item || !themeRef.current.showCards || alpha <= 0) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    const c = themeRef.current.card;
    const f = item.type === 'info' ? { category: false, date: false, body: true, nation: false, source: false } : c.fields;
    const pad = 16 * s;
    const cw = c.width * s;
    const innerW = cw - pad * 2;

    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${c.titleSize * s}px ${FONT_FAMILY[c.titleFont]}`;
    const titleLines = wrapLines(ctx, item.title, innerW, 3);
    ctx.font = `${c.textSize * s}px ${FONT_FAMILY.Inter}`;
    const bodyLines = f.body ? wrapLines(ctx, item.text, innerW, 4) : [];

    const titleLH = c.titleSize * 1.28 * s;
    const bodyLH = c.textSize * 1.35 * s;
    const hasMeta = f.category || f.date;
    const hasFooter = f.nation || f.source;

    let h = pad;
    if (hasMeta) h += 22 * s;
    h += titleLines.length * titleLH;
    if (bodyLines.length) h += 8 * s + bodyLines.length * bodyLH;
    if (hasFooter) h += 14 * s + 18 * s;
    h += pad;

    const cx = (360 * s - cw) / 2;
    let cy;
    if (c.position === 'top') cy = 30 * s;
    else if (c.position === 'center') cy = (640 * s - h) / 2;
    else cy = (640 - 30) * s - h;
    cy += offsetY;

    // background
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 28 * s; ctx.shadowOffsetY = 12 * s;
    roundRect(ctx, cx, cy, cw, h, c.radius * s);
    ctx.fillStyle = hexA(c.bgColor, c.bgOpacity);
    ctx.fill();
    ctx.restore();

    // accent top line
    if (c.borderWidth > 0) {
      ctx.fillStyle = c.accentColor;
      roundRect(ctx, cx, cy, cw, c.borderWidth * s, (c.borderWidth / 2) * s);
      ctx.fill();
    }

    const leftX = cx + pad;
    const rightX = cx + cw - pad;
    const centerX = cx + cw / 2;
    const tx = c.align === 'center' ? centerX : leftX;
    ctx.textAlign = c.align === 'center' ? 'center' : 'left';

    let y = cy + pad;

    // meta row
    if (hasMeta) {
      const catColor = getCategoryColor(item.category);
      ctx.textBaseline = 'middle';
      if (f.category) {
        ctx.textAlign = 'left';
        ctx.font = `700 ${10 * s}px ${FONT_FAMILY.Inter}`;
        const cat = item.category.toUpperCase();
        const bw = ctx.measureText(cat).width + 18 * s;
        ctx.fillStyle = catColor + '33';
        roundRect(ctx, leftX, y, bw, 19 * s, 6 * s); ctx.fill();
        ctx.fillStyle = catColor;
        ctx.fillText(cat, leftX + 9 * s, y + 10 * s);
      }
      if (f.date) {
        ctx.textAlign = 'right';
        ctx.font = `${10 * s}px ${FONT_FAMILY.Inter}`;
        ctx.fillStyle = '#64748b';
        ctx.fillText(item.date || '', rightX, y + 10 * s);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = c.align === 'center' ? 'center' : 'left';
      y += 22 * s;
    }

    // title
    ctx.fillStyle = c.titleColor;
    ctx.font = `700 ${c.titleSize * s}px ${FONT_FAMILY[c.titleFont]}`;
    y += c.titleSize * s;
    for (const ln of titleLines) { ctx.fillText(ln, tx, y); y += titleLH; }

    // body
    if (bodyLines.length) {
      y += 8 * s;
      ctx.fillStyle = c.textColor;
      ctx.font = `${c.textSize * s}px ${FONT_FAMILY.Inter}`;
      for (const ln of bodyLines) { ctx.fillText(ln, tx, y); y += bodyLH; }
    }

    // footer
    if (hasFooter) {
      const fy = cy + h - pad - 4 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(leftX, fy - 16 * s); ctx.lineTo(rightX, fy - 16 * s); ctx.stroke();
      ctx.textBaseline = 'middle';
      if (f.nation) {
        ctx.textAlign = 'left'; ctx.font = `${10 * s}px ${FONT_FAMILY.Inter}`; ctx.fillStyle = '#94a3b8';
        ctx.fillText('◉ ' + (item.nation || ''), leftX, fy);
      }
      if (f.source) {
        ctx.textAlign = 'right'; ctx.font = `${10 * s}px ${FONT_FAMILY.Inter}`; ctx.fillStyle = '#64748b';
        ctx.fillText(item.source || '', rightX, fy);
      }
      ctx.textBaseline = 'alphabetic';
    }
    ctx.textAlign = 'left';
    ctx.restore();
  };

  const getGlobeCanvas = () => globeEl.current?.querySelector('canvas');

  const exportPNG = () => {
    const g = getGlobeCanvas();
    if (!g) { showToast('Globo non pronto', 'error'); return; }
    const W = g.width, H = g.height, s = W / 360;
    const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');
    ctx.drawImage(g, 0, 0, W, H);
    drawCard(ctx, s, currentNewsRef.current);
    const a = document.createElement('a');
    a.download = `GeoReel_${fileStamp()}.png`;
    a.href = comp.toDataURL('image/png');
    a.click();
  };

  // Position the globe camera deterministically (no tween) for offline rendering
  const setCameraPOV = (pov) => {
    const g = globeInstance.current;
    if (!g) return;
    const c = g.getCoords(pov.lat, pov.lng, pov.alt);
    const cam = g.camera();
    cam.position.set(c.x, c.y, c.z);
    cam.lookAt(0, 0, 0);
    g.controls().target.set(0, 0, 0);
    g.renderer().render(g.scene(), cam);
  };

  // Deterministic frame-by-frame export via WebCodecs (smooth, not a screen grab).
  // Renders at the highest 9:16 resolution the encoder accepts (up to 4K = 2160×3840).
  const exportVideoHQ = async () => {
    const g = getGlobeCanvas();
    if (!g) { showToast('Globo non pronto', 'error'); return; }
    const clips = newsRef.current;
    if (!clips.length) { showToast('Aggiungi almeno una clip', 'error'); return; }
    const st = settingsRef.current;
    const fps = 60;

    // Pick the highest 9:16 resolution the browser can actually encode.
    const codecPref = ['avc', 'hevc', 'av1', 'vp9'];
    const RES_LADDER = [[2160, 3840], [1440, 2560], [1080, 1920], [720, 1280]];
    let W = 0, H = 0, codec = null;
    for (const [w, h] of RES_LADDER) {
      let c = null;
      try { c = await getFirstEncodableVideoCodec(codecPref, { width: w, height: h }); } catch { /* ignore */ }
      if (c) { W = w; H = h; codec = c; break; }
    }
    if (!codec) { showToast('WebCodecs non disponibile, uso cattura schermo', 'error'); return exportVideoCapture(); }
    const s = W / 360;
    const isMp4 = codec === 'avc' || codec === 'hevc' || codec === 'av1';
    const ext = isMp4 ? 'mp4' : 'webm';
    const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');

    const output = new Output({
      format: isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const source = new CanvasSource(comp, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });

    stopPreview();
    setIsExporting(true);
    exportingRef.current = true;
    setExportPct(0);
    const gInst = globeInstance.current;
    const ctrl = gInst?.controls();
    const prevAuto = ctrl?.autoRotate;
    if (ctrl) { ctrl.autoRotate = false; ctrl.enabled = false; }

    // Upscale the renderer to the export resolution (pixelRatio 1 → exact buffer size).
    const prevW = gInst.width(), prevH = gInst.height();
    const prevPR = gInst.renderer().getPixelRatio();
    gInst.renderer().setPixelRatio(1);
    gInst.width(W).height(H);

    // Freeze auto-driven arc dash + polygon transitions; we drive them per-frame instead.
    const prevArcAnimTime = 1800;
    gInst.arcDashAnimateTime(0);
    gInst.polygonsTransitionDuration(0);

    // Collect arc shader materials so we can advance the dash deterministically.
    const arcMats = [];
    gInst.scene().traverse((o) => {
      const u = o.material && o.material.uniforms;
      if (u && u.dashTranslate) arcMats.push(o.material);
    });
    const cloud = cloudRef.current;
    const cloudBase = cloud?.userData.baseOpacity ?? 0.25;

    try {
      await output.start();
      const th = themeRef.current;
      const sb = buildStoryboard(clips, st, th.card.transitionMs ?? 350);
      const totalFrames = Math.max(1, Math.ceil((sb.total / 1000) * fps));
      const transType = th.card.transitionType ?? 'slide';
      const frameDur = 1 / fps;
      let lastClipIdx = -1;

      for (let f = 0; f < totalFrames; f++) {
        const tms = (f / fps) * 1000;
        const pov = sb.povAt(tms);
        const { clip, alpha, fadeBlack } = sb.cardAt(tms);
        const item = clips[clip] || null;
        currentNewsRef.current = item;

        // Update country border per-clip (deterministic, follows settings exactly)
        if (clip !== lastClipIdx) {
          lastClipIdx = clip;
          if (th.showBorder && item && hasGeo(item)) {
            const country = findCountryCached(countryCache, item.lat, item.lng);
            if (country) {
              gInst.polygonsData([country])
                .polygonAltitude(0.006)
                .polygonCapColor(() => hexA(th.borderColor, th.borderOpacity * 0.28))
                .polygonSideColor(() => 'rgba(0,0,0,0)')
                .polygonStrokeColor(() => hexA(th.borderColor, th.borderOpacity));
            } else {
              gInst.polygonsData([]);
            }
          } else {
            gInst.polygonsData([]);
          }
        }

        // Advance flowing arc dashes deterministically (no freeze, no jump)
        const dashVal = tms / prevArcAnimTime;
        for (const m of arcMats) m.uniforms.dashTranslate.value = dashVal;
        // Living clouds, deterministic per frame
        if (cloud && cloud.visible) animateCloud(cloud, cloudBase, st.cloudSpeed ?? 0.5, tms);

        setCameraPOV(pov);
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(g, 0, 0, W, H);
        const offsetY = transType === 'slide' ? (1 - alpha) * 28 * s : 0;
        const drawAlpha = transType === 'none' ? 1 : alpha;
        const scale = transType === 'zoom' ? 0.92 + 0.08 * alpha : 1;
        if (scale !== 1) {
          ctx.save();
          ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2);
          drawCard(ctx, s, item, drawAlpha, offsetY);
          ctx.restore();
        } else {
          drawCard(ctx, s, item, drawAlpha, offsetY);
        }
        if (fadeBlack > 0) { ctx.fillStyle = `rgba(0,0,0,${fadeBlack})`; ctx.fillRect(0, 0, W, H); }

        await source.add(f / fps, frameDur);
        if (f % 4 === 0) setExportPct(Math.round((f / totalFrames) * 100));
      }
      await output.finalize();
      const blob = new Blob([output.target.buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `GeoReel_${H >= 3840 ? '4K_' : ''}${new Date().toISOString().slice(0, 10)}.${ext}`; a.click();
      URL.revokeObjectURL(url);
      showToast(`Video ${H}p esportato ✓`);
    } catch (err) {
      console.error(err);
      showToast('Errore export, uso cattura schermo', 'error');
      gInst.width(prevW).height(prevH); gInst.renderer().setPixelRatio(prevPR);
      gInst.arcDashAnimateTime(prevArcAnimTime);
      gInst.polygonsTransitionDuration(400);
      if (ctrl) { ctrl.autoRotate = prevAuto; ctrl.enabled = true; }
      exportingRef.current = false;
      setIsExporting(false); setExportPct(0);
      return exportVideoCapture();
    }
    // Restore preview resolution & live animation
    gInst.width(prevW).height(prevH); gInst.renderer().setPixelRatio(prevPR);
    gInst.arcDashAnimateTime(prevArcAnimTime);
    gInst.polygonsTransitionDuration(400);
    if (cloud) cloud.material.opacity = cloudBase;
    if (ctrl) { ctrl.autoRotate = prevAuto; ctrl.enabled = true; }
    exportingRef.current = false;
    setIsExporting(false); setExportPct(0);
    stopPreview();
  };

  const exportVideo = () => {
    if (typeof window !== 'undefined' && 'VideoEncoder' in window) return exportVideoHQ();
    return exportVideoCapture();
  };

  const exportVideoCapture = () => {
    const g = getGlobeCanvas();
    if (!g || !g.captureStream) { showToast('Cattura video non supportata dal browser', 'error'); return; }
    const mimeType =
      MediaRecorder.isTypeSupported('video/mp4; codecs=avc1') ? 'video/mp4; codecs=avc1' :
      MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
      MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' :
      MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : null;
    if (!mimeType) { showToast('Formato video non supportato', 'error'); return; }
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const W = g.width, H = g.height, s = W / 360;
    const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');
    let raf;
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(g, 0, 0, W, H);
      // Card transition
      let cardAlpha = 1, cardOffsetY = 0;
      const trans = cardTransRef.current;
      if (trans.active) {
        const t = Math.min(1, (nowMs() - trans.start) / Math.max(1, trans.dur));
        const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
        cardAlpha = eased;
        if (trans.type === 'slide') cardOffsetY = (1 - eased) * 28 * s;
        if (t >= 1) trans.active = false;
      }
      drawCard(ctx, s, currentNewsRef.current, cardAlpha, cardOffsetY);
      // Outro overlay
      const outro = outroRef.current;
      if (outro.active && outro.type === 'fade') {
        const t = Math.min(1, (nowMs() - outro.start) / Math.max(1, outro.dur));
        ctx.fillStyle = `rgba(0,0,0,${t * t})`;
        ctx.fillRect(0, 0, W, H);
      }
      raf = requestAnimationFrame(loop);
    };
    const stream = comp.captureStream(120);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `GeoReel_${new Date().toISOString().slice(0, 10)}.${ext}`; a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false); stopPreview();
    };
    stopPreview();
    outroRef.current = { active: false, start: 0, dur: 0, type: 'none' };
    cardTransRef.current = { active: false, start: 0, dur: 350, type: 'slide' };
    const st = settingsRef.current;
    if (globeInstance.current) {
      globeInstance.current.controls().autoRotate = false;
      globeInstance.current.pointOfView({ lat: st.startLat, lng: st.startLng, altitude: st.startAlt }, 0);
    }
    currentNewsRef.current = newsRef.current[0] || null;
    setCurrentIndex(0);
    setIsExporting(true);
    const totalSlideMs = st.introMs + newsRef.current.length * st.holdMs;
    const hasOutro = st.outroType !== 'none' && st.outroMs > 0;
    requestAnimationFrame(() => {
      loop(); rec.start();
      setTimeout(() => { startPreview(); }, st.introMs);
      if (hasOutro) {
        setTimeout(() => { outroRef.current = { active: true, start: nowMs(), dur: st.outroMs, type: st.outroType }; }, totalSlideMs);
        setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, totalSlideMs + st.outroMs + 300);
      } else {
        setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, totalSlideMs + 600);
      }
    });
  };

  const currentNews = news[currentIndex] || null;
  const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';
  const slotStyle = card.position === 'top' ? { top: 30 } : card.position === 'center' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: 30 };

  return (
    <div className="min-h-screen text-slate-200 flex flex-col" style={{ '--accent': accent }}>
      <nav className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl z-50">
        <div className="max-w-[1480px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accent }}><GlobeIcon className="w-5 h-5 text-black/80" /></div>
            <div className="font-semibold text-xl tracking-tight">GeoReel</div>
            <div className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 font-mono" style={{ color: accent }}>STUDIO</div>
          </div>
          <button onClick={loadSampleData} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs"><RotateCcw className="w-3.5 h-3.5" /> Esempi</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden max-w-[1480px] mx-auto w-full">
        {/* LEFT — news */}
        <div className="w-72 border-r border-slate-800/80 bg-slate-950 flex flex-col">
          <div className="p-5 flex-1 overflow-auto">
            <button onClick={openAddModal} className="w-full flex items-center justify-center gap-2 text-black font-semibold py-3 rounded-2xl text-sm mb-6" style={{ background: accent }}><Plus className="w-4 h-4" /> AGGIUNGI NOTIZIA</button>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400">Notizie ({news.length})</div>
              <div className="text-[10px] text-slate-600">trascina ⇅</div>
            </div>
            {news.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">Nessuna notizia.</div>
            ) : (
              <Reorder.Group axis="y" values={news} onReorder={setNews} className="space-y-2">
                {news.map((item, index) => (
                  <Reorder.Item key={item.id} value={item}
                    className={`group flex items-start gap-3 p-3 rounded-2xl cursor-grab active:cursor-grabbing border transition-colors ${index === currentIndex ? 'bg-slate-800 border-slate-600' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    whileDrag={{ scale: 1.02 }}>
                    <div className="w-2.5 h-2.5 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(item.category) }} />
                    <div className="flex-1 min-w-0" onClick={() => selectNews(index)}>
                      <div className="font-medium text-[13px] leading-tight line-clamp-2">{item.title}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="tag text-[9px] px-1.5 py-px" style={{ backgroundColor: getCategoryColor(item.category) + '22', color: getCategoryColor(item.category) }}>{item.category}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{item.nation}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(item); }} className="p-1 hover:bg-slate-700 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNews(item.id); }} className="p-1 hover:bg-red-950 text-red-400 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>
          <div className="p-4 border-t border-slate-800/80 text-[10px] text-slate-600">100% client-side • Best in Chrome</div>
        </div>

        {/* CENTER — 9:16 */}
        <div className="flex-1 flex flex-col bg-[#070b14] min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col items-center px-4 pt-4 pb-2">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <div className="px-3 py-1 rounded-full bg-slate-900 flex items-center gap-2 border border-slate-800"><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} /> LIVE 9:16</div>
            <div className="text-slate-500 font-mono">720×1280</div>
          </div>
          <div className="viewport">
            <div className="globe-container" ref={globeEl} />
            <button onClick={() => setSettings(s => ({ ...s, autoSpin: !s.autoSpin }))} title={settings.autoSpin ? 'Ferma rotazione' : 'Avvia rotazione'}
              className="absolute bottom-3 right-3 z-50 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 flex items-center justify-center text-white/90 hover:bg-black/75 transition-colors">
              {settings.autoSpin ? <Pause className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            </button>
            {isPickingLocation && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="text-center px-8"><MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: accent }} /><div className="text-white text-lg font-semibold">Clicca sul globo</div><div className="text-slate-400 mt-1 text-sm">Scegli la posizione della notizia</div></div>
              </div>
            )}
            {theme.showCards && currentNews && (
              <div className="card-slot" style={slotStyle}>
                <motion.div key={currentNews.id}
                initial={card.transitionType === 'none' ? { opacity: 1, y: 0, scale: 1 } : card.transitionType === 'fade' ? { opacity: 0, y: 0, scale: 1 } : card.transitionType === 'zoom' ? { opacity: 0, scale: 0.92, y: 0 } : { opacity: 0, y: 22, scale: 1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: (card.transitionMs || 350) / 1000, ease: [0.23, 1, 0.32, 1] }}
                  className="news-card" style={{
                    width: card.width, borderRadius: card.radius, textAlign: card.align,
                    background: hexA(card.bgColor, card.bgOpacity), backdropFilter: 'blur(6px)',
                    borderTop: `${card.borderWidth}px solid ${card.accentColor}`,
                  }}>
                  {currentNews.type !== 'info' && (card.fields.category || card.fields.date) && (
                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                      {card.fields.category ? <span className="tag" style={{ backgroundColor: getCategoryColor(currentNews.category) + '30', color: getCategoryColor(currentNews.category) }}>{currentNews.category.toUpperCase()}</span> : <span />}
                      {card.fields.date && <span className="text-[10px] text-slate-500 font-mono">{currentNews.date}</span>}
                    </div>
                  )}
                  <h3 style={{ color: card.titleColor, fontFamily: FONT_FAMILY[card.titleFont], fontSize: card.titleSize, fontWeight: 700 }}>{currentNews.title}</h3>
                  {(currentNews.type === 'info' || card.fields.body) && <p style={{ color: card.textColor, fontSize: card.textSize }} className="line-clamp-4">{currentNews.text}</p>}
                  {currentNews.type !== 'info' && (card.fields.nation || card.fields.source) && (
                    <div className="flex items-center justify-between text-[10px] pt-2.5 border-t border-white/10">
                      {card.fields.nation ? <span className="flex items-center gap-1 text-slate-400"><MapPin className="w-3 h-3" /> {currentNews.nation}</span> : <span />}
                      {card.fields.source && <span className="font-mono text-slate-500">{currentNews.source}</span>}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
            {isPlaying && news.length > 0 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1">
                {news.map((_, i) => <div key={i} className="h-1 rounded-full transition-all" style={{ width: i === currentIndex ? 18 : 6, background: i === currentIndex ? accent : 'rgba(255,255,255,0.3)' }} />)}
              </div>
            )}
          </div>
          </div>
          <Timeline news={news} currentIndex={currentIndex} settings={settings} accent={accent}
            onSelect={selectNews} onReorder={setNews} onAddInfo={openAddInfo} onAddNews={openAddModal}
            onSetDuration={setClipDuration} getCategoryColor={getCategoryColor} fmtSec={fmtSec} />
        </div>

        {/* RIGHT — tabbed controls */}
        <div className="w-80 border-l border-slate-800/80 bg-slate-950 flex flex-col">
          <div className="flex border-b border-slate-800/80">
            {[['preview', 'Anteprima', Play], ['planet', 'Pianeta', GlobeIcon], ['card', 'Card', Layers]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${tab === k ? 'text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`} style={tab === k ? { borderColor: accent, color: accent } : {}}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-6">
            {tab === 'preview' && (
              <>
                <button onClick={togglePlay} disabled={news.length === 0} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-black font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400" style={news.length === 0 ? {} : { background: accent }}>
                  {isPlaying ? <><Pause className="w-4 h-4" /> FERMA</> : <><Play className="w-4 h-4" /> AVVIA PREVIEW</>}
                </button>
                <div className="space-y-4 bg-slate-900 rounded-2xl p-4">
                  <Slider label="Durata per notizia" value={settings.holdMs} min={1500} max={6000} step={250} display={fmtSec(settings.holdMs)} onChange={(v) => setSettings(s => ({ ...s, holdMs: v }))} />
                  <Slider label="Velocità zoom-in" value={settings.flyMs} min={400} max={2500} step={100} display={fmtSec(settings.flyMs)} onChange={(v) => setSettings(s => ({ ...s, flyMs: v }))} />
                  <Slider label="Zoom camera" value={Math.round((2.0 - settings.altitude) * 100)} min={20} max={150} step={5} display={`${Math.round((2.0 - settings.altitude) * 100)}%`} onChange={(v) => setSettings(s => ({ ...s, altitude: 2.0 - v / 100 }))} />
                </div>
                <div className="space-y-4 bg-slate-900 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Punto di inizio render</div>
                    <button onClick={captureCurrentView} className="text-[10px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors" style={{ color: accent }}>
                      <MapPin className="w-3 h-3" /> Vista corrente
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-1">Lat</div>
                      <input type="number" step="0.01" value={settings.startLat} onChange={(e) => setSettings(s => ({ ...s, startLat: parseFloat(e.target.value) || 0 }))} className="inp text-xs font-mono" />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 mb-1">Lng</div>
                      <input type="number" step="0.01" value={settings.startLng} onChange={(e) => setSettings(s => ({ ...s, startLng: parseFloat(e.target.value) || 0 }))} className="inp text-xs font-mono" />
                    </div>
                  </div>
                  <Slider label="Altitudine inizio" value={Math.round(settings.startAlt * 100)} min={50} max={500} step={5} display={`${settings.startAlt.toFixed(2)}x`} onChange={(v) => setSettings(s => ({ ...s, startAlt: v / 100 }))} />
                  <Slider label="Pausa intro" value={settings.introMs} min={0} max={4000} step={200} display={settings.introMs === 0 ? 'Nessuna' : fmtSec(settings.introMs)} onChange={(v) => setSettings(s => ({ ...s, introMs: v }))} />
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Tipo outro</div>
                    <Seg value={settings.outroType} onChange={(v) => setSettings(s => ({ ...s, outroType: v }))} options={[{ v: 'none', label: 'Nessuno' }, { v: 'hold', label: 'Hold' }, { v: 'fade', label: 'Fade nero' }]} />
                  </div>
                  {settings.outroType !== 'none' && <Slider label="Durata outro" value={settings.outroMs} min={500} max={5000} step={250} display={fmtSec(settings.outroMs)} onChange={(v) => setSettings(s => ({ ...s, outroMs: v }))} />}
                </div>
                <Toggle wide active={theme.showCards} onClick={() => setTheme(t => ({ ...t, showCards: !t.showCards }))} icon={<Layers className="w-4 h-4" />} label={theme.showCards ? 'Card notizie: ON' : 'Solo punti (card OFF)'} accent={accent} />
                <div className="space-y-4 bg-slate-900 rounded-2xl p-4">
                  <Toggle wide active={settings.showClouds} onClick={() => setSettings(s => ({ ...s, showClouds: !s.showClouds }))} icon={<Cloud className="w-4 h-4" />} label={settings.showClouds ? 'Nuvole: ON' : 'Nuvole: OFF'} accent={accent} />
                  {settings.showClouds && <Slider label="Opacità nuvole" value={Math.round((settings.cloudOpacity ?? 0.25) * 100)} min={5} max={80} step={5} display={`${Math.round((settings.cloudOpacity ?? 0.25) * 100)}%`} onChange={(v) => setSettings(s => ({ ...s, cloudOpacity: v / 100 }))} />}
                  <Slider label="Drift satellite (fermo)" value={Math.round((settings.driftIntensity ?? 0) * 100)} min={0} max={100} step={5} display={settings.driftIntensity > 0 ? `${Math.round((settings.driftIntensity ?? 0) * 100)}%` : 'Off'} onChange={(v) => setSettings(s => ({ ...s, driftIntensity: v / 100 }))} />
                </div>
                <button onClick={resetCamera} className="w-full py-2.5 text-xs rounded-2xl border border-slate-800 hover:bg-slate-800 flex items-center justify-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> RESET CAMERA</button>
                <div>
                  <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3">Esporta</div>
                  <div className="space-y-2">
                    <button onClick={exportVideo} disabled={isExporting || news.length === 0} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-black font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400">{isExporting ? <>⏳ RENDERING…</> : <><Download className="w-4 h-4" /> {HQ_AVAILABLE ? 'VIDEO 4K (MP4)' : `VIDEO (${VIDEO_EXT})`}</>}</button>
                    <button onClick={exportPNG} disabled={!currentNews} className="w-full flex items-center justify-center gap-2 py-3 text-sm rounded-2xl border border-slate-800 hover:bg-slate-800 disabled:opacity-40"><ImageIcon className="w-4 h-4" /> COVER PNG</button>
                  </div>
                  <div className="mt-3 text-[10px] leading-snug text-slate-600">{HQ_AVAILABLE ? 'Render frame-by-frame fino a 4K (2160×3840) — fluido, non è una cattura schermo.' : 'WEBM via cattura schermo — converti su CloudConvert se serve.'}</div>
                </div>
              </>
            )}

            {tab === 'planet' && (
              <>
                <div>
                  <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-2">Vibe rapido</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(VIBES).map(([k, v]) => (
                      <button key={k} onClick={() => applyVibe(k)} className="py-2.5 rounded-xl text-xs border border-slate-800 hover:border-slate-600 flex items-center gap-2 px-3">
                        <span className="w-3 h-3 rounded-full" style={{ background: v.accent }} /> {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-2">Texture Terra</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(TEXTURES).map(([k, t]) => (
                      <button key={k} onClick={() => setTheme(th => ({ ...th, texture: k }))} className={`py-2.5 rounded-xl text-xs border transition-all ${theme.texture === k ? '' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`} style={theme.texture === k ? { borderColor: accent, background: accent + '1a', color: accent } : {}}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Grading colore pianeta</div>
                  <ColorRow label="Tinta overlay" value={theme.planetOverlayColor} onChange={(v) => setTheme(t => ({ ...t, planetOverlayColor: v }))} />
                  <Slider label="Intensità tinta" value={Math.round((theme.planetOverlayOpacity || 0) * 100)} min={0} max={70} step={5} display={`${Math.round((theme.planetOverlayOpacity || 0) * 100)}%`} onChange={(v) => setTheme(t => ({ ...t, planetOverlayOpacity: v / 100 }))} />
                  <ColorRow label="Bagliore emissivo" value={theme.planetEmissive} onChange={(v) => setTheme(t => ({ ...t, planetEmissive: v }))} />
                  <Slider label="Intensità bagliore" value={Math.round((theme.planetEmissiveInt || 0) * 100)} min={0} max={80} step={5} display={`${Math.round((theme.planetEmissiveInt || 0) * 100)}%`} onChange={(v) => setTheme(t => ({ ...t, planetEmissiveInt: v / 100 }))} />
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
                  <ColorRow label="Colore accento (atmosfera/pin/rotte)" value={theme.accent} onChange={(v) => setTheme(t => ({ ...t, accent: v }))} />
                  <Slider label="Intensità atmosfera" value={Math.round(theme.atmosphere * 100)} min={0} max={40} step={2} display={`${Math.round(theme.atmosphere * 100)}%`} onChange={(v) => setTheme(t => ({ ...t, atmosphere: v / 100 }))} />
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
                  <Toggle wide active={theme.showGrid} onClick={() => setTheme(t => ({ ...t, showGrid: !t.showGrid }))} icon={<Grid3x3 className="w-3.5 h-3.5" />} label="Griglia sul pianeta" accent={accent} />
                  {theme.showGrid && <>
                    <ColorRow label="Colore griglia" value={theme.gridColor} onChange={(v) => setTheme(t => ({ ...t, gridColor: v }))} />
                    <Slider label="Intensità griglia" value={Math.round(theme.gridOpacity * 100)} min={3} max={70} step={1} display={`${Math.round(theme.gridOpacity * 100)}%`} onChange={(v) => setTheme(t => ({ ...t, gridOpacity: v / 100 }))} />
                  </>}
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
                  <Toggle wide active={theme.showBorder} onClick={() => setTheme(t => ({ ...t, showBorder: !t.showBorder }))} icon={<MapPin className="w-3.5 h-3.5" />} label="Confini paese" accent={accent} />
                  {theme.showBorder && <>
                    <ColorRow label="Colore confine" value={theme.borderColor} onChange={(v) => setTheme(t => ({ ...t, borderColor: v }))} />
                    <Slider label="Intensità confine" value={Math.round(theme.borderOpacity * 100)} min={10} max={100} step={5} display={`${Math.round(theme.borderOpacity * 100)}%`} onChange={(v) => setTheme(t => ({ ...t, borderOpacity: v / 100 }))} />
                  </>}
                </div>
                <Toggle wide active={theme.showRoutes} onClick={() => setTheme(t => ({ ...t, showRoutes: !t.showRoutes }))} icon={<Route className="w-3.5 h-3.5" />} label="Rotte tra le notizie" accent={accent} />
              </>
            )}

            {tab === 'card' && (
              <>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Animazione entrata</div>
                    <Seg value={card.transitionType} onChange={(v) => setCard({ transitionType: v })} options={[{ v: 'none', label: 'Istantanea' }, { v: 'fade', label: 'Fade' }, { v: 'slide', label: 'Slide' }, { v: 'zoom', label: 'Zoom' }]} />
                  </div>
                  {card.transitionType !== 'none' && <Slider label="Durata animazione" value={card.transitionMs} min={100} max={900} step={50} display={`${card.transitionMs}ms`} onChange={(v) => setCard({ transitionMs: v })} />}
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-2">Posizione</div>
                  <Seg value={card.position} onChange={(v) => setCard({ position: v })} options={[{ v: 'top', label: 'Alto' }, { v: 'center', label: 'Centro' }, { v: 'bottom', label: 'Basso' }]} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-2">Allineamento testo</div>
                  <Seg value={card.align} onChange={(v) => setCard({ align: v })} options={[{ v: 'left', label: 'Sinistra' }, { v: 'center', label: 'Centro' }]} />
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
                  <Slider label="Larghezza" value={card.width} min={220} max={340} step={4} display={`${card.width}px`} onChange={(v) => setCard({ width: v })} />
                  <Slider label="Arrotondamento" value={card.radius} min={0} max={28} step={1} display={`${card.radius}px`} onChange={(v) => setCard({ radius: v })} />
                  <Slider label="Opacità sfondo" value={Math.round(card.bgOpacity * 100)} min={20} max={100} step={5} display={`${Math.round(card.bgOpacity * 100)}%`} onChange={(v) => setCard({ bgOpacity: v / 100 })} />
                  <Slider label="Bordo accento" value={card.borderWidth} min={0} max={8} step={1} display={`${card.borderWidth}px`} onChange={(v) => setCard({ borderWidth: v })} />
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1.5">Font titolo</div>
                    <select value={card.titleFont} onChange={(e) => setCard({ titleFont: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none">
                      <option value="Playfair Display">Playfair — Editoriale</option>
                      <option value="Space Grotesk">Space Grotesk — Tech</option>
                      <option value="Inter">Inter — Neutro</option>
                    </select>
                  </div>
                  <Slider label="Dimensione titolo" value={card.titleSize} min={12} max={24} step={1} display={`${card.titleSize}px`} onChange={(v) => setCard({ titleSize: v })} />
                  <Slider label="Dimensione testo" value={Math.round(card.textSize)} min={10} max={18} step={1} display={`${Math.round(card.textSize)}px`} onChange={(v) => setCard({ textSize: v })} />
                </div>
                <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
                  <ColorRow label="Colore titolo" value={card.titleColor} onChange={(v) => setCard({ titleColor: v })} />
                  <ColorRow label="Colore testo" value={card.textColor} onChange={(v) => setCard({ textColor: v })} />
                  <ColorRow label="Colore sfondo" value={card.bgColor} onChange={(v) => setCard({ bgColor: v })} />
                  <ColorRow label="Colore bordo accento" value={card.accentColor} onChange={(v) => setCard({ accentColor: v })} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 mb-2">Campi visibili</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['category', 'Categoria'], ['date', 'Data'], ['body', 'Testo'], ['nation', 'Nazione'], ['source', 'Fonte']].map(([k, label]) => (
                      <Toggle key={k} active={card.fields[k]} onClick={() => setField(k, !card.fields[k])} label={label} accent={accent} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6" onClick={closeModal}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="modal w-full max-w-lg bg-slate-900 rounded-2xl overflow-hidden border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="flex items-center justify-between mb-5"><div className="text-xl font-semibold">{editingNews ? 'Modifica' : 'Nuova'} {formData.type === 'info' ? 'Card Info' : 'Notizia'}</div><button onClick={closeModal} className="text-slate-400 hover:text-white">✕</button></div>
              {formError && <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-950/60 border border-red-800/50 text-red-400 text-sm">{formError}</div>}
              <div className="space-y-4">
                <Field label="Titolo"><input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Es: Accordo commerciale UE-ASEAN" className="inp" /></Field>
                <Field label="Descrizione breve"><textarea value={formData.text} onChange={(e) => setFormData({ ...formData, text: e.target.value })} rows={3} placeholder="Riassunto conciso..." className="inp resize-y min-h-[72px]" /></Field>
                {formData.type !== 'info' && <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Categoria"><select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="inp">{CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
                  <Field label="Data"><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="inp" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Paese</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={countryQuery}
                        onChange={(e) => {
                          const q = e.target.value;
                          setCountryQuery(q);
                          setCountrySuggestions(q.length >= 2 ? searchCountries(q) : []);
                          setFormData(prev => ({ ...prev, nation: q }));
                        }}
                        placeholder="Es: Italia, France…"
                        className="inp w-full"
                        autoComplete="off"
                      />
                      {countrySuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden z-50 shadow-xl">
                          {countrySuggestions.map((c) => (
                            <button key={c.name} type="button"
                              onClick={() => {
                                setCountryQuery(c.name);
                                setCountrySuggestions([]);
                                setFormData(prev => ({ ...prev, nation: c.name, lat: c.lat, lng: c.lng }));
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex items-center justify-between">
                              <span>{c.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{c.lat.toFixed(1)}, {c.lng.toFixed(1)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <Field label="Fonte"><input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} placeholder="Reuters" className="inp" /></Field>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="text-xs text-slate-400">Coordinate geografiche</label><button type="button" onClick={() => setIsPickingLocation(true)} className="text-xs flex items-center gap-1" style={{ color: accent }}><MapPin className="w-3.5 h-3.5" /> Seleziona sul globo</button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="0.0001" value={formData.lat ?? ''} onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })} className="inp font-mono" placeholder="Lat" />
                    <input type="number" step="0.0001" value={formData.lng ?? ''} onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })} className="inp font-mono" placeholder="Lng" />
                  </div>
                </div>
                </>}
                {formData.type === 'info' && <div className="text-[11px] text-slate-500 bg-slate-800/40 rounded-xl px-4 py-3">Le card info non si spostano sul globo: la camera resta ferma sulla posizione precedente. Stile e font si regolano dalla tab <span className="text-slate-300">Card</span>.</div>}
              </div>
            </div>
            <div className="bg-slate-950 px-7 py-4 flex gap-3 border-t border-slate-700">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-900 text-sm">Annulla</button>
              <button onClick={saveNews} className="flex-1 py-2.5 rounded-xl text-black font-semibold text-sm" style={{ background: accent }}>{editingNews ? 'AGGIORNA' : 'AGGIUNGI'}</button>
            </div>
          </motion.div>
        </div>
      )}

      {isExporting && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center">
          <div className="text-center w-72">
            <div className="mx-auto w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6" style={{ borderColor: accent, borderTopColor: 'transparent' }} />
            <div className="text-2xl font-semibold mb-2">Rendering Reel…</div>
            {exportPct > 0 ? (
              <>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-2"><div className="h-full rounded-full transition-all" style={{ width: `${exportPct}%`, background: accent }} /></div>
                <div className="text-slate-400 text-sm font-mono">{exportPct}% • rendering frame-by-frame</div>
              </>
            ) : <div className="text-slate-400 text-sm">Non chiudere la finestra</div>}
          </div>
        </div>
      )}

      {toast && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-2.5 rounded-full text-sm font-medium text-white pointer-events-none ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>{toast.message}</motion.div>}

      {confirmDialog && (
        <div className="fixed inset-0 bg-black/80 z-[250] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-900 rounded-2xl border border-slate-700 p-7 max-w-sm w-full">
            <p className="text-slate-200 text-sm mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm">Annulla</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold">Conferma</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Timeline({ news, currentIndex, settings, accent, onSelect, onReorder, onAddInfo, onAddNews, onSetDuration, getCategoryColor, fmtSec }) {
  const sel = news[currentIndex] || null;
  const clipMs = (n) => n?.duration || settings.holdMs;
  const totalMs = settings.introMs + news.reduce((a, n) => a + clipMs(n), 0) + (settings.outroType !== 'none' ? settings.outroMs : 0);
  const widthFor = (n) => Math.max(64, Math.min(170, 64 + (clipMs(n) / 1000) * 26));
  return (
    <div className="border-t border-slate-800/80 bg-slate-950/80 backdrop-blur px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
          <Route className="w-3.5 h-3.5" /> Percorso reel
          <span className="text-slate-600 normal-case font-mono lowercase">· {fmtSec(totalMs)} totali</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAddNews} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px]" style={{ color: accent }}><MapPin className="w-3 h-3" /> Notizia</button>
          <button onClick={onAddInfo} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"><Type className="w-3 h-3" /> Info</button>
        </div>
      </div>

      {sel && (
        <div className="flex items-center gap-3 mb-2.5 px-1">
          <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 flex-shrink-0">Durata clip</span>
          <input type="range" min={1000} max={8000} step={250} value={clipMs(sel)} onChange={(e) => onSetDuration(sel.id, Number(e.target.value))} className="flex-1" />
          <input
            type="number" min={1} max={30} step={0.1}
            value={(clipMs(sel) / 1000).toFixed(1)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) onSetDuration(sel.id, Math.round(v * 1000));
            }}
            className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 text-right focus:outline-none focus:border-slate-500 flex-shrink-0"
          />
          <span className="text-[10px] text-slate-500 flex-shrink-0">s</span>
          {sel.duration && <button onClick={() => onSetDuration(sel.id, undefined)} className="text-[10px] text-slate-500 hover:text-slate-300 flex-shrink-0">auto</button>}
        </div>
      )}

      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        <div className="flex flex-col items-center justify-center px-2.5 rounded-lg bg-slate-900 border border-slate-800 flex-shrink-0">
          <div className="text-[8px] uppercase tracking-wider text-slate-500">Start</div>
          <div className="text-[10px] font-mono text-slate-300">{settings.startLat.toFixed(0)},{settings.startLng.toFixed(0)}</div>
          {settings.introMs > 0 && <div className="text-[8px] text-slate-600">+{fmtSec(settings.introMs)}</div>}
        </div>
        <Reorder.Group axis="x" values={news} onReorder={onReorder} className="flex items-stretch gap-1.5">
          {news.map((item, index) => {
            const isInfo = item.type === 'info';
            const active = index === currentIndex;
            const col = isInfo ? '#64748b' : getCategoryColor(item.category);
            return (
              <Reorder.Item key={item.id} value={item} whileDrag={{ scale: 1.04 }}
                onClick={() => onSelect(index)}
                style={{ width: widthFor(item) }}
                className={`relative flex flex-col justify-between p-2 rounded-lg cursor-grab active:cursor-grabbing border flex-shrink-0 transition-colors ${active ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 hover:bg-slate-800 border-slate-800'}`}>
                <div className="absolute inset-0 rounded-lg pointer-events-none" style={active ? { boxShadow: `inset 0 0 0 1.5px ${accent}` } : {}} />
                <div className="flex items-center gap-1.5">
                  {isInfo ? <Type className="w-2.5 h-2.5 flex-shrink-0" style={{ color: col }} /> : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col }} />}
                  <span className="text-[9px] font-mono text-slate-500">{index + 1}</span>
                </div>
                <div className="text-[10px] leading-tight text-slate-200 line-clamp-2 mt-1">{item.title}</div>
                <div className="text-[8px] font-mono text-slate-500 mt-1">{fmtSec(clipMs(item))}</div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <div className="flex flex-col items-center justify-center px-2.5 rounded-lg bg-slate-900 border border-slate-800 flex-shrink-0">
          <div className="text-[8px] uppercase tracking-wider text-slate-500">End</div>
          <div className="text-[10px] text-slate-400">{settings.outroType === 'fade' ? 'Fade' : settings.outroType === 'hold' ? 'Hold' : '—'}</div>
          {settings.outroType !== 'none' && <div className="text-[8px] text-slate-600">+{fmtSec(settings.outroMs)}</div>}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2"><span className="text-[11px] text-slate-400">{label}</span><span className="text-[11px] font-mono text-slate-300">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
function Toggle({ active, onClick, icon, label, accent, wide }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs border transition-all ${wide ? 'w-full' : ''} ${active ? '' : 'border-slate-800 text-slate-500'}`} style={active ? { borderColor: accent, background: accent + '1a', color: accent } : {}}>
      {icon} {label}
    </button>
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
      {options.map(o => <button key={o.v} onClick={() => onChange(o.v)} className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${value === o.v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{o.label}</button>)}
    </div>
  );
}
function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-slate-400 flex-1">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 p-0.5 flex-shrink-0" />
    </div>
  );
}
function Field({ label, children }) {
  return <div><label className="text-xs text-slate-400 block mb-1.5">{label}</label>{children}</div>;
}

export default App;

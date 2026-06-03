import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, Reorder } from 'framer-motion';
import {
  Play, Pause, Download, Image as ImageIcon, Plus, Trash2, Edit2,
  MapPin, RotateCcw, Globe as GlobeIcon, Route, Grid3x3, Layers
} from 'lucide-react';

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
  'topology': { label: 'Rilievo', url: '/textures/earth-topology.png' },
};
const BG_URL = '/textures/night-sky.png';
const BUMP_URL = '/textures/earth-topology.png';

// Quick "vibe" presets: set texture + accent + grid/border colors together
const VIBES = {
  warroom: { label: 'War Room', texture: 'night', accent: '#ff3b3b', grid: '#ff6b6b' },
  ocean: { label: 'Oceano', texture: 'blue-marble', accent: '#0ea5e9', grid: '#7dd3fc' },
  amber: { label: 'Notte', texture: 'night', accent: '#f59e0b', grid: '#fbbf24' },
  relief: { label: 'Rilievo', texture: 'topology', accent: '#22d3ee', grid: '#67e8f9' },
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
  planetTint: '#ffffff',
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
    fields: { category: true, date: true, body: true, nation: true, source: true },
  },
};

const SAMPLE_NEWS = [
  { id: 1, title: "Tensioni al confine ucraino: nuove manovre militari", text: "La Russia intensifica le esercitazioni vicino al confine. L'UE chiede de-escalation immediata.", category: "Conflitto", date: "2026-05-28", source: "Reuters", nation: "Ucraina", lat: 50.4501, lng: 30.5234 },
  { id: 2, title: "Vertice G7 su Taiwan: Pechino risponde con manovre navali", text: "I leader del G7 ribadiscono il sostegno a Taipei. La Cina annuncia esercitazioni nello stretto.", category: "Politica", date: "2026-05-27", source: "Bloomberg", nation: "Taiwan", lat: 25.0330, lng: 121.5654 },
  { id: 3, title: "Crisi petrolifera: Brent oltre i 92$ al barile", text: "L'OPEC+ riduce la produzione. I mercati asiatici reagiscono con forti oscillazioni.", category: "Economia", date: "2026-05-29", source: "Financial Times", nation: "Arabia Saudita", lat: 24.7136, lng: 46.6753 },
  { id: 4, title: "Accordo storico sul clima: 190 nazioni firmano il patto", text: "Al vertice di Nairobi si raggiunge l'intesa per ridurre le emissioni del 45% entro il 2035.", category: "Clima", date: "2026-05-30", source: "The Guardian", nation: "Kenya", lat: -1.2921, lng: 36.8219 },
];

// Module-scope helpers (out of render for purity)
const newId = () => Date.now();
const fileStamp = () => Date.now();
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
    const defaults = { holdMs: 3000, flyMs: 1200, altitude: 0.9, startLat: 20, startLng: 10, startAlt: 2.4, introMs: 800 };
    try { const s = localStorage.getItem('georeel-settings-v1'); if (s) return { ...defaults, ...JSON.parse(s) }; } catch { /* ignore */ }
    return defaults;
  });
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formError, setFormError] = useState('');

  const globeEl = useRef(null);
  const globeInstance = useRef(null);
  const gridRef = useRef(null);

  const pickingRef = useRef(false);
  const newsRef = useRef(news);
  const settingsRef = useRef(settings);
  const themeRef = useRef(theme);
  const currentNewsRef = useRef(news[0] || null);
  const playState = useRef({ playing: false, slideTimer: null, zoomTimer: null });

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
  // Cinematic zoom-in: approach pulled-back, then dolly in
  const cinematicTo = (item) => {
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
    try { globe.renderer().setPixelRatio(2); } catch { /* ignore */ }
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;

    const grid = buildGraticule(th.gridColor, th.gridOpacity);
    grid.visible = th.showGrid;
    globe.scene().add(grid);
    gridRef.current = grid;

    try {
      const mat = globe.globeMaterial();
      if (mat) {
        mat.color.set(th.planetTint || '#ffffff');
        if (mat.emissive) { mat.emissive.set(th.planetEmissive || '#000000'); mat.emissiveIntensity = th.planetEmissiveInt ?? 0; }
      }
    } catch { /* ignore */ }

    return () => {
      try { globe._destructor && globe._destructor(); } catch { /* ignore */ }
      if (globeEl.current) globeEl.current.innerHTML = '';
      globeInstance.current = null;
      gridRef.current = null;
    };
  }, []);

  // Texture
  useEffect(() => { globeInstance.current?.globeImageUrl(TEXTURES[theme.texture].url); }, [theme.texture]);
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

  // Points + active highlight
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    g.pointsData(news.map((item, idx) => ({ ...item, color: CATEGORY_COLORS[item.category] || '#64748b', __r: idx === currentIndex ? 0.75 : 0.4 })))
     .pointRadius(d => d.__r);
  }, [news, currentIndex]);

  // Radar ring
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    g.ringsData(item ? [{ lat: item.lat, lng: item.lng }] : []);
  }, [news, currentIndex]);

  // Route arcs
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    if (!theme.showRoutes || news.length < 2) { g.arcsData([]); return; }
    g.arcColor(() => theme.accent).arcsData(news.map((n, i) => {
      const next = news[(i + 1) % news.length];
      return { startLat: n.lat, startLng: n.lng, endLat: next.lat, endLng: next.lng };
    }));
  }, [news, theme.showRoutes, theme.accent]);

  // Country border
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    const country = (theme.showBorder && item) ? findCountry(item.lat, item.lng) : null;
    if (country) {
      g.polygonsData([country]).polygonAltitude(0.006)
       .polygonCapColor(() => hexA(theme.borderColor, theme.borderOpacity * 0.28))
       .polygonSideColor(() => 'rgba(0,0,0,0)')
       .polygonStrokeColor(() => hexA(theme.borderColor, theme.borderOpacity))
       .polygonsTransitionDuration(400);
    } else g.polygonsData([]);
  }, [news, currentIndex, theme.showBorder, theme.borderColor, theme.borderOpacity]);

  // Planet color grading
  useEffect(() => {
    const mat = globeInstance.current?.globeMaterial();
    if (!mat) return;
    mat.color.set(theme.planetTint || '#ffffff');
    if (mat.emissive) { mat.emissive.set(theme.planetEmissive || '#000000'); mat.emissiveIntensity = theme.planetEmissiveInt ?? 0; }
  }, [theme.planetTint, theme.planetEmissive, theme.planetEmissiveInt]);

  useEffect(() => () => { clearTimeout(playState.current.slideTimer); clearTimeout(playState.current.zoomTimer); }, []);

  const getCategoryColor = (c) => CATEGORY_COLORS[c] || '#64748b';

  const playStep = (i) => {
    const list = newsRef.current;
    if (!list.length) { stopPreview(); return; }
    const idx = ((i % list.length) + list.length) % list.length;
    setCurrentIndex(idx);
    cinematicTo(list[idx]);
    playState.current.slideTimer = setTimeout(() => { if (playState.current.playing) playStep(idx + 1); }, settingsRef.current.holdMs);
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
    playState.current = { playing: false, slideTimer: null, zoomTimer: null };
    setIsPlaying(false);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = true;
  };
  const togglePlay = () => (isPlaying ? stopPreview() : startPreview());
  const selectNews = (index) => { setCurrentIndex(index); cinematicTo(news[index]); };

  // CRUD
  const openAddModal = () => {
    setEditingNews(null); setFormError('');
    setFormData({ title: '', text: '', category: 'Conflitto', date: todayISO(), source: '', nation: '', lat: 41.9028, lng: 12.4964 });
    setShowModal(true); setIsPickingLocation(false);
  };
  const openEditModal = (item) => { setEditingNews(item); setFormError(''); setFormData({ ...item }); setShowModal(true); setIsPickingLocation(false); };
  const closeModal = () => { setShowModal(false); setFormError(''); setIsPickingLocation(false); };
  const saveNews = () => {
    if (!formData.title.trim() || !formData.text.trim()) { setFormError('Titolo e descrizione sono obbligatori'); return; }
    const item = { ...formData, id: editingNews ? editingNews.id : newId(), lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) };
    setNews(prev => editingNews ? prev.map(n => n.id === editingNews.id ? item : n) : [...prev, item]);
    closeModal();
  };
  const deleteNews = (id) => showConfirm('Eliminare questa notizia?', () => {
    setNews(prev => { const f = prev.filter(n => n.id !== id); if (currentIndex >= f.length) setCurrentIndex(Math.max(0, f.length - 1)); return f; });
  });
  const loadSampleData = () => showConfirm('Caricare i dati di esempio? (sostituisce le notizie attuali)', () => { setNews(SAMPLE_NEWS); setCurrentIndex(0); });
  const resetCamera = () => {
    stopPreview();
    globeInstance.current?.pointOfView({ lat: 20, lng: 10, altitude: 2.4 }, 1000);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = true;
    setCurrentIndex(0);
  };
  const captureCurrentView = () => {
    const pov = globeInstance.current?.pointOfView();
    if (!pov) { showToast('Globo non pronto', 'error'); return; }
    setSettings(s => ({ ...s, startLat: parseFloat(pov.lat.toFixed(4)), startLng: parseFloat(pov.lng.toFixed(4)), startAlt: parseFloat(pov.altitude.toFixed(3)) }));
    showToast('Punto di inizio aggiornato');
  };

  // ---------- Draw card on 2D canvas (matches DOM, for export) ----------
  const drawCard = (ctx, s, item) => {
    if (!item || !themeRef.current.showCards) return;
    const c = themeRef.current.card;
    const f = c.fields;
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

  const exportVideo = () => {
    const g = getGlobeCanvas();
    if (!g || !g.captureStream) { showToast('Cattura video non supportata dal browser', 'error'); return; }
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : null;
    if (!mimeType) { showToast('Formato video non supportato', 'error'); return; }
    const W = g.width, H = g.height, s = W / 360;
    const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');
    let raf;
    const loop = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(g, 0, 0, W, H); drawCard(ctx, s, currentNewsRef.current); raf = requestAnimationFrame(loop); };
    const stream = comp.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `GeoReel_${new Date().toISOString().slice(0, 10)}.webm`; a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false); stopPreview();
    };
    stopPreview();
    const st = settingsRef.current;
    if (globeInstance.current) {
      globeInstance.current.controls().autoRotate = false;
      globeInstance.current.pointOfView({ lat: st.startLat, lng: st.startLng, altitude: st.startAlt }, 0);
    }
    currentNewsRef.current = newsRef.current[0] || null;
    setCurrentIndex(0);
    setIsExporting(true);
    requestAnimationFrame(() => {
      loop(); rec.start();
      setTimeout(() => { startPreview(); }, st.introMs);
      const totalMs = st.introMs + newsRef.current.length * st.holdMs + 800;
      setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, totalMs);
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
        <div className="flex-1 flex flex-col items-center justify-center bg-[#070b14] p-6">
          <div className="mb-4 flex items-center gap-2 text-xs">
            <div className="px-3 py-1 rounded-full bg-slate-900 flex items-center gap-2 border border-slate-800"><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} /> LIVE 9:16</div>
            <div className="text-slate-500 font-mono">720×1280</div>
          </div>
          <div className="viewport">
            <div className="globe-container" ref={globeEl} />
            {isPickingLocation && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="text-center px-8"><MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: accent }} /><div className="text-white text-lg font-semibold">Clicca sul globo</div><div className="text-slate-400 mt-1 text-sm">Scegli la posizione della notizia</div></div>
              </div>
            )}
            {theme.showCards && currentNews && (
              <div className="card-slot" style={slotStyle}>
                <motion.div key={currentNews.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="news-card" style={{
                    width: card.width, borderRadius: card.radius, textAlign: card.align,
                    background: hexA(card.bgColor, card.bgOpacity), backdropFilter: 'blur(6px)',
                    borderTop: `${card.borderWidth}px solid ${card.accentColor}`,
                  }}>
                  {(card.fields.category || card.fields.date) && (
                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                      {card.fields.category ? <span className="tag" style={{ backgroundColor: getCategoryColor(currentNews.category) + '30', color: getCategoryColor(currentNews.category) }}>{currentNews.category.toUpperCase()}</span> : <span />}
                      {card.fields.date && <span className="text-[10px] text-slate-500 font-mono">{currentNews.date}</span>}
                    </div>
                  )}
                  <h3 style={{ color: card.titleColor, fontFamily: FONT_FAMILY[card.titleFont], fontSize: card.titleSize, fontWeight: 700 }}>{currentNews.title}</h3>
                  {card.fields.body && <p style={{ color: card.textColor, fontSize: card.textSize }} className="line-clamp-4">{currentNews.text}</p>}
                  {(card.fields.nation || card.fields.source) && (
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
          <div className="mt-3 text-[10px] text-slate-600">Clicca i pin • trascina per riordinare</div>
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
                </div>
                <Toggle wide active={theme.showCards} onClick={() => setTheme(t => ({ ...t, showCards: !t.showCards }))} icon={<Layers className="w-4 h-4" />} label={theme.showCards ? 'Card notizie: ON' : 'Solo punti (card OFF)'} accent={accent} />
                <button onClick={resetCamera} className="w-full py-2.5 text-xs rounded-2xl border border-slate-800 hover:bg-slate-800 flex items-center justify-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> RESET CAMERA</button>
                <div>
                  <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3">Esporta</div>
                  <div className="space-y-2">
                    <button onClick={exportVideo} disabled={isExporting || news.length === 0} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-black font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400">{isExporting ? <>⏳ REGISTRAZIONE...</> : <><Download className="w-4 h-4" /> VIDEO REEL (WEBM)</>}</button>
                    <button onClick={exportPNG} disabled={!currentNews} className="w-full flex items-center justify-center gap-2 py-3 text-sm rounded-2xl border border-slate-800 hover:bg-slate-800 disabled:opacity-40"><ImageIcon className="w-4 h-4" /> COVER PNG</button>
                  </div>
                  <div className="mt-3 text-[10px] leading-snug text-slate-600">Il testo della card viene impresso nel video. Converti in MP4 con CloudConvert se serve.</div>
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
                  <ColorRow label="Tinta (moltiplica texture)" value={theme.planetTint} onChange={(v) => setTheme(t => ({ ...t, planetTint: v }))} />
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
              <div className="flex items-center justify-between mb-5"><div className="text-xl font-semibold">{editingNews ? 'Modifica Notizia' : 'Nuova Notizia'}</div><button onClick={closeModal} className="text-slate-400 hover:text-white">✕</button></div>
              {formError && <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-950/60 border border-red-800/50 text-red-400 text-sm">{formError}</div>}
              <div className="space-y-4">
                <Field label="Titolo"><input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Es: Accordo commerciale UE-ASEAN" className="inp" /></Field>
                <Field label="Descrizione breve"><textarea value={formData.text} onChange={(e) => setFormData({ ...formData, text: e.target.value })} rows={3} placeholder="Riassunto conciso..." className="inp resize-y min-h-[72px]" /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Categoria"><select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="inp">{CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
                  <Field label="Data"><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="inp" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nazione / Regione"><input type="text" value={formData.nation} onChange={(e) => setFormData({ ...formData, nation: e.target.value })} placeholder="Ucraina" className="inp" /></Field>
                  <Field label="Fonte"><input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} placeholder="Reuters" className="inp" /></Field>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="text-xs text-slate-400">Posizione geografica</label><button type="button" onClick={() => setIsPickingLocation(true)} className="text-xs flex items-center gap-1" style={{ color: accent }}><MapPin className="w-3.5 h-3.5" /> Seleziona sul globo</button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="0.0001" value={formData.lat} onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })} className="inp font-mono" placeholder="Lat" />
                    <input type="number" step="0.0001" value={formData.lng} onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })} className="inp font-mono" placeholder="Lng" />
                  </div>
                </div>
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
          <div className="text-center"><div className="mx-auto w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6" style={{ borderColor: accent, borderTopColor: 'transparent' }} /><div className="text-2xl font-semibold mb-2">Registrazione Reel...</div><div className="text-slate-400 text-sm">Non chiudere • ~{Math.ceil(news.length * settings.holdMs / 1000)}s</div></div>
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

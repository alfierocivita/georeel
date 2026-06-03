import { useState, useRef, useEffect } from 'react';
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, Reorder } from 'framer-motion';
import {
  Play, Pause, Download, Image as ImageIcon, Plus, Trash2, Edit2,
  MapPin, RotateCcw, Settings, Globe as GlobeIcon, Route, Grid3x3
} from 'lucide-react';

const CATEGORY_COLORS = {
  'Economia': '#22c55e',
  'Conflitto': '#ef4444',
  'Politica': '#a855f7',
  'Clima': '#14b8a6',
  'Tecnologia': '#3b82f6',
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);

// War-room style presets for the planet
const IMG = '//unpkg.com/three-globe/example/img/';
const GLOBE_PRESETS = {
  tactical: {
    label: 'War Room',
    globeImageUrl: IMG + 'earth-dark.jpg',
    bg: IMG + 'night-sky.png',
    atmosphere: '#ff3b3b',
    ring: '255,59,59',
    accent: '#ff3b3b',
  },
  hologram: {
    label: 'Hologram',
    globeImageUrl: IMG + 'earth-dark.jpg',
    bg: IMG + 'night-sky.png',
    atmosphere: '#22d3ee',
    ring: '34,211,238',
    accent: '#22d3ee',
  },
  night: {
    label: 'Night Ops',
    globeImageUrl: IMG + 'earth-night.jpg',
    bg: IMG + 'night-sky.png',
    atmosphere: '#f59e0b',
    ring: '245,158,11',
    accent: '#f59e0b',
  },
  classic: {
    label: 'Blue Marble',
    globeImageUrl: IMG + 'earth-blue-marble.jpg',
    bg: IMG + 'night-sky.png',
    atmosphere: '#60a5fa',
    ring: '96,165,250',
    accent: '#0ea5e9',
  },
};

const SAMPLE_NEWS = [
  { id: 1, title: "Tensioni al confine ucraino: nuove manovre militari", text: "La Russia intensifica le esercitazioni vicino al confine. L'UE chiede de-escalation immediata.", category: "Conflitto", date: "2026-05-28", source: "Reuters", nation: "Ucraina", lat: 50.4501, lng: 30.5234 },
  { id: 2, title: "Vertice G7 su Taiwan: Pechino risponde con manovre navali", text: "I leader del G7 ribadiscono il sostegno a Taipei. La Cina annuncia esercitazioni nello stretto.", category: "Politica", date: "2026-05-27", source: "Bloomberg", nation: "Taiwan", lat: 25.0330, lng: 121.5654 },
  { id: 3, title: "Crisi petrolifera: Brent oltre i 92$ al barile", text: "L'OPEC+ riduce la produzione. I mercati asiatici reagiscono con forti oscillazioni.", category: "Economia", date: "2026-05-29", source: "Financial Times", nation: "Arabia Saudita", lat: 24.7136, lng: 46.6753 },
  { id: 4, title: "Accordo storico sul clima: 190 nazioni firmano il patto", text: "Al vertice di Nairobi si raggiunge l'intesa per ridurre le emissioni del 45% entro il 2035.", category: "Clima", date: "2026-05-30", source: "The Guardian", nation: "Kenya", lat: -1.2921, lng: 36.8219 },
];

const FONT_FAMILY = {
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'Space Grotesk': "'Space Grotesk', system-ui, sans-serif",
  'Inter': "Inter, system-ui, sans-serif",
};

// Module-scope side-effecting helpers (kept out of render for purity)
const newId = () => Date.now();
const fileStamp = () => Date.now();
const todayISO = () => new Date().toISOString().split('T')[0];

// ---------- Canvas helpers (used for both PNG + video export) ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = (text || '').split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines >= maxLines) {
        let trimmed = line;
        while (ctx.measureText(trimmed + '…').width > maxW && trimmed.length) trimmed = trimmed.slice(0, -1);
        ctx.fillText(trimmed + '…', x, y);
        return y + lh;
      }
      ctx.fillText(line, x, y);
      line = words[i];
      y += lh;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
  return y + lh;
}

// ---------- Country border highlight ----------
const COUNTRY_FEATURES = feature(countriesTopo, countriesTopo.objects.countries).features;

function pointInPoly(lng, lat, geometry) {
  if (!geometry) return false;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polys.some(([outer]) => {
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i], [xj, yj] = outer[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  });
}

function findCountry(lat, lng) {
  return COUNTRY_FEATURES.find(f => pointInPoly(lng, lat, f.geometry)) ?? null;
}

function App() {
  const [news, setNews] = useState(() => {
    try {
      const saved = localStorage.getItem('georeel-news');
      return saved ? JSON.parse(saved) : SAMPLE_NEWS;
    } catch { return SAMPLE_NEWS; }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  const [isPickingLocation, _setIsPickingLocation] = useState(false);
  const [formData, setFormData] = useState({
    title: '', text: '', category: 'Conflitto', date: '', source: '', nation: '', lat: 41.9, lng: 12.5,
  });

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('georeel-theme');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {
      preset: 'tactical',
      cardBg: '#0b1220',
      titleColor: '#f8fafc',
      textColor: '#94a3b8',
      titleFont: 'Playfair Display',
      showGrid: true,
      showRoutes: true,
    };
  });

  const [settings, setSettings] = useState({
    holdMs: 3000,   // tempo di permanenza per notizia
    flyMs: 1200,    // durata movimento camera
    altitude: 0.9,  // quota (più basso = più vicino)
  });

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formError, setFormError] = useState('');

  const globeEl = useRef(null);
  const globeInstance = useRef(null);

  // Live refs to avoid stale closures inside the globe / animation loop
  const pickingRef = useRef(false);
  const newsRef = useRef(news);
  const settingsRef = useRef(settings);
  const themeRef = useRef(theme);
  const currentNewsRef = useRef(news[0] || null);
  const playState = useRef({ playing: false, timer: null });

  useEffect(() => { newsRef.current = news; }, [news]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { currentNewsRef.current = news[currentIndex] || null; }, [news, currentIndex]);

  const accent = GLOBE_PRESETS[theme.preset].accent;

  const setIsPickingLocation = (v) => { pickingRef.current = v; _setIsPickingLocation(v); };
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2100);
  };
  const showConfirm = (message, onConfirm) => setConfirmDialog({ message, onConfirm });

  // Persist
  useEffect(() => { try { localStorage.setItem('georeel-news', JSON.stringify(news)); } catch { /* ignore */ } }, [news]);
  useEffect(() => { try { localStorage.setItem('georeel-theme', JSON.stringify(theme)); } catch { /* ignore */ } }, [theme]);

  // ---------- Globe init ----------
  useEffect(() => {
    if (!globeEl.current || globeInstance.current) return;
    const preset = GLOBE_PRESETS[theme.preset];

    const globe = Globe({ rendererConfig: { preserveDrawingBuffer: true, antialias: true } })(globeEl.current)
      .width(360)
      .height(640)
      .globeImageUrl(preset.globeImageUrl)
      .bumpImageUrl(IMG + 'earth-topology.png')
      .backgroundImageUrl(preset.bg)
      .atmosphereColor(preset.atmosphere)
      .atmosphereAltitude(0.16)
      .showGraticules(theme.showGrid)
      .showAtmosphere(true)
      .pointOfView({ lat: 20, lng: 10, altitude: 2.4 }, 0)
      .pointAltitude(0.01)
      .pointRadius(0.45)
      .pointColor(d => d.color)
      .pointsTransitionDuration(0)
      .ringColor(() => (t) => `rgba(${GLOBE_PRESETS[themeRef.current.preset].ring},${1 - t})`)
      .ringMaxRadius(5)
      .ringPropagationSpeed(3)
      .ringRepeatPeriod(700)
      .arcColor(() => GLOBE_PRESETS[themeRef.current.preset].accent)
      .arcStroke(0.5)
      .arcAltitudeAutoScale(0.4)
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(1800)
      .onGlobeClick((lat, lng) => {
        if (!pickingRef.current) return;
        const rLat = parseFloat(lat.toFixed(4));
        const rLng = parseFloat(lng.toFixed(4));
        setFormData(prev => ({ ...prev, lat: rLat, lng: rLng }));
        pickingRef.current = false;
        _setIsPickingLocation(false);
        showToast(`Posizione impostata: ${rLat}°, ${rLng}°`);
      })
      .onPointClick((point) => {
        const idx = newsRef.current.findIndex(n => n.id === point.id);
        if (idx === -1) return;
        const item = newsRef.current[idx];
        setCurrentIndex(idx);
        globe.pointOfView({ lat: item.lat, lng: item.lng, altitude: settingsRef.current.altitude }, 900);
      });

    globeInstance.current = globe;
    // Force a consistent high-res backing store so exports are crisp (720x1280)
    try { globe.renderer().setPixelRatio(2); } catch { /* ignore */ }
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;
    globe.controls().enableZoom = true;

    return () => {
      try { globe._destructor && globe._destructor(); } catch { /* ignore */ }
      if (globeEl.current) globeEl.current.innerHTML = '';
      globeInstance.current = null;
    };
  }, []);

  // Points follow news + active highlight
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    g.pointsData(news.map((item, idx) => ({
      ...item,
      color: CATEGORY_COLORS[item.category] || '#64748b',
      __r: idx === currentIndex ? 0.75 : 0.4,
    }))).pointRadius(d => d.__r);
  }, [news, currentIndex]);

  // Radar ring on the active point
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    g.ringsData(item ? [{ lat: item.lat, lng: item.lng }] : []);
  }, [news, currentIndex, theme.preset]);

  // Apply preset look
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const p = GLOBE_PRESETS[theme.preset];
    g.globeImageUrl(p.globeImageUrl).backgroundImageUrl(p.bg).atmosphereColor(p.atmosphere);
  }, [theme.preset]);

  useEffect(() => {
    const g = globeInstance.current;
    if (g) g.showGraticules(theme.showGrid);
  }, [theme.showGrid]);

  // Route arcs (command-center connections)
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    if (!theme.showRoutes || news.length < 2) { g.arcsData([]); return; }
    g.arcsData(news.map((n, i) => {
      const next = news[(i + 1) % news.length];
      return { startLat: n.lat, startLng: n.lng, endLat: next.lat, endLng: next.lng };
    }));
  }, [news, theme.showRoutes, theme.preset]);

  // Country border highlight
  useEffect(() => {
    const g = globeInstance.current;
    if (!g) return;
    const item = news[currentIndex];
    const country = item ? findCountry(item.lat, item.lng) : null;
    const a = GLOBE_PRESETS[theme.preset].accent;
    if (country) {
      g.polygonsData([country])
       .polygonAltitude(0.005)
       .polygonCapColor(() => a + '18')
       .polygonSideColor(() => 'rgba(0,0,0,0)')
       .polygonStrokeColor(() => a)
       .polygonsTransitionDuration(400);
    } else {
      g.polygonsData([]);
    }
  }, [news, currentIndex, theme.preset]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (playState.current.timer) clearTimeout(playState.current.timer); }, []);

  const getCategoryColor = (c) => CATEGORY_COLORS[c] || '#64748b';

  const flyTo = (item, ms) => {
    if (globeInstance.current && item) {
      globeInstance.current.pointOfView(
        { lat: item.lat, lng: item.lng, altitude: settingsRef.current.altitude }, ms
      );
    }
  };

  // ---------- Preview engine (recursive timeout = robust, no stacking) ----------
  const playStep = (idx) => {
    const list = newsRef.current;
    if (!list.length) { stopPreview(); return; }
    const i = ((idx % list.length) + list.length) % list.length;
    setCurrentIndex(i);
    flyTo(list[i], settingsRef.current.flyMs);
    playState.current.timer = setTimeout(() => {
      if (playState.current.playing) playStep(i + 1);
    }, settingsRef.current.holdMs);
  };

  const startPreview = () => {
    if (!newsRef.current.length) { showToast('Aggiungi almeno una notizia', 'error'); return; }
    playState.current.playing = true;
    setIsPlaying(true);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = false;
    playStep(0);
  };

  const stopPreview = () => {
    if (playState.current.timer) clearTimeout(playState.current.timer);
    playState.current = { playing: false, timer: null };
    setIsPlaying(false);
    if (globeInstance.current) globeInstance.current.controls().autoRotate = true;
  };

  const togglePlay = () => (isPlaying ? stopPreview() : startPreview());

  const selectNews = (index) => {
    setCurrentIndex(index);
    flyTo(news[index], 900);
  };

  // ---------- CRUD ----------
  const openAddModal = () => {
    setEditingNews(null);
    setFormError('');
    setFormData({ title: '', text: '', category: 'Conflitto', date: todayISO(), source: '', nation: '', lat: 41.9028, lng: 12.4964 });
    setShowModal(true);
    setIsPickingLocation(false);
  };
  const openEditModal = (item) => {
    setEditingNews(item);
    setFormError('');
    setFormData({ ...item });
    setShowModal(true);
    setIsPickingLocation(false);
  };
  const closeModal = () => { setShowModal(false); setFormError(''); setIsPickingLocation(false); };

  const saveNews = () => {
    if (!formData.title.trim() || !formData.text.trim()) { setFormError('Titolo e descrizione sono obbligatori'); return; }
    const item = { ...formData, id: editingNews ? editingNews.id : newId(), lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) };
    setNews(prev => editingNews ? prev.map(n => n.id === editingNews.id ? item : n) : [...prev, item]);
    closeModal();
  };

  const deleteNews = (id) => showConfirm('Eliminare questa notizia?', () => {
    setNews(prev => {
      const filtered = prev.filter(n => n.id !== id);
      if (currentIndex >= filtered.length) setCurrentIndex(Math.max(0, filtered.length - 1));
      return filtered;
    });
  });

  const loadSampleData = () => showConfirm('Caricare i dati di esempio? (sostituisce le notizie attuali)', () => {
    setNews(SAMPLE_NEWS);
    setCurrentIndex(0);
  });

  const resetCamera = () => {
    stopPreview();
    if (globeInstance.current) {
      globeInstance.current.pointOfView({ lat: 20, lng: 10, altitude: 2.4 }, 1000);
      globeInstance.current.controls().autoRotate = true;
    }
    setCurrentIndex(0);
  };

  // ---------- Draw card onto a 2D canvas (for export) ----------
  const drawFrame = (ctx, s, item) => {
    if (!item) return;
    const t = themeRef.current;
    const catColor = getCategoryColor(item.category);
    const x = 28 * s, w = 304 * s, h = 190 * s, y = (640 - 30) * s - h, pad = 18 * s;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 30 * s; ctx.shadowOffsetY = 12 * s;
    roundRect(ctx, x, y, w, h, 16 * s);
    ctx.fillStyle = t.cardBg + 'f2';
    ctx.fill();
    ctx.restore();

    // accent top line
    ctx.fillStyle = GLOBE_PRESETS[t.preset].accent;
    roundRect(ctx, x, y, w, 3 * s, 1.5 * s); ctx.fill();

    // category badge
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${10 * s}px Inter, sans-serif`;
    const cat = item.category.toUpperCase();
    const bw = ctx.measureText(cat).width + 18 * s;
    ctx.fillStyle = catColor + '33';
    roundRect(ctx, x + pad, y + pad, bw, 19 * s, 6 * s); ctx.fill();
    ctx.fillStyle = catColor;
    ctx.fillText(cat, x + pad + 9 * s, y + pad + 10 * s);

    // date (right)
    ctx.font = `${10 * s}px monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(item.date || '', x + w - pad, y + pad + 10 * s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // title
    ctx.fillStyle = t.titleColor;
    ctx.font = `700 ${16 * s}px ${FONT_FAMILY[t.titleFont]}`;
    let ty = y + pad + 46 * s;
    ty = wrapText(ctx, item.title, x + pad, ty, w - pad * 2, 20 * s, 2);

    // body
    ctx.fillStyle = t.textColor;
    ctx.font = `${12.5 * s}px Inter, sans-serif`;
    wrapText(ctx, item.text, x + pad, ty + 4 * s, w - pad * 2, 16 * s, 3);

    // divider
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + h - 30 * s); ctx.lineTo(x + w - pad, y + h - 30 * s); ctx.stroke();

    // footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${10 * s}px Inter, sans-serif`;
    ctx.fillText('◉ ' + (item.nation || ''), x + pad, y + h - 14 * s);
    ctx.font = `${10 * s}px monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(item.source || '', x + w - pad, y + h - 14 * s);
    ctx.textAlign = 'left';
  };

  const getGlobeCanvas = () => globeEl.current?.querySelector('canvas');

  // ---------- Export PNG ----------
  const exportPNG = () => {
    const g = getGlobeCanvas();
    if (!g) { showToast('Globo non pronto', 'error'); return; }
    const W = g.width, H = g.height, s = W / 360;
    const comp = document.createElement('canvas');
    comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');
    ctx.drawImage(g, 0, 0, W, H);
    drawFrame(ctx, s, currentNewsRef.current);
    const a = document.createElement('a');
    a.download = `GeoReel_${fileStamp()}.png`;
    a.href = comp.toDataURL('image/png');
    a.click();
  };

  // ---------- Export video (text burned in) ----------
  const exportVideo = () => {
    const g = getGlobeCanvas();
    if (!g || !g.captureStream) { showToast('Cattura video non supportata dal browser', 'error'); return; }
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : null;
    if (!mimeType) { showToast('Formato video non supportato', 'error'); return; }

    const W = g.width, H = g.height, s = W / 360;
    const comp = document.createElement('canvas');
    comp.width = W; comp.height = H;
    const ctx = comp.getContext('2d');

    let raf;
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(g, 0, 0, W, H);
      drawFrame(ctx, s, currentNewsRef.current);
      raf = requestAnimationFrame(loop);
    };

    const stream = comp.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GeoReel_${new Date().toISOString().slice(0, 10)}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      stopPreview();
    };

    setIsExporting(true);
    loop();
    rec.start();
    startPreview();
    const total = newsRef.current.length * settings.holdMs + 600;
    setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, total);
  };

  const currentNews = news[currentIndex] || null;
  const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';

  return (
    <div className="min-h-screen text-slate-200 flex flex-col" style={{ '--accent': accent }}>
      {/* Top bar */}
      <nav className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl z-50">
        <div className="max-w-[1480px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accent }}>
              <GlobeIcon className="w-5 h-5 text-black/80" />
            </div>
            <div className="font-semibold text-xl tracking-tight">GeoReel</div>
            <div className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 font-mono" style={{ color: accent }}>WAR ROOM</div>
          </div>
          <button onClick={loadSampleData} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Esempi
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden max-w-[1480px] mx-auto w-full">
        {/* LEFT — news */}
        <div className="w-72 border-r border-slate-800/80 bg-slate-950 flex flex-col">
          <div className="p-5 flex-1 overflow-auto">
            <button onClick={openAddModal} className="w-full flex items-center justify-center gap-2 text-black font-semibold py-3 rounded-2xl text-sm mb-6" style={{ background: accent }}>
              <Plus className="w-4 h-4" /> AGGIUNGI NOTIZIA
            </button>

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

        {/* CENTER — 9:16 viewport */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#070b14] p-6 relative">
          <div className="mb-4 flex items-center gap-2 text-xs">
            <div className="px-3 py-1 rounded-full bg-slate-900 flex items-center gap-2 border border-slate-800">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} /> LIVE 9:16
            </div>
            <div className="text-slate-500 font-mono">1080×1920</div>
          </div>

          <div className="viewport">
            <div className="globe-container" ref={globeEl} />

            {isPickingLocation && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="text-center px-8">
                  <MapPin className="w-10 h-10 mx-auto mb-3" style={{ color: accent }} />
                  <div className="text-white text-lg font-semibold">Clicca sul globo</div>
                  <div className="text-slate-400 mt-1 text-sm">Scegli la posizione della notizia</div>
                </div>
              </div>
            )}

            {currentNews && (
              <motion.div key={currentNews.id}
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="news-card" style={{ backgroundColor: theme.cardBg + 'f2', backdropFilter: 'blur(4px)' }}>
                <div className="flex items-center justify-between">
                  <span className="tag" style={{ backgroundColor: getCategoryColor(currentNews.category) + '30', color: getCategoryColor(currentNews.category) }}>{currentNews.category.toUpperCase()}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{currentNews.date}</span>
                </div>
                <h3 style={{ color: theme.titleColor, fontFamily: FONT_FAMILY[theme.titleFont], fontWeight: 700 }}>{currentNews.title}</h3>
                <p style={{ color: theme.textColor }} className="line-clamp-3">{currentNews.text}</p>
                <div className="flex items-center justify-between text-[10px] pt-2.5 border-t border-white/10">
                  <span className="flex items-center gap-1 text-slate-400"><MapPin className="w-3 h-3" /> {currentNews.nation}</span>
                  <span className="font-mono text-slate-500">{currentNews.source}</span>
                </div>
              </motion.div>
            )}

            {isPlaying && news.length > 0 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1">
                {news.map((_, i) => (
                  <div key={i} className="h-1 rounded-full transition-all" style={{ width: i === currentIndex ? 18 : 6, background: i === currentIndex ? accent : 'rgba(255,255,255,0.3)' }} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 text-[10px] text-slate-600">Clicca i pin • trascina per riordinare</div>
        </div>

        {/* RIGHT — controls */}
        <div className="w-80 border-l border-slate-800/80 bg-slate-950 flex flex-col overflow-auto">
          <div className="p-5 space-y-6">
            {/* Playback */}
            <div>
              <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3">Anteprima</div>
              <button onClick={togglePlay} disabled={news.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-black font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400 transition-all"
                style={news.length === 0 ? {} : { background: accent }}>
                {isPlaying ? <><Pause className="w-4 h-4" /> FERMA</> : <><Play className="w-4 h-4" /> AVVIA PREVIEW</>}
              </button>

              <div className="mt-4 space-y-4 bg-slate-900 rounded-2xl p-4">
                <Slider label="Durata per notizia" value={settings.holdMs} min={1500} max={6000} step={250} display={fmtSec(settings.holdMs)} onChange={(v) => setSettings(s => ({ ...s, holdMs: v }))} />
                <Slider label="Velocità movimento" value={settings.flyMs} min={400} max={2500} step={100} display={fmtSec(settings.flyMs)} onChange={(v) => setSettings(s => ({ ...s, flyMs: v }))} />
                <Slider label="Zoom camera" value={Math.round((2.0 - settings.altitude) * 100)} min={20} max={150} step={5} display={`${Math.round((2.0 - settings.altitude) * 100)}%`} onChange={(v) => setSettings(s => ({ ...s, altitude: 2.0 - v / 100 }))} />
              </div>

              <button onClick={resetCamera} className="w-full mt-3 py-2.5 text-xs rounded-2xl border border-slate-800 hover:bg-slate-800 flex items-center justify-center gap-2">
                <RotateCcw className="w-3.5 h-3.5" /> RESET CAMERA
              </button>
            </div>

            {/* Planet look */}
            <div>
              <div className="flex items-center gap-2 uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3"><Settings className="w-3.5 h-3.5" /> Look del pianeta</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.entries(GLOBE_PRESETS).map(([key, p]) => (
                  <button key={key} onClick={() => setTheme(t => ({ ...t, preset: key }))}
                    className={`py-2.5 rounded-xl text-xs border transition-all ${theme.preset === key ? 'text-white' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    style={theme.preset === key ? { borderColor: p.accent, background: p.accent + '1a', color: p.accent } : {}}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Toggle active={theme.showGrid} onClick={() => setTheme(t => ({ ...t, showGrid: !t.showGrid }))} icon={<Grid3x3 className="w-3.5 h-3.5" />} label="Griglia" accent={accent} />
                <Toggle active={theme.showRoutes} onClick={() => setTheme(t => ({ ...t, showRoutes: !t.showRoutes }))} icon={<Route className="w-3.5 h-3.5" />} label="Rotte" accent={accent} />
              </div>
            </div>

            {/* Card style */}
            <div>
              <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3">Stile card</div>
              <div className="space-y-3 bg-slate-900 rounded-2xl p-4">
                <div>
                  <div className="text-[11px] text-slate-400 mb-1.5">Font titolo</div>
                  <select value={theme.titleFont} onChange={(e) => setTheme(t => ({ ...t, titleFont: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none">
                    <option value="Playfair Display">Playfair — Editoriale</option>
                    <option value="Space Grotesk">Space Grotesk — Tech</option>
                    <option value="Inter">Inter — Neutro</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">Sfondo card</div>
                  <input type="color" value={theme.cardBg} onChange={(e) => setTheme(t => ({ ...t, cardBg: e.target.value }))} className="w-8 h-8 rounded-lg bg-transparent border border-slate-700 p-0.5" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">Colore testo</div>
                  <input type="color" value={theme.textColor} onChange={(e) => setTheme(t => ({ ...t, textColor: e.target.value }))} className="w-8 h-8 rounded-lg bg-transparent border border-slate-700 p-0.5" />
                </div>
              </div>
            </div>

            {/* Export */}
            <div>
              <div className="uppercase tracking-wider text-[11px] font-semibold text-slate-400 mb-3">Esporta</div>
              <div className="space-y-2">
                <button onClick={exportVideo} disabled={isExporting || news.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-black font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400 transition-all">
                  {isExporting ? <>⏳ REGISTRAZIONE...</> : <><Download className="w-4 h-4" /> VIDEO REEL (WEBM)</>}
                </button>
                <button onClick={exportPNG} disabled={!currentNews}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm rounded-2xl border border-slate-800 hover:bg-slate-800 disabled:opacity-40">
                  <ImageIcon className="w-4 h-4" /> COVER PNG
                </button>
              </div>
              <div className="mt-3 text-[10px] leading-snug text-slate-600">Il testo viene impresso nel video. Converti in MP4 con CloudConvert se serve per i social.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6" onClick={closeModal}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="modal w-full max-w-lg bg-slate-900 rounded-2xl overflow-hidden border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-xl font-semibold">{editingNews ? 'Modifica Notizia' : 'Nuova Notizia'}</div>
                <button onClick={closeModal} className="text-slate-400 hover:text-white">✕</button>
              </div>
              {formError && <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-950/60 border border-red-800/50 text-red-400 text-sm">{formError}</div>}
              <div className="space-y-4">
                <Field label="Titolo">
                  <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Es: Accordo commerciale UE-ASEAN" className="inp" />
                </Field>
                <Field label="Descrizione breve">
                  <textarea value={formData.text} onChange={(e) => setFormData({ ...formData, text: e.target.value })} rows={3} placeholder="Riassunto conciso dell'evento..." className="inp resize-y min-h-[72px]" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Categoria">
                    <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="inp">
                      {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Data"><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="inp" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nazione / Regione"><input type="text" value={formData.nation} onChange={(e) => setFormData({ ...formData, nation: e.target.value })} placeholder="Ucraina" className="inp" /></Field>
                  <Field label="Fonte"><input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} placeholder="Reuters" className="inp" /></Field>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400">Posizione geografica</label>
                    <button type="button" onClick={() => setIsPickingLocation(true)} className="text-xs flex items-center gap-1" style={{ color: accent }}><MapPin className="w-3.5 h-3.5" /> Seleziona sul globo</button>
                  </div>
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

      {/* Export overlay */}
      {isExporting && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6" style={{ borderColor: accent, borderTopColor: 'transparent' }} />
            <div className="text-2xl font-semibold mb-2">Registrazione Reel...</div>
            <div className="text-slate-400 text-sm">Non chiudere la finestra • ~{Math.ceil(news.length * settings.holdMs / 1000)}s</div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-2.5 rounded-full text-sm font-medium text-white pointer-events-none ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </motion.div>
      )}

      {/* Confirm */}
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
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-400">{label}</span>
        <span className="text-[11px] font-mono text-slate-300">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function Toggle({ active, onClick, icon, label, accent }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs border transition-all ${active ? '' : 'border-slate-800 text-slate-500'}`}
      style={active ? { borderColor: accent, background: accent + '1a', color: accent } : {}}>
      {icon} {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default App;

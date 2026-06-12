import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Play, Pause, Download, Plus, Trash2, Eye, EyeOff,
  ArrowRight, Type, MapPin, Square, Layers, Image as ImageIcon,
  SkipBack, Move, ChevronDown, ChevronRight, Crosshair, SkipForward,
  Lock, Unlock, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

/* ── MAP COORDINATE SYSTEM ─────────────────────────────────── */
const MAP_W = 1000;
const MAP_H = 500;

function project(lng, lat) {
  return { x: (lng + 180) / 360 * MAP_W, y: (90 - lat) / 180 * MAP_H };
}

function ringToPath(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const { x, y } = project(lng, lat);
    if (i === 0) { d += `M ${x.toFixed(1)} ${y.toFixed(1)}`; continue; }
    const prevLng = ring[i - 1][0];
    if (Math.abs(lng - prevLng) > 180) d += ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
    else d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + ' Z';
}

function geomToPath(geom) {
  if (!geom) return '';
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat(1);
  return rings.map(ringToPath).join(' ');
}

/* ── COUNTRY NAMES (ISO 3166-1 numeric) ──────────────────────*/
const CN = {
  4:'Afghanistan',12:'Algeria',24:'Angola',32:'Argentina',36:'Australia',
  40:'Austria',50:'Bangladesh',56:'Belgium',68:'Bolivia',76:'Brazil',
  100:'Bulgaria',104:'Myanmar',116:'Cambodia',124:'Canada',144:'Sri Lanka',
  152:'Chile',156:'China',170:'Colombia',180:'DR Congo',191:'Croatia',
  192:'Cuba',203:'Czechia',208:'Denmark',218:'Ecuador',818:'Egypt',
  231:'Ethiopia',246:'Finland',250:'France',276:'Germany',288:'Ghana',
  300:'Greece',320:'Guatemala',332:'Haiti',348:'Hungary',356:'India',
  360:'Indonesia',364:'Iran',368:'Iraq',372:'Ireland',376:'Israel',
  380:'Italy',388:'Jamaica',392:'Japan',400:'Jordan',398:'Kazakhstan',
  404:'Kenya',408:'North Korea',410:'South Korea',414:'Kuwait',417:'Kyrgyzstan',
  418:'Laos',422:'Lebanon',428:'Latvia',434:'Libya',440:'Lithuania',
  458:'Malaysia',484:'Mexico',504:'Morocco',508:'Mozambique',516:'Namibia',
  524:'Nepal',528:'Netherlands',554:'New Zealand',566:'Nigeria',578:'Norway',
  512:'Oman',586:'Pakistan',591:'Panama',604:'Peru',608:'Philippines',
  616:'Poland',620:'Portugal',630:'Puerto Rico',634:'Qatar',
  642:'Romania',643:'Russia',682:'Saudi Arabia',686:'Senegal',
  710:'South Africa',706:'Somalia',724:'Spain',729:'Sudan',752:'Sweden',
  756:'Switzerland',760:'Syria',762:'Tajikistan',764:'Thailand',
  788:'Tunisia',792:'Turkey',795:'Turkmenistan',800:'Uganda',804:'Ukraine',
  784:'UAE',826:'UK',840:'USA',860:'Uzbekistan',704:'Vietnam',
  887:'Yemen',716:'Zimbabwe',275:'Palestine',
};

/* ── MAP STYLE PRESETS ────────────────────────────────────────*/
const PRESETS = {
  carta: {
    label: 'Carta Antica',
    bg: '#c5a96d',
    ocean: '#8fafc2',
    land: '#d4bc82',
    border: '#6b4c2a',
    grid: '#a08050',
    graticule: '#a08050',
    grain: true,
    fontColor: '#3d2510',
    accentDefault: '#c0392b',
    dark: false,
  },
  intel: {
    label: 'Intelligence',
    bg: '#05101e',
    ocean: '#071828',
    land: '#0d1e2e',
    border: '#1a4a7a',
    grid: '#0a2a4a',
    graticule: '#0d2540',
    grain: false,
    fontColor: '#7fb8e8',
    accentDefault: '#00cfff',
    dark: true,
  },
  news: {
    label: 'Breaking News',
    bg: '#f0ebe0',
    ocean: '#c8dded',
    land: '#e8e0ce',
    border: '#aaaaaa',
    grid: '#cccccc',
    graticule: '#dddddd',
    grain: true,
    fontColor: '#1a1a1a',
    accentDefault: '#e63030',
    dark: false,
  },
  tactical: {
    label: 'Tattico',
    bg: '#0a1205',
    ocean: '#050d08',
    land: '#152010',
    border: '#3a6020',
    grid: '#1a3010',
    graticule: '#203010',
    grain: false,
    fontColor: '#7fca50',
    accentDefault: '#40ff00',
    dark: true,
  },
};

/* ── LAYER TYPE ICONS ─────────────────────────────────────────*/
const LAYER_ICONS = {
  territory: Square,
  arrow: ArrowRight,
  label: MapPin,
  title: Type,
};

/* ── ID ────────────────────────────────────────────────────── */
let _lid = 1;
const lid = () => `L${_lid++}`;

/* ── INTERPOLATE OPACITY ──────────────────────────────────────*/
function layerOpacity(layer, t) {
  const { inTime, outTime } = layer;
  const fade = 0.25;
  if (t < inTime) return 0;
  if (t > outTime) return 0;
  if (t < inTime + fade) return (t - inTime) / fade;
  if (t > outTime - fade) return (outTime - t) / fade;
  return 1;
}

function arrowProgress(layer, t) {
  if (layer.type !== 'arrow') return 1;
  const draw = 1.2;
  if (t < layer.inTime) return 0;
  return Math.min(1, (t - layer.inTime) / draw);
}

/* ─────────────────────────────────────────────────────────────
   CartaVivaStudio
──────────────────────────────────────────────────────────────*/
export default function CartaVivaStudio() {
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timelineRef = useRef(null);

  /* map geo data */
  const geoFeatures = useMemo(() => feature(countriesTopo, countriesTopo.objects.countries).features, []);

  /* ui state */
  const [preset, setPreset] = useState('carta');
  const [tool, setTool] = useState('select');
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverCountry, setHoverCountry] = useState(null);

  /* viewport pan/zoom */
  const [vb, setVb] = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const panRef = useRef(null);

  /* timeline */
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [playing, setPlaying] = useState(false);
  const playStartRef = useRef(null);
  const playFromRef = useRef(0);

  /* arrow drawing (two-click) */
  const [arrowStart, setArrowStart] = useState(null);

  /* label draft */
  const [labelDraft, setLabelDraft] = useState(null); // {x, y}
  const labelInputRef = useRef(null);

  /* title draft */
  const [titleDraftOpen, setTitleDraftOpen] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [titleSub, setTitleSub] = useState('');

  /* export */
  const [isExporting, setIsExporting] = useState(false);

  const style = PRESETS[preset];
  const selectedLayer = layers.find(l => l.id === selectedId) || null;

  /* ── SVG POINT FROM EVENT ──────────────────────────────── */
  const svgPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }, []);

  /* ── PLAY / PAUSE ─────────────────────────────────────── */
  useEffect(() => {
    if (playing) {
      playFromRef.current = currentTime >= duration ? 0 : currentTime;
      playStartRef.current = performance.now();
      const tick = (now) => {
        const elapsed = (now - playStartRef.current) / 1000;
        const t = playFromRef.current + elapsed;
        if (t >= duration) { setCurrentTime(duration); setPlaying(false); return; }
        setCurrentTime(t);
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(animRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, duration]);

  /* ── LABEL INPUT FOCUS ────────────────────────────────── */
  useEffect(() => {
    if (labelDraft && labelInputRef.current) labelInputRef.current.focus();
  }, [labelDraft]);

  /* ── MAP CLICK HANDLER ────────────────────────────────── */
  const handleMapClick = useCallback((e) => {
    if (e.target.tagName === 'path' && tool === 'territory') return; // handled by country click
    const pt = svgPoint(e);

    if (tool === 'arrow') {
      if (!arrowStart) {
        setArrowStart(pt);
      } else {
        const id = lid();
        setLayers(ls => [...ls, {
          id, type: 'arrow', name: 'Freccia',
          visible: true,
          inTime: Math.max(0, currentTime),
          outTime: duration,
          startX: arrowStart.x, startY: arrowStart.y,
          endX: pt.x, endY: pt.y,
          color: style.accentDefault,
          width: 3,
          dashed: false,
          animated: true,
          curved: true,
        }]);
        setArrowStart(null);
        setSelectedId(id);
        setTool('select');
      }
      return;
    }

    if (tool === 'label') {
      setLabelDraft({ x: pt.x, y: pt.y });
      return;
    }
  }, [tool, arrowStart, currentTime, duration, style, svgPoint]);

  const handleCountryClick = useCallback((feat, e) => {
    e.stopPropagation();
    if (tool !== 'territory') { setSelectedId(null); return; }
    const id = lid();
    const name = CN[parseInt(feat.id)] || `Country ${feat.id}`;
    setLayers(ls => [...ls, {
      id, type: 'territory', name,
      visible: true,
      inTime: Math.max(0, currentTime),
      outTime: duration,
      countryId: feat.id,
      fill: style.accentDefault,
      fillOpacity: 0.45,
      stroke: style.accentDefault,
      strokeWidth: 1.5,
    }]);
    setSelectedId(id);
  }, [tool, currentTime, duration, style]);

  const commitLabel = useCallback((text) => {
    if (!text.trim() || !labelDraft) { setLabelDraft(null); return; }
    const id = lid();
    setLayers(ls => [...ls, {
      id, type: 'label', name: text.slice(0, 20),
      visible: true,
      inTime: Math.max(0, currentTime),
      outTime: duration,
      x: labelDraft.x, y: labelDraft.y,
      text, subtext: '',
      color: style.accentDefault,
      fontSize: 14,
      callout: true,
    }]);
    setLabelDraft(null);
    setSelectedId(id);
    setTool('select');
  }, [labelDraft, currentTime, duration, style]);

  const commitTitle = useCallback(() => {
    if (!titleText.trim()) { setTitleDraftOpen(false); return; }
    const id = lid();
    setLayers(ls => [...ls, {
      id, type: 'title', name: titleText.slice(0, 24),
      visible: true,
      inTime: Math.max(0, currentTime),
      outTime: duration,
      text: titleText,
      subtext: titleSub,
      position: 'bottom',
      color: style.dark ? '#ffffff' : '#111111',
      accent: style.accentDefault,
      bg: style.dark ? 'rgba(5,16,30,0.88)' : 'rgba(250,244,233,0.92)',
    }]);
    setTitleDraftOpen(false);
    setTitleText('');
    setTitleSub('');
    setSelectedId(id);
  }, [titleText, titleSub, currentTime, duration, style]);

  /* ── UPDATE LAYER ──────────────────────────────────────── */
  const upd = (id, patch) => setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const del = (id) => { setLayers(ls => ls.filter(l => l.id !== id)); if (selectedId === id) setSelectedId(null); };

  /* ── PAN / ZOOM ─────────────────────────────────────────── */
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    const pt = svgPoint(e);
    setVb(v => {
      const newW = Math.max(80, Math.min(MAP_W, v.w * factor));
      const newH = Math.max(40, Math.min(MAP_H, v.h * factor));
      const ratio = newW / v.w;
      return {
        x: Math.max(0, Math.min(MAP_W - newW, pt.x - (pt.x - v.x) * ratio)),
        y: Math.max(0, Math.min(MAP_H - newH, pt.y - (pt.y - v.y) * ratio)),
        w: newW, h: newH,
      };
    });
  }, [svgPoint]);

  const handleMapMouseDown = useCallback((e) => {
    if (tool !== 'select' || e.button !== 0) return;
    if (e.target.tagName === 'path') return;
    panRef.current = { startX: e.clientX, startY: e.clientY, vb: { ...vb } };
    const onMove = (ev) => {
      if (!panRef.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = panRef.current.vb.w / rect.width;
      const scaleY = panRef.current.vb.h / rect.height;
      const dx = (ev.clientX - panRef.current.startX) * scaleX;
      const dy = (ev.clientY - panRef.current.startY) * scaleY;
      setVb({
        ...panRef.current.vb,
        x: Math.max(0, Math.min(MAP_W - panRef.current.vb.w, panRef.current.vb.x - dx)),
        y: Math.max(0, Math.min(MAP_H - panRef.current.vb.h, panRef.current.vb.y - dy)),
      });
    };
    const onUp = () => { panRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [tool, vb]);

  /* ── TIMELINE CLICK ─────────────────────────────────────── */
  const handleTimelineClick = useCallback((e) => {
    const bar = timelineRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(t * duration);
    setPlaying(false);
  }, [duration]);

  /* ── ARROW SVG PATH ─────────────────────────────────────── */
  const arrowPath = (l) => {
    const { startX: x1, startY: y1, endX: x2, endY: y2, curved } = l;
    if (!curved) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  /* ── EXPORT PNG ─────────────────────────────────────────── */
  const exportPNG = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setIsExporting(true);
    try {
      const s = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([s], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 1280; c.height = 720;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 1280, 720);
        URL.revokeObjectURL(url);
        c.toBlob(b => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = `CartaViva_${Date.now()}.png`;
          a.click();
          setIsExporting(false);
        }, 'image/png');
      };
      img.onerror = () => setIsExporting(false);
      img.src = url;
    } catch { setIsExporting(false); }
  }, []);

  /* ── ARROW MARKER DEF ───────────────────────────────────── */
  const uniqueArrowColors = useMemo(() => [...new Set(
    layers.filter(l => l.type === 'arrow').map(l => l.color)
  )], [layers]);

  /* ── RENDER ─────────────────────────────────────────────── */
  const visibleLayers = layers.filter(l => l.visible);

  const cursorClass = {
    select: 'cursor-grab active:cursor-grabbing',
    territory: 'cursor-crosshair',
    arrow: arrowStart ? 'cursor-crosshair' : 'cursor-crosshair',
    label: 'cursor-text',
    title: 'cursor-default',
  }[tool] || 'cursor-default';

  return (
    <div className="flex flex-1 overflow-hidden min-h-0" style={{ '--cv-accent': style.accentDefault }}>
      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div className="w-64 border-r border-slate-800/80 bg-slate-950 flex flex-col text-sm shrink-0">
        {/* Tools */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 px-1">Strumenti</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ['select', Move, 'Seleziona'],
              ['territory', Square, 'Territorio'],
              ['arrow', ArrowRight, 'Freccia'],
              ['label', MapPin, 'Etichetta'],
            ].map(([t, Icon, label]) => (
              <button key={t} onClick={() => { setTool(t); setArrowStart(null); setLabelDraft(null); }}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs border transition-all ${tool === t ? 'border-[var(--cv-accent)] bg-[var(--cv-accent)]/10 text-[var(--cv-accent)]' : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setTitleDraftOpen(true)}
            className="mt-1.5 w-full flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all">
            <Type className="w-3.5 h-3.5" /> Titolo / Card
          </button>
        </div>

        {/* Preset styles */}
        <div className="p-3 border-b border-slate-800/60">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 px-1">Stile</div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(PRESETS).map(([k, v]) => (
              <button key={k} onClick={() => setPreset(k)}
                className={`py-2 px-2 rounded-xl text-xs border transition-all ${preset === k ? 'border-[var(--cv-accent)] bg-[var(--cv-accent)]/10 text-[var(--cv-accent)]' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Layer list */}
        <div className="flex-1 overflow-auto">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Layer ({layers.length})</div>
            <span className="text-[9px] text-slate-600">drag ⇅</span>
          </div>
          {layers.length === 0 && (
            <div className="mx-3 mt-2 text-center py-6 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
              Nessun layer.<br />Usa gli strumenti sopra.
            </div>
          )}
          <Reorder.Group axis="y" values={layers} onReorder={setLayers} className="px-2 pb-3 space-y-1">
            {[...layers].reverse().map(l => {
              const Icon = LAYER_ICONS[l.type] || Layers;
              const active = selectedId === l.id;
              const opacity = layerOpacity(l, currentTime);
              return (
                <Reorder.Item key={l.id} value={l} whileDrag={{ scale: 1.02, zIndex: 99 }}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer border transition-all group ${active ? 'bg-slate-800 border-slate-600' : 'border-transparent hover:bg-slate-900'}`}
                  onClick={() => setSelectedId(active ? null : l.id)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color || l.fill || l.accent || '#888', opacity: opacity > 0 ? 1 : 0.3 }} />
                  <Icon className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <span className="flex-1 text-xs truncate">{l.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); upd(l.id, { visible: !l.visible }); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-700 flex-shrink-0">
                    {l.visible ? <Eye className="w-3 h-3 text-slate-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); del(l.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-950 text-red-400 flex-shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>
      </div>

      {/* ── CENTER: MAP + TIMELINE ──────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#040810] min-w-0 overflow-hidden">
        {/* hint */}
        {arrowStart && (
          <div className="mb-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300 animate-pulse">
            Clicca il punto di arrivo della freccia
          </div>
        )}
        {tool === 'territory' && !arrowStart && (
          <div className="mb-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300">
            Clicca un paese per evidenziarlo
          </div>
        )}
        {tool === 'label' && (
          <div className="mb-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300">
            Clicca sulla mappa per aggiungere un&apos;etichetta
          </div>
        )}

        {/* MAP CANVAS */}
        <div className="relative rounded-2xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.95)] border border-white/5"
          style={{ width: 640, height: 360 }}>

          {/* Grain overlay for carta/news presets */}
          {style.grain && (
            <div className="absolute inset-0 z-10 pointer-events-none opacity-30"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")", backgroundSize: '256px 256px', mixBlendMode: 'multiply' }} />
          )}

          {/* Vignette */}
          <div className="absolute inset-0 z-10 pointer-events-none rounded-2xl"
            style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />

          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            width={640} height={360}
            className={`block ${cursorClass}`}
            style={{ background: style.ocean }}
            onWheel={handleWheel}
            onMouseDown={handleMapMouseDown}
            onClick={handleMapClick}
          >
            <defs>
              {/* Graticule grid lines */}
              <pattern id="graticule" x="0" y="0"
                width={MAP_W / 36} height={MAP_H / 18}
                patternUnits="userSpaceOnUse">
                <path d={`M ${MAP_W / 36} 0 L 0 0 0 ${MAP_H / 18}`}
                  fill="none" stroke={style.graticule} strokeWidth="0.3" opacity="0.5" />
              </pattern>

              {/* Arrow markers per color */}
              {uniqueArrowColors.map(color => (
                <marker key={color}
                  id={`arr-${color.replace('#', '')}`}
                  markerWidth="8" markerHeight="6"
                  refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill={color} />
                </marker>
              ))}

              {/* Paper vignette for carta preset */}
              {style.grain && (
                <radialGradient id="paper-vignette" cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="100%" stopColor="rgba(60,30,0,0.3)" />
                </radialGradient>
              )}
            </defs>

            {/* Ocean bg */}
            <rect x={-10} y={-10} width={MAP_W + 20} height={MAP_H + 20} fill={style.ocean} />

            {/* Graticule */}
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="url(#graticule)" />

            {/* Countries base */}
            {geoFeatures.map(feat => {
              const d = geomToPath(feat.geometry);
              const isHovered = hoverCountry === feat.id && tool === 'territory';
              return (
                <path
                  key={feat.id}
                  d={d}
                  fill={isHovered ? style.accentDefault + '44' : style.land}
                  stroke={style.border}
                  strokeWidth={0.4}
                  strokeLinejoin="round"
                  style={{ cursor: tool === 'territory' ? 'pointer' : undefined }}
                  onMouseEnter={() => setHoverCountry(feat.id)}
                  onMouseLeave={() => setHoverCountry(null)}
                  onClick={(e) => handleCountryClick(feat, e)}
                />
              );
            })}

            {/* Paper vignette overlay */}
            {style.grain && <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="url(#paper-vignette)" />}

            {/* Arrow draw-preview */}
            {arrowStart && (
              <circle cx={arrowStart.x} cy={arrowStart.y} r={3} fill={style.accentDefault} opacity={0.8} />
            )}

            {/* Territory layers */}
            {visibleLayers.filter(l => l.type === 'territory').map(l => {
              const feat = geoFeatures.find(f => f.id === l.countryId);
              if (!feat) return null;
              const op = layerOpacity(l, currentTime);
              return (
                <path
                  key={l.id}
                  d={geomToPath(feat.geometry)}
                  fill={l.fill}
                  fillOpacity={l.fillOpacity * op}
                  stroke={l.stroke}
                  strokeWidth={l.strokeWidth}
                  strokeOpacity={op}
                  strokeLinejoin="round"
                  className="pointer-events-none"
                />
              );
            })}

            {/* Arrow layers */}
            {visibleLayers.filter(l => l.type === 'arrow').map(l => {
              const d = arrowPath(l);
              const op = layerOpacity(l, currentTime);
              const prog = arrowProgress(l, currentTime);
              // SVG pathLength trick for draw-on
              const pathLen = 9999;
              return (
                <path
                  key={l.id}
                  d={d}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={l.width}
                  strokeDasharray={l.dashed ? `${l.width * 4} ${l.width * 2}` : `${pathLen}`}
                  strokeDashoffset={l.animated ? pathLen * (1 - prog) : 0}
                  strokeLinecap="round"
                  opacity={op}
                  markerEnd={`url(#arr-${l.color.replace('#', '')})`}
                  className="pointer-events-none"
                  style={{ transition: playing ? 'none' : 'stroke-dashoffset 0.3s' }}
                />
              );
            })}

            {/* Label layers */}
            {visibleLayers.filter(l => l.type === 'label').map(l => {
              const op = layerOpacity(l, currentTime);
              const fs = l.fontSize;
              return (
                <g key={l.id} opacity={op} className="pointer-events-none">
                  {l.callout && (
                    <>
                      <circle cx={l.x} cy={l.y} r={3.5} fill={l.color} />
                      <line x1={l.x} y1={l.y} x2={l.x} y2={l.y - 18} stroke={l.color} strokeWidth={1.2} />
                    </>
                  )}
                  <rect x={l.x - fs * 0.4} y={l.y - 18 - fs - 8}
                    width={l.text.length * fs * 0.55 + 12} height={fs + 10}
                    rx={3} fill={style.dark ? 'rgba(5,16,30,0.85)' : 'rgba(250,244,233,0.9)'}
                    stroke={l.color} strokeWidth={0.8} />
                  <text x={l.x - fs * 0.4 + 6} y={l.y - 18 - 5}
                    fontSize={fs} fill={l.color}
                    fontFamily="'Playfair Display', Georgia, serif"
                    fontWeight="600">
                    {l.text}
                  </text>
                  {l.subtext ? (
                    <text x={l.x - fs * 0.4 + 6} y={l.y - 18 - 5 + fs * 1.2}
                      fontSize={fs * 0.8} fill={style.fontColor} opacity={0.7}
                      fontFamily="'Inter', system-ui, sans-serif">
                      {l.subtext}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Title card layers */}
            {visibleLayers.filter(l => l.type === 'title').map(l => {
              const op = layerOpacity(l, currentTime);
              const posY = l.position === 'top' ? 18 : l.position === 'center' ? MAP_H / 2 - 28 : MAP_H - 72;
              return (
                <g key={l.id} opacity={op} className="pointer-events-none">
                  <rect x={0} y={posY} width={MAP_W} height={56}
                    fill={l.bg} />
                  <rect x={0} y={posY} width={6} height={56} fill={l.accent} />
                  <text x={18} y={posY + 22}
                    fontSize={18} fontWeight="700" fill={l.color}
                    fontFamily="'Playfair Display', Georgia, serif">
                    {l.text}
                  </text>
                  {l.subtext ? (
                    <text x={18} y={posY + 42}
                      fontSize={12} fill={l.color} opacity={0.65}
                      fontFamily="'Space Grotesk', system-ui, sans-serif"
                      fontWeight="500" letterSpacing="0.5">
                      {l.subtext}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Intel grid overlay */}
            {preset === 'intel' && (
              <g className="pointer-events-none" opacity={0.15}>
                {/* Scan lines */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <line key={i} x1={0} y1={(i + 0.5) * (MAP_H / 20)}
                    x2={MAP_W} y2={(i + 0.5) * (MAP_H / 20)}
                    stroke="#1a6aaa" strokeWidth={0.5} />
                ))}
              </g>
            )}

            {/* Tactical crosshair overlay */}
            {preset === 'tactical' && (
              <g className="pointer-events-none" opacity={0.12}>
                <circle cx={MAP_W / 2} cy={MAP_H / 2} r={80} fill="none" stroke="#40ff00" strokeWidth={0.8} />
                <circle cx={MAP_W / 2} cy={MAP_H / 2} r={160} fill="none" stroke="#40ff00" strokeWidth={0.5} />
                <line x1={MAP_W / 2 - 200} y1={MAP_H / 2} x2={MAP_W / 2 + 200} y2={MAP_H / 2} stroke="#40ff00" strokeWidth={0.5} />
                <line x1={MAP_W / 2} y1={MAP_H / 2 - 120} x2={MAP_W / 2} y2={MAP_H / 2 + 120} stroke="#40ff00" strokeWidth={0.5} />
              </g>
            )}

            {/* Hover country label */}
            {hoverCountry && tool === 'territory' && (() => {
              const feat = geoFeatures.find(f => f.id === hoverCountry);
              const name = CN[parseInt(hoverCountry)] || '';
              if (!feat || !name) return null;
              return (
                <text x={MAP_W - 8} y={MAP_H - 8}
                  textAnchor="end" fontSize={11}
                  fill={style.fontColor} opacity={0.7}
                  fontFamily="'Space Grotesk', system-ui, sans-serif">
                  {name}
                </text>
              );
            })()}
          </svg>

          {/* In-place label input */}
          {labelDraft && (
            <div className="absolute inset-0 z-30 flex items-center justify-center"
              style={{ pointerEvents: 'none' }}>
              <div style={{ pointerEvents: 'auto' }}
                className="bg-slate-900 border border-slate-600 rounded-xl p-3 shadow-2xl flex gap-2">
                <input
                  ref={labelInputRef}
                  className="bg-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none border border-slate-700 focus:border-[var(--cv-accent)] w-40"
                  placeholder="Testo etichetta…"
                  onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(e.target.value); if (e.key === 'Escape') setLabelDraft(null); }}
                />
                <button onClick={(e) => commitLabel(e.target.previousSibling?.value || '')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black" style={{ background: style.accentDefault }}>OK</button>
                <button onClick={() => setLabelDraft(null)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">✕</button>
              </div>
            </div>
          )}
        </div>

        {/* ── TIMELINE ────────────────────────────────── */}
        <div className="w-full max-w-[700px] mt-4 px-2">
          {/* Controls row */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => { setCurrentTime(0); setPlaying(false); }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><SkipBack className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPlaying(p => !p)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold shrink-0"
              style={{ background: style.accentDefault }}>
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
            <div className="text-xs font-mono text-slate-400 w-20">
              {currentTime.toFixed(1)}s / {duration}s
            </div>

            {/* Timeline bar */}
            <div ref={timelineRef} className="flex-1 h-2 bg-slate-800 rounded-full relative cursor-pointer"
              onClick={handleTimelineClick}>
              {/* Layer spans */}
              {layers.map(l => (
                <div key={l.id}
                  className="absolute h-full top-0 rounded-full opacity-40"
                  style={{
                    left: `${(l.inTime / duration) * 100}%`,
                    width: `${((l.outTime - l.inTime) / duration) * 100}%`,
                    background: l.color || l.fill || l.accent || '#888',
                  }} />
              ))}
              {/* Scrubber */}
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg pointer-events-none"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 7px)`, background: style.accentDefault }} />
            </div>

            {/* Duration selector */}
            <select value={duration} onChange={e => setDuration(Number(e.target.value))}
              className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 outline-none cursor-pointer">
              {[5, 8, 10, 15, 20, 30].map(d => <option key={d} value={d}>{d}s</option>)}
            </select>
          </div>

          {/* Layer timeline tracks */}
          {layers.length > 0 && (
            <div className="space-y-1 mt-1">
              {[...layers].reverse().map(l => (
                <div key={l.id} className="flex items-center gap-2 h-4">
                  <div className="w-28 truncate text-[10px] text-slate-500">{l.name}</div>
                  <div className="flex-1 h-2 bg-slate-900 rounded-full relative">
                    <div className="absolute h-full rounded-full opacity-70"
                      style={{
                        left: `${(l.inTime / duration) * 100}%`,
                        width: `${Math.max(2, ((l.outTime - l.inTime) / duration) * 100)}%`,
                        background: l.color || l.fill || l.accent || '#888',
                      }} />
                    {/* Time indicator */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/40 pointer-events-none"
                      style={{ left: `${(currentTime / duration) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────── */}
      <div className="w-72 border-l border-slate-800/80 bg-slate-950 flex flex-col shrink-0 overflow-auto">
        {/* Layer properties */}
        <div className="p-4 border-b border-slate-800/60">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Proprietà Layer</div>
          {!selectedLayer ? (
            <div className="text-xs text-slate-600">Seleziona un layer dalla lista</div>
          ) : (
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Nome</label>
                <input value={selectedLayer.name}
                  onChange={e => upd(selectedId, { name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
              </div>

              {/* Timing */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Entra (s)</label>
                  <input type="number" min={0} max={duration} step={0.1}
                    value={selectedLayer.inTime.toFixed(1)}
                    onChange={e => upd(selectedId, { inTime: Math.max(0, Math.min(duration, Number(e.target.value))) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Esce (s)</label>
                  <input type="number" min={0} max={duration} step={0.1}
                    value={selectedLayer.outTime.toFixed(1)}
                    onChange={e => upd(selectedId, { outTime: Math.max(0, Math.min(duration, Number(e.target.value))) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
                </div>
              </div>

              {/* Territory-specific */}
              {selectedLayer.type === 'territory' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-500">Colore riempimento</label>
                    <input type="color" value={selectedLayer.fill}
                      onChange={e => upd(selectedId, { fill: e.target.value, stroke: e.target.value })}
                      className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 p-0.5 cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Opacità</label>
                    <input type="range" min={0.05} max={1} step={0.05}
                      value={selectedLayer.fillOpacity}
                      onChange={e => upd(selectedId, { fillOpacity: Number(e.target.value) })}
                      className="w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Bordo ({selectedLayer.strokeWidth}px)</label>
                    <input type="range" min={0} max={5} step={0.5}
                      value={selectedLayer.strokeWidth}
                      onChange={e => upd(selectedId, { strokeWidth: Number(e.target.value) })}
                      className="w-full" />
                  </div>
                </>
              )}

              {/* Arrow-specific */}
              {selectedLayer.type === 'arrow' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-500">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 p-0.5 cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Spessore ({selectedLayer.width}px)</label>
                    <input type="range" min={1} max={8} step={0.5}
                      value={selectedLayer.width}
                      onChange={e => upd(selectedId, { width: Number(e.target.value) })}
                      className="w-full" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => upd(selectedId, { curved: !selectedLayer.curved })}
                      className={`flex-1 py-1.5 text-xs rounded-xl border transition-all ${selectedLayer.curved ? 'border-[var(--cv-accent)] text-[var(--cv-accent)] bg-[var(--cv-accent)]/10' : 'border-slate-700 text-slate-400'}`}>
                      Curva
                    </button>
                    <button onClick={() => upd(selectedId, { dashed: !selectedLayer.dashed })}
                      className={`flex-1 py-1.5 text-xs rounded-xl border transition-all ${selectedLayer.dashed ? 'border-[var(--cv-accent)] text-[var(--cv-accent)] bg-[var(--cv-accent)]/10' : 'border-slate-700 text-slate-400'}`}>
                      Tratteggio
                    </button>
                    <button onClick={() => upd(selectedId, { animated: !selectedLayer.animated })}
                      className={`flex-1 py-1.5 text-xs rounded-xl border transition-all ${selectedLayer.animated ? 'border-[var(--cv-accent)] text-[var(--cv-accent)] bg-[var(--cv-accent)]/10' : 'border-slate-700 text-slate-400'}`}>
                      Disegna
                    </button>
                  </div>
                </>
              )}

              {/* Label-specific */}
              {selectedLayer.type === 'label' && (
                <>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Testo principale</label>
                    <input value={selectedLayer.text}
                      onChange={e => upd(selectedId, { text: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Sottotitolo</label>
                    <input value={selectedLayer.subtext}
                      onChange={e => upd(selectedId, { subtext: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" placeholder="opzionale" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-500">Colore</label>
                    <input type="color" value={selectedLayer.color}
                      onChange={e => upd(selectedId, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 p-0.5 cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Dimensione ({selectedLayer.fontSize}px)</label>
                    <input type="range" min={8} max={28} step={1}
                      value={selectedLayer.fontSize}
                      onChange={e => upd(selectedId, { fontSize: Number(e.target.value) })}
                      className="w-full" />
                  </div>
                </>
              )}

              {/* Title-specific */}
              {selectedLayer.type === 'title' && (
                <>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Titolo</label>
                    <input value={selectedLayer.text}
                      onChange={e => upd(selectedId, { text: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Sottotitolo</label>
                    <input value={selectedLayer.subtext}
                      onChange={e => upd(selectedId, { subtext: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-[var(--cv-accent)]" placeholder="opzionale" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Posizione</label>
                    <div className="flex gap-1">
                      {['top', 'center', 'bottom'].map(pos => (
                        <button key={pos} onClick={() => upd(selectedId, { position: pos })}
                          className={`flex-1 py-1.5 text-xs rounded-xl border transition-all capitalize ${selectedLayer.position === pos ? 'border-[var(--cv-accent)] text-[var(--cv-accent)] bg-[var(--cv-accent)]/10' : 'border-slate-700 text-slate-400'}`}>
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-500">Accent</label>
                    <input type="color" value={selectedLayer.accent}
                      onChange={e => upd(selectedId, { accent: e.target.value })}
                      className="w-7 h-7 rounded-lg bg-transparent border border-slate-700 p-0.5 cursor-pointer" />
                  </div>
                </>
              )}

              {/* Delete */}
              <button onClick={() => del(selectedId)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-900 text-red-500 hover:bg-red-950 text-xs transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Elimina layer
              </button>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Esporta</div>
          <button onClick={exportPNG} disabled={isExporting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-50"
            style={{ background: style.accentDefault, color: style.dark ? '#000' : '#fff' }}>
            {isExporting ? '⏳ Esportando…' : <><ImageIcon className="w-4 h-4" /> ESPORTA PNG (1280×720)</>}
          </button>
          <div className="mt-2 text-[10px] text-slate-600 leading-snug">
            PNG 16:9 a piena risoluzione. Usa scroll per zoom, trascina per pan.
          </div>

          {/* Zoom reset */}
          <button onClick={() => setVb({ x: 0, y: 0, w: MAP_W, h: MAP_H })}
            className="mt-2 w-full py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 transition-colors">
            Reset zoom
          </button>
        </div>

        {/* Tips */}
        <div className="p-4 border-t border-slate-800/60 text-[10px] text-slate-600 leading-relaxed space-y-1">
          <div>🗺 <strong className="text-slate-500">Territorio:</strong> click paese per selezionarlo</div>
          <div>➜ <strong className="text-slate-500">Freccia:</strong> due click per disegnare</div>
          <div>📍 <strong className="text-slate-500">Etichetta:</strong> click sulla mappa</div>
          <div>⏱ <strong className="text-slate-500">Timeline:</strong> imposta entra/esce nel pannello</div>
          <div>🔍 Scroll per zoom • trascina per pan</div>
        </div>
      </div>

      {/* ── TITLE DRAFT MODAL ──────────────────────────── */}
      <AnimatePresence>
        {titleDraftOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setTitleDraftOpen(false)}>
            <motion.div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-96 shadow-2xl space-y-4"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}>
              <div className="text-base font-semibold">Aggiungi Titolo / Card</div>
              <div className="space-y-3">
                <input autoFocus value={titleText} onChange={e => setTitleText(e.target.value)}
                  placeholder="Titolo principale…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-[var(--cv-accent)]"
                  onKeyDown={e => e.key === 'Enter' && commitTitle()} />
                <input value={titleSub} onChange={e => setTitleSub(e.target.value)}
                  placeholder="Sottotitolo (opzionale)…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-[var(--cv-accent)]" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTitleDraftOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm">Annulla</button>
                <button onClick={commitTitle}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: style.accentDefault, color: style.dark ? '#000' : '#fff' }}>
                  Aggiungi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

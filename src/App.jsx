import React, { useState, useRef, useEffect } from 'react';
import Globe from 'globe.gl';
import html2canvas from 'html2canvas';
import { motion, Reorder } from 'framer-motion';
import {
  Play, Pause, Download, Image as ImageIcon, Plus, Trash2, Edit2,
  MapPin, RotateCcw, Settings
} from 'lucide-react';

const CATEGORY_COLORS = {
  'Economia': '#22c55e',
  'Conflitto': '#ef4444',
  'Politica': '#a855f7',
  'Clima': '#14b8a6',
  'Tecnologia': '#3b82f6',
};

const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);

const SAMPLE_NEWS = [
  {
    id: 1,
    title: "Tensioni al confine ucraino: nuove manovre militari",
    text: "La Russia ha intensificato le esercitazioni vicino al confine con l'Ucraina. L'UE chiede de-escalation immediata.",
    category: "Conflitto",
    date: "2026-05-28",
    source: "Reuters",
    nation: "Ucraina",
    lat: 50.4501,
    lng: 30.5234
  },
  {
    id: 2,
    title: "Vertice G7 su Taiwan: Pechino risponde con esercitazioni navali",
    text: "I leader del G7 ribadiscono il sostegno a Taipei. La Cina annuncia manovre militari su larga scala nello stretto.",
    category: "Politica",
    date: "2026-05-27",
    source: "Bloomberg",
    nation: "Taiwan",
    lat: 25.0330,
    lng: 121.5654
  },
  {
    id: 3,
    title: "Crisi petrolifera: prezzi del Brent oltre i 92$ al barile",
    text: "L'OPEC+ riduce la produzione. I mercati asiatici reagiscono con forti oscillazioni.",
    category: "Economia",
    date: "2026-05-29",
    source: "Financial Times",
    nation: "Arabia Saudita",
    lat: 24.7136,
    lng: 46.6753
  },
  {
    id: 4,
    title: "Accordo storico sul clima: 190 nazioni firmano il nuovo patto",
    text: "Al vertice di Nairobi si raggiunge l'intesa per ridurre le emissioni del 45% entro il 2035.",
    category: "Clima",
    date: "2026-05-30",
    source: "The Guardian",
    nation: "Kenya",
    lat: -1.2921,
    lng: 36.8219
  }
];

function App() {
  const [news, setNews] = useState(() => {
    try {
      const saved = localStorage.getItem('georeel-news');
      return saved ? JSON.parse(saved) : SAMPLE_NEWS;
    } catch {
      return SAMPLE_NEWS;
    }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  // Renamed to avoid conflict with wrapper below
  const [isPickingLocation, _setIsPickingLocation] = useState(false);
  const [formData, setFormData] = useState({
    title: '', text: '', category: 'Conflitto', date: '', source: '', nation: '', lat: 40.7128, lng: -74.0060
  });

  const [theme, setTheme] = useState({
    cardBg: '#0f172a',
    titleColor: '#f8fafc',
    textColor: '#94a3b8',
    accentColor: '#0ea5e9',
    pinStyle: 'dot',
    titleFont: 'Playfair Display'
  });

  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formError, setFormError] = useState('');

  const globeEl = useRef(null);
  const globeInstance = useRef(null);
  const phoneRef = useRef(null);
  const intervalRef = useRef(null);
  // Refs for values used inside stale closures (globe init useEffect with [] deps)
  const isPickingLocationRef = useRef(false);
  const newsRef = useRef(news);

  // Keep newsRef current so the globe click handler always sees the latest list
  useEffect(() => { newsRef.current = news; }, [news]);

  // Wrapper that keeps both state and ref in sync
  const setIsPickingLocation = (val) => {
    isPickingLocationRef.current = val;
    _setIsPickingLocation(val);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2100);
  };

  const showConfirm = (message, onConfirm) => {
    setConfirmDialog({ message, onConfirm });
  };

  // Persist news to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('georeel-news', JSON.stringify(news)); } catch {}
  }, [news]);

  // Initialize Globe
  useEffect(() => {
    if (!globeEl.current || globeInstance.current) return;

    const globe = Globe()(globeEl.current)
      .width(336)
      .height(616)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .atmosphereColor('#60a5fa')
      .atmosphereAltitude(0.18)
      .backgroundColor('#020617')
      .showGraticules(false)
      .showAtmosphere(true)
      .pointOfView({ lat: 25, lng: 10, altitude: 2.2 }, 0)
      .pointColor(d => d.color || '#ef4444')
      .pointAltitude(0.012)
      .pointRadius(0.55)
      .pointsTransitionDuration(400)
      .onGlobeClick((lat, lng) => {
        // Use ref instead of captured state to avoid stale closure
        if (isPickingLocationRef.current) {
          const roundedLat = parseFloat(lat.toFixed(4));
          const roundedLng = parseFloat(lng.toFixed(4));

          setFormData(prev => ({ ...prev, lat: roundedLat, lng: roundedLng }));

          // Update both ref and state directly (wrappers not available in stale closure)
          isPickingLocationRef.current = false;
          _setIsPickingLocation(false);

          setToast({ message: `📍 Posizione impostata: ${roundedLat}°, ${roundedLng}°`, type: 'success' });
          setTimeout(() => setToast(null), 2100);
        }
      })
      .onPointClick((point) => {
        // Use newsRef so this always finds the correct index even after news changes
        const foundIndex = newsRef.current.findIndex(n => n.id === point.id);
        if (foundIndex !== -1) {
          setCurrentIndex(foundIndex);
          globe.pointOfView({
            lat: point.lat,
            lng: point.lng,
            altitude: 0.85
          }, 900);
        }
      });

    globeInstance.current = globe;

    updateGlobePoints(news, globe);

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.12;

    return () => {
      globeInstance.current = null;
    };
  }, []);

  const updateGlobePoints = (currentNews, globe = globeInstance.current) => {
    if (!globe) return;

    const pointsData = currentNews.map((item, idx) => ({
      ...item,
      color: CATEGORY_COLORS[item.category] || '#64748b',
      size: idx === currentIndex ? 0.85 : 0.55
    }));

    globe
      .pointsData(pointsData)
      .pointRadius(d => d.size)
      .pointColor(d => d.color);
  };

  useEffect(() => {
    if (globeInstance.current) {
      updateGlobePoints(news);
    }
  }, [news, currentIndex]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getCategoryColor = (cat) => CATEGORY_COLORS[cat] || '#64748b';

  const openAddModal = () => {
    setEditingNews(null);
    setFormError('');
    setFormData({
      title: '',
      text: '',
      category: 'Conflitto',
      date: new Date().toISOString().split('T')[0],
      source: '',
      nation: '',
      lat: 41.9028,
      lng: 12.4964
    });
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

  const closeModal = () => {
    setShowModal(false);
    setFormError('');
    setIsPickingLocation(false);
  };

  const saveNews = () => {
    if (!formData.title.trim() || !formData.text.trim()) {
      setFormError("Titolo e descrizione sono obbligatori");
      return;
    }

    setFormError('');

    const newItem = {
      ...formData,
      id: editingNews ? editingNews.id : Date.now(),
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng)
    };

    if (editingNews) {
      setNews(prev => prev.map(n => n.id === editingNews.id ? newItem : n));
    } else {
      setNews(prev => [...prev, newItem]);
    }

    closeModal();
  };

  const deleteNews = (id) => {
    showConfirm("Eliminare questa notizia?", () => {
      setNews(prev => {
        const filtered = prev.filter(n => n.id !== id);
        if (currentIndex >= filtered.length) {
          setCurrentIndex(Math.max(0, filtered.length - 1));
        }
        return filtered;
      });
    });
  };

  const selectNews = (index) => {
    setCurrentIndex(index);
    const item = news[index];
    if (globeInstance.current && item) {
      globeInstance.current.pointOfView({
        lat: item.lat,
        lng: item.lng,
        altitude: 0.82
      }, 1100);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPlaying(false);
      if (globeInstance.current) {
        globeInstance.current.controls().autoRotate = true;
      }
    } else {
      if (news.length === 0) {
        showToast("Aggiungi almeno una notizia per avviare l'anteprima!", 'error');
        return;
      }
      startPreviewSequence();
    }
  };

  const startPreviewSequence = () => {
    if (!globeInstance.current || news.length === 0) return;

    setIsPlaying(true);
    setCurrentIndex(0);
    globeInstance.current.controls().autoRotate = false;

    const firstNews = news[0];
    globeInstance.current.pointOfView({
      lat: firstNews.lat,
      lng: firstNews.lng,
      altitude: 0.78
    }, 700);

    let idx = 0;

    intervalRef.current = setInterval(() => {
      idx = (idx + 1) % news.length;
      setCurrentIndex(idx);

      const currentNewsItem = news[idx];
      if (globeInstance.current && currentNewsItem) {
        globeInstance.current.pointOfView({
          lat: currentNewsItem.lat,
          lng: currentNewsItem.lng,
          altitude: 0.78
        }, 1050);
      }
    }, 3600);
  };

  const resetCamera = () => {
    if (globeInstance.current) {
      globeInstance.current.pointOfView({ lat: 20, lng: 5, altitude: 2.1 }, 1200);
      globeInstance.current.controls().autoRotate = true;
      globeInstance.current.controls().autoRotateSpeed = 0.1;
    }
    setCurrentIndex(0);
  };

  const generateVideo = () => {
    if (!globeInstance.current || news.length === 0) {
      showToast("Aggiungi notizie prima di generare il video!", 'error');
      return;
    }

    const canvas = globeEl.current?.querySelector('canvas');
    if (!canvas || !canvas.captureStream) {
      showToast("Questo browser non supporta la cattura video dal canvas", 'error');
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
      ? 'video/webm; codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : null;

    if (!mimeType) {
      showToast("Formato video non supportato da questo browser", 'error');
      return;
    }

    setIsExporting(true);
    startPreviewSequence();

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GeoReel_${new Date().toISOString().slice(0,10)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPlaying(false);

      setTimeout(() => {
        if (globeInstance.current) {
          globeInstance.current.pointOfView({ lat: 25, lng: 10, altitude: 2.0 }, 800);
          globeInstance.current.controls().autoRotate = true;
        }
      }, 600);
    };

    recorder.start();

    const totalDuration = (news.length * 3600) + 2200;
    setTimeout(() => recorder.stop(), totalDuration);
  };

  const downloadCurrentFrame = async () => {
    if (!phoneRef.current) return;

    try {
      const canvas = await html2canvas(phoneRef.current, {
        scale: 2.5,
        backgroundColor: '#020617',
        logging: false
      });

      const link = document.createElement('a');
      link.download = `GeoReel_Frame_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 0.95);
      link.click();
    } catch (err) {
      showToast("Errore durante l'esportazione dell'immagine", 'error');
      console.error(err);
    }
  };

  const loadSampleData = () => {
    showConfirm("Caricare i dati di esempio? (sostituirà le notizie attuali)", () => {
      setNews(SAMPLE_NEWS);
      setCurrentIndex(0);
      if (globeInstance.current) {
        globeInstance.current.pointOfView({ lat: 25, lng: 10, altitude: 2.1 }, 900);
      }
    });
  };

  const currentNews = news[currentIndex] || null;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl z-50">
        <div className="max-w-[1480px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-2xl tracking-tighter">GeoReel</div>
                <div className="text-[10px] text-slate-500 -mt-1">GEOPOLITICAL STORYTELLING</div>
              </div>
            </div>
            <div className="px-3 py-1 text-xs rounded-full bg-slate-800 text-emerald-400 font-mono">MVP v1.0</div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={loadSampleData}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" /> Carica Esempi
            </button>
            <a href="https://github.com/alfierocivita/georeel" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden max-w-[1480px] mx-auto w-full">

        {/* LEFT SIDEBAR - Controls */}
        <div className="w-80 border-r border-slate-800 bg-slate-950 flex flex-col">
          <div className="p-6 flex-1 overflow-auto">
            {/* Add News Button */}
            <button
              onClick={openAddModal}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-950 hover:bg-slate-100 active:bg-white transition-all font-semibold py-3.5 rounded-3xl text-sm mb-8 shadow-xl shadow-black/50"
            >
              <Plus className="w-5 h-5" />
              AGGIUNGI NOTIZIA
            </button>

            {/* News List */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="uppercase tracking-[1.5px] text-xs font-semibold text-slate-400">LE TUE NOTIZIE ({news.length})</div>
                <div className="text-[10px] text-slate-500">Trascina per riordinare</div>
              </div>

              {news.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-700 rounded-3xl">
                  Nessuna notizia.<br />Aggiungine una per iniziare.
                </div>
              ) : (
                <Reorder.Group
                  axis="y"
                  values={news}
                  onReorder={setNews}
                  className="space-y-2"
                >
                  {news.map((item, index) => (
                    <Reorder.Item
                      key={item.id}
                      value={item}
                      className={`group flex items-start gap-3 p-4 rounded-3xl cursor-grab active:cursor-grabbing transition-all border ${
                        index === currentIndex
                          ? 'bg-slate-800 border-sky-500/50'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                      whileDrag={{ scale: 1.01, boxShadow: "0 10px 30px -15px rgb(15 23 42)" }}
                    >
                      <div
                        className="w-3 h-3 mt-1.5 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-offset-slate-950"
                        style={{ backgroundColor: getCategoryColor(item.category), ringColor: getCategoryColor(item.category) + '40' }}
                      />

                      <div className="flex-1 min-w-0" onClick={() => selectNews(index)}>
                        <div className="font-semibold text-sm leading-tight line-clamp-2 pr-2">{item.title}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="tag text-[9px] px-2 py-px font-mono"
                            style={{
                              backgroundColor: getCategoryColor(item.category) + '22',
                              color: getCategoryColor(item.category)
                            }}
                          >
                            {item.category}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{item.nation}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                          className="p-1.5 hover:bg-slate-700 rounded-xl"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNews(item.id); }}
                          className="p-1.5 hover:bg-red-950 text-red-400 hover:text-red-500 rounded-xl"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}
            </div>

            {/* Design Panel */}
            <div>
              <div className="flex items-center gap-2 mb-4 px-1">
                <Settings className="w-4 h-4 text-slate-400" />
                <div className="uppercase tracking-[1.5px] text-xs font-semibold text-slate-400">PERSONALIZZAZIONE</div>
              </div>

              <div className="space-y-5 bg-slate-900 rounded-3xl p-5 text-sm">
                {/* Font Selection */}
                <div>
                  <div className="text-xs text-slate-400 mb-2">FONT TITOLO</div>
                  <select
                    value={theme.titleFont}
                    onChange={(e) => setTheme(prev => ({ ...prev, titleFont: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-sky-500"
                  >
                    <option value="Playfair Display">Playfair Display — Classico</option>
                    <option value="Inter">Inter — Moderno</option>
                    <option value="Space Grotesk">Space Grotesk — Tech</option>
                  </select>
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-2">COLORE CARD</div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.cardBg}
                        onChange={(e) => setTheme(prev => ({ ...prev, cardBg: e.target.value }))}
                        className="w-9 h-9 rounded-2xl overflow-hidden border border-slate-700 p-0.5 bg-transparent"
                      />
                      <div className="text-xs font-mono text-slate-500">{theme.cardBg}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-2">ACCENTO / PIN</div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={(e) => setTheme(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-9 h-9 rounded-2xl overflow-hidden border border-slate-700 p-0.5 bg-transparent"
                      />
                      <div className="text-xs font-mono text-slate-500">{theme.accentColor}</div>
                    </div>
                  </div>
                </div>

                {/* Pin Style */}
                <div>
                  <div className="text-xs text-slate-400 mb-2">STILE PIN SUL GLOBO</div>
                  <div className="flex gap-2">
                    {['dot', 'marker', 'pulse'].map(style => (
                      <button
                        key={style}
                        onClick={() => setTheme(prev => ({ ...prev, pinStyle: style }))}
                        className={`flex-1 py-2 text-xs rounded-2xl border transition-all ${theme.pinStyle === style
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-slate-700 hover:border-slate-600'}`}
                      >
                        {style === 'dot' && '● Punto'}
                        {style === 'marker' && '📍 Marker'}
                        {style === 'pulse' && '◉ Pulse'}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1.5 px-1">* L'animazione pulse è visibile durante l'anteprima</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-800 text-[10px] text-slate-500">
            GeoReel Generator • Client-side only • Best in Chrome
          </div>
        </div>

        {/* CENTER VIEWPORT - Phone Simulator */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0f1e] p-8 relative overflow-hidden">
          <div className="mb-6 flex items-center gap-3">
            <div className="px-4 py-1 rounded-3xl bg-slate-900 text-xs flex items-center gap-2 border border-slate-700">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> LIVE PREVIEW
            </div>
            <div className="text-xs text-slate-400 font-mono">9:16 • 360×640</div>
          </div>

          <div ref={phoneRef} className="phone-frame">
            <div className="globe-container relative" ref={globeEl}>
              {/* Overlay for picking mode */}
              {isPickingLocation && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <div className="text-center px-8">
                    <div className="mx-auto w-16 h-16 rounded-3xl border-4 border-dashed border-white/60 flex items-center justify-center mb-6">
                      <MapPin className="w-9 h-9 text-white" />
                    </div>
                    <div className="text-white text-xl font-semibold tracking-tight">Clicca sul globo</div>
                    <div className="text-slate-400 mt-2 text-sm max-w-[220px]">Seleziona la posizione geografica per la notizia</div>
                  </div>
                </div>
              )}

              {/* Current News Card Overlay */}
              {currentNews && (
                <motion.div
                  key={currentNews.id}
                  initial={{ opacity: 0, y: 30, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                  className="news-card"
                  style={{
                    backgroundColor: theme.cardBg,
                    '--accent': theme.accentColor
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span
                        className="tag"
                        style={{
                          backgroundColor: getCategoryColor(currentNews.category) + '30',
                          color: getCategoryColor(currentNews.category)
                        }}
                      >
                        {currentNews.category.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono tabular-nums">{currentNews.date}</div>
                  </div>

                  <h3
                    className="leading-snug tracking-[-0.2px]"
                    style={{
                      color: theme.titleColor,
                      fontFamily: theme.titleFont === 'Playfair Display' ? "'Playfair Display', Georgia, serif" :
                                  theme.titleFont === 'Space Grotesk' ? "'Space Grotesk', system-ui, sans-serif" : 'Inter, system-ui, sans-serif',
                      fontWeight: theme.titleFont === 'Playfair Display' ? 700 : 600
                    }}
                  >
                    {currentNews.title}
                  </h3>

                  <p style={{ color: theme.textColor }} className="line-clamp-3 text-[12.5px] leading-snug">
                    {currentNews.text}
                  </p>

                  <div className="flex items-center justify-between text-[10px] mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <MapPin className="w-3 h-3" /> {currentNews.nation}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">{currentNews.source}</div>
                  </div>
                </motion.div>
              )}

              {/* Progress indicator during play */}
              {isPlaying && news.length > 0 && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/70 px-4 py-1 rounded-3xl text-xs backdrop-blur-md border border-white/10">
                  <div className="flex-1 h-px w-8 bg-white/30" />
                  <span className="font-mono tabular-nums tracking-[1px]">{currentIndex + 1} / {news.length}</span>
                  <div className="flex-1 h-px w-8 bg-white/30" />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 text-center">
            <div className="text-[10px] text-slate-500">Clicca sui pin • Trascina le notizie per cambiare ordine</div>
          </div>
        </div>

        {/* RIGHT SIDEBAR - Preview & Export */}
        <div className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col">
          <div className="p-6 flex-1 flex flex-col">
            <div className="uppercase tracking-[1.5px] text-xs font-semibold text-slate-400 mb-4 px-1">ANTEPRIMA &amp; ESPORTAZIONE</div>

            {/* Play Controls */}
            <div className="bg-slate-900 rounded-3xl p-5 mb-6">
              <div className="text-xs text-slate-400 mb-4">SEQUENZA REEL</div>

              <button
                onClick={togglePlay}
                disabled={news.length === 0}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-3xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:brightness-110 active:scale-[0.985] disabled:from-slate-700 disabled:to-slate-700 transition-all text-sm font-semibold shadow-xl disabled:shadow-none"
              >
                {isPlaying ? (
                  <> <Pause className="w-5 h-5" /> PAUSA ANTEPRIMA </>
                ) : (
                  <> <Play className="w-5 h-5" /> AVVIA PREVIEW </>
                )}
              </button>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={resetCamera}
                  className="flex-1 py-3 text-xs rounded-3xl border border-slate-700 hover:bg-slate-800 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> RESET CAMERA
                </button>
                <button
                  onClick={() => {
                    if (currentNews && globeInstance.current) {
                      globeInstance.current.pointOfView({
                        lat: currentNews.lat,
                        lng: currentNews.lng,
                        altitude: 0.65
                      }, 700);
                    }
                  }}
                  disabled={!currentNews}
                  className="flex-1 py-3 text-xs rounded-3xl border border-slate-700 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5" /> ZOOM PIN
                </button>
              </div>
            </div>

            {/* Export Section */}
            <div className="mt-auto">
              <div className="uppercase tracking-[1.5px] text-xs font-semibold text-slate-400 mb-3 px-1">ESPORTA</div>

              <div className="space-y-3">
                <button
                  onClick={generateVideo}
                  disabled={isExporting || news.length === 0}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-3xl bg-white text-slate-950 font-semibold text-sm disabled:bg-slate-700 disabled:text-slate-400 hover:bg-slate-100 active:bg-white transition-all"
                >
                  {isExporting ? (
                    <>⏳ GENERAZIONE IN CORSO...</>
                  ) : (
                    <> <Download className="w-4 h-4" /> GENERA VIDEO (WEBM) </>
                  )}
                </button>

                <button
                  onClick={downloadCurrentFrame}
                  disabled={!currentNews}
                  className="w-full flex items-center justify-center gap-3 py-3.5 text-sm rounded-3xl border border-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-all"
                >
                  <ImageIcon className="w-4 h-4" /> SCARICA FRAME CORRENTE (PNG)
                </button>
              </div>

              <div className="mt-6 text-[10px] leading-snug text-slate-500 px-1">
                Il video viene registrato direttamente nel browser usando WebGL capture.<br />
                Formato WebM • Converti in MP4 con <span className="underline">CloudConvert</span> se necessario.
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-800 text-[10px] text-center text-slate-500">
            Realizzato con React + globe.gl + Three.js<br />
            100% client-side • Nessun dato inviato al server
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6" onClick={closeModal}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="modal w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden border border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {editingNews ? 'Modifica Notizia' : 'Nuova Notizia Geopolitica'}
                  </div>
                  <div className="text-sm text-slate-400">Dati che appariranno sulla card del Reel</div>
                </div>
                <button onClick={closeModal} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {/* Form validation error */}
              {formError && (
                <div className="mb-5 px-4 py-3 rounded-2xl bg-red-950/60 border border-red-800/50 text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">TITOLO DELLA NOTIZIA</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="Es: Nuovo accordo commerciale tra UE e ASEAN"
                    className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">DESCRIZIONE BREVE (max 3 righe)</label>
                  <textarea
                    value={formData.text}
                    onChange={(e) => setFormData({...formData, text: e.target.value})}
                    rows={3}
                    placeholder="Riassunto conciso dell'evento geopolitico..."
                    className="w-full resize-y min-h-[78px] bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm placeholder:text-slate-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">CATEGORIA</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm"
                    >
                      {CATEGORY_OPTIONS.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">DATA</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">NAZIONE / REGIONE</label>
                    <input
                      type="text"
                      value={formData.nation}
                      onChange={(e) => setFormData({...formData, nation: e.target.value})}
                      placeholder="Ucraina"
                      className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">FONTE</label>
                    <input
                      type="text"
                      value={formData.source}
                      onChange={(e) => setFormData({...formData, source: e.target.value})}
                      placeholder="Reuters / BBC"
                      className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm"
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400">POSIZIONE GEOGRAFICA</label>
                    <button
                      type="button"
                      onClick={() => setIsPickingLocation(true)}
                      className="text-xs flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" /> SELEZIONA SUL GLOBO
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-1">LATITUDINE</div>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.lat}
                        onChange={(e) => setFormData({...formData, lat: parseFloat(e.target.value) || 0})}
                        className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 mb-1">LONGITUDINE</div>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.lng}
                        onChange={(e) => setFormData({...formData, lng: parseFloat(e.target.value) || 0})}
                        className="w-full bg-slate-800 border border-slate-700 focus:border-sky-500 rounded-2xl px-5 py-3 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1.5">Oppure clicca "Seleziona sul Globo" e poi sul punto desiderato.</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 px-8 py-5 flex gap-3 border-t border-slate-700">
              <button
                onClick={closeModal}
                className="flex-1 py-3 rounded-2xl border border-slate-700 hover:bg-slate-900 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                onClick={saveNews}
                className="flex-1 py-3 rounded-2xl bg-white text-slate-950 font-semibold text-sm"
              >
                {editingNews ? 'AGGIORNA NOTIZIA' : 'AGGIUNGI AL REEL'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Export Overlay */}
      {isExporting && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto w-20 h-20 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-8" />
            <div className="text-3xl font-semibold tracking-tight mb-3">Generazione Reel in corso...</div>
            <div className="text-slate-400 max-w-xs mx-auto">Stiamo catturando ogni fotogramma del tuo video geopolitico. Non chiudere la finestra.</div>
            <div className="mt-8 text-xs text-slate-500">Durata stimata: ~{Math.ceil(news.length * 3.6)} secondi</div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-2.5 rounded-full text-sm font-medium text-white pointer-events-none ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.message}
        </motion.div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/80 z-[250] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 rounded-3xl border border-slate-700 p-8 max-w-sm w-full"
          >
            <p className="text-slate-200 text-sm mb-6 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-3 rounded-2xl border border-slate-700 hover:bg-slate-800 text-sm transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
              >
                Conferma
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default App;

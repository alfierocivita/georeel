# GeoReel Generator

**Single Page Application** per creare Reel/TikTok geopolitici con globo 3D realistico.

- Globo 3D con texture NASA Blue Marble
- Pin interattivi cliccabili per categoria
- Card notizie animate con font personalizzabile
- Esportazione video (WebM via MediaRecorder) e immagini PNG
- 100% client-side (nessun backend, nessun dato inviato)

## Deploy su Cloudflare Pages

### Metodo Direct Upload (senza Git)

```bash
npm install
npm run build
```

Vai su [Cloudflare Pages](https://pages.cloudflare.com) → **Create a project** → **Direct Upload** → trascina la cartella **`dist`** → Deploy.

---

### Metodo GitHub (consigliato per aggiornamenti futuri)

1. Crea un repo GitHub e carica i file del progetto
2. Su Cloudflare Pages → **Connect to Git** → seleziona il repo
3. Nella schermata di configurazione build imposta:

   | Campo | Valore |
   |---|---|
   | **Framework preset** | None |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |

4. In **Environment variables** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `NODE_VERSION` | `18` |

5. Clicca **Save and Deploy**

> **Nota:** senza configurare il build command, Cloudflare serve i file sorgente `.jsx` direttamente, causando l'errore MIME type. La cartella `dist/` con i file compilati è quella corretta da servire.

---

## Sviluppo locale

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build di produzione
npm run preview   # anteprima della build
```

## Stack

- React 19 + Vite 8
- globe.gl + Three.js
- Tailwind CSS 3
- Framer Motion 11
- html2canvas (export PNG)
- MediaRecorder API (export WebM)

# 🌍 GeoReel Generator

**Single Page Application** per creare Reel/TikTok geopolitici con globo 3D realistico.

- Globo 3D con texture NASA Blue Marble
- Pin interattivi cliccabili
- Card notizie animate
- Esportazione video (WebM) e immagini
- 100% client-side (nessun backend)

## 🚀 Deploy su Cloudflare Pages (5 minuti)

### Metodo più veloce (senza Git):

1. **Sul tuo computer** crea una cartella `georeel`
2. Copia **tutti i file** di questo progetto dentro la cartella
3. Apri il terminale nella cartella e esegui:
   ```bash
   npm install
   npm run build
   ```
4. Vai su [Cloudflare Pages](https://pages.cloudflare.com)
5. Clicca **"Create a project"** → **"Direct Upload"**
6. Trascina la cartella **`dist`** che è stata creata
7. Clicca **Deploy**

Fatto! Il tuo GeoReel sarà online in pochi secondi.

### Metodo con GitHub (consigliato per aggiornamenti futuri):

1. Crea un nuovo repository su GitHub
2. Carica tutti i file di questo progetto
3. Su Cloudflare Pages → **Connect to Git**
4. Seleziona il repo → **Save and Deploy**

---

## Comandi utili

| Comando              | Descrizione                     |
|----------------------|---------------------------------|
| `npm run dev`        | Avvia in locale (http://localhost:5173) |
| `npm run build`      | Crea la versione per deploy     |
| `npm run preview`    | Anteprima della build           |

## Stack

- React 19 + Vite
- globe.gl (Three.js)
- Tailwind CSS
- Framer Motion
- ccapture.js + html2canvas

---

**Creato con ❤️ da Grok**  
Pronto per essere deployato su Cloudflare Pages in meno di 5 minuti.

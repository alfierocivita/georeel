import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split big vendors into separate, cacheable chunks so the app shell and
        // the globe can download in parallel (and stay cached across deploys).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('mediabunny')) return 'mediabunny';      // lazy: only on export
          if (id.includes('three') || id.includes('globe')) return 'globe';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('world-atlas') || id.includes('topojson')) return 'geo';
          if (id.includes('react')) return 'react';
        },
      },
    },
  },
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is a pure static front-end: all data is loaded from /data/*.json at runtime
// so that new exploration sites can be added without touching the UI code.
// `VITE_BASE` lets one build target a domain root ("/", the default) or a
// sub-path such as GitHub Pages project sites ("/Space_story/").
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Sandbox / tunnel previews arrive through a proxied host name.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 900,
  },
});

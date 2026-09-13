import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Bébé Baby Shower Planner',
          short_name: 'Bébé Planner',
          description: 'Baby shower invitations, RSVPs, seating, guestbook and photo sharing.',
          theme_color: '#8B735B',
          background_color: '#FDFBF7',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          // The 3D view (three.js stack) is lazy-loaded on first use; keep it
          // out of the install precache so PWA visitors don't download ~250KB
          // (gzip) they may never open. It still loads on demand + gets cached
          // by the browser's HTTP cache when the user actually toggles 3D.
          globIgnores: ['**/FloorPlan3D-*.js'],
          runtimeCaching: [
            // API calls: network first, fall back to cache offline
            {
              urlPattern: /\/api\/.*/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          // Group vendors into cacheable chunks instead of one ~2 MB entry +
          // dozens of single-icon fragments. The lazily-loaded 3D stack is
          // deliberately left unnamed so it stays inside the FloorPlan3D chunk
          // that the PWA precache ignores.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/three/') || id.includes('@react-three') || id.includes('three-stdlib')) return;
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
            if (id.includes('/motion') || id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts';
            if (id.includes('@tanstack')) return 'vendor-tanstack';
            if (id.includes('@dnd-kit')) return 'vendor-dnd';
            if (id.includes('konva')) return 'vendor-konva';
            if (id.includes('pocketbase')) return 'vendor-pocketbase';
            if (id.includes('i18next')) return 'vendor-i18n';
            if (id.includes('date-fns')) return 'vendor-date';
            if (id.includes('zod')) return 'vendor-zod';
            if (id.includes('jszip')) return 'vendor-zip';
            // Everything else (incl. the three.js/drei stack) is left unnamed so
            // Rollup keeps it with its importer — the 3D deps stay inside the
            // FloorPlan3D chunk that the precache ignores.
            return;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

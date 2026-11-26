import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ARENA_API || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from other devices on the LAN (projector, buzzers)
    proxy: {
      '/api': { target, changeOrigin: true },
      '/uploads': { target, changeOrigin: true },
      '/socket.io': { target, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});

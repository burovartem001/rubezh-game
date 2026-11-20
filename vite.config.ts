import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — сборка работает из любого префикса пути (например, /game на основном сайте)
export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
    fs: { allow: ['..'] },
  },
});

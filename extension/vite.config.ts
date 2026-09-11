import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import path from 'path';


export default defineConfig({
  plugins: [
    react(), 
    crx({ manifest })
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        offscreen: 'offscreen.html',
      },
    },
  },
});

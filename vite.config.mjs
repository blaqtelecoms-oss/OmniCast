import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const previewMode = process.env.BASE44_PREVIEW_MODE === '1';

// Only extend the host allowlist for the sandbox preview; a normal local
// `npm run dev` keeps Vite's default behaviour.
const allowedHosts = previewMode
  ? ['.' + process.env.BASE44_SANDBOX_HOST_DOMAIN, 'localhost', '127.0.0.1']
  : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://api:8787',
        changeOrigin: true,
      },
    },
  },
});

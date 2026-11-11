import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, API calls go to the API server (pnpm dev:api).
const api = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/v1': api, '/health': api } },
});

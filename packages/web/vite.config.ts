import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { registryModule } from './registry-alias.ts';

// In dev, API calls go to the API server (pnpm dev:api).
const api = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@jtd/registry': registryModule(process.env) } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/v1': api, '/health': api } },
});

import { defineConfig } from '@playwright/test';

const PORT = 8792;

/** E2E against the production build served by the real API server. */
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: `http://127.0.0.1:${PORT}`, browserName: 'chromium', trace: 'off' },
  projects: [
    { name: 'e2e', testIgnore: /screens\.spec\.ts/ },
    // README screenshots (URS-DOC-005): `pnpm docs:screens`.
    { name: 'screens', testMatch: /screens\.spec\.ts/, use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: 'pnpm build && node ../api/src/server.ts',
    env: { PORT: String(PORT), HOST: '127.0.0.1' },
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

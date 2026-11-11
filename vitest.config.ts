import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts', 'test/**/*.test.ts'],
    // URS-NF-005: core keeps ≥ 80 % line coverage.
    coverage: { provider: 'v8', include: ['packages/core/src/**'], reporter: ['text-summary'], thresholds: { lines: 80 } },
  },
});

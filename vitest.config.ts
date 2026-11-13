import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Web sources import the build-time registry module (URS-EXT-008); tests use the built-ins.
  resolve: { alias: { '@jtd/registry': '@jtd/core' } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts', 'test/**/*.test.ts'],
    // Timing budgets run on their own, without coverage (vitest.budget.config.ts).
    exclude: [...configDefaults.exclude, '**/*.budget.test.ts'],
    // URS-NF-005: core keeps ≥ 80 % line coverage.
    coverage: { provider: 'v8', include: ['packages/core/src/**'], reporter: ['text-summary'], thresholds: { lines: 80 } },
  },
});

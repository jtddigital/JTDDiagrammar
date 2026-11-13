import { defineConfig } from 'vitest/config';

// Timing budgets (URS-LY-010) run alone: coverage instrumentation and parallel test files would
// measure the test setup, not the layout. `pnpm test` runs this first, so arguments such as -u
// reach the main suite.
export default defineConfig({
  test: { include: ['packages/*/test/**/*.budget.test.ts'], fileParallelism: false },
});

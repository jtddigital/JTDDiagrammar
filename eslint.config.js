import tseslint from 'typescript-eslint';

const nodeBuiltins = ['node:*', ...['fs', 'path', 'os', 'url', 'util', 'crypto', 'stream', 'buffer', 'child_process', 'http', 'https'].flatMap((m) => [m, `${m}/*`])];

// URS-NF-001 (core is isomorphic) and URS-NF-009 (no AI SDK in core).
const corePatterns = [
  { group: nodeBuiltins, message: 'packages/core must stay isomorphic: no Node built-ins (URS-NF-001).' },
  { group: ['@anthropic-ai/*'], message: 'AI code belongs in packages/ai (URS-NF-009).' },
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: corePatterns }] },
  },
  {
    // URS-EXT-004: layout and render see only the IR, never diagram-type plugins.
    files: ['packages/core/src/layout/**/*.ts', 'packages/core/src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...corePatterns, { group: ['**/diagrams', '**/diagrams/**'], message: 'layout/render must not import diagram types (URS-EXT-004).' }] },
      ],
    },
  },
);

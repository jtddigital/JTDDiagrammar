import tseslint from 'typescript-eslint';

const nodeBuiltins = ['node:*', ...['fs', 'path', 'os', 'url', 'util', 'crypto', 'stream', 'buffer', 'child_process', 'http', 'https'].flatMap((m) => [m, `${m}/*`])];

// URS-NF-009: only packages/ai talks to the Anthropic SDK.
const sdk = { group: ['@anthropic-ai/*'], message: 'Only packages/ai may use the Anthropic SDK (URS-NF-009).' };
// URS-NF-001: core is isomorphic.
const corePatterns = [{ group: nodeBuiltins, message: 'packages/core must stay isomorphic: no Node built-ins (URS-NF-001).' }, sdk];
// Later blocks replace earlier ones for the same files, so each block lists every pattern that applies to it.
const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/test-results/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], ignores: ['packages/ai/**'], rules: restrict([sdk]) },
  { files: ['packages/core/src/**/*.ts'], rules: restrict(corePatterns) },
  {
    // URS-EXT-004: layout and render see only the IR, never diagram-type plugins.
    files: ['packages/core/src/layout/**/*.ts', 'packages/core/src/render/**/*.ts'],
    rules: restrict([...corePatterns, { group: ['**/diagrams', '**/diagrams/**'], message: 'layout/render must not import diagram types (URS-EXT-004).' }]),
  },
  {
    // URS-AI-010: the browser bundle never contains AI code or credentials handling.
    files: ['packages/web/src/**/*.ts', 'packages/web/src/**/*.tsx'],
    rules: restrict([sdk, { group: ['@jtd/ai', '@jtd/ai/*'], message: 'The web app calls /v1/generate; it never imports AI code (URS-AI-010).' }]),
  },
);

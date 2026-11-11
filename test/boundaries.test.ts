import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const errors = async (filePath: string, code: string) =>
  (await eslint.lintText(code, { filePath }))[0]!.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);

describe('module boundaries', () => {
  it('core may not import Node built-ins (URS-NF-001)', async () => {
    expect(await errors('packages/core/src/x.ts', "import { readFileSync } from 'node:fs';\nreadFileSync;")).toHaveLength(1);
    expect(await errors('packages/core/src/x.ts', "import path from 'path';\npath;")).toHaveLength(1);
  });

  it('core may not import the Anthropic SDK (URS-NF-009)', async () => {
    expect(await errors('packages/core/src/x.ts', "import A from '@anthropic-ai/sdk';\nA;")).toHaveLength(1);
  });

  it('layout and render may not import diagram types (URS-EXT-004)', async () => {
    expect(await errors('packages/core/src/layout/x.ts', "import { flowchart } from '../diagrams/flowchart/index.ts';\nflowchart;")).toHaveLength(1);
    expect(await errors('packages/core/src/render/svg/x.ts', "import type { GraphIR } from '../../ir/types.ts';\nexport type T = GraphIR;")).toHaveLength(0);
  });

  it('only packages/ai may import the Anthropic SDK (URS-NF-009)', async () => {
    expect(await errors('packages/api/src/x.ts', "import A from '@anthropic-ai/sdk';\nA;")).toHaveLength(1);
    expect(await errors('scripts/x.ts', "import A from '@anthropic-ai/sdk';\nA;")).toHaveLength(1);
    expect(await errors('packages/ai/src/x.ts', "import A from '@anthropic-ai/sdk';\nA;")).toHaveLength(0);
  });

  it('the web app never imports AI code (URS-AI-010)', async () => {
    expect(await errors('packages/web/src/x.tsx', "import { generate } from '@jtd/ai';\ngenerate;")).toHaveLength(1);
    expect(await errors('packages/web/src/x.ts', "import A from '@anthropic-ai/sdk';\nA;")).toHaveLength(1);
    expect(await errors('packages/api/src/x.ts', "import { generate } from '@jtd/ai';\ngenerate;")).toHaveLength(0);
  });

  it('code outside core may use Node built-ins', async () => {
    expect(await errors('scripts/x.ts', "import { readFileSync } from 'node:fs';\nreadFileSync;")).toHaveLength(0);
  });
});

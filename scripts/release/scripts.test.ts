import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ps1 = ['install.ps1', 'jtddiagrammar.ps1'].map((f) => [f, readFileSync(new URL(f, import.meta.url), 'utf8')] as const);

describe('Windows scripts (URS-NF-013)', () => {
  it.each(ps1)('%s passes no quoted code to native programs', (_f, src) => {
    // Windows PowerShell 5.1 strips double quotes from native arguments: `node -e '..."."...'` arrives broken.
    const code = src.split('\n').filter((l) => !/^\s*#/.test(l));
    for (const line of code.filter((l) => /&\s*(node|npx|corepack|pnpm|tar|winget|gh)\b/.test(l))) expect(line, line.trim()).not.toMatch(/'[^']*"[^']*'/);
    expect(code.join('\n')).not.toMatch(/node\s+-e\b/);
    // Defined in 5.1 script modules, which do not load when 5.1 is started from PowerShell 7 (inherited PSModulePath).
    expect(code.join('\n')).not.toMatch(/\b(Get-FileHash|New-Guid|Format-Hex|Import-PowerShellDataFile|ConvertFrom-SddlString)\b/);
  });
});

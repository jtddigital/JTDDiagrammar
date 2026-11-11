import { describe, expect, it } from 'vitest';
import { allowed } from './licences.ts';

describe('licence policy (URS-NF-007)', () => {
  it('accepts permissive licences and expressions', () => {
    for (const l of ['MIT', 'Apache-2.0', '(MIT OR GPL-3.0-or-later)', '(MIT AND Zlib)', 'BSD']) expect(allowed(l), l).toBe(true);
  });

  it('rejects copyleft-only and unknown licences', () => {
    for (const l of ['GPL-3.0', 'MPL-2.0', '(MIT AND GPL-2.0)', 'LGPL-2.1', 'UNKNOWN']) expect(allowed(l), l).toBe(false);
  });
});

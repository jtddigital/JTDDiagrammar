import { readFileSync, writeFileSync } from 'node:fs';
import { createRegistry } from '@jtd/core';
import { examplesSection, exampleProblems, replaceSection } from './readme.ts';

const mode = process.argv[2];
if (mode !== 'build' && mode !== 'check') throw new Error('usage: cli.ts build|check');

const file = new URL('../../README.md', import.meta.url);
const reg = createRegistry();
const problems = exampleProblems(reg);
const current = readFileSync(file, 'utf8');
const next = replaceSection(current, examplesSection(reg));

if (mode === 'build') writeFileSync(file, next);
else if (next !== current) problems.push('README examples are stale: run `pnpm docs:build`');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`docs ${mode}: ok`);

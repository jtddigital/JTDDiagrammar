import { isAbsolute, resolve } from 'node:path';

/**
 * Module that supplies `createRegistry()` to the web bundle, chosen at build time with the same
 * `REGISTRY_MODULE` variable the API reads (URS-EXT-008). Relative paths resolve from the working directory.
 */
export const registryModule = (env: Record<string, string | undefined>, cwd = process.cwd()): string => {
  const m = env.REGISTRY_MODULE ?? '@jtd/core';
  return m.startsWith('.') || isAbsolute(m) ? resolve(cwd, m) : m;
};

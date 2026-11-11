/** A validation/compile finding. `path` is a JSON Pointer into the source (URS-IN-004). */
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path: string;
}

export const error = (code: string, message: string, path = ''): Diagnostic => ({ severity: 'error', code, message, path });

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === 'error');

const escape = (s: string | number): string => String(s).replace(/~/g, '~0').replace(/\//g, '~1');

/** Build a JSON Pointer (RFC 6901), optionally extending `base`. */
export const pointer = (...segments: (string | number)[]): string => segments.map((s) => `/${escape(s)}`).join('');
export const child = (base: string, ...segments: (string | number)[]): string => base + pointer(...segments);

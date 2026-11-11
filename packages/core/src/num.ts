/** Stable number formatting for byte-identical output (URS-LY-001). */
export const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

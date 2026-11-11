/** Min/max without argument spreading, which overflows the stack on large arrays. */
export const min = (xs: readonly number[], empty = 0): number => (xs.length ? xs.reduce((a, b) => (b < a ? b : a)) : empty);
export const max = (xs: readonly number[], empty = 0): number => (xs.length ? xs.reduce((a, b) => (b > a ? b : a)) : empty);

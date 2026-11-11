/** Seeded random flowcharts for quality and performance checks. */
export function randomGraphs(): [string, unknown][] {
  const specs = [
    { name: 'random-30', n: 30, m: 45, lanes: 0, seed: 3 },
    { name: 'random-60-lanes', n: 60, m: 90, lanes: 4, seed: 11 },
    { name: 'random-200', n: 200, m: 300, lanes: 0, seed: 7 },
  ];
  return specs.map(({ name, n, m, lanes, seed }) => {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Step ${i}`, ...(lanes && { lane: `l${i % lanes}` }) }));
    const edges = Array.from({ length: m }, (_, i) => ({ from: `n${Math.floor(rnd() * n)}`, to: `n${Math.floor(rnd() * n)}`, ...(i % 5 === 0 && { label: `e${i}` }) }));
    const doc = { version: '1', type: 'flowchart', nodes, edges, ...(lanes && { lanes: Array.from({ length: lanes }, (_, i) => ({ id: `l${i}`, label: `Lane ${i}` })) }) };
    return [name, doc] as [string, unknown];
  });
}

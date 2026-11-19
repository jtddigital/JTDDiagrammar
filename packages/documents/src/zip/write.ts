import { utf8 } from '../utf8.ts';

/**
 * A `.zip` writer (URS-WS-005, D-007): files deflated by the given function (the browser passes one built on
 * `CompressionStream('deflate-raw')`), else stored; folders as empty entries; UTF-8 names. Enough for export;
 * it never reads archives.
 */
export interface ZipEntry {
  /** Path inside the archive, `/`-separated; a folder ends with `/`. */
  path: string;
  /** File content; absent for a folder. */
  text?: string;
  modified?: Date;
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE), as ZIP stores it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Raw DEFLATE (RFC 1951), without zlib or gzip framing. */
export type Deflate = (bytes: Uint8Array) => Promise<Uint8Array>;

/** MS-DOS time and date, as ZIP stores them (local time, two-second steps). */
const dos = (d: Date) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: (Math.max(1980, d.getFullYear()) - 1980) << 9 | ((d.getMonth() + 1) << 5) | d.getDate(),
});

/** The archive's bytes. */
export async function zip(entries: readonly ZipEntry[], deflate?: Deflate): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = utf8(e.path);
    const raw = e.text === undefined ? new Uint8Array() : utf8(e.text);
    const folder = e.text === undefined;
    const packed = !folder && deflate ? await deflate(raw) : raw;
    // Deflate only when it helps.
    const squeezed = packed.length < raw.length;
    const data = squeezed ? packed : raw;
    const crc = crc32(raw);
    const { time, date } = dos(e.modified ?? new Date());
    const method = squeezed ? 8 : 0;
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, method, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, raw.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([at, v, n]) => (n === 4 ? local.setUint32(at!, v!, true) : local.setUint16(at!, v!, true)));
    const head = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, method, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, raw.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, folder ? 0x10 : 0, 4], [42, offset, 4]].forEach(([at, v, n]) => (n === 4 ? head.setUint32(at!, v!, true) : head.setUint16(at!, v!, true)));
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, entries.length, 2], [10, entries.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]].forEach(([at, v, n]) => (n === 4 ? end.setUint32(at!, v!, true) : end.setUint16(at!, v!, true)));
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

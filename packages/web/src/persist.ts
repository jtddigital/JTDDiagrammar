/** Editor persistence and share links (URS-WEB-008). The link carries the source itself; nothing is stored on a server. */
const KEY = 'jtd:source';
const PREFIX = '#src=';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

export const encode = async (text: string) => b64url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
export const decode = async (s: string) => new TextDecoder().decode(await pipe(unb64url(s), new DecompressionStream('deflate-raw')));

/** URL that opens the app with this source. */
export const shareUrl = async (text: string) => `${location.origin}${location.pathname}${PREFIX}${await encode(text)}`;

/** Source from the share link, else the last saved session, else undefined. */
export async function restore(): Promise<string | undefined> {
  if (location.hash.startsWith(PREFIX)) {
    try {
      return await decode(location.hash.slice(PREFIX.length));
    } catch {
      /* A damaged link falls back to the saved session. */
    }
  }
  return localStorage.getItem(KEY) ?? undefined;
}

export const save = (text: string) => {
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* Storage full or disabled: persistence is best-effort. */
  }
};

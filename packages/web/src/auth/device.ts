/**
 * Microsoft device-code sign-in for Copilot (URS-AI-024), as `Connect-MgGraph -UseDeviceCode` does:
 * the user enters a short code on Microsoft's page, and this app's server relays the token requests.
 * Tokens live in this tab's session storage and go only to this app's API (URS-AI-010).
 */
export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

interface Session {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  account?: string;
}

interface TokenReply {
  pending?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  account?: string;
  diagnostics?: { message: string }[];
}

const KEY = 'jtd:microsoft';
/** Refresh this long before expiry. */
const MARGIN_MS = 120_000;

const load = (): Session | undefined => {
  try {
    return (JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null) ?? undefined;
  } catch {
    return undefined;
  }
};
const store = (s: Session) => sessionStorage.setItem(KEY, JSON.stringify(s));

async function post<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: 'POST', ...(body && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ...(signal && { signal }) });
  const out = (await res.json().catch(() => ({}))) as T & { diagnostics?: { message: string }[] };
  if (!res.ok) throw new Error(out.diagnostics?.[0]?.message ?? `Microsoft sign-in failed (${res.status})`);
  return out;
}

const keep = (r: TokenReply, prev?: Session): Session => ({
  accessToken: r.accessToken!,
  ...((r.refreshToken ?? prev?.refreshToken) && { refreshToken: r.refreshToken ?? prev?.refreshToken }),
  expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000,
  ...((r.account ?? prev?.account) && { account: r.account ?? prev?.account }),
});

/** Ask Microsoft for a code for the user to enter. */
export const startSignIn = () => post<DeviceCode>('/v1/auth/microsoft/device');

/** Wait until the user has entered the code; returns their name. */
export async function finishSignIn(code: DeviceCode, signal?: AbortSignal, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string | undefined> {
  const until = Date.now() + code.expiresIn * 1000;
  while (Date.now() < until) {
    await wait(code.interval * 1000);
    signal?.throwIfAborted();
    const r = await post<TokenReply>('/v1/auth/microsoft/token', { deviceCode: code.deviceCode }, signal);
    if (r.pending) continue;
    const s = keep(r);
    store(s);
    return s.account ?? 'your Microsoft account';
  }
  throw new Error('The sign-in code expired. Sign in again.');
}

/** Name of the signed-in account in this tab, if any. */
export const deviceAccount = () => load()?.account ?? (load() ? 'Microsoft account' : undefined);

export const deviceSignOut = () => sessionStorage.removeItem(KEY);

/** A current Graph token: the stored one, refreshed when close to expiry. */
export async function deviceToken(): Promise<string> {
  const s = load();
  if (!s) throw new Error('Sign in with Microsoft first.');
  if (s.expiresAt - MARGIN_MS > Date.now()) return s.accessToken;
  if (!s.refreshToken) {
    deviceSignOut();
    throw new Error('Your Microsoft sign-in expired. Sign in again.');
  }
  try {
    const next = keep(await post<TokenReply>('/v1/auth/microsoft/token', { refreshToken: s.refreshToken }), s);
    store(next);
    return next.accessToken;
  } catch (e) {
    deviceSignOut();
    throw e;
  }
}

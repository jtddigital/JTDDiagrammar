/** What `GET /v1/version` reports (URS-WEB-022). */
export interface VersionInfo {
  version: string;
  latest?: string;
  updateAvailable: boolean;
  canUpdate: boolean;
  reason?: string;
  update: { state: 'idle' } | { state: 'updating' | 'restarting'; to: string } | { state: 'failed'; to: string; log: string };
}

export async function versionInfo(refresh = false): Promise<VersionInfo | undefined> {
  try {
    const res = await fetch(`/v1/version${refresh ? '?refresh=1' : ''}`);
    return res.ok ? ((await res.json()) as VersionInfo) : undefined;
  } catch {
    return undefined;
  }
}

/** Start the update (URS-NF-015); the header shows the server the app itself is asking. */
export async function startUpdate(): Promise<{ to: string }> {
  const res = await fetch('/v1/update', { method: 'POST', headers: { 'content-type': 'application/json', 'x-jtd-update': '1' }, body: '{}' });
  const body = (await res.json().catch(() => ({}))) as { to?: string; diagnostics?: { message: string }[] };
  if (res.status !== 202 || !body.to) throw new Error(body.diagnostics?.[0]?.message ?? `the server answered ${res.status}`);
  return { to: body.to };
}

/** The version the server now answers with, or undefined while it is restarting. */
export async function runningVersion(): Promise<string | undefined> {
  try {
    const res = await fetch('/health', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { version?: string }).version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Wait for the server to come back on `to`; stop early if it reports the update failed. Resolves with
 * the outcome; never rejects.
 */
export async function waitForUpdate(to: string, opts: { every?: number; limit?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<{ done: true } | { done: false; log?: string }> {
  const every = opts.every ?? 2000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let waited = 0; waited < (opts.limit ?? 300_000); waited += every) {
    await sleep(every);
    if ((await runningVersion()) === to) return { done: true };
    const info = await versionInfo();
    if (info?.update.state === 'failed') return { done: false, log: info.update.log };
  }
  return { done: false };
}

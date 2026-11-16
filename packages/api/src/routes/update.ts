import { error } from '@jtd/core';
import type { FastifyRequest } from 'fastify';
import { installation, latestRelease, newer, startUpdate, tail, type Spawn } from '../update.ts';
import type { Route } from './route.ts';

/** What the update routes depend on, so tests can stand in for GitHub, the installer and the clock. */
export interface UpdateDeps {
  env: NodeJS.ProcessEnv;
  root: string;
  version: string | undefined;
  fetch: typeof fetch;
  spawn?: Spawn;
  now?: () => number;
  /** Ends this server once its successor is on its way (default: the process exits). */
  exit?: () => void;
}

/** How long a check for the latest release is reused. */
const CHECK_MS = 10 * 60_000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

type State = { state: 'idle' } | { state: 'updating'; to: string } | { state: 'restarting'; to: string } | { state: 'failed'; to: string; log: string };

/**
 * The running version and the latest release (URS-WEB-022), and updating in place from the app
 * (URS-NF-015). Updating is for an installed copy only, asked from this computer, by the app's own page:
 * the request must carry `x-jtd-update: 1` (which a page on another site cannot send without the CORS
 * permission this server never grants) and, when the browser names an origin, it must be this server.
 */
export function updateRoutes(d: UpdateDeps): Route[] {
  const now = d.now ?? Date.now;
  let checked: { at: number; result: Awaited<ReturnType<typeof latestRelease>> } | undefined;
  let state: State = { state: 'idle' };
  const latest = async (force = false) => {
    if (force || !checked || now() - checked.at > CHECK_MS) checked = { at: now(), result: await latestRelease(d.env, d.fetch) };
    return checked.result;
  };
  const refused = (req: FastifyRequest): string | undefined => {
    if (!LOOPBACK.has(req.ip)) return 'Updates can only be started on the computer running the app.';
    if (req.headers['x-jtd-update'] !== '1') return 'Missing the x-jtd-update header.';
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${req.headers.host}`) return 'Updates can only be started from the app itself.';
    return undefined;
  };

  return [
    {
      method: 'GET',
      url: '/v1/version',
      summary: 'The running version, the latest release, and whether this copy can update itself (URS-WEB-022, URS-NF-015). `?refresh=1` checks again now.',
      responses: { 200: '{ version, latest?, updateAvailable, canUpdate, reason?, update }' },
      handler: async (req) => {
        const inst = installation(d.env, d.root, d.version);
        // A source checkout is no release: nothing to compare, so GitHub is not asked.
        const l = d.version ? await latest((req.query as { refresh?: string }).refresh === '1') : { reason: 'This is not a release build.' };
        const latestTag = 'tag' in l ? l.tag : undefined;
        const updateAvailable = Boolean(latestTag && d.version && newer(latestTag, d.version));
        const reason = 'reason' in inst ? inst.reason : 'reason' in l ? l.reason : undefined;
        return { version: d.version ?? 'dev', ...(latestTag && { latest: latestTag }), updateAvailable, canUpdate: !('reason' in inst), ...(reason && { reason }), update: state };
      },
    },
    {
      method: 'POST',
      url: '/v1/update',
      summary: 'Install the latest release (or `{ "version": "vX.Y.Z" }`) and restart onto it (URS-NF-015). Installed copies only; from this computer and the app itself (header `x-jtd-update: 1`).',
      requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { version: { type: 'string', pattern: '^v\\d+\\.\\d+\\.\\d+' } } } } } },
      responses: { 202: '{ state: "updating", to, log }', 403: 'Not allowed from here: { diagnostics }', 409: 'Up to date, already updating, or not an installed copy: { diagnostics }', 502: 'Cannot find the release: { diagnostics }' },
      handler: async (req, reply) => {
        const no = refused(req);
        if (no) return reply.code(403).send({ diagnostics: [error('update.forbidden', no)] });
        const inst = installation(d.env, d.root, d.version);
        if ('reason' in inst) return reply.code(409).send({ diagnostics: [error('update.unavailable', inst.reason)] });
        if (state.state === 'updating' || state.state === 'restarting') return reply.code(409).send({ diagnostics: [error('update.running', `already updating to ${state.to}`)] });
        const asked = (req.body as { version?: unknown } | undefined)?.version;
        let to: string;
        if (typeof asked === 'string' && /^v\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(asked)) to = asked;
        else {
          const l = await latest(true);
          if ('reason' in l) return reply.code(502).send({ diagnostics: [error('update.check', l.reason)] });
          if (!newer(l.tag, inst.version)) return reply.code(409).send({ diagnostics: [error('update.current', `${inst.version} is the latest release`)] });
          to = l.tag;
        }
        const { log, child } = startUpdate(inst, to, d.env, `http://127.0.0.1:${d.env.PORT || '8080'}`, d.spawn);
        state = { state: 'updating', to };
        const failed = (why: string) => (state = { state: 'failed', to, log: `${tail(log)}\n${why}`.trim() });
        child.once('error', (e: Error) => failed(`could not start the updater: ${e.message}`));
        // Installed: the updater starts the new version once this server has gone, so stop.
        child.on('message', (m: unknown) => {
          if (state.state !== 'updating' || (m as { installed?: unknown } | null)?.installed !== to) return;
          state = { state: 'restarting', to };
          (d.exit ?? (() => setTimeout(() => process.exit(0), 250)))();
        });
        // Exiting before saying so means the install failed; this server keeps running.
        child.once('exit', (code: number | null) => {
          if (state.state === 'updating') failed(`the update stopped (exit code ${code})`);
        });
        return reply.code(202).send({ state: 'updating', to, log });
      },
    },
  ];
}

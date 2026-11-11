import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { anthropicClient, type ClaudeClient } from '@jtd/ai';
import type { Registry } from '@jtd/core';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import { requestError } from './errors.ts';
import { openapi } from './openapi.ts';
import { RenderPool } from './pool.ts';
import { generateRoutes } from './routes/generate.ts';
import { metaRoutes } from './routes/meta.ts';
import { renderRoutes } from './routes/render.ts';
import type { Route } from './routes/route.ts';
import { validateRoutes } from './routes/validate.ts';

/** REST API (URS-API-001) plus the built web app at `/` when available. */
export async function buildApp(cfg: Config, opts: { logger?: FastifyServerOptions['logger']; claude?: ClaudeClient } = {}): Promise<FastifyInstance> {
  const reg = ((await import(cfg.registryModule)) as { createRegistry(): Registry }).createRegistry();
  const pool = new RenderPool(cfg.renderWorkers, cfg.renderTimeoutMs, { registryModule: cfg.registryModule, maxNodes: cfg.maxNodes, maxEdges: cfg.maxEdges });
  // Request bodies (diagram content) are never logged.
  const app = Fastify({ bodyLimit: cfg.bodyLimit, logger: opts.logger ?? false });
  app.removeContentTypeParser('text/plain'); // JSON only (URS-API-007)
  await app.register(fastifyMultipart, { limits: { files: cfg.ai.maxFiles, fileSize: cfg.ai.maxFileBytes, fieldSize: cfg.bodyLimit } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
  });
  app.addHook('onClose', () => pool.close());
  app.setErrorHandler((e, _req, reply) => {
    const { status, diagnostics } = requestError(e);
    if (status >= 500) app.log.error(e);
    return reply.code(status).send({ diagnostics });
  });

  // Tests inject a mock; otherwise the SDK client exists only when credentials are configured (URS-API-015).
  const claude = opts.claude ?? (cfg.ai.enabled ? anthropicClient({ model: cfg.ai.model, effort: cfg.ai.effort, fallbacks: cfg.ai.fallbacks }) : undefined);
  const ctx = { reg, pool, ai: cfg.ai, ...(claude && { claude }) };
  const routes: Route[] = [...metaRoutes(ctx), ...validateRoutes(ctx), ...renderRoutes(ctx), ...generateRoutes(ctx)];
  let doc: object | undefined;
  routes.push({ method: 'GET', url: '/v1/openapi.json', summary: 'This document.', responses: { 200: 'OpenAPI 3.1' }, handler: async () => (doc ??= openapi(routes, reg)) });
  for (const r of routes) app.route({ method: r.method, url: r.url, handler: r.handler });

  if (cfg.webDist) await app.register(fastifyStatic, { root: cfg.webDist });
  return app;
}

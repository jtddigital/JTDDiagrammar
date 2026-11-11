import { buildApp } from './app.ts';
import { fromEnv } from './config.ts';

const cfg = fromEnv();
const app = await buildApp(cfg, { logger: true });
await app.listen({ host: cfg.host, port: cfg.port });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close().then(() => process.exit(0)));

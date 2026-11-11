import { parentPort, workerData } from 'node:worker_threads';
import { error, render, type Registry } from '@jtd/core';

export interface WorkerConfig {
  registryModule: string;
  maxNodes: number;
  maxEdges: number;
}

const cfg = workerData as WorkerConfig;
const reg: Registry = ((await import(cfg.registryModule)) as { createRegistry(): Registry }).createRegistry();

parentPort!.on('message', (doc: unknown) => {
  try {
    const { svg, diagnostics } = render(doc, reg, { maxNodes: cfg.maxNodes, maxEdges: cfg.maxEdges });
    parentPort!.postMessage({ svg, diagnostics });
  } catch (e) {
    parentPort!.postMessage({ diagnostics: [error('render.failed', e instanceof Error ? e.message : String(e))] });
  }
});

import { Worker } from 'node:worker_threads';
import type { Diagnostic } from '@jtd/core';
import type { WorkerConfig } from './render-worker.ts';

export interface RenderOutput {
  svg?: string;
  diagnostics: Diagnostic[];
}

interface Task {
  doc: unknown;
  resolve(out: RenderOutput | 'timeout'): void;
}

/**
 * Renders in worker threads so a slow layout never blocks the server, and a render that
 * exceeds `timeoutMs` is killed (URS-API-006). One task per worker at a time.
 */
export class RenderPool {
  readonly #cfg: WorkerConfig;
  readonly #timeoutMs: number;
  readonly #idle: Worker[] = [];
  readonly #busy = new Set<Worker>();
  readonly #queue: Task[] = [];
  #closed = false;

  constructor(size: number, timeoutMs: number, cfg: WorkerConfig) {
    this.#cfg = cfg;
    this.#timeoutMs = timeoutMs;
    for (let i = 0; i < size; i++) this.#idle.push(this.#spawn());
  }

  render(doc: unknown): Promise<RenderOutput | 'timeout'> {
    return new Promise((resolve) => {
      this.#queue.push({ doc, resolve });
      this.#next();
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#idle, ...this.#busy].map((w) => w.terminate()));
  }

  #spawn(): Worker {
    return new Worker(new URL('./render-worker.ts', import.meta.url), { workerData: this.#cfg });
  }

  #next(): void {
    while (!this.#closed && this.#idle.length && this.#queue.length) this.#run(this.#idle.pop()!, this.#queue.shift()!);
  }

  #run(w: Worker, task: Task): void {
    this.#busy.add(w);
    const finish = (out: RenderOutput | 'timeout', healthy: boolean) => {
      clearTimeout(timer);
      w.off('message', onMessage);
      w.off('error', onError);
      this.#busy.delete(w);
      if (healthy) this.#idle.push(w);
      else {
        void w.terminate();
        if (!this.#closed) this.#idle.push(this.#spawn());
      }
      task.resolve(out);
      this.#next();
    };
    const onMessage = (out: RenderOutput) => finish(out, true);
    const onError = (e: Error) => finish({ diagnostics: [{ severity: 'error', code: 'render.failed', message: e.message, path: '' }] }, false);
    const timer = setTimeout(() => finish('timeout', false), this.#timeoutMs);
    w.on('message', onMessage);
    w.on('error', onError);
    w.postMessage(task.doc);
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDiagram, refineDiagram, type Progress } from '../src/generate/api.ts';
import { stageText } from '../src/generate/progress.ts';

const result = { type: 'flowchart', source: { version: '1' }, valid: true, diagnostics: [], attempts: 1 };
const sse = (chunks: string[]) =>
  new Response(new ReadableStream({ start: (c) => (chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x))), c.close()) }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
const mock = (res: Response) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

afterEach(() => vi.restoreAllMocks());

describe('AI client (URS-WEB-012, URS-WEB-013)', () => {
  it('streams staged progress, then the result, across chunk boundaries', async () => {
    const f = mock(sse(['event: progress\ndata: {"stage":"ingest"}\n\nevent: prog', 'ress\ndata: {"stage":"repair","attempt":2}\n\n', `event: result\ndata: ${JSON.stringify(result)}\n\n`]));
    const seen: Progress[] = [];
    expect(await generateDiagram({ text: 'x', files: [], type: 'auto' }, new AbortController().signal, (p) => seen.push(p))).toEqual(result);
    expect(seen.map(stageText)).toEqual(['Reading documents…', 'Fixing problems… (attempt 2)']);
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).accept).toContain('text/event-stream');
  });

  it('surfaces an SSE error event and a closed stream', async () => {
    mock(sse(['event: error\ndata: {"status":422,"diagnostics":[{"message":"declined"}]}\n\n']));
    await expect(generateDiagram({ text: 'x', files: [], type: 'auto' }, new AbortController().signal)).rejects.toThrow('declined');
    mock(sse(['event: progress\ndata: {"stage":"ingest"}\n\n']));
    await expect(generateDiagram({ text: 'x', files: [], type: 'auto' }, new AbortController().signal)).rejects.toThrow('closed');
  });

  it('refines with a JSON body and accepts a plain JSON reply', async () => {
    const f = mock(Response.json(result));
    expect(await refineDiagram({ version: '1' }, 'add a step', new AbortController().signal)).toEqual(result);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('/v1/refine');
    expect(JSON.parse(init!.body as string)).toEqual({ source: { version: '1' }, instruction: 'add a step' });
    mock(Response.json({ diagnostics: [{ message: 'bad source' }] }, { status: 400 }));
    await expect(refineDiagram({}, 'x', new AbortController().signal)).rejects.toThrow('bad source');
  });
});

import { describe, expect, it } from 'vitest';
import { describe as say, loadChat, saveChat, stepBack, update, type Message } from '../src/chat/history.ts';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('AI chat (URS-WEB-016)', () => {
  it('describes results, listing AI notes and remaining problems', () => {
    expect(say({ type: 'flowchart', reason: 'steps and actors', valid: true, attempts: 2, diagnostics: [] }, 'generate')).toEqual({ tone: 'done', text: 'Created a flowchart diagram (2 attempts). Steps and actors.' });
    expect(say({ type: 'lifecycle', valid: true, attempts: 1, diagnostics: [{ severity: 'warning', code: 'ai.unchanged', message: 'the AI made no change', path: '' }] }, 'refine')).toEqual({
      tone: 'done',
      text: 'Updated the lifecycle diagram.',
      notes: ['the AI made no change'],
    });
    const bad = say({ type: 'flowchart', valid: false, attempts: 3, diagnostics: [{ severity: 'error', code: 'ref.node', message: 'unknown node', path: '/nodes/0' }] }, 'generate');
    expect(bad.text).toBe('Created a flowchart diagram, but 1 problem remained after 3 attempts. They are listed under the source; click one to jump to it.');
    expect(bad.notes).toEqual(['/nodes/0: unknown node']);
  });

  it('updates one assistant message', () => {
    const ms: Message[] = [{ id: 'u', role: 'user', text: 'x' }, { id: 'a', role: 'assistant', tone: 'working', text: 'Starting…' }];
    expect(update(ms, 'a', { text: 'Done', tone: 'done' })[1]).toEqual({ id: 'a', role: 'assistant', tone: 'done', text: 'Done' });
    expect(update(ms, 'u', { text: 'no' })[0]).toBe(ms[0]);
  });

  it('keeps the conversation across reloads, ending jobs a reload interrupted', () => {
    const s = store();
    saveChat([{ id: 'a', role: 'assistant', tone: 'working', text: 'Drafting…' }], s);
    expect(loadChat(s)).toEqual([{ id: 'a', role: 'assistant', tone: 'error', text: 'Interrupted.' }]);
    s.setItem('jtd:chat', '{');
    expect(loadChat(s)).toEqual([]);
  });
});

describe('step back (URS-WEB-017)', () => {
  it('is a change of its own, so it can be stepped back too', () => {
    const m = stepBack('old', 'new');
    expect(m).toMatchObject({ role: 'assistant', before: 'new', text: 'Stepped back to the diagram before that change.' });
    expect(m.notes).toBeUndefined();
    expect(stepBack('same', 'same').notes).toEqual(['The source was already the same.']);
  });
});

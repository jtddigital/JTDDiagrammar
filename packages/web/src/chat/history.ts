import type { Diagnostic } from '@jtd/core';

/**
 * The AI conversation (URS-WEB-016) and its checkpoints (URS-WEB-017). Every change the AI makes
 * records the source before it, so any change can be stepped back; stepping back is itself a
 * change with a checkpoint, so it can be stepped back too. Pure, so it is unit-tested.
 */
export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  files?: string[];
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  tone: 'working' | 'done' | 'error';
  text: string;
  /** Warnings and problems worth showing under the reply. */
  notes?: string[];
  /** Source before this change; present when the message changed the source. */
  before?: string;
}

export type Message = UserMessage | AssistantMessage;

let seq = 0;
export const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Reply {
  type: string;
  reason?: string;
  valid: boolean;
  attempts: number;
  diagnostics: readonly Diagnostic[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What the assistant says about a finished job. */
export function describe(r: Reply, mode: 'generate' | 'refine'): Pick<AssistantMessage, 'text' | 'notes' | 'tone'> {
  const errors = r.diagnostics.filter((d) => d.severity === 'error');
  const notes = r.diagnostics.filter((d) => d.code.startsWith('ai.') || d.severity === 'error').map((d) => (d.path ? `${d.path}: ${d.message}` : d.message));
  const done = mode === 'generate' ? `Created a ${r.type} diagram` : `Updated the ${r.type} diagram`;
  const text = r.valid
    ? `${done}${r.attempts > 1 ? ` (${plural(r.attempts, 'attempt')})` : ''}.${r.reason ? ` ${r.reason[0]!.toUpperCase()}${r.reason.slice(1)}.` : ''}`
    : `${done}, but ${plural(errors.length, 'problem')} remained after ${plural(r.attempts, 'attempt')}. They are listed under the source; click one to jump to it.`;
  return { text, tone: 'done', ...(notes.length && { notes }) };
}

/** The checkpoint message for restoring `before`, made while the source is `now`. */
export const stepBack = (before: string, now: string): AssistantMessage => ({
  id: newId(),
  role: 'assistant',
  tone: 'done',
  text: 'Stepped back to the diagram before that change.',
  before: now,
  ...(before === now && { notes: ['The source was already the same.'] }),
});

/** Replace the message with this id. */
export const update = (ms: readonly Message[], id: string, patch: Partial<AssistantMessage>): Message[] =>
  ms.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, ...patch } : m));

const KEY = 'jtd:chat';
/** Kept across reloads; older messages (and their checkpoints) drop off. */
const KEEP = 60;

export function loadChat(storage: Pick<Storage, 'getItem'> = localStorage): Message[] {
  try {
    const v: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    // A reload ends any job, so a message still working cannot finish.
    return Array.isArray(v) ? (v as Message[]).map((m) => (m.role === 'assistant' && m.tone === 'working' ? { ...m, tone: 'error', text: 'Interrupted.' } : m)) : [];
  } catch {
    return [];
  }
}

export function saveChat(ms: readonly Message[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(ms.slice(-KEEP)));
  } catch {
    /* Best-effort. */
  }
}

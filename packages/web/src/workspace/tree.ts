/**
 * The workspace tree as pure operations over its node list (URS-WS-001..003, WS-022): names, children, paths,
 * moves and the trash. The store persists nodes; nothing here touches it.
 */
export type NodeKind = 'folder' | 'file';

export interface WsNode {
  id: string;
  /** Parent folder; null at the top. */
  parent: string | null;
  name: string;
  kind: NodeKind;
  created: number;
  modified: number;
  /** When it was moved to the trash; its descendants go with it. */
  trashed?: number;
}

const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0 && a.toLowerCase() === b.toLowerCase();

/** Whether a node or one of its folders is in the trash. */
export function inTrash(nodes: readonly WsNode[], id: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let n = byId.get(id); n; n = n.parent ? byId.get(n.parent) : undefined) if (n.trashed !== undefined) return true;
  return false;
}

/** Children of a folder (null: the top), folders first, then by name as people sort them (2 before 10). */
export const children = (nodes: readonly WsNode[], parent: string | null) =>
  nodes.filter((n) => n.parent === parent && n.trashed === undefined).sort((a, b) => (a.kind === b.kind ? compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1));

/** Why a name is not allowed, or undefined. */
export function nameProblem(name: string): string | undefined {
  if (!name.trim()) return 'A name cannot be empty';
  if (/[/\\]/.test(name)) return 'A name cannot contain / or \\';
  if (name === '.' || name === '..') return `A name cannot be ${name}`;
  if (name !== name.trim()) return 'A name cannot start or end with a space';
  if (name.length > 255) return 'A name can be at most 255 characters';
  return undefined;
}

/** Whether another live node in the folder has this name, ignoring case. */
export const clash = (nodes: readonly WsNode[], parent: string | null, name: string, except?: string) => children(nodes, parent).some((n) => n.id !== except && same(n.name, name));

/** `name`, or `name 2.ext`, `name 3.ext`… whichever is free in the folder. */
export function freeName(nodes: readonly WsNode[], parent: string | null, name: string, except?: string): string {
  if (!clash(nodes, parent, name, except)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const base = stem.replace(/ \d+$/, '');
  for (let i = 2; ; i++) if (!clash(nodes, parent, `${base} ${i}${ext}`, except)) return `${base} ${i}${ext}`;
}

/** The node and everything under it. */
export function subtree(nodes: readonly WsNode[], id: string): WsNode[] {
  const out = nodes.filter((n) => n.id === id);
  for (let i = 0; i < out.length; i++) if (out[i]!.kind === 'folder') out.push(...nodes.filter((n) => n.parent === out[i]!.id));
  return out;
}

/** `folder/sub/name.md`. */
export function pathOf(nodes: readonly WsNode[], id: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  for (let n = byId.get(id); n; n = n.parent ? byId.get(n.parent) : undefined) parts.unshift(n.name);
  return parts.join('/');
}

/** Why a node cannot move into a folder (null: the top), or undefined. */
export function moveProblem(nodes: readonly WsNode[], id: string, to: string | null): string | undefined {
  const n = nodes.find((x) => x.id === id);
  if (!n) return 'It no longer exists';
  if (to !== null && nodes.find((x) => x.id === to)?.kind !== 'folder') return 'Only a folder can hold files';
  if (to !== null && subtree(nodes, id).some((x) => x.id === to)) return 'A folder cannot move into itself';
  if (n.parent === to) return undefined;
  if (clash(nodes, to, n.name, id)) return `There is already a ${n.name} there`;
  return undefined;
}

/** The node renamed, or why not. */
export function rename(nodes: readonly WsNode[], id: string, name: string, now = Date.now()): WsNode | string {
  const n = nodes.find((x) => x.id === id)!;
  const why = nameProblem(name) ?? (clash(nodes, n.parent, name, id) ? `There is already a ${name} here` : undefined);
  return why ?? { ...n, name, modified: now };
}

/** The node moved, or why not. */
export function move(nodes: readonly WsNode[], id: string, to: string | null, now = Date.now()): WsNode | string {
  const why = moveProblem(nodes, id, to);
  return why ?? { ...nodes.find((x) => x.id === id)!, parent: to, modified: now };
}

/** Back from the trash to its folder, or the top if that is gone too; renamed if its name was taken meanwhile. */
export function restore(nodes: readonly WsNode[], id: string, now = Date.now()): WsNode {
  const n = nodes.find((x) => x.id === id)!;
  const parent = n.parent !== null && nodes.some((x) => x.id === n.parent) && !inTrash(nodes, n.parent) ? n.parent : null;
  const { trashed: _gone, ...rest } = n;
  return { ...rest, parent, name: freeName(nodes, parent, n.name, id), modified: now };
}

/** Top-level items of the trash: trashed nodes whose folders are not trashed themselves. */
export const trash = (nodes: readonly WsNode[]) => nodes.filter((n) => n.trashed !== undefined && !(n.parent !== null && inTrash(nodes, n.parent))).sort((a, b) => b.trashed! - a.trashed!);

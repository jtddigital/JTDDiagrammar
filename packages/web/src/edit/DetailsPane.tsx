import { compile, parseJson, type GraphIR } from '@jtd/core';
import { useEffect, useMemo, useState } from 'react';
import { kinds, type Ref } from '../preview/interact.ts';
import { registry } from '../registry.ts';
import { fields, problem, schemaAt, sections, targets, type Field, type Schema, type Section } from './schema.ts';
import { setAt, valueAt } from './source.ts';

/** How long typing must pause before a change is tried (URS-WEB-029). */
export const IDLE_MS = 800;
const OPEN_KEY = 'jtd:details-sections';

/** Which categories the user opened or closed, remembered across elements and visits. */
function useOpen() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open));
    } catch {
      /* Best-effort. */
    }
  }, [open]);
  return [open, (id: string, v: boolean) => setOpen((o) => (o[id] === v ? o : { ...o, [id]: v }))] as const;
}

const KIND_NAMES: Record<string, string> = { n: 'Node', e: 'Connection', c: 'Group', l: 'Lane', p: 'Phase', lg: 'Lane group', pg: 'Phase group' };

interface Props {
  ir: GraphIR | undefined;
  /** The source, parsed; undefined while it does not parse. */
  value: unknown;
  text: string;
  picked: Ref | undefined;
  /** The name of the chosen draft, which has no source yet (URS-WEB-031). */
  draft?: string;
  onText(text: string): void;
}

/** What every field needs: the schema root, the parsed source for references, and a guarded write. */
interface Ctx {
  root: Schema;
  doc: unknown;
  /** Write a value (undefined removes it); returns why it was refused, or undefined when it was written. */
  write(at: string, v: unknown, f: Field): string | undefined;
}

/** Errors of a source text, as "path message", so new ones can be told from those already there. */
const errorsOf = (text: string): string[] => {
  const parsed = parseJson(text);
  const ds = parsed.value === undefined ? parsed.diagnostics : compile(parsed.value, registry).diagnostics;
  return ds.filter((d) => d.severity === 'error').map((d) => `${d.path} ${d.message}`);
};

/**
 * The details pane (URS-WEB-025, WEB-027..029, experimental, D-009): every property the type's schema allows for
 * the selected element, in collapsible categories the schema names, each edited in place. A value is tried when
 * the field is left, on Enter, or once typing pauses; it is written to the source only if it fits its schema and
 * adds no error to the diagram; otherwise the field keeps it and says why. References offer the ids they may take.
 */
export function DetailsPane({ ir, value, text, picked, draft, onText }: Props) {
  const item = ir && picked ? kinds(ir).find(([k]) => k === picked.kind)?.[1].find((x) => x.id === picked.id) : undefined;
  const type = typeof (value as { type?: unknown } | undefined)?.type === 'string' ? registry.type((value as { type: string }).type) : undefined;
  const root = type?.schema as Schema | undefined;
  const src = item?.src;
  const schema = root && src !== undefined ? schemaAt(root, src) : undefined;
  const current = src !== undefined ? valueAt(value, src) : undefined;
  const isObject = current !== null && typeof current === 'object' && !Array.isArray(current);
  const before = useMemo(() => new Set(errorsOf(text)), [text]);
  const [open, setOpen] = useOpen();

  const ctx: Ctx | undefined = root && {
    root,
    doc: value,
    write: (at, v, f) => {
      if (v === undefined && f.required) return 'This is required.';
      const bad = problem(root, f.schema, v);
      if (bad) return bad;
      const next = setAt(text, at, v);
      const added = errorsOf(next).filter((e) => !before.has(e));
      if (added.length) return `Not changed: the diagram would then have ${added.length === 1 ? 'this problem' : 'these problems'}: ${added.map((e) => e.replace(/^\S*\s/, '')).join('; ')}.`;
      onText(next);
      return undefined;
    },
  };

  let body;
  if (draft) body = <p className="text-muted text-small">This {draft} is a draft, not yet in the source: Apply it, or drag it onto a shape to connect them, and its details show here.</p>;
  else if (!picked) body = <p className="text-muted text-small">Click an element in the diagram to see its details here.</p>;
  else if (!item) body = <p className="text-muted text-small">The selected element is no longer in the diagram.</p>;
  else if (src === undefined || !schema || !ctx) body = <p className="text-muted text-small">This element is made by the diagram itself and has nothing to edit.</p>;
  else {
    const list = isObject ? fields(ctx.root, schema) : fields(ctx.root, { properties: { [src.split('/').pop() ?? '']: schema } });
    const at = (f: Field) => (isObject ? `${src}/${f.name}` : src);
    const of = (f: Field) => (isObject ? (current as Record<string, unknown>)[f.name] : current);
    const view = (f: Field, alone = false) =>
      // A category holding only one nested group (e.g. Appearance: style) shows the group's fields directly.
      alone && f.kind === 'group' ? <Group key={at(f)} at={at(f)} schema={f.schema} value={of(f)} ctx={ctx} depth={1} /> : <FieldView key={at(f)} field={f} at={at(f)} value={of(f)} ctx={ctx} depth={0} />;
    const groups = sections(list);
    const count = (g: Section) => g.fields.filter((f) => of(f) !== undefined).length;
    body = (
      <form className="details__form stack" onSubmit={(e) => e.preventDefault()}>
        {groups.length === 1
          ? groups[0]!.fields.map((f) => view(f))
          : groups.map((g) => (
              <details key={g.id} className="details__section" data-section={g.id} open={open[g.id] ?? g.open} onToggle={(e) => e.currentTarget.open !== (open[g.id] ?? g.open) && setOpen(g.id, e.currentTarget.open)}>
                <summary className="details__summary cluster">
                  <span>{g.label}</span>
                  {count(g) > 0 && <span className="details__count text-muted">{count(g)} set</span>}
                </summary>
                <div className="details__fields stack">{g.fields.map((f) => view(f, g.fields.length === 1))}</div>
              </details>
            ))}
      </form>
    );
  }

  return (
    <div className="frame details">
      <div className="pane__header cluster">
        <span className="pane__title">Details</span>
        {item && (
          <span className="pane__subtitle text-muted text-small" title={src}>
            {KIND_NAMES[picked!.kind] ?? 'Element'} · {item.label || item.id}
          </span>
        )}
      </div>
      <div className="details__body">{body}</div>
    </div>
  );
}

interface FieldProps {
  field: Field;
  at: string;
  value: unknown;
  ctx: Ctx;
  depth: number;
}

/** One property: a field of the right kind, its description as a hint, and why a change was refused. */
function FieldView({ field: f, at, value, ctx, depth }: FieldProps) {
  const [refused, setRefused] = useState<string>();
  /** Try a value; true when it was written. */
  const set = (v: unknown): boolean => {
    const why = ctx.write(at, v === '' ? undefined : v, f);
    setRefused(why);
    return !why;
  };
  const id = `details-${at.replace(/[^\w-]/g, '_')}`;
  const def = f.schema.default !== undefined ? ` (default ${String(f.schema.default)})` : '';
  const about = [f.required && 'Required.', f.description].filter(Boolean).join(' ');
  const hint = about && <span className="details__hint text-muted">{about}</span>;
  const alert = refused && (
    <span className="details__refused" role="alert">
      {refused}
    </span>
  );
  const label = (
    <label htmlFor={id} className="details__label">
      {f.name}
      {f.required && <span aria-hidden="true"> *</span>}
    </label>
  );
  const invalid = refused ? { 'aria-invalid': true as const } : {};
  let control;
  switch (f.name === 'id' && depth === 0 ? 'id' : f.kind) {
    case 'id':
      control = <input id={id} className="input" value={String(value ?? '')} readOnly title="Ids are changed in the source, where everything that refers to them can be changed too" />;
      break;
    case 'ref': {
      const options = targets(ctx.doc, f.ref!);
      const known = value === undefined || options.some((o) => o.id === value);
      control = (
        <select id={id} className="select" value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value)} {...invalid}>
          <option value="">—</option>
          {!known && <option value={String(value)}>{String(value)} (not found)</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label ? `${o.label} (${o.id})` : o.id}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'refs': {
      const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
      const options = targets(ctx.doc, f.ref!);
      return (
        <fieldset className="details__group details__refs stack">
          <legend className="details__label">
            {f.name}
            {f.required && <span aria-hidden="true"> *</span>}
          </legend>
          {options.length === 0 && <span className="text-small text-muted">Nothing to choose from yet.</span>}
          {options.map((o) => (
            <label key={o.id} className="cluster details__check">
              <input
                type="checkbox"
                checked={chosen.has(o.id)}
                onChange={(e) => {
                  // Keep the order of the collection; drop the list when nothing is left.
                  const next = options.map((x) => x.id).filter((x) => (x === o.id ? e.target.checked : chosen.has(x)));
                  set(next.length ? next : undefined);
                }}
              />
              {o.label ? `${o.label} (${o.id})` : o.id}
            </label>
          ))}
          {[...chosen].filter((c) => !options.some((o) => o.id === c)).map((c) => (
            <span key={c} className="details__refused">{c} (not found)</span>
          ))}
          {hint}
          {alert}
        </fieldset>
      );
    }
    case 'choice':
      control = (
        <select id={id} className="select" value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value)} {...invalid}>
          <option value="">—{def}</option>
          {f.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'yesno':
      control = (
        <select id={id} className="select" value={value === undefined ? '' : value ? 'yes' : 'no'} onChange={(e) => set(e.target.value === '' ? undefined : e.target.value === 'yes')} {...invalid}>
          <option value="">—{def}</option>
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
      );
      break;
    case 'number':
      control = <Commit id={id} type="number" value={value === undefined ? '' : String(value)} placeholder={def.trim()} invalid={!!refused} onCommit={(v) => set(v === '' ? undefined : Number(v))} onReset={() => setRefused(undefined)} />;
      break;
    case 'color':
      control = (
        <span className="cluster details__color">
          <input type="color" aria-label={`${f.name} colour`} value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} />
          <Commit id={id} value={typeof value === 'string' ? value : ''} placeholder="#rrggbb" invalid={!!refused} onCommit={set} onReset={() => setRefused(undefined)} />
        </span>
      );
      break;
    case 'list': {
      const numeric = ['number', 'integer'].includes(String((f.schema.items as Schema | undefined)?.type));
      control = (
        <Commit
          id={id}
          value={Array.isArray(value) ? value.join(', ') : ''}
          placeholder="comma-separated"
          invalid={!!refused}
          onCommit={(v) => {
            const items = v.split(',').map((x) => x.trim()).filter(Boolean);
            return set(items.length ? (numeric ? items.map(Number) : items) : undefined);
          }}
          onReset={() => setRefused(undefined)}
        />
      );
      break;
    }
    case 'group':
      if (depth < 2)
        return (
          <fieldset className="details__group stack">
            <legend className="details__label">{f.name}</legend>
            {hint}
            <Group at={at} schema={f.schema} value={value} ctx={ctx} depth={depth + 1} />
          </fieldset>
        );
      control = <Json id={id} value={value} invalid={!!refused} onCommit={set} />;
      break;
    case 'items':
      control = <span className="text-small text-muted">{Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}: select them in the diagram, or edit them in Source` : 'None'}</span>;
      break;
    case 'json':
      control = <Json id={id} value={value} invalid={!!refused} onCommit={set} />;
      break;
    default:
      control = <Commit id={id} value={value === undefined ? '' : String(value)} placeholder={def.trim()} invalid={!!refused} onCommit={set} onReset={() => setRefused(undefined)} />;
  }
  return (
    <div className="details__field stack">
      {label}
      {control}
      {alert}
      {hint}
    </div>
  );
}

function Group(p: { at: string; schema: Schema; value: unknown; ctx: Ctx; depth: number }) {
  const v = (p.value && typeof p.value === 'object' ? p.value : {}) as Record<string, unknown>;
  return (
    <>
      {fields(p.ctx.root, p.schema).map((f) => (
        <FieldView key={f.name} field={f} at={`${p.at}/${f.name}`} value={v[f.name]} ctx={p.ctx} depth={p.depth} />
      ))}
    </>
  );
}

/** Try `done` once typing has paused for `IDLE_MS` (URS-WEB-029). */
const useIdle = (draft: string | undefined, done: () => void) =>
  useEffect(() => {
    if (draft === undefined) return;
    const t = setTimeout(done, IDLE_MS);
    return () => clearTimeout(t);
  }, [draft]);

/**
 * A text box that writes when typing pauses, when it loses focus or on Enter, not on every key. A refused
 * value stays in the box so it can be corrected; Escape puts back what the source holds.
 */
function Commit(p: { id: string; value: string; onCommit(v: string): boolean; onReset(): void; type?: string; placeholder?: string; invalid: boolean }) {
  const [draft, setDraft] = useState<string>();
  const done = () => {
    if (draft === undefined || draft === p.value) return setDraft(undefined);
    if (p.onCommit(draft)) setDraft(undefined);
  };
  useIdle(draft, done);
  return (
    <input
      id={p.id}
      className="input"
      type={p.type ?? 'text'}
      value={draft ?? p.value}
      {...(p.placeholder && { placeholder: p.placeholder })}
      {...(p.invalid && { 'aria-invalid': true })}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') {
          setDraft(undefined);
          p.onReset();
        }
      }}
    />
  );
}

/** Anything the form has no field for, as JSON; written only when it parses and fits. */
function Json({ id, value, onCommit, invalid }: { id: string; value: unknown; onCommit(v: unknown): boolean; invalid: boolean }) {
  const text = value === undefined ? '' : JSON.stringify(value);
  const [draft, setDraft] = useState<string>();
  const [bad, setBad] = useState(false);
  const done = () => {
    if (draft === undefined || draft === text) return setDraft(undefined);
    let parsed: unknown;
    try {
      parsed = draft.trim() ? (JSON.parse(draft) as unknown) : undefined;
    } catch {
      return setBad(true);
    }
    setBad(false);
    if (onCommit(parsed)) setDraft(undefined);
  };
  useIdle(draft, done);
  return (
    <>
      <textarea
        id={id}
        className="input details__json"
        rows={2}
        value={draft ?? text}
        {...((bad || invalid) && { 'aria-invalid': true })}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
      />
      {bad && (
        <span className="details__refused" role="alert">
          Not valid JSON; nothing was changed.
        </span>
      )}
    </>
  );
}

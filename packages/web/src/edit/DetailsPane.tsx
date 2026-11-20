import type { GraphIR } from '@jtd/core';
import { useState } from 'react';
import { kinds, type Ref } from '../preview/interact.ts';
import { registry } from '../registry.ts';
import { fields, schemaAt, type Field, type Schema } from './schema.ts';
import { setAt, valueAt } from './source.ts';

const KIND_NAMES: Record<string, string> = { n: 'Node', e: 'Connection', c: 'Group', l: 'Lane', p: 'Phase', lg: 'Lane group', pg: 'Phase group' };

interface Props {
  ir: GraphIR | undefined;
  /** The source, parsed; undefined while it does not parse. */
  value: unknown;
  text: string;
  picked: Ref | undefined;
  onText(text: string): void;
}

/**
 * The details pane (URS-WEB-025, experimental, D-009): every property the type's schema allows for the
 * selected element, each edited in place and written straight to the source. Type-agnostic.
 */
export function DetailsPane({ ir, value, text, picked, onText }: Props) {
  const item = ir && picked ? kinds(ir).find(([k]) => k === picked.kind)?.[1].find((x) => x.id === picked.id) : undefined;
  const type = typeof (value as { type?: unknown } | undefined)?.type === 'string' ? registry.type((value as { type: string }).type) : undefined;
  const root = type?.schema as Schema | undefined;
  const src = item?.src;
  const schema = root && src !== undefined ? schemaAt(root, src) : undefined;
  const current = src !== undefined ? valueAt(value, src) : undefined;
  const isObject = current !== null && typeof current === 'object' && !Array.isArray(current);

  let body;
  if (!picked) body = <p className="text-muted text-small">Click an element in the diagram to see its details here.</p>;
  else if (!item) body = <p className="text-muted text-small">The selected element is no longer in the diagram.</p>;
  else if (src === undefined || !schema || !root) body = <p className="text-muted text-small">This element is made by the diagram itself and has nothing to edit.</p>;
  else if (!isObject) body = <Single text={text} at={src} schema={schema} root={root} value={current} onText={onText} />;
  else
    body = (
      <form className="details__form stack" onSubmit={(e) => e.preventDefault()}>
        {fields(root, schema).map((f) => (
          <FieldView key={`${src}/${f.name}`} field={f} at={`${src}/${f.name}`} value={(current as Record<string, unknown>)[f.name]} text={text} root={root} onText={onText} depth={0} />
        ))}
      </form>
    );

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

/** A value that is not an object of its own, e.g. a reporting line stored as a person's `manager`. */
function Single(p: { text: string; at: string; schema: Schema; root: Schema; value: unknown; onText(t: string): void }) {
  const name = p.at.split('/').pop() ?? '';
  const [f] = fields(p.root, { properties: { [name]: p.schema } });
  return <form className="details__form stack" onSubmit={(e) => e.preventDefault()}>{f && <FieldView field={f} at={p.at} value={p.value} text={p.text} root={p.root} onText={p.onText} depth={0} />}</form>;
}

interface FieldProps {
  field: Field;
  at: string;
  value: unknown;
  text: string;
  root: Schema;
  onText(t: string): void;
  depth: number;
}

/** One property: a field of the right kind, its description as a hint. Clearing a field removes the property. */
function FieldView({ field: f, at, value, text, root, onText, depth }: FieldProps) {
  const set = (v: unknown) => onText(setAt(text, at, v === '' ? undefined : v));
  const id = `details-${at.replace(/[^\w-]/g, '_')}`;
  const def = f.schema.default !== undefined ? ` (default ${String(f.schema.default)})` : '';
  const label = (
    <label htmlFor={id} className="details__label">
      {f.name}
      {f.required && <span aria-hidden="true"> *</span>}
    </label>
  );
  const about = [f.required && 'Required.', f.description].filter(Boolean).join(' ');
  const hint = about && <span className="details__hint text-muted">{about}</span>;
  let control;
  switch (f.name === 'id' ? 'id' : f.kind) {
    case 'id':
      control = <input id={id} className="input" value={String(value ?? '')} readOnly title="Ids are changed in the source, where everything that refers to them can be changed too" />;
      break;
    case 'choice':
      control = (
        <select id={id} className="select" value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value)}>
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
        <select id={id} className="select" value={value === undefined ? '' : value ? 'yes' : 'no'} onChange={(e) => set(e.target.value === '' ? undefined : e.target.value === 'yes')}>
          <option value="">—{def}</option>
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
      );
      break;
    case 'number':
      control = <Commit id={id} type="number" value={value === undefined ? '' : String(value)} placeholder={def.trim()} onCommit={(v) => set(v === '' ? undefined : Number(v))} />;
      break;
    case 'color':
      control = (
        <span className="cluster details__color">
          <input type="color" aria-label={`${f.name} colour`} value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} />
          <Commit id={id} value={typeof value === 'string' ? value : ''} placeholder="#rrggbb" onCommit={set} />
        </span>
      );
      break;
    case 'list':
      control = (
        <Commit
          id={id}
          value={Array.isArray(value) ? value.join(', ') : ''}
          placeholder="comma-separated"
          onCommit={(v) => {
            const items = v.split(',').map((x) => x.trim()).filter(Boolean);
            set(items.length ? items : undefined);
          }}
        />
      );
      break;
    case 'group':
      if (depth < 2)
        return (
          <fieldset className="details__group stack">
            <legend className="details__label">{f.name}</legend>
            {hint}
            <Group at={at} schema={f.schema} value={value} text={text} root={root} onText={onText} depth={depth + 1} />
          </fieldset>
        );
      control = <Json id={id} value={value} onCommit={set} />;
      break;
    case 'items':
      control = <span className="text-small text-muted">{Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}: select them in the diagram, or edit them in Source` : 'None'}</span>;
      break;
    case 'json':
      control = <Json id={id} value={value} onCommit={set} />;
      break;
    default:
      control = <Commit id={id} value={value === undefined ? '' : String(value)} placeholder={def.trim()} onCommit={set} />;
  }
  return (
    <div className="details__field stack">
      {label}
      {control}
      {hint}
    </div>
  );
}

function Group(p: { at: string; schema: Schema; value: unknown; text: string; root: Schema; onText(t: string): void; depth: number }) {
  const v = (p.value && typeof p.value === 'object' ? p.value : {}) as Record<string, unknown>;
  return (
    <>
      {fields(p.root, p.schema).map((f) => (
        <FieldView key={f.name} field={f} at={`${p.at}/${f.name}`} value={v[f.name]} text={p.text} root={p.root} onText={p.onText} depth={p.depth} />
      ))}
    </>
  );
}

/** A text box that writes when it loses focus or on Enter, not on every key. */
function Commit({ id, value, onCommit, type = 'text', placeholder }: { id: string; value: string; onCommit(v: string): void; type?: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? value;
  const done = () => {
    if (draft !== undefined && draft !== value) onCommit(draft);
    setDraft(undefined);
  };
  return (
    <input
      id={id}
      className="input"
      type={type}
      value={shown}
      {...(placeholder && { placeholder })}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') setDraft(undefined);
      }}
    />
  );
}

/** Anything the form has no field for, as JSON; written only when it parses. */
function Json({ id, value, onCommit }: { id: string; value: unknown; onCommit(v: unknown): void }) {
  const text = value === undefined ? '' : JSON.stringify(value);
  const [draft, setDraft] = useState<string>();
  const [bad, setBad] = useState(false);
  return (
    <>
      <textarea
        id={id}
        className="input details__json"
        rows={2}
        value={draft ?? text}
        aria-invalid={bad || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === undefined || draft === text) return setDraft(undefined);
          try {
            onCommit(draft.trim() ? (JSON.parse(draft) as unknown) : undefined);
            setDraft(undefined);
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad && <span className="details__hint" role="alert">Not valid JSON; nothing was changed.</span>}
    </>
  );
}

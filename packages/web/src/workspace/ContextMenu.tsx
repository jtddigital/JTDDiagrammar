import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect?(): void;
  /** A submenu, opened with the pointer, Enter or →. */
  items?: MenuItem[];
  disabled?: boolean;
  /** A line before this item. */
  separator?: boolean;
  /** Shown at the right, e.g. "F2". */
  hint?: string;
}

interface Props {
  items: MenuItem[];
  x: number;
  y: number;
  onClose(): void;
  /** Accessible name. */
  label: string;
}

/**
 * A context menu (URS-WS-002) following the ARIA menu pattern: arrows move, Home and End jump, Enter or Space
 * chooses, → opens a submenu and ← or Escape closes it, a typed letter finds the next item starting with it.
 * It stays inside the window and closes on a click outside, Escape, Tab or a scroll.
 */
export function ContextMenu({ items, x, y, onClose, label }: Props) {
  // Focus goes back where it was when the menu closes, unless a command moved it on. Taken while rendering,
  // before the menu's own items take focus.
  const [before] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    return () => {
      const now = document.activeElement;
      if (before?.isConnected && (!now || now === document.body || now.closest('.menu'))) before.focus();
    };
  }, [before]);
  return <Menu items={items} x={x} y={y} onClose={onClose} onDone={onClose} label={label} root />;
}

function Menu({ items, x, y, alt, onClose, onDone, label, root }: Props & { onDone(): void; root?: boolean; alt?: number }) {
  const ref = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState({ x, y });
  const [active, setActive] = useState(() => items.findIndex((i) => !i.disabled));
  const [sub, setSub] = useState<number>();

  // Keep inside the window: a submenu flips to the left of its item (`alt`), a menu moves left or up.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    const fitX = x + r.width <= innerWidth - 4 ? x : alt !== undefined ? Math.max(4, alt - r.width) : Math.max(4, innerWidth - r.width - 4);
    setAt({ x: fitX, y: y + r.height <= innerHeight - 4 ? y : Math.max(4, innerHeight - r.height - 4) });
  }, [x, y, alt]);

  // Focus follows the active item, unless a submenu has it.
  useEffect(() => {
    if (sub === undefined) ref.current?.querySelectorAll<HTMLElement>(':scope > li > [role="menuitem"]')[active]?.focus();
  }, [active, sub]);

  useEffect(() => {
    if (!root) return;
    // Submenus sit inside the root menu, so anything outside it, the pane it opened from included, closes it.
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const opts = { capture: true };
    window.addEventListener('pointerdown', outside, opts);
    window.addEventListener('scroll', outside, opts);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside, opts);
      window.removeEventListener('scroll', outside, opts);
      window.removeEventListener('blur', onClose);
    };
  }, [root, onClose]);

  const enabled = items.map((i, n) => (i.disabled ? -1 : n)).filter((n) => n >= 0);
  const step = (d: number) => setActive((a) => enabled[(enabled.indexOf(a) + d + enabled.length) % enabled.length] ?? a);
  const choose = (n: number) => {
    const it = items[n];
    if (!it || it.disabled) return;
    if (it.items) return setSub(n);
    onDone();
    it.onSelect?.();
  };
  const keys = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown') step(1);
    else if (k === 'ArrowUp') step(-1);
    else if (k === 'Home') setActive(enabled[0] ?? 0);
    else if (k === 'End') setActive(enabled.at(-1) ?? 0);
    else if (k === 'Enter' || k === ' ' || (k === 'ArrowRight' && items[active]?.items)) choose(active);
    else if (k === 'ArrowLeft' && !root) onClose();
    else if (k === 'Escape') onClose();
    else if (k === 'Tab') onDone();
    else if (k.length === 1 && /\S/.test(k)) {
      const from = enabled.indexOf(active);
      const next = [...enabled.slice(from + 1), ...enabled.slice(0, from + 1)].find((n) => items[n]!.label.toLowerCase().startsWith(k.toLowerCase()));
      if (next !== undefined) setActive(next);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <ul ref={ref} className="menu" role="menu" aria-label={label} style={{ left: at.x, top: at.y }} onKeyDown={keys} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, n) => (
        <li key={`${n}-${it.label}`} role="none" className={it.separator ? 'menu__item menu__item--separated' : 'menu__item'}>
          <button
            type="button"
            role="menuitem"
            tabIndex={n === active ? 0 : -1}
            disabled={it.disabled}
            aria-disabled={it.disabled}
            {...(it.items && { 'aria-haspopup': 'menu' as const, 'aria-expanded': sub === n })}
            onPointerEnter={() => {
              if (it.disabled) return;
              setActive(n);
              setSub(it.items ? n : undefined);
            }}
            onClick={() => choose(n)}
          >
            <span>{it.label}</span>
            {(it.hint || it.items) && (
              <span className="menu__hint" aria-hidden="true">
                {it.items ? '▸' : it.hint}
              </span>
            )}
          </button>
          {sub === n && it.items && (
            <SubMenu
              items={it.items}
              label={it.label}
              onClose={() => {
                setSub(undefined);
                ref.current?.querySelectorAll<HTMLElement>(':scope > li > [role="menuitem"]')[n]?.focus();
              }}
              onDone={onDone}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** A submenu opens beside its item. */
function SubMenu({ items, label, onClose, onDone }: { items: MenuItem[]; label: string; onClose(): void; onDone(): void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; alt: number }>();
  useLayoutEffect(() => {
    const li = anchor.current!.parentElement!.getBoundingClientRect();
    setPos({ x: li.right - 4, y: li.top - 4, alt: li.left + 4 });
  }, []);
  return (
    <span ref={anchor}>
      {pos && <Menu items={items} x={pos.x} y={pos.y} alt={pos.alt} onClose={onClose} onDone={onDone} label={label} />}
    </span>
  );
}

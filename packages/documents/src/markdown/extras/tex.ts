/**
 * A TeX subset to MathML Core (URS-WS-041, D-007), which browsers draw without a library: letters, numbers and
 * operators; `^` and `_`; groups; `\frac`, `\sqrt`, `\binom`; Greek letters and common symbols; function names;
 * accents; `\left…\right`; spaces; `\text`, `\mathbf`, `\mathbb`, `\mathcal`; and matrix, cases and aligned
 * environments. An unknown command shows as an error mark, never as raw markup.
 */
export interface MathEl {
  tag: string;
  attrs?: Record<string, string>;
  children: (MathEl | string)[];
}

const el = (tag: string, children: (MathEl | string)[] = [], attrs?: Record<string, string>): MathEl => ({ tag, children, ...(attrs && { attrs }) });

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const IDENTS: Record<string, string> = { infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅', varnothing: '∅', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', angle: '∠', degree: '°', prime: '′' };
const OPERATORS: Record<string, string> = {
  pm: '±', mp: '∓', times: '×', cdot: '⋅', div: '÷', ast: '∗', star: '⋆', circ: '∘', bullet: '∙', oplus: '⊕', otimes: '⊗', setminus: '∖',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', implies: '⇒', mapsto: '↦', uparrow: '↑', downarrow: '↓',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', perp: '⊥', parallel: '∥', mid: '∣',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', lbrace: '{', rbrace: '}', vert: '|', Vert: '‖',
};
/** Big operators: limits go above and below in display math. */
const LARGE: Record<string, string> = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂' };
const FUNCTIONS = new Set('sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp det dim ker deg arg gcd hom Pr'.split(' '));
const LIMITS = new Set('lim limsup liminf max min sup inf'.split(' '));
const ACCENTS: Record<string, [string, boolean]> = { hat: ['^', true], widehat: ['^', true], bar: ['¯', true], overline: ['‾', false], vec: ['→', true], dot: ['˙', true], ddot: ['¨', true], tilde: ['~', true], widetilde: ['~', true], check: ['ˇ', true], breve: ['˘', true], acute: ['´', true], grave: ['`', true] };
const SPACES: Record<string, string> = { ',': '0.1667em', ':': '0.2222em', ';': '0.2778em', '!': '-0.1667em', ' ': '0.25em', quad: '1em', qquad: '2em', enspace: '0.5em' };
const FENCES: Record<string, [string, string]> = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''], aligned: ['', ''], align: ['', ''], 'align*': ['', ''], array: ['', ''], gathered: ['', ''], split: ['', ''] };

/** Letters in a Unicode mathematical alphabet, holes filled from the letterlike block. */
function alphabet(text: string, base: number, holes: Record<string, string>): string {
  return [...text].map((c) => holes[c] ?? (/[A-Z]/.test(c) ? String.fromCodePoint(base + c.charCodeAt(0) - 65) : /[a-z]/.test(c) ? String.fromCodePoint(base + 26 + c.charCodeAt(0) - 97) : c)).join('');
}
const DOUBLE_STRUCK = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
const SCRIPT = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' };

type Tok = { kind: 'cmd' | 'char' | 'open' | 'close' | 'sup' | 'sub' | 'amp' | 'num'; text: string };

function tokenize(tex: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < tex.length; ) {
    const c = tex[i]!;
    if (c === '\\') {
      const m = /^\\(?:[A-Za-z]+\*?|.)/.exec(tex.slice(i))!;
      out.push({ kind: 'cmd', text: m[0].slice(1) });
      i += m[0].length;
      // A space after a command name only ends the name.
      if (/^[A-Za-z]/.test(m[0].slice(1))) while (tex[i] === ' ') i++;
    } else if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+|^[0-9]+/.exec(tex.slice(i))!;
      out.push({ kind: 'num', text: m[0] });
      i += m[0].length;
    } else {
      out.push({ kind: c === '{' ? 'open' : c === '}' ? 'close' : c === '^' ? 'sup' : c === '_' ? 'sub' : c === '&' ? 'amp' : 'char', text: c });
      i += [...tex.slice(i, i + 2)][0]!.length;
    }
  }
  return out;
}

class TexParser {
  private pos = 0;
  private readonly toks: Tok[];
  private readonly display: boolean;
  constructor(tex: string, display: boolean) {
    this.toks = tokenize(tex);
    this.display = display;
  }

  private peek = () => this.toks[this.pos];

  /** Atoms until a closing brace, `\right`, `\end`, `&` or `\\` (which the caller handles). */
  expr(stopAtCells = false): MathEl {
    const items: MathEl[] = [];
    for (let t = this.peek(); t; t = this.peek()) {
      if (t.kind === 'close' || (t.kind === 'cmd' && (t.text === 'right' || t.text === 'end'))) break;
      if (stopAtCells && (t.kind === 'amp' || (t.kind === 'cmd' && t.text === '\\'))) break;
      if (t.kind === 'amp' || (t.kind === 'cmd' && t.text === '\\')) {
        this.pos++;
        continue;
      }
      const atom = this.atom();
      if (atom) items.push(this.scripts(atom));
    }
    return items.length === 1 ? items[0]! : el('mrow', items);
  }

  /** A required argument: a group or a single token. */
  private arg(): MathEl {
    const t = this.peek();
    if (!t) return el('mrow');
    if (t.kind === 'open') {
      this.pos++;
      const e = this.expr();
      if (this.peek()?.kind === 'close') this.pos++;
      return e;
    }
    return this.atom() ?? el('mrow');
  }

  /** The raw text of a braced argument, e.g. for \text. */
  private rawArg(): string {
    if (this.peek()?.kind !== 'open') return this.toks[this.pos++]?.text ?? '';
    this.pos++;
    let depth = 1;
    let s = '';
    for (let t = this.toks[this.pos++]; t; t = this.toks[this.pos++]) {
      if (t.kind === 'open') depth++;
      if (t.kind === 'close' && --depth === 0) break;
      s += t.kind === 'cmd' ? (t.text.length === 1 ? t.text : `\\${t.text} `) : t.text;
    }
    return s;
  }

  private scripts(base: MathEl): MathEl {
    let sub: MathEl | undefined;
    let sup: MathEl | undefined;
    for (let t = this.peek(); t && (t.kind === 'sub' || t.kind === 'sup' || (t.kind === 'char' && t.text === "'")); t = this.peek()) {
      this.pos++;
      if (t.kind === 'char') sup = sup ? el('mrow', [sup, el('mo', ['′'])]) : el('mo', ['′']);
      else if (t.kind === 'sub') sub = this.arg();
      else sup = this.arg();
    }
    if (!sub && !sup) return base;
    // Limits of big operators and lim go above and below in display math.
    const under = this.display && base.attrs?.['data-limits'] === 'true';
    if (sub && sup) return el(under ? 'munderover' : 'msubsup', [base, sub, sup]);
    return sub ? el(under ? 'munder' : 'msub', [base, sub]) : el(under ? 'mover' : 'msup', [base, sup!]);
  }

  private atom(): MathEl | undefined {
    const t = this.toks[this.pos++]!;
    switch (t.kind) {
      case 'open': {
        const e = this.expr();
        if (this.peek()?.kind === 'close') this.pos++;
        return el('mrow', [e]);
      }
      case 'num':
        return el('mn', [t.text]);
      case 'sup':
      case 'sub':
        // A script with no base: on an empty base.
        this.pos--;
        return el('mrow');
      case 'close':
      case 'amp':
        return undefined;
      case 'char':
        if (/[A-Za-z]/.test(t.text)) return el('mi', [t.text]);
        return el('mo', [t.text === '-' ? '−' : t.text === '*' ? '∗' : t.text]);
      case 'cmd':
        return this.command(t.text);
    }
  }

  private command(name: string): MathEl {
    if (GREEK[name]) return el('mi', [GREEK[name]!], /^[A-Z]/.test(name) ? { mathvariant: 'normal' } : undefined);
    if (IDENTS[name]) return el('mi', [IDENTS[name]!]);
    if (OPERATORS[name]) return el('mo', [OPERATORS[name]!]);
    if (LARGE[name]) return el('mo', [LARGE[name]!], { largeop: 'true', movablelimits: 'true', ...(name.endsWith('int') ? {} : { 'data-limits': 'true' }) });
    if (FUNCTIONS.has(name)) return el('mi', [name], { mathvariant: 'normal' });
    if (LIMITS.has(name)) return el('mi', [name], { mathvariant: 'normal', 'data-limits': 'true' });
    if (name in SPACES) return el('mspace', [], { width: SPACES[name]! });
    if (/^[{}|&%$#_]$/.test(name)) return el('mo', [name === '|' ? '‖' : name]);
    if (ACCENTS[name]) {
      const [mark, accent] = ACCENTS[name]!;
      return el('mover', [this.arg(), el('mo', [mark], accent ? { stretchy: 'false' } : {})], { accent: 'true' });
    }
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
        return el('mfrac', [this.arg(), this.arg()]);
      case 'binom':
        return el('mrow', [el('mo', ['(']), el('mfrac', [this.arg(), this.arg()], { linethickness: '0' }), el('mo', [')'])]);
      case 'sqrt': {
        if (this.peek()?.kind === 'char' && this.peek()!.text === '[') {
          this.pos++;
          const index: MathEl[] = [];
          while (this.peek() && !(this.peek()!.kind === 'char' && this.peek()!.text === ']')) index.push(this.atom() ?? el('mrow'));
          this.pos++;
          return el('mroot', [this.arg(), el('mrow', index)]);
        }
        return el('msqrt', [this.arg()]);
      }
      case 'underline':
        return el('munder', [this.arg(), el('mo', ['_'])], { accentunder: 'true' });
      case 'text':
      case 'textrm':
      case 'mbox':
        return el('mtext', [this.rawArg()]);
      case 'operatorname':
      case 'mathrm':
        return el('mi', [this.rawArg()], { mathvariant: 'normal' });
      case 'mathbf':
      case 'boldsymbol':
        return el('mi', [this.rawArg()], { mathvariant: 'bold' });
      case 'mathit':
        return el('mi', [this.rawArg()], { mathvariant: 'italic' });
      case 'mathbb':
        return el('mi', [alphabet(this.rawArg(), 0x1d538, DOUBLE_STRUCK)]);
      case 'mathcal':
      case 'mathscr':
        return el('mi', [alphabet(this.rawArg(), 0x1d49c, SCRIPT)]);
      case 'left': {
        const open = this.delimiter();
        const inner = this.expr();
        if (this.peek()?.kind === 'cmd' && this.peek()!.text === 'right') this.pos++;
        const close = this.delimiter();
        return el('mrow', [...(open ? [el('mo', [open], { fence: 'true', stretchy: 'true' })] : []), inner, ...(close ? [el('mo', [close], { fence: 'true', stretchy: 'true' })] : [])]);
      }
      case 'begin':
        return this.environment(this.rawArg());
      default:
        return el('merror', [el('mtext', [`\\${name}`])]);
    }
  }

  private delimiter(): string {
    const t = this.toks[this.pos++];
    if (!t) return '';
    if (t.kind === 'cmd') return OPERATORS[t.text] ?? (t.text === '{' || t.text === '}' ? t.text : t.text === '|' ? '‖' : '');
    return t.text === '.' ? '' : t.text;
  }

  /** A matrix-like environment: rows split by \\, cells by &. */
  private environment(name: string): MathEl {
    if (name === 'array') this.rawArg();
    const rows: MathEl[][] = [];
    let row: MathEl[] = [];
    for (;;) {
      row.push(el('mtd', [this.expr(true)]));
      const t = this.peek();
      if (t?.kind === 'amp') {
        this.pos++;
        continue;
      }
      if (t?.kind === 'cmd' && t.text === '\\') {
        this.pos++;
        rows.push(row);
        row = [];
        continue;
      }
      if (t?.kind === 'cmd' && t.text === 'end') {
        this.pos++;
        this.rawArg();
      }
      break;
    }
    // A trailing \\ leaves an empty last row.
    if (!(row.length === 1 && (row[0]!.children[0] as MathEl).tag === 'mrow' && !(row[0]!.children[0] as MathEl).children.length)) rows.push(row);
    const left = name === 'aligned' || name === 'align' || name === 'align*' || name === 'split';
    const table = el(
      'mtable',
      rows.map((r) => el('mtr', r)),
      left ? { columnalign: 'right left', columnspacing: '0' } : name === 'cases' ? { columnalign: 'left left' } : {},
    );
    const [open, close] = FENCES[name] ?? ['', ''];
    return el('mrow', [...(open ? [el('mo', [open], { fence: 'true', stretchy: 'true' })] : []), table, ...(close ? [el('mo', [close], { fence: 'true', stretchy: 'true' })] : [])]);
  }
}

/** MathML for TeX: a `math` element, `display="block"` for display math, with the source as an annotation. */
export function texToMathml(tex: string, display = false): MathEl {
  const body = new TexParser(tex, display).expr();
  return el('math', [el('semantics', [body, el('annotation', [tex], { encoding: 'application/x-tex' })])], display ? { display: 'block' } : {});
}

/** The element as MathML markup, e.g. for tests. */
export function mathmlString(e: MathEl | string): string {
  if (typeof e === 'string') return e.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const attrs = Object.entries(e.attrs ?? {})
    .filter(([k]) => !k.startsWith('data-'))
    .map(([k, v]) => ` ${k}="${mathmlString(v)}"`)
    .join('');
  return `<${e.tag}${attrs}>${e.children.map(mathmlString).join('')}</${e.tag}>`;
}

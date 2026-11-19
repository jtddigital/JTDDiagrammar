/**
 * Code highlighting for fenced code blocks (URS-WS-041, D-007): small rule tables per language, matched left to
 * right; text no rule matches stays plain. Enough to colour, not to parse.
 */
export type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'literal' | 'type' | 'function' | 'tag' | 'attr' | 'property' | 'operator' | 'punct' | 'plain';
export interface Token {
  kind: TokenKind;
  text: string;
}

type Rule = [TokenKind, RegExp];

const words = (list: string) => new RegExp(`^(?:${list.split(' ').join('|')})\\b`);
const NUMBER: Rule = ['number', /^(?:0x[\da-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)/i];
const DQ: Rule = ['string', /^"(?:\\.|[^"\\\n])*"?/];
const SQ: Rule = ['string', /^'(?:\\.|[^'\\\n])*'?/];
const PUNCT: Rule = ['punct', /^[{}[\]();,.]/];
const OPS: Rule = ['operator', /^(?:=>|[-+*/%=<>!&|^~?:]+)/];

const JS_KEYWORDS = 'as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public readonly return set static super switch this throw try type typeof var void while with yield';
const js: Rule[] = [
  ['comment', /^(?:\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/],
  ['string', /^`(?:\\.|[^`\\])*`?/],
  DQ,
  SQ,
  NUMBER,
  ['keyword', words(JS_KEYWORDS)],
  ['literal', words('true false null undefined NaN Infinity')],
  ['type', /^[A-Z][\w$]*/],
  ['function', /^[a-z_$][\w$]*(?=\s*\()/i],
  ['plain', /^[\w$]+/],
  OPS,
  PUNCT,
];

const LANGS: Record<string, Rule[]> = {
  js,
  json: [['property', /^"(?:\\.|[^"\\\n])*"(?=\s*:)/], DQ, NUMBER, ['literal', words('true false null')], PUNCT, ['operator', /^:/]],
  yaml: [
    ['comment', /^#[^\n]*/],
    ['property', /^[\w.-]+(?=\s*:(?:\s|$))/],
    DQ,
    SQ,
    NUMBER,
    ['literal', words('true false null yes no on off')],
    ['operator', /^(?:---|[:\-|>])/],
  ],
  xml: [
    ['comment', /^<!--[\s\S]*?(?:-->|$)/],
    ['tag', /^<\/?[\w:.-]+|^\/?>/],
    ['attr', /^[\w:.-]+(?==)/],
    DQ,
    SQ,
    ['operator', /^=/],
    ['literal', /^&[\w#]+;/],
  ],
  css: [
    ['comment', /^\/\*[\s\S]*?(?:\*\/|$)/],
    ['property', /^[\w-]+(?=\s*:)/],
    DQ,
    SQ,
    ['number', /^-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?/],
    ['literal', /^#[\da-f]{3,8}\b/i],
    ['tag', /^[.#]?[\w-]+(?=[^;{}]*\{)/],
    PUNCT,
    ['operator', /^[:>+~*]/],
  ],
  shell: [
    ['comment', /^#[^\n]*/],
    DQ,
    SQ,
    ['literal', /^\$\{?[\w@#?$!*-]+\}?/],
    ['keyword', words('if then else elif fi for while until do done case esac in function return export local readonly')],
    ['operator', /^(?:&&|\|\||[|&;<>])/],
  ],
  python: [
    ['comment', /^#[^\n]*/],
    ['string', /^(?:[rbuf]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/i],
    DQ,
    SQ,
    NUMBER,
    ['keyword', words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield')],
    ['literal', words('True False None')],
    ['function', /^[a-z_]\w*(?=\s*\()/i],
    ['type', /^[A-Z]\w*/],
    ['plain', /^\w+/],
    OPS,
    PUNCT,
  ],
  sql: [
    ['comment', /^(?:--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/],
    SQ,
    DQ,
    NUMBER,
    ['keyword', new RegExp(`^(?:${'select from where and or not insert into values update set delete create table alter drop index view join left right inner outer full on group by order having limit offset as distinct union all case when then else end is null like in between exists primary key foreign references default'.split(' ').join('|')})\\b`, 'i')],
    ['plain', /^\w+/],
    OPS,
    PUNCT,
  ],
};
const ALIASES: Record<string, string> = { javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', yml: 'yaml', html: 'xml', svg: 'xml', bash: 'shell', sh: 'shell', zsh: 'shell', console: 'shell', py: 'python', jsonc: 'json' };

/** The language a fence's info string names, if it is one we highlight. */
export const language = (info: string) => {
  const name = info.split(/\s+/)[0]?.toLowerCase() ?? '';
  const id = ALIASES[name] ?? name;
  return LANGS[id] ? id : undefined;
};

/** Tokens of `code` in `lang`; plain text throughout for a language we do not know. */
export function highlight(code: string, lang: string | undefined): Token[] {
  const rules = lang ? LANGS[ALIASES[lang] ?? lang] : undefined;
  if (!rules) return [{ kind: 'plain', text: code }];
  const out: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let rest = code;
  while (rest) {
    let hit = false;
    for (const [kind, re] of rules) {
      const m = re.exec(rest);
      if (m && m[0]) {
        push(kind, m[0]);
        rest = rest.slice(m[0].length);
        hit = true;
        break;
      }
    }
    if (!hit) {
      push('plain', rest[0]!);
      rest = rest.slice(1);
    }
  }
  return out;
}

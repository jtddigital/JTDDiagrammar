import { Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** A quoted hex colour, as the schema allows them: `"#rgb"` or `"#rrggbb"`. */
const HEX = /"(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))"/g;

/** `#rrggbb` for the native picker, which takes no other form. */
export const toPicker = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex).toLowerCase();

/** A swatch before a colour; clicking it opens the browser's colour picker, and picking rewrites the hex (URS-WEB-021). */
class Swatch extends WidgetType {
  readonly color: string;
  constructor(color: string) {
    super();
    this.color = color;
  }
  override eq(other: Swatch) {
    return other.color === this.color;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-color-swatch';
    wrap.style.background = this.color;
    const input = wrap.appendChild(document.createElement('input'));
    input.type = 'color';
    input.value = toPicker(this.color);
    input.title = 'Pick a colour';
    input.setAttribute('aria-label', `Colour ${this.color}`);
    // Where the colour is: read while the swatch is on the page. Each pick redraws the line, so a picker
    // left open writes from a swatch that has been replaced; it keeps the place it last saw.
    let at = -1;
    const place = () => wrap.isConnected && (at = view.posAtDOM(wrap));
    input.addEventListener('click', place);
    input.addEventListener('input', () => {
      place();
      const m = at < 0 ? null : /^"(#[0-9a-fA-F]{3,6})"/.exec(view.state.doc.sliceString(at, at + 9));
      if (m) view.dispatch({ changes: { from: at + 1, to: at + 1 + m[1]!.length, insert: input.value } });
    });
    return wrap;
  }
  override ignoreEvent() {
    return true;
  }
}

const swatches = new MatchDecorator({
  regexp: HEX,
  // A widget takes a point, not the match's range: just before the opening quote.
  decorate: (add, from, _to, m) => add(from, from, Decoration.widget({ widget: new Swatch(m[1]!), side: -1 })),
});

/** Colour swatches before every hex colour in the source. */
export const colorPicker = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = swatches.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = swatches.updateDeco(u, this.decorations);
    }
  },
  { decorations: (p) => p.decorations },
);

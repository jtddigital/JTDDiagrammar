import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** JSON highlighting from the design tokens, so it follows light and dark themes (URS-WEB-015). */
export const tokenHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: 'var(--color-code-key)' },
    { tag: tags.string, color: 'var(--color-code-string)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-code-literal)' },
    { tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: 'var(--color-text-muted)' },
  ]),
);

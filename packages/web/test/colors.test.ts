// @vitest-environment happy-dom
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { colorPicker, toPicker } from '../src/editor/colors.ts';

describe('colour pickers in the editor (URS-WEB-021)', () => {
  it('gives the picker #rrggbb', () => {
    expect(toPicker('#F80')).toBe('#ff8800');
    expect(toPicker('#2563EB')).toBe('#2563eb');
  });

  it('puts a swatch before each hex colour, and picking rewrites it in place', () => {
    const doc = '{ "fill": "#f80", "stroke": "#2563eb", "label": "#1 not a colour", "text": "#12345" }';
    const view = new EditorView({ doc, extensions: [colorPicker], parent: document.body });
    const inputs = () => [...view.dom.querySelectorAll<HTMLInputElement>('.cm-color-swatch input[type=color]')];
    const pick = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    expect(inputs().map((i) => i.value)).toEqual(['#ff8800', '#2563eb']);
    pick(inputs()[1]!, '#00aa55');
    expect(view.state.doc.toString()).toBe(doc.replace('#2563eb', '#00aa55'));
    // The short form is written out in full, the only form the picker gives.
    pick(inputs()[0]!, '#112233');
    expect(view.state.doc.toString()).toContain('"fill": "#112233"');
    expect(inputs().map((i) => i.value)).toEqual(['#112233', '#00aa55']);
    view.destroy();
  });

  it('keeps writing while the picker stays open, though each pick redraws the swatch', () => {
    const view = new EditorView({ doc: '{ "a": "#000000", "b": "#ffffff" }', extensions: [colorPicker], parent: document.body });
    const open = view.dom.querySelectorAll<HTMLInputElement>('.cm-color-swatch input')[1]!;
    open.dispatchEvent(new Event('click'));
    for (const value of ['#111111', '#222222', '#333333']) {
      open.value = value;
      open.dispatchEvent(new Event('input'));
    }
    expect(view.state.doc.toString()).toBe('{ "a": "#000000", "b": "#333333" }');
    view.destroy();
  });
});

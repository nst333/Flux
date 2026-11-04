import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
function highlights(doc: Node) {
  let text = '';
  const segments: { start: number; end: number; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock && text) text += '\n';
    if (node.isText) {
      segments.push({ start: text.length, end: text.length + (node.text?.length || 0), pos });
      text += node.text;
    }
  });
  const decorations: Decoration[] = [];
  const regex = /(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$[^$]*?(?<!\\)\$(?!\$)/g;
  for (const m of text.matchAll(regex)) {
    const start = m.index!,
      end = start + m[0].length;
    for (const s of segments) {
      const left = Math.max(start, s.start),
        right = Math.min(end, s.end);
      if (right > left)
        decorations.push(
          Decoration.inline(s.pos + left - s.start, s.pos + right - s.start, { class: 'latex-source' }),
        );
    }
  }
  return DecorationSet.create(doc, decorations);
}
export const MathHighlight = Extension.create({
  name: 'mathSourceHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mathSourceHighlight'),
        state: {
          init: (_, state) => highlights(state.doc),
          apply: (tr, prev) => (tr.docChanged ? highlights(tr.doc) : prev.map(tr.mapping, tr.doc)),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

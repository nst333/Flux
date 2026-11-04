import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState, memo } from 'react';
import katex from 'katex';
import { Bold, Italic, Undo2, Redo2, List, Ellipsis } from 'lucide-react';
import { MathHighlight } from './MathHighlight';
import { equationFontAvailable } from './localFonts';
function examMath(html: string) {
  if (!equationFontAvailable) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  // Hangeul's true math italic lowercase glyphs are stored in its private-use
  // cmap. Change only the aria-hidden visual tree; MathML keeps normal text.
  for (const span of root.querySelectorAll('.katex-html .mathnormal')) {
    if (/^[a-z]+$/.test(span.textContent || '')) {
      span.textContent = [...(span.textContent || '')]
        .map((c) => String.fromCharCode(0xe0e5 + c.charCodeAt(0) - 97))
        .join('');
      span.classList.add('hwp-math-italic');
    }
  }
  return root.innerHTML;
}
const renderCache = new Map<string, { html: string; errors: number }>();
export function renderMathHtml(html: string): { html: string; errors: number } {
  const key = `${equationFontAvailable}:${html}`;
  const cached = renderCache.get(key);
  if (cached) return cached;
  let errors = 0;
  const decode = (s: string) => {
    const el = document.createElement('div');
    el.innerHTML = s.replace(/<\/p>\s*<p[^>]*>/g, '\n').replace(/<br\s*\/?>/g, '\n');
    return el.textContent || '';
  };
  const out = html.replace(
    /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<![\\$])\$([^$]*?)(?<!\\)\$(?!\$)/g,
    (_match, display, inline) => {
      const source = decode(display ?? inline);
      try {
        return `<span class="${display !== undefined ? 'display-equation' : 'inline-equation'}">${examMath(katex.renderToString(source, { displayMode: display !== undefined, throwOnError: true, trust: false, strict: 'ignore' }))}</span>`;
      } catch {
        errors++;
        const safe = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        return `<span class="math-error" title="LaTeX 문법을 확인하세요">${safe}</span>`;
      }
    },
  );
  if (/(?<!\\)\$/.test(out.replace(/<[^>]*>/g, ''))) errors++;
  const result = {
    html: out.replace(/\[\[([가나다라마바사아자차])\]\]/g, '<span class="exam-blank">($1)</span>'),
    errors,
  };
  if (renderCache.size >= 600) renderCache.delete(renderCache.keys().next().value!);
  if (key.length <= 16000) renderCache.set(key, result);
  return result;
}
export const Rendered = memo(function Rendered({ html }: { html: string }) {
  const rendered = renderMathHtml(html);
  return (
    <div
      className="rendered"
      data-math-errors={rendered.errors}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
});
export default function RichText({
  value,
  onChange,
  placeholder = '글과 LaTeX 수식을 입력하세요',
  onImage,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onImage?: (file: File) => void;
}) {
  const [tools, setTools] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        orderedList: false,
      }),
      MathHighlight,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { 'aria-label': placeholder, spellcheck: 'false', autocapitalize: 'off' },
      handlePaste: (_view, event) => {
        const image = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (image && onImage) {
          event.preventDefault();
          onImage(image);
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    if (editor?.view.composing) return;
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  const text = editor?.getText({ blockSeparator: '\n' }) || '';
  return (
    <div className="rich-input simple-input">
      <button
        type="button"
        className="format-toggle"
        aria-label="입력 도구"
        aria-expanded={tools}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setTools(!tools)}
      >
        <Ellipsis size={16} />
      </button>
      {tools && (
        <div className="format-toolbar">
          <button
            type="button"
            title="굵게"
            className={editor?.isActive('bold') ? 'active' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            title="기울임"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            title="글머리표"
            onMouseDown={(e) => e.preventDefault()}
            className={editor?.isActive('bulletList') ? 'active' : ''}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List size={13} />
          </button>
          <select
            aria-label="문장 속 빈칸 삽입"
            value=""
            onChange={(e) => {
              if (e.target.value) editor?.chain().focus().insertContent(` [[${e.target.value}]] `).run();
            }}
          >
            <option value="">빈칸 삽입</option>
            {['가', '나', '다', '라', '마', '바'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <span>LaTeX · $수식$ / $$독립 수식$$</span>
          <button type="button" title="입력 실행 취소" onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 size={13} />
          </button>
          <button type="button" title="입력 다시 실행" onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 size={13} />
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {!text && <span className="input-placeholder">{placeholder}</span>}
    </div>
  );
}

import { useLayoutEffect, useRef, useState, useEffect, memo } from 'react';
import type { CSSProperties } from 'react';
import type { Block, ExamDocument, Problem } from './model';
import { numbering, ordered, examTitle } from './model';
import { Rendered } from './RichText';
import { profiles } from './profiles';
export const circled = (i: number) => String.fromCodePoint(0x2460 + i);
const letters = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'];
export const paperSizes = {
  B4: { width: 257, height: 364 },
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
};
function Choices({ b }: { b: Block }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || b.layout !== 'auto') return;
    const measure = () => {
      const probes = [...el.querySelectorAll<HTMLElement>('.choice-probe')];
      const width = el.clientWidth;
      const max = Math.max(...probes.map((p) => p.scrollWidth + 12), 0);
      setColumns(max <= width / 5 ? 5 : max <= width / 3 ? 3 : max <= width / 2 ? 2 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [b.items, b.layout]);
  const groups =
    b.layout === 'threeTwo'
      ? [b.items.slice(0, 3), b.items.slice(3)]
      : b.layout === 'twoThree'
        ? [b.items.slice(0, 2), b.items.slice(2)]
        : [b.items];
  return (
    <div className="choices-render" ref={ref}>
      <div className="choice-probes">
        {b.items.map((x, i) => (
          <div className="choice-probe" key={x.id}>
            <span>{circled(i)}</span>
            <Rendered html={x.html} />
          </div>
        ))}
      </div>
      {groups.map((group, g) => (
        <div
          key={g}
          className="choice-row"
          style={{
            gridTemplateColumns: `repeat(${groups.length > 1 ? Math.max(group.length, 1) : b.layout === 'vertical' ? 1 : b.layout === 'five' ? 5 : b.layout === 'two' ? 2 : columns},minmax(0,1fr))`,
          }}
        >
          {group.map((x) => (
            <div className="choice-item" key={x.id}>
              <span>{circled(b.items.findIndex((i) => i.id === x.id))}</span>
              <Rendered html={x.html} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
export function BlockView({ b }: { b: Block }) {
  if (b.kind === 'image')
    return b.image ? (
      <div className={`image-render align-${b.align}`}>
        <img src={b.image} style={{ width: b.imageWidth + '%' }} alt="문항 이미지" />
      </div>
    ) : null;
  if (b.kind === 'choices') return <Choices b={b} />;
  if (b.kind === 'conditions' || b.kind === 'view')
    return (
      <div className={`list-render ${b.kind} ${b.columns === 2 ? 'two-columns' : ''}`}>
        {b.kind === 'view' && <div className="view-title">&lt; 보 기 &gt;</div>}
        {b.items.map((x, i) => (
          <div className="condition-row" key={x.id}>
            <span>
              {b.markers === 'none'
                ? ''
                : b.markers === 'bullet'
                  ? '•'
                  : b.markers === 'letters'
                    ? `(${letters[i] || i + 1})`
                    : b.kind === 'conditions'
                      ? `(${letters[i] || i + 1})`
                      : String.fromCharCode(0x3131 + [0, 3, 6, 8, 16, 17, 20, 22, 23, 24][i % 10]) + '.'}
            </span>
            <Rendered html={x.html} />
          </div>
        ))}
      </div>
    );
  return (
    <div className={b.kind === 'box' ? 'box-render' : ''}>
      <Rendered html={b.html} />
    </div>
  );
}
export function answerText(p: Problem) {
  if (p.type === 'short') return p.answer || '미입력';
  const choices = p.blocks.filter((b) => b.kind === 'choices').flatMap((b) => b.items);
  const i = choices.findIndex((x) => x.id === p.answer);
  return i >= 0 ? circled(i) : '미입력';
}
export const ProblemView = memo(function ProblemView({
  p,
  num,
  explanation = false,
  blocks,
  continuation = false,
  measurement = false,
}: {
  p: Problem;
  num: number;
  explanation?: boolean;
  blocks?: Block[];
  continuation?: boolean;
  measurement?: boolean;
}) {
  const content = blocks ?? (explanation ? p.explanation : p.blocks);
  const inlineNumber = !explanation && !continuation && content[0]?.kind === 'text';
  const lastText = content.findLastIndex((b) => b.kind === 'text');
  return (
    <article className="print-problem" data-problem-id={p.id}>
      {!inlineNumber && (
        <div className="question-line">
          <strong>{num}.</strong>
          {continuation && <span className="continued">(계속)</span>}
          <span className="point">[{p.score}점]</span>
        </div>
      )}
      <div className="problem-blocks">
        {content.map((b, i) => {
          let html = b.html;
          if (inlineNumber && i === 0)
            html = html.replace(/<p[^>]*>/, '$&' + `<strong class="printed-number">${num}.</strong> `);
          if (inlineNumber && i === lastText)
            html = html.replace(/<\/p>\s*$/, ` <span class="inline-point">[${p.score}점]</span></p>`);
          return (
            <div key={b.id} data-block-measure={measurement ? b.id : undefined}>
              <BlockView b={b.kind === 'text' ? { ...b, html } : b} />
            </div>
          );
        })}
      </div>
      {explanation && <div className="explanation-answer">정답 {answerText(p)}</div>}
    </article>
  );
});
interface Segment {
  p: Problem;
  blocks: Block[];
  continuation: boolean;
  space: number;
  heading?: string;
}
interface Page {
  columns: Segment[][];
  elective: boolean;
}
export type PrintMode = 'questions' | 'answers' | 'explanations';
export const Preview = memo(function Preview({
  doc,
  selected,
  view,
  mode,
  onWarnings,
  onReady,
}: {
  doc: ExamDocument;
  selected: Problem;
  view: 'problem' | 'exam';
  mode: PrintMode;
  onWarnings: (v: string[]) => void;
  onReady: (v: boolean, version?: string) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, { source: Problem; layout: string; height: number }>());
  const [pages, setPages] = useState<Page[]>([]);
  const size = paperSizes[doc.paper];
  const nums = numbering(doc);
  const sorted = ordered(doc);
  const profile = doc.printProfile && doc.printProfile !== 'legacy' ? profiles[doc.printProfile] : null;
  const ratio = size.width / 297;
  const css = {
    '--paper-width': size.width + 'mm',
    '--paper-height': size.height + 'mm',
    '--paper-margin': doc.margin + 'mm',
    '--column-gap': doc.columnGap + 'mm',
    '--exam-font': doc.fontSize + 'pt',
    '--math-scale': (doc.mathFontSize ?? doc.fontSize * 0.956) / doc.fontSize,
    ...(profile
      ? {
          '--title-font': `${profile.title * ratio}pt`,
          '--number-font': `${profile.number * ratio}pt`,
          '--page-font': `${profile.page * ratio}pt`,
          '--footer-font': `${profile.footer * ratio}pt`,
          '--type-font': `${profile.type * ratio}pt`,
          '--session-font': `${profile.session * ratio}pt`,
          '--body-face': `"${profile.fonts.body}", "Exam Batang", "HCR Batang", Batang, serif`,
          '--title-face': `"${profile.fonts.title}", "Exam Dotum", Dotum, sans-serif`,
          '--number-face': `"${profile.fonts.number}", "Exam Myeongjo", Batang, serif`,
          '--page-face': `"${profile.fonts.page}", "Exam Headline", serif`,
          '--type-face': `"${profile.fonts.type}", "Exam Headline", sans-serif`,
        }
      : {}),
    '--exam-line': doc.lineHeight,
    '--layout-scale': size.width / 210,
    '--header-first': (32 * size.width) / 210 + 'mm',
    '--header-other': (20.4 * size.width) / 210 + 'mm',
  } as CSSProperties;
  useEffect(() => {
    onReady(false);
    const el = measureRef.current;
    if (!el) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      if (cancelled || window.matchMedia('print').matches) return;
      const pxPerMm = 96 / 25.4;
      const fullCapacity = (size.height - doc.margin * 2 - (27.2 * size.width) / 210) * pxPerMm;
      const firstCapacity = fullCapacity - ((11.6 * size.width) / 210) * pxPerMm;
      let out: Page[] = [{ columns: [[], []], elective: false }];
      let page = 0,
        col = 0,
        used = 0;
      const warns: string[] = [];
      if (doc.grade === '3' && sorted.filter((p) => p.section === 'common').length > 22) {
        warns.push('고3 공통 문항이 22개를 넘습니다. 선택과목 번호와 겹치므로 구역을 조정하세요.');
      }
      if (doc.grade === '3' && sorted.filter((p) => p.section === 'elective').length > 8) {
        warns.push('고3 선택 문항이 8개를 넘습니다. 23~30번 범위에 맞춰 문항을 조정하세요.');
      }
      const capacity = () =>
        page === 0 || (out[page].elective && !out[page - 1]?.elective) ? firstCapacity : fullCapacity;
      const next = (newPage = false, elective = false) => {
        if (newPage || col === 1) {
          out.push({ columns: [[], []], elective });
          page++;
          col = 0;
        } else col = 1;
        used = 0;
      };
      let startedElective = false;
      let previousType = '';
      const measureNodes = new Map(
        [...el.querySelectorAll<HTMLElement>('[data-measure-id]')].map((node) => [
          node.dataset.measureId,
          node,
        ]),
      );
      for (const p of sorted) {
        const node = measureNodes.get(p.id);
        if (!node) continue;
        // offsetHeight excludes the screen zoom applied to the preview stage.
        const layout = `${doc.paper}:${doc.margin}:${doc.columnGap}:${doc.fontSize}:${doc.mathFontSize}:${doc.lineHeight}:${doc.printProfile}:${mode}`;
        const cached = heights.current.get(p.id);
        const imagesReady = [...node.querySelectorAll('img')].every((img) => img.complete);
        const fullHeight =
          cached?.source === p && cached.layout === layout && imagesReady
            ? cached.height
            : node.offsetHeight + 1;
        if (imagesReady) heights.current.set(p.id, { source: p, layout, height: fullHeight });
        if (heights.current.size > 1000) heights.current.delete(heights.current.keys().next().value!);
        const blank = mode === 'explanations' ? 10 : p.space;
        const heading =
          mode === 'questions' &&
          (previousType !== p.type || (doc.grade === '3' && p.section === 'elective' && !startedElective))
            ? p.type === 'choice'
              ? '5지선다형'
              : '단답형'
            : undefined;
        previousType = p.type;
        const headingHeight = heading ? ((12 * size.width) / 210) * pxPerMm : 0;
        const total = fullHeight + blank * pxPerMm + headingHeight;
        if (doc.grade === '3' && p.section === 'elective' && !startedElective) {
          startedElective = true;
          if (out[page].columns.some((c) => c.length)) next(true, true);
          else out[page].elective = true;
        } else if (p.breakBefore !== 'auto' && out[page].columns.some((c) => c.length))
          next(p.breakBefore === 'page', startedElective);
        if (total > capacity() - used && used > 0) next(false, startedElective);
        const blocks = mode === 'explanations' ? p.explanation : p.blocks;
        if (total <= capacity()) {
          out[page].columns[col].push({ p, blocks, continuation: false, space: blank, heading });
          used += total;
        } else if (!p.allowSplit) {
          warns.push(
            `${nums.get(p.id)}번: 문항과 풀이 여백이 한 단 높이를 초과합니다. 여백을 줄이거나 분할을 허용하세요.`,
          );
          out[page].columns[col].push({ p, blocks, continuation: false, space: blank, heading });
          used += total;
        } else {
          let batch: Block[] = [],
            height = 12 * pxPerMm + headingHeight,
            continuation = false;
          const commit = (last = false) => {
            out[page].columns[col].push({
              p,
              blocks: batch,
              continuation,
              space: last ? blank : 0,
              heading: continuation ? undefined : heading,
            });
            used += height + (last ? blank * pxPerMm : 0);
            batch = [];
            height = 12 * pxPerMm;
            continuation = true;
          };
          for (const [index, b] of blocks.entries()) {
            const bn = node.querySelector<HTMLElement>(`[data-block-measure="${CSS.escape(b.id)}"]`);
            const bh = (bn?.offsetHeight || 0) + 4 * pxPerMm;
            const trailingSpace = index === blocks.length - 1 ? blank * pxPerMm : 0;
            if (height + bh + trailingSpace > capacity() - used && batch.length) {
              commit();
              next(false, startedElective);
            }
            if (bh + height > capacity())
              warns.push(`${nums.get(p.id)}번: 분할할 수 없는 블록이 한 단보다 큽니다.`);
            batch.push(b);
            height += bh;
          }
          if (height + blank * pxPerMm > capacity() - used)
            warns.push(`${nums.get(p.id)}번: 마지막 블록의 풀이 여백이 단을 초과합니다.`);
          commit(true);
        }
        const bad = node.querySelectorAll('[data-math-errors]:not([data-math-errors="0"])').length;
        if (bad) warns.push(`${nums.get(p.id)}번: 수식 ${bad}곳을 확인하세요.`);
        if ([...node.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth === 0)) {
          warns.push(`${nums.get(p.id)}번: 이미지를 불러오지 못했습니다. 이미지 파일을 교체하세요.`);
        }
        for (const choice of [...node.querySelectorAll<HTMLElement>('.choice-item')])
          if (choice.scrollWidth > choice.clientWidth + 3)
            warns.push(`${nums.get(p.id)}번: 선지가 선택한 배치 너비를 초과합니다.`);
      }
      if (!cancelled) {
        setPages(out);
        onWarnings([...new Set(warns)]);
        onReady(document.fonts.status === 'loaded' && [...el.querySelectorAll('img')].every(img=>img.complete), `${doc.id}:${doc.updatedAt}:${mode}`);
      }
    };
    const schedule = () => {
      onReady(false);
      clearTimeout(timer);
      timer = setTimeout(run, 100);
    };
    const observer = new ResizeObserver(schedule);
    const fontsLoaded = () => { heights.current.clear(); schedule(); };
    document.fonts.addEventListener('loadingdone', fontsLoaded);
    observer.observe(el);
    el.querySelectorAll('img').forEach((img) => {
      img.addEventListener('load', schedule);
      img.addEventListener('error', schedule);
    });
    document.fonts.ready.then(schedule);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fontsLoaded);
      el.querySelectorAll('img').forEach((img) => {
        img.removeEventListener('load', schedule);
        img.removeEventListener('error', schedule);
      });
    };
  }, [doc, mode]);
  const title = examTitle(doc);
  const answersPerPage = Math.max(5, Math.floor((size.height - doc.margin * 2 - 65) / 13) * 5);
  const answerPages = Array.from({ length: Math.ceil(sorted.length / answersPerPage) }, (_, i) =>
    sorted.slice(i * answersPerPage, (i + 1) * answersPerPage),
  );
  return (
    <div className="preview-canvas" style={css}>
      <div
        className="measurement exam-type"
        ref={measureRef}
        style={{ width: `${(size.width - doc.margin * 2 - doc.columnGap) / 2}mm` }}
      >
        {sorted.map((p) => (
          <div key={p.id} data-measure-id={p.id} className="measure-problem">
            <ProblemView p={p} num={nums.get(p.id)!} explanation={mode === 'explanations'} measurement />
          </div>
        ))}
      </div>
      {view === 'problem' && (
        <div className="individual-preview exam-type">
          <div className="individual-label">
            <span>문항 미리보기</span>
            <span>
              {selected.type === 'choice' ? '객관식' : '단답형'} · {selected.score}점
            </span>
          </div>
          <ProblemView p={selected} num={nums.get(selected.id) || 1} />
          <div className="individual-answer">
            <small>정답</small>
            <strong>{answerText(selected)}</strong>
          </div>
        </div>
      )}
      <div className={`pages ${view === 'problem' ? 'screen-hidden' : ''}`}>
        {mode === 'questions' && doc.cover && (
          <section className="exam-page exam-type cover-page">
            <div className="cover-year">{examTitle(doc, true)}</div>
            <div className="cover-session">제 2 교시</div>
            <h1>수학 영역</h1>
            <div className="candidate-fields">
              <span>성명</span>
              <div />
              <span>수험 번호</span>
              <div className="candidate-number">
                {Array.from({ length: 8 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className="cover-directions">
              <h2>수험생 유의 사항</h2>
              <ul>
                <li>문제지의 해당란에 성명과 수험 번호를 정확하게 쓰시오.</li>
                <li>답안지에 수험 번호, 성명 및 선택과목을 정확하게 표기하시오.</li>
                <li>각 문항의 배점은 문항 끝에 표시되어 있습니다.</li>
                {doc.grade === '3' && <li>공통과목과 자신이 선택한 과목의 문제를 풀어야 합니다.</li>}
              </ul>
              <p className="cover-note">
                {doc.coverNote ?? '시험이 시작되기 전까지 문제지를 넘기지 마시오.'}
              </p>
            </div>
            <div className="cover-bottom">문제지</div>
          </section>
        )}
        {mode === 'answers'
          ? answerPages.map((answers, index) => (
              <section className="exam-page exam-type" key={index}>
                <h2 className="answer-title">
                  {doc.titleMode === 'custom' ? examTitle(doc) : doc.name} · 정답표
                </h2>
                <div className="answer-grid">
                  {answers.map((p) => (
                    <div key={p.id}>
                      <strong>{nums.get(p.id)}</strong>
                      <span>{answerText(p)}</span>
                    </div>
                  ))}
                </div>
                <footer className="page-footer">
                  수학 영역 · 정답표 · {index + 1} / {answerPages.length}
                </footer>
              </section>
            ))
          : pages.map((pg, i) => (
              <div className="booklet-group" key={i}>
                {mode === 'questions' &&
                  doc.grade === '3' &&
                  pg.elective &&
                  !pages[i - 1]?.elective &&
                  doc.interleaf &&
                  doc.interleaf !== 'none' && (
                    <section className={`exam-page exam-type interleaf-page ${doc.interleaf}`}>
                      {doc.interleaf === 'elective' && (
                        <>
                          <div className="interleaf-kicker">수학 영역 · 선택과목</div>
                          <h1>{doc.elective}</h1>
                          <p>이어서 선택과목 문제가 제시됩니다.</p>
                          <p>자신이 선택한 과목인지 확인하시오.</p>
                          <strong>23번부터 풀어 주십시오.</strong>
                        </>
                      )}
                    </section>
                  )}
                <section className="exam-page exam-type" key={i}>
                  <header
                    className={
                      i === 0 || (pg.elective && !pages[i - 1]?.elective)
                        ? 'exam-header first'
                        : 'exam-header'
                    }
                  >
                    {i === 0 || (pg.elective && !pages[i - 1]?.elective) ? (
                      <>
                        <div
                          className={`exam-title ${doc.titleMode === 'custom' ? 'custom-title' : ''}`}
                          style={
                            doc.titleMode === 'custom'
                              ? {
                                  fontSize: `calc(${title.length > 40 ? 10 : title.length > 25 ? 13 : 16.92}pt * var(--layout-scale))`,
                                }
                              : undefined
                          }
                        >
                          {title}
                        </div>
                        <div className="exam-heading">
                          <span>제2 교시</span>
                          <h1>
                            수학 영역{pg.elective ? ` (${doc.elective})` : ''}
                            {mode === 'explanations' ? ' · 해설' : ''}
                          </h1>
                          <b>1</b>
                        </div>
                      </>
                    ) : (
                      <div className="running-header">
                        <b>{i + 1}</b>
                        <strong>
                          수학 영역{pg.elective ? ` (${doc.elective})` : ''}
                          {mode === 'explanations' ? ' · 해설' : ''}
                        </strong>
                        <span>고{doc.grade}</span>
                      </div>
                    )}
                    {pg.elective && <div className="elective-heading">선택과목 · {doc.elective}</div>}
                  </header>
                  <div className="exam-columns">
                    {pg.columns.map((column, j) => (
                      <div className="exam-column" key={j}>
                        {column.map((s, k) => (
                          <div key={s.p.id + '-' + k} style={{ paddingBottom: s.space + 'mm' }}>
                            <>
                              {s.heading && (
                                <div className="question-type-heading">
                                  <span>{s.heading}</span>
                                </div>
                              )}
                              <ProblemView
                                p={s.p}
                                num={nums.get(s.p.id)!}
                                explanation={mode === 'explanations'}
                                blocks={s.blocks}
                                continuation={s.continuation}
                              />
                            </>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <footer className="page-footer">
                    <span className="page-count">
                      <b>{i + 1}</b>
                      <b>{pages.length}</b>
                    </span>
                  </footer>
                </section>
              </div>
            ))}
      </div>
    </div>
  );
});

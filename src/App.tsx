import { useState, useEffect, useRef, useCallback, useDeferredValue, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import {
  Plus,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Check,
  Loader2,
  FolderOpen,
  Download,
  Printer,
  Settings2,
  FileText,
  Image as ImageIcon,
  List,
  Square,
  BookOpen,
  PanelLeftClose,
  Undo2,
  Redo2,
  X,
  Save,
  HelpCircle,
  Maximize2,
  AlertTriangle,
  Sun,
  Moon,
} from 'lucide-react';
import type { Block, BlockKind, ExamDocument, Problem } from './model';
import { block, problem, id, names, demo, copyBlock, copyProblem, numbering, ordered } from './model';
import { load, save, exportExam, importExam } from './storage';
import RichText from './RichText';
import Library from './Library';
import BrandMark from './BrandMark';
import { preference, useGlassSurfaces } from './Glass';
import { applyProfile, profiles } from './profiles';
import type { PrintProfile } from './profiles';
import { Preview, paperSizes, circled } from './Preview';
import type { PrintMode } from './Preview';
import { blankReasoningExample } from './examples';
import PinkOutput from './PinkOutput';
const icons = {
  text: FileText,
  image: ImageIcon,
  choices: List,
  conditions: List,
  box: Square,
  view: BookOpen,
};
function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
      return reject(Error('PNG, JPG, WebP, GIF 이미지를 선택하세요.'));
    if (file.size > 8 * 1024 * 1024) return reject(Error('이미지는 8MB 이하로 넣어주세요.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
export default function App() {
  const [doc, setDoc] = useState<ExamDocument>(() => demo());
  const [loaded, setLoaded] = useState(false);
  const [home, setHome] = useState(!location.hash.startsWith('#editor'));
  const homeRef = useRef(home);
  homeRef.current = home;
  const [selectedId, setSelectedId] = useState(doc.problems[0].id);
  const [tab, setTab] = useState<'problem' | 'answer' | 'explanation'>('problem');
  const [leftTab, setLeftTab] = useState<'problems' | 'templates'>('problems');
  const [view, setView] = useState<'problem' | 'exam'>('problem');
  const [mode, setMode] = useState<PrintMode>('questions');
  const [status, setStatus] = useState('loading');
  const [modal, setModal] = useState<'settings' | 'help' | null>(null);
  const [toast, setToast] = useState('');
  const [showBlocks, setShowBlocks] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [readyVersion, setReadyVersion] = useState('');
  const layoutReady = useRef({ ready:false, version:'' });
  const [search, setSearch] = useState('');
  const [dragProblem, setDragProblem] = useState<string | null>(null);
  const [dragBlock, setDragBlock] = useState<number | null>(null);
  const [dark, setDark] = useState(() => preference('flux-theme', 'dark') !== 'light');
  const [reducedEffects, setReducedEffects] = useState(
    () => preference('flux-effects', 'normal') === 'reduced',
  );
  const [exporting, setExporting] = useState(false);
  const [pinkOutput, setPinkOutput] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState(doc);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewSnapshot(doc), 180);
    return () => clearTimeout(timer);
  }, [doc]);
  const previewDoc = useDeferredValue(previewSnapshot);
  useGlassSurfaces(home && loaded);
  const [sidebar, setSidebar] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [zoom, setZoom] = useState<number | null>(null);
  const [autoZoom, setAutoZoom] = useState(0.55);
  const [height, setHeight] = useState(1300);
  const history = useRef<{ past: ExamDocument[]; future: ExamDocument[] }>({ past: [], future: [] });
  const docRef = useRef(doc);
  docRef.current = doc;
  const input = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const saveSequence = useRef(0);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    let cancelled = false;
    load()
      .then(async (saved) => {
        if (cancelled) return;
        if (saved && saved.problems.length) {
          setDoc(saved);
          setSelectedId(saved.problems[0].id);
        }
        if (!saved) await save(docRef.current);
        if (cancelled) return;
        setLoaded(true);
        setStatus('saved');
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(true);
          setStatus('error');
          notify('브라우저 저장소에 접근하지 못했습니다. 파일 저장을 이용하세요.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded || home) return;
    setStatus('pending');
    const sequence = ++saveSequence.current;
    const timer = setTimeout(() => {
      setStatus('saving');
      save(doc)
        .then(() => {
          if (sequence === saveSequence.current) setStatus('saved');
        })
        .catch(() => {
          if (sequence === saveSequence.current) {
            setStatus('error');
            notify('자동 저장 실패. 파일로 저장해 주세요.');
          }
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [doc, loaded, home]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.effects = reducedEffects ? 'reduced' : 'normal';
    try {
      localStorage.setItem('flux-theme', dark ? 'dark' : 'light');
      localStorage.setItem('flux-effects', reducedEffects ? 'reduced' : 'normal');
    } catch {}
  }, [dark, reducedEffects]);
  const update = useCallback((fn: (d: ExamDocument) => ExamDocument) => {
    const old = docRef.current;
    const next = fn(old);
    if (next === old) return;
    history.current.past.push(old);
    if (history.current.past.length > 60) history.current.past.shift();
    history.current.future = [];
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    docRef.current = stamped;
    setDoc(stamped);
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(docRef.current);
    setDoc(previous);
  }, []);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(docRef.current);
    setDoc(next);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (homeRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void exportExam(docRef.current).catch((err) => notify(err.message));
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !(e.target instanceof HTMLElement && e.target.closest('[contenteditable],input,textarea'))
      ) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
  useEffect(() => {
    if (!doc.problems.some((p) => p.id === selectedId)) setSelectedId(doc.problems[0]?.id || '');
  }, [doc.problems, selectedId]);
  const selected = doc.problems.find((p) => p.id === selectedId) || doc.problems[0];
  const nums = numbering(doc);
  const activeBlocks = selected ? (tab === 'explanation' ? selected.explanation : selected.blocks) : [];
  const patchProblem = (changes: Partial<Problem>) =>
    update((d) => ({
      ...d,
      problems: d.problems.map((p) => (p.id === selected.id ? { ...p, ...changes } : p)),
    }));
  const setBlocks = (blocks: Block[]) =>
    patchProblem(tab === 'explanation' ? { explanation: blocks } : { blocks });
  const patchBlock = (blockId: string, changes: Partial<Block>) =>
    setBlocks(activeBlocks.map((b) => (b.id === blockId ? { ...b, ...changes } : b)));
  const addBlock = (kind: BlockKind) => {
    if (kind === 'choices' && activeBlocks.some((b) => b.kind === 'choices')) {
      notify('선택지 블록은 문항당 하나만 넣을 수 있습니다.');
      return;
    }
    setBlocks([...activeBlocks, block(kind)]);
    setShowBlocks(false);
  };
  const addProblem = () => {
    const p = problem();
    p.title = `문항 ${doc.problems.length + 1}`;
    update((d) => ({ ...d, problems: [...d.problems, p] }));
    setSelectedId(p.id);
    setTab('problem');
  };
  const addImage = async (file: File, target: string | null) => {
    try {
      const image = await readImage(file);
      const latest = docRef.current.problems.find((p) => p.id === selectedId);
      if (!latest) return;
      const blocks = tab === 'explanation' ? latest.explanation : latest.blocks;
      if (target) setBlocks(blocks.map((b) => (b.id === target ? { ...b, image } : b)));
      else setBlocks([...blocks, { ...block('image'), image }]);
    } catch (err) {
      notify((err as Error).message);
    }
  };
  const openDocument = async (next: ExamDocument) => {
    if (!homeRef.current) await save(docRef.current);
    if (!next.problems.length) next = { ...next, problems: [problem()] };
    await save(next);
    ++saveSequence.current;
    docRef.current = next;
    setDoc(next);
    setSelectedId(next.problems[0].id);
    history.current = { past: [], future: [] };
    setModal(null);
    setSearch('');
    setTab('problem');
    setHome(false);
    setStatus('saved');
    location.hash = 'editor';
  };
  const goHome = async () => {
    try {
      await save(docRef.current);
      ++saveSequence.current;
      setModal(null);
      setHome(true);
      location.hash = 'documents';
    } catch {
      notify('문서를 저장하지 못했습니다. 파일로 저장한 뒤 다시 시도하세요.');
    }
  };
  useEffect(() => {
    const navigate = () => {
      if (!location.hash.startsWith('#editor') && !homeRef.current) void goHome();
      else if (location.hash.startsWith('#editor') && homeRef.current)
        void load()
          .then((next) => next && openDocument(next))
          .catch(() => notify('문서를 열지 못했습니다.'));
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await importExam(file);
      if (!imported.problems.length) imported.problems = [problem()];
      imported.id = id();
      imported.folderId = undefined;
      await openDocument(imported);
      notify('시험지를 불러왔습니다.');
    } catch (err) {
      notify((err as Error).message);
    }
  };
  const saveTemplate = () => {
    if (!templateName.trim()) {
      notify('템플릿 이름을 입력하세요.');
      return;
    }
    if (!activeBlocks.length) {
      notify('저장할 블록이 없습니다.');
      return;
    }
    update((d) => ({
      ...d,
      templates: [
        ...d.templates,
        { id: id(), name: templateName.trim(), blocks: activeBlocks.map(copyBlock) },
      ],
    }));
    setTemplateName('');
    setLeftTab('templates');
    notify('블록 템플릿을 저장했습니다.');
  };
  const print = async () => {
    const snapshot = docRef.current;
    if (!ready || previewDoc !== doc || readyVersion !== `${doc.id}:${doc.updatedAt}:${mode}`) {
      notify('시험지 배치를 준비하고 있습니다.');
      return;
    }
    if (warnings.length) {
      notify('출력 전에 미리보기의 수식·배치 경고를 해결하세요.');
      return;
    }
    setView('exam');
    await document.fonts.ready;
    await Promise.all(
      [...document.querySelectorAll<HTMLImageElement>('.pages img')].map((img) =>
        img.decode().catch(() => {}),
      ),
    );
    if (docRef.current !== snapshot || !layoutReady.current.ready || layoutReady.current.version !== `${snapshot.id}:${snapshot.updatedAt}:${mode}`) {
      notify('최신 내용의 배치를 준비하고 있습니다. 준비가 끝나면 다시 인쇄하세요.');
      return;
    }
    window.print();
  };
  const warningHandler = useCallback((v: string[]) => setWarnings(v), []);
  const readyHandler = useCallback((v: boolean, version?: string) => {
    layoutReady.current = { ready:v, version:version ?? layoutReady.current.version };
    setReady(v);
    if (v && version) setReadyVersion(version);
  }, []);
  useEffect(() => {
    const el = pane.current,
      content = stage.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      const paperWidth = (paperSizes[doc.paper].width * 96) / 25.4;
      const width = view === 'exam' ? paperWidth : Math.min(530, paperWidth);
      setAutoZoom(Math.min(1, (el.clientWidth - 48) / width));
      setHeight(content.scrollHeight);
    });
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [doc.paper, view, mode, home]);
  const scale = zoom ?? autoZoom;
  const applyTemplate = (blocks: Block[]) => {
    const copy = blocks.map(copyBlock);
    if ([...activeBlocks, ...copy].filter((b) => b.kind === 'choices').length > 1) {
      notify('선택지 블록이 중복됩니다. 기존 블록을 지운 뒤 삽입하세요.');
      return;
    }
    setBlocks([...activeBlocks, ...copy]);
    notify('템플릿을 삽입했습니다.');
  };
  // Card contents depend on metadata, not on the text being edited.
  const cardMetadata = JSON.stringify([doc.grade, doc.elective, doc.problems.map(p => [p.id, p.title, p.section, p.type, p.score])]);
  const problemCards = useMemo(() => ordered(doc)
                    .filter(
                      (p) => !search || p.title.includes(search) || String(nums.get(p.id)).includes(search),
                    )
                    .map((p, i, all) => (
                      <div key={p.id}>
                        {doc.grade === '3' && (i === 0 || all[i - 1]?.section !== p.section) && (
                          <div className="section-label">
                            {p.section === 'common' ? '공통 문항' : `선택 · ${doc.elective}`}
                            <span>{all.filter((x) => x.section === p.section).length}</span>
                          </div>
                        )}
                        <div
                          className={`problem-card ${selectedId === p.id ? 'selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${nums.get(p.id)}번 ${p.title}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setSelectedId(p.id);
                          }}
                          onClick={() => {
                            setSelectedId(p.id);
                            setShowBlocks(false);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!dragProblem) return;
                            update((d) => {
                              const from = d.problems.findIndex((x) => x.id === dragProblem),
                                to = d.problems.findIndex((x) => x.id === p.id);
                              return { ...d, problems: move(d.problems, from, to) };
                            });
                            setDragProblem(null);
                          }}
                        >
                          <span
                            className="drag-handle"
                            draggable
                            onDragStart={() => setDragProblem(p.id)}
                            onDragEnd={() => setDragProblem(null)}
                            title="드래그하여 순서 변경"
                          >
                            <GripVertical size={15} />
                          </span>
                          <span className="problem-number">{String(nums.get(p.id)).padStart(2, '0')}</span>
                          <div className="problem-card-content">
                            <strong>{p.title || '제목 없는 문항'}</strong>
                            <small>
                              {p.type === 'choice' ? '객관식' : '단답형'} <i /> {p.score}점
                            </small>
                          </div>
                          <button
                            className="card-delete"
                            title="문항 삭제"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (doc.problems.length === 1) {
                                notify('최소 한 문항이 필요합니다.');
                                return;
                              }
                              update((d) => ({ ...d, problems: d.problems.filter((x) => x.id !== p.id) }));
                              notify('문항을 삭제했습니다. 실행 취소로 복원할 수 있습니다.');
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )), [cardMetadata, search, selectedId, dragProblem, update]);
  if (home)
    return loaded ? (
      <Library
        onOpen={openDocument}
        dark={dark}
        onTheme={() => setDark(!dark)}
        reducedEffects={reducedEffects}
        onEffects={() => setReducedEffects(!reducedEffects)}
      />
    ) : (
      <div className="library-empty">문서를 불러오는 중…</div>
    );
  return (
    <div className="app">
      <style>{`@media print { @page {size: ${paperSizes[doc.paper].width}mm ${paperSizes[doc.paper].height}mm; margin:0;} }`}</style>
      <header className="topbar">
        <button onClick={() => void goHome()} title="문서 보관함으로 돌아가기">
          <FolderOpen size={16} />
          문서 홈
        </button>
        <div className="brand">
          <BrandMark />
          <span>Flux</span>
          <span className="brand-divider" />
          <small>수학 시험지 편집기</small>
        </div>
        <div className="document-name">
          <input
            aria-label="문서 이름"
            value={doc.name}
            onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          />
          <ChevronDown size={14} />
        </div>
        <div
          className="save-status"
          title={
            status === 'saved' ? `마지막 저장 ${new Date(doc.updatedAt).toLocaleTimeString('ko-KR')}` : ''
          }
        >
          {status === 'saved' ? (
            <Check size={14} />
          ) : status === 'saving' || status === 'loading' ? (
            <Loader2 className="spin" size={14} />
          ) : status === 'error' ? (
            <AlertTriangle size={14} />
          ) : (
            <span className="pending-dot" />
          )}
          <span>
            {status === 'saved'
              ? '자동 저장됨'
              : status === 'pending'
                ? '저장 대기'
                : status === 'error'
                  ? '저장 실패'
                  : '저장 중'}
          </span>
        </div>
        <div className="top-actions">
          <button onClick={() => setPinkOutput(true)}><FileText size={16}/><span>벚꽃 문제지</span></button>
          <button title="문서 불러오기" onClick={() => input.current?.click()}>
            <FolderOpen size={16} />
            <span>불러오기</span>
          </button>
          <button
            onClick={() =>
              void exportExam(doc)
                .then(() => notify('시험지 파일을 저장했습니다.'))
                .catch((err) => notify(err.message))
            }
          >
            <Download size={16} />
            <span>파일 저장</span>
          </button>
          <button
            className="hwpx-button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const { exportHwpx } = await import('./hwpx');
                await exportHwpx(doc, mode);
                notify('HWPX 파일을 저장했습니다. 원서체 출력은 한글에서 확인하세요.');
              } catch (e) {
                window.alert((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
          >
            <FileText size={16} />
            <span>{exporting ? '변환 중…' : '한글 파일'}</span>
          </button>
          <button
            className="primary"
            onClick={() => void print()}
            disabled={!ready || previewDoc !== doc || readyVersion !== `${doc.id}:${doc.updatedAt}:${mode}`}
          >
            <Printer size={16} />
            <span>인쇄 / PDF</span>
          </button>
          <button className="icon-button" title="사용 안내" onClick={() => setModal('help')}>
            <HelpCircle size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="효과 줄이기"
            aria-pressed={reducedEffects}
            title="효과 줄이기"
            onClick={() => setReducedEffects(!reducedEffects)}
          >
            <Settings2 size={17} />
          </button>
          <button className="icon-button" title="테마 전환" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>
      {pinkOutput && <PinkOutput doc={doc} onClose={() => setPinkOutput(false)} onExample={openDocument} />}
      <div className="workspace">
        {sidebar && (
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button
                className={leftTab === 'problems' ? 'active' : ''}
                onClick={() => setLeftTab('problems')}
              >
                문항 목록 <span>{doc.problems.length}</span>
              </button>
              <button
                className={leftTab === 'templates' ? 'active' : ''}
                onClick={() => setLeftTab('templates')}
              >
                블록 템플릿
              </button>
            </div>
            {leftTab === 'problems' ? (
              <>
                <div className="sidebar-search">
                  <input
                    placeholder="문항 검색"
                    aria-label="문항 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span>⌕</span>
                </div>
                <button
                  className="example-button"
                  onClick={() => {
                    const p = blankReasoningExample();
                    update((d) => ({ ...d, problems: [...d.problems, p] }));
                    setSelectedId(p.id);
                    setTab('problem');
                  }}
                >
                  <Plus size={13} />
                  빈칸 추론 예제 추가
                </button>
                <div className="problem-list">
                  {problemCards}
                </div>
                <div className="sidebar-bottom">
                  <button className="add-problem" onClick={addProblem}>
                    <Plus size={16} />새 문항 추가
                  </button>
                  <div className="document-stat">
                    <span>{doc.problems.length}문항</span>
                    <span>총 {doc.problems.reduce((n, p) => n + p.score, 0)}점</span>
                  </div>
                  <button
                    className="new-document"
                    onClick={() => {
                      void openDocument({ ...demo(), problems: [problem()], name: '새 시험지' }).catch(() =>
                        notify('새 문서를 저장하지 못했습니다.'),
                      );
                    }}
                  >
                    새 시험지 만들기
                  </button>
                </div>
              </>
            ) : (
              <div className="templates-panel">
                <div className="template-intro">
                  <BookOpen size={24} />
                  <h3>자주 쓰는 구성을 모아두세요</h3>
                  <p>현재 편집 중인 문제 또는 해설의 블록 전체를 저장합니다.</p>
                </div>
                <input
                  aria-label="템플릿 이름"
                  placeholder="템플릿 이름"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button className="primary" onClick={saveTemplate}>
                  <Save size={14} />
                  현재 블록 저장
                </button>
                {doc.templates.map((t) => (
                  <div className="template-card" key={t.id}>
                    <strong>{t.name}</strong>
                    <small>{t.blocks.map((b) => names[b.kind]).join(' · ')}</small>
                    <div>
                      <button onClick={() => applyTemplate(t.blocks)}>
                        삽입 <Plus size={13} />
                      </button>
                      <button
                        title="템플릿 삭제"
                        onClick={() =>
                          update((d) => ({ ...d, templates: d.templates.filter((x) => x.id !== t.id) }))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
        <main className="editor-pane">
          <div className="pane-heading">
            <div>
              <button className="icon-button" title="목록 표시 전환" onClick={() => setSidebar(!sidebar)}>
                <PanelLeftClose size={16} />
              </button>
              <h2>문항 편집</h2>
              <span className="muted-count">{String(nums.get(selected?.id) || 1).padStart(2, '0')}</span>
            </div>
            <div>
              <button className="icon-button" title="문서 실행 취소" onClick={undo}>
                <Undo2 size={16} />
              </button>
              <button className="icon-button" title="문서 다시 실행" onClick={redo}>
                <Redo2 size={16} />
              </button>
              <button
                className="icon-button"
                title="문항 복제"
                onClick={() => {
                  const next = copyProblem(selected);
                  update((d) => ({ ...d, problems: [...d.problems, next] }));
                  setSelectedId(next.id);
                }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
          {selected && (
            <div className="editor-scroll">
              <div className="editor-meta">
                <div className="eyebrow">문항 {String(nums.get(selected.id)).padStart(2, '0')}</div>
                <input
                  className="question-title"
                  aria-label="문항 제목"
                  value={selected.title}
                  onChange={(e) => patchProblem({ title: e.target.value })}
                />
                <input
                  className="question-description"
                  aria-label="문항 설명"
                  placeholder="출처나 메모를 남겨보세요 · 시험지에 출력되지 않습니다"
                  value={selected.description}
                  onChange={(e) => patchProblem({ description: e.target.value })}
                />
                <div className="meta-selects">
                  <label>
                    유형
                    <select
                      aria-label="문항 유형"
                      value={selected.type}
                      onChange={(e) => patchProblem({ type: e.target.value as Problem['type'], answer: '' })}
                    >
                      <option value="choice">객관식</option>
                      <option value="short">단답형</option>
                    </select>
                  </label>
                  <label>
                    배점
                    <select
                      aria-label="배점"
                      value={selected.score}
                      onChange={(e) => patchProblem({ score: Number(e.target.value) })}
                    >
                      {[2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}점
                        </option>
                      ))}
                    </select>
                  </label>
                  {doc.grade === '3' && (
                    <label>
                      구역
                      <select
                        aria-label="문항 구역"
                        value={selected.section}
                        onChange={(e) => patchProblem({ section: e.target.value as Problem['section'] })}
                      >
                        <option value="common">공통</option>
                        <option value="elective">선택과목</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <div className="editor-tabs">
                {(
                  [
                    ['problem', '문제'],
                    ['answer', '정답'],
                    ['explanation', '해설'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? 'active' : ''}
                    onClick={() => {
                      setTab(key);
                      setShowBlocks(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'answer' ? (
                <div className="answer-editor">
                  <h3>정답 설정</h3>
                  <p>문제지에는 표시되지 않으며 정답표와 해설지에 출력됩니다.</p>
                  {selected.type === 'short' ? (
                    <input
                      aria-label="단답형 정답"
                      placeholder="정답을 입력하세요"
                      value={selected.answer}
                      onChange={(e) => patchProblem({ answer: e.target.value })}
                    />
                  ) : (
                    <div className="answer-options">
                      {selected.blocks
                        .filter((b) => b.kind === 'choices')
                        .flatMap((b) => b.items)
                        .map((x, i) => (
                          <button
                            className={selected.answer === x.id ? 'active' : ''}
                            key={x.id}
                            onClick={() => patchProblem({ answer: selected.answer === x.id ? '' : x.id })}
                          >
                            {circled(i)}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="block-editor">
                  <div className="blocks-label">
                    <span>{tab === 'explanation' ? '해설 블록' : '문제 블록'}</span>
                    <span>{activeBlocks.length}개</span>
                  </div>
                  {activeBlocks.map((b, index) => {
                    const Icon = icons[b.kind];
                    return (
                      <section
                        className="block-card"
                        key={b.id}
                        data-block-id={b.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragBlock !== null) setBlocks(move(activeBlocks, dragBlock, index));
                          setDragBlock(null);
                        }}
                      >
                        <header>
                          <div>
                            <span
                              className="drag-handle"
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDragBlock(index);
                              }}
                              onDragEnd={() => setDragBlock(null)}
                            >
                              <GripVertical size={14} />
                            </span>
                            <Icon size={14} />
                            <strong>{names[b.kind]}</strong>
                            {b.kind === 'choices' && <small>번호를 누르면 정답 선택</small>}
                          </div>
                          <div className="block-actions">
                            <button
                              title="위로 이동"
                              disabled={index === 0}
                              onClick={() => setBlocks(move(activeBlocks, index, index - 1))}
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              title="아래로 이동"
                              disabled={index === activeBlocks.length - 1}
                              onClick={() => setBlocks(move(activeBlocks, index, index + 1))}
                            >
                              <ArrowDown size={13} />
                            </button>
                            <button
                              title="블록 복제"
                              onClick={() => {
                                if (b.kind === 'choices') {
                                  notify('선택지 블록은 복제할 수 없습니다.');
                                  return;
                                }
                                setBlocks([
                                  ...activeBlocks.slice(0, index + 1),
                                  copyBlock(b),
                                  ...activeBlocks.slice(index + 1),
                                ]);
                              }}
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              title="블록 삭제"
                              onClick={() => {
                                setBlocks(activeBlocks.filter((x) => x.id !== b.id));
                                notify('블록을 삭제했습니다. 실행 취소로 복원할 수 있습니다.');
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </header>
                        {b.kind === 'image' ? (
                          <div className="image-editor">
                            {b.image ? (
                              <img src={b.image} alt="편집 중인 문항 이미지" />
                            ) : (
                              <div className="image-placeholder">
                                <ImageIcon size={26} />
                                <p>그래프, 도형, 표를 넣어보세요</p>
                              </div>
                            )}
                            <button
                              onClick={() => {
                                imageTarget.current = b.id;
                                imageInput.current?.click();
                              }}
                            >
                              {b.image ? '이미지 교체' : '이미지 선택'}
                            </button>
                            <details className="image-settings-disclosure">
                              <summary>크기·정렬</summary>
                              <div className="image-settings">
                                <label>
                                  너비 {b.imageWidth}%
                                  <input
                                    aria-label="이미지 너비"
                                    type="range"
                                    min="10"
                                    max="100"
                                    value={b.imageWidth}
                                    onChange={(e) => patchBlock(b.id, { imageWidth: Number(e.target.value) })}
                                  />
                                </label>
                                <select
                                  aria-label="이미지 정렬"
                                  value={b.align}
                                  onChange={(e) =>
                                    patchBlock(b.id, { align: e.target.value as Block['align'] })
                                  }
                                >
                                  <option value="left">왼쪽</option>
                                  <option value="center">가운데</option>
                                  <option value="right">오른쪽</option>
                                </select>
                              </div>
                            </details>
                          </div>
                        ) : ['choices', 'conditions', 'view'].includes(b.kind) ? (
                          <>
                            <div className="item-list">
                              {b.items.map((x, i) => (
                                <div className="editable-item" key={x.id}>
                                  <button
                                    title={b.kind === 'choices' ? '정답으로 설정' : '항목 번호'}
                                    className={`item-number ${selected.answer === x.id ? 'correct' : ''}`}
                                    disabled={
                                      b.kind !== 'choices' ||
                                      selected.type !== 'choice' ||
                                      tab === 'explanation'
                                    }
                                    onClick={() =>
                                      patchProblem({ answer: selected.answer === x.id ? '' : x.id })
                                    }
                                  >
                                    {b.kind === 'choices'
                                      ? circled(i)
                                      : b.kind === 'conditions'
                                        ? `(${['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'][i] || i + 1})`
                                        : [
                                            'ㄱ.',
                                            'ㄴ.',
                                            'ㄷ.',
                                            'ㄹ.',
                                            'ㅁ.',
                                            'ㅂ.',
                                            'ㅅ.',
                                            'ㅇ.',
                                            'ㅈ.',
                                            'ㅊ.',
                                          ][i] || `${i + 1}.`}
                                  </button>
                                  <RichText
                                    value={x.html}
                                    placeholder={`${names[b.kind]} ${i + 1} 입력`}
                                    onChange={(html) =>
                                      patchBlock(b.id, {
                                        items: b.items.map((item) =>
                                          item.id === x.id ? { ...item, html } : item,
                                        ),
                                      })
                                    }
                                  />
                                  <div className="item-actions">
                                    <button
                                      title="항목 위로 이동"
                                      disabled={i === 0}
                                      onClick={() => patchBlock(b.id, { items: move(b.items, i, i - 1) })}
                                    >
                                      <ArrowUp size={11} />
                                    </button>
                                    <button
                                      title="항목 삭제"
                                      onClick={() => {
                                        patchBlock(b.id, {
                                          items: b.items.filter((item) => item.id !== x.id),
                                        });
                                        if (selected.answer === x.id)
                                          patchProblem({
                                            ...(tab === 'explanation'
                                              ? {
                                                  explanation: activeBlocks.map((bl) =>
                                                    bl.id === b.id
                                                      ? {
                                                          ...bl,
                                                          items: b.items.filter((item) => item.id !== x.id),
                                                        }
                                                      : bl,
                                                  ),
                                                }
                                              : {
                                                  blocks: activeBlocks.map((bl) =>
                                                    bl.id === b.id
                                                      ? {
                                                          ...bl,
                                                          items: b.items.filter((item) => item.id !== x.id),
                                                        }
                                                      : bl,
                                                  ),
                                                }),
                                            answer: '',
                                          });
                                      }}
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {b.kind === 'choices' && (
                              <div className="choice-settings">
                                <label>
                                  선지 배치
                                  <select
                                    aria-label="선지 배치"
                                    value={b.layout}
                                    onChange={(e) =>
                                      patchBlock(b.id, { layout: e.target.value as Block['layout'] })
                                    }
                                  >
                                    <option value="auto">자동 · 길이에 맞춰</option>
                                    <option value="five">한 줄에 5개</option>
                                    <option value="two">두 열 · 2 + 2 + 1</option>
                                    <option value="threeTwo">3 + 2</option>
                                    <option value="twoThree">2 + 3</option>
                                    <option value="vertical">세로</option>
                                  </select>
                                </label>
                              </div>
                            )}
                            {(b.kind === 'view' || b.kind === 'conditions') && (
                              <div className="choice-settings">
                                <label>
                                  항목 표기
                                  <select
                                    aria-label="항목 표기"
                                    value={b.markers || 'korean'}
                                    onChange={(e) =>
                                      patchBlock(b.id, { markers: e.target.value as Block['markers'] })
                                    }
                                  >
                                    <option value="korean">기본</option>
                                    <option value="letters">(가), (나), (다)</option>
                                    <option value="bullet">글머리표</option>
                                    <option value="none">없음</option>
                                  </select>
                                </label>
                                <label>
                                  열 배치
                                  <select
                                    aria-label="보기 열 배치"
                                    value={b.columns || 1}
                                    onChange={(e) =>
                                      patchBlock(b.id, { columns: Number(e.target.value) as 1 | 2 })
                                    }
                                  >
                                    <option value="1">1열</option>
                                    <option value="2">2열</option>
                                  </select>
                                </label>
                              </div>
                            )}
                            <button
                              className="add-item"
                              onClick={() => {
                                if (b.items.length >= 20) {
                                  notify('최대 20개 항목까지 추가할 수 있습니다.');
                                  return;
                                }
                                patchBlock(b.id, { items: [...b.items, { id: id(), html: '<p></p>' }] });
                              }}
                            >
                              <Plus size={13} />
                              {b.kind === 'choices'
                                ? '선택지'
                                : b.kind === 'conditions'
                                  ? '조건'
                                  : '보기'}{' '}
                              추가
                            </button>
                          </>
                        ) : (
                          <RichText
                            value={b.html}
                            onChange={(html) => patchBlock(b.id, { html })}
                            onImage={(file) => void addImage(file, null)}
                            placeholder={
                              b.kind === 'box'
                                ? '박스 안에 글과 수식을 입력하세요'
                                : '문제 본문을 입력하세요. 수식은 $…$로 감싸세요.'
                            }
                          />
                        )}
                      </section>
                    );
                  })}
                  <div className="add-block-wrap">
                    <button className="add-block" onClick={() => setShowBlocks(!showBlocks)}>
                      <Plus size={16} />
                      블록 추가
                      <ChevronDown size={14} />
                    </button>
                    {showBlocks && (
                      <div className="block-menu">
                        {(Object.keys(names) as BlockKind[]).map((kind) => {
                          const Icon = icons[kind];
                          return (
                            <button key={kind} onClick={() => addBlock(kind)}>
                              <Icon size={17} />
                              <div>
                                <strong>{names[kind]} 블록</strong>
                                <small>
                                  {
                                    {
                                      text: '일반 글과 LaTeX 수식',
                                      image: '그래프 · 도형 · 표',
                                      choices: '객관식 선지와 정답',
                                      conditions: '(가), (나) 조건 묶음',
                                      box: '테두리가 있는 본문',
                                      view: 'ㄱ, ㄴ, ㄷ 보기 묶음',
                                    }[kind]
                                  }
                                </small>
                              </div>
                              <Plus size={14} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <details className="layout-details">
                <summary>
                  <Settings2 size={14} />
                  문항 배치와 풀이 여백
                  <ChevronRight size={14} />
                </summary>
                <div>
                  <label>
                    풀이 여백 <span>{selected.space} mm</span>
                    <input
                      aria-label="풀이 여백"
                      type="range"
                      min="0"
                      max="150"
                      step="5"
                      value={selected.space}
                      onChange={(e) => patchProblem({ space: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    문항 시작
                    <select
                      aria-label="문항 시작"
                      value={selected.breakBefore}
                      onChange={(e) =>
                        patchProblem({ breakBefore: e.target.value as Problem['breakBefore'] })
                      }
                    >
                      <option value="auto">자동 배치</option>
                      <option value="column">다음 단에서 시작</option>
                      <option value="page">다음 페이지에서 시작</option>
                    </select>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={selected.allowSplit}
                      onChange={(e) => patchProblem({ allowSplit: e.target.checked })}
                    />
                    긴 문항의 블록 사이 분할 허용
                  </label>
                </div>
              </details>
              <div className="editor-footnote">
                수식은 LaTeX로 입력하세요. 예: $\frac&#123;1&#125;&#123;2&#125;${' '}
                <button onClick={() => setModal('help')}>사용 안내 ↗</button>
              </div>
            </div>
          )}
        </main>
        <div
          className="pane-resizer"
          role="separator"
          aria-label="편집 영역 너비 조절"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragging.current) {
              const workspace = document.querySelector<HTMLElement>('.workspace')!;
              const side = sidebar ? 244 : 0;
              workspace.style.setProperty(
                '--editor-width',
                `${Math.max(390, Math.min(850, e.clientX - side))}px`,
              );
            }
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        />
        <section className="preview-pane">
          <div className="pane-heading">
            <div>
              <h2>미리보기</h2>
              <span className="live-badge">
                <i />
                LIVE
              </span>
            </div>
            <button className="settings-button" onClick={() => setModal('settings')}>
              <Settings2 size={15} />
              시험지 설정
            </button>
          </div>
          <div className="preview-toolbar">
            <div className="preview-switch">
              <button className={view === 'exam' ? 'active' : ''} onClick={() => setView('exam')}>
                전체 시험지
              </button>
              <button className={view === 'problem' ? 'active' : ''} onClick={() => setView('problem')}>
                현재 문항
              </button>
            </div>
            <div className="preview-options">
              <select
                aria-label="출력 종류"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as PrintMode);
                  setView('exam');
                }}
              >
                <option value="questions">문제지</option>
                <option value="answers">정답표</option>
                <option value="explanations">해설지</option>
              </select>
              <select
                aria-label="확대 비율"
                value={zoom ?? 'fit'}
                onChange={(e) => setZoom(e.target.value === 'fit' ? null : Number(e.target.value))}
              >
                <option value="fit">너비 맞춤</option>
                {[0.5, 0.65, 0.8, 1].map((z) => (
                  <option key={z} value={z}>
                    {z * 100}%
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="preview-info">
            <span>
              {doc.year} · {doc.month}월 · 고{doc.grade}
            </span>
            <span>
              {doc.paper} · 2단{doc.grade === '3' ? ` · ${doc.elective}` : ''}
            </span>
          </div>
          {warnings.length > 0 && (
            <details className="warnings">
              <summary>
                <AlertTriangle size={14} />
                출력 전 확인 {warnings.length}건
              </summary>
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </details>
          )}
          <div className="preview-viewport" ref={pane}>
            <div
              className="stage-shell"
              style={{
                height: height * scale + 32,
                width: (view === 'exam' ? (paperSizes[doc.paper].width * 96) / 25.4 : 530) * scale,
              }}
            >
              <div
                className="preview-stage"
                ref={stage}
                style={{
                  transform: `scale(${scale})`,
                  width: view === 'exam' ? (paperSizes[doc.paper].width * 96) / 25.4 : 530,
                }}
              >
                {selected && (
                  <Preview
                    doc={previewDoc}
                    selected={previewDoc.problems.find((p) => p.id === selectedId) ?? previewDoc.problems[0]}
                    view={view}
                    mode={mode}
                    onWarnings={warningHandler}
                    onReady={readyHandler}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="output-note">
            웹 미리보기 · 원서체 PDF는 미검증입니다. 한글 파일로 원래 서체를 지정해 내보낼 수 있습니다.
          </div>
          <footer className="preview-footer">
            <span>
              <Check size={12} />
              편집 내용이 실시간으로 반영됩니다
            </span>
            <button
              onClick={() => {
                setView('exam');
                setZoom(null);
              }}
            >
              <Maximize2 size={13} />
              너비 맞춤
            </button>
          </footer>
        </section>
      </div>
      <input ref={input} type="file" accept=".mathexam" hidden onChange={(e) => void importFile(e)} />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file, imageTarget.current);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'settings' ? '시험지 설정' : '사용 안내'}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <h2>{modal === 'settings' ? '시험지 설정' : '사용 안내'}</h2>
              </div>
              <button className="icon-button" aria-label="창 닫기" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </header>
            {modal === 'settings' ? (
              <div className="settings-form">
                <label>
                  출력 양식
                  <select
                    aria-label="출력 양식"
                    value={doc.printProfile ?? 'legacy'}
                    onChange={(e) => update((d) => applyProfile(d, e.target.value as PrintProfile))}
                  >
                    <option value="legacy">기존 문서 설정</option>
                    {Object.entries(profiles).map(([key, p]) => (
                      <option key={key} value={key}>
                        {p.name} · A3
                      </option>
                    ))}
                  </select>
                  <small>
                    양식을 선택하면 해당 원본의 용지·본문·수식 크기를 적용합니다. 학년과 출력 양식은 별도로
                    선택합니다.
                  </small>
                </label>
                <label>
                  수식 크기
                  <input
                    aria-label="수식 크기"
                    type="number"
                    min="7"
                    max="18"
                    step="0.01"
                    value={doc.mathFontSize ?? Number((doc.fontSize * 0.956).toFixed(2))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 7 && n <= 18) update((d) => ({ ...d, mathFontSize: n }));
                    }}
                  />
                </label>
                <label>
                  시험지 제목 방식
                  <select
                    aria-label="시험지 제목 방식"
                    value={doc.titleMode ?? 'auto'}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        titleMode: e.target.value as 'auto' | 'custom',
                        customTitle: d.customTitle ?? d.name,
                      }))
                    }
                  >
                    <option value="auto">모의고사 양식 · 자동 생성</option>
                    <option value="custom">직접 입력</option>
                  </select>
                </label>
                {doc.titleMode === 'custom' && (
                  <label>
                    인쇄할 시험지 제목
                    <input
                      aria-label="인쇄할 시험지 제목"
                      maxLength={80}
                      placeholder="예: 함수의 연속 · 개념 확인"
                      value={doc.customTitle ?? ''}
                      onChange={(e) => update((d) => ({ ...d, customTitle: e.target.value }))}
                    />
                    <small>비워두면 문서 이름을 사용합니다. 표지에도 같은 제목이 표시됩니다.</small>
                  </label>
                )}
                {doc.titleMode !== 'custom' && (
                  <div className="settings-row">
                    <label>
                      학년도
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        value={doc.year}
                        onChange={(e) => update((d) => ({ ...d, year: Number(e.target.value) || 2026 }))}
                      />
                    </label>
                    <label>
                      시행 월
                      <select
                        value={doc.month}
                        onChange={(e) => update((d) => ({ ...d, month: Number(e.target.value) }))}
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}월
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <label>
                  시험지 양식
                  <select
                    aria-label="시험지 양식"
                    value={doc.grade}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        grade: e.target.value as ExamDocument['grade'],
                      }))
                    }
                  >
                    <option value="1">고1 · 단일과목형</option>
                    <option value="2">고2 · 단일과목형</option>
                    <option value="3">고3 · 공통 + 선택과목형</option>
                  </select>
                </label>
                {doc.grade === '3' && (
                  <label>
                    선택과목
                    <select
                      aria-label="선택과목"
                      value={doc.elective}
                      onChange={(e) => update((d) => ({ ...d, elective: e.target.value }))}
                    >
                      {['확률과 통계', '미적분', '기하'].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="settings-row">
                  <label>
                    용지
                    <select
                      value={doc.paper}
                      onChange={(e) =>
                        update((d) => ({ ...d, paper: e.target.value as ExamDocument['paper'] }))
                      }
                    >
                      <option value="B4">B4 · 257 × 364 mm</option>
                      <option value="A4">A4 · 210 × 297 mm</option>
                      <option value="A3">A3 · 297 × 420 mm</option>
                    </select>
                  </label>
                  <label>
                    글자 크기
                    <select
                      value={doc.fontSize}
                      onChange={(e) => update((d) => ({ ...d, fontSize: Number(e.target.value) }))}
                    >
                      {Array.from(
                        new Set([doc.fontSize, 8.16, 8.2, 9, 10, 10.91, 11, 11.48, 11.5, 11.52, 12, 13, 14]),
                      )
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n} pt
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <label>
                    바깥 여백
                    <select
                      value={doc.margin}
                      onChange={(e) => update((d) => ({ ...d, margin: Number(e.target.value) }))}
                    >
                      {[12, 14, 16, 18, 20, 22, 31].map((n) => (
                        <option key={n} value={n}>
                          {n} mm
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    단 사이 간격
                    <select
                      value={doc.columnGap}
                      onChange={(e) => update((d) => ({ ...d, columnGap: Number(e.target.value) }))}
                    >
                      {[4, 6, 8, 10, 12, 14, 16].map((n) => (
                        <option key={n} value={n}>
                          {n} mm
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  행간
                  <select
                    value={doc.lineHeight}
                    onChange={(e) => update((d) => ({ ...d, lineHeight: Number(e.target.value) }))}
                  >
                    {[1.4, 1.5, 1.55, 1.65, 1.8, 2].map((n) => (
                      <option key={n} value={n}>
                        {Math.round(n * 100)}%
                      </option>
                    ))}
                  </select>
                </label>
                <p className="template-note">
                  A3 원본 기준: 평가원 본문 11.48pt·수식 10.98pt, 교육청 본문 11.52pt·수식 11.04pt.
                  웹 미리보기는 사용 가능한 글꼴로 표시하며, 한글 파일에는 양식의 원래 서체를 지정합니다.
                  기존 문서의 크기는 양식을 선택하기 전까지 유지됩니다.
                </p>
                <fieldset className="booklet-settings">
                  <legend>표지와 간지</legend>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      aria-label="표지 포함"
                      checked={doc.cover || false}
                      onChange={(e) => update((d) => ({ ...d, cover: e.target.checked }))}
                    />
                    표지 포함
                  </label>
                  {doc.cover && (
                    <label>
                      표지 안내문
                      <textarea
                        aria-label="표지 안내문"
                        maxLength={2000}
                        value={doc.coverNote ?? '시험이 시작되기 전까지 문제지를 넘기지 마시오.'}
                        onChange={(e) => update((d) => ({ ...d, coverNote: e.target.value }))}
                      />
                    </label>
                  )}
                  <label>
                    공통·선택 사이 간지
                    <select
                      aria-label="간지"
                      value={doc.interleaf || 'none'}
                      onChange={(e) =>
                        update((d) => ({ ...d, interleaf: e.target.value as ExamDocument['interleaf'] }))
                      }
                    >
                      <option value="none">없음</option>
                      <option value="blank">빈 간지</option>
                      <option value="elective">선택과목 안내 간지</option>
                    </select>
                  </label>
                  <small>고3 선택 문항 앞에 삽입하며, 문항 쪽 번호에는 포함하지 않습니다.</small>
                </fieldset>
                <button className="primary wide" onClick={() => setModal(null)}>
                  설정 완료 <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="help-content">
                <p>
                  왼쪽에서 문항을 선택하고 가운데에서 작성하세요. 오른쪽에서 실제 시험지 배치를 확인할 수
                  있습니다.
                </p>
                <h3>수식 입력</h3>
                <code>$\frac&#123;1&#125;&#123;2&#125;$</code>
                <p>본문 안 수식은 달러 기호 하나로 감쌉니다.</p>
                <code>$$\lim_&#123;x\to 0&#125;\frac&#123;\sin x&#125;&#123;x&#125;$$</code>
                <p>독립 수식은 달러 기호 두 개로 감쌉니다. KaTeX에서 지원하는 LaTeX 문법을 사용하세요.</p>
                <h3>배치와 출력</h3>
                <p>
                  문항 아래에서 풀이 여백과 단·페이지 넘김을 조절하세요. 고3 선택 문항은 구역을 ‘선택과목’으로
                  지정하면 새 페이지에서 시작합니다.
                </p>
                <p>
                  인쇄창에서 배율 100%, 머리말·꼬리말 해제를 선택하세요. PDF 저장은 인쇄창의 ‘PDF로 저장’을
                  사용합니다. B4는 맞춤 용지 257 × 364mm가 필요할 수 있습니다.
                </p>
                <h3>저장</h3>
                <p>
                  ‘한글 파일’은 본문·수식·이미지를 편집할 수 있는 HWPX로 내보냅니다. 원래 서체가 설치된
                  한글에서 열고 PDF로 저장할 수 있습니다. 브라우저 인쇄는 웹 미리보기의 글꼴을 사용합니다.
                </p>
                <p>
                  브라우저에 자동 저장됩니다. 브라우저 데이터를 지우기 전에는 반드시 ‘파일 저장’으로
                  백업하세요. Ctrl+S로도 저장할 수 있습니다.
                </p>
                <p>
                  이미지는 PNG·JPG·WebP·GIF, 최대 8MB를 지원합니다. 본문에 붙여넣으면 이미지 블록으로
                  추가됩니다.
                </p>
                <button className="primary wide" onClick={() => setModal(null)}>
                  시작하기 <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

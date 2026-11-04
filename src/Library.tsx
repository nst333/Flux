import { useEffect, useState, useRef } from 'react';
import BrandMark from './BrandMark';
import {
  Search,
  Plus,
  Folder,
  Home,
  Star,
  Grid2X2,
  List,
  MoreHorizontal,
  Upload,
  Sun,
  Moon,
  FileText,
  Calendar,
  X,
} from 'lucide-react';
import { demo, id, problem } from './model';
import type { ExamDocument } from './model';
import {
  listDocuments,
  listFolders,
  save,
  removeDocument,
  saveFolder,
  removeFolder,
  exportExam,
  importExam,
} from './storage';
import type { Folder as DocumentFolder } from './storage';

export default function Library({
  onOpen,
  dark,
  onTheme,
  reducedEffects,
  onEffects,
}: {
  onOpen: (doc: ExamDocument) => Promise<void>;
  dark: boolean;
  onTheme: () => void;
  reducedEffects: boolean;
  onEffects: () => void;
}) {
  const [docs, setDocs] = useState<ExamDocument[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [grade, setGrade] = useState('all');
  const [grid, setGrid] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'new' | 'folder' | 'rename' | null>(null);
  const [target, setTarget] = useState<ExamDocument | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const [d, f] = await Promise.all([listDocuments(), listFolders()]);
    setDocs(d);
    setFolders(f);
  };
  const run = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  const change = async (doc: ExamDocument) => {
    await save(doc, false);
    await refresh();
  };
  const begin = (kind: 'new' | 'folder' | 'rename', doc?: ExamDocument) => {
    setTarget(doc ?? null);
    setName(doc?.name ?? '');
    setDescription(doc?.description ?? '');
    setDialog(kind);
    setMenu(null);
  };
  const submit = async () => {
    if (!name.trim()) return;
    await run(async () => {
      if (dialog === 'folder') await saveFolder({ id: id(), name: name.trim() });
      else if (dialog === 'rename' && target)
        await change({ ...target, name: name.trim(), description, updatedAt: new Date().toISOString() });
      else if (dialog === 'new') {
        const next: ExamDocument = {
          ...demo(),
          name: name.trim(),
          description,
          problems: [problem()],
          folderId: folders.some((f) => f.id === scope) ? scope : undefined,
          updatedAt: new Date().toISOString(),
        };
        await save(next);
        await onOpen(next);
      }
      setDialog(null);
      await refresh();
    });
  };
  const visible = docs
    .filter(
      (d) =>
        (grade === 'all' || d.grade === grade) &&
        (scope === 'all' || (scope === 'favorites' ? d.favorite : d.folderId === scope)) &&
        `${d.name} ${d.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'ko') : b.updatedAt.localeCompare(a.updatedAt),
    );
  const currentFolder = folders.find((f) => f.id === scope);
  return (
    <div className="library">
      <header className="library-top">
        <div className="brand">
          <BrandMark />
          <span>Flux</span>
        </div>
        <span className="library-top-label">내 시험지</span>
        <div className="library-top-actions">
          <button onClick={() => file.current?.click()}>
            <Upload size={16} />
            가져오기
          </button>
          <button className="primary" onClick={() => begin('new')}>
            <Plus size={17} />새 문서
          </button>
          <button aria-label="효과 줄이기" aria-pressed={reducedEffects} onClick={onEffects}>
            효과 {reducedEffects ? '끔' : '켬'}
          </button>
          <button className="icon-button" aria-label="테마 전환" onClick={onTheme}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <div className="library-body">
        <aside className="library-sidebar">
          <p className="library-sidebar-label">문서 보관함</p>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
            <Home size={17} />
            모든 문서<span>{docs.length}</span>
          </button>
          <button className={scope === 'favorites' ? 'active' : ''} onClick={() => setScope('favorites')}>
            <Star size={17} />
            즐겨찾기<span>{docs.filter((d) => d.favorite).length}</span>
          </button>
          <div className="folder-heading">
            <span>폴더</span>
            <button className="icon-button" aria-label="폴더 만들기" onClick={() => begin('folder')}>
              <Plus size={16} />
            </button>
          </div>
          {folders.map((f) => (
            <button key={f.id} className={scope === f.id ? 'active' : ''} onClick={() => setScope(f.id)}>
              <Folder size={17} />
              {f.name}
              <span>{docs.filter((d) => d.folderId === f.id).length}</span>
            </button>
          ))}
          <button className="folder-create" onClick={() => begin('folder')}>
            <Plus size={16} />새 폴더 만들기
          </button>
          <p className="library-local-note">
            이 브라우저에 자동 저장됩니다.
            <br />
            가져오기·내보내기로 백업하세요.
          </p>
        </aside>
        <main className="library-main">
          <div className="library-heading">
            <h1>{currentFolder?.name ?? (scope === 'favorites' ? '즐겨찾기' : '모든 문서')}</h1>
            {currentFolder && (
              <button
                onClick={() => {
                  if (confirm('폴더를 삭제할까요? 문서는 모든 문서에 보관됩니다.'))
                    void run(async () => {
                      await removeFolder(currentFolder.id);
                      setScope('all');
                      await refresh();
                    });
                }}
              >
                폴더 삭제
              </button>
            )}
          </div>
          <div className="library-toolbar">
            <label className="library-search">
              <Search size={18} />
              <input
                aria-label="문서 검색"
                placeholder="문서 검색…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select aria-label="문서 정렬" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">최근 수정순</option>
              <option value="name">이름순</option>
            </select>
            <select aria-label="학년 필터" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="all">모든 학년</option>
              <option value="1">고1</option>
              <option value="2">고2</option>
              <option value="3">고3</option>
            </select>
            <div className="library-view">
              <button className={grid ? 'active' : ''} aria-label="격자 보기" onClick={() => setGrid(true)}>
                <Grid2X2 size={18} />
              </button>
              <button className={!grid ? 'active' : ''} aria-label="목록 보기" onClick={() => setGrid(false)}>
                <List size={18} />
              </button>
            </div>
          </div>
          <p className="library-count">{visible.length}개의 문서</p>
          {error && (
            <p role="alert" className="library-error">
              {error}
            </p>
          )}
          <div className={`document-cards ${grid ? '' : 'list-view'}`}>
            {visible.map((d) => (
              <article className="document-card" key={d.id}>
                <button className="document-card-open" onClick={() => void run(() => onOpen(d))}>
                  <h2>{d.name || '이름 없는 문서'}</h2>
                  <p>{d.description || '설명이 없습니다'}</p>
                  <div className="document-card-info">
                    <span>
                      <FileText size={14} />
                      {d.problems.length}개 문제
                    </span>
                    <span>
                      <Calendar size={14} />
                      {new Date(d.updatedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </button>
                <footer>
                  <button
                    className={`icon-button ${d.favorite ? 'is-favorite' : ''}`}
                    aria-label={`${d.name} 즐겨찾기`}
                    aria-pressed={!!d.favorite}
                    onClick={() => void run(() => change({ ...d, favorite: !d.favorite }))}
                  >
                    <Star size={17} fill={d.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${d.name} 메뉴`}
                    aria-expanded={menu === d.id}
                    onClick={() => setMenu(menu === d.id ? null : d.id)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </footer>
                {menu === d.id && (
                  <div className="document-menu">
                    <button onClick={() => begin('rename', d)}>이름·설명 수정</button>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await change({
                            ...structuredClone(d),
                            id: id(),
                            name: `${d.name} (복사)`,
                            updatedAt: new Date().toISOString(),
                          });
                          setMenu(null);
                        })
                      }
                    >
                      복제
                    </button>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await exportExam(d);
                          setMenu(null);
                        })
                      }
                    >
                      내보내기
                    </button>
                    <label>
                      폴더 이동
                      <select
                        aria-label={`${d.name} 폴더 이동`}
                        value={d.folderId ?? ''}
                        onChange={(e) =>
                          void run(async () => {
                            await change({ ...d, folderId: e.target.value || undefined });
                            setMenu(null);
                          })
                        }
                      >
                        <option value="">폴더 없음</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm(`‘${d.name}’ 문서를 삭제할까요?`))
                          void run(async () => {
                            await removeDocument(d.id);
                            setMenu(null);
                            await refresh();
                          });
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!visible.length && (
            <div className="library-empty">
              <FileText size={32} />
              <h2>{search ? '검색 결과가 없습니다' : '아직 문서가 없습니다'}</h2>
              <p>
                {search ? '다른 이름으로 검색해 보세요.' : '새 문서를 만들거나 저장한 시험지를 가져오세요.'}
              </p>
              <button onClick={() => begin('new')}>
                <Plus size={16} />새 문서
              </button>
            </div>
          )}
        </main>
      </div>
      <input
        hidden
        ref={file}
        type="file"
        accept=".mathexam"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (selected)
            void run(async () => {
              const imported = await importExam(selected);
              imported.id = id();
              imported.folderId = currentFolder?.id;
              if (!imported.problems.length) imported.problems = [problem()];
              imported.updatedAt = new Date().toISOString();
              await save(imported, false);
              await refresh();
            });
        }}
      />
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <form
            className="modal library-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={dialog === 'folder' ? '새 폴더' : dialog === 'new' ? '새 문서' : '문서 정보 수정'}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <header>
              <h2>{dialog === 'folder' ? '새 폴더' : dialog === 'new' ? '새 문서' : '문서 정보 수정'}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="창 닫기"
                onClick={() => setDialog(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="settings-form">
              <label>
                {dialog === 'folder' ? '폴더 이름' : '문서 이름'}
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {dialog !== 'folder' && (
                <label>
                  설명
                  <textarea
                    maxLength={2000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              )}
              <p className="library-local-note">
                {dialog === 'new' &&
                  '인쇄되는 시험지 제목은 편집기의 시험지 설정에서 별도로 정할 수 있습니다.'}
              </p>
              <button type="submit" className="primary" disabled={!name.trim()}>
                {dialog === 'rename' ? '저장' : '만들기'}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

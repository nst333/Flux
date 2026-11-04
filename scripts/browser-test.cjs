const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  await fs.mkdir('test-results', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const steps = [];
  const record = (s) => {
    steps.push(s);
    console.log('PASS ' + s);
  };
  const settle = async () => {
    await page.waitForTimeout(1100);
    await page.getByText('자동 저장됨', { exact: true }).waitFor();
    if (await page.locator('.pages.screen-hidden').count())
      await page.getByRole('button', { name: '전체 시험지', exact: true }).click();
  };
  await page.goto('http://127.0.0.1:5173/#editor');
  await settle();
  assert.equal(await page.locator('.problem-card').count(), 4);
  assert.equal(await page.locator('.warnings').count(), 0);
  assert((await page.locator('.pages .katex').count()) > 10);
  assert((await page.locator('.latex-source').count()) > 0);
  record('초기 화면 · LaTeX 렌더링 · 원문 강조');
  await page.getByLabel('문서 이름', { exact: true }).fill('검증용 수학 시험지');
  await page.getByLabel('문항 제목', { exact: true }).fill('저장 복원 테스트');
  await settle();
  await page.reload();
  await settle();
  assert.equal(await page.getByLabel('문서 이름', { exact: true }).inputValue(), '검증용 수학 시험지');
  assert.equal(await page.getByLabel('문항 제목', { exact: true }).inputValue(), '저장 복원 테스트');
  record('IndexedDB 자동 저장 · 새로고침 복원');
  await page.getByTitle('문항 복제', { exact: true }).click();
  assert.equal(await page.locator('.problem-card').count(), 5);
  await page.getByRole('button', { name: '정답', exact: true }).click();
  assert.equal(await page.locator('.answer-options .active').innerText(), '⑤');
  await page.getByTitle('문서 실행 취소', { exact: true }).click();
  assert.equal(await page.locator('.problem-card').count(), 4);
  await page.locator('.problem-card').first().click();
  record('문항 복제 정답 연결 · 문서 실행 취소');
  await page.getByRole('button', { name: '문제', exact: true }).click();
  await page.getByLabel('선지 배치', { exact: true }).selectOption('vertical');
  await settle();
  const verticalColumns = await page
    .locator('.pages .choice-row')
    .first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(verticalColumns, 1);
  await page.getByLabel('선지 배치', { exact: true }).selectOption('threeTwo');
  await settle();
  assert.equal(await page.locator('.pages .choices-render').first().locator('.choice-row').count(), 2);
  record('선지 세로 · 3+2 배치');
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await page.getByRole('button', { name: /이미지 블록/ }).click();
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .locator('input[type=file][accept^="image/"]')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: image }); // Target the newly added block via its button.
  await page.getByRole('button', { name: '이미지 선택', exact: true }).click();
  await page
    .locator('input[type=file][accept^="image/"]')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: image });
  await settle();
  assert.equal(await page.locator('.pages img').count(), 2);
  record('이미지 블록 삽입 · 렌더링');
  await page.getByRole('button', { name: '새 문항 추가', exact: true }).click();
  await page.getByLabel('문항 구역', { exact: true }).selectOption('elective');
  await settle();
  const elective = page.locator('.pages .exam-page').filter({ has: page.locator('.elective-heading') });
  assert.equal(await elective.count(), 1);
  assert(
    (await elective.locator('.printed-number, .question-line strong').first().innerText()).startsWith('23'),
  );
  record('고3 선택과목 새 페이지 · 23번 시작');
  await page.getByRole('button', { name: '블록 템플릿', exact: true }).click();
  await page.getByLabel('템플릿 이름', { exact: true }).fill('검증 템플릿');
  await page.getByRole('button', { name: '현재 블록 저장', exact: true }).click();
  assert.equal(await page.locator('.template-card').count(), 1);
  record('개인 블록 템플릿 저장');
  await settle();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장', exact: true }).click();
  const download = await downloadPromise;
  const file = path.resolve('test-results/roundtrip.mathexam');
  await download.saveAs(file);
  const before = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('flux-math');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise((resolve, reject) => {
      const r = db.transaction('documents').objectStore('documents').get('active');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file][accept=".mathexam"]').setInputFiles(file);
  await settle();
  const after = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('flux-math');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const r = db.transaction('documents').objectStore('documents').get('active');
      r.onsuccess = () => resolve(r.result);
    });
  });
  const canonical = async (doc) =>
    page.evaluate((d) => {
      delete d.updatedAt;
      delete d.id;
      delete d.folderId;
      for (const b of [
        ...d.problems.flatMap((p) => [...p.blocks, ...p.explanation]),
        ...d.templates.flatMap((t) => t.blocks),
      ]) {
        const el = document.createElement('div');
        el.innerHTML = b.html;
        b.html = el.innerHTML;
        for (const x of b.items) {
          el.innerHTML = x.html;
          x.html = el.innerHTML;
        }
      }
      return d;
    }, doc);
  assert.deepEqual(await canonical(after), await canonical(before));
  record('이미지·템플릿·정답을 포함한 .mathexam 왕복 저장');
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.getByLabel('시험지 양식', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '설정 완료', exact: true }).click();
  await settle();
  assert.equal(await page.locator('.elective-heading').count(), 0);
  record('고2 양식 전환 · 선택과목 구역 통합');
  await page.getByLabel('출력 종류', { exact: true }).selectOption('answers');
  await settle();
  assert.equal(await page.locator('.pages .answer-grid>div').count(), 5);
  await page.getByLabel('출력 종류', { exact: true }).selectOption('explanations');
  await settle();
  assert((await page.locator('.pages').innerText()).includes('지수법칙'));
  await page.getByLabel('출력 종류', { exact: true }).selectOption('questions');
  await settle();
  record('정답표 · 해설지 · 문제지 전환');
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: 'test-results/sample-exam.pdf', preferCSSPageSize: true, printBackground: true });
  const positions = await page.locator('.pages .exam-page').evaluateAll((pages) =>
    pages.map((p) => {
      const r = p.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        problems: [...p.querySelectorAll('.print-problem')].map((el) => {
          const q = el.getBoundingClientRect();
          return { bottom: q.bottom - r.top, right: q.right - r.left };
        }),
      };
    }),
  );
  console.log(JSON.stringify(positions));
  for (const p of positions)
    for (const q of p.problems) {
      assert(q.bottom < p.height - 20, '문항이 페이지 하단을 넘었습니다.');
      assert(q.right < p.width, '문항이 페이지 오른쪽을 넘었습니다.');
    }
  assert.deepEqual(errors, []);
  record('인쇄 CSS · PDF 생성 · 문항 넘침 없음 · 브라우저 오류 없음');
  await fs.writeFile(
    'test-results/browser-report.json',
    JSON.stringify({ passed: steps.length, steps, errors, positions }, null, 2),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

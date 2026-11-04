const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/#editor');
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1200);
  const seed = async (kind) => {
    await page.getByText('자동 저장됨', { exact: true }).waitFor();
    await page.evaluate(async (kind) => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open('flux-math');
        r.onsuccess = () => resolve(r.result);
      });
      const original = await new Promise((resolve) => {
        const r = db.transaction('documents').objectStore('documents').get('active');
        r.onsuccess = () => resolve(r.result);
      });
      const d = structuredClone(original);
      d.grade = '1';
      d.paper = 'A4';
      d.fontSize = 8.2;
      delete d.printProfile;
      delete d.mathFontSize;
      d.margin = 22;
      d.columnGap = 4;
      const p = d.problems[0];
      p.type = 'short';
      p.answer = '3';
      p.space = 20;
      p.section = 'common';
      p.blocks = [p.blocks[0]];
      if (kind === 'many') {
        d.problems = Array.from({ length: 30 }, (_, i) => {
          const copy = structuredClone(p);
          copy.id = crypto.randomUUID();
          copy.title = `경계 검증 ${i + 1}`;
          copy.breakBefore = 'auto';
          copy.blocks = copy.blocks.map((b) => ({
            ...b,
            id: crypto.randomUUID(),
            html: `<p>${i + 1}번 문제 $x^2+1$의 값은?</p>`,
          }));
          return copy;
        });
      } else if (kind === 'split') {
        p.blocks = Array.from({ length: 10 }, (_, i) => ({
          ...structuredClone(p.blocks[0]),
          id: crypto.randomUUID(),
          html: Array.from({ length: 12 }, (_, j) => `<p>블록 ${i + 1}, 문단 ${j + 1}: $x^2+1$</p>`).join(''),
        }));
        p.allowSplit = false;
        d.problems = [p];
      } else if (kind === 'invalid') {
        p.blocks[0].html = '<p>잘못된 수식 $\\unknowncommand{x}$</p>';
        d.problems = [p];
      }
      await new Promise((resolve, reject) => {
        const r = db.transaction('documents', 'readwrite').objectStore('documents').put(d, 'active');
        r.onsuccess = resolve;
        r.onerror = () => reject(r.error);
      });
      db.close();
    }, kind);
    await page.reload();
    await page.waitForTimeout(1200);
  };
  await seed('many');
  assert.equal(await page.locator('.pages .print-problem').count(), 30);
  assert((await page.locator('.pages .exam-page').count()) >= 2);
  assert.equal(await page.locator('.warnings').count(), 0);
  const pageCountBefore = await page.locator('.pages .exam-page').count();
  await page.getByLabel('확대 비율', { exact: true }).selectOption('0.5');
  await page.getByLabel('문서 이름', { exact: true }).fill('축소 배치 검증');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.pages .exam-page').count(), pageCountBefore);
  await page.getByLabel('확대 비율', { exact: true }).selectOption('1');
  await page.getByLabel('문서 이름', { exact: true }).fill('원본 배치 검증');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.pages .exam-page').count(), pageCountBefore);
  await page.getByLabel('확대 비율', { exact: true }).selectOption('fit');
  await page.locator('.problem-card').nth(1).click();
  await page.locator('.layout-details summary').click();
  await page.getByLabel('문항 시작', { exact: true }).selectOption('page');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.pages .print-problem').count(), 30);
  assert((await page.locator('.pages .exam-page').count()) > pageCountBefore);
  console.log('PASS 30문항 자동 페이지 배치 · 문항 누락 없음');
  await seed('split');
  assert((await page.locator('.warnings').textContent()).includes('한 단 높이'));
  await page.locator('.layout-details summary').click();
  await page.getByText('긴 문항의 블록 사이 분할 허용', { exact: true }).click();
  await page.waitForTimeout(900);
  assert((await page.locator('.pages .print-problem').count()) > 1);
  assert.equal(await page.locator('.warnings').count(), 0);
  assert.equal(await page.locator('.pages [data-block-measure]').count(), 0);
  assert.equal(await page.locator('.pages .problem-blocks>div').count(), 10);
  console.log('PASS 긴 문항 경고 · 블록 경계 분할 · 10개 블록 유지');
  await seed('invalid');
  assert((await page.locator('.warnings').textContent()).includes('수식'));
  await page.evaluate(() => {
    window.__didPrint = false;
    window.print = () => {
      window.__didPrint = true;
    };
  });
  await page.getByRole('button', { name: '인쇄 / PDF', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__didPrint), false);
  assert((await page.locator('.toast').innerText()).includes('경고'));
  console.log('PASS 잘못된 LaTeX 경고 · 오류가 있는 출력 방지');
  const sanitized = await page.evaluate(async () => {
    const { validateDocument } = await import('/src/storage.ts');
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('flux-math');
      r.onsuccess = () => resolve(r.result);
    });
    const doc = await new Promise((resolve) => {
      const r = db.transaction('documents').objectStore('documents').get('active');
      r.onsuccess = () => resolve(r.result);
    });
    doc.problems[0].blocks[0].html =
      '<p onclick="alert(1)"><strong>본문</strong><script>alert(1)</script><img src="x" onerror="alert(1)"></p>';
    validateDocument(doc);
    const html = doc.problems[0].blocks[0].html;
    doc.version = 2;
    let rejected = false;
    try {
      validateDocument(doc);
    } catch {
      rejected = true;
    }
    return { html, rejected };
  });
  assert.equal(sanitized.html, '<p><strong>본문</strong></p>');
  assert.equal(sanitized.rejected, true);
  console.log('PASS 불러온 HTML 정제 · 지원하지 않는 저장 버전 거부');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

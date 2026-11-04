const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('.document-card').waitFor();
  assert.equal(await page.locator('.document-card').count(), 1);
  await page.getByRole('button', { name: '새 폴더 만들기', exact: true }).click();
  await page.getByLabel('폴더 이름', { exact: true }).fill('내신');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.locator('.library-sidebar button').filter({ hasText: '내신' }).click();
  await page.getByRole('button', { name: '새 문서', exact: true }).first().click();
  await page.getByLabel('문서 이름', { exact: true }).fill('함수 연습');
  await page.getByLabel('설명', { exact: true }).fill('연속과 극한');
  await page.getByLabel('새 문서 템플릿', { exact: true }).selectOption('exam');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.getByLabel('시험지 제목 방식').selectOption('custom');
  await page.getByLabel('인쇄할 시험지 제목').fill('함수의 연속 · 개념 확인');
  await page.getByLabel('표지 포함', { exact: true }).check();
  await page.getByRole('button', { name: '설정 완료', exact: false }).click();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('.exam-title').first().innerText(), '함수의 연속 · 개념 확인');
  assert.equal(await page.locator('.cover-year').innerText(), '함수의 연속 · 개념 확인');
  await page.getByRole('button', { name: '문서 홈', exact: true }).click();
  await page.locator('.document-card').first().waitFor();
  assert.equal(await page.locator('.document-card').count(), 2);
  await page.getByLabel('함수 연습 즐겨찾기').click();
  await page.locator('.library-sidebar button').filter({ hasText: '즐겨찾기' }).click();
  assert.equal(await page.locator('.document-card').count(), 1);
  await page.getByLabel('문서 검색').fill('없는 이름');
  assert.equal(await page.locator('.document-card').count(), 0);
  await page.getByLabel('문서 검색').fill('');
  await page.getByLabel('함수 연습 메뉴').click();
  await page.getByRole('button', { name: '복제', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.document-card').count(), 2);
  await page.getByLabel('함수 연습 (복사) 메뉴', { exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('.document-card').first().waitFor();
  assert.equal(await page.locator('.document-card').count(), 2);
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  assert.equal(await page.locator('.list-view').count(), 1);
  await page.locator('.document-card-open').filter({ hasText: '함수 연습' }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.getByLabel('문서 이름', { exact: true }).inputValue(), '함수 연습');
  assert.equal(await page.locator('.exam-title').first().innerText(), '함수의 연속 · 개념 확인');
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.getByLabel('시험지 제목 방식').selectOption('auto');
  await page.getByRole('button', { name: '설정 완료', exact: false }).click();
  await page.locator('.exam-title').filter({ hasText: /대학수학능력시험 6월 모의평가 문제지/ }).first().waitFor({ state: 'attached' });
  assert.match(await page.locator('.exam-title').first().innerText(), /대학수학능력시험 6월 모의평가 문제지/);
  await page.getByRole('button', { name: '문서 홈', exact: true }).click();
  await page.locator('.document-card').first().waitFor();
  await page.getByLabel('학년 필터').selectOption('1');
  assert.equal(await page.locator('.document-card').count(), 0);
  await page.getByLabel('학년 필터').selectOption('all');
  await page.screenshot({ path: 'analysis/document-library.png', fullPage: true });
  await page.getByLabel('테마 전환').click();
  await page.screenshot({ path: 'analysis/document-library-dark.png', fullPage: true });
  await page.getByLabel('함수 연습 메뉴', { exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.waitForTimeout(200);
  await page.reload();
  await page.locator('.document-card').waitFor();
  assert.equal(await page.locator('.document-card').count(), 1);
  const legacy = await browser.newContext();
  const migration = await legacy.newPage();
  await migration.route(
    'http://127.0.0.1:5173/',
    (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
    { times: 1 },
  );
  await migration.goto('http://127.0.0.1:5173/');
  await migration.evaluate(async () => {
    const { demo } = await import('/src/model.ts');
    const doc = demo();
    doc.name = '이전 버전 문서';
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('flux-math', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('documents');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(doc, 'active');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await migration.reload();
  await migration.locator('.document-card').waitFor();
  assert.equal(await migration.locator('.document-card').count(), 1);
  assert.match(await migration.locator('.document-card h2').innerText(), /이전 버전 문서/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS 문서·폴더 생성, 이전 문서 유지, 제목 모드·표지, 즐겨찾기·검색, 복제·삭제·재시작, 목록 보기, 테마',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

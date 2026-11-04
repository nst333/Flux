const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:4173/';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [],
    failed = [],
    localFonts = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
  });
  page.on('request', (r) => {
    if (r.url().includes('/__exam_fonts/')) localFonts.push(r.url());
  });
  await page.goto(url);
  await page.locator('.document-card').waitFor();
  await page.locator('.document-card-open').first().click();
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1000);
  assert((await page.locator('.pages .katex').count()) > 10);
  assert.equal(await page.locator('.warnings').count(), 0);
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.getByLabel('시험지 제목 방식').selectOption('custom');
  await page.getByLabel('인쇄할 시험지 제목').fill('배포 검증 · 함수 연습');
  await page.getByRole('button', { name: '설정 완료', exact: false }).click();
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  assert.equal(await page.locator('.exam-title').first().innerText(), '배포 검증 · 함수 연습');
  await page.emulateMedia({ media: 'print' });
  const bounds = await page
    .locator('.exam-page')
    .evaluateAll((pages) => pages.map((p) => ({ overflow: p.scrollHeight > p.clientHeight + 2 })));
  assert(bounds.every((p) => !p.overflow));
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: '문서 홈', exact: true }).click();
  await page.locator('.document-card').waitFor();
  if (url.startsWith('https:')) await page.screenshot({ path: 'analysis/netlify-live.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(localFonts, []);
  console.log(
    JSON.stringify({
      url,
      errors,
      failed,
      localFonts,
      checks: '문서 홈, 수식 렌더링, 제목 저장·복원, 인쇄 배치',
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

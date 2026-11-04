const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  await fs.mkdir('analysis', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') console.log(m.text());
  });
  await page.goto('http://127.0.0.1:5173/#editor');
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1200);
  const fonts = await page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.family.includes('Exam'))
      .map((f) => ({ family: f.family, status: f.status })),
  );
  console.log(fonts);
  assert.equal(fonts.length, 5);
  assert(fonts.every((f) => f.status === 'loaded'));
  await page.screenshot({ path: 'analysis/revised-editor.png' });
  await page.evaluate(() => {
    const div = document.createElement('div');
    div.id = 'font-probe';
    div.style =
      'position:fixed;inset:0;background:white;z-index:99999;color:black;padding:30px;font:24px serif';
    div.innerHTML =
      '<p style="font-family:Exam Equation">0123456789 abcdefghijklmnopqrstuvwxyz ABCDEF + − ∞ =</p>' +
      Array.from(
        { length: 256 },
        (_, i) =>
          '<span style="display:inline-block;width:90px;height:45px;font:10px sans-serif">' +
          (0xe000 + i).toString(16) +
          ' <b style="font:24px Exam Equation">' +
          String.fromCharCode(0xe000 + i) +
          '</b></span>',
      ).join('');
    document.body.append(div);
  });
  await page.screenshot({ path: 'analysis/equation-glyphs.png' });
  await page.locator('#font-probe').evaluate((e) => e.remove());
  await page.getByRole('button', { name: '빈칸 추론 예제 추가' }).click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.pages .exam-blank').count(), 5);
  assert.equal(await page.locator('.pages .box-render li').count(), 3);
  assert.equal(await page.locator('.pages .two-columns .condition-row').count(), 4);
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.getByLabel('표지 포함', { exact: true }).check();
  await page.getByLabel('간지', { exact: true }).selectOption('elective');
  await page.getByRole('button', { name: '설정 완료', exact: false }).click();
  await page.getByLabel('문항 구역', { exact: true }).selectOption('elective');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.cover-page').count(), 1);
  assert.equal(await page.locator('.interleaf-page').count(), 1);
  assert.equal(await page.locator('.warnings').count(), 0);
  await page.screenshot({ path: 'analysis/revised-booklet.png' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: 'output/pdf/flux-revised.pdf', preferCSSPageSize: true, printBackground: true });
  const bounds = await page.locator('.exam-page').evaluateAll((pages) =>
    pages.map((p) => {
      const r = p.getBoundingClientRect();
      return { kind: p.className, height: r.height, overflow: p.scrollHeight > p.clientHeight + 2 };
    }),
  );
  assert(bounds.every((p) => !p.overflow));
  assert.deepEqual(errors, []);
  console.log('PASS local fonts, blank reasoning, cover, interleaf, print', bounds);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const { chromium } = require('playwright');
const fs = require('node:fs/promises');
(async () => {
  await fs.mkdir('output/pdf', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'analysis/editor-preview.png' });
  const line = await page.locator('.exam-heading').evaluate((el) => {
    const p = el.closest('.exam-page').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return (
      (((r.bottom - p.top) /
        parseFloat(
          getComputedStyle(el.closest('.preview-stage')).transform.match(/matrix\(([^,]+)/)?.[1] || '1',
        )) *
        25.4) /
      96
    );
  });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: 'output/pdf/flux-demo.pdf', preferCSSPageSize: true, printBackground: true });
  console.log(
    JSON.stringify({
      headerLineMm: line,
      pages: await page.locator('.exam-page').count(),
      warnings: await page.locator('.warnings').count(),
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

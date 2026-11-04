const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/#editor');
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'analysis/editor-preview.png', fullPage: true });
  console.log(
    JSON.stringify({
      errors,
      title: await page.title(),
      pages: await page.locator('.exam-page').count(),
      warnings: await page.locator('.warnings').allTextContents(),
      math: await page.locator('.pages .katex').count(),
      ui: await page.locator('.topbar').evaluate((el) => ({
        font: getComputedStyle(el).fontFamily,
        buttonRadius: getComputedStyle(el.querySelector('button')).borderRadius,
      })),
      fonts: await page.evaluate(() =>
        [...new Set([...document.fonts]
          .filter((f) => f.status === 'loaded' && /Noto Sans KR/.test(f.family))
          .map((f) => f.family))],
      ),
      paper: await page
        .locator('.exam-page')
        .first()
        .evaluate((el) => ({
          font: getComputedStyle(el).fontFamily,
          size: getComputedStyle(el).fontSize,
          radius: getComputedStyle(el).borderRadius,
        })),
    }),
  );
  await page.getByRole('button', { name: '시험지 설정', exact: true }).click();
  await page.screenshot({ path: 'analysis/rounded-settings.png' });
  await page.getByRole('button', { name: '설정 완료', exact: false }).click();
  await page.getByTitle('테마 전환', { exact: true }).click();
  await page.waitForTimeout(600);
  console.log(
    'dark',
    await page
      .locator('.exam-page')
      .first()
      .evaluate((el) => ({
        html: el.innerHTML.slice(0, 200),
        opacity: getComputedStyle(el).opacity,
        head: el.querySelector('h1') && {
          color: getComputedStyle(el.querySelector('h1')).color,
          rect: el.querySelector('h1').getBoundingClientRect().toJSON(),
        },
        problems: el.querySelectorAll('.print-problem').length,
        stage: el.closest('.preview-stage').style.cssText,
      })),
  );
  await page.screenshot({ path: 'analysis/rounded-dark.png' });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

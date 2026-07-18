// scripts/screenshot.mjs — 真瀏覽器全站截圖健檢
// 用 Playwright + Chromium 以手機/桌機視窗跑完整流程,輸出各分頁全頁截圖。
// 用法:先 `npx vite preview --outDir dist --port 4173`,再 `node scripts/screenshot.mjs [outDir]`
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp/shots';
const BASE = process.env.SHOT_URL ?? 'http://localhost:4173/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function runViewport(label, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log(`[${label}] pageerror:`, e.message.slice(0, 120)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${label}-0-welcome.png`, fullPage: true });

  // 排盤
  await page.fill('#name-input', 'Shelly');
  await page.fill('#birth-date', '2002-09-04');
  await page.selectOption('#birth-hour', '13');
  await page.click('#birth-form button[type=submit]');
  await page.waitForSelector('.palace-cell', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${label}-1-dashboard.png`, fullPage: true });

  // 手機版切到八字卡
  if (viewport.width < 700) {
    await page.click('.chart-tab[data-chart="bazi"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${label}-1b-bazi-card.png`, fullPage: true });
    await page.click('.chart-tab[data-chart="ziwei"]');
  }

  const views = [['report', '2-report'], ['comprehensive', '3-comprehensive'], ['synastry', '4-synastry'], ['share', '5-share']];
  for (const [view, name] of views) {
    await page.click(`.nav-item[data-view="${view}"]`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: true });
  }

  // 合盤結果
  await page.click('.nav-item[data-view="synastry"]');
  await page.fill('#syn-name', '弟弟');
  await page.fill('#syn-date', '2006-07-12');
  await page.selectOption('#syn-hour', '19');
  await page.selectOption('#syn-gender', 'male');
  await page.click('#syn-run');
  await page.waitForSelector('.syn-score', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${label}-4b-synastry-result.png`, fullPage: true });

  // 學習版切換後的命盤解析
  await page.click('.mode-pill[data-mode="study"]');
  await page.click('.nav-item[data-view="comprehensive"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${label}-3b-comprehensive-study.png`, fullPage: true });

  await page.close();
  console.log(`✓ ${label} 截圖完成`);
}

await runViewport('mobile', { width: 390, height: 844 });
await runViewport('desktop', { width: 1280, height: 800 });
await browser.close();
console.log(`全部輸出於 ${OUT}`);

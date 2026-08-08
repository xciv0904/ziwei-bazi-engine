// cross-test-report.mjs — 交叉驗證結果的共用收集器
//
// 為什麼要這一層：站上宣稱「不同流派可能造成差異」，但使用者看不到我們到底驗過什麼。
// 三支 cross-test 原本只把結果印在 CI log 裡，對使用者毫無意義。
// 這個收集器讓它們照常印出 console 輸出的同時，把每一條比對寫成 JSON，
// 再由 scripts/build-verification.mjs 產出公開頁面。
//
// 關鍵設計：頁面上的數字一律來自這份 JSON，不手寫。
// 手寫的數字會過期，而「宣稱驗過但其實沒驗」的準確度頁面比沒有頁面更糟。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(root, 'tests', 'reports', 'cross-validation.json');

function readReport() {
  try {
    const parsed = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {object} meta
 * @param {string}   meta.suite     套件識別碼（同名覆蓋，重跑不會累積舊結果）
 * @param {string}   meta.title     公開頁面上的標題
 * @param {string}   meta.reference 對照來源（例如「文墨天機」）
 * @param {string}   meta.subject   受測命盤的描述
 * @param {string[]} meta.scope     驗證範圍，逐項列出
 */
export function makeReporter(meta) {
  const rows = [];
  let pass = 0;
  let fail = 0;

  /** 與各 cross-test 原本的 cmp 行為一致：印一行、計數、記錄 */
  const cmp = (label, expected, actual) => {
    const ok = JSON.stringify(expected) === JSON.stringify(actual);
    if (ok) pass += 1; else fail += 1;
    rows.push({ label, expected, actual, ok });
    console.log(`${ok ? '✅' : '❌'} ${label}: 預期=${JSON.stringify(expected)} 實際=${JSON.stringify(actual)}`);
    return ok;
  };

  /** 印出合計、寫入 JSON、回傳 exit code（0 = 全部一致） */
  const finish = () => {
    console.log(`\n合計:${pass} 通過 / ${fail} 不一致`);
    const all = readReport();
    all[meta.suite] = {
      ...meta,
      pass,
      fail,
      total: pass + fail,
      // 只保留不一致的細節。全部一致時列出兩百條「一致」對讀者沒有資訊量；
      // 不一致的每一條都要攤開，那才是使用者需要自己判斷的地方。
      mismatches: rows.filter((r) => !r.ok),
      ranAt: new Date().toISOString().slice(0, 10),
    };
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(all, null, 2)}\n`);
    return fail === 0 ? 0 : 1;
  };

  return { cmp, finish };
}

export { REPORT_PATH };

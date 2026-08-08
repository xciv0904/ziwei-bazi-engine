// tests/verification-page.mjs — 排盤驗證頁與流派設定（npm run verify-test）
//
// 守兩件事：
//   1. 公開驗證頁的數字必須來自 cross-test 的實際結果，不能手寫、不能過期。
//      「宣稱驗過但其實沒驗」的準確度頁面比沒有頁面更糟。
//   2. 流派設定必須真的改變排盤結果，而且非法值一律夾回預設。
//      提供一個按了沒反應的設定，比不提供更傷信任。

import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import {
  ZIWEI_SCHOOL_OPTIONS, normalizeZiWeiSchool, isDefaultZiWeiSchool, describeZiWeiSchool,
} from '../src/engines/ziwei-school.js';

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : `：${detail}`}`);
  if (!ok) failed += 1;
};

// ---------- 驗證頁 ----------
const report = JSON.parse(readFileSync(new URL('./reports/cross-validation.json', import.meta.url), 'utf8'));
const suites = Object.values(report);
check('三支 cross-test 都寫入了結果', suites.length === 3, `實際 ${suites.length} 組`);
check('每組都有對照來源、受測命盤與驗證範圍', suites.every((s) => s.reference && s.subject && s.scope?.length));
check('每組都記錄了執行日期', suites.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.ranAt)));
check('不一致的項目一定附上預期與實際值', suites.every((s) => s.mismatches.every((m) => 'expected' in m && 'actual' in m)));
check('pass + fail 等於 total（計數沒漏）', suites.every((s) => s.pass + s.fail === s.total));

const page = readFileSync(new URL('../public/verify/index.html', import.meta.url), 'utf8');
const totalPass = suites.reduce((n, s) => n + s.pass, 0);
const totalAll = suites.reduce((n, s) => n + s.total, 0);
check('頁面上的總數與 JSON 一致（沒有手寫數字）', page.includes(`${totalPass} / ${totalAll} 項一致`));
check('頁面明確區分「排盤準確」與「解讀準確」',
  page.includes('排盤準確') && page.includes('解讀準確') && page.includes('沒有經過實證檢驗'));
// 頁面裡確實出現「命中率」「準確率」，但是在否認句裡（「我們不會給你命中率…」）。
// 所以不能只查關鍵字，要查的是「有沒有把數字掛在這些詞旁邊」——那才是宣稱。
check('頁面沒有把數字掛在命中率／準確率旁邊（沒有宣稱解讀準確度）',
  !/(命中率|準確率)[^。]{0,12}\d/.test(page) && !/\d[^。]{0,12}(命中率|準確率)/.test(page));
check('頁面明確拒絕提供命中率與好評數', page.includes('不會給你命中率'));
check('頁面沒有誇稱用語', !/神準|最準|保證準確|百分之百/.test(page));
check('頁面誠實列出驗證的限制', page.includes('受測命盤數量少') && page.includes('流派差異不算錯'));
check('頁面邀請使用者自行對照驗證', page.includes('抄去任何一個你信任的排盤工具'));

// ---------- 流派設定 ----------
const base = { year: 1990, month: 5, day: 12, hour: 23, gender: 'female' };
const pos = (z, name) => z.palaces.find((p) => p.majorStars.some((s) => s.name === name))?.position;
const minor = (z) => z.palaces.map((p) => p.minorStars.join(',')).join('|');

const fwd = convertToZiWei({ ...base, school: { dayDivide: 'forward' } });
const cur = convertToZiWei({ ...base, school: { dayDivide: 'current' } });
check('晚子時換日會改變星曜落宮（不是按了沒反應的設定）',
  pos(fwd, '紫微') !== pos(cur, '紫微'), `${pos(fwd, '紫微')} vs ${pos(cur, '紫微')}`);
check('非晚子時不受換日設定影響', (() => {
  const a = convertToZiWei({ ...base, hour: 10, school: { dayDivide: 'forward' } });
  const b = convertToZiWei({ ...base, hour: 10, school: { dayDivide: 'current' } });
  return pos(a, '紫微') === pos(b, '紫微');
})());
check('中州派安星會改變雜曜落宮',
  minor(convertToZiWei({ ...base, school: { algorithm: 'zhongzhou' } })) !== minor(fwd));

check('非法值一律夾回預設', (() => {
  const n = normalizeZiWeiSchool({ dayDivide: 'evil', algorithm: '<script>' });
  return n.dayDivide === ZIWEI_SCHOOL_OPTIONS.dayDivide.default
    && n.algorithm === ZIWEI_SCHOOL_OPTIONS.algorithm.default;
})());
check('缺欄位也能正常夾回預設', (() => {
  const n = normalizeZiWeiSchool();
  return Object.keys(ZIWEI_SCHOOL_OPTIONS).every((k) => n[k] === ZIWEI_SCHOOL_OPTIONS[k].default);
})());
check('預設判定正確', isDefaultZiWeiSchool({}) && !isDefaultZiWeiSchool({ algorithm: 'zhongzhou' }));

// 全域 config 殘留是這類設計最容易出的錯：iztro 的 astro.config() 是全域狀態，
// 排完非預設的盤之後若沒重設，下一張盤會悄悄沿用上一張的流派。
check('排完非預設流派後，下一張預設盤不受污染', (() => {
  const first = pos(convertToZiWei({ ...base }), '紫微');
  convertToZiWei({ ...base, school: { dayDivide: 'current', algorithm: 'zhongzhou' } });
  return pos(convertToZiWei({ ...base }), '紫微') === first;
})());
check('排盤結果會帶回實際採用的流派', (() => {
  const z = convertToZiWei({ ...base, school: { algorithm: 'zhongzhou' } });
  return z.school.algorithm === 'zhongzhou' && z.school.dayDivide === 'forward';
})());
check('流派摘要可讀且含兩個項目', (() => {
  const t = describeZiWeiSchool({ dayDivide: 'current' });
  return t.includes('晚子時換日') && t.includes('安星方法');
})());

// 預設值就是交叉驗證的基準，改了會讓 cross-test 失敗——這裡明確守住
check('預設流派仍是通行版 + 晚子時算隔日（交叉驗證的基準）',
  ZIWEI_SCHOOL_OPTIONS.dayDivide.default === 'forward' && ZIWEI_SCHOOL_OPTIONS.algorithm.default === 'default');

console.log(`\n驗證頁與流派設定測試：${failed ? `${failed} 項失敗` : '全部通過'}`);
process.exit(failed ? 1 : 0);

// smoke.mjs — headless DOM 冒煙測試(npm run smoke)
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const w = new Window({ url: 'http://localhost/' });
for (const k of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'navigator']) {
  try { globalThis[k] = w[k]; } catch { /* 某些屬性唯讀 */ }
}
globalThis.window = w;

const html = readFileSync('./index.html', 'utf-8');
w.document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/, '');

await import('./src/main.js');
const doc = w.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];

let failed = 0;
const check = (label, ok) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failed++; };

// --- 命盤總覽 ---
check('12 宮位格', $$('.palace-cell').length === 12);
check('中央摘要格', $$('.chart-center').length === 1);
check('頁首標題含姓名', $('#page-title').textContent.includes('Shelly'));
check('生辰摘要含五行局', $('#birth-summary').textContent.includes('木三局'));
check('八字四柱含日主反白', $$('.bz-char.day-master').length === 1);
check('五行分布 5 條色條', $$('.bar-col').length === 5);
check('命盤小教室預設命宮', $('.classroom-title').textContent.includes('命宮'));
check('大限 chips = 10', $$('[data-limit]').length === 10);
check('流年 chips = 10', $$('[data-year]').length === 10);

// 點財帛宮 → 小教室更新
$$('.palace-cell').find((c) => c.dataset.palace === '財帛宮').click();
check('點財帛宮 → 小教室切換', $('.classroom-title').textContent.includes('財帛宮'));
check('小教室含機巨雙星補充', $('.classroom-body').textContent.includes('雙星組合'));

// 大限流年互動
$$('[data-limit]')[0].click();
check('切大限 → 流年重算', $$('[data-year]')[0].classList.contains('active'));

// --- 解讀報告 ---
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
check('報告視圖顯示', !$('#view-report').hidden);
check('紫微手風琴 6 項', $$('#view-report .acc-item').length === 6);
check('預設展開命宮總論', $('#view-report .acc-item.open .acc-title').textContent.includes('命宮總論'));
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi').click();
check('八字手風琴 4 項', $$('#view-report .acc-item').length === 4);
check('預設展開日主分析', $('#view-report .acc-item.open .acc-title').textContent.includes('日主分析'));

// --- 分享命卡 ---
$$('.nav-item').find((n) => n.dataset.view === 'share').click();
check('命卡姓名', $('.fate-name').textContent === 'Shelly');
check('命宮主星標籤(空宮借星)', $('.fate-tags').textContent.includes('借'));
check('日主標籤 乙木', $('.fate-tags').textContent.includes('乙木'));

// --- 重新排盤(換男生日期) ---
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
$('#birth-date').value = '1998-03-15';
$('#birth-hour').value = '11';
$$('#gender-toggle .pill').find((p) => p.dataset.value === 'male').click();
$('#birth-form').dispatchEvent(new w.Event('submit'));
check('重排後摘要更新(戊寅年)', $('#birth-summary').textContent.includes('戊寅年'));
check('重排後仍 12 宮', $$('.palace-cell').length === 12);

console.log(failed === 0 ? '\n全部通過 ✅' : `\n${failed} 項失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);

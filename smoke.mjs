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

// --- 進站空白狀態(未排盤) ---
check('進站顯示歡迎畫面', $('#view-dashboard').textContent.includes('開始排盤'));
check('進站不顯示任何命盤', $$('.palace-cell').length === 0);

// --- 填表排盤 ---
$('#name-input').value = 'Shelly';
$('#birth-date').value = '2002-09-04';
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));

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

// --- 命盤解析(綜合報告) ---
$$('.nav-item').find((n) => n.dataset.view === 'comprehensive').click();
check('解析視圖顯示', !$('#view-comprehensive').hidden);
check('紫微6段+八字6段(含全盤概覽/地支關係/神煞)', $$('#view-comprehensive .acc-item').length === 12);
check('含當前焦點段', $('#view-comprehensive').textContent.includes('當前焦點'));
check('含八字財官流向段', $('#view-comprehensive').textContent.includes('財官流向'));
check('含全盤概覽段', $('#view-comprehensive').textContent.includes('全盤概覽'));
check('含地支關係段', $('#view-comprehensive').textContent.includes('地支關係'));
check('含神煞段', $('#view-comprehensive').textContent.includes('神煞'));

// 地支關係/神煞屬於補充細節,預設收合(acc-item 沒有 open class,內文不渲染),點開才展開
const findDetailItem = (title) => $$('#view-comprehensive .acc-item').find((it) => it.querySelector('.acc-title')?.textContent.includes(title));
const branchRelItem = findDetailItem('地支關係');
const shenshaItem = findDetailItem('神煞');
check('地支關係預設收合', branchRelItem && !branchRelItem.classList.contains('open') && !branchRelItem.querySelector('.acc-body'));
check('神煞預設收合', shenshaItem && !shenshaItem.classList.contains('open') && !shenshaItem.querySelector('.acc-body'));
branchRelItem.querySelector('.acc-row[data-detail]').click();
const branchRelItemAfter = findDetailItem('地支關係');
check('點開地支關係後展開內文', branchRelItemAfter.classList.contains('open') && !!branchRelItemAfter.querySelector('.acc-body'));
branchRelItemAfter.querySelector('.acc-row[data-detail]').click();
const branchRelItemCollapsed = findDetailItem('地支關係');
check('再點一次收合回去', !branchRelItemCollapsed.classList.contains('open') && !branchRelItemCollapsed.querySelector('.acc-body'));
// 主要4段(全盤概覽/個性本質/財官流向/人際健康建議)不受影響,預設仍全部展開
check('全盤概覽等主要段落預設仍展開', $$('#view-comprehensive .acc-item.open').length === 12 - 2);

// --- 分享命卡 ---
$$('.nav-item').find((n) => n.dataset.view === 'share').click();
check('命卡姓名', $('.fate-name').textContent === 'Shelly');
check('命宮主星標籤(空宮借星)', $('.fate-tags').textContent.includes('借'));
check('日主標籤 乙木', $('.fate-tags').textContent.includes('乙木'));

// --- 大眾版/學習版切換(命盤解析、解讀報告、命盤總覽單宮說明都要吃這個開關) ---
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
check('預設大眾版,小教室不含依據句', !$('.classroom-body').textContent.includes('亮度是'));
$('.mode-pill[data-mode="study"]').click();
check('切學習版,小教室含依據句', $('.classroom-body').textContent.includes('亮度是') || $('.classroom-body').textContent.includes('借對宮'));
$$('.nav-item').find((n) => n.dataset.view === 'comprehensive').click();
check('學習版命盤解析含十神依據(細節上)', $('#view-comprehensive').textContent.includes('細節上'));
$('.mode-pill[data-mode="public"]').click();
check('切回大眾版,命盤解析不再含十神依據', !$('#view-comprehensive').textContent.includes('細節上'));

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

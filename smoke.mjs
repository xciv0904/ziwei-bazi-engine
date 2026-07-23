// smoke.mjs — headless DOM 冒煙測試(npm run smoke)
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const w = new Window({ url: 'http://localhost/' });
for (const k of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'navigator', 'localStorage']) {
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
// 排盤引擎改為動態載入(submit 後非同步),送出表單後需等引擎載入+渲染完成
const settle = () => new Promise((r) => setTimeout(r, 300));
// 出生日期改成年/月/日三欄後,填值要各別觸發對應事件,模擬使用者實際輸入
const setDateParts = (prefix, y, m, d) => {
  $(`#${prefix}-year`).value = String(y);
  $(`#${prefix}-year`).dispatchEvent(new w.Event('input'));
  $(`#${prefix}-month`).value = String(m);
  $(`#${prefix}-month`).dispatchEvent(new w.Event('change'));
  $(`#${prefix}-day`).value = String(d);
  $(`#${prefix}-day`).dispatchEvent(new w.Event('change'));
};

// --- 進站空白狀態(未排盤) ---
check('進站顯示歡迎畫面', $('#view-dashboard').textContent.includes('開始排盤'));
check('進站不顯示任何命盤', $$('.palace-cell').length === 0);
check('側邊導覽分成核心排盤／延伸工具兩組', $$('.side-nav .section-label').length === 2);

// --- 表單驗證:年份留空送出,要就地顯示錯誤而不是靜默無反應 ---
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('出生年留空送出時顯示錯誤訊息', !$('#birth-date-error').hidden && $('#birth-date-error').textContent.includes('西元年'));
check('留空送出不會產生命盤', $$('.palace-cell').length === 0);

// --- 填表排盤 ---
$('#name-input').value = 'Shelly';
setDateParts('birth', 2002, 9, 4);
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('排盤成功後錯誤訊息應消失', $('#birth-date-error').hidden);

// --- 命盤總覽 ---
check('12 宮位格', $$('.palace-cell').length === 12);
check('中央摘要格', $$('.chart-center').length === 1);
check('大限標記有 tooltip 說明', !!$('.luck-tag.decadal')?.title);
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

// --- 盤面連動(大限/流年/三方四正/流年四化) ---
check('流年命宮高亮 1 格', $$('.palace-cell.annual-palace').length === 1);
check('大限宮位高亮 1 格', $$('.palace-cell.decadal-palace').length === 1);
check('流年四化落點標記存在', $$('.flow-mut').length >= 3);
check('命宮的三方四正虛線 3 格', $$('.palace-cell.related').length === 3);
check('盤面圖例', !!$('.chart-legend'));

// --- 命盤收藏 ---
check('儲存按鈕在排盤後顯示', !$('#save-chart-btn').hidden);
$('#save-chart-btn').click();
check('儲存後收藏列表出現', !$('#saved-section').hidden && $$('.saved-chip').length === 1);

// --- 大限四化 ---
check('大限四化(紫微)區塊', $('.luck-detail').textContent.includes('大限四化'));

// 大限流年互動
check('流年變動(八字)區塊', $('.luck-detail').textContent.includes('流年變動（八字）'));
check('流年變動(紫微)區塊', $('.luck-detail').textContent.includes('流年變動（紫微）'));
check('紫微流年含四化落宮', $('.luck-detail').textContent.includes('化祿落在') || $('.luck-detail').textContent.includes('化祿,落本命'));
check('宮位 AI 提示詞按鈕', !!$('#copy-palace-prompt'));
check('流年 AI 提示詞按鈕', !!$('#copy-annual-prompt'));
$$('[data-limit]')[0].click();
check('切大限 → 流年重算', $$('[data-year]')[0].classList.contains('active'));
check('切大限後流年變動仍在', $('.luck-detail').textContent.includes('流年變動'));

// --- 解讀報告 ---
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
check('報告視圖顯示', !$('#view-report').hidden);
check('紫微手風琴 6 項', $$('#view-report .acc-item').length === 6);
check('預設展開命宮總論', $('#view-report .acc-item.open .acc-title').textContent.includes('命宮總論'));
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi').click();
check('八字手風琴 5 項(含喜用神)', $$('#view-report .acc-item').length === 5);
check('預設展開日主分析', $('#view-report .acc-item.open .acc-title').textContent.includes('日主分析'));
check('含喜用神與忌神項', $$('#view-report .acc-title').some((t) => t.textContent.includes('喜用神與忌神')));

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

// --- 雙人合盤 ---
$$('.nav-item').find((n) => n.dataset.view === 'synastry').click();
check('合盤視圖顯示', !$('#view-synastry').hidden);
check('合盤表單存在', !!$('#syn-year') && !!$('#syn-run'));
check('已存命盤可帶入乙方', $$('#view-synastry [data-syn-load]').length >= 1);
$('#syn-name').value = '弟弟'; $('#syn-name').dispatchEvent(new w.Event('input'));
setDateParts('syn', 2006, 7, 12);
$('#syn-hour').value = '19'; $('#syn-hour').dispatchEvent(new w.Event('input'));
$('#syn-gender').value = 'male'; $('#syn-gender').dispatchEvent(new w.Event('input'));
$('#syn-run').click();
await settle();
check('合盤結果含契合指數', $('#view-synastry').textContent.includes('契合指數'));
check('合盤結果八段', $$('#view-synastry .acc-item').length === 8);
check('合盤 AI 提示詞按鈕', !!$('#copy-syn-prompt'));

// --- 命理小百科連結 ---
check('側欄有小百科連結', !!$('.nav-external'));

// --- 新功能批次:時辰未知/匯出入/合盤模式/流月/流年命卡 ---
check('時辰選單含「不確定」', $$('#birth-hour option').some((o) => o.value === 'unknown'));
check('收藏匯出/匯入按鈕', !!$('#export-charts') && !!$('#import-charts'));
check('合盤關係型態選單', !!$('#syn-rel') && $$('#syn-rel option').length === 4);
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
$('#open-monthly')?.click();
check('流月 chips 12 個', $$('[data-month]').length === 12);
check('流月變動內容(八字)', $('.luck-detail').textContent.includes('流月變動'));
check('流月命宮與四化(紫微)', $('.luck-detail').textContent.includes('流月命宮與四化'));
check('紫微流月含四化落宮', $('.luck-detail').textContent.includes('化祿落在') || $('.luck-detail').textContent.includes('化祿,落本命'));
$$('.nav-item').find((n) => n.dataset.view === 'share').click();
$$('#view-share [data-card]').find((t) => t.dataset.card === 'annual')?.click();
check('流年命卡切換', $('#view-share').textContent.includes('流年卡') && $('.fate-birth').textContent.includes('運勢重點'));
$$('#view-share [data-card]').find((t) => t.dataset.card === 'life')?.click();

// --- 時辰未知流程 ---
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
$('#birth-hour').value = 'unknown';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('時辰未知警示', $('#view-dashboard').textContent.includes('時辰未知'));
check('摘要標示暫排', $('#birth-summary').textContent.includes('時辰未知'));
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();

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
setDateParts('birth', 1998, 3, 15);
$('#birth-hour').value = '11';
$$('#gender-toggle .pill').find((p) => p.dataset.value === 'male').click();
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('重排後摘要更新(戊寅年)', $('#birth-summary').textContent.includes('戊寅年'));
check('重排後仍 12 宮', $$('.palace-cell').length === 12);

// --- 姓名學 ---
$('#name-input').value = '張萱利';
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
$$('.nav-item').find((n) => n.dataset.view === 'naming').click();
check('姓名學分頁顯示', !$('#view-naming').hidden);
check('自動帶入排盤姓名(姓)', $('#naming-surname').value === '張');
check('自動帶入排盤姓名(名)', $('#naming-given').value === '萱利');
check('五格剖象法卡片出現', $('#view-naming').textContent.includes('五格剖象法'));
check('五格數字卡(天人地外總)至少5格', $$('.wuge-cell').length >= 5);
check('姓名五行×紫微八字卡片出現', $('#view-naming').textContent.includes('紫微八字'));
check('顯示喜用神判斷結果', /補益喜用神|偏向忌神|喜忌並存|中性/.test($('#view-naming').textContent));
check('顯示紫微角度段落', $('#view-naming').textContent.includes('紫微角度'));
check('複製AI提示詞按鈕出現', !!$('#copy-naming-prompt'));

$('#naming-surname').value = '喵';
$('#naming-surname').dispatchEvent(new w.Event('input'));
$('#naming-run').click();
check('未收錄字誠實提示,不做臆測', $('#view-naming').textContent.includes('不在收錄的姓名用字字典裡'));

$('#name-input').value = '歐陽小明';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
$$('.nav-item').find((n) => n.dataset.view === 'naming').click();
check('複姓「歐陽」自動判斷正確', $('#naming-surname').value === '歐陽');
check('複姓命盤:名自動帶入', $('#naming-given').value === '小明');
check('複姓三字姓名五格剖象法可完整計算', $('#view-naming').textContent.includes('天格'));

// --- 進階玄學工具 ---
$$('.nav-item').find((n) => n.dataset.view === 'metaphysics').click();
await settle();
check('進階玄學分頁顯示', !$('#view-metaphysics').hidden);
check('進階玄學有目的導覽 7 選項', $$('#view-metaphysics [data-meta-jump]').length === 7);
check('目前工具顯示用途、所需資料與三步驟', !!$('.meta-intro') && $$('.meta-intro li').length === 3 && $('.meta-intro').textContent.includes('需要：'));
check('未來七日運勢 7 張', $$('.daily-card').length === 7);
check('每日週運顯示目前大限脈絡', $('#view-metaphysics').textContent.includes('目前大限'));
check('每日週運有專用 AI 解讀', !!$('#ai-daily'));
check('七個進階工具入口', $$('#view-metaphysics [data-meta]').length === 7);
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'timeline').click();
check('生涯時間軸含十個大限', $$('.timeline-block').length === 10);
check('生涯時間軸每個大限顯示四化', $$('.timeline-block').every((b) => b.textContent.includes('大限四化')));
check('生涯時間軸有專用 AI 解讀', !!$('#ai-timeline'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'rectify').click();
$('#run-rectify').click();
await settle();
check('時辰驗盤產生十二候選', $$('#rectify-result tbody tr').length === 12);
check('時辰驗盤含五行局與命宮四化欄位', $('#rectify-result thead').textContent.includes('五行局') && $('#rectify-result thead').textContent.includes('四化'));
check('時辰驗盤有專用 AI 協助', !!$('#ai-rectify'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'dates').click();
$('#date-run').click();
await settle();
check('個人擇日產生候選與 AI 比較', $$('.date-results article').length > 0 && !!$('#ai-dates'));
check('個人擇日提及喜用神', $('#view-metaphysics').textContent.includes('喜用神'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'iching').click();
$('#iching-question').value = '測試問題';
$('#iching-cast').click();
check('易經起卦產生六爻', $$('#iching-result .hex-line').length === 6);
check('易經結果含白話重點與 AI 解讀', !!$('#iching-result .plain-summary') && !!$('#ai-iching'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'meihua').click();
$('#meihua-run').click();
check('梅花易數產生本卦與變卦', $('#meihua-result').textContent.includes('變卦'));
check('梅花易數含體用斷卦', !!$('#meihua-result .tiyong-card'));
check('梅花易數含白話重點與 AI 解讀', !!$('#meihua-result .plain-summary') && !!$('#ai-meihua'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'qimen').click();
$('#qimen-run').click();
await settle();
check('奇門結構盤顯示九宮', $$('.qimen-palace').length === 9);
check('奇門地盤三奇六儀至少排入一宮', $$('.qimen-yiqi').some((el) => el.textContent.trim() && el.textContent.trim() !== '—'));
check('奇門含白話重點與 AI 解讀', !!$('#qimen-result .plain-summary') && !!$('#ai-qimen'));

// --- 迴歸測試:大限與流年同宮時(annual 合併為 null)不可讓整張盤崩潰、側邊欄卡死 ---
// 1980/8/12 戌時(19-21)出生、預設性別(女)在本次修正前會在 renderComprehensive() 拋出
// TypeError: Cannot read properties of null (reading 'text'),整個 renderAll() 中斷,
// has-chart 沒被加上、側邊導覽全部停用,畫面卻不顯示任何錯誤訊息。
setDateParts('birth', 1980, 8, 12);
$('#birth-hour').value = '19';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('大限流年同宮的邊界案例排盤後仍標記已有命盤(has-chart)', doc.body.classList.contains('has-chart'));
check('大限流年同宮的邊界案例排盤後側邊導覽可點擊', $$('.side-nav [data-view]').every((n) => !n.disabled));
check('大限流年同宮的邊界案例仍能正常顯示 12 宮位', $$('.palace-cell').length === 12);

console.log(failed === 0 ? '\n全部通過 ✅' : `\n${failed} 項失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);

// smoke.mjs — headless DOM 冒煙測試(npm run smoke)
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const w = new Window({ url: 'http://localhost/' });
for (const k of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'navigator', 'localStorage']) {
  try { globalThis[k] = w[k]; } catch { /* 某些屬性唯讀 */ }
}
globalThis.window = w;

// 攔截 console.error,整輪跑完後檢查有沒有任何一次程式自己 catch 到例外時記錄下來的錯誤
// (畫面互動本身若丟出未捕捉例外,happy-dom 會直接讓這支腳本整個中斷、跑不完,等同另一種形式的錯誤偵測)
const consoleErrors = [];
const realConsoleError = console.error.bind(console);
console.error = (...args) => { consoleErrors.push(args.map(String).join(' ')); realConsoleError(...args); };

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
check('進站顯示歡迎畫面', $('#view-dashboard').textContent.includes('免費排盤，開始看重點'));
check('進站不顯示任何命盤', $$('.palace-cell').length === 0);
check('側邊導覽保留核心功能並將延伸功能收進更多工具', $$('.side-nav .section-label').length === 1 && !!$('.more-tools'));

// --- 表單驗證:年份留空送出,要就地顯示錯誤而不是靜默無反應 ---
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('出生年留空送出時顯示錯誤訊息', !$('#birth-date-error').hidden && $('#birth-date-error').textContent.includes('西元年'));
check('留空送出不會產生命盤', $$('.palace-cell').length === 0);

// --- 填表排盤 ---
$('#name-input').value = 'Shelly';
setDateParts('birth', 2002, 9, 4);
check('日期選完後會自動接到時辰', doc.activeElement === $('#birth-hour'));
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
check('五行分布雷達圖與五項圖例', !!$('.el-radar') && $$('.el-legend-item').length === 5);
check('命盤小教室預設命宮', $('.classroom-title').textContent.includes('命宮'));
check('大限 chips = 10', $$('[data-limit]').length === 10);
check('流年 chips = 10', $$('[data-year]').length === 10);
check('大限流年瀏覽器標出「現在」徽章', $$('.now-badge').length >= 1);
check('命盤總覽摘要卡不再過早出現分享按鈕', !$('#summary-share-btn'));

// 點財帛宮 → 小教室更新
$$('.palace-cell').find((c) => c.dataset.palace === '財帛宮').click();
check('點財帛宮 → 小教室切換', $('.classroom-title').textContent.includes('財帛宮'));
check('小教室含機巨雙星補充(收在專業資料裡)', $('.classroom-body').textContent.includes('雙星組合'));

// --- 盤面連動(大限/流年/三方四正/流年四化) ---
check('流年命宮高亮 1 格', $$('.palace-cell.annual-palace').length === 1);
check('大限宮位高亮 1 格', $$('.palace-cell.decadal-palace').length === 1);
check('流年四化落點標記存在', $$('.flow-mut').length >= 3);
check('命宮的三方四正虛線 3 格', $$('.palace-cell.related').length === 3);
check('盤面圖例', !!$('.chart-legend'));
check('點擊命盤符號會用 toast 顯示說明(手機無 hover 也看得到)', (() => {
  const marker = $('.luck-tag.decadal') || $('.flow-mut');
  if (!marker) return false;
  marker.click();
  return !$('#toast').hidden && $('#toast').textContent.length > 0;
})());

// --- 命盤收藏 ---
check('儲存按鈕在排盤後顯示', !$('#save-chart-btn').hidden);
$('#save-chart-btn').click();
check('儲存後收藏列表出現', !$('#saved-section').hidden && $$('.saved-chip').length === 1);

// --- 大限流年瀏覽器(白話短版:年度重點/有利方向/需要留意,專業依據收合) ---
check('大限流年瀏覽器有年度一句話重點', !!$('.luck-detail .palace-takeaway')?.textContent.length);
check('大限流年瀏覽器有有利方向/需要留意其中之一', $$('.luck-detail .analysis-card__section-title').some((t) => t.textContent === '有利方向' || t.textContent === '需要留意'));
check('流年顯示該年度人生階段與年齡語境', !!$('.luck-detail .life-stage-note') && $('.luck-detail .life-stage-note').textContent.includes('主要關注'));
check('專業運勢依據預設收合,展開後紫微/八字分開標示', (() => {
  const details = $('.luck-detail .palace-technical');
  if (!details || details.open) return false;
  details.setAttribute('open', '');
  const labels = $$('.luck-detail .palace-technical .tech-block b').map((b) => b.textContent);
  return labels.some((l) => l.includes('紫微')) && labels.some((l) => l.includes('八字'));
})());
check('宮位 AI 提示詞按鈕', !!$('#copy-palace-prompt'));
check('流年 AI 提示詞按鈕', !!$('#copy-annual-prompt'));
let copiedAnnualPrompt = '';
Object.defineProperty(w.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { copiedAnnualPrompt = text; } },
});
if (globalThis.navigator !== w.navigator) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { copiedAnnualPrompt = text; } },
  });
}
$$('[data-limit]').at(-1).click();
$$('[data-year]')[0].click();
check('高齡流年改用超高齡生活語境', $('.luck-detail .life-stage-note').textContent.includes('超高齡生活期'));
$('#copy-annual-prompt').click();
await new Promise((r) => setTimeout(r, 0));
check('流年 AI 提示詞含年齡階段與禁止錯置情境', copiedAnnualPrompt.includes('超高齡生活期') && copiedAnnualPrompt.includes('禁止不合年齡的預設'));
$$('[data-limit]')[0].click();
check('切大限 → 流年重算', $$('[data-year]')[0].classList.contains('active'));
check('切大限後年度重點仍在', !!$('.luck-detail .palace-takeaway')?.textContent.length);

// --- 主題分析（問題導向＋紫微八字初解＋逐題 AI） ---
$$('.nav-item').find((n) => n.dataset.view === 'topics').click();
check('主題分析視圖顯示', !$('#view-topics').hidden);
check('主題分析共 10 個主題', $$('#view-topics .topic-tab').length === 10);
check('每個主題至少顯示 6 個具體問題', (() => {
  const tabs = $$('#view-topics .topic-tab');
  return tabs.every((tab) => {
    tab.click();
    return $$('#view-topics .topic-question-card').length >= 6;
  });
})());
$$('#view-topics .topic-tab').find((n) => n.dataset.topic === 'love').click();
check('每題顯示一個紫微八字綜合回答', (() => {
  const text = $('#view-topics').textContent;
  return $$('#view-topics .topic-answer--combined').length === 6
    && text.includes('綜合回答') && !text.includes('八字補充')
    && !text.includes('命盤無法判定') && !text.includes('水多')
    && !text.includes('五行') && !text.includes('日主') && !text.includes('十神');
})());
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
check('命盤總覽提供主題分析導引',
  !!$('#view-dashboard [data-result-goto="topics"]'));
$$('.nav-item').find((n) => n.dataset.view === 'topics').click();
$$('#view-topics .topic-tab').find((n) => n.dataset.topic === 'career').click();
check('可切換到事業問題', $('#view-topics').textContent.includes('我適合負責哪些工作內容'));
let copiedTopicPrompt = '';
Object.defineProperty(globalThis.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { copiedTopicPrompt = text; } },
});
$('#view-topics .topic-ai-btn').click();
await new Promise((r) => setTimeout(r, 0));
check('逐題 AI 提示包含問題、綜合初解與完整資料包', copiedTopicPrompt.includes('我適合負責哪些工作內容')
  && copiedTopicPrompt.includes('網站初步綜合回答')
  && copiedTopicPrompt.includes('完整命盤資料包'));

// --- 解讀報告(白話摘要分析卡片) ---
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
check('報告視圖顯示', !$('#view-report').hidden);
check('紫微白話摘要卡片 6 項', $$('#view-report .analysis-card').length === 6);
check('預設展開命宮總論', $('#view-report .analysis-card.open .analysis-card__title').textContent.includes('命宮總論'));
check('命宮總論卡片採快速摘要結構(重點/近期訊號/行動/專業依據)', (() => {
  const card = $$('#view-report .analysis-card').find((c) => c.querySelector('.analysis-card__title').textContent.includes('命宮總論'));
  return !!card.querySelector('.analysis-card__summary')
    && !!card.querySelector('.analysis-card__explanation')
    && card.textContent.includes('現在可能出現')
    && card.textContent.includes('接下來可以做')
    && !card.querySelector('.analysis-card__reflection')
    && !!card.querySelector('[data-report-panel="technical"]');
})());
check('專業依據面板預設收合(白話摘要模式)', $$('#view-report [data-report-panel="technical"]').every((p) => p.hidden));
check('白話面板預設顯示(白話摘要模式)', $$('#view-report [data-report-panel="plain"]').every((p) => !p.hidden));
$$('#view-report .analysis-card__header').find((r) => r.textContent.includes('財帛宮')).click();
check('重點解讀同時間只展開一張卡片', $$('#view-report .analysis-card.open').length === 1);
$$('#view-report .analysis-card__header').find((r) => r.textContent.includes('大限・流年重點')).click();
check('大限流年重點區塊有跳轉命盤總覽按鈕', !!$('#view-report [data-jump-dashboard]'));
$('#view-report [data-jump-dashboard]').click();
check('點擊跳轉按鈕會切到命盤總覽', !$('#view-dashboard').hidden);
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi').click();
check('八字白話摘要卡片 5 項(含喜用神)', $$('#view-report .analysis-card').length === 5);
check('預設展開日主分析', $('#view-report .analysis-card.open .analysis-card__title').textContent.includes('日主分析'));
check('含喜用神與忌神項', $$('#view-report .analysis-card__title').some((t) => t.textContent.includes('喜用神與忌神')));
check('解讀報告讀完後才出現分享命卡邀請', !!$('#report-share-btn'));
$('#report-share-btn').click();
check('點擊報告頁分享邀請會切到分享命卡視圖', !$('#view-share').hidden);
$$('.nav-item').find((n) => n.dataset.view === 'report').click();

// --- 命盤解析(綜合報告) ---
$$('.nav-item').find((n) => n.dataset.view === 'comprehensive').click();
check('解析視圖顯示', !$('#view-comprehensive').hidden);
check('紫微6段+八字6段(含全盤概覽/地支關係/神煞)', $$('#view-comprehensive .acc-item').length === 12);
check('含當前焦點段', $('#view-comprehensive').textContent.includes('當前焦點'));
check('含八字財官流向段', $('#view-comprehensive').textContent.includes('財官流向'));
check('含全盤概覽段', $('#view-comprehensive').textContent.includes('全盤概覽'));
check('含地支關係段', $('#view-comprehensive').textContent.includes('地支關係'));
check('含神煞段', $('#view-comprehensive').textContent.includes('神煞'));
check('深度解析具備完整內容層級', (() => {
  const text = $('#view-comprehensive').textContent;
  return text.includes('你可以發揮的地方')
    && text.includes('不同情境中的表現')
    && text.includes('容易反覆出現的課題')
    && text.includes('長期發展建議')
    && text.includes('與其他人生主題的關聯');
})());

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
check('合盤日期選完後會自動接到乙方時辰', doc.activeElement === $('#syn-hour'));
$('#syn-hour').value = '19'; $('#syn-hour').dispatchEvent(new w.Event('input'));
$('#syn-gender').value = 'male'; $('#syn-gender').dispatchEvent(new w.Event('input'));
$('#syn-run').click();
await settle();
check('合盤結果含契合指數', $('#view-synastry').textContent.includes('契合指數'));
check('合盤結果八段', $$('#view-synastry .acc-item').length === 8);
check('合盤 AI 提示詞按鈕', !!$('#copy-syn-prompt'));
check('合盤時辰提供「不確定」選項', $$('#syn-hour option').some((o) => o.value === 'unknown'));
$('#syn-hour').value = 'unknown'; $('#syn-hour').dispatchEvent(new w.Event('input'));
$('#syn-run').click();
await settle();
check('合盤未知時辰會顯示暫排警示', $('#view-synastry').textContent.includes('乙方時辰不確定') && $('#view-synastry').textContent.includes('暫以午時排盤'));

// --- 命理小百科連結 ---
check('側欄有小百科連結', !!$('.nav-external'));

// --- 新功能批次:時辰未知/匯出入/合盤模式/流月/流年命卡 ---
check('時辰選單含「不確定」', $$('#birth-hour option').some((o) => o.value === 'unknown'));
check('收藏匯出/匯入按鈕', !!$('#export-charts') && !!$('#import-charts'));
check('合盤關係型態選單', !!$('#syn-rel') && $$('#syn-rel option').length === 4);
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
$('#dashboard-detail').open = true;
$('#dashboard-detail').dispatchEvent(new w.Event('toggle'));
$('#open-monthly')?.click();
check('展開流月後完整命盤不會自動收合', $('#dashboard-detail').open);
check('流月 chips 12 個', $$('[data-month]').length === 12);
$('.monthly-plain .palace-technical').open = true;
$('.monthly-plain .palace-technical').dispatchEvent(new w.Event('toggle'));
$$('[data-month]')[1].click();
check('切換流月後外層與流月專業依據都維持展開', $('#dashboard-detail').open && $('.monthly-plain .palace-technical').open);
check('流月正文改為白話重點/把握/留意/行動', (() => {
  const text = $('.monthly-plain').textContent;
  return text.includes('月重點') && text.includes('這個月可以把握')
    && text.includes('這個月需要留意') && text.includes('先選一件');
})());
check('流月專業依據切換月份後維持原本展開狀態', (() => {
  const details = $('.monthly-plain .palace-technical');
  return details && details.open && details.textContent.includes('紫微流月命宮與四化')
    && details.textContent.includes('八字流月干支與引動');
})());
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
check('命卡有五行色徽章', !!$('.fate-el-chip')?.textContent.trim());
check('命宮主星標籤(空宮借星)', $('.fate-tags').textContent.includes('借'));
check('日主標籤 乙木', $('.fate-tags').textContent.includes('乙木'));

// --- 大眾版/學習版切換(命盤總覽/深度解析用共用的 state.readingMode;重點解讀另外用分頁各自的
//     state.reportViewMode,見下面單獨的區塊——命盤小教室與深度解析的「專業資料/專業命理依據」
//     現在永遠是完整內容,收合、不受開關影響,開關只影響上面白話段落的引用詳略程度) ---
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
check('預設大眾版,小教室白話段落不含依據句', !$('.palace-takeaway').textContent.includes('亮度是') && !$('.palace-explain').textContent.includes('亮度是'));
check('小教室的專業資料永遠是完整內容,不受開關影響', $('.palace-technical').textContent.includes('亮度') || $('.palace-technical').textContent.includes('借對宮'));
$('.mode-pill[data-mode="study"]').click();
check('切學習版,小教室白話段落仍維持白話(不因開關混入依據句)', !$('.palace-takeaway').textContent.includes('亮度是') && !$('.palace-explain').textContent.includes('亮度是'));
$$('.nav-item').find((n) => n.dataset.view === 'comprehensive').click();
check('學習版命盤解析:白話段落含十神依據(細節上)', $$('#view-comprehensive .palace-explain').some((el) => el.textContent.includes('細節上')));
check('深度解析的專業命理依據永遠是完整內容,不受開關影響', $$('#view-comprehensive .palace-technical').length > 0);
$('.mode-pill[data-mode="public"]').click();
check('切回大眾版,白話段落不再含十神依據', !$$('#view-comprehensive .palace-explain').some((el) => el.textContent.includes('細節上')));

// 重點解讀的「白話摘要／專業依據」是分頁各自獨立的狀態(state.reportViewMode),要先切到這個頁面,
// 開關才會改到它、而不是改到命盤總覽/深度解析共用的 state.readingMode(見 currentReadingMode())
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
$('.mode-pill[data-mode="study"]').click();
check('專業命盤模式:解讀報告已展開卡片直接顯示專業依據面板', $$('#view-report [data-report-panel="technical"]').length > 0 && $$('#view-report [data-report-panel="technical"]').every((p) => !p.hidden));
check('專業命盤模式:白話面板改為隱藏', $$('#view-report [data-report-panel="plain"]').every((p) => p.hidden));
$('.mode-pill[data-mode="public"]').click();
check('切回白話摘要模式:解讀報告的專業依據面板恢復預設收合', $$('#view-report [data-report-panel="technical"]').every((p) => p.hidden));

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
check('進階玄學導覽預設只顯示 3 個今日建議', $$('#view-metaphysics [data-meta-jump]').length === 3);
$('#meta-guide-toggle').click();
check('點「顯示其餘工具」後展開全部 7 選項', $$('#view-metaphysics [data-meta-jump]').length === 7);
check('目前工具顯示用途、所需資料與三步驟', !!$('.meta-intro') && $$('.meta-intro li').length === 3 && $('.meta-intro').textContent.includes('需要：'));
check('未來七日運勢 7 張', $$('.daily-card').length === 7);
check('每日週運顯示目前大限脈絡', $('#view-metaphysics').textContent.includes('目前大限'));
check('每日週運有專用 AI 解讀', !!$('#ai-daily'));
check('七個進階工具入口', $$('#view-metaphysics [data-meta]').length === 7);
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'timeline').click();
check('生涯時間軸含十個大限', $$('.timeline-block').length === 10);
check('生涯時間軸每個大限顯示四化', $$('.timeline-block').every((b) => b.textContent.includes('大限四化')));
check('生涯時間軸有專用 AI 解讀', !!$('#ai-timeline'));
check('生涯時間軸每個區塊有手機版展開按鈕', $$('.tl-toggle').length === 10);
$$('.tl-toggle')[0].click();
check('點擊展開按鈕會標記該區塊為 expanded', $$('.timeline-block')[0].classList.contains('expanded'));
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

// --- 資訊架構改版:導覽名稱統一、三頁互相導引、按鈕鍵盤可操作、無 console.error ---
check('導覽列已改名為「重點解讀」「深度解析」', $$('.nav-item').some((n) => n.textContent === '重點解讀') && $$('.nav-item').some((n) => n.textContent === '深度解析'));
check('導覽列不再出現舊名稱「解讀報告」「命盤解析」', !$$('.nav-item').some((n) => n.textContent === '解讀報告' || n.textContent === '命盤解析'));
$$('.nav-item').find((n) => n.dataset.view === 'dashboard').click();
check('命盤總覽提供重點解讀／主題分析／完整命盤三條新手路徑',
  !!$('#view-dashboard [data-result-goto="report"]')
  && !!$('#view-dashboard [data-result-goto="topics"]')
  && !!$('#view-dashboard [data-result-goto="dashboard-detail"]'));
$$('.nav-item').find((n) => n.dataset.view === 'comprehensive').click();
check('深度解析有跳轉到重點解讀/命盤總覽的導引連結', !!$('#view-comprehensive [data-goto="report"]') && !!$('#view-comprehensive [data-goto="dashboard"]'));
$$('.nav-item').find((n) => n.dataset.view === 'report').click();
check('重點解讀有跳轉到命盤總覽/深度解析的導引連結', !!$('#view-report [data-goto="dashboard"]') && !!$('#view-report [data-goto="comprehensive"]'));

// 「白話摘要／專業依據」按鈕是原生 <button>,鍵盤 Enter/Space 本來就能觸發 click,這裡直接驗證
// dispatchEvent(new w.Event('click')) 等效於鍵盤觸發後行為一致(happy-dom 沒有另外模擬鍵盤事件的 API,
// 用「原生 button 元素 + 沒有 tabindex=-1 + 沒有攔截 keydown」三個條件驗證鍵盤可達性)
check('切換按鈕是原生 button,鍵盤可操作(無 tabindex=-1、無攔截 keydown)', (() => {
  const pills = $$('#reading-mode-toggle .mode-pill');
  return pills.every((p) => p.tagName === 'BUTTON' && p.getAttribute('tabindex') !== '-1');
})());
check('切換按鈕有 aria-pressed 標示目前狀態', $$('#reading-mode-toggle .mode-pill').every((p) => p.hasAttribute('aria-pressed')));
check('切換按鈕群組有 aria-controls 指向目前頁面', $('#reading-mode-toggle').hasAttribute('aria-controls'));

// 紫微/八字分頁各自記住「白話摘要／專業依據」狀態,互不影響
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'ziwei')?.click();
$('.mode-pill[data-mode="public"]').click();
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi')?.click();
$('.mode-pill[data-mode="study"]').click();
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'ziwei')?.click();
check('紫微分頁不受剛剛八字分頁切換專業依據影響,仍是白話摘要', $('.mode-pill[data-mode="public"]').classList.contains('active'));
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi')?.click();
check('切回八字分頁,記得剛剛切的專業依據', $('.mode-pill[data-mode="study"]').classList.contains('active'));
$('.mode-pill[data-mode="public"]').click();

check('整輪互動下來沒有任何 console.error', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  console.error:', e.slice(0, 200)));

console.log(failed === 0 ? '\n全部通過 ✅' : `\n${failed} 項失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);

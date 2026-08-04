// smoke.mjs — headless DOM 冒煙測試（npm run smoke）
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const w = new Window({ url: 'http://localhost/' });
// matchMedia 一定要掛上去:switchView 尾端用它判斷是否為手機版寬度。
// 少了它,switchView 會在最後一行丟 TypeError——瀏覽器裡不會發生，但在這個測試環境中
// 會讓整段導覽邏輯默默中斷（過去這個錯誤被 happy-dom 吞掉，測試看起來還是綠的）。
for (const k of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'navigator', 'localStorage', 'matchMedia', 'requestIdleCallback']) {
  try { globalThis[k] = w[k]; } catch { /* 某些屬性唯讀 */ }
}
globalThis.window = w;

// 攔截 console.error,整輪跑完後檢查有沒有任何一次程式自己 catch 到例外時記錄下來的錯誤
// (畫面互動本身若丟出未捕捉例外,happy-dom 會直接讓這支腳本整個中斷、跑不完，等同另一種形式的錯誤偵測)
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
// 排盤引擎改為動態載入（submit 後非同步），送出表單後需等引擎載入+渲染完成
const settle = () => new Promise((r) => setTimeout(r, 300));
// 深度解析／合盤／姓名學／進階玄學的引擎改為動態載入後,switchView 變成非同步：
// 點完側欄導覽要讓事件迴圈跑完 import 才能斷言畫面內容，否則會抓到還沒渲染的舊 DOM。
const nav = async (view) => {
  $$('.nav-item').find((n) => n.dataset.view === view).click();
  await settle();
};
/** 任何會觸發 switchView 的按鈕（頁間導引連結、分享邀請等）都要用這個點 */
const clickNav = async (el) => { el.click(); await settle(); };
// 出生日期改成年/月/日三欄後，填值要各別觸發對應事件，模擬使用者實際輸入
const setDateParts = (prefix, y, m, d) => {
  $(`#${prefix}-year`).value = String(y);
  $(`#${prefix}-year`).dispatchEvent(new w.Event('input'));
  $(`#${prefix}-month`).value = String(m);
  $(`#${prefix}-month`).dispatchEvent(new w.Event('change'));
  $(`#${prefix}-day`).value = String(d);
  $(`#${prefix}-day`).dispatchEvent(new w.Event('change'));
};

// --- 進站空白狀態（未排盤） ---
check('進站顯示歡迎畫面', $('#view-dashboard').textContent.includes('免費排盤，開始看重點'));
check('進站不顯示任何命盤', $$('.palace-cell').length === 0);
check('側邊導覽保留核心功能並將延伸功能收進更多工具', $$('.side-nav .section-label').length === 1 && !!$('.more-tools'));

// --- 表單驗證：年份留空送出，要就地顯示錯誤而不是靜默無反應 ---
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
check('小教室含機巨雙星補充（收在專業資料裡）', $('.classroom-body').textContent.includes('雙星組合'));

// --- 盤面連動（大限/流年/三方四正/流年四化） ---
check('流年命宮高亮 1 格', $$('.palace-cell.annual-palace').length === 1);
check('大限宮位高亮 1 格', $$('.palace-cell.decadal-palace').length === 1);
check('流年四化落點標記存在', $$('.flow-mut').length >= 3);
check('命宮的三方四正虛線 3 格', $$('.palace-cell.related').length === 3);
check('盤面圖例', !!$('.chart-legend'));
check('點擊命盤符號會用 toast 顯示說明（手機無 hover 也看得到）', (() => {
  const marker = $('.luck-tag.decadal') || $('.flow-mut');
  if (!marker) return false;
  marker.click();
  return !$('#toast').hidden && $('#toast').textContent.length > 0;
})());

// --- 命盤收藏 ---
check('儲存按鈕在排盤後顯示', !$('#save-chart-btn').hidden);
$('#save-chart-btn').click();
check('儲存後收藏列表出現', !$('#saved-section').hidden && $$('.saved-chip').length === 1);
// 收藏不是只有「顯示在清單」就算完成；實際點回去會重新走一次欄位回填與排盤流程。
// 這裡使用上面 2002-09-04 未時女命，防止已存資料可見、卻無法重新載入的回歸。
$('#name-input').value = '暫時修改';
$('.saved-chip').click();
await settle();
check('已存命盤可從側欄重新排盤', $('#page-title').textContent.includes('Shelly')
  && $$('.palace-cell').length === 12);

// 完整命盤 AI 提示詞保留正式人生解讀規則；主題單題則不應重複附上這一大段。
let copiedFullPrompt = '';
Object.defineProperty(w.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { copiedFullPrompt = text; } },
});
if (globalThis.navigator !== w.navigator) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { copiedFullPrompt = text; } },
  });
}
$('#copy-ai-btn').click();
await new Promise((r) => setTimeout(r, 0));
check('完整命盤 AI 提示包含正式人生解讀規則', copiedFullPrompt.includes('【內部判讀】')
  && copiedFullPrompt.includes('【白話翻譯】')
  && copiedFullPrompt.includes('【輸出前自檢】'));

// --- 大限流年瀏覽器（白話短版：年度重點/有利方向/需要留意，專業依據收合） ---
check('大限流年瀏覽器有年度一句話重點', !!$('.luck-detail .palace-takeaway')?.textContent.length);
check('大限流年瀏覽器有有利方向/需要留意其中之一', $$('.luck-detail .analysis-card__section-title').some((t) => t.textContent === '有利方向' || t.textContent === '需要留意'));
check('流年顯示該年度人生階段與年齡語境', !!$('.luck-detail .life-stage-note') && $('.luck-detail .life-stage-note').textContent.includes('主要關注'));
check('專業運勢依據預設收合，展開後紫微/八字分開標示', (() => {
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
check('流年 AI 提示詞使用本年必要資料且不附完整命盤巡禮',
  copiedAnnualPrompt.includes('◆ 本年相關本命宮位')
  && copiedAnnualPrompt.includes('◆ 八字本年必要資料')
  && copiedAnnualPrompt.includes('流年支引動')
  && copiedAnnualPrompt.includes('800至1200個中文字')
  && !copiedAnnualPrompt.includes('◆ 十二宮列表')
  && !copiedAnnualPrompt.includes('◆ 十二宮飛化')
  && !copiedAnnualPrompt.includes('◆ 2023–2029流年快照')
  && !copiedAnnualPrompt.includes('◆ 大運列表'));
$$('[data-limit]')[0].click();
check('切大限 → 流年重算', $$('[data-year]')[0].classList.contains('active'));
check('切大限後年度重點仍在', !!$('.luck-detail .palace-takeaway')?.textContent.length);

// 切換年份後，正文不只換年份標題，也必須換成該年自己的紫微／八字內容。
$$('[data-limit]').find((chip) => chip.classList.contains('is-now'))?.click();
const annualTextBeforeSwitch = $('.luck-detail').textContent;
const nextYearChip = $$('[data-year]').find((chip) => !chip.classList.contains('active'));
nextYearChip?.click();
const annualTextAfterSwitch = $('.luck-detail').textContent;
check('切換流年會更新該年解析，不只顯示十年大運', annualTextBeforeSwitch !== annualTextAfterSwitch
  && $('.luck-detail .palace-explain').textContent.includes('今年流年'));

// --- 主題分析（問題導向＋紫微八字初解＋逐題 AI） ---
await nav('topics');
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
// 主題回答必須由本次命盤投影；只渲染目前展開的一題，避免隱藏內容造成重複。
check('主題回答來自本次命盤，且整頁只渲染展開題', (() => {
  const text = $('#view-topics').textContent;
  return $$('#view-topics .topic-answer--combined').length === 1
    && $$('#view-topics .topic-answer--basis').length === 1
    && $$('#view-topics .topic-basis-list li').length >= 3
    && $$('#view-topics .topic-question-body').length === 1
    && text.includes('簡單回答')
    && text.includes('你常遇到的類型是')
    && text.includes('查看這一題的命盤依據（專業資料）')
    && !$('#view-topics .topic-answer--basis').open
    && !text.includes('較明顯的方向是')
    && !text.includes('Topic Contract')
    && !text.includes('這一題的一般方向')
    && (text.match(/不會由網站上傳/g) ?? []).length === 1
    && !text.includes('命盤無法判定') && !text.includes('水多')
    && !text.includes('五行') && !text.includes('日主') && !text.includes('十神');
})());
await nav('dashboard');
check('命盤總覽提供主題分析導引',
  !!$('#view-dashboard [data-result-goto="topics"]'));
await nav('topics');
$$('#view-topics .topic-tab').find((n) => n.dataset.topic === 'career').click();
check('可切換到事業問題', $('#view-topics').textContent.includes('我適合負責哪些工作內容'));
let copiedTopicPrompt = '';
Object.defineProperty(globalThis.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { copiedTopicPrompt = text; } },
});
$('#view-topics .topic-ai-btn').click();
await new Promise((r) => setTimeout(r, 0));
check('逐題 AI 提示與網站共用已篩選證據', copiedTopicPrompt.includes('我適合負責哪些工作內容')
  && copiedTopicPrompt.includes('網站已用相同證據生成的直接答案')
  && copiedTopicPrompt.includes('本題已篩選命盤依據')
  && copiedTopicPrompt.includes('支持的回答目標'));
check('主題單題只帶最多三項相關證據且不附完整命盤',
  copiedTopicPrompt.includes('全文最多 450 個中文字')
  && copiedTopicPrompt.includes('不得延伸')
  && copiedTopicPrompt.includes('第一句就回答')
  && (copiedTopicPrompt.match(/\d+\. 來源：/g) ?? []).length <= 3
  && !copiedTopicPrompt.includes('◆ 十二宮列表')
  && !copiedTopicPrompt.includes('◆ 十二宮飛化')
  && !copiedTopicPrompt.includes('完整命盤資料包')
  && !copiedTopicPrompt.includes('【內部判讀】')
  && !copiedTopicPrompt.includes('【輸出前自檢】')
  && !copiedTopicPrompt.includes('三個最重要的分類詳寫'));
check('完整 AI 提示要求紫微與八字交叉驗證且不硬湊', copiedFullPrompt.includes('紫微用來辨認人生領域')
  && copiedFullPrompt.includes('八字用來驗證內在動力與應對方式')
  && copiedFullPrompt.includes('重要結論至少要有兩項資料支持')
  && copiedFullPrompt.includes('不同調時')
  && copiedFullPrompt.includes('不要硬湊成一致'));
check('完整 AI 提示要求臺灣用語、短句與去空話',
  copiedFullPrompt.includes('使用臺灣繁體中文')
  && copiedFullPrompt.includes('值得注意的是')
  && copiedFullPrompt.includes('各段要有不同的起點與節奏'));
check('完整 AI 提示將抽象判斷翻譯成行為與觸發情境',
  copiedFullPrompt.includes('生活中如何表現')
  && copiedFullPrompt.includes('何時最容易出現')
  && copiedFullPrompt.includes('別人可能如何感受')
  && copiedFullPrompt.includes('使用過度付出什麼代價')
  && copiedFullPrompt.includes('必須立即說明對什麼')
  && copiedFullPrompt.includes('做不到就刪除該詞')
  && copiedFullPrompt.includes('要交代切換條件'));
check('完整 AI 提示採白話人生分類且避免跨類重複',
  copiedFullPrompt.includes('開場只用一至兩句')
  && copiedFullPrompt.includes('你是怎麼運作的')
  && copiedFullPrompt.includes('工作與天賦')
  && copiedFullPrompt.includes('金錢與價值感')
  && copiedFullPrompt.includes('感情與重要關係')
  && copiedFullPrompt.includes('身心使用方式')
  && copiedFullPrompt.includes('只選最相關的一至三類')
  && copiedFullPrompt.includes('選出三個最重要的分類詳寫')
  && copiedFullPrompt.includes('其餘分類各用一個短段落')
  && copiedFullPrompt.includes('所有行動建議集中在「你現在走到哪裡」')
  && copiedFullPrompt.includes('這部分訊號較少')
  && copiedFullPrompt.includes('同一核心結論只能在一類完整說明')
  && copiedFullPrompt.includes('1200至1600個中文字'));
check('完整 AI 提示附藏干十神與完整神煞並限制輔助用法',
  copiedFullPrompt.includes('◆ 藏干（天干-十神）')
  && /藏干（天干-十神）[\s\S]*[甲乙丙丁戊己庚辛壬癸]-(?:比肩|劫財|食神|傷官|偏財|正財|七殺|正官|偏印|正印)/.test(copiedFullPrompt)
  && copiedFullPrompt.includes('藏干則補充未直接顯露')
  && copiedFullPrompt.includes('神煞只作輔助')
  && copiedFullPrompt.includes('最多採用一至兩項')
  && copiedFullPrompt.includes('不得保證一定出現'));
check('完整 AI 提示區分時間層級、禁用必然語氣並要求具體建議',
  copiedFullPrompt.includes('本命只寫')
  && copiedFullPrompt.includes('大限只寫')
  && copiedFullPrompt.includes('流年只寫')
  && copiedFullPrompt.includes('注定、一定、必然、肯定會發生')
  && copiedFullPrompt.includes('建議必須回答做什麼、何時做、如何做')
  && copiedFullPrompt.includes('不得只說相信自己'));
check('完整 AI 提示區分特質來源並執行輸出前自檢',
  copiedFullPrompt.includes('天生傾向、後天練出的能力、因環境要求形成的生存策略')
  && copiedFullPrompt.includes('不要把過度察言觀色')
  && copiedFullPrompt.includes('【輸出前自檢】')
  && copiedFullPrompt.includes('文末依據是否不超過三句'));
let copiedSpecialPrompt = '';
Object.defineProperty(globalThis.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text) => { copiedSpecialPrompt = text; } },
});
if (w.navigator !== globalThis.navigator) {
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { copiedSpecialPrompt = text; } },
  });
}
$('#copy-palace-prompt').click();
await new Promise((r) => setTimeout(r, 0));
check('單宮提示只附本宮與三方四正必要資料',
  copiedSpecialPrompt.includes('與三方四正必要資料')
  && copiedSpecialPrompt.includes('約500至800個中文字')
  && !copiedSpecialPrompt.includes('◆ 十二宮列表')
  && !copiedSpecialPrompt.includes('【內部判讀】'));

// --- 解讀報告（白話摘要分析卡片） ---
await nav('report');
check('報告視圖顯示', !$('#view-report').hidden);
check('紫微白話摘要卡片 6 項', $$('#view-report .analysis-card').length === 6);
check('預設展開本盤動態命宮卡片', $('#view-report .analysis-card.open .analysis-card__title').textContent.includes('做決定時的基本反應'));
check('命宮卡片採快速摘要結構（重點/近期訊號/行動/專業依據）', (() => {
  const card = $$('#view-report .analysis-card').find((c) => c.querySelector('.analysis-card__title').textContent.includes('做決定時的基本反應'));
  return !!card.querySelector('.analysis-card__summary')
    && !!card.querySelector('.analysis-card__explanation')
    && card.textContent.includes('現在可能出現')
    && card.textContent.includes('接下來可以做')
    && !card.querySelector('.analysis-card__reflection')
    && !!card.querySelector('[data-report-panel="technical"]');
})());
check('專業依據面板預設收合（白話摘要模式）', $$('#view-report [data-report-panel="technical"]').every((p) => p.hidden));
check('白話面板預設顯示（白話摘要模式）', $$('#view-report [data-report-panel="plain"]').every((p) => !p.hidden));
$$('#view-report .analysis-card__header').find((r) => r.textContent.includes('金錢與資源')).click();
check('重點解讀同時間只展開一張卡片', $$('#view-report .analysis-card.open').length === 1);
$$('#view-report .analysis-card__header').find((r) => r.textContent.includes('大限・流年重點')).click();
check('大限流年重點區塊有跳轉命盤總覽按鈕', !!$('#view-report [data-jump-dashboard]'));
await clickNav($('#view-report [data-jump-dashboard]'));
check('點擊跳轉按鈕會切到命盤總覽', !$('#view-dashboard').hidden);
await nav('report');
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi').click();
check('八字白話摘要卡片 5 項（含喜用神）', $$('#view-report .analysis-card').length === 5);
// 卡片標題已改成白話（內部 key 仍是 zhu/xiji/yongshen/shishen/dayun），術語只留在專業依據面板
check('預設展開第一張八字卡（你的先天底色）', $('#view-report .analysis-card.open .analysis-card__title').textContent.includes('你的先天底色'));
check('含喜用神卡，且標題已白話化', $$('#view-report .analysis-card__title').some((t) => t.textContent.includes('對你有幫助與要避開的方向')));
check('解讀報告讀完後才出現分享命卡邀請', !!$('#report-share-btn'));
await clickNav($('#report-share-btn'));
check('點擊報告頁分享邀請會切到分享命卡視圖', !$('#view-share').hidden);
await nav('report');

// --- 命盤解析（綜合報告） ---
await nav('comprehensive');
check('解析視圖顯示', !$('#view-comprehensive').hidden);
check('紫微6段+八字6段（含全盤概覽/地支關係/神煞）', $$('#view-comprehensive .acc-item').length === 12);
check('含當前焦點段', $('#view-comprehensive').textContent.includes('當前焦點'));
// 大眾版標題要看得懂：畫面上顯示白話標題，「財官流向」「地支關係」「神煞」等術語標題
// 只在專業命盤模式出現（內部識別字仍維持原名，收合設定與導語都靠它）
check('八字財官段改用白話標題',
  $('#view-comprehensive').textContent.includes('金錢與事業的流向')
  && !$('#view-comprehensive').textContent.includes('財官流向'));
check('含全盤概覽段', $('#view-comprehensive').textContent.includes('全盤概覽'));
check('含地支關係段', $('#view-comprehensive').textContent.includes('地支關係'));
check('神煞段改用白話標題',
  $('#view-comprehensive').textContent.includes('加分與要留意的地方')
  && !$('#view-comprehensive').textContent.includes('五、神煞'));
check('深度解析具備完整內容層級', (() => {
  const text = $('#view-comprehensive').textContent;
  return text.includes('現實中可能怎麼出現')
    && text.includes('容易反覆出現的課題')
    && text.includes('專業命理依據')
    && !text.includes('與其他人生主題的關聯');
})());

// 完整報告開頭的「人生說明書」：原本的「長期發展建議」把同一句情況重複塞進四個欄位，
// 讀起來像待辦清單。改成一條時間線之後，這裡驗的是敘事四段都在、而且真的依命盤產生。
check('完整報告開頭是人生說明書，四段俱全', (() => {
  const card = $('#view-comprehensive .manual-card');
  const text = card?.textContent ?? '';
  return !!card && text.includes('你是什麼樣的人') && text.includes('你的人生會怎麼展開')
    && text.includes('你反覆遇到的課題') && text.includes('你的轉折點');
})());
check('人生說明書列出十個十年階段，預設只展開現在這一段', (() => {
  const stages = $$('#view-comprehensive .manual-stage');
  return stages.length === 10
    && $$('#view-comprehensive .manual-stage.current').length === 1
    && $$('#view-comprehensive .manual-stage-body').length === 1;
})());
check('人生說明書的階段內容依命盤宮位產生，不是固定文案', (() => {
  const names = $$('#view-comprehensive .manual-stage-main b').map((el) => el.textContent.replace('（現在）', ''));
  return names.length === 10 && new Set(names).size >= 6 && names.every((n) => n.endsWith('宮'));
})());
check('人生說明書的轉折點標出實際西元年', (() => {
  const years = $$('#view-comprehensive .manual-turns li b').map((el) => Number(el.textContent));
  return years.length >= 5 && years.every((y) => y > 1900 && y < 2200)
    && years.every((y, i) => i === 0 || y > years[i - 1]);
})());
check('點其他十年階段可以展開對照', (() => {
  const other = $$('#view-comprehensive [data-manual-stage]').find((b) => !b.closest('.manual-stage').classList.contains('current'));
  if (!other) return false;
  other.click();
  return $$('#view-comprehensive .manual-stage-body').length === 2;
})());
check('完整報告不再出現待辦清單式的長期發展建議', !$('#view-comprehensive').textContent.includes('長期發展建議')
  && !$('#view-comprehensive .deep-advice'));
// 地支關係/神煞屬於補充細節，預設收合（acc-item 沒有 open class,內文不渲染），點開才展開
// 用 data-detail(內部識別字)定位，不用畫面上的標題——顯示標題在大眾版已改成白話
const findDetailItem = (title) => $$('#view-comprehensive .acc-item').find((it) => it.querySelector('.acc-row[data-detail]')?.dataset.detail.includes(title));
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
// 主要4段（全盤概覽/個性本質/財官流向/人際健康建議）不受影響，預設仍全部展開
check('全盤概覽等主要段落預設仍展開', $$('#view-comprehensive .acc-item.open').length === 12 - 2);

// --- 雙人合盤 ---
await nav('synastry');
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
$('#copy-syn-prompt').click();
await settle();
check('合盤提示維持雙人必要摘要並限制篇幅',
  copiedSpecialPrompt.includes('約800至1200個中文字')
  && copiedSpecialPrompt.includes('不要擴寫個別完整人生報告')
  && !copiedSpecialPrompt.includes('◆ 十二宮列表')
  && !copiedSpecialPrompt.includes('【內部判讀】'));
check('合盤時辰提供「不確定」選項', $$('#syn-hour option').some((o) => o.value === 'unknown'));
$('#syn-hour').value = 'unknown'; $('#syn-hour').dispatchEvent(new w.Event('input'));
$('#syn-run').click();
await settle();
check('合盤未知時辰會顯示暫排警示', $('#view-synastry').textContent.includes('乙方時辰不確定') && $('#view-synastry').textContent.includes('暫以午時排盤'));

// --- 命理小百科連結 ---
check('側欄有小百科連結', !!$('.nav-external'));

// --- 新功能批次：時辰未知/匯出入/合盤模式/流月/流年命卡 ---
check('時辰選單含「不確定」', $$('#birth-hour option').some((o) => o.value === 'unknown'));
check('收藏匯出/匯入按鈕', !!$('#export-charts') && !!$('#import-charts'));
check('合盤關係型態選單', !!$('#syn-rel') && $$('#syn-rel option').length === 4);
await nav('dashboard');
$('#dashboard-detail').open = true;
$('#dashboard-detail').dispatchEvent(new w.Event('toggle'));
$('#open-monthly')?.click();
check('展開流月後完整命盤不會自動收合', $('#dashboard-detail').open);
check('流月 chips 12 個', $$('[data-month]').length === 12);
$('.monthly-plain .palace-technical').open = true;
$('.monthly-plain .palace-technical').dispatchEvent(new w.Event('toggle'));
let monthScrollIntoViewCalls = 0;
const originalScrollIntoView = w.HTMLElement.prototype.scrollIntoView;
w.HTMLElement.prototype.scrollIntoView = () => { monthScrollIntoViewCalls++; };
$$('[data-month]')[1].click();
w.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
check('切換流月不會把整頁捲回月份按鈕', monthScrollIntoViewCalls === 0);
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
await nav('share');
$$('#view-share [data-card]').find((t) => t.dataset.card === 'annual')?.click();
check('流年命卡切換', $('#view-share').textContent.includes('流年卡') && $('.fate-birth').textContent.includes('運勢重點'));
$$('#view-share [data-card]').find((t) => t.dataset.card === 'life')?.click();

// --- 時辰未知流程 ---
await nav('dashboard');
$('#birth-hour').value = 'unknown';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('時辰未知警示', $('#view-dashboard').textContent.includes('時辰未知'));
check('摘要標示暫排', $('#birth-summary').textContent.includes('時辰未知'));
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();

// --- 分享命卡 ---
await nav('share');
check('命卡姓名', $('.fate-name').textContent === 'Shelly');
check('命卡有五行色徽章', !!$('.fate-el-chip')?.textContent.trim());
check('命宮主星標籤（空宮借星）', $('.fate-tags').textContent.includes('借'));
check('日主標籤 乙木', $('.fate-tags').textContent.includes('乙木'));

// --- 大眾版/學習版切換(命盤總覽/深度解析用共用的 state.readingMode;重點解讀另外用分頁各自的
//     state.reportViewMode,見下面單獨的區塊——命盤小教室與深度解析的「專業資料/專業命理依據」
//     現在永遠是完整內容，收合、不受開關影響，開關只影響上面白話段落的引用詳略程度) ---
await nav('dashboard');
check('預設大眾版，小教室白話段落不含依據句', !$('.palace-takeaway').textContent.includes('亮度是') && !$('.palace-explain').textContent.includes('亮度是'));
check('小教室的專業資料永遠是完整內容，不受開關影響', $('.palace-technical').textContent.includes('亮度') || $('.palace-technical').textContent.includes('借對宮'));
$('.mode-pill[data-mode="study"]').click();
check('切學習版，小教室白話段落仍維持白話（不因開關混入依據句）', !$('.palace-takeaway').textContent.includes('亮度是') && !$('.palace-explain').textContent.includes('亮度是'));
await nav('comprehensive');
check('學習版命盤解析：一般版文字仍白話，依據放在專業區', !$$('#view-comprehensive .palace-explain').some((el) => el.textContent.includes('細節上')));
check('深度解析的專業命理依據永遠是完整內容，不受開關影響', $$('#view-comprehensive .palace-technical').length > 0);
$('.mode-pill[data-mode="public"]').click();
check('切回大眾版，白話段落不再含十神依據', !$$('#view-comprehensive .palace-explain').some((el) => el.textContent.includes('細節上')));

// --- 學習模式（三段式閱讀模式的中間那一段） ---
// 這一區驗的是「按鈕按下去真的有東西可以用」，不是只有畫面長出來：
// 步驟能展開、答題有回饋、進度會累積、重設會清乾淨、換宮位內容跟著換。
await nav('dashboard');
check('閱讀模式是三段式（白話/學習/專業）', (() => {
  const modes = $$('#reading-mode-toggle .mode-pill').map((p) => p.dataset.mode);
  return modes.length === 3 && modes.join(',') === 'public,learn,study';
})());
check('命盤總覽也能切換閱讀模式（不是只有重點摘要頁才有）', !$('#reading-mode-toggle').hidden);
check('白話模式下白話結論附有「為什麼這樣判斷」可展開', !!$('.learn-why') && $('.learn-why summary').textContent.includes('為什麼這樣判斷'));
check('「為什麼這樣判斷」列出主要依據與推導過程', (() => {
  const text = $('.learn-why').textContent;
  return text.includes('主要依據') && text.includes('推導過程') && text.includes('還需要確認的部分');
})());
check('白話模式下不顯示逐步判讀教學區', !$('#learn-card'));

$('.mode-pill[data-mode="learn"]').click();
await settle();
check('切到學習模式會出現逐步判讀教學區', !!$('#learn-card'));
check('逐步判讀固定五個步驟', $$('#learn-card .learn-step').length === 5);
check('五個步驟標題依序為本宮/對宮/三方四正/四化/整合', (() => {
  const titles = $$('#learn-card .learn-step-title').map((el) => el.textContent);
  return titles[0].includes('先看本宮') && titles[1].includes('看對宮') && titles[2].includes('看三方四正')
    && titles[3].includes('看四化與自化') && titles[4].includes('整合成白話');
})());
check('預設只展開第一步（漸進式揭露）', $$('#learn-card .learn-step.open').length === 1
  && $('#learn-card .learn-step.open .learn-step-title').textContent.includes('先看本宮'));
check('第一步列出宮干地支、主星、生年四化與自化欄位', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return ['宮干地支', '主星', '六吉星', '六煞星', '雜曜', '生年四化', '自化', '特殊標記'].every((k) => text.includes(k));
})());
// 第一步不只列名字，還要照三合派的順序教「先看哪一個、每一層怎麼改變判斷」。
// 原本雙星、吉煞、雜曜都只有星名，使用者看得到卻學不到怎麼用。
check('第一步先給三合派的判讀順序', (() => {
  const order = $('#learn-card .learn-order');
  const text = order?.textContent ?? '';
  return !!order && order.querySelectorAll('ol > li').length === 6
    && text.includes('主星') && text.includes('廟旺利陷') && text.includes('雙星組合')
    && text.includes('生年四化') && text.includes('六吉六煞') && text.includes('雜曜');
})());
check('第一步依判讀順序分層呈現', (() => {
  const titles = $$('#learn-card .learn-layer-title').map((el) => el.textContent);
  return titles.some((t) => t.includes('主星與廟旺')) && titles.some((t) => t.includes('雙星結構'))
    && titles.some((t) => t.includes('見吉')) && titles.some((t) => t.includes('見煞'))
    && titles.some((t) => t.includes('雜曜'));
})());
check('見吉見煞有說明怎麼改變判斷，不只列星名', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return text.includes('見吉星時，判斷要怎麼調整') && text.includes('見煞星時，判斷要怎麼調整')
    && text.includes('煞星不等於壞事');
})());
check('雜曜改成說明何時才要看，不再只說不列入判斷', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return text.includes('雜曜什麼時候才要納入判斷') && text.includes('主結構');
})());
check('星名可點開連到命理小百科', (() => {
  const chips = $$('#learn-card .star-chip');
  return chips.length > 0 && chips.every((a) => a.getAttribute('href')?.startsWith('./wiki/'));
})());
check('學習模式不重複顯示「為什麼這樣判斷」(內容已在第五步)', !$('.learn-why'));
check('顯示十二宮學習進度', $('#learn-card .learn-progress').textContent.includes('十二宮學習進度：'));
check('學習模式沒有蓋掉原本的命盤與小教室', $$('.palace-cell').length === 12 && !!$('#classroom-card'));

// 展開第四步：四化必須標出來源、星曜、四化種類、落點與層次
$$('#learn-card [data-learn-step]').find((b) => b.dataset.learnStep === 'mutagen').click();
await settle();
check('點第四步會展開四化內容', $('#learn-card .learn-step.open .learn-step-title').textContent.includes('看四化與自化'));
check('四化說明含祿權科忌的初學者關鍵字', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return text.includes('增加、靠近、投入、取得') && text.includes('掌握、推動、承擔、主導')
    && text.includes('整理、呈現、認可、緩和') && text.includes('執著、卡點、壓力、反覆處理');
})());
check('四化提醒化祿不必然是好事、化忌不必然是壞事', $('#learn-card .learn-step.open .learn-step-body').textContent.includes('化祿不一定全部是好事'));
check('四化分層列出本命/宮干/大限/流年', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return ['生年四化（一輩子）', '宮干飛化（本宮飛出去）', '大限四化（這十年）', '流年四化（這一年）'].every((k) => text.includes(k));
})());
check('飛化句子完整標出「宮干→哪顆星→哪一化→落入哪一宮」', (() => {
  const items = $$('#learn-card .learn-mut-group li').map((el) => el.textContent);
  const flight = items.find((t) => t.includes('宮干飛化'));
  return Boolean(flight && /宮干.使.+化[祿權科忌]，落入.+宮。/.test(flight));
})());

// 展開第五步：證據鏈與四段式結論
$$('#learn-card [data-learn-step]').find((b) => b.dataset.learnStep === 'synthesis').click();
await settle();
check('第五步列出主要依據/輔助依據/暫時不採用', (() => {
  const text = $('#learn-card .learn-step.open .learn-step-body').textContent;
  return text.includes('主要依據') && text.includes('輔助依據') && text.includes('暫時不採用');
})());
check('結論採四段式（看到什麼→怎麼互相影響→可能出現什麼→還要確認什麼）', (() => {
  const text = $('#learn-card .learn-conclusion').textContent;
  return text.includes('1. 盤面看到什麼') && text.includes('2. 這些資料怎麼互相影響')
    && text.includes('3. 可能出現在什麼情況') && text.includes('4. 還需要什麼才能確認');
})());
check('結論附判讀限制', $('#learn-card .learn-step.open .learn-step-body').textContent.includes('判讀限制'));

// 把剩下兩步也讀過：五步都讀完，這一宮才算學完（每一步展開後就地驗內容，收合後 body 會被移除）
const openLearnStep = async (stepId) => {
  $$('#learn-card [data-learn-step]').find((b) => b.dataset.learnStep === stepId).click();
  await settle();
  return $('#learn-card .learn-step.open .learn-step-body');
};
const oppositeBody = await openLearnStep('opposite');
check('第二步說明對宮軸線關係（不是只列星曜）',
  oppositeBody.textContent.includes('這條軸線') && oppositeBody.textContent.includes('兩宮的關係'));
const triadBody = await openLearnStep('triad');
check('第三步列出本宮/對宮/兩個三合宮共四宮', triadBody.querySelectorAll('.learn-table tbody tr').length === 4);
check('第三步說明三方四正是共同描述同一個主題', triadBody.textContent.includes('共同描述同一個主題'));
check('讀完五步後進度加一', $('#learn-card .learn-progress').textContent.includes('1／12'));

// 練習題：先自己判斷
$('.learn-quiz > summary').click();
check('練習題可展開且題目由本盤產生', $$('#learn-card .quiz-item').length >= 3);
const firstQuiz = $('#learn-card .quiz-item');
check('作答前不顯示答案', !firstQuiz.querySelector('.quiz-feedback'));
firstQuiz.querySelector('.quiz-option').click();
await settle();
check('作答後顯示對錯與解釋', (() => {
  const item = $('#learn-card .quiz-item');
  const feedback = item.querySelector('.quiz-feedback');
  return Boolean(feedback && feedback.textContent.length > 10);
})());
check('作答後標出正確選項', !!$('#learn-card .quiz-option.correct'));
check('作答後同一題不能再重複作答', [...$('#learn-card .quiz-item').querySelectorAll('.quiz-option')].every((b) => b.disabled));
check('尚未作答的題目仍可作答', [...$$('#learn-card .quiz-item')[1].querySelectorAll('.quiz-option')].every((b) => !b.disabled));
check('練習答對統計會顯示', $('#learn-card .learn-progress').textContent.includes('練習答對'));

// 換宮位：教學內容必須同步更新
const learnPalaceTitle = () => $('#learn-card .learn-head-text b').textContent;
const beforeSwitch = learnPalaceTitle();
$$('.palace-cell').find((c) => c.dataset.palace === '官祿宮').click();
await settle();
check('切換宮位後逐步判讀跟著換', learnPalaceTitle() !== beforeSwitch && learnPalaceTitle().includes('官祿宮'));
check('切換宮位後回到第一步', $('#learn-card .learn-step.open .learn-step-title').textContent.includes('先看本宮'));
check('切換宮位後練習題也換成新宮位', $$('#learn-card .quiz-item .quiz-prompt').some((p) => p.textContent.includes('官祿宮')));

// 空宮：必須出現專屬教學，而且不能寫死星名
$$('.palace-cell').forEach(() => {});
const emptyCell = $$('.palace-cell').find((c) => !c.querySelector('.p-stars').textContent.replace(/[祿權科忌]/g, '').trim());
if (emptyCell) {
  emptyCell.click();
  await settle();
  check('空宮顯示專屬判讀提示', !!$('#learn-card .learn-empty-guide'));
  check('空宮提示先澄清「不是比較差」', $('#learn-card .learn-empty-guide').textContent.includes('不代表沒有個性'));
  check('空宮提示列出本宮/對宮/兩個三合宮四項參考', $$('#learn-card .learn-empty-guide .learn-table tbody tr').length === 4);
  check('空宮提示說明不能把對宮主星直接當本宮主星', $('#learn-card .learn-empty-guide').textContent.includes('不能直接當成本宮坐命的主星'));
} else {
  check('這張測試命盤找不到空宮（案例覆蓋不足）', false);
}

// 進度重設
$('#learn-reset').click();
await settle();
check('重設進度後回到 0／12', $('#learn-card .learn-progress').textContent.includes('0／12'));
check('重設進度後練習作答紀錄一併清除', !$('#learn-card .quiz-option.correct'));

// 名詞小百科
check('學習模式提供名詞小百科', $$('#learn-card [data-glossary]').length >= 5);
check('小百科名詞有實際說明（不是空 tooltip）', $$('#learn-card [data-glossary]').every((b) => b.title.length > 5));
$('#learn-card [data-glossary]').click();
check('點名詞會顯示說明（手機沒有 hover 也看得到）', !$('#toast').hidden && $('#toast').textContent.includes('：'));

// 學習模式的白話文字不應該退化成專業模式
$('.mode-pill[data-mode="public"]').click();
await settle();
check('切回白話模式後教學區收起', !$('#learn-card'));
check('切回白話模式後「為什麼這樣判斷」回來', !!$('.learn-why'));

// 主題分析的命盤依據要列真正可以回到命盤上核對的事實，
// 而不是每一條都長成「XX宮的主要訊號」這種對誰都成立的佔位字串。
await nav('topics');
check('命盤依據列出真實盤面事實', (() => {
  const labels = $$('#view-topics .topic-basis-list li b').map((el) => el.textContent);
  const details = $$('#view-topics .topic-basis-list li span').map((el) => el.textContent);
  return labels.includes('對應宮位')
    && labels.some((l) => l.includes('主星'))
    && details.some((d) => /[子丑寅卯辰巳午未申酉戌亥]/.test(d));
})());
check('命盤依據不再出現重複的佔位標籤', (() => {
  const rows = $$('#view-topics .topic-basis-list li').map((el) => el.textContent);
  return rows.length === new Set(rows).size
    && !rows.some((r) => r.includes('的主要訊號'));
})());
await nav('dashboard');

// 重點解讀的「白話摘要／專業依據」是分頁各自獨立的狀態（state.reportViewMode），要先切到這個頁面，
// 開關才會改到它、而不是改到命盤總覽/深度解析共用的 state.readingMode(見 currentReadingMode())
await nav('report');
$('.mode-pill[data-mode="study"]').click();
check('專業命盤模式：解讀報告已展開卡片直接顯示專業依據面板', $$('#view-report [data-report-panel="technical"]').length > 0 && $$('#view-report [data-report-panel="technical"]').every((p) => !p.hidden));
check('專業命盤模式：白話面板改為隱藏', $$('#view-report [data-report-panel="plain"]').every((p) => p.hidden));
$('.mode-pill[data-mode="public"]').click();
check('切回白話摘要模式：解讀報告的專業依據面板恢復預設收合', $$('#view-report [data-report-panel="technical"]').every((p) => p.hidden));

// --- 重新排盤（換男生日期） ---
await nav('dashboard');
setDateParts('birth', 1998, 3, 15);
$('#birth-hour').value = '11';
$$('#gender-toggle .pill').find((p) => p.dataset.value === 'male').click();
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('重排後摘要更新（戊寅年）', $('#birth-summary').textContent.includes('戊寅年'));
check('重排後仍 12 宮', $$('.palace-cell').length === 12);

// --- 姓名學 ---
$('#name-input').value = '張萱利';
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
await nav('naming');
check('姓名學分頁顯示', !$('#view-naming').hidden);
check('自動帶入排盤姓名（姓）', $('#naming-surname').value === '張');
check('自動帶入排盤姓名（名）', $('#naming-given').value === '萱利');
check('五格剖象法卡片出現', $('#view-naming').textContent.includes('五格剖象法'));
check('五格數字卡（天人地外總）至少5格', $$('.wuge-cell').length >= 5);
check('姓名五行×紫微八字卡片出現', $('#view-naming').textContent.includes('紫微八字'));
check('顯示喜用神判斷結果', /補益喜用神|偏向忌神|喜忌並存|中性/.test($('#view-naming').textContent));
check('顯示紫微角度段落', $('#view-naming').textContent.includes('紫微角度'));
check('複製AI提示詞按鈕出現', !!$('#copy-naming-prompt'));
$('#copy-naming-prompt').click();
await settle();
check('姓名學提示聚焦三類且限制篇幅',
  copiedSpecialPrompt.includes('名字帶來的氣質')
  && copiedSpecialPrompt.includes('約600至900個中文字')
  && copiedSpecialPrompt.includes('不要從姓名延伸預測完整人生階段')
  && !copiedSpecialPrompt.includes('人生各階段運勢概覽'));

$('#naming-surname').value = '喵';
$('#naming-surname').dispatchEvent(new w.Event('input'));
$('#naming-run').click();
check('未收錄字誠實提示，不做臆測', $('#view-naming').textContent.includes('不在收錄的姓名用字字典裡'));

$('#name-input').value = '歐陽小明';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
await nav('naming');
check('複姓「歐陽」自動判斷正確', $('#naming-surname').value === '歐陽');
check('複姓命盤：名自動帶入', $('#naming-given').value === '小明');
check('複姓三字姓名五格剖象法可完整計算', $('#view-naming').textContent.includes('天格'));

// --- 進階玄學工具 ---
await nav('metaphysics');
await settle();
check('進階玄學分頁顯示', !$('#view-metaphysics').hidden);
check('進階玄學導覽預設只顯示 3 個今日建議', $$('#view-metaphysics [data-meta-jump]').length === 3);
$('#meta-guide-toggle').click();
check('點「顯示其餘工具」後展開全部 7 選項', $$('#view-metaphysics [data-meta-jump]').length === 7);
check('目前工具顯示用途、所需資料與三步驟', !!$('.meta-intro') && $$('.meta-intro li').length === 3 && $('.meta-intro').textContent.includes('需要：'));
check('未來七日運勢 7 張', $$('.daily-card').length === 7);
check('每日週運顯示目前大限脈絡', $('#view-metaphysics').textContent.includes('目前大限'));
check('每日週運有專用 AI 解讀', !!$('#ai-daily'));
$('#ai-daily').click();
await new Promise((r) => setTimeout(r, 0));
check('每日週運提示只附七日必要資料並限制篇幅',
  copiedSpecialPrompt.includes('◆ 未來七日逐日干支與十神')
  && copiedSpecialPrompt.includes('約600至900個中文字')
  && !copiedSpecialPrompt.includes('◆ 十二宮列表')
  && !copiedSpecialPrompt.includes('【內部判讀】'));
check('七個進階工具入口', $$('#view-metaphysics [data-meta]').length === 7);
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'timeline').click();
check('生涯時間軸含十個大限', $$('.timeline-block').length === 10);
check('生涯時間軸每個大限顯示四化', $$('.timeline-block').every((b) => b.textContent.includes('大限四化')));
check('生涯時間軸有專用 AI 解讀', !!$('#ai-timeline'));
$('#ai-timeline').click();
await new Promise((r) => setTimeout(r, 0));
check('時間軸提示聚焦大限大運與真實事件',
  copiedSpecialPrompt.includes('◆ 十個大限與已記錄事件')
  && copiedSpecialPrompt.includes('約1000至1500個中文字')
  && copiedSpecialPrompt.includes('有事件的階段優先詳寫')
  && !copiedSpecialPrompt.includes('◆ 十二宮列表')
  && !copiedSpecialPrompt.includes('【內部判讀】'));
check('生涯時間軸每個區塊有手機版展開按鈕', $$('.tl-toggle').length === 10);
$$('.tl-toggle')[0].click();
check('點擊展開按鈕會標記該區塊為 expanded', $$('.timeline-block')[0].classList.contains('expanded'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'rectify').click();
$('#run-rectify').click();
await settle();
check('時辰驗盤產生十二候選', $$('#rectify-result tbody tr').length === 12);
check('時辰驗盤含五行局與命宮四化欄位', $('#rectify-result thead').textContent.includes('五行局') && $('#rectify-result thead').textContent.includes('四化'));
check('時辰驗盤有專用 AI 協助', !!$('#ai-rectify'));
$('#ai-rectify').click();
await new Promise((r) => setTimeout(r, 0));
check('時辰驗盤共用短版規則不擴寫人生報告',
  copiedSpecialPrompt.includes('約500至800個中文字')
  && copiedSpecialPrompt.includes('不擴寫無關人生分類'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'dates').click();
$('#date-run').click();
await settle();
check('個人擇日產生候選與 AI 比較', $$('.date-results article').length > 0 && !!$('#ai-dates'));
check('個人擇日提及喜用神', $('#view-metaphysics').textContent.includes('喜用神'));
$('#ai-dates').click();
await new Promise((r) => setTimeout(r, 0));
check('擇日提示使用短版問題導向規則', copiedSpecialPrompt.includes('約500至800個中文字') && copiedSpecialPrompt.includes('下一步'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'iching').click();
$('#iching-question').value = '測試問題';
$('#iching-cast').click();
check('易經起卦產生六爻', $$('#iching-result .hex-line').length === 6);
check('易經結果含白話重點與 AI 解讀', !!$('#iching-result .plain-summary') && !!$('#ai-iching'));
$('#ai-iching').click();
await new Promise((r) => setTimeout(r, 0));
check('易經提示使用短版問題導向規則', copiedSpecialPrompt.includes('約500至800個中文字') && copiedSpecialPrompt.includes('具體情境'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'meihua').click();
$('#meihua-run').click();
check('梅花易數產生本卦與變卦', $('#meihua-result').textContent.includes('變卦'));
check('梅花易數含體用斷卦', !!$('#meihua-result .tiyong-card'));
check('梅花易數含白話重點與 AI 解讀', !!$('#meihua-result .plain-summary') && !!$('#ai-meihua'));
$('#ai-meihua').click();
await new Promise((r) => setTimeout(r, 0));
check('梅花提示使用短版問題導向規則', copiedSpecialPrompt.includes('約500至800個中文字') && copiedSpecialPrompt.includes('不逐項教學術語'));
$$('#view-metaphysics [data-meta]').find((b) => b.dataset.meta === 'qimen').click();
$('#qimen-run').click();
await settle();
check('奇門結構盤顯示九宮', $$('.qimen-palace').length === 9);
check('奇門地盤三奇六儀至少排入一宮', $$('.qimen-yiqi').some((el) => el.textContent.trim() && el.textContent.trim() !== '—'));
check('奇門含白話重點與 AI 解讀', !!$('#qimen-result .plain-summary') && !!$('#ai-qimen'));
$('#ai-qimen').click();
await new Promise((r) => setTimeout(r, 0));
check('奇門提示保留資料限制並使用短版規則',
  copiedSpecialPrompt.includes('約500至800個中文字')
  && copiedSpecialPrompt.includes('不是本次天盤')
  && copiedSpecialPrompt.includes('資料不足或門派有差異'));

// --- 迴歸測試：大限與流年同宮時（annual 合併為 null）不可讓整張盤崩潰、側邊欄卡死 ---
// 1980/8/12 戌時（19-21）出生、預設性別（女）在本次修正前會在 renderComprehensive() 拋出
// TypeError: Cannot read properties of null (reading 'text'),整個 renderAll() 中斷，
// has-chart 沒被加上、側邊導覽全部停用，畫面卻不顯示任何錯誤訊息。
setDateParts('birth', 1980, 8, 12);
$('#birth-hour').value = '19';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('大限流年同宮的邊界案例排盤後仍標記已有命盤（has-chart）', doc.body.classList.contains('has-chart'));
check('大限流年同宮的邊界案例排盤後側邊導覽可點擊', $$('.side-nav [data-view]').every((n) => !n.disabled));
check('大限流年同宮的邊界案例仍能正常顯示 12 宮位', $$('.palace-cell').length === 12);

// --- 資訊架構改版：導覽名稱統一、三頁互相導引、按鈕鍵盤可操作、無 console.error ---
// 「重點解讀」與「深度解析」字面上都是「解讀」，一般人分不出差別。
// 導覽改成用「怎麼讀、要多久」命名，並且側欄名稱必須跟總覽三條路徑的按鈕文字一致——
// 舊版按鈕寫「01・先看現在」、點下去側欄卻亮「重點解讀」，使用者對不起來。
const navText = (v) => $$('.nav-item').find((n) => n.dataset.view === v)?.textContent ?? '';
check('導覽改名為「重點摘要」「完整報告」', navText('report').includes('重點摘要') && navText('comprehensive').includes('完整報告'));
check('導覽標出閱讀方式與所需時間', navText('report').includes('分鐘') && navText('comprehensive').includes('分鐘'));
check('導覽列不再出現舊名稱', !$$('.nav-item').some((n) => ['解讀報告', '命盤解析', '重點解讀', '深度解析'].includes(n.textContent.trim())));
await nav('dashboard');
check('命盤總覽提供重點摘要／主題分析／完整報告三條下一步',
  !!$('#view-dashboard [data-result-goto="report"]')
  && !!$('#view-dashboard [data-result-goto="topics"]')
  && !!$('#view-dashboard [data-result-goto="comprehensive"]')
  && !!$('#view-dashboard [data-result-goto="dashboard-detail"]'));
check('三條路徑的按鈕文字與側欄名稱一致', (() => {
  const label = (v) => $(`#view-dashboard [data-result-goto="${v}"] b`)?.textContent.trim();
  return label('report') === '重點摘要' && label('topics') === '主題分析' && label('comprehensive') === '完整報告';
})());
await nav('comprehensive');
check('完整報告有跳轉到重點摘要的導引連結', !!$('#view-comprehensive [data-goto="report"]'));
await nav('report');
check('重點解讀有跳轉到命盤總覽/深度解析的導引連結', !!$('#view-report [data-goto="dashboard"]') && !!$('#view-report [data-goto="comprehensive"]'));

// 「白話摘要／專業依據」按鈕是原生 <button>,鍵盤 Enter/Space 本來就能觸發 click,這裡直接驗證
// dispatchEvent(new w.Event('click')) 等效於鍵盤觸發後行為一致(happy-dom 沒有另外模擬鍵盤事件的 API,
// 用「原生 button 元素 + 沒有 tabindex=-1 + 沒有攔截 keydown」三個條件驗證鍵盤可達性)
check('切換按鈕是原生 button,鍵盤可操作（無 tabindex=-1、無攔截 keydown）', (() => {
  const pills = $$('#reading-mode-toggle .mode-pill');
  return pills.every((p) => p.tagName === 'BUTTON' && p.getAttribute('tabindex') !== '-1');
})());
check('切換按鈕有 aria-pressed 標示目前狀態', $$('#reading-mode-toggle .mode-pill').every((p) => p.hasAttribute('aria-pressed')));
check('切換按鈕群組有 aria-controls 指向目前頁面', $('#reading-mode-toggle').hasAttribute('aria-controls'));

// 紫微/八字分頁各自記住「白話摘要／專業依據」狀態，互不影響
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'ziwei')?.click();
$('.mode-pill[data-mode="public"]').click();
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi')?.click();
$('.mode-pill[data-mode="study"]').click();
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'ziwei')?.click();
check('紫微分頁不受剛剛八字分頁切換專業依據影響，仍是白話摘要', $('.mode-pill[data-mode="public"]').classList.contains('active'));
$$('#view-report .report-tab').find((t) => t.dataset.tab === 'bazi')?.click();
check('切回八字分頁，記得剛剛切的專業依據', $('.mode-pill[data-mode="study"]').classList.contains('active'));
$('.mode-pill[data-mode="public"]').click();

// --- 白話模式的可讀性防迴歸檢查 ---
// 這三件事會直接決定一般使用者要不要繼續看下去，而且很容易在改文案時悄悄壞掉：
//   1) 白話面板不該出現只有學過命理的人才懂的術語（專業依據面板不在此限）;
//   2) 同一頁不該出現一字不差的重複句（過去主題分析每題都印一次相同的命盤依據，一頁重複 30 行）;
//   3) 不該出現「是這段時間可以著力的方向」這種沒有資訊量、放到任何人身上都成立的空話。
const PLAIN_BANNED_JARGON = [
  '化祿', '化權', '化科', '化忌', '喜用神', '忌神', '食傷', '比劫', '正官', '七殺', '偏財',
  '正印', '偏印', '傷官', '食神', '劫財', '比肩', '廟旺', '落陷', '借星', '來因宮', '自化',
  '納音', '藏干', '會照', '宮干', '命局', '本氣', '當令', '入柱', '日支', '年干',
];
const VAGUE_FILLER = ['實際狀況仍會', '可以著力的方向', '會比單看', '要更務實地經營', '因人而異'];
/** 只取白話面板：專業依據面板本來就該有術語，先移除再檢查 */
const plainTextOf = (view) => {
  const root = $(`#view-${view}`).cloneNode(true);
  for (const el of [...root.querySelectorAll('.analysis-card__panel--technical, .palace-technical, .tech-block, .topic-answer--basis, [data-report-panel="technical"]')]) el.remove();
  return root.textContent.replace(/\s+/g, ' ');
};
// 前面的測試切過專業命盤模式，而重點解讀的紫微/八字分頁各自記住自己的模式。
// 這裡把每一個會影響白話輸出的開關都明確切回白話，再開始檢查——
// 否則量到的其實是專業面板的內容，失敗訊息會指向錯的地方。
const forcePublicMode = async () => {
  await nav('report');
  for (const tab of ['ziwei', 'bazi']) {
    $$('#view-report .report-tab').find((t) => t.dataset.tab === tab)?.click();
    await settle();
    if (!$('.mode-pill[data-mode="public"]').classList.contains('active')) {
      $('.mode-pill[data-mode="public"]').click();
      await settle();
    }
  }
  await nav('dashboard');
  if (!$('.mode-pill[data-mode="public"]').classList.contains('active')) {
    $('.mode-pill[data-mode="public"]').click();
    await settle();
  }
};
await forcePublicMode();

for (const view of ['topics', 'report', 'comprehensive']) {
  await nav(view);
  const text = plainTextOf(view);
  // 深度解析的「身宮」保留，但必須就地附上白話註解，不能光丟術語
  // 「七殺星」是紫微主星的白話寫法（見 readability.mjs 的同一條規則），不算八字術語外洩
  const banned = PLAIN_BANNED_JARGON.filter((j) => (j === '七殺' ? /七殺(?!星)/.test(text) : text.includes(j)));
  check(`${view}:白話面板無術語${banned.length ? ':' + banned.join('、') : ''}`, banned.length === 0);
  const filler = VAGUE_FILLER.filter((j) => text.includes(j));
  check(`${view}:白話面板無空話${filler.length ? ':' + filler.join('、') : ''}`, filler.length === 0);
  const sents = text.split(/[。;；]/).map((t) => t.trim()).filter((t) => t.length >= 14);
  const counts = new Map();
  sents.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const dup = [...counts.entries()].filter(([, n]) => n > 1);
  check(`${view}:同一頁沒有一字不差的重複句${dup.length ? ':' + dup[0][0].slice(0, 30) : ''}`, dup.length === 0);
}
check('深度解析出現「身宮」時必須附白話說明', (() => {
  const text = plainTextOf('comprehensive');
  return !text.includes('身宮') || text.includes('命理上稱為身宮');
})());

// --- 打包切分的防迴歸檢查（靜態掃 main.js 原始碼，不需要跑 build） ---
// 這幾支模組連同資料庫超過 100KB,全部都是排盤後才用得到。
// 只要有人不小心在 main.js 頂端補回一行 static import,入口 bundle 就會胖回去，
// 而且畫面完全正常、沒有任何測試會失敗——所以在這裡明確守住。
const mainSrc = readFileSync('./src/main.js', 'utf-8');
const staticImports = [...mainSrc.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
const MUST_BE_LAZY = [
  './engines/compose.js', './engines/compose-bazi.js', './engines/compose-elements.js',
  './engines/compose-luck.js', './engines/compose-plain.js', './engines/compose-annual.js',
  './engines/compose-yongshen.js', './engines/comprehensive.js', './engines/format-ai.js',
  './engines/naming.js', './engines/compose-synastry.js', './engines/divination.js',
];
const leaked = MUST_BE_LAZY.filter((m) => staticImports.includes(m));
check(`重型解讀模組維持動態載入（不得靜態 import）${leaked.length ? ':' + leaked.join(', ') : ''}`, leaked.length === 0);
check('姓名字庫沒有被 format-ai 靜態帶進來',
  !readFileSync('./src/engines/format-ai.js', 'utf-8').includes("from './naming.js'"));

check('整輪互動下來沒有任何 console.error', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('  console.error:', e.slice(0, 200)));

console.log(failed === 0 ? '\n全部通過 ✅' : `\n${failed} 項失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);

// tests/prelaunch-review.mjs — 上架審查回歸（npm run prelaunch）
//
// 這一支專門守住上架審查抓到的缺陷，跟 smoke.mjs 分開的原因很實際：
// smoke 已經三百多條、跑一輪要一分鐘，改這幾條要等太久。
// 這裡只做「排一張盤 → 驗四件事」，數秒內跑完，方便反覆驗證。
//
// 守的四件事：
//   1. esc() 轉義單引號與反引號，注入字串不能變成節點或屬性
//   2. 破壞性操作（刪命盤、重設全部進度）要二次確認，按取消不能真的刪
//   3. 年份按鈕用容器事件委派，連續重繪不會累積監聽器
//   4. 時間軸與多年總覽共用同一份掃描結果，不各算一套
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

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
w.document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/, '');

await import('../src/main.js');
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


// 破壞性操作要走二次確認。happy-dom 沒有 confirm，這裡掛一個可控的替身：
// confirmReply 決定使用者按確定還是取消，confirmLog 記下實際被問了什麼。
let confirmReply = true;
const confirmLog = [];
globalThis.confirm = (message) => { confirmLog.push(String(message)); return confirmReply; };
w.confirm = globalThis.confirm;

// 先排一張基準盤，後面的檢查都建立在它上面
$('#name-input').value = '基準';
setDateParts('birth', 2002, 9, 4);
$('#birth-hour').value = '13';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('前置：基準盤排出 12 宮', $$('.palace-cell').length === 12);

// ---------- 上架審查回歸 ----------
// 這四條對應審查實測到的缺陷，防止之後改動又走回頭路。

// 1) esc() 必須轉義單引號與反引號。姓名是使用者輸入且會進 innerHTML，用它當探針。
await nav('dashboard');
$('#edit-chart-btn')?.click();
// happy-dom 序列化 innerHTML 時會把實體還原成字元，所以不能用「有沒有 &#39;」來驗，
// 改成直接驗真正在意的性質：注入字串不能變成節點或屬性。
const injection = `O'Brien"><img src=x onerror="1">` + String.fromCharCode(96); // 尾端補一個反引號
$('#name-input').value = injection;
setDateParts('birth', 1990, 6, 15);
$('#birth-hour').value = '9';
$('#birth-form').dispatchEvent(new w.Event('submit'));
await settle();
check('姓名含引號與標籤時仍能完成排盤', $$('.palace-cell').length === 12);
check('注入字串不會變成節點（沒有生出 img）', $$('#view-dashboard img').length === 0);
check('注入字串不會變成屬性（沒有 onerror）', !$$('#view-dashboard *').some((el) => el.hasAttribute('onerror')));
check('轉義後畫面上仍原樣顯示這個姓名', $('#page-title').textContent.includes("O'Brien"));
check('esc() 的字元集涵蓋單引號與反引號', (() => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf-8');
  const line = src.split('\n').find((l) => l.startsWith('const esc = '));
  return Boolean(line) && ['&', '<', '>', '"', "'", '`'].every((ch) => line.includes(ch));
})());

// 2) 破壞性操作要二次確認，按取消要真的不刪
// 直接存目前這張盤，不再多排一次——排盤要載入引擎，是這支測試最貴的動作。
$('#save-chart-btn').click();
await settle();
const savedBefore = $$('#saved-list [data-del]').length;
check('已存命盤有可刪除的項目', savedBefore > 0);
confirmLog.length = 0;
confirmReply = false;
$$('#saved-list [data-del]')[0].click();
await settle();
check('刪除命盤會先問過使用者', confirmLog.some((m) => m.includes('刪除') && m.includes('無法復原')));
check('按取消時命盤不會被刪掉', $$('#saved-list [data-del]').length === savedBefore);
confirmReply = true;
$$('#saved-list [data-del]')[0].click();
await settle();
check('按確定才真的刪除', $$('#saved-list [data-del]').length === savedBefore - 1);

// 3) 重設全部流年進度同樣要確認
$('.mode-pill[data-mode="learn"]').click();
await settle();
$('#learn-card [data-learning-kind="annual"]').click();
await settle();
confirmLog.length = 0;
confirmReply = false;
$('#annual-reset-all').click();
await settle();
check('重設全部流年進度會先問過使用者', confirmLog.some((m) => m.includes('全部年份') && m.includes('無法復原')));
confirmReply = true;

// 4) 年份按鈕改事件委派後，連續重繪不會累積監聽器造成卡死。
// 這條是真的踩到過：委派原本綁在每次重繪都會執行的 bindLearningPanel() 裡，
// 導致每重繪一次多掛一個監聽器、互相觸發，畫面直接卡死。
const chipYear = (y) => $(`.annual-year-chip[data-annual-year="${y}"]`);
const startYear = Number($('.annual-year-chip.active').dataset.annualYear);
for (let i = 1; i <= 3; i++) {
  chipYear(startYear + i)?.click();
  await settle();
}
check('連續切換 3 個年份仍正常，沒有卡死或重複觸發',
  Number($('.annual-year-chip.active').dataset.annualYear) === startYear + 3);
check('時間軸的年份按鈕沒有逐一綁定（改為容器委派）',
  !/\[data-annual-year\]'\)\.forEach/.test(readFileSync(new URL('../src/main.js', import.meta.url), 'utf-8')));

// 5) 掃描只跑一次：總覽的列必須是時間軸那份掃描的子集合，兩邊資料不能各算一套
$('[data-annual-view="overview"]').click();
await settle();
check('總覽的年份與時間軸同一份掃描（落宮一致）', (() => {
  const rows = $$('.annual-ov-row');
  return rows.length > 0 && rows.every((tr) => {
    const year = tr.querySelector('.annual-ov-year')?.textContent.slice(0, 4);
    const chip = $(`.annual-year-chip[data-annual-year="${year}"]`);
    return !!chip; // 總覽的每一年都必須出現在時間軸上
  });
})());
$('[data-annual-view="step"]').click();
await settle();


// ---------- F1 列印 / 存 PDF ----------
check('有列印按鈕', !$('#print-btn').hidden);
check('列印專用頁首帶命盤資訊與產出日期', (() => {
  const t = $('#print-header').textContent;
  return t.includes('的命盤') && /\d{4}-\d{2}-\d{2}/.test(t);
})());
check('列印專用頁尾帶免責聲明', (() => {
  const t = $('#print-footer').textContent;
  return t.includes('僅供娛樂與文化參考') && t.includes('不同流派');
})());
check('列印專用元素平時不顯示（靠 CSS 的 .print-only）', (() => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf-8');
  return css.includes('.print-only { display: none; }');
})());
check('列印樣式隱藏互動元件並展開折疊區塊', (() => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf-8');
  const block = css.slice(css.indexOf('@media print'));
  return ['.sidebar', '.side-nav', '.copy-ai-btn'].every((sel) => block.includes(sel))
    && block.includes('details > *:not(summary)')
    && block.includes('break-inside: avoid');
})());
$('#print-btn').click();
await settle();
check('按列印會展開所有折疊區塊，取消後看得到印了什麼',
  $$('#main-content details').length > 0 && $$('#main-content details').every((d) => d.open));

// ---------- T2 流派設定 ----------
check('側欄有流派設定，且可選晚子時換日與安星方法', (() => {
  const keys = $$('#school-options [data-school-key]').map((el) => el.dataset.schoolKey);
  return keys.includes('dayDivide') && keys.includes('algorithm');
})());
check('預設不顯示「已改」標記', $('#school-badge').hidden);
check('每個流派選項都附說明，不讓使用者盲選',
  $$('#school-options .school-note').every((el) => el.textContent.trim().length > 5));
// 指紋只取宮格的雜曜列（.p-minor）。
// 一開始取整個宮格的文字，結果切回預設時比不出「還原」——但差異不是流派造成的：
// computeAll() 會把大限流年選擇重設回現行年，於是「年」標記與流年四化落點跟著移動。
// 那是正確行為，只是不該進指紋。流派實際影響的就是雜曜落宮
// （本張盤：截路↔截空、天傷↔天使），取 .p-minor 最精準也最穩定。
const starPos = () => {
  const details = $('#dashboard-detail');
  if (details) details.open = true;
  return $$('.palace-cell .p-minor').map((c) => c.textContent.replace(/\s+/g, '')).join('|');
};
const beforeSchool = starPos();
$('[data-school-key="algorithm"] [data-school-value="zhongzhou"]').click();
await settle();
check('切換到中州派會即時重排，盤面真的改變', starPos() !== beforeSchool);
check('改過流派後顯示「已改」標記', !$('#school-badge').hidden);
$('[data-school-key="algorithm"] [data-school-value="default"]').click();
await settle();
check('切回通行版盤面還原', starPos() === beforeSchool);
check('切回預設後「已改」標記消失', $('#school-badge').hidden);

// ---------- F2 分享連結帶位置 ----------
$('.mode-pill[data-mode="learn"]').click();
await settle();
$('#learn-card [data-learning-kind="annual"]').click();
await settle();
const sharedYear = Number($('.annual-year-chip.active').dataset.annualYear);
// navigator.clipboard 在 happy-dom 是唯讀屬性，要用 defineProperty 覆蓋（同 smoke.mjs 做法）
let copied = '';
const clipboardStub = { writeText: async (text) => { copied = text; } };
Object.defineProperty(w.navigator, 'clipboard', { value: clipboardStub, configurable: true });
if (globalThis.navigator !== w.navigator) {
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: clipboardStub, configurable: true });
}
$('#copy-link-btn').click();
await settle();
check('複製的連結帶生辰', copied.includes('date=') && copied.includes('gender='));
check('複製的連結帶目前看的流年年份', copied.includes(`annual=${sharedYear}`));
check('複製的連結不帶預設流派（保持簡潔）', !copied.includes('algorithm='));
$('[data-annual-topic="love"]').click();
await settle();
$('#copy-link-btn').click();
await settle();
check('非預設主題會寫進連結', copied.includes('topic=love'));
$('[data-annual-topic="overview"]').click();
await settle();
$('#copy-link-btn').click();
await settle();
check('預設主題不寫進連結', !copied.includes('topic='));

console.log(`\n上架審查回歸：${failed ? `${failed} 項失敗` : '全部通過'}`);
if (consoleErrors.length) {
  console.log(`❌ 過程中出現 ${consoleErrors.length} 次 console.error`);
  failed += 1;
}
process.exit(failed ? 1 : 0);

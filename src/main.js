import './style.css';
import { composeChartReading } from './engines/compose.js';
import { composeBaZiReading } from './engines/compose-bazi.js';
import { composeElementAnalysis } from './engines/compose-elements.js';
import { composeZiWeiLuck, composeBaZiLuck, tenGodOf } from './engines/compose-luck.js';
import { generatePlainZiweiTopics, generatePlainBaziTopics, generatePlainPalaceCard, generatePlainZiweiTimeCard, generatePlainBaziTimeCard } from './engines/compose-plain.js';
import { generateZiweiComprehensiveReading, generateBaziComprehensiveReading } from './engines/comprehensive.js';
import { formatChartForAI, formatPalacePromptForAI, formatAnnualPromptForAI, formatSynastryPromptForAI, formatNamingPromptForAI, formatDailyPromptForAI, formatTimelinePromptForAI } from './engines/format-ai.js';
import { composeAnnualChange, composeZiWeiAnnualChange, composeZiWeiDecadalChange, composeMonthlyChange, composeZiWeiMonthly, monthlyPillarsOf, computeSelfTransformations, computeLaiyinPalace } from './engines/compose-annual.js';
import { composeYongShenReading, computeYongShen } from './engines/compose-yongshen.js';
import { analyzeNameElements, computeWuGe, analyzeZiweiOverlap, splitSurnameGiven } from './engines/naming.js';
import { composeSynastry } from './engines/compose-synastry.js';
import { castThreeCoins, plumBlossom, qimenStructure, lineDiagram, tiYongAnalysis } from './engines/divination.js';
import { LAYOUT_POSITIONS } from './data/layout-positions.js';
import { palaceMeanings } from './data/palace-meanings.js';
import { lookupTransformation } from './data/transformation-meanings.js';

// 排盤引擎(iztro、lunar-javascript 合計約 700KB)改為動態載入:
// 訪客進站先看到歡迎頁,不需要馬上載排盤庫;第一次按「排盤」時才抓,之後快取重用。
// qrcode / html-to-image 也一樣,只在分享命卡用到時才載。
let enginesPromise = null;
let birthDateCtl = null; // 主表單年/月/日輸入控制器,setupControls() 內建立
function loadEngines() {
  enginesPromise ??= Promise.all([
    import('./engines/ziwei.js'),
    import('./engines/bazi.js'),
    import('lunar-javascript'),
  ]).then(([z, b, l]) => {
    const lunarPkg = l.default ?? l;
    return {
      convertToZiWei: z.convertToZiWei,
      convertToBaZi: b.convertToBaZi,
      Solar: lunarPkg.Solar,
      Lunar: lunarPkg.Lunar,
    };
  });
  return enginesPromise;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flat = (s) => String(s).replace(/\n+/g, ' '); // 多行解讀 → 單段落
const trad = (s) => String(s).replace(/[动开会亲纳采订盟医药猎机械坏垣]/g, (c) => ({ 动:'動', 开:'開', 会:'會', 亲:'親', 纳:'納', 采:'採', 订:'訂', 盟:'盟', 医:'醫', 药:'藥', 猎:'獵', 机:'機', 械:'械', 坏:'壞', 垣:'垣' }[c] ?? c));

// ---------- 出生日期輸入(年/月/日三欄,取代原生 date input——
// 原生 date input 分段輸入時,年份欄位打超過4碼或按方向鍵切換欄位方式不直覺,
// 打錯會讓 .value 變成空字串且畫面完全沒有任何提示,使用者會以為排盤按鈕壞了。
// 改成年份用文字輸入(限4碼數字)+ 月/日用下拉選單,月日下拉的選項本身就排除了不存在的日期組合(如2月30日),
// 只剩年份範圍需要驗證,錯誤時就地顯示原因。) ----------
const daysInMonth = (year, month) => new Date(year || 2001, month, 0).getDate(); // month為1-12;year缺省時用非閏年估算
function fillMonthOptions(sel) {
  sel.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join('');
}
function fillDayOptions(sel, year, month) {
  const max = daysInMonth(year, month || 1);
  const keep = Math.min(Number(sel.value) || 1, max);
  sel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}日</option>`).join('');
  sel.value = keep;
}
/** @returns {{read:()=>({y,m,d}|null), set:(y,m,d)=>void, clearError:()=>void}} */
function wireDateParts({ yearId, monthId, dayId, errorId, nextId = null }) {
  const yearEl = $(yearId), monthEl = $(monthId), dayEl = $(dayId), errEl = $(errorId);
  fillMonthOptions(monthEl);
  fillDayOptions(dayEl, null, 1);
  const clearError = () => { errEl.hidden = true; errEl.textContent = ''; yearEl.classList.remove('field-invalid'); };
  const showError = (msg) => { errEl.hidden = false; errEl.textContent = msg; yearEl.classList.add('field-invalid'); };
  const syncDays = () => fillDayOptions(dayEl, Number(yearEl.value) || null, Number(monthEl.value));
  yearEl.addEventListener('input', () => {
    yearEl.value = yearEl.value.replace(/[^0-9]/g, '').slice(0, 4);
    clearError();
    syncDays();
    const y = Number(yearEl.value);
    if (yearEl.value.length === 4 && y >= 1900 && y <= 2100) monthEl.focus();
  });
  monthEl.addEventListener('change', () => { clearError(); syncDays(); dayEl.focus(); });
  dayEl.addEventListener('change', () => {
    clearError();
    if (nextId) $(nextId)?.focus();
  });
  return {
    read() {
      const yStr = yearEl.value;
      if (!yStr || yStr.length !== 4) { showError('請輸入 4 碼西元年份,例如 1990'); yearEl.focus(); return null; }
      const y = Number(yStr);
      if (y < 1900 || y > 2100) { showError('目前支援 1900–2100 年之間的生日'); yearEl.focus(); return null; }
      clearError();
      return { y, m: Number(monthEl.value), d: Number(dayEl.value) };
    },
    set(y, m, d) {
      yearEl.value = y ? String(y) : '';
      monthEl.value = String(m || 1);
      // 先選月份再重建日期選項。部分 DOM／行動瀏覽器在日期選項先更新時，
      // 後續設定月份會把兩個 select 的選取狀態清空。
      fillDayOptions(dayEl, y, m || 1);
      dayEl.value = String(d || 1);
      clearError();
    },
    clearError,
  };
}

/** 按鈕 loading 狀態:計算期間停用按鈕並換字樣,避免使用者以為沒反應而重複點擊 */
async function withLoading(btn, loadingLabel, fn) {
  if (!btn) return fn();
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingLabel;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- 常數 ----------
const EL_COLOR = { 木: 'var(--el-wood)', 火: 'var(--el-fire)', 土: 'var(--el-earth)', 金: 'var(--el-metal)', 水: 'var(--el-water)' };
const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const BRANCH_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const EL_KEY = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

/**
 * 五行分佈雷達圖(SVG,不依賴外部套件):五個軸對應木火土金水,
 * 描出分佈輪廓,取代單純的橫條——雷達圖的「形狀」比長度更能一眼看出偏旺/偏弱的整體平衡感。
 */
function fiveElementRadarSVG(distribution) {
  const order = ['wood', 'fire', 'earth', 'metal', 'water'];
  const size = 168; const cx = size / 2; const cy = size / 2; const maxR = 58;
  const maxVal = Math.max(4, ...order.map((k) => distribution[k] ?? 0));
  const angleFor = (i) => -Math.PI / 2 + i * (2 * Math.PI / 5);
  const ptAt = (i, r) => [cx + r * Math.cos(angleFor(i)), cy + r * Math.sin(angleFor(i))];
  const rings = [0.34, 0.67, 1].map((f) =>
    `<polygon points="${order.map((_, i) => ptAt(i, maxR * f).join(',')).join(' ')}" fill="none" style="stroke:rgba(43,38,33,.14)" stroke-width="1"/>`,
  ).join('');
  const axes = order.map((k, i) => {
    const [x, y] = ptAt(i, maxR);
    const [lx, ly] = ptAt(i, maxR + 16);
    const el = EL_KEY[k];
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:rgba(43,38,33,.16)" stroke-width="1"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" style="fill:${EL_COLOR[el]}">${el}</text>`;
  }).join('');
  const dataPts = order.map((k, i) => ptAt(i, maxR * Math.min(1, (distribution[k] ?? 0) / maxVal)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const dots = order.map((k, i) => {
    const r = maxR * Math.min(1, (distribution[k] ?? 0) / maxVal);
    const [x, y] = ptAt(i, r);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" style="fill:${EL_COLOR[EL_KEY[k]]}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="el-radar" role="img" aria-label="五行分佈雷達圖">
    ${rings}
    ${axes}
    <polygon points="${dataPts}" style="fill:var(--red);fill-opacity:.16;stroke:var(--red)" stroke-width="1.6"/>
    ${dots}
  </svg>`;
}
const SHICHEN = [
  { name: '子時', hour: 0, label: '子時（23–1）' }, { name: '丑時', hour: 1, label: '丑時（1–3）' },
  { name: '寅時', hour: 3, label: '寅時（3–5）' }, { name: '卯時', hour: 5, label: '卯時（5–7）' },
  { name: '辰時', hour: 7, label: '辰時（7–9）' }, { name: '巳時', hour: 9, label: '巳時（9–11）' },
  { name: '午時', hour: 11, label: '午時（11–13）' }, { name: '未時', hour: 13, label: '未時（13–15）' },
  { name: '申時', hour: 15, label: '申時（15–17）' }, { name: '酉時', hour: 17, label: '酉時（17–19）' },
  { name: '戌時', hour: 19, label: '戌時（19–21）' }, { name: '亥時', hour: 21, label: '亥時（21–23）' },
];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];

// ---------- 狀態 ----------
const state = {
  view: 'dashboard',
  reportTab: 'ziwei',
  chartTab: 'ziwei', // 手機版:命盤總覽一次只顯示一張卡
  cal: 'solar',
  gender: 'female',
  readingMode: 'public', // 'public'(大眾版,預設)| 'study'(學習版):控制解讀文字要不要附上亮度/四化/十神/五行的完整依據
  selectedPalace: '命宮',
  limitIdx: 0,
  yearIdx: 0,
  expandedZiwei: ['ming'], // 重點解讀:白話摘要卡片各自獨立展開/收合,用陣列存已展開的 key(可同時展開多張)
  expandedBazi: ['zhu'],
  // 重點解讀頁的「白話摘要／專業依據」切換:紫微/八字分頁各自獨立記住自己的模式,
  // 跟命盤總覽/深度解析共用的 state.readingMode 分開,互不影響(見 currentReadingMode()/setReadingMode())
  reportViewMode: { ziwei: 'public', bazi: 'public' }, // 沿用跟 readingMode 一樣的值域('public'/'study'),對應按鈕 data-mode
  // 深度解析(綜合報告)裡,地支關係/神煞屬於補充細節,預設收合,點開才展開(避免資訊量過載);
  // 用 Set 存已展開的段落標題,彼此獨立(可同時展開兩個),跟主要 4 段區隔開來
  expandedComprehensiveDetails: new Set(),
  topicKey: 'love',
  topicQuestion: 0,
  // 命盤總覽會在切換宮位、大限、流年與流月時整區重繪；原生 details 若不另存狀態，
  // 每次重繪都會回到預設收合。集中保存所有總覽折疊狀態，讓內部互動不再把使用者彈出去。
  dashboardOpenDetails: new Set(),
  // 雙人合盤:乙方表單值、關係型態與已排好的乙方命盤
  synastry: { form: { name: '', date: '', hour: '0', gender: 'female', rel: '戀人' }, b: null },
  monthIdx: null, // 流月瀏覽(null = 未展開)
  shareCard: 'life', // 分享命卡:'life' 本命卡 | 'annual' 流年卡
  compareSelected: new Set(), // 命盤比對:目前勾選的已存命盤 index
  naming: { surname: '', given: '' }, // 姓名學:姓/名輸入值(獨立分頁,不依賴目前命盤)
  metaphysicsTab: 'daily',
  metaGuideExpanded: false, // 進階玄學「不知道從哪開始」導覽卡:預設只顯示今天適合的幾個,其餘收合
  data: null, // { name, input, ziWei, baZi, readings, elements, zwLuck, bzLuck, tenGods, byBranch }
};

// ---------- 排盤 ----------
async function computeAll() {
  const parsed = birthDateCtl?.read();
  if (!parsed) return false; // 錯誤原因已由 birthDateCtl 就地顯示在欄位下方
  try {
    return await computeAllInner(parsed);
  } catch (err) {
    console.error('computeAll 失敗:', err);
    toast('排盤時發生錯誤，請確認出生資料後再試一次；若重複發生請回報這組生辰資料。');
    return false;
  }
}

async function computeAllInner(parsed) {
  const { convertToZiWei, convertToBaZi, Solar, Lunar } = await loadEngines();
  const name = $('#name-input').value.trim() || '命主';
  // 「不確定時辰」:以午時(11時)暫排,並在畫面明確標示僅供參考
  const hourRaw = $('#birth-hour').value;
  const hourUnknown = hourRaw === 'unknown';
  let { y, m, d } = parsed;
  // 日期合法性驗證:月/日下拉的選項本身已排除不存在的組合,但分享連結的 ?date= 參數是直接塞值進欄位,
  // 仍可能帶入不存在的日期(例如 1949-02-29),引擎不會報錯、會靜默排出錯的盤,這裡再保險檢查一次
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    toast('這個日期不存在,請重新選擇');
    return false;
  }
  const hour = hourUnknown ? 11 : Number(hourRaw);
  if (state.cal === 'lunar') {
    const solar = Lunar.fromYmd(y, m, d).getSolar();
    [y, m, d] = [solar.getYear(), solar.getMonth(), solar.getDay()];
  }
  const input = { year: y, month: m, day: d, hour, gender: state.gender };

  const ziWei = convertToZiWei(input);
  const baZi = convertToBaZi(input);
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));

  // 頁首的農曆日期字串在這裡先算好(renderHead 不再依賴 lunar 套件,方便動態載入)
  const lunarDate = Solar.fromYmd(y, m, d).getLunar();
  const lunarDateStr = `${lunarDate.getMonthInChinese()}月${lunarDate.getDayInChinese()}`;

  state.data = {
    name, input, ziWei, baZi, byBranch, lunarDateStr, hourUnknown,
    elements: composeElementAnalysis(baZi.fiveElementDistribution), // 兩版本共用同一份,顯示時再依mode選summary/text
  };
  state.monthIdx = null;
  state.dashboardOpenDetails.clear();
  state.shareCard = 'life';
  // 姓名學分頁帶入目前排盤的姓名(使用者若在姓名學頁另外手動改過,下次重新排盤/切換命盤時仍會被目前這筆姓名蓋過——
  // 這是預期行為,「帶入」的意思就是跟著目前排盤的人走)
  state.naming = splitSurnameGiven(name);
  applyReadingMode();

  // 預設選中「現行」大限與流年
  const nowYear = new Date().getFullYear();
  const nominalAge = nowYear - y + 1; // 虛歲
  state.limitIdx = Math.max(0, ziWei.majorLimits.findIndex((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return nominalAge >= a && nominalAge <= b;
  }));
  const startAge = Number(ziWei.majorLimits[state.limitIdx].ageRange.split('~')[0]);
  state.yearIdx = Math.min(9, Math.max(0, nowYear - (y + startAge - 1)));
  state.selectedPalace = '命宮';
  return true;
}

// 依目前 state.readingMode 重新組裝所有「會受大眾版/學習版影響」的解讀資料。
// 排盤完成後呼叫一次;之後使用者切換大眾版/學習版開關時,不用重新排盤,只要重跑這個函式再重繪畫面。
function applyReadingMode() {
  const { ziWei, baZi } = state.data;
  const mode = state.readingMode;
  Object.assign(state.data, {
    readings: composeChartReading(ziWei, { mode }),
    zwLuck: composeZiWeiLuck(ziWei, { mode }),
    bzLuck: composeBaZiLuck(baZi, { mode }),
    tenGods: composeBaZiReading(baZi, { mode }),
  });
}

const readingOf = (palaceName) =>
  state.data.readings.palaces.find((p) => p.palaceName === palaceName);

// ---------- 頁首「白話摘要／專業依據」切換的模式讀寫 ----------
// 命盤總覽、深度解析沒有紫微/八字分頁的概念(兩套資料同時呈現在同一頁),沿用原本單一的
// state.readingMode;重點解讀有紫微斗數/八字兩個分頁,各自需要記住自己選的是白話還是專業,
// 所以另外用 state.reportViewMode 分開存,由這兩個函式決定「現在這顆按鈕實際在改哪個值」。
function currentReadingMode() {
  return state.view === 'report' ? state.reportViewMode[state.reportTab] : state.readingMode;
}
function setReadingMode(mode) {
  if (state.view === 'report') state.reportViewMode[state.reportTab] = mode;
  else state.readingMode = mode;
}
/** 依目前頁面/分頁決定的模式,同步「白話摘要／專業依據」按鈕的 active 樣式與無障礙屬性 */
function syncModeToggleUI() {
  const mode = currentReadingMode();
  $('#reading-mode-toggle').hidden = state.view !== 'report';
  $$('#reading-mode-toggle .mode-pill').forEach((p) => {
    const active = p.dataset.mode === mode;
    p.classList.toggle('active', active);
    p.setAttribute('aria-pressed', String(active));
  });
  $('#reading-mode-toggle').setAttribute('aria-controls', `view-${state.view}`);
}

/** 大限流年瀏覽目前選中的大限與西元年(命盤高亮、四化、提示詞共用) */
function currentLuckSelection() {
  const { ziWei, input } = state.data;
  const limit = ziWei.majorLimits[state.limitIdx];
  const startAge = Number(limit.ageRange.split('~')[0]);
  return { limit, year: input.year + startAge + state.yearIdx - 1 };
}

// ---------- 命盤收藏(localStorage) ----------
const SAVED_KEY = 'zwbz-saved-charts';

function loadSavedCharts() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? []; } catch { return []; }
}
function persistSavedCharts(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* 無痕模式等 */ }
}

/** 從已存命盤載入一筆(側欄清單、流年提醒卡共用):填回表單值 → 排盤 → 重繪畫面 */
async function loadSavedEntry(c) {
  $('#name-input').value = c.name;
  const [cy, cm, cd] = c.date.split('-').map(Number);
  birthDateCtl.set(cy, cm, cd);
  $('#birth-hour').value = String(c.hour); // 'unknown' 也直接對應到「不確定時辰」選項
  state.gender = c.gender;
  $$('#gender-toggle .pill').forEach((p) => p.classList.toggle('active', p.dataset.value === c.gender));
  state.cal = c.cal ?? 'solar';
  $$('#cal-toggle .pill').forEach((p) => p.classList.toggle('active', p.dataset.value === state.cal));
  if (await computeAll()) renderAll();
}

function renderSavedList() {
  const list = loadSavedCharts();
  $('#saved-section').hidden = list.length === 0;
  // 合盤頁的「從已存命盤帶入」列表、命盤比對頁的勾選清單與側欄收藏同步
  if (state.data) { renderSynastry(); renderCompare(); }
  $('#saved-list').innerHTML = list.map((c, i) => `
    <div class="saved-chip" data-load="${i}">
      <span class="saved-name">${esc(c.name)}</span>
      <span class="saved-meta">${esc(c.date)}</span>
      <button type="button" class="saved-del" data-del="${i}" title="刪除" aria-label="刪除這筆命盤">×</button>
    </div>`).join('');

  $$('#saved-list [data-load]').forEach((chip) =>
    chip.addEventListener('click', async (e) => {
      if (e.target.closest('[data-del]')) return;
      const c = loadSavedCharts()[Number(chip.dataset.load)];
      if (c) await loadSavedEntry(c);
    }));
  $$('#saved-list [data-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const list2 = loadSavedCharts();
      list2.splice(Number(btn.dataset.del), 1);
      persistSavedCharts(list2);
      renderSavedList();
    }));
}

// 匯出/匯入收藏(localStorage 不跨裝置,提供 JSON 檔搬家)
function exportSavedCharts() {
  const list = loadSavedCharts();
  if (!list.length) return toast('目前沒有已存的命盤');
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '命盤收藏.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`已匯出 ${list.length} 筆命盤`);
}

function importSavedCharts(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error('格式錯誤');
      const valid = incoming.filter((c) => c && c.name && c.date && c.gender && c.hour !== undefined);
      const list = loadSavedCharts();
      let added = 0;
      for (const c of valid) {
        if (!list.some((x) => x.date === c.date && x.hour === c.hour && x.gender === c.gender)) {
          list.push({ name: String(c.name), date: c.date, hour: c.hour, gender: c.gender, cal: 'solar' });
          added++;
        }
      }
      persistSavedCharts(list);
      renderSavedList();
      toast(added ? `已匯入 ${added} 筆命盤` : '沒有新的命盤(皆已存在)');
    } catch { toast('匯入失敗:檔案格式不正確'); }
  };
  reader.readAsText(file);
}

function saveCurrentChart() {
  if (!state.data) return;
  const { name, input } = state.data;
  const entry = {
    name,
    date: `${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`,
    hour: state.data.hourUnknown ? 'unknown' : input.hour, // 時辰未知照實記錄,載入時維持「不確定」
    gender: input.gender,
    cal: 'solar', // computeAll 已把農曆轉成陽曆,存陽曆版本最不易混淆
  };
  const list = loadSavedCharts().filter((c) =>
    !(c.date === entry.date && c.hour === entry.hour && c.gender === entry.gender));
  list.unshift(entry);
  persistSavedCharts(list);
  renderSavedList();
  toast(`已儲存「${name}」的命盤`);
}

// ---------- 頁首 ----------
function renderHead() {
  const { name, input, ziWei, baZi, lunarDateStr } = state.data;
  $('#page-title').textContent = `${name}　的命盤`;
  $('#copy-ai-btn').hidden = false;
  $('#reading-mode-toggle').hidden = false;
  syncModeToggleUI();
  $('#save-chart-btn').hidden = false;
  const shichen = SHICHEN.find((s) => s.hour === input.hour);
  const shichenLabel = state.data.hourUnknown ? '時辰未知(暫以午時排)' : shichen.name;
  $('#birth-summary').textContent =
    `${baZi.fourPillars.yearPillar.stem}${baZi.fourPillars.yearPillar.branch}年` +
    `${lunarDateStr}　${shichenLabel}　` +
    `${input.gender === 'female' ? '女' : '男'}　${ziWei.fiveElementBureau}`;
  $('#chart-profile').hidden = false;
  $('#chart-profile-text').textContent =
    `${name}｜${input.year}/${input.month}/${input.day}｜${shichenLabel}｜${input.gender === 'female' ? '女' : '男'}`;
}

function elementPlainSummary(elements) {
  const dominant = elements.dominant ?? [];
  if (!dominant.length) return '整體節奏較均衡';
  const meanings = {
    木: '重視成長與向前推進',
    火: '行動與表達較直接',
    土: '重視穩定與可預期感',
    金: '判斷與界線感較清楚',
    水: '感受與資訊接收較敏銳',
  };
  return dominant.slice(0, 2).map((el) => meanings[el] ?? `${el}的傾向較明顯`).join('，');
}

function renderResultSummary() {
  const { ziWei, baZi, elements } = state.data;
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  const mainStars = life.majorStars.map((s) => s.name).join('・') || '空宮（參考對宮）';
  const fp = baZi.fourPillars;
  const dayMaster = `${fp.dayPillar.stem}${STEM_EL[fp.dayPillar.stem]}`;
  const { limit, year } = currentLuckSelection();
  const focus = state.data.byBranch[limit.ganZhi[1]]?.name ?? '—';
  const focusPlain = palaceMeanings[focus] ?? focus;
  return `<section class="card result-home" aria-labelledby="summary-title">
    <div class="result-home-kicker">你的個人重點首頁</div>
    <h2 id="summary-title">先從看得懂、用得上的內容開始</h2>
    <p class="result-home-lead">不需要先研究宮位或五行。你可以看近期重點、選一個生活問題，或再進入完整命盤。</p>
    <div class="result-summary">
      <div class="summary-item"><div class="summary-label">命宮主星</div><div class="summary-value">${esc(mainStars)}</div></div>
      <div class="summary-item"><div class="summary-label">八字日主</div><div class="summary-value">${esc(dayMaster)}</div></div>
      <div class="summary-item summary-item--plain"><div class="summary-label">你較明顯的節奏</div><div class="summary-value">${esc(elementPlainSummary(elements))}</div><small>專業資料可在完整命盤查看</small></div>
      <div class="summary-item summary-item--plain"><div class="summary-label">${esc(year)} 年重點</div><div class="summary-value">${esc(focusPlain)}</div><small>目前落在${esc(focus)}</small></div>
    </div>
    <div class="result-paths" aria-label="選擇下一步">
      <button type="button" class="result-path result-path--primary" data-result-goto="report"><span>01・先看現在</span><b>目前最值得注意什麼？</b><small>近期重點、可能挑戰與行動建議</small></button>
      <button type="button" class="result-path" data-result-goto="topics"><span>02・問生活問題</span><b>從愛情、工作或財運開始</b><small>選一題，直接閱讀紫微與八字的綜合回答</small></button>
      <button type="button" class="result-path result-path--quiet" data-result-goto="dashboard-detail"><span>03・研究資料</span><b>查看完整紫微與八字命盤</b><small>適合想研究宮位、星曜、四柱與流年的使用者</small></button>
    </div>
  </section>`;
}

// ---------- 分頁一:命盤總覽 ----------
function elDot(char, isDay) {
  const el = STEM_EL[char] ?? BRANCH_EL[char];
  const textColor = isDay ? 'var(--cream)' : EL_COLOR[el];
  return `<div class="bz-el"><span class="dot" style="background:${EL_COLOR[el]}"></span><span style="color:${textColor}">${el}</span></div>`;
}

const MUT_CLASS = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };

function renderZiWeiCard() {
  const { ziWei, name } = state.data;

  // 盤面連動:大限宮位、流年命宮、流年四化落點、所選宮位的三方四正
  const { limit, year } = currentLuckSelection();
  const decadalBranch = limit.ganZhi[1];
  const annualBranch = yearGanZhi(year)[1];
  const sihuaByPalace = {};
  for (const e of composeZiWeiAnnualChange(ziWei, year).entries) {
    (sihuaByPalace[e.palace] ??= []).push(e.mutagen);
  }
  const selBranch = ziWei.palaces.find((p) => p.name === state.selectedPalace)?.position[1];
  const relatedBranches = new Set(
    selBranch ? [4, 6, 8].map((off) => BRANCHES[(BRANCHES.indexOf(selBranch) + off) % 12]) : [],
  );

  const cells = ziWei.palaces.map((p) => {
    const branch = p.position[1];
    const pos = LAYOUT_POSITIONS[branch];
    const stars = p.majorStars.map((s) => s.name + (s.transformation ? `<sup title="生年化${s.transformation}：${esc(lookupTransformation(s.transformation) ?? '')}">${s.transformation}</sup>` : '')).join('');
    const cls = [
      'palace-cell',
      p.name === '命宮' ? 'self' : '',
      p.name === state.selectedPalace ? 'selected' : '',
      branch === decadalBranch ? 'decadal-palace' : '',
      branch === annualBranch ? 'annual-palace' : '',
      relatedBranches.has(branch) ? 'related' : '',
    ].join(' ');
    const luckTags = [
      branch === decadalBranch ? `<span class="luck-tag decadal" title="目前所在的十年大限落在這一宮">限</span>` : '',
      branch === annualBranch ? `<span class="luck-tag annual" title="${year} 年(流年)命宮落在這一宮">年</span>` : '',
    ].join('');
    const mutMarks = (sihuaByPalace[p.name] ?? [])
      .map((m) => `<span class="flow-mut ${MUT_CLASS[m]}" title="${year}年流年化${m}：${esc(lookupTransformation(m) ?? '')}">${m}</span>`).join('');
    const elAccent = EL_COLOR[BRANCH_EL[branch]];
    return `<button type="button" class="${cls}" data-palace="${esc(p.name)}"
      style="grid-row:${pos.row};grid-column:${pos.col};border-left-color:${elAccent}">
      <div class="p-name">${esc(p.name)} ${esc(branch)}${p.isBodyPalace ? `<span class="body-mark" title="身宮:與命宮並列,影響後天際遇與行為傾向">・身</span>` : ''}${luckTags}</div>
      <div class="p-stars">${stars || ''}${mutMarks}</div>
      <div class="p-minor">${p.minorStars.slice(0, 4).map((s) => esc(s.replace(/\(.*?\)/, ''))).join(' ')}</div>
    </button>`;
  }).join('');

  return `<div class="card ziwei-card">
    <div class="card-label">紫微斗數・命盤</div>
    <div class="chart-frame"><div class="chart-grid">
      ${cells}
      <div class="chart-center">
        <div class="c-name">${esc(name)}</div>
        <div class="c-meta">命主：${esc(state.data.ziWei.lifeMaster)}　身主：${esc(state.data.ziWei.bodyMaster)}<br>${esc(state.data.ziWei.fiveElementBureau)}</div>
      </div>
    </div></div>
    <div class="chart-legend">限＝所選大限宮位　年＝${year} 流年命宮　祿權科忌＝${year} 流年四化落點　虛線框＝所選宮位的三方四正</div>
  </div>`;
}

function renderBaZiCard() {
  const { baZi, elements } = state.data;
  const fp = baZi.fourPillars;
  const keys = ['year', 'month', 'day', 'hour'];
  const heads = ['年柱', '月柱', '日柱', '時柱'].map((t) => `<div class="bz-head">${t}</div>`).join('');
  const gods = keys.map((k) => {
    const god = baZi.tenGods[`${k}Stem`];
    return `<div class="bz-god${god === '日主' ? ' day-master' : ''}">${esc(god)}</div>`;
  }).join('');
  const stems = keys.map((k) => {
    const isDay = k === 'day';
    const c = fp[`${k}Pillar`].stem;
    return `<div class="bz-char${isDay ? ' day-master' : ''}">${esc(c)}${elDot(c, isDay)}</div>`;
  }).join('');
  const branches = keys.map((k) => {
    const c = fp[`${k}Pillar`].branch;
    return `<div class="bz-char" style="margin-top:-3px">${esc(c)}${elDot(c, false)}</div>`;
  }).join('');
  const hidden = keys.map((k) => {
    const hs = baZi.hiddenStems[`${k}Branch`].map((x) => x.split('-')[0]).join('');
    return `<div class="bz-sub">藏干 ${esc(hs)}</div>`;
  }).join('');
  const nayin = keys.map((k) => `<div class="bz-nayin">${esc(baZi.pillarDetails[`${k}Pillar`].nayin)}</div>`).join('');

  const total = Object.values(baZi.fiveElementDistribution).reduce((a, b) => a + b, 0);
  const legend = Object.entries(baZi.fiveElementDistribution).map(([key, count]) => {
    const el = EL_KEY[key];
    return `<div class="el-legend-item"><span class="dot" style="background:${EL_COLOR[el]}"></span><span style="color:${EL_COLOR[el]}">${el}</span><b>${count}</b></div>`;
  }).join('');
  const note = `${elements.dominant.join('、')}偏旺,${elements.weak.join('、')}偏弱,可透過後天培養補強平衡。`;

  return `<div class="card bazi-card">
    <div class="card-label">八字・四柱</div>
    <div class="bazi-grid">${heads}${gods}${stems}${branches}${hidden}${nayin}</div>
    <div class="el-bars">
      <div class="bars-label">四柱五行分布（共 ${total} 字）</div>
      <div class="el-radar-hint">圖形頂點離中心越遠，代表這個五行的字數越多；實際數字看右邊圖例。</div>
      <div class="el-radar-wrap">
        ${fiveElementRadarSVG(baZi.fiveElementDistribution)}
        <div class="el-legend">${legend}</div>
      </div>
      <div class="el-note">${esc(note)}</div>
    </div>
  </div>`;
}

function renderClassroom() {
  const { byBranch } = state.data;
  const palace = state.data.ziWei.palaces.find((p) => p.name === state.selectedPalace);
  const branch = palace.position[1];
  const opposite = byBranch[BRANCHES[(BRANCHES.indexOf(branch) + 6) % 12]];
  const stars = palace.majorStars.length
    ? palace.majorStars.map((s) => s.name).join('・')
    : `（無主星，借對宮${opposite.name}）`;

  // 學習版:附上飛星資訊(自化與來因宮,已用文墨天機命盤交叉驗證)
  let advancedLine = '';
  if (state.readingMode === 'study') {
    const selfT = computeSelfTransformations(state.data.ziWei).find((r) => r.palaceName === state.selectedPalace);
    const laiyin = computeLaiyinPalace(state.data.ziWei);
    const parts = [];
    if (selfT) {
      parts.push([
        ...selfT.outgoing.map((x) => `${x.star}↓${x.mutagen}(離心自化,能量向外流)`),
        ...selfT.incoming.map((x) => `${x.star}↑${x.mutagen}(向心自化,由對宮化入)`),
      ].join('、'));
    }
    if (laiyin?.palaceName === state.selectedPalace) parts.push('此宮為來因宮(生年天干所落之宮,一生課題的起點)');
    if (parts.length) {
      advancedLine = `<div class="tech-block"><b>飛星資訊</b><p>${esc(parts.join(';'))}</p></div>`;
    }
  }

  // 命盤總覽偏向「查資料」,不放完整7段式人生分析(那是重點解讀/深度解析的事)——
  // 只取白話卡片裡最前面兩層:一句話重點 + 簡短解釋,專業資料則完整列出(這裡本來就是給想看細節的人用的)
  const card = generatePlainPalaceCard(state.data.ziWei, state.selectedPalace);
  const explanationHtml = card.explanation.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('');

  return `<div class="card" id="classroom-card">
    <div class="classroom-head">
      <div class="round-icon">宮</div>
      <div class="classroom-title">${esc(state.selectedPalace)}　<small>地支：${esc(branch)}</small></div>
      <button type="button" class="mini-btn" id="copy-palace-prompt">複製此宮位 AI 提示詞</button>
    </div>
    <div class="classroom-hint">點選左側命盤十二宮，可切換查看不同宮位的說明 — 這是命盤小教室</div>
    <div class="classroom-body palace-brief">
      <div class="palace-topic">${esc(palaceMeanings[state.selectedPalace] ?? '')}</div>
      <p class="palace-takeaway">${esc(card.summary)}</p>
      <div class="palace-explain">${explanationHtml}</div>
      <details class="palace-technical" data-dashboard-detail="classroom-technical"${state.dashboardOpenDetails.has('classroom-technical') ? ' open' : ''}>
        <summary>專業資料</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>星曜</b><p>${esc(stars)}</p></div>
          <div class="tech-block"><b>命盤資料</b><p>${esc(card.technical.chartData)}</p></div>
          <div class="tech-block"><b>專業判斷</b><p>${esc(card.technical.judgment)}</p></div>
          ${advancedLine}
        </div>
      </details>
    </div>
  </div>`;
}

/**
 * 依「選定年份」而不是目前年齡建立生活語境。
 * 周歲在生日當年前後會差一歲，因此畫面以「約」標示；虛歲仍保留給大限定位。
 */
function lifeStageForYear(input, year) {
  const age = year - Number(input.year);
  if (age <= 5) return { age, key: 'early-childhood', label: '幼兒成長期', focus: '照護、安全感、作息、探索與家庭互動' };
  if (age <= 11) return { age, key: 'childhood', label: '兒童學習期', focus: '學習習慣、同儕、家庭支持與身心發展' };
  if (age <= 17) return { age, key: 'teen', label: '青少年求學期', focus: '學業、同儕、自我探索、家庭與師長互動' };
  if (age <= 24) return { age, key: 'transition', label: '升學／初入社會轉銜期', focus: '學業、實習、初入職場、人際與方向探索' };
  if (age <= 39) return { age, key: 'adult', label: '成年發展期', focus: '工作、關係、財務獨立與生活選擇' };
  if (age <= 59) return { age, key: 'midlife', label: '中年整合期', focus: '責任調整、家庭、工作節奏與長期生活品質' };
  if (age <= 74) return { age, key: 'later-transition', label: '退休轉銜／熟齡期', focus: '生活重心轉換、健康、家庭、社群參與與資源安排' };
  if (age <= 89) return { age, key: 'later-life', label: '高齡生活期', focus: '健康維持、生活自主、家人互動、陪伴與資源協調' };
  return { age, key: 'advanced-age', label: '超高齡生活期', focus: '照護品質、生活舒適、安全、陪伴、家人與支持系統' };
}

function adaptToLifeStage(text, stage) {
  if (!text) return '';
  let value = String(text);
  if (['early-childhood', 'childhood', 'teen'].includes(stage.key)) {
    value = value
      .replace(/職場/g, '校園與團體')
      .replace(/工作環境/g, '學習環境')
      .replace(/工作/g, '學業與成長任務')
      .replace(/事業/g, '學習方向與未來探索')
      .replace(/主管|上司/g, '師長或主要照顧者')
      .replace(/同事/g, '同學與同儕')
      .replace(/收入|賺錢/g, '資源與金錢觀念');
  } else if (stage.key === 'transition') {
    value = value
      .replace(/工作環境/g, '學校、實習或初入職場的環境')
      .replace(/職場/g, '學校、實習或初入職場')
      .replace(/事業/g, '升學與職涯起步')
      .replace(/工作/g, '學業、實習或工作');
  } else if (stage.key === 'later-transition') {
    value = value
      .replace(/職場/g, '仍參與的工作、社群或家庭事務')
      .replace(/事業/g, '生活重心與仍想投入的事務')
      .replace(/工作/g, '工作、社群參與或日常安排');
  } else if (stage.key === 'later-life' || stage.key === 'advanced-age') {
    value = value
      .replace(/職場|工作環境/g, '日常生活與支持系統')
      .replace(/事業|職涯/g, '生活重心')
      .replace(/工作/g, '日常安排、家庭事務或社群參與')
      .replace(/主管|上司|同事/g, '家人、照護者或經常互動的人')
      .replace(/收入|賺錢/g, '生活資源與財務安排');
  }
  return value;
}

function renderLuckBrowser() {
  const { ziWei, input } = state.data;
  const limits = ziWei.majorLimits;
  const limit = limits[state.limitIdx];
  const [startAge] = limit.ageRange.split('~').map(Number);

  // 「現在」是哪個大限、哪一年——用來在一排 chips 裡標出「現在」徽章,
  // 跟使用者點選瀏覽的「選取中」區分開,避免切換幾次後忘記自己現在實際在哪個階段
  const nowYear = new Date().getFullYear();
  const nominalAge = nowYear - input.year + 1;
  const nowLimitIdx = limits.findIndex((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return nominalAge >= a && nominalAge <= b;
  });
  const nowYearIdxInThisLimit = state.limitIdx === nowLimitIdx ? nominalAge - startAge : -1;

  const limitChips = limits.map((l, i) => {
    const palaceName = state.data.byBranch[l.ganZhi[1]].name;
    const isNow = i === nowLimitIdx;
    return `<button type="button" class="chip wide${i === state.limitIdx ? ' active' : ''}${isNow ? ' is-now' : ''}" data-limit="${i}">
      ${isNow ? '<span class="now-badge">現在</span>' : ''}${esc(l.ageRange.replace('~', '–'))}<br><small>${esc(palaceName)}</small></button>`;
  }).join('');

  const years = Array.from({ length: 10 }, (_, i) => {
    const age = startAge + i;
    const year = input.year + age - 1; // 虛歲 → 西元年
    return { i, age, year, gz: yearGanZhi(year) };
  });
  const yearChips = years.map((yy) => {
    const isNow = yy.i === nowYearIdxInThisLimit;
    return `<button type="button" class="chip${yy.i === state.yearIdx ? ' active' : ''}${isNow ? ' is-now' : ''}" data-year="${yy.i}">
      ${isNow ? '<span class="now-badge">今年</span>' : ''}${yy.year}<br><small>${esc(yy.gz)}</small></button>`;
  }).join('');

  const sel = years[state.yearIdx];
  const daxianPalace = state.data.byBranch[limit.ganZhi[1]].name;
  const liunianPalace = state.data.byBranch[sel.gz[1]].name;

  // 白話短版:年度一句話重點 + 有利方向/需要留意,紫微跟八字各自的完整依據收在「專業運勢依據」裡分開標示
  // (沿用 compose-plain.js 既有的時間卡片生成邏輯,不重算任何排盤或四化十神資料,只是換一組 age/year 參數)
  const zwCard = generatePlainZiweiTimeCard(state.data.ziWei, { age: sel.age, year: sel.year });
  const bzCard = generatePlainBaziTimeCard(state.data.baZi, { year: sel.year });
  const lifeStage = lifeStageForYear(input, sel.year);
  const dedupe = (arr, n) => [...new Set(arr.filter(Boolean))].slice(0, n);
  const favorable = dedupe([...(zwCard.advice ?? []), ...(bzCard.advice ?? [])], 4).map((t) => adaptToLifeStage(t, lifeStage));
  const cautions = dedupe([...(zwCard.challenges ?? []), ...(bzCard.challenges ?? [])], 3).map((t) => adaptToLifeStage(t, lifeStage));
  const themeList = (title, items) => items.length
    ? `<div class="analysis-card__section"><div class="analysis-card__section-title">${esc(title)}</div><ul class="analysis-card__list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`
    : '';

  return `<div class="card">
    <div class="card-label">大限・流年</div>
    <div class="card-hint">先選十年大限，再選其中某一年，逐年查看這一年的重點——這裡可自由切換任何年份，跟「重點解讀」固定顯示現在的摘要不同。</div>
    <div class="chip-label">大限（十年）</div>
    <div class="chip-row">${limitChips}</div>
    <div class="chip-label">流年（${esc(limit.ageRange.replace('~', '–'))} 歲・${esc(daxianPalace)}大限）</div>
    <div class="chip-row">${yearChips}</div>
    <div class="luck-detail">
      <div class="luck-year">${sel.year} 年　${esc(sel.gz)}　${sel.age} 歲
        <button type="button" class="mini-btn" id="copy-annual-prompt">複製此流年 AI 提示詞</button>
      </div>
      <div class="life-stage-note"><b>${esc(lifeStage.label)}</b><span>該年度約 ${lifeStage.age} 歲；主要關注${esc(lifeStage.focus)}。</span></div>
      <p class="palace-takeaway">${esc(adaptToLifeStage(zwCard.summary, lifeStage))}</p>
      <p class="palace-explain" style="margin:0 0 4px">${esc(adaptToLifeStage(bzCard.summary, lifeStage))}</p>
      ${themeList('有利方向', favorable)}
      ${themeList('需要留意', cautions)}
      <details class="palace-technical" data-dashboard-detail="annual-technical"${state.dashboardOpenDetails.has('annual-technical') ? ' open' : ''}>
        <summary>專業運勢依據</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>紫微(大限重心：${esc(daxianPalace)}／流年命宮：${esc(liunianPalace)})</b><p>${esc(zwCard.technical.judgment)}</p></div>
          <div class="tech-block"><b>八字</b><p>${esc(bzCard.technical.judgment)}</p></div>
        </div>
      </details>
      ${renderMonthlyBrowser(sel.year)}
    </div>
  </div>`;
}

/** 流月瀏覽(八字):選定年份內逐月查看變動,預設收合 */
function renderMonthlyBrowser(year) {
  if (state.monthIdx === null) {
    return `<button type="button" class="mini-btn" id="open-monthly" style="align-self:flex-start;margin-left:0">＋ 展開 ${year} 逐月變動(八字流月)</button>`;
  }
  const monthly = monthlyPillarsOf(year);
  const chips = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const gz = monthly[String(m).padStart(2, '0')];
    return `<button type="button" class="chip${i === state.monthIdx ? ' active' : ''}" data-month="${i}">${m}月<br><small>${esc(gz)}</small></button>`;
  }).join('');
  const m = state.monthIdx + 1;
  const detail = composeMonthlyChange(state.data.baZi, year, m, { mode: 'study' });
  const zwMonthly = composeZiWeiMonthly(state.data.ziWei, year, m, { mode: 'study' });
  const stage = lifeStageForYear(state.data.input, year);
  const domain = {
    命宮: '自己的狀態與選擇', 兄弟宮: '手足、同儕與合作', 夫妻宮: '親密關係',
    子女宮: '子女、晚輩與創作', 財帛宮: '資源與金錢安排', 疾厄宮: '身心狀態與生活習慣',
    遷移宮: '外出、環境變化與適應', 僕役宮: '朋友、合作與支持網絡', 官祿宮: '責任、學習或投入的事務',
    田宅宮: '家庭、居住與安全感', 福德宮: '休息、情緒與精神生活', 父母宮: '長輩、師長與制度互動',
  }[zwMonthly.palaceName] ?? '日常生活';
  const categoryPlain = {
    比劫運: ['合作、自主與資源分配', '適合找可信任的人互相支援', '涉及人情、借貸或分工時要先說清楚'],
    食傷運: ['表達、學習成果與創意輸出', '適合分享想法、練習新技能或完成作品', '說話太快或安排太滿時，容易增加摩擦'],
    財運: ['資源運用、成果落地與生活安排', '適合整理預算、物品或可執行的計畫', '不要只看眼前利益，也要保留長期餘裕'],
    官殺運: ['責任、規則與需要完成的任務', '適合處理有期限、有標準的事情', '壓力增加時不要硬撐，先排出優先順序'],
    印運: ['學習、休息、支持與資訊整理', '適合請教他人、閱讀整理或補足能力', '蒐集太多資訊時，要替自己設定開始行動的時間'],
  }[detail.category] ?? ['步調整理與日常調整', '照原本節奏完成重要的小事', '臨時變化出現時保留彈性'];
  const favorable = [
    adaptToLifeStage(categoryPlain[1], stage),
    ...zwMonthly.entries.filter((e) => ['祿', '權', '科'].includes(e.mutagen)).slice(0, 1)
      .map((e) => `${domain}較容易出現推進或被看見的機會，可以選一件重要的事主動處理。`),
  ];
  const cautions = [
    adaptToLifeStage(categoryPlain[2], stage),
    ...zwMonthly.entries.filter((e) => e.mutagen === '忌').slice(0, 1)
      .map(() => `${domain}容易讓人多想或反覆，重要決定先留一點確認與休息時間。`),
  ];
  const list = (title, items) => `<div class="analysis-card__section"><div class="analysis-card__section-title">${title}</div><ul class="analysis-card__list">${[...new Set(items)].map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
  return `
    <div class="chip-label" style="margin-top:4px">流月（${year} 年;八字以節氣月、紫微斗君以農曆月計,月界略有差異）</div>
    <div class="chip-row">${chips}</div>
    <div class="monthly-plain">
      <p class="palace-takeaway">${m} 月重點：${esc(domain)}，同時適合留意${esc(adaptToLifeStage(categoryPlain[0], stage))}。</p>
      ${list('這個月可以把握', favorable)}
      ${list('這個月需要留意', cautions)}
      <p class="monthly-action">先選一件與「${esc(domain)}」有關、能在本月完成的小事；遇到變化時先確認資訊，再調整步調。</p>
      <details class="palace-technical" data-dashboard-detail="monthly-technical"${state.dashboardOpenDetails.has('monthly-technical') ? ' open' : ''}>
        <summary>查看流月專業依據</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>紫微流月命宮與四化</b><p>${esc(flat(zwMonthly.text))}</p></div>
          <div class="tech-block"><b>八字流月干支與引動</b><p>${esc(flat(detail.text))}</p></div>
        </div>
      </details>
    </div>`;
}

function renderDashboard() {
  const isZw = state.chartTab !== 'bazi';
  const hourWarn = state.data.hourUnknown
    ? `<div class="card" style="border-color:var(--gold)"><div class="card-hint" style="margin:0">⚠ 時辰未知:目前以「午時」暫排。紫微命盤的宮位與八字時柱會隨時辰改變,以下結果僅供參考;年柱、月柱、日柱與五行分佈不受影響,仍為準確資訊。</div></div>`
    : '';
  $('#view-dashboard').innerHTML = `<div class="stack">
    ${hourWarn}
    ${renderResultSummary()}
    <details class="dashboard-details" id="dashboard-detail" data-dashboard-detail="dashboard-detail"${state.dashboardOpenDetails.has('dashboard-detail') ? ' open' : ''}>
      <summary><span><b>完整命盤資料</b><small>紫微十二宮、八字四柱、宮位與流年切換</small></span></summary>
      <div class="dashboard-details__body">
        <div class="chart-tabs">
          <button type="button" class="chart-tab${isZw ? ' active' : ''}" data-chart="ziwei">紫微命盤</button>
          <button type="button" class="chart-tab${isZw ? '' : ' active'}" data-chart="bazi">八字四柱</button>
        </div>
        <div class="row chart-area ${isZw ? 'show-ziwei' : 'show-bazi'}">${renderZiWeiCard()}${renderBaZiCard()}</div>
        ${renderClassroom()}
        ${renderLuckBrowser()}
      </div>
    </details>
  </div>`;

  $$('#view-dashboard .chart-tab').forEach((tab) =>
    tab.addEventListener('click', () => { state.chartTab = tab.dataset.chart; renderDashboard(); }));
  $$('#view-dashboard [data-result-goto]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.resultGoto === 'dashboard-detail') {
        const details = $('#dashboard-detail');
        state.dashboardOpenDetails.add('dashboard-detail');
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else switchView(button.dataset.resultGoto);
    }));
  $$('#view-dashboard .palace-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      state.selectedPalace = cell.dataset.palace;
      renderDashboard();
      // 宮格放大後,命盤小教室常被推到可視範圍外,點擊宮位卻像沒反應——主動捲過去,不用使用者自己往下找
      const classroomCard = $('#classroom-card');
      if (classroomCard?.scrollIntoView) classroomCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  $$('#view-dashboard [data-limit]').forEach((chip) =>
    chip.addEventListener('click', () => { state.limitIdx = Number(chip.dataset.limit); state.yearIdx = 0; renderDashboard(); }));
  $$('#view-dashboard [data-year]').forEach((chip) =>
    chip.addEventListener('click', () => { state.yearIdx = Number(chip.dataset.year); state.monthIdx = null; renderDashboard(); }));
  // 大限／流年目前選取的 chip 自動捲動到可視範圍,不用使用者自己在窄窄的一排裡找
  $$('#view-dashboard .chip-row').forEach((row) => {
    const activeChip = row.querySelector('.chip.active');
    if (activeChip?.scrollIntoView) activeChip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
  $('#open-monthly')?.addEventListener('click', () => {
    // 展開時預設選「現在的月份」(若瀏覽的是當年),否則 1 月
    const { year } = currentLuckSelection();
    state.monthIdx = year === new Date().getFullYear() ? new Date().getMonth() : 0;
    renderDashboard();
  });
  $$('#view-dashboard [data-month]').forEach((chip) =>
    chip.addEventListener('click', () => { state.monthIdx = Number(chip.dataset.month); renderDashboard(); }));

  // 複製「宮位中心」AI 提示詞(以命盤小教室目前選中的宮位為中心)
  $('#copy-palace-prompt')?.addEventListener('click', async () => {
    const { input, ziWei } = state.data;
    const text = formatPalacePromptForAI({ input, ziWei, palaceName: state.selectedPalace });
    if (!text) return toast('此宮位暫無提示詞模板');
    try {
      await navigator.clipboard.writeText(text);
      toast(`已複製${state.selectedPalace}分析提示詞,可貼給AI`);
    } catch { toast('複製失敗,請確認瀏覽器剪貼簿權限'); }
  });

  // 複製「流年中心」AI 提示詞(以大限流年瀏覽目前選中的年份為基準)
  $('#copy-annual-prompt')?.addEventListener('click', async () => {
    const { input, baZi, ziWei } = state.data;
    const { year: selYear } = currentLuckSelection();
    const text = formatAnnualPromptForAI({ input, baZi, ziWei, year: selYear });
    try {
      await navigator.clipboard.writeText(text);
      toast(`已複製 ${selYear} 流年分析提示詞,可貼給AI`);
    } catch { toast('複製失敗,請確認瀏覽器剪貼簿權限'); }
  });
}

// ---------- 主題分析：從使用者真正想問的問題開始 ----------
const TOPIC_ANALYSIS = [
  { key: 'love', label: '愛情', icon: '愛', palace: '夫妻宮', bazi: ['shishen', 'zhu'], questions: ['我常遇到什麼類型的對象？', '什麼特質最容易讓我心動？', '什麼樣的相處方式最適合我？', '關係發生衝突後，我適合怎麼修復？', '我在感情裡最容易忽略什麼？', '我要怎麼建立不委屈自己的關係界線？'] },
  { key: 'career', label: '事業', icon: '業', palace: '官祿宮', bazi: ['yongshen', 'xiji'], questions: ['我適合負責哪些工作內容？', '我在工作或團體中最拿手的是什麼？', '什麼樣的環境比較能讓我長期發揮？', '我在合作或帶領別人時適合扮演什麼角色？', '我的職涯最容易卡在哪裡？', '我要怎麼建立長期職涯方向？'] },
  { key: 'money', label: '財運', icon: '財', palace: '財帛宮', bazi: ['xiji', 'yongshen'], questions: ['我比較適合怎麼累積收入與資源？', '我的金錢使用習慣有什麼特色？', '做財務決定時最需要留意什麼？', '我適合獨立賺錢，還是和別人合作？', '我在金錢管理上最有優勢的是什麼？', '我要怎麼建立更穩定的財務節奏？'] },
  { key: 'parents', label: '父母', icon: '親', palace: '父母宮', bazi: ['shishen', 'zhu'], questions: ['我和父母或長輩常見的互動模式是什麼？', '我容易從長輩身上得到哪種支持？', '面對權威或家人期待時，界線要放在哪裡？', '家人的期待容易怎麼影響我的選擇？', '我適合怎麼和父母或長輩溝通？', '成年後，我要怎麼調整和原生家庭的距離？'] },
  { key: 'children', label: '子女', icon: '育', palace: '子女宮', bazi: ['shishen', 'zhu'], questions: ['我和子女、晚輩或學生的互動方式是什麼？', '我適合用什麼方式陪伴與培育他人？', '這個宮位也反映哪些創作與產出能力？', '我容易對晚輩抱持什麼期待？', '意見不合時，我適合怎麼和晚輩溝通？', '照顧與培育他人時，我需要守住什麼界線？'] },
  { key: 'luck', label: '幸運', icon: '運', palace: '福德宮', bazi: ['yongshen', 'xiji'], questions: ['我在什麼狀態下比較容易遇到機會？', '哪些人或環境比較能為我帶來助力？', '我可以主動做什麼，讓有利條件更容易發生？', '我最容易忽略哪一種機會？', '什麼習慣容易讓我錯過好時機？', '遇到順風期時，我要怎麼把機會留下來？'] },
  { key: 'home', label: '住宅', icon: '宅', palace: '田宅宮', bazi: ['xiji', 'zhu'], questions: ['什麼樣的居住環境比較適合我？', '家與空間會怎麼影響我的安全感？', '面對搬遷、置產或家庭資源時要留意什麼？', '我適合和家人同住，還是保有自己的空間？', '我比較適合怎麼累積家庭與居住資源？', '我要怎麼安排住家與工作空間才不容易疲累？'] },
  { key: 'health', label: '健康', icon: '健', palace: '疾厄宮', bazi: ['zhu', 'xiji'], questions: ['壓力累積時，我比較容易出現什麼反應？', '哪些生活習慣最能幫助我恢復？', '我在身心照顧上最容易忽略什麼？', '我適合怎麼安排忙碌與休息的節奏？', '哪些日常情境最容易消耗我的精神？', '我要怎麼提早發現自己快要透支？'] },
  { key: 'social', label: '人際', icon: '友', palace: '僕役宮', bazi: ['shishen', 'zhu'], questions: ['我容易吸引什麼類型的朋友或合作對象？', '我在人際關係裡通常扮演什麼角色？', '合作與交朋友時，最需要設下什麼界線？', '別人對我的第一印象通常是什麼？', '人際衝突後，我適合怎麼修復關係？', '什麼樣的朋友圈最適合我長期相處？'] },
  { key: 'migration', label: '遷移', icon: '行', palace: '遷移宮', bazi: ['dayun', 'zhu'], questions: ['離開熟悉環境後，我通常會有什麼表現？', '我適合往外發展、旅行或轉換環境嗎？', '面對新地方與陌生人時，怎麼做比較容易站穩？', '什麼樣的城市或環境比較適合我發展？', '轉換環境時，我最容易遇到什麼適應問題？', '我要怎麼把外地經驗轉成長期機會？'] },
];

const TOPIC_DIRECT_ANSWERS = {
  love: [
    ['你比較容易遇到成熟、有責任感，會用行動照顧關係的人。對方通常有自己的原則，關係穩定後才會慢慢表達情緒。', '你容易遇到外表獨立、內心重視安全感的人。對方未必很會說甜言蜜語，但會希望兩個人能一起規劃生活。'],
    ['比起外表，你更容易被可靠、願意承擔，而且遇到問題肯溝通的人吸引。對方有自己的想法，但不會忽略你的感受，最容易讓你心動。', '你容易被有見識、情緒穩定又能給人安心感的人吸引。單純熱情不一定夠，真正打動你的是對方能不能把關係放在心上。'],
    ['最適合你的關係是彼此照顧，但不替對方做完所有決定。有事直接說、責任分清楚，也要讓自己有被照顧的空間。', '你適合穩定、能討論未來的相處方式。關係中保留各自的生活，同時固定確認彼此需求，會比一方一直配合更長久。'],
    ['衝突後先讓情緒降下來，再分開說明發生了什麼、你感受到什麼、希望怎麼調整。你適合把修復做成具體約定，而不是只說沒事。', '你不適合在情緒最高點逼自己立刻和好。先確認彼此真正介意的地方，再討論下一次可以怎麼做，信任會恢復得比較穩。'],
    ['你在感情裡容易先看見對方的需要，卻比較晚才發現自己已經累了。真正要留意的不是付出，而是付出是否仍出於自願。', '你容易把可靠當成自己的責任，久了可能默默承擔太多。當你開始反覆失望或不想說話，通常就是需求被忽略的訊號。'],
    ['界線可以從三件事開始：哪些事你願意幫、哪些需要一起承擔、哪些必須由對方自己處理。說清楚不等於不愛，而是避免關係只靠你維持。', '你需要練習在答應前先停一下，確認時間、情緒和能力是否允許。能直接說出目前做不到的部分，會比勉強配合更健康。'],
  ],
  career: [
    ['你適合負責需要協調、整理資訊、照顧流程或協助團隊穩定運作的工作。比起只拚速度，你更能在需要耐心與判斷的任務中發揮。', '你適合處理需要觀察、分析與溝通的內容，例如規劃、研究、顧問、內容整理或跨部門協調，而不是長期做完全沒有自主空間的重複工作。'],
    ['你最拿手的是先看懂局面，再找到大家都能執行的方法。你能察覺別人忽略的細節，也擅長在混亂時把事情重新排出順序。', '你的強項是把抽象想法整理成可執行的步驟，並照顧合作過程中的氣氛。需要同時用腦與溝通的任務，通常比單純競爭更適合你。'],
    ['你適合目標清楚、可以自主安排做法，而且同事願意溝通的環境。若長期只看排名、氣氛緊繃，你的能力反而容易被疲憊感蓋過。', '能讓你長期發揮的環境，需要有穩定規則，也保留改善方法的空間。主管願意說明期待、團隊分工清楚，你會做得更久也更好。'],
    ['你適合把方向整理清楚、協調分工並追蹤進度。帶人時先說明目標，再讓每個人決定做法，比事事親自控制更能發揮。', '合作中你適合成為資訊與執行之間的橋樑。你能看見細節，也能顧及團隊氣氛；只要避免把別人的責任一併接走。'],
    ['你的職涯容易卡在想把條件確認完整才開始，或因為不想破壞關係而延後表達意見。設定決策期限，會比繼續收集資訊更有幫助。', '當環境缺少明確標準時，你容易一邊承擔、一邊懷疑自己做得夠不夠。先確認權責與完成標準，不要只靠猜。'],
    ['長期方向適合建立在可以持續累積的專業上，再逐步增加決策權與影響力。先選定一項核心能力，連續做出可展示的成果。', '你不必一次決定終身職業，但要讓每次轉換都累積同一條主線。定期檢查能力、作品與人脈是否持續增加，就能逐漸形成方向。'],
  ],
  money: [
    ['你比較適合靠專業、資訊整理或長期累積來增加收入，而不是追逐短期起伏。把能力做成可以重複提供的服務或成果，會更符合你的節奏。', '你的資源累積方式偏向穩健：先看懂風險，再慢慢放大有效的方法。固定儲蓄、分散來源與提升專業，比臨時押注更適合你。'],
    ['你花錢前通常會比較與思考，但遇到能提升生活品質或照顧身邊人的東西，也可能放寬標準。容易不是亂花，而是替每筆支出找到理由。', '你的金錢態度帶有安全感需求：平常會想保留餘裕，但壓力大時可能用消費換取放鬆。清楚區分需要、想要與情緒支出會很有幫助。'],
    ['做財務決定時，最需要留意資訊查得太多卻遲遲不行動，或因為人情替別人承擔風險。先設定金額上限、期限與不能退讓的條件。', '要留意看起來很穩的選擇未必真的適合你。涉及合夥、借貸或長期負擔時，先把責任與退出方式寫清楚，不要只靠信任。'],
    ['你可以合作賺錢，但核心專業與定價最好掌握在自己手上。合作適合用來擴大客源或補足能力，不適合把所有收入都綁在同一個人身上。', '你適合「個人能力打底、合作資源放大」的模式。開始前把出資、分工、分潤與退出方式寫清楚，合作才不會變成人情壓力。'],
    ['你的優勢是願意比較資訊、評估風險，也能為長期目標延後部分享受。只要規則清楚，你通常比臨時憑感覺更能守住資源。', '你擅長看出一筆支出是否真的有長期價值，也願意為重要目標累積。把這項判斷力用在固定預算上，會比頻繁改策略更有效。'],
    ['先建立固定儲蓄、日常支出與彈性預算三個區塊，每月只在固定日期檢查一次。這能避免情緒一來就改變整套計畫。', '穩定財務的關鍵不是每天省錢，而是讓收入進來後自動分配。先準備緊急備用金，再逐步安排長期目標與可自由使用的金額。'],
  ],
  parents: [
    ['你和父母或長輩的互動容易出現「彼此關心，但表達方式不一樣」。你可能先配合、自己消化，累積到一定程度才說出真正想法。', '你面對長輩時常會先尊重對方的經驗與立場，但內心仍有自己的判斷。關係順不順，往往取決於雙方能否把期待說清楚。'],
    ['你比較容易從長輩身上得到經驗、資訊或實際協助，而不一定是直接的情緒安慰。當你主動說明具體需要，支持通常會更明顯。', '長輩能給你的支持偏向提醒方向、提供資源或在關鍵時刻出面。你若只說「沒事」，他們可能不知道該怎麼幫你。'],
    ['界線要放在「可以聽建議，但決定仍由自己承擔」。先肯定對方的關心，再清楚說明你會怎麼做，比沉默配合後突然反彈更有效。', '面對家人期待時，不需要立刻答應或拒絕。替自己保留思考時間，分清楚哪些是關心、哪些已經影響你的生活選擇。'],
    ['家人的期待容易讓你在選擇前先考慮會不會讓他們失望，因此可能把真正想要的方向放到後面。重要決定最好先獨立寫下自己的理由。', '你可能把家人的擔心當成必須解決的責任，做決定時因此偏向安全選項。可以理解他們的顧慮，但不需要用放棄自己換取安心。'],
    ['和長輩溝通時，先說結論，再補上你的安排與風險處理方式。具體說明你已經考慮過什麼，通常比只說「我知道」更容易取得信任。', '你適合在情緒平穩時談重要事情，避免一次翻出所有舊問題。每次只談一個主題，說明事實、需要與下一步，溝通比較不會失焦。'],
    ['成年後適合保留固定關心，但不必讓家人參與每一個決定。先分清楚哪些資訊願意分享、哪些需要等確定後再說。', '理想距離不是完全疏遠，而是你能維持聯絡，也能自行安排生活。當家人越界時，用一致的做法回應，比每次重新辯論更有效。'],
  ],
  children: [
    ['你和子女、晚輩或學生相處時，容易主動教方法、安排方向，也會希望對方真正學會。要留意幫得太快，反而減少對方自己嘗試的空間。', '你在晚輩面前常是可靠、願意解釋的一方。對方容易把你當作能詢問意見的人，但有時也可能覺得你的標準比較高。'],
    ['你適合用「示範一次，再讓對方自己做」的方式陪伴。具體肯定努力、清楚說明界線，比一直提醒結果更能建立信任。', '陪伴他人時，你適合先問對方需要建議、協助還是單純被傾聽。這能避免你很用心，對方卻覺得被安排。'],
    ['你的創作能力適合用在需要規劃、整理與持續修正的作品。比起一次爆發，你更能把零散想法慢慢做成完整成果。', '你適合把觀察到的人事物轉成內容、方法或可以幫助別人的成果。創作卡住時，先完成小版本，比等待完美靈感更有效。'],
    ['你容易期待晚輩不只完成事情，還要真正理解方法與責任。這份用心是優勢，但不要把自己的成熟速度當成對方的標準。', '你對晚輩的期待偏向穩定、有進步、能為自己負責。比起只看結果，清楚說出階段目標，能減少雙方都覺得不夠好的壓力。'],
    ['意見不合時，先問對方怎麼理解這件事，再說你的擔心。你適合提供選項與後果，讓對方參與決定，而不是直接替他安排答案。', '和晚輩溝通時，把批評改成可調整的具體行為，例如下次提前告知，會比說對方總是不負責更容易被接受。'],
    ['需要守住的界線是：你可以提供資源與建議，但不能替對方承擔所有結果。幫忙前先確認對方願意負責哪一部分。', '照顧他人時，不要把對方的進度當成自己的成績。固定保留自己的時間，也允許對方犯小錯，關係反而更能長久。'],
  ],
  luck: [
    ['當你願意走出原本的小圈子、主動交流或學習新東西時，機會比較容易出現。你的好運常不是突然降臨，而是從一次介紹或新嘗試開始。', '你在心態穩定、生活有節奏時最容易看見機會。越焦慮時越容易錯過細節，因此先把自己安頓好，判斷通常會更準。'],
    ['願意分享資訊、說話直接但尊重人的環境，較容易為你帶來助力。能讓你學到東西、又允許你提出問題的人，通常是重要貴人。', '有經驗、做事穩定、願意給具體建議的人比較能幫到你。比起只給鼓勵，能陪你把下一步說清楚的關係更有價值。'],
    ['主動讓別人知道你正在做什麼、需要什麼，機會才有入口。每隔一段時間更新作品、近況或目標，比默默等待更容易遇到合作。', '把大目標拆成一個月能完成的小成果，並固定接觸新資訊或新朋友。你越有持續行動，原本看不到的選項越容易浮現。'],
    ['你最容易忽略的，是看起來只是聊天、介紹或小任務的機會。重要轉折常先以不起眼的邀請出現，不一定一開始就有完整條件。', '你可能只把明確的大機會當成機會，卻低估持續認識人、分享作品與參與小型合作的累積效果。'],
    ['過度比較、等所有條件完美，或因為怕麻煩而不回應邀請，容易讓你錯過時機。可以先答應進一步了解，再決定是否投入。', '當你忙著處理別人的需求，自己的計畫就容易一直延後。每週保留一段時間推進個人目標，能讓機會真正接得住。'],
    ['順風時不要只增加承諾，也要把有效方法留下來。記錄機會從哪裡來、哪些合作值得延續，並把成果整理成可再次使用的資產。', '遇到機會後，先確認時間與資源能否承擔，再選一兩項重點投入。完成並建立長期關係，比同時抓住所有選項更有利。'],
  ],
  home: [
    ['你適合安靜、整齊但不過度拘束的空間。家中最好有能獨處與整理思緒的角落，同時保留自然光與可彈性調整的配置。', '你對居住環境的氣氛很敏感，適合採光穩定、收納清楚、聲音不太混亂的地方。空間不一定要大，但需要讓你能真正放鬆。'],
    ['當家裡雜亂、關係緊張或缺少私人空間時，你的心情和行動力容易一起受影響。把住處整理好，對你不只是美觀，而是恢復穩定感。', '你會透過熟悉的物品、固定作息與可掌握的空間建立安全感。居住環境變動時，需要比別人多一點重新安頓的時間。'],
    ['搬遷或置產時，除了價格，也要實際確認通勤、噪音、採光與生活機能。不要只因家人期待或短期優惠，就承擔超出能力的長期負擔。', '面對家庭資源時，要先說清楚所有權、付款與未來使用方式。越是親近的人，越需要把責任談清楚，才能避免日後壓力。'],
    ['你需要有自己的安靜角落，因此即使和家人同住，也要保留能關門、整理物品與獨處的空間。若生活規則差異太大，分開住會比較自在。', '是否同住不只看感情，也要看作息、家務與隱私能不能談清楚。能明確分配公共責任並保有私人空間，同住才比較適合你。'],
    ['你適合用長期、分階段的方式累積居住資源。先建立備用金與穩定現金流，再考慮搬遷或置產，不必為了跟上別人而過早承擔。', '家庭資源適合透明管理：列出共同支出、個人支出與未來目標。即使是家人提供協助，也要說清楚是贈與、借款還是共同投入。'],
    ['工作區最好和睡眠、休息區有明顯界線，即使空間不大，也可以用固定桌面、燈光或收納方式區隔。工作結束後要有收尾動作。', '你容易受空間氣氛影響，工作處要減少雜物與干擾，休息處則不要一直看到待辦。把兩種狀態分開，精神比較容易真正下班。'],
  ],
  health: [
    ['壓力累積時，你比較容易先出現睡不好、精神難以放鬆、飲食或作息變亂的情況。表面看起來仍能應付，但耐心和專注力會先下降。', '你在忙碌時容易忽略疲勞，直到情緒煩躁、身體緊繃或做事效率變差才發現。壓力通常不是突然爆發，而是慢慢堆積。'],
    ['最能幫助你恢復的是規律睡眠、適度活動，以及一段不需要回應任何人的安靜時間。比起偶爾徹底放空，固定的小休息更有效。', '你的恢復關鍵是把刺激降下來：減少過滿行程、睡前停止接收資訊，並用散步、伸展或整理空間讓身體慢慢安定。'],
    ['你最容易忽略的是「還能撐」不等於真的沒事。當休息後仍持續不舒服，應記錄狀況並尋求專業評估，不要只靠意志力拖過去。', '要留意為了照顧別人或完成責任，一再延後吃飯、睡眠與就醫。先保留基本作息，才能避免小問題累積成長期負擔。'],
    ['你適合用固定休息點切開忙碌，例如每完成一段任務就離開座位、喝水或走動。不要等所有事情做完才休息，因為待辦通常不會真正清空。', '忙碌時採用「專注一段、短暫恢復」的節奏比較適合你。每天也要保留明確停止工作的時間，讓身體知道可以慢下來。'],
    ['長時間回應訊息、處理別人的情緒，或行程之間完全沒有空檔，最容易消耗你的精神。需要把沒有明確責任的請求適度往後排。', '持續處在吵雜、資訊過多或要求隨時回應的環境，容易讓你越來越難專注。關閉部分通知並集中處理訊息，會減少耗損。'],
    ['當你開始睡前仍停不下思考、容易不耐煩、忘東忘西，或原本簡單的事也拖很久，通常就是需要降低負荷的早期訊號。', '可以固定觀察睡眠、食慾、專注與情緒四項變化。若其中兩項持續明顯下降，就先縮減行程；不適持續時應尋求專業協助。'],
  ],
  social: [
    ['你容易吸引能力強、有主見，或做事很有效率的人。彼此一開始可能因欣賞而靠近，但合作久了要特別說清楚誰負責什麼。', '你常遇到表面獨立、其實很需要可靠夥伴的人。對方容易信任你能收拾局面，也可能不自覺把較多責任交給你。'],
    ['你在人際裡常扮演協調、照顧或替大家想下一步的角色。別人容易覺得你可靠，但你未必會第一時間說出自己的不舒服。', '你通常是先觀察氣氛、再調整說法的人。熟悉之後會願意投入很多，也因此容易成為朋友間被詢問意見的對象。'],
    ['最重要的界線是不要因為自己做得到，就默認所有事情都由你承擔。答應前先確認時間、責任與對方願意投入多少。', '合作時要把金錢、期限與分工說清楚；交朋友則要觀察對方是否也願意回應你的需要。單方面付出太久，就該調整距離。'],
    ['別人對你的第一印象多半是好相處、會觀察場合，也願意配合溝通。熟悉後才會發現你其實有清楚的原則與自己的節奏。', '你給人的感覺通常可靠、細心，不會急著搶話。這讓人容易信任你，但也可能誤以為你對所有安排都沒有意見。'],
    ['衝突後先確認是誤解、分工還是價值不同，不要一次處理所有舊帳。你適合用具體事件和下一步重新建立合作。', '修復關係時，可以先承認對方的感受，但不需要立刻同意所有指責。把彼此責任分開，再決定哪些地方願意調整。'],
    ['你適合重視互相回應、願意討論差異，而且不靠比較維持地位的朋友圈。能各自發展又固定聯絡的關係最容易長久。', '適合你的圈子不一定熱鬧，但需要成員做事可靠、說話真誠。若總是要猜立場或證明價值，你會很快感到疲憊。'],
  ],
  migration: [
    ['離開熟悉環境後，你一開始會先觀察規則與人際氣氛，等掌握狀況後才明顯展現能力。適應速度不慢，但需要先確認安全感。', '到了新地方，你會變得比平常更主動，也比較容易看見不同選項。只要有基本準備，外在變化反而能帶出你的彈性。'],
    ['你適合往外發展，但比較適合「有目標的移動」，例如學習、工作計畫或生活體驗，而不是為了逃離問題而突然離開。', '旅行、跨城市或接觸不同圈子通常能打開你的想法。若要長期轉換環境，先確認支持系統與生活成本，發揮會更穩。'],
    ['到新地方後，先建立固定作息、熟悉交通與找到一兩個可信任的人，再逐步擴大活動範圍。你不需要一開始就逼自己完全融入。', '面對陌生人時，先從具體任務或共同興趣開始互動，比勉強社交更自然。保留觀察時間，同時主動提出一個小問題，就能慢慢站穩。'],
    ['你適合生活機能清楚、能接觸新資訊，又保留安靜空間的城市。完全封閉或每天過度擁擠的環境，都可能讓你難以長期安定。', '適合你的地方需要有學習與發展機會，也能建立穩定日常。比起只看城市名氣，你更該重視通勤、社群與生活成本是否可持續。'],
    ['轉換環境時，你容易同時想快速適應又擔心做錯選擇，前期因此耗費很多精神。先處理住宿、交通與固定聯絡人，能減少不必要的焦慮。', '你最容易遇到的問題是表面已經適應，內在卻還沒有歸屬感。不要只忙著完成事情，也要建立固定活動與能說話的關係。'],
    ['把外地認識的人、學到的方法與完成的成果整理留下來，回到原本環境後仍持續聯絡。經驗只有被轉成作品或合作，才會成為長期機會。', '每次旅行或移動後，選一項最有價值的新方法繼續實行，並主動回訪重要人脈。這能避免經驗只停留在短暫的新鮮感。'],
  ],
};

function topicIntegratedAnswer(topic, questionIndex, ziweiCard, baziCard) {
  const options = TOPIC_DIRECT_ANSWERS[topic.key]?.[questionIndex] ?? [];
  if (!options.length) return '這個問題目前沒有可用的初步回答。';
  const seedText = `${ziweiCard?.technical?.chartData ?? ''}|${baziCard?.technical?.chartData ?? ''}|${topic.key}|${questionIndex}`;
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = ((hash * 31) + seedText.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

function renderTopics() {
  const { input, ziWei, baZi, zwLuck, bzLuck, elements } = state.data;
  const topic = TOPIC_ANALYSIS.find((item) => item.key === state.topicKey) ?? TOPIC_ANALYSIS[0];
  const ziweiCard = generatePlainPalaceCard(ziWei, topic.palace);
  const baziCards = generatePlainBaziTopics(baZi, bzLuck, elements);
  const baziCard = topic.bazi.map((key) => baziCards.find((card) => card.key === key)).find(Boolean);

  const tabs = TOPIC_ANALYSIS.map((item) => `
    <button type="button" class="topic-tab${item.key === topic.key ? ' active' : ''}" data-topic="${item.key}" aria-pressed="${item.key === topic.key}">
      <span>${item.icon}</span>${item.label}
    </button>`).join('');
  const questions = topic.questions.map((question, index) => {
    const answer = topicIntegratedAnswer(topic, index, ziweiCard, baziCard);
    const open = state.topicQuestion === index;
    return `<article class="topic-question-card${open ? ' open' : ''}">
      <button type="button" class="topic-question-head" data-open-topic-question="${index}" aria-expanded="${open}" aria-controls="topic-answer-${index}">
        <span>Q${index + 1}</span><h3>${esc(question)}</h3><i aria-hidden="true">›</i>
      </button>
      <div class="topic-question-body" id="topic-answer-${index}"${open ? '' : ' hidden'}>
        <section class="topic-answer topic-answer--combined"><b>初步綜合回答</b><p>${esc(answer)}</p><small>已綜合紫微與八字中和這題最相關的配置</small></section>
        <button type="button" class="mini-btn topic-ai-btn" data-topic-question="${index}">複製這題給 AI 深入問</button>
        <p class="topic-ai-note">只會複製題目與相關命盤資料到剪貼簿，不會自動上傳。</p>
      </div>
    </article>`;
  }).join('');

  $('#view-topics').innerHTML = `
    <div class="report-intro"><b>先選主題，再點開一個你真正想知道的問題。</b>每題提供紫微與八字的初步綜合方向，也可以把該題與命盤資料複製給 AI 繼續追問。</div>
    <div class="topic-tabs" aria-label="選擇分析主題">${tabs}</div>
    <div class="topic-heading"><div class="round-icon">${topic.icon}</div><div><h2>${topic.label}主題</h2><p>${esc(palaceMeanings[topic.palace] ?? '')}</p></div></div>
    <div class="topic-question-list">${questions}</div>`;

  $$('#view-topics [data-topic]').forEach((button) =>
    button.addEventListener('click', () => { state.topicKey = button.dataset.topic; state.topicQuestion = 0; renderTopics(); }));
  $$('#view-topics [data-open-topic-question]').forEach((button) =>
    button.addEventListener('click', () => {
      const index = Number(button.dataset.openTopicQuestion);
      state.topicQuestion = state.topicQuestion === index ? null : index;
      renderTopics();
    }));
  $$('#view-topics [data-topic-question]').forEach((button) =>
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.topicQuestion);
      const question = topic.questions[index];
      const answer = topicIntegratedAnswer(topic, index, ziweiCard, baziCard);
      const chartPacket = formatChartForAI({ input, ziWei, baZi, zwLuck, bzLuck, elements });
      const text = [
        `【主題分析：${topic.label}】`,
        `使用者問題：${question}`,
        `網站初步綜合回答：${answer}`,
        '',
        '請先直接回答上面的單一問題，不要先輸出完整命盤總論。',
        '只使用下方資料包裡實際存在的命盤資料，不重新排盤、不補造星曜、十神或人生事件。',
        '請把紫微與八字交叉比對：一致處作為較明顯的傾向，分歧處分開說明，不要硬湊。',
        '輸出順序：一句結論 → 2至4個生活中的可能表現 → 需要留意的盲點 → 2個具體可行建議 → 簡短專業依據。',
        '不要預測具體對象、疾病、死亡、必然事件或精確發生日期。只回答資料能合理支持的部分；沒有依據的內容直接省略，不要輸出「命盤無法判定」等限制聲明。',
        '',
        '--- 完整命盤資料包 ---',
        chartPacket,
      ].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast(`已複製「${question}」AI 解讀提示`);
      } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
    }));
}

// ---------- 分頁二:重點解讀 ----------
function reportItems() {
  // 白話摘要卡片(7 段式結構)全部交給 compose-plain.js 組裝,這裡只負責取用已經算好的
  // 命盤資料(ziWei/baZi)與現行大限流年(zwLuck/bzLuck)、五行分佈(elements),不重新排盤、
  // 不重算星曜宮位或十神喜用神——沿用 applyReadingMode() 已組裝好的資料。
  const { ziWei, baZi, zwLuck, bzLuck, elements } = state.data;
  const ziwei = generatePlainZiweiTopics(ziWei, zwLuck);
  const bazi = generatePlainBaziTopics(baZi, bzLuck, elements);
  return { ziwei, bazi };
}

/** 白話摘要卡片內的清單型區塊(生活中的表現／可能的挑戰／發揮建議) */
function analysisSectionHtml(title, items) {
  if (!items || items.length === 0) return '';
  return `<div class="analysis-card__section">
    <div class="analysis-card__section-title">${esc(title)}</div>
    <ul class="analysis-card__list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  </div>`;
}

/** 重點解讀只回答「現在最值得注意什麼、接下來怎麼做」；完整資料仍保留給其他用途。 */
function analysisPlainPanelHtml(it, hidden) {
  const explanationHtml = (it.explanation || []).filter(Boolean).slice(0, 1).map((p) => `<p>${esc(p)}</p>`).join('');
  return `<div class="analysis-card__panel" data-report-panel="plain"${hidden ? ' hidden' : ''}>
    <p class="analysis-card__summary">${esc(it.summary)}</p>
    <div class="analysis-card__explanation">${explanationHtml}</div>
    ${analysisSectionHtml('現在可能出現', (it.lifeExamples || []).slice(0, 2))}
    ${analysisSectionHtml('現在需要留意', (it.challenges || []).slice(0, 1))}
    ${analysisSectionHtml('接下來可以做', (it.advice || []).slice(0, 2))}
  </div>`;
}

/**
 * 專業依據面板(data-report-panel="technical"):對應宮位/主星借星/三方四正/四化、大限流年小限、
 * 八字日主十神五行喜忌等命盤原始判斷依據,以及白話結論與專業依據的對照。
 * 固定 4 小節:命盤資料 / 專業判斷 / 白話對應 / 限制與需綜合參考處。
 * 這裡永遠是完整內容(compose-plain.js 內部固定用 mode:'study' 組裝 technical.judgment),
 * 由外層的 hidden 屬性決定要不要顯示,不是靠內容本身的詳略來切換。
 */
function analysisTechnicalPanelHtml(technical, hidden) {
  if (!technical) return '';
  const warnings = technical.warnings ?? [];
  return `<div class="analysis-card__panel analysis-card__panel--technical" data-report-panel="technical"${hidden ? ' hidden' : ''}>
    <div class="tech-block"><b>命盤資料</b><p>${esc(technical.chartData || '—')}</p></div>
    <div class="tech-block"><b>專業判斷</b><p>${esc(technical.judgment || '—')}</p></div>
    <div class="tech-block"><b>白話對應</b><p>${esc(technical.plainMapping || '—')}</p></div>
    ${warnings.length ? `<div class="tech-block"><b>限制與需綜合參考處</b><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

function renderReport() {
  const { ziwei, bazi } = reportItems();
  const isZiwei = state.reportTab === 'ziwei';
  const items = isZiwei ? ziwei : bazi;
  const expandedKeys = isZiwei ? state.expandedZiwei : state.expandedBazi;
  // 紫微斗數/八字兩個分頁各自記住自己選的是「白話摘要」還是「專業依據」(見 state.reportViewMode)
  const isStudy = state.reportViewMode[state.reportTab] === 'study';

  const intro = isZiwei
    ? '這裡整理你現在最值得注意的命盤重點，包括本命特質、目前大限與流年。想查看宮位、星曜或切換其他年份，請到<button type="button" class="link-jump" data-goto="dashboard">命盤總覽</button>；想讀完整的人生主題分析，請到<button type="button" class="link-jump" data-goto="comprehensive">深度解析</button>。'
    : '這裡整理你現在最值得注意的命盤重點，包括日主特質、目前大運與流年。想查看四柱、十神或切換其他年份，請到<button type="button" class="link-jump" data-goto="dashboard">命盤總覽</button>；想讀完整的人生主題分析，請到<button type="button" class="link-jump" data-goto="comprehensive">深度解析</button>。'

  const list = items.map((it) => {
    const open = expandedKeys.includes(it.key);
    // 大限/大運這兩項跟「命盤總覽」的互動大限流年瀏覽器內容有重疊,這裡只保留現在的固定摘要,
    // 並加一個跳轉按鈕,引導想看其他年份的人去真正能自由切換的地方,而不是把所有年份都重複印一次
    const jumpNote = (it.key === 'xian' || it.key === 'dayun')
      ? '<button type="button" class="mini-btn acc-jump" data-jump-dashboard="1" style="margin-top:10px">→ 到「命盤總覽」切換查看其他大限／流年</button>'
      : '';
    const panelId = `report-panel-${it.key}`;
    return `<div class="analysis-card${open ? ' open' : ''}${it.borrowed ? ' is-borrowed' : ''}">
      <button type="button" class="analysis-card__header" data-acc="${it.key}" aria-expanded="${open}" aria-controls="${panelId}">
        <div class="round-icon" style="background:${it.color}">${it.letter}</div>
        <div class="analysis-card__headtext">
          <div class="analysis-card__title">${esc(it.title)}</div>
          ${!open ? `<div class="analysis-card__peek">${esc(it.summary)}</div>` : ''}
        </div>
        <div class="acc-chevron">›</div>
      </button>
      ${open ? `<div class="analysis-card__content" id="${panelId}">
        ${analysisPlainPanelHtml(it, isStudy)}
        ${analysisTechnicalPanelHtml(it.technical, !isStudy)}
        ${jumpNote}
      </div>` : ''}
    </div>`;
  }).join('');

  // 分享邀請放在報告讀完之後(頁尾),而不是命盤總覽一進來就跟「閱讀報告」平起平坐——
  // 使用者對命盤內容還沒有感覺時被邀請分享,順序上太早;看完摘要覺得「準」或有共鳴,才是自然的分享時機
  const shareInvite = `<div class="card share-invite">
    <div class="share-invite-text"><b>看完這份摘要了嗎？</b><span>如果覺得有共鳴，可以做一張命卡分享給朋友。</span></div>
    <button type="button" class="mini-btn" id="report-share-btn">✦ 產生分享命卡 →</button>
  </div>`;

  $('#view-report').innerHTML = `
    <div class="report-tabs" role="tablist">
      <button type="button" class="report-tab${isZiwei ? ' active' : ''}" data-tab="ziwei" role="tab" aria-selected="${isZiwei}">紫微斗數</button>
      <button type="button" class="report-tab${isZiwei ? '' : ' active'}" data-tab="bazi" role="tab" aria-selected="${!isZiwei}">八字</button>
    </div>
    <div class="report-intro">${intro}</div>
    <div class="analysis-card-list">${list}</div>
    ${shareInvite}`;

  $$('#view-report .report-tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      state.reportTab = tab.dataset.tab;
      renderReport();
      syncModeToggleUI(); // 換分頁後,按鈕要立刻反映這個分頁自己記住的白話/專業狀態
    }));
  $$('#view-report [data-jump-dashboard]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); switchView('dashboard'); }));
  $('#report-share-btn')?.addEventListener('click', () => switchView('share'));
  $$('#view-report .analysis-card__header').forEach((row) =>
    row.addEventListener('click', () => {
      const key = row.dataset.acc;
      const stateKey = state.reportTab === 'ziwei' ? 'expandedZiwei' : 'expandedBazi';
      const cur = state[stateKey];
      state[stateKey] = cur.includes(key) ? [] : [key];
      renderReport();
    }));
}

// ---------- 分頁:深度解析(綜合報告) ----------
// 深度解析(綜合報告)裡屬於補充細節、預設收合的段落標題(點開才展開,避免一次全部展開資訊過載)
const COLLAPSIBLE_DETAIL_TITLES = new Set(['四、地支關係', '五、神煞']);

// 深度解析的長文段落沿用 comprehensive.js 既有的組裝結果(不重寫那套模板邏輯),但這裡做兩件事:
// 1) 把「從命宮來看」「官祿宮顯示」「日主丁(火日生)」這類白話模式不該出現的宮位/術語開頭句型
//    做輕量清除,不動 comprehensive.js 本體,只在渲染這一層處理;
// 2) 幫每段加一句白話 headline(重用命盤總覽/重點解讀已經有的白話摘要內容,不重新寫一份)。
function stripJargonOpeners(text) {
  return text
    .replace(/從(?:命宮|身宮所在的)?[一-龥]{0,4}(?:宮)?來看[,，]?/g, '')
    .replace(/而身宮所在的([一-龥]{2,4}宮)[,，]?則/g, '同時,你的$1也')
    .replace(/([一-龥]{2,4}宮)(?:顯示|呈現|給的[一-龥]{0,4}提醒是)[,，]?/g, '你')
    .replace(/日主[甲乙丙丁戊己庚辛壬癸][(（][^)）]*[)）](?:是這張命盤的核心)?[,，]?/g, '')
    // readingDeduped() 的空宮借星備註句:「本宮無主星,借對宮XX的YY參看,方向與前述XX的特質一致」
    .replace(/本宮無主星[,，]借對宮([一-龥]{2,4})的([^,，。]+)參看[,，]方向與前述\1的特質一致[,，。]?/g, '這裡跟前面提到的$1方向一致,呈現$2的傾向。')
    // 呼應差異判斷邏輯裡「交集數量=0」的固定句,是唯一命中禁用詞「呈現差異」的地方
    .replace(/呈現差異[,，]兩個宮位的特質分屬不同面向[,，]顯示需要兼顧不同性質的課題[。]?/g, '兩邊呈現的樣貌不太一樣,比較適合分開來看,不用勉強套成同一套邏輯。')
    .replace(/^[,，]\s*/, '')
    .trim();
}

/** 長段文字依句號拆成短段落(每段約 2 句),避免一大塊文字牆 */
function splitParagraphs(text, sentencesPerParagraph = 2) {
  const sentences = text.split(/(?<=。)/).map((s) => s.trim()).filter(Boolean);
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join(''));
  }
  return paragraphs.length ? paragraphs : [text];
}

/** 每段的白話 headline:能對應到單一宮位/主題的,直接重用命盤總覽/重點解讀已經產生的白話摘要;
 * 沒有單一對應對象的(行動建議/地支關係/神煞),用誠實但不下定論的靜態導語。 */
function comprehensiveHeadline(title, { ziWei, baZi, baziCards }) {
  const findBazi = (key) => baziCards.find((c) => c.key === key)?.summary ?? '';
  switch (title) {
    case '一、性格與才華': return generatePlainPalaceCard(ziWei, '命宮').summary;
    case '二、事業與金錢': return generatePlainPalaceCard(ziWei, '官祿宮').summary;
    case '三、戀愛與婚姻': return generatePlainPalaceCard(ziWei, '夫妻宮').summary;
    case '四、健康、家庭與人際': return generatePlainPalaceCard(ziWei, '疾厄宮').summary;
    case '五、行動建議': return '以下整理幾個目前值得留意、可以主動調整的方向。';
    case '六、當前焦點': return generatePlainZiweiTimeCard(ziWei, {}).summary;
    case '全盤概覽':
    case '一、個性本質': return findBazi('zhu');
    case '二、財官流向': return findBazi('xiji');
    case '三、人際健康與行動建議': return generatePlainBaziTimeCard(baZi, {}).summary;
    case '四、地支關係': return '這裡整理你命盤四柱之間的地支互動，會反映在跟不同對象、不同人生階段的相處模式上。';
    case '五、神煞': return '以下是命盤中幾個比較特別的印記，代表一些額外的加分或需要留意的地方。';
    default: return '';
  }
}

const DEEP_CONNECTIONS = {
  '一、性格與才華': '這個核心性格會延伸到你的工作選擇與關係互動：能付出、會觀察是優勢，但也要留意是否把別人的需求排在自己前面。',
  '二、事業與金錢': '工作方式與金錢態度通常互相牽動。越清楚自己重視的工作節奏與安全感，越容易做出一致的職涯和資源選擇。',
  '三、戀愛與婚姻': '親密關係中的反應往往延續你平常照顧人、做決定與表達需求的方式，因此界線和溝通會是長期關鍵。',
  '四、健康、家庭與人際': '家庭責任、人際壓力與身體狀態會彼此影響；當你長期配合外界而沒有休息，身心通常會先出現訊號。',
  '全盤概覽': '八字各部分不是分開運作：你的能量強弱、表達方式與安全感需求，會一起影響工作、關係與面對壓力的反應。',
  '一、個性本質': '這個內在氣質會影響你如何吸收資訊、採取行動和與人合作，也是理解其他人生主題的起點。',
  '二、財官流向': '資源、責任與成就感之間會互相拉動；選擇符合自身節奏的目標，比單純追求外在標準更容易長久。',
  '三、人際健康與行動建議': '人際互動與身心負荷常是同一件事的兩面：界線越清楚，越能保留穩定行動與照顧自己的空間。',
};

const DEEP_STRENGTHS = {
  '一、性格與才華': ['能快速察覺環境與他人的需要', '願意承擔責任，也能主動提供支持'],
  '二、事業與金錢': ['能把觀察力轉成工作上的判斷', '適合在清楚節奏中累積專業與可信度'],
  '三、戀愛與婚姻': ['重視關係品質，願意為兩人的相處投入', '能留意伴侶的感受與關係中的細節'],
  '四、健康、家庭與人際': ['對身邊人的狀態敏感，容易成為可靠的支持者', '能從生活細節察覺需要調整的地方'],
  '全盤概覽': ['能依情境調整做法，不容易只用單一角度看事情', '內在動力與外在行動之間具有整合空間'],
  '一、個性本質': ['有自己的感受與判斷方式', '在熟悉且有安全感的環境中更能穩定發揮'],
  '二、財官流向': ['能把責任感轉成具體成果', '適合透過長期累積建立資源與成就感'],
  '三、人際健康與行動建議': ['能感受到互動氣氛並調整回應', '願意維持關係，也具備實際照顧人的能力'],
};

function deepSourceCard(title, { ziWei, baziCards }) {
  const bazi = (key) => baziCards.find((c) => c.key === key);
  switch (title) {
    case '一、性格與才華': return generatePlainPalaceCard(ziWei, '命宮');
    case '二、事業與金錢': return generatePlainPalaceCard(ziWei, '官祿宮');
    case '三、戀愛與婚姻': return generatePlainPalaceCard(ziWei, '夫妻宮');
    case '四、健康、家庭與人際': return generatePlainPalaceCard(ziWei, '疾厄宮');
    case '全盤概覽':
    case '一、個性本質': return bazi('zhu');
    case '二、財官流向': return bazi('xiji') || bazi('yongshen');
    case '三、人際健康與行動建議': return bazi('shishen') || bazi('dayun');
    default: return null;
  }
}

function deepListHtml(title, items, className = '') {
  const values = [...new Set((items || []).filter(Boolean))].slice(0, 4);
  if (!values.length) return '';
  return `<section class="deep-section ${className}">
    <h4>${esc(title)}</h4>
    <ul>${values.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
  </section>`;
}

function deepPatternsHtml(items) {
  const contexts = ['在人際與日常中', '在工作或學習中', '在壓力增加時'];
  const values = [...new Set((items || []).filter(Boolean))].slice(0, 3);
  if (!values.length) return '';
  return `<section class="deep-section deep-patterns">
    <h4>不同情境中的表現</h4>
    <div class="deep-pattern-grid">${values.map((item, index) => `
      <div class="deep-pattern"><b>${contexts[index]}</b><p>${esc(item)}</p></div>`).join('')}
    </div>
  </section>`;
}

function renderComprehensive() {
  const { ziWei, baZi, bzLuck, elements } = state.data;
  const mode = state.readingMode;
  const zw = generateZiweiComprehensiveReading(ziWei, { mode });
  const bz = generateBaziComprehensiveReading(baZi, { mode });
  // 專業命理依據永遠是完整版本(跟命盤總覽/重點解讀一致的做法),不受「白話摘要／專業依據」開關影響——
  // 開關只影響上面白話段落的呈現,收合的專業依據本來就是給想深入看的人用,理所當然是完整內容
  const zwStudy = generateZiweiComprehensiveReading(ziWei, { mode: 'study' });
  const bzStudy = generateBaziComprehensiveReading(baZi, { mode: 'study' });
  const zwStudyByTitle = Object.fromEntries(zwStudy.sections.map((s) => [s.title, s.text]));
  const bzStudyByTitle = Object.fromEntries(bzStudy.sections.map((s) => [s.title, s.text]));
  const baziCards = generatePlainBaziTopics(baZi, bzLuck, elements);
  const ctx = { ziWei, baZi, baziCards };

  const block = (label, sections, studyByTitle) => `
    <div class="report-intro" style="margin-bottom:8px">${esc(label)}</div>
    <div class="accordion">${sections.map((s) => {
      const collapsible = COLLAPSIBLE_DETAIL_TITLES.has(s.title);
      const open = !collapsible || state.expandedComprehensiveDetails.has(s.title);
      const headline = comprehensiveHeadline(s.title, ctx);
      const paragraphs = splitParagraphs(stripJargonOpeners(s.text));
      const source = deepSourceCard(s.title, ctx);
      const body = `<div class="acc-body comp-section">
        ${headline ? `<p class="palace-takeaway">${esc(headline)}</p>` : ''}
        <div class="palace-explain">${paragraphs.slice(0, source ? 3 : paragraphs.length).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${source ? deepListHtml('你可以發揮的地方', DEEP_STRENGTHS[s.title], 'deep-strengths') : ''}
        ${source ? deepPatternsHtml(source.lifeExamples) : ''}
        ${source ? deepListHtml('容易反覆出現的課題', source.challenges, 'deep-challenges') : ''}
        ${source ? deepListHtml('長期發展建議', source.advice, 'deep-advice') : ''}
        ${DEEP_CONNECTIONS[s.title] ? `<section class="deep-section deep-connections">
          <h4>與其他人生主題的關聯</h4><p>${esc(DEEP_CONNECTIONS[s.title])}</p>
        </section>` : ''}
        <details class="palace-technical">
          <summary>專業命理依據</summary>
          <div class="analysis-card__panel--technical" style="margin-top:10px">
            <div class="tech-block"><p>${esc(studyByTitle[s.title] ?? s.text)}</p></div>
          </div>
        </details>
      </div>`;
      return `
      <div class="acc-item${open ? ' open' : ''}">
        ${collapsible
          ? `<button type="button" class="acc-row" data-detail="${esc(s.title)}">
              <div class="acc-title">${esc(s.title)}<span class="acc-subtle">(補充細節,點開查看)</span></div>
              <div class="acc-chevron">›</div>
            </button>`
          : `<div class="acc-row"><div class="acc-title">${esc(s.title)}</div></div>`}
        ${open ? body : ''}
      </div>`;
    }).join('')}
    </div>`;

  const intro = `<div class="report-intro">這裡從性格、工作、感情、家庭與人生課題等面向，整理完整的長篇分析。若只想看現在最值得注意的內容，請到<button type="button" class="link-jump" data-goto="report">重點解讀</button>；想自己切換宮位或年份探索，則到<button type="button" class="link-jump" data-goto="dashboard">命盤總覽</button>。</div>`;

  $('#view-comprehensive').innerHTML =
    intro +
    block('紫微斗數・綜合解析', zw.sections, zwStudyByTitle) +
    '<div style="height:20px"></div>' +
    block('八字・綜合解析', bz.sections, bzStudyByTitle);

  $$('#view-comprehensive .acc-row[data-detail]').forEach((row) =>
    row.addEventListener('click', () => {
      const title = row.dataset.detail;
      if (state.expandedComprehensiveDetails.has(title)) state.expandedComprehensiveDetails.delete(title);
      else state.expandedComprehensiveDetails.add(title);
      renderComprehensive();
    }));
}

// ---------- 分頁:雙人合盤 ----------
async function runSynastry(selectedHourOverride = null) {
  const f = state.synastry.form;
  const parsed = synDateCtl?.read();
  if (!parsed) return; // 錯誤原因已就地顯示
  const { y, m, d } = parsed;
  const { convertToZiWei, convertToBaZi } = await loadEngines();
  // 送出當下再從畫面讀一次，避免 select 的 change/input 事件在部分手機瀏覽器尚未同步到表單狀態。
  const selectedHour = selectedHourOverride ?? $('#syn-hour')?.value ?? f.hour;
  f.hour = selectedHour;
  // renderSynastry() 會重建整張表單，先保存日期才能在產生結果後完整回填；
  // 否則第二次調整時辰再合盤，日期會變回空白而被驗證擋下。
  f.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hourUnknown = selectedHour === 'unknown';
  const input = { year: y, month: m, day: d, hour: hourUnknown ? 11 : Number(selectedHour), gender: f.gender };
  state.synastry.b = {
    name: f.name.trim() || '乙方',
    input,
    hourUnknown,
    baZi: convertToBaZi(input),
    ziWei: convertToZiWei(input),
  };
  renderSynastry();
}

let synDateCtl = null; // 乙方年/月/日輸入控制器,renderSynastry() 每次重繪時重建

function renderSynastry() {
  const f = state.synastry.form;
  const a = { name: state.data.name, input: state.data.input, baZi: state.data.baZi, ziWei: state.data.ziWei };
  const saved = loadSavedCharts();
  const savedChips = saved.map((c, i) =>
    `<button type="button" class="chip" data-syn-load="${i}">${esc(c.name)}</button>`).join('');

  let resultHtml = '';
  if (state.synastry.b) {
    const res = composeSynastry(a, state.synastry.b, { mode: state.readingMode, relation: f.rel });
    const hourWarning = state.synastry.b.hourUnknown
      ? '<div class="life-stage-note"><b>乙方時辰不確定</b><span>目前暫以午時排盤；涉及乙方紫微宮位與八字時柱的內容只作方向參考。</span></div>'
      : '';
    resultHtml = `
      ${hourWarning}
      <div class="card syn-score-card">
        <div class="syn-names">${esc(a.name)} × ${esc(state.synastry.b.name)}</div>
        <div class="syn-score">${res.score}<small>/100</small></div>
        <div class="syn-tier">${esc(res.tier)}</div>
        <button type="button" class="mini-btn" id="copy-syn-prompt">複製合盤 AI 提示詞</button>
      </div>
      <div class="accordion" style="margin-top:12px">${res.sections.map((s) => `
        <div class="acc-item open">
          <div class="acc-row"><div class="acc-title">${esc(s.title)}</div></div>
          <div class="acc-body">${esc(s.text)}</div>
        </div>`).join('')}
      </div>`;
  }

  $('#view-synastry').innerHTML = `
    <div class="card">
      <div class="card-label">雙人合盤</div>
      <div class="card-hint">甲方=目前排盤的「${esc(a.name)}」;輸入乙方生辰,或從已存命盤帶入,看兩人的相性結構</div>
      <div class="syn-form">
        <input id="syn-name" type="text" placeholder="乙方姓名" aria-label="乙方姓名" value="${esc(f.name)}" />
        <div class="date-parts">
          <input id="syn-year" type="text" inputmode="numeric" maxlength="4" placeholder="出生年" aria-label="乙方出生年(西元4碼)" />
          <select id="syn-month" aria-label="乙方出生月"></select>
          <select id="syn-day" aria-label="乙方出生日"></select>
        </div>
        <select id="syn-hour" aria-label="乙方時辰">${SHICHEN.map((s) => `<option value="${s.hour}">${s.label}</option>`).join('')}<option value="unknown">不確定時辰（以午時暫排）</option></select>
        <select id="syn-gender"><option value="female">女</option><option value="male">男</option></select>
        <select id="syn-rel"><option>戀人</option><option>親子</option><option>朋友</option><option>同事</option></select>
        <button type="button" class="submit-btn syn-submit" id="syn-run">合盤</button>
      </div>
      <div id="syn-date-error" class="field-error" hidden></div>
      ${saved.length ? `<div class="chip-label" style="margin-top:12px">從已存命盤帶入乙方</div><div class="chip-row">${savedChips}</div>` : ''}
    </div>
    ${resultHtml}`;

  $('#syn-hour').value = f.hour;
  $('#syn-gender').value = f.gender;
  $('#syn-rel').value = f.rel;
  synDateCtl = wireDateParts({ yearId: '#syn-year', monthId: '#syn-month', dayId: '#syn-day', errorId: '#syn-date-error', nextId: '#syn-hour' });
  if (f.date) { const [fy, fm, fd] = f.date.split('-').map(Number); synDateCtl.set(fy, fm, fd); }
  for (const [id, key] of [['#syn-name', 'name'], ['#syn-hour', 'hour'], ['#syn-gender', 'gender']]) {
    $(id).addEventListener('input', (e) => { f[key] = e.target.value; });
  }
  // 換關係型態時,若已有結果直接以新口吻重算
  $('#syn-rel').addEventListener('input', (e) => {
    f.rel = e.target.value;
    if (state.synastry.b) renderSynastry();
  });
  $$('#view-synastry [data-syn-load]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const c = loadSavedCharts()[Number(chip.dataset.synLoad)];
      if (!c) return;
      Object.assign(f, { name: c.name, date: c.date, hour: String(c.hour), gender: c.gender });
      renderSynastry();
    }));
  $('#syn-run').addEventListener('click', (e) => {
    // 在任何 await 之前先取得 select 當下值，避免 iOS/Safari 的原生選單關閉後 DOM 值同步時序不同。
    const selectedHour = $('#syn-hour').value;
    return withLoading(e.currentTarget, '合盤中…', () => runSynastry(selectedHour));
  });
  $('#copy-syn-prompt')?.addEventListener('click', async () => {
    const baseText = formatSynastryPromptForAI({ a, b: state.synastry.b });
    const text = state.synastry.b.hourUnknown
      ? `【重要】乙方出生時辰不確定，目前暫以午時排盤。請降低乙方紫微宮位與八字時柱相關結論的確定程度，不得把暫排結果寫成事實。\n\n${baseText}`
      : baseText;
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製合盤提示詞,可貼給AI');
    } catch { toast('複製失敗,請確認瀏覽器剪貼簿權限'); }
  });
}

// ---------- 分頁三:分享命卡 ----------
function shareUrl() {
  const { input, name } = state.data;
  const params = new URLSearchParams({
    name,
    date: `${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`,
    hour: input.hour,
    gender: input.gender,
  });
  return `${location.origin}${location.pathname}?${params}`;
}

// 宮位 → 白話人生焦點(命卡金句用:收到命卡的人多半不懂「大限行至夫妻宮」是什麼)
const PALACE_FOCUS = {
  命宮: '自我成長', 兄弟宮: '手足與同儕', 夫妻宮: '感情與婚姻', 子女宮: '子女與創作',
  財帛宮: '財務理財', 疾厄宮: '健康調養', 遷移宮: '向外發展', 僕役宮: '人脈與合作',
  官祿宮: '事業衝刺', 田宅宮: '安家與居所', 福德宮: '身心平衡', 父母宮: '家中長輩',
};

function renderShare() {
  const { name, input, ziWei, baZi, zwLuck, bzLuck, byBranch } = state.data;
  const lifePalace = ziWei.palaces.find((p) => p.name === '命宮');
  const opposite = byBranch[BRANCHES[(BRANCHES.indexOf(lifePalace.position[1]) + 6) % 12]];
  const lifeStars = lifePalace.majorStars.length
    ? lifePalace.majorStars.map((s) => s.name).join('・')
    : `空宮（借${opposite.majorStars.map((s) => s.name).join('・')}）`;
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const shichen = SHICHEN.find((s) => s.hour === input.hour);
  const isAnnualCard = state.shareCard === 'annual';
  const nowYear = new Date().getFullYear();

  // 本命卡金句:命格一句 + 十年重心/今年焦點(同宮時合併),不出現大限/流年等術語
  const decadalFocus = zwLuck.decadal ? PALACE_FOCUS[zwLuck.decadal.palaceName] : null;
  const annualFocus = zwLuck.annual ? PALACE_FOCUS[zwLuck.annual.palaceName] : decadalFocus;
  const opener = lifeStars.startsWith('空宮')
    ? '天生彈性大、能隨環境調整自己的命格'
    : `帶著${lifeStars}特質的命格`;
  const focusPart = decadalFocus && annualFocus && decadalFocus !== annualFocus
    ? `這十年的重心在${decadalFocus},今年的焦點則在${annualFocus}`
    : `這十年與今年的焦點都落在${annualFocus ?? decadalFocus}`;
  let quote = `「${opener},${focusPart},宜順勢經營、穩健佈局。」`;

  // 流年卡:標題、標籤與金句改為當年度重點(流年四化的祿/忌落點 + 八字流年性質)
  let cardTitle = esc(name);
  let cardSub = `${input.year}年${input.month}月${input.day}日 ${esc(shichen.name)}・${input.gender === 'female' ? '女' : '男'}`;
  let tag1 = { label: '命宮主星', value: lifeStars };
  let tag2 = { label: '日主', value: `${dayStem}${STEM_EL[dayStem]}` };
  if (isAnnualCard) {
    const zwAnnual = composeZiWeiAnnualChange(ziWei, nowYear);
    const bzAnnual = composeAnnualChange(baZi, nowYear);
    const luDomain = PALACE_FOCUS[zwAnnual.entries.find((e) => e.mutagen === '祿')?.palace] ?? null;
    const jiDomain = PALACE_FOCUS[zwAnnual.entries.find((e) => e.mutagen === '忌')?.palace] ?? null;
    const catWord = bzAnnual.category ? bzAnnual.category.replace('運', '') : null;
    cardTitle = `${esc(name)}的 ${nowYear} 年`;
    cardSub = `${esc(zwAnnual.ganZhi)}年運勢重點`;
    tag1 = { label: '順風領域', value: luDomain ?? '平穩經營' };
    tag2 = { label: '留意領域', value: jiDomain ?? '無明顯壓力點' };
    quote = `「${nowYear}年${catWord ? `整體是「${catWord}」性質的一年` : '運勢平穩'}${luDomain ? `,${luDomain}迎來順風` : ''}${jiDomain ? `;${jiDomain}宜放慢腳步` : ''}。」`;
  }

  const cardEl = STEM_EL[dayStem]; // 用日主天干的五行,替命卡上色做個人化區隔(木火土金水各不同)
  $('#view-share').innerHTML = `<div class="share-wrap">
    <div style="flex-basis:100%;display:flex;gap:10px">
      <button type="button" class="report-tab${isAnnualCard ? '' : ' active'}" data-card="life">本命卡</button>
      <button type="button" class="report-tab${isAnnualCard ? ' active' : ''}" data-card="annual">${nowYear} 流年卡</button>
    </div>
    <div class="fate-card" id="fate-card" style="--el-accent:${EL_COLOR[cardEl]}">
      <div class="fate-brand"><div class="brand-icon">命</div><span>紫微斗數．八字排盤</span><span class="fate-el-chip" title="日主五行：${esc(cardEl)}">${esc(cardEl)}</span></div>
      <div class="fate-id">
        <div class="fate-name">${cardTitle}</div>
        <div class="fate-birth">${cardSub}</div>
        <div class="fate-tags">
          <div class="fate-tag"><div class="t-label">${esc(tag1.label)}</div><div class="t-value">${esc(tag1.value)}</div></div>
          <div class="fate-tag"><div class="t-label">${esc(tag2.label)}</div><div class="t-value">${esc(tag2.value)}</div></div>
        </div>
      </div>
      <div class="fate-quote">${esc(quote)}</div>
      <div class="fate-qr">
        <div class="qr-box" id="qr-box"><span>QR CODE</span></div>
        <div class="qr-hint">掃描查看完整命盤</div>
      </div>
    </div>
    <div class="share-actions">
      <h3>分享這張命卡</h3>
      <button type="button" class="share-btn" id="btn-download"><span class="icon-square"></span>下載圖片</button>
      <button type="button" class="share-btn" id="btn-copy"><span class="icon-circle"></span>複製連結</button>
      <button type="button" class="share-btn" id="btn-line"><span class="icon-diamond"></span>分享至 LINE</button>
      <button type="button" class="share-btn" id="btn-annual-report"><span class="icon-square"></span>複製年度完整報告</button>
    </div>
  </div>`;

  $$('#view-share [data-card]').forEach((tab) =>
    tab.addEventListener('click', () => { state.shareCard = tab.dataset.card; renderShare(); }));

  // 真實 QR Code(內容 = 可分享的命盤連結;qrcode 套件動態載入)
  import('qrcode')
    .then((m) => (m.default ?? m).toDataURL(shareUrl(), {
      width: 168, margin: 1,
      color: { dark: '#2b2621', light: '#fbf6ec' },
    }))
    .then((url) => {
      $('#qr-box').style.background = 'none';
      $('#qr-box').innerHTML = `<img src="${url}" alt="命盤連結 QR Code" width="84" height="84" />`;
    }).catch(() => { /* 保留佔位圖 */ });

  $('#btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast('已複製命盤連結');
    } catch { toast('複製失敗,請手動複製網址'); }
  });
  $('#btn-line').addEventListener('click', () =>
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl())}`, '_blank'));
  $('#btn-download').addEventListener('click', async () => {
    try {
      toast('產生圖片中…');
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng($('#fate-card'), { pixelRatio: 2, backgroundColor: '#fbf6ec' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = isAnnualCard ? `${name}-${nowYear}流年卡.png` : `${name}-命卡.png`;
      a.click();
      toast('已下載命卡圖片');
    } catch { toast('圖片匯出失敗,請改用截圖'); }
  });
  $('#btn-annual-report').addEventListener('click', async () => {
    const annualText = [
      `${name}｜${nowYear} 年度報告`,
      `大限：${zwLuck.decadal?.text ?? '—'}`,
      `紫微流年：${zwLuck.annual?.text ?? '—'}`,
      `八字流年：${bzLuck.annual?.text ?? '—'}`,
      '提醒：內容為傳統術數文化參考，不構成醫療、財務或人生決策建議。',
    ].join('\n\n');
    try { await navigator.clipboard.writeText(annualText); toast('已複製年度完整報告'); }
    catch { toast('複製失敗，請確認剪貼簿權限'); }
  });
}

// ---------- Toast / 視圖切換 ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

const VIEWS = ['dashboard', 'topics', 'report', 'comprehensive', 'synastry', 'share', 'compare', 'naming', 'metaphysics'];

function switchView(view) {
  state.view = view;
  $$('.nav-item[data-view]').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  // 「白話摘要／專業依據」按鈕在重點解讀頁對應的是分頁各自的 reportViewMode,離開/進入這個頁面時
  // 按鈕要立刻反映正確頁面的模式,不然切頁面回來後按鈕看起來像是「壞掉」(顯示上一頁的狀態)
  if (state.data) syncModeToggleUI();
  if (state.data) $('#copy-ai-btn').hidden = view === 'topics';
  if (matchMedia('(max-width: 900px)').matches) {
    $('.sidebar').classList.remove('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
    $('#main-content').scrollIntoView({ block: 'start' });
    $('#main-content').focus();
  }
}

// ---------- 歷史命盤比對 ----------

/** 命宮主星白話標籤(空宮則標示借對宮星曜,與命盤小教室邏輯一致) */
/** 命宮主星名稱陣列(空宮則借對宮,不重複算命盤小教室的邏輯) */
function lifePalaceStarNames(ziWei) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  if (life.majorStars.length) return { stars: life.majorStars.map((s) => s.name), borrowed: false };
  const oppBranch = BRANCHES[(BRANCHES.indexOf(life.position[1]) + 6) % 12];
  const opp = byBranch[oppBranch];
  return { stars: opp?.majorStars.map((s) => s.name) ?? [], borrowed: true };
}

function mainStarsLabelOf(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const palace = ziWei.palaces.find((p) => p.name === palaceName);
  if (palace.majorStars.length) return palace.majorStars.map((s) => s.name).join('、');
  const oppBranch = BRANCHES[(BRANCHES.indexOf(palace.position[1]) + 6) % 12];
  const opp = byBranch[oppBranch];
  return opp?.majorStars.length ? `借${opp.name}:${opp.majorStars.map((s) => s.name).join('、')}` : '（無主星）';
}

/** 依已存命盤的生辰資料,現場排一次盤(不佔用 state.data,只給比對頁用) */
async function computeCompareEntry(c) {
  const { convertToZiWei, convertToBaZi } = await loadEngines();
  const hourUnknown = c.hour === 'unknown';
  const hour = hourUnknown ? 11 : Number(c.hour);
  const [y, m, d] = c.date.split('-').map(Number);
  const input = { year: y, month: m, day: d, hour, gender: c.gender };
  const ziWei = convertToZiWei(input);
  const baZi = convertToBaZi(input);
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));

  const nowYear = new Date().getFullYear();
  const nominalAge = nowYear - y + 1;
  const limitIdx = Math.max(0, ziWei.majorLimits.findIndex((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return nominalAge >= a && nominalAge <= b;
  }));
  const limit = ziWei.majorLimits[limitIdx];
  const liunianGz = yearGanZhi(nowYear);

  return {
    name: c.name,
    date: c.date,
    gender: c.gender,
    hourUnknown,
    lifeStars: mainStarsLabelOf(ziWei, '命宮'),
    bodyPalaceName: ziWei.bodyPalaceName,
    fiveElementBureau: ziWei.fiveElementBureau,
    dayStem: baZi.fourPillars.dayPillar.stem,
    yongshen: computeYongShen(baZi),
    limit: { ageRange: limit.ageRange, palace: byBranch[limit.ganZhi[1]].name },
    liunian: { year: nowYear, ganZhi: liunianGz, palace: byBranch[liunianGz[1]].name },
  };
}

function renderCompareChecks(list) {
  return list.map((c, i) => `
    <label class="compare-check">
      <input type="checkbox" data-cmp="${i}"${state.compareSelected.has(i) ? ' checked' : ''} />
      <span class="compare-check-name">${esc(c.name)}</span>
      <span class="compare-check-date">${esc(c.date)}</span>
    </label>`).join('');
}

function renderCompareTable(entries) {
  const rows = [
    ['生辰', (e) => `${e.date}${e.hourUnknown ? '・時辰未知' : ''}・${e.gender === 'male' ? '男' : '女'}`],
    ['命宮主星', (e) => e.lifeStars],
    ['身宮', (e) => e.bodyPalaceName],
    ['五行局', (e) => e.fiveElementBureau],
    ['日主／身強弱', (e) => `${e.dayStem}(${e.yongshen.dayEl}）・${e.yongshen.strength}`],
    ['喜用神', (e) => e.yongshen.favorable.map((f) => f.element).join('、') || '—'],
    ['忌神', (e) => e.yongshen.unfavorable.map((f) => f.element).join('、') || '—'],
    ['目前大限', (e) => `${e.limit.ageRange}歲・${e.limit.palace}`],
    [`${entries[0].liunian.year} 年流年`, (e) => `${e.liunian.ganZhi}・${e.liunian.palace}`],
  ];
  const head = `<thead><tr><th></th>${entries.map((e) => `<th>${esc(e.name)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map(([label, fn]) =>
    `<tr><th>${esc(label)}</th>${entries.map((e) => `<td>${esc(fn(e))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="card compare-result-card">
    <div class="card-label">比對結果</div>
    <div class="compare-table-wrap"><table class="compare-table">${head}${body}</table></div>
  </div>`;
}

function renderCompare() {
  const list = loadSavedCharts();
  $('#view-compare').innerHTML = `<div class="stack">
    <div class="card">
      <div class="card-label">歷史命盤比對</div>
      <div class="card-hint">想知道你跟家人、朋友的命盤差在哪,或同一個人不同時期存的命盤有什麼變化?從已存命盤勾選 2–4 筆,就能並排比較命宮主星、五行局、日主喜忌與今年流年重點。</div>
      ${list.length
        ? `<div class="compare-checks">${renderCompareChecks(list)}</div>
           <button type="button" class="submit-btn compare-run-btn" id="run-compare">開始比較</button>`
        : `<p class="welcome-text muted">目前沒有已存的命盤,先在左側「☆ 儲存目前命盤」存幾筆,才能比較。</p>`}
    </div>
    <div id="compare-result"></div>
  </div>`;

  $$('#view-compare [data-cmp]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const i = Number(cb.dataset.cmp);
      if (cb.checked) state.compareSelected.add(i); else state.compareSelected.delete(i);
    }));

  $('#run-compare')?.addEventListener('click', async () => {
    const picked = [...state.compareSelected].filter((i) => list[i]).sort((a, b) => a - b);
    if (picked.length < 2) return toast('請至少勾選 2 筆命盤');
    if (picked.length > 4) return toast('最多同時比較 4 筆,請取消一些勾選');
    const btn = $('#run-compare');
    btn.disabled = true;
    btn.textContent = '計算中…';
    try {
      const entries = await Promise.all(picked.map((i) => computeCompareEntry(list[i])));
      $('#compare-result').innerHTML = renderCompareTable(entries);
    } catch {
      toast('比對失敗,請重新整理頁面再試一次');
    } finally {
      btn.disabled = false;
      btn.textContent = '開始比較';
    }
  });
}

// ---------- 姓名學 ----------

function renderWuGeCard(result) {
  if (!result.ok) {
    if (result.unsupported) {
      return `<div class="card"><div class="card-hint" style="margin:0">目前只支援單姓/複姓(1~2字)搭配單名/雙名(1~2字)的組合,這個姓名結構暫不支援計算。</div></div>`;
    }
    return `<div class="card"><div class="card-hint" style="margin:0">「${esc(result.unknown.join('、'))}」目前不在收錄的姓名用字字典裡(字典僅收錄約 780 個常見姓氏與命名用字),無法計算五格,不做臆測。</div></div>`;
  }
  const rows = ['天格', '人格', '地格', '外格', '總格']
    .map((k) => `<div class="wuge-cell"><div class="wuge-label">${k}</div><div class="wuge-num">${result.grid[k]}</div><div class="wuge-el">${result.elements[k]}</div></div>`)
    .join('');
  return `<div class="card">
    <div class="card-label">五格剖象法</div>
    <div class="card-hint">五格剖象法是華人姓名學常見的筆畫分析法:把姓名拆成「天格」(祖蔭根基)、「人格」(自己的個性,通常最關鍵)、「地格」(早年運)、「外格」(人際外緣)、「總格」(晚年整體運)五組數字,再看彼此的五行銜接順不順。以下數字採熊崎氏姓名學公式實算;三才只看五行生剋大方向,不做 81 數理逐條吉凶(那需要另一套龐大對照表,沒把握逐條核對正確就不硬做)。</div>
    <div class="wuge-grid">${rows}</div>
    <div class="reading-line">${esc(result.sancai.tianRenNote)}</div>
    <div class="reading-line">${esc(result.sancai.renDiNote)}</div>
  </div>`;
}

function renderNameElementCard(fullName) {
  if (!state.data) {
    return `<div class="card"><div class="card-hint" style="margin:0">姓名五行 × 喜用神比對需要先有一張命盤——請先在左側輸入生辰排盤,再回來看這張名字跟你的命盤搭不搭。</div></div>`;
  }
  const ys = computeYongShen(state.data.baZi);
  const r = analyzeNameElements(fullName, ys);
  const rows = r.known.map((k) =>
    `<div class="wuge-cell"><div class="wuge-label">${esc(k.char)}</div><div class="wuge-num">${k.strokes}畫</div><div class="wuge-el">${k.element}</div></div>`).join('');

  // 紫微角度:命宮主星五行 vs 姓名五行(兩套系統各自獨立,沒有官方合併算法,誠實呈現兩邊各自看到什麼,不做過度延伸的綜合結論)
  const life = lifePalaceStarNames(state.data.ziWei);
  const zw = analyzeZiweiOverlap(r.known, life.stars);
  let zwLine = '';
  if (zw) {
    const starLabel = `${life.borrowed ? '(借對宮)' : ''}${zw.stars.join('、')}`;
    zwLine = zw.overlap.length
      ? `<div class="reading-line"><span class="lead red">紫微角度　</span>命宮主星${esc(starLabel)}五行屬${esc(zw.starEls.join('、'))},跟姓名裡的${esc(zw.overlap.join('、'))}是同一個五行,兩套系統在這點上是一致的參考訊號。</div>`
      : `<div class="reading-line"><span class="lead red">紫微角度　</span>命宮主星${esc(starLabel)}五行屬${esc(zw.starEls.join('、'))},姓名用字裡沒有這個五行,跟八字喜用神的判斷是兩個獨立角度,可以當作額外參考,不代表互相矛盾。</div>`;
  }

  return `<div class="card">
    <div class="card-label">姓名五行 × ${esc(state.data.name)}的紫微八字</div>
    <div class="card-hint">每個人的八字都能算出「喜用神」(對你比較有幫助的五行)跟「忌神」(比較不搭的五行)——排盤時就已經算好。這裡是看姓名用字的五行組成跟你的喜用神/忌神合不合,再補一段紫微命宮主星五行的參考角度。喜用神判斷跟深度解析頁的八字綜合解讀是同一份邏輯。</div>
    ${rows ? `<div class="wuge-grid">${rows}</div>` : ''}
    <div class="reading-line"><span class="lead gold">判斷　</span>${esc(r.verdict)}</div>
    <div class="reading-line">${esc(r.verdictNote)}</div>
    ${zwLine}
    ${r.unknown.length ? `<div class="card-hint" style="margin:8px 0 0">「${esc(r.unknown.join('、'))}」不在收錄字典裡,未納入判斷。</div>` : ''}
  </div>`;
}

function renderNaming() {
  const { surname, given } = state.naming;
  const fullName = `${surname}${given}`;
  const hasInput = surname.trim() && given.trim();

  let resultHtml = '';
  let aiBtnHtml = '';
  if (hasInput) {
    resultHtml = `${renderWuGeCard(computeWuGe(surname, given))}${renderNameElementCard(fullName)}`;
    if (state.data) {
      aiBtnHtml = `<button type="button" class="mini-btn" id="copy-naming-prompt" style="margin-top:12px">複製姓名學 AI 提示詞(生成賦予特質/天賦/隱患/事業運勢/人生階段運勢/生肖速配長文解讀)</button>`;
    }
  }

  $('#view-naming').innerHTML = `<div class="stack">
    <div class="card">
      <div class="card-label">姓名學</div>
      <div class="card-hint">這裡用兩個角度分析一個名字:「五格剖象法」用筆畫數字看名字的架構跟運勢傾向,「姓名五行」看名字用字的五行屬性跟你的命盤搭不搭。輸入姓、名(各 1~2 字)就能看結果,不會被儲存或上傳,純本機計算。</div>
      <div class="naming-form">
        <input id="naming-surname" type="text" placeholder="姓" aria-label="姓" maxlength="2" value="${esc(surname)}" />
        <input id="naming-given" type="text" placeholder="名" aria-label="名" maxlength="2" value="${esc(given)}" />
        <button type="button" class="submit-btn naming-submit" id="naming-run">分析</button>
      </div>
      ${aiBtnHtml}
    </div>
    ${resultHtml}
  </div>`;

  $('#naming-surname').addEventListener('input', (e) => { state.naming.surname = e.target.value.trim(); });
  $('#naming-given').addEventListener('input', (e) => { state.naming.given = e.target.value.trim(); });
  $('#naming-run').addEventListener('click', () => renderNaming());
  $('#copy-naming-prompt')?.addEventListener('click', async () => {
    const text = formatNamingPromptForAI({
      input: state.data.input, surname, given, baZi: state.data.baZi, ziWei: state.data.ziWei,
    });
    if (!text) return toast('姓名用字不在字典裡,無法產生提示詞');
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製,可貼給AI生成完整解讀');
    } catch { toast('複製失敗,請確認瀏覽器剪貼簿權限'); }
  });
}

// ---------- 進階玄學：回訪工具、驗盤、擇日與三種術數 ----------
const META_TABS = [
  ['daily', '每日／週運'], ['timeline', '生涯時間軸'], ['rectify', '時辰驗盤'],
  ['dates', '個人擇日'], ['iching', '易經占卜'], ['meihua', '梅花易數'], ['qimen', '奇門遁甲'],
];
const META_INFO = {
  daily: { title: '我想安排這週的生活', use: '用出生八字與每天干支整理未來七日的主題，適合安排工作、休息與溝通節奏。', need: '已完成的本命排盤', steps: ['查看今天的十神主題', '比較未來七日差異', '把摘要交給 AI 轉成行動建議'] },
  timeline: { title: '我想回顧人生階段', use: '把十年大限與真實事件放在同一條時間軸，觀察哪些主題曾經反覆出現。', need: '本命盤；可選填過往事件', steps: ['瀏覽十年大限', '加入轉職、搬家等事件', '請 AI 協助找出模式'] },
  rectify: { title: '我不確定出生時辰', use: '一次比較十二時辰的命宮、身宮與主星，再用可驗證的經歷逐步排除候選。', need: '確定的出生日期與幾件過往大事', steps: ['產生十二時辰候選', '找出差異最大的候選', '讓 AI 提出驗盤問題'] },
  dates: { title: '我想挑一個合適日期', use: '依用途搜尋未來 30 日，綜合黃曆宜忌與是否直接沖到本命年支或日支。', need: '本命盤、用途與日期範圍', steps: ['選擇嫁娶、入宅等用途', '搜尋並排除現實不可行日期', '比較前幾名的取捨'] },
  iching: { title: '我有一個具體問題', use: '模擬三錢起卦，以本卦、動爻與變卦提供思考角度，適合面對選擇或梳理局勢。', need: '一個單一、具體、可行動的問題', steps: ['先寫下問題', '專心起卦一次', '先看白話重點再深入解讀'] },
  meihua: { title: '我想用當下時間起卦', use: '依年月日時與靈感數字取卦，觀察體用、五行與事情的變化方向。', need: '起卦時間；靈感數字可不填', steps: ['確認當下時間', '可加入第一個想到的數字', '閱讀本卦、動爻與變卦'] },
  qimen: { title: '我想認識時空盤的結構', use: '用九宮呈現八門、九星與八神，適合學習奇門盤的基本組成。第一版不是完整專業斷局。', need: '排盤時間與目前節氣', steps: ['選擇時間與節氣', '查看九宮配置', '從開門、生門等象徵開始學習'] },
};
const EVENT_KEY = 'zwbz-life-events';
const loadEvents = () => { try { return JSON.parse(localStorage.getItem(EVENT_KEY)) ?? []; } catch { return []; } };
const saveEvents = (items) => { try { localStorage.setItem(EVENT_KEY, JSON.stringify(items.slice(-50))); } catch { /* ignore */ } };
const aiButton = (id, label = '複製給 AI 深入解讀') => `<div class="meta-ai-action"><button type="button" class="mini-btn" id="${id}">${label}</button><small>只會複製到剪貼簿；貼到外部 AI 前請確認內容是否含個人資料。</small></div>`;
function bindAiPrompt(id, prompt) {
  $(`#${id}`)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prompt); toast('已複製專用 AI 解讀提示詞'); }
    catch { toast('複製失敗，請確認剪貼簿權限'); }
  });
}
function aiPromptBase(tool, result, question = '') {
  return `你是一位熟悉傳統術數、但不採宿命論的繁體中文解讀者。\n工具：${tool}\n${question ? `使用者問題：${question}\n` : ''}計算結果：\n${result}\n\n請依序回答：\n1. 先用三句白話摘要重點。\n2. 說明每個術語代表什麼，以及推論如何從結果而來。\n3. 分成「可運用的方向」「需要留意」「一個可立即執行的行動」。\n4. 明確區分傳統象徵、推測與已知事實。\n5. 不預言死亡、疾病、災難或保證財運；醫療、法律、財務問題應建議尋求專業意見。\n6. 若資料不足或規則存在門派差異，直接說明限制。`;
}

// 「今天適合先看」的預設 3 個工具:不用額外輸入資料就能立刻用,對第一次來的人負擔最小;
// 其餘 4 個(需要時間軸事件、候選時辰比對、日期範圍搜尋、排盤時間)點「顯示其餘工具」再展開,
// 避免一進頁面就是 7 張卡片的資訊量。
const META_PRIORITY_KEYS = ['daily', 'iching', 'meihua'];

// 導覽卡片的內容獨立成一個函式:展開/收合只重繪這一小塊,不重跑整個 metaShell(body)——
// 否則像「每日週運」這種本體是非同步計算的分頁,點一下展開/收合會讓已經算好的結果整個被清空重算。
function metaGuideHtml() {
  const guideKeys = state.metaGuideExpanded ? META_TABS.map(([key]) => key) : META_PRIORITY_KEYS;
  const guideCards = guideKeys.map((key) => `<button type="button" data-meta-jump="${key}"${state.metaphysicsTab === key ? ' class="active"' : ''}><b>${META_INFO[key].title}</b><span>${META_INFO[key].use}</span></button>`).join('');
  // 按鈕文字直接列出被收合的工具名稱,而不是「其餘 4 個工具」這種空泛說法——
  // 讓已經知道自己要找什麼的人(例如想確認時辰的人),一眼就能認出「時辰驗盤」藏在這裡,不用先點開才知道
  const hiddenLabels = META_TABS.filter(([key]) => !META_PRIORITY_KEYS.includes(key)).map(([, label]) => label);
  const guideToggle = hiddenLabels.length > 0
    ? `<button type="button" class="mini-btn" id="meta-guide-toggle" style="margin-top:10px">${state.metaGuideExpanded ? '︿ 收合' : `＋ 還有${hiddenLabels.join('、')}等 ${hiddenLabels.length} 個工具`}</button>`
    : '';
  return `<div class="card-label" id="meta-guide-title">不知道從哪開始？先選你的目的</div><div class="card-hint" style="margin:0 0 10px">${state.metaGuideExpanded ? '全部 7 個工具:' : '先列出不用額外準備、今天就能直接用的幾個:'}</div><div class="meta-choices">${guideCards}</div>${guideToggle}`;
}

function bindMetaGuideEvents() {
  $$('#view-metaphysics .meta-guide [data-meta-jump]').forEach((btn) =>
    btn.addEventListener('click', () => { state.metaphysicsTab = btn.dataset.metaJump; renderMetaphysics(); }));
  $('#meta-guide-toggle')?.addEventListener('click', () => {
    state.metaGuideExpanded = !state.metaGuideExpanded;
    const el = $('.meta-guide');
    if (el) { el.innerHTML = metaGuideHtml(); bindMetaGuideEvents(); }
  });
}

function metaShell(body) {
  const info = META_INFO[state.metaphysicsTab];
  const tabs = META_TABS.map(([key, label]) => `<button type="button" class="report-tab${state.metaphysicsTab === key ? ' active' : ''}" data-meta="${key}" aria-pressed="${state.metaphysicsTab === key}">${label}</button>`).join('');
  const guide = `<section class="card meta-guide" aria-labelledby="meta-guide-title">${metaGuideHtml()}</section>`;
  const intro = `<section class="card meta-intro"><div><span class="meta-kicker">目前工具</span><h2>${info.title}</h2><p>${info.use}</p><small>需要：${info.need}</small></div><ol>${info.steps.map((s) => `<li>${s}</li>`).join('')}</ol></section>`;
  $('#view-metaphysics').innerHTML = `${guide}<div class="meta-tabs" role="tablist" aria-label="進階玄學工具">${tabs}</div>${intro}<div class="stack">${body}</div>`;
  $$('#view-metaphysics [data-meta]').forEach((btn) => btn.addEventListener('click', () => { state.metaphysicsTab = btn.dataset.meta; renderMetaphysics(); }));
  bindMetaGuideEvents();
}

async function renderDaily() {
  metaShell('<div class="card"><div class="card-label">每日／週運</div><div class="card-hint">正在計算今天與未來七日的個人節奏…</div></div>');
  const { convertToBaZi, Solar } = await loadEngines();
  const { baZi, ziWei, byBranch, input } = state.data;
  const birthStem = baZi.fourPillars.dayPillar.stem;
  const yongshen = computeYongShen(baZi);
  const avoidEls = new Set(yongshen.unfavorable.map((f) => f.element));
  const nominalAge = new Date().getFullYear() - input.year + 1;
  const curLimit = ziWei.majorLimits.find((l) => { const [a, b] = l.ageRange.split('~').map(Number); return nominalAge >= a && nominalAge <= b; }) ?? ziWei.majorLimits[0];
  const curLimitPalace = byBranch[curLimit.ganZhi[1]]?.name ?? '—';
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dayBazi = convertToBaZi({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: 12, gender: state.data.input.gender });
    const dayStem = dayBazi.fourPillars.dayPillar.stem, dayBranch = dayBazi.fourPillars.dayPillar.branch;
    const gz = `${dayStem}${dayBranch}`;
    const god = tenGodOf(birthStem, dayStem);
    const lunar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
    const yi = trad(lunar.getDayYi().slice(0, 3).join('、')) || '日常安排';
    const themes = { 比肩:'自主與執行', 劫財:'合作與界線', 食神:'創作與休息', 傷官:'表達與突破', 偏財:'機會與人脈', 正財:'務實與財務', 七殺:'挑戰與決斷', 正官:'責任與秩序', 偏印:'研究與轉念', 正印:'學習與支持' };
    const avoidHit = avoidEls.has(STEM_EL[dayStem]) || avoidEls.has(BRANCH_EL[dayBranch]);
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, week: `週${'日一二三四五六'[d.getDay()]}`, gz, god, yi, theme: themes[god] ?? '穩定推進', avoidHit };
  });
  metaShell(`<div class="card"><div class="card-label">未來七日節奏</div><div class="card-hint">依你的日主與每日干支十神關係整理，並標示是否貼近你八字的忌神五行；宜忌取自傳統黃曆，只作行程反思。</div><p class="reading-line"><span class="lead gold">目前大限　</span>${esc(curLimit.ageRange)}歲・${esc(curLimitPalace)}——本週節奏可搭配這個階段的重心一起看。</p><div class="daily-grid">${days.map((x, i) => `<article class="daily-card${i === 0 ? ' today' : ''}${x.avoidHit ? ' caution' : ''}">${x.avoidHit ? '<span class="daily-flag">忌神日</span>' : ''}<b>${x.date} ${x.week}</b><span>${x.gz}・${x.god}</span><strong>${x.theme}</strong><small>傳統宜：${x.yi}</small></article>`).join('')}</div></div>
    <div class="card"><div class="card-label">本週提醒</div><p class="reading-line">把十神當成每日的觀察鏡頭，忌神日不代表當天必然不順，只是提醒可以放慢決策、多留一點彈性。工作安排優先看現實期限、身心狀態與專業建議。</p><button type="button" class="mini-btn" id="copy-week" style="margin-left:0">複製本週摘要</button>${aiButton('ai-daily')}</div>`);
  $('#copy-week')?.addEventListener('click', async () => { await navigator.clipboard.writeText(days.map((x) => `${x.date} ${x.gz} ${x.god}${x.avoidHit ? '(忌神日)' : ''}：${x.theme}`).join('\n')); toast('已複製本週摘要'); });
  bindAiPrompt('ai-daily', formatDailyPromptForAI({ input, baZi, ziWei, days, curLimit, curLimitPalace, favorable: yongshen.favorable, unfavorable: yongshen.unfavorable }));
}

function renderTimeline() {
  const events = loadEvents();
  const { ziWei, baZi, input, byBranch } = state.data;
  const blocks = ziWei.majorLimits.map((l) => {
    const [start, end] = l.ageRange.split('~').map(Number);
    const from = input.year + start - 1; const to = input.year + end - 1;
    const palace = byBranch[l.ganZhi[1]]?.name ?? '—';
    const inside = events.filter((e) => Number(e.year) >= from && Number(e.year) <= to);
    const decadal = flat(composeZiWeiDecadalChange(ziWei, l, { mode: state.readingMode }).text);
    return `<article class="timeline-block"><div class="timeline-age">${start}–${end}歲</div><div><b>${from}–${to}・${esc(palace)}</b><div class="tl-body"><p>${esc(flat(readingOf(palace)?.text ?? ''))}</p><p class="reading-line"><span class="lead gold">大限四化　</span>${esc(decadal)}</p></div><button type="button" class="tl-toggle">展開全部內容 ﹀</button>${inside.map((e) => `<span class="event-tag">${esc(e.year)} ${esc(e.title)}</span>`).join('')}</div></article>`;
  }).join('');
  metaShell(`<div class="card"><div class="card-label">生涯運勢時間軸</div><div class="card-hint">將每個十年大限的宮位、四化重點與你輸入的真實事件並排，用來回顧與驗證；不是預言未來必然發生的事情。</div><div class="timeline">${blocks}</div></div>
    <div class="card"><div class="card-label">加入過往事件</div><div class="event-form"><input id="event-year" type="number" min="1900" max="2100" placeholder="年份" aria-label="事件年份"><input id="event-title" maxlength="40" placeholder="例如：轉職、搬家、結婚" aria-label="事件名稱"><button id="event-add" type="button" class="submit-btn">加入時間軸</button></div>${events.length ? `<div class="event-list">${events.map((e, i) => `<button type="button" data-event-del="${i}" title="刪除事件">${esc(e.year)}・${esc(e.title)} ×</button>`).join('')}</div>` : ''}${aiButton('ai-timeline', '複製時間軸給 AI 分析')}</div>`);
  $('#event-add')?.addEventListener('click', () => { const year=$('#event-year').value; const title=$('#event-title').value.trim(); if(!year||!title)return toast('請輸入年份與事件'); const next=[...loadEvents(),{year:Number(year),title}]; saveEvents(next); renderTimeline(); });
  $$('[data-event-del]').forEach((b) => b.addEventListener('click', () => { const list=loadEvents(); list.splice(Number(b.dataset.eventDel),1); saveEvents(list); renderTimeline(); }));
  // 手機版預設把每個大限的詳細內容收合成兩行預覽,點「展開全部內容」再看完整段落——
  // 十個大限一次全展開,在窄螢幕上是一長串文字牆,先看結論比較不會滑到放棄
  $$('#view-metaphysics .tl-toggle').forEach((btn) => btn.addEventListener('click', () => {
    const block = btn.closest('.timeline-block');
    const expanded = block.classList.toggle('expanded');
    btn.textContent = expanded ? '收合 ﹀' : '展開全部內容 ﹀';
  }));
  bindAiPrompt('ai-timeline', formatTimelinePromptForAI({ input, baZi, ziWei, events }));
}

function mutagenOf(ziWei, palaceName) {
  const palace = ziWei.palaces.find((p) => p.name === palaceName);
  const tags = (palace?.majorStars ?? []).filter((st) => st.mutagen).map((st) => `${st.name}化${st.mutagen}`);
  return tags.length ? tags.join('、') : '無';
}

function renderRectify() {
  metaShell(`<div class="card"><div class="card-label">時辰反推／事件驗盤</div><div class="card-hint">比較十二時辰各自排出的命宮、身宮、五行局起運年齡與命宮四化，再搭配上方時間軸的真實事件縮小候選。結果只能輔助回憶，不能證明出生時間。</div><button id="run-rectify" type="button" class="submit-btn compare-run-btn">產生十二時辰候選</button></div><div id="rectify-result"></div>`);
  $('#run-rectify').addEventListener('click', (e) => withLoading(e.currentTarget, '計算中…', async () => {
    const { convertToZiWei } = await loadEngines(); const { input } = state.data;
    const rows = SHICHEN.map((s) => {
      const z = convertToZiWei({ ...input, hour: s.hour });
      const firstLimit = z.majorLimits[0];
      return { hour: s.name, life: z.lifePalace, body: z.bodyPalace, stars: mainStarsLabelOf(z, '命宮'), bureau: z.fiveElementBureau, startAge: firstLimit?.ageRange ?? '—', mutagen: mutagenOf(z, '命宮') };
    });
    $('#rectify-result').innerHTML = `<div class="card"><div class="card-label">候選差異</div><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>時辰</th><th>命宮</th><th>身宮</th><th>命宮主星</th><th>五行局／起運</th><th>命宮四化</th></tr></thead><tbody>${rows.map((r) => `<tr><th>${r.hour}</th><td>${r.life}</td><td>${r.body}</td><td>${r.stars}</td><td>${esc(r.bureau)}・${esc(r.startAge)}歲</td><td>${esc(r.mutagen)}</td></tr>`).join('')}</tbody></table></div><p class="card-hint">下一步：用已知事件年份對照各候選盤的大限宮位與起運年齡，不要只用個性描述選擇時辰——起運年齡通常最容易用童年記憶驗證。</p>${aiButton('ai-rectify', '複製候選時辰給 AI 協助提問')}</div>`;
    bindAiPrompt('ai-rectify', aiPromptBase('紫微斗數時辰反推助手', rows.map((r) => `${r.hour}｜命宮${r.life}｜身宮${r.body}｜主星${r.stars}｜${r.bureau}・${r.startAge}歲起運｜命宮四化：${r.mutagen}`).join('\n') + `\n已記錄事件：${loadEvents().map((e) => `${e.year} ${e.title}`).join('；') || '無'}`, '請不要直接替我決定出生時辰；請優先用起運年齡與命宮四化這類可被童年記憶驗證的線索，設計最多 8 個能區分候選盤的問題。'));
  }));
}

function renderDates() {
  metaShell(`<div class="card"><div class="card-label">個人擇日</div><div class="card-hint">選擇用途與日期範圍，綜合傳統黃曆「宜」、是否沖到你的年支／日支、是否與本命年支或日支三合六合，以及候選日地支五行是否貼近你八字的喜用神來排序。這是文化參考，不凌駕醫療、法律、天候與參與者行程。</div><div class="date-form"><select id="date-purpose" aria-label="擇日用途"><option>嫁娶</option><option>入宅</option><option>開市</option><option>交易</option><option>出行</option><option>求醫</option></select><input id="date-start" type="date" aria-label="開始日期"><button id="date-run" type="button" class="submit-btn">搜尋未來 30 日</button></div></div><div id="date-results"></div>`);
  $('#date-start').value = new Date().toISOString().slice(0,10);
  $('#date-run').addEventListener('click', async () => {
    const { Solar } = await loadEngines();
    const purpose = $('#date-purpose').value;
    const start = new Date($('#date-start').value);
    const birthBranches = [state.data.baZi.fourPillars.yearPillar.branch, state.data.baZi.fourPillars.dayPillar.branch];
    const CLASH = { 子:'午', 丑:'未', 寅:'申', 卯:'酉', 辰:'戌', 巳:'亥', 午:'子', 未:'丑', 申:'寅', 酉:'卯', 戌:'辰', 亥:'巳' };
    const LIUHE = { 子:'丑', 丑:'子', 寅:'亥', 亥:'寅', 卯:'戌', 戌:'卯', 辰:'酉', 酉:'辰', 巳:'申', 申:'巳', 午:'未', 未:'午' };
    const SANHE_GROUPS = [['申','子','辰'], ['亥','卯','未'], ['寅','午','戌'], ['巳','酉','丑']];
    const BRANCH_EL = { 子:'水', 丑:'土', 寅:'木', 卯:'木', 辰:'土', 巳:'火', 午:'火', 未:'土', 申:'金', 酉:'金', 戌:'土', 亥:'水' };
    const sanheWith = (a, b) => SANHE_GROUPS.some((g) => a !== b && g.includes(a) && g.includes(b));
    const yongshen = computeYongShen(state.data.baZi);
    const favEls = new Set(yongshen.favorable.map((f) => f.element));
    const avoidEls = new Set(yongshen.unfavorable.map((f) => f.element));
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
      const yi = l.getDayYi().map(trad);
      const branch = l.getDayZhi();
      const branchEl = BRANCH_EL[branch];
      const personalClash = birthBranches.some((b) => CLASH[b] === branch);
      const liuhe = birthBranches.some((b) => LIUHE[b] === branch);
      const sanhe = birthBranches.some((b) => sanheWith(branch, b));
      const favMatch = favEls.has(branchEl);
      const avoidMatch = avoidEls.has(branchEl);
      const score = (yi.includes(purpose) ? 3 : 0) - (personalClash ? 3 : 0) + (liuhe ? 2 : 0) + (sanhe ? 2 : 0) + (favMatch ? 2 : 0) - (avoidMatch ? 2 : 0);
      return { date: d.toISOString().slice(0, 10), gz: l.getDayInGanZhi(), branchEl, yi, ji: l.getDayJi().slice(0, 3).map(trad), score, personalClash, liuhe, sanhe, favMatch, avoidMatch };
    }).sort((a, b) => b.score - a.score).slice(0, 8);
    $('#date-results').innerHTML = `<div class="card"><div class="card-label">推薦候選日</div><p class="reading-line">先排除現實不可行的日期，再從前幾名比較；分數綜合黃曆宜忌、支沖合、與你八字喜用神的五行是否相合，只是排序參考。</p><div class="date-results">${dates.map((x) => {
      const tags = [];
      if (x.yi.includes(purpose)) tags.push(`黃曆宜${purpose}`);
      if (x.favMatch) tags.push(`日支${x.branchEl}近喜用神`);
      if (x.avoidMatch) tags.push(`日支${x.branchEl}近忌神`);
      if (x.sanhe) tags.push('與本命三合');
      if (x.liuhe) tags.push('與本命六合');
      return `<article><b>${x.date}・${x.gz}</b><span>${tags.join('・') || '通用候選'}</span><small>${x.personalClash ? '與本命年支或日支相沖，建議再評估' : '未見直接沖年支／日支'}；忌：${x.ji.join('、') || '—'}</small></article>`;
    }).join('')}</div>${aiButton('ai-dates', '複製擇日結果給 AI 比較')}</div>`;
    bindAiPrompt('ai-dates', aiPromptBase(`個人擇日（用途：${purpose}；喜用神：${[...favEls].join('、') || '無'}；忌神：${[...avoidEls].join('、') || '無'}）`, dates.map((x) => `${x.date} ${x.gz}（日支${x.branchEl}）｜${x.yi.includes(purpose) ? `宜${purpose}` : '通用候選'}｜${x.personalClash ? '沖本命年支或日支' : '未見直接支沖'}｜${x.sanhe ? '與本命三合' : x.liuhe ? '與本命六合' : '無合'}｜${x.favMatch ? '近喜用神' : x.avoidMatch ? '近忌神' : '五行中性'}｜忌${x.ji.join('、') || '—'}`).join('\n'), '請比較各日期的取捨，說明沖合與喜用神各自的影響權重，不要聲稱某天能保證成功。'));
  });
}

function diagramHtml(result) { return `<div class="hexagram"><div class="hex-lines">${lineDiagram(result.lines,result.moving??[]).map((l)=>`<div class="hex-line${l.yang?' yang':' yin'}${l.moving?' moving':''}"><span>${l.yang?'━━━━━━':'━━　━━'}</span><small>${l.lineNo}${l.moving?' 動':''}</small></div>`).join('')}</div><div><h3>${esc(result.name)}</h3><p>上${result.upper.name}（${result.upper.nature}）・下${result.lower.name}（${result.lower.nature}）</p><p>變卦：${esc(result.changedName)}</p></div></div>`; }

function renderIChing() {
  metaShell(`<div class="card"><div class="card-label">易經・三錢起卦</div><div class="card-hint">先寫下單一、具體且可行動的問題，再模擬投擲三枚錢六次。請勿為同一問題反覆起卦直到得到喜歡的答案。</div><textarea id="iching-question" class="question-box" maxlength="160" placeholder="例如：面對這份工作選擇，我最需要留意什麼？" aria-label="占問問題"></textarea><button id="iching-cast" type="button" class="submit-btn compare-run-btn">專心起卦</button></div><div id="iching-result"></div>`);
  $('#iching-cast').addEventListener('click',()=>{const q=$('#iching-question').value.trim();if(!q)return toast('請先寫下問題');const r=castThreeCoins();const moving=r.moving.length?r.moving.join('、'):'無';$('#iching-result').innerHTML=`<div class="card"><div class="card-label">${esc(q)}</div>${diagramHtml(r)}<div class="plain-summary"><b>先看白話重點</b><p>本卦描述現在：${r.lower.image}是事情的內在基礎，${r.upper.image}是外在情勢。${r.moving.length?`第 ${moving} 爻正在變動，表示這些層次最值得留意。`:'沒有動爻，可先專注理解目前結構，不急著推演變化。'}</p></div><p class="reading-line">本卦看當下結構，動爻看變化位置，變卦看可能走向。請把象徵當作反思線索，再回到現實資訊做決定。</p>${aiButton('ai-iching')}</div>`;bindAiPrompt('ai-iching',aiPromptBase('易經三錢起卦',`本卦：${r.name}\n上卦：${r.upper.name}（${r.upper.nature}，${r.upper.image}）\n下卦：${r.lower.name}（${r.lower.nature}，${r.lower.image}）\n動爻：${moving}\n變卦：${r.changedName}`,q));});
}

function renderMeihua() {
  metaShell(`<div class="card"><div class="card-label">梅花易數・時間起卦</div><div class="card-hint">採年月日時加總取上下卦與動爻的簡化時間起卦法；不同傳承可能採農曆、地支數或外應，結果會不同。</div><div class="date-form"><input id="meihua-time" type="datetime-local" aria-label="起卦時間"><input id="meihua-number" type="number" min="0" max="9999" value="0" aria-label="靈感數字"><button id="meihua-run" type="button" class="submit-btn">起卦</button></div></div><div id="meihua-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#meihua-time').value=now.toISOString().slice(0,16);
  $('#meihua-run').addEventListener('click',()=>{
    const r=plumBlossom($('#meihua-time').value,Number($('#meihua-number').value||0));
    const ty=tiYongAnalysis(r);
    $('#meihua-result').innerHTML=`<div class="card"><div class="card-label">時間起卦結果</div>${diagramHtml({...r,moving:[r.movingLine]})}<div class="plain-summary"><b>先看白話重點</b><p>內在基礎呈現「${r.lower.image}」，外在情勢呈現「${r.upper.image}」。第 ${r.movingLine} 爻變動，提醒你把注意力放在事情發展的對應階段。</p></div><div class="tiyong-card"><b>體用斷卦　${esc(ty.relation)}</b><p>體卦：${esc(ty.ti.name)}（${esc(ty.ti.element)}）　用卦：${esc(ty.yong.name)}（${esc(ty.yong.element)}）</p><p class="reading-line">${esc(ty.tendency)}</p></div><p class="card-hint" style="margin-top:8px">體用生剋依傳統口訣(體剋用／用剋體／用生體／體生用／比和)推得，只是傾向判斷，不是定論。取數公式：${esc(r.formula)}。</p>${aiButton('ai-meihua')}</div>`;
    bindAiPrompt('ai-meihua',aiPromptBase('梅花易數時間起卦',`本卦：${r.name}\n上卦：${r.upper.name}（${r.upper.element}，${r.upper.image}）\n下卦：${r.lower.name}（${r.lower.element}，${r.lower.image}）\n動爻：第${r.movingLine}爻\n體卦：${ty.ti.name}（${ty.ti.element}）\n用卦：${ty.yong.name}（${ty.yong.element}）\n體用關係：${ty.relation}\n變卦：${r.changedName}\n取數公式：${r.formula}`,'請先解釋體用生剋的判斷依據，再給出可驗證、非宿命的行動建議。'));
  });
}

function renderQimen() {
  metaShell(`<div class="card"><div class="card-label">時家奇門・結構盤</div><div class="card-hint">依你輸入的時間，用「拆補法」自動判斷節氣、符頭與上中下元，查傳統用局表定出局數與陰陽遁，再排出這一局的地盤三奇六儀與值符值使。九宮的門／星／神目前顯示的是後天八卦本宮參考位置，還沒有加入依時干旋轉的完整天盤，請勿當作可直接斷事的專業奇門盤。</div><div class="date-form"><input id="qimen-time" type="datetime-local" aria-label="排盤時間"><button id="qimen-run" type="button" class="submit-btn">排結構盤</button></div></div><div id="qimen-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#qimen-time').value=now.toISOString().slice(0,16);
  $('#qimen-run').addEventListener('click',async ()=>{
    const { convertToBaZi, Solar } = await loadEngines();
    const gender = state.data?.input?.gender ?? '女';
    const r = qimenStructure($('#qimen-time').value, { convertToBaZi, Solar, gender });
    const zfs = r.zhiFuShi;
    $('#qimen-result').innerHTML = `<div class="card"><div class="card-label">${esc(r.dun)}${r.bureau}局・${esc(r.solarTerm)}${esc(r.yuanName)}${r.fuTou ? `（符頭${esc(r.fuTou)}）` : ''}</div>
      ${zfs ? `<p class="reading-line"><span class="lead red">值符值使　</span>值符在 ${zfs.palace} 宮（${esc(zfs.star)}星），值使為${esc(zfs.door)}。</p>` : ''}
      <div class="qimen-grid">${r.palaces.map((p) => `<div class="qimen-palace"><b>${p.palace}宮</b><span class="qimen-yiqi">${esc(p.yiqi) || '—'}</span><span>${esc(p.door)}・${esc(p.star)}</span><small>${esc(p.deity)}（本宮參考）</small></div>`).join('')}</div>
      <div class="plain-summary"><b>先看白話重點</b><p>本局三奇六儀已依你輸入的時間即時定局；${zfs ? `值符落在 ${zfs.palace} 宮，可先觀察這一時辰的行動重心。` : ''}九宮下方的門／星／神是後天八卦的固定參考位置，不是本次真正的天盤，僅供認識九宮配置之用。</p></div>
      <p class="card-hint" style="margin-top:12px">此盤已包含節氣定局與符頭三元判斷，但門派間拆補／置閏算法本有差異；八門九星八神的完整依時旋轉（天盤飛宮）尚未實作，AI 解讀也必須保留這項限制。</p>${aiButton('ai-qimen')}</div>`;
    bindAiPrompt('ai-qimen', aiPromptBase('時家奇門教學型結構盤', `${r.dun}${r.bureau}局｜節氣${r.solarTerm}${r.yuanName}｜符頭${r.fuTou ?? '未知'}\n${zfs ? `值符：${zfs.palace}宮（${zfs.star}星）｜值使：${zfs.door}\n` : ''}地盤三奇六儀：${r.palaces.map((p) => `${p.palace}宮${p.yiqi || '無'}`).join('、')}\n後天八卦本宮參考：${r.palaces.map((p) => `${p.palace}宮：${p.door}、${p.star}、${p.deity}`).join('\n')}`, '請只根據「已排出的局數、地盤三奇六儀、值符值使」做入門解釋；後天八卦本宮參考位置請說明只是九宮配置對照，不是本次天盤；不可假裝這是包含完整天盤飛宮、拆補置閏門派判斷的專業盤。'));
  });
}

function renderMetaphysics() {
  const renderers={daily:renderDaily,timeline:renderTimeline,rectify:renderRectify,dates:renderDates,iching:renderIChing,meihua:renderMeihua,qimen:renderQimen};
  return renderers[state.metaphysicsTab]?.();
}

function renderAll() {
  // 防護網:任何一段畫面組裝在排盤資料的邊界情況下出錯,都要讓使用者看得到、
  // 而不是靜默失敗、側邊欄卡死在 disabled 狀態(曾發生過大限與流年同宮時的 null 例外)。
  try {
    renderHead();
    renderDashboard();
    renderTopics();
    renderReport();
    renderComprehensive();
    renderSynastry();
    renderShare();
    renderCompare();
    renderNaming();
    renderMetaphysics();
    document.body.classList.add('has-chart');
    document.body.classList.remove('editing-chart');
    $$('.side-nav [data-view]').forEach((n) => { n.disabled = false; n.removeAttribute('aria-disabled'); });
  } catch (err) {
    console.error('renderAll 失敗:', err);
    toast('顯示命盤時發生錯誤，請重新整理頁面再試一次；若重複發生請回報這組生辰資料。');
  }
}

/**
 * 流年運勢提醒卡:已有存檔命盤時,在歡迎畫面頂部給一個直接的回訪誘因——
 * 不用重新輸入生辰,一鍵跳去看「今年」的大限流年重點(dashboard 排盤後預設就會停在現行大限流年)。
 * 只取最近存的 3 筆(saveCurrentChart 用 unshift,index 0 = 最新),避免清單太長。
 */
function renderAnnualReminderCard() {
  const list = loadSavedCharts().slice(0, 3);
  if (!list.length) return '';
  const nowYear = new Date().getFullYear();
  const rows = list.map((c, i) => `
    <button type="button" class="reminder-row" data-remind="${i}">
      <span class="reminder-name">${esc(c.name)}</span>
      <span class="reminder-cta">查看 ${nowYear} 年運勢 →</span>
    </button>`).join('');
  return `<div class="card reminder-card">
    <div class="card-label">${nowYear} 年（${esc(yearGanZhi(nowYear))}）流年提醒</div>
    <div class="card-hint">「大限」是紫微斗數裡每十年一個階段的運勢重心,「流年」是當年的運勢重點——這裡讓你不用重新輸入生辰,直接看已存命盤在今年的這兩項重點。</div>
    <div class="reminder-list">${rows}</div>
  </div>`;
}

// 進站尚未排盤時的歡迎畫面
function renderEmpty() {
  $('#page-title').textContent = '線上排盤';
  $('#birth-summary').textContent = '';
  const reminder = renderAnnualReminderCard();
  const welcome = `<div class="stack"><div class="card welcome-card">
    <div class="welcome-eyebrow">免費線上排盤・資料只在你的瀏覽器處理</div>
    <h2>用紫微與八字，看懂你現在最值得注意的方向</h2>
    <p class="welcome-text">不需要命理基礎。從愛情、工作、財運與近期運勢開始，再依需要查看完整命盤。</p>
    <div class="welcome-preview">
      <div><span>現在</span><b>今年最值得注意的事</b><small>近期重點與具體建議</small></div>
      <div><span>關係</span><b>感情中的互動模式</b><small>從問題開始，不必讀懂術語</small></div>
      <div><span>發展</span><b>適合發揮的工作方式</b><small>紫微與八字交叉整理</small></div>
    </div>
    <div class="welcome-steps"><div class="welcome-step"><b>1</b>輸入出生日期與時辰</div><div class="welcome-step"><b>2</b>產生命盤與重點摘要</div><div class="welcome-step"><b>3</b>閱讀報告、流年與宮位解析</div></div>
    <button type="button" class="welcome-cta" id="welcome-start">免費排盤，開始看重點</button>
    <p class="welcome-text muted">生辰資料不會上傳。內容供文化研究與自我探索參考。</p>
  </div>${reminder}</div>`;
  for (const v of VIEWS) $(`#view-${v}`).innerHTML = welcome;
  $$('[data-remind]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = loadSavedCharts()[Number(btn.dataset.remind)];
      if (c) await loadSavedEntry(c);
    }));
  $('#copy-ai-btn').hidden = true;
  $('#reading-mode-toggle').hidden = true;
  $('#save-chart-btn').hidden = true;
  $('#chart-profile').hidden = true;
  document.body.classList.remove('has-chart');
  $$('.side-nav [data-view]').forEach((n) => { n.disabled = true; n.setAttribute('aria-disabled', 'true'); });
  $('#welcome-start')?.addEventListener('click', () => {
    $('.sidebar').classList.add('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'true');
    // 首頁引導卡跟左側常駐表單其實是同一件事,點下去卻只是靜默 focus,
    // 使用者容易看不出兩者的關係──補上捲動＋短暫高亮,讓「按鈕把你帶去了哪裡」看得見
    $('#birth-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#birth-form').classList.add('form-highlight');
    setTimeout(() => $('#birth-form').classList.remove('form-highlight'), 1400);
    $('#name-input').focus();
  });
}

// ---------- 初始化 ----------
function setupControls() {
  birthDateCtl = wireDateParts({ yearId: '#birth-year', monthId: '#birth-month', dayId: '#birth-day', errorId: '#birth-date-error', nextId: '#birth-hour' });

  // 命盤上的符號(限/年/祿權科忌小標記、・身)原本只靠 title 屬性做 hover 提示,手機沒有 hover 等於看不到說明——
  // 綁一個委派點擊事件,點到這些符號時直接用 toast 顯示同樣的文字,桌面版 hover 仍然保留,手機版多了點擊也能看
  $('#view-dashboard').addEventListener('click', (e) => {
    const marker = e.target.closest('.luck-tag, .flow-mut, .body-mark, sup[title]');
    if (marker?.title) toast(marker.title);
  });
  // details 的 toggle 不會冒泡，但 capture 階段可統一監聽。每次使用者開關總覽中的折疊區，
  // 都把狀態存進 state；後續 renderDashboard() 重建 DOM 時即可還原。
  $('#view-dashboard').addEventListener('toggle', (e) => {
    const details = e.target.closest?.('[data-dashboard-detail]');
    if (!details) return;
    const key = details.dataset.dashboardDetail;
    if (details.open) state.dashboardOpenDetails.add(key);
    else state.dashboardOpenDetails.delete(key);
  }, true);

  // 時辰選單(預設子時,列表第一個選項,避免下拉選單一開始就停在中間某個時辰,
  // 讓使用者誤以為那是自動判斷出來的值——時辰務必由使用者自己選,這裡只是給一個不易混淆的起始值)
  $('#birth-hour').innerHTML = SHICHEN
    .map((s) => `<option value="${s.hour}">${s.label}</option>`).join('')
    + '<option value="unknown">不確定時辰(以午時暫排)</option>';
  $('#birth-hour').value = '0';

  // 藥丸切換
  for (const [id, key] of [['#cal-toggle', 'cal'], ['#gender-toggle', 'gender']]) {
    $(id).addEventListener('click', (e) => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      state[key] = btn.dataset.value;
      $$(`${id} .pill`).forEach((p) => {
        p.classList.toggle('active', p === btn);
        p.setAttribute('aria-pressed', String(p === btn));
      });
    });
  }

  $$('.nav-item[data-view]').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  $('#save-chart-btn').addEventListener('click', saveCurrentChart);
  $('#edit-chart-btn').addEventListener('click', () => {
    document.body.classList.add('editing-chart');
    $('#name-input').focus();
  });
  $('#export-charts').addEventListener('click', exportSavedCharts);
  $('#import-charts').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files?.[0]) importSavedCharts(e.target.files[0]);
    e.target.value = '';
  });
  renderSavedList();

  // 三頁互相導引用的跳轉連結([data-goto])用事件代理綁在 #main-content 上,不管內容重繪幾次都不用重新綁定,
  // 命盤總覽/重點解讀/深度解析裡任何一顆 data-goto 按鈕都共用這一個監聽器
  $('#main-content').addEventListener('click', (e) => {
    const gotoBtn = e.target.closest('[data-goto]');
    if (gotoBtn) switchView(gotoBtn.dataset.goto);
  });

  $('#reading-mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-pill');
    if (!btn || !state.data) return;
    setReadingMode(btn.dataset.mode);
    syncModeToggleUI();
    if (state.view === 'report') {
      // 重點解讀的專業依據永遠是預先算好的完整版本(compose-plain.js 內部固定用 mode:'study'
      // 組裝 technical),切換白話/專業只是換哪個面板可見,不需要整頁 renderAll,避免不必要的重繪與捲動風險
      renderReport();
    } else {
      applyReadingMode();
      renderAll();
    }
  });

  $('#copy-ai-btn').addEventListener('click', async () => {
    if (!state.data) return;
    const { input, ziWei, baZi, zwLuck, bzLuck, elements } = state.data;
    const text = formatChartForAI({ input, ziWei, baZi, zwLuck, bzLuck, elements });
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製，可以貼給AI解讀了');
    } catch {
      toast('複製失敗，請確認瀏覽器剪貼簿權限');
    }
  });

  $('#birth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#birth-form .submit-btn');
    await withLoading(btn, '排盤中…', async () => {
      if (await computeAll()) {
        renderAll();
        // 排盤完成的小小揭曉感:主內容區加一個淡入效果,而不是直接無聲切換畫面
        const main = $('#main-content');
        main.classList.remove('reveal-in');
        void main.offsetWidth; // 強制重新觸發動畫(reflow)
        main.classList.add('reveal-in');
        if (matchMedia('(max-width: 900px)').matches) {
          $('.sidebar').classList.remove('open');
          $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
          $('#main-content').focus();
        }
      }
    });
  });

  $('#sidebar-toggle').addEventListener('click', () => {
    const open = $('.sidebar').classList.toggle('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  });

  // 分享連結參數回填(有參數才直接排盤)
  const params = new URLSearchParams(location.search);
  if (params.get('date')) {
    const [py, pm, pd] = params.get('date').split('-').map(Number);
    birthDateCtl.set(py, pm, pd);
    if (params.get('name')) $('#name-input').value = params.get('name');
    if (params.get('hour')) $('#birth-hour').value = params.get('hour');
    if (params.get('gender')) {
      state.gender = params.get('gender');
      $$('#gender-toggle .pill').forEach((p) => p.classList.toggle('active', p.dataset.value === state.gender));
    }
    return true;
  }
  return false;
}

const hasSharedParams = setupControls();
renderEmpty(); // 先渲染歡迎畫面(不需要排盤庫);分享連結進站則在引擎載完後自動蓋掉
if (hasSharedParams) {
  computeAll().then((ok) => { if (ok) renderAll(); });
}

// ---------- 輕量錯誤監控:未預期錯誤時給使用者一個提示,避免畫面靜默壞掉 ----------
let errorNotified = false;
function notifyError() {
  if (errorNotified) return;
  errorNotified = true;
  try { toast('發生未預期的錯誤,請重新整理頁面再試一次'); } catch { /* toast 本身壞掉就算了 */ }
}
window.addEventListener('error', notifyError);
window.addEventListener('unhandledrejection', notifyError);

// ---------- PWA:註冊 Service Worker(離線可用、可加入主畫面) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 不支援或註冊失敗不影響功能 */ });
  });
}

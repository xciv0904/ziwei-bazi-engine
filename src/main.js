import './style.css';
import { splitSurnameGiven } from './engines/name-split.js';
import { LAYOUT_POSITIONS } from './data/layout-positions.js';
import { palaceMeanings } from './data/palace-meanings.js';
import { lookupTransformation } from './data/transformation-meanings.js';
import { toTrueSolarTime } from './engines/true-solar-time.js';

// 排盤引擎（iztro、lunar-javascript 合計約 700KB）改為動態載入：
// 訪客進站先看到歡迎頁，不需要馬上載排盤庫；第一次按「排盤」時才抓，之後快取重用。
// qrcode / html-to-image 也一樣，只在分享命卡用到時才載。
let enginesPromise = null;
let birthDateCtl = null; // 主表單年/月/日輸入控制器,setupControls() 內建立
/**
 * 解讀組裝層（compose-*.js 及其資料庫，合計 100KB 以上）。
 * 全部都是排盤之後才用得到，所以跟排盤引擎一起動態載入、平行下載——
 * 使用者按「排盤」本來就要等 iztro/lunar,這些資料搭同一班車，不增加可感知的等待，
 * 卻能讓「只是進站看一眼」的訪客完全不必下載。載入完成後掛到 R,呼叫點一律寫 R.xxx()。
 */
const R = {};

function loadEngines() {
  enginesPromise ??= Promise.all([
    import('./engines/ziwei.js'),
    import('./engines/bazi.js'),
    import('lunar-javascript'),
    import('./engines/reading.js'),
  ]).then(([z, b, l, r]) => {
    const lunarPkg = l.default ?? l;
    Object.assign(R, r);
    return {
      convertToZiWei: z.convertToZiWei,
      convertToBaZi: b.convertToBaZi,
      Solar: lunarPkg.Solar,
      Lunar: lunarPkg.Lunar,
    };
  });
  return enginesPromise;
}

// ---------- 分頁專屬引擎的動態載入 ----------
// 下面這幾支只有單一分頁（或某顆按鈕）用得到，合計連同各自的 JSON 資料庫超過 100KB。
// 全部靜態 import 的話，一個只想排盤看命宮的訪客，也得先下載深度解析的組裝表、
// 姓名學的 44KB 字庫和奇門遁甲的排盤邏輯才能看到第一個畫面。
// 改成用到才載：切到該分頁（或按下該顆 AI 按鈕）時 import,載過一次就進模組快取。
// 另外在排盤完成後會於瀏覽器閒置時段先偷偷預載（見 preloadViewEngines）,
// 所以實際點過去時通常已經在記憶體裡，不會有可感知的延遲。
const LAZY_LOADERS = {
  comprehensive: () => import('./engines/comprehensive.js'),  // 深度解析
  synastry: () => import('./engines/compose-synastry.js'),    // 雙人合盤
  naming: () => import('./engines/naming.js'),                // 姓名學（含 name-characters.json）
  divination: () => import('./engines/divination.js'),        // 進階玄學：易經/梅花/奇門
  formatAi: () => import('./engines/format-ai.js'),           // 所有「複製給 AI」提示詞
};
/** 已載入的模組；渲染函式一律先 await ensureModules() 再從這裡取用，避免到處寫 await import */
const mod = {};
const modPromises = {};
function ensureModules(...keys) {
  return Promise.all(keys.map((k) => (modPromises[k] ??= LAZY_LOADERS[k]().then((m) => (mod[k] = m)))));
}

/** 各分頁在渲染前必須先備妥的模組（點擊型的 AI 按鈕不列在這，由各自的 handler 自行 await） */
const VIEW_MODULES = {
  comprehensive: ['comprehensive'],
  synastry: ['synastry'],
  naming: ['naming'],
  metaphysics: ['divination', 'formatAi'], // 每日運勢/生涯時間軸在渲染當下就要組提示詞
};

/**
 * 排盤完成後，趁瀏覽器閒置把上面幾支分頁引擎先抓回來。
 * 這不影響首屏（排盤畫面早就顯示完了），但能讓之後點側欄分頁幾乎感覺不到載入。
 * 失敗一律忽略——真的點過去時 ensureModules 會再試一次，那時才需要讓使用者知道。
 */
function preloadViewEngines() {
  const run = () => ensureModules(...Object.keys(LAZY_LOADERS)).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}

// index.html 把 Google Fonts 的 <link> 以 media="print" 掛載，讓它不擋首次繪製；
// 這支模組是 type=module(自帶 defer),執行時 HTML 已解析完、首屏已可繪製，這時再切回 all。
document.getElementById('font-css')?.setAttribute('media', 'all');

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flat = (s) => String(s).replace(/\n+/g, ' '); // 多行解讀 → 單段落
// 注意：這裡的冒號是物件字面值的語法，不是中文標點，不要跟著全形化。
const trad = (s) => String(s).replace(/[动开会亲纳采订盟医药猎机械坏垣]/g, (c) => ({ 动: '動', 开: '開', 会: '會', 亲: '親', 纳: '納', 采: '採', 订: '訂', 盟: '盟', 医: '醫', 药: '藥', 猎: '獵', 机: '機', 械: '械', 坏: '壞', 垣: '垣' }[c] ?? c));

// ---------- 出生日期輸入(年/月/日三欄，取代原生 date input——
// 原生 date input 分段輸入時，年份欄位打超過4碼或按方向鍵切換欄位方式不直覺，
// 打錯會讓 .value 變成空字串且畫面完全沒有任何提示，使用者會以為排盤按鈕壞了。
// 改成年份用文字輸入（限4碼數字）+ 月/日用下拉選單，月日下拉的選項本身就排除了不存在的日期組合（如2月30日）,
// 只剩年份範圍需要驗證，錯誤時就地顯示原因。) ----------
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
      if (!yStr || yStr.length !== 4) { showError('請輸入 4 碼西元年份，例如 1990'); yearEl.focus(); return null; }
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

/** 按鈕 loading 狀態：計算期間停用按鈕並換字樣，避免使用者以為沒反應而重複點擊 */
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
 * 五行分佈雷達圖（SVG,不依賴外部套件）：五個軸對應木火土金水，
 * 描出分佈輪廓，取代單純的橫條——雷達圖的「形狀」比長度更能一眼看出偏旺/偏弱的整體平衡感。
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
// 時辰欄位的合法值白名單:12 個時辰的起始小時 + 「不確定時辰」。
// 分享連結與匯入檔都是外部輸入，一律拿這份白名單比對，避免不合法的值靜默變成子時。
const VALID_HOURS = new Set([...SHICHEN.map((x) => String(x.hour)), 'unknown']);

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];

// ---------- 狀態 ----------
const state = {
  view: 'dashboard',
  reportTab: 'ziwei',
  chartTab: 'ziwei', // 手機版：命盤總覽一次只顯示一張卡
  cal: 'solar',
  gender: 'female',
  // 閱讀模式（單一狀態，兩段式）:
  //   'public' 白話模式——只給結論與生活化說明，全站不出現任何命理術語（預設）
  //   'learn'  學習模式——術語與完整依據都給，但每一條都必須說明它從命盤哪裡來
  //
  // 原本還有第三段「專業模式」，已經併進學習模式。原因是使用者實測時發現：
  // learn 在組裝文字時等同 public，所以除了命盤總覽以外，學習模式和白話模式一模一樣；
  // 而「專業命理依據」那塊不分模式照常顯示，白話模式反而混進了廟旺、四化這些術語。
  // 三段名義上存在、實際上只有兩種畫面，還把術語漏進了不該有術語的那一段。
  // 現在的界線很單純：白話模式不出現術語，學習模式出現術語就一定要交代來源。
  readingMode: 'public',
  selectedPalace: '命宮',
  // 學習模式：目前展開到第幾步、練習題作答狀況（答案本身不進 localStorage,只存對錯）
  // level：初階／進階／高級。使用者反映一次攤開全部太長，分階讓初學者先看得完。
  learning: { openStep: 'self', quizOpen: false, answers: {}, level: 'basic' },
  // 目前這張命盤的學習進度（由 localStorage 讀入，依命盤識別碼分開存）
  learningProgress: { palaces: {}, lastPalace: null },
  limitIdx: 0,
  yearIdx: 0,
  expandedZiwei: ['ming'], // 重點解讀：白話摘要卡片各自獨立展開/收合，用陣列存已展開的 key(可同時展開多張)
  expandedBazi: ['zhu'],
  // 重點解讀頁的「白話摘要／專業依據」切換：紫微/八字分頁各自獨立記住自己的模式，
  // 跟命盤總覽/深度解析共用的 state.readingMode 分開，互不影響（見 currentReadingMode()/setReadingMode()）
  reportViewMode: { ziwei: 'public', bazi: 'public' }, // 沿用跟 readingMode 一樣的值域（'public'/'learn'），對應按鈕 data-mode
  // 深度解析（綜合報告）裡，地支關係/神煞屬於補充細節，預設收合，點開才展開（避免資訊量過載）;
  // 用 Set 存已展開的段落標題，彼此獨立（可同時展開兩個），跟主要 4 段區隔開來
  expandedComprehensiveDetails: new Set(),
  topicKey: 'love',
  topicQuestion: 0,
  // 命盤總覽會在切換宮位、大限、流年與流月時整區重繪；原生 details 若不另存狀態，
  // 每次重繪都會回到預設收合。集中保存所有總覽折疊狀態，讓內部互動不再把使用者彈出去。
  dashboardOpenDetails: new Set(),
  // 雙人合盤：乙方表單值、關係型態與已排好的乙方命盤
  synastry: { form: { name: '', date: '', hour: '0', gender: 'female', rel: '戀人' }, b: null },
  monthIdx: null, // 流月瀏覽（null = 未展開）
  shareCard: 'life', // 分享命卡：'life' 本命卡 | 'annual' 流年卡
  compareSelected: new Set(), // 命盤比對：目前勾選的已存命盤 index
  naming: { surname: '', given: '' }, // 姓名學：姓/名輸入值（獨立分頁，不依賴目前命盤）
  metaphysicsTab: 'daily',
  metaGuideExpanded: false, // 進階玄學「不知道從哪開始」導覽卡：預設只顯示今天適合的幾個，其餘收合
  data: null, // { name, input, ziWei, baZi, readings, elements, zwLuck, bzLuck, tenGods, byBranch }
};

// ---------- 排盤 ----------
async function computeAll() {
  const parsed = birthDateCtl?.read();
  if (!parsed) return false; // 錯誤原因已由 birthDateCtl 就地顯示在欄位下方
  try {
    return await computeAllInner(parsed);
  } catch (err) {
    console.error('computeAll 失敗：', err);
    toast('排盤時發生錯誤，請確認出生資料後再試一次；若重複發生請回報這組生辰資料。');
    return false;
  }
}

async function computeAllInner(parsed) {
  const { convertToZiWei, convertToBaZi, Solar, Lunar } = await loadEngines();
  const name = $('#name-input').value.trim() || '命主';
  // 「不確定時辰」：以午時（11時）暫排，並在畫面明確標示僅供參考
  const hourRaw = $('#birth-hour').value;
  const hourUnknown = hourRaw === 'unknown';
  let { y, m, d } = parsed;
  // 日期合法性驗證：月/日下拉的選項本身已排除不存在的組合，但分享連結的 ?date= 參數是直接塞值進欄位，
  // 仍可能帶入不存在的日期（例如 1949-02-29），引擎不會報錯、會靜默排出錯的盤，這裡再保險檢查一次
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    toast('這個日期不存在，請重新選擇');
    return false;
  }
  let hour = hourUnknown ? 11 : Number(hourRaw);
  if (state.cal === 'lunar') {
    const solar = Lunar.fromYmd(y, m, d).getSolar();
    [y, m, d] = [solar.getYear(), solar.getMonth(), solar.getDay()];
  }
  let solarTime = null;
  if ($('#solar-time-enabled').checked) {
    if (hourUnknown) {
      toast('真太陽時校正需要精確出生時間，不能搭配「不確定時辰」');
      return false;
    }
    const [clockHour, clockMinute] = $('#birth-clock-time').value.split(':').map(Number);
    const longitude = Number($('#birth-longitude').value);
    const utcOffset = Number($('#birth-utc-offset').value);
    if (!Number.isFinite(clockHour) || !Number.isFinite(clockMinute)
      || $('#birth-longitude').value === '' || $('#birth-utc-offset').value === '') {
      toast('請完整填寫出生地鐘錶時間、經度與 UTC 時差');
      return false;
    }
    const civil = { year: y, month: m, day: d, hour: clockHour, minute: clockMinute, longitude, utcOffset };
    const corrected = toTrueSolarTime(civil);
    solarTime = { civil, corrected, selectedHour: Number(hourRaw) };
    ({ year: y, month: m, day: d, hour } = corrected);
  }
  const input = { year: y, month: m, day: d, hour, gender: state.gender, solarTime };

  const ziWei = convertToZiWei(input);
  const baZi = convertToBaZi(input);
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));

  // 頁首的農曆日期字串在這裡先算好（renderHead 不再依賴 lunar 套件，方便動態載入）
  const lunarDate = Solar.fromYmd(y, m, d).getLunar();
  const lunarDateStr = `${lunarDate.getMonthInChinese()}月${lunarDate.getDayInChinese()}`;

  state.data = {
    name, input, ziWei, baZi, byBranch, lunarDateStr, hourUnknown,
    elements: R.composeElementAnalysis(baZi.fiveElementDistribution), // 兩版本共用同一份，顯示時再依mode選summary/text
  };
  state.monthIdx = null;
  state.dashboardOpenDetails.clear();
  state.shareCard = 'life';
  // 換命盤就換一組學習進度與作答紀錄：進度依命盤識別碼分開存，
  // 不清乾淨的話會出現「換了一張盤卻沿用上一張的答對紀錄」
  // 階段是使用者的學習偏好，換命盤不該重設，所以從 localStorage 讀回來
  state.learning = { openStep: 'self', quizOpen: false, answers: {}, level: loadLearningLevel() };
  state.learningProgress = R.loadProgress(safeLocalStorage(), R.chartKeyOf(input));
  // 姓名學分頁帶入目前排盤的姓名(使用者若在姓名學頁另外手動改過，下次重新排盤/切換命盤時仍會被目前這筆姓名蓋過——
  // 這是預期行為，「帶入」的意思就是跟著目前排盤的人走)
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
// 排盤完成後呼叫一次；之後使用者切換大眾版/學習版開關時，不用重新排盤，只要重跑這個函式再重繪畫面。
/**
 * 解讀組裝層只認得 'public' / 'study' 兩種詳略程度，這是引擎層的用詞，跟畫面上的模式名稱不同。
 * 對應關係：白話模式 → 'public'（不含術語）、學習模式 → 'study'（含完整依據）。
 * 學習模式拿到完整依據之後，畫面再負責替每一條標出它從命盤哪裡來——
 * 光給術語而不說來源，就是先前「專業模式」看不懂的原因。
 */
function composerMode(mode = state.readingMode) {
  return mode === 'learn' ? 'study' : 'public';
}

/** 現在這一頁是不是學習模式（要顯示術語、依據與來源鏈） */
function isLearnMode() {
  return currentReadingMode() === 'learn';
}

function applyReadingMode() {
  const { ziWei, baZi } = state.data;
  const mode = composerMode();
  Object.assign(state.data, {
    readings: R.composeChartReading(ziWei, { mode }),
    zwLuck: R.composeZiWeiLuck(ziWei, { mode }),
    bzLuck: R.composeBaZiLuck(baZi, { mode }),
    tenGods: R.composeBaZiReading(baZi, { mode }),
  });
}

const readingOf = (palaceName) =>
  state.data.readings.palaces.find((p) => p.palaceName === palaceName);

// ---------- 頁首「白話摘要／專業依據」切換的模式讀寫 ----------
// 命盤總覽、深度解析沒有紫微/八字分頁的概念（兩套資料同時呈現在同一頁），沿用原本單一的
// state.readingMode;重點解讀有紫微斗數/八字兩個分頁，各自需要記住自己選的是白話還是專業，
// 所以另外用 state.reportViewMode 分開存，由這兩個函式決定「現在這顆按鈕實際在改哪個值」。
function currentReadingMode() {
  return state.view === 'report' ? state.reportViewMode[state.reportTab] : state.readingMode;
}
function setReadingMode(mode) {
  if (state.view === 'report') state.reportViewMode[state.reportTab] = mode;
  else state.readingMode = mode;
}
// 兩段式閱讀模式的按鈕定義（標籤與說明集中一份，不要在各 renderer 各寫一次）
const READING_MODES = [
  { mode: 'public', label: '白話模式', hint: '只看結論，完全不出現命理術語' },
  { mode: 'learn', label: '學習模式', hint: '每一句都告訴你依據從命盤哪裡來' },
];

/** 哪幾頁需要這組切換：命盤總覽（逐步判讀在這裡）、重點解讀與完整報告 */
const MODE_TOGGLE_VIEWS = new Set(['dashboard', 'report', 'comprehensive']);

/** 依目前頁面/分頁決定的模式，重建三顆模式按鈕並同步 active 樣式與無障礙屬性 */
function syncModeToggleUI() {
  const toggle = $('#reading-mode-toggle');
  const mode = currentReadingMode();
  toggle.hidden = !state.data || !MODE_TOGGLE_VIEWS.has(state.view);
  toggle.innerHTML = READING_MODES.map((item) => {
    const active = item.mode === mode;
    return `<button type="button" class="mode-pill${active ? ' active' : ''}" data-mode="${item.mode}" aria-pressed="${active}" title="${esc(item.hint)}">${esc(item.label)}</button>`;
  }).join('');
  toggle.setAttribute('aria-controls', `view-${state.view}`);
}

/** 大限流年瀏覽目前選中的大限與西元年（命盤高亮、四化、提示詞共用） */
function currentLuckSelection() {
  const { ziWei, input } = state.data;
  const limit = ziWei.majorLimits[state.limitIdx];
  const startAge = Number(limit.ageRange.split('~')[0]);
  return { limit, year: input.year + startAge + state.yearIdx - 1 };
}

// ---------- 命盤收藏（localStorage） ----------
const SAVED_KEY = 'zwbz-saved-charts';

/**
 * 取得可用的 localStorage。
 * 無痕模式或停用儲存的瀏覽器連存取 localStorage 這個屬性本身都會丟例外，
 * 學習進度存不存得起來不該讓整個學習模式壞掉，所以取不到時回傳一個什麼都不做的替身。
 */
const NULL_STORAGE = { getItem: () => null, setItem: () => {} };
function safeLocalStorage() {
  try {
    return window.localStorage ?? NULL_STORAGE;
  } catch {
    return NULL_STORAGE;
  }
}

function loadSavedCharts() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? []; } catch { return []; }
}
function persistSavedCharts(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* 無痕模式等 */ }
}

/** 從已存命盤載入一筆（側欄清單、流年提醒卡共用）：填回表單值 → 排盤 → 重繪畫面 */
async function loadSavedEntry(c) {
  $('#name-input').value = c.name;
  const [cy, cm, cd] = c.date.split('-').map(Number);
  birthDateCtl.set(cy, cm, cd);
  $('#birth-hour').value = String(c.hour); // 'unknown' 也直接對應到「不確定時辰」選項
  $('#solar-time-enabled').checked = Boolean(c.solarTime);
  $('#solar-time-fields').hidden = !c.solarTime;
  if (c.solarTime) {
    $('#birth-clock-time').value = c.solarTime.clockTime;
    $('#birth-longitude').value = c.solarTime.longitude;
    $('#birth-utc-offset').value = c.solarTime.utcOffset;
  }
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
  // (延遲渲染：只有正在看的那一頁需要立刻重畫，另一頁等切過去時再補)
  invalidateViews('synastry', 'compare');
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

// 匯出/匯入收藏（localStorage 不跨裝置，提供 JSON 檔搬家）
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

/**
 * 匯入檔是使用者可以任意編輯的外部輸入，先前只檢查欄位「有沒有值」,
 * 因此像 date: "去年" 或 hour: 99 這種值會被原封不動存進收藏，
 * 等到之後點開那筆命盤才在排盤階段炸開（而且錯誤訊息完全對不上原因）。
 * 現在改成逐筆嚴格驗證，壞掉的資料在匯入當下就被擋下並告知筆數。
 */
const MAX_IMPORT_BYTES = 1 * 1024 * 1024; // 20 筆命盤約數 KB,1MB 已極度寬鬆；更大者視為非本站檔案

function isValidChartEntry(c) {
  if (!c || typeof c !== 'object') return false;
  if (typeof c.name !== 'string' || !c.name.trim()) return false;
  if (typeof c.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return false;
  const [y, m, d] = c.date.split('-').map(Number);
  if (y < 1900 || y > 2100) return false;
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return false; // 例如 1949-02-29
  if (!VALID_HOURS.has(String(c.hour))) return false;
  if (c.gender !== 'male' && c.gender !== 'female') return false;
  if (c.solarTime) {
    if (!/^\d{2}:\d{2}$/.test(c.solarTime.clockTime ?? '')) return false;
    if (!Number.isFinite(Number(c.solarTime.longitude)) || Math.abs(Number(c.solarTime.longitude)) > 180) return false;
    if (!Number.isFinite(Number(c.solarTime.utcOffset)) || Number(c.solarTime.utcOffset) < -12 || Number(c.solarTime.utcOffset) > 14) return false;
  }
  return true;
}

function importSavedCharts(file) {
  if (file.size > MAX_IMPORT_BYTES) return toast('匯入失敗：檔案過大，請確認是本站匯出的命盤收藏');
  const reader = new FileReader();
  reader.onerror = () => toast('匯入失敗：無法讀取這個檔案');
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error('格式錯誤');
      const valid = incoming.filter(isValidChartEntry);
      const skipped = incoming.length - valid.length;
      const list = loadSavedCharts();
      let added = 0;
      for (const c of valid) {
        const entry = { name: String(c.name).trim().slice(0, 20), date: c.date, hour: String(c.hour), gender: c.gender, cal: 'solar' };
        if (c.solarTime) entry.solarTime = { ...c.solarTime };
        if (!list.some((x) => x.date === entry.date && String(x.hour) === entry.hour && x.gender === entry.gender)) {
          list.push(entry);
          added++;
        }
      }
      persistSavedCharts(list);
      renderSavedList();
      const tail = skipped ? `（略過 ${skipped} 筆格式不正確的資料）` : '';
      toast((added ? `已匯入 ${added} 筆命盤` : '沒有新的命盤（皆已存在或格式不正確）') + tail);
    } catch { toast('匯入失敗：檔案格式不正確'); }
  };
  reader.readAsText(file);
}

function saveCurrentChart() {
  if (!state.data) return;
  const { name, input } = state.data;
  const entry = {
    name,
    date: `${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`,
    hour: state.data.hourUnknown ? 'unknown' : input.hour, // 時辰未知照實記錄，載入時維持「不確定」
    gender: input.gender,
    cal: 'solar', // computeAll 已把農曆轉成陽曆，存陽曆版本最不易混淆
  };
  if (input.solarTime) {
    const { civil } = input.solarTime;
    entry.date = `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
    entry.hour = input.solarTime.selectedHour;
    entry.solarTime = {
      clockTime: `${String(civil.hour).padStart(2, '0')}:${String(civil.minute).padStart(2, '0')}`,
      longitude: civil.longitude,
      utcOffset: civil.utcOffset,
    };
  }
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
  const shichenIndex = input.hour >= 23 ? 0 : Math.floor((input.hour + 1) / 2) % 12;
  const shichen = SHICHEN[shichenIndex];
  const solarMark = input.solarTime
    ? `真太陽時${String(input.hour).padStart(2, '0')}:${String(input.solarTime.corrected.minute).padStart(2, '0')}・`
    : '';
  const shichenLabel = state.data.hourUnknown ? '時辰未知（暫以午時排）' : `${solarMark}${shichen.name}`;
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
  const { name, ziWei, baZi, elements } = state.data;
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  const mainStars = life.majorStars.map((s) => s.name).join('・') || '空宮（參考對宮）';
  const fp = baZi.fourPillars;
  const dayMaster = `${fp.dayPillar.stem}${STEM_EL[fp.dayPillar.stem]}`;
  const { limit, year } = currentLuckSelection();
  const focus = state.data.byBranch[limit.ganZhi[1]]?.name ?? '—';
  const focusPlain = palaceMeanings[focus] ?? focus;
  return `<section class="card result-home" aria-labelledby="summary-title">
    <div class="result-home-kicker">排盤完成</div>
    <h2 id="summary-title">${esc(name)}，接下來想先看什麼？</h2>
    <p class="result-home-lead">不需要先懂宮位或五行。下面三條路各自給你不同的東西，隨時可以從左側切換。</p>
    <div class="result-summary">
      <div class="summary-item"><div class="summary-label">命宮主星</div><div class="summary-value">${esc(mainStars)}</div></div>
      <div class="summary-item"><div class="summary-label">八字日主</div><div class="summary-value">${esc(dayMaster)}</div></div>
      <div class="summary-item summary-item--plain"><div class="summary-label">你較明顯的節奏</div><div class="summary-value">${esc(elementPlainSummary(elements))}</div><small>專業資料可在完整命盤查看</small></div>
      <div class="summary-item summary-item--plain"><div class="summary-label">${esc(year)} 年重點</div><div class="summary-value">${esc(focusPlain)}</div><small>目前落在${esc(focus)}</small></div>
    </div>
    <div class="result-paths" aria-label="選擇下一步">
      <button type="button" class="result-path result-path--primary" data-result-goto="report"><span>最多人從這裡開始・約 3 分鐘</span><b>重點摘要</b><small>一張一張的重點卡片，挑你在意的點開就好，不用全部讀完</small></button>
      <button type="button" class="result-path" data-result-goto="topics"><span>心裡已經有問題・約 2 分鐘</span><b>主題分析</b><small>從愛情、工作、財運等十個主題中選一題，直接看方向</small></button>
      <button type="button" class="result-path" data-result-goto="comprehensive"><span>想一次讀完・約 15 分鐘</span><b>完整報告</b><small>把性格、工作、感情、家庭串成一篇連貫的長文，交代前後關聯</small></button>
    </div>
    <button type="button" class="result-path-more" data-result-goto="dashboard-detail">或者，先看看命盤本身 —— 十二宮、四柱與流年切換 ↓</button>
  </section>`;
}

// ---------- 分頁一：命盤總覽 ----------
function elDot(char, isDay) {
  const el = STEM_EL[char] ?? BRANCH_EL[char];
  const textColor = isDay ? 'var(--cream)' : EL_COLOR[el];
  return `<div class="bz-el"><span class="dot" style="background:${EL_COLOR[el]}"></span><span style="color:${textColor}">${el}</span></div>`;
}

const MUT_CLASS = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };

function renderZiWeiCard() {
  const { ziWei, name } = state.data;

  // 盤面連動：大限宮位、流年命宮、流年四化落點、所選宮位的三方四正
  const { limit, year } = currentLuckSelection();
  const decadalBranch = limit.ganZhi[1];
  const annualBranch = yearGanZhi(year)[1];
  const sihuaByPalace = {};
  for (const e of R.composeZiWeiAnnualChange(ziWei, year).entries) {
    (sihuaByPalace[e.palace] ??= []).push(e.mutagen);
  }
  const selBranch = ziWei.palaces.find((p) => p.name === state.selectedPalace)?.position[1];
  const relatedBranches = new Set(
    selBranch ? [4, 6, 8].map((off) => BRANCHES[(BRANCHES.indexOf(selBranch) + off) % 12]) : [],
  );

  const cells = ziWei.palaces.map((p) => {
    const branch = p.position[1];
    const pos = LAYOUT_POSITIONS[branch];
    // 星名可點：跳到命理小百科的對應詞條。
    // 宮格本身是 <button>（點了選宮位），HTML 不允許在 button 裡放 <a>，
    // 所以這裡用 span 帶 data-wiki，由委派事件處理跳轉並擋掉冒泡，避免順便換了宮位。
    const stars = p.majorStars.map((s) => `<span class="star-link" data-wiki="${esc(s.name)}" title="點擊查看「${esc(s.name)}」的說明">${esc(s.name)}</span>`
      + (s.transformation ? `<sup title="生年化${s.transformation}：${esc(lookupTransformation(s.transformation) ?? '')}">${s.transformation}</sup>` : '')).join('');
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
      branch === annualBranch ? `<span class="luck-tag annual" title="${year} 年（流年）命宮落在這一宮">年</span>` : '',
    ].join('');
    const mutMarks = (sihuaByPalace[p.name] ?? [])
      .map((m) => `<span class="flow-mut ${MUT_CLASS[m]}" title="${year}年流年化${m}：${esc(lookupTransformation(m) ?? '')}">${m}</span>`).join('');
    const elAccent = EL_COLOR[BRANCH_EL[branch]];
    return `<button type="button" class="${cls}" data-palace="${esc(p.name)}"
      style="grid-row:${pos.row};grid-column:${pos.col};border-left-color:${elAccent}">
      <div class="p-name">${esc(p.name)} ${esc(branch)}${p.isBodyPalace ? `<span class="body-mark" title="身宮：與命宮並列，影響後天際遇與行為傾向">・身</span>` : ''}${luckTags}</div>
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
    <div class="chart-legend">限＝所選大限宮位　年＝${year} 流年命宮　祿權科忌＝${year} 流年四化落點　虛線框＝所選宮位的三方四正<br>點宮格可切換宮位；點<span class="star-link" style="pointer-events:none">星名</span>會另開命理小百科的說明。</div>
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
  const note = `${elements.dominant.join('、')}偏旺，${elements.weak.join('、')}偏弱，可透過後天培養補強平衡。`;

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

  // 學習版：附上飛星資訊（自化與來因宮，已用文墨天機命盤交叉驗證）
  let advancedLine = '';
  if (isLearnMode()) {
    const selfT = R.computeSelfTransformations(state.data.ziWei).find((r) => r.palaceName === state.selectedPalace);
    const laiyin = R.computeLaiyinPalace(state.data.ziWei);
    const parts = [];
    if (selfT) {
      parts.push([
        ...selfT.outgoing.map((x) => `${x.star}↓${x.mutagen}(離心自化，能量向外流)`),
        ...selfT.incoming.map((x) => `${x.star}↑${x.mutagen}(向心自化，由對宮化入)`),
      ].join('、'));
    }
    if (laiyin?.palaceName === state.selectedPalace) parts.push('此宮為來因宮（生年天干所落之宮，一生課題的起點）');
    if (parts.length) {
      advancedLine = `<div class="tech-block"><b>飛星資訊</b><p>${esc(parts.join(';'))}</p></div>`;
    }
  }

  // 命盤總覽偏向「查資料」，不放完整7段式人生分析（那是重點解讀/深度解析的事）——
  // 只取白話卡片裡最前面兩層：一句話重點 + 簡短解釋，專業資料則完整列出（這裡本來就是給想看細節的人用的）
  const card = R.generatePlainPalaceCard(state.data.ziWei, state.selectedPalace);
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
      ${whyPanelHtml(isLearnMode() ? null : currentLesson())}
      ${isLearnMode() ? `<details class="palace-technical" data-dashboard-detail="classroom-technical"${state.dashboardOpenDetails.has('classroom-technical') ? ' open' : ''}>
        <summary>專業資料</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>星曜</b><p>${esc(stars)}</p></div>
          <div class="tech-block"><b>命盤資料</b><p>${esc(card.technical.chartData)}</p></div>
          <div class="tech-block"><b>專業判斷</b><p>${esc(card.technical.judgment)}</p></div>
          ${advancedLine}
        </div>
      </details>` : ''}
    </div>
  </div>`;
}

// ---------- 學習模式：逐步判讀 ----------
// 資料全部來自 learning-palace.js(它只重新整理既有排盤結果，不重算任何命盤事實),
// 這一段只負責把它排版成漸進式揭露的卡片：預設只展開目前這一步，其餘可點開。

/** 目前這張命盤的進度儲存識別碼（由生辰算出的短雜湊，不含可讀的出生資料） */
const LEARNING_LEVEL_KEY = 'zwbz-learning-level';

/** 學習階段是跨命盤的個人偏好，單獨存一個 key，不跟著命盤進度走 */
function loadLearningLevel() {
  try {
    const saved = safeLocalStorage().getItem(LEARNING_LEVEL_KEY);
    return R.LEARNING_LEVELS.some((l) => l.key === saved) ? saved : 'basic';
  } catch {
    return 'basic';
  }
}
function saveLearningLevel(level) {
  try { safeLocalStorage().setItem(LEARNING_LEVEL_KEY, level); } catch { /* 無痕模式 */ }
}

/** 目前階段的顯示設定；查不到就退回初階，畫面不會空掉 */
function currentLevel() {
  return R.LEARNING_LEVELS.find((l) => l.key === state.learning.level) ?? R.LEARNING_LEVELS[0];
}

function learningChartKey() {
  return R.chartKeyOf(state.data?.input);
}

/**
 * 這一宮現在該出哪幾題。
 *
 * 使用者回報「幾乎每個宮位的學習問題都一樣，一套做下來感覺是複習了十二次」。
 * 題目會依你已經答對過幾次逐步退場：通則題答對一次、基本功題答對三宮，
 * 之後名額讓給這一宮才有的內容。作答紀錄依命盤分開存，換命盤會重新開始。
 */
function currentQuiz(lesson) {
  return R.buildPalaceQuiz(lesson, state.data.ziWei, {
    mastery: R.quizMastery(state.learningProgress),
  });
}

function currentLesson() {
  const { ziWei } = state.data;
  const { limit, year } = currentLuckSelection();
  return R.buildPalaceLesson({ ziWei, palaceName: state.selectedPalace, year, majorLimit: limit });
}

const glossaryTip = (term, text) =>
  `<button type="button" class="glossary-tip" data-glossary="${esc(term)}" title="${esc(text)}">${esc(term)}<span aria-hidden="true">？</span></button>`;

function learningFactRow(label, value) {
  if (!value) return '';
  return `<div class="learn-fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

/**
 * 命理小百科的詞條網址。
 *
 * 小百科是 build 時產生的靜態頁（public/wiki/星名.html），vite 的 base 設為相對路徑，
 * 所以 './wiki/…' 在開發模式與 GitHub Pages 都指得到。命盤上會顯示的每一顆星
 * 都保證有對應頁面（見 tests/star-glossary.mjs 的覆蓋率檢查），可以直接連。
 * 例外是單檔離線版（file://）沒有 wiki 目錄，那個模式本來就只提供排盤本體。
 */
const wikiUrl = (term) => `./wiki/${encodeURIComponent(term)}.html`;

/**
 * 可點開的星名：滑過看定義、點擊跳到小百科完整詞條。
 * 手機沒有 hover，所以點擊直接進詞條頁，不必先看 tooltip。
 */
function starChip(item) {
  const label = item.label ?? item.name;
  const tip = item.glossary ? `${item.glossary.core}。${item.glossary.plain}` : `查看${item.name}的完整說明`;
  return `<a class="star-chip has-def" href="${esc(wikiUrl(item.name))}" target="_blank" rel="noopener"
    title="${esc(tip)}">${esc(label)}<span aria-hidden="true">↗</span></a>`;
}

function learningStepSelfHtml(data) {
  const show = currentLevel().show;
  const marks = [
    data.isBodyPalace ? '身宮' : '',
    data.isLaiyin ? '來因宮' : '',
    data.isEmpty ? '空宮' : '',
  ].filter(Boolean).join('、');

  // 判讀順序表只有進階以上才給：初階的人還沒有那麼多層要排先後。
  const orderHtml = show.readingOrder ? `<div class="learn-note learn-order"><b>三合派的判讀順序</b>
    <ol>${data.readingOrder.map((o) => `<li><b>${esc(o.label)}</b>${esc(o.why)}</li>`).join('')}</ol>
    <p class="learn-hint">下面就照這個順序排。看到煞星先別緊張，它排在第五層。</p></div>` : '';

  // 主星在這一宮怎麼發揮：這是使用者最想知道的，各階段都給
  const applicationHtml = (app) => (app && show.application ? `<div class="star-app">
      <div><span class="app-tag app-good">最能發揮</span>${esc(app['發揮'])}</div>
      <div><span class="app-tag app-warn">要注意</span>${esc(app['注意'])}</div>
      <div><span class="app-tag app-do">怎麼做</span>${esc(app['怎麼做'])}</div>
    </div>` : '');

  const doubleStarAppHtml = (app, palaceName) => (app ? `<div class="star-app">
      <div><span class="app-tag app-good">落在${esc(palaceName)}</span>${esc(app['表現'])}</div>
      <div><span class="app-tag app-warn">這一組的取捨</span>${esc(app['取捨'])}</div>
    </div>` : '');

  const majorHtml = `<div class="learn-layer">
      <b class="learn-layer-title">${show.brightness ? '①② 主星與廟旺' : '① 這一宮的主星'}</b>
      ${data.majorStarFunctions.length
    ? data.majorStarFunctions.map((s) => `<div class="star-block">
        <div class="star-head">${starChip(s)}<span><b>${esc(s.core)}</b>${show.brightness && s.brightnessNote ? `　在${esc(data.branch)}為「${esc(s.brightness)}」：${esc(s.brightnessNote)}` : ''}</span></div>
        ${applicationHtml(s.application)}
      </div>`).join('')
    : '<p class="learn-empty">這一宮沒有十四主星（空宮），主星要借對宮參看，見下方空宮提示。</p>'}
    </div>`;

  const ds = data.doubleStar ?? {};
  const doubleHtml = show.doubleStar ? (ds.combined ? `<div class="learn-layer">
      <b class="learn-layer-title">③ 雙星結構：${esc(ds.pair)}</b>
      <p class="learn-layer-lead">${esc(ds.combined)}</p>
      ${doubleStarAppHtml(ds.application, data.palaceName)}
      <div class="learn-note"><b>怎麼讀雙星</b><p>${esc(ds.what)}</p><p>${esc(ds.how)}</p>
        ${ds.lead ? `<p>這一組裡<b>${esc(ds.lead)}</b>的性質較強（入廟或帶生年四化），多半由它主導，另一顆負責修飾方向。</p>` : ''}
        <p class="learn-caution">${esc(ds.caution)}</p></div>
    </div>` : `<div class="learn-layer">
      <b class="learn-layer-title">③ 雙星結構</b>
      <p class="learn-layer-lead">${esc(ds.single ?? '這一宮沒有兩顆主星同宮。')}</p>
    </div>`) : '';

  // 吉煞除了作用，也給「落在這一宮會怎樣」
  const auxList = (items, rule, mark) => `<div class="learn-layer">
      <b class="learn-layer-title">${mark}</b>
      ${items.length
    ? items.map((i) => `<div class="star-block">
        <div class="star-head">${starChip(i)}<span>${esc(i.effect)}</span></div>
        ${i.application?.['影響'] ? `<p class="star-app-line"><b>落在${esc(data.palaceName)}：</b>${esc(i.application['影響'])}</p>` : ''}
      </div>`).join('')
    : '<p class="learn-empty">這一宮沒有。</p>'}
      <div class="learn-note"><b>${esc(rule.headline)}</b><p>${esc(rule.body)}</p>
        <p><b>三合派：</b>${esc(rule.southern)}</p>
        <p class="learn-caution">${esc(rule.caution)}</p></div>
    </div>`;

  const minorHtml = show.minorStars ? `<div class="learn-layer">
      <b class="learn-layer-title">⑥ 雜曜</b>
      ${data.otherDetail.length
    ? data.otherDetail.map((o) => `<div class="star-block">
        <div class="star-head">${starChip(o)}<span>${esc(o.glossary?.core ?? '')}</span></div>
        ${o.application?.['影響'] ? `<p class="star-app-line"><b>落在${esc(data.palaceName)}這類宮位：</b>${esc(o.application['影響'])}</p>` : ''}
      </div>`).join('')
    : '<p class="learn-empty">這一宮沒有雜曜。</p>'}
      <div class="learn-note"><b>${esc(data.minorStarRule.headline)}</b><p>${esc(data.minorStarRule.body)}</p>
        <ul>${data.minorStarRule.when.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
        <p class="learn-caution">${esc(data.minorStarRule.caution)}</p></div>
    </div>` : '';

  const mutagenRow = show.birthMutagen ? `<div class="learn-layer">
      <b class="learn-layer-title">④ 生年四化${show.selfMutagen ? '與自化' : ''}</b>
      ${learningFactRow('生年四化', data.birthMutagens.map((f) => `${f.star}化${f.mutagen}`).join('、') || '此宮沒有生年四化')}
      ${show.selfMutagen ? learningFactRow('自化', [
    ...data.selfMutagens.outgoing.map((x) => `${x}（離心↓）`),
    ...data.selfMutagens.incoming.map((x) => `${x}（向心↑）`),
  ].join('、') || '此宮沒有自化') : ''}
      <p class="learn-hint">完整的四化分層在${esc(mutagenStepRef())}。</p>
    </div>` : '';

  return `
    ${orderHtml}
    ${learningFactRow('宮位主題', data.topic)}
    ${learningFactRow('宮干地支', data.position)}
    ${learningFactRow('特殊標記', marks || '無')}
    ${majorHtml}
    ${doubleHtml}
    ${mutagenRow}
    ${show.auxiliary ? auxList(data.auspiciousDetail, data.auspiciousRule, '⑤a 見吉（六吉星）') : ''}
    ${show.auxiliary ? auxList(data.maleficDetail, data.maleficRule, '⑤b 見煞（六煞星）') : ''}
    ${minorHtml}`;
}

function learningStepOppositeHtml(data) {
  if (!data) return '<p class="learn-empty">找不到對宮資料。</p>';
  return `
    ${learningFactRow('對宮', `${data.name}（${data.position}）`)}
    ${learningFactRow('對宮主星', data.starLabels.join('、') || '對宮同樣是空宮')}
    ${learningFactRow('這條軸線', data.axis)}
    <div class="learn-note"><b>兩宮的關係</b><p>${esc(data.axisMeaning)}</p><p>${esc(data.why)}</p></div>`;
}

function learningStepTriadHtml(data) {
  const rows = data.members.map((m) => {
    const role = { self: '本宮', opposite: '對宮', triad: '三合宮' }[m.role] ?? m.role;
    return `<tr><th>${esc(role)}</th><td>${esc(m.name)}（${esc(m.position)}）</td><td>${esc(m.stars.join('、') || '空宮')}</td></tr>`;
  }).join('');
  // 只給表格的話，讀者看完會問「所以呢」。這一段把四宮合起來說成一件事。
  const synthesis = (currentLevel().show.triadSynthesis && data.synthesis?.length)
    ? `<div class="learn-layer"><b class="learn-layer-title">這四宮合起來在說什麼</b>
        ${data.synthesis.map((line) => `<p class="learn-layer-lead">${esc(line)}</p>`).join('')}</div>`
    : '';
  return `
    <div class="learn-note"><p>${esc(data.what)}</p><p>${esc(data.why)}</p><p>${esc(data.how)}</p>
      <p><b>${esc(data.meaning)}</b></p><p>${esc(data.practical)}</p></div>
    <div class="learn-table-wrap"><table class="learn-table"><thead><tr><th>角色</th><th>宮位</th><th>主星</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="learn-hint">左側命盤已用虛線框同步標出這四個宮位。</p>
    ${synthesis}`;
}

/**
 * 一條命理陳述要怎麼呈現，由閱讀模式決定：
 *   白話模式：只給白話句——初學者要的是「所以我的生活裡會怎樣」。
 *   學習模式：白話在前、術語緊跟在後——邊讀邊認術語。
 *
 * 只給術語句的那一段（原本的專業模式）已經拿掉了。
 * 一句術語沒有跟著白話，讀者就沒有辦法把它接回自己的生活，這正是先前看不懂的原因。
 * 沒有白話翻譯時才退回術語句，不會留空白。
 */
function bilingualLine(item) {
  if (!item.plain) return `<span class="line-tech">${esc(item.sentence)}</span>`;
  if (state.readingMode === 'public') return `<span class="line-plain">${esc(item.plain)}</span>`;
  return `<span class="line-plain">${esc(item.plain)}</span>
    <span class="line-tech"><b>命理說法：</b>${esc(item.sentence)}</span>`;
}

function learningMutagenGroup(title, items, emptyText) {
  if (!items.length) return `<div class="learn-mut-group"><b>${esc(title)}</b><p class="learn-empty">${esc(emptyText)}</p></div>`;
  return `<div class="learn-mut-group"><b>${esc(title)}</b>
    <ul>${items.map((x) => `<li>${bilingualLine(x)}</li>`).join('')}</ul></div>`;
}

/**
 * 大限四化與流年四化跟上面幾組不一樣：它們是「這十年」「這一年」共通的四條，
 * 由大限天干與流年天干決定，不會因為你正在看哪一宮而改變。
 *
 * 先前這裡直接把四條全部列出來，於是每個宮位看到的內容一字不差，
 * 使用者合理地懷疑是 bug。資料沒錯，錯在呈現：判讀某一宮時真正要看的是
 * 「這四條裡有沒有落在這一宮」，其餘三條屬於背景資訊。
 *
 * 所以改成兩層：落在本宮的先講（沒有就明講沒有，那本身就是一個判斷），
 * 其餘收合，並註明它們為什麼在每一宮都一樣。
 */
function learningPeriodGroup(title, items, palaceName, scopeNote, emptyText) {
  if (!items.length) return `<div class="learn-mut-group"><b>${esc(title)}</b><p class="learn-empty">${esc(emptyText)}</p></div>`;
  const here = items.filter((x) => x.landsHere);
  const elsewhere = items.filter((x) => !x.landsHere);
  return `<div class="learn-mut-group"><b>${esc(title)}</b>
    ${here.length
    ? `<p class="learn-mut-lead">落在${esc(palaceName)}的有 ${here.length} 條，判讀這一宮時要看的就是這幾條：</p>
       <ul>${here.map((x) => `<li>${bilingualLine(x)}</li>`).join('')}</ul>`
    : `<p class="learn-mut-lead learn-mut-none">${esc(scopeNote.none(palaceName))}</p>`}
    ${elsewhere.length ? `<details class="learn-mut-rest">
      <summary>另外 ${elsewhere.length} 條落在別的宮位（每一宮看到的都一樣）</summary>
      <p class="learn-hint">${esc(scopeNote.why)}</p>
      <ul>${elsewhere.map((x) => `<li><span class="mut-landing">落入${esc(x.landing)}</span>${bilingualLine(x)}</li>`).join('')}</ul>
    </details>` : ''}
  </div>`;
}

const PERIOD_SCOPE_NOTE = {
  decadal: {
    none: (palace) => `這十年的四化沒有一條落在${palace}。這一宮不是這十年被明顯牽動的地方——這本身就是一個判斷，不是資料缺漏。`,
    why: '大限四化由大限天干決定，是這十年共通的四條，不會因為你看哪一宮而改變。列在這裡是為了讓你看得到全貌，判讀這一宮時以上面那幾條為準。',
  },
  annual: {
    none: (palace) => `今年的四化沒有一條落在${palace}。這一宮今年不是被特別引動的地方。`,
    why: '流年四化由這一年的天干決定，是今年共通的四條，每一宮看到的都一樣。判讀這一宮時以上面那幾條為準。',
  },
};

function learningStepMutagenHtml(data) {
  const show = currentLevel().show;
  const basics = Object.entries(data.basics)
    .map(([key, v]) => `<li><span class="mut-chip ${MUT_CLASS[key]}">${esc(key)}</span>${esc(v.keywords)}——${esc(v.plain)}</li>`).join('');
  // 宮干是初學者第一個卡住的地方：命盤上只看到地支，怎麼突然冒出一個天干。
  // 飛化的內容全部建立在宮干上，所以先解釋它，後面才讀得懂。只有高級會看到飛化，所以綁在一起。
  const stemIntro = (show.stemIntro && data.stemIntro) ? `<div class="learn-note"><b>先搞懂「宮干」</b>
    <p>${esc(data.stemIntro.what)}</p><p>${esc(data.stemIntro.why)}</p><p>${esc(data.stemIntro.how)}</p></div>` : '';
  return `
    <div class="learn-note"><b>先認識四化在講什麼</b><ul class="learn-mut-basics">${basics}</ul><p class="learn-caution">${esc(data.caution)}</p></div>
    ${stemIntro}
    ${learningMutagenGroup('生年四化（一輩子）', data.birth, '這一宮沒有生年四化。')}
    ${show.flying ? learningMutagenGroup('宮干飛化（本宮飛出去）', data.palace, '這一宮沒有可對應的宮干飛化。') : ''}
    ${show.selfMutagen ? learningMutagenGroup('向心自化（由對宮化入）', data.selfIncoming, '這一宮沒有向心自化。') : ''}
    ${show.selfMutagen ? learningMutagenGroup('離心自化（能量往外散）', data.selfOutgoing, '這一宮沒有離心自化。') : ''}
    ${show.period ? learningPeriodGroup('大限四化（這十年）', data.decadal, data.palaceName, PERIOD_SCOPE_NOTE.decadal, '目前大限沒有可對應的四化。') : ''}
    ${show.period ? learningPeriodGroup('流年四化（這一年）', data.annual, data.palaceName, PERIOD_SCOPE_NOTE.annual, '目前流年沒有可對應的四化。') : ''}
    ${show.flying
    ? '<p class="learn-hint">上面每一條都標了層次：生年是一輩子、大限是這十年、流年只有這一年，判讀時不要混在一起。</p>'
    : '<p class="learn-hint">宮干飛化、自化與大限流年四化屬於高級階段，切到「高級」才會顯示。</p>'}`;
}

/** 「完整的四化分層在第 N 步」——N 依當前階段算，初階根本沒有那一步，改成指向階段本身 */
function mutagenStepRef() {
  const level = currentLevel();
  const index = level.steps.indexOf('mutagen');
  return index < 0 ? '進階階段' : `${R.stepOrdinal(index)}`;
}

function learningEvidenceListHtml(title, items, emptyText) {
  if (!items.length) return `<div class="learn-evi-group"><b>${esc(title)}</b><p class="learn-empty">${esc(emptyText)}</p></div>`;
  return `<div class="learn-evi-group"><b>${esc(title)}</b><ul>${items.map((e) =>
    `<li><span class="evi-kind">${esc(e.kind)}</span>${esc(e.text)}</li>`).join('')}</ul></div>`;
}

/**
 * 把證據鏈記的步驟 id 換成這一階段畫面上實際的序號。
 * 步驟不在當前階段時回傳 null，呼叫端會整句略過——
 * 指向一個使用者看不到的步驟，比不標來源更難懂。
 */
function stepSourceLabel(source) {
  if (!source) return null;
  const level = currentLevel();
  const index = level.steps.indexOf(source.step);
  if (index < 0) return null;
  return `${R.stepOrdinal(index)}：${source.label}`;
}

function learningStepSynthesisHtml(evidence) {
  const c = evidence.conclusion;
  const show = currentLevel().show;
  const interactions = (evidence.interactionSteps ?? [])
    .map((p) => ({ text: p.text, label: stepSourceLabel(p.source) }))
    .filter((p) => p.label);
  // 初階只給主要依據與結論；輔助依據與「暫時不採用」是判讀訓練，進階以上才需要。
  return `
    ${learningEvidenceListHtml('主要依據', evidence.primary, '這一宮目前沒有可作為主要依據的資料。')}
    ${show.evidenceFull ? learningEvidenceListHtml('輔助依據', evidence.supporting, '目前沒有補充用的輔助依據。') : ''}
    ${show.evidenceFull ? learningEvidenceListHtml('暫時不採用', evidence.unused, '沒有被排除的資料。') : ''}
    <div class="learn-conclusion">
      <div><span>1. 盤面看到什麼</span><p>${esc(c.observed)}</p></div>
      <div><span>2. 這些資料怎麼互相影響</span>
        ${interactions.length
    // 每句都寫成「因為…所以…」並標出來源步驟，讀者才追得回去是從哪裡推出來的
    ? interactions.map((p) => `<p>${esc(p.text)}<span class="conclusion-source" title="這句話的依據在${esc(p.label)}">← ${esc(p.label)}</span></p>`).join('')
    : `<p>${esc(c.interaction)}</p>`}
      </div>
      <div><span>3. 可能出現在什麼情況</span><p>${esc(c.behavior)}</p></div>
      <div><span>4. 還需要什麼才能確認</span><p>${esc(c.pending)}</p></div>
    </div>
    <div class="learn-note learn-note--limit"><b>判讀限制</b><ul>${evidence.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
}

function learningEmptyGuideHtml(guide) {
  if (!guide) return '';
  const rule = guide.borrowRule;
  const showDetail = currentLevel().show.borrowDetail;

  // 借過來的星要連同廟旺與生年四化一起顯示：那兩項是星的屬性，會跟著走。
  // 只列星名的話，使用者不會知道「借」到底借了什麼。
  const borrowedHtml = guide.borrowedStars.length ? `
    <div class="borrow-block">
      <b class="borrow-title">實際從${esc(guide.borrowedFrom)}借到什麼</b>
      ${guide.borrowedStars.map((s) => `<div class="star-block">
        <div class="star-head">${starChip(s)}<span>
          <b>${esc(s.core)}</b>
          ${s.brightness ? `　亮度「${esc(s.brightness)}」：${esc(s.brightnessNote)}` : ''}
          ${s.transformation ? `<em class="borrow-hua">連同生年化${esc(s.transformation)}一起借過來</em>` : ''}
        </span></div>
        ${s.application ? `<div class="star-app">
          <div><span class="app-tag app-good">最能發揮</span>${esc(s.application['發揮'])}</div>
          <div><span class="app-tag app-warn">要注意</span>${esc(s.application['注意'])}</div>
          <div><span class="app-tag app-do">怎麼做</span>${esc(s.application['怎麼做'])}</div>
        </div>` : ''}
      </div>`).join('')}
    </div>` : '';

  // 借來的是雙星時，讀法與本宮自坐雙星相同，但要多說明「這是借來的」意味著什麼
  const doubleHtml = guide.borrowedDouble ? `
    <div class="borrow-block">
      <b class="borrow-title">${esc(guide.borrowedDouble.title)}：${esc(guide.borrowedDouble.pair)}</b>
      ${guide.borrowedDouble.combined ? `<p class="learn-layer-lead">${esc(guide.borrowedDouble.combined)}</p>` : ''}
      ${guide.borrowedDouble.application ? `<div class="star-app">
        <div><span class="app-tag app-good">借進${esc(guide.palaceName)}之後</span>${esc(guide.borrowedDouble.application['表現'])}</div>
        <div><span class="app-tag app-warn">這一組的取捨</span>${esc(guide.borrowedDouble.application['取捨'])}</div>
      </div>` : ''}
      <p>${esc(guide.borrowedDouble.body)}</p>
      <p>這一組裡<b>${esc(guide.borrowedDouble.lead)}</b>入廟或帶生年四化，多半由它主導，另一顆負責修飾方向。</p>
      <p class="learn-caution">${esc(guide.borrowedDouble.extra)}</p>
    </div>` : '';

  const listBlock = (title, items) => `<div class="borrow-col">
    <b>${esc(title)}</b>
    <ul>${items.map((i) => `<li>${typeof i === 'string' ? esc(i) : `<b>${esc(i.label)}</b>${esc(i.why)}`}</li>`).join('')}</ul>
  </div>`;

  return `<div class="learn-empty-guide">
    <b>${esc(guide.headline)}</b>
    <p class="learn-empty-correct">${esc(guide.correction)}</p>
    <p>${esc(guide.lead)}</p>

    <div class="borrow-block">
      <b class="borrow-title">${esc(rule.headline)}</b>
      <p>${esc(rule.principle)}</p>
      ${showDetail ? `<div class="borrow-two-col">
        ${listBlock(rule.carried.title, rule.carried.items)}
        ${listBlock(rule.notCarried.title, rule.notCarried.items)}
      </div>` : ''}
    </div>

    ${borrowedHtml}
    ${showDetail && guide.notCarriedActual.length ? `<div class="borrow-block">
      <b class="borrow-title">這些留在${esc(guide.borrowedFrom)}，不跟著過來</b>
      <ul>${guide.notCarriedActual.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>` : ''}
    ${doubleHtml}

    <div class="borrow-block">
      <b class="borrow-title">${esc(rule.ownFirst.title)}</b>
      <p>${esc(rule.ownFirst.body)}</p>
      <p>你這一宮自己有：${esc(guide.ownMarks.join('；') || '沒有額外的輔星或標記')}。</p>
    </div>

    ${guide.hasOwnAuxiliary ? `<div class="borrow-block borrow-dispute">
      <b class="borrow-title">${esc(rule.dispute.title)}</b>
      <p>${esc(rule.dispute.body)}</p>
      <p class="learn-caution">${esc(rule.dispute.advice)}</p>
    </div>` : ''}

    <div class="borrow-block">
      <b class="borrow-title">${esc(rule.application.title)}</b>
      <ol class="learn-empty-steps">${rule.application.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="learn-caution">${esc(rule.application.caution)}</p>
    </div>

    <div class="learn-table-wrap"><table class="learn-table"><tbody>${guide.references.map((r) =>
    `<tr><th>${esc(r.label)}</th><td>${esc(r.detail)}</td></tr>`).join('')}</tbody></table></div>
    <p class="learn-caution">${esc(guide.caution)}</p>
  </div>`;
}

function learningQuizHtml(lesson, questions) {
  if (!questions.length) return '';
  const answers = state.learning.answers[lesson.palaceName] ?? {};
  // 題目退場時要說一聲，否則使用者會以為是漏題。
  // 這也是在告訴他「你已經會了」——不然十二宮出一樣的題只是在浪費時間。
  const mastery = R.quizMastery(state.learningProgress);
  const retiredKinds = [
    ['reading-order', '判讀順序'], ['minor-priority', '雜曜的角色'],
    ['malefic-rule', '煞星怎麼看'], ['double-star', '雙星怎麼讀'],
    ['self-stars', '本宮主星'], ['opposite', '對宮'], ['triad', '三合宮'], ['is-empty', '空宮判定'],
  ].filter(([id]) => (mastery.get(id) ?? 0) > 0 && !questions.some((q) => q.id === id))
    .map(([, label]) => label);
  const retired = retiredKinds.length
    ? `已經答對過的題型不再重複出：${retiredKinds.join('、')}。這幾宮的練習會集中在這一宮才有的內容。`
    : '';
  const body = questions.map((q) => {
    const picked = answers[q.id];
    const options = q.options.map((opt) => {
      const chosen = picked === opt;
      const cls = ['quiz-option', chosen ? 'chosen' : '', picked && opt === q.answer ? 'correct' : '',
        chosen && opt !== q.answer ? 'wrong' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-quiz="${esc(q.id)}" data-quiz-option="${esc(opt)}"${picked ? ' disabled' : ''}>${esc(opt)}</button>`;
    }).join('');
    const feedback = picked
      ? `<p class="quiz-feedback ${picked === q.answer ? 'ok' : 'no'}">${picked === q.answer ? '答對了。' : `再看一次：正確答案是「${esc(q.answer)}」。`}${esc(q.explain)}</p>`
      : '';
    return `<div class="quiz-item"><p class="quiz-prompt">${esc(q.prompt)}</p><div class="quiz-options">${options}</div>${feedback}</div>`;
  }).join('');
  return `<details class="learn-quiz" data-dashboard-detail="learn-quiz"${state.dashboardOpenDetails.has('learn-quiz') ? ' open' : ''}>
    <summary>先自己判斷（${questions.length} 題，答完才看答案）</summary>
    <p class="learn-hint">這些題目都可以直接從上面的盤面資料查證，不考流派爭議，也不考模糊的命理解釋。</p>
    ${retired ? `<p class="learn-hint quiz-progress">${esc(retired)}</p>` : ''}
    ${body}
    <button type="button" class="mini-btn" id="learn-quiz-reset">重做這一宮的練習</button>
  </details>`;
}

function renderLearningPanel() {
  if (state.readingMode !== 'learn') return '';
  const lesson = currentLesson();
  if (!lesson) return '';
  const questions = currentQuiz(lesson);
  // 切階段後，原本展開的步驟可能已經不在這一階段裡，退回第一步避免整區空白
  const levelSteps = currentLevel().steps;
  if (state.learning.openStep && !levelSteps.includes(state.learning.openStep)) {
    state.learning.openStep = levelSteps[0];
  }
  const openStep = state.learning.openStep;
  // 目前展開的這一步就是使用者正在讀的內容，在算進度之前先記下來，
  // 否則進度條會永遠慢一次重繪（讀了第五步卻要再點一下別的地方才會更新）。
  if (openStep) {
    state.learningProgress = R.markStepRead(safeLocalStorage(), learningChartKey(), lesson.palaceName, openStep);
  }
  const progress = R.progressSummary(state.learningProgress, currentLevel().steps.length);

  const bodyOf = (step) => ({
    self: () => learningStepSelfHtml(step.data),
    opposite: () => learningStepOppositeHtml(step.data),
    triad: () => learningStepTriadHtml(step.data),
    mutagen: () => learningStepMutagenHtml(step.data),
    synthesis: () => learningStepSynthesisHtml(step.data),
  }[step.id]());

  // 初階只有三步，進階與高級五步。步驟編號依實際顯示的重新算，
  // 否則初階會出現「1、2、5」這種跳號，看起來像少了東西。
  const level = currentLevel();
  const visibleSteps = lesson.steps.filter((step) => level.steps.includes(step.id));
  const steps = visibleSteps.map((step, index) => {
    const open = step.id === openStep;
    const done = (state.learningProgress.palaces?.[lesson.palaceName]?.steps ?? []).includes(step.id);
    return `<section class="learn-step${open ? ' open' : ''}${done ? ' done' : ''}">
      <button type="button" class="learn-step-head" data-learn-step="${esc(step.id)}" aria-expanded="${open}" aria-controls="learn-step-${index}">
        <span class="learn-step-no">${index + 1}</span>
        <span class="learn-step-title">${esc(`${R.stepOrdinal(index)}：${step.name}`)}<small>${esc(step.hint)}</small></span>
        <i aria-hidden="true">${open ? '−' : '＋'}</i>
      </button>
      ${open ? `<div class="learn-step-body" id="learn-step-${index}">${bodyOf(step)}</div>` : ''}
    </section>`;
  }).join('');

  const glossary = lesson.glossary.map((g) => glossaryTip(g.term, g.text)).join('');
  const badges = [
    lesson.isEmpty ? '<span class="learn-badge empty">空宮</span>' : '',
    lesson.isBodyPalace ? '<span class="learn-badge">身宮</span>' : '',
    lesson.isLaiyin ? '<span class="learn-badge">來因宮</span>' : '',
  ].join('');

  return `<div class="card learn-card" id="learn-card">
    <div class="learn-head">
      <div class="round-icon">學</div>
      <div class="learn-head-text">
        <b>逐步判讀：${esc(lesson.palaceName)}（${esc(lesson.position)}）</b>${badges}
        <small>照著五個步驟讀一遍，就知道下面的結論是從盤面哪幾項資料推出來的。點左側命盤可換宮位。</small>
      </div>
    </div>
    <div class="learn-levels">
      <div class="learn-level-pills" role="group" aria-label="學習階段">
        ${R.LEARNING_LEVELS.map((l) => `<button type="button" class="level-pill${l.key === level.key ? ' active' : ''}"
          data-learn-level="${esc(l.key)}" aria-pressed="${l.key === level.key}">
          <b>${esc(l.label)}</b><small>${esc(l.subtitle)}</small></button>`).join('')}
      </div>
      <p class="learn-level-intro">${esc(level.intro)}</p>
    </div>
    <div class="learn-progress">
      <span>${esc(progress.label)}</span>
      <div class="learn-progress-bar"><i style="width:${(progress.completedCount / progress.total) * 100}%"></i></div>
      ${progress.quizAnswered ? `<small>練習答對 ${progress.quizCorrect}／${progress.quizAnswered}</small>` : ''}
      <button type="button" class="mini-btn" id="learn-continue">繼續上次學習</button>
      <button type="button" class="mini-btn" id="learn-reset">重設學習進度</button>
    </div>
    ${learningEmptyGuideHtml(lesson.emptyGuide)}
    <div class="learn-steps">${steps}</div>
    ${learningQuizHtml(lesson, questions)}
    ${glossary ? `<div class="learn-glossary"><b>這一頁出現的名詞</b><div class="learn-glossary-list">${glossary}</div><small>點名詞可看說明；桌面版滑過去也會顯示。</small></div>` : ''}
  </div>`;
}

/**
 * 學習模式的互動綁定。
 * 每次 renderDashboard() 重畫都會重新呼叫，所以這裡只綁在本次產生的節點上，
 * 不需要另外解除監聽（舊節點已經被 innerHTML 整批換掉）。
 */
function bindLearningPanel() {
  const storage = safeLocalStorage();
  const chartKey = learningChartKey();

  // 切換學習階段：內容深度跟著換，選擇記在 localStorage，換命盤也保留
  $$('#view-dashboard [data-learn-level]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.learning.level = btn.dataset.learnLevel;
      saveLearningLevel(state.learning.level);
      renderDashboard();
    }));

  $$('#view-dashboard [data-learn-step]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const stepId = btn.dataset.learnStep;
      // 再點一次同一步等於收合，但「看過」的紀錄留著——進度是累積的，不會因為收合就倒退
      state.learning.openStep = state.learning.openStep === stepId ? null : stepId;
      if (state.learning.openStep) {
        state.learningProgress = R.markStepRead(storage, chartKey, state.selectedPalace, stepId);
      }
      renderDashboard();
    }));

  $$('#view-dashboard [data-quiz-option]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const questionId = btn.dataset.quiz;
      const picked = btn.dataset.quizOption;
      const lesson = currentLesson();
      const question = currentQuiz(lesson).find((q) => q.id === questionId);
      if (!question) return;
      (state.learning.answers[state.selectedPalace] ??= {})[questionId] = picked;
      state.learningProgress = R.recordQuizAnswer(storage, chartKey, state.selectedPalace, questionId, picked === question.answer);
      state.dashboardOpenDetails.add('learn-quiz');
      renderDashboard();
    }));

  $('#learn-quiz-reset')?.addEventListener('click', () => {
    delete state.learning.answers[state.selectedPalace];
    state.dashboardOpenDetails.add('learn-quiz');
    renderDashboard();
  });

  $('#learn-continue')?.addEventListener('click', () => {
    const next = R.nextPalaceToLearn(state.learningProgress);
    state.selectedPalace = next;
    state.learning.openStep = 'self';
    renderDashboard();
    toast(`接著看${next}`);
  });

  $('#learn-reset')?.addEventListener('click', () => {
    state.learningProgress = R.resetProgress(storage, chartKey);
    state.learning = { openStep: 'self', quizOpen: false, answers: {} };
    renderDashboard();
    toast('已重設這張命盤的學習進度');
  });

  // 名詞小百科：桌面版用 title 顯示，手機沒有 hover,點一下用 toast 顯示同一段說明
  $$('#view-dashboard [data-glossary]').forEach((btn) =>
    btn.addEventListener('click', () => toast(`${btn.dataset.glossary}：${btn.title}`)));

  // 星曜就地查詢：命盤上看到的每一顆星都能點開看定義，不必離開頁面去翻小百科
  $$('#view-dashboard [data-star-def]').forEach((btn) =>
    btn.addEventListener('click', () => toast(`${btn.dataset.starDef}：${btn.title}`)));
}

/**
 * 「為什麼這樣判斷」：白話結論下方的可展開證據鏈。
 * 內容是專業資料，沿用 .palace-technical 這個既有的收合樣式與語意，
 * 讓它跟命盤小教室的「專業資料」在視覺與可讀性檢查上都屬於同一類。
 */
/**
 * 來源鏈：重點解讀與完整報告的每一段，都要能回答「這段話的依據從命盤哪裡來」。
 *
 * 先前這兩頁只有一塊收合的「專業命理依據」，裡面是一長串「天同的亮度是廟…」——
 * 那是把術語倒出來，不是說明來源。使用者的原話是「學習模式是真的要教會這些根據
 * 是從哪裡得來的結論」，所以這裡直接沿用命盤總覽那套證據鏈：
 * 主要依據列出用到的盤面事實，推導寫成「因為…所以…」，最後給一顆按鈕跳回
 * 命盤總覽的那一宮，接著用逐步判讀把同一件事完整走一遍。
 *
 * 不重算任何命盤事實：evidence 全部來自 learning-palace.js 對既有排盤結果的整理。
 */
function sourceChainHtml(palaceName, { title = '這段話的依據從哪裡來' } = {}) {
  if (!isLearnMode() || !state.data?.ziWei || !palaceName) return '';
  const { limit, year } = currentLuckSelection();
  const lesson = R.buildPalaceLesson({ ziWei: state.data.ziWei, palaceName, year, majorLimit: limit });
  if (!lesson) return '';
  const { evidence } = lesson;
  const facts = evidence.primary.map((e) => `<li><b>${esc(e.kind)}</b>${esc(e.text)}</li>`).join('');
  const steps = (evidence.interactionSteps ?? []).map((p) => `<p>${esc(p.text)}</p>`).join('');
  return `<details class="source-chain" data-source-chain="${esc(palaceName)}">
    <summary>${esc(title)}（${esc(palaceName)}）</summary>
    <div class="source-chain-body">
      <div class="tech-block"><b>用到的盤面資料</b>
        <ul>${facts || `<li>${esc(palaceName)}目前沒有可作為主要依據的資料。</li>`}</ul></div>
      ${steps ? `<div class="tech-block"><b>怎麼從這些資料推到上面那段話</b>${steps}</div>` : ''}
      <button type="button" class="mini-btn" data-jump-palace="${esc(palaceName)}">
        到命盤總覽的${esc(palaceName)}，一步一步走一次 →</button>
    </div>
  </details>`;
}

/** 八字段落沒有宮位可跳，只列出它用到的命盤資料，一樣不給無來源的術語 */
function baziSourceChainHtml(text, label) {
  if (!isLearnMode() || !text) return '';
  return `<details class="source-chain">
    <summary>這段話的依據從哪裡來（八字${label ? `・${esc(label)}` : ''}）</summary>
    <div class="source-chain-body">
      <div class="tech-block"><p>${esc(text)}</p></div>
      <p class="source-chain-note">八字看的是四柱干支與十神，沒有對應的宮位可以跳，
        名詞可以到命理小百科的八字分區查。</p>
    </div>
  </details>`;
}

function whyPanelHtml(lesson) {
  if (!lesson) return '';
  const { evidence } = lesson;
  const list = (items) => items.map((e) => `<li><b>${esc(e.kind)}</b>${esc(e.text)}</li>`).join('');
  // 刻意不套用 .palace-technical:那個 class 已經被命盤小教室的「專業資料」與可讀性檢查當成
  // 「該宮位的原始命盤資料」使用，再掛一份會讓 querySelector('.palace-technical') 抓到錯的區塊。
  // 這裡用 .learn-why 自己的收合樣式（視覺與 .palace-technical 一致，見 style.css）。
  return `<details class="learn-why" data-dashboard-detail="learn-why"${state.dashboardOpenDetails.has('learn-why') ? ' open' : ''}>
    <summary>為什麼這樣判斷？</summary>
    <div class="analysis-card__panel--technical" style="margin-top:10px">
      <div class="tech-block"><b>主要依據</b><ul>${list(evidence.primary) || '<li>目前沒有可用的主要依據。</li>'}</ul></div>
      <div class="tech-block"><b>輔助依據</b><ul>${list(evidence.supporting) || '<li>目前沒有輔助依據。</li>'}</ul></div>
      <div class="tech-block"><b>推導過程</b>
        <p>${esc(evidence.conclusion.observed)}</p>
        ${(evidence.interactionSteps ?? []).map((p) => {
    const label = stepSourceLabel(p.source);
    return `<p>${esc(p.text)}${label ? `<span class="conclusion-source">← ${esc(label)}</span>` : ''}</p>`;
  }).join('')
    || `<p>${esc(evidence.conclusion.interaction)}</p>`}
        <p>${esc(evidence.conclusion.behavior)}</p></div>
      <div class="tech-block"><b>還需要確認的部分</b><p>${esc(evidence.conclusion.pending)}</p></div>
    </div>
  </details>`;
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

  // 「現在」是哪個大限、哪一年——用來在一排 chips 裡標出「現在」徽章，
  // 跟使用者點選瀏覽的「選取中」區分開，避免切換幾次後忘記自己現在實際在哪個階段
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

  // 白話短版：年度一句話重點 + 有利方向/需要留意，紫微跟八字各自的完整依據收在「專業運勢依據」裡分開標示
  // (沿用 compose-plain.js 既有的時間卡片生成邏輯，不重算任何排盤或四化十神資料，只是換一組 age/year 參數)
  const zwCard = R.generatePlainZiweiTimeCard(state.data.ziWei, { age: sel.age, year: sel.year });
  const bzCard = R.generatePlainBaziTimeCard(state.data.baZi, { year: sel.year });
  const lifeStage = lifeStageForYear(input, sel.year);
  const dedupe = (arr, n) => [...new Set(arr.filter(Boolean))].slice(0, n);
  const favorable = dedupe([...(zwCard.advice ?? []), ...(bzCard.advice ?? [])], 4).map((t) => adaptToLifeStage(t, lifeStage));
  const cautions = dedupe([...(zwCard.challenges ?? []), ...(bzCard.challenges ?? [])], 3).map((t) => adaptToLifeStage(t, lifeStage));
  const themeList = (title, items) => items.length
    ? `<div class="analysis-card__section"><div class="analysis-card__section-title">${esc(title)}</div><ul class="analysis-card__list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`
    : '';

  return `<div class="card">
    <div class="card-label">大限・流年</div>
    <div class="card-hint">先選十年大限，再選其中某一年，逐年查看這一年的重點——這裡可自由切換任何年份，跟「重點摘要」固定顯示現在的內容不同。</div>
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
      ${isLearnMode() ? `<details class="palace-technical" data-dashboard-detail="annual-technical"${state.dashboardOpenDetails.has('annual-technical') ? ' open' : ''}>
        <summary>專業運勢依據</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>紫微（大限重心：${esc(daxianPalace)}／流年命宮：${esc(liunianPalace)}）</b><p>${esc(zwCard.technical.judgment)}</p></div>
          <div class="tech-block"><b>八字</b><p>${esc(bzCard.technical.judgment)}</p></div>
        </div>
      </details>` : ''}
      ${renderMonthlyBrowser(sel.year)}
    </div>
  </div>`;
}

/** 流月瀏覽（八字）：選定年份內逐月查看變動，預設收合 */
function renderMonthlyBrowser(year) {
  if (state.monthIdx === null) {
    return `<button type="button" class="mini-btn" id="open-monthly" style="align-self:flex-start;margin-left:0">＋ 展開 ${year} 逐月變動（八字流月）</button>`;
  }
  const monthly = R.monthlyPillarsOf(year);
  const chips = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const gz = monthly[String(m).padStart(2, '0')];
    return `<button type="button" class="chip${i === state.monthIdx ? ' active' : ''}" data-month="${i}">${m}月<br><small>${esc(gz)}</small></button>`;
  }).join('');
  const m = state.monthIdx + 1;
  const detail = R.composeMonthlyChange(state.data.baZi, year, m, { mode: 'study' });
  const zwMonthly = R.composeZiWeiMonthly(state.data.ziWei, year, m, { mode: 'study' });
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
    財運: ['資源運用、具體成果與生活安排', '適合整理預算、物品或可執行的計畫', '不要只看眼前利益，也要保留長期餘裕'],
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
    <div class="chip-label" style="margin-top:4px">流月（${year} 年；八字以節氣月、紫微斗君以農曆月計，月界略有差異）</div>
    <div class="chip-row">${chips}</div>
    <div class="monthly-plain">
      <p class="palace-takeaway">${m} 月重點：${esc(domain)}，同時適合留意${esc(adaptToLifeStage(categoryPlain[0], stage))}。</p>
      ${list('這個月可以把握', favorable)}
      ${list('這個月需要留意', cautions)}
      <p class="monthly-action">先選一件與「${esc(domain)}」有關、能在本月完成的小事；遇到變化時先確認資訊，再調整步調。</p>
      ${isLearnMode() ? `<details class="palace-technical" data-dashboard-detail="monthly-technical"${state.dashboardOpenDetails.has('monthly-technical') ? ' open' : ''}>
        <summary>查看流月專業依據</summary>
        <div class="analysis-card__panel--technical" style="margin-top:10px">
          <div class="tech-block"><b>紫微流月命宮與四化</b><p>${esc(flat(zwMonthly.text))}</p></div>
          <div class="tech-block"><b>八字流月干支與引動</b><p>${esc(flat(detail.text))}</p></div>
        </div>
      </details>` : ''}
    </div>`;
}

function renderDashboard() {
  const isZw = state.chartTab !== 'bazi';
  const hourWarn = state.data.hourUnknown
    ? `<div class="card" style="border-color:var(--gold)"><div class="card-hint" style="margin:0">⚠ 時辰未知：目前以「午時」暫排。紫微命盤的宮位與八字時柱會隨時辰改變，以下結果僅供參考；年柱、月柱、日柱與五行分佈不受影響，仍為準確資訊。</div></div>`
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
        ${renderLearningPanel()}
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
      if (state.readingMode === 'learn') {
        // 換宮位時逐步判讀回到第一步，並記下「這一宮開始讀了」
        state.learning.openStep = 'self';
        state.learningProgress = R.markStepRead(safeLocalStorage(), learningChartKey(), state.selectedPalace, 'self');
      }
      renderDashboard();
      // 宮格放大後，命盤小教室常被推到可視範圍外，點擊宮位卻像沒反應——主動捲過去，不用使用者自己往下找
      const classroomCard = $('#classroom-card');
      if (classroomCard?.scrollIntoView) classroomCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  $$('#view-dashboard [data-limit]').forEach((chip) =>
    chip.addEventListener('click', () => { state.limitIdx = Number(chip.dataset.limit); state.yearIdx = 0; renderDashboard(); }));
  $$('#view-dashboard [data-year]').forEach((chip) =>
    chip.addEventListener('click', () => { state.yearIdx = Number(chip.dataset.year); state.monthIdx = null; renderDashboard(); }));
  // 只在各 chip 列內做水平置中；scrollIntoView 會連整頁一起垂直捲動，
  // 造成使用者切流月後被帶回按鈕列，還得重新往下找正文。
  $$('#view-dashboard .chip-row').forEach((row) => {
    const activeChip = row.querySelector('.chip.active');
    if (activeChip) {
      row.scrollLeft = Math.max(0, activeChip.offsetLeft - (row.clientWidth - activeChip.clientWidth) / 2);
    }
  });
  $('#open-monthly')?.addEventListener('click', () => {
    // 展開時預設選「現在的月份」(若瀏覽的是當年),否則 1 月
    const { year } = currentLuckSelection();
    state.monthIdx = year === new Date().getFullYear() ? new Date().getMonth() : 0;
    renderDashboard();
  });
  $$('#view-dashboard [data-month]').forEach((chip) =>
    chip.addEventListener('click', () => { state.monthIdx = Number(chip.dataset.month); renderDashboard(); }));

  bindLearningPanel();

  // 複製「宮位中心」AI 提示詞（以命盤小教室目前選中的宮位為中心）
  $('#copy-palace-prompt')?.addEventListener('click', async () => {
    const { input, ziWei } = state.data;
    await ensureModules('formatAi'); // 提示詞模組是動態載入的，按下去才需要
    const text = mod.formatAi.formatPalacePromptForAI({ input, ziWei, palaceName: state.selectedPalace });
    if (!text) return toast('此宮位暫無提示詞模板');
    try {
      await navigator.clipboard.writeText(text);
      toast(`已複製${state.selectedPalace}分析提示詞，可貼給AI`);
    } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
  });

  // 複製「流年中心」AI 提示詞（以大限流年瀏覽目前選中的年份為基準）
  $('#copy-annual-prompt')?.addEventListener('click', async () => {
    const { input, baZi, ziWei } = state.data;
    const { year: selYear } = currentLuckSelection();
    await ensureModules('formatAi');
    const text = mod.formatAi.formatAnnualPromptForAI({ input, baZi, ziWei, year: selYear });
    try {
      await navigator.clipboard.writeText(text);
      toast(`已複製 ${selYear} 流年分析提示詞，可貼給AI`);
    } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
  });
}

// ---------- 主題分析：從使用者真正想問的問題開始 ----------
/**
 * 每題先取自己的 Topic Contract，再由本盤卡片建立、過濾與評分證據。
 * 結論、情境、建議與 AI 複製內容全部共用 buildTopicReport() 的結果。
 */
function topicReportFor(contract, ziWei, baziCards) {
  const ziweiCard = R.generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]);
  return R.buildTopicReport({ contract, ziWei, ziweiCard, baziCards });
}

/**
 * 依據與正文共用 buildTopicReport() 選出的同一組證據，不再直接印 card.summary。
 *
 * 除了列出證據，再附一段「為什麼這樣判斷」的推導過程——只列資料而不說明彼此關係，
 * 讀的人仍然不知道結論是怎麼來的。推導文字沿用學習模式的證據鏈（learning-palace.js），
 * 兩邊講的是同一套邏輯，不另外寫一份會各自漂移的說法。
 * 這段放在 .tech-block 裡，屬於預設收合的專業資料，與白話正文區隔開。
 */
function topicChartBasisHtml(report) {
  // 列的是可以回到命盤上核對的事實(宮位、主星、亮度、生年四化、借星)，
  // 不是「XX宮的主要訊號」這種每一條都長一樣、對誰都成立的佔位字串。
  const rows = (report.chartBasis ?? []).map((item) =>
    `<li><b>${esc(item.label)}</b><span>${esc(item.detail)}</span></li>`);
  if (!rows.length) return '';
  return `<details class="topic-answer topic-answer--basis">
    <summary>查看這一題的命盤依據（專業資料）</summary>
    <ul class="topic-basis-list">${rows.join('')}</ul>
    <small>複製給 AI 時只會使用這些已篩選內容，不會由網站上傳。</small>
  </details>`;
}

function topicDirectAnswerHtml(report) {
  const answer = report.directAnswer;
  // 答案本身取自「題目 × 主星」的答案庫，扣題但只看主星。
  // 同宮的吉星煞星與四化會實際改變這一題的答案，所以在後面補一層修正。
  const notes = answer.modifierNote ?? [];
  return `<section class="topic-answer topic-answer--combined">
    <b>簡單回答</b>
    <p>${esc(answer.answer)}</p>
    ${notes.length ? `<div class="topic-modifier">
      <b>這一宮還有其他星，會這樣調整</b>
      ${notes.map((n) => `<p>${esc(n)}</p>`).join('')}
    </div>` : ''}
  </section>`;
}

function renderTopics() {
  const { ziWei, baZi, bzLuck, elements } = state.data;
  const topic = R.TOPIC_CATEGORIES.find((item) => item.key === state.topicKey) ?? R.TOPIC_CATEGORIES[0];
  const baziCards = R.generatePlainBaziTopics(baZi, bzLuck, elements);

  const tabs = R.TOPIC_CATEGORIES.map((item) => `
    <button type="button" class="topic-tab${item.key === topic.key ? ' active' : ''}" data-topic="${item.key}" aria-pressed="${item.key === topic.key}">
      <span>${item.icon}</span>${item.label}
    </button>`).join('');
  const questions = topic.contracts.map((contract, index) => {
    const open = state.topicQuestion === index;
    const report = open ? topicReportFor(contract, ziWei, baziCards) : null;
    return `<article class="topic-question-card${open ? ' open' : ''}">
      <button type="button" class="topic-question-head" data-open-topic-question="${index}" aria-expanded="${open}" aria-controls="topic-answer-${index}">
        <span>Q${index + 1}</span><h3>${esc(contract.question)}</h3><i aria-hidden="true">›</i>
      </button>
      ${open ? `<div class="topic-question-body" id="topic-answer-${index}">
        ${topicDirectAnswerHtml(report)}
        ${topicChartBasisHtml(report)}
        <button type="button" class="mini-btn topic-ai-btn" data-topic-question="${index}">複製這題給 AI 深入問</button>
      </div>` : ''}
    </article>`;
  }).join('');

  $('#view-topics').innerHTML = `
    <div class="report-intro"><b>先選主題，再點開一個你真正想知道的問題。</b>每題提供紫微與八字的初步綜合方向，也可以把該題與命盤資料複製給 AI 繼續追問。</div>
    <div class="topic-tabs" aria-label="選擇分析主題">${tabs}</div>
    <div class="topic-heading"><div class="round-icon">${topic.icon}</div><div><h2>${topic.label}主題</h2><p>選一題，先看簡短答案；需要時再展開命盤依據。</p></div></div>
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
      const contract = topic.contracts[index];
      const report = topicReportFor(contract, ziWei, baziCards);
      await ensureModules('formatAi');
      const text = mod.formatAi.formatTopicPromptForAI({ contract, report });
      try {
        await navigator.clipboard.writeText(text);
        toast(`已複製「${contract.question}」AI 解讀提示`);
      } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
    }));
}

// ---------- 分頁二：重點解讀 ----------
function reportItems() {
  // 白話摘要卡片（7 段式結構）全部交給 compose-plain.js 組裝，這裡只負責取用已經算好的
  // 命盤資料（ziWei/baZi）與現行大限流年（zwLuck/bzLuck）、五行分佈（elements），不重新排盤、
  // 不重算星曜宮位或十神喜用神——沿用 applyReadingMode() 已組裝好的資料。
  const { ziWei, baZi, zwLuck, bzLuck, elements } = state.data;
  const ziwei = R.generatePlainZiweiTopics(ziWei, zwLuck);
  const bazi = R.generatePlainBaziTopics(baZi, bzLuck, elements);
  return { ziwei, bazi };
}

/** 白話摘要卡片內的清單型區塊（生活中的表現／可能的挑戰／發揮建議） */
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
 * 重點解讀每張卡片對應命盤的哪一宮。大限流年那張跨多宮，沒有單一來源，
 * 它本來就有「到命盤總覽切換查看」的按鈕，不重複給來源鏈。
 */
const REPORT_CARD_PALACE = {
  ming: '命宮', caibo: '財帛宮', guanlu: '官祿宮', fuqi: '夫妻宮', jie: '疾厄宮',
};

/**
 * 卡片的來源鏈。原本這裡是「白話摘要／專業依據」二選一：切到專業，白話整段消失，
 * 換成一整塊術語。結果是兩個模式各缺一半，看術語的人失去了結論，看結論的人查不到依據。
 * 改成白話永遠在，學習模式在下面追加來源鏈。
 */
function reportCardSourceHtml(it, isZiwei) {
  if (!isLearnMode()) return '';
  if (isZiwei) {
    const palace = REPORT_CARD_PALACE[it.key];
    return palace ? sourceChainHtml(palace) : '';
  }
  return baziSourceChainHtml(it.technical?.judgment, it.title);
}

function renderReport() {
  const { ziwei, bazi } = reportItems();
  const isZiwei = state.reportTab === 'ziwei';
  const items = isZiwei ? ziwei : bazi;
  const expandedKeys = isZiwei ? state.expandedZiwei : state.expandedBazi;
  // 紫微斗數/八字兩個分頁各自記住自己選的是「白話摘要」還是「專業依據」(見 state.reportViewMode)
  const isStudy = state.reportViewMode[state.reportTab] === 'learn';

  const intro = isZiwei
    ? '<b>這頁是一張一張的重點卡片，挑你在意的點開就好，不用全部讀完。</b>每張卡都是「重點一句話 → 現在可能出現 → 需要留意 → 接下來可以做」。想從頭讀完一份完整的人生分析，去<button type="button" class="link-jump" data-goto="comprehensive">完整報告</button>（約 15 分鐘）；想自己切換宮位或年份查資料，去<button type="button" class="link-jump" data-goto="dashboard">命盤總覽</button>。'
    : '<b>這頁是一張一張的重點卡片，挑你在意的點開就好，不用全部讀完。</b>每張卡都是「重點一句話 → 現在可能出現 → 需要留意 → 接下來可以做」。想從頭讀完一份完整的人生分析，去<button type="button" class="link-jump" data-goto="comprehensive">完整報告</button>（約 15 分鐘）；想自己切換宮位或年份查資料，去<button type="button" class="link-jump" data-goto="dashboard">命盤總覽</button>。'

  const usedCardTitles = new Set();
  const list = items.map((it) => {
    const open = expandedKeys.includes(it.key);
    const cardTitle = R.uniqueHeading(it.title, usedCardTitles, it.summary);
    // 大限/大運這兩項跟「命盤總覽」的互動大限流年瀏覽器內容有重疊，這裡只保留現在的固定摘要，
    // 並加一個跳轉按鈕，引導想看其他年份的人去真正能自由切換的地方，而不是把所有年份都重複印一次
    const jumpNote = (it.key === 'xian' || it.key === 'dayun')
      ? '<button type="button" class="mini-btn acc-jump" data-jump-dashboard="1" style="margin-top:10px">→ 到「命盤總覽」切換查看其他大限／流年</button>'
      : '';
    const panelId = `report-panel-${it.key}`;
    return `<div class="analysis-card${open ? ' open' : ''}${it.borrowed ? ' is-borrowed' : ''}">
      <button type="button" class="analysis-card__header" data-acc="${it.key}" aria-expanded="${open}" aria-controls="${panelId}">
        <div class="round-icon" style="background:${it.color}">${it.letter}</div>
        <div class="analysis-card__headtext">
          <div class="analysis-card__title">${esc(cardTitle)}</div>
          ${!open ? `<div class="analysis-card__peek">${esc(it.summary)}</div>` : ''}
        </div>
        <div class="acc-chevron">›</div>
      </button>
      ${open ? `<div class="analysis-card__content" id="${panelId}">
        ${analysisPlainPanelHtml(it, false)}
        ${reportCardSourceHtml(it, isZiwei)}
        ${jumpNote}
      </div>` : ''}
    </div>`;
  }).join('');

  // 分享邀請放在報告讀完之後（頁尾），而不是命盤總覽一進來就跟「閱讀報告」平起平坐——
  // 使用者對命盤內容還沒有感覺時被邀請分享，順序上太早；看完摘要覺得「準」或有共鳴，才是自然的分享時機
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
      syncModeToggleUI(); // 換分頁後，按鈕要立刻反映這個分頁自己記住的白話/專業狀態
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

// ---------- 分頁：深度解析（綜合報告） ----------
// 深度解析（綜合報告）裡屬於補充細節、預設收合的段落標題（點開才展開，避免一次全部展開資訊過載）
const COLLAPSIBLE_DETAIL_TITLES = new Set(['四、地支關係', '五、神煞']);

// 段落標題在引擎裡是內部識別字（收合設定、白話導語、測試都以它為鍵），不適合直接改掉；
// 但「地支關係」「神煞」「財官流向」對沒學過命理的人是看不懂的行話，直接當標題放在畫面上
// 會讓人一眼覺得「這頁不是給我看的」。這裡只換顯示文字，內部識別字維持不變。
const PLAIN_SECTION_TITLE = {
  '四、地支關係': '四、各領域之間的牽動',
  '五、神煞': '五、加分與要留意的地方',
  '二、財官流向': '二、金錢與事業的流向',
  '三、人際健康與行動建議': '三、人際、健康與可以怎麼做',
};
/** 顯示用標題：大眾版換成白話，專業命盤模式維持原本的術語標題（學習者需要對得上書上的名詞） */
const displayTitle = (title) => (state.readingMode === 'learn' ? title : (PLAIN_SECTION_TITLE[title] ?? title));

// 深度解析的長文段落沿用 comprehensive.js 既有的組裝結果（不重寫那套模板邏輯），但這裡做兩件事：
// 1) 把「從命宮來看」「官祿宮顯示」「日主丁（火日生）」這類白話模式不該出現的宮位/術語開頭句型
//    做輕量清除，不動 comprehensive.js 本體，只在渲染這一層處理；
// 2) 幫每段加一句白話 headline(重用命盤總覽/重點解讀已經有的白話摘要內容，不重新寫一份)。
function stripJargonOpeners(text) {
  return text
    // 注意：以下幾條正規表示式裡的圓括號是分組與擷取語法，不是中文標點，不要全形化；
    // 被比對的原文可能是半形或全形逗號，所以字元類別一律寫成 [,，] 兩者都收。
    .replace(/從(?:命宮|身宮所在的)?[一-龥]{0,4}(?:宮)?來看[,，]?/g, '')
    .replace(/而身宮所在的([一-龥]{2,4}宮)[,，]?則/g, '同時，你的$1也')
    .replace(/([一-龥]{2,4}宮)(?:顯示|呈現|給的[一-龥]{0,4}提醒是)[,，]?/g, '你')
    .replace(/日主[甲乙丙丁戊己庚辛壬癸][(（][^)）]*[)）](?:是這張命盤的核心)?[,，]?/g, '')
    .replace(/(?:紫微|天機|太陽|武曲|天同|廉貞|天府|太陰|貪狼|巨門|天相|天梁|七殺|破軍)(?:化[祿權科忌])?[:：,，]?/g, '')
    // readingDeduped() 的空宮借星備註句：「本宮無主星，借對宮XX的YY參看，方向與前述XX的特質一致」
    .replace(/本宮無主星[,，]借對宮([一-龥]{2,4})的([^,，。]+)參看[,，]方向與前述\1的特質一致[,，。]?/g, '這裡跟前面提到的$1方向一致，呈現$2的傾向。')
    // 呼應差異判斷邏輯裡「交集數量=0」的固定句，是唯一命中禁用詞「呈現差異」的地方
    .replace(/呈現差異[,，]兩個宮位的特質分屬不同面向[,，]顯示需要兼顧不同性質的課題[。]?/g, '兩邊呈現的樣貌不太一樣，比較適合分開來看，不用勉強套成同一套邏輯。')
    .replace(/^[,，]\s*/, '')
    .trim();
}

/** 長段文字依句號拆成短段落（每段約 2 句），避免一大塊文字牆 */
function splitParagraphs(text, sentencesPerParagraph = 2) {
  const sentences = text.split(/(?<=。)/).map((s) => s.trim()).filter(Boolean);
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join(''));
  }
  return paragraphs.length ? paragraphs : [text];
}

/**
 * 每段的導讀句：告訴讀者「這一段要談什麼」，而不是先把結論講一次。
 *
 * 舊版是直接重用 generatePlainPalaceCard(命宮).summary——也就是「重點摘要」那張卡的第一句。
 * 立意是保持兩頁說法一致，但實際效果是：使用者從重點摘要點進完整報告，
 * 看到的第一句話一字不差，直覺就是「這兩頁根本一樣」，於是不再往下讀。
 * 兩頁本來就該有明顯不同的入口感受：重點摘要給結論，完整報告給脈絡。
 * 所以這裡改成描述「這一段的範圍與看法角度」的固定導讀句，不重複任何結論。
 */
function comprehensiveHeadline(title, source) {
  if (source?.summary) return source.summary;
  switch (title) {
    case '一、性格與才華': return '先看你平常怎麼判斷、採取行動，以及壓力來時會切換成哪種反應。';
    case '二、事業與金錢': return '工作選擇會連動收入、安全感與生活安排，這裡把幾個位置一起比對。';
    case '三、戀愛與婚姻': return '親密關係裡的吸引、靠近與衝突反應，需要放在同一條互動過程裡看。';
    case '四、健康、家庭與人際': return '身心負荷常會沿著家庭責任、居住狀態或人際互動浮現。';
    case '五、行動建議': return '以下整理幾個目前值得留意、可以主動調整的方向。';
    case '六、當前焦點': return '前面談的是長期底色，這一段回到現在：目前這十年與今年，重心分別落在哪裡。';
    case '全盤概覽': return '先用一頁的篇幅，把八字在事業、財運、感情、健康、家庭與當前運勢上的方向各講一句，讓你對整體有個輪廓。';
    case '一、個性本質': return '八字補充內在動力與壓力反應，能和紫微呈現的外在行為互相核對。';
    case '二、財官流向': return '這一段談錢與事業在你命盤裡的流向：資源從哪裡來、容易停在哪裡，以及五行分布如何影響你的做事節奏。';
    case '三、人際健康與行動建議': return '這一段把人際互動、身心負荷與目前的大運流年合起來談，並收在幾個具體可行的方向上。';
    case '四、地支關係': return '這裡整理你命盤四柱之間的地支互動，會反映在跟不同對象、不同人生階段的相處模式上。';
    case '五、神煞': return '以下是命盤中幾個比較特別的印記，代表一些額外的加分或需要留意的地方。';
    default: return '';
  }
}

function deepSourceCard(title, { ziWei, baziCards }) {
  const bazi = (key) => baziCards.find((c) => c.key === key);
  switch (title) {
    case '一、性格與才華': return R.generatePlainPalaceCard(ziWei, '命宮');
    case '二、事業與金錢': return R.generatePlainPalaceCard(ziWei, '官祿宮');
    case '三、戀愛與婚姻': return R.generatePlainPalaceCard(ziWei, '夫妻宮');
    case '四、健康、家庭與人際': return R.generatePlainPalaceCard(ziWei, '疾厄宮');
    case '全盤概覽': return null;
    case '一、個性本質': return bazi('zhu');
    case '二、財官流向': return bazi('xiji') || bazi('yongshen');
    case '三、人際健康與行動建議': return bazi('shishen') || bazi('dayun');
    default: return null;
  }
}

/**
 * 完整報告每一段對應命盤的哪一宮——來源鏈要跳回去，就得先知道跳到哪。
 * 這份對照跟 deepSourceCard 取白話卡片用的是同一個宮位，不會出現
 * 「上面講夫妻宮、跳過去卻是命宮」這種對不起來的情況。
 */
const DEEP_SECTION_PALACE = {
  '一、性格與才華': '命宮',
  '二、事業與金錢': '官祿宮',
  '三、戀愛與婚姻': '夫妻宮',
  '四、健康、家庭與人際': '疾厄宮',
};

/** 完整報告的段落來源：紫微段落給宮位來源鏈與跳轉，八字段落只給依據 */
function sectionSourceHtml(title, studyText) {
  const palace = DEEP_SECTION_PALACE[title];
  if (palace) return sourceChainHtml(palace);
  return baziSourceChainHtml(studyText, displayTitle(title));
}

function deepListHtml(title, items, className = '') {
  const values = [...new Set((items || []).filter(Boolean))].slice(0, 4);
  if (!values.length) return '';
  return `<section class="deep-section ${className}">
    <h4>${esc(title)}</h4>
    <ul>${values.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
  </section>`;
}

/**
 * 人生說明書：完整報告的開頭。
 *
 * 這裡取代了原本的「長期發展建議」。那個區塊把同一句情況重複塞進「遇到的情況」「開始時機」
 * 「怎麼知道有效」三個欄位，讀起來像待辦清單，而完整報告該給的是脈絡而不是代辦事項。
 * 改成一條時間線：你是什麼樣的人 → 人生怎麼展開 → 反覆遇到的課題 → 轉折點落在哪幾年，
 * 讓人可以拿自己走過的路直接對照。
 */
function lifeManualHtml() {
  const { ziWei, input } = state.data;
  const manual = R.buildLifeManual({ ziWei, birthYear: Number(input.year) });
  if (!manual) return '';

  const stageHtml = manual.stages.map((stage) => {
    // 預設只展開現在這一段；其餘由使用者自己點開（狀態沿用完整報告既有的展開集合）
    const open = state.expandedComprehensiveDetails.has(stage.ageRange)
      ? !stage.current
      : stage.current;
    return `<article class="manual-stage${open ? ' current' : ''}${stage.endYear < new Date().getFullYear() ? ' past' : ''}">
      <button type="button" class="manual-stage-head" data-manual-stage="${esc(stage.ageRange)}" aria-expanded="${open}">
        <span class="manual-stage-age">${esc(stage.ageRange)}歲</span>
        <span class="manual-stage-main">
          <b>${esc(stage.palaceName)}${stage.current ? '（現在）' : ''}</b>
          <small>${stage.startYear}–${stage.endYear}　${esc(stage.stageLabel)}</small>
        </span>
        <i aria-hidden="true">${open ? '−' : '＋'}</i>
      </button>
      ${open ? `<div class="manual-stage-body">
        ${stage.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        <p class="manual-stage-note">${esc(stage.stageNote)}。</p>
      </div>` : ''}
    </article>`;
  }).join('');

  return `<div class="card manual-card">
    <div class="card-label">人生說明書</div>
    <div class="card-hint">把命盤排成一條時間線：你是什麼樣的人、人生大致怎麼展開、哪些課題會反覆出現、階段的轉折落在哪幾年。可以拿已經走過的年份直接對照。</div>

    <section class="manual-block">
      <h3>你是什麼樣的人</h3>
      ${manual.opening.map((p) => `<p>${esc(p)}</p>`).join('')}
    </section>

    <section class="manual-block">
      <h3>你的人生會怎麼展開</h3>
      <p class="manual-lead">每十年一個階段，重心會換到不同的位置。點開任何一段可以看那十年在忙什麼。</p>
      <div class="manual-stages">${stageHtml}</div>
    </section>

    ${manual.themes.length ? `<section class="manual-block">
      <h3>你反覆遇到的課題</h3>
      <p class="manual-lead">這幾件事不會因為換階段而消失，它們會用不同的形式一再出現。</p>
      ${manual.themes.map((t) => `<div class="manual-theme"><b>${esc(t.headline)}</b><p>${esc(t.body)}</p></div>`).join('')}
    </section>` : ''}

    ${manual.turningPoints.length ? `<section class="manual-block">
      <h3>你的轉折點</h3>
      <p class="manual-lead">階段交界的前後一兩年，生活的主題通常會明顯換一個方向。</p>
      <ul class="manual-turns">${manual.turningPoints.map((t) =>
        `<li class="${t.past ? 'past' : 'future'}"><b>${t.year}</b><span>${esc(t.body)}</span></li>`).join('')}</ul>
    </section>` : ''}

    <p class="manual-disclaimer">${esc(manual.disclaimer)}</p>
  </div>`;
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
  const zw = mod.comprehensive.generateZiweiComprehensiveReading(ziWei, { mode });
  const bz = mod.comprehensive.generateBaziComprehensiveReading(baZi, { mode });
  // 專業命理依據永遠是完整版本（跟命盤總覽/重點解讀一致的做法），不受「白話摘要／專業依據」開關影響——
  // 開關只影響上面白話段落的呈現，收合的專業依據本來就是給想深入看的人用，理所當然是完整內容
  const zwStudy = mod.comprehensive.generateZiweiComprehensiveReading(ziWei, { mode: 'study' });
  const bzStudy = mod.comprehensive.generateBaziComprehensiveReading(baZi, { mode: 'study' });
  const zwStudyByTitle = Object.fromEntries(zwStudy.sections.map((s) => [s.title, s.text]));
  const bzStudyByTitle = Object.fromEntries(bzStudy.sections.map((s) => [s.title, s.text]));
  const baziCards = R.generatePlainBaziTopics(baZi, bzLuck, elements);
  const ctx = { ziWei, baZi, baziCards };

  const block = (label, sections, studyByTitle) => {
    const usedTitles = new Set([label]);
    return `
    <div class="report-intro" style="margin-bottom:8px">${esc(label)}</div>
    <div class="accordion">${sections.map((s) => {
      const collapsible = COLLAPSIBLE_DETAIL_TITLES.has(s.title);
      const open = !collapsible || state.expandedComprehensiveDetails.has(s.title);
      const source = deepSourceCard(s.title, ctx);
      const sectionTitle = R.uniqueHeading(displayTitle(s.title), usedTitles, source?.summary);
      const headline = comprehensiveHeadline(s.title, source);
      const paragraphs = splitParagraphs(stripJargonOpeners(s.text));
      const plainParagraphs = source ? source.explanation : paragraphs;
      const body = `<div class="acc-body comp-section">
        ${headline ? `<p class="palace-takeaway">${esc(headline)}</p>` : ''}
        <div class="palace-explain">${plainParagraphs.slice(0, source ? 3 : plainParagraphs.length).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${source ? deepListHtml('現實中可能怎麼出現', source.lifeExamples, 'deep-strengths') : ''}
        ${source ? deepListHtml('容易反覆出現的課題', source.challenges, 'deep-challenges') : ''}
        ${sectionSourceHtml(s.title, studyByTitle[s.title] ?? s.text)}
      </div>`;
      return `
      <div class="acc-item${open ? ' open' : ''}">
        ${collapsible
          ? `<button type="button" class="acc-row" data-detail="${esc(s.title)}">
              <div class="acc-title">${esc(sectionTitle)}<span class="acc-subtle">(補充細節，點開查看)</span></div>
              <div class="acc-chevron">›</div>
            </button>`
          : `<div class="acc-row"><div class="acc-title">${esc(sectionTitle)}</div></div>`}
        ${open ? body : ''}
      </div>`;
    }).join('')}
    </div>`;
  };

  const intro = `<div class="report-intro"><b>這頁是一份從頭讀到尾的長篇報告，約 15 分鐘。</b>它把性格、工作、感情、家庭與人生課題串成一條完整的敘事，會交代前後之間的關聯；跟<button type="button" class="link-jump" data-goto="report">重點摘要</button>看的是同一張命盤，但那邊是可以跳著看的短卡片，這邊是連貫的長文。沒時間讀完的話，先看重點摘要就夠了。</div>`;

  $('#view-comprehensive').innerHTML =
    intro +
    lifeManualHtml() +
    '<div style="height:20px"></div>' +
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
  // 人生說明書的十年階段：預設只展開現在這一段，點其他段可以攤開對照過去或提前看未來
  $$('#view-comprehensive [data-manual-stage]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.manualStage;
      if (state.expandedComprehensiveDetails.has(key)) state.expandedComprehensiveDetails.delete(key);
      else state.expandedComprehensiveDetails.add(key);
      renderComprehensive();
    }));
}

// ---------- 分頁：雙人合盤 ----------
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
    const res = mod.synastry.composeSynastry(a, state.synastry.b, { mode: state.readingMode, relation: f.rel });
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
      <div class="card-hint">甲方=目前排盤的「${esc(a.name)}」；輸入乙方生辰，或從已存命盤帶入，看兩人的相性結構</div>
      <div class="syn-form">
        <input id="syn-name" type="text" placeholder="乙方姓名" aria-label="乙方姓名" value="${esc(f.name)}" />
        <div class="date-parts">
          <input id="syn-year" type="text" inputmode="numeric" maxlength="4" placeholder="出生年" aria-label="乙方出生年（西元4碼）" />
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
  // 換關係型態時，若已有結果直接以新口吻重算
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
    await ensureModules('formatAi');
    const baseText = mod.formatAi.formatSynastryPromptForAI({ a, b: state.synastry.b });
    const text = state.synastry.b.hourUnknown
      ? `【重要】乙方出生時辰不確定，目前暫以午時排盤。請降低乙方紫微宮位與八字時柱相關結論的確定程度，不得把暫排結果寫成事實。\n\n${baseText}`
      : baseText;
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製合盤提示詞，可貼給AI');
    } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
  });
}

// ---------- 分頁三：分享命卡 ----------
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

// 宮位 → 白話人生焦點（命卡金句用：收到命卡的人多半不懂「大限行至夫妻宮」是什麼）
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

  // 本命卡金句：命格一句 + 十年重心/今年焦點（同宮時合併），不出現大限/流年等術語
  const decadalFocus = zwLuck.decadal ? PALACE_FOCUS[zwLuck.decadal.palaceName] : null;
  const annualFocus = zwLuck.annual ? PALACE_FOCUS[zwLuck.annual.palaceName] : decadalFocus;
  const opener = lifeStars.startsWith('空宮')
    ? '天生彈性大、能隨環境調整自己的命格'
    : `帶著${lifeStars}特質的命格`;
  const focusPart = decadalFocus && annualFocus && decadalFocus !== annualFocus
    ? `這十年的重心在${decadalFocus},今年的焦點則在${annualFocus}`
    : `這十年與今年的焦點都落在${annualFocus ?? decadalFocus}`;
  let quote = `「${opener},${focusPart},宜順勢經營、穩健佈局。」`;

  // 流年卡：標題、標籤與金句改為當年度重點（流年四化的祿/忌落點 + 八字流年性質）
  let cardTitle = esc(name);
  let cardSub = `${input.year}年${input.month}月${input.day}日 ${esc(shichen.name)}・${input.gender === 'female' ? '女' : '男'}`;
  let tag1 = { label: '命宮主星', value: lifeStars };
  let tag2 = { label: '日主', value: `${dayStem}${STEM_EL[dayStem]}` };
  if (isAnnualCard) {
    const zwAnnual = R.composeZiWeiAnnualChange(ziWei, nowYear);
    const bzAnnual = R.composeAnnualChange(baZi, nowYear);
    const luDomain = PALACE_FOCUS[zwAnnual.entries.find((e) => e.mutagen === '祿')?.palace] ?? null;
    const jiDomain = PALACE_FOCUS[zwAnnual.entries.find((e) => e.mutagen === '忌')?.palace] ?? null;
    const catWord = bzAnnual.category ? bzAnnual.category.replace('運', '') : null;
    cardTitle = `${esc(name)}的 ${nowYear} 年`;
    cardSub = `${esc(zwAnnual.ganZhi)}年運勢重點`;
    tag1 = { label: '順風領域', value: luDomain ?? '平穩經營' };
    tag2 = { label: '留意領域', value: jiDomain ?? '無明顯壓力點' };
    quote = `「${nowYear}年${catWord ? `整體是「${catWord}」性質的一年` : '運勢平穩'}${luDomain ? `,${luDomain}迎來順風` : ''}${jiDomain ? `;${jiDomain}宜放慢腳步` : ''}。」`;
  }

  const cardEl = STEM_EL[dayStem]; // 用日主天干的五行，替命卡上色做個人化區隔（木火土金水各不同）
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
    } catch { toast('複製失敗，請手動複製網址'); }
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
    } catch { toast('圖片匯出失敗，請改用截圖'); }
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

async function switchView(view) {
  state.view = view;
  // 先切好可見性再渲染：這一頁的引擎若還在下載,renderView 會先塞一行「載入中…」,
  // 那行字必須是使用者看得到的那一區，否則慢速網路下會停在舊畫面、看起來像沒反應。
  $$('.nav-item[data-view]').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  // 「白話摘要／專業依據」按鈕在重點解讀頁對應的是分頁各自的 reportViewMode,離開/進入這個頁面時
  // 按鈕要立刻反映正確頁面的模式，不然切頁面回來後按鈕看起來像是「壞掉」(顯示上一頁的狀態)
  if (state.data) syncModeToggleUI();
  if (state.data) $('#copy-ai-btn').hidden = view === 'topics';
  if (matchMedia('(max-width: 900px)').matches) {
    $('.sidebar').classList.remove('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
    $('#main-content').scrollIntoView({ block: 'start' });
    $('#main-content').focus();
  }
  // 延遲渲染：這一頁若還沒畫過（或資料換過之後還沒補畫），現在補上
  if (state.data && dirtyViews.has(view)) await renderView(view);
}

// ---------- 歷史命盤比對 ----------

/** 命宮主星白話標籤（空宮則標示借對宮星曜，與命盤小教室邏輯一致） */
/** 命宮主星名稱陣列（空宮則借對宮，不重複算命盤小教室的邏輯） */
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

/** 依已存命盤的生辰資料，現場排一次盤（不佔用 state.data,只給比對頁用） */
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
    yongshen: R.computeYongShen(baZi),
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
    ['日主／身強弱', (e) => `${e.dayStem}（${e.yongshen.dayEl}）・${e.yongshen.strength}`],
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
      <div class="card-hint">想知道你跟家人、朋友的命盤差在哪，或同一個人不同時期存的命盤有什麼變化？從已存命盤勾選 2–4 筆，就能並排比較命宮主星、五行局、日主喜忌與今年流年重點。</div>
      ${list.length
        ? `<div class="compare-checks">${renderCompareChecks(list)}</div>
           <button type="button" class="submit-btn compare-run-btn" id="run-compare">開始比較</button>`
        : `<p class="welcome-text muted">目前沒有已存的命盤，先在左側「☆ 儲存目前命盤」存幾筆，才能比較。</p>`}
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
    if (picked.length > 4) return toast('最多同時比較 4 筆，請取消一些勾選');
    const btn = $('#run-compare');
    btn.disabled = true;
    btn.textContent = '計算中…';
    try {
      const entries = await Promise.all(picked.map((i) => computeCompareEntry(list[i])));
      $('#compare-result').innerHTML = renderCompareTable(entries);
    } catch {
      toast('比對失敗，請重新整理頁面再試一次');
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
      return `<div class="card"><div class="card-hint" style="margin:0">目前只支援單姓/複姓（1~2字）搭配單名/雙名（1~2字）的組合，這個姓名結構暫不支援計算。</div></div>`;
    }
    return `<div class="card"><div class="card-hint" style="margin:0">「${esc(result.unknown.join('、'))}」目前不在收錄的姓名用字字典裡（字典僅收錄約 780 個常見姓氏與命名用字），無法計算五格，不做臆測。</div></div>`;
  }
  const rows = ['天格', '人格', '地格', '外格', '總格']
    .map((k) => `<div class="wuge-cell"><div class="wuge-label">${k}</div><div class="wuge-num">${result.grid[k]}</div><div class="wuge-el">${result.elements[k]}</div></div>`)
    .join('');
  return `<div class="card">
    <div class="card-label">五格剖象法</div>
    <div class="card-hint">五格剖象法是華人姓名學常見的筆畫分析法：把姓名拆成「天格」(祖蔭根基)、「人格」(自己的個性，通常最關鍵)、「地格」(早年運)、「外格」(人際外緣)、「總格」(晚年整體運)五組數字，再看彼此的五行銜接順不順。以下數字採熊崎氏姓名學公式實算；三才只看五行生剋大方向，不做 81 數理逐條吉凶（那需要另一套龐大對照表，沒把握逐條核對正確就不硬做）。</div>
    <div class="wuge-grid">${rows}</div>
    <div class="reading-line">${esc(result.sancai.tianRenNote)}</div>
    <div class="reading-line">${esc(result.sancai.renDiNote)}</div>
  </div>`;
}

function renderNameElementCard(fullName) {
  if (!state.data) {
    return `<div class="card"><div class="card-hint" style="margin:0">姓名五行 × 喜用神比對需要先有一張命盤——請先在左側輸入生辰排盤，再回來看這張名字跟你的命盤搭不搭。</div></div>`;
  }
  const ys = R.computeYongShen(state.data.baZi);
  const r = mod.naming.analyzeNameElements(fullName, ys);
  const rows = r.known.map((k) =>
    `<div class="wuge-cell"><div class="wuge-label">${esc(k.char)}</div><div class="wuge-num">${k.strokes}畫</div><div class="wuge-el">${k.element}</div></div>`).join('');

  // 紫微角度：命宮主星五行 vs 姓名五行（兩套系統各自獨立，沒有官方合併算法，誠實呈現兩邊各自看到什麼，不做過度延伸的綜合結論）
  const life = lifePalaceStarNames(state.data.ziWei);
  const zw = mod.naming.analyzeZiweiOverlap(r.known, life.stars);
  let zwLine = '';
  if (zw) {
    const starLabel = `${life.borrowed ? '（借對宮）' : ''}${zw.stars.join('、')}`;
    zwLine = zw.overlap.length
      ? `<div class="reading-line"><span class="lead red">紫微角度　</span>命宮主星${esc(starLabel)}五行屬${esc(zw.starEls.join('、'))},跟姓名裡的${esc(zw.overlap.join('、'))}是同一個五行，兩套系統在這點上是一致的參考訊號。</div>`
      : `<div class="reading-line"><span class="lead red">紫微角度　</span>命宮主星${esc(starLabel)}五行屬${esc(zw.starEls.join('、'))},姓名用字裡沒有這個五行，跟八字喜用神的判斷是兩個獨立角度，可以當作額外參考，不代表互相矛盾。</div>`;
  }

  return `<div class="card">
    <div class="card-label">姓名五行 × ${esc(state.data.name)}的紫微八字</div>
    <div class="card-hint">每個人的八字都能算出「喜用神」(對你比較有幫助的五行)跟「忌神」(比較不搭的五行)——排盤時就已經算好。這裡是看姓名用字的五行組成跟你的喜用神/忌神合不合，再補一段紫微命宮主星五行的參考角度。喜用神判斷跟「完整報告」的八字段落是同一份邏輯。</div>
    ${rows ? `<div class="wuge-grid">${rows}</div>` : ''}
    <div class="reading-line"><span class="lead gold">判斷　</span>${esc(r.verdict)}</div>
    <div class="reading-line">${esc(r.verdictNote)}</div>
    ${zwLine}
    ${r.unknown.length ? `<div class="card-hint" style="margin:8px 0 0">「${esc(r.unknown.join('、'))}」不在收錄字典裡，未納入判斷。</div>` : ''}
  </div>`;
}

function renderNaming() {
  const { surname, given } = state.naming;
  const fullName = `${surname}${given}`;
  const hasInput = surname.trim() && given.trim();

  let resultHtml = '';
  let aiBtnHtml = '';
  if (hasInput) {
    resultHtml = `${renderWuGeCard(mod.naming.computeWuGe(surname, given))}${renderNameElementCard(fullName)}`;
    if (state.data) {
      aiBtnHtml = `<button type="button" class="mini-btn" id="copy-naming-prompt" style="margin-top:12px">複製姓名學 AI 提示詞</button>`;
    }
  }

  $('#view-naming').innerHTML = `<div class="stack">
    <div class="card">
      <div class="card-label">姓名學</div>
      <div class="card-hint">這裡用兩個角度分析一個名字：「五格剖象法」用筆畫數字看名字的架構跟運勢傾向，「姓名五行」看名字用字的五行屬性跟你的命盤搭不搭。輸入姓、名（各 1~2 字）就能看結果，不會被儲存或上傳，純本機計算。</div>
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
    await ensureModules('formatAi');
    // formatNamingPromptForAI 內部要動態載入姓名字庫，是唯一一個非同步的提示詞函式
    const text = await mod.formatAi.formatNamingPromptForAI({
      input: state.data.input, surname, given, baZi: state.data.baZi, ziWei: state.data.ziWei,
    });
    if (!text) return toast('姓名用字不在字典裡，無法產生提示詞');
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製，可貼給AI生成完整解讀');
    } catch { toast('複製失敗，請確認瀏覽器剪貼簿權限'); }
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
  return `你是一位熟悉傳統術數、但不採宿命論的臺灣繁體中文解讀者。\n工具：${tool}\n${question ? `使用者問題：${question}\n` : ''}已計算結果：\n${result}\n\n請只回答本次問題，控制在約500至800個中文字：\n1. 先用1至2句白話直接回答，再說明2至3個最重要的判斷。\n2. 每個判斷都要翻譯成具體情境、可觀察行為或候選方案的實際差異，不逐項教學術語。\n3. 最後列出「可運用」「要留意」「下一步」各一項，做法必須可執行。\n4. 已知事實、傳統象徵與推測要分清楚；資料不足或門派有差異時直接說明。\n5. 不擴寫無關人生分類，不預言死亡、疾病、災難或保證結果；醫療、法律、財務問題應回到專業意見。\n6. 直接進入內容，刪除「值得注意的是、總的來說、深入探討」等空話；少用制式對比與破折號。句子過長就拆開，各段不要用相同方式收尾。`;
}

// 「今天適合先看」的預設 3 個工具：不用額外輸入資料就能立刻用，對第一次來的人負擔最小；
// 其餘 4 個（需要時間軸事件、候選時辰比對、日期範圍搜尋、排盤時間）點「顯示其餘工具」再展開，
// 避免一進頁面就是 7 張卡片的資訊量。
const META_PRIORITY_KEYS = ['daily', 'iching', 'meihua'];

// 導覽卡片的內容獨立成一個函式：展開/收合只重繪這一小塊，不重跑整個 metaShell(body)——
// 否則像「每日週運」這種本體是非同步計算的分頁，點一下展開/收合會讓已經算好的結果整個被清空重算。
function metaGuideHtml() {
  const guideKeys = state.metaGuideExpanded ? META_TABS.map(([key]) => key) : META_PRIORITY_KEYS;
  const guideCards = guideKeys.map((key) => `<button type="button" data-meta-jump="${key}"${state.metaphysicsTab === key ? ' class="active"' : ''}><b>${META_INFO[key].title}</b><span>${META_INFO[key].use}</span></button>`).join('');
  // 按鈕文字直接列出被收合的工具名稱，而不是「其餘 4 個工具」這種空泛說法——
  // 讓已經知道自己要找什麼的人（例如想確認時辰的人），一眼就能認出「時辰驗盤」藏在這裡，不用先點開才知道
  const hiddenLabels = META_TABS.filter(([key]) => !META_PRIORITY_KEYS.includes(key)).map(([, label]) => label);
  const guideToggle = hiddenLabels.length > 0
    ? `<button type="button" class="mini-btn" id="meta-guide-toggle" style="margin-top:10px">${state.metaGuideExpanded ? '︿ 收合' : `＋ 還有${hiddenLabels.join('、')}等 ${hiddenLabels.length} 個工具`}</button>`
    : '';
  return `<div class="card-label" id="meta-guide-title">不知道從哪開始？先選你的目的</div><div class="card-hint" style="margin:0 0 10px">${state.metaGuideExpanded ? '全部 7 個工具：' : '先列出不用額外準備、今天就能直接用的幾個：'}</div><div class="meta-choices">${guideCards}</div>${guideToggle}`;
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
  const yongshen = R.computeYongShen(baZi);
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
    const god = R.tenGodOf(birthStem, dayStem);
    const lunar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
    const yi = trad(lunar.getDayYi().slice(0, 3).join('、')) || '日常安排';
    // 注意：這裡的冒號是物件字面值的語法，不是中文標點，不要跟著全形化。
    const themes = { 比肩: '自主與執行', 劫財: '合作與界線', 食神: '創作與休息', 傷官: '表達與突破', 偏財: '機會與人脈', 正財: '務實與財務', 七殺: '挑戰與決斷', 正官: '責任與秩序', 偏印: '研究與轉念', 正印: '學習與支持' };
    const avoidHit = avoidEls.has(STEM_EL[dayStem]) || avoidEls.has(BRANCH_EL[dayBranch]);
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, week: `週${'日一二三四五六'[d.getDay()]}`, gz, god, yi, theme: themes[god] ?? '穩定推進', avoidHit };
  });
  metaShell(`<div class="card"><div class="card-label">未來七日節奏</div><div class="card-hint">依你的日主與每日干支十神關係整理，並標示是否貼近你八字的忌神五行；宜忌取自傳統黃曆，只作行程反思。</div><p class="reading-line"><span class="lead gold">目前大限　</span>${esc(curLimit.ageRange)}歲・${esc(curLimitPalace)}——本週節奏可搭配這個階段的重心一起看。</p><div class="daily-grid">${days.map((x, i) => `<article class="daily-card${i === 0 ? ' today' : ''}${x.avoidHit ? ' caution' : ''}">${x.avoidHit ? '<span class="daily-flag">忌神日</span>' : ''}<b>${x.date} ${x.week}</b><span>${x.gz}・${x.god}</span><strong>${x.theme}</strong><small>傳統宜：${x.yi}</small></article>`).join('')}</div></div>
    <div class="card"><div class="card-label">本週提醒</div><p class="reading-line">把十神當成每日的觀察鏡頭，忌神日不代表當天必然不順，只是提醒可以放慢決策、多留一點彈性。工作安排優先看現實期限、身心狀態與專業建議。</p><button type="button" class="mini-btn" id="copy-week" style="margin-left:0">複製本週摘要</button>${aiButton('ai-daily')}</div>`);
  $('#copy-week')?.addEventListener('click', async () => { await navigator.clipboard.writeText(days.map((x) => `${x.date} ${x.gz} ${x.god}${x.avoidHit ? '（忌神日）' : ''}：${x.theme}`).join('\n')); toast('已複製本週摘要'); });
  bindAiPrompt('ai-daily', mod.formatAi.formatDailyPromptForAI({ input, baZi, ziWei, days, curLimit, curLimitPalace, favorable: yongshen.favorable, unfavorable: yongshen.unfavorable }));
}

function renderTimeline() {
  const events = loadEvents();
  const { ziWei, baZi, input, byBranch } = state.data;
  const blocks = ziWei.majorLimits.map((l) => {
    const [start, end] = l.ageRange.split('~').map(Number);
    const from = input.year + start - 1; const to = input.year + end - 1;
    const palace = byBranch[l.ganZhi[1]]?.name ?? '—';
    const inside = events.filter((e) => Number(e.year) >= from && Number(e.year) <= to);
    const decadal = flat(R.composeZiWeiDecadalChange(ziWei, l, { mode: state.readingMode }).text);
    return `<article class="timeline-block"><div class="timeline-age">${start}–${end}歲</div><div><b>${from}–${to}・${esc(palace)}</b><div class="tl-body"><p>${esc(flat(readingOf(palace)?.text ?? ''))}</p><p class="reading-line"><span class="lead gold">大限四化　</span>${esc(decadal)}</p></div><button type="button" class="tl-toggle">展開全部內容 ﹀</button>${inside.map((e) => `<span class="event-tag">${esc(e.year)} ${esc(e.title)}</span>`).join('')}</div></article>`;
  }).join('');
  metaShell(`<div class="card"><div class="card-label">生涯運勢時間軸</div><div class="card-hint">將每個十年大限的宮位、四化重點與你輸入的真實事件並排，用來回顧與驗證；不是預言未來必然發生的事情。</div><div class="timeline">${blocks}</div></div>
    <div class="card"><div class="card-label">加入過往事件</div><div class="event-form"><input id="event-year" type="number" min="1900" max="2100" placeholder="年份" aria-label="事件年份"><input id="event-title" maxlength="40" placeholder="例如：轉職、搬家、結婚" aria-label="事件名稱"><button id="event-add" type="button" class="submit-btn">加入時間軸</button></div>${events.length ? `<div class="event-list">${events.map((e, i) => `<button type="button" data-event-del="${i}" title="刪除事件">${esc(e.year)}・${esc(e.title)} ×</button>`).join('')}</div>` : ''}${aiButton('ai-timeline', '複製時間軸給 AI 分析')}</div>`);
  $('#event-add')?.addEventListener('click', () => { const year=$('#event-year').value; const title=$('#event-title').value.trim(); if(!year||!title)return toast('請輸入年份與事件'); const next=[...loadEvents(),{year:Number(year),title}]; saveEvents(next); renderTimeline(); });
  $$('[data-event-del]').forEach((b) => b.addEventListener('click', () => { const list=loadEvents(); list.splice(Number(b.dataset.eventDel),1); saveEvents(list); renderTimeline(); }));
  // 手機版預設把每個大限的詳細內容收合成兩行預覽，點「展開全部內容」再看完整段落——
  // 十個大限一次全展開，在窄螢幕上是一長串文字牆，先看結論比較不會滑到放棄
  $$('#view-metaphysics .tl-toggle').forEach((btn) => btn.addEventListener('click', () => {
    const block = btn.closest('.timeline-block');
    const expanded = block.classList.toggle('expanded');
    btn.textContent = expanded ? '收合 ﹀' : '展開全部內容 ﹀';
  }));
  bindAiPrompt('ai-timeline', mod.formatAi.formatTimelinePromptForAI({ input, baZi, ziWei, events }));
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
    const CLASH = { 子: '午', 丑: '未', 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥', 午: '子', 未: '丑', 申: '寅', 酉: '卯', 戌: '辰', 亥: '巳' };
    const LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
    const SANHE_GROUPS = [['申','子','辰'], ['亥','卯','未'], ['寅','午','戌'], ['巳','酉','丑']];
    const BRANCH_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
    const sanheWith = (a, b) => SANHE_GROUPS.some((g) => a !== b && g.includes(a) && g.includes(b));
    const yongshen = R.computeYongShen(state.data.baZi);
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

function diagramHtml(result) { return `<div class="hexagram"><div class="hex-lines">${mod.divination.lineDiagram(result.lines,result.moving??[]).map((l)=>`<div class="hex-line${l.yang?' yang':' yin'}${l.moving?' moving':''}"><span>${l.yang?'━━━━━━':'━━　━━'}</span><small>${l.lineNo}${l.moving?' 動':''}</small></div>`).join('')}</div><div><h3>${esc(result.name)}</h3><p>上${result.upper.name}（${result.upper.nature}）・下${result.lower.name}（${result.lower.nature}）</p><p>變卦：${esc(result.changedName)}</p></div></div>`; }

function renderIChing() {
  metaShell(`<div class="card"><div class="card-label">易經・三錢起卦</div><div class="card-hint">先寫下單一、具體且可行動的問題，再模擬投擲三枚錢六次。請勿為同一問題反覆起卦直到得到喜歡的答案。</div><textarea id="iching-question" class="question-box" maxlength="160" placeholder="例如：面對這份工作選擇，我最需要留意什麼？" aria-label="占問問題"></textarea><button id="iching-cast" type="button" class="submit-btn compare-run-btn">專心起卦</button></div><div id="iching-result"></div>`);
  $('#iching-cast').addEventListener('click',()=>{const q=$('#iching-question').value.trim();if(!q)return toast('請先寫下問題');const r=mod.divination.castThreeCoins();const moving=r.moving.length?r.moving.join('、'):'無';$('#iching-result').innerHTML=`<div class="card"><div class="card-label">${esc(q)}</div>${diagramHtml(r)}<div class="plain-summary"><b>先看白話重點</b><p>本卦描述現在：${r.lower.image}是事情的內在基礎，${r.upper.image}是外在情勢。${r.moving.length?`第 ${moving} 爻正在變動，表示這些層次最值得留意。`:'沒有動爻，可先專注理解目前結構，不急著推演變化。'}</p></div><p class="reading-line">本卦看當下結構，動爻看變化位置，變卦看可能走向。請把象徵當作反思線索，再回到現實資訊做決定。</p>${aiButton('ai-iching')}</div>`;bindAiPrompt('ai-iching',aiPromptBase('易經三錢起卦',`本卦：${r.name}\n上卦：${r.upper.name}（${r.upper.nature}，${r.upper.image}）\n下卦：${r.lower.name}（${r.lower.nature}，${r.lower.image}）\n動爻：${moving}\n變卦：${r.changedName}`,q));});
}

function renderMeihua() {
  metaShell(`<div class="card"><div class="card-label">梅花易數・時間起卦</div><div class="card-hint">採年月日時加總取上下卦與動爻的簡化時間起卦法；不同傳承可能採農曆、地支數或外應，結果會不同。</div><div class="date-form"><input id="meihua-time" type="datetime-local" aria-label="起卦時間"><input id="meihua-number" type="number" min="0" max="9999" value="0" aria-label="靈感數字"><button id="meihua-run" type="button" class="submit-btn">起卦</button></div></div><div id="meihua-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#meihua-time').value=now.toISOString().slice(0,16);
  $('#meihua-run').addEventListener('click',()=>{
    const r=mod.divination.plumBlossom($('#meihua-time').value,Number($('#meihua-number').value||0));
    const ty=mod.divination.tiYongAnalysis(r);
    $('#meihua-result').innerHTML=`<div class="card"><div class="card-label">時間起卦結果</div>${diagramHtml({...r,moving:[r.movingLine]})}<div class="plain-summary"><b>先看白話重點</b><p>內在基礎呈現「${r.lower.image}」，外在情勢呈現「${r.upper.image}」。第 ${r.movingLine} 爻變動，提醒你把注意力放在事情發展的對應階段。</p></div><div class="tiyong-card"><b>體用斷卦　${esc(ty.relation)}</b><p>體卦：${esc(ty.ti.name)}（${esc(ty.ti.element)}）　用卦：${esc(ty.yong.name)}（${esc(ty.yong.element)}）</p><p class="reading-line">${esc(ty.tendency)}</p></div><p class="card-hint" style="margin-top:8px">體用生剋依傳統口訣（體剋用／用剋體／用生體／體生用／比和）推得，只是傾向判斷，不是定論。取數公式：${esc(r.formula)}。</p>${aiButton('ai-meihua')}</div>`;
    bindAiPrompt('ai-meihua',aiPromptBase('梅花易數時間起卦',`本卦：${r.name}\n上卦：${r.upper.name}（${r.upper.element}，${r.upper.image}）\n下卦：${r.lower.name}（${r.lower.element}，${r.lower.image}）\n動爻：第${r.movingLine}爻\n體卦：${ty.ti.name}（${ty.ti.element}）\n用卦：${ty.yong.name}（${ty.yong.element}）\n體用關係：${ty.relation}\n變卦：${r.changedName}\n取數公式：${r.formula}`,'請先解釋體用生剋的判斷依據，再給出可驗證、非宿命的行動建議。'));
  });
}

function renderQimen() {
  metaShell(`<div class="card"><div class="card-label">時家奇門・結構盤</div><div class="card-hint">依你輸入的時間，用「拆補法」自動判斷節氣、符頭與上中下元，查傳統用局表定出局數與陰陽遁，再排出這一局的地盤三奇六儀與值符值使。九宮的門／星／神目前顯示的是後天八卦本宮參考位置，還沒有加入依時干旋轉的完整天盤，請勿當作可直接斷事的專業奇門盤。</div><div class="date-form"><input id="qimen-time" type="datetime-local" aria-label="排盤時間"><button id="qimen-run" type="button" class="submit-btn">排結構盤</button></div></div><div id="qimen-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#qimen-time').value=now.toISOString().slice(0,16);
  $('#qimen-run').addEventListener('click',async ()=>{
    const { convertToBaZi, Solar } = await loadEngines();
    const gender = state.data?.input?.gender ?? '女';
    const r = mod.divination.qimenStructure($('#qimen-time').value, { convertToBaZi, Solar, gender });
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

// ---------- 分頁延遲渲染 ----------
// 原本每次排盤都會把九個分頁的 DOM 一次全部組出來，但使用者當下只看得到一頁；
// 其餘八頁（含深度解析、姓名學、進階玄學等重運算頁）的成本完全是白花的，
// 在手機上會讓「排盤」按下去到畫面出現之間多等好幾百毫秒。
// 改成：排盤後只畫目前這一頁，其餘標記為 dirty,切過去時才即時補畫（且只畫一次）。
const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  topics: renderTopics,
  report: renderReport,
  comprehensive: renderComprehensive,
  synastry: renderSynastry,
  share: renderShare,
  compare: renderCompare,
  naming: renderNaming,
  metaphysics: renderMetaphysics,
};
const dirtyViews = new Set();

/** 把某幾頁標記為需要重畫；若其中包含目前這一頁，立刻補畫（其餘等切過去再說） */
function invalidateViews(...views) {
  if (!state.data) return;
  for (const v of views) dirtyViews.add(v);
  if (dirtyViews.has(state.view)) renderView(state.view);
}

/**
 * 畫出單一分頁，並沿用原本的防護網：單頁組裝失敗不會讓整個介面卡死。
 *
 * 深度解析/合盤/姓名學/進階玄學的引擎是動態載入的，所以這支是非同步的。
 * 大多數情況下模組已被 preloadViewEngines 預先抓回來,await 會在同一個 microtask 內完成；
 * 只有「網路很慢 + 使用者搶在預載完成前就點過去」時才會真的等待，這時給一行載入中提示，
 * 而不是留一片空白讓人以為按鈕壞了。
 */
async function renderView(view) {
  const fn = VIEW_RENDERERS[view];
  if (!fn) return;
  dirtyViews.delete(view);
  try {
    const needed = VIEW_MODULES[view];
    if (needed && needed.some((k) => !mod[k])) {
      const section = $(`#view-${view}`);
      if (section) section.innerHTML = '<div class="card"><p class="reading-line">載入中…</p></div>';
      await ensureModules(...needed);
    }
    fn();
  } catch (err) {
    console.error(`render ${view} 失敗：`, err);
    dirtyViews.add(view); // 失敗（例如 chunk 下載中斷）要留著標記，下次切過來可以重試
    toast('顯示命盤時發生錯誤，請重新整理頁面再試一次；若重複發生請回報這組生辰資料。');
  }
}

function renderAll() {
  // 防護網：任何一段畫面組裝在排盤資料的邊界情況下出錯，都要讓使用者看得到、
  // 而不是靜默失敗、側邊欄卡死在 disabled 狀態（曾發生過大限與流年同宮時的 null 例外）。
  try {
    renderHead();
    // 資料換了 → 所有分頁的內容都過期；目前這頁馬上重畫，其餘等切過去再補。
    for (const v of VIEWS) dirtyViews.add(v);
    renderView(state.view);
    preloadViewEngines(); // 其餘分頁的引擎趁閒置先抓，讓之後點側欄感覺不到載入
    document.body.classList.add('has-chart');
    document.body.classList.remove('editing-chart');
    $$('.side-nav [data-view]').forEach((n) => { n.disabled = false; n.removeAttribute('aria-disabled'); });
  } catch (err) {
    console.error('renderAll 失敗：', err);
    toast('顯示命盤時發生錯誤，請重新整理頁面再試一次；若重複發生請回報這組生辰資料。');
  }
}

/**
 * 流年運勢提醒卡：已有存檔命盤時，在歡迎畫面頂部給一個直接的回訪誘因——
 * 不用重新輸入生辰，一鍵跳去看「今年」的大限流年重點（dashboard 排盤後預設就會停在現行大限流年）。
 * 只取最近存的 3 筆（saveCurrentChart 用 unshift,index 0 = 最新），避免清單太長。
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
    <div class="card-hint">「大限」是紫微斗數裡每十年一個階段的運勢重心，「流年」是當年的運勢重點——這裡讓你不用重新輸入生辰，直接看已存命盤在今年的這兩項重點。</div>
    <div class="reminder-list">${rows}</div>
  </div>`;
}

// 進站尚未排盤時的歡迎畫面
function renderEmpty() {
  $('#page-title').textContent = '線上排盤';
  $('#birth-summary').textContent = '';
  const reminder = renderAnnualReminderCard();
  const welcome = `<div class="stack"><div class="card welcome-card">
    <div class="welcome-cosmos" aria-hidden="true">
      <div class="cosmos-orbit cosmos-orbit--outer"><span>子</span><span>卯</span><span>午</span><span>酉</span></div>
      <div class="cosmos-orbit cosmos-orbit--inner"><span>甲</span><span>丙</span><span>庚</span><span>壬</span></div>
      <div class="cosmos-core"><span>紫微</span><small>命</small></div>
      <i class="cosmos-star cosmos-star--1"></i><i class="cosmos-star cosmos-star--2"></i>
      <i class="cosmos-star cosmos-star--3"></i><i class="cosmos-star cosmos-star--4"></i>
    </div>
    <div class="welcome-video-overlay" aria-hidden="true"></div>
    <div class="welcome-content">
      <div class="welcome-eyebrow">免費線上排盤・資料只在你的瀏覽器處理</div>
      <h2 class="animate-fade-rise">用紫微與八字，看懂你現在最值得注意的方向</h2>
      <p class="welcome-text animate-fade-rise-delay">不需要命理基礎。從愛情、工作、財運與近期運勢開始，再依需要查看完整命盤。</p>
      <div class="welcome-preview">
        <div><span>現在</span><b>今年最值得注意的事</b><small>近期重點與具體建議</small></div>
        <div><span>關係</span><b>感情中的互動模式</b><small>從問題開始，不必讀懂術語</small></div>
        <div><span>發展</span><b>適合發揮的工作方式</b><small>紫微與八字交叉整理</small></div>
      </div>
      <div class="welcome-steps"><div class="welcome-step"><b>1</b>輸入出生日期與時辰</div><div class="welcome-step"><b>2</b>產生命盤與重點摘要</div><div class="welcome-step"><b>3</b>閱讀報告、流年與宮位解析</div></div>
      <button type="button" class="welcome-cta animate-fade-rise-delay-2" id="welcome-start">免費排盤，開始看重點</button>
      <p class="welcome-text muted">生辰資料不會上傳。內容供文化研究與自我探索參考。</p>
    </div>
  </div>${reminder ? `<div class="welcome-secondary reveal-section">${reminder}</div>` : ''}</div>`;
  for (const v of VIEWS) $(`#view-${v}`).innerHTML = welcome;
  // 歡迎內容沿用既有做法預先放進各分頁，但動態星盤只保留在真正可見的首頁，
  // 避免隱藏分頁同時執行不必要的背景動畫。
  for (const v of VIEWS) {
    if (v !== 'dashboard') $(`#view-${v} .welcome-cosmos`)?.remove();
  }
  dirtyViews.clear(); // 歡迎畫面已把每一頁都填成同一份內容，沒有待補畫的分頁
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
    // 首頁引導卡跟左側常駐表單其實是同一件事，點下去卻只是靜默 focus,
    // 使用者容易看不出兩者的關係──補上捲動＋短暫高亮，讓「按鈕把你帶去了哪裡」看得見
    $('#birth-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#birth-form').classList.add('form-highlight');
    setTimeout(() => $('#birth-form').classList.remove('form-highlight'), 1400);
    $('#name-input').focus();
  });
  const revealSections = $$('#view-dashboard .reveal-section');
  if (typeof window.IntersectionObserver === 'function') {
    const revealObserver = new window.IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    revealSections.forEach((section) => revealObserver.observe(section));
  } else {
    revealSections.forEach((section) => section.classList.add('is-visible'));
  }
}

// ---------- 初始化 ----------
function setupControls() {
  birthDateCtl = wireDateParts({ yearId: '#birth-year', monthId: '#birth-month', dayId: '#birth-day', errorId: '#birth-date-error', nextId: '#birth-hour' });

  // 命盤上的符號（限/年/祿權科忌小標記、・身）原本只靠 title 屬性做 hover 提示，手機沒有 hover 等於看不到說明——
  // 綁一個委派點擊事件，點到這些符號時直接用 toast 顯示同樣的文字，桌面版 hover 仍然保留，手機版多了點擊也能看
  $('#view-dashboard').addEventListener('click', (e) => {
    // 點命盤上的星名 → 開小百科詞條。要擋掉冒泡，否則會連帶把該宮位選起來，
    // 使用者只是想查一顆星，畫面卻整個換宮位。
    const starLink = e.target.closest('.star-link[data-wiki]');
    if (starLink) {
      e.preventDefault();
      e.stopPropagation();
      window.open(wikiUrl(starLink.dataset.wiki), '_blank', 'noopener');
      return;
    }
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

  // 時辰選單(預設子時，列表第一個選項，避免下拉選單一開始就停在中間某個時辰，
  // 讓使用者誤以為那是自動判斷出來的值——時辰務必由使用者自己選，這裡只是給一個不易混淆的起始值)
  $('#birth-hour').innerHTML = SHICHEN
    .map((s) => `<option value="${s.hour}">${s.label}</option>`).join('')
    + '<option value="unknown">不確定時辰（以午時暫排）</option>';
  $('#birth-hour').value = '0';
  $('#solar-time-enabled').addEventListener('change', (event) => {
    $('#solar-time-fields').hidden = !event.target.checked;
  });

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

  // 三頁互相導引用的跳轉連結（[data-goto]）用事件代理綁在 #main-content 上，不管內容重繪幾次都不用重新綁定，
  // 命盤總覽/重點解讀/深度解析裡任何一顆 data-goto 按鈕都共用這一個監聽器
  $('#main-content').addEventListener('click', (e) => {
    const gotoBtn = e.target.closest('[data-goto]');
    if (gotoBtn) switchView(gotoBtn.dataset.goto);

    // 來源鏈的「到命盤總覽的○宮，一步一步走一次」：跳過去之前先把宮位選好、
    // 逐步判讀開回第一步，使用者落地就是在對的那一宮，不用自己再找一次。
    const jumpPalace = e.target.closest('[data-jump-palace]');
    if (jumpPalace) {
      e.stopPropagation();
      state.selectedPalace = jumpPalace.dataset.jumpPalace;
      state.learning.openStep = 'self';
      state.readingMode = 'learn';
      switchView('dashboard');
    }
  });

  $('#reading-mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-pill');
    if (!btn || !state.data) return;
    setReadingMode(btn.dataset.mode);
    syncModeToggleUI();
    if (state.view === 'report') {
      // 重點解讀的白話卡片內容不受模式影響（永遠顯示），切換只是要不要追加來源鏈，
      // 所以重繪這一頁就夠，不需要整頁 renderAll，避免不必要的重繪與捲動風險
      renderReport();
    } else {
      applyReadingMode();
      renderAll();
    }
  });

  $('#copy-ai-btn').addEventListener('click', async () => {
    if (!state.data) return;
    const { input, ziWei, baZi, zwLuck, bzLuck, elements } = state.data;
    await ensureModules('formatAi');
    const text = mod.formatAi.formatChartForAI({ input, ziWei, baZi, zwLuck, bzLuck, elements });
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
        // 排盤完成的小小揭曉感：主內容區加一個淡入效果，而不是直接無聲切換畫面
        const main = $('#main-content');
        main.classList.remove('reveal-in');
        void main.offsetWidth; // 強制重新觸發動畫（reflow）
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

  // 分享連結參數回填（有參數才直接排盤）
  // 網址列是完全由外部控制的輸入，任何人都能手改後傳給別人，所以每個參數都要先驗證再落地：
  // 之前 hour 只要塞一個不存在的值,<select> 會靜默變成空字串 → Number('') === 0 → 悄悄排成子時；
  // gender 也可能被塞入任意字串，一路帶進排盤引擎。現在一律白名單比對，不合法就忽略、沿用預設值。
  const params = new URLSearchParams(location.search);
  const rawDate = params.get('date');
  if (rawDate && /^\d{4}-\d{1,2}-\d{1,2}$/.test(rawDate)) {
    const [py, pm, pd] = rawDate.split('-').map(Number);
    birthDateCtl.set(py, pm, pd); // 年份範圍與「日期是否真的存在」仍由 read()/computeAllInner 再驗一次
    const rawName = params.get('name');
    if (rawName) $('#name-input').value = rawName.slice(0, 20);
    const rawHour = params.get('hour');
    if (rawHour && VALID_HOURS.has(rawHour)) $('#birth-hour').value = rawHour;
    const rawGender = params.get('gender');
    if (rawGender === 'male' || rawGender === 'female') {
      state.gender = rawGender;
      $$('#gender-toggle .pill').forEach((p) => p.classList.toggle('active', p.dataset.value === state.gender));
    }
    return true;
  }
  return false;
}

const hasSharedParams = setupControls();
renderEmpty(); // 先渲染歡迎畫面（不需要排盤庫）；分享連結進站則在引擎載完後自動蓋掉
if (hasSharedParams) {
  computeAll().then((ok) => { if (ok) renderAll(); });
}

// ---------- 輕量錯誤監控：未預期錯誤時給使用者一個提示，避免畫面靜默壞掉 ----------
let errorNotified = false;
function notifyError() {
  if (errorNotified) return;
  errorNotified = true;
  try { toast('發生未預期的錯誤，請重新整理頁面再試一次'); } catch { /* toast 本身壞掉就算了 */ }
}
window.addEventListener('error', notifyError);
window.addEventListener('unhandledrejection', notifyError);

// ---------- PWA:註冊 Service Worker(離線可用、可加入主畫面) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 不支援或註冊失敗不影響功能 */ });
  });
}

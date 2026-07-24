import './style.css';
import { composeChartReading } from './engines/compose.js';
import { composeBaZiReading } from './engines/compose-bazi.js';
import { composeElementAnalysis } from './engines/compose-elements.js';
import { composeZiWeiLuck, composeBaZiLuck, tenGodOf } from './engines/compose-luck.js';
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
function wireDateParts({ yearId, monthId, dayId, errorId }) {
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
  });
  monthEl.addEventListener('change', () => { clearError(); syncDays(); });
  dayEl.addEventListener('change', clearError);
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
      fillDayOptions(dayEl, y, m || 1);
      monthEl.value = m || 1;
      dayEl.value = d || 1;
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
  expandedZiwei: 'ming',
  expandedBazi: 'zhu',
  // 命盤解析(綜合報告)裡,地支關係/神煞屬於補充細節,預設收合,點開才展開(避免資訊量過載);
  // 用 Set 存已展開的段落標題,彼此獨立(可同時展開兩個),跟主要 4 段區隔開來
  expandedComprehensiveDetails: new Set(),
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
  $('#save-chart-btn').hidden = false;
  const shichen = SHICHEN.find((s) => s.hour === input.hour);
  const shichenLabel = state.data.hourUnknown ? '時辰未知(暫以午時排)' : shichen.name;
  $('#birth-summary').textContent =
    `${baZi.fourPillars.yearPillar.stem}${baZi.fourPillars.yearPillar.branch}年` +
    `${lunarDateStr}　${shichenLabel}　` +
    `${input.gender === 'female' ? '女' : '男'}　${ziWei.fiveElementBureau}`;
}

function renderResultSummary() {
  const { ziWei, baZi, elements } = state.data;
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  const mainStars = life.majorStars.map((s) => s.name).join('・') || '空宮（參考對宮）';
  const fp = baZi.fourPillars;
  const dayMaster = `${fp.dayPillar.stem}${STEM_EL[fp.dayPillar.stem]}`;
  const { limit, year } = currentLuckSelection();
  const focus = state.data.byBranch[limit.ganZhi[1]]?.name ?? '—';
  return `<section class="card" aria-labelledby="summary-title">
    <div class="card-label" id="summary-title">先看懂你的命盤</div>
    <div class="result-summary">
      <div class="summary-item"><div class="summary-label">命宮主星</div><div class="summary-value">${esc(mainStars)}</div></div>
      <div class="summary-item"><div class="summary-label">八字日主</div><div class="summary-value">${esc(dayMaster)}</div></div>
      <div class="summary-item"><div class="summary-label">五行重點</div><div class="summary-value">${esc(elements.dominant.join('、') || '平衡')}偏旺</div></div>
      <div class="summary-item"><div class="summary-label">目前運勢焦點</div><div class="summary-value">${esc(year)}・${esc(focus)}</div></div>
      <div class="summary-action"><span>第一次看命盤？先閱讀白話報告，再回來點選十二宮深入探索。</span><div class="summary-action-btns"><button type="button" id="summary-report-btn">閱讀白話報告 →</button><button type="button" id="summary-share-btn" class="ghost">✦ 產生分享命卡 →</button></div></div>
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
  const reading = readingOf(state.selectedPalace);
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
      advancedLine = `<div class="reading-line"><span class="lead gold">飛星資訊　</span>${esc(parts.join(';'))}</div>`;
    }
  }

  return `<div class="card">
    <div class="classroom-head">
      <div class="round-icon">宮</div>
      <div class="classroom-title">${esc(state.selectedPalace)}　<small>地支：${esc(branch)}　星曜：${esc(stars)}</small></div>
      <button type="button" class="mini-btn" id="copy-palace-prompt">複製此宮位 AI 提示詞</button>
    </div>
    <div class="classroom-hint">點選左側命盤十二宮，可切換查看不同宮位的說明 — 這是命盤小教室</div>
    <div class="classroom-body">
      <div class="reading-line"><span class="lead gold">宮位釋義　</span>${esc(palaceMeanings[state.selectedPalace] ?? '')}</div>
      <div class="reading-line"><span class="lead red">本命解讀　</span>${esc(flat(reading.text))}</div>
      ${advancedLine}
    </div>
  </div>`;
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

  return `<div class="card">
    <div class="card-label">大限・流年</div>
    <div class="card-hint">先選十年大限，再選其中某一年，逐年查看流年命宮落於何處——這裡可自由切換任何年份，跟「解讀報告」固定顯示現在的摘要不同。</div>
    <div class="chip-label">大限（十年）</div>
    <div class="chip-row">${limitChips}</div>
    <div class="chip-label">流年（${esc(limit.ageRange.replace('~', '–'))} 歲・${esc(daxianPalace)}大限）</div>
    <div class="chip-row">${yearChips}</div>
    <div class="luck-detail">
      <div class="luck-year">${sel.year} 年　${esc(sel.gz)}　${sel.age} 歲
        <button type="button" class="mini-btn" id="copy-annual-prompt">複製此流年 AI 提示詞</button>
      </div>
      <div class="reading-line"><span class="lead gold">大限重心（${esc(daxianPalace)}）　</span>${esc(flat(readingOf(daxianPalace).text))}</div>
      <div class="reading-line"><span class="lead gold">大限四化（紫微）　</span>${esc(flat(composeZiWeiDecadalChange(state.data.ziWei, limit, { mode: state.readingMode }).text))}</div>
      <div class="reading-line"><span class="lead red">流年命宮（${esc(liunianPalace)}）　</span>${esc(flat(readingOf(liunianPalace).text))}</div>
      <div class="reading-line"><span class="lead red">流年變動（紫微）　</span>${esc(flat(composeZiWeiAnnualChange(state.data.ziWei, sel.year, { mode: state.readingMode }).text))}</div>
      <div class="reading-line"><span class="lead gold">流年變動（八字）　</span>${esc(flat(composeAnnualChange(state.data.baZi, sel.year, { mode: state.readingMode }).text))}</div>
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
  const detail = composeMonthlyChange(state.data.baZi, year, m, { mode: state.readingMode });
  const zwMonthly = composeZiWeiMonthly(state.data.ziWei, year, m, { mode: state.readingMode });
  return `
    <div class="chip-label" style="margin-top:4px">流月（${year} 年;八字以節氣月、紫微斗君以農曆月計,月界略有差異）</div>
    <div class="chip-row">${chips}</div>
    <div class="reading-line"><span class="lead red">流月命宮與四化（紫微）　</span>${esc(flat(zwMonthly.text))}</div>
    <div class="reading-line"><span class="lead gold">流月變動（八字）　</span>${esc(flat(detail.text))}</div>`;
}

function renderDashboard() {
  const isZw = state.chartTab !== 'bazi';
  const hourWarn = state.data.hourUnknown
    ? `<div class="card" style="border-color:var(--gold)"><div class="card-hint" style="margin:0">⚠ 時辰未知:目前以「午時」暫排。紫微命盤的宮位與八字時柱會隨時辰改變,以下結果僅供參考;年柱、月柱、日柱與五行分佈不受影響,仍為準確資訊。</div></div>`
    : '';
  $('#view-dashboard').innerHTML = `<div class="stack">
    ${hourWarn}
    ${renderResultSummary()}
    <div class="chart-tabs">
      <button type="button" class="chart-tab${isZw ? ' active' : ''}" data-chart="ziwei">紫微命盤</button>
      <button type="button" class="chart-tab${isZw ? '' : ' active'}" data-chart="bazi">八字四柱</button>
    </div>
    <div class="row chart-area ${isZw ? 'show-ziwei' : 'show-bazi'}">${renderZiWeiCard()}${renderBaZiCard()}</div>
    ${renderClassroom()}
    ${renderLuckBrowser()}
  </div>`;

  $$('#view-dashboard .chart-tab').forEach((tab) =>
    tab.addEventListener('click', () => { state.chartTab = tab.dataset.chart; renderDashboard(); }));
  $('#summary-report-btn')?.addEventListener('click', () => switchView('report'));
  $('#summary-share-btn')?.addEventListener('click', () => switchView('share'));
  $$('#view-dashboard .palace-cell').forEach((cell) =>
    cell.addEventListener('click', () => { state.selectedPalace = cell.dataset.palace; renderDashboard(); }));
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

// ---------- 分頁二:解讀報告 ----------
function reportItems() {
  const { zwLuck, bzLuck, elements, tenGods } = state.data;
  const ziwei = [
    { key: 'ming', color: 'var(--red)', letter: '命', title: '命宮總論', text: readingOf('命宮').text },
    { key: 'caibo', color: 'var(--gold)', letter: '財', title: '財帛宮', text: readingOf('財帛宮').text },
    { key: 'guanlu', color: 'var(--red)', letter: '祿', title: '事業（官祿宮）', text: readingOf('官祿宮').text },
    { key: 'fuqi', color: 'var(--gold)', letter: '緣', title: '感情（夫妻宮）', text: readingOf('夫妻宮').text },
    { key: 'jie', color: 'var(--red)', letter: '健', title: '健康（疾厄宮）', text: readingOf('疾厄宮').text },
    { key: 'xian', color: 'var(--gold)', letter: '限', title: '大限・流年重點', text: [zwLuck.decadal?.text, zwLuck.annual?.text].filter(Boolean).join('\n\n') },
  ];
  const dayEntries = tenGods.entries.filter((e) => e.pillar === '日柱').map((e) => e.text).join('\n');
  const bazi = [
    { key: 'zhu', color: 'var(--gold)', letter: '主', title: '日主分析', text: [tenGods.dayMaster, dayEntries].filter(Boolean).join('\n') },
    { key: 'xiji', color: 'var(--red)', letter: '喜', title: '五行喜忌', text: state.readingMode === 'study' ? elements.text : elements.summary },
    { key: 'yongshen', color: 'var(--gold)', letter: '用', title: '喜用神與忌神', text: composeYongShenReading(state.data.baZi, { mode: state.readingMode }).text },
    { key: 'shishen', color: 'var(--gold)', letter: '神', title: '十神配置', text: tenGods.entries.map((e) => e.text).join('\n') },
    { key: 'dayun', color: 'var(--red)', letter: '運', title: '大運概況', text: [bzLuck.decadal?.text, bzLuck.annual?.text].filter(Boolean).join('\n\n') },
  ];
  return { ziwei, bazi };
}

function renderReport() {
  const { ziwei, bazi } = reportItems();
  const isZiwei = state.reportTab === 'ziwei';
  const items = isZiwei ? ziwei : bazi;
  const expandedKey = isZiwei ? state.expandedZiwei : state.expandedBazi;

  const intro = isZiwei
    ? '依紫微命盤十二宮與現行大限、流年，整理出「現在」這個時間點的固定摘要。想探索其他年份或宮位，請到「命盤總覽」互動查看。'
    : '依八字四柱日主強弱、五行喜忌與十神配置，整理出「現在」這個時間點的固定摘要。想探索其他年份，請到「命盤總覽」互動查看。';

  const list = items.map((it) => {
    const open = expandedKey === it.key;
    // 大限/大運這兩項跟「命盤總覽」的互動大限流年瀏覽器內容有重疊,這裡只保留現在的固定摘要,
    // 並加一個跳轉按鈕,引導想看其他年份的人去真正能自由切換的地方,而不是把所有年份都重複印一次
    const jumpNote = (it.key === 'xian' || it.key === 'dayun')
      ? '<button type="button" class="mini-btn acc-jump" data-jump-dashboard="1" style="margin-top:10px">→ 到「命盤總覽」切換查看其他大限／流年</button>'
      : '';
    return `<div class="acc-item${open ? ' open' : ''}">
      <button type="button" class="acc-row" data-acc="${it.key}">
        <div class="round-icon" style="background:${it.color}">${it.letter}</div>
        <div class="acc-title">${esc(it.title)}</div>
        <div class="acc-chevron">›</div>
      </button>
      ${open ? `<div class="acc-body">${esc(it.text)}${jumpNote}</div>` : ''}
    </div>`;
  }).join('');

  $('#view-report').innerHTML = `
    <div class="report-tabs">
      <button type="button" class="report-tab${isZiwei ? ' active' : ''}" data-tab="ziwei">紫微斗數</button>
      <button type="button" class="report-tab${isZiwei ? '' : ' active'}" data-tab="bazi">八字</button>
    </div>
    <div class="report-intro">${intro}</div>
    <div class="accordion">${list}</div>`;

  $$('#view-report .report-tab').forEach((tab) =>
    tab.addEventListener('click', () => { state.reportTab = tab.dataset.tab; renderReport(); }));
  $$('#view-report [data-jump-dashboard]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); switchView('dashboard'); }));
  $$('#view-report .acc-row').forEach((row) =>
    row.addEventListener('click', () => {
      const key = row.dataset.acc;
      if (state.reportTab === 'ziwei') state.expandedZiwei = state.expandedZiwei === key ? null : key;
      else state.expandedBazi = state.expandedBazi === key ? null : key;
      renderReport();
    }));
}

// ---------- 分頁:命盤解析(綜合報告) ----------
// 命盤解析(綜合報告)裡屬於補充細節、預設收合的段落標題(點開才展開,避免一次全部展開資訊過載)
const COLLAPSIBLE_DETAIL_TITLES = new Set(['四、地支關係', '五、神煞']);

function renderComprehensive() {
  const { ziWei, baZi } = state.data;
  const mode = state.readingMode;
  const zw = generateZiweiComprehensiveReading(ziWei, { mode });
  const bz = generateBaziComprehensiveReading(baZi, { mode });

  const block = (label, sections) => `
    <div class="report-intro" style="margin-bottom:8px">${esc(label)}</div>
    <div class="accordion">${sections.map((s) => {
      const collapsible = COLLAPSIBLE_DETAIL_TITLES.has(s.title);
      const open = !collapsible || state.expandedComprehensiveDetails.has(s.title);
      return `
      <div class="acc-item${open ? ' open' : ''}">
        ${collapsible
          ? `<button type="button" class="acc-row" data-detail="${esc(s.title)}">
              <div class="acc-title">${esc(s.title)}<span class="acc-subtle">(補充細節,點開查看)</span></div>
              <div class="acc-chevron">›</div>
            </button>`
          : `<div class="acc-row"><div class="acc-title">${esc(s.title)}</div></div>`}
        ${open ? `<div class="acc-body">${esc(s.text)}</div>` : ''}
      </div>`;
    }).join('')}
    </div>`;

  $('#view-comprehensive').innerHTML =
    '<div class="card-hint" style="margin-bottom:14px">這裡是最完整的長文分析,把命盤脈絡串成故事來讀。如果只想看現在的重點摘要,「解讀報告」更快;想自己切換宮位或年份探索,則到「命盤總覽」。</div>' +
    block('紫微斗數・綜合解析', zw.sections) +
    '<div style="height:20px"></div>' +
    block('八字・綜合解析', bz.sections);

  $$('#view-comprehensive .acc-row[data-detail]').forEach((row) =>
    row.addEventListener('click', () => {
      const title = row.dataset.detail;
      if (state.expandedComprehensiveDetails.has(title)) state.expandedComprehensiveDetails.delete(title);
      else state.expandedComprehensiveDetails.add(title);
      renderComprehensive();
    }));
}

// ---------- 分頁:雙人合盤 ----------
async function runSynastry() {
  const f = state.synastry.form;
  const parsed = synDateCtl?.read();
  if (!parsed) return; // 錯誤原因已就地顯示
  const { y, m, d } = parsed;
  const { convertToZiWei, convertToBaZi } = await loadEngines();
  const input = { year: y, month: m, day: d, hour: Number(f.hour), gender: f.gender };
  state.synastry.b = {
    name: f.name.trim() || '乙方',
    input,
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
    resultHtml = `
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
        <select id="syn-hour">${SHICHEN.map((s) => `<option value="${s.hour}">${s.label}</option>`).join('')}</select>
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
  synDateCtl = wireDateParts({ yearId: '#syn-year', monthId: '#syn-month', dayId: '#syn-day', errorId: '#syn-date-error' });
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
  $('#syn-run').addEventListener('click', (e) => withLoading(e.currentTarget, '合盤中…', runSynastry));
  $('#copy-syn-prompt')?.addEventListener('click', async () => {
    const text = formatSynastryPromptForAI({ a, b: state.synastry.b });
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

const VIEWS = ['dashboard', 'report', 'comprehensive', 'synastry', 'share', 'compare', 'naming', 'metaphysics'];

function switchView(view) {
  state.view = view;
  $$('.nav-item[data-view]').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  if (matchMedia('(max-width: 900px)').matches) {
    $('.sidebar').classList.remove('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
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
    <div class="card-hint">每個人的八字都能算出「喜用神」(對你比較有幫助的五行)跟「忌神」(比較不搭的五行)——排盤時就已經算好。這裡是看姓名用字的五行組成跟你的喜用神/忌神合不合,再補一段紫微命宮主星五行的參考角度。喜用神判斷跟命盤解析頁的八字綜合解讀是同一份邏輯。</div>
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
  const remaining = META_TABS.length - META_PRIORITY_KEYS.length;
  const guideToggle = remaining > 0
    ? `<button type="button" class="mini-btn" id="meta-guide-toggle" style="margin-top:10px">${state.metaGuideExpanded ? '︿ 收合' : `＋ 顯示其餘 ${remaining} 個工具`}</button>`
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
    renderReport();
    renderComprehensive();
    renderSynastry();
    renderShare();
    renderCompare();
    renderNaming();
    renderMetaphysics();
    document.body.classList.add('has-chart');
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
  const welcome = `<div class="stack">${reminder}<div class="card welcome-card">
    <div class="card-label">開始排盤</div>
    <h2>三步驟看懂你的紫微與八字</h2>
    <p class="welcome-text">輸入基本生辰後，即可取得十二宮命盤、八字四柱與分層白話解讀。</p>
    <div class="welcome-steps"><div class="welcome-step"><b>1</b>輸入出生日期與時辰</div><div class="welcome-step"><b>2</b>產生命盤與重點摘要</div><div class="welcome-step"><b>3</b>閱讀報告、流年與宮位解析</div></div>
    <button type="button" class="welcome-cta" id="welcome-start">開始輸入生辰</button>
    <p class="welcome-text muted">所有計算皆在你的瀏覽器內完成,生辰資料不會上傳到任何伺服器。</p>
  </div></div>`;
  for (const v of VIEWS) $(`#view-${v}`).innerHTML = welcome;
  $$('[data-remind]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = loadSavedCharts()[Number(btn.dataset.remind)];
      if (c) await loadSavedEntry(c);
    }));
  $('#copy-ai-btn').hidden = true;
  $('#reading-mode-toggle').hidden = true;
  $('#save-chart-btn').hidden = true;
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
  birthDateCtl = wireDateParts({ yearId: '#birth-year', monthId: '#birth-month', dayId: '#birth-day', errorId: '#birth-date-error' });

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
  $('#export-charts').addEventListener('click', exportSavedCharts);
  $('#import-charts').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files?.[0]) importSavedCharts(e.target.files[0]);
    e.target.value = '';
  });
  renderSavedList();

  $('#reading-mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-pill');
    if (!btn || !state.data) return;
    state.readingMode = btn.dataset.mode;
    $$('#reading-mode-toggle .mode-pill').forEach((p) => {
      p.classList.toggle('active', p === btn);
      p.setAttribute('aria-pressed', String(p === btn));
    });
    applyReadingMode();
    renderAll();
  });

  $('#copy-ai-btn').addEventListener('click', async () => {
    if (!state.data) return;
    const { input, ziWei, baZi } = state.data;
    const text = formatChartForAI({ input, ziWei, baZi });
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

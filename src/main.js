import './style.css';
import { composeChartReading } from './engines/compose.js';
import { composeBaZiReading } from './engines/compose-bazi.js';
import { composeElementAnalysis } from './engines/compose-elements.js';
import { composeZiWeiLuck, composeBaZiLuck, tenGodOf } from './engines/compose-luck.js';
import { generateZiweiComprehensiveReading, generateBaziComprehensiveReading } from './engines/comprehensive.js';
import { formatChartForAI, formatPalacePromptForAI, formatAnnualPromptForAI, formatSynastryPromptForAI, formatNamingPromptForAI } from './engines/format-ai.js';
import { composeAnnualChange, composeZiWeiAnnualChange, composeZiWeiDecadalChange, composeMonthlyChange, composeZiWeiMonthly, monthlyPillarsOf, computeSelfTransformations, computeLaiyinPalace } from './engines/compose-annual.js';
import { composeYongShenReading, computeYongShen } from './engines/compose-yongshen.js';
import { analyzeNameElements, computeWuGe, analyzeZiweiOverlap, splitSurnameGiven } from './engines/naming.js';
import { composeSynastry } from './engines/compose-synastry.js';
import { castThreeCoins, plumBlossom, qimenStructure, lineDiagram } from './engines/divination.js';
import { LAYOUT_POSITIONS } from './data/layout-positions.js';
import { palaceMeanings } from './data/palace-meanings.js';

// 排盤引擎(iztro、lunar-javascript 合計約 700KB)改為動態載入:
// 訪客進站先看到歡迎頁,不需要馬上載排盤庫;第一次按「排盤」時才抓,之後快取重用。
// qrcode / html-to-image 也一樣,只在分享命卡用到時才載。
let enginesPromise = null;
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

// ---------- 常數 ----------
const EL_COLOR = { 木: 'var(--el-wood)', 火: 'var(--el-fire)', 土: 'var(--el-earth)', 金: 'var(--el-metal)', 水: 'var(--el-water)' };
const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const BRANCH_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const EL_KEY = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
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
  data: null, // { name, input, ziWei, baZi, readings, elements, zwLuck, bzLuck, tenGods, byBranch }
};

// ---------- 排盤 ----------
async function computeAll() {
  if (!$('#birth-date').value) {
    toast('請先選擇出生日期');
    return false;
  }
  const { convertToZiWei, convertToBaZi, Solar, Lunar } = await loadEngines();
  const name = $('#name-input').value.trim() || '命主';
  // 「不確定時辰」:以午時(11時)暫排,並在畫面明確標示僅供參考
  const hourRaw = $('#birth-hour').value;
  const hourUnknown = hourRaw === 'unknown';
  let [y, m, d] = $('#birth-date').value.split('-').map(Number);
  // 日期合法性驗證:表單的日期選擇器擋得住,但分享連結的 ?date= 參數擋不住
  // (例如 1949-02-29 這種不存在的日期,引擎不會報錯、會靜默排出錯的盤)
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    toast('這個日期不存在,請重新選擇');
    return false;
  }
  if (y < 1900 || y > 2100) {
    toast('目前支援 1900–2100 年之間的生日');
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
  $('#birth-date').value = c.date;
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
      <div class="summary-action"><span>第一次看命盤？先閱讀白話報告，再回來點選十二宮深入探索。</span><button type="button" id="summary-report-btn">閱讀白話報告 →</button></div>
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
    const stars = p.majorStars.map((s) => s.name + (s.transformation ? `<sup>${s.transformation}</sup>` : '')).join('');
    const cls = [
      'palace-cell',
      p.name === '命宮' ? 'self' : '',
      p.name === state.selectedPalace ? 'selected' : '',
      branch === decadalBranch ? 'decadal-palace' : '',
      branch === annualBranch ? 'annual-palace' : '',
      relatedBranches.has(branch) ? 'related' : '',
    ].join(' ');
    const luckTags = [
      branch === decadalBranch ? '<span class="luck-tag decadal">限</span>' : '',
      branch === annualBranch ? '<span class="luck-tag annual">年</span>' : '',
    ].join('');
    const mutMarks = (sihuaByPalace[p.name] ?? [])
      .map((m) => `<span class="flow-mut ${MUT_CLASS[m]}">${m}</span>`).join('');
    return `<button type="button" class="${cls}" data-palace="${esc(p.name)}"
      style="grid-row:${pos.row};grid-column:${pos.col}">
      <div class="p-name">${esc(p.name)} ${esc(branch)}${p.isBodyPalace ? '<span class="body-mark">・身</span>' : ''}${luckTags}</div>
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
  const bars = Object.entries(baZi.fiveElementDistribution).map(([key, count]) => {
    const el = EL_KEY[key];
    return `<div class="bar-col" style="flex:${Math.max(count, 0.4)}">
      <div class="bar" style="background:${EL_COLOR[el]}"></div>
      <span style="color:${EL_COLOR[el]}">${el} ${count}</span>
    </div>`;
  }).join('');
  const note = `${elements.dominant.join('、')}偏旺,${elements.weak.join('、')}偏弱,可透過後天培養補強平衡。`;

  return `<div class="card bazi-card">
    <div class="card-label">八字・四柱</div>
    <div class="bazi-grid">${heads}${gods}${stems}${branches}${hidden}${nayin}</div>
    <div class="el-bars">
      <div class="bars-label">四柱五行分布（共 ${total} 字）</div>
      <div class="bars">${bars}</div>
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

  const limitChips = limits.map((l, i) => {
    const palaceName = state.data.byBranch[l.ganZhi[1]].name;
    return `<button type="button" class="chip wide${i === state.limitIdx ? ' active' : ''}" data-limit="${i}">
      ${esc(l.ageRange.replace('~', '–'))}<br><small>${esc(palaceName)}</small></button>`;
  }).join('');

  const years = Array.from({ length: 10 }, (_, i) => {
    const age = startAge + i;
    const year = input.year + age - 1; // 虛歲 → 西元年
    return { i, age, year, gz: yearGanZhi(year) };
  });
  const yearChips = years.map((yy) =>
    `<button type="button" class="chip${yy.i === state.yearIdx ? ' active' : ''}" data-year="${yy.i}">
      ${yy.year}<br><small>${esc(yy.gz)}</small></button>`).join('');

  const sel = years[state.yearIdx];
  const daxianPalace = state.data.byBranch[limit.ganZhi[1]].name;
  const liunianPalace = state.data.byBranch[sel.gz[1]].name;

  return `<div class="card">
    <div class="card-label">大限・流年</div>
    <div class="card-hint">先選十年大限，再選其中某一年，逐年查看流年命宮落於何處</div>
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
  $$('#view-dashboard .palace-cell').forEach((cell) =>
    cell.addEventListener('click', () => { state.selectedPalace = cell.dataset.palace; renderDashboard(); }));
  $$('#view-dashboard [data-limit]').forEach((chip) =>
    chip.addEventListener('click', () => { state.limitIdx = Number(chip.dataset.limit); state.yearIdx = 0; renderDashboard(); }));
  $$('#view-dashboard [data-year]').forEach((chip) =>
    chip.addEventListener('click', () => { state.yearIdx = Number(chip.dataset.year); state.monthIdx = null; renderDashboard(); }));
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
    { key: 'xian', color: 'var(--gold)', letter: '限', title: '大限・流年重點', text: [zwLuck.decadal?.text, zwLuck.annual.text].filter(Boolean).join('\n\n') },
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
    ? '依紫微命盤十二宮與現行大限、流年，整理出以下重點解讀。'
    : '依八字四柱日主強弱、五行喜忌與十神配置，整理出以下重點解讀。';

  const list = items.map((it) => {
    const open = expandedKey === it.key;
    return `<div class="acc-item${open ? ' open' : ''}">
      <button type="button" class="acc-row" data-acc="${it.key}">
        <div class="round-icon" style="background:${it.color}">${it.letter}</div>
        <div class="acc-title">${esc(it.title)}</div>
        <div class="acc-chevron">›</div>
      </button>
      ${open ? `<div class="acc-body">${esc(it.text)}</div>` : ''}
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
  if (!f.date) return toast('請先選擇乙方出生日期');
  const [y, m, d] = f.date.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return toast('這個日期不存在,請重新選擇');
  if (y < 1900 || y > 2100) return toast('目前支援 1900–2100 年之間的生日');
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
        <input id="syn-date" type="date" value="${esc(f.date)}" />
        <select id="syn-hour">${SHICHEN.map((s) => `<option value="${s.hour}">${s.label}</option>`).join('')}</select>
        <select id="syn-gender"><option value="female">女</option><option value="male">男</option></select>
        <select id="syn-rel"><option>戀人</option><option>親子</option><option>朋友</option><option>同事</option></select>
        <button type="button" class="submit-btn syn-submit" id="syn-run">合盤</button>
      </div>
      ${saved.length ? `<div class="chip-label" style="margin-top:12px">從已存命盤帶入乙方</div><div class="chip-row">${savedChips}</div>` : ''}
    </div>
    ${resultHtml}`;

  $('#syn-hour').value = f.hour;
  $('#syn-gender').value = f.gender;
  $('#syn-rel').value = f.rel;
  for (const [id, key] of [['#syn-name', 'name'], ['#syn-date', 'date'], ['#syn-hour', 'hour'], ['#syn-gender', 'gender']]) {
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
  $('#syn-run').addEventListener('click', runSynastry);
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

  $('#view-share').innerHTML = `<div class="share-wrap">
    <div style="flex-basis:100%;display:flex;gap:10px">
      <button type="button" class="report-tab${isAnnualCard ? '' : ' active'}" data-card="life">本命卡</button>
      <button type="button" class="report-tab${isAnnualCard ? ' active' : ''}" data-card="annual">${nowYear} 流年卡</button>
    </div>
    <div class="fate-card" id="fate-card">
      <div class="fate-brand"><div class="brand-icon">命</div><span>紫微斗數．八字排盤</span></div>
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
      <div class="card-hint">從已存命盤勾選 2–4 筆,並排比較命宮主星、五行局、日主喜忌與今年流年重點</div>
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
    return `<div class="card"><div class="card-hint" style="margin:0">「${esc(result.unknown.join('、'))}」目前不在收錄的姓名用字字典裡(字典僅收錄約 460 個常見姓氏與命名用字),無法計算五格,不做臆測。</div></div>`;
  }
  const rows = ['天格', '人格', '地格', '外格', '總格']
    .map((k) => `<div class="wuge-cell"><div class="wuge-label">${k}</div><div class="wuge-num">${result.grid[k]}</div><div class="wuge-el">${result.elements[k]}</div></div>`)
    .join('');
  return `<div class="card">
    <div class="card-label">五格剖象法</div>
    <div class="card-hint">天格/人格/地格/外格/總格採熊崎氏姓名學公式計算;三才只看五行生剋大方向,不做 81 數理逐條吉凶(那部分沒把握逐條核對正確,寧可不做)</div>
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
    <div class="card-hint">主要判斷沿用目前命盤算出的八字喜用神/忌神(命盤解析頁的八字綜合解讀也有同一份判斷),再補一段紫微命宮主星五行的參考角度</div>
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
      <div class="card-hint">輸入姓、名(各 1~2 字),看五格剖象法的天人地外總五格,以及這個名字的五行組成跟目前命盤喜用神搭不搭配。輸入的姓名不會被儲存或上傳,純本機計算。</div>
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
const EVENT_KEY = 'zwbz-life-events';
const loadEvents = () => { try { return JSON.parse(localStorage.getItem(EVENT_KEY)) ?? []; } catch { return []; } };
const saveEvents = (items) => { try { localStorage.setItem(EVENT_KEY, JSON.stringify(items.slice(-50))); } catch { /* ignore */ } };

function metaShell(body) {
  const tabs = META_TABS.map(([key, label]) => `<button type="button" class="report-tab${state.metaphysicsTab === key ? ' active' : ''}" data-meta="${key}" aria-pressed="${state.metaphysicsTab === key}">${label}</button>`).join('');
  $('#view-metaphysics').innerHTML = `<div class="meta-tabs" role="tablist" aria-label="進階玄學工具">${tabs}</div><div class="stack">${body}</div>`;
  $$('#view-metaphysics [data-meta]').forEach((btn) => btn.addEventListener('click', () => { state.metaphysicsTab = btn.dataset.meta; renderMetaphysics(); }));
}

async function renderDaily() {
  metaShell('<div class="card"><div class="card-label">每日／週運</div><div class="card-hint">正在計算今天與未來七日的個人節奏…</div></div>');
  const { convertToBaZi, Solar } = await loadEngines();
  const birthStem = state.data.baZi.fourPillars.dayPillar.stem;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dayBazi = convertToBaZi({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: 12, gender: state.data.input.gender });
    const gz = `${dayBazi.fourPillars.dayPillar.stem}${dayBazi.fourPillars.dayPillar.branch}`;
    const god = tenGodOf(birthStem, dayBazi.fourPillars.dayPillar.stem);
    const lunar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
    const yi = trad(lunar.getDayYi().slice(0, 3).join('、')) || '日常安排';
    const themes = { 比肩:'自主與執行', 劫財:'合作與界線', 食神:'創作與休息', 傷官:'表達與突破', 偏財:'機會與人脈', 正財:'務實與財務', 七殺:'挑戰與決斷', 正官:'責任與秩序', 偏印:'研究與轉念', 正印:'學習與支持' };
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, week: `週${'日一二三四五六'[d.getDay()]}`, gz, god, yi, theme: themes[god] ?? '穩定推進' };
  });
  metaShell(`<div class="card"><div class="card-label">未來七日節奏</div><div class="card-hint">依你的日主與每日干支十神關係整理；宜忌取自傳統黃曆，只作行程反思。</div><div class="daily-grid">${days.map((x, i) => `<article class="daily-card${i === 0 ? ' today' : ''}"><b>${x.date} ${x.week}</b><span>${x.gz}・${x.god}</span><strong>${x.theme}</strong><small>傳統宜：${x.yi}</small></article>`).join('')}</div></div>
    <div class="card"><div class="card-label">本週提醒</div><p class="reading-line">把十神當成每日的觀察鏡頭，而不是吉凶判決。工作安排優先看現實期限、身心狀態與專業建議。</p><button type="button" class="mini-btn" id="copy-week" style="margin-left:0">複製本週摘要</button></div>`);
  $('#copy-week')?.addEventListener('click', async () => { await navigator.clipboard.writeText(days.map((x) => `${x.date} ${x.gz} ${x.god}：${x.theme}`).join('\n')); toast('已複製本週摘要'); });
}

function renderTimeline() {
  const events = loadEvents();
  const { ziWei, input, byBranch } = state.data;
  const blocks = ziWei.majorLimits.map((l) => {
    const [start, end] = l.ageRange.split('~').map(Number);
    const from = input.year + start - 1; const to = input.year + end - 1;
    const palace = byBranch[l.ganZhi[1]]?.name ?? '—';
    const inside = events.filter((e) => Number(e.year) >= from && Number(e.year) <= to);
    return `<article class="timeline-block"><div class="timeline-age">${start}–${end}歲</div><div><b>${from}–${to}・${esc(palace)}</b><p>${esc(flat(readingOf(palace)?.text ?? ''))}</p>${inside.map((e) => `<span class="event-tag">${esc(e.year)} ${esc(e.title)}</span>`).join('')}</div></article>`;
  }).join('');
  metaShell(`<div class="card"><div class="card-label">生涯運勢時間軸</div><div class="card-hint">將大限與真實事件並排，用來回顧與驗證；不是預言未來必然發生的事情。</div><div class="timeline">${blocks}</div></div>
    <div class="card"><div class="card-label">加入過往事件</div><div class="event-form"><input id="event-year" type="number" min="1900" max="2100" placeholder="年份" aria-label="事件年份"><input id="event-title" maxlength="40" placeholder="例如：轉職、搬家、結婚" aria-label="事件名稱"><button id="event-add" type="button" class="submit-btn">加入時間軸</button></div>${events.length ? `<div class="event-list">${events.map((e, i) => `<button type="button" data-event-del="${i}" title="刪除事件">${esc(e.year)}・${esc(e.title)} ×</button>`).join('')}</div>` : ''}</div>`);
  $('#event-add')?.addEventListener('click', () => { const year=$('#event-year').value; const title=$('#event-title').value.trim(); if(!year||!title)return toast('請輸入年份與事件'); const next=[...loadEvents(),{year:Number(year),title}]; saveEvents(next); renderTimeline(); });
  $$('[data-event-del]').forEach((b) => b.addEventListener('click', () => { const list=loadEvents(); list.splice(Number(b.dataset.eventDel),1); saveEvents(list); renderTimeline(); }));
}

function renderRectify() {
  metaShell(`<div class="card"><div class="card-label">時辰反推／事件驗盤</div><div class="card-hint">比較十二時辰的命宮、身宮與主星差異，再搭配上方時間軸的真實事件縮小候選。結果只能輔助回憶，不能證明出生時間。</div><button id="run-rectify" type="button" class="submit-btn compare-run-btn">產生十二時辰候選</button></div><div id="rectify-result"></div>`);
  $('#run-rectify').addEventListener('click', async () => {
    const { convertToZiWei } = await loadEngines(); const { input } = state.data;
    const rows = SHICHEN.map((s) => { const z=convertToZiWei({...input,hour:s.hour}); return {hour:s.name,life:z.lifePalace,body:z.bodyPalace,stars:mainStarsLabelOf(z,'命宮')}; });
    $('#rectify-result').innerHTML=`<div class="card"><div class="card-label">候選差異</div><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>時辰</th><th>命宮</th><th>身宮</th><th>命宮主星</th></tr></thead><tbody>${rows.map((r)=>`<tr><th>${r.hour}</th><td>${r.life}</td><td>${r.body}</td><td>${r.stars}</td></tr>`).join('')}</tbody></table></div><p class="card-hint">下一步：用已知事件年份對照各候選盤的大限宮位，不要只用個性描述選擇時辰。</p></div>`;
  });
}

function renderDates() {
  metaShell(`<div class="card"><div class="card-label">個人擇日</div><div class="card-hint">選擇用途與日期範圍，綜合傳統黃曆「宜」及是否沖到你的年支／日支排序。這是文化參考，不凌駕醫療、法律、天候與參與者行程。</div><div class="date-form"><select id="date-purpose" aria-label="擇日用途"><option>嫁娶</option><option>入宅</option><option>開市</option><option>交易</option><option>出行</option><option>求醫</option></select><input id="date-start" type="date" aria-label="開始日期"><button id="date-run" type="button" class="submit-btn">搜尋未來 30 日</button></div></div><div id="date-results"></div>`);
  $('#date-start').value = new Date().toISOString().slice(0,10);
  $('#date-run').addEventListener('click', async () => {
    const { Solar }=await loadEngines(); const purpose=$('#date-purpose').value; const start=new Date($('#date-start').value); const birthBranches=[state.data.baZi.fourPillars.yearPillar.branch,state.data.baZi.fourPillars.dayPillar.branch]; const clash={子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};
    const dates=Array.from({length:30},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const l=Solar.fromYmd(d.getFullYear(),d.getMonth()+1,d.getDate()).getLunar();const yi=l.getDayYi().map(trad);const branch=l.getDayZhi();const personalClash=birthBranches.some((b)=>clash[b]===branch);return {date:d.toISOString().slice(0,10),gz:l.getDayInGanZhi(),yi,ji:l.getDayJi().slice(0,3).map(trad),score:(yi.includes(purpose)?3:0)-(personalClash?2:0),personalClash};}).sort((a,b)=>b.score-a.score).slice(0,8);
    $('#date-results').innerHTML=`<div class="card"><div class="card-label">推薦候選日</div><div class="date-results">${dates.map((x)=>`<article><b>${x.date}・${x.gz}</b><span>${x.yi.includes(purpose)?`黃曆宜${purpose}`:'通用候選'}</span><small>${x.personalClash?'與本命年支或日支相沖，建議再評估':'未見直接沖年支／日支'}；忌：${x.ji.join('、')||'—'}</small></article>`).join('')}</div></div>`;
  });
}

function diagramHtml(result) { return `<div class="hexagram"><div class="hex-lines">${lineDiagram(result.lines,result.moving??[]).map((l)=>`<div class="hex-line${l.yang?' yang':' yin'}${l.moving?' moving':''}"><span>${l.yang?'━━━━━━':'━━　━━'}</span><small>${l.lineNo}${l.moving?' 動':''}</small></div>`).join('')}</div><div><h3>${esc(result.name)}</h3><p>上${result.upper.name}（${result.upper.nature}）・下${result.lower.name}（${result.lower.nature}）</p><p>變卦：${esc(result.changedName)}</p></div></div>`; }

function renderIChing() {
  metaShell(`<div class="card"><div class="card-label">易經・三錢起卦</div><div class="card-hint">先寫下單一、具體且可行動的問題，再模擬投擲三枚錢六次。請勿為同一問題反覆起卦直到得到喜歡的答案。</div><textarea id="iching-question" class="question-box" maxlength="160" placeholder="例如：面對這份工作選擇，我最需要留意什麼？" aria-label="占問問題"></textarea><button id="iching-cast" type="button" class="submit-btn compare-run-btn">專心起卦</button></div><div id="iching-result"></div>`);
  $('#iching-cast').addEventListener('click',()=>{const q=$('#iching-question').value.trim();if(!q)return toast('請先寫下問題');const r=castThreeCoins();$('#iching-result').innerHTML=`<div class="card"><div class="card-label">${esc(q)}</div>${diagramHtml(r)}<p class="reading-line">本卦看當下結構，動爻看變化位置，變卦看可能走向。請把「${r.upper.image}」與「${r.lower.image}」當作反思線索，再回到現實資訊做決定。</p></div>`;});
}

function renderMeihua() {
  metaShell(`<div class="card"><div class="card-label">梅花易數・時間起卦</div><div class="card-hint">採年月日時加總取上下卦與動爻的簡化時間起卦法；不同傳承可能採農曆、地支數或外應，結果會不同。</div><div class="date-form"><input id="meihua-time" type="datetime-local" aria-label="起卦時間"><input id="meihua-number" type="number" min="0" max="9999" value="0" aria-label="靈感數字"><button id="meihua-run" type="button" class="submit-btn">起卦</button></div></div><div id="meihua-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#meihua-time').value=now.toISOString().slice(0,16);
  $('#meihua-run').addEventListener('click',()=>{const r=plumBlossom($('#meihua-time').value,Number($('#meihua-number').value||0));$('#meihua-result').innerHTML=`<div class="card"><div class="card-label">時間起卦結果</div>${diagramHtml({...r,moving:[r.movingLine]})}<p class="reading-line">體用可先以不動的一卦為體、受動的一卦為用，再觀察五行生剋。公式：${esc(r.formula)}，動爻第 ${r.movingLine} 爻。</p></div>`;});
}

function renderQimen() {
  metaShell(`<div class="card"><div class="card-label">時家奇門・結構盤</div><div class="card-hint">第一版提供陰陽遁、局數及九宮門星神的教學型映射。尚未納入所有門派的拆補／置閏、符頭旬首與天盤干飛布，不適合用作專業奇門斷局。</div><div class="date-form"><input id="qimen-time" type="datetime-local" aria-label="排盤時間"><select id="qimen-term" aria-label="目前節氣"><option>冬至</option><option>小寒</option><option>大寒</option><option>立春</option><option>雨水</option><option>驚蟄</option><option>春分</option><option>清明</option><option>穀雨</option><option>立夏</option><option>小滿</option><option>芒種</option><option>夏至</option><option>小暑</option><option>大暑</option><option>立秋</option><option>處暑</option><option>白露</option><option>秋分</option><option>寒露</option><option>霜降</option><option>立冬</option><option>小雪</option><option>大雪</option></select><button id="qimen-run" type="button" class="submit-btn">排結構盤</button></div></div><div id="qimen-result"></div>`);
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());$('#qimen-time').value=now.toISOString().slice(0,16);
  $('#qimen-run').addEventListener('click',()=>{const r=qimenStructure($('#qimen-time').value,$('#qimen-term').value);$('#qimen-result').innerHTML=`<div class="card"><div class="card-label">${r.dun}${r.bureau}局・${esc(r.solarTerm)}</div><div class="qimen-grid">${r.palaces.map((p)=>`<div class="qimen-palace"><b>${p.palace}宮</b><span>${p.door}</span><span>${p.star}</span><small>${p.deity}</small></div>`).join('')}</div><p class="card-hint" style="margin-top:12px">此盤先用來熟悉九宮、八門、九星與八神的結構；正式決策前應交由熟悉所採門派規則的專業者核盤。</p></div>`;});
}

function renderMetaphysics() {
  const renderers={daily:renderDaily,timeline:renderTimeline,rectify:renderRectify,dates:renderDates,iching:renderIChing,meihua:renderMeihua,qimen:renderQimen};
  return renderers[state.metaphysicsTab]?.();
}

function renderAll() {
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
    <div class="card-hint">你有已存的命盤,不用重新輸入生辰,直接看今年的大限流年重點</div>
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
    $('#name-input').focus();
  });
}

// ---------- 初始化 ----------
function setupControls() {
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
    if (await computeAll()) {
      renderAll();
      if (matchMedia('(max-width: 900px)').matches) {
        $('.sidebar').classList.remove('open');
        $('#sidebar-toggle').setAttribute('aria-expanded', 'false');
        $('#main-content').focus();
      }
    }
  });

  $('#sidebar-toggle').addEventListener('click', () => {
    const open = $('.sidebar').classList.toggle('open');
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  });

  // 分享連結參數回填(有參數才直接排盤)
  const params = new URLSearchParams(location.search);
  if (params.get('date')) {
    $('#birth-date').value = params.get('date');
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

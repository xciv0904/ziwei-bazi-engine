import './style.css';
import { composeChartReading } from './engines/compose.js';
import { composeBaZiReading } from './engines/compose-bazi.js';
import { composeElementAnalysis } from './engines/compose-elements.js';
import { composeZiWeiLuck, composeBaZiLuck } from './engines/compose-luck.js';
import { generateZiweiComprehensiveReading, generateBaziComprehensiveReading } from './engines/comprehensive.js';
import { formatChartForAI } from './engines/format-ai.js';
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
  let [y, m, d] = $('#birth-date').value.split('-').map(Number);
  const hour = Number($('#birth-hour').value);
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
    name, input, ziWei, baZi, byBranch, lunarDateStr,
    elements: composeElementAnalysis(baZi.fiveElementDistribution), // 兩版本共用同一份,顯示時再依mode選summary/text
  };
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

// ---------- 頁首 ----------
function renderHead() {
  const { name, input, ziWei, baZi, lunarDateStr } = state.data;
  $('#page-title').textContent = `${name}　的命盤`;
  $('#copy-ai-btn').hidden = false;
  $('#reading-mode-toggle').hidden = false;
  const shichen = SHICHEN.find((s) => s.hour === input.hour);
  $('#birth-summary').textContent =
    `${baZi.fourPillars.yearPillar.stem}${baZi.fourPillars.yearPillar.branch}年` +
    `${lunarDateStr}　${shichen.name}　` +
    `${input.gender === 'female' ? '女' : '男'}　${ziWei.fiveElementBureau}`;
}

// ---------- 分頁一:命盤總覽 ----------
function elDot(char, isDay) {
  const el = STEM_EL[char] ?? BRANCH_EL[char];
  const textColor = isDay ? 'var(--cream)' : EL_COLOR[el];
  return `<div class="bz-el"><span class="dot" style="background:${EL_COLOR[el]}"></span><span style="color:${textColor}">${el}</span></div>`;
}

function renderZiWeiCard() {
  const { ziWei, name } = state.data;
  const cells = ziWei.palaces.map((p) => {
    const branch = p.position[1];
    const pos = LAYOUT_POSITIONS[branch];
    const stars = p.majorStars.map((s) => s.name + (s.transformation ? `<sup>${s.transformation}</sup>` : '')).join('');
    const cls = ['palace-cell', p.name === '命宮' ? 'self' : '', p.name === state.selectedPalace ? 'selected' : ''].join(' ');
    return `<button type="button" class="${cls}" data-palace="${esc(p.name)}"
      style="grid-row:${pos.row};grid-column:${pos.col}">
      <div class="p-name">${esc(p.name)} ${esc(branch)}${p.isBodyPalace ? '<span class="body-mark">・身</span>' : ''}</div>
      <div class="p-stars">${stars || ''}</div>
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

  return `<div class="card">
    <div class="classroom-head">
      <div class="round-icon">宮</div>
      <div class="classroom-title">${esc(state.selectedPalace)}　<small>地支：${esc(branch)}　星曜：${esc(stars)}</small></div>
    </div>
    <div class="classroom-hint">點選左側命盤十二宮，可切換查看不同宮位的說明 — 這是命盤小教室</div>
    <div class="classroom-body">
      <div class="reading-line"><span class="lead gold">宮位釋義　</span>${esc(palaceMeanings[state.selectedPalace] ?? '')}</div>
      <div class="reading-line"><span class="lead red">本命解讀　</span>${esc(flat(reading.text))}</div>
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
      <div class="luck-year">${sel.year} 年　${esc(sel.gz)}　${sel.age} 歲</div>
      <div class="reading-line"><span class="lead gold">大限重心（${esc(daxianPalace)}）　</span>${esc(flat(readingOf(daxianPalace).text))}</div>
      <div class="reading-line"><span class="lead red">流年命宮（${esc(liunianPalace)}）　</span>${esc(flat(readingOf(liunianPalace).text))}</div>
    </div>
  </div>`;
}

function renderDashboard() {
  const isZw = state.chartTab !== 'bazi';
  $('#view-dashboard').innerHTML = `<div class="stack">
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
  $$('#view-dashboard .palace-cell').forEach((cell) =>
    cell.addEventListener('click', () => { state.selectedPalace = cell.dataset.palace; renderDashboard(); }));
  $$('#view-dashboard [data-limit]').forEach((chip) =>
    chip.addEventListener('click', () => { state.limitIdx = Number(chip.dataset.limit); state.yearIdx = 0; renderDashboard(); }));
  $$('#view-dashboard [data-year]').forEach((chip) =>
    chip.addEventListener('click', () => { state.yearIdx = Number(chip.dataset.year); renderDashboard(); }));
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

function renderShare() {
  const { name, input, ziWei, baZi, zwLuck, byBranch } = state.data;
  const lifePalace = ziWei.palaces.find((p) => p.name === '命宮');
  const opposite = byBranch[BRANCHES[(BRANCHES.indexOf(lifePalace.position[1]) + 6) % 12]];
  const lifeStars = lifePalace.majorStars.length
    ? lifePalace.majorStars.map((s) => s.name).join('・')
    : `空宮（借${opposite.majorStars.map((s) => s.name).join('・')}）`;
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const shichen = SHICHEN.find((s) => s.hour === input.hour);

  const quote = `「命宮${lifeStars.startsWith('空宮') ? '無主星、格局隨緣而變' : `${lifeStars}坐守`},` +
    `現行大限行至${zwLuck.decadal?.palaceName ?? '—'},流年落${zwLuck.annual.palaceName},宜順勢經營、穩健佈局。」`;

  $('#view-share').innerHTML = `<div class="share-wrap">
    <div class="fate-card" id="fate-card">
      <div class="fate-brand"><div class="brand-icon">命</div><span>紫微斗數．八字排盤</span></div>
      <div class="fate-id">
        <div class="fate-name">${esc(name)}</div>
        <div class="fate-birth">${input.year}年${input.month}月${input.day}日 ${esc(shichen.name)}・${input.gender === 'female' ? '女' : '男'}</div>
        <div class="fate-tags">
          <div class="fate-tag"><div class="t-label">命宮主星</div><div class="t-value">${esc(lifeStars)}</div></div>
          <div class="fate-tag"><div class="t-label">日主</div><div class="t-value">${esc(dayStem)}${esc(STEM_EL[dayStem])}</div></div>
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
    </div>
  </div>`;

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
      a.download = `${name}-命卡.png`;
      a.click();
      toast('已下載命卡圖片');
    } catch { toast('圖片匯出失敗,請改用截圖'); }
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

const VIEWS = ['dashboard', 'report', 'comprehensive', 'share'];

function switchView(view) {
  state.view = view;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
}

function renderAll() {
  renderHead();
  renderDashboard();
  renderReport();
  renderComprehensive();
  renderShare();
}

// 進站尚未排盤時的歡迎畫面
function renderEmpty() {
  $('#page-title').textContent = '線上排盤';
  $('#birth-summary').textContent = '';
  const welcome = `<div class="card welcome-card">
    <div class="card-label">開始排盤</div>
    <p class="welcome-text">在左側輸入姓名、出生日期、時辰與性別,按「排盤」即可產生你的紫微斗數命盤與八字四柱,
    並附上宮位小教室、大限流年瀏覽與白話解讀報告。</p>
    <p class="welcome-text muted">所有計算皆在你的瀏覽器內完成,生辰資料不會上傳到任何伺服器。</p>
  </div>`;
  for (const v of VIEWS) $(`#view-${v}`).innerHTML = welcome;
  $('#copy-ai-btn').hidden = true;
  $('#reading-mode-toggle').hidden = true;
}

// ---------- 初始化 ----------
function setupControls() {
  // 時辰選單(預設子時,列表第一個選項,避免下拉選單一開始就停在中間某個時辰,
  // 讓使用者誤以為那是自動判斷出來的值——時辰務必由使用者自己選,這裡只是給一個不易混淆的起始值)
  $('#birth-hour').innerHTML = SHICHEN
    .map((s) => `<option value="${s.hour}">${s.label}</option>`).join('');
  $('#birth-hour').value = '0';

  // 藥丸切換
  for (const [id, key] of [['#cal-toggle', 'cal'], ['#gender-toggle', 'gender']]) {
    $(id).addEventListener('click', (e) => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      state[key] = btn.dataset.value;
      $$(`${id} .pill`).forEach((p) => p.classList.toggle('active', p === btn));
    });
  }

  $$('.nav-item').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  $('#reading-mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-pill');
    if (!btn || !state.data) return;
    state.readingMode = btn.dataset.mode;
    $$('#reading-mode-toggle .mode-pill').forEach((p) => p.classList.toggle('active', p === btn));
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
    if (await computeAll()) renderAll();
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

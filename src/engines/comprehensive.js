// src/engines/comprehensive.js — 命盤綜合解析(純規則組裝,不呼叫外部 API)
// generateZiweiComprehensiveReading:6 段紫微綜合解讀
// generateBaziComprehensiveReading:3 段八字綜合解讀
import palaceStarDb from '../data/palace-star-meanings.json' with { type: 'json' };
import doubleStarDb from '../data/double-star-combinations.json' with { type: 'json' };
import assembly from '../data/comprehensive-reading-assembly.json' with { type: 'json' };
import doubleLogic from '../data/double-star-assembly-logic.json' with { type: 'json' };
import traitTags from '../data/star-trait-tags.json' with { type: 'json' };
import focusSection from '../data/current-focus-section.json' with { type: 'json' };
import baziReading from '../data/bazi-comprehensive-reading.json' with { type: 'json' };
import elementDb from '../data/five-element-analysis.json' with { type: 'json' };
import tenGodsDb from '../data/ten-gods-meanings.json' with { type: 'json' };
import overlays from '../data/luck-cycle-overlays.json' with { type: 'json' };
import { BRIGHTNESS_ALIAS } from './compose.js';
import { tenGodOf } from './compose-luck.js';
import { composeElementAnalysis } from './compose-elements.js';

const COMBOS = doubleStarDb['雙主星組合'];
const TAGS = traitTags['主星特質標籤'];
const STAR_ORDER = doubleLogic['星曜正規化排序表']['順序'];
const ADVICE = assembly['條件式建議句庫'];
const FOCUS = focusSection['第6段_當前焦點'];
const BZ_CAT = overlays['八字大運流年類別疊加'];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];
const fill = (tpl, vars) => tpl.replace(/\{(.+?)\}/g, (_, k) => vars[k] ?? `{${k}}`);
const branchOf = (p) => p.position[1];

// ---------- 雙星組裝邏輯(double-star-assembly-logic.json) ----------

/** 依星曜正規化排序表排序 */
function normalizeStars(names) {
  return [...names].sort((a, b) => STAR_ORDER.indexOf(a) - STAR_ORDER.indexOf(b));
}

/** 決定主句:單星 / 雙星組合 / 退回單星疊加(3星以上只取前兩顆判斷) */
function resolveMainText(contextPalace, starNames) {
  const get = (s) => palaceStarDb[contextPalace]?.[s] ?? '';
  if (starNames.length === 1) return get(starNames[0]);

  const pair = normalizeStars(starNames).slice(0, 2);
  const combo = COMBOS[`${pair[0]}+${pair[1]}`];
  if (combo) return combo;
  // 找不到組合 → 退回單星疊加:{星1單星解釋}同時,{星2單星解釋}
  return `${get(pair[0])}同時,${get(pair[1])}`;
}

/** 主句之後依序疊加亮度、四化(與四化亮度疊加的優先順序) */
function applyOverlays(text, stars) {
  const parts = [text];
  for (const s of stars) {
    const bKey = BRIGHTNESS_ALIAS[s.brightness];
    if (bKey && palaceStarDb['亮度疊加'][bKey]) {
      parts.push(`${s.name}亮度${s.brightness}——${palaceStarDb['亮度疊加'][bKey]}`);
    }
  }
  for (const s of stars) {
    if (!s.transformation) continue;
    const key = `化${s.transformation}`;
    if (palaceStarDb['四化疊加'][key]) parts.push(`${s.name}${key}——${palaceStarDb['四化疊加'][key]}`);
  }
  return parts.join(' ');
}

/** 取某宮位的完整解釋(空宮自動借對宮,文案用對宮情境) */
function palaceReadingOf(ziWei, palace, { overlays: withOverlays = true } = {}) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  let stars = palace.majorStars;
  let ctx = palace.name;
  let borrowed = false;
  if (stars.length === 0) {
    const opp = byBranch[BRANCHES[(BRANCHES.indexOf(branchOf(palace)) + 6) % 12]];
    if (opp?.majorStars.length) { stars = opp.majorStars; ctx = opp.name; borrowed = true; }
    else return { text: '', stars: [], borrowed: false };
  }
  const main = resolveMainText(ctx, stars.map((s) => s.name));
  return {
    text: withOverlays ? applyOverlays(main, stars) : main,
    stars: stars.map((s) => s.name),
    borrowed,
  };
}

// ---------- 特質標籤呼應判斷(star-trait-tags.json) ----------

function resonanceSentence(starsA, starsB) {
  const setA = new Set(starsA.flatMap((n) => TAGS[n] ?? []));
  const setB = new Set(starsB.flatMap((n) => TAGS[n] ?? []));
  const overlap = [...setA].filter((t) => setB.has(t)).length;
  const logic = traitTags['呼應差異判斷邏輯'];
  if (overlap >= 2) return logic['交集數量>=2'];
  if (overlap === 1) return logic['交集數量=1'];
  return logic['交集數量=0'];
}

// ---------- 紫微 6 段綜合解析 ----------

/**
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} [opts] { year, age }
 * @returns {{ sections: Array<{title, text}>, text: string }}
 */
export function generateZiweiComprehensiveReading(ziWei, { year = new Date().getFullYear(), age = ziWei.age } = {}) {
  const byName = Object.fromEntries(ziWei.palaces.map((p) => [p.name, p]));
  const reading = (name, opt) => palaceReadingOf(ziWei, byName[name], opt);
  const sections = [];

  // 第1段:性格才華(命宮 + 身宮)
  const life = reading('命宮');
  const bodyPalace = ziWei.palaces.find((p) => p.isBodyPalace);
  const body = reading(bodyPalace.name);
  const s1p = assembly['第1段_性格才華'];
  const s1lines = [
    (life.borrowed ? s1p['命宮空宮時開頭'] : s1p['命宮有主星時開頭']) + life.text,
    fill(s1p['連接句模板'][1], { 身宮宮位名稱: bodyPalace.name, 身宮解釋: body.text }),
  ];
  sections.push({ title: '一、性格與才華', text: s1lines.join('') });

  // 第2段:事業金錢(官祿 → 財帛 → 福德 → 田宅 + 呼應判斷)
  const s2p = assembly['第2段_事業金錢'];
  const career = reading('官祿宮');
  const wealth = reading('財帛宮');
  const s2lines = [
    fill(s2p['連接句模板'][0], { 官祿宮解釋: career.text }),
    fill(s2p['連接句模板'][1], { 財帛宮解釋: wealth.text }),
    fill(s2p['連接句模板'][2], { 福德宮解釋: reading('福德宮').text }),
    fill(s2p['連接句模板'][3], { 田宅宮解釋: reading('田宅宮').text }),
    fill(s2p['連接句模板'][4], { 是否呼應判斷句: resonanceSentence(career.stars, wealth.stars) }),
  ];
  sections.push({ title: '二、事業與金錢', text: s2lines.join('') });

  // 第3段:戀愛婚姻(夫妻宮 + 四化)
  const s3p = assembly['第3段_戀愛婚姻'];
  const spousePalace = byName['夫妻宮'];
  const spouse = palaceReadingOf(ziWei, spousePalace, { overlays: false });
  const spouseMutagens = spousePalace.majorStars.filter((s) => s.transformation);
  const s3lines = [fill(s3p['連接句模板'][0], { 夫妻宮解釋: spouse.text })];
  if (spouseMutagens.length) {
    for (const s of spouseMutagens) {
      const key = `化${s.transformation}`;
      s3lines.push(fill(s3p['連接句模板'][1], { 四化名稱: `${s.name}${key}`, 四化疊加句: palaceStarDb['四化疊加'][key] }));
    }
  } else {
    s3lines.push(s3p['無四化時結尾句']);
  }
  sections.push({ title: '三、戀愛與婚姻', text: s3lines.join('') });

  // 第4段:健康家庭人際(疾厄 → 父母 → 田宅 → 交友/僕役)
  const s4p = assembly['第4段_健康家庭人際'];
  const s4lines = [
    fill(s4p['連接句模板'][0], { 疾厄宮解釋: reading('疾厄宮').text }),
    fill(s4p['連接句模板'][1], { 父母宮解釋: reading('父母宮').text }),
    fill(s4p['連接句模板'][2], { 田宅宮解釋: reading('田宅宮', { overlays: false }).text }),
    fill(s4p['連接句模板'][3], { 交友宮解釋: reading('僕役宮').text }),
  ];
  sections.push({ title: '四、健康、家庭與人際', text: s4lines.join('') });

  // 第5段:行動建議(掃描 12 宮四化 → 條件式建議句庫)
  const s5p = assembly['第5段_行動建議'];
  const hits = [];
  for (const p of ziWei.palaces) {
    for (const s of p.majorStars) {
      if (!s.transformation) continue;
      const sentence = ADVICE[`化${s.transformation}_${p.name}`];
      if (sentence && !hits.includes(sentence)) hits.push(sentence);
    }
  }
  sections.push({
    title: '五、行動建議',
    text: [s5p['開頭句'], ...hits, s5p['結尾句']].join(''),
  });

  // 第6段:當前焦點(大限 + 流年,current-focus-section.json)
  const limit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return age >= a && age <= b;
  });
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const s6lines = [FOCUS['開頭句']];
  let limitPalace = null;
  if (limit) {
    limitPalace = byBranch[limit.ganZhi[1]];
    const [startAge, endAge] = limit.ageRange.split('~');
    s6lines.push(fill(FOCUS['大限句模板'], {
      startAge, endAge,
      大限干支: limit.ganZhi,
      大限宮位名稱: limitPalace.name,
      大限宮位星曜解釋: palaceReadingOf(ziWei, limitPalace).text,
    }));
  }
  const gz = yearGanZhi(year);
  const annualPalace = byBranch[gz[1]];
  s6lines.push(fill(FOCUS['流年句模板'], {
    西元年: year,
    流年干支: gz,
    流年宮位名稱: annualPalace.name,
    流年宮位星曜解釋: palaceReadingOf(ziWei, annualPalace).text,
  }));
  if (limitPalace && limitPalace.name === annualPalace.name) {
    s6lines.push(fill(FOCUS['重疊提醒句'], { 宮位名稱: annualPalace.name }));
  }
  s6lines.push(FOCUS['結尾句']);
  sections.push({ title: '六、當前焦點', text: s6lines.join('') });

  return { sections, text: sections.map((s) => `【${s.title}】\n${s.text}`).join('\n\n') };
}

// ---------- 八字 3 段綜合解析 ----------

const POSITIONS = [
  ['年柱天干', 'yearStem'], ['月柱天干', 'monthStem'], ['時柱天干', 'hourStem'],
  ['年支主氣', 'yearBranch'], ['月支主氣', 'monthBranch'], ['日支主氣', 'dayBranch'], ['時支主氣', 'hourBranch'],
];
const REL_NAME = { 六合: '六合', 害: '相害', 沖: '相沖', 刑: '相刑' };
const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };

function findGod(tenGods, wanted) {
  for (const [label, key] of POSITIONS) {
    if (wanted.includes(tenGods[key])) return { label, god: tenGods[key] };
  }
  return null;
}

/**
 * @param {object} baZi  convertToBaZi() 輸出
 * @param {object} [opts] { year }
 * @returns {{ sections: Array<{title, text}>, text: string }}
 */
export function generateBaziComprehensiveReading(baZi, { year = new Date().getFullYear() } = {}) {
  const sections = [];
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const dayEl = STEM_EL[dayStem];
  const core = (god) => tenGodsDb['十神核心意義'][god]?.core ?? '';
  const t1 = baziReading['第1段_個性本質']['連接句模板'];

  // 第1段:個性本質
  const s1lines = [
    fill(t1[0], { 日主: `${dayStem}(${dayEl})`, 日主基本特質: elementDb['五行基本特質'][dayEl] }),
    fill(t1[1], { 年干十神: baZi.tenGods.yearStem, '年干十神核心解釋': core(baZi.tenGods.yearStem) }),
    fill(t1[2], { 月干十神: baZi.tenGods.monthStem, '月干十神核心解釋': core(baZi.tenGods.monthStem) }),
    fill(t1[3], { 日支十神: baZi.tenGods.dayBranch, '日支十神核心解釋': core(baZi.tenGods.dayBranch) }),
  ];
  sections.push({ title: '一、個性本質', text: s1lines.join('') });

  // 第2段:財官流向
  const t2 = baziReading['第2段_財官流向'];
  const wealthHit = findGod(baZi.tenGods, ['正財', '偏財']);
  const officerHit = findGod(baZi.tenGods, ['正官', '七殺']);
  const s2lines = [
    wealthHit
      ? fill(t2['連接句模板'][0], { 財星出現位置: wealthHit.label, 財星十神: wealthHit.god, 財星核心解釋: core(wealthHit.god) })
      : t2['無財星時'],
    officerHit
      ? fill(t2['連接句模板'][1], { 官殺出現位置: officerHit.label, 官殺十神: officerHit.god, 官殺核心解釋: core(officerHit.god) })
      : t2['無官殺時'],
    fill(t2['連接句模板'][2], { '五行分析總結句(來自five-element-analysis.json的整體平衡建議模板)': composeElementAnalysis(baZi.fiveElementDistribution).summary }),
  ];
  sections.push({ title: '二、財官流向', text: s2lines.join('') });

  // 第3段:人際健康與行動建議
  const t3 = baziReading['第3段_人際健康與行動建議'];
  const seen = new Set();
  const relParts = [];
  for (const r of baZi.branchRelations) {
    const key = [r.branch, r.with].sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    relParts.push(`${BRANCH_LABEL[r.branch]}與${BRANCH_LABEL[r.with]}${REL_NAME[r.relation] ?? r.relation}(${r.pair})`);
  }
  const relSummary = relParts.length ? relParts.join('、') : '四柱地支之間沒有明顯的合沖刑害';

  const categoryOf = (god) =>
    Object.entries(BZ_CAT['類別對應']).find(([, gods]) => gods.includes(god))?.[0] ?? null;
  const cycle = baZi.greatLuckCycles.find((c) => year >= c.startYear && year < c.startYear + 10);
  const s3lines = [fill(t3['連接句模板'][0], { 地支關係列表摘要: relSummary })];
  let decadalCat = null;
  if (cycle) {
    decadalCat = categoryOf(tenGodOf(dayStem, cycle.ganZhi[0]));
    s3lines.push(fill(t3['連接句模板'][1], {
      大運干支: cycle.ganZhi, 起訖年齡: `${cycle.ageRange}歲`,
      大運類別: decadalCat, 大運類別解讀: BZ_CAT['類別解讀'][decadalCat],
    }));
  }
  const gz = baZi.annualPillars[year] ?? yearGanZhi(year);
  const annualCat = categoryOf(tenGodOf(dayStem, gz[0]));
  s3lines.push(fill(t3['連接句模板'][2], {
    西元年: year, 流年干支: gz,
    流年類別: annualCat, 流年類別解讀: BZ_CAT['類別解讀'][annualCat],
  }));
  s3lines.push(fill(t3['結尾行動建議句'], { 有利類別: decadalCat ?? annualCat, 需留意類別: annualCat }));
  sections.push({ title: '三、人際健康與行動建議', text: s3lines.join('') });

  return { sections, text: sections.map((s) => `【${s.title}】\n${s.text}`).join('\n\n') };
}

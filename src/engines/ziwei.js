// src/engines/ziwei.js — 紫微斗數排盤引擎（iztro）
// convertToZiWei(input) → 統一 schema 的 ziWei 物件
//
// 流派設定：紫微各派在「晚子時算哪一天」「安星用通行版還是中州派」上本來就有分歧，
// 免責聲明寫「不同流派可能造成差異」是誠實，但使用者無法對齊自己學的那一派。
// iztro 支援這兩項設定，所以開放給使用者選，並在畫面上標明預設值。
// 四化表沒有開放選擇：本站生年四化來自 iztro 預設表，流年飛化用 compose-annual.js 的
// FLOW_SIHUA，兩張表已驗證完全一致（見 tests/reports/cross-validation.json）。
// 只換其中一張會讓生年四化與流年四化分屬不同流派，比不給選項更糟。
import { astro } from 'iztro';
import { normalizeZiWeiSchool } from './ziwei-school.js';

export { ZIWEI_SCHOOL_OPTIONS, normalizeZiWeiSchool, isDefaultZiWeiSchool, describeZiWeiSchool } from './ziwei-school.js';

/**
 * iztro 的 astro.config() 是全域狀態，不是傳進 bySolar 的參數。
 * 因此每次排盤前都要重設一次——否則上一張盤選的流派會殘留到下一張盤，
 * 而那種錯誤在畫面上完全看不出來（盤看起來正常，只是規則不對）。
 */
function applySchoolConfig(school) {
  const n = normalizeZiWeiSchool(school);
  astro.config({ dayDivide: n.dayDivide, algorithm: n.algorithm });
  return n;
}

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 小時（0-23）→ iztro timeIndex(0=早子, 1=丑 … 7=未 … 12=晚子) */
export function hourToTimeIndex(hour) {
  return hour >= 23 ? 12 : Math.floor((hour + 1) / 2);
}

/** 西元年 → 干支 */
function yearGanZhi(y) {
  return STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];
}

/** 星曜格式化：名（亮度[,四化X]） */
function formatStar(star) {
  const tags = [];
  if (star.brightness) tags.push(star.brightness);
  if (star.mutagen) tags.push(`四化${star.mutagen}`);
  return tags.length ? `${star.name}(${tags.join(',')})` : star.name;
}

/** iztro 宮名 → 統一命名（補「宮」字，官祿/僕役別名歸一） */
function normalizePalaceName(name) {
  const alias = { 事業: '官祿', 交友: '僕役' };
  const base = alias[name] ?? name;
  return base.endsWith('宮') ? base : `${base}宮`;
}

/**
 * @param {object} input
 * @param {number} input.year   西元年
 * @param {number} input.month  月（1-12）
 * @param {number} input.day    日
 * @param {number} input.hour   時（0-23）
 * @param {'male'|'female'} input.gender
 * @param {Date}   [input.refDate=new Date()]  流年/小限/年齡的基準日
 */
export function convertToZiWei({ year, month, day, hour, gender, school, refDate = new Date() }) {
  const appliedSchool = applySchoolConfig(school);
  const chart = astro.bySolar(
    `${year}-${month}-${day}`,
    hourToTimeIndex(hour),
    gender,
    true,      // 陽曆
    'zh-TW',
  );
  const refYear = refDate.getFullYear();

  // 週歲（基準日尚未過生日則 -1）
  const birthday = new Date(year, month - 1, day);
  let age = refYear - year;
  if (refDate < new Date(refYear, month - 1, day)) age -= 1;

  // --- 12 宮 ---
  const palaces = chart.palaces.map((p) => {
    const entry = {
      name: normalizePalaceName(p.name),
      position: `${p.heavenlyStem}${p.earthlyBranch}`,
      majorStars: p.majorStars.map((s) => {
        const star = { name: s.name, brightness: s.brightness };
        if (s.mutagen) star.transformation = s.mutagen;
        return star;
      }),
      minorStars: [...p.minorStars, ...p.adjectiveStars].map(formatStar),
      auxiliary: {
        twelveStage: [].concat(p.changsheng12)[0] ?? '',
        shensha: [p.boshi12, p.jiangqian12, p.suiqian12].flatMap((x) => [].concat(x)),
      },
    };
    if (p.isBodyPalace) entry.isBodyPalace = true;
    return entry;
  });

  // --- 大限（依起始年齡排序） ---
  const majorLimits = chart.palaces
    .map((p) => ({
      ganZhi: `${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}`,
      ageRange: `${p.decadal.range[0]}~${p.decadal.range[1]}`,
      _start: p.decadal.range[0],
    }))
    .sort((a, b) => a._start - b._start)
    .slice(0, 10) // 慣例只列十個大限
    .map(({ ganZhi, ageRange }) => ({ ganZhi, ageRange }));

  // --- 小限（基準年 -3 ~ +6，虛歲） ---
  // iztro 已經在每一宮的 ages 欄位完成小限歲數配置；這裡只把指定虛歲
  // 反查回原宮位，沒有另起一套小限算法。保留原有 year/ganZhi/age 欄位，
  // 僅增加 palaceName/position，避免破壞既有消費端與儲存資料格式。
  const minorLimits = [];
  for (let y = refYear - 3; y <= refYear + 6; y++) {
    const nominalAge = y - year + 1;
    const landing = chart.palaces.find((p) => p.ages.includes(nominalAge));
    minorLimits.push({
      year: y,
      ganZhi: yearGanZhi(y),
      age: nominalAge,
      palaceName: landing ? normalizePalaceName(landing.name) : null,
      position: landing ? `${landing.heavenlyStem}${landing.earthlyBranch}` : null,
    });
  }

  const bodyPalaceObj = chart.palaces.find((p) => p.isBodyPalace);
  // 學習／年份比較可跨越目前畫面的十年小限清單，因此另外保留 iztro
  // 已排好的 1–120 虛歲落宮索引。鍵是虛歲，值只含落宮，不重算任何規則。
  const smallLimitPalaces = Object.fromEntries(chart.palaces.flatMap((p) => p.ages.map((nominalAge) => [
    nominalAge,
    { palaceName: normalizePalaceName(p.name), position: `${p.heavenlyStem}${p.earthlyBranch}` },
  ])));

  return {
    // 實際採用的流派設定跟著結果一起回傳，畫面與 AI 提示詞才能標明這張盤是用哪一派排的
    school: appliedSchool,
    fiveElementBureau: chart.fiveElementsClass,
    lifePalace: chart.earthlyBranchOfSoulPalace,
    bodyPalace: chart.earthlyBranchOfBodyPalace,
    bodyPalaceName: bodyPalaceObj
      ? `${normalizePalaceName(bodyPalaceObj.name)}(${bodyPalaceObj.heavenlyStem}${bodyPalaceObj.earthlyBranch})`
      : null,
    lifeMaster: chart.soul,
    bodyMaster: chart.body,
    gender,
    age,
    majorLimits,
    annualFlow: { [refYear]: yearGanZhi(refYear) },
    minorLimits,
    smallLimitPalaces,
    palaces,
    // 斗君起流月需要的出生資料：農曆生月（閏月依 iztro 判定）與生時地支
    lunarMonth: chart.rawDates?.lunarDate?.lunarMonth ?? null,
    isLeapMonth: chart.rawDates?.lunarDate?.isLeap ?? false,
    hourBranch: BRANCHES[hourToTimeIndex(hour) % 12],
    // 生年天干（以農曆年計，來因宮與生年四化的依據）
    yearStem: yearGanZhi(chart.rawDates?.lunarDate?.lunarYear ?? year)[0],
  };
}

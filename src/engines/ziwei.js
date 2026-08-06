// src/engines/ziwei.js — 紫微斗數排盤引擎（iztro；四化採欽天／飛星版，見 compose-annual.js FLOW_SIHUA）
// convertToZiWei(input) → 統一 schema 的 ziWei 物件
import { astro } from 'iztro';

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
export function convertToZiWei({ year, month, day, hour, gender, refDate = new Date() }) {
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

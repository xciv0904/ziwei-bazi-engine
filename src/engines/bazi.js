// src/engines/bazi.js — 八字排盤引擎(lunar-javascript)
// convertToBaZi(input) → 統一 schema 的 baZi 物件
import lunarPkg from 'lunar-javascript';

const { Solar } = lunarPkg;

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const STEM_ELEMENT = {
  甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'earth',
  己: 'earth', 庚: 'metal', 辛: 'metal', 壬: 'water', 癸: 'water',
};
const BRANCH_ELEMENT = {
  子: 'water', 丑: 'earth', 寅: 'wood', 卯: 'wood', 辰: 'earth', 巳: 'fire',
  午: 'fire', 未: 'earth', 申: 'metal', 酉: 'metal', 戌: 'earth', 亥: 'water',
};

// 三合十二神煞(劫煞起於三合絕位,順行)
const SHENSHA_ORDER = ['劫煞', '災煞', '天煞', '地煞', '年煞', '月煞', '亡神', '將星', '攀鞍', '驛馬', '六害', '華蓋'];
// 三合局(branchIndex % 4)→ 劫煞所在地支 index:申子辰→巳、巳酉丑→寅、寅午戌→亥、亥卯未→申
const JIESHA_START = { 0: 5, 1: 2, 2: 11, 3: 8 };

const LIU_HE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const LIU_HAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
const LIU_CHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];

// lunar-javascript 輸出為簡體,轉為繁體(僅涵蓋十神/納音/十二長生會用到的字)
const S2T = {
  财: '財', 杀: '殺', 伤: '傷', 杨: '楊', 驿: '驛', 长: '長', 头: '頭',
  炉: '爐', 剑: '劍', 锋: '鋒', 涧: '澗', 蜡: '蠟', 雳: '靂', 灯: '燈',
  钗: '釵', 钏: '釧', 带: '帶', 临: '臨', 绝: '絕', 养: '養',
};
const t = (s) => [...s].map((c) => S2T[c] ?? c).join('');

/** 以 anchor 支起三合十二神煞,查 target 支的神煞名 */
function shenShaOf(anchorBranch, targetBranch) {
  const start = JIESHA_START[BRANCHES.indexOf(anchorBranch) % 4];
  return SHENSHA_ORDER[(BRANCHES.indexOf(targetBranch) - start + 12) % 12];
}

/** 年干支(以節氣立春為界無關,整年干支查 7/1 必安全) */
function yearGanZhi(y) {
  return Solar.fromYmd(y, 7, 1).getLunar().getYearInGanZhi();
}

/** 藏干陣列 + 對應十神 → ["丁-食神", "己-偏財"] */
function zipHidden(hideGans, shiShens) {
  return hideGans.map((g, i) => `${g}-${t(shiShens[i])}`);
}

function pillar(ganZhi) {
  return { stem: ganZhi[0], branch: ganZhi[1] };
}

/**
 * @param {object} input
 * @param {number} input.year   西元年
 * @param {number} input.month  月(1-12)
 * @param {number} input.day    日
 * @param {number} input.hour   時(0-23)
 * @param {number} [input.minute=0]
 * @param {'male'|'female'} input.gender
 * @param {Date}   [input.refDate=new Date()]  流年/流月的基準日
 */
export function convertToBaZi({ year, month, day, hour, minute = 0, gender, refDate = new Date() }) {
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const ec = solar.getLunar().getEightChar();
  const refYear = refDate.getFullYear();

  const branches = {
    yearBranch: ec.getYearZhi(),
    monthBranch: ec.getMonthZhi(),
    dayBranch: ec.getDayZhi(),
    hourBranch: ec.getTimeZhi(),
  };

  // --- 神煞:年柱以日支起,其餘各柱以年支起 ---
  const shensha = {
    yearPillar: shenShaOf(branches.dayBranch, branches.yearBranch),
    monthPillar: shenShaOf(branches.yearBranch, branches.monthBranch),
    dayPillar: shenShaOf(branches.yearBranch, branches.dayBranch),
    hourPillar: shenShaOf(branches.yearBranch, branches.hourBranch),
  };

  // --- 地支關係(六合/害/沖) ---
  const keys = ['yearBranch', 'monthBranch', 'dayBranch', 'hourBranch'];
  const tables = [[LIU_HE, '六合'], [LIU_HAI, '害'], [LIU_CHONG, '沖']];
  const branchRelations = [];
  for (const a of keys) {
    for (const b of keys) {
      if (a === b) continue;
      for (const [table, relation] of tables) {
        if (table.some(([x, y]) =>
          (x === branches[a] && y === branches[b]) || (y === branches[a] && x === branches[b]))) {
          const pairArr = [branches[a], branches[b]]
            .sort((x, y) => BRANCHES.indexOf(x) - BRANCHES.indexOf(y));
          branchRelations.push({ branch: a, relation, with: b, pair: pairArr.join('') });
        }
      }
    }
  }

  // --- 五行分布(四干四支共八字) ---
  const dist = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const g of [ec.getYearGan(), ec.getMonthGan(), ec.getDayGan(), ec.getTimeGan()]) dist[STEM_ELEMENT[g]]++;
  for (const z of Object.values(branches)) dist[BRANCH_ELEMENT[z]]++;

  // --- 大運(年齡以「起運年 − 出生年」計,與參考排盤一致) ---
  const yun = ec.getYun(gender === 'male' ? 1 : 0);
  const daYun = yun.getDaYun().slice(1, 10); // [0] 為起運前
  const greatLuckCycles = daYun.map((d, i) => {
    const startAge = d.getStartYear() - year;
    return {
      index: i + 1,
      ganZhi: d.getGanZhi(),
      startYear: d.getStartYear(),
      ageRange: `${startAge}~${startAge + 9}`,
    };
  });

  // --- 流年(基準年 -5 ~ +6)/ 流月(基準年 1-12 月,取每月 15 日必落在該節氣月) ---
  const annualPillars = {};
  for (let y = refYear - 5; y <= refYear + 6; y++) annualPillars[y] = yearGanZhi(y);
  const monthlyPillars = {};
  for (let m = 1; m <= 12; m++) {
    monthlyPillars[String(m).padStart(2, '0')] =
      Solar.fromYmd(refYear, m, 15).getLunar().getMonthInGanZhi();
  }

  return {
    fourPillars: {
      yearPillar: pillar(ec.getYear()),
      monthPillar: pillar(ec.getMonth()),
      dayPillar: pillar(ec.getDay()),
      hourPillar: pillar(ec.getTime()),
    },
    hiddenStems: {
      yearBranch: zipHidden(ec.getYearHideGan(), ec.getYearShiShenZhi()),
      monthBranch: zipHidden(ec.getMonthHideGan(), ec.getMonthShiShenZhi()),
      dayBranch: zipHidden(ec.getDayHideGan(), ec.getDayShiShenZhi()),
      hourBranch: zipHidden(ec.getTimeHideGan(), ec.getTimeShiShenZhi()),
    },
    tenGods: {
      yearStem: t(ec.getYearShiShenGan()),
      monthStem: t(ec.getMonthShiShenGan()),
      dayStem: '日主',
      hourStem: t(ec.getTimeShiShenGan()),
      yearBranch: t(ec.getYearShiShenZhi()[0]), // 取本氣
      monthBranch: t(ec.getMonthShiShenZhi()[0]),
      dayBranch: t(ec.getDayShiShenZhi()[0]),
      hourBranch: t(ec.getTimeShiShenZhi()[0]),
    },
    pillarDetails: {
      yearPillar: { nayin: t(ec.getYearNaYin()), twelveStages: t(ec.getYearDiShi()), shensha: shensha.yearPillar },
      monthPillar: { nayin: t(ec.getMonthNaYin()), twelveStages: t(ec.getMonthDiShi()), shensha: shensha.monthPillar },
      dayPillar: { nayin: t(ec.getDayNaYin()), twelveStages: t(ec.getDayDiShi()), shensha: shensha.dayPillar },
      hourPillar: { nayin: t(ec.getTimeNaYin()), twelveStages: t(ec.getTimeDiShi()), shensha: shensha.hourPillar },
    },
    branchRelations,
    fiveElementDistribution: dist,
    coreValues: {
      voidBranches: { year: ec.getYearXunKong(), day: ec.getDayXunKong() },
      monthCommander: ec.getMonthHideGan()[0], // 月令本氣
      greatLuckStartAge: daYun[0] ? daYun[0].getStartYear() - year : null,
    },
    annualPillars,
    monthlyPillars,
    greatLuckCycles,
  };
}

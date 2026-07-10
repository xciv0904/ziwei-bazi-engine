// src/engines/bazi.js — 八字排盤引擎(lunar-javascript)
// convertToBaZi(input) → 統一 schema 的 baZi 物件
import lunarPkg from 'lunar-javascript';

const { Solar } = lunarPkg;

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

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
// 三刑(寅巳申、丑戌未)與子卯相刑;辰午酉亥自刑僅在重複出現時成立,此處不列
const XING = [['寅', '巳'], ['巳', '申'], ['申', '寅'], ['丑', '戌'], ['戌', '未'], ['未', '丑'], ['子', '卯']];
// 相破(六破)
const XIANG_PO = [['子', '酉'], ['卯', '午'], ['辰', '丑'], ['戌', '未'], ['寅', '亥'], ['巳', '申']];
// 暗合(採信度最高的「通合」組合,另加通祿合中同樣有多來源佐證的巳酉;
//  「子巳」等孤證組合因來源不一致,不列入,避免誤判)
const AN_HE = [['寅', '丑'], ['午', '亥'], ['卯', '申'], ['巳', '酉']];
// 半合(三合局中含帝旺/中神的相鄰兩支)
const BAN_HE = [
  ['申', '子'], ['子', '辰'], // 三合水局(申子辰)
  ['巳', '酉'], ['酉', '丑'], // 三合金局(巳酉丑)
  ['寅', '午'], ['午', '戌'], // 三合火局(寅午戌)
  ['亥', '卯'], ['卯', '未'], // 三合木局(亥卯未)
];
// 拱(三合局中缺中神的兩端外支)
const GONG = [['申', '辰'], ['巳', '丑'], ['寅', '戌'], ['亥', '未']];
// 半會(三會方局任兩支)
const BAN_HUI = [
  ['寅', '卯'], ['卯', '辰'], ['寅', '辰'], // 三會木方(寅卯辰)
  ['巳', '午'], ['午', '未'], ['巳', '未'], // 三會火方(巳午未)
  ['申', '酉'], ['酉', '戌'], ['申', '戌'], // 三會金方(申酉戌)
  ['亥', '子'], ['子', '丑'], ['亥', '丑'], // 三會水方(亥子丑)
];

// 月令司令分野(人元用事):節入後第 N 天由哪個藏干司令
const MONTH_COMMANDER = {
  寅: [['戊', 7], ['丙', 7], ['甲', 16]],
  卯: [['甲', 10], ['乙', 20]],
  辰: [['乙', 9], ['癸', 3], ['戊', 18]],
  巳: [['戊', 5], ['庚', 9], ['丙', 16]],
  午: [['丙', 10], ['己', 9], ['丁', 11]],
  未: [['丁', 9], ['乙', 3], ['己', 18]],
  申: [['戊', 7], ['壬', 7], ['庚', 16]],
  酉: [['庚', 10], ['辛', 20]],
  戌: [['辛', 9], ['丁', 3], ['戊', 18]],
  亥: [['戊', 7], ['甲', 5], ['壬', 18]],
  子: [['壬', 10], ['癸', 20]],
  丑: [['癸', 9], ['辛', 3], ['己', 18]],
};

// ---------------------------------------------------------------------------
// 十八神煞查表邏輯(除既有 12 運神煞外的 16 種,均以「日干/年支/月支/日柱」為錨點查表)
// ---------------------------------------------------------------------------

// 以日干為錨點 → 目標地支(可能不只一個),四柱地支逐一比對
const DAY_STEM_TARGET_BRANCH = {
  天乙貴人: {
    甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
    乙: ['子', '申'], 己: ['子', '申'],
    丙: ['亥', '酉'], 丁: ['亥', '酉'],
    壬: ['卯', '巳'], 癸: ['卯', '巳'],
    辛: ['寅', '午'],
  },
  太極貴人: {
    甲: ['子', '午'], 乙: ['子', '午'],
    丙: ['卯', '酉'], 丁: ['卯', '酉'],
    戊: ['辰', '戌', '丑', '未'], 己: ['辰', '戌', '丑', '未'],
    庚: ['寅', '亥'], 辛: ['寅', '亥'],
    壬: ['巳', '申'], 癸: ['巳', '申'],
  },
  文昌貴人: { 甲: ['巳'], 乙: ['午'], 丙: ['申'], 丁: ['酉'], 戊: ['申'], 己: ['酉'], 庚: ['亥'], 辛: ['子'], 壬: ['寅'], 癸: ['卯'] },
  天廚貴人: { 甲: ['巳'], 乙: ['午'], 丙: ['巳'], 丁: ['午'], 戊: ['申'], 己: ['酉'], 庚: ['亥'], 辛: ['子'], 壬: ['寅'], 癸: ['卯'] },
  學堂: { 甲: ['亥'], 乙: ['午'], 丙: ['寅'], 丁: ['酉'], 戊: ['寅'], 己: ['酉'], 庚: ['巳'], 辛: ['子'], 壬: ['申'], 癸: ['卯'] },
  紅艷煞: { 甲: ['午'], 乙: ['申'], 丙: ['寅'], 丁: ['未'], 戊: ['辰'], 己: ['辰'], 庚: ['戌'], 辛: ['酉'], 壬: ['子'], 癸: ['申'] },
  國印貴人: { 甲: ['戌'], 乙: ['亥'], 丙: ['丑'], 丁: ['寅'], 戊: ['丑'], 己: ['寅'], 庚: ['辰'], 辛: ['巳'], 壬: ['未'], 癸: ['申'] },
  福星貴人: {
    甲: ['寅', '子'], 丙: ['寅', '子'],
    乙: ['卯', '丑'], 癸: ['卯', '丑'],
    丁: ['亥'], 戊: ['申'], 己: ['未'], 庚: ['午'], 辛: ['巳'], 壬: ['辰'],
  },
};

// 以月支為錨點 → 目標(可能是天干或地支),四柱天干或地支逐一比對
const MONTH_BRANCH_TARGET = {
  月德貴人: {
    寅: { type: 'stem', value: '丙' }, 午: { type: 'stem', value: '丙' }, 戌: { type: 'stem', value: '丙' },
    申: { type: 'stem', value: '壬' }, 子: { type: 'stem', value: '壬' }, 辰: { type: 'stem', value: '壬' },
    亥: { type: 'stem', value: '甲' }, 卯: { type: 'stem', value: '甲' }, 未: { type: 'stem', value: '甲' },
    巳: { type: 'stem', value: '庚' }, 酉: { type: 'stem', value: '庚' }, 丑: { type: 'stem', value: '庚' },
  },
  天德貴人: {
    寅: { type: 'stem', value: '丁' }, 卯: { type: 'branch', value: '申' }, 辰: { type: 'stem', value: '壬' },
    巳: { type: 'stem', value: '辛' }, 午: { type: 'branch', value: '亥' }, 未: { type: 'stem', value: '甲' },
    申: { type: 'stem', value: '癸' }, 酉: { type: 'branch', value: '寅' }, 戌: { type: 'stem', value: '丙' },
    亥: { type: 'stem', value: '乙' }, 子: { type: 'branch', value: '巳' }, 丑: { type: 'stem', value: '庚' },
  },
  天德合: {
    寅: { type: 'stem', value: '壬' }, 卯: { type: 'branch', value: '巳' }, 辰: { type: 'stem', value: '丁' },
    巳: { type: 'stem', value: '丙' }, 午: { type: 'branch', value: '寅' }, 未: { type: 'stem', value: '己' },
    申: { type: 'stem', value: '戊' }, 酉: { type: 'branch', value: '亥' }, 戌: { type: 'stem', value: '辛' },
    亥: { type: 'stem', value: '庚' }, 子: { type: 'branch', value: '申' }, 丑: { type: 'stem', value: '乙' },
  },
};

// 以年支為錨點(年支所屬三合組)→ 孤辰目標地支
const GU_CHEN_GROUP = [
  { group: ['亥', '子', '丑'], target: '寅' },
  { group: ['寅', '卯', '辰'], target: '巳' },
  { group: ['巳', '午', '未'], target: '申' },
  { group: ['申', '酉', '戌'], target: '亥' },
];
// 喪門:年支順行第 2 位
const SANG_MEN = { 子: '寅', 丑: '卯', 寅: '辰', 卯: '巳', 辰: '午', 巳: '未', 午: '申', 未: '酉', 申: '戌', 酉: '亥', 戌: '子', 亥: '丑' };
// 元辰
const YUAN_CHEN = { 子: '未', 丑: '午', 寅: '酉', 卯: '申', 辰: '亥', 巳: '戌', 午: '丑', 未: '子', 申: '卯', 酉: '寅', 戌: '巳', 亥: '辰' };
// 十靈日(固定日柱干支組合)
const SHI_LING_DAYS = ['甲辰', '乙亥', '丙辰', '丁酉', '戊午', '庚寅', '庚戌', '辛亥', '壬寅', '癸未'];

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
 * 計算完整十八神煞:回傳每柱出現的所有神煞名稱陣列(含既有 12 運神煞)
 * @param {{yearPillar:{stem,branch}, monthPillar:{stem,branch}, dayPillar:{stem,branch}, hourPillar:{stem,branch}}} pillars
 * @param {{yearPillar:string, monthPillar:string, dayPillar:string, hourPillar:string}} cycleShensha 既有12運神煞
 */
function computeShenShaList(pillars, cycleShensha) {
  const keys = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];
  const list = { yearPillar: [], monthPillar: [], dayPillar: [], hourPillar: [] };

  // 1. 併入既有 12 運神煞(劫煞/災煞/.../將星/.../華蓋)
  for (const k of keys) list[k].push(cycleShensha[k]);

  const dayStem = pillars.dayPillar.stem;
  const monthBranch = pillars.monthPillar.branch;
  const yearBranch = pillars.yearPillar.branch;

  // 2. 以日干為錨點的貴人/煞星(四柱地支逐一比對,含日柱本身地支)
  for (const [name, table] of Object.entries(DAY_STEM_TARGET_BRANCH)) {
    const targets = table[dayStem];
    if (!targets) continue;
    for (const k of keys) {
      if (targets.includes(pillars[k].branch)) list[k].push(name);
    }
  }

  // 3. 以月支為錨點的貴人(四柱天干或地支逐一比對)
  for (const [name, table] of Object.entries(MONTH_BRANCH_TARGET)) {
    const target = table[monthBranch];
    if (!target) continue;
    for (const k of keys) {
      const hit = target.type === 'stem' ? pillars[k].stem === target.value : pillars[k].branch === target.value;
      if (hit) list[k].push(name);
    }
  }

  // 4. 以年支為錨點的煞星(孤辰/喪門/元辰),檢查其餘三柱地支(排除年柱自身)
  const guChen = GU_CHEN_GROUP.find((g) => g.group.includes(yearBranch))?.target;
  const sangMen = SANG_MEN[yearBranch];
  const yuanChen = YUAN_CHEN[yearBranch];
  for (const k of keys) {
    if (k === 'yearPillar') continue;
    const b = pillars[k].branch;
    if (guChen && b === guChen) list[k].push('孤辰');
    if (sangMen && b === sangMen) list[k].push('喪門');
    if (yuanChen && b === yuanChen) list[k].push('元辰');
  }

  // 5. 十靈日(固定日柱干支組合,僅日柱可能命中)
  if (SHI_LING_DAYS.includes(pillars.dayPillar.stem + pillars.dayPillar.branch)) {
    list.dayPillar.push('十靈');
  }

  return list;
}

/** 空亡(旬空):以年柱/日柱各自的旬空地支,檢查其餘三柱地支是否落空 */
function computeVoidHits(pillars, voidBranches) {
  const keys = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];
  const hits = { yearPillar: false, monthPillar: false, dayPillar: false, hourPillar: false };
  const yearVoid = voidBranches.year ? [...voidBranches.year] : [];
  const dayVoid = voidBranches.day ? [...voidBranches.day] : [];
  for (const k of keys) {
    const b = pillars[k].branch;
    if ((k !== 'yearPillar' && yearVoid.includes(b)) || (k !== 'dayPillar' && dayVoid.includes(b))) {
      hits[k] = true;
    }
  }
  return hits;
}

/** 地支關係總表:六合/害/沖/刑 + 相破/暗合/半合/拱/半會,回傳每組關係(含合併多重關係) */
function computeBranchRelations(branches) {
  const keys = ['yearBranch', 'monthBranch', 'dayBranch', 'hourBranch'];
  const tables = [
    [LIU_HE, '六合'], [LIU_HAI, '害'], [LIU_CHONG, '沖'], [XING, '刑'],
    [XIANG_PO, '相破'], [AN_HE, '暗合'], [BAN_HE, '半合'], [GONG, '拱'], [BAN_HUI, '半會'],
  ];
  const raw = [];
  for (const a of keys) {
    for (const b of keys) {
      if (a === b) continue;
      for (const [table, relation] of tables) {
        if (table.some(([x, y]) =>
          (x === branches[a] && y === branches[b]) || (y === branches[a] && x === branches[b]))) {
          const pairArr = [branches[a], branches[b]].sort((x, y) => BRANCHES.indexOf(x) - BRANCHES.indexOf(y));
          raw.push({ branch: a, relation, with: b, pair: pairArr.join('') });
        }
      }
    }
  }
  return raw;
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

  // --- 神煞(既有12運):年柱以日支起,其餘各柱以年支起 ---
  const shensha = {
    yearPillar: shenShaOf(branches.dayBranch, branches.yearBranch),
    monthPillar: shenShaOf(branches.yearBranch, branches.monthBranch),
    dayPillar: shenShaOf(branches.yearBranch, branches.dayBranch),
    hourPillar: shenShaOf(branches.yearBranch, branches.hourBranch),
  };

  const fourPillars = {
    yearPillar: pillar(ec.getYear()),
    monthPillar: pillar(ec.getMonth()),
    dayPillar: pillar(ec.getDay()),
    hourPillar: pillar(ec.getTime()),
  };

  // --- 完整十八神煞(每柱可能多個) ---
  const shenshaList = computeShenShaList(fourPillars, shensha);

  const voidBranches = { year: ec.getYearXunKong(), day: ec.getDayXunKong() };
  const voidHits = computeVoidHits(fourPillars, voidBranches);
  const voidKeyToName = { yearPillar: '年', monthPillar: '月', dayPillar: '日', hourPillar: '時' };
  for (const k of Object.keys(voidHits)) {
    if (voidHits[k]) shenshaList[k].push('空亡');
  }

  // --- 地支關係(六合/害/沖/刑 + 相破/暗合/半合/拱/半會) ---
  const branchRelations = computeBranchRelations(branches);

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
    fourPillars,
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
    shenshaList,
    branchRelations,
    fiveElementDistribution: dist,
    coreValues: {
      voidBranches,
      monthCommander: commanderOf(solar.getLunar(), solar, branches.monthBranch, ec.getMonthHideGan()[0]),
      greatLuckStartAge: daYun[0] ? daYun[0].getStartYear() - year : null,
    },
    annualPillars,
    monthlyPillars,
    greatLuckCycles,
  };
}

/** 月令司令:依節入天數查分野表,失敗時退回月支本氣 */
function commanderOf(lunar, solar, monthBranch, fallback) {
  try {
    const jie = lunar.getPrevJie(true).getSolar();
    const d0 = Date.UTC(jie.getYear(), jie.getMonth() - 1, jie.getDay());
    const d1 = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay());
    let day = Math.floor((d1 - d0) / 86400000) + 1;
    for (const [gan, span] of MONTH_COMMANDER[monthBranch]) {
      if (day <= span) return gan;
      day -= span;
    }
    return MONTH_COMMANDER[monthBranch].at(-1)[0];
  } catch {
    return fallback;
  }
}

// 傳統術數互動工具：易經、梅花易數、時家奇門結構盤。
// 所有函式均為純計算；解讀只提供文化研究與自我反思，不替代專業決策。

export const TRIGRAMS = [
  { n: 1, name: '乾', nature: '天', binary: '111', element: '金', image: '健行、主動、創造' },
  { n: 2, name: '兌', nature: '澤', binary: '110', element: '金', image: '交流、喜悅、口舌' },
  { n: 3, name: '離', nature: '火', binary: '101', element: '火', image: '看見、依附、文明' },
  { n: 4, name: '震', nature: '雷', binary: '100', element: '木', image: '啟動、震動、突破' },
  { n: 5, name: '巽', nature: '風', binary: '011', element: '木', image: '滲透、調整、溝通' },
  { n: 6, name: '坎', nature: '水', binary: '010', element: '水', image: '風險、深度、考驗' },
  { n: 7, name: '艮', nature: '山', binary: '001', element: '土', image: '停止、界線、沉澱' },
  { n: 8, name: '坤', nature: '地', binary: '000', element: '土', image: '承載、配合、滋養' },
];

// 依上卦乾兌離震巽坎艮坤、下卦同序排列。
const HEXAGRAM_NAMES = [
  ['乾為天','澤天夬','火天大有','雷天大壯','風天小畜','水天需','山天大畜','地天泰'],
  ['天澤履','兌為澤','火澤睽','雷澤歸妹','風澤中孚','水澤節','山澤損','地澤臨'],
  ['天火同人','澤火革','離為火','雷火豐','風火家人','水火既濟','山火賁','地火明夷'],
  ['天雷无妄','澤雷隨','火雷噬嗑','震為雷','風雷益','水雷屯','山雷頤','地雷復'],
  ['天風姤','澤風大過','火風鼎','雷風恆','巽為風','水風井','山風蠱','地風升'],
  ['天水訟','澤水困','火水未濟','雷水解','風水渙','坎為水','山水蒙','地水師'],
  ['天山遯','澤山咸','火山旅','雷山小過','風山漸','水山蹇','艮為山','地山謙'],
  ['天地否','澤地萃','火地晉','雷地豫','風地觀','水地比','山地剝','坤為地'],
];

const tri = (n) => TRIGRAMS[((Number(n) - 1) % 8 + 8) % 8];
export function hexagram(upperNo, lowerNo, movingLine = 1) {
  const upper = tri(upperNo); const lower = tri(lowerNo);
  const lines = (lower.binary + upper.binary).split(''); // 初爻在 index 0
  const changed = [...lines];
  changed[(Number(movingLine) - 1) % 6] = changed[(Number(movingLine) - 1) % 6] === '1' ? '0' : '1';
  const lowerChanged = TRIGRAMS.find((t) => t.binary === changed.slice(0, 3).join(''));
  const upperChanged = TRIGRAMS.find((t) => t.binary === changed.slice(3).join(''));
  return {
    name: HEXAGRAM_NAMES[lower.n - 1][upper.n - 1], upper, lower,
    movingLine: Number(movingLine), lines,
    changedName: HEXAGRAM_NAMES[lowerChanged.n - 1][upperChanged.n - 1],
    changedUpper: upperChanged, changedLower: lowerChanged,
  };
}

export function castThreeCoins(random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) {
  const values = Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => random() >= .5 ? 3 : 2).reduce((a, b) => a + b));
  const bits = values.map((v) => (v === 7 || v === 9) ? '1' : '0');
  const moving = values.map((v, i) => (v === 6 || v === 9) ? i + 1 : null).filter(Boolean);
  const lower = TRIGRAMS.find((t) => t.binary === bits.slice(0, 3).join(''));
  const upper = TRIGRAMS.find((t) => t.binary === bits.slice(3).join(''));
  const changed = bits.map((b, i) => moving.includes(i + 1) ? (b === '1' ? '0' : '1') : b);
  const cl = TRIGRAMS.find((t) => t.binary === changed.slice(0, 3).join(''));
  const cu = TRIGRAMS.find((t) => t.binary === changed.slice(3).join(''));
  return { values, moving, lines: bits, upper, lower, name: HEXAGRAM_NAMES[lower.n - 1][upper.n - 1], changedName: HEXAGRAM_NAMES[cl.n - 1][cu.n - 1], changedUpper: cu, changedLower: cl };
}

export function plumBlossom(date, seed = 0) {
  const d = new Date(date);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), hour = d.getHours();
  const upperNo = ((y + m + day + Number(seed)) % 8) || 8;
  const lowerNo = ((y + m + day + hour + Number(seed)) % 8) || 8;
  const moving = ((y + m + day + hour + Number(seed)) % 6) || 6;
  return { ...hexagram(upperNo, lowerNo, moving), formula: `${y}+${m}+${day}+${hour}${seed ? `+${seed}` : ''}` };
}

// 五行生剋(生:木火土金水循環;剋:隔一位)
const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const OVERCOMES = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/**
 * 梅花易數體用生剋斷卦:動爻所在的卦為「用」,沒有動爻的卦為「體」。
 * 判斷依傳統口訣:體克用諸事吉、用克體諸事凶、用生體進益之喜、體生用損耗、比和百事順。
 * 這裡把吉凶口訣改寫為傾向描述,避免宿命式斷言。
 */
export function tiYongAnalysis(result) {
  const useIsUpper = result.movingLine >= 4;
  const ti = useIsUpper ? result.lower : result.upper; // 體:不含動爻
  const yong = useIsUpper ? result.upper : result.lower; // 用:含動爻
  let relation, tendency;
  if (ti.element === yong.element) { relation = '比和'; tendency = '體用五行相同,情勢與自身狀態同步,傾向平穩,結果較取決於你自己的應對。'; }
  else if (GENERATES[ti.element] === yong.element) { relation = '體生用'; tendency = '體卦在滋養用卦,傾向於付出、消耗精力或資源換取進展,需留意是否持續耗損。'; }
  else if (GENERATES[yong.element] === ti.element) { relation = '用生體'; tendency = '用卦在滋養體卦,傾向於外在情勢對你有助力,較容易得到支持或進益。'; }
  else if (OVERCOMES[ti.element] === yong.element) { relation = '體剋用'; tendency = '體卦克制用卦,傾向於你較能主導局面,但仍需留意是否只是暫時壓制而非真正化解。'; }
  else { relation = '用剋體'; tendency = '用卦克制體卦,傾向於外在情勢對你較不利或受牽制,適合先觀察、少躁進。'; }
  return { ti, yong, relation, tendency };
}

const DOORS = ['休門','生門','傷門','杜門','景門','死門','驚門','開門'];
const STARS = ['天蓬','天任','天沖','天輔','天英','天芮','天柱','天心','天禽'];
const DEITIES = ['值符','螣蛇','太陰','六合','白虎','玄武','九地','九天'];
const PALACES = [1,8,3,4,9,2,7,6,5];

// 二十四節氣三元用局表(傳統拆補法「奇門陽遁/陰遁歌」),索引 0-23 對應下列 JIEQI_T 順序。
// 來源:奇門陽遁歌「冬至驚蟄一七四,小寒二八五依次,大寒春分三九六,立春八五二成局,
// 雨水九六三無失,清明立夏四一七,穀雨小滿五二八,芒種六三九為法」;
// 奇門陰遁歌「夏至白露九三六,小暑八二五陰局,大暑秋分七一四,立秋二五八宮次,
// 處暑一四七為是,霜降小雪五八二,寒露立冬六九三,大雪四七一宮識」。每項為 [上元,中元,下元]。
const JIEQI_T = ['冬至','小寒','大寒','立春','雨水','驚蟄','春分','清明','穀雨','立夏','小滿','芒種','夏至','小暑','大暑','立秋','處暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
const JIEQI_S = ['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
const JU_TABLE = [
  [1,7,4],[2,8,5],[3,9,6],[8,5,2],[9,6,3],[1,7,4],[3,9,6],[4,1,7],[5,2,8],[4,1,7],[5,2,8],[6,3,9],
  [9,3,6],[8,2,5],[7,1,4],[2,5,8],[1,4,7],[9,3,6],[7,1,4],[6,9,3],[5,8,2],[6,9,3],[5,8,2],[4,7,1],
];
const YUAN_BY_BRANCH = { 子:0, 午:0, 卯:0, 酉:0, 寅:1, 申:1, 巳:1, 亥:1, 辰:2, 戌:2, 丑:2, 未:2 };
const YI_QI = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
// 六甲遁于六儀:六十甲子每十日一旬,旬首固定對應下列六儀(與局數、日期無關的固定關係)。
const XUN_YI = { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' };
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

function termIndexOf(name) {
  let i = JIEQI_T.indexOf(name);
  if (i < 0) i = JIEQI_S.indexOf(name);
  return i;
}

function jiaziIndex(stem, branch) {
  const si = GAN.indexOf(stem), bi = ZHI.indexOf(branch);
  if (si < 0 || bi < 0) return -1;
  for (let idx = 0; idx < 60; idx++) if (idx % 10 === si && idx % 12 === bi) return idx;
  return -1;
}

/**
 * 定局:依節氣決定陰陽遁,依符頭(往前找最近的甲日或己日)決定上/中/下元,查傳統用局表得局數。
 * 這是「拆補法」——最通行的簡化定局法,不含置閏法的超神接氣曆法校正,不同門派可能算出不同局數。
 */
export function determineJu(date, { Solar }) {
  const base = new Date(date);
  const lunar = Solar.fromDate(base).getLunar();
  const prevJieQi = lunar.getPrevJieQi ? lunar.getPrevJieQi(true) : null;
  const termIdx = prevJieQi ? termIndexOf(prevJieQi.getName()) : -1;
  const safeIdx = termIdx >= 0 ? termIdx : 0;
  let fuTouGan = null, fuTouZhi = null;
  for (let i = 0; i < 10; i++) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const l = Solar.fromDate(d).getLunar();
    const gan = l.getDayGan();
    if (gan === '甲' || gan === '己') { fuTouGan = gan; fuTouZhi = l.getDayZhi(); break; }
  }
  const yuanIdx = fuTouZhi != null ? (YUAN_BY_BRANCH[fuTouZhi] ?? 0) : 0;
  const bureau = JU_TABLE[safeIdx][yuanIdx];
  const yang = safeIdx < 12;
  return {
    bureau, yang,
    termName: JIEQI_T[safeIdx],
    yuanName: ['上元', '中元', '下元'][yuanIdx],
    fuTou: fuTouGan ? `${fuTouGan}${fuTouZhi}` : null,
  };
}

/** 地盤三奇六儀:以局數為起點,陽遁順飛、陰遁逆飛九宮(洛書 1-9 序),遇 5 寄坤 2 宮。回傳 { 宮位: 儀/奇 } */
export function placeYiQi(bureau, yang) {
  const dir = yang ? 1 : -1;
  const at = {};
  for (let k = 0; k < 9; k++) {
    let p = ((bureau - 1) + k * dir) % 9;
    p = ((p % 9) + 9) % 9 + 1;
    const shown = p === 5 ? 2 : p;
    at[shown] = at[shown] ? `${at[shown]}・${YI_QI[k]}` : YI_QI[k];
  }
  return at;
}

/**
 * 值符值使:找出時干支所屬的「旬」,查旬首對應的儀,再看該儀落在地盤哪一宮——
 * 該宮在「後天八卦本宮」上對應的星即為值符,對應的門即為值使。
 * 此為單點定位,尚未展開成完整依值符旋轉的天盤/八神。
 */
export function findZhiFuShi(hourStem, hourBranch, yiQiAt) {
  const idx = jiaziIndex(hourStem, hourBranch);
  if (idx < 0) return null;
  const xunHeadIdx = Math.floor(idx / 10) * 10;
  const xunHeadName = `${GAN[xunHeadIdx % 10]}${ZHI[xunHeadIdx % 12]}`;
  const yi = XUN_YI[xunHeadName] ?? '戊';
  let atPalace = null;
  for (const [p, v] of Object.entries(yiQiAt)) if (v.split('・').includes(yi)) atPalace = Number(p);
  if (!atPalace) return null;
  const baseIdx = PALACES.indexOf(atPalace);
  return { xunHeadName, yi, palace: atPalace, star: STARS[baseIdx] ?? '天禽', door: atPalace === 5 ? '（寄二宮,無門)' : DOORS[baseIdx] ?? '死門' };
}

// 教學型結構盤:後天八卦本宮配九星/八門/八神(固定參考位置),搭配即時定局的地盤三奇六儀與值符值使。
// 九星/八門/八神顯示的是後天八卦本宮對照表,尚未加入依時干飛泊的完整天盤旋轉,不適合用作專業奇門斷局。
export function qimenStructure(date, { convertToBaZi, Solar, gender = '女' } = {}) {
  const ju = determineJu(date, { Solar });
  const yiQiAt = placeYiQi(ju.bureau, ju.yang);
  const d = new Date(date);
  let zhiFuShi = null;
  if (convertToBaZi) {
    const bz = convertToBaZi({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), gender });
    const hp = bz.fourPillars.hourPillar;
    zhiFuShi = findZhiFuShi(hp.stem, hp.branch, yiQiAt);
  }
  return {
    dun: ju.yang ? '陽遁' : '陰遁', bureau: ju.bureau, solarTerm: ju.termName, yuanName: ju.yuanName, fuTou: ju.fuTou,
    zhiFuShi,
    palaces: PALACES.map((palace, i) => ({
      palace, door: palace === 5 ? '（寄二宮)' : DOORS[i], star: STARS[i], deity: palace === 5 ? '—' : DEITIES[i],
      yiqi: yiQiAt[palace] || '',
    })),
  };
}

export function lineDiagram(lines, moving = []) {
  return [...lines].reverse().map((bit, reverseIndex) => {
    const lineNo = 6 - reverseIndex;
    return { lineNo, yang: bit === '1', moving: moving.includes(lineNo) };
  });
}

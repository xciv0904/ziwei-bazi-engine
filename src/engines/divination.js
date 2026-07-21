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

const DOORS = ['休門','生門','傷門','杜門','景門','死門','驚門','開門'];
const STARS = ['天蓬','天任','天沖','天輔','天英','天芮','天柱','天心','天禽'];
const DEITIES = ['值符','螣蛇','太陰','六合','白虎','玄武','九地','九天'];
const PALACES = [1,8,3,4,9,2,7,6,5];

// 教學型結構盤：用節氣陰陽遁與日期序數建立可重現的九宮映射。
// 完整門派盤仍需加入符頭、旬首、拆補/置閏與天盤干飛布，UI 會清楚揭露限制。
export function qimenStructure(date, solarTerm = '') {
  const d = new Date(date);
  const summer = ['夏至','小暑','大暑','立秋','處暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
  const yin = summer.includes(solarTerm);
  const epoch = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const bureau = Math.abs(epoch % 9) + 1;
  const dir = yin ? -1 : 1;
  const rotate = (arr, i) => arr[((i * dir + bureau - 1) % arr.length + arr.length) % arr.length];
  return {
    dun: yin ? '陰遁' : '陽遁', bureau, solarTerm: solarTerm || '未指定節氣',
    palaces: PALACES.map((palace, i) => ({ palace, door: palace === 5 ? '中宮' : rotate(DOORS, i), star: rotate(STARS, i), deity: palace === 5 ? '—' : rotate(DEITIES, i) })),
  };
}

export function lineDiagram(lines, moving = []) {
  return [...lines].reverse().map((bit, reverseIndex) => {
    const lineNo = 6 - reverseIndex;
    return { lineNo, yang: bit === '1', moving: moving.includes(lineNo) };
  });
}

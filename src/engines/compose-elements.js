// src/engines/compose-elements.js — 五行分佈整體分析
// 組裝邏輯(照 five-element-analysis.json):
//   算出五行數量 → 依旺缺門檻分類 → 套五行基本特質 → 用平衡建議模板組成總結句
import db from '../data/five-element-analysis.json' with { type: 'json' };

const TRAITS = db['五行基本特質'];
const LEVELS = db['旺缺判斷邏輯'];

const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

// 模板需要的短關鍵字(由五行基本特質濃縮,供 {特質關鍵字} 與 {相關領域} 插槽使用)
const ELEMENT_KEYWORDS = {
  木: { trait: '有理想抱負、行動力強', domain: '成長行動力' },
  火: { trait: '直率熱情、善於表現', domain: '熱情表達' },
  土: { trait: '穩定可靠、重視誠信', domain: '穩重承擔' },
  金: { trait: '剛毅果斷、講求效率', domain: '決斷原則' },
  水: { trait: '智慧靈活、善於應變與人際手腕圓融', domain: '智慧應變' },
};

function levelOf(count) {
  if (count >= 4) return '過旺';
  if (count >= 2) return '適中';
  return '偏弱';
}

/**
 * @param {object} distribution  baZi.fiveElementDistribution({wood,fire,...})
 * @returns {{ classification, dominant, weak, summary, text }}
 */
export function composeElementAnalysis(distribution) {
  const counts = Object.entries(distribution)
    .map(([key, count]) => ({ element: ELEMENT_NAME[key], count }));

  // 分類 + 各元素解讀
  const classification = {};
  for (const { element, count } of counts) {
    const level = levelOf(count);
    classification[element] = {
      count,
      level,
      trait: TRAITS[element],
      levelNote: LEVELS[level]['解讀'],
    };
  }

  // 「偏多」:過旺元素;若無過旺,取數量最高者(如範例:水 3 顆視為最鮮明元素)
  let dominant = counts.filter((c) => c.count >= 4).map((c) => c.element);
  if (dominant.length === 0) {
    const max = Math.max(...counts.map((c) => c.count));
    dominant = counts.filter((c) => c.count === max).map((c) => c.element);
  }
  const weak = counts.filter((c) => c.count <= 1).map((c) => c.element);

  // 套用整體平衡建議模板
  const summary =
    `從五行分佈來看,命局中${dominant.join('、')}偏多,` +
    `${weak.join('、')}相對偏少,` +
    `整體來說個性上會比較偏向${dominant.map((e) => ELEMENT_KEYWORDS[e].trait).join(';')},` +
    `在${weak.map((e) => `${ELEMENT_KEYWORDS[e].domain}(${e})`).join('、')}的部分,` +
    `可以透過後天培養來補強、達到更好的平衡。`;

  const detailLines = counts.map(({ element, count }) => {
    const c = classification[element];
    return `${element}(${count}):${c.level}——${c.levelNote}`;
  });

  return {
    classification,
    dominant,
    weak,
    summary,
    text: [summary, '', ...detailLines].join('\n'),
  };
}

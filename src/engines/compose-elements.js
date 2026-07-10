// src/engines/compose-elements.js — 五行分佈整體分析
// 組裝邏輯(照 five-element-analysis.json 修正版):
//   算出五行數量 → 依旺缺門檻分類 → 每個五行套用「五行狀態描述」裡對應狀態的專屬文字(不是通用模板套名字)
//   → 用整體平衡建議模板組成開頭總結句 → 只有過旺/偏弱的五行才輸出說明句,適中的簡短帶過
import db from '../data/five-element-analysis.json' with { type: 'json' };

const TRAITS = db['五行基本特質'];
const STATE_DESC = db['五行狀態描述'];

const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };

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

  // 分類 + 各元素專屬解讀(每個五行的過旺/適中/偏弱都是各自獨立的文字,不共用通用模板)
  const classification = {};
  for (const { element, count } of counts) {
    const level = levelOf(count);
    classification[element] = {
      count,
      level,
      trait: TRAITS[element],
      levelNote: STATE_DESC[element][level],
    };
  }

  // 「偏多」:過旺元素;若無過旺,取數量最高者(如範例:水 3 顆視為最鮮明元素)
  let dominant = counts.filter((c) => c.count >= 4).map((c) => c.element);
  if (dominant.length === 0) {
    const max = Math.max(...counts.map((c) => c.count));
    dominant = counts.filter((c) => c.count === max).map((c) => c.element);
  }
  const weak = counts.filter((c) => c.count <= 1).map((c) => c.element);

  // 開頭總結句(短句,不再塞入通用的「特質關鍵字/相關領域」清單,避免跟下面的專屬描述重複)
  const opener =
    `從五行分佈來看,命局中${dominant.join('、')}偏多,` +
    `${weak.join('、')}相對偏少。`;

  // 過旺/偏弱的五行各自接一句專屬描述;適中的不展開,避免報告冗長重複。
  // 注意:dominant 可能是「真的過旺(數量4+)」,也可能是「沒有元素達到過旺門檻時,
  // 退回取數量最高者」(例如水3顆,數量上屬適中,但敘事上仍視為此命局最鮮明的元素)。
  // 不論哪一種情況,只要被列進 dominant,narrative 都要用「過旺」的專屬描述(而非該元素
  // 實際數量對應的「適中」描述),否則會出現「標示偏多、內文卻寫著適中文字」的矛盾。
  const dominantSet = new Set(dominant);
  const highlightLines = [...dominant, ...weak]
    .filter((el, idx, arr) => arr.indexOf(el) === idx) // 去重(理論上 dominant/weak 不會重疊,保險起見)
    .map((el) => {
      const isDominant = dominantSet.has(el);
      const label = isDominant ? '偏多' : '偏弱';
      const descLevel = isDominant ? '過旺' : '偏弱';
      return `${el}${label}的部分,${STATE_DESC[el][descLevel]}`;
    });

  const summary = [opener, ...highlightLines].join('');

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

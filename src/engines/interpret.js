// src/engines/interpret.js — 解讀引擎
// 輸入:某宮位 + 主星 + 四化(convertToZiWei 的輸出),輸出:白話解讀
// 分層:宮位主題 → 星曜基本義 → 四化 → 組合規則(空宮自動借對宮)
import { lookupStar } from '../data/star-meanings.js';
import { palaceMeanings } from '../data/palace-meanings.js';
import { lookupTransformation } from '../data/transformation-meanings.js';
import { combinationRules } from '../data/combination-rules.js';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const oppositeBranch = (b) => BRANCHES[(BRANCHES.indexOf(b) + 6) % 12];
const branchOf = (palace) => palace.position[1]; // position 形如「癸卯」

/** 規則比對:palace 名稱、主星集合、四化 */
function matchRules(palaceName, starNames, transformations) {
  return combinationRules.filter(({ condition }) => {
    if (condition.palace && condition.palace !== palaceName) return false;
    if (condition.stars.length === 0) return starNames.length === 0; // 空宮規則
    if (!condition.stars.every((s) => starNames.includes(s))) return false;
    if (condition.transformations
      && !condition.transformations.every((x) => transformations.includes(x))) return false;
    return true;
  }).map((r) => r.interpretation);
}

/**
 * 解讀單一宮位
 * @param {object} palace          ziWei.palaces 的元素
 * @param {object} [opposite]      對宮(空宮借星用,可不傳)
 * @returns {{ palaceName, position, isBodyPalace, borrowed, segments, text }}
 */
export function interpretPalace(palace, opposite = null) {
  const { name } = palace;
  const segments = [];

  // 1. 宮位主題
  segments.push({ type: 'palace', text: `${name}:${palaceMeanings[name] ?? ''}` });

  // 2. 主星(空宮 → 借對宮)
  let stars = palace.majorStars;
  let borrowed = false;
  if (stars.length === 0 && opposite?.majorStars.length) {
    stars = opposite.majorStars;
    borrowed = true;
    segments.push({ type: 'note', text: `本宮無主星,借對宮(${opposite.name})星曜參看。` });
  }

  const starNames = stars.map((s) => s.name);
  const transformations = stars.map((s) => s.transformation).filter(Boolean);

  // 3. 星曜基本義 + 四化
  for (const star of stars) {
    const m = lookupStar(star.name);
    if (!m) continue;
    let text = `${star.name}${borrowed ? '(借)' : ''}:${m.core}(關鍵詞:${m.keywords.join('、')})`;
    const trans = lookupTransformation(star.transformation);
    if (trans) text += `;化${star.transformation}——${trans}`;
    segments.push({ type: 'star', text });
  }

  // 4. 組合規則(空宮以本宮原始主星比對,借星不觸發組合規則)
  const hits = matchRules(
    name,
    palace.majorStars.map((s) => s.name),
    palace.majorStars.map((s) => s.transformation).filter(Boolean),
  );
  for (const h of hits) segments.push({ type: 'combination', text: h });

  return {
    palaceName: name,
    position: palace.position,
    isBodyPalace: Boolean(palace.isBodyPalace),
    borrowed,
    segments,
    text: segments.map((s) => s.text).join('\n'),
  };
}

/**
 * 解讀整張紫微盤
 * @param {object} ziWei  convertToZiWei() 的輸出
 * @returns {{ overview: string, palaces: Array }}
 */
export function interpretChart(ziWei) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const results = ziWei.palaces.map((p) =>
    interpretPalace(p, byBranch[oppositeBranch(branchOf(p))]));

  const overview = [
    `五行局:${ziWei.fiveElementBureau},命宮在${ziWei.lifePalace}、身宮在${ziWei.bodyPalace}(${ziWei.bodyPalaceName})。`,
    `命主${ziWei.lifeMaster}、身主${ziWei.bodyMaster}:先天以「${ziWei.lifeMaster}」的特質為底,後天修為則看「${ziWei.bodyMaster}」的課題。`,
  ].join('\n');

  return { overview, palaces: results };
}

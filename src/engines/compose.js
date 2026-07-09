// src/engines/compose.js — 解讀組裝引擎
// 流程:抓某宮位主星 → 查 palace-star-meanings 表 → 疊加四化 → 疊加亮度 → 拼成完整解讀
// (與塔羅牌意組合引擎同一套思路:基底牌意 × 位置情境 × 修飾層)
import db from '../data/palace-star-meanings.json' with { type: 'json' };
import doubleStarDb from '../data/double-star-combinations.json' with { type: 'json' };

const DOUBLE_STAR_COMBOS = doubleStarDb['雙主星組合'];

/** 查雙主星組合補充句(兩種順序都試) */
function lookupCombo(starNames) {
  if (starNames.length !== 2) return null;
  const [a, b] = starNames;
  return DOUBLE_STAR_COMBOS[`${a}+${b}`] ?? DOUBLE_STAR_COMBOS[`${b}+${a}`] ?? null;
}

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const oppositeBranch = (b) => BRANCHES[(BRANCHES.indexOf(b) + 6) % 12];
const branchOf = (palace) => palace.position[1]; // position 形如「癸卯」

// iztro 亮度七階(廟旺得利平不陷)→ 資料庫四階(廟旺平陷)的對應
export const BRIGHTNESS_ALIAS = {
  廟: '廟', 旺: '旺', 得: '旺', 利: '平', 平: '平', 不: '陷', 陷: '陷',
};

/** 單顆星在某宮的完整句:基底文案 + 亮度疊加 + 四化疊加 */
function composeStar(palaceName, star, { borrowed = false } = {}) {
  const base = db[palaceName]?.[star.name];
  if (!base) return null;

  const parts = [base];

  const brightnessKey = BRIGHTNESS_ALIAS[star.brightness];
  if (brightnessKey && db['亮度疊加'][brightnessKey]) {
    parts.push(`亮度${star.brightness}——${db['亮度疊加'][brightnessKey]}`);
  }

  if (star.transformation) {
    const key = star.transformation.startsWith('化') ? star.transformation : `化${star.transformation}`;
    if (db['四化疊加'][key]) parts.push(`${key}——${db['四化疊加'][key]}`);
  }

  return `${star.name}${borrowed ? '(借)' : ''}:${parts.join(' ')}`;
}

/**
 * 組裝單一宮位解讀
 * @param {object} palace     ziWei.palaces 的元素
 * @param {object} [opposite] 對宮(空宮借星用)
 * @returns {{ palaceName, position, isBodyPalace, borrowed, text }}
 */
export function composePalaceReading(palace, opposite = null) {
  const { name } = palace;
  const lines = [];
  let borrowed = false;

  if (palace.majorStars.length > 0) {
    for (const star of palace.majorStars) {
      const line = composeStar(name, star);
      if (line) lines.push(line);
    }
    // 疊加順序:先宮位×單星基礎解釋,再疊雙主星組合補充句
    const combo = lookupCombo(palace.majorStars.map((s) => s.name));
    if (combo) lines.push(`雙星組合:${combo}`);
  } else if (opposite?.majorStars.length) {
    // 空宮 → 借對宮星曜,文案採「對宮情境」的解釋(借星安命的邏輯,推廣到各宮)
    borrowed = true;
    if (name === '命宮') lines.push(db['命宮_空宮規則']['開頭句']);
    else lines.push(`${name}無主星,借對宮(${opposite.name})星曜參看。`);

    for (const star of opposite.majorStars) {
      const line = composeStar(opposite.name, star, { borrowed: true });
      if (line) lines.push(line);
    }
    const combo = lookupCombo(opposite.majorStars.map((s) => s.name));
    if (combo) lines.push(`雙星組合(借):${combo}`);
    if (name === '命宮') lines.push(db['命宮_空宮規則']['結尾提醒句']);
  }

  return {
    palaceName: name,
    position: palace.position,
    isBodyPalace: Boolean(palace.isBodyPalace),
    borrowed,
    text: lines.join('\n'),
  };
}

/**
 * 組裝整張盤(12 宮)
 * @param {object} ziWei  convertToZiWei() 的輸出
 * @returns {{ overview, palaces: Array }}
 */
export function composeChartReading(ziWei) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  return {
    overview: `五行局:${ziWei.fiveElementBureau},命宮在${ziWei.lifePalace}、身宮在${ziWei.bodyPalace},命主${ziWei.lifeMaster}、身主${ziWei.bodyMaster}。`,
    palaces: ziWei.palaces.map((p) =>
      composePalaceReading(p, byBranch[oppositeBranch(branchOf(p))])),
  };
}

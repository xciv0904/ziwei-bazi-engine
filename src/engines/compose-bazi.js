// src/engines/compose-bazi.js — 八字十神解讀組裝引擎
// 組裝邏輯(照 ten-gods-meanings.json 修正版):
//   以「柱」為單位輸出(年柱/月柱/日柱/時柱各一段),天干十神與地支十神合併成一句,
//   柱位背景說明只講一次,避免天干、地支各自套用一次完整柱位背景造成重複。
import db from '../data/ten-gods-meanings.json' with { type: 'json' };

const PHRASE = db['十神短語'];
const PILLAR_BG = db['柱位背景句'];
const CORE = db['十神核心意義'];

/** 學習版才附上的完整依據句(平常組裝報告只用短語,細節保留給點開/學習版看) */
function citeCore(gods) {
  return gods.map((g) => `${g}——${CORE[g]?.core ?? ''}`).join(';');
}

const PILLARS = [
  { stemKey: 'yearStem', branchKey: 'yearBranch', label: '年柱' },
  { stemKey: 'monthStem', branchKey: 'monthBranch', label: '月柱' },
  { stemKey: 'dayStem', branchKey: 'dayBranch', label: '日柱' },
  { stemKey: 'hourStem', branchKey: 'hourBranch', label: '時柱' },
];

/**
 * 單一柱的合併句:天干十神與地支十神先比對(是否相同/天干是否為日主本身),
 * 再合併成一句,柱位背景句只附加一次。
 */
function composePillar(label, stemGod, branchGod, dayStemLabel, mode) {
  const bg = PILLAR_BG[label];
  if (!branchGod && !stemGod) return null;
  const withCitation = (text, gods) =>
    mode === 'study' ? `${text}(依據:${citeCore(gods)})` : text;

  // 日柱天干是日主本身,沒有對應十神,只描述地支本氣
  if (!stemGod || stemGod === '日主') {
    if (!branchGod) return null;
    return {
      pillar: label,
      gods: [branchGod],
      text: withCitation(`${label}天干為日主(${dayStemLabel}本身),地支本氣為${branchGod},透露${PHRASE[branchGod]}的特質,${bg}。`, [branchGod]),
    };
  }

  // 地支本氣理論上一定存在,若真的缺漏則只描述天干,做容錯
  if (!branchGod) {
    return {
      pillar: label,
      gods: [stemGod],
      text: withCitation(`${label}天干為${stemGod},帶有${PHRASE[stemGod]}的特質,${bg}。`, [stemGod]),
    };
  }

  // 天干與地支十神相同 → 不要講兩次一樣的特質,合併成一句強調鮮明
  if (stemGod === branchGod) {
    return {
      pillar: label,
      gods: [stemGod],
      text: withCitation(`${label}天干與地支本氣皆為${stemGod},${PHRASE[stemGod]}的特質格外鮮明,${bg}。`, [stemGod]),
    };
  }

  // 天干與地支十神不同 → 合併成一句,柱位背景句只出現一次
  return {
    pillar: label,
    gods: [stemGod, branchGod],
    text: withCitation(
      `${label}天干為${stemGod},帶有${PHRASE[stemGod]}的特質;地支本氣為${branchGod},則透露${PHRASE[branchGod]}的一面,兩者合看,${bg}。`,
      [stemGod, branchGod],
    ),
  };
}

/**
 * 組裝整組四柱的十神解讀(以柱為單位,每柱一句合併句)
 * mode = 'public'(預設):只用短語結論句;mode = 'study':每柱後面加上完整十神依據句。
 * @param {object} baZi  convertToBaZi() 的輸出(用 fourPillars + tenGods)
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ dayMaster: string, entries: Array<{pillar, gods, text}>, text: string }}
 */
export function composeBaZiReading(baZi, { mode = 'public' } = {}) {
  const { fourPillars, tenGods } = baZi;
  const entries = [];

  for (const { stemKey, branchKey, label } of PILLARS) {
    const e = composePillar(label, tenGods[stemKey], tenGods[branchKey], fourPillars.dayPillar.stem, mode);
    if (e) entries.push(e);
  }

  const dayMaster = `日主${fourPillars.dayPillar.stem}(${fourPillars.dayPillar.stem}${fourPillars.dayPillar.branch}日生),全局十神皆以此為基準推算。`;

  return {
    dayMaster,
    entries,
    text: [dayMaster, ...entries.map((e) => e.text)].join('\n'),
  };
}

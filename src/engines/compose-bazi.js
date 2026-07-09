// src/engines/compose-bazi.js — 八字十神解讀組裝引擎
// 組裝邏輯(照 ten-gods-meanings.json 的說明):
//   抓該柱的十神 → 套用 core → 疊加對應柱位的 pillarModifier
import db from '../data/ten-gods-meanings.json' with { type: 'json' };

const CORE = db['十神核心意義'];
const PILLAR_MODIFIER = db['柱位修飾'];

const PILLARS = [
  { key: 'yearPillar', stemKey: 'yearStem', branchKey: 'yearBranch', label: '年柱' },
  { key: 'monthPillar', stemKey: 'monthStem', branchKey: 'monthBranch', label: '月柱' },
  { key: 'dayPillar', stemKey: 'dayStem', branchKey: 'dayBranch', label: '日柱' },
  { key: 'hourPillar', stemKey: 'hourStem', branchKey: 'hourBranch', label: '時柱' },
];

/** 單一十神在某柱的完整句:core + 柱位修飾 */
function composeTenGod(godName, pillarLabel, { position }) {
  const meaning = CORE[godName];
  if (!meaning) return null;
  return {
    pillar: pillarLabel,
    position, // '天干' | '地支(本氣)'
    god: godName,
    keywords: meaning.keywords,
    text: `${godName}(${pillarLabel}${position}):${meaning.core} ${PILLAR_MODIFIER[pillarLabel]}`,
  };
}

/**
 * 組裝整組四柱的十神解讀
 * @param {object} baZi  convertToBaZi() 的輸出(用 fourPillars + tenGods)
 * @returns {{ dayMaster: string, entries: Array, text: string }}
 */
export function composeBaZiReading(baZi) {
  const { fourPillars, tenGods } = baZi;
  const entries = [];

  for (const { key, stemKey, branchKey, label } of PILLARS) {
    const stemGod = tenGods[stemKey];
    if (stemGod && stemGod !== '日主') {
      const e = composeTenGod(stemGod, label, { position: '天干' });
      if (e) entries.push(e);
    }
    const branchGod = tenGods[branchKey];
    if (branchGod) {
      const e = composeTenGod(branchGod, label, { position: '地支本氣' });
      if (e) entries.push(e);
    }
  }

  const dayMaster = `日主${fourPillars.dayPillar.stem}(${fourPillars.dayPillar.stem}${fourPillars.dayPillar.branch}日生),全局十神皆以此為基準推算。`;

  return {
    dayMaster,
    entries,
    text: [dayMaster, ...entries.map((e) => e.text)].join('\n'),
  };
}

// src/engines/compose-shensha.js — 神煞(貴人星/煞星)解讀組裝引擎
// 組裝邏輯(照 shensha-analysis.json):
//   以「柱」為單位輸出,同一柱若有多個神煞,合併成一句,
//   柱位背景句只在該柱的敘述最後講一次,不逐條重複。
import db from '../data/shensha-analysis.json' with { type: 'json' };

const CORE = { ...db['貴人星解讀'], ...db['煞星解讀'] };
const PILLAR_BG = db['柱位修飾'];

const PILLARS = [
  { key: 'yearPillar', label: '年柱' },
  { key: 'monthPillar', label: '月柱' },
  { key: 'dayPillar', label: '日柱' },
  { key: 'hourPillar', label: '時柱' },
];

const stripPeriod = (s) => s.replace(/。\s*$/, '');
const stripLead = (s) => s.replace(/^代表/, '');

/** 單一柱的神煞合併句:多個神煞的核心意義逗號串接,柱位背景句只講一次 */
function composePillarShensha(label, bg, names) {
  const known = names.filter((n) => CORE[n]);
  if (!known.length) return null;

  const nameList = known.length === 1
    ? known[0]
    : `${known.slice(0, -1).join('、')}與${known.at(-1)}`;

  const meanings = known.map((n) => stripLead(CORE[n]));
  const meaningJoined = meanings.map((m, i) => (i < meanings.length - 1 ? stripPeriod(m) : m)).join(',');

  return {
    pillar: label,
    shensha: known,
    text: `${label}${known.length > 1 ? '同時帶有' : '帶有'}${nameList}——${meaningJoined}${bg}`,
  };
}

/**
 * 組裝四柱神煞解讀
 * @param {object} baZi convertToBaZi() 輸出(需含 shenshaList)
 * @returns {{ entries: Array<{pillar, shensha, text}>, text: string }}
 */
export function composeShenShaReading(baZi) {
  const shenshaList = baZi.shenshaList ?? {};
  const entries = [];
  for (const { key, label } of PILLARS) {
    const e = composePillarShensha(label, PILLAR_BG[label], shenshaList[key] ?? []);
    if (e) entries.push(e);
  }
  return { entries, text: entries.map((e) => e.text).join(' ') };
}

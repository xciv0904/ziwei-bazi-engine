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

/**
 * 單一柱的神煞合併句:柱位背景句只講一次,但每個神煞「名稱——解釋」各自獨立、
 * 以分號隔開(舊版把 5、6 個神煞的解釋用逗號黏成一句 200 字無句號的長句,難以閱讀)
 */
function composePillarShensha(label, bg, names) {
  const known = names.filter((n) => CORE[n]);
  if (!known.length) return null;

  const nameList = known.length === 1
    ? known[0]
    : `${known.slice(0, -1).join('、')}與${known.at(-1)}`;

  const detail = known
    .map((n) => `${n}——${stripPeriod(stripLead(CORE[n]))}`)
    .join(';');

  return {
    pillar: label,
    shensha: known,
    text: `${label}${known.length > 1 ? '同時帶有' : '帶有'}${nameList}:${detail}。${bg}`,
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
  return { entries, text: entries.map((e) => e.text).join('\n') }; // 每柱換行,搭配 UI 的 pre-line 呈現
}

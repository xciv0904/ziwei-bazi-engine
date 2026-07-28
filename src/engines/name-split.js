// src/engines/name-split.js — 姓名拆分(姓/名)
//
// 這段邏輯本來住在 naming.js 裡,但 naming.js 會一併載入 44KB 的 name-characters.json 字庫。
// 排盤流程(computeAllInner)只是要把姓名拆成姓/名帶進姓名學分頁的預設值,用不到字庫;
// 為了這幾行而把整份字庫拉進入口 bundle 並不划算,所以獨立成這支零相依的小模組。
// naming.js 仍會 re-export splitSurnameGiven,既有的 import 路徑不受影響。

// 常見複姓(涵蓋大部分現實會遇到的複姓;沒列到的一律當單姓處理,即取第一字為姓)
export const COMPOUND_SURNAMES = [
  '歐陽', '司馬', '諸葛', '上官', '皇甫', '公孫', '尉遲', '令狐', '長孫', '東方',
  '西門', '南宮', '司徒', '夏侯', '獨孤', '慕容', '軒轅', '端木', '宇文', '鍾離',
];

/**
 * 把完整姓名拆成姓/名(用於「帶入排盤姓名」這類自動判斷,不要求百分之百正確——
 * 複姓只認上面列出的常見清單,沒列到的複姓仍會被拆成單姓+較長的名,使用者可自行在姓名學頁調整)
 * @param {string} fullName
 * @returns {{ surname: string, given: string }}
 */
export function splitSurnameGiven(fullName) {
  const name = String(fullName ?? '').trim();
  if (!name) return { surname: '', given: '' };
  const compound = COMPOUND_SURNAMES.find((s) => name.startsWith(s));
  if (compound) return { surname: compound, given: name.slice(compound.length) };
  return { surname: name[0], given: name.slice(1) };
}

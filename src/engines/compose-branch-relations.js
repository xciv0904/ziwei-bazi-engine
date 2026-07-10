// src/engines/compose-branch-relations.js — 地支關係(合沖害刑拱暗合半合半會)解讀組裝引擎
// 組裝邏輯(照 branch-interactions-analysis.json):
//   同一組地支若同時觸發多種關係類型(例如午未既是六合也是半會),合併成一句,
//   不各自輸出一次完整解讀;每個柱位的背景意涵在整段中只點出一次,避免重複堆疊。
import db from '../data/branch-interactions-analysis.json' with { type: 'json' };

const MEANING_RAW = db['關係類型解讀'];
// bazi.js 引擎輸出的關係代號與 branch-interactions-analysis.json 的鍵名不完全一致(六合/害/沖/刑 vs 六合/六害/六沖/三刑),需要對應轉換
const RELATION_ALIAS = { 六合: '六合', 害: '六害', 沖: '六沖', 刑: '三刑', 相破: '相破', 暗合: '暗合', 半合: '半合', 拱: '拱', 半會: '半會' };
const displayName = (rel) => RELATION_ALIAS[rel] ?? rel;
const MEANING = new Proxy({}, { get: (_, rel) => MEANING_RAW[RELATION_ALIAS[rel] ?? rel] });

const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };
// 柱位背景意涵(短語版,僅在整段中第一次提及該柱時附註一次)
const PILLAR_HINT = {
  yearBranch: '早年家庭根基',
  monthBranch: '成長環境與事業土壤',
  dayBranch: '自身核心特質',
  hourBranch: '晚年與子女緣分',
};
// 固定柱位配對順序,確保輸出穩定
const PAIR_ORDER = [
  ['yearBranch', 'monthBranch'], ['yearBranch', 'dayBranch'], ['yearBranch', 'hourBranch'],
  ['monthBranch', 'dayBranch'], ['monthBranch', 'hourBranch'], ['dayBranch', 'hourBranch'],
];

const stripPeriod = (s) => s.replace(/。\s*$/, '');

/**
 * 組裝地支關係解讀:先依柱位配對分組(合併同一組地支的多重關係類型),
 * 再依固定順序輸出,每個柱位的背景意涵只在第一次出現時附註。
 * @param {object} baZi convertToBaZi() 輸出(需含 branchRelations)
 * @returns {{ groups: Array<{pillars, relations, pair, text}>, text: string }}
 */
export function composeBranchRelationsReading(baZi) {
  const raw = baZi.branchRelations ?? [];
  if (!raw.length) return { groups: [], text: '四柱地支之間沒有明顯的合沖害刑拱暗合半合半會等特殊關係。' };

  // 依柱位配對(不分方向)分組,收集該配對觸發的所有關係類型(去重)
  const byPair = new Map();
  for (const r of raw) {
    const key = [r.branch, r.with].sort().join('-');
    if (!byPair.has(key)) byPair.set(key, { pillars: [r.branch, r.with].sort(), pair: r.pair, relations: new Set() });
    byPair.get(key).relations.add(r.relation);
  }

  const mentionedPillar = new Set();
  const groups = [];
  for (const [a, b] of PAIR_ORDER) {
    const key = [a, b].sort().join('-');
    const g = byPair.get(key);
    if (!g) continue;

    const relations = [...g.relations];
    const labelA = BRANCH_LABEL[a];
    const labelB = BRANCH_LABEL[b];

    // 柱位背景意涵只在整段中第一次提及該柱時附註,避免同一柱在多組關係裡重複講解釋
    const hintParts = [];
    for (const p of [a, b]) {
      if (!mentionedPillar.has(p)) {
        hintParts.push(`${BRANCH_LABEL[p]}(${PILLAR_HINT[p]})`);
        mentionedPillar.add(p);
      }
    }
    const hint = hintParts.length ? `(${hintParts.join('、')})` : '';

    let text;
    if (relations.length === 1) {
      text = `${labelA}與${labelB}${hint}之間為${displayName(relations[0])}關係(${g.pair}),${MEANING[relations[0]] ?? ''}`;
    } else {
      // 合併規則:同一組地支同時觸發多種關係類型時,合併成一句,不各自輸出完整解讀
      const meanings = relations.map((r) => MEANING[r] ?? '').filter(Boolean);
      const combined = meanings.map((m, i) => (i < meanings.length - 1 ? stripPeriod(m) : m)).join(',');
      text = `${labelA}與${labelB}${hint}之間同時存在${relations.map(displayName).join('與')}的關係(${g.pair}),${combined}`;
    }

    groups.push({ pillars: [a, b], relations, pair: g.pair, text });
  }

  return { groups, text: groups.map((g) => g.text).join(' 另外,') };
}

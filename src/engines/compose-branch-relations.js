// src/engines/compose-branch-relations.js — 地支關係(合沖害刑拱暗合半合半會)解讀組裝引擎
// 組裝邏輯(照 branch-interactions-analysis.json):
//   同一組地支若同時觸發多種關係類型(例如午未既是六合也是半會),合併成一句,
//   不各自輸出一次完整解讀;每個柱位的背景意涵在整段中只點出一次,避免重複堆疊。
import db from '../data/branch-interactions-analysis.json' with { type: 'json' };

const MEANING_RAW = db['關係類型解讀'];
// bazi.js 引擎輸出的關係代號與 branch-interactions-analysis.json 的鍵名不完全一致(六合/害/沖/刑 vs 六合/六害/六沖/三刑),需要對應轉換
const RELATION_ALIAS = { 六合: '六合', 害: '六害', 沖: '六沖', 刑: '三刑', 相破: '相破', 暗合: '暗合', 半合: '半合', 拱: '拱', 半會: '半會' };
const MEANING = new Proxy({}, { get: (_, rel) => MEANING_RAW[RELATION_ALIAS[rel] ?? rel] });

// 三合局(拱=缺中間一支的兩端外支,標示出被拱的支才有意義,例如亥未拱卯)
const SAN_HE = [['申', '子', '辰'], ['巳', '酉', '丑'], ['寅', '午', '戌'], ['亥', '卯', '未']];

/** 拱局中被拱出來的那一支(pair 形如「未亥」) */
export function gongTarget(pair) {
  const group = SAN_HE.find((g) => g.includes(pair[0]) && g.includes(pair[1]));
  return group?.find((b) => b !== pair[0] && b !== pair[1]) ?? '';
}

/**
 * 關係顯示名稱(統一供本檔、comprehensive.js、format-ai.js 使用,避免各處叫法不一)
 * 拱會附上被拱之支:拱卯
 */
export function relationDisplayName(rel, pair = '') {
  if (rel === '拱' && pair) return `拱${gongTarget(pair)}`;
  return RELATION_ALIAS[rel] ?? rel;
}

const displayName = relationDisplayName;

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

    // 柱位背景意涵直接接在該柱名稱後(年支(早年家庭根基)),且只在整段中第一次提及該柱時附註,
    // 避免舊版「年支與日支(年支(…)、日支(…))」雙層括號的拗口寫法
    const labelWithHint = (p) => {
      if (mentionedPillar.has(p)) return BRANCH_LABEL[p];
      mentionedPillar.add(p);
      return `${BRANCH_LABEL[p]}(${PILLAR_HINT[p]})`;
    };
    const labelA = labelWithHint(a);
    const labelB = labelWithHint(b);

    let text;
    if (relations.length === 1) {
      text = `${labelA}與${labelB}之間為${displayName(relations[0], g.pair)}關係(${g.pair}),${MEANING[relations[0]] ?? ''}`;
    } else {
      // 合併規則:同一組地支同時觸發多種關係類型時,合併成一句,不各自輸出完整解讀
      const meanings = relations.map((r) => MEANING[r] ?? '').filter(Boolean);
      const combined = meanings.map((m, i) => (i < meanings.length - 1 ? stripPeriod(m) : m)).join(',');
      text = `${labelA}與${labelB}之間同時存在${relations.map((r) => displayName(r, g.pair)).join('與')}的關係(${g.pair}),${combined}`;
    }

    groups.push({ pillars: [a, b], relations, pair: g.pair, text });
  }

  return { groups, text: groups.map((g) => g.text).join(' 另外,') };
}

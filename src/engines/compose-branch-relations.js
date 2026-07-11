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

// ---------- 大眾版:白話句 ----------
// 「暗合」「相破」這類術語對一般人是黑話,大眾版不講關係名稱與干支,
// 直接用「A 領域和 B 領域相處起來如何」的口語句。
const PLAIN_DOMAIN = {
  yearBranch: '家庭與長輩',
  monthBranch: '職場與外在環境',
  dayBranch: '自己與另一半',
  hourBranch: '晚年與子女',
};
const PLAIN_REL = {
  六合: (A, B) => `${A}和${B}彼此幫襯、氣氛和諧,遇到事情容易找到共識。`,
  六沖: (A, B) => `${A}和${B}之間拉扯比較明顯,容易有變動或意見相左,需要練習取得平衡。`,
  六害: (A, B) => `${A}和${B}之間容易累積小誤會、互相消耗,多溝通、把界線說清楚會舒服很多。`,
  三刑: (A, B) => `${A}和${B}之間容易互相較勁、糾結,磨合期比較長,急不得。`,
  相破: (A, B) => `${A}和${B}偶爾會互相打亂步調,計畫保留一點彈性比較順。`,
  暗合: (A, B) => `${A}和${B}之間有種說不上來的默契和牽引,常在不知不覺中互相影響。`,
  半合: (A, B) => `${A}和${B}性質相近、彼此加分,這兩個領域常常一起變好。`,
  半會: (A, B) => `${A}和${B}的能量同氣相求,會互相強化彼此的特質。`,
  拱: (A, B) => `${A}和${B}會聯手把力量集中到同一個焦點,這股合力容易放大相關領域的表現。`,
};
// 同一組地支觸發多種關係時,大眾版只講最主要的一種(依影響力排序),避免一句話自相矛盾
const PLAIN_PRIORITY = ['六沖', '三刑', '六害', '相破', '六合', '暗合', '拱', '半合', '半會'];

/**
 * 組裝地支關係解讀:先依柱位配對分組(合併同一組地支的多重關係類型),
 * 再依固定順序輸出。
 * mode = 'public'(預設):白話句,不出現關係術語與干支
 * mode = 'study':完整版(關係名稱+干支+解讀,柱位背景意涵首次出現時附註)
 * @param {object} baZi convertToBaZi() 輸出(需含 branchRelations)
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ groups: Array<{pillars, relations, pair, text}>, text: string }}
 */
export function composeBranchRelationsReading(baZi, { mode = 'public' } = {}) {
  const raw = baZi.branchRelations ?? [];
  if (!raw.length) {
    return {
      groups: [],
      text: mode === 'study'
        ? '四柱地支之間沒有明顯的合沖害刑拱暗合半合半會等特殊關係。'
        : '你的命盤裡,各個人生領域之間沒有特別強烈的互相牽動,彼此相對獨立、單純。',
    };
  }

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

    // ---- 大眾版:每組一句白話,取影響力最主要的關係類型 ----
    if (mode !== 'study') {
      const displayed = relations.map((r) => RELATION_ALIAS[r] ?? r);
      const primary = PLAIN_PRIORITY.find((p) => displayed.includes(p)) ?? displayed[0];
      const plainFn = PLAIN_REL[primary];
      if (plainFn) {
        groups.push({
          pillars: [a, b], relations, pair: g.pair,
          // 用「」框住領域詞,兩個名詞片語相連時才不會黏在一起難以斷句
          text: plainFn(`「${PLAIN_DOMAIN[a]}」`, `「${PLAIN_DOMAIN[b]}」`),
        });
      }
      continue;
    }

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

  return {
    groups,
    // 大眾版每組已是獨立完整句,直接換行;學習版維持「另外,」串接
    text: mode === 'study'
      ? groups.map((g) => g.text).join(' 另外,')
      : groups.map((g) => g.text).join('\n'),
  };
}

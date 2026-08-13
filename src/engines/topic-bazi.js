// src/engines/topic-bazi.js — 主題分析的八字軌
//
// 這一支存在的理由，是一組實測數字：
// 同一張盤跑完 60 題，選出來的 180 條依據裡只有 13 條來自八字（7.2%），
// 但八字通過篩選的候選其實有 972 條、佔全部候選的 66%。
// 也就是說八字不是內容不夠，是在「選擇」與「產生直接答案」這兩步被系統性地排掉了：
//   1. selectTopicEvidence() 有兩處寫死的 sourceType.startsWith('ziwei_') 優先。
//   2. 每題的直接答案來自「題目 × 十四主星」840 格答案庫，那份表純紫微，
//      八字連參與的機會都沒有。
//
// 第 2 點是根本原因，也是這支模組要補的：給八字一份對等的
// 「題目 × 十神」600 格答案庫（src/data/topic-tengod-answers.json），
// 並且用一條講得清楚的規則決定「這一題該看哪個十神」。
//
// 取用規則刻意寫得跟紫微那條一樣短、一樣可驗證：
//   紫微：取該題 allowedPalaces[0] 宮位的第一顆主星。
//   八字：取該題對應的那組十神裡，在四柱中出現最多的那一個。
//
// 不做的事：不重新排盤、不自己算五行強弱。四柱十神由 bazi.js 給，
// 喜忌由 compose-yongshen.js 給，這裡只負責挑與查表。
import TEN_GOD_ANSWERS from '../data/topic-tengod-answers.json' with { type: 'json' };

const ANSWERS = TEN_GOD_ANSWERS['答案'];
const TOPIC_MAP = TEN_GOD_ANSWERS['主題對應'];

/** compose-yongshen 回傳的 role 用的是十神的組名，這裡展開成實際的十神 */
const ROLE_TO_TEN_GODS = {
  印: ['正印', '偏印'],
  比劫: ['比肩', '劫財'],
  官殺: ['正官', '七殺'],
  財: ['正財', '偏財'],
  食傷: ['食神', '傷官'],
};

const ALL_TEN_GODS = ['比肩', '劫財', '食神', '傷官', '正財', '偏財', '正官', '七殺', '正印', '偏印'];

/** 十神的組名。依據面板寫「官殺取正官」比寫整句理由通順，理由留在資料檔裡給稽核看 */
const GROUP_NAME = {
  比肩: '比劫', 劫財: '比劫',
  食神: '食傷', 傷官: '食傷',
  正財: '財星', 偏財: '財星',
  正官: '官殺', 七殺: '官殺',
  正印: '印星', 偏印: '印星',
};

const PILLAR_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };
const STEM_LABEL = { yearStem: '年干', monthStem: '月干', dayStem: '日干', hourStem: '時干' };

/**
 * 數一數每個十神在四柱裡出現幾次。
 *
 * 天干、地支本氣、地支藏干都算，因為它們都是這個人真的帶著的東西。
 * 藏干權重不另外打折——這裡只是要挑出「最明顯的那一個」，
 * 不是在算命理上的力量強弱，發明一套權重等於發明一套假的精準度。
 * 同時記下每個十神出現在哪些位置，依據面板才講得出「這個結論從哪裡來」。
 */
export function countTenGods(baZi) {
  const counts = new Map();
  const where = new Map();
  const bump = (god, label) => {
    if (!god || god === '日主' || !ALL_TEN_GODS.includes(god)) return;
    counts.set(god, (counts.get(god) ?? 0) + 1);
    if (!where.has(god)) where.set(god, []);
    where.get(god).push(label);
  };
  const tenGods = baZi?.tenGods ?? {};
  for (const [key, label] of Object.entries(STEM_LABEL)) bump(tenGods[key], label);
  for (const [key, label] of Object.entries(PILLAR_LABEL)) bump(tenGods[key], label);
  for (const [key, list] of Object.entries(baZi?.hiddenStems ?? {})) {
    for (const entry of list ?? []) {
      // 藏干格式是「庚-正官」
      const god = String(entry).split('-')[1];
      bump(god, `${PILLAR_LABEL[key] ?? key}藏干`);
    }
  }
  return { counts, where };
}

/**
 * 這一題該看哪一組十神。
 *
 * 大多數主題是固定的（事業看官殺、財運看財星、父母看印星…），
 * 三個例外都寫在資料檔的「主題對應」裡，理由也一併寫在那裡：
 *   - 愛情依性別分流：女命看官殺、男命看財星，這是配偶星的傳統取法。
 *   - 幸運取喜用神所屬的十神：喜用所在即順遂之處。
 *   - 健康取忌神所屬的十神：病多從忌神來。
 * 後兩者要靠 computeYongShen() 的結果，所以 yongshen 缺席時退回全盤最強，
 * 不硬猜——猜錯的健康建議比沒有建議更糟。
 */
function targetTenGods(contract, gender, yongshen) {
  const category = String(contract.id).split('.')[0];
  const spec = TOPIC_MAP[category];
  if (!spec) return { gods: ALL_TEN_GODS, basis: '全局' };

  if (spec['十神'] === '喜用') {
    const roles = (yongshen?.favorable ?? []).map((item) => item.role);
    const gods = roles.flatMap((role) => ROLE_TO_TEN_GODS[role] ?? []);
    return gods.length ? { gods, basis: '喜用神' } : { gods: ALL_TEN_GODS, basis: '全局' };
  }
  if (spec['十神'] === '忌神') {
    const roles = (yongshen?.unfavorable ?? []).map((item) => item.role);
    const gods = roles.flatMap((role) => ROLE_TO_TEN_GODS[role] ?? []);
    return gods.length ? { gods, basis: '忌神' } : { gods: ALL_TEN_GODS, basis: '全局' };
  }
  if (category === 'love' && gender === 'male' && spec['男命十神']) {
    return { gods: spec['男命十神'], basis: '配偶星（男命看財星）' };
  }
  if (category === 'love') return { gods: spec['十神'], basis: '配偶星（女命看官殺）' };
  return { gods: spec['十神'], basis: GROUP_NAME[spec['十神'][0]] ?? '主題對應' };
}

/**
 * 這一題的八字答案，以及它是怎麼來的。
 *
 * 回傳 null 代表這一題沒有可用的八字答案（沒有 baZi、或答案庫沒有這一題），
 * 呼叫端要能接受——寧可少一軌，也不要生一段沒有依據的話。
 */
export function resolveTopicTenGod({ contract, baZi, gender = null, yongshen = null }) {
  if (!contract || !baZi) return null;
  const table = ANSWERS[contract.id];
  if (!table) return null;

  const { counts, where } = countTenGods(baZi);
  const { gods, basis } = targetTenGods(contract, gender, yongshen);

  // 該組十神在盤上出現最多的那一個；同票取「主題對應」裡排前面的（陣列順序即優先序）
  let picked = null;
  let best = 0;
  for (const god of gods) {
    const n = counts.get(god) ?? 0;
    if (n > best) { best = n; picked = god; }
  }

  // 該組完全不出現也是一種訊息：這一塊的星不顯。
  // 這時改看全盤最強的十神，並照實標示，不假裝那是這一題的本命訊號。
  let absent = false;
  if (!picked) {
    absent = true;
    for (const god of ALL_TEN_GODS) {
      const n = counts.get(god) ?? 0;
      if (n > best) { best = n; picked = god; }
    }
  }
  if (!picked) return null;

  return {
    tenGod: picked,
    answer: table[picked] ?? '',
    count: best,
    positions: where.get(picked) ?? [],
    basis,
    absent,
    // 依據面板與 AI 提示詞共用這一句，兩邊的說法才不會各自漂移
    basisLabel: absent
      ? `八字：${basis}在四柱中不顯，改看全局最明顯的${picked}（見${(where.get(picked) ?? []).join('、')}）`
      : `八字：${basis}取${picked}（見${(where.get(picked) ?? []).join('、')}）`,
  };
}

/** 給測試與稽核用：答案庫涵蓋了哪些題目 */
export const TEN_GOD_ANSWER_TOPICS = Object.keys(ANSWERS);

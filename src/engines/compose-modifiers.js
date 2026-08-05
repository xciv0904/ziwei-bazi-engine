// src/engines/compose-modifiers.js — 宮位的「修正層」：輔星、煞曜、雜曜與四化怎麼改變判斷
//
// 為什麼需要這一層：
// 改版前全站的解讀幾乎只用主星。輔星與煞曜只出現在「專業資料」的清單裡，
// 一句解讀都沒有用到——命盤上明明擺著左輔右弼與擎羊陀羅，讀出來的東西卻跟沒有它們一樣。
//
// 這一層採三合派（南派）的判讀分工，也是刻意不重寫既有文案的原因：
//
//   主星   決定「這一宮在講什麼」——方向與主題，是骨架
//   廟旺   決定主星的力道有多明顯
//   四化   決定能量往哪走，屬於主結構
//   六吉   改變「做起來順不順」，不改變主題
//   六煞   改變「力道與代價」，不改變主題
//   雜曜   最後才看，補「以什麼形式呈現」
//
// 所以輸出的是一層「修正」，不是新的結論：既有的主星結論保留，
// 後面接上「但因為…所以實際上…」。這樣讀者看得出哪一句是被什麼改的，
// 而不是拿到一段揉在一起、無從追溯的文字。
//
// 這支只重新整理既有排盤結果，不重算任何命盤事實，也不產生新的命理判斷。

import {
  AUSPICIOUS_EFFECT,
  AUSPICIOUS_MINOR,
  MALEFIC_EFFECT,
  MALEFIC_MINOR,
} from '../data/learning-mode.js';
import starPalaceApp from '../data/star-palace-application.json' with { type: 'json' };

const AUX_APPLICATION = starPalaceApp['吉煞祿馬落宮'];
const MINOR_APPLICATION = starPalaceApp['雜曜落宮'];
const PALACE_GROUPS = starPalaceApp['宮位分類'];

/** 祿存與天馬不屬六吉六煞，但影響力不輸它們，南派讀盤一定看 */
const RESOURCE_STARS = {
  祿存: { tone: 'boost', effect: '有實際的資源可以守住，不容易全空。' },
  天馬: { tone: 'shift', effect: '這一塊會動起來，靜不下來也留不住。' },
};

/**
 * 雜曜裡影響判讀方向、值得寫進修正層的那幾顆。
 * 其餘雜曜留在清單與小百科即可——每一顆都寫進結論，等於每個人都有一堆修正句，
 * 反而稀釋了真正重要的訊號。
 */
const NOTABLE_MINOR = {
  天空: { tone: 'drag', effect: '想得多、落實得少，計畫容易停在紙上。' },
  截路: { tone: 'drag', effect: '中途會卡一下，時機常常不對。' },
  旬空: { tone: 'drag', effect: '看起來有、實際抓不到，需要更長的時間才落定。' },
  空亡: { tone: 'drag', effect: '這一塊的成果比較留不住。' },
  天刑: { tone: 'shift', effect: '自我要求嚴，也容易跟規矩、紀律扯上關係。' },
  天姚: { tone: 'shift', effect: '人際與情感的成分變重，靠感覺推進的比例高。' },
  紅鸞: { tone: 'boost', effect: '喜事與人緣帶來的機會比較多。' },
  天喜: { tone: 'boost', effect: '氣氛熱絡，容易有讓人開心的進展。' },
  咸池: { tone: 'shift', effect: '吸引力強，也容易被感覺牽著走。' },
  華蓋: { tone: 'shift', effect: '偏向獨處與鑽研，熱鬧的場合反而不自在。' },
  孤辰: { tone: 'drag', effect: '習慣自己扛，關係上比較疏離。' },
  寡宿: { tone: 'drag', effect: '心理上容易覺得只有自己一個人。' },
  龍池: { tone: 'boost', effect: '手上的技藝與品味加分。' },
  鳳閣: { tone: 'boost', effect: '審美與儀態加分，給人的印象好。' },
  三台: { tone: 'boost', effect: '地位與名分上比較站得住。' },
  八座: { tone: 'boost', effect: '有位置、有人抬舉。' },
  恩光: { tone: 'boost', effect: '該被看見的時候會被看見。' },
  天貴: { tone: 'boost', effect: '容易得到有份量的人賞識。' },
  台輔: { tone: 'boost', effect: '有名分或頭銜上的助力。' },
  封誥: { tone: 'boost', effect: '努力比較容易被正式認可。' },
  天哭: { tone: 'drag', effect: '心情上容易往壞處想。' },
  天虛: { tone: 'drag', effect: '容易覺得虛、提不起勁。' },
  陰煞: { tone: 'drag', effect: '暗處的干擾多，不容易查得清楚。' },
  天月: { tone: 'drag', effect: '精神與體力容易被磨掉。' },
  解神: { tone: 'boost', effect: '麻煩多半能化掉，不會一路壞到底。' },
  天巫: { tone: 'boost', effect: '有往上升遷或承接的機會。' },
  天壽: { tone: 'boost', effect: '底子厚，撐得久。' },
  天才: { tone: 'boost', effect: '反應快，學東西上手。' },
};

/** 生年四化在這一宮代表什麼——這是主結構的一部分，不是補充 */
const MUTAGEN_EFFECT = {
  祿: { tone: 'boost', effect: '這一塊有資源會流過來，起步比別人順。' },
  權: { tone: 'shift', effect: '這一塊會被推著承擔與主導，想閃也閃不掉。' },
  科: { tone: 'boost', effect: '這一塊容易被看見、被肯定，名聲上加分。' },
  忌: { tone: 'drag', effect: '這一塊要反覆處理，也是你最放不下的地方。' },
};

/** 亮度 → 主星的力道。強不等於好，只表示這顆星的特質有多明顯。 */
const BRIGHTNESS_TONE = {
  廟: { tone: 'boost', effect: '主星的特質發揮得完整，平常就看得出來。' },
  旺: { tone: 'boost', effect: '主星的特質穩定發揮，不容易忽強忽弱。' },
  得: { tone: 'boost', effect: '主星的特質用得上，只是不到最完整。' },
  利: { tone: 'neutral', effect: '主星的特質中規中矩。' },
  平: { tone: 'neutral', effect: '主星的特質平平，要靠其他條件推一把。' },
  不: { tone: 'drag', effect: '主星的特質使不太出來，環境順的時候才明顯。' },
  陷: { tone: 'drag', effect: '主星的特質不容易發揮，需要更長的時間與更多支持。' },
};

const bareName = (raw) => String(raw).replace(/[(（].*$/, '').trim();

function palaceGroupOf(palaceName) {
  for (const [group, palaces] of Object.entries(PALACE_GROUPS)) {
    if (palaces.includes(palaceName)) return group;
  }
  return null;
}

/**
 * 這顆星落在這一宮的具體表現。
 *
 * 刻意跟「通則效果」分開存放，不是二選一。原因是逐宮文案是中性描述的
 * （火星在官祿宮寫的是「工作有衝勁，適合節奏快的環境」），
 * 把它塞進「但也要算進去…」這種帶語氣的句型會前後矛盾——
 * 明明是煞星，讀起來卻像在誇你。
 * 所以：帶語氣的句子一律用通則效果，逐宮文案只當補充細節，不套語氣框。
 */
function landingDetailOf(palaceName, starName) {
  const perPalace = AUX_APPLICATION[starName]?.[palaceName];
  if (perPalace) return perPalace;
  const group = palaceGroupOf(palaceName);
  return (group ? MINOR_APPLICATION[starName]?.[group] : null) ?? null;
}

/**
 * 一個宮位的完整修正層。
 *
 * @param {object} palace     ziWei.palaces 裡的一個宮位
 * @param {object} [options]
 * @param {boolean} [options.borrowed]     這一宮是空宮借來的星（借的是星，輔星煞曜留在對宮）
 * @param {string}  [options.borrowedFrom] 借自哪一宮
 * @returns {{
 *   palaceName: string,
 *   summary: string,      一句話：這一宮整體被改成什麼樣子（無術語）
 *   plainLines: string[], 白話模式用：不出現星名，只講「實際上會怎樣」
 *   hasSignal: boolean,
 *   technical: { items, boosts, drags, shifts, lines }  學習模式與 AI 用：標明是哪一顆星造成的
 * }}
 */
export function composePalaceModifiers(palace, options = {}) {
  if (!palace) return null;
  const palaceName = palace.name;
  const items = [];

  // effect  帶語氣的通則說明，用在「實際上會順一些／但也要算進去」這種句型
  // detail  這顆星落在這一宮的具體表現，中性描述，不套語氣框
  const push = (star, category, tone, effect, source, detail = null) => {
    if (!effect) return;
    items.push({ star, category, tone, effect, source, detail });
  };

  // 1) 廟旺：主星的力道。放第一個，因為它修飾的是骨架本身。
  const lead = (palace.majorStars ?? [])[0];
  if (lead?.brightness && BRIGHTNESS_TONE[lead.brightness]) {
    const b = BRIGHTNESS_TONE[lead.brightness];
    push(`${lead.name}（${lead.brightness}）`, 'brightness', b.tone, b.effect, '廟旺利陷');
  }

  // 2) 生年四化：決定能量往哪走，屬於主結構而不是補充
  for (const star of palace.majorStars ?? []) {
    const mutagen = String(star.transformation ?? '').replace(/^化/, '');
    const info = MUTAGEN_EFFECT[mutagen];
    if (info) push(`${star.name}化${mutagen}`, 'mutagen', info.tone, info.effect, '生年四化');
  }

  // 3) 六吉、六煞、祿馬、值得注意的雜曜
  //    借星安宮時這些留在對宮不跟著借（借的是星，不是宮），所以借來的宮位只算它自己有的。
  for (const raw of palace.minorStars ?? []) {
    const name = bareName(raw);
    const detail = landingDetailOf(palaceName, name);
    if (AUSPICIOUS_MINOR.has(name)) {
      push(name, 'auspicious', 'boost', AUSPICIOUS_EFFECT[name], '六吉星', detail);
    } else if (MALEFIC_MINOR.has(name)) {
      push(name, 'malefic', 'drag', MALEFIC_EFFECT[name], '六煞星', detail);
    } else if (RESOURCE_STARS[name]) {
      push(name, 'resource', RESOURCE_STARS[name].tone, RESOURCE_STARS[name].effect, '祿馬', detail);
    } else if (NOTABLE_MINOR[name]) {
      push(name, 'minor', NOTABLE_MINOR[name].tone, NOTABLE_MINOR[name].effect, '雜曜', detail);
    }
  }

  const boosts = items.filter((i) => i.tone === 'boost');
  const drags = items.filter((i) => i.tone === 'drag');
  const shifts = items.filter((i) => i.tone === 'shift');

  return {
    palaceName,
    borrowed: Boolean(options.borrowed),
    borrowedFrom: options.borrowedFrom ?? null,
    // 白話模式讀得到的部分：不出現星名，也不出現廟旺、四化這類詞。
    // 白話模式全站零術語是硬界線（見 tests/reading-modes.mjs），星名也算術語。
    summary: summaryOf(items, boosts, drags, shifts, options),
    plainLines: plainLinesOf(boosts, drags, shifts),
    hasSignal: items.length > 0,
    boostCount: boosts.length,
    dragCount: drags.length,
    shiftCount: shifts.length,
    // 帶星名與術語的部分一律收在 technical 底下。
    // 這個欄位名是全站的約定：叫 technical 的東西只會在學習模式與 AI 提示詞被讀取，
    // 白話面板從不渲染它，可讀性檢查也依這個名字排除。
    technical: {
      items,
      boosts,
      drags,
      shifts,
      lines: items.map((i) => `${i.source}｜${i.star}：${i.effect}${i.detail ? `落在${palaceName}：${i.detail}` : ''}`),
    },
  };
}

/**
 * 一句話講完這一宮被修成什麼樣子。
 *
 * 刻意不給分數或強弱等級：命理沒有公認的權重，給了分數等於發明一套假的精準度，
 * 而使用者會把它當真。這裡只描述「有哪幾種力量在拉」，方向由讀者自己判斷。
 */
function summaryOf(items, boosts, drags, shifts, options) {
  if (!items.length) {
    return options.borrowed
      ? '這一宮沒有輔星煞曜，借來的主星怎麼走，幾乎沒有東西加減。'
      : '這一宮除了主星以外沒有明顯的加減項，主星怎麼說大致就是怎麼回事。';
  }
  const parts = [];
  if (boosts.length) parts.push(`${boosts.length} 項助力`);
  if (drags.length) parts.push(`${drags.length} 項阻力`);
  if (shifts.length) parts.push(`${shifts.length} 項會改變形式的因素`);
  const mix = parts.join('、');
  if (boosts.length && drags.length) {
    return `這一宮同時有${mix}，是拉扯型的：順的時候很順，卡的時候也真的卡，不能只看主星的說法。`;
  }
  if (drags.length && !boosts.length) {
    return `這一宮有${mix}，主星的方向不變，但過程會比字面上寫的費力。`;
  }
  if (boosts.length && !drags.length) {
    return `這一宮有${mix}，主星的方向不變，實際做起來比字面上寫的順。`;
  }
  return `這一宮有${mix}，主題不變，但呈現的方式會跟單看主星不太一樣。`;
}

/**
 * 白話模式用的修正句：只講「實際上會怎樣」，不出現星名。
 * 白話模式全站零術語是硬界線（見 tests/reading-modes.mjs），星名也算術語。
 */
function plainLinesOf(boosts, drags, shifts) {
  const lines = [];
  const take = (list, n) => list.slice(0, n).map((i) => i.effect);
  for (const effect of take(boosts, 2)) lines.push(`實際上會順一些：${effect}`);
  for (const effect of take(drags, 2)) lines.push(`但也要算進去：${effect}`);
  for (const effect of take(shifts, 1)) lines.push(`呈現的方式會偏向：${effect}`);
  return lines;
}

/**
 * 整張盤十二宮的修正層，給 AI 提示詞與完整報告用。
 * 依「訊號多寡」排序，讓最值得注意的宮位排前面。
 */
export function composeChartModifiers(ziWei) {
  return (ziWei?.palaces ?? [])
    .map((palace) => composePalaceModifiers(palace))
    .filter(Boolean)
    .sort((a, b) => b.technical.items.length - a.technical.items.length);
}

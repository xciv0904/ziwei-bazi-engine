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
  PALACE_LIFE_WORD,
} from '../data/learning-mode.js';
import starPalaceApp from '../data/star-palace-application.json' with { type: 'json' };

const AUX_APPLICATION = starPalaceApp['吉煞祿馬落宮'];
const MINOR_APPLICATION = starPalaceApp['雜曜落宮'];
const PALACE_GROUPS = starPalaceApp['宮位分類'];

/** 祿存與天馬不屬六吉六煞，但影響力不輸它們，南派讀盤一定看 */
const RESOURCE_STARS = {
  祿存: { tone: 'boost', effect: '有實際的資源可以守住，不容易全空' },
  天馬: { tone: 'shift', effect: '{領域}會一直動，靜不下來也留不住' },
};

/**
 * 雜曜裡影響判讀方向、值得寫進修正層的那幾顆。
 * 其餘雜曜留在清單與小百科即可——每一顆都寫進結論，等於每個人都有一堆修正句，
 * 反而稀釋了真正重要的訊號。
 */
const NOTABLE_MINOR = {
  天空: { tone: 'drag', effect: '想得多、落實得少，計畫容易停在紙上' },
  截路: { tone: 'drag', effect: '中途會卡一下，時機常常不對' },
  旬空: { tone: 'drag', effect: '看起來有、實際抓不到，需要更長的時間才落定' },
  空亡: { tone: 'drag', effect: '這一塊的成果比較留不住' },
  天刑: { tone: 'shift', effect: '自我要求嚴，也容易跟規矩、紀律扯上關係' },
  天姚: { tone: 'shift', effect: '人際與情感的成分變重，靠感覺推進的比例高' },
  紅鸞: { tone: 'boost', effect: '喜事與人緣帶來的機會比較多' },
  天喜: { tone: 'boost', effect: '氣氛熱絡，容易有讓人開心的進展' },
  咸池: { tone: 'shift', effect: '吸引力強，也容易被感覺牽著走' },
  華蓋: { tone: 'shift', effect: '偏向獨處與鑽研，熱鬧的場合反而不自在' },
  孤辰: { tone: 'drag', effect: '習慣自己扛，關係上比較疏離' },
  寡宿: { tone: 'drag', effect: '心理上容易覺得只有自己一個人' },
  龍池: { tone: 'boost', effect: '手上的技藝與品味加分' },
  鳳閣: { tone: 'boost', effect: '審美與儀態加分，給人的印象好' },
  三台: { tone: 'boost', effect: '地位與名分上比較站得住' },
  八座: { tone: 'boost', effect: '有位置、有人抬舉' },
  恩光: { tone: 'boost', effect: '該被看見的時候會被看見' },
  天貴: { tone: 'boost', effect: '容易得到有份量的人賞識' },
  台輔: { tone: 'boost', effect: '有名分或頭銜上的助力' },
  封誥: { tone: 'boost', effect: '努力比較容易被正式認可' },
  天哭: { tone: 'drag', effect: '心情上容易往壞處想' },
  天虛: { tone: 'drag', effect: '容易覺得虛、提不起勁' },
  陰煞: { tone: 'drag', effect: '暗處的干擾多，不容易查得清楚' },
  天月: { tone: 'drag', effect: '精神與體力容易被磨掉' },
  解神: { tone: 'boost', effect: '麻煩多半能化掉，不會一路壞到底' },
  天巫: { tone: 'boost', effect: '有往上升遷或承接的機會' },
  天壽: { tone: 'boost', effect: '底子厚，撐得久' },
  天才: { tone: 'boost', effect: '反應快，學東西上手' },
};

/** 生年四化在這一宮代表什麼——這是主結構的一部分，不是補充 */
// {領域} 會換成這一宮實際對應的生活用語（感情與伴侶關係、金錢與收入…）。
// 原本寫死「這一塊」，讀者在主題分析看到「這一塊有資源會流過來」完全不知道指什麼。
const MUTAGEN_EFFECT = {
  祿: { tone: 'boost', effect: '{領域}有資源會流過來，起步比別人順' },
  權: { tone: 'shift', effect: '{領域}會被推著承擔與主導，想閃也閃不掉' },
  科: { tone: 'boost', effect: '{領域}容易被看見、被肯定' },
  忌: { tone: 'drag', effect: '{領域}要反覆處理，也是你最放不下的地方' },
};

/** 亮度 → 主星的力道。強不等於好，只表示這顆星的特質有多明顯。 */
const BRIGHTNESS_TONE = {
  廟: { tone: 'boost', effect: '主星的特質發揮得完整，平常就看得出來' },
  旺: { tone: 'boost', effect: '主星的特質穩定發揮，不容易忽強忽弱' },
  得: { tone: 'boost', effect: '主星的特質用得上，只是不到最完整' },
  利: { tone: 'neutral', effect: '主星的特質中規中矩' },
  平: { tone: 'neutral', effect: '主星的特質平平，要靠其他條件推一把' },
  不: { tone: 'drag', effect: '主星的特質使不太出來，環境順的時候才明顯' },
  陷: { tone: 'drag', effect: '主星的特質不容易發揮，需要更長的時間與更多支持' },
};

/**
 * 修正層的「讀者視角」文案。
 *
 * 跟 learning-mode.js 那份刻意分開，因為兩邊在回答不同的問題：
 *   learning-mode 回答「這顆星是什麼作用」——教學視角，學的人要認得這顆星。
 *   這一份回答「所以我會怎樣」——讀者視角，讀的人要能對到自己身上。
 *
 * 寫作三個原則（使用者的原話是要讓人覺得「對，這就是在講我」）：
 *   1. 第二人稱、口語。「你」開頭，不用「主體」「該宮」這種距離感的詞。
 *   2. 給得出畫面。抽象評語（加分、有助力、不容易全空）沒有人會有感覺，
 *      要寫成一個他真的經歷過的場景：「臨場要你說話，你多半接得住」。
 *   3. 連代價一起講。只講好處會像算命攤的話術，講出代價才會被信任。
 */
const VOICE = {
  // 六吉：改變「做起來順不順」
  左輔: '事情做到一半會有人接手，你不太需要從頭扛到尾',
  右弼: '你還沒開口，就已經有人替你處理掉一部分',
  文昌: '複雜的事你有辦法整理成別人聽得懂的版本，白紙黑字對你有利',
  文曲: '臨場要你說話，你多半接得住，還講得比準備過的人自然',
  天魁: '關鍵時刻會有檯面上有份量的人願意替你說話',
  天鉞: '有人在你不知道的地方替你鋪過路，通常事後你才發現',

  // 六煞：改變「力道與代價」
  擎羊: '你出手快也出手重，推得動事情，也容易在過程裡傷到人或自己',
  陀羅: '這件事常常拖著不上不下，你知道該處理，卻一直繞回原點',
  火星: '你會突然爆發一下，來得快去得也快，事後常覺得剛剛沒必要',
  鈴星: '你不太表現出來，但它在心裡悶著燒，累積久了才一次出來',
  地空: '你想的比做的多，很多計畫停在腦子裡就沒有下文',
  地劫: '過程中會實際損耗掉一些東西——時間、錢或關係，不是全部都留得住',

  // 祿馬
  祿存: '你手上留得住一份底，不至於全部押空',
  天馬: '停不下來，也留不太住，你在這裡一直是移動的狀態',

  // 生年四化：{領域} 會換成這一宮實際的生活用語
  祿: '{領域}的資源會自己找上你，起步比別人容易',
  權: '{領域}這一塊你躲不掉，最後多半是你在扛、你在決定',
  科: '{領域}你做的事會被看見，名聲上你是加分的',
  忌: '{領域}是你最放不下的一塊，會反覆回來處理，也最容易卡住',

  // 雜曜：補「以什麼形式呈現」
  天空: '你腦子裡的版本總是比做出來的漂亮',
  截路: '每次要成的時候會卡一下，時機老是差一點',
  旬空: '看起來有、真的要用的時候抓不到，需要更久才會落定',
  空亡: '你花力氣做出來的東西，比較不容易留在手上',
  天刑: '你對自己要求很嚴，也容易跟規矩、紀律、法律扯上關係',
  天姚: '你靠感覺推進的比例很高，人跟情緒在這件事裡佔的份量比你以為的重',
  紅鸞: '好事常常是人帶來的，不是你自己找來的',
  天喜: '氣氛一熱起來，事情就跟著動了',
  咸池: '你很容易吸引到人，也很容易被感覺牽著走',
  華蓋: '你一個人的時候最有產能，熱鬧的場合反而消耗你',
  孤辰: '你習慣自己扛，久了跟人的距離就拉開了',
  寡宿: '就算旁邊有人，你心裡還是覺得只有自己一個',
  龍池: '你手上的技藝跟品味是別人學不來的那種',
  鳳閣: '你給人的第一印象跟儀態，會替你先加一次分',
  三台: '你在位置跟名分上站得住，別人不太會越過你',
  八座: '會有人願意抬你一把，把你放到該在的位置',
  恩光: '該被看見的時候你會被看見，不會白做',
  天貴: '有份量的人會賞識你，而且是真的看得懂你的那種',
  台輔: '頭銜或名分會替你開一些門',
  封誥: '你的努力比較容易被正式承認，不會只是口頭稱讚',
  天哭: '同一件事你會先想到壞的那一面',
  天虛: '你常覺得虛、提不起勁，說不上來為什麼',
  陰煞: '暗處的干擾多，很多事你查不到真正的原因',
  天月: '這件事會慢慢磨掉你的精神跟體力，不是一次打垮你',
  解神: '麻煩多半化得掉，不會一路壞到底',
  天巫: '你有往上接手、承接位置的機會',
  天壽: '你的底子比看起來厚，撐得比別人久',
  天才: '你反應快，同樣的東西你上手比較快',
};

/**
 * 逐宮文案裡的「該宮」要換成讀者聽得懂的稱呼。
 *
 * 資料庫寫的是「與該宮的人在思考上合拍」——「該宮」是模板留下來的字，
 * 直接印出去讀者根本不知道在說誰。六親宮換成實際的人（另一半、手足、晚輩…），
 * 其餘宮位換成生活領域。
 */
const PALACE_PERSON = {
  兄弟宮: '手足', 夫妻宮: '另一半', 子女宮: '晚輩', 僕役宮: '朋友與合作對象', 父母宮: '長輩',
  命宮: '你自己', 財帛宮: '金錢', 疾厄宮: '身體', 遷移宮: '外面的人', 官祿宮: '工作上的人',
  田宅宮: '家人', 福德宮: '你自己',
};

function humanize(text, palaceName) {
  const person = PALACE_PERSON[palaceName] ?? '這一塊';
  const domain = PALACE_LIFE_WORD[palaceName] ?? '這一塊';
  return String(text)
    .replaceAll('該宮的人', person)
    .replaceAll('該宮的相處', `跟${person}的相處`)
    .replaceAll('該宮的緣分', `跟${person}的緣分`)
    .replaceAll('該宮的關係', `跟${person}的關係`)
    .replaceAll('該宮相關的', `${domain}相關的`)
    .replaceAll('該宮的', `${domain}的`)
    .replaceAll('該宮', domain);
}

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
  // effect  教學視角：這顆星的作用（學習模式與 AI 用，跟小百科的說法一致）
  // voice   讀者視角：所以我會怎樣（白話修正句用，第二人稱、給得出畫面）
  // detail  這顆星落在這一宮的具體表現，中性描述，不套語氣框
  const push = (star, category, tone, effect, source, detail = null, voiceKey = null) => {
    if (!effect) return;
    items.push({ star, category, tone, effect, source, detail, voice: VOICE[voiceKey ?? star] ?? effect });
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
    if (info) push(`${star.name}化${mutagen}`, 'mutagen', info.tone, info.effect, '生年四化', null, mutagen);
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
    summary: summaryOf(items, boosts, drags, shifts, { ...options, palaceName }),
    plainLines: plainLinesOf(items, palaceName),
    narrative: narrativeOf(items, palaceName),
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
      lines: items.map((i) => `${i.source}｜${i.star}：${i.effect.replaceAll('{領域}', PALACE_LIFE_WORD[palaceName] ?? '這一塊')}。${i.detail ? `落在${palaceName}：${i.detail}` : ''}`),
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
  const domain = PALACE_LIFE_WORD[options.palaceName] ?? '這一塊';
  if (boosts.length && drags.length) {
    return `${domain}同時有${mix}，是拉扯型的：順的時候很順，卡的時候也真的卡，不能只看主星的說法。`;
  }
  if (drags.length && !boosts.length) {
    return `${domain}有${mix}，主星的方向不變，但過程會比字面上寫的費力。`;
  }
  if (boosts.length && !drags.length) {
    return `${domain}有${mix}，主星的方向不變，實際做起來比字面上寫的順。`;
  }
  return `${domain}有${mix}，主題不變，但呈現的方式會跟單看主星不太一樣。`;
}

/**
 * 白話模式用的修正句。
 *
 * 第一版每一顆星各給一行，前面統一冠上「實際上會順一些：」，畫面長這樣：
 *
 *   實際上會順一些：這一塊有資源會流過來，起步比別人順。
 *   實際上會順一些：口才與才藝加分，臨場表達比別人自然。
 *
 * 使用者的回饋是「顯得奇怪，反而令人摸不著頭緒」。三個原因都成立：
 *   1. 同樣的開頭連續出現，像機器產生的。
 *   2.「這一塊」沒有指涉，讀者不知道在講哪件事。
 *   3. 廟旺被混進「同宮還有其他星」，但廟旺講的是主星自己，不是別的星。
 *
 * 現在一個方向合成一句，主詞講清楚是哪一塊生活，廟旺退出白話修正句
 * （主星的力道本來就已經寫在既有文案裡，見 compose-plain.js 的 differentiatedContext）。
 * 仍然不出現星名——白話模式全站零術語是硬界線（見 tests/reading-modes.mjs）。
 */
const trimEnd = (text) => String(text).replace(/[。，、；\s]+$/, '');

// 框架句刻意不提「同宮的星」——那是命理視角。讀者不在意是哪顆星，
// 他在意的是「所以我是怎樣」，句子要能直接接到自己身上。
//
// 每種各給四個寫法，依宮位輪替。完整報告一頁會出現四段修正層，
// 用同一句開頭會立刻露出模板感——而且可讀性檢查本來就會擋下一頁的重複句。
const LEAD = {
  mutagen: [
    (t) => `還有一件出生就定下來、不會變的事：${t}。`,
    (t) => `這一塊有個一輩子的底色：${t}。`,
    (t) => `從出生就帶著、也改不掉的一項：${t}。`,
    (t) => `另外有一條貫穿一生的線：${t}。`,
  ],
  boost: [
    (t) => `這件事你還有別人不一定有的條件：${t}。`,
    (t) => `而且你手上有幾張別人沒有的牌：${t}。`,
    (t) => `不只如此，你在這裡是有本錢的：${t}。`,
    (t) => `你在這一塊其實被幫了不少：${t}。`,
  ],
  drag: [
    (t) => `但同時，${t}。`,
    (t) => `代價也要一起算：${t}。`,
    (t) => `不過這裡有個一直在拉的地方：${t}。`,
    (t) => `另一面是，${t}。`,
  ],
  shift: [
    (t) => `還有一點很像你：${t}。`,
    (t) => `這件事在你身上的樣子是：${t}。`,
    (t) => `而且你處理它的方式偏這一種：${t}。`,
    (t) => `說得更準一點：${t}。`,
  ],
};

/**
 * 依宮名挑句型變體。
 *
 * 一開始用「宮位在十二宮裡的序號 % 4」，但完整報告固定取命宮、官祿宮、夫妻宮、疾厄宮
 * 這四宮，序號是 0、8、2、5——0 與 8 對 4 取餘數相同，同一頁就出現兩句一樣的收尾。
 * 任何線性對應都躲不掉（差 8 的兩個數對 4 同餘），所以改用字元雜湊，
 * 並確認這四宮拿到的是四個不同的變體。
 */
const variantOf = (palaceName, count) => {
  let hash = 0;
  for (const ch of String(palaceName)) hash = (hash * 26 + ch.codePointAt(0)) % 9973;
  return hash % count;
};

const leadOf = (kind, palaceName) => LEAD[kind][variantOf(palaceName, LEAD[kind].length)];

/**
 * 完整報告用的敘事版。
 *
 * 為什麼要第二種寫法：重點摘要與完整報告取的是同一張卡，
 * 兩頁印出一模一樣的三句話，就會回到「這兩頁根本一樣」那個老問題
 * （readability.mjs 有一條檢查專門擋這件事）。
 *
 * 第一版寫成「你身上有兩股力量同時在拉…所以好的時候特別好，卡的時候也特別耗」，
 * 使用者的回饋是「有看沒懂」。三個毛病，最嚴重的是第一個：
 *
 *   1. 那個關係是我編的。助力與阻力來自不同的星，講的是不同面向，
 *      不是同一件事的正反面。「你給人的第一印象會替你加分」跟「過程中會損耗掉
 *      一些東西」根本不對立，硬套「一邊…另一邊…」的拉扯框架，
 *      讀者會覺得哪裡不對卻說不出來。這也越過了本專案不自行新增命理結論的界線。
 *   2. 框架先行。「兩股力量在拉」是分析用的比喻，讀者要先解碼才讀得到內容。
 *   3. 結尾是套話。「好的時候特別好，卡的時候也特別耗」對誰都成立。
 *
 * 現在直說：這一塊有幾件事同時成立，各是什麼。不詮釋它們之間的關係，
 * 因為資料支持不了；讓具體的句子佔最大篇幅，讀者自己就對得上。
 */
function narrativeOf(items, palaceName) {
  const domain = PALACE_LIFE_WORD[palaceName] ?? '這一塊';
  // 同樣優先用逐宮文案，理由見 plainLinesOf
  const say = (item) => trimEnd(humanize(item.detail ?? item.voice, palaceName).replaceAll('{領域}', domain));
  const others = items.filter((i) => i.category !== 'brightness' && i.category !== 'mutagen');
  if (!others.length) return '';

  // 兩頁引用同一批命盤事實是必然的（就是同一張命盤），但整段讀起來不能一樣。
  // 逐條版一項一句、句末是句號；這裡把幾項串進同一句，句子邊界就不會跟逐條版重疊。
  // 只取兩項也是為了長度——可讀性檢查擋 78 字以上的句子。
  // （readability.mjs 另有一條會算兩頁的相同句比例，超過門檻就擋。）
  const picked = others.length > 2 ? others.slice(1, 3) : others.slice(0, 2);
  const facts = picked.map(say).join('、');

  // 這段原本長這樣：
  //   「${domain}這一塊，除了上面說的，還有幾件事一起在影響：${facts}。
  //     把這幾件事放進去，上面那段話才會對得上你自己的經驗。」
  // 使用者回報「感覺是贅字」，看了實際輸出完全同意：
  //   1. 卡片標題已經是「這一塊，你跟別人不一樣的地方」，內文再寫「${domain}這一塊」是重複；
  //   2. 「除了上面說的」和收尾句的「上面那段話」，同一件事指了兩次；
  //   3. 收尾句是後設說明（在講「這段話該怎麼讀」），佔的字數比事實本身還多；
  //   4. 只有一項時仍寫「還有幾件事」，數量不對。
  // 真正有資訊的只有 facts。所以只留一句：一個帶資訊的開頭 + 事實，收尾句整段砍掉。
  //
  // 開頭不能直接省成裸事實：逐條版（plainLinesOf）用的是同一批命盤事實，
  // 兩邊若都輸出一模一樣的句子會被 readability.mjs 的跨頁重複句檢查擋下。
  // 「同樣是${domain}」這個開頭同時解決兩件事——句子與逐條版不同，而且它交代了
  // 這幾項跟前面談的是同一個領域，這是原本那堆鋪陳唯一有用的資訊。
  const countWord = picked.length > 1 ? '這幾項' : '這一項';
  return `同樣是${domain}，你還多了${countWord}：${facts}。`;
}

function plainLinesOf(items, palaceName) {
  const domain = PALACE_LIFE_WORD[palaceName] ?? '這一塊';

  // 優先用「這顆星落在這一宮」的文案，通性只在沒有逐宮資料時才用。
  //
  // 這是使用者第二次回報後才改的。原本一律用通性文案，於是夫妻宮會出現
  //「你反應快，同樣的東西你上手比較快」（天才的通性），讀者的原話是
  //「不明白這跟感情這塊的關聯性」——完全正確，那句話跟感情沒有關係。
  // 逐宮資料本來就有（star-palace-application.json，168 + 152 條），
  // 我先前為了避免語氣矛盾把它降級成補充細節，代價是句子跟宮位對不上，太大了。
  const say = (item) => trimEnd(humanize(item.detail ?? item.voice, palaceName).replaceAll('{領域}', domain));

  const fromOtherStars = items.filter((i) => i.category !== 'brightness');
  const mutagens = fromOtherStars.filter((i) => i.category === 'mutagen');
  const others = fromOtherStars.filter((i) => i.category !== 'mutagen');
  const lines = [];

  // 生年四化屬主結構，先講，而且要標明它是一輩子的。
  // 四化本來就是依領域寫的，不需要逐宮文案。
  for (const item of mutagens.slice(0, 1)) {
    lines.push(leadOf('mutagen', palaceName)(trimEnd(item.voice.replaceAll('{領域}', domain))));
  }

  // 不再標「幫得上的／要留意的」。
  //
  // 試過兩次都出問題：逐宮文案是中性描述，跟星的吉煞分類常常對不起來——
  // 火星在官祿宮寫的是「工作有衝勁」（被標成要留意），
  // 某顆吉星在命宮寫的是「責任感重，心理負擔隨之而來」（被標成幫得上）。
  // 標籤一錯，整段讀起來像在自相矛盾，比不標更糟。
  //
  // 而且使用者要的本來就不是好壞分類，是「這跟我有什麼關係」。
  // 所以直接把事實列出來，好壞由讀者自己判斷——這也是這個站一貫的做法。
  for (const item of others.slice(0, 3)) {
    lines.push(`${say(item)}。`);
  }
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

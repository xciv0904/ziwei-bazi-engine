// src/engines/compose-plain.js — 「白話摘要」生成引擎
//
// 目的:把紫微/八字既有的專業排盤資料,組裝成「先白話、後專業」兩層結構的分析卡片,
// 提供給解讀報告頁(main.js renderReport)使用。
//
// 設計原則(對應改版需求):
//   1. 不重新排盤、不重算星曜宮位四化十神喜用神——全部沿用既有引擎(compose.js /
//      compose-bazi.js / compose-yongshen.js / compose-luck.js)算出來的結果。
//      這個檔案只負責「把結果包裝成白話卡片」。
//   2. 白話內容庫(14主星性格/主星×領域延伸/十神/日主五行/五行偏多偏弱)放在
//      plain-star-profiles.json 與 plain-bazi-profiles.json,本檔案只做組裝與挑選邏輯,
//      不在這裡塞寫死的長文字。
//   3. 每張卡片固定輸出 7 段式白話結構 + 1 段預設收合的專業命理依據(technical),
//      technical 內再細分 4 小節:命盤資料 / 專業判斷 / 白話對應 / 限制與需綜合參考處。
//   4. 同一命盤特質不會在多個主題重複完整說明——領域延伸主題(財帛/事業/感情/健康)
//      只寫「這個特質在這個領域怎麼表現」,不重講一次完整性格解釋。
import starDb from '../data/plain-star-profiles.json' with { type: 'json' };
import baziDb from '../data/plain-bazi-profiles.json' with { type: 'json' };
import overlaysDb from '../data/luck-cycle-overlays.json' with { type: 'json' };
import { composePalaceReading } from './compose.js';
import { composeBaZiReading } from './compose-bazi.js';
import { computeYongShen, FAVOR_IMPACT, AVOID_IMPACT } from './compose-yongshen.js';
import { composeZiWeiLuck, composeBaZiLuck } from './compose-luck.js';

const STAR_PROFILES = starDb['主星白話性格'];
const STAR_DOMAIN = starDb['主星白話領域延伸'];
const DAYMASTER_PROFILES = baziDb['日主五行白話氣質'];
const TEN_GOD_PROFILES = baziDb['十神白話性格'];
const ELEMENT_IMBALANCE = baziDb['五行偏多偏弱白話'];
const BZ_CATS = overlaysDb['八字大運流年類別疊加'];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const oppositeBranch = (b) => BRANCHES[(BRANCHES.indexOf(b) + 6) % 12];
const branchOf = (p) => p.position[1];

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const cap = (arr, n) => [...new Set(arr.filter(Boolean))].slice(0, n);

const DOMAIN_LABEL = { money: '財務', career: '工作', relationship: '感情', health: '健康與壓力反應' };
const DOMAIN_REFLECTION = {
  money: '回想最近一次重要的花錢或理財決定,是不是也照著這個模式在做?',
  career: '你現在的工作內容,有多少符合上面提到的這些傾向?',
  relationship: '在感情裡,你是否也常常出現剛剛提到的這些反應?',
  health: '你最近一次感覺特別累的時候,是不是也是這樣的狀況?',
};

// 忌用神/大運類別另外需要的簡短建議(FAVOR_IMPACT/AVOID_IMPACT 是完整說明句,
// 這裡另外準備「可執行」的動作版本,避免建議欄位只是把說明句重講一次)
const YONGSHEN_ADVICE_FAVOR = {
  印: '遇到需要學習或有貴人相助的機會,可以多把握,向前輩請教會特別有幫助',
  比劫: '重要的事情上,找信任的夥伴一起合作,會比單打獨鬥更順',
  食傷: '把想法說出來、做出來,會比悶著不表達更容易帶來機會',
  財: '把精力放在能落地、能看到具體成果的事情上,會比較有收穫',
  官殺: '適度接受挑戰與規範,反而能幫助自己成長得更快',
};
const YONGSHEN_ADVICE_AVOID = {
  印: '想太多、遲遲不決定的時候,給自己設一個決定的時間點',
  比劫: '涉及借貸、擔保、合夥的事,多留一個心眼,不要單憑人情答應',
  食傷: '重要場合發言前,多想一步,避免話說得太直接',
  財: '追逐眼前利益前,先想清楚這是否符合長期的生活節奏',
  官殺: '長期處在高壓環境時,記得設停損點,不要硬撐到底',
};

const STRENGTH_PLAIN = {
  身強: '自帶的能量偏旺,適合主動把力氣用出去、發揮所長',
  身弱: '自帶的能量偏弱,比較需要補給與支持,不用凡事硬撐',
  中和: '能量大致平衡,順著當下的節奏調整就好',
};

function technicalBlock({ chartData, judgment, plainMapping, warnings }) {
  return {
    chartData,
    judgment,
    plainMapping,
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [warnings].filter(Boolean),
  };
}

// ---------- 紫微:單一宮位的主星解析(命宮/財帛宮/官祿宮/夫妻宮/疾厄宮 共用) ----------

function resolvePalaceStars(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const palace = ziWei.palaces.find((p) => p.name === palaceName);
  const opposite = byBranch[oppositeBranch(branchOf(palace))];
  const borrowed = palace.majorStars.length === 0;
  const stars = borrowed ? (opposite?.majorStars ?? []) : palace.majorStars;
  return { palace, opposite, borrowed, stars };
}

function borrowedOpener(palaceName, domain) {
  if (palaceName === '命宮') {
    return '你的個性不是天生固定的類型,而是會隨著環境、經歷與後天選擇逐漸成形。';
  }
  const label = DOMAIN_LABEL[domain] ?? palaceName;
  return `${label}方面沒有專屬的固定主星坐鎮,這代表這個領域的樣貌比較不是天生註定,而是更容易隨環境、經驗與你的選擇而變化,以下參考對宮呼應的星曜傾向。`;
}

function mergeExtra(target, extraSrc, { lifeMax = 4, challengeMax = 3, adviceMax = 3 } = {}) {
  if (!extraSrc) return target;
  target.lifeExamples = cap([...target.lifeExamples, ...(extraSrc.lifeExamples ?? [])], lifeMax);
  target.challenges = cap([...target.challenges, ...(extraSrc.challenges ?? [])], challengeMax);
  target.advice = cap([...target.advice, ...(extraSrc.advice ?? [])], adviceMax);
  return target;
}

function buildDomainExplanation(primary, tag, domainSrc) {
  const p1 = `延續${tag}的傾向,在這件事上,${domainSrc.summary}`;
  const c0 = domainSrc.challenges?.[0];
  const p2 = c0 ? `不過,${c0},這是比較容易出現、也值得留意的地方。` : '這個部分整體來說相對平穩,沒有太特別需要留意之處。';
  return [p1, p2];
}

function starPalaceTopic({ key, title, letter, color, palaceName, domain }, ziWei) {
  const { palace, opposite, borrowed, stars } = resolvePalaceStars(ziWei, palaceName);
  const names = stars.map((s) => s.name).filter((n) => STAR_PROFILES[n]);

  const studyReading = composePalaceReading(palace, opposite, { mode: 'study' });
  const chartData = borrowed
    ? `${palaceName}(本宮無主星,借對宮「${opposite?.name ?? ''}」星曜參看):${stars.map((s) => `${s.name}(亮度${s.brightness}${s.transformation ? `,化${String(s.transformation).replace(/^化/, '')}` : ''})`).join('、') || '無可借星曜'}`
    : `${palaceName}:${stars.map((s) => `${s.name}(亮度${s.brightness}${s.transformation ? `,化${String(s.transformation).replace(/^化/, '')}` : ''})`).join('、')}`;

  if (names.length === 0) {
    // 兩端都沒有主星資料可對應(極少數狀況),仍輸出誠實的 7 段式卡片,不硬套個性描述
    return {
      key, title, letter, color, borrowed,
      summary: `${palaceName}目前沒有足夠的主星資料可以對應到白話性格描述。`,
      explanation: ['這個宮位在你的命盤中屬於比較特殊的組合,沒有主星或可借的對宮星曜可以對應。', '建議直接參考下方「專業命理依據」中的完整宮位資料,或綜合命盤其他宮位交叉判斷。'],
      lifeExamples: [], challenges: [], advice: [],
      reflection: '這個領域對你來說,平常比較容易透過哪些具體的事來感受到?',
      technical: technicalBlock({ chartData, judgment: studyReading.text, plainMapping: '此宮位無主星資料可對應白話摘要。', warnings: '完整判斷請綜合命盤其他宮位、三方四正與大限流年。' }),
    };
  }

  const primary = names[0];
  const secondary = names[1];
  const isPersonality = domain === null;
  const src = isPersonality ? STAR_PROFILES[primary] : STAR_DOMAIN[primary]?.[domain];

  const card = clone({
    summary: src.summary,
    explanation: isPersonality ? src.explanation : buildDomainExplanation(primary, STAR_PROFILES[primary].tag, src),
    lifeExamples: src.lifeExamples ?? [],
    challenges: src.challenges ?? [],
    advice: src.advice ?? [],
  });

  if (secondary) {
    const extraSrc = isPersonality ? STAR_PROFILES[secondary] : STAR_DOMAIN[secondary]?.[domain];
    mergeExtra(card, extraSrc);
  }

  if (borrowed) card.explanation = [borrowedOpener(palaceName, domain), ...card.explanation];

  const reflection = isPersonality ? STAR_PROFILES[primary].reflection : DOMAIN_REFLECTION[domain];
  const tagLabel = names.map((n) => `${n}(${STAR_PROFILES[n]?.tag ?? ''})`).join('、');

  return {
    key, title, letter, color, borrowed,
    summary: card.summary,
    explanation: card.explanation,
    lifeExamples: cap(card.lifeExamples, 4),
    challenges: cap(card.challenges, 3),
    advice: cap(card.advice, 3),
    reflection,
    technical: technicalBlock({
      chartData,
      judgment: studyReading.text,
      plainMapping: `以上專業判斷,對應到白話摘要中的:${tagLabel}。`,
      warnings: '此處僅呈現單一宮位的基礎判斷,完整解讀仍需綜合三方四正、四化飛星與大限流年等因素,本區塊為輔助參考、非最終定論。',
    }),
  };
}

// ---------- 紫微:大限流年重點(時間軸主題,沿用既有大限/流年組裝結果,不另建內容庫) ----------

function ziweiTimeTopic(ziWei, zwLuck) {
  const studyLuck = composeZiWeiLuck(ziWei, { mode: 'study' });
  const parts = [];
  if (zwLuck.decadal) parts.push({ scope: zwLuck.annual ? '大限' : '大限與流年', range: `${zwLuck.decadal.ageRange.replace('~', '–')}歲`, palaceName: zwLuck.decadal.palaceName });
  if (zwLuck.annual) parts.push({ scope: '流年', range: `${zwLuck.annual.year}年`, palaceName: zwLuck.annual.palaceName });

  if (parts.length === 0) {
    return null;
  }

  const enriched = parts.map((part) => {
    const { stars } = resolvePalaceStars(ziWei, part.palaceName);
    const primary = stars.map((s) => s.name).find((n) => STAR_PROFILES[n]);
    const profile = primary ? STAR_PROFILES[primary] : null;
    return { ...part, primary, profile };
  });

  const lead = enriched[0];
  const summary = lead.profile
    ? `這段期間(${lead.range})的焦點落在「${lead.palaceName}」,帶著${lead.profile.tag}的傾向:${lead.profile.summary}`
    : `這段期間(${lead.range})的焦點落在「${lead.palaceName}」。`;

  const explanation = enriched.map((part) => part.profile
    ? `${part.scope}(${part.range}),焦點落在「${part.palaceName}」,這裡的星曜組合帶有${part.profile.tag}的傾向,${part.profile.summary}`
    : `${part.scope}(${part.range}),焦點落在「${part.palaceName}」,詳細判斷請參考下方專業命理依據。`);

  const base = lead.profile ?? {};
  const chartData = enriched.map((p) => `${p.scope}:${p.range},落於「${p.palaceName}」宮`).join('；');
  const judgment = [studyLuck.decadal?.text, studyLuck.annual?.text].filter(Boolean).join('\n\n');

  return {
    key: 'xian', title: '大限・流年重點', letter: '限', color: 'var(--gold)',
    summary,
    explanation,
    lifeExamples: cap(base.lifeExamples ?? [], 3),
    challenges: cap(base.challenges ?? [], 2),
    advice: cap(base.advice ?? [], 2),
    reflection: '這段時間,你有沒有感覺到上面提到的傾向比平常更明顯一些?',
    technical: technicalBlock({
      chartData,
      judgment,
      plainMapping: lead.profile ? `以上專業判斷,對應到白話摘要中的:${lead.primary}(${lead.profile.tag})。` : '此區間之判斷請參考完整專業依據。',
      warnings: '大限與流年的完整判斷需綜合命宮三方四正、四化飛星與其他宮位交叉參看,此處僅呈現目前階段的重點提示,並非唯一結論。',
    }),
  };
}

// ---------- 八字:日主分析 ----------

function baziZhuTopic(baZi) {
  const ys = computeYongShen(baZi);
  const profile = clone(DAYMASTER_PROFILES[ys.dayEl]);
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const monthBranch = baZi.fourPillars.monthPillar.branch;

  const explanation = [...profile.explanation, `整體來看,目前的狀態比較偏向「${ys.strength}」:${STRENGTH_PLAIN[ys.strength]}。`];

  return {
    key: 'zhu', title: '日主分析', letter: '主', color: 'var(--gold)',
    summary: profile.summary,
    explanation,
    lifeExamples: cap(profile.lifeExamples, 3),
    challenges: cap(profile.challenges, 2),
    advice: cap(profile.advice, 2),
    reflection: profile.reflection,
    technical: technicalBlock({
      chartData: `日主:${dayStem}(${ys.dayEl}),生於${monthBranch}月;幫身${ys.helpScore}分、抑身${ys.opposeScore}分(月令加權×2)。`,
      judgment: `依扶抑法判定為「${ys.strength}」(各派系取用方式不一,結果僅供參考)。`,
      plainMapping: `以上專業判斷,對應到白話摘要中的:${ys.dayEl}(${profile.tag})。`,
      warnings: '身強身弱的完整判斷需綜合四柱干支、月令與其他刑沖合會等因素,不能只看單一條件。',
    }),
  };
}

// ---------- 八字:五行喜忌(命局五行分布偏多/偏弱) ----------

function baziXijiTopic(baZi, elements) {
  const domEl = elements.dominant?.[0];
  const weakEl = elements.weak?.find((e) => e !== domEl);
  const domProfile = domEl ? ELEMENT_IMBALANCE[domEl]?.dominant : null;
  const weakProfile = weakEl ? ELEMENT_IMBALANCE[weakEl]?.weak : null;

  const explanation = [
    domProfile?.summary ?? '命局五行分布大致平衡,沒有特別突出的部分。',
    weakProfile?.summary ?? '其餘五行的分布大致平衡,沒有特別缺乏的部分。',
  ];

  const chartData = Object.entries(elements.classification ?? {})
    .map(([el, c]) => `${el}:${c.count}顆(${c.level})`).join('、');

  return {
    key: 'xiji', title: '五行喜忌', letter: '喜', color: 'var(--red)',
    summary: domProfile?.summary ?? explanation[0],
    explanation,
    lifeExamples: cap([...(domProfile?.lifeExamples ?? []), ...(weakProfile?.lifeExamples ?? [])], 4),
    challenges: cap([...(domProfile?.challenges ?? []), ...(weakProfile?.challenges ?? [])], 3),
    advice: cap([...(domProfile?.advice ?? []), ...(weakProfile?.advice ?? [])], 3),
    reflection: '你有沒有發現,自己在剛剛提到的這些面向,特別容易出現這種傾向?',
    technical: technicalBlock({
      chartData,
      judgment: elements.text,
      plainMapping: `以上專業判斷,對應到白話摘要中的:${[domEl, weakEl].filter(Boolean).join('、')}。`,
      warnings: '五行數量僅是分布上的參考,實際的喜用神判斷需綜合日主強弱、月令與扶抑法等因素,不能只看數量多寡直接推論喜用神。',
    }),
  };
}

// ---------- 八字:喜用神與忌神 ----------

function baziYongshenTopic(baZi) {
  const ys = computeYongShen(baZi);
  const fav = ys.favorable;
  const avoid = ys.unfavorable;

  const summary = fav.length
    ? `遇到與「${fav[0].element}」有關的人事物或時機,你通常比較容易借上力。`
    : '目前命局喜忌相對中性,整體影響比較平均。';

  const explanation = [
    fav.length ? `${FAVOR_IMPACT[fav[0].role]}。` : '目前沒有特別突出的喜用神方向。',
    avoid.length ? `不過,${AVOID_IMPACT[avoid[0].role]}。` : '忌神的影響目前相對不明顯。',
  ];

  const lifeExamples = cap(fav.map((f) => FAVOR_IMPACT[f.role]), 3);
  const challenges = cap(avoid.map((a) => AVOID_IMPACT[a.role]), 2);
  const advice = cap([
    fav[0] ? YONGSHEN_ADVICE_FAVOR[fav[0].role] : null,
    avoid[0] ? YONGSHEN_ADVICE_AVOID[avoid[0].role] : null,
  ], 2);

  const chartData = `喜用神:${fav.map((f) => `${f.element}(${f.role})`).join('、') || '無'};忌神:${avoid.map((a) => `${a.element}(${a.role})`).join('、') || '無'}。`;

  return {
    key: 'yongshen', title: '喜用神與忌神', letter: '用', color: 'var(--gold)',
    summary, explanation, lifeExamples, challenges, advice,
    reflection: '你有沒有發現,自己在某些特定的人事物出現時,會特別順或特別卡?',
    technical: technicalBlock({
      chartData,
      judgment: `日主${ys.dayEl},判為「${ys.strength}」,依扶抑法取用(各派系取用方式不一,此處採最通行的扶抑法,結果僅供參考)。`,
      plainMapping: '以上專業判斷,對應到白話摘要中列出的喜用神/忌神方向。',
      warnings: '喜用神的判定會因流派(扶抑/調候/通關等)而有不同結論,此處僅呈現其中一種常用方法的結果。',
    }),
  };
}

// ---------- 八字:十神配置 ----------

function baziShishenTopic(baZi) {
  const reading = composeBaZiReading(baZi, { mode: 'public' });
  const studyReading = composeBaZiReading(baZi, { mode: 'study' });
  const counts = {};
  reading.entries.forEach((e) => e.gods.forEach((g) => { counts[g] = (counts[g] ?? 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0]?.[0];

  if (!primary) {
    return {
      key: 'shishen', title: '十神配置', letter: '神', color: 'var(--gold)',
      summary: '目前命盤的十神配置資料不足,無法對應白話描述。',
      explanation: ['請直接參考下方專業命理依據中的完整資料。'],
      lifeExamples: [], challenges: [], advice: [],
      reflection: '',
      technical: technicalBlock({ chartData: '無', judgment: studyReading.text, plainMapping: '無對應資料。', warnings: '' }),
    };
  }

  const profile = clone(TEN_GOD_PROFILES[primary]);
  const pillars = reading.entries.filter((e) => e.gods.includes(primary)).map((e) => e.pillar);
  const explanation = [...profile.explanation, `這個特質在你的${pillars.join('、')}都有出現,是命盤中比較鮮明的一組配置。`];

  return {
    key: 'shishen', title: '十神配置', letter: '神', color: 'var(--gold)',
    summary: profile.summary,
    explanation,
    lifeExamples: cap(profile.lifeExamples, 3),
    challenges: cap(profile.challenges, 2),
    advice: cap(profile.advice, 2),
    reflection: profile.reflection,
    technical: technicalBlock({
      chartData: reading.entries.map((e) => `${e.pillar}:${e.gods.join('、')}`).join('；'),
      judgment: studyReading.text,
      plainMapping: `以上專業判斷,對應到白話摘要中的:${primary}(出現於${pillars.join('、')})。`,
      warnings: '完整的十神判斷需綜合四柱組合、藏干與大運流年交互影響,此處僅呈現出現頻率最高的一組配置。',
    }),
  };
}

// ---------- 八字:大運概況(時間軸主題,沿用既有大運/流年類別疊加,不另建內容庫) ----------

function baziTimeTopic(baZi, bzLuck) {
  const info = bzLuck.decadal ?? bzLuck.annual;
  if (!info) return null;

  const scope = bzLuck.decadal ? `這十年大運(${info.ageRange.replace('~', '–')}歲)` : `今年流年(${info.year}年)`;
  const categoryText = BZ_CATS['類別解讀'][info.category] ?? '';
  const profile = TEN_GOD_PROFILES[info.god];
  const studyLuck = composeBaZiLuck(baZi, { mode: 'study', year: info.year ?? new Date().getFullYear() });
  const studyText = studyLuck.decadal?.text ?? studyLuck.annual?.text ?? '';

  const summary = `${scope}走「${info.category}」,你身上「${info.god}」的特質會被放大。`;
  const explanation = [categoryText, profile?.summary ?? ''].filter(Boolean);

  return {
    key: 'dayun', title: '大運概況', letter: '運', color: 'var(--red)',
    summary,
    explanation,
    lifeExamples: cap(profile?.lifeExamples ?? [], 3),
    challenges: cap(profile?.challenges ?? [], 2),
    advice: cap(profile?.advice ?? [], 2),
    reflection: profile?.reflection ?? '這段時間,你有沒有感覺到上面提到的傾向比平常更明顯一些?',
    technical: technicalBlock({
      chartData: `${info.ganZhi}:${info.god},屬於${info.category}${info.ageRange ? `(${info.ageRange}歲)` : ''}${info.year ? `(${info.year}年)` : ''}。`,
      judgment: studyText,
      plainMapping: `以上專業判斷,對應到白話摘要中的:${info.god}(${info.category})。`,
      warnings: '大運與流年的完整判斷需綜合日主強弱、喜用神與其他刑沖合會因素,此處僅呈現當前階段的十神類別重點。',
    }),
  };
}

// ---------- 對外主入口 ----------

/**
 * 產生紫微 6 個主題的白話卡片(命宮/財帛/官祿/夫妻/疾厄/大限流年)
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} zwLuck composeZiWeiLuck() 輸出(呼叫端已算好的「現在」大限流年)
 */
export function generatePlainZiweiTopics(ziWei, zwLuck) {
  const defs = [
    { key: 'ming', title: '命宮總論', letter: '命', color: 'var(--red)', palaceName: '命宮', domain: null },
    { key: 'caibo', title: '財帛宮', letter: '財', color: 'var(--gold)', palaceName: '財帛宮', domain: 'money' },
    { key: 'guanlu', title: '事業(官祿宮)', letter: '祿', color: 'var(--red)', palaceName: '官祿宮', domain: 'career' },
    { key: 'fuqi', title: '感情(夫妻宮)', letter: '緣', color: 'var(--gold)', palaceName: '夫妻宮', domain: 'relationship' },
    { key: 'jie', title: '健康(疾厄宮)', letter: '健', color: 'var(--red)', palaceName: '疾厄宮', domain: 'health' },
  ];
  const cards = defs.map((d) => starPalaceTopic(d, ziWei));
  const timeCard = ziweiTimeTopic(ziWei, zwLuck);
  if (timeCard) cards.push(timeCard);
  return cards;
}

/**
 * 產生八字 5 個主題的白話卡片(日主/五行喜忌/喜用神忌神/十神配置/大運概況)
 * @param {object} baZi   convertToBaZi() 輸出
 * @param {object} bzLuck composeBaZiLuck() 輸出(呼叫端已算好的「現在」大運流年)
 * @param {object} elements composeElementAnalysis() 輸出
 */
export function generatePlainBaziTopics(baZi, bzLuck, elements) {
  const cards = [
    baziZhuTopic(baZi),
    baziXijiTopic(baZi, elements),
    baziYongshenTopic(baZi),
    baziShishenTopic(baZi),
  ];
  const timeCard = baziTimeTopic(baZi, bzLuck);
  if (timeCard) cards.push(timeCard);
  return cards;
}

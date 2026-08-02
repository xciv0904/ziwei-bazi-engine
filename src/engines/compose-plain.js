// src/engines/compose-plain.js — 「白話摘要」生成引擎
//
// 目的：把紫微/八字既有的專業排盤資料，組裝成「先白話、後專業」兩層結構的分析卡片，
// 提供給解讀報告頁（main.js renderReport）使用。
//
// 設計原則（對應改版需求）:
//   1. 不重新排盤、不重算星曜宮位四化十神喜用神——全部沿用既有引擎(compose.js /
//      compose-bazi.js / compose-yongshen.js / compose-luck.js)算出來的結果。
//      這個檔案只負責「把結果包裝成白話卡片」。
//   2. 白話內容庫（14主星性格/主星×領域延伸/十神/日主五行/五行偏多偏弱）放在
//      plain-star-profiles.json 與 plain-bazi-profiles.json,本檔案只做組裝與挑選邏輯，
//      不在這裡塞寫死的長文字。
//   3. 每張卡片固定輸出 7 段式白話結構 + 1 段預設收合的專業命理依據（technical）,
//      technical 內再細分 4 小節：命盤資料 / 專業判斷 / 白話對應 / 限制與需綜合參考處。
//   4. 同一命盤特質不會在多個主題重複完整說明——領域延伸主題（財帛/事業/感情/健康）
//      只寫「這個特質在這個領域怎麼表現」，不重講一次完整性格解釋。
import starDb from '../data/plain-star-profiles.json' with { type: 'json' };
import baziDb from '../data/plain-bazi-profiles.json' with { type: 'json' };
import overlaysDb from '../data/luck-cycle-overlays.json' with { type: 'json' };
import { composePalaceReading } from './compose.js';
import { composeBaZiReading } from './compose-bazi.js';
import { computeYongShen, FAVOR_IMPACT, AVOID_IMPACT } from './compose-yongshen.js';
import { composeZiWeiLuck, composeBaZiLuck, categoryLabel } from './compose-luck.js';
import { composeAnnualChange } from './compose-annual.js';
import { palaceMeanings } from '../data/palace-meanings.js';
import { inspectCardQuality } from './text-quality.js';

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
  money: '回想最近一次重要的花錢或理財決定，是不是也照著這個模式在做？',
  career: '你現在的工作內容，有多少符合上面提到的這些傾向？',
  relationship: '在感情裡，你是否也常常出現剛剛提到的這些反應？',
  health: '你最近一次感覺特別累的時候，是不是也是這樣的狀況？',
};

// 12 宮之中，財帛/官祿/夫妻/疾厄有專屬的領域延伸內容庫（見 plain-star-profiles.json 的「主星白話領域延伸」）。
// 命宮直接用主星性格庫本身。其餘 7 宮（兄弟/子女/遷移/交友/田宅/福德/父母）目前沒有各自獨立的
// 白話內容庫（工程量過大，見完成回報的取捨說明），改用「一般化橋接」：沿用該主星的性格描述，
// 但開頭先點出這個宮位實際在看的主題（沿用 palace-meanings.js 的短句），避免使用者誤以為是在講命宮個性。
const PALACE_DOMAIN_MAP = { 財帛宮: 'money', 官祿宮: 'career', 夫妻宮: 'relationship', 疾厄宮: 'health' };

const PALACE_HEADING = {
  命宮: '做決定時的基本反應', 財帛宮: '面對金錢與資源時', 官祿宮: '進入工作情境之後',
  夫妻宮: '關係靠近之後的反應', 疾厄宮: '壓力累積時的身心反應', 遷移宮: '進入陌生環境時',
  僕役宮: '團隊分工不清楚時', 父母宮: '面對長輩與規則時', 田宅宮: '建立生活基地時',
  福德宮: '獨處與放鬆時', 子女宮: '照顧、教學與創作時', 兄弟宮: '與同輩並肩做事時',
};

const PALACE_ADVICE_CONTEXT = {
  財帛宮: '處理金錢與資源時', 官祿宮: '在工作中', 夫妻宮: '關係變得更靠近時',
  疾厄宮: '壓力累積時', 遷移宮: '進入陌生環境時', 僕役宮: '與朋友或團隊合作時',
  父母宮: '面對長輩與規則時', 田宅宮: '安排住家與生活時', 福德宮: '需要休息時',
  子女宮: '照顧、教學或創作時', 兄弟宮: '與同輩一起做事時',
};

const TRANSFORMATION_TRIGGER = {
  祿: '得到資源、善意回應或合作機會時，這項特質更容易帶來順手感',
  權: '需要負責、主導或做決定時，這項特質會明顯變強',
  科: '需要說明、被評量或公開呈現時，這項能力較容易被看見',
  忌: '遇到回應模糊、進度受阻或壓力累積時，這個模式容易反覆出現',
};

const BRIGHTNESS_DIRECT = new Set(['廟', '旺', '得']);

function transformationOf(star) {
  return String(star?.transformation ?? '').replace(/^化/, '');
}

function differentiatedContext(stars, primaryProfile) {
  const lines = [];
  const transformed = stars.filter((star) => TRANSFORMATION_TRIGGER[transformationOf(star)]);
  for (const star of transformed.slice(0, 2)) {
    lines.push(`${TRANSFORMATION_TRIGGER[transformationOf(star)]}。`);
  }
  const lead = stars[0];
  if (lead?.brightness) {
    lines.push(BRIGHTNESS_DIRECT.has(lead.brightness)
      ? `平常就容易看見這種${primaryProfile.tag}反應，不必等到壓力很大才會出現。`
      : `環境熟悉、規則清楚時，你比較能用好這項特質；遇到評價壓力或資訊不足，反應可能轉為保守。`);
  }
  return lines;
}

function palaceEvidence(palaceName, stars, borrowed, opposite, ziWei) {
  const starNames = stars.map((star) => star.name).join('、') || '無主星';
  const details = stars.map((star) => `${star.name}${star.brightness ? `亮度${star.brightness}` : ''}${star.transformation ? `、${star.transformation}` : ''}`).join('；');
  const triangle = trianglePalacesOf(ziWei, palaceName).map((item) => `${item.name}見${item.stars}`).join('、');
  return [
    `${palaceName}${borrowed ? `借對宮${opposite?.name ?? ''}` : ''}以${starNames}為主要判斷`,
    details || `${palaceName}目前沒有可用的主星細節`,
    `三方四正連到${triangle || '目前無可用資料'}`,
  ];
}

function finalizeCard(card) {
  card.qualityIssues = inspectCardQuality(card);
  return card;
}

function paletteModeOf(palaceName) {
  if (palaceName === '命宮') return { mode: 'personality', domain: null };
  const domain = PALACE_DOMAIN_MAP[palaceName];
  if (domain) return { mode: 'domain', domain };
  return { mode: 'generic', domain: null };
}

// 忌用神/大運類別另外需要的簡短建議(FAVOR_IMPACT/AVOID_IMPACT 是完整說明句，
// 這裡另外準備「可執行」的動作版本，避免建議欄位只是把說明句重講一次)
const YONGSHEN_ADVICE_FAVOR = {
  印: '遇到需要學習或有貴人相助的機會，可以多把握，向前輩請教會特別有幫助',
  比劫: '重要的事情上，找信任的夥伴一起合作，會比單打獨鬥更順',
  食傷: '把想法說出來、做出來，會比悶著不表達更容易帶來機會',
  財: '把精力放在能做出具體成果的事情上，會比較有收穫',
  官殺: '適度接受挑戰與規範，反而能幫助自己成長得更快',
};
const YONGSHEN_ADVICE_AVOID = {
  印: '想太多、遲遲不決定的時候，給自己設一個決定的時間點',
  比劫: '涉及借貸、擔保、合夥的事，多留一個心眼，不要單憑人情答應',
  食傷: '重要場合發言前，多想一步，避免話說得太直接',
  財: '追逐眼前利益前，先想清楚這是否符合長期的生活節奏',
  官殺: '長期處在高壓環境時，記得設停損點，不要硬撐到底',
};

const STRENGTH_PLAIN = {
  身強: '自帶的能量偏旺，適合主動把力氣用出去、發揮所長',
  身弱: '自帶的能量偏弱，比較需要補給與支持，不用凡事硬撐',
  中和: '能量大致平衡，順著當下的節奏調整就好',
};

function technicalBlock({ chartData, judgment, plainMapping, warnings }) {
  return {
    chartData,
    judgment,
    plainMapping,
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [warnings].filter(Boolean),
  };
}

// ---------- 紫微：單一宮位的主星解析（命宮/財帛宮/官祿宮/夫妻宮/疾厄宮 共用） ----------

function resolvePalaceStars(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const palace = ziWei.palaces.find((p) => p.name === palaceName);
  const opposite = byBranch[oppositeBranch(branchOf(palace))];
  const borrowed = palace.majorStars.length === 0;
  const stars = borrowed ? (opposite?.majorStars ?? []) : palace.majorStars;
  return { palace, opposite, borrowed, stars };
}

// 三方四正：本宮 + 對宮（+6） + 三合兩宮（+4、+8），回傳另外 3 個關聯宮位的名稱與主星，
// 只用來把「專業命理依據」的命盤資料補完整，不影響任何白話判斷邏輯。
function trianglePalacesOf(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const self = ziWei.palaces.find((p) => p.name === palaceName);
  const idx = BRANCHES.indexOf(branchOf(self));
  return [6, 4, 8].map((off) => byBranch[BRANCHES[(idx + off) % 12]]).filter(Boolean).map((p) => ({
    name: p.name,
    stars: p.majorStars.map((s) => s.name).join('、') || '無主星',
  }));
}

function formatChartData(palaceName, stars, borrowed, opposite, ziWei) {
  const starLine = borrowed
    ? `${palaceName}(本宮無主星，借對宮「${opposite?.name ?? ''}」星曜參看):${stars.map((s) => `${s.name}(亮度${s.brightness}${s.transformation ? `,化${String(s.transformation).replace(/^化/, '')}` : ''})`).join('、') || '無可借星曜'}`
    : `${palaceName}:${stars.map((s) => `${s.name}(亮度${s.brightness}${s.transformation ? `,化${String(s.transformation).replace(/^化/, '')}` : ''})`).join('、')}`;
  const selfPalace = ziWei.palaces.find((p) => p.name === palaceName);
  const minor = selfPalace?.minorStars?.length ? `輔星/煞曜：${selfPalace.minorStars.join('、')}` : '輔星/煞曜：無';
  const triangle = trianglePalacesOf(ziWei, palaceName).map((t) => `${t.name}(${t.stars})`).join('、');
  return [starLine, minor, `三方四正關聯宮位：${triangle}`].join('\n');
}

function borrowedOpener(palaceName, label) {
  if (palaceName === '命宮') {
    return '你的個性不是天生固定的類型，而是會隨著環境、經歷與後天選擇逐漸成形。';
  }
  return `${label}方面沒有專屬主星，會隨環境、經驗與你的選擇改變。以下參考對宮星曜呈現的傾向。`;
}

function triangleContext(ziWei, palaceName) {
  const tags = trianglePalacesOf(ziWei, palaceName)
    .flatMap((item) => item.stars.split('、'))
    .map((name) => STAR_PROFILES[name]?.tag)
    .filter(Boolean);
  const distinct = [...new Set(tags)].slice(0, 2);
  if (!distinct.length) return '';
  return `遇到不同人或場合時，你也可能出現${distinct.join('與')}的反應。`;
}

function differentiatedSummary(base, stars, ziWei, palaceName, borrowed) {
  const tags = trianglePalacesOf(ziWei, palaceName)
    .flatMap((item) => item.stars.split('、'))
    .map((name) => STAR_PROFILES[name]?.tag)
    .filter(Boolean);
  const distinct = [...new Set(tags)].slice(0, 2);
  const lead = stars[0];
  const secondary = stars[1];
  const transform = TRANSFORMATION_TRIGGER[transformationOf(lead)];
  const context = transform
    ? transform.split('，')[0]
    : secondary
      ? `當情境同時需要兩種處理方式時，你會在${STAR_PROFILES[lead?.name]?.tag ?? lead?.name}與${STAR_PROFILES[secondary.name]?.tag ?? secondary.name}之間切換`
      : BRIGHTNESS_DIRECT.has(lead?.brightness)
        ? '這個反應平常就容易被看見'
        : '規則清楚、環境熟悉時，這個反應更明顯';
  const cleanBase = String(base ?? '').replace(/[，,。；;\s]+$/, '');
  const related = distinct.length ? `。換到不同人或場合時，別人還可能看到你${distinct.join('與')}的一面` : '';
  return `${context}：${cleanBase}${borrowed ? '。這部分會隨環境改變' : ''}${related}。`;
}

function contextualAdvice(advice, palaceName) {
  // 命宮的「做決定時的基本反應」是章節標題，不是自然的行動前提；
  // 其他宮位也只使用能直接接動作的生活情境，不把 UI 標題硬塞進句子。
  const trigger = PALACE_ADVICE_CONTEXT[palaceName];
  if (!trigger) return advice;
  return `${trigger}，${advice.replace(/^[，,。\s]+/, '')}`;
}

function mergeExtra(target, extraSrc, { lifeMax = 4, challengeMax = 3, adviceMax = 3 } = {}) {
  if (!extraSrc) return target;
  target.lifeExamples = cap([...target.lifeExamples, ...(extraSrc.lifeExamples ?? [])], lifeMax);
  target.challenges = cap([...target.challenges, ...(extraSrc.challenges ?? [])], challengeMax);
  target.advice = cap([...target.advice, ...(extraSrc.advice ?? [])], adviceMax);
  return target;
}

function buildDomainExplanation(primary, tag, domainSrc, domain) {
  const p1 = `${domainSrc.summary}這是${tag}傾向處理${DOMAIN_LABEL[domain] ?? '這類事情'}時的具體表現。`;
  const c0 = domainSrc.challenges?.[0];
  return c0 ? [p1, `${c0}。`] : [p1];
}

// 「一般化橋接」explanation:給沒有專屬領域內容庫的 7 個宮位用。先點出這個宮位實際在看什麼主題
// (沿用 palace-meanings.js 的短句),再帶出主星性格傾向，避免使用者誤以為在講命宮本身的個性。
function buildGenericExplanation(primary, palaceLabel) {
  const p = STAR_PROFILES[primary];
  return [
    `這裡看的是${palaceLabel}。從命盤這個位置的星曜來看，你帶著${p.tag}的傾向：${p.summary}`,
    p.explanation[0],
  ];
}

function contentFor(mode, starName, domain) {
  if (mode === 'domain') return STAR_DOMAIN[starName]?.[domain];
  return STAR_PROFILES[starName]; // personality 與 generic 都直接用主星性格庫
}

function starPalaceTopic({ key, title, letter, color, palaceName, domain: forcedDomain }, ziWei) {
  const { palace, opposite, borrowed, stars } = resolvePalaceStars(ziWei, palaceName);
  const names = stars.map((s) => s.name).filter((n) => STAR_PROFILES[n]);

  const studyReading = composePalaceReading(palace, opposite, { mode: 'study' });
  const chartData = formatChartData(palaceName, stars, borrowed, opposite, ziWei);
  const { mode, domain: resolvedDomain } = paletteModeOf(palaceName);
  const domain = forcedDomain !== undefined ? forcedDomain : resolvedDomain;
  const palaceLabel = DOMAIN_LABEL[domain] ?? palaceMeanings[palaceName] ?? palaceName;

  if (names.length === 0) {
    // 兩端都沒有主星資料可對應（極少數狀況），仍輸出誠實的 7 段式卡片，不硬套個性描述
    return finalizeCard({
      key, title, letter, color, borrowed,
      summary: `${palaceName}目前沒有足夠的主星資料可以對應到白話性格描述。`,
      explanation: ['這個宮位在你的命盤中屬於比較特殊的組合，沒有主星或可借的對宮星曜可以對應。', '建議直接參考下方「專業命理依據」中的完整宮位資料，或綜合命盤其他宮位交叉判斷。'],
      lifeExamples: [], challenges: [], advice: [],
      reflection: '這個領域對你來說，平常比較容易透過哪些具體的事來感受到？',
      evidence: palaceEvidence(palaceName, stars, borrowed, opposite, ziWei),
      technical: technicalBlock({ chartData, judgment: studyReading.text, plainMapping: '此宮位無主星資料可對應白話摘要。', warnings: '完整判斷請綜合命盤其他宮位、三方四正與大限流年。' }),
    });
  }

  const primary = names[0];
  const secondary = names[1];
  const isPersonality = mode === 'personality';
  const isGeneric = mode === 'generic';
  const src = contentFor(mode, primary, domain);

  const card = clone({
    summary: isGeneric ? `${palaceLabel}:${src.summary}` : src.summary,
    explanation: isPersonality ? src.explanation : isGeneric ? buildGenericExplanation(primary, palaceLabel) : buildDomainExplanation(primary, STAR_PROFILES[primary].tag, src, domain),
    lifeExamples: src.lifeExamples ?? [],
    challenges: src.challenges ?? [],
    advice: src.advice ?? [],
  });

  if (secondary) mergeExtra(card, contentFor(mode, secondary, domain));

  if (secondary) {
    const secondarySrc = contentFor(mode, secondary, domain) ?? STAR_PROFILES[secondary];
    if (secondarySrc?.summary) card.explanation.push(`同宮的另一組${STAR_PROFILES[secondary]?.tag ?? ''}特質補上不同反應：${secondarySrc.summary}`);
  }
  card.explanation.push(...differentiatedContext(stars, STAR_PROFILES[primary]));
  const triadContext = triangleContext(ziWei, palaceName);
  if (triadContext) card.explanation.push(triadContext);

  if (borrowed) card.explanation = [borrowedOpener(palaceName, palaceLabel), ...card.explanation];

  const reflection = mode === 'domain' ? DOMAIN_REFLECTION[domain] : STAR_PROFILES[primary].reflection;
  const tagLabel = names.map((n) => `${n}(${STAR_PROFILES[n]?.tag ?? ''})`).join('、');

  return finalizeCard({
    key, title: `${PALACE_HEADING[palaceName] ?? title}・${STAR_PROFILES[primary].tag}`, letter, color, borrowed,
    summary: differentiatedSummary(card.summary, stars, ziWei, palaceName, borrowed),
    explanation: card.explanation,
    lifeExamples: cap(card.lifeExamples, 4),
    challenges: cap(card.challenges, 3),
    advice: cap(card.advice, 3).map((item) => contextualAdvice(item, palaceName)),
    reflection,
    evidence: palaceEvidence(palaceName, stars, borrowed, opposite, ziWei),
    technical: technicalBlock({
      chartData,
      judgment: studyReading.text,
      plainMapping: `以上專業判斷，對應到白話摘要中的：${tagLabel}。`,
      warnings: '此處僅呈現單一宮位的基礎判斷，完整解讀仍需綜合三方四正、四化飛星與大限流年等因素，本區塊為輔助參考、非最終定論。',
    }),
  });
}

/**
 * 給命盤總覽「命盤小教室」用的單一宮位白話卡片，支援全部 12 宮（不限報告頁那 5 個）。
 * 沒有專屬領域內容庫的宮位會用「一般化橋接」(見 buildGenericExplanation)。
 */
export function generatePlainPalaceCard(ziWei, palaceName) {
  return starPalaceTopic({ key: 'palace', title: palaceName, letter: palaceName[0], color: 'var(--red)', palaceName, domain: undefined }, ziWei);
}

// ---------- 紫微：大限流年重點（時間軸主題，沿用既有大限/流年組裝結果，不另建內容庫） ----------

function ziweiTimeTopic(ziWei, zwLuck, selection = {}) {
  const studyLuck = composeZiWeiLuck(ziWei, { ...selection, mode: 'study' });
  const parts = [];
  // 大限流年瀏覽器切換的是「某一年」，白話正文必須先講該年，而不是每年都先重複十年大限。
  // 大限仍保留成第二層背景；若大限與流年同宮，composeZiWeiLuck 會合併成單一訊號。
  if (zwLuck.annual) parts.push({ scope: '流年', range: `${zwLuck.annual.year}年`, palaceName: zwLuck.annual.palaceName });
  if (zwLuck.decadal) parts.push({ scope: zwLuck.annual ? '大限' : '大限與流年', range: `${zwLuck.decadal.ageRange.replace('~', '–')}歲`, palaceName: zwLuck.decadal.palaceName });

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
    ? `這段期間（${lead.range}）的焦點落在「${lead.palaceName}」，帶著${lead.profile.tag}的傾向：${lead.profile.summary}`
    : `這段期間（${lead.range}）的焦點落在「${lead.palaceName}」。`;

  const explanation = enriched.map((part) => part.profile
    ? `${part.scope}(${part.range}),焦點落在「${part.palaceName}」，這裡的星曜組合帶有${part.profile.tag}的傾向，${part.profile.summary}`
    : `${part.scope}(${part.range}),焦點落在「${part.palaceName}」，詳細判斷請參考下方專業命理依據。`);

  const base = lead.profile ?? {};
  const chartData = enriched.map((p) => `${p.scope}:${p.range},落於「${p.palaceName}」宮`).join('；');
  const judgment = [studyLuck.decadal?.text, studyLuck.annual?.text].filter(Boolean).join('\n\n');

  return finalizeCard({
    key: 'xian', title: '大限・流年重點', letter: '限', color: 'var(--gold)',
    summary,
    explanation,
    lifeExamples: cap(base.lifeExamples ?? [], 3),
    challenges: cap(base.challenges ?? [], 2),
    advice: cap(base.advice ?? [], 2),
    reflection: '這段時間，你有沒有感覺到上面提到的傾向比平常更明顯一些？',
    evidence: [
      ...enriched.map((part) => `${part.scope}${part.range}落在${part.palaceName}`),
      ...enriched.map((part) => `${part.palaceName}主星：${part.primary || '空宮'}`),
      `專業限運判斷：${judgment || '目前資料不足'}`,
    ].slice(0, 3),
    technical: technicalBlock({
      chartData,
      judgment,
      plainMapping: lead.profile ? `以上專業判斷，對應到白話摘要中的：${lead.primary}(${lead.profile.tag})。` : '此區間之判斷請參考完整專業依據。',
      warnings: '大限與流年的完整判斷需綜合命宮三方四正、四化飛星與其他宮位交叉參看，此處僅呈現目前階段的重點提示，並非唯一結論。',
    }),
  });
}

// ---------- 八字：日主分析 ----------

function baziZhuTopic(baZi) {
  const ys = computeYongShen(baZi);
  const profile = clone(DAYMASTER_PROFILES[ys.dayEl]);
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const monthBranch = baZi.fourPillars.monthPillar.branch;

  const explanation = [...profile.explanation, `整體來看，目前的狀態比較偏向「${ys.strength}」：${STRENGTH_PLAIN[ys.strength]}。`];

  return finalizeCard({
    key: 'zhu', title: '你的先天底色', letter: '主', color: 'var(--gold)',
    summary: profile.summary,
    explanation,
    lifeExamples: cap(profile.lifeExamples, 3),
    challenges: cap(profile.challenges, 2),
    advice: cap(profile.advice, 2),
    reflection: profile.reflection,
    evidence: [`日主為${dayStem}${ys.dayEl}`, `生於${monthBranch}月`, `扶抑判定為${ys.strength}`],
    technical: technicalBlock({
      chartData: `日主：${dayStem}(${ys.dayEl}),生於${monthBranch}月；幫身${ys.helpScore}分、抑身${ys.opposeScore}分（月令加權×2）。`,
      judgment: `依扶抑法判定為「${ys.strength}」(各派系取用方式不一，結果僅供參考)。`,
      plainMapping: `以上專業判斷，對應到白話摘要中的：${ys.dayEl}(${profile.tag})。`,
      warnings: '身強身弱的完整判斷需綜合四柱干支、月令與其他刑沖合會等因素，不能只看單一條件。',
    }),
  });
}

// ---------- 八字：五行喜忌（命局五行分布偏多/偏弱） ----------

function baziXijiTopic(baZi, elements) {
  const domEl = elements.dominant?.[0];
  const weakEl = elements.weak?.find((e) => e !== domEl);
  const domProfile = domEl ? ELEMENT_IMBALANCE[domEl]?.dominant : null;
  const weakProfile = weakEl ? ELEMENT_IMBALANCE[weakEl]?.weak : null;

  const explanation = [
    domProfile?.summary ?? '命局五行分布大致平衡，沒有特別突出的部分。',
    weakProfile?.summary ?? '其餘五行的分布大致平衡，沒有特別缺乏的部分。',
  ];

  const chartData = Object.entries(elements.classification ?? {})
    .map(([el, c]) => `${el}:${c.count}顆（${c.level}）`).join('、');

  return finalizeCard({
    key: 'xiji', title: '你身上偏多與偏少的特質', letter: '喜', color: 'var(--red)',
    summary: domProfile?.summary ?? explanation[0],
    explanation,
    lifeExamples: cap([...(domProfile?.lifeExamples ?? []), ...(weakProfile?.lifeExamples ?? [])], 4),
    challenges: cap([...(domProfile?.challenges ?? []), ...(weakProfile?.challenges ?? [])], 3),
    advice: cap([...(domProfile?.advice ?? []), ...(weakProfile?.advice ?? [])], 3),
    reflection: '你有沒有發現，自己在剛剛提到的這些面向，特別容易出現這種傾向？',
    evidence: [
      `五行偏多：${domEl ?? '無明顯項目'}`,
      `五行偏少：${weakEl ?? '無明顯項目'}`,
      chartData || '五行分布資料不足',
    ],
    technical: technicalBlock({
      chartData,
      judgment: elements.text,
      plainMapping: `以上專業判斷，對應到白話摘要中的：${[domEl, weakEl].filter(Boolean).join('、')}。`,
      warnings: '五行數量僅是分布上的參考，實際的喜用神判斷需綜合日主強弱、月令與扶抑法等因素，不能只看數量多寡直接推論喜用神。',
    }),
  });
}

// ---------- 八字：喜用神與忌神(卡片標題對外顯示為「對你有幫助與要避開的方向」——
//            『喜用神/忌神』這兩個詞只留在專業命理依據面板) ----------

function baziYongshenTopic(baZi) {
  const ys = computeYongShen(baZi);
  const fav = ys.favorable;
  const avoid = ys.unfavorable;

  const summary = fav.length
    ? `遇到與「${fav[0].element}」有關的人事物或時機，你通常比較容易借上力。`
    : '目前命局喜忌相對中性，整體影響比較平均。';

  const explanation = [
    fav.length ? `${FAVOR_IMPACT[fav[0].role]}。` : '目前沒有特別突出的喜用神方向。',
    avoid.length ? `不過，${AVOID_IMPACT[avoid[0].role]}。` : '忌神的影響目前相對不明顯。',
  ];

  const lifeExamples = cap(fav.map((f) => FAVOR_IMPACT[f.role]), 3);
  const challenges = cap(avoid.map((a) => AVOID_IMPACT[a.role]), 2);
  const advice = cap([
    fav[0] ? YONGSHEN_ADVICE_FAVOR[fav[0].role] : null,
    avoid[0] ? YONGSHEN_ADVICE_AVOID[avoid[0].role] : null,
  ], 2);

  const chartData = `喜用神：${fav.map((f) => `${f.element}(${f.role})`).join('、') || '無'};忌神：${avoid.map((a) => `${a.element}(${a.role})`).join('、') || '無'}。`;

  return finalizeCard({
    key: 'yongshen', title: '對你有幫助與要避開的方向', letter: '用', color: 'var(--gold)',
    summary, explanation, lifeExamples, challenges, advice,
    reflection: '你有沒有發現，自己在某些特定的人事物出現時，會特別順或特別卡？',
    evidence: [
      `扶抑判定：${ys.strength}`,
      `可提供支持的方向：${fav.map((f) => `${f.element}${f.role}`).join('、') || '無明顯資料'}`,
      `容易增加負荷的方向：${avoid.map((a) => `${a.element}${a.role}`).join('、') || '無明顯資料'}`,
    ],
    technical: technicalBlock({
      chartData,
      judgment: `日主${ys.dayEl},判為「${ys.strength}」，依扶抑法取用（各派系取用方式不一，此處採最通行的扶抑法，結果僅供參考）。`,
      plainMapping: '以上專業判斷，對應到白話摘要中列出的喜用神/忌神方向。',
      warnings: '喜用神的判定會因流派（扶抑/調候/通關等）而有不同結論，此處僅呈現其中一種常用方法的結果。',
    }),
  });
}

// ---------- 八字：十神配置 ----------

function baziShishenTopic(baZi) {
  const reading = composeBaZiReading(baZi, { mode: 'public' });
  const studyReading = composeBaZiReading(baZi, { mode: 'study' });
  const counts = {};
  reading.entries.forEach((e) => e.gods.forEach((g) => { counts[g] = (counts[g] ?? 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0]?.[0];

  if (!primary) {
    return finalizeCard({
      key: 'shishen', title: '你做事與待人的方式', letter: '神', color: 'var(--gold)',
      summary: '目前命盤的十神配置資料不足，無法對應白話描述。',
      explanation: ['請直接參考下方專業命理依據中的完整資料。'],
      lifeExamples: [], challenges: [], advice: [],
      reflection: '',
      evidence: ['十神配置資料不足', '四柱未形成可用的主要類型', '只保留專業資料供人工判讀'],
      technical: technicalBlock({ chartData: '無', judgment: studyReading.text, plainMapping: '無對應資料。', warnings: '' }),
    });
  }

  const profile = clone(TEN_GOD_PROFILES[primary]);
  const pillars = reading.entries.filter((e) => e.gods.includes(primary)).map((e) => e.pillar);
  const explanation = [...profile.explanation, `這個特質在你的${pillars.join('、')}都有出現，是命盤中比較鮮明的一組配置。`];

  return finalizeCard({
    key: 'shishen', title: '你做事與待人的方式', letter: '神', color: 'var(--gold)',
    summary: profile.summary,
    explanation,
    lifeExamples: cap(profile.lifeExamples, 3),
    challenges: cap(profile.challenges, 2),
    advice: cap(profile.advice, 2),
    reflection: profile.reflection,
    evidence: [`主要十神：${primary}`, `出現位置：${pillars.join('、')}`, `共出現${counts[primary]}次`],
    technical: technicalBlock({
      chartData: reading.entries.map((e) => `${e.pillar}:${e.gods.join('、')}`).join('；'),
      judgment: studyReading.text,
      plainMapping: `以上專業判斷，對應到白話摘要中的：${primary}(出現於${pillars.join('、')})。`,
      warnings: '完整的十神判斷需綜合四柱組合、藏干與大運流年交互影響，此處僅呈現出現頻率最高的一組配置。',
    }),
  });
}

// ---------- 八字：大運概況（時間軸主題，沿用既有大運/流年類別疊加，不另建內容庫） ----------

function baziTimeTopic(baZi, bzLuck) {
  const info = bzLuck.decadal ?? bzLuck.annual;
  if (!info) return null;

  const scope = bzLuck.decadal ? `這十年大運（${info.ageRange.replace('~', '–')}歲）` : `今年流年（${info.year}年）`;
  const categoryText = BZ_CATS['類別解讀'][info.category] ?? '';
  const profile = TEN_GOD_PROFILES[info.god];
  const studyLuck = composeBaZiLuck(baZi, { mode: 'study', year: info.year ?? new Date().getFullYear() });
  const studyText = bzLuck.annual
    ? composeAnnualChange(baZi, info.year, { mode: 'study' }).text
    : studyLuck.decadal?.text ?? studyLuck.annual?.text ?? '';

  // 這張是大眾版白話卡，用白話運別名；「食傷運/食神」這種術語留給專業依據面板。
  const summary = `${scope}走「${categoryLabel(info.category)}」，這段期間這方面的特質會比平常更明顯。`;
  const explanation = [categoryText, profile?.summary ?? ''].filter(Boolean);

  return finalizeCard({
    key: 'dayun', title: '目前這十年的走向', letter: '運', color: 'var(--red)',
    summary,
    explanation,
    lifeExamples: cap(profile?.lifeExamples ?? [], 3),
    challenges: cap(profile?.challenges ?? [], 2),
    advice: cap(profile?.advice ?? [], 2),
    reflection: profile?.reflection ?? '這段時間，你有沒有感覺到上面提到的傾向比平常更明顯一些？',
    evidence: [
      `${scope}:${info.ganZhi}`,
      `十神：${info.god}`,
      `運勢類別：${info.category}`,
    ],
    technical: technicalBlock({
      chartData: `${info.ganZhi}:${info.god},屬於${info.category}${info.ageRange ? `（${info.ageRange}歲）` : ''}${info.year ? `（${info.year}年）` : ''}。`,
      judgment: studyText,
      plainMapping: `以上專業判斷，對應到白話摘要中的：${info.god}(${info.category})。`,
      warnings: '大運與流年的完整判斷需綜合日主強弱、喜用神與其他刑沖合會因素，此處僅呈現當前階段的十神類別重點。',
    }),
  });
}

// ---------- 對外主入口 ----------

/**
 * 產生紫微 6 個主題的白話卡片（命宮/財帛/官祿/夫妻/疾厄/大限流年）
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} zwLuck composeZiWeiLuck() 輸出（呼叫端已算好的「現在」大限流年）
 */
export function generatePlainZiweiTopics(ziWei, zwLuck) {
  const defs = [
    { key: 'ming', title: '命宮總論', letter: '命', color: 'var(--red)', palaceName: '命宮', domain: null },
    { key: 'caibo', title: '財帛宮', letter: '財', color: 'var(--gold)', palaceName: '財帛宮', domain: 'money' },
    { key: 'guanlu', title: '事業（官祿宮）', letter: '祿', color: 'var(--red)', palaceName: '官祿宮', domain: 'career' },
    { key: 'fuqi', title: '感情（夫妻宮）', letter: '緣', color: 'var(--gold)', palaceName: '夫妻宮', domain: 'relationship' },
    { key: 'jie', title: '健康（疾厄宮）', letter: '健', color: 'var(--red)', palaceName: '疾厄宮', domain: 'health' },
  ];
  const cards = defs.map((d) => starPalaceTopic(d, ziWei));
  const timeCard = ziweiTimeTopic(ziWei, zwLuck);
  if (timeCard) cards.push(timeCard);
  return cards;
}

/**
 * 產生八字 5 個主題的白話卡片（日主/五行喜忌/喜用神忌神/十神配置/大運概況）
 * @param {object} baZi   convertToBaZi() 輸出
 * @param {object} bzLuck composeBaZiLuck() 輸出（呼叫端已算好的「現在」大運流年）
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

/**
 * 給命盤總覽「大限流年瀏覽器」用：任一大限/流年（不限「現在」）的紫微白話時間卡片。
 * age/year 對應瀏覽器目前選中的大限、流年,composeZiWeiLuck 本來就支援指定任意 age/year,
 * 這裡只是把已經存在的能力包成一個好呼叫的入口，不重算任何排盤資料。
 * @param {object} ziWei convertToZiWei() 輸出
 * @param {{age?: number, year?: number}} [sel]
 */
export function generatePlainZiweiTimeCard(ziWei, { age, year } = {}) {
  const opts = { mode: 'public' };
  if (age != null) opts.age = age;
  if (year != null) opts.year = year;
  const zwLuck = composeZiWeiLuck(ziWei, opts);
  return ziweiTimeTopic(ziWei, zwLuck, { age, year });
}

/**
 * 給命盤總覽「大限流年瀏覽器」用：任一年份的八字白話時間卡片（大運或流年，依 composeBaZiLuck 判斷）。
 * @param {object} baZi convertToBaZi() 輸出
 * @param {{year?: number}} [sel]
 */
export function generatePlainBaziTimeCard(baZi, { year } = {}) {
  if (year != null) {
    // 瀏覽器已經另外顯示十年大運背景；此卡專門回答使用者點選的那一年。
    // composeAnnualChange 沿用既有流年干支、十神與地支引動結果，不在白話層重算命盤。
    return baziTimeTopic(baZi, { decadal: null, annual: composeAnnualChange(baZi, year, { mode: 'public' }) });
  }
  return baziTimeTopic(baZi, composeBaZiLuck(baZi, { mode: 'public' }));
}

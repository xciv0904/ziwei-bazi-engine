// src/engines/learning-palace.js — 紫微「學習模式」的逐步判讀與證據鏈組裝
//
// 這支只做一件事:把既有排盤結果(convertToZiWei 輸出)重新整理成「初學者可以照著讀一遍」的五個步驟,
// 並把每一步用到的資料標成主要依據/輔助依據,最後收斂成一段可以追溯來源的白話結論。
//
// 嚴格遵守的界線:
//   1. 不重新排盤、不自己算宮位星曜四化。對宮/三合/自化/飛化/來因宮全部沿用既有函式:
//      compose-annual.js 的 computeSelfTransformations / flyingOfStem / computeLaiyinPalace,
//      三方四正沿用「地支 +4/+6/+8」這條在 compose-plain.js 與 main.js 已經在用的同一條規則。
//   2. 不新增命理結論。所有敘述只能引用步驟一到四已經列出來的盤面資料,
//      措辭一律用「可能、較容易、可理解為」,不寫成確定會發生的事。
//   3. 不寫死任何一張命盤的答案。星名、宮名、四化落點全部從傳入的 ziWei 取得。

import doubleStarDb from '../data/double-star-combinations.json' with { type: 'json' };
import doubleStarPalace from '../data/double-star-palace.json' with { type: 'json' };
import starGlossary from '../data/star-glossary.json' with { type: 'json' };
import starPalaceApp from '../data/star-palace-application.json' with { type: 'json' };
import {
  AUSPICIOUS_EFFECT,
  AUSPICIOUS_MINOR,
  AUSPICIOUS_RULE,
  BIRTH_MUTAGEN_PLAIN,
  BORROW_RULE,
  BRIGHTNESS_NOTE,
  DOUBLE_STAR_TEACHING,
  EMPTY_PALACE_GUIDE,
  FLYING_PLAIN,
  GLOSSARY,
  LESSON_STEPS,
  MALEFIC_EFFECT,
  MALEFIC_MINOR,
  MALEFIC_RULE,
  MINOR_STAR_RULE,
  MUTAGEN_ACTION_WORD,
  MUTAGEN_BASICS,
  MUTAGEN_CAUTION,
  MUTAGEN_LAYERS,
  PALACE_AXES,
  PALACE_LIFE_WORD,
  PALACE_STEM_INTRO,
  PERIOD_MUTAGEN_PLAIN,
  READING_ORDER,
  SELF_MUTAGEN_NOTE,
  SELF_MUTAGEN_PLAIN,
  TRIAD_NOTE,
  TRIAD_SYNTHESIS,
} from '../data/learning-mode.js';

/** 宮名 → 生活用語。四化的白話翻譯要講「這代表生活裡的什麼」,不能只講宮名。 */
const lifeWord = (palaceName) => PALACE_LIFE_WORD[palaceName] ?? palaceName;

const DOUBLE_STAR_COMBOS = doubleStarDb['雙主星組合'];
const DOUBLE_STAR_PALACE = doubleStarPalace['雙星落宮'];

/**
 * 雙星組合本身的一句話介紹太抽象——「領導特質加上務實理財觀」放在命宮與放在夫妻宮
 * 講的根本是兩回事。這裡把「這一組落在這一宮會怎樣」取出來，和主星應用同一個做法。
 * key 的順序固定為 double-star-combinations.json 的寫法，所以要正反兩種組法都試。
 */
function doubleStarApplicationOf(palaceName, starNames) {
  if (starNames.length !== 2) return null;
  const [a, b] = starNames;
  const entry = DOUBLE_STAR_PALACE[`${a}+${b}`] ?? DOUBLE_STAR_PALACE[`${b}+${a}`];
  return entry?.[palaceName] ?? null;
}
const STAR_GLOSSARY = starGlossary['詞條'];
const MAJOR_APPLICATION = starPalaceApp['主星應用'];
const AUX_APPLICATION = starPalaceApp['吉煞祿馬落宮'];
const MINOR_APPLICATION = starPalaceApp['雜曜落宮'];
const PALACE_GROUPS = starPalaceApp['宮位分類'];

/** 宮位 → 分類（雜曜依分類撰寫，不逐宮窮舉） */
function palaceGroupOf(palaceName) {
  for (const [group, palaces] of Object.entries(PALACE_GROUPS)) {
    if (palaces.includes(palaceName)) return group;
  }
  return null;
}

/** 這顆星落在這一宮的實際影響：主星給三項，吉煞祿馬逐宮，其餘雜曜依宮位分類 */
function applicationOf(palaceName, starName) {
  const major = MAJOR_APPLICATION[palaceName]?.[starName];
  if (major) return { type: 'major', ...major };
  const aux = AUX_APPLICATION[starName]?.[palaceName];
  if (aux) return { type: 'aux', 影響: aux };
  const group = palaceGroupOf(palaceName);
  const minor = group ? MINOR_APPLICATION[starName]?.[group] : null;
  if (minor) return { type: 'minor', group, 影響: minor };
  return null;
}

/**
 * 雙主星組合說明。兩種順序都試——資料庫的鍵值只收一種寫法，
 * 但命盤上兩顆星的排列順序不固定（與 compose.js lookupCombo 同一套做法）。
 */
function lookupDoubleStar(starNames) {
  if (starNames.length !== 2) return null;
  const [a, b] = starNames;
  return DOUBLE_STAR_COMBOS[`${a}+${b}`] ?? DOUBLE_STAR_COMBOS[`${b}+${a}`] ?? null;
}

/** 單顆星的小百科定義：讓使用者在命盤上點到就看得到，不必離開頁面去查 */
function glossaryOf(name) {
  const entry = STAR_GLOSSARY[name];
  if (!entry) return null;
  return { name, category: entry['類別'], core: entry['核心'], plain: entry['白話'] };
}
import { palaceMeanings } from '../data/palace-meanings.js';
import { starMeanings } from '../data/star-meanings.js';
import { computeLaiyinPalace, computeSelfTransformations, flyingOfStem } from './compose-annual.js';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 十二宮固定順序(練習題選項與進度計算共用) */
export const PALACE_ORDER = [
  '命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮',
  '遷移宮', '僕役宮', '官祿宮', '田宅宮', '福德宮', '父母宮',
];

const offsetBranch = (branch, offset) => BRANCHES[(BRANCHES.indexOf(branch) + offset) % 12];

/** 輔星欄位存的是「名稱(亮度)」格式化字串,取回純星名 */
const bareStarName = (formatted) => String(formatted).replace(/[(（].*$/, '').trim();

const byBranchOf = (ziWei) => Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));

const palaceOf = (ziWei, palaceName) => ziWei.palaces.find((p) => p.name === palaceName) ?? null;

const starLabel = (star) => {
  const tags = [star.brightness, star.transformation ? `生年化${star.transformation}` : ''].filter(Boolean);
  return tags.length ? `${star.name}（${tags.join('、')}）` : star.name;
};

const starNamesOf = (palace) => (palace?.majorStars ?? []).map((s) => s.name);

/** 把宮位的雜曜依六吉/六煞/其餘分三類,讓初學者知道哪些要先看 */
function classifyMinorStars(palace) {
  const auspicious = [];
  const malefic = [];
  const others = [];
  for (const raw of palace.minorStars ?? []) {
    const name = bareStarName(raw);
    if (AUSPICIOUS_MINOR.has(name)) auspicious.push(raw);
    else if (MALEFIC_MINOR.has(name)) malefic.push(raw);
    else others.push(raw);
  }
  return { auspicious, malefic, others };
}

/**
 * 三方四正:本宮 + 對宮(+6) + 三合兩宮(+4、+8)。
 * 與 compose-plain.js trianglePalacesOf()、main.js renderZiWeiCard() 用的是同一條位移規則,
 * 不另外算一套,以免盤面高亮和教學內容對不起來。
 */
export function triadOf(ziWei, palaceName) {
  const palace = palaceOf(ziWei, palaceName);
  if (!palace) return null;
  const byBranch = byBranchOf(ziWei);
  const branch = palace.position[1];
  const pick = (offset, role) => {
    const target = byBranch[offsetBranch(branch, offset)];
    if (!target) return null;
    return {
      role,
      name: target.name,
      position: target.position,
      branch: target.position[1],
      stars: starNamesOf(target),
      isEmpty: target.majorStars.length === 0,
    };
  };
  const self = { role: 'self', name: palace.name, position: palace.position, branch, stars: starNamesOf(palace), isEmpty: palace.majorStars.length === 0 };
  const members = [self, pick(6, 'opposite'), pick(4, 'triad'), pick(8, 'triad')].filter(Boolean);
  return { members, branches: members.map((m) => m.branch) };
}

/** 生年四化:本宮主星身上帶的 transformation(iztro 已算好,這裡只挑出來) */
function birthMutagensOf(palace) {
  return (palace.majorStars ?? [])
    .filter((s) => s.transformation)
    .map((s) => ({
      layer: 'birth',
      star: s.name,
      mutagen: String(s.transformation).replace(/^化/, ''),
      fromLabel: '出生年天干',
      landing: palace.name,
    }));
}

/**
 * 某一層天干的四化,只保留「落入本宮」與「由本宮飛出」兩種跟這一宮有關的線索,
 * 其餘 48 條飛化不在這一頁列出——初學者一次看四十幾條只會放棄。
 */
function layerFlights(ziWei, stem, layer, fromLabel, palaceName) {
  if (!stem) return [];
  return flyingOfStem(ziWei, stem).map((f) => ({
    layer,
    star: f.star,
    mutagen: f.mutagen,
    fromLabel,
    landing: f.palaceName,
    landsHere: f.palaceName === palaceName,
  }));
}

/** 一條四化線索的完整句子:從哪裡出發、哪顆星、哪一種四化、落入哪一宮 */
export function describeFlight(flight) {
  const layer = MUTAGEN_LAYERS[flight.layer];
  const scope = layer ? `${layer.label}（${layer.scope}）` : '四化';
  return `${scope}：${flight.fromLabel}使${flight.star}化${flight.mutagen}，落入${flight.landing}。`;
}

/** 從候選裡取 n 個，同一張盤同一宮永遠取到同一組（不會每次重繪就換選項） */
function pickWithSeed(pool, n, seed) {
  return shuffleWithSeed([...new Set(pool)], seed).slice(0, n);
}

/** 建立一筆證據,key 用來去重,避免同一份資料在主要與輔助依據各算一次 */
const evidenceItem = (key, kind, text) => ({ key, kind, text });

/**
 * 逐步判讀主函式。
 *
 * @param {object}   args
 * @param {object}   args.ziWei        convertToZiWei() 輸出
 * @param {string}   args.palaceName   要研究的宮位(十二宮之一)
 * @param {number}   [args.year]       目前正在看的流年西元年(有給才產生流年那一層)
 * @param {object}   [args.majorLimit] ziWei.majorLimits 的元素(有給才產生大限那一層)
 * @returns {object|null}
 */
export function buildPalaceLesson({ ziWei, palaceName, year = null, majorLimit = null }) {
  const palace = palaceOf(ziWei, palaceName);
  if (!palace) return null;

  const branch = palace.position[1];
  const stem = palace.position[0];
  const byBranch = byBranchOf(ziWei);
  const opposite = byBranch[offsetBranch(branch, 6)] ?? null;
  const isEmpty = palace.majorStars.length === 0;
  const axis = PALACE_AXES[palaceName] ?? null;
  const minor = classifyMinorStars(palace);
  const laiyin = computeLaiyinPalace(ziWei);
  const isLaiyin = laiyin?.palaceName === palaceName;
  const selfT = computeSelfTransformations(ziWei).find((r) => r.palaceName === palaceName) ?? null;
  const triad = triadOf(ziWei, palaceName);

  // ---- 第一步:本宮 ----
  const brightnessNotes = (palace.majorStars ?? [])
    .filter((s) => s.brightness && BRIGHTNESS_NOTE[s.brightness])
    .map((s) => `${s.name}在${branch}為「${s.brightness}」：${BRIGHTNESS_NOTE[s.brightness]}`);
  const birthMutagens = birthMutagensOf(palace);
  // ---- 判讀四層:雙星結構 / 見吉 / 見煞 / 雜曜 ----
  // 這四層原本只列星名，使用者看得到卻學不到「怎麼用」。
  // 現在各自帶上作用說明與判斷規則，並照三合派的判讀順序排列。
  const selfStarNames = (palace.majorStars ?? []).map((s) => s.name);
  const doubleStar = selfStarNames.length === 2
    ? {
      pair: selfStarNames.join('、'),
      combined: lookupDoubleStar(selfStarNames),
      application: doubleStarApplicationOf(palaceName, selfStarNames),
      ...DOUBLE_STAR_TEACHING,
      // 入廟或帶生年四化的那一顆，通常是這組合裡的主導
      lead: (palace.majorStars.find((s) => s.transformation)
        ?? palace.majorStars.find((s) => ['廟', '旺'].includes(s.brightness))
        ?? palace.majorStars[0])?.name ?? null,
    }
    : { pair: selfStarNames.join('、'), combined: null, single: DOUBLE_STAR_TEACHING.single, lead: selfStarNames[0] ?? null };

  // 吉星煞星雜曜除了「這顆星是什麼」，還要給「落在這一宮會怎樣」——
  // 使用者實際看的是自己的盤，通則幫不上忙，要的是這一格的影響。
  const auspiciousDetail = minor.auspicious.map((raw) => {
    const name = bareStarName(raw);
    return {
      name, label: raw, effect: AUSPICIOUS_EFFECT[name] ?? '',
      glossary: glossaryOf(name), application: applicationOf(palaceName, name),
    };
  });
  const maleficDetail = minor.malefic.map((raw) => {
    const name = bareStarName(raw);
    return {
      name, label: raw, effect: MALEFIC_EFFECT[name] ?? '',
      glossary: glossaryOf(name), application: applicationOf(palaceName, name),
    };
  });
  const otherDetail = minor.others.map((raw) => {
    const name = bareStarName(raw);
    return { name, label: raw, glossary: glossaryOf(name), application: applicationOf(palaceName, name) };
  });

  const stepSelf = {
    id: 'self',
    palaceName,
    topic: palaceMeanings[palaceName] ?? '',
    position: palace.position,
    stem,
    branch,
    readingOrder: READING_ORDER,
    majorStars: (palace.majorStars ?? []).map(starLabel),
    majorStarFunctions: (palace.majorStars ?? []).map((s) => ({
      name: s.name,
      core: starMeanings[s.name]?.core ?? '',
      keywords: starMeanings[s.name]?.keywords ?? [],
      brightness: s.brightness ?? '',
      brightnessNote: s.brightness ? (BRIGHTNESS_NOTE[s.brightness] ?? '') : '',
      glossary: glossaryOf(s.name),
      // 這顆星落在這一宮怎麼發揮、要注意什麼、可以怎麼做
      application: applicationOf(palaceName, s.name),
    })),
    doubleStar,
    auspiciousStars: minor.auspicious,
    maleficStars: minor.malefic,
    otherStars: minor.others,
    auspiciousDetail,
    maleficDetail,
    otherDetail,
    auspiciousRule: AUSPICIOUS_RULE,
    maleficRule: MALEFIC_RULE,
    minorStarRule: MINOR_STAR_RULE,
    brightnessNotes,
    birthMutagens,
    selfMutagens: {
      outgoing: (selfT?.outgoing ?? []).map((x) => `${x.star}化${x.mutagen}`),
      incoming: (selfT?.incoming ?? []).map((x) => `${x.star}化${x.mutagen}`),
    },
    isBodyPalace: Boolean(palace.isBodyPalace),
    isLaiyin,
    isEmpty,
  };

  // ---- 第二步:對宮 ----
  const stepOpposite = opposite ? {
    id: 'opposite',
    name: opposite.name,
    position: opposite.position,
    stars: starNamesOf(opposite).map((n) => n),
    starLabels: (opposite.majorStars ?? []).map(starLabel),
    isEmpty: opposite.majorStars.length === 0,
    axis: axis?.axis ?? '',
    axisMeaning: axis?.axisMeaning ?? '',
    why: axis?.why ?? '',
  } : null;

  // ---- 第三步:三方四正 ----
  // 三方四正不能只給一張四宮表格。初學者看完表格會問「所以呢」——
  // 這裡把四宮合成一段話：這四件事是同一組、誰比較有定性、判斷時要怎麼用。
  const triadMembers = triad?.members ?? [];
  const triadOnly = triadMembers.filter((m) => m.role === 'triad');
  const oppositeMember = triadMembers.find((m) => m.role === 'opposite');
  const triadSynthesis = triadMembers.length ? [
    TRIAD_SYNTHESIS.lead(
      lifeWord(palaceName),
      oppositeMember ? lifeWord(oppositeMember.name) : '對宮',
      triadOnly.map((m) => lifeWord(m.name)),
    ),
    ...triadMembers.map((m) => (m.stars.length
      ? TRIAD_SYNTHESIS.starred(m.name, m.stars.join('、'))
      : TRIAD_SYNTHESIS.empty(m.name))),
    TRIAD_SYNTHESIS.closing(lifeWord(palaceName)),
  ] : [];

  const stepTriad = {
    id: 'triad',
    ...TRIAD_NOTE,
    members: triadMembers,
    branches: triad?.branches ?? [],
    synthesis: triadSynthesis,
  };

  // ---- 第四步:四化與自化 ----
  const annualStem = year ? stemOfYear(year) : null;
  const decadalStem = majorLimit?.ganZhi?.[0] ?? null;
  const palaceFlights = layerFlights(ziWei, stem, 'palace', `${palaceName}宮干${stem}`, palaceName);
  const decadalFlights = layerFlights(ziWei, decadalStem, 'decadal', `大限${majorLimit?.ganZhi ?? ''}天干${decadalStem ?? ''}`, palaceName);
  const annualFlights = layerFlights(ziWei, annualStem, 'annual', `${year}年天干${annualStem ?? ''}`, palaceName);
  // 每一條四化都同時給「術語句」與「白話句」。
  // 術語句是正確的命理陳述，白話句回答的是初學者真正想問的「所以我的生活裡會怎樣」。
  // 兩者由閱讀模式決定顯示哪一個（白話模式只給白話，學習模式並列，專業模式只給術語）。
  const selfWord = lifeWord(palaceName);
  const oppositeWord = opposite ? lifeWord(opposite.name) : '對宮';
  const stepMutagen = {
    id: 'mutagen',
    // 畫面要用它把「落在本宮」與「落在別宮」分開，所以這裡帶上宮名
    palaceName,
    basics: MUTAGEN_BASICS,
    caution: MUTAGEN_CAUTION,
    layers: MUTAGEN_LAYERS,
    selfNote: SELF_MUTAGEN_NOTE,
    stemIntro: PALACE_STEM_INTRO,
    birth: birthMutagens.map((f) => ({
      ...f,
      sentence: `生年四化（一輩子）：出生年天干使${f.star}化${f.mutagen}，就坐在${palaceName}。`,
      plain: BIRTH_MUTAGEN_PLAIN[f.mutagen]?.(f.star, selfWord) ?? '',
    })),
    palace: palaceFlights.map((f) => ({
      ...f,
      sentence: describeFlight(f),
      plain: FLYING_PLAIN[f.mutagen]?.(selfWord, lifeWord(f.landing)) ?? '',
    })),
    selfOutgoing: (selfT?.outgoing ?? []).map((x) => ({
      star: x.star,
      mutagen: x.mutagen,
      sentence: `離心自化↓：${palaceName}宮干${stem}使${x.star}化${x.mutagen}，而${x.star}就在${palaceName}，能量往外散。`,
      plain: SELF_MUTAGEN_PLAIN.outgoing(selfWord),
    })),
    selfIncoming: (selfT?.incoming ?? []).map((x) => ({
      star: x.star,
      mutagen: x.mutagen,
      sentence: `向心自化↑：對宮${opposite?.name ?? ''}宮干${opposite?.position?.[0] ?? ''}使${x.star}化${x.mutagen}，而${x.star}在${palaceName}，能量由對宮灌入。`,
      plain: SELF_MUTAGEN_PLAIN.incoming(selfWord, oppositeWord),
    })),
    decadal: decadalFlights.map((f) => ({
      ...f,
      sentence: describeFlight(f),
      plain: PERIOD_MUTAGEN_PLAIN.decadal(MUTAGEN_ACTION_WORD[f.mutagen] ?? '', lifeWord(f.landing)),
    })),
    annual: annualFlights.map((f) => ({
      ...f,
      sentence: describeFlight(f),
      plain: PERIOD_MUTAGEN_PLAIN.annual(MUTAGEN_ACTION_WORD[f.mutagen] ?? '', lifeWord(f.landing)),
    })),
  };

  // ---- 第五步:整合(證據鏈) ----
  const evidence = buildEvidenceChain({
    palaceName, palace, opposite, isEmpty, stepSelf, stepTriad, stepMutagen, year, majorLimit,
  });

  const emptyGuide = isEmpty ? buildEmptyGuide({ palaceName, opposite, triad, stepSelf }) : null;

  return {
    palaceName,
    position: palace.position,
    stem,
    branch,
    isEmpty,
    isBodyPalace: Boolean(palace.isBodyPalace),
    isLaiyin,
    axis,
    steps: LESSON_STEPS.map((meta) => ({
      ...meta,
      data: { self: stepSelf, opposite: stepOpposite, triad: stepTriad, mutagen: stepMutagen, synthesis: evidence }[meta.id],
    })),
    highlightBranches: stepTriad.branches,
    evidence,
    emptyGuide,
    glossary: glossaryTermsFor({ isEmpty, stepSelf, stepMutagen }),
  };
}

const YEAR_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const stemOfYear = (y) => YEAR_STEMS[(y - 4) % 10];

/** 這一頁實際出現過的名詞才給小百科,不要每次都塞十五條 */
function glossaryTermsFor({ isEmpty, stepSelf, stepMutagen }) {
  const wanted = new Set(['對宮', '三方四正', '宮干', '生年四化', '飛化', '大限', '流年', '廟旺利陷']);
  if (isEmpty) wanted.add('空宮');
  if (stepSelf.isBodyPalace) wanted.add('身宮');
  if (stepSelf.isLaiyin) wanted.add('來因宮');
  if (stepMutagen.selfOutgoing.length) wanted.add('離心自化');
  if (stepMutagen.selfIncoming.length) wanted.add('向心自化');
  if (stepSelf.palaceName === '命宮') wanted.add('命宮');
  return [...wanted].filter((term) => GLOSSARY[term]).map((term) => ({ term, text: GLOSSARY[term] }));
}

/**
 * 空宮專屬教學:順序固定,參考對象由本盤填入。
 *
 * 借過來的星要連同它的廟旺與生年四化一起列出——那兩項是星的屬性，會跟著走。
 * 只列星名的話，使用者會不知道「借」到底借了什麼，也分不清哪些東西留在對宮。
 */
function buildEmptyGuide({ palaceName, opposite, triad, stepSelf }) {
  const triadOnly = (triad?.members ?? []).filter((m) => m.role === 'triad');
  const ownMarks = [
    stepSelf.auspiciousStars.length ? `輔星${stepSelf.auspiciousStars.join('、')}` : '',
    stepSelf.maleficStars.length ? `煞曜${stepSelf.maleficStars.join('、')}` : '',
    `宮干${stepSelf.stem}`,
    stepSelf.isBodyPalace ? '身宮' : '',
    stepSelf.isLaiyin ? '來因宮' : '',
    stepSelf.birthMutagens.length ? stepSelf.birthMutagens.map((f) => `生年${f.star}化${f.mutagen}`).join('、') : '',
  ].filter(Boolean);

  // 借來的星：帶著廟旺與生年四化，因為那是星身上的屬性
  const borrowedStars = (opposite?.majorStars ?? []).map((s) => ({
    name: s.name,
    brightness: s.brightness ?? '',
    brightnessNote: s.brightness ? (BRIGHTNESS_NOTE[s.brightness] ?? '') : '',
    transformation: s.transformation ? String(s.transformation).replace(/^化/, '') : '',
    core: starMeanings[s.name]?.core ?? '',
    label: starLabel(s),
    glossary: glossaryOf(s.name),
    // 借來的星要放回本宮的主題理解，所以應用資料查的是「本宮」而不是對宮
    application: applicationOf(palaceName, s.name),
  }));

  // 借來的是雙星時，讀法與本宮自坐雙星相同：先看誰主導
  const borrowedDouble = borrowedStars.length === 2 ? {
    pair: borrowedStars.map((s) => s.name).join('、'),
    combined: lookupDoubleStar(borrowedStars.map((s) => s.name)),
    // 借來的雙星同樣要放回「本宮」的主題去理解，不是查對宮那一格
    application: doubleStarApplicationOf(palaceName, borrowedStars.map((s) => s.name)),
    lead: (borrowedStars.find((s) => s.transformation)
      ?? borrowedStars.find((s) => ['廟', '旺'].includes(s.brightness))
      ?? borrowedStars[0]).name,
    ...BORROW_RULE.doubleBorrowed,
  } : null;

  // 本宮已經有吉星或煞星時，才需要提醒「是否仍要借星」各家講法不同
  const hasOwnAuxiliary = stepSelf.auspiciousStars.length > 0 || stepSelf.maleficStars.length > 0;

  return {
    ...EMPTY_PALACE_GUIDE,
    palaceName,
    headline: `${palaceName}本身沒有十四主星，稱為空宮。`,
    lead: `${palaceName}本身無十四主星，不代表沒有內容。請共同參考${palaceName}本身、對宮${opposite?.name ?? ''}，以及三合的${triadOnly.map((m) => m.name).join('與')}。`,
    ownMarks,
    borrowRule: BORROW_RULE,
    borrowedFrom: opposite?.name ?? '',
    borrowedStars,
    borrowedDouble,
    hasOwnAuxiliary,
    // 這一宮實際借到什麼、實際留在對宮什麼，用本盤資料講具體，不是只給通則
    carriedActual: borrowedStars.length
      ? borrowedStars.map((s) => `${s.name}${s.brightness ? `（亮度${s.brightness}）` : ''}${s.transformation ? `，並帶著生年化${s.transformation}` : ''}`)
      : [],
    notCarriedActual: [
      (opposite?.minorStars ?? []).length
        ? `${opposite.name}的輔星煞曜與雜曜（${(opposite.minorStars ?? []).slice(0, 6).map((x) => bareStarName(x)).join('、')}…）留在${opposite.name}，不會跟著過來`
        : '',
      opposite ? `${opposite.name}的宮干${opposite.position?.[0] ?? ''}與它的飛化留在${opposite.name}；${palaceName}的飛化一律用自己的宮干${stepSelf.stem}` : '',
      opposite ? `${opposite.name}在講的主題（${palaceMeanings[opposite.name] ?? ''}）不跟著搬，借來的星要放回${palaceName}的主題重新理解` : '',
    ].filter(Boolean),
    references: [
      { label: `本宮 ${palaceName}`, detail: ownMarks.join('；') || '目前沒有可用的輔星或特殊標記' },
      {
        label: `對宮 ${opposite?.name ?? ''}（借主星）`,
        detail: borrowedStars.length
          ? borrowedStars.map((s) => s.label).join('、')
          : '對宮同樣沒有主星，需再往三合宮找',
      },
      ...triadOnly.map((m, i) => ({
        label: `第${i + 1}個三合宮 ${m.name}`,
        detail: m.stars.join('、') || '此宮同樣為空宮',
      })),
    ],
  };
}

/**
 * 證據鏈:把前四步已經列出來的資料分成主要依據、輔助依據、暫時不採用,
 * 再組一段可以逐句對回資料的白話結論。
 *
 * 去重規則:同一份資料只會出現在一個清單裡(以 key 判斷),避免同一個訊號被算兩次。
 */
export function buildEvidenceChain({ palaceName, palace, opposite, isEmpty, stepSelf, stepTriad, stepMutagen, year, majorLimit }) {
  const used = new Set();
  const primary = [];
  const supporting = [];
  const unused = [];
  const push = (list, item) => {
    if (!item || used.has(item.key)) return;
    used.add(item.key);
    list.push(item);
  };

  // --- 主要依據:直接決定這一宮怎麼讀的資料 ---
  if (isEmpty) {
    for (const name of starNamesOf(opposite)) {
      push(primary, evidenceItem(`star:${name}`, '對宮主星（空宮借看）',
        `${palaceName}無主星，對宮${opposite?.name ?? ''}的${name}是目前最主要的參考來源。`));
    }
  } else {
    for (const star of palace.majorStars) {
      const core = starMeanings[star.name]?.core ?? '';
      const bright = star.brightness ? `亮度${star.brightness}` : '';
      push(primary, evidenceItem(`star:${star.name}`, '本宮主星',
        `${palaceName}坐${star.name}${bright ? `（${bright}）` : ''}${core ? `，這顆星主要在講${core}` : ''}。`));
    }
  }
  // 雙星要當成一個組合來讀，這是主結構的一部分，不是補充
  if (stepSelf.doubleStar?.combined) {
    push(primary, evidenceItem('doublestar', '雙星組合',
      `${stepSelf.doubleStar.pair}同宮：${stepSelf.doubleStar.combined}`));
  }
  for (const f of stepMutagen.birth) {
    push(primary, evidenceItem(`birth:${f.star}${f.mutagen}`, '生年四化',
      `${f.star}帶生年化${f.mutagen}坐在${palaceName}，${MUTAGEN_BASICS[f.mutagen]?.plain ?? ''}`));
  }
  for (const x of stepMutagen.selfOutgoing) {
    push(primary, evidenceItem(`selfout:${x.star}${x.mutagen}`, '離心自化', x.sentence));
  }
  for (const x of stepMutagen.selfIncoming) {
    push(primary, evidenceItem(`selfin:${x.star}${x.mutagen}`, '向心自化', x.sentence));
  }
  for (const f of stepMutagen.palace.filter((item) => item.landsHere)) {
    push(primary, evidenceItem(`palacefly:${f.star}${f.mutagen}`, '宮干飛化（落回本宮）', f.sentence));
  }

  // --- 輔助依據:補充脈絡,但不足以單獨下結論 ---
  if (!isEmpty && opposite) {
    const oppStars = starNamesOf(opposite);
    push(supporting, evidenceItem(`opp:${opposite.name}`, '對宮',
      oppStars.length
        ? `對宮${opposite.name}見${oppStars.join('、')}，這條軸線是${stepSelf.topic ? `${palaceName}與${opposite.name}` : '本宮與對宮'}互相牽動的部分。`
        : `對宮${opposite.name}為空宮，這條軸線的另一端比較沒有固定模式。`));
  }
  for (const m of stepTriad.members.filter((item) => item.role === 'triad')) {
    push(supporting, evidenceItem(`triad:${m.name}`, '三合宮',
      m.stars.length
        ? `三合的${m.name}見${m.stars.join('、')}，代表這個主題也會出現在${palaceMeanings[m.name] ?? m.name}這個場景。`
        : `三合的${m.name}為空宮，這個方向的表現比較隨環境變動。`));
  }
  // 六吉六煞改變的是力道與方式，屬於輔助依據——主題仍由主星與四化決定
  for (const item of stepSelf.auspiciousDetail ?? []) {
    push(supporting, evidenceItem(`aux:${item.name}`, '六吉星',
      `同宮見${item.name}：${item.effect}`));
  }
  for (const item of stepSelf.maleficDetail ?? []) {
    push(supporting, evidenceItem(`sha:${item.name}`, '六煞星',
      `同宮見${item.name}：${item.effect}判斷時要看主星是否入廟——入廟時這股力道會轉成執行力，落陷時才容易變成問題。`));
  }
  if (stepSelf.isBodyPalace) {
    push(supporting, evidenceItem('body', '身宮', `${palaceName}同時是身宮，中年之後這個領域的感受通常會比年輕時更明顯。`));
  }
  if (stepSelf.isLaiyin) {
    push(supporting, evidenceItem('laiyin', '來因宮', `${palaceName}是來因宮（宮干與出生年天干相同），飛星派把它視為一生課題的起點。`));
  }
  for (const f of stepMutagen.decadal.filter((item) => item.landsHere)) {
    push(supporting, evidenceItem(`decadal:${f.star}${f.mutagen}`, `大限四化（${majorLimit?.ageRange ?? ''}歲）`, f.sentence));
  }
  for (const f of stepMutagen.annual.filter((item) => item.landsHere)) {
    push(supporting, evidenceItem(`annual:${f.star}${f.mutagen}`, `流年四化（${year ?? ''}年）`, f.sentence));
  }

  // --- 暫時不採用:有列出來但這次沒拿來當理由,說清楚為什麼 ---
  if (stepSelf.otherStars.length) {
    // 舊版只寫「先不列入判斷」，等於告訴使用者別看。實際上雜曜不是不能看，
    // 而是有先後：主結構讀完之後，它才用來解釋「為什麼是這種形式」。
    unused.push(evidenceItem('minor:other', '雜曜（順序在後，不是不能看）',
      `${stepSelf.otherStars.join('、')}屬於雜曜。判讀順序上它們排在主星、廟旺、四化與吉煞之後：`
      + `主結構先指出這一宮的主題，雜曜再補「以什麼形式呈現」。`
      + `任何一張命盤都找得到幾顆雜曜支持你想要的結論，所以先讀完主結構再看它們。`));
  }
  const outboundPalace = stepMutagen.palace.filter((item) => !item.landsHere);
  if (outboundPalace.length) {
    unused.push(evidenceItem('palacefly:out', '本宮飛出去的四化',
      `${outboundPalace.map((f) => `${f.star}化${f.mutagen}→${f.landing}`).join('、')}是${palaceName}往其他宮位送出的能量，屬於宮位之間的關係，判斷${palaceName}本身時先不納入。`));
  }
  const otherDecadal = stepMutagen.decadal.filter((item) => !item.landsHere);
  if (otherDecadal.length) {
    unused.push(evidenceItem('decadal:other', '沒有落到本宮的大限四化',
      `${otherDecadal.map((f) => `化${f.mutagen}→${f.landing}`).join('、')}這幾條這次沒有落到${palaceName}，屬於其他宮位這十年的重點。`));
  }
  const otherAnnual = stepMutagen.annual.filter((item) => !item.landsHere);
  if (otherAnnual.length) {
    unused.push(evidenceItem('annual:other', '沒有落到本宮的流年四化',
      `${otherAnnual.map((f) => `化${f.mutagen}→${f.landing}`).join('、')}這幾條落在別的宮位，看${palaceName}時不必算進來。`));
  }

  return {
    primary,
    supporting,
    unused,
    conclusion: buildConclusion({ palaceName, isEmpty, opposite, stepSelf, stepTriad, stepMutagen, primary, supporting, year, majorLimit }),
    // 第二段的結構化版本：每句附上它來自哪一步，畫面可以標成可回查的標籤。
    // 刻意不放進 conclusion，那裡只收畫面直接印的字串。
    interactionSteps: buildInteractionSteps({ palaceName, isEmpty, opposite, stepTriad, stepMutagen }),
    limits: buildLimits({ palaceName, isEmpty, stepMutagen, year, majorLimit }),
  };
}

/**
 * 四段式結論:盤面看到什麼 → 資料之間怎麼互相影響 → 可能出現在什麼行為或情境 → 還需要什麼才能確認。
 * 每一句都只引用上面已列出的證據,不引入新的命理判斷。
 */
/**
 * 第二段的推導：每一句寫成「因為某項盤面事實 → 所以會怎樣」，並記下它來自哪一步。
 * 使用者反映看不懂結論從哪來，關鍵就是這層因果與來源標註。
 *
 * source 記的是步驟 id 而不是「第四步」這種字面，序號由畫面依當前階段實際顯示的順序去編；
 * 初階不顯示三方四正與四化，那幾句連同來源標籤會被整句濾掉，不會指向一個看不到的步驟。
 */
function buildInteractionSteps({ palaceName, isEmpty, opposite, stepTriad, stepMutagen }) {
  const domainWord = lifeWord(palaceName);
  const oppositeDomain = opposite ? lifeWord(opposite.name) : '對宮';
  const steps = [];
  for (const f of stepMutagen.birth) {
    steps.push({
      text: `因為${f.star}帶著出生就有的化${f.mutagen}坐在這裡，所以${domainWord}這一塊${MUTAGEN_BASICS[f.mutagen]?.plain ?? ''}而且這是一輩子的底色，不會隨時間消失。`,
      source: { step: 'mutagen', label: '生年四化' },
    });
  }
  if (stepMutagen.selfOutgoing.length) {
    steps.push({
      text: `因為這一宮有離心自化，所以${domainWord}的能量比較留不住：你在這裡投入的東西常常做了就過去，需要重新再來一次。`,
      source: { step: 'mutagen', label: '離心自化' },
    });
  }
  if (stepMutagen.selfIncoming.length) {
    steps.push({
      text: `因為這一宮有向心自化，所以${domainWord}的狀態很受${oppositeDomain}牽動：${oppositeDomain}一有變化，這裡通常就跟著動。`,
      source: { step: 'mutagen', label: '向心自化' },
    });
  }
  if (isEmpty) {
    steps.push({
      text: `因為本宮沒有主星，所以${domainWord}沒有固定的預設模式，表現主要跟著對宮與三合宮走，也就比較會隨環境與你的選擇改變。`,
      source: { step: 'self', label: '空宮' },
    });
  } else if (opposite) {
    steps.push({
      text: `因為${opposite.name}是同一條軸線的另一端，所以判斷${domainWord}時要連著${oppositeDomain}一起看，只取一邊容易失準。`,
      source: { step: 'opposite', label: '對宮' },
    });
  }
  const triadNames = stepTriad.members.filter((m) => m.role === 'triad').map((m) => m.name);
  if (triadNames.length) {
    steps.push({
      text: `因為三合連到${triadNames.join('與')}，所以${triadNames.map((n) => lifeWord(n)).join('或')}一有變化，${domainWord}通常也會跟著受影響。`,
      source: { step: 'triad', label: '三方四正' },
    });
  }
  return steps;
}

function buildConclusion({ palaceName, isEmpty, opposite, stepSelf, stepTriad, stepMutagen, primary, supporting, year, majorLimit }) {
  const topic = palaceMeanings[palaceName] ?? palaceName;
  const mainStars = isEmpty ? starNamesOf(opposite) : stepSelf.majorStarFunctions.map((s) => s.name);
  const cores = (isEmpty ? starNamesOf(opposite) : mainStars)
    .map((n) => starMeanings[n]?.core).filter(Boolean);
  const keywords = (isEmpty ? starNamesOf(opposite) : mainStars)
    .flatMap((n) => starMeanings[n]?.keywords ?? []).slice(0, 3);

  const observedParts = [
    `${palaceName}在${stepSelf.branch}，宮干${stepSelf.stem}`,
    isEmpty
      ? `本宮無主星，對宮${opposite?.name ?? ''}見${mainStars.join('、') || '亦無主星'}`
      : `坐${stepSelf.majorStars.join('、')}`,
  ];
  if (stepSelf.maleficStars.length) observedParts.push(`同宮見煞曜${stepSelf.maleficStars.join('、')}`);
  if (stepSelf.auspiciousStars.length) observedParts.push(`同宮見輔星${stepSelf.auspiciousStars.join('、')}`);
  if (stepSelf.isBodyPalace) observedParts.push('此宮同時是身宮');
  const observed = `${observedParts.join('，')}。`;

  const interactionParts = buildInteractionSteps({ palaceName, isEmpty, opposite, stepTriad, stepMutagen });
  const interaction = interactionParts.length
    ? interactionParts.map((p) => p.text).join('')
    : '這一宮目前的資料之間沒有特別強的互相牽動。';

  // 第三段要看得出是從哪幾顆星推來的，不能只把星曜的關鍵詞貼上去。
  const leadStarNames = isEmpty ? starNamesOf(opposite) : mainStars;
  const behaviorLead = cores.length
    ? `因為這一宮的主要力量來自${leadStarNames.join('與')}（${cores.join('；')}），所以${topic}這個部分可能較容易出現這幾種反應。`
    : `這一宮目前沒有特別突出的固定模式，${topic}的表現會比較隨環境與經驗改變。`;
  const behaviorTail = keywords.length
    ? `落到日常裡，最容易在跟${keywords.join('、')}有關的情況下看到——那是這幾顆星最常起作用的場合。`
    : '';
  const behavior = `${behaviorLead}${behaviorTail}`;

  const pendingParts = [];
  if (isEmpty) pendingParts.push(`空宮的判斷一定要把對宮與兩個三合宮一起看完，只憑對宮主星就下定論容易失準`);
  if (!stepMutagen.decadal.some((f) => f.landsHere)) pendingParts.push(`目前的大限${majorLimit?.ganZhi ? `（${majorLimit.ganZhi}）` : ''}四化沒有落到${palaceName}，這十年的推力要另外從落點宮位判斷`);
  if (!stepMutagen.annual.some((f) => f.landsHere) && year) pendingParts.push(`${year}年的流年四化也沒有落到${palaceName}，當年度的變化需要看其他宮位`);
  if (supporting.length === 0) pendingParts.push('目前可用的輔助資料偏少，建議再對照其他宮位');
  pendingParts.push('以上是依盤面資料整理出的可能傾向，不是必然會發生的事');
  const pending = `${pendingParts.join('；')}。`;

  return { observed, interaction, behavior, pending };
}

function buildLimits({ palaceName, isEmpty, stepMutagen, year, majorLimit }) {
  const limits = [
    '這一頁只用到單一宮位與它的三方四正，完整判讀仍需綜合十二宮與大限流年交叉參看。',
    MUTAGEN_CAUTION,
  ];
  if (isEmpty) limits.push('空宮借對宮主星只是參看，不能把對宮的個性整段當成本宮坐命的主星。');
  if (!majorLimit) limits.push('目前沒有選定大限，缺少十年這一層的資料。');
  if (!year) limits.push('目前沒有選定流年，缺少當年度這一層的資料。');
  if (!stepMutagen.birth.length) limits.push(`${palaceName}沒有生年四化，一生固定的著力點要從其他宮位找。`);
  return limits;
}

// ---------- 「先自己判斷」練習題 ----------

const shuffleWithSeed = (items, seed) => {
  // 固定種子的洗牌:同一張命盤、同一宮位每次產生的選項順序一致,
  // 使用者答完再回來看時不會因為選項跳動而困惑,也讓測試可以重複驗證。
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const seedOf = (text) => [...String(text)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 2147483647, 7);

function choiceQuestion({ id, kind = 'chart', prompt, answer, distractors, explain, seed }) {
  const pool = [...new Set([answer, ...distractors])].slice(0, 4);
  if (pool.length < 2) return null;
  // kind: 'chart' 這一宮專屬（每宮都不同）／'concept' 通則（答對一次就不再出）
  return { id, kind, prompt, options: shuffleWithSeed(pool, seed), answer, explain };
}

/**
 * 依當前命盤動態產生選擇題。
 * 只出「可以由盤面資料直接驗證」的題目:不考流派爭議,也不考模糊的命理解釋。
 *
 * 題目分三類，這個分類是使用者回報「一套做下來感覺是複習了十二次」之後才加的：
 *
 *   concept 通則題，答案跟看哪一宮無關（判讀順序、雜曜的角色、煞星怎麼看）。
 *           答對一次就代表懂了，之後不再出。
 *   drill   基本功題（本宮主星、對宮、三合宮、是不是空宮）。答案每宮不同，
 *           但題型一字不差，連問十二次會變成抄寫練習。答對三宮之後退場。
 *   chart   這一宮真正專屬的題目（生年四化、廟旺、這一宮在看什麼、
 *           這顆星放在這一宮怎麼發揮、空宮借星…）。永遠優先，也永遠不退場。
 *
 * 退場之後名額讓給 chart 類，所以愈往後的宮位，題目愈是這一宮才有的東西。
 *
 * @param {object} lesson              buildPalaceLesson() 的輸出
 * @param {object} ziWei               convertToZiWei() 輸出(取其他宮位當誘答選項)
 * @param {object} [options]
 * @param {Map<string, number>} [options.mastery] 每種題目已經答對過幾宮
 * @param {number} [options.max]       一次最多出幾題（預設 5，太多題會讓人放棄）
 */
export function buildPalaceQuiz(lesson, ziWei, options = {}) {
  if (!lesson) return [];
  const mastery = options.mastery ?? new Map();
  const maxQuestions = options.max ?? 5;
  // 退場門檻：通則題答對一次就夠，基本功題要答對三宮才算熟
  const RETIRE_AT = { concept: 1, drill: 3 };
  const seed = seedOf(`${lesson.palaceName}${lesson.position}`);
  const otherPalaces = PALACE_ORDER.filter((n) => n !== lesson.palaceName);
  const allStars = [...new Set(ziWei.palaces.flatMap((p) => p.majorStars.map((s) => s.name)))];
  const self = lesson.steps.find((s) => s.id === 'self').data;
  const opposite = lesson.steps.find((s) => s.id === 'opposite').data;
  const triad = lesson.steps.find((s) => s.id === 'triad').data;
  const mutagen = lesson.steps.find((s) => s.id === 'mutagen').data;
  const triadNames = triad.members.filter((m) => m.role === 'triad').map((m) => m.name);

  const questions = [];

  // 1) 本宮主星
  const selfStarAnswer = self.majorStars.length ? self.majorStars.map((s) => s.split('（')[0]).join('、') : '無主星（空宮）';
  questions.push(choiceQuestion({
    id: 'self-stars',
    kind: 'drill',
    prompt: `${lesson.palaceName}本身的主星是什麼？`,
    answer: selfStarAnswer,
    distractors: [
      '無主星（空宮）',
      ...allStars.filter((n) => !selfStarAnswer.includes(n)).slice(0, 3),
    ].filter((x) => x !== selfStarAnswer),
    explain: self.majorStars.length
      ? `${lesson.palaceName}位於${lesson.position}，盤面上這一宮列的主星是${selfStarAnswer}。`
      : `${lesson.palaceName}位於${lesson.position}，這一宮沒有十四主星，屬於空宮。`,
    seed,
  }));

  // 2) 對宮是哪一宮
  if (opposite) {
    questions.push(choiceQuestion({
      id: 'opposite',
      kind: 'drill',
      prompt: `${lesson.palaceName}的對宮是哪一宮？`,
      answer: opposite.name,
      distractors: otherPalaces.filter((n) => n !== opposite.name).slice(0, 3),
      explain: `對宮是地支相隔六位的宮位。${lesson.palaceName}在${lesson.branch}，往後數六位是${opposite.position?.[1] ?? ''}，也就是${opposite.name}。`,
      seed: seed + 1,
    }));
  }

  // 3) 三合宮
  if (triadNames.length === 2) {
    const answer = triadNames.join('、');
    const wrongPool = otherPalaces
      .filter((n) => !triadNames.includes(n) && n !== opposite?.name)
      .slice(0, 6);
    questions.push(choiceQuestion({
      id: 'triad',
      kind: 'drill',
      prompt: `${lesson.palaceName}的兩個三合宮是哪兩宮？`,
      answer,
      distractors: [
        `${wrongPool[0]}、${wrongPool[1]}`,
        `${wrongPool[2]}、${wrongPool[3]}`,
        `${opposite?.name ?? wrongPool[4]}、${wrongPool[4]}`,
      ].filter(Boolean),
      explain: `三合宮是地支相隔四位與八位的兩宮。${lesson.palaceName}在${lesson.branch}，對應到的是${answer}。`,
      seed: seed + 2,
    }));
  }

  // 4) 是否為空宮
  questions.push(choiceQuestion({
    id: 'is-empty',
    kind: 'drill',
    prompt: `${lesson.palaceName}是不是空宮？`,
    answer: lesson.isEmpty ? '是，沒有十四主星' : '不是，有十四主星坐守',
    distractors: [lesson.isEmpty ? '不是，有十四主星坐守' : '是，沒有十四主星'],
    explain: lesson.isEmpty
      ? `${lesson.palaceName}沒有任何一顆十四主星，判定為空宮。空宮不代表不好，只是這個領域比較沒有固定的預設模式。`
      : `${lesson.palaceName}坐${selfStarAnswer}，有主星就不是空宮。`,
    seed: seed + 3,
  }));

  // 5) 生年四化(有才出題)
  if (mutagen.birth.length) {
    const answer = mutagen.birth.map((f) => `${f.star}化${f.mutagen}`).join('、');
    const fakes = mutagen.palace.filter((f) => !f.landsHere).slice(0, 2).map((f) => `${f.star}化${f.mutagen}`);
    questions.push(choiceQuestion({
      id: 'birth-mutagen',
      prompt: `${lesson.palaceName}裡，哪一項是「生年四化」？`,
      answer,
      distractors: [...fakes, '這一宮沒有生年四化'].filter((x) => x !== answer),
      explain: `生年四化是出生年天干決定的，會直接標在星曜上。${lesson.palaceName}的${answer}就是生年四化，一輩子都在。`,
      seed: seed + 4,
    }));
  }

  // 6) 流年四化(有落到本宮才出題,否則問層次概念)
  const annualHere = mutagen.annual.filter((f) => f.landsHere);
  if (annualHere.length) {
    const answer = annualHere.map((f) => `${f.star}化${f.mutagen}`).join('、');
    questions.push(choiceQuestion({
      id: 'annual-mutagen',
      prompt: `這一年落到${lesson.palaceName}的流年四化是哪一項？`,
      answer,
      distractors: [
        ...mutagen.birth.map((f) => `${f.star}化${f.mutagen}`),
        ...mutagen.annual.filter((f) => !f.landsHere).slice(0, 2).map((f) => `${f.star}化${f.mutagen}`),
      ].filter((x) => x !== answer),
      explain: `流年四化由流年天干引動，只影響當年。${answer}落在${lesson.palaceName}，跟一輩子都在的生年四化是不同層次。`,
      seed: seed + 5,
    }));
  }

  // 7) 判讀順序:初學者最常見的錯誤是看到煞星就先下結論，這題直接考先後
  questions.push(choiceQuestion({
    id: 'reading-order',
    kind: 'concept',
    prompt: '三合派判讀一個宮位時，下面哪一項應該最先看？',
    answer: '主星（沒有主星就借對宮）',
    distractors: ['同宮的煞曜', '雜曜', '大限與流年'],
    explain: '順序是主星 → 廟旺利陷 → 雙星組合 → 生年四化 → 六吉六煞 → 雜曜。主星是骨架，先確定這一宮由誰主導，後面幾層都是在調整它的力道與方式。',
    seed: seed + 7,
  }));

  // 8) 雙星組合(有兩顆主星才出題)
  if (self.doubleStar?.combined) {
    questions.push(choiceQuestion({
      id: 'double-star',
    kind: 'concept',
      prompt: `${lesson.palaceName}是${self.doubleStar.pair}同宮。判讀雙星時，正確的做法是什麼？`,
      answer: '當成一個新的組合來讀，看哪一顆主導、另一顆往哪個方向修飾',
      distractors: [
        '把兩顆星的特質相加，優點都算上',
        '只看第一顆，第二顆可以忽略',
        '兩顆星互相抵銷，等於沒有主星',
      ],
      explain: `雙星是一種取捨，不是特質相加。這一組裡${self.doubleStar.lead}入廟或帶生年四化，性質較強，多半由它主導。`,
      seed: seed + 8,
    }));
  }

  // 9) 廟旺(有亮度資料才出題)
  const bright = self.majorStarFunctions.find((s) => s.brightness);
  if (bright) {
    questions.push(choiceQuestion({
      id: 'brightness',
      prompt: `${bright.name}在${lesson.branch}的亮度是什麼？`,
      answer: bright.brightness,
      distractors: ['廟', '旺', '平', '陷'].filter((b) => b !== bright.brightness),
      explain: `${bright.name}在${lesson.branch}為「${bright.brightness}」。${bright.brightnessNote}亮度決定這顆星的力道，不等於吉凶。`,
      seed: seed + 9,
    }));
  }

  // 10) 煞星的正確理解:這是最容易被誤讀的一項
  if (self.maleficDetail?.length) {
    questions.push(choiceQuestion({
      id: 'malefic-rule',
    kind: 'concept',
      prompt: `${lesson.palaceName}見到${self.maleficDetail[0].name}，判斷時該怎麼看？`,
      answer: '看主星是否入廟：入廟時煞星轉成力道，落陷時才容易變成問題',
      distractors: [
        '見到煞星就代表這個領域不好',
        '煞星會改變這一宮的主題',
        '煞星只要有吉星同宮就完全沒有影響',
      ],
      explain: '煞星加的是力道與壓力，方向仍由主星決定。同一顆擎羊配入廟主星是執行力，配落陷主星才是衝突。',
      seed: seed + 10,
    }));
  }

  // 11) 雜曜的優先序
  if (self.otherStars?.length) {
    questions.push(choiceQuestion({
      id: 'minor-priority',
    kind: 'concept',
      prompt: '雜曜在判讀裡的角色是什麼？',
      answer: '排在最後，主結構讀完後用來補「以什麼形式呈現」',
      distractors: [
        '和主星一樣重要，要優先看',
        '完全不用看，沒有參考價值',
        '雜曜愈多代表命愈好',
      ],
      explain: '任何一張命盤都找得到幾顆雜曜支持你想要的結論，所以先讀完主星、廟旺、四化與吉煞，再看雜曜補細節。',
      seed: seed + 11,
    }));
  }

  // 12) 主要證據
  const primaryTop = lesson.evidence.primary[0];
  if (primaryTop) {
    const supportingTop = lesson.evidence.supporting.slice(0, 2).map((e) => e.kind);
    const unusedTop = lesson.evidence.unused.slice(0, 1).map((e) => e.kind);
    questions.push(choiceQuestion({
      id: 'primary-evidence',
      prompt: `判讀${lesson.palaceName}時，下面哪一項最可能是「主要依據」？`,
      answer: primaryTop.kind,
      distractors: [...supportingTop, ...unusedTop].filter((x) => x !== primaryTop.kind),
      explain: `主要依據是直接決定這一宮怎麼讀的資料，也就是${primaryTop.kind}；三合宮、身宮、大限流年這些屬於補充脈絡的輔助依據。`,
      seed: seed + 6,
    }));
  }

  // 13) 這一宮在看什麼——十二宮各不相同，而且是判讀的前提：
  //     不知道田宅宮管什麼，看到再多星曜也接不回自己的生活。
  const topicAnswer = palaceMeanings[lesson.palaceName];
  if (topicAnswer) {
    questions.push(choiceQuestion({
      id: 'palace-topic',
      prompt: `${lesson.palaceName}主要看的是什麼？`,
      answer: topicAnswer,
      distractors: otherPalaces.slice(0, 6).map((n) => palaceMeanings[n]).filter(Boolean).slice(0, 3),
      explain: `${lesson.palaceName}對應的是${topicAnswer}。先確定這一宮在講哪一塊生活，星曜的解釋才有地方放。`,
      seed: seed + 12,
    }));
  }

  // 14) 這顆主星放在這一宮怎麼發揮——誘答刻意取同一顆星在別宮的說法，
  //     因為初學者最容易犯的錯就是把星的通性直接套到每一宮。
  //     這一題每一宮的題目與選項都不同，是解決「十二宮出同一份題目」的主力。
  const appStar = self.majorStarFunctions.find((st) => st.application?.['發揮']);
  if (appStar) {
    const otherPalaceApps = otherPalaces
      .map((n) => MAJOR_APPLICATION[n]?.[appStar.name]?.['發揮'])
      .filter(Boolean);
    questions.push(choiceQuestion({
      id: 'star-application',
      prompt: `${appStar.name}坐${lesson.palaceName}，最能發揮的是下面哪一項？`,
      answer: appStar.application['發揮'],
      distractors: pickWithSeed(otherPalaceApps, 3, seed + 13),
      explain: `同一顆${appStar.name}放在不同宮位，發揮的地方完全不同——其他選項都是${appStar.name}真的會有的樣子，只是不在${lesson.palaceName}。星的性質是固定的，落在哪一宮決定它用在哪裡。`,
      seed: seed + 13,
    }));
  }

  // 15) 空宮才出：借星到底借了什麼。這題只有空宮的宮位會遇到，
  //     所以不會變成每一宮都出的通則題。
  if (lesson.isEmpty && lesson.emptyGuide?.borrowedFrom) {
    questions.push(choiceQuestion({
      id: 'borrow',
      prompt: `${lesson.palaceName}是空宮，要借${lesson.emptyGuide.borrowedFrom}的星來看。下面哪一項會跟著借過來？`,
      answer: '主星本身、它的廟旺，以及它帶的生年四化',
      distractors: [
        `${lesson.emptyGuide.borrowedFrom}的輔星與煞曜也一起搬過來`,
        `${lesson.emptyGuide.borrowedFrom}的宮干與飛化也一起搬過來`,
        `整個${lesson.emptyGuide.borrowedFrom}的宮位主題取代${lesson.palaceName}`,
      ],
      explain: `借的是「星」不是「宮」：廟旺與生年四化是星自己的屬性，跟著走；輔星煞曜、宮干飛化、宮位主題是宮位的東西，留在${lesson.emptyGuide.borrowedFrom}。`,
      seed: seed + 14,
    }));
  }

  const usable = questions.filter(Boolean);

  // 已經練熟的題型退場，名額讓給這一宮專屬的內容
  const filtered = usable.filter((q) => {
    const limit = RETIRE_AT[q.kind];
    return !limit || (mastery.get(q.id) ?? 0) < limit;
  });

  // 配比：每一份練習固定「最多 2 題基本功 + 最多 1 題通則 + 其餘全是這一宮專屬」。
  //
  // 不是單純把專屬題排前面就好——那樣前幾宮會完全沒有基本功題，初學者連
  // 對宮怎麼找都還沒熟就先被問應用。反過來把基本功排前面，前三宮又會被
  // 四題同樣的題型佔滿，回到使用者原本抱怨的那個樣子。
  // 固定配比讓每一宮都同時有「熟練」與「這一宮才有」的題目，
  // 而基本功與通則會隨著答對次數自然退場，名額自動讓給專屬題。
  const take = (kind, n) => filtered.filter((q) => q.kind === kind).slice(0, n);
  const drills = take('drill', 2);
  const concepts = take('concept', 1);
  const charts = take('chart', Math.max(1, maxQuestions - drills.length - concepts.length));
  // 顯示順序：先基本功（確認看得懂盤面）→ 再這一宮專屬（應用）→ 最後通則
  const picked = [...drills, ...charts, ...concepts].slice(0, maxQuestions);

  // 全部退場時不留空白：回頭給這一宮專屬的題目，練習區不能變成空的
  return picked.length ? picked : usable.filter((q) => q.kind === 'chart').slice(0, maxQuestions);
}

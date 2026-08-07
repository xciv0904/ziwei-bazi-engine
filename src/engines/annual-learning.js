// 流年學習系統：只重組 convertToZiWei 已算好的盤面資料，沒有排盤算法。
// 所有公開結論都先產生可追溯 evidence，再由 evidence 組裝，避免文案與命盤脫節。

import {
  ANNUAL_LEARNING_STEPS, ANNUAL_TOPIC_CONFIG, LAYER_MEANING, MUTAGEN_ACTION, MUTAGEN_CAUTION, TRIAD_ROLE_MEANING,
} from '../data/annual-learning.js';
import { starMeanings } from '../data/star-meanings.js';
import { PALACE_LIFE_WORD } from '../data/learning-mode.js';
import { palaceMeanings } from '../data/palace-meanings.js';
import {
  computeAnnualSnapshots,
  computeSelfTransformations,
  findAnnualRepeatedFocus,
  flyingOfStem,
} from './compose-annual.js';
import { triadOf } from './learning-palace.js';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GOOD = new Set(['祿', '權', '科']);

export const annualGanZhi = (year) => STEMS[(year - 4) % 10] + BRANCHES[(year - 4) % 12];
const lifeWord = (name) => PALACE_LIFE_WORD[name] ?? palaceMeanings[name] ?? name;
const palaceOf = (ziWei, name) => ziWei.palaces.find((p) => p.name === name) ?? null;
const palaceByBranch = (ziWei, branch) => ziWei.palaces.find((p) => p.position[1] === branch) ?? null;
const starsText = (palace) => (palace?.majorStars ?? []).map((s) => `${s.name}${s.brightness ? `（${s.brightness}）` : ''}`).join('、') || '無十四主星';

function limitOf(ziWei, input, year) {
  const nominalAge = year - input.year + 1;
  return ziWei.majorLimits.find((limit) => {
    const [start, end] = limit.ageRange.split('~').map(Number);
    return nominalAge >= start && nominalAge <= end;
  }) ?? null;
}

const limitBounds = (ziWei) => {
  const ranges = (ziWei.majorLimits ?? []).map((l) => l.ageRange.split('~').map(Number));
  if (!ranges.length) return null;
  return { first: Math.min(...ranges.map((r) => r[0])), last: Math.max(...ranges.map((r) => r[1])) };
};

/**
 * 這一年在大限序列上的位置。
 * 大限是從「起運歲」才開始排的，起運前那幾年（多半是出生到 5、6 歲之間）本來就沒有大限，
 * 大限跑完之後（通常 105 歲以上）也一樣。以前這兩種情形都只顯示「資料不足」，
 * 使用者會以為是程式壞了；實際上是命理本身在這個年紀沒有這一層資料，該說清楚而不是留白。
 */
export function annualLimitStatus(ziWei, input, year) {
  const nominalAge = year - input.year + 1;
  const bounds = limitBounds(ziWei);
  if (!bounds) return { status: 'unavailable', nominalAge, note: '這張命盤沒有大限資料，無法判讀十年背景。' };
  if (nominalAge < bounds.first) {
    return {
      status: 'before-start',
      nominalAge,
      startAge: bounds.first,
      note: `虛歲 ${nominalAge} 歲還沒起運（這張盤從虛歲 ${bounds.first} 歲起大限），所以這一年沒有十年大限可看。起運前的年份，傳統上改看小限與流年本身，不要硬套大限。`,
    };
  }
  if (nominalAge > bounds.last) {
    return {
      status: 'after-end',
      nominalAge,
      endAge: bounds.last,
      note: `虛歲 ${nominalAge} 歲已超過這張盤排定的最後一個大限（到虛歲 ${bounds.last} 歲），沒有可引用的十年背景。這一年只能就流年本身判讀。`,
    };
  }
  return { status: 'in-range', nominalAge, note: null };
}

/** 流年學習可選的年份區間：出生當年（虛歲 1）到虛歲 maxAge。 */
export function annualYearRange({ input, maxAge = 120 }) {
  const from = input.year;
  return { from, to: from + maxAge - 1, maxAge };
}

const sourceLabel = {
  birth: '本命', decadal: '大限', annual: '流年', self: '自化', minor: '小限',
  'annual-palace': '流年命宮', 'natal-triad': '本命三方四正', 'annual-triad': '流年三方四正',
};

function evidence({ id, sourceLayer, sourceType, sourcePalace = null, sourceStar = null,
  transformation = null, targetPalace = null, relevance = 'supporting', priority = 1,
  topic = 'overview', explanation }) {
  return { id, sourceLayer, sourceType, sourcePalace, sourceStar, transformation, targetPalace,
    relevance, priority, topic, explanation };
}

function transformationEvidence(items, layer, topic, related) {
  return items.map((item) => {
    const relevant = !related || related.includes(item.palaceName);
    return evidence({
      id: `${layer}:transform:${item.star}:${item.mutagen}:${item.palaceName}`,
      sourceLayer: layer,
      sourceType: 'transformation',
      sourcePalace: null,
      sourceStar: item.star,
      transformation: item.mutagen,
      targetPalace: item.palaceName,
      relevance: relevant ? 'primary' : 'unused',
      priority: relevant ? (item.mutagen === '忌' ? 4 : 3) : 0,
      topic,
      explanation: `${sourceLabel[layer]}：${item.star}化${item.mutagen}落入${item.palaceName}，表示${lifeWord(item.palaceName)}在這個時間層較需要${MUTAGEN_ACTION[item.mutagen]}。`,
    });
  });
}

function palaceEvidence(palace, layer, topic, relevance = 'supporting', role = '') {
  return evidence({
    id: `${layer}:palace:${palace.name}:${role}`,
    sourceLayer: layer,
    sourceType: 'palace',
    sourcePalace: palace.name,
    targetPalace: palace.name,
    relevance,
    priority: relevance === 'primary' ? 3 : 1,
    topic,
    explanation: `${sourceLabel[layer]}${role ? `（${role}）` : ''}：${palace.name}在${palace.position}，主星為${starsText(palace)}；這一宮主要看${palaceMeanings[palace.name] ?? lifeWord(palace.name)}。`,
  });
}

function uniqueEvidence(items) {
  const seen = new Set();
  return items.filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id));
}

/** 建立一個年份、主題所需的完整結構化事實。 */
export function buildAnnualLearningContext({ ziWei, input, year, topic = 'overview' }) {
  const topicConfig = ANNUAL_TOPIC_CONFIG[topic] ?? ANNUAL_TOPIC_CONFIG.overview;
  if (!topicConfig.available) throw new Error(`尚未開放的流年學習主題：${topic}`);
  const ganZhi = annualGanZhi(year);
  const nominalAge = year - input.year + 1;
  const majorLimit = limitOf(ziWei, input, year);
  const limitStatus = annualLimitStatus(ziWei, input, year);
  const decadalPalace = majorLimit ? palaceByBranch(ziWei, majorLimit.ganZhi[1]) : null;
  const annualPalace = palaceByBranch(ziWei, ganZhi[1]);
  const natalTriad = triadOf(ziWei, '命宮');
  // 選了主題（工作／感情／財務）時，該主題的本宮三方四正才是判讀底盤，
  // 只給命宮那一組會讓四個主題看起來一模一樣。
  const anchorTriad = topicConfig.anchorPalace ? triadOf(ziWei, topicConfig.anchorPalace) : null;
  const annualTriad = annualPalace ? triadOf(ziWei, annualPalace.name) : null;
  const related = topicConfig.relatedPalaces;
  const annualFlights = flyingOfStem(ziWei, ganZhi[0]);
  const decadalFlights = majorLimit ? flyingOfStem(ziWei, majorLimit.ganZhi[0]) : [];
  const birthFlights = ziWei.palaces.flatMap((p) => p.majorStars
    .filter((star) => star.transformation)
    .map((star) => ({ star: star.name, mutagen: String(star.transformation).replace(/^化/, ''), palaceName: p.name, position: p.position })));
  const selfTransformations = computeSelfTransformations(ziWei);
  const listedSmallLimit = ziWei.minorLimits.find((item) => item.year === year) ?? null;
  const indexedSmallLimit = ziWei.smallLimitPalaces?.[nominalAge] ?? null;
  const smallLimit = listedSmallLimit ?? (indexedSmallLimit ? {
    year, ganZhi, age: nominalAge, ...indexedSmallLimit,
  } : null);
  const snapshots = computeAnnualSnapshots(ziWei, year, 1, input.year);
  const adjacentFocus = findAnnualRepeatedFocus(ziWei, snapshots);
  const allEvidence = [];

  for (const member of natalTriad?.members ?? []) {
    const palace = palaceOf(ziWei, member.name);
    if (palace) allEvidence.push(palaceEvidence(palace, 'natal-triad', topic,
      !related || related.includes(palace.name) ? 'primary' : 'supporting', member.role));
  }
  if (decadalPalace) allEvidence.push(palaceEvidence(decadalPalace, 'decadal', topic, 'supporting', '大限命宮'));
  if (annualPalace) allEvidence.push(palaceEvidence(annualPalace, 'annual-palace', topic, 'primary', '年度舞台'));
  for (const member of annualTriad?.members ?? []) {
    const palace = palaceOf(ziWei, member.name);
    if (palace) allEvidence.push(palaceEvidence(palace, 'annual-triad', topic,
      !related || related.includes(palace.name) ? 'primary' : 'supporting', member.role));
  }
  allEvidence.push(...transformationEvidence(birthFlights, 'birth', topic, related));
  allEvidence.push(...transformationEvidence(decadalFlights, 'decadal', topic, related));
  allEvidence.push(...transformationEvidence(annualFlights, 'annual', topic, related));

  for (const row of selfTransformations) {
    for (const [direction, items] of [['outgoing', row.outgoing], ['incoming', row.incoming]]) {
      for (const item of items) {
        const relevant = !related || related.includes(row.palaceName);
        allEvidence.push(evidence({
          id: `self:${direction}:${item.star}:${item.mutagen}:${row.palaceName}`,
          sourceLayer: 'self', sourceType: direction, sourcePalace: row.palaceName,
          sourceStar: item.star, transformation: item.mutagen, targetPalace: row.palaceName,
          relevance: relevant ? 'supporting' : 'unused', priority: relevant ? 2 : 0, topic,
          explanation: `${row.palaceName}的${item.star}出現${direction === 'incoming' ? '向心' : '離心'}自化${item.mutagen}，補充說明${lifeWord(row.palaceName)}的能量較容易${direction === 'incoming' ? '向內承接' : '向外表現'}。`,
        }));
      }
    }
  }
  if (smallLimit?.palaceName) {
    allEvidence.push(evidence({
      id: `minor:palace:${smallLimit.palaceName}:${year}`, sourceLayer: 'minor', sourceType: 'palace',
      sourcePalace: smallLimit.palaceName, targetPalace: smallLimit.palaceName,
      relevance: !related || related.includes(smallLimit.palaceName) ? 'supporting' : 'unused',
      priority: 1, topic,
      explanation: `${year}年虛歲${nominalAge}的小限落在${smallLimit.palaceName}（${smallLimit.position}），只作年度細節補充。`,
    }));
  }

  return {
    year, ganZhi, nominalAge, topic, topicConfig, majorLimit, limitStatus, decadalPalace, annualPalace,
    natalTriad, anchorTriad, annualTriad, birthFlights, decadalFlights, annualFlights, selfTransformations,
    smallLimit, snapshots, adjacentFocus, evidence: uniqueEvidence(allEvidence),
  };
}

/** 純函式：跨層比對重複落點、同星不同化及機會／壓力同時出現的宮位。 */
export function analyzeAnnualFocus(context) {
  const candidates = context.evidence.filter((item) => item.relevance !== 'unused');
  const transformationItems = candidates.filter((item) => item.sourceType === 'transformation'
    || item.sourceLayer === 'self');
  const canonical = new Map();
  for (const item of transformationItems) {
    const key = `${item.sourceStar}|${item.transformation}|${item.targetPalace}`;
    const current = canonical.get(key);
    if (current) {
      current.sourceLayers = [...new Set([...current.sourceLayers, item.sourceLayer])];
      current.evidenceIds.push(item.id);
    } else {
      canonical.set(key, {
        key, palaceName: item.targetPalace, star: item.sourceStar, transformation: item.transformation,
        sourceLayers: [item.sourceLayer], evidenceIds: [item.id],
      });
    }
  }
  const byPalace = new Map();
  for (const signal of canonical.values()) {
    if (!byPalace.has(signal.palaceName)) byPalace.set(signal.palaceName, []);
    byPalace.get(signal.palaceName).push(signal);
  }
  const repeated = [...byPalace.entries()].map(([palaceName, signals]) => ({
    palaceName,
    signals,
    layers: [...new Set(signals.flatMap((s) => s.sourceLayers))],
    evidenceIds: [...new Set(signals.flatMap((s) => s.evidenceIds))],
  })).filter((item) => item.layers.length >= 2 || item.signals.length >= 2)
    .sort((a, b) => b.layers.length - a.layers.length || b.signals.length - a.signals.length);
  const tensions = [...byPalace.entries()].map(([palaceName, signals]) => ({
    palaceName, signals,
    hasOpportunity: signals.some((s) => GOOD.has(s.transformation)),
    hasPressure: signals.some((s) => s.transformation === '忌'),
    evidenceIds: [...new Set(signals.flatMap((s) => s.evidenceIds))],
  })).filter((item) => item.hasOpportunity && item.hasPressure);
  const sameStarDifferent = [];
  const byStar = new Map();
  for (const signal of canonical.values()) {
    if (!byStar.has(signal.star)) byStar.set(signal.star, []);
    byStar.get(signal.star).push(signal);
  }
  for (const [star, signals] of byStar) {
    if (new Set(signals.map((s) => s.transformation)).size > 1) sameStarDifferent.push({ star, signals });
  }
  const annualTriadNames = new Set(context.annualTriad?.members.map((member) => member.name) ?? []);
  const triadOverlaps = [...canonical.values()].filter((signal) => annualTriadNames.has(signal.palaceName));
  return {
    canonicalSignals: [...canonical.values()], repeated, tensions, sameStarDifferent, triadOverlaps,
    adjacent: context.adjacentFocus,
    unused: context.evidence.filter((item) => item.relevance === 'unused'),
  };
}

function claim(text, evidenceIds) {
  return { text, evidenceIds: [...new Set(evidenceIds)].filter(Boolean) };
}

/** 結論五段，各 evidence id 只分配一次，避免正文重覆講同一資料。 */
export function buildAnnualConclusion(context, focus = analyzeAnnualFocus(context)) {
  const used = new Set();
  const take = (ids) => ids.filter((id) => !used.has(id) && used.add(id));
  const stageIds = take(context.evidence.filter((e) => e.sourceType === 'palace'
    && ['annual-palace', 'decadal'].includes(e.sourceLayer)).map((e) => e.id));
  const signalScore = (signal) => (signal.sourceLayers.includes('annual') ? 8 : 0)
    + (signal.sourceLayers.includes('decadal') ? 4 : 0)
    + (signal.sourceLayers.includes('self') ? 2 : 0)
    + signal.sourceLayers.length;
  const opportunitySignals = focus.canonicalSignals.filter((s) => GOOD.has(s.transformation))
    .sort((a, b) => signalScore(b) - signalScore(a));
  const pressureSignals = focus.canonicalSignals.filter((s) => s.transformation === '忌')
    .sort((a, b) => signalScore(b) - signalScore(a));
  // 同一顆星／同一四化／同一落宮若跨層重複，整組一次分配給同一段；
  // 不能把生年那筆放在壓力段、自化那筆又換句話放進策略段。
  const opportunityIds = take(opportunitySignals.slice(0, 3).flatMap((s) => s.evidenceIds));
  const pressureIds = take(pressureSignals.slice(0, 3).flatMap((s) => s.evidenceIds));
  const strategyIds = take(focus.repeated.flatMap((r) => r.evidenceIds));
  const annualName = context.annualPalace?.name ?? '資料不足';
  const decade = context.majorLimit ? `${context.majorLimit.ageRange.replace('~', '–')}歲${context.majorLimit.ganZhi}大限` : '未取得大限資料';
  const opportunityPlaces = [...new Set(opportunitySignals.map((s) => lifeWord(s.palaceName)))].slice(0, 3);
  const pressurePlaces = [...new Set(pressureSignals.map((s) => lifeWord(s.palaceName)))].slice(0, 3);
  const focusPlaces = [...focus.repeated]
    .sort((a, b) => {
      const score = (x) => (x.layers.includes('annual') ? 5 : 0) + (x.layers.includes('decadal') ? 3 : 0) + x.layers.length;
      return score(b) - score(a);
    })
    .map((r) => lifeWord(r.palaceName)).slice(0, 2);
  return {
    stage: claim(`${context.year}年的年度舞台落在${annualName}，放在${decade}的十年背景中閱讀；較常需要處理${lifeWord(annualName)}。`, stageIds),
    opportunities: claim(opportunityPlaces.length
      ? `可發展的方向集中在${opportunityPlaces.join('、')}；適合用具體投入、主動承擔或整理成果來驗證。`
      : '目前沒有跨層支持的明顯發展訊號，先維持觀察，不用勉強下結論。', opportunityIds),
    pressure: claim(pressurePlaces.length
      ? `較需要留意${pressurePlaces.join('、')}；這表示容易反覆投入或卡住，不等於一定發生壞事。`
      : '目前沒有直接落入本主題的化忌訊號，仍要保留現實條件與個人選擇。', pressureIds),
    strategy: claim(focusPlaces.length
      ? `${context.topicConfig.strategy}先從反覆出現的${focusPlaces.join('、')}開始記錄。`
      : context.topicConfig.strategy, strategyIds),
    limitations: claim(context.topicConfig.limits.join(' '), []),
    summary: `${context.year}年，較可能透過${lifeWord(annualName)}推動${opportunityPlaces[0] ?? focusPlaces[0] ?? '當年度重點'}；先把可控制的行動做小並留下紀錄，再依實際結果調整。`,
  };
}

function options(answer, pool, stepId, context) {
  const distractors = [...new Set(pool.filter((x) => x !== answer))].slice(0, 3);
  const choices = [...distractors];
  const stepIndex = Math.max(0, ANNUAL_LEARNING_STEPS.findIndex((step) => step.id === stepId));
  const topicOffset = [...context.topic].reduce((total, char) => total + char.charCodeAt(0), 0);
  const answerIndex = (context.year + topicOffset + stepIndex) % (choices.length + 1);
  choices.splice(answerIndex, 0, answer);
  return choices;
}

function quizOf(context, stepId) {
  const palacePool = context.evidence.map((e) => e.targetPalace).filter(Boolean);
  const annualName = context.annualPalace?.name ?? '資料不足';
  const definitions = {
    natal: context.topicConfig.anchorPalace
      ? {
        prompt: `判讀「${context.topicConfig.label}」時，本命底盤要以哪一組為主？`,
        answer: `${context.topicConfig.anchorPalace}三方四正`,
        pool: ['命宮三方四正', '只看流年命宮', '只看化忌', '十二宮全部平均看'],
      }
      : { prompt: '整年總覽的本命底盤要先看哪一組？', answer: '命宮三方四正', pool: ['只看流年命宮', '只看化忌', '只看小限'] },
    decadal: context.majorLimit
      ? { prompt: `${context.year}年屬於哪一個大限？`, answer: `${context.majorLimit.ageRange}歲・${context.majorLimit.ganZhi}`, pool: ['只看流年，不看大限', '小限取代大限'] }
      : {
        prompt: `${context.year}年（虛歲 ${context.nominalAge} 歲）屬於哪一個大限？`,
        answer: context.limitStatus.status === 'before-start' ? '這一年還沒起運，沒有大限' : '這一年已超出排定的大限，沒有大限',
        pool: ['套用第一個大限', '套用最後一個大限', '用小限當成大限'],
      },
    'annual-palace': context.topicConfig.relatedPalaces
      ? {
        prompt: `${context.year}年的流年命宮（${annualName}）算不算「${context.topicConfig.label}」的相關宮位？`,
        answer: context.topicConfig.relatedPalaces.includes(annualName)
          ? '算，本主題今年會被流年直接推動'
          : '不算，本主題今年主要看大限與本命那兩層',
        pool: ['流年命宮永遠是主題本宮', '每個主題的相關宮位都一樣', '流年命宮跟主題無關，不用判斷'],
      }
      : { prompt: `${context.year}年的流年命宮落入本命哪一宮？`, answer: annualName, pool: palacePool },
    'annual-triad': { prompt: `下列哪一宮屬於${annualName}的三方四正？`, answer: context.annualTriad?.members[1]?.name ?? annualName, pool: palacePool },
    'annual-mutagens': (() => {
      const related = context.topicConfig.relatedPalaces;
      const hit = related ? context.annualFlights.filter((f) => related.includes(f.palaceName)) : [];
      // 選了主題就改考「哪一條和這個主題有關」，而不是每個主題都問同一題化忌落宮
      if (related) {
        return hit.length
          ? { prompt: `今年的四條流年四化裡，哪一條落在與「${context.topicConfig.label}」直接相關的宮位？`, answer: `${hit[0].star}化${hit[0].mutagen}→${hit[0].palaceName}`, pool: context.annualFlights.filter((f) => !related.includes(f.palaceName)).map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`) }
          : { prompt: `今年的四條流年四化，有幾條落在與「${context.topicConfig.label}」直接相關的宮位？`, answer: '一條都沒有', pool: ['四條都是', '剛好一半', '至少三條'] };
      }
      return { prompt: `${context.year}年流年化忌落在哪一宮？`, answer: context.annualFlights.find((f) => f.mutagen === '忌')?.palaceName ?? '盤上未找到', pool: palacePool };
    })(),
    focus: context.topicConfig.relatedPalaces
      ? {
        prompt: `判讀「${context.topicConfig.label}」時，落在無關宮位的跨層訊號要怎麼處理？`,
        answer: '標為不採用，不拿來補滿結論',
        pool: ['一併寫進結論湊字數', '改寫成和本主題有關', '直接刪掉不讓使用者看到'],
      }
      : { prompt: '哪一種訊號應優先放進年度結論？', answer: '跨時間層重複指向的訊號', pool: ['單一顆雜曜', '任何化忌都算災難', '只挑最吉利的資料'] },
    supplement: { prompt: '自化與小限在這套判讀中的角色是？', answer: '完成主結構後的補充', pool: ['取代大限與流年', '直接判定事件', '資料不足時自行推算'] },
    synthesis: { prompt: '合格的流年結論必須包含什麼？', answer: '舞台、機會、壓力、策略與限制', pool: ['只寫吉凶', '保證事件結果', '只列星曜名稱'] },
  };
  const q = definitions[stepId];
  return { id: `${context.year}:${context.topic}:${stepId}`, prompt: q.prompt, answer: q.answer,
    options: options(q.answer, q.pool, stepId, context), explain: `答案可由「${ANNUAL_LEARNING_STEPS.find((s) => s.id === stepId)?.title}」這一步的盤面資料或規則核對。` };
}

/** 八步教學，每步只揭露當步資料；第八步才附完整結論。 */
export function buildAnnualLearningSteps(context, focus, conclusion) {
  const stepData = {
    natal: { members: context.natalTriad?.members ?? [] },
    decadal: { majorLimit: context.majorLimit, palace: context.decadalPalace, flights: context.decadalFlights, limitStatus: context.limitStatus },
    'annual-palace': { palace: context.annualPalace },
    'annual-triad': { members: context.annualTriad?.members ?? [] },
    'annual-mutagens': { flights: context.annualFlights },
    focus,
    supplement: { selfTransformations: context.selfTransformations, smallLimit: context.smallLimit },
    synthesis: { conclusion, evidence: context.evidence.filter((e) => e.relevance !== 'unused'), unused: focus.unused },
  };
  // readings 是「盤面事實 → 白話」的對照，watch 是這一步的觀察方向。
  // data 保留原樣：練習題與少數特例（例如起運前沒有大限）仍直接讀它。
  const readings = {
    natal: natalReadings(context),
    decadal: decadalReadings(context),
    'annual-palace': annualPalaceReadings(context),
    'annual-triad': annualTriadReadings(context),
    'annual-mutagens': annualMutagenReadings(context),
    focus: focusReadings(context, focus),
    supplement: supplementReadings(context),
    synthesis: synthesisReadings(conclusion),
  };
  return ANNUAL_LEARNING_STEPS.map((step, index) => ({
    ...step,
    number: index + 1,
    data: stepData[step.id],
    readings: readings[step.id] ?? [],
    // 共用觀念集中在 dataNote / groupNotes / cautions，只講一次；
    // 每一條 reading 就只留自己的差異，避免整步讀起來像跳針。
    dataNote: stepDataNote(context, step.id),
    groupNotes: STEP_GROUP_NOTES[step.id] ?? {},
    cautions: stepCautions(context, step.id),
    watch: STEP_WATCH[step.id] ?? '',
    quiz: quizOf(context, step.id),
  }));
}

export function buildAnnualLesson(args) {
  const context = buildAnnualLearningContext(args);
  const focus = analyzeAnnualFocus(context);
  const conclusion = buildAnnualConclusion(context, focus);
  return { context, focus, conclusion, steps: buildAnnualLearningSteps(context, focus, conclusion) };
}

export function compareAnnualYears({ ziWei, input, yearA, yearB, topic = 'overview' }) {
  const a = buildAnnualLesson({ ziWei, input, year: yearA, topic });
  const b = buildAnnualLesson({ ziWei, input, year: yearB, topic });
  const row = (lesson) => ({
    year: lesson.context.year, ganZhi: lesson.context.ganZhi,
    annualPalace: lesson.context.annualPalace?.name ?? '資料不足',
    majorLimit: lesson.context.majorLimit ? `${lesson.context.majorLimit.ageRange}歲・${lesson.context.majorLimit.ganZhi}` : '資料不足',
    triad: lesson.context.annualTriad?.members.map((x) => x.name) ?? [],
    flights: lesson.context.annualFlights.map((x) => `${x.star}化${x.mutagen}→${x.palaceName}`),
    repeatedFocus: lesson.focus.repeated.map((x) => x.palaceName),
    summary: lesson.conclusion.summary,
  });
  const left = row(a); const right = row(b);
  const same = left.repeatedFocus.filter((name) => right.repeatedFocus.includes(name));
  const changed = [...new Set([...left.repeatedFocus, ...right.repeatedFocus])].filter((name) => !same.includes(name));
  const signalOf = (lesson) => lesson.context.annualFlights.map((x) => `${x.mutagen}→${x.palaceName}`);
  const leftSignals = signalOf(a); const rightSignals = signalOf(b);
  const repeatedTransformationLandings = leftSignals.filter((x) => rightSignals.includes(x));
  const differentTransformationLandings = [...new Set([...leftSignals, ...rightSignals])]
    .filter((x) => !repeatedTransformationLandings.includes(x));
  const samePalaces = [...new Set(left.triad.filter((name) => right.triad.includes(name)))];
  const differentPalaces = [...new Set([...left.triad, ...right.triad])].filter((name) => !samePalaces.includes(name));
  const flightsA = Object.fromEntries(a.context.annualFlights.map((flight) => [flight.mutagen, flight]));
  const flightsB = Object.fromEntries(b.context.annualFlights.map((flight) => [flight.mutagen, flight]));
  const transformationChanges = ['祿', '權', '科', '忌'].flatMap((mutagen) => {
    const from = flightsA[mutagen]; const to = flightsB[mutagen];
    if (!from || !to) return [];
    const action = MUTAGEN_ACTION[mutagen];
    return [{
      mutagen, fromPalace: from.palaceName, toPalace: to.palaceName,
      continued: from.palaceName === to.palaceName,
      meaning: from.palaceName === to.palaceName
        ? `化${mutagen}連續落在${from.palaceName}，表示兩年都會在${lifeWord(from.palaceName)}上反覆出現「${action}」的課題，適合觀察第二年是在延續、加深，還是調整前一年的做法。`
        : `化${mutagen}從${from.palaceName}轉到${to.palaceName}，表示「${action}」的年度重心從${lifeWord(from.palaceName)}移到${lifeWord(to.palaceName)}。`,
    }];
  });
  const continuedChanges = transformationChanges.filter((item) => item.continued);
  const shiftedChanges = transformationChanges.filter((item) => !item.continued);
  const stageShift = left.annualPalace === right.annualPalace
    ? `兩年的年度舞台都在${left.annualPalace}，主要生活場景延續；差異要再看四化落點如何改變。`
    : `${left.year}年較常處理${lifeWord(left.annualPalace)}，到${right.year}年轉向${lifeWord(right.annualPalace)}；這表示注意力與事件場景換了位置，不是單純由好轉壞或由壞轉好。`;
  const background = left.majorLimit === right.majorLimit
    ? `兩年仍在同一個${left.majorLimit}背景內，因此主要比較年度舞台與四化重心的變化。`
    : `兩年跨越不同大限（${left.majorLimit} → ${right.majorLimit}），除了流年變化，也要把十年背景轉換納入判讀。`;
  const continuity = continuedChanges.length
    ? continuedChanges.map((item) => item.meaning).join(' ')
    : '兩年沒有相同的四化落宮，表示資源、責任、整理與壓力的著力點都在移動；不宜把前一年的做法直接照搬到下一年。';
  const transition = shiftedChanges.length
    ? shiftedChanges.map((item) => item.meaning)
    : ['四化落點沒有轉換；比較重點應放在同一課題第二年的進展與回應方式。'];
  const focusMeaning = same.length
    ? `兩年都反覆指向${same.map(lifeWord).join('、')}，這些適合當成延續觀察；${changed.length ? `${changed.map(lifeWord).join('、')}則是只在其中一年較突出。` : '沒有額外新增的跨層焦點。'}`
    : `兩年的跨層焦點沒有重疊，${left.year}與${right.year}應分開設定觀察重點，不必勉強找共同結論。`;
  return {
    topic, a: left, b: right,
    sameFocus: same, changedFocus: changed, samePalaces, differentPalaces,
    repeatedTransformationLandings, differentTransformationLandings,
    transformationChanges,
    interpretation: {
      background, stageShift, continuity, transition, focusMeaning,
      howToUse: `比較時，先把「兩年延續的課題」當成需要持續追蹤的主線，再把「四化轉換」當成下一年要調整做法的地方。${a.context.topicConfig.strategy}`,
      limitation: '這些差異描述的是注意力、投入方式與壓力來源的移動，不代表哪一年一定比較好，也不能單靠流年保證具體事件。',
    },
    difference: `${background} ${stageShift} ${focusMeaning}`,
  };
}

// ---------- 多年總覽 ----------
// 逐年跑完整的 buildAnnualLesson 太慢（一次要看 20～120 年），這裡只取「一眼掃描」需要的欄位：
// 流年命宮、三方四正、當年四化落點，以及這一年是不是大限交界。
// 關鍵年的判定刻意只用可回查的盤面事實，而且每一條都附 reason；
// 不做「哪一年比較好」這種比較，也不預測事件——只回答「哪幾年的結構變動比較大，值得先看」。

/** 大限的起始虛歲清單，用來判斷某一年是不是換大限的第一年 */
const limitStartAges = (ziWei) => new Set((ziWei.majorLimits ?? [])
  .map((l) => Number(l.ageRange.split('~')[0])).filter(Number.isFinite));

function birthFlightsOf(ziWei) {
  return ziWei.palaces.flatMap((p) => p.majorStars
    .filter((star) => star.transformation)
    .map((star) => ({
      star: star.name,
      mutagen: String(star.transformation).replace(/^化/, ''),
      palaceName: p.name,
    })));
}

/**
 * 單一年份的掃描結果。與 buildAnnualLesson 用同一組資料來源（flyingOfStem / triadOf /
 * palaceByBranch），所以總覽上看到的落宮，點進逐步學習後一定對得起來。
 */
function scanAnnualYear(ziWei, input, year, ctx) {
  const ganZhi = annualGanZhi(year);
  const nominalAge = year - input.year + 1;
  const majorLimit = limitOf(ziWei, input, year);
  const limitStatus = annualLimitStatus(ziWei, input, year);
  const annualPalace = palaceByBranch(ziWei, ganZhi[1]);
  const triad = annualPalace ? (triadOf(ziWei, annualPalace.name)?.members ?? []).map((m) => m.name) : [];
  const flights = flyingOfStem(ziWei, ganZhi[0]);
  const decadalPalace = majorLimit ? palaceByBranch(ziWei, majorLimit.ganZhi[1]) : null;

  const reasons = [];
  let score = 0;
  const add = (points, text) => { score += points; reasons.push(text); };

  if (majorLimit && ctx.startAges.has(nominalAge)) {
    add(3, `虛歲 ${nominalAge} 歲換大限，進入 ${majorLimit.ageRange}歲・${majorLimit.ganZhi}，十年背景整個換掉。`);
  }
  const ji = flights.find((f) => f.mutagen === '忌');
  if (ji && annualPalace && ji.palaceName === annualPalace.name) {
    add(3, `流年化忌（${ji.star}）就落在流年命宮${annualPalace.name}，當年最常被要求處理的事和最容易卡住的事是同一件。`);
  } else if (ji && triad.includes(ji.palaceName)) {
    add(2, `流年化忌（${ji.star}）落在流年三方四正的${ji.palaceName}，會從旁邊牽動當年的主場景。`);
  }
  const luQuanInTriad = flights.filter((f) => ['祿', '權'].includes(f.mutagen) && triad.includes(f.palaceName));
  if (luQuanInTriad.length >= 2) {
    add(2, `化祿與化權同時落在流年三方四正（${luQuanInTriad.map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`).join('、')}），資源與主導權集中在同一個場景。`);
  }
  if (annualPalace && decadalPalace && annualPalace.name === decadalPalace.name) {
    add(2, `流年命宮與大限命宮同樣落在${annualPalace.name}，十年背景與當年舞台重疊，訊號會被放大。`);
  }
  const birthHit = ctx.birthFlights.filter((f) => annualPalace && f.palaceName === annualPalace.name);
  if (birthHit.length) {
    add(2, `本命生年四化（${birthHit.map((f) => `${f.star}化${f.mutagen}`).join('、')}）本來就在${annualPalace.name}，流年走到這一宮會把它重新引動。`);
  }

  return {
    year,
    ganZhi,
    nominalAge,
    past: year < ctx.thisYear,
    current: year === ctx.thisYear,
    majorLimit: majorLimit ? `${majorLimit.ageRange}歲・${majorLimit.ganZhi}` : null,
    limitStatus: limitStatus.status,
    limitStart: Boolean(majorLimit && ctx.startAges.has(nominalAge)),
    annualPalace: annualPalace?.name ?? null,
    annualPalaceWord: annualPalace ? lifeWord(annualPalace.name) : null,
    triad,
    flights: flights.map((f) => ({ mutagen: f.mutagen, star: f.star, palaceName: f.palaceName })),
    score,
    reasons,
    // 門檻訂在 4 分：單一條規則命中最多 3 分，所以要被標成重點年，至少得有兩種訊號同時出現。
    // 一開始用 3 分，結果 120 年裡有 38 年被標紅，等於沒有篩選作用。
    key: score >= 4,
    level: score >= 6 ? 'high' : score >= 4 ? 'medium' : 'normal',
  };
}

/**
 * 一段年份區間的掃描總覽。
 * fromYear/toYear 會先夾回 annualYearRange() 的合法範圍（出生年 ～ 虛歲 maxAge），
 * 免得呼叫端算錯區間就丟出一堆虛歲 0 或負數的列。
 */
export function buildAnnualOverview({ ziWei, input, fromYear, toYear, topic = 'overview', thisYear = new Date().getFullYear(), maxAge = 120 }) {
  const topicConfig = ANNUAL_TOPIC_CONFIG[topic] ?? ANNUAL_TOPIC_CONFIG.overview;
  if (!topicConfig.available) throw new Error(`尚未開放的流年學習主題：${topic}`);
  const range = annualYearRange({ input, maxAge });
  const from = Math.max(range.from, Math.min(fromYear, toYear));
  const to = Math.min(range.to, Math.max(fromYear, toYear));
  const ctx = {
    thisYear,
    startAges: limitStartAges(ziWei),
    birthFlights: birthFlightsOf(ziWei),
  };
  const rows = [];
  for (let year = from; year <= to; year += 1) rows.push(scanAnnualYear(ziWei, input, year, ctx));
  const keyYears = rows.filter((r) => r.key).sort((a, b) => b.score - a.score || a.year - b.year);
  return {
    topic,
    topicLabel: topicConfig.label,
    from,
    to,
    range,
    rows,
    keyYears,
    // 這段話會直接印在畫面上，必須跟計分規則一致：分數高只代表「結構變動大」，不代表吉凶。
    howToRead: '這張表只掃描結構變動：換大限、化忌落在流年命宮或三方四正、祿權集中、流年命宮與大限命宮重疊、生年四化被重新引動。被標成重點年，代表那一年的盤面訊號比較集中、值得先看，不代表運勢比較好或比較壞。',
    limitation: '逐年掃描不預測事件，也不排序哪一年比較順利。要判讀某一年實際會怎麼走，仍要點進那一年做完八個步驟。',
  };
}

// ---------- 逐條白話解讀 ----------
// 使用者回饋：「這些東西具體是帶來什麼影響，我看完還是不懂。」
// 原因是每一步只給了「規則」與「盤面事實」，中間那層——事實在講什麼——是空的。
// 這一段就是補那一層：每一條盤面資料後面接一句白話，說明它是誰造成的、持續多久、
// 在生活的哪一塊上出現。全部由既有 context/focus 推導，不新增任何命理判斷。
//
// 寫作限制（與網站免責聲明一致）：
//   - 只描述「傾向、較常、容易」，不寫成必然發生的事件
//   - 只給觀察方向，不給「該不該換工作／投資」這類人生建議
//   - 不比較哪一年比較好

const layerOf = (key) => LAYER_MEANING[key] ?? { label: key, span: '—', source: '—', plain: '' };
const layerLabels = (keys) => keys.map((k) => layerOf(k).label).join('、');
const starCore = (name) => starMeanings[name]?.core ?? null;

/**
 * 一條解讀＝一句盤面事實 + 一句白話。
 * group 用來下小標；共用的觀念不放在這裡，放在 step.groupNotes / step.dataNote，只講一次。
 * 這是實測回饋修掉的問題：原本每一條後面都掛同一段「層數越多代表…」，五條就重複五次，
 * 整段變得又長又難讀，真正該讀的差異反而被淹掉。
 */
const reading = (fact, plain, group = null, topical = null) => ({ fact, plain, group, topical });

/**
 * 這一宮跟目前選的主題有沒有直接關係。
 * overview（整年總覽）沒有指定宮位，所有宮位一律視為相關（回傳 null＝不做標記）。
 * 這是實測回饋修掉的問題：原本切換總覽／工作／感情／財務，八個步驟的資料與練習題
 * 一字不差，主題只影響結論最後兩句，等於切了跟沒切一樣。
 */
function topicalOf(context, palaceName) {
  const related = context.topicConfig.relatedPalaces;
  if (!related || !palaceName) return null;
  return related.includes(palaceName);
}

/** 由實際的層組合產生一句「這代表什麼」，讓每一條都不一樣，而不是共用同一句結尾 */
function layerCombo(layers) {
  const has = (k) => layers.includes(k);
  const parts = [];
  if (has('annual') && has('decadal')) parts.push('這十年的背景本來就在，今年又被再推一次');
  else if (has('annual')) parts.push('主要是今年才被推上檯面，明年落點就會換');
  else if (has('decadal')) parts.push('這十年持續存在，但今年沒有額外加碼');
  if (has('birth')) parts.push('本命也有，表示你長期就容易在這裡打轉');
  if (has('self')) parts.push('並帶你自己的反應方式');
  return parts.join('；') || '訊號集中在單一層，份量比跨層的輕';
}

function natalReadings(context) {
  const members = context.natalTriad?.members ?? [];
  const anchor = context.topicConfig.anchorPalace;
  // 選了主題就多給一組：該主題的本宮三方四正。
  // 例如看「感情」時，只給命宮三方四正是不夠的——夫妻宮那一組才是主題底盤。
  const anchorRows = anchor && context.anchorTriad
    ? context.anchorTriad.members.map((m) => reading(
      `${m.role === 'self' ? '主題本宮' : m.role === 'opposite' ? '對宮' : '三合宮'}　${m.name}・${m.stars.join('、') || '無十四主星'}`,
      `${lifeWord(m.name)}${m.isEmpty ? '（空宮，要借對宮的星來看）' : ''}${m.role === 'self' ? `——本主題的判讀以這一組為主` : ''}。`,
      `${context.topicConfig.label}的本命底盤（${anchor}三方四正）`,
      true,
    ))
    : [];
  const lifeRows = members.map((m) => {
    const stars = m.stars.join('、') || '無十四主星';
    const label = m.role === 'self' ? '本宮' : m.role === 'opposite' ? '對宮' : '三合宮';
    const fact = `${label}　${m.name}（${m.position}）・${stars}`;
    const core = m.stars.map(starCore).filter(Boolean)[0];
    const group = anchor ? '命宮三方四正（不分主題都要先看）' : null;
    if (m.isEmpty) return reading(fact, `${lifeWord(m.name)}。空宮，借對宮的星來看。`, group, topicalOf(context, m.name));
    if (m.role === 'self') return reading(fact, `你的預設反應方式${core ? `偏向「${core}」` : ''}。今年發生什麼，你多半先用這種方式接。`, group, topicalOf(context, m.name));
    return reading(fact, `${lifeWord(m.name)}。`, group, topicalOf(context, m.name));
  });
  return [...anchorRows, ...lifeRows];
}

function decadalReadings(context) {
  if (!context.majorLimit) return [];
  const out = [reading(
    `大限　${context.majorLimit.ageRange}歲・${context.majorLimit.ganZhi}`,
    '你目前落在這個十年裡。',
  )];
  if (context.decadalPalace) {
    out.push(reading(`大限命宮　${context.decadalPalace.name}`, `這十年，重心比較常繞著${lifeWord(context.decadalPalace.name)}打轉。`));
  }
  for (const f of context.decadalFlights) {
    out.push(reading(
      `${f.star}化${f.mutagen} → ${f.palaceName}`,
      `${lifeWord(f.palaceName)}，這十年容易「${MUTAGEN_ACTION[f.mutagen]}」。`,
      '這十年的四化落點',
      topicalOf(context, f.palaceName),
    ));
  }
  return out;
}

function annualPalaceReadings(context) {
  const palace = context.annualPalace;
  if (!palace) return [];
  const stars = palace.majorStars.map((s) => `${s.name}${s.brightness ? `（${s.brightness}）` : ''}`).join('、') || '無十四主星';
  const core = palace.majorStars.map((s) => starCore(s.name)).filter(Boolean)[0];
  return [
    reading(
      `流年命宮　${palace.name}（${palace.position}）`,
      `${context.year}年比較常被要求處理的是${lifeWord(palace.name)}。這決定「舞台在哪」，不是「結果好不好」。`
        + (topicalOf(context, palace.name) === false
          ? `　今年的舞台不在「${context.topicConfig.label}」的相關宮位上，表示這個主題今年多半不是由流年主導，要回頭看大限與本命那兩層。`
          : topicalOf(context, palace.name) === true
            ? `　這一宮正好是「${context.topicConfig.label}」的相關宮位，本主題今年會被流年直接推動。` : ''),
      null,
      topicalOf(context, palace.name),
    ),
    reading(
      `主星　${stars}`,
      palace.majorStars.length
        ? `你在這個舞台上的表現方式${core ? `偏向「${core}」` : '看這組星的性質'}。同樣走到這一宮，不同主星的人處理起來很不一樣。`
        : '沒有主星，今年的舞台比較沒有固定劇本，要連對宮一起看。',
    ),
  ];
}

function annualTriadReadings(context) {
  const members = context.annualTriad?.members ?? [];
  return members.map((m) => {
    const label = m.role === 'self' ? '流年命宮' : m.role === 'opposite' ? '對宮' : '三合宮';
    return reading(`${label}　${m.name}・${m.stars.join('、') || '無十四主星'}`,
      `${lifeWord(m.name)}${m.isEmpty ? '（空宮）' : ''}。`, null, topicalOf(context, m.name));
  });
}

function annualMutagenReadings(context) {
  return context.annualFlights.map((f) => reading(
    `${f.star}化${f.mutagen} → ${f.palaceName}`,
    `今年在${lifeWord(f.palaceName)}上容易「${MUTAGEN_ACTION[f.mutagen]}」。`,
    null,
    topicalOf(context, f.palaceName),
  ));
}

/**
 * 第六步是實測最看不懂的一步。
 * 共用觀念（四層各是什麼、為什麼跨層比較重要）交給 groupNotes 講一次，
 * 這裡每一條只留它自己的差異：哪幾層、對應生活的哪一塊、這個層組合代表什麼。
 */
function focusReadings(context, focus) {
  const out = [];
  for (const item of focus.repeated.slice(0, 5)) {
    out.push(reading(
      `${item.palaceName}　${item.layers.length} 層：${layerLabels(item.layers)}`,
      `${lifeWord(item.palaceName)}。${layerCombo(item.layers)}。`,
      '跨層重複指向的宮位',
      topicalOf(context, item.palaceName),
    ));
  }
  for (const item of focus.tensions.slice(0, 3)) {
    out.push(reading(
      `${item.palaceName}　推力與阻力同時出現`,
      `${lifeWord(item.palaceName)}今年容易出現「想往前推、同一件事又卡著」的感覺。`,
      '同一宮同時有推力與阻力',
      topicalOf(context, item.palaceName),
    ));
  }
  for (const item of focus.triadOverlaps.slice(0, 4)) {
    out.push(reading(
      `${item.star}化${item.transformation} → ${item.palaceName}`,
      `${lifeWord(item.palaceName)}，化${item.transformation}＝${MUTAGEN_ACTION[item.transformation]}。`,
      '落在今年舞台四宮的四化',
      topicalOf(context, item.palaceName),
    ));
  }
  for (const item of focus.sameStarDifferent.slice(0, 3)) {
    const parts = item.signals.map((sig) => `${layerLabels(sig.sourceLayers)}化${sig.transformation}（${MUTAGEN_ACTION[sig.transformation]}）`);
    const places = [...new Set(item.signals.map((sig) => lifeWord(sig.palaceName)))];
    out.push(reading(
      `${item.star}　${item.signals.map((sig) => `${layerLabels(sig.sourceLayers)}化${sig.transformation}→${sig.palaceName}`).join('｜')}`,
      `同樣在${places.join('、')}上，${parts.join('，')}——不同層要你做的動作不一樣。`,
      '同一顆星在不同層有不同作用',
      item.signals.some((sig) => topicalOf(context, sig.palaceName)) ? true : topicalOf(context, item.signals[0]?.palaceName),
    ));
  }
  if (!out.length) {
    out.push(reading('沒有跨層重複的訊號', '今年各層指向的宮位都不一樣，沒有集中的主線；這種年份反而比較平均，不必硬找主題。'));
  }
  // 同一組小標內，與主題直接相關的排前面；無關的留著但沉到後面，
  // 讓使用者看得到「本主題不採用哪些資料」，而不是偷偷藏起來。
  const rank = (r) => (r.topical === true ? 0 : r.topical === null ? 1 : 2);
  const order = [...new Set(out.map((r) => r.group))];
  return out.slice().sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || rank(a) - rank(b));
}

function supplementReadings(context) {
  const out = [];
  const rows = context.selfTransformations.filter((r) => r.outgoing.length || r.incoming.length).slice(0, 4);
  for (const row of rows) {
    for (const x of row.outgoing) {
      out.push(reading(`${row.palaceName}　${x.star}化${x.mutagen}　離心（往外送）`,
        `${lifeWord(row.palaceName)}，化${x.mutagen}＝${MUTAGEN_ACTION[x.mutagen]}。`, '自化'));
    }
    for (const x of row.incoming) {
      out.push(reading(`${row.palaceName}　${x.star}化${x.mutagen}　向心（自己流進來）`,
        `${lifeWord(row.palaceName)}，化${x.mutagen}＝${MUTAGEN_ACTION[x.mutagen]}。`, '自化'));
    }
  }
  out.push(context.smallLimit
    ? reading(`小限　虛歲 ${context.smallLimit.age ?? context.nominalAge} 歲・${context.smallLimit.palaceName ?? context.smallLimit.name ?? '資料不足'}`,
      '另一套年度推法，只作補充；與流年說法不同時以流年為主。', '小限')
    : reading('小限　這個虛歲沒有可引用的資料', '排盤結果沒有這個虛歲的小限宮位，這裡就不補算。', '小限'));
  return out;
}

function synthesisReadings(conclusion) {
  // conclusion 的每一欄都是 claim() 產生的 { text, evidenceIds }，不是字串——
  // 直接丟進畫面會印出整個物件。這裡只取 text，evidenceIds 留給既有的證據面板。
  const textOf = (claimLike) => (typeof claimLike === 'string' ? claimLike : claimLike?.text ?? '');
  const pick = (label, value) => (textOf(value) ? reading(label, textOf(value)) : null);
  return [
    pick('年度舞台', conclusion.stage),
    pick('發展機會', conclusion.opportunities),
    pick('壓力來源', conclusion.pressure),
    pick('實際策略', conclusion.strategy),
    pick('判讀限制', conclusion.limitations),
  ].filter(Boolean);
}

/**
 * 共用觀念只講一次。
 * dataNote 是整步的前提，groupNotes 是各小標底下的前提；
 * 每一條解讀就不必再重複同一段話（原本重複五次，讀起來像跳針）。
 */
function stepDataNote(context, stepId) {
  const layerLegend = ['birth', 'decadal', 'annual', 'self']
    .map((k) => `${layerOf(k).label}＝${layerOf(k).source}（${layerOf(k).span}）`).join('、');
  const cfg = context.topicConfig;
  const roleLine = '本宮＝主場，事情最常在這裡發生；對宮＝外面丟進來的那一面；三合宮＝資源與代價的來源。';
  // 主題會決定「哪些宮位算數」。不把這件事寫出來，四個主題看起來就會一樣。
  const scope = cfg.relatedPalaces
    ? `本主題「${cfg.label}」只採用${cfg.relatedPalaces.join('、')}的訊號，其餘標為不採用，不拿來補滿結論。`
    : '整年總覽不限定宮位，十二宮的訊號都納入比較。';
  return {
    natal: `這是你長期的底盤，先立基準線，後面每一層看到的都要放回這裡比對。${roleLine}${scope}`,
    decadal: `大限是十年尺度的背景音，這十年都在；同一個流年訊號放進不同大限，要處理的事會不一樣。`,
    'annual-palace': '流年命宮由今年的地支決定，每年換一宮。',
    'annual-triad': `四宮一起看才找得到「資源從哪來、代價付在哪」。${roleLine}`,
    'annual-mutagens': `今年天干「${context.ganZhi[0]}」引動這四顆星。四化描述動力方向，不描述吉凶。${scope}`,
    focus: `四個時間層：${layerLegend}。同一個宮位被越多層指到，越不像偶發，也越適合當成今年的主線。${scope}`,
    supplement: '這一層是補充，不能取代前面的本命、大限與流年。',
    synthesis: '以下每一句都應該能指回前面某一步的盤面資料。',
  }[stepId] ?? '';
}

/**
 * 四化的常見誤解只列「這一步真的出現的那幾個」，而且整步只講一次。
 * 原本是每一條四化後面都掛一段澄清，四條就重複四次。
 */
function stepCautions(context, stepId) {
  const flights = stepId === 'annual-mutagens' ? context.annualFlights
    : stepId === 'decadal' ? context.decadalFlights : [];
  const seen = [...new Set(flights.map((f) => f.mutagen))];
  return seen.map((m) => MUTAGEN_CAUTION[m]).filter(Boolean);
}

const STEP_GROUP_NOTES = {
  decadal: { '這十年的四化落點': '這是十年尺度，不是今年才有。' },
  focus: {
    '同一宮同時有推力與阻力': '祿權科（推動）和忌（壓力）落在同一宮，兩者不會互相抵消，而是同時發生。重點不是判斷好壞，是認出這塊今年要花比較多力氣。',
    '落在今年舞台四宮的四化': '這些四化沒落在流年命宮本身，而是落在舞台的其他三宮——不是主角，但整年會一直在旁邊出現。',
    '同一顆星在不同層有不同作用': '同一顆星被不同時間層引動成不同四化。這不是矛盾，是同一個主題的不同面向：通常表示這件事你既有東西進來，也得自己扛起來。',
  },
  supplement: {
    自化: '自化不是外界給的，是這一宮自己把能量放大或消耗掉，四層裡最有機會靠自覺調整。離心＝你容易自己主動投入或自己消耗，不一定有人要求你；向心＝外面的人事物容易自己找上門。',
  },
};

const STEP_WATCH = {
  natal: '這一步的用途是先立基準線：把「你本來就是這樣的人」和「今年特別的事」分開。後面每一層看到的東西，都要放回這四宮上比對，才不會把長期特質誤讀成年度變化。',
  decadal: '這一步在校準比例尺。後面看到的流年訊號，如果剛好落在大限也指到的宮位，份量就比只有流年指到的重；反過來，只有流年出現的，通常一年就過去了。',
  'annual-palace': '可以觀察：今年你花最多時間開會、討論、煩惱的事，是不是落在這一宮對應的生活領域。舞台對不對得上，比結論準不準更值得先確認。',
  'annual-triad': '可以觀察：這四宮共同指向什麼主題。只看流年命宮容易漏掉「資源從哪來、代價付在哪」——那兩件事通常在三合宮和對宮。',
  'annual-mutagens': '可以觀察：這四條落點裡，有沒有哪一宮同時被兩條以上指到。同一宮被重複指到，通常就是今年最花力氣的地方。',
  focus: '這一步在做的是篩訊號。命盤上隨便都能找出幾十條線索，但只有跨層重複出現的才穩定。可以觀察：這幾個被重複指到的宮位，是不是今年你確實反覆碰到的領域；對不上也是有用的資訊，代表今年主導的可能是大限或本命那一層。',
  supplement: '可以觀察：自化描述的是你自己的反應方式，這是四層裡最有機會靠自覺調整的一層。看看那些「自己投入」或「自己找上門」的描述，跟你平常的習慣像不像。',
  synthesis: '走完八步之後，回頭確認每一句結論都能指回前面某一步的盤面資料。指不回去的，就是推論走太遠了，不必當真。',
};

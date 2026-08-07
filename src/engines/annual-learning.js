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
    natalTriad, annualTriad, birthFlights, decadalFlights, annualFlights, selfTransformations,
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
    natal: { prompt: '本命底盤第一步應先看哪一組？', answer: '命宮三方四正', pool: ['只看流年命宮', '只看化忌', '只看小限'] },
    decadal: context.majorLimit
      ? { prompt: `${context.year}年屬於哪一個大限？`, answer: `${context.majorLimit.ageRange}歲・${context.majorLimit.ganZhi}`, pool: ['只看流年，不看大限', '小限取代大限'] }
      : {
        prompt: `${context.year}年（虛歲 ${context.nominalAge} 歲）屬於哪一個大限？`,
        answer: context.limitStatus.status === 'before-start' ? '這一年還沒起運，沒有大限' : '這一年已超出排定的大限，沒有大限',
        pool: ['套用第一個大限', '套用最後一個大限', '用小限當成大限'],
      },
    'annual-palace': { prompt: `${context.year}年的流年命宮落入本命哪一宮？`, answer: annualName, pool: palacePool },
    'annual-triad': { prompt: `下列哪一宮屬於${annualName}的三方四正？`, answer: context.annualTriad?.members[1]?.name ?? annualName, pool: palacePool },
    'annual-mutagens': { prompt: `${context.year}年流年化忌落在哪一宮？`, answer: context.annualFlights.find((f) => f.mutagen === '忌')?.palaceName ?? '盤上未找到', pool: palacePool },
    focus: { prompt: '哪一種訊號應優先放進年度結論？', answer: '跨時間層重複指向的訊號', pool: ['單一顆雜曜', '任何化忌都算災難', '只挑最吉利的資料'] },
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

/** 一條解讀＝一句盤面事實 + 一句白話。fact 保持原本的摘要格式，方便對照命盤查證。 */
const reading = (fact, plain, group = null) => ({ fact, plain, group });

function natalReadings(context) {
  const members = context.natalTriad?.members ?? [];
  return members.map((m) => {
    const stars = m.stars.join('、') || '無十四主星';
    const fact = `${m.role === 'self' ? '本宮' : m.role === 'opposite' ? '對宮' : '三合宮'}：${m.name}（${m.position}）・${stars}`;
    const core = m.stars.map(starCore).filter(Boolean)[0];
    if (m.isEmpty) {
      return reading(fact, `${m.name}沒有十四主星，判讀時要借對宮的星來看，不能當成「這一塊什麼都沒有」。空宮多半表示這個領域比較沒有固定套路，受外在情境影響大。`);
    }
    if (m.role === 'self') {
      return reading(fact, `命宮是你面對任何一年的預設反應方式${core ? `——${stars}這組星偏向「${core}」` : ''}。這一年外面發生什麼，你多半會先用這種方式去接。後面看到的所有流年訊號，都是加在這個底盤上，不是取代它。`);
    }
    if (m.role === 'opposite') {
      return reading(fact, `${m.name}是命宮的對宮，代表${lifeWord(m.name)}上的變化會直接反過來影響你怎麼看自己。${TRIAD_ROLE_MEANING.opposite}`);
    }
    return reading(fact, `${m.name}是命宮的三合宮，代表${lifeWord(m.name)}。${TRIAD_ROLE_MEANING.triad}`);
  });
}

function decadalReadings(context) {
  if (!context.majorLimit) return [];
  const out = [reading(
    `大限：${context.majorLimit.ageRange}歲・${context.majorLimit.ganZhi}`,
    `你目前落在這個十年裡。${layerOf('decadal').plain}`,
  )];
  if (context.decadalPalace) {
    out.push(reading(
      `大限命宮：${context.decadalPalace.name}`,
      `這十年，生活重心比較常繞著${lifeWord(context.decadalPalace.name)}打轉。這是十年的常態，不是今年才有的事。`,
    ));
  }
  for (const f of context.decadalFlights) {
    out.push(reading(
      `大限：${f.star}化${f.mutagen} → ${f.palaceName}`,
      `這十年在${lifeWord(f.palaceName)}上，會反覆出現「${MUTAGEN_ACTION[f.mutagen]}」這類情形。${MUTAGEN_CAUTION[f.mutagen]}`,
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
      `${context.year} ${context.ganZhi}年，流年命宮：${palace.name}（${palace.position}）`,
      `流年命宮是由今年的地支決定的，所以每年都會換一宮。落在${palace.name}，表示${context.year}年你比較常被要求處理、或比較容易遇到具體情境的地方是${lifeWord(palace.name)}。它決定的是「舞台在哪」，不是「結果好不好」。`,
    ),
    reading(
      `主星：${stars}`,
      palace.majorStars.length
        ? `你在這個舞台上的表現方式，偏向${core ? `「${core}」` : '這組星的性質'}。同樣一件事，不同主星的人處理起來會很不一樣，這就是為什麼不能只看「今年走到哪一宮」就下結論。`
        : '這一宮沒有主星，表示今年的舞台比較沒有固定劇本，受外在情境與對宮影響大，要連對宮一起看。',
    ),
  ];
}

function annualTriadReadings(context) {
  const members = context.annualTriad?.members ?? [];
  return members.map((m) => {
    const label = m.role === 'self' ? '流年命宮' : m.role === 'opposite' ? '對宮' : '三合宮';
    const fact = `${label}：${m.name}・${m.stars.join('、') || '無十四主星'}`;
    return reading(fact, `${m.name}對應${lifeWord(m.name)}。${TRIAD_ROLE_MEANING[m.role] ?? ''}`);
  });
}

function annualMutagenReadings(context) {
  return context.annualFlights.map((f) => reading(
    `流年：${f.star}化${f.mutagen} → ${f.palaceName}`,
    `${context.year}年的天干「${context.ganZhi[0]}」把${f.star}引動成化${f.mutagen}，落在${f.palaceName}。意思是今年在${lifeWord(f.palaceName)}上，比較容易出現「${MUTAGEN_ACTION[f.mutagen]}」這類動作。${MUTAGEN_CAUTION[f.mutagen]}`,
  ));
}

/**
 * 第六步是使用者實測最看不懂的一步。
 * 原本只印「財帛宮：大限、流年、自化重複指向」，沒說這三層各是什麼、疊起來為什麼比較重要。
 * 這裡把每一種項目都攤開講：重複指向、同宮矛盾、落在流年三方四正、同星不同化。
 */
function focusReadings(context, focus) {
  const out = [];
  for (const item of focus.repeated.slice(0, 5)) {
    const layers = item.layers;
    const detail = layers.map((k) => `${layerOf(k).label}（${layerOf(k).source}，${layerOf(k).span}）`).join('、');
    out.push(reading(
      `${item.palaceName}：${layerLabels(layers)}重複指向`,
      `${lifeWord(item.palaceName)}同時被 ${layers.length} 個時間層指到——${detail}。層數越多，代表這個訊號越不像偶發：`
        + `它不是只有今年才冒出來，也不是只有你自己的想像。跨層重複出現的宮位，比孤立的一顆星更適合當成今年真正的主線。`,
      '跨層重複指向的宮位',
    ));
  }
  for (const item of focus.tensions.slice(0, 3)) {
    out.push(reading(
      `${item.palaceName}同時有推動與壓力訊號`,
      `${lifeWord(item.palaceName)}這一塊，今年同時出現祿權科（推動）和忌（壓力）。這兩者不會互相抵消，而是同時發生——`
        + `常見的感覺是「想往前推，但同一件事又一直卡著」。看到這種組合時，重點不是判斷好壞，而是認出這一塊今年注定要花比較多力氣。`,
      '同一宮同時有推力與阻力',
    ));
  }
  for (const item of focus.triadOverlaps.slice(0, 4)) {
    out.push(reading(
      `${item.star}化${item.transformation}落在流年三方四正的${item.palaceName}`,
      `這條四化沒有落在流年命宮本身，而是落在今年舞台的其他三宮之一。表示${lifeWord(item.palaceName)}會從旁邊牽動今年的主場景——`
        + `不是主角，但整年會一直在旁邊出現，常常是資源來源或代價所在。`,
      '落在今年舞台四宮的四化',
    ));
  }
  for (const item of focus.sameStarDifferent.slice(0, 3)) {
    const parts = item.signals.map((sig) => `${layerLabels(sig.sourceLayers)}把它化${sig.transformation}，落在${sig.palaceName}`);
    const actions = [...new Set(item.signals.map((sig) => `化${sig.transformation}＝${MUTAGEN_ACTION[sig.transformation]}`))];
    out.push(reading(
      `${item.star}跨層出現不同四化：${item.signals.map((sig) => `${sig.transformation}→${sig.palaceName}`).join('、')}`,
      `同一顆${item.star}，在不同時間層被引動成不同的作用：${parts.join('；')}。`
        + `換句話說，同一件事在不同層面要求你做的動作不一樣（${actions.join('、')}）。`
        + `這種情形不是矛盾，而是同一個主題的不同面向——通常表示這件事你既有東西進來，也得自己扛起來。`,
      '同一顆星在不同層有不同作用',
    ));
  }
  if (!out.length) {
    out.push(reading('沒有跨層重複的訊號', '今年各層指向的宮位都不一樣，沒有集中的主線。這種年份反而比較平均，不必硬找一個「今年的主題」。'));
  }
  return out;
}

function supplementReadings(context) {
  const out = [];
  const rows = context.selfTransformations.filter((r) => r.outgoing.length || r.incoming.length).slice(0, 4);
  for (const row of rows) {
    for (const x of row.outgoing) {
      out.push(reading(
        `${row.palaceName}：${x.star}化${x.mutagen} 離心自化`,
        `離心自化是這一宮把能量往外送出去。表示在${lifeWord(row.palaceName)}上，你容易自己主動投入或自己消耗掉，不一定有人要求你這麼做。${layerOf('self').plain}`,
      ));
    }
    for (const x of row.incoming) {
      out.push(reading(
        `${row.palaceName}：${x.star}化${x.mutagen} 向心自化`,
        `向心自化是對宮的能量自己流進這一宮。表示${lifeWord(row.palaceName)}這一塊，外面的人事物容易自己找上門，你未必是主動去找的那一方。`,
      ));
    }
  }
  if (context.smallLimit) {
    out.push(reading(
      `小限：虛歲 ${context.smallLimit.age ?? context.nominalAge} 歲・${context.smallLimit.palaceName ?? context.smallLimit.name ?? '資料不足'}`,
      layerOf('minor').plain,
    ));
  } else {
    out.push(reading('小限：這個虛歲沒有可引用的資料', '排盤結果沒有這個虛歲的小限宮位，這裡就不補算。缺資料時標明缺，比硬湊一個答案有用。'));
  }
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
 * 每一步結尾的「這一步可以觀察什麼」。
 * 刻意寫成觀察方向而不是行動建議——網站的定位是幫人看懂自己的盤，
 * 不是代替使用者決定該不該換工作、投資或結婚。
 */
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

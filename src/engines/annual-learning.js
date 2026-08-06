// 流年學習系統：只重組 convertToZiWei 已算好的盤面資料，沒有排盤算法。
// 所有公開結論都先產生可追溯 evidence，再由 evidence 組裝，避免文案與命盤脫節。

import { ANNUAL_LEARNING_STEPS, ANNUAL_TOPIC_CONFIG, MUTAGEN_ACTION } from '../data/annual-learning.js';
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
    year, ganZhi, nominalAge, topic, topicConfig, majorLimit, decadalPalace, annualPalace,
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
    decadal: { prompt: `${context.year}年屬於哪一個大限？`, answer: `${context.majorLimit?.ageRange ?? '資料不足'}歲・${context.majorLimit?.ganZhi ?? '資料不足'}`, pool: context.majorLimit ? ['只看流年，不看大限', '小限取代大限'] : ['無法判定'] },
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
    decadal: { majorLimit: context.majorLimit, palace: context.decadalPalace, flights: context.decadalFlights },
    'annual-palace': { palace: context.annualPalace },
    'annual-triad': { members: context.annualTriad?.members ?? [] },
    'annual-mutagens': { flights: context.annualFlights },
    focus,
    supplement: { selfTransformations: context.selfTransformations, smallLimit: context.smallLimit },
    synthesis: { conclusion, evidence: context.evidence.filter((e) => e.relevance !== 'unused'), unused: focus.unused },
  };
  return ANNUAL_LEARNING_STEPS.map((step, index) => ({
    ...step, number: index + 1, data: stepData[step.id], quiz: quizOf(context, step.id),
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

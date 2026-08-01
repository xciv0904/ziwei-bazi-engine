import { similarityScore } from './text-quality.js';

const PUBLIC_FORBIDDEN_FIELDS = [
  'reason', 'rawReason', 'internalNote', 'knowledgeLabel', 'keyword', 'traitFragment',
  'projectionHint', 'debugText', 'relevanceReason', 'supportedTarget', 'evidenceId',
];

const INCOMPLETE_PATTERNS = [
  /也會加入/, /形成作用/, /帶來表現/, /以上專業判斷/,
  /這裡看的是/, /從命盤這個位置/, /對應到白話摘要/,
];

const clean = (value) => String(value ?? '')
  .replace(/[,:]/g, (char) => (char === ',' ? '，' : '：'))
  .replace(/\s+/g, '')
  .replace(/[。；；]+$/g, '')
  .trim();

const completeSentence = (value) => {
  const text = clean(value);
  if (text.length < 12 || INCOMPLETE_PATTERNS.some((pattern) => pattern.test(text))) return '';
  return `${text}。`;
};

const compactLength = (value) => String(value ?? '').replace(/\s+/g, '').length;

function distinctTexts(values, limit = Infinity) {
  const out = [];
  for (const raw of values) {
    const value = completeSentence(raw);
    if (!value) continue;
    if (out.some((prior) => similarityScore(prior, value) > 0.72)) continue;
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function contentPriority(questionIndex, kind) {
  const priorities = [
    { summary: 5, life: 6, challenge: 2, advice: 3 },
    { summary: 6, life: 5, challenge: 2, advice: 3 },
    { summary: 3, life: 6, challenge: 3, advice: 5 },
    { summary: 2, life: 3, challenge: 6, advice: 6 },
    { summary: 2, life: 4, challenge: 7, advice: 5 },
    { summary: 2, life: 3, challenge: 5, advice: 7 },
  ];
  return priorities[questionIndex]?.[kind] ?? 1;
}

const DIRECT_KIND_BY_QUESTION = ['life', 'life', 'summary', 'challenge', 'challenge', 'advice'];

function targetFor(contract, kind, index) {
  const expectedCounts = { summary: 1, life: 4, challenge: 3, advice: 3 };
  const preferredIndex = contract.questionIndex % expectedCounts[kind];
  if (kind === DIRECT_KIND_BY_QUESTION[contract.questionIndex] && index === preferredIndex) {
    return contract.answerTargets[0];
  }
  if (kind === 'summary') return contract.answerTargets[0];
  if (kind === 'life') return contract.answerTargets[Math.min(index < 2 ? 1 : 2, contract.answerTargets.length - 1)];
  if (kind === 'challenge') return contract.answerTargets[Math.min(3, contract.answerTargets.length - 1)];
  return contract.answerTargets[Math.min(2 + index, contract.answerTargets.length - 1)];
}

function evidenceFromCard({ contract, card, sourceType, sourceName, palace = null, transformations = [] }) {
  if (!card) return [];
  const groups = [
    ['summary', [card.summary]],
    ['life', card.lifeExamples ?? []],
    ['challenge', card.challenges ?? []],
    ['advice', card.advice ?? []],
  ];
  return groups.flatMap(([kind, values]) => values.map((value, index) => ({
    evidenceId: `${sourceType}:${sourceName}:${kind}:${index}`,
    sourceType,
    sourceName,
    palace,
    transformations: [...transformations],
    topicId: contract.id,
    supportedTarget: targetFor(contract, kind, index),
    relevanceReason: `${sourceName}是 ${contract.id} 允許的${palace ? '宮位' : '內在條件'}，${kind}對應題目目標。`,
    interpretation: completeSentence(value),
    publicBasis: palace ? `${palace}的主要訊號` : '八字的相關內在條件',
    kind,
    score: contentPriority(contract.questionIndex, kind)
      + (contract.requiredTargets.includes(targetFor(contract, kind, index)) ? 5 : 0)
      + (sourceType.startsWith('ziwei_') ? 3 : 0)
      + (kind === DIRECT_KIND_BY_QUESTION[contract.questionIndex] && index === contract.questionIndex % Math.max(values.length, 1) ? 4 : 0),
  })));
}

export function extractTopicEvidence({ contract, ziWei, ziweiCard, baziCards = [] }) {
  if (!contract) return [];
  const palace = ziWei?.palaces?.find((item) => contract.allowedPalaces.includes(item.name));
  const stars = palace?.majorStars ?? [];
  const sourceName = stars.map((star) => star.name).join('、') || '主要位置訊號';
  const transformations = stars.map((star) => star.transformation).filter(Boolean);
  const candidates = [
    ...evidenceFromCard({
      contract,
      card: ziweiCard,
      sourceType: transformations.length ? 'ziwei_transformation' : 'ziwei_palace',
      sourceName,
      palace: palace?.name ?? null,
      transformations,
    }),
    ...contract.baziKeys.flatMap((key) => {
      const card = baziCards.find((item) => item.key === key);
      return evidenceFromCard({
        contract,
        card,
        sourceType: key === 'dayun' ? 'bazi_timing' : 'bazi_profile',
        sourceName: card?.title ?? key,
      });
    }),
  ];

  return candidates
    .filter((item) => item.interpretation)
    .filter((item) => contract.allowedEvidenceTypes.includes(item.sourceType))
    .filter((item) => !item.palace || contract.allowedPalaces.includes(item.palace))
    .filter((item) => contract.answerTargets.includes(item.supportedTarget));
}

export function selectTopicEvidence(contract, candidates) {
  const selected = [];
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const take = (candidate) => {
    if (!candidate) return;
    if (selected.some((item) => item.evidenceId === candidate.evidenceId)) return;
    if (selected.some((item) => similarityScore(item.interpretation, candidate.interpretation) > 0.72)) return;
    selected.push(candidate);
  };

  if (contract.id === 'love.partner-pattern') {
    // 這題要描述「對方是什麼樣的人」，必須先取關係宮位的整體特質；
    // 不能只拿「你在約會時怎麼做」的生活例子，否則主詞會回答錯。
    take(ordered.find((item) => item.kind === 'summary' && item.sourceType.startsWith('ziwei_')));
  }
  for (const target of contract.requiredTargets) {
    take(ordered.find((item) => item.supportedTarget === target));
  }
  const preferredKind = DIRECT_KIND_BY_QUESTION[contract.questionIndex] ?? 'summary';
  take(ordered.find((item) => item.kind === preferredKind && item.sourceType.startsWith('ziwei_')));
  take(ordered.find((item) => item.kind === preferredKind));
  for (const candidate of ordered) {
    if (selected.length >= contract.evidenceLimit) break;
    take(candidate);
  }
  return selected.slice(0, contract.evidenceLimit);
}

function evidenceText(selected, kind, fallbackIndex = 0) {
  return selected.find((item) => item.kind === kind)?.interpretation
    ?? selected[fallbackIndex]?.interpretation
    ?? '';
}

function actionText(selected, contract) {
  const advice = selected.find((item) => item.kind === 'advice')?.interpretation ?? '';
  if (advice) return advice;
  return '下次遇到相似情況時，先看對方實際做了什麼，再決定要不要繼續投入。';
}

function directAnswerText(contract, directBase, summaryCandidate) {
  // 「常遇到什麼對象」要直接描述對方，不把內部 answerTarget 或自己的反應繞寫進正文。
  if (contract.id === 'love.partner-pattern') {
    let partner = clean(summaryCandidate || directBase).split('。')[0];
    // 宮位卡前半句有時是觸發條件或雙星組合說明；冒號後才是可讀的關係特質。
    if (partner.includes('：')) partner = partner.split('：').at(-1);
    partner = partner.replace(/對方/g, '伴侶').replace(/你/g, '對方');
    return `你常遇到的類型是：${partner}。`;
  }
  return `${contract.answerTargets[0]}：${completeSentence(directBase)}`;
}

function buildSchemas(contract, selected, insufficient) {
  const summaryCandidate = selected.find((item) => item.kind === 'summary')?.interpretation ?? '';
  const preferredKind = DIRECT_KIND_BY_QUESTION[contract.questionIndex] ?? 'summary';
  const preferredCandidate = (selected.find((item) => item.kind === preferredKind && item.sourceType.startsWith('ziwei_'))
    ?? selected.find((item) => item.kind === preferredKind))?.interpretation ?? '';
  const lifeCandidate = selected.find((item) => item.kind === 'life')?.interpretation ?? '';
  let directBase = preferredCandidate || (compactLength(summaryCandidate) <= 72 ? summaryCandidate : lifeCandidate) || summaryCandidate;
  if (compactLength(directBase) > 100) {
    directBase = selected.map((item) => item.interpretation)
      .find((item) => compactLength(item) <= 100) ?? directBase;
  }
  const direct = directAnswerText(contract, directBase, summaryCandidate);
  const lifeTexts = distinctTexts(selected.filter((item) => item.kind === 'life').map((item) => item.interpretation), 3);
  const challengeCandidate = selected.find((item) => item.kind === 'challenge')?.interpretation ?? '';
  const scenario = lifeTexts.find((item) => similarityScore(item, direct) < 0.72)
    || [challengeCandidate, summaryCandidate].find((item) => item && similarityScore(item, direct) < 0.72)
    || '';
  const manifestations = distinctTexts(selected.filter((item) => item.kind === 'life')
    .map((item) => item.interpretation)
    .filter((text) => similarityScore(text, direct) < 0.72 && text !== scenario), 2);
  const cost = challengeCandidate !== scenario && similarityScore(challengeCandidate, direct) < 0.72 ? challengeCandidate : '';
  const action = actionText(selected, contract);
  const prefix = insufficient ? '這部分可使用的命盤訊號較少，目前較能確認的是：' : '';
  const conclusion = `${prefix}${direct}`;
  const reasons = distinctTexts(selected.map((item) => item.interpretation)
    .filter((text) => text !== directBase && text !== scenario && text !== action), 2);
  const strength = '';

  return {
    topicAnalysis: {
      headline: contract.questionFocus,
      directConclusion: conclusion,
      manifestations,
      scenario,
      strength,
      cost,
      evidence: selected.map((item) => ({
        evidenceId: item.evidenceId,
        label: item.publicBasis,
        supportedTarget: item.supportedTarget,
      })),
    },
    directAnswer: {
      answer: conclusion,
      reasons,
      scenario,
      actions: distinctTexts([action], 2),
    },
  };
}

function publicTextOf(report) {
  const topic = report.topicAnalysis;
  const direct = report.directAnswer;
  return [
    topic.headline, topic.directConclusion, ...topic.manifestations, topic.scenario,
    topic.strength, topic.cost, ...topic.evidence.map((item) => item.label),
    direct.answer, ...direct.reasons, direct.scenario, ...direct.actions,
  ].filter(Boolean).join('\n');
}

export function validateTopicReport(report, contract) {
  const issues = [];
  const selected = report.selectedEvidence ?? [];
  for (const evidence of selected) {
    if (evidence.topicId !== contract.id) issues.push(`證據 topicId 錯置：${evidence.evidenceId}`);
    if (!contract.answerTargets.includes(evidence.supportedTarget)) issues.push(`證據未支持本題 target：${evidence.evidenceId}`);
    if (evidence.palace && !contract.allowedPalaces.includes(evidence.palace)) issues.push(`混入排除宮位：${evidence.palace}`);
    if (!contract.allowedEvidenceTypes.includes(evidence.sourceType)) issues.push(`混入排除證據類型：${evidence.sourceType}`);
  }
  for (const target of contract.requiredTargets) {
    if (!selected.some((item) => item.supportedTarget === target)) issues.push(`缺少必要 target：${target}`);
  }

  const publicText = publicTextOf(report);
  for (const field of PUBLIC_FORBIDDEN_FIELDS) {
    if (publicText.includes(field)) issues.push(`公開文字混入內部欄位：${field}`);
  }
  for (const pattern of INCOMPLETE_PATTERNS) {
    if (pattern.test(publicText)) issues.push(`公開文字出現殘句：${pattern}`);
  }
  if (!report.directAnswer.answer) issues.push('缺少直接答案');
  if (/較明顯的方向是|這項傾向運用得宜|需要的判斷與安排/.test(report.directAnswer.answer)) issues.push('直接答案使用抽象模板');
  if (!report.directAnswer.scenario) issues.push('缺少具體情境');
  if (!(report.directAnswer.actions ?? []).length) issues.push('缺少可執行做法');
  if (compactLength(publicText) > contract.wordBudget.topicAnalysis + contract.wordBudget.directAnswer) issues.push('公開文字超過總字數預算');

  const sections = [
    report.topicAnalysis.directConclusion,
    ...report.topicAnalysis.manifestations,
    report.topicAnalysis.scenario,
    report.topicAnalysis.strength,
    report.topicAnalysis.cost,
  ].filter(Boolean);
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[i] === sections[j]) issues.push('主題分析區塊完全重複');
    }
  }
  return [...new Set(issues)];
}

export function buildTopicReport({ contract, ziWei, ziweiCard, baziCards = [] }) {
  if (!contract) throw new TypeError('buildTopicReport 需要 Topic Contract');
  const candidates = extractTopicEvidence({ contract, ziWei, ziweiCard, baziCards });
  const selectedEvidence = selectTopicEvidence(contract, candidates);
  const insufficient = contract.requiredTargets.some((target) =>
    !selectedEvidence.some((item) => item.supportedTarget === target));
  const report = {
    topicId: contract.id,
    question: contract.question,
    questionFocus: contract.questionFocus,
    questionIndex: contract.questionIndex,
    selectedEvidence,
    insufficient,
    ...buildSchemas(contract, selectedEvidence, insufficient),
  };
  report.validationIssues = validateTopicReport(report, contract);
  if (report.validationIssues.length) {
    const safeAnswer = `這部分可使用的命盤訊號較少，目前還不足以完整回答「${contract.questionFocus}」。`;
    report.fallbackApplied = true;
    report.insufficient = true;
    report.selectedEvidence = [];
    report.topicAnalysis = {
      headline: contract.questionFocus,
      directConclusion: safeAnswer,
      manifestations: [],
      scenario: '',
      strength: '',
      cost: '',
      evidence: [],
    };
    report.directAnswer = { answer: safeAnswer, reasons: [], scenario: '', actions: [] };
  }
  return report;
}

export function buildLongTermAdvicePlan(card, { wordBudget = 420 } = {}) {
  const challenges = distinctTexts(card?.challenges ?? [], 2);
  const advice = distinctTexts(card?.advice ?? [], 2);
  const slots = [
    ['先處理'],
    ['接著練習'],
  ].slice(0, Math.min(challenges.length, advice.length, 2));
  const items = slots.map(([priority], index) => {
    const problem = challenges[index];
    const problemText = clean(problem);
    const action = advice[index];
    return {
      priority,
      problem,
      trigger: index === 0
        ? `「${problemText}」一週內重複出現兩次時，就開始這個做法。`
        : `第一個做法持續兩週後，再針對「${problemText}」開始這一項。`,
      action,
      check: index === 0
        ? `兩週後，確認「${problemText}」是否比之前少發生。`
        : `每週回顧一次，確認「${problemText}」是否減少。`,
    };
  });
  while (compactLength(items.map((item) => Object.values(item).join('')).join('')) > wordBudget && items.length > 1) items.pop();
  return items;
}

export function validateLongTermAdvice(items) {
  const issues = [];
  for (const [index, item] of (items ?? []).entries()) {
    for (const field of ['problem', 'trigger', 'action', 'check']) {
      if (!item[field] || compactLength(item[field]) < 8) issues.push(`第 ${index + 1} 項長期建議缺少 ${field}`);
    }
  }
  return issues;
}

export const TOPIC_PUBLIC_FORBIDDEN_FIELDS = Object.freeze(PUBLIC_FORBIDDEN_FIELDS);

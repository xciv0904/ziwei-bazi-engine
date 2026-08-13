import starAnswers from '../data/topic-star-answers.json' with { type: 'json' };
import { similarityScore } from './text-quality.js';
import { composePalaceModifiers } from './compose-modifiers.js';
import { resolveTopicTenGod } from './topic-bazi.js';

const STAR_ANSWERS = starAnswers['答案'];

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

const BRANCHES_TR = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 找出這一題該用哪一顆主星回答。
 *
 * 為什麼需要這一層:每一題的答案都掛在「主星」上(見 topic-star-answers.json),
 * 但題目宮位可能是空宮。空宮的通行讀法是借對宮主星參看,所以這裡一併處理,
 * 並把「是不是借來的」記下來,讓命盤依據可以誠實標示。
 *
 * @returns {{palace, star, second, borrowed, borrowedFrom, brightness, transformation}|null}
 */
export function resolveTopicStar(contract, ziWei) {
  const palace = ziWei?.palaces?.find((item) => contract.allowedPalaces.includes(item.name));
  if (!palace) return null;
  let source = palace;
  let borrowed = false;
  if (!palace.majorStars.length) {
    const oppositeBranch = BRANCHES_TR[(BRANCHES_TR.indexOf(palace.position[1]) + 6) % 12];
    const opposite = ziWei.palaces.find((item) => item.position[1] === oppositeBranch);
    if (opposite?.majorStars.length) {
      source = opposite;
      borrowed = true;
    }
  }
  const [first, second] = source.majorStars;
  if (!first) return { palace, star: null, second: null, borrowed: false, borrowedFrom: null };
  return {
    palace,
    star: first.name,
    second: second?.name ?? null,
    borrowed,
    borrowedFrom: borrowed ? source.name : null,
    brightness: first.brightness ?? '',
    transformation: first.transformation ? String(first.transformation).replace(/^化/, '') : '',
  };
}

/** 這一題的答案:由主星決定,雙主星時第二顆作為補充 */
function starAnswerFor(contract, resolved) {
  const table = STAR_ANSWERS[contract.id];
  if (!table || !resolved?.star) return { main: '', extra: '' };
  return {
    main: table[resolved.star] ?? '',
    extra: resolved.second ? (table[resolved.second] ?? '') : '',
  };
}

/**
 * 命盤依據:真正的盤面事實,不是「XX宮的主要訊號」這種對誰都成立的佔位字串。
 * 使用者展開這一區是想知道「這個答案是從命盤哪裡來的」,所以列的是宮位、星曜、
 * 亮度、生年四化與借星狀態,每一項都可以回到命盤上核對。
 */
export function buildChartBasis(contract, ziWei, resolved, resolvedTenGod = null) {
  // 八字那幾列先組好：即使紫微這一題沒有可用宮位，八字仍然講得出依據，
  // 不該因為紫微缺料就整個依據面板空白。
  const baziRows = resolvedTenGod ? [
    { label: '八字取用', detail: resolvedTenGod.basisLabel.replace(/^八字：/, '') },
    { label: '對應十神', detail: `${resolvedTenGod.tenGod}，四柱中共出現 ${resolvedTenGod.count} 次` },
  ] : [];
  if (!resolved?.palace) return baziRows;
  const rows = [];
  const { palace, star, second, borrowed, borrowedFrom, brightness, transformation } = resolved;
  rows.push({ label: '對應宮位', detail: `${palace.name}（${palace.position}）` });
  if (!star) {
    rows.push({ label: '主星', detail: '本宮與對宮都沒有十四主星，這一題的判斷可用資料較少' });
    return rows;
  }
  rows.push({
    label: borrowed ? '借對宮主星' : '本宮主星',
    detail: borrowed
      ? `${palace.name}無主星，借對宮${borrowedFrom}的${[star, second].filter(Boolean).join('、')}參看`
      : `${[star, second].filter(Boolean).join('、')}${brightness ? `（${star}亮度${brightness}）` : ''}`,
  });
  if (transformation) {
    rows.push({ label: '生年四化', detail: `${star}帶生年化${transformation}，這個傾向一輩子都在` });
  }
  const minor = (palace.minorStars ?? []).slice(0, 4).map((item) => String(item).replace(/[(（].*$/, ''));
  if (minor.length) rows.push({ label: '同宮輔星煞曜', detail: minor.join('、') });

  // 只列出星名等於沒說——讀者看到「擎羊、天刑」也不知道它改變了什麼。
  // 這裡把每一顆的實際影響一起寫出來，命盤依據才真的能核對。
  const modifiers = composePalaceModifiers(palace);
  if (modifiers?.hasSignal) {
    rows.push({ label: '這些星怎麼改變判斷', detail: modifiers.summary });
    for (const item of modifiers.technical.items.slice(0, 4)) {
      rows.push({ label: item.source, detail: `${item.star}：${item.effect}` });
    }
  }
  return [...rows, ...baziRows];
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

/**
 * 從候選裡挑出這一題要秀的依據。
 *
 * 這裡曾經有一個實測出來的失衡：60 題選出的 180 條依據，只有 13 條來自八字（7.2%），
 * 但八字通過篩選的候選其實有 972 條、佔全部候選的 66%。八字不是內容不夠，是被挑掉的。
 *
 * 原因有三個，都在這個函式裡：
 *   1. 直接答案那一步寫死 sourceType.startsWith('ziwei_') 優先。
 *   2. requiredTargets 逐項取最高分，而紫微候選的分數普遍較高，於是三個名額先被吃光。
 *   3. evidenceLimit 是 3，前兩步填滿就結束了，八字連被看到的機會都沒有。
 *
 * 現在的做法：紫微優先仍然保留在「直接答案」那一步——那句話要跟 840 格答案庫扣得住，
 * 換成八字會對不上。但名額從 3 加到 4，並且其中一格保留給八字。
 * 保留名額而不是改分數，是因為分數反映的是「這一條有多扣題」，那是對的，
 * 不該為了平衡去扭曲它；要平衡的是版面，那就用版面的方式解決。
 */
export function selectTopicEvidence(contract, candidates) {
  const selected = [];
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const isBazi = (item) => item.sourceType.startsWith('bazi_');
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

  // 八字保留席。挑分數最高的那一條，讓它跟紫微的依據談的是不同面向。
  // 保留席在補滿之前先發，否則照分數補滿之後就沒位置了。
  const limit = contract.evidenceLimit;
  if (BAZI_RESERVED_SLOT && !selected.some(isBazi)) {
    // 先讓出一格：若前面已經填滿，砍掉分數最低的紫微條目
    if (selected.length >= limit) {
      const lowestZiwei = [...selected].reverse().find((item) => !isBazi(item));
      if (lowestZiwei) selected.splice(selected.indexOf(lowestZiwei), 1);
    }
    take(ordered.find(isBazi));
  }
  for (const candidate of ordered) {
    if (selected.length >= limit) break;
    take(candidate);
  }
  return selected.slice(0, limit);
}

/**
 * 每題保留一格給八字。
 *
 * 設成常數而不是直接寫死在邏輯裡，是為了讓 tests/topic-balance.mjs
 * 能明確地檢查這個決定還在——這是一條容易在日後重構時被順手拿掉的規則。
 */
const BAZI_RESERVED_SLOT = true;

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
  // 這是備援路徑:主星答案庫沒有涵蓋到的情況(例如本宮與對宮都無主星)才會走到這裡。
  if (contract.id === 'love.partner-pattern') {
    let partner = clean(summaryCandidate || directBase).split('。')[0];
    // 宮位卡前半句有時是觸發條件或雙星組合說明；冒號後才是可讀的關係特質。
    if (partner.includes('：')) partner = partner.split('：').at(-1);
    partner = partner.replace(/對方/g, '伴侶').replace(/你/g, '對方');
    return `你常遇到的類型是：${partner}。`;
  }
  return `${contract.answerTargets[0]}：${completeSentence(directBase)}`;
}

function buildSchemas(contract, selected, insufficient, resolved = null) {
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
  // 主星答案庫是這一題的正解來源:它是照著題目寫的，會扣題。
  // 宮位白話卡只是備援——那套內容是為「宮位」寫的，不是為「這一題」寫的，
  // 用它回答「什麼樣的居住環境適合我」就會答成主星的通用性格。
  const fromStars = starAnswerFor(contract, resolved);
  // 「我常遇到什麼類型的對象」沿用既有的開場：這一題問的是對方，加上這句前綴才不會被誤讀成在講自己。
  const starDirect = fromStars.main && contract.id === 'love.partner-pattern'
    ? `你常遇到的類型是：${clean(fromStars.main)}。`
    : fromStars.main && completeSentence(fromStars.main);
  const direct = starDirect || directAnswerText(contract, directBase, summaryCandidate);
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
  // 雙主星時，第二顆星的答案作為補充；沒有雙主星才回頭用宮位卡的句子。
  const reasons = fromStars.extra
    ? distinctTexts([fromStars.extra], 1)
    : distinctTexts(selected.map((item) => item.interpretation)
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

/**
 * 把這一題對應宮位的修正層接到答案後面。
 *
 * 60 題的答案庫是「題目 × 主星」840 格，這是刻意的——答案必須扣題。
 * 但只用主星就等於忽略同宮的吉煞與四化，同一顆天機在有左輔和有擎羊的宮位，
 * 實際的樣子差很多。所以答案本身不動，後面追加一到兩句修正。
 */
function appendModifierNote(report, resolved) {
  if (!resolved?.palace) return report;
  const modifiers = composePalaceModifiers(resolved.palace, {
    borrowed: resolved.borrowed,
    borrowedFrom: resolved.borrowedFrom,
  });
  if (!modifiers?.plainLines.length) return report;
  report.modifiers = modifiers;
  report.topicAnalysis.modifierNote = modifiers.plainLines.slice(0, 2);
  report.directAnswer.modifierNote = report.topicAnalysis.modifierNote;
  return report;
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
  // 情境與做法是舊管線(宮位白話卡)的補充欄位。主星答案庫的內容本身就寫成具體情境，
  // 不必再硬湊一段，因此只有在沒有主星答案可用時才要求這兩欄。
  if (!report.resolvedStar?.star) {
    if (!report.directAnswer.scenario) issues.push('缺少具體情境');
    if (!(report.directAnswer.actions ?? []).length) issues.push('缺少可執行做法');
  }
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

export function buildTopicReport({ contract, ziWei, ziweiCard, baziCards = [], baZi = null, gender = null, yongshen = null }) {
  if (!contract) throw new TypeError('buildTopicReport 需要 Topic Contract');
  const candidates = extractTopicEvidence({ contract, ziWei, ziweiCard, baziCards });
  const selectedEvidence = selectTopicEvidence(contract, candidates);
  const resolved = resolveTopicStar(contract, ziWei);
  // 八字軌：跟紫微的「題目 × 主星」對等的「題目 × 十神」答案。
  // baZi 缺席時是 null,呼叫端要能接受只有一軌——寧可少一軌，也不要生沒有依據的話。
  const resolvedTenGod = resolveTopicTenGod({ contract, baZi, gender, yongshen });
  const insufficient = contract.requiredTargets.some((target) =>
    !selectedEvidence.some((item) => item.supportedTarget === target));
  const report = {
    topicId: contract.id,
    question: contract.question,
    questionFocus: contract.questionFocus,
    questionIndex: contract.questionIndex,
    selectedEvidence,
    insufficient,
    resolvedStar: resolved,
    resolvedTenGod,
    chartBasis: buildChartBasis(contract, ziWei, resolved, resolvedTenGod),
    ...buildSchemas(contract, selectedEvidence, insufficient, resolved),
  };
  // 雙軌答案：紫微一句、八字一句，並列而不是二選一。
  // 放在 directAnswer 之後覆寫，是因為 buildSchemas 仍然只認紫微——
  // 那份 840 格答案庫是照題目寫的，品質最好，不該為了加一軌就把它改掉。
  if (resolvedTenGod?.answer) {
    report.directAnswer.baziAnswer = resolvedTenGod.answer;
    report.directAnswer.ziweiAnswer = report.directAnswer.answer;
  }
  report.validationIssues = validateTopicReport(report, contract);
  appendModifierNote(report, resolved);
  // 有主星答案時不套用整段抹除的備援:那份答案是照著題目寫的，本身就是最扣題的內容。
  // 這時的 validationIssues 多半來自舊管線的補充欄位(情境、做法)沒湊齊，
  // 不該因此把已經正確的答案換成「訊號較少」的罐頭句。
  if (report.validationIssues.length && starAnswerFor(contract, resolved).main) {
    report.topicAnalysis.manifestations = [];
    report.topicAnalysis.cost = '';
    report.directAnswer.reasons = report.directAnswer.reasons.filter(Boolean);
    report.validationIssues = validateTopicReport(report, contract);
  }
  if (report.validationIssues.length && !starAnswerFor(contract, resolved).main) {
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

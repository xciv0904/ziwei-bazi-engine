import { readFileSync } from 'node:fs';
import { convertToBaZi } from '../src/engines/bazi.js';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { composeElementAnalysis } from '../src/engines/compose-elements.js';
import { composeBaZiLuck } from '../src/engines/compose-luck.js';
import { generatePlainBaziTopics, generatePlainPalaceCard } from '../src/engines/compose-plain.js';
import { formatTopicPromptForAI } from '../src/engines/format-ai.js';
import {
  buildLongTermAdvicePlan,
  buildTopicReport,
  TOPIC_PUBLIC_FORBIDDEN_FIELDS,
  validateLongTermAdvice,
} from '../src/engines/topic-report.js';
import { similarityScore } from '../src/engines/text-quality.js';
import {
  TOPIC_CATEGORIES,
  TOPIC_CONTRACTS,
  createCustomTopicContract,
  getTopicContract,
} from '../src/data/topic-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/topic-report-charts.json', import.meta.url), 'utf8'));
let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const compactLength = (value) => String(value ?? '').replace(/\s+/g, '').length;
const publicText = (report) => [
  report.topicAnalysis.directConclusion,
  ...report.topicAnalysis.manifestations,
  report.topicAnalysis.scenario,
  report.topicAnalysis.strength,
  report.topicAnalysis.cost,
  ...report.topicAnalysis.evidence.map((item) => item.label),
  report.directAnswer.answer,
  ...report.directAnswer.reasons,
  report.directAnswer.scenario,
  ...report.directAnswer.actions,
].filter(Boolean).join('\n');

const REQUIRED_CONTRACT_FIELDS = [
  'id', 'category', 'question', 'intent', 'questionFocus', 'answerTargets', 'requiredTargets',
  'optionalTargets', 'excludedTargets', 'allowedPalaces', 'excludedPalaces',
  'allowedEvidenceTypes', 'excludedEvidenceTypes', 'answerSchema', 'evidenceLimit', 'wordBudget',
];

if (TOPIC_CATEGORIES.length !== 10) fail(`Topic category 數量應為 10，實際 ${TOPIC_CATEGORIES.length}`);
if (TOPIC_CONTRACTS.length !== 60) fail(`Topic Contract 數量應為 60，實際 ${TOPIC_CONTRACTS.length}`);
for (const contract of TOPIC_CONTRACTS) {
  for (const field of REQUIRED_CONTRACT_FIELDS) {
    if (!(field in contract)) fail(`${contract.id} 缺少 contract 欄位 ${field}`);
  }
  if (contract.requiredTargets.some((target) => !contract.answerTargets.includes(target))) fail(`${contract.id} requiredTargets 不在 answerTargets`);
  if (contract.allowedPalaces.some((palace) => contract.excludedPalaces.includes(palace))) fail(`${contract.id} 同時允許與排除相同宮位`);
}

const reportsByChart = new Map();
for (const testCase of fixture.cases) {
  const ziWei = convertToZiWei(testCase.input);
  const baZi = convertToBaZi(testCase.input);
  const baziCards = generatePlainBaziTopics(
    baZi,
    composeBaZiLuck(baZi, { year: fixture.referenceYear, mode: 'public' }),
    composeElementAnalysis(baZi.fiveElementDistribution),
  );
  const reports = new Map();

  for (const contract of TOPIC_CONTRACTS) {
    const ziweiCard = generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]);
    const report = buildTopicReport({ contract, ziWei, ziweiCard, baziCards });
    reports.set(contract.id, report);
    if (report.validationIssues.length) fail(`${testCase.chartId}/${contract.id}：${report.validationIssues.join('；')}`);
    if (report.fallbackApplied) fail(`${testCase.chartId}/${contract.id} 正常 Golden case 不應啟用安全 fallback`);
    if (report.selectedEvidence.length > contract.evidenceLimit) fail(`${testCase.chartId}/${contract.id} 證據超過上限`);
    for (const evidence of report.selectedEvidence) {
      if (evidence.topicId !== contract.id) fail(`${testCase.chartId}/${contract.id} 證據 topicId 錯置`);
      if (!contract.answerTargets.includes(evidence.supportedTarget)) fail(`${testCase.chartId}/${contract.id} 證據沒有綁定 answerTarget`);
      if (evidence.palace && !contract.allowedPalaces.includes(evidence.palace)) fail(`${testCase.chartId}/${contract.id} 引用不允許的 ${evidence.palace}`);
      if (!contract.allowedEvidenceTypes.includes(evidence.sourceType)) fail(`${testCase.chartId}/${contract.id} 證據類型不允許`);
    }
    const text = publicText(report);
    for (const field of TOPIC_PUBLIC_FORBIDDEN_FIELDS) {
      if (text.includes(field)) fail(`${testCase.chartId}/${contract.id} 公開文字泄漏 ${field}`);
    }
    if (/也會加入|形成作用|帶來表現/.test(text)) fail(`${testCase.chartId}/${contract.id} 有殘句`);
    if (contract.category === 'money' && /賺到\d+|月收\d+|必定獲利/.test(text)) fail(`${testCase.chartId}/${contract.id} 預測具體財務結果`);
    if (contract.category === 'health' && /診斷為|你有.+症|治療後會/.test(text)) fail(`${testCase.chartId}/${contract.id} 做出醫療診斷`);
  }

  const reportList = [...reports.values()];
  for (let i = 0; i < reportList.length; i++) {
    for (let j = i + 1; j < reportList.length; j++) {
      const score = similarityScore(reportList[i].directAnswer.answer, reportList[j].directAnswer.answer);
      if (score > 0.95) fail(`${testCase.chartId} 不同題過度相似：${reportList[i].topicId}/${reportList[j].topicId} ${score.toFixed(2)}`);
    }
  }

  for (const scenario of fixture.scenarios) {
    if (scenario.kind === 'plainCard') {
      const card = generatePlainPalaceCard(ziWei, '命宮');
      if (!card.summary || !(card.lifeExamples ?? []).length) fail(`${testCase.chartId}/${scenario.topicId} 核心性格卡資料不足`);
      continue;
    }
    const contract = scenario.kind === 'custom'
      ? createCustomTopicContract({ category: 'career', question: scenario.question })
      : getTopicContract(scenario.topicId);
    const report = scenario.kind === 'custom'
      ? buildTopicReport({ contract, ziWei, ziweiCard: generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]), baziCards })
      : reports.get(scenario.topicId);
    if (!report) { fail(`${testCase.chartId}/${scenario.topicId} 沒有報告`); continue; }
    for (const target of scenario.expectedTargets) {
      if (!contract.answerTargets.includes(target)) fail(`${testCase.chartId}/${scenario.topicId} 缺少驗收 target ${target}`);
    }
    for (const target of scenario.forbiddenTargets) {
      if (!contract.excludedTargets.includes(target)) fail(`${testCase.chartId}/${scenario.topicId} 沒有排除 target ${target}`);
    }
    if (!report.selectedEvidence.some((item) => scenario.expectedEvidenceTypes.includes(item.sourceType))) {
      fail(`${testCase.chartId}/${scenario.topicId} 沒有預期類型的證據`);
    }
    const text = publicText(report);
    for (const forbidden of scenario.forbiddenEvidence) {
      if (text.includes(forbidden)) fail(`${testCase.chartId}/${scenario.topicId} 混入禁止內容 ${forbidden}`);
    }
    if (compactLength(report.directAnswer.answer) > scenario.maxLength) fail(`${testCase.chartId}/${scenario.topicId} 超過字數預算`);
    if (scenario.kind === 'longTerm') {
      const plan = buildLongTermAdvicePlan(generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]));
      const issues = validateLongTermAdvice(plan);
      if (issues.length) fail(`${testCase.chartId}/${scenario.topicId} 長期建議：${issues.join('；')}`);
      if (plan.length > 3) fail(`${testCase.chartId}/${scenario.topicId} 長期建議超過三項`);
    }
  }

  const promptContract = getTopicContract('career.work-content');
  const prompt = formatTopicPromptForAI({ contract: promptContract, report: reports.get(promptContract.id) });
  if (prompt.includes('◆ 十二宮列表') || prompt.includes('◆ 十二宮飛化')) fail(`${testCase.chartId} 單題 prompt 混入全盤巡禮`);
  if ((prompt.match(/\d+\. 來源：/g) ?? []).length > promptContract.evidenceLimit) fail(`${testCase.chartId} 單題 prompt 證據過多`);
  for (const field of ['rawReason', 'internalNote', 'relevanceReason', 'debugText']) {
    if (prompt.includes(field)) fail(`${testCase.chartId} 單題 prompt 泄漏 ${field}`);
  }
  const rejected = buildTopicReport({ contract: promptContract, ziWei, ziweiCard: null, baziCards: [] });
  if (!rejected.fallbackApplied || !rejected.validationIssues.length) fail(`${testCase.chartId} validator 失敗時未啟用安全 fallback`);
  if (rejected.selectedEvidence.length || rejected.topicAnalysis.manifestations.length || rejected.directAnswer.reasons.length) {
    fail(`${testCase.chartId} validator 失敗後仍保留問題正文或證據`);
  }
  reportsByChart.set(testCase.chartId, reports);
}

// 三張結構明顯不同的盤，用同一題確認不會只替換命理名稱。
for (const topicId of ['career.environment', 'love.attraction', 'money.income']) {
  const answers = fixture.cases.map((item) => reportsByChart.get(item.chartId).get(topicId).directAnswer.answer);
  if (new Set(answers).size !== answers.length) fail(`${topicId} 在三張 Golden Charts 出現完全相同答案`);
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      const score = similarityScore(answers[i], answers[j]);
      if (score > 0.95) fail(`${topicId} 跨盤答案過度相似：${score.toFixed(2)}`);
    }
  }
}

console.log(failed === 0
  ? `\n${fixture.cases.length} 張 Golden Charts × 60 題 Topic Contracts，加上 12 類驗收情境全部通過 ✅`
  : `\n共 ${failed} 項 Topic Contract 回歸失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);

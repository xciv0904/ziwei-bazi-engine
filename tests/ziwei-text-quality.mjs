import { readFileSync } from 'node:fs';
import { convertToBaZi } from '../src/engines/bazi.js';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { composeElementAnalysis } from '../src/engines/compose-elements.js';
import { composeBaZiLuck } from '../src/engines/compose-luck.js';
import { generatePlainBaziTopics, generatePlainPalaceCard } from '../src/engines/compose-plain.js';
import {
  inspectCardQuality,
  inspectHeadingHierarchy,
  normalizeForSimilarity,
  sentenceList,
  similarityScore,
} from '../src/engines/text-quality.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/ziwei-text-quality-charts.json', import.meta.url), 'utf8'));
const TOPICS = [
  ['overview', '命宮'], ['personality', '福德宮'], ['love', '夫妻宮'], ['career', '官祿宮'],
  ['money', '財帛宮'], ['social', '僕役宮'], ['family', '父母宮'], ['direction', '遷移宮'],
];

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const sameArray = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cardText = (card) => [card.summary, ...(card.explanation ?? []), ...(card.lifeExamples ?? []),
  ...(card.challenges ?? []), ...(card.advice ?? [])].join('。');

const results = [];
for (const testCase of fixture.cases) {
  const ziWei = convertToZiWei(testCase.input);
  const baZi = convertToBaZi(testCase.input);
  const palace = (name) => ziWei.palaces.find((item) => item.name === name);
  const signature = {
    lifeStars: palace('命宮').majorStars.map((star) => star.name),
    bodyBranch: ziWei.bodyPalace,
    spouseStars: palace('夫妻宮').majorStars.map((star) => star.name),
    careerStars: palace('官祿宮').majorStars.map((star) => star.name),
    lifeMinorStars: [...palace('命宮').minorStars].sort(),
    transformations: ziWei.palaces.flatMap((item) => item.majorStars
      .filter((star) => star.transformation)
      .map((star) => `${star.name}${star.transformation}@${item.name}`)).sort(),
    currentLimit: (() => {
      const age = fixture.referenceYear - testCase.input.year + 1;
      const limit = ziWei.majorLimits.find((item) => {
        const [start, end] = item.ageRange.split('~').map(Number);
        return age >= start && age <= end;
      });
      return limit ? `${limit.ganZhi}:${limit.ageRange}` : null;
    })(),
  };
  for (const key of Object.keys(testCase.expected)) {
    const okay = Array.isArray(testCase.expected[key])
      ? sameArray(signature[key], testCase.expected[key])
      : signature[key] === testCase.expected[key];
    if (!okay) fail(`${testCase.id} Golden signature ${key} 改變`);
  }

  const cards = Object.fromEntries(TOPICS.map(([key, palaceName]) => [key, generatePlainPalaceCard(ziWei, palaceName)]));
  const age = fixture.referenceYear - testCase.input.year + 1;
  const elements = composeElementAnalysis(baZi.fiveElementDistribution);
  const baziCards = generatePlainBaziTopics(
    baZi,
    composeBaZiLuck(baZi, { year: fixture.referenceYear, mode: 'public' }),
    elements,
  );

  const titles = [];
  const adviceSeen = new Map();
  for (const [topic, card] of Object.entries(cards)) {
    titles.push(card.title);
    const issues = inspectCardQuality(card);
    if (issues.length) fail(`${testCase.id}/${topic}：${issues.join('；')}`);
    if ((card.evidence ?? []).length < 3) fail(`${testCase.id}/${topic} 沒有三項本盤依據`);
    for (const advice of card.advice ?? []) {
      const normalized = normalizeForSimilarity(advice);
      if (adviceSeen.has(normalized)) fail(`${testCase.id} 不同主題重複建議：${advice}`);
      adviceSeen.set(normalized, topic);
    }
  }
  for (const card of baziCards) {
    const issues = inspectCardQuality(card);
    if (issues.length) fail(`${testCase.id}/八字${card.key}：${issues.join('；')}`);
  }
  const headingIssues = inspectHeadingHierarchy(titles);
  if (headingIssues.length) fail(`${testCase.id} 標題：${headingIssues.join('；')}`);

  results.push({ id: testCase.id, cards: Object.fromEntries(Object.entries(cards).map(([key, card]) => [key, cardText(card)])) });
}

for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    for (const [topic] of TOPICS) {
      const left = results[i].cards[topic], right = results[j].cards[topic];
      if (normalizeForSimilarity(left) === normalizeForSimilarity(right)) {
        fail(`${results[i].id}/${results[j].id} 的 ${topic} 只替換命理名稱`);
      }
      const score = similarityScore(left, right);
      if (score > 0.88) fail(`${results[i].id}/${results[j].id} 的 ${topic} 相似度過高：${score.toFixed(2)}`);
      const leftSentences = sentenceList(left), rightSentences = new Set(sentenceList(right));
      const shared = leftSentences.filter((sentence) => rightSentences.has(sentence));
      const sharedRatio = shared.length / Math.max(leftSentences.length, 1);
      if (sharedRatio > 0.75) fail(`${results[i].id}/${results[j].id} 的 ${topic} 有 ${Math.round(sharedRatio * 100)}% 句子完全相同`);
      if (leftSentences[0] && leftSentences[0] === sentenceList(right)[0]) {
        fail(`${results[i].id}/${results[j].id} 的 ${topic} 使用相同開頭`);
      }
    }
  }
}

console.log(failed === 0
  ? `\n${fixture.cases.length} 份 Golden Charts × ${TOPICS.length} 個主題，差異化、依據、標題與去 AI 味檢查通過 ✅`
  : `\n共 ${failed} 項紫微文字品質問題 ❌`);
process.exit(failed === 0 ? 0 : 1);

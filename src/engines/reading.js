// src/engines/reading.js — 解讀組裝層的統一出入口
//
// 為什麼需要這一層：
// 下面這幾支 compose-*.js 連同各自的解讀資料庫(plain-star-profiles、plain-bazi-profiles、
// palace-star-meanings、ten-gods-meanings、luck-cycle-overlays…)合計超過 100KB,
// 但它們全部都是「排盤之後才用得到」的東西——歡迎頁一個字都不需要。
//
// 過去 main.js 是靜態 import 這些模組，打包器只能把它們併進入口 bundle,
// 結果是「只是進站看一眼、沒按排盤」的訪客也得先下載整套解讀資料。
// 現在改由 main.js 的 loadEngines() 動態 import 這支彙整檔，
// 讓它和排盤引擎（iztro / lunar-javascript）在同一時機、同一批平行載入：
// 使用者按下「排盤」本來就要等引擎，這些資料剛好搭同一班車，不會增加任何可感知的等待。
//
// 這裡只做 re-export,不放任何邏輯——要改解讀規則請直接改對應的 compose-*.js。

export { composeChartReading } from './compose.js';
export { composeBaZiReading } from './compose-bazi.js';
export { composeElementAnalysis } from './compose-elements.js';
export { composeZiWeiLuck, composeBaZiLuck, tenGodOf } from './compose-luck.js';
export {
  generatePlainZiweiTopics,
  generatePlainBaziTopics,
  generatePlainPalaceCard,
  generatePlainZiweiTimeCard,
  generatePlainBaziTimeCard,
} from './compose-plain.js';
export {
  composeAnnualChange,
  composeZiWeiAnnualChange,
  composeZiWeiDecadalChange,
  composeMonthlyChange,
  composeZiWeiMonthly,
  monthlyPillarsOf,
  computeSelfTransformations,
  computeLaiyinPalace,
  flyingOfStem,
  computeAnnualSnapshots,
  findAnnualRepeatedFocus,
} from './compose-annual.js';
export { composeYongShenReading, computeYongShen } from './compose-yongshen.js';
export { PALACE_ORDER, buildPalaceLesson, buildPalaceQuiz, triadOf } from './learning-palace.js';
export { buildLifeManual } from './life-manual.js';
export { LEARNING_LEVELS, stepOrdinal } from '../data/learning-mode.js';
export {
  LEARNING_PROGRESS_KEY,
  quizMastery,
  chartKeyOf,
  isPalaceComplete,
  loadProgress,
  markStepRead,
  nextPalaceToLearn,
  progressSummary,
  recordQuizAnswer,
  resetProgress,
} from './learning-progress.js';
export {
  annualGanZhi,
  analyzeAnnualFocus,
  buildAnnualConclusion,
  buildAnnualLearningContext,
  buildAnnualLearningSteps,
  buildAnnualLesson,
  compareAnnualYears,
} from './annual-learning.js';
export {
  ANNUAL_LEARNING_NOTES_KEY,
  ANNUAL_LEARNING_PROGRESS_KEY,
  annualNoteTemplate,
  annualNoteText,
  annualCompletionSummary,
  annualProgressSummary,
  clearAnnualNote,
  loadAnnualNote,
  loadAnnualProgress,
  markAnnualStep,
  recordAnnualQuiz,
  resetAnnualProgress,
  saveAnnualNote,
} from './annual-learning-storage.js';
export { ANNUAL_LEARNING_STEPS, ANNUAL_TOPIC_CONFIG } from '../data/annual-learning.js';
export {
  inspectAiTone,
  inspectCardQuality,
  inspectHeadingHierarchy,
  normalizeForSimilarity,
  sentenceList,
  similarityScore,
  uniqueHeading,
} from './text-quality.js';
export {
  buildLongTermAdvicePlan,
  buildTopicReport,
  extractTopicEvidence,
  resolveTopicStar,
  selectTopicEvidence,
  validateLongTermAdvice,
  validateTopicReport,
} from './topic-report.js';
export { TOPIC_CATEGORIES, TOPIC_CONTRACTS, createCustomTopicContract, getTopicContract } from '../data/topic-contracts.js';
export { composeChartModifiers, composePalaceModifiers } from './compose-modifiers.js';

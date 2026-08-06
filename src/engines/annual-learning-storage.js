// 流年學習的進度與筆記。只存不可逆命盤代碼、年份、主題和使用者輸入，
// 不存生辰，也不改動既有命盤收藏格式。

export const ANNUAL_LEARNING_PROGRESS_KEY = 'zwbz-annual-learning-progress';
export const ANNUAL_LEARNING_NOTES_KEY = 'zwbz-annual-learning-notes';

const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const slotKey = (chartKey, year, topic) => `${chartKey}:${year}:${topic}`;

function read(storage, key) {
  try { return safeObject(JSON.parse(storage?.getItem(key) ?? 'null')); } catch { return {}; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* 無痕模式或容量不足不影響閱讀 */ }
}

export function loadAnnualProgress(storage, chartKey, year, topic) {
  const value = read(storage, ANNUAL_LEARNING_PROGRESS_KEY)[slotKey(chartKey, year, topic)];
  return {
    steps: Array.isArray(value?.steps) ? [...new Set(value.steps)] : [],
    quiz: safeObject(value?.quiz),
    lastStep: typeof value?.lastStep === 'string' ? value.lastStep : null,
  };
}

function updateAnnualProgress(storage, chartKey, year, topic, mutate) {
  const all = read(storage, ANNUAL_LEARNING_PROGRESS_KEY);
  const entry = loadAnnualProgress(storage, chartKey, year, topic);
  mutate(entry);
  all[slotKey(chartKey, year, topic)] = entry;
  write(storage, ANNUAL_LEARNING_PROGRESS_KEY, all);
  return entry;
}

export function markAnnualStep(storage, chartKey, year, topic, stepId) {
  return updateAnnualProgress(storage, chartKey, year, topic, (entry) => {
    if (!entry.steps.includes(stepId)) entry.steps.push(stepId);
    entry.lastStep = stepId;
  });
}

export function recordAnnualQuiz(storage, chartKey, year, topic, questionId, correct) {
  return updateAnnualProgress(storage, chartKey, year, topic, (entry) => {
    entry.quiz[questionId] = Boolean(correct);
  });
}

export function resetAnnualProgress(storage, chartKey, year = null, topic = null) {
  const all = read(storage, ANNUAL_LEARNING_PROGRESS_KEY);
  const prefix = `${chartKey}:`;
  for (const key of Object.keys(all)) {
    const matchYear = year == null || key.startsWith(`${chartKey}:${year}:`);
    const matchTopic = topic == null || key === slotKey(chartKey, year, topic);
    if (key.startsWith(prefix) && matchYear && matchTopic) delete all[key];
  }
  write(storage, ANNUAL_LEARNING_PROGRESS_KEY, all);
  return { steps: [], quiz: {}, lastStep: null };
}

export function annualProgressSummary(entry, total = 8) {
  const completed = Math.min(total, new Set(entry?.steps ?? []).size);
  const answers = Object.values(entry?.quiz ?? {});
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    quizAnswered: answers.length,
    quizCorrect: answers.filter(Boolean).length,
    complete: completed === total,
    lastStep: entry?.lastStep ?? null,
  };
}

/** 已完成的年份／主題可由同一份進度資料機械整理，不另外存一份容易失同步的清單。 */
export function annualCompletionSummary(storage, chartKey, total = 8) {
  const all = read(storage, ANNUAL_LEARNING_PROGRESS_KEY);
  const completed = Object.entries(all).flatMap(([key, value]) => {
    if (!key.startsWith(`${chartKey}:`) || new Set(value?.steps ?? []).size < total) return [];
    const [, year, topic] = key.split(':');
    return [{ year: Number(year), topic }];
  });
  return {
    completed,
    years: [...new Set(completed.map((x) => x.year))].sort((a, b) => a - b),
    topics: [...new Set(completed.map((x) => x.topic))],
  };
}

export const annualNoteTemplate = ({ year, topicLabel }) => [
  `年份：${year}`,
  `研究主題：${topicLabel}`,
  '',
  '一、本命底盤：', '',
  '二、大限背景：', '',
  '三、流年命宮：', '',
  '四、三方四正：', '',
  '五、流年四化：', '',
  '六、重複焦點：', '',
  '七、自化與小限：', '',
  '八、可能情境：', '',
  '九、不能直接確定：', '',
  '十、一句話結論：', '',
].join('\n');

const emptyAnnualNote = (meta) => ({
  observed: annualNoteTemplate(meta),
  judgment: '',
  siteHint: meta.siteHint ?? '',
  revision: '',
  validation: '',
  uncertain: '',
});

export function annualNoteText(note) {
  const value = safeObject(note);
  return [
    ['我先看到的重點', value.observed], ['我的判斷', value.judgment], ['網站提示', value.siteHint],
    ['最後修正', value.revision], ['生活驗證', value.validation], ['尚未確定', value.uncertain],
  ].map(([label, text]) => `## ${label}\n${text ?? ''}`).join('\n\n');
}

export function loadAnnualNote(storage, chartKey, year, topic, meta) {
  const saved = read(storage, ANNUAL_LEARNING_NOTES_KEY)[slotKey(chartKey, year, topic)];
  if (typeof saved === 'string') return { ...emptyAnnualNote(meta), observed: saved };
  return { ...emptyAnnualNote(meta), ...safeObject(saved) };
}

export function saveAnnualNote(storage, chartKey, year, topic, note) {
  const all = read(storage, ANNUAL_LEARNING_NOTES_KEY);
  all[slotKey(chartKey, year, topic)] = { ...safeObject(note) };
  write(storage, ANNUAL_LEARNING_NOTES_KEY, all);
  return all[slotKey(chartKey, year, topic)];
}

export function clearAnnualNote(storage, chartKey, year, topic, meta) {
  const all = read(storage, ANNUAL_LEARNING_NOTES_KEY);
  delete all[slotKey(chartKey, year, topic)];
  write(storage, ANNUAL_LEARNING_NOTES_KEY, all);
  return emptyAnnualNote(meta);
}

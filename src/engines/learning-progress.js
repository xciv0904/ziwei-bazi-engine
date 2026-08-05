// src/engines/learning-progress.js — 學習模式的進度儲存
//
// 只存「學到哪裡」,不存任何出生資料:命盤識別碼是由生辰欄位算出的短雜湊,
// 無法反推回原本的年月日時,也不會離開這台裝置(與 zwbz-saved-charts 同樣是純 localStorage)。
//
// 所有函式都接受一個 storage 物件(需有 getItem/setItem),因此可以在 Node 測試裡用假的儲存體驗證,
// 不必依賴瀏覽器環境。

import { PALACE_ORDER } from './learning-palace.js';

export const LEARNING_PROGRESS_KEY = 'zwbz-learning-progress';

/**
 * 命盤識別碼。
 * 同一組生辰(含性別與真太陽時校正後的時間)得到同一個碼,不同命盤一定不同,
 * 用來把進度分開存,避免切換命盤後共用到上一張盤的進度。
 * 刻意做成不可逆的短雜湊:localStorage 裡不會出現看得懂的生日。
 */
export function chartKeyOf(input) {
  if (!input) return 'unknown';
  const raw = [input.year, input.month, input.day, input.hour, input.gender].join('-');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + raw.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `c${h1.toString(36)}${h2.toString(36)}`;
}

const emptyEntry = () => ({ palaces: {}, lastPalace: null });

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LEARNING_PROGRESS_KEY) ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(storage, all) {
  try {
    // 只保留最近 10 張命盤的進度,避免長期使用後把 localStorage 塞爆
    const keys = Object.keys(all);
    if (keys.length > 10) {
      const trimmed = {};
      for (const key of keys.slice(-10)) trimmed[key] = all[key];
      storage?.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(trimmed));
      return;
    }
    storage?.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(all));
  } catch { /* 無痕模式或容量已滿:進度存不了不影響閱讀 */ }
}

/** 讀取單一命盤的進度(永遠回傳可用的物件,不會是 null) */
export function loadProgress(storage, chartKey) {
  const entry = readAll(storage)[chartKey];
  if (!entry || typeof entry !== 'object') return emptyEntry();
  return {
    palaces: entry.palaces && typeof entry.palaces === 'object' ? entry.palaces : {},
    lastPalace: PALACE_ORDER.includes(entry.lastPalace) ? entry.lastPalace : null,
  };
}

function updateProgress(storage, chartKey, mutate) {
  const all = readAll(storage);
  const entry = loadProgress(storage, chartKey);
  mutate(entry);
  all[chartKey] = entry;
  writeAll(storage, all);
  return entry;
}

const palaceSlot = (entry, palaceName) => (entry.palaces[palaceName] ??= { steps: [], quiz: {} });

/** 記錄「看過某一宮的某一個步驟」;同一步驟重複記錄不會重複累加 */
export function markStepRead(storage, chartKey, palaceName, stepId) {
  if (!PALACE_ORDER.includes(palaceName)) return loadProgress(storage, chartKey);
  return updateProgress(storage, chartKey, (entry) => {
    const slot = palaceSlot(entry, palaceName);
    if (!slot.steps.includes(stepId)) slot.steps.push(stepId);
    entry.lastPalace = palaceName;
  });
}

/** 記錄某一題答對或答錯 */
export function recordQuizAnswer(storage, chartKey, palaceName, questionId, correct) {
  if (!PALACE_ORDER.includes(palaceName)) return loadProgress(storage, chartKey);
  return updateProgress(storage, chartKey, (entry) => {
    palaceSlot(entry, palaceName).quiz[questionId] = Boolean(correct);
    entry.lastPalace = palaceName;
  });
}

export function resetProgress(storage, chartKey) {
  const all = readAll(storage);
  delete all[chartKey];
  writeAll(storage, all);
  return emptyEntry();
}

/**
 * 一宮算「學過」的條件:五個步驟都展開過。
 * 只點開第一步就算完成會讓進度失去意義,但也不強制要答對練習題——
 * 練習是選用的,不該變成解鎖條件。
 */
export function isPalaceComplete(entry, palaceName, totalSteps = 5) {
  const slot = entry?.palaces?.[palaceName];
  return Boolean(slot && slot.steps.length >= totalSteps);
}

/** 進度摘要:已完成幾宮、上次讀到哪一宮、練習答對率 */
export function progressSummary(entry, totalSteps = 5) {
  const completed = PALACE_ORDER.filter((name) => isPalaceComplete(entry, name, totalSteps));
  const started = PALACE_ORDER.filter((name) => (entry?.palaces?.[name]?.steps?.length ?? 0) > 0);
  const answers = Object.values(entry?.palaces ?? {}).flatMap((slot) => Object.values(slot.quiz ?? {}));
  return {
    completed,
    completedCount: completed.length,
    startedCount: started.length,
    total: PALACE_ORDER.length,
    label: `十二宮學習進度：${completed.length}／${PALACE_ORDER.length}`,
    lastPalace: entry?.lastPalace ?? null,
    quizAnswered: answers.length,
    quizCorrect: answers.filter(Boolean).length,
  };
}

/**
 * 每一種題目已經在幾個宮位答對過。
 *
 * 使用者回報「幾乎每個宮位的學習問題都一樣，一套做下來像複習了十二次」。
 * 追下去是兩層問題：
 *   1. 通則題（判讀順序、雜曜的角色、煞星怎麼看）的答案跟看哪一宮無關，十二宮出同一題。
 *   2. 基本功題（本宮主星、對宮、三合宮、是不是空宮）雖然答案每宮不同，
 *      但題型一字不差，連問十二次就變成抄寫練習。
 *
 * 兩種都該退場，只是時機不同：通則答對一次就夠，基本功答對幾次才熟。
 * 這個函式回傳次數，由 buildPalaceQuiz 決定各自的退場門檻。
 */
export function quizMastery(entry) {
  const counts = new Map();
  for (const slot of Object.values(entry?.palaces ?? {})) {
    for (const [id, correct] of Object.entries(slot.quiz ?? {})) {
      if (correct) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** 下一個還沒學完的宮位(給「繼續上次學習」用) */
export function nextPalaceToLearn(entry, totalSteps = 5) {
  if (entry?.lastPalace && !isPalaceComplete(entry, entry.lastPalace, totalSteps)) return entry.lastPalace;
  return PALACE_ORDER.find((name) => !isPalaceComplete(entry, name, totalSteps)) ?? entry?.lastPalace ?? PALACE_ORDER[0];
}

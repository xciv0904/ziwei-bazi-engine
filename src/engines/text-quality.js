// 紫微解讀文字品質檢查。
// 風格原則參考 allenloves/de-ai-tone（CC BY-SA 4.0）：
// https://github.com/allenloves/de-ai-tone/blob/master/SKILL.md
// 本檔保留網站需要的卡片、小標題與條列層級，只採用臺灣用語、短句、具體動詞、
// 空話刪除、制式句型限用與生成後逐項掃描等原則。

export const AI_TONE_PHRASES = [
  '值得注意的是', '需要注意的是', '值得一提的是', '更重要的是', '事實上', '毫無疑問',
  '不得不說', '可以說', '從某種意義上來說', '簡單來說', '總的來說', '綜上所述',
  '深入探討', '揭示了', '賦能', '旨在', '至關重要', '不可或缺',
];

export const GENERIC_ENDINGS = [
  '相信自己的直覺', '保持開放的心態', '找到屬於自己的平衡', '學會接納自己',
  '勇敢面對挑戰', '只要持續努力就能成功', '走向更好的未來', '保持正能量',
];

export const TAIWAN_WORDING = new Map([
  ['視頻', '影片'], ['音頻', '音訊'], ['軟件', '軟體'], ['硬件', '硬體'], ['網絡', '網路'],
  ['信息', '資訊'], ['程序', '程式'], ['代碼', '程式碼'], ['服務器', '伺服器'], ['默認', '預設'],
  ['用戶', '使用者'], ['界面', '介面'], ['兼容', '相容'], ['加載', '載入'], ['運行', '執行'],
  ['保存', '儲存'], ['粘貼', '貼上'], ['鏈接', '連結'], ['登錄', '登入'],
  ['復盤', '回顧'], ['落地', '實作'], ['閉環', '完整流程'], ['渠道', '管道'],
]);

const ASTROLOGY_TERMS = [
  '命宮', '身宮', '夫妻宮', '官祿宮', '財帛宮', '福德宮', '疾厄宮', '遷移宮', '父母宮',
  '兄弟宮', '子女宮', '僕役宮', '田宅宮', '紫微', '天機', '太陽', '武曲', '天同', '廉貞',
  '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍', '化祿', '化權', '化科',
  '化忌', '廟', '旺', '得', '利', '平', '陷', '大限', '流年', '四化', '三方四正',
];

const compact = (text) => String(text ?? '').replace(/\s+/g, '').trim();

export function normalizeForSimilarity(text) {
  let value = compact(text);
  for (const term of ASTROLOGY_TERMS) value = value.split(term).join('');
  return value
    .replace(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g, '')
    .replace(/[，。；：！？、（）「」『』\-—–・]/g, '')
    .replace(/\d+/g, '');
}

export function sentenceList(text) {
  return String(text ?? '').split(/[。！？；\n]/).map((s) => s.trim()).filter((s) => s.length >= 8);
}

export function similarityScore(a, b) {
  const grams = (text) => {
    const value = normalizeForSimilarity(text);
    const out = new Set();
    for (let i = 0; i < value.length - 2; i++) out.add(value.slice(i, i + 3));
    return out;
  };
  const left = grams(a), right = grams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;
  return shared / Math.max(left.size, right.size);
}

export function inspectTaiwanTraditional(text) {
  const value = String(text ?? '');
  return [...TAIWAN_WORDING.keys()].filter((word) => value.includes(word));
}

export function inspectAiTone(text) {
  const value = String(text ?? '');
  const issues = [];
  for (const phrase of AI_TONE_PHRASES) if (value.includes(phrase)) issues.push(`空泛句型：${phrase}`);
  for (const phrase of GENERIC_ENDINGS) if (value.includes(phrase)) issues.push(`通用結尾：${phrase}`);
  for (const word of inspectTaiwanTraditional(value)) issues.push(`非臺灣慣用語：${word}`);
  const fakeContrast = (value.match(/不是.{0,24}[，,]而是/g) ?? []).length;
  const escalation = (value.match(/不僅.{0,24}[，,](?:更|還)/g) ?? []).length;
  const emDash = (value.match(/——/g) ?? []).length;
  const length = Math.max(value.length, 1);
  if (fakeContrast > Math.ceil(length / 1000)) issues.push('「不是⋯⋯而是⋯⋯」使用過多');
  if (escalation > Math.ceil(length / 1000)) issues.push('「不僅⋯⋯更⋯⋯」使用過多');
  if (emDash > Math.ceil(length / 1000)) issues.push('破折號使用過多');
  for (const sentence of sentenceList(value)) {
    if (sentence.length > 78) issues.push(`句子過長：${sentence.slice(0, 28)}…`);
  }
  return [...new Set(issues)];
}

export function inspectHeadingHierarchy(headings, lead = '') {
  const cleaned = headings.map(compact).filter(Boolean);
  const issues = [];
  const seen = new Set();
  for (const heading of cleaned) {
    if (seen.has(heading)) issues.push(`標題重複：${heading}`);
    seen.add(heading);
  }
  const concepts = ['核心特質', '主要特質', '關鍵特質', '人生課題', '核心課題', '關鍵課題'];
  const conceptHits = concepts.filter((term) => cleaned.some((heading) => heading.includes(term)));
  if (conceptHits.length > 1) issues.push(`近義標題重複：${conceptHits.join('、')}`);
  const first = compact(sentenceList(lead)[0] ?? lead);
  for (const heading of cleaned) {
    if (heading.length >= 4 && first && (first === heading || first.startsWith(heading))) {
      issues.push(`標題與第一句重複：${heading}`);
    }
  }
  return issues;
}

export function uniqueHeading(candidate, used, fallback) {
  const base = compact(candidate) || compact(fallback) || '解讀重點';
  let title = base;
  let index = 2;
  while (used.has(title)) title = `${base}（${index++}）`;
  used.add(title);
  return title;
}

export function inspectCardQuality(card) {
  const text = [card.summary, ...(card.explanation ?? []), ...(card.lifeExamples ?? []),
    ...(card.challenges ?? []), ...(card.advice ?? [])].join('。');
  const issues = inspectAiTone(text);
  if ((card.evidence ?? []).length < 3) issues.push('命盤依據少於三項');
  if (!(card.lifeExamples ?? []).length) issues.push('缺少生活情境');
  if (!(card.advice ?? []).length) issues.push('缺少可執行建議');
  if (!card.technical?.chartData) issues.push('缺少專業推導資料');
  return issues;
}

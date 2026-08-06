import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import {
  annualLimitStatus, annualYearRange, buildAnnualLesson, buildAnnualOverview, compareAnnualYears,
} from '../src/engines/annual-learning.js';
import {
  annualCompletionSummary, annualProgressSummary, annualReviewSummary, clearAnnualNote, clearAnnualReview,
  loadAnnualNote, loadAnnualProgress, loadAnnualReview, markAnnualStep, recordAnnualQuiz,
  resetAnnualProgress, saveAnnualNote, saveAnnualReview,
} from '../src/engines/annual-learning-storage.js';

const golden = JSON.parse(readFileSync(new URL('./golden/cases/annual-learning-2026.json', import.meta.url), 'utf8'));
const cases = JSON.parse(readFileSync(new URL('./golden/cases/learning-mode-charts.json', import.meta.url), 'utf8')).cases;
let failed = 0;
const check = (label, pass, detail = '') => pass ? console.log(`✅ ${label}`) : (failed++, console.log(`❌ ${label}${detail ? `：${detail}` : ''}`));
const flightKey = (f) => `${f.star}${f.mutagen}${f.palaceName}`;

const ziWei = convertToZiWei({ ...golden.input, refDate: new Date(2026, 6, 1) });
const lesson = buildAnnualLesson({ ziWei, input: golden.input, year: golden.year, topic: 'overview' });
const c = lesson.context;
check('golden：2026 丙午、虛歲 25', c.ganZhi === golden.annual.ganZhi && c.nominalAge === 25);
check('golden：大限沒有混成流年', c.majorLimit.ageRange === golden.majorLimit.ageRange && c.majorLimit.ganZhi === golden.majorLimit.ganZhi);
check('golden：流年命宮落入僕役宮', c.annualPalace.name === golden.annual.palace);
check('golden：流年三方四正四宮正確', JSON.stringify(c.annualTriad.members.map((x) => x.name).sort()) === JSON.stringify([...golden.annual.triad].sort()));
check('golden：大限四化四條正確', JSON.stringify(c.decadalFlights.map(flightKey).sort()) === JSON.stringify([...golden.decadalFlights].sort()));
check('golden：流年四化四條正確', JSON.stringify(c.annualFlights.map(flightKey).sort()) === JSON.stringify([...golden.annualFlights].sort()));
check('golden：大限文昌忌與流年文昌科同落福德', c.decadalFlights.some((x) => flightKey(x) === '文昌忌福德宮') && c.annualFlights.some((x) => flightKey(x) === '文昌科福德宮'));
check('golden：財帛辨識大限祿與流年權疊加', lesson.focus.repeated.some((x) => x.palaceName === '財帛宮' && x.layers.includes('decadal') && x.layers.includes('annual')));
check('golden：父母宮流年忌且位於流年三方四正', c.annualFlights.some((x) => flightKey(x) === '廉貞忌父母宮') && c.annualTriad.members.some((x) => x.name === '父母宮'));
check('golden：重複焦點分析標出四化與流年三方四正重疊', lesson.focus.triadOverlaps.some((x) => x.star === '廉貞' && x.transformation === '忌' && x.palaceName === '父母宮'));
const wuqu = lesson.focus.canonicalSignals.filter((x) => x.key === '武曲|忌|僕役宮');
check('golden：武曲生年忌與向心自化忌合併為同一核心訊號', wuqu.length === 1 && wuqu[0].sourceLayers.includes('birth') && wuqu[0].sourceLayers.includes('self'));
check('golden：補上 iztro 小限落宮', c.smallLimit.age === golden.smallLimit.age && c.smallLimit.palaceName === golden.smallLimit.palaceName && c.smallLimit.position === golden.smallLimit.position);
const laterLesson = buildAnnualLesson({ ziWei, input: golden.input, year: 2033, topic: 'overview' });
check('跨出畫面十年清單仍能由 1–120 虛歲索引取得小限落宮', laterLesson.context.smallLimit?.age === 32 && Boolean(laterLesson.context.smallLimit?.palaceName));
const conclusionText = Object.values(lesson.conclusion).map((x) => x?.text ?? x).join(' ');
check('golden：不輸出朋友運差或一定升職', !conclusionText.includes('朋友運差') && !conclusionText.includes('一定升職'));
check('golden：結論有舞台、機會、壓力、策略、限制', ['stage', 'opportunities', 'pressure', 'strategy', 'limitations'].every((key) => lesson.conclusion[key]?.text));
check('golden：八個步驟與每步唯一答案', lesson.steps.length === 8 && lesson.steps.every((s) => s.quiz.options.filter((x) => x === s.quiz.answer).length === 1));
const answerPositions = lesson.steps.map((step) => step.quiz.options.indexOf(step.quiz.answer));
check('測驗正確答案分散在不同選項位置', new Set(answerPositions).size >= 3 && answerPositions.some((index) => index > 0));
const rebuiltLesson = buildAnnualLesson({ ziWei, input: golden.input, year: golden.year, topic: 'overview' });
check('同一題重新顯示時選項順序保持穩定', lesson.steps.every((step, index) => JSON.stringify(step.quiz.options) === JSON.stringify(rebuiltLesson.steps[index].quiz.options)));

for (const item of cases) {
  const chart = convertToZiWei({ ...item.input, refDate: new Date(item.year, 6, 1) });
  for (const topic of ['overview', 'work', 'love', 'money']) {
    const built = buildAnnualLesson({ ziWei: chart, input: item.input, year: item.year, topic });
    const joined = JSON.stringify(built);
    check(`${item.id}/${topic}：無 undefined、NaN 或內部物件字串`, !/undefined|NaN|\[object Object\]/.test(joined));
    check(`${item.id}/${topic}：evidence id 不重複`, new Set(built.context.evidence.map((x) => x.id)).size === built.context.evidence.length);
    const allocated = ['stage', 'opportunities', 'pressure', 'strategy'].flatMap((key) => built.conclusion[key].evidenceIds);
    check(`${item.id}/${topic}：結論不重複使用同一 evidence id`, new Set(allocated).size === allocated.length);
  }
}

const work = buildAnnualLesson({ ziWei, input: golden.input, year: 2026, topic: 'work' });
const love = buildAnnualLesson({ ziWei, input: golden.input, year: 2026, topic: 'love' });
const money = buildAnnualLesson({ ziWei, input: golden.input, year: 2026, topic: 'money' });
const primaryTargets = (x) => x.context.evidence.filter((e) => e.relevance === 'primary').map((e) => e.targetPalace).sort().join('|');
check('工作、感情、財務使用不同的主題證據集合', new Set([primaryTargets(work), primaryTargets(love), primaryTargets(money)]).size === 3);

const comparison = compareAnnualYears({ ziWei, input: golden.input, yearA: 2026, yearB: 2027, topic: 'overview' });
check('年份比較含大限、流年命宮、三方四正與四化', comparison.a.majorLimit && comparison.a.annualPalace !== comparison.b.annualPalace && comparison.a.triad.length === 4 && comparison.a.flights.length === 4);
check('年份比較解釋重心轉換與實際用法', comparison.interpretation.stageShift.includes('轉向') && comparison.interpretation.howToUse.includes('持續追蹤'));
check('四化比較逐項說明落點差異的意義', comparison.transformationChanges.length === 4 && comparison.transformationChanges.every((item) => item.meaning.includes('表示')));
check('年份比較保留不能判斷哪年較好的限制', comparison.interpretation.limitation.includes('不代表哪一年一定比較好'));

const values = new Map();
const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
let progress = markAnnualStep(storage, 'chart-a', 2026, 'work', 'natal');
progress = markAnnualStep(storage, 'chart-a', 2026, 'work', 'decadal');
progress = recordAnnualQuiz(storage, 'chart-a', 2026, 'work', 'q1', true);
check('進度依命盤／年份／主題分開並記住最後步驟', annualProgressSummary(progress).completed === 2 && progress.lastStep === 'decadal' && loadAnnualProgress(storage, 'chart-b', 2026, 'work').steps.length === 0);
resetAnnualProgress(storage, 'chart-a', 2026, 'work');
check('可重設單一年度主題進度', loadAnnualProgress(storage, 'chart-a', 2026, 'work').steps.length === 0);
for (const id of ['natal', 'decadal', 'annual-palace', 'annual-triad', 'annual-mutagens', 'focus', 'supplement', 'synthesis']) markAnnualStep(storage, 'chart-a', 2027, 'money', id);
check('可整理已完成年份與主題', annualCompletionSummary(storage, 'chart-a').years.includes(2027) && annualCompletionSummary(storage, 'chart-a').topics.includes('money'));
const meta = { year: 2026, topicLabel: '工作' };
const template = loadAnnualNote(storage, 'chart-a', 2026, 'work', meta);
saveAnnualNote(storage, 'chart-a', 2026, 'work', { ...template, validation: '我的驗證' });
check('筆記六欄可儲存且不與其他命盤共用', loadAnnualNote(storage, 'chart-a', 2026, 'work', meta).validation === '我的驗證' && loadAnnualNote(storage, 'chart-b', 2026, 'work', meta).validation !== '我的驗證');
clearAnnualNote(storage, 'chart-a', 2026, 'work', meta);
check('筆記可清除並恢復十段模板', !loadAnnualNote(storage, 'chart-a', 2026, 'work', meta).validation.includes('我的驗證') && template.observed.includes('十、一句話結論：'));

// ---------- 年份範圍：出生年 ～ 虛歲 120 ----------
const range = annualYearRange({ input: golden.input });
check('年份範圍從出生當年（虛歲 1）起算', range.from === golden.input.year);
check('年份範圍到虛歲 120', range.to === golden.input.year + 119 && range.maxAge === 120);

const firstLimitStart = Math.min(...ziWei.majorLimits.map((l) => Number(l.ageRange.split('~')[0])));
const lastLimitEnd = Math.max(...ziWei.majorLimits.map((l) => Number(l.ageRange.split('~')[1])));
const beforeYear = golden.input.year; // 虛歲 1，必定在起運前
const afterYear = golden.input.year + lastLimitEnd; // 虛歲 lastLimitEnd + 1，必定超出
check('起運前判定為 before-start 並說明原因', (() => {
  const st = annualLimitStatus(ziWei, golden.input, beforeYear);
  return st.status === 'before-start' && st.startAge === firstLimitStart && st.note.includes('還沒起運');
})());
check('超出末大限判定為 after-end 並說明原因', (() => {
  const st = annualLimitStatus(ziWei, golden.input, afterYear);
  return st.status === 'after-end' && st.endAge === lastLimitEnd && st.note.includes('超過');
})());
check('大限範圍內為 in-range 且不加註記', (() => {
  const st = annualLimitStatus(ziWei, golden.input, golden.year);
  return st.status === 'in-range' && st.note === null;
})());
check('起運前的年份仍能產生完整八步驟課程', (() => {
  const l = buildAnnualLesson({ ziWei, input: golden.input, year: beforeYear, topic: 'overview' });
  return l.steps.length === 8 && l.context.majorLimit === null && l.context.limitStatus.status === 'before-start';
})());
check('起運前的大限練習題不會出現「資料不足」當答案', (() => {
  const l = buildAnnualLesson({ ziWei, input: golden.input, year: beforeYear, topic: 'overview' });
  const quiz = l.steps.find((s) => s.id === 'decadal').quiz;
  return !quiz.answer.includes('資料不足') && quiz.answer.includes('沒有大限');
})());

// ---------- 多年總覽 ----------
const overview = buildAnnualOverview({ ziWei, input: golden.input, fromYear: golden.year - 10, toYear: golden.year + 10, thisYear: golden.year });
check('總覽逐年列出，區間含頭尾', overview.rows.length === 21 && overview.rows[0].year === golden.year - 10 && overview.rows.at(-1).year === golden.year + 10);
check('總覽的流年命宮與逐步學習算出來的一致', (() => overview.rows.every((row) => {
  const l = buildAnnualLesson({ ziWei, input: golden.input, year: row.year, topic: 'overview' });
  return row.annualPalace === (l.context.annualPalace?.name ?? null);
}))());
check('總覽的四化落點與逐步學習一致', (() => {
  const row = overview.rows.find((r) => r.year === golden.year);
  const l = buildAnnualLesson({ ziWei, input: golden.input, year: golden.year, topic: 'overview' });
  return row.flights.map(flightKey).sort().join('|') === l.context.annualFlights.map(flightKey).sort().join('|');
})());
check('每個重點年都附可回查的理由', overview.keyYears.every((r) => r.reasons.length > 0 && r.score >= 4));
check('重點年不會多到失去篩選作用', overview.keyYears.length < overview.rows.length * 0.5);
check('總覽不宣稱吉凶，並明說不排序好壞', overview.howToRead.includes('不代表運勢比較好或比較壞') && overview.limitation.includes('不排序哪一年比較順利'));
check('總覽區間會夾回合法範圍，不產生虛歲 0 或負數', (() => {
  const wide = buildAnnualOverview({ ziWei, input: golden.input, fromYear: golden.input.year - 50, toYear: golden.input.year + 500, thisYear: golden.year });
  return wide.rows[0].nominalAge === 1 && wide.rows.at(-1).nominalAge === 120 && wide.rows.length === 120;
})());
check('總覽掃完 120 年在合理時間內（畫面每次重繪都會呼叫）', (() => {
  const t = Date.now();
  buildAnnualOverview({ ziWei, input: golden.input, fromYear: range.from, toYear: range.to, thisYear: golden.year });
  return Date.now() - t < 400;
})());

// ---------- 回顧驗盤 ----------
const reviewStore = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; })();
const reviewTriad = (lesson.context.annualTriad?.members ?? []).map((m) => m.name);
const annualPalaceName = lesson.context.annualPalace.name;
const outsideTriad = ziWei.palaces.map((p) => p.name).find((name) => !reviewTriad.includes(name));
saveAnnualReview(reviewStore, 'chart-a', 2024, { picked: annualPalaceName, annualPalace: annualPalaceName, triad: reviewTriad });
check('勾到流年命宮判定 hit', loadAnnualReview(reviewStore, 'chart-a', 2024).verdict === 'hit');
saveAnnualReview(reviewStore, 'chart-a', 2023, { picked: reviewTriad.find((n) => n !== annualPalaceName), annualPalace: annualPalaceName, triad: reviewTriad });
check('勾到三方四正判定 near', loadAnnualReview(reviewStore, 'chart-a', 2023).verdict === 'near');
saveAnnualReview(reviewStore, 'chart-a', 2022, { picked: outsideTriad, annualPalace: annualPalaceName, triad: reviewTriad });
check('勾到三方四正以外判定 miss', loadAnnualReview(reviewStore, 'chart-a', 2022).verdict === 'miss');
check('命中率把正中與三方四正分開算', (() => {
  const sum = annualReviewSummary(reviewStore, 'chart-a');
  return sum.total === 3 && sum.hit === 1 && sum.near === 1 && sum.miss === 1 && sum.hitRate === 33 && sum.structureRate === 67;
})());
check('樣本少於 5 筆時標示為不足', !annualReviewSummary(reviewStore, 'chart-a').enoughSample);
check('回顧紀錄不與其他命盤共用', annualReviewSummary(reviewStore, 'chart-b').total === 0);
clearAnnualReview(reviewStore, 'chart-a', 2022);
check('可清除單一年份的回顧紀錄', annualReviewSummary(reviewStore, 'chart-a').total === 2 && !loadAnnualReview(reviewStore, 'chart-a', 2022));

console.log(`\n流年學習測試：${failed ? `${failed} 項失敗` : '全部通過'}`);
process.exit(failed ? 1 : 0);

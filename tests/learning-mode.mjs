// tests/learning-mode.mjs — 學習模式(逐步判讀/證據鏈/練習題/學習進度)的回歸測試
//
// 驗證重點與 AGENTS.md 的界線一致:這一層不得產生新的命盤事實,
// 因此每一項斷言都是「教學內容 vs 排盤引擎原始輸出」的一致性比對,
// 而不是把目前的輸出直接當成期望值抄下來。
//
// 執行:node tests/learning-mode.mjs(已掛在 npm run smoke 的檢查串裡)
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { computeSelfTransformations, flyingOfStem } from '../src/engines/compose-annual.js';
import { PALACE_ORDER, buildPalaceLesson, buildPalaceQuiz, triadOf } from '../src/engines/learning-palace.js';
import { LEARNING_LEVELS, LESSON_STEPS, stepOrdinal } from '../src/data/learning-mode.js';
import { quizMastery } from '../src/engines/learning-progress.js';
import {
  chartKeyOf,
  isPalaceComplete,
  loadProgress,
  markStepRead,
  nextPalaceToLearn,
  progressSummary,
  recordQuizAnswer,
  resetProgress,
} from '../src/engines/learning-progress.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/learning-mode-charts.json', import.meta.url), 'utf8'));

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const shift = (branch, offset) => BRANCHES[(BRANCHES.indexOf(branch) + offset) % 12];
const stepOf = (lesson, id) => lesson.steps.find((s) => s.id === id).data;

const YEAR_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const stemOfYear = (y) => YEAR_STEMS[(y - 4) % 10];

// ---------- 1. 逐步判讀:每個案例、每一宮都要跟排盤結果對得起來 ----------
const lessonsByCase = new Map();

for (const testCase of fixture.cases) {
  const ziWei = convertToZiWei(testCase.input);
  const nominalAge = testCase.year - testCase.input.year + 1;
  const majorLimit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return nominalAge >= a && nominalAge <= b;
  }) ?? ziWei.majorLimits[0];
  const selfT = Object.fromEntries(computeSelfTransformations(ziWei).map((r) => [r.palaceName, r]));
  const lessons = {};

  for (const palaceName of PALACE_ORDER) {
    const palace = ziWei.palaces.find((p) => p.name === palaceName);
    const lesson = buildPalaceLesson({ ziWei, palaceName, year: testCase.year, majorLimit });
    lessons[palaceName] = lesson;
    const label = `${testCase.id}/${palaceName}`;

    if (!lesson) { fail(`${label}:buildPalaceLesson 回傳 null`); continue; }

    // --- 空宮判定 ---
    const expectedEmpty = palace.majorStars.length === 0;
    if (lesson.isEmpty !== expectedEmpty) fail(`${label}:空宮判定不符(引擎 ${expectedEmpty} / 教學 ${lesson.isEmpty})`);
    if (expectedEmpty && !lesson.emptyGuide) fail(`${label}:空宮卻沒有產生空宮判讀提示`);
    if (!expectedEmpty && lesson.emptyGuide) fail(`${label}:有主星卻出現空宮提示`);

    // --- 對宮 ---
    const oppositeBranch = shift(palace.position[1], 6);
    const expectedOpposite = ziWei.palaces.find((p) => p.position[1] === oppositeBranch);
    const oppositeStep = stepOf(lesson, 'opposite');
    if (oppositeStep?.name !== expectedOpposite.name) {
      fail(`${label}:對宮應為 ${expectedOpposite.name}，教學顯示 ${oppositeStep?.name}`);
    }

    // --- 三方四正 ---
    const expectedBranches = [0, 6, 4, 8].map((off) => shift(palace.position[1], off));
    if (JSON.stringify(lesson.highlightBranches) !== JSON.stringify(expectedBranches)) {
      fail(`${label}:三方四正地支應為 ${expectedBranches.join('/')}，教學為 ${lesson.highlightBranches.join('/')}`);
    }
    const triadMembers = stepOf(lesson, 'triad').members;
    if (triadMembers.length !== 4) fail(`${label}:三方四正應有 4 宮，實際 ${triadMembers.length}`);
    for (const member of triadMembers) {
      const real = ziWei.palaces.find((p) => p.name === member.name);
      if (JSON.stringify(member.stars) !== JSON.stringify(real.majorStars.map((s) => s.name))) {
        fail(`${label}:${member.name} 的主星與排盤結果不一致`);
      }
    }

    // --- 四化:來源、落點與層次 ---
    const mut = stepOf(lesson, 'mutagen');
    const expectPalaceFly = flyingOfStem(ziWei, palace.position[0]);
    if (mut.palace.length !== expectPalaceFly.length) fail(`${label}:宮干飛化條數不符`);
    for (const flight of mut.palace) {
      const match = expectPalaceFly.find((f) => f.star === flight.star && f.mutagen === flight.mutagen);
      if (!match) fail(`${label}:宮干飛化 ${flight.star}化${flight.mutagen} 不在引擎結果內`);
      else if (match.palaceName !== flight.landing) fail(`${label}:${flight.star}化${flight.mutagen} 落點應為 ${match.palaceName}`);
      else if (flight.landsHere !== (match.palaceName === palaceName)) fail(`${label}:${flight.star} 的 landsHere 標記錯誤`);
      if (!flight.sentence.includes(`宮干${palace.position[0]}`)) fail(`${label}:飛化句子沒有標出來源宮干`);
      if (!flight.sentence.includes(`落入${flight.landing}`)) fail(`${label}:飛化句子沒有標出落點`);
    }

    const expectedBirth = palace.majorStars.filter((s) => s.transformation);
    if (mut.birth.length !== expectedBirth.length) fail(`${label}:生年四化條數不符`);
    for (const item of mut.birth) {
      if (item.layer !== 'birth') fail(`${label}:生年四化的層次標記錯誤`);
      if (!item.sentence.includes('生年四化（一輩子）')) fail(`${label}:生年四化句子沒有標出層次`);
    }
    for (const item of mut.decadal) {
      if (item.layer !== 'decadal') fail(`${label}:大限四化層次標記錯誤`);
      if (!item.sentence.includes('大限四化（這十年）')) fail(`${label}:大限四化句子沒有標出層次`);
    }
    for (const item of mut.annual) {
      if (item.layer !== 'annual') fail(`${label}:流年四化層次標記錯誤`);
      if (!item.sentence.includes('流年四化（這一年）')) fail(`${label}:流年四化句子沒有標出層次`);
    }
    // 三層不得互相污染:大限用大限干、流年用流年干
    const expectDecadal = flyingOfStem(ziWei, majorLimit.ganZhi[0]).map((f) => `${f.star}${f.mutagen}${f.palaceName}`).sort();
    const gotDecadal = mut.decadal.map((f) => `${f.star}${f.mutagen}${f.landing}`).sort();
    if (JSON.stringify(expectDecadal) !== JSON.stringify(gotDecadal)) fail(`${label}:大限四化與大限干 ${majorLimit.ganZhi[0]} 的計算結果不一致`);
    const expectAnnual = flyingOfStem(ziWei, stemOfYear(testCase.year)).map((f) => `${f.star}${f.mutagen}${f.palaceName}`).sort();
    const gotAnnual = mut.annual.map((f) => `${f.star}${f.mutagen}${f.landing}`).sort();
    if (JSON.stringify(expectAnnual) !== JSON.stringify(gotAnnual)) fail(`${label}:流年四化與 ${testCase.year} 年干的計算結果不一致`);

    // --- 自化:沿用引擎結果,不得自行判斷 ---
    const expectSelf = selfT[palaceName];
    if ((expectSelf?.outgoing ?? []).length !== mut.selfOutgoing.length) fail(`${label}:離心自化條數不符`);
    if ((expectSelf?.incoming ?? []).length !== mut.selfIncoming.length) fail(`${label}:向心自化條數不符`);
    for (const item of mut.selfOutgoing) {
      if (!item.sentence.includes('離心自化↓')) fail(`${label}:離心自化句子沒有標出方向`);
    }
    for (const item of mut.selfIncoming) {
      if (!item.sentence.includes('向心自化↑')) fail(`${label}:向心自化句子沒有標出方向`);
    }

    // --- 身宮/來因宮標記 ---
    if (lesson.isBodyPalace !== Boolean(palace.isBodyPalace)) fail(`${label}:身宮標記與排盤結果不符`);

    // --- 證據鏈:不得重複計算 ---
    const chain = lesson.evidence;
    const allKeys = [...chain.primary, ...chain.supporting, ...chain.unused].map((e) => e.key);
    if (new Set(allKeys).size !== allKeys.length) fail(`${label}:證據鏈出現重複的項目`);
    const allTexts = [...chain.primary, ...chain.supporting].map((e) => e.text);
    if (new Set(allTexts).size !== allTexts.length) fail(`${label}:主要與輔助依據出現一字不差的重複句`);
    if (!chain.primary.length) fail(`${label}:沒有任何主要依據`);
    for (const key of ['observed', 'interaction', 'behavior', 'pending']) {
      if (!chain.conclusion[key] || chain.conclusion[key].length < 8) fail(`${label}:結論的「${key}」段落是空的`);
    }
    if (!chain.limits.length) fail(`${label}:沒有列出判讀限制`);

    // --- 措辭:不得寫成確定會發生的事 ---
    const publicText = [chain.conclusion.behavior, chain.conclusion.pending].join('');
    for (const word of ['一定會', '必定', '肯定會', '絕對']) {
      if (publicText.includes(word)) fail(`${label}:結論出現斷定語氣「${word}」`);
    }
    if (!/可能|較容易|比較|傾向/.test(chain.conclusion.behavior)) fail(`${label}:結論沒有使用保留語氣`);

    // --- 內部欄位不得外洩到前台文案 ---
    for (const banned of ['undefined', 'null', 'templateKey', 'reason:', 'landsHere', '[object']) {
      const joined = [...allTexts, ...Object.values(chain.conclusion)].join('');
      if (joined.includes(banned)) fail(`${label}:前台文案混入內部字串「${banned}」`);
    }

    // --- 練習題:答案必須在選項內,且可由盤面驗證 ---
    const quiz = buildPalaceQuiz(lesson, ziWei);
    if (!quiz.length) fail(`${label}:沒有產生任何練習題`);
    for (const question of quiz) {
      if (!question.options.includes(question.answer)) fail(`${label}:第「${question.id}」題的正確答案不在選項內`);
      if (new Set(question.options).size !== question.options.length) fail(`${label}:第「${question.id}」題有重複選項`);
      if (question.options.length < 2) fail(`${label}:第「${question.id}」題選項不足`);
      if (!question.explain) fail(`${label}:第「${question.id}」題沒有解釋`);
    }
    const emptyQuestion = quiz.find((q) => q.id === 'is-empty');
    if (emptyQuestion && emptyQuestion.answer.startsWith('是') !== expectedEmpty) {
      fail(`${label}:空宮題的答案與排盤結果不符`);
    }
    const oppositeQuestion = quiz.find((q) => q.id === 'opposite');
    if (oppositeQuestion && oppositeQuestion.answer !== expectedOpposite.name) {
      fail(`${label}:對宮題的答案與排盤結果不符`);
    }
  }

  lessonsByCase.set(testCase.id, { ziWei, lessons, testCase });

  // 案例宣稱涵蓋的情境要真的成立,否則 fixture 已經失去意義
  const covers = testCase.covers.join('、');
  const lifePalace = ziWei.palaces.find((p) => p.name === '命宮');
  if (covers.includes('命宮無主星') && lifePalace.majorStars.length) fail(`${testCase.id}:fixture 宣稱命宮空宮，實際有主星`);
  if (covers.includes('命宮有主星') && !lifePalace.majorStars.length) fail(`${testCase.id}:fixture 宣稱命宮有主星，實際是空宮`);
  if (covers.includes('身宮與命宮同宮') && ziWei.bodyPalace !== ziWei.lifePalace) fail(`${testCase.id}:fixture 宣稱身命同宮，實際不同宮`);
  if (covers.includes('身宮落在其他宮位') && ziWei.bodyPalace === ziWei.lifePalace) fail(`${testCase.id}:fixture 宣稱身宮另落一宮，實際同宮`);
  if (covers.includes('有向心自化') && !Object.values(selfT).some((r) => r.incoming.length)) fail(`${testCase.id}:fixture 宣稱有向心自化，實際沒有`);
  if (covers.includes('有離心自化') && !Object.values(selfT).some((r) => r.outgoing.length)) fail(`${testCase.id}:fixture 宣稱有離心自化，實際沒有`);
}
ok('逐步判讀:空宮、對宮、三方四正、飛化來源與落點、四化層次、自化方向全部與排盤引擎一致');
ok('證據鏈:沒有重複計算，結論四段齊備，措辭保留不確定性');
ok('練習題:答案可由盤面驗證，選項無重複');

// ---------- 2. 三層四化不得混淆(跨案例交叉比對) ----------
for (const [id, { lessons }] of lessonsByCase) {
  for (const palaceName of PALACE_ORDER) {
    const mut = stepOf(lessons[palaceName], 'mutagen');
    const layers = new Set([
      ...mut.birth.map((f) => f.layer),
      ...mut.palace.map((f) => f.layer),
      ...mut.decadal.map((f) => f.layer),
      ...mut.annual.map((f) => f.layer),
    ]);
    for (const layer of layers) {
      if (!['birth', 'palace', 'decadal', 'annual'].includes(layer)) fail(`${id}/${palaceName}:出現未知的四化層次 ${layer}`);
    }
    // 生年四化只能出現在本宮主星上;若某條生年四化的落點不是本宮,代表分層錯了
    for (const item of mut.birth) {
      if (item.landing !== palaceName) fail(`${id}/${palaceName}:生年四化的落點被標成 ${item.landing}`);
    }
  }
}
ok('四化三層(本命／大限／流年)標籤沒有互相混淆');

// ---------- 3. 切換命盤後不得殘留上一張命盤的內容 ----------
{
  const a = lessonsByCase.get('life-with-stars');
  const b = lessonsByCase.get('life-empty');
  const starsOf = (entry) => new Set(entry.ziWei.palaces.flatMap((p) => p.majorStars.map((s) => s.name)));
  const onlyInA = [...starsOf(a)].filter((s) => !starsOf(b).has(s));
  const textOfB = PALACE_ORDER.flatMap((name) => {
    const chain = b.lessons[name].evidence;
    return [...chain.primary, ...chain.supporting, ...chain.unused].map((e) => e.text)
      .concat(Object.values(chain.conclusion));
  }).join('');
  const leaked = onlyInA.filter((star) => textOfB.includes(star));
  if (leaked.length) fail(`切換命盤後仍出現只屬於前一張命盤的星曜:${leaked.join('、')}`);
  // 位置資訊也要換掉
  const lifeA = a.lessons.命宮.position;
  const lifeB = b.lessons.命宮.position;
  if (lifeA === lifeB) fail('兩張測試命盤的命宮位置相同，這組對照失去意義');
  if (textOfB.includes(lifeA)) fail(`切換命盤後仍出現前一張命盤的命宮干支 ${lifeA}`);
}
ok('切換命盤後不殘留上一張命盤的星曜與宮位資料');

// ---------- 4. 學習進度:依命盤分開存、可重設、重新讀取後仍在 ----------
{
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const inputA = fixture.cases[0].input;
  const inputB = fixture.cases[1].input;
  const keyA = chartKeyOf(inputA);
  const keyB = chartKeyOf(inputB);

  if (keyA === keyB) fail('不同命盤產生了相同的進度識別碼');
  if (chartKeyOf(inputA) !== keyA) fail('同一組生辰兩次產生的識別碼不一致');
  if (/\d{4}/.test(keyA)) fail('進度識別碼疑似直接包含出生年份');

  for (const stepId of ['self', 'opposite', 'triad', 'mutagen', 'synthesis']) {
    markStepRead(storage, keyA, '命宮', stepId);
  }
  markStepRead(storage, keyA, '財帛宮', 'self');
  recordQuizAnswer(storage, keyA, '命宮', 'opposite', true);
  recordQuizAnswer(storage, keyA, '命宮', 'triad', false);

  const entryA = loadProgress(storage, keyA);
  if (!isPalaceComplete(entryA, '命宮')) fail('五個步驟都讀過的宮位沒有被算成完成');
  if (isPalaceComplete(entryA, '財帛宮')) fail('只讀一步的宮位被誤算成完成');

  const summary = progressSummary(entryA);
  if (summary.label !== '十二宮學習進度：1／12') fail(`進度標籤錯誤:${summary.label}`);
  if (summary.quizAnswered !== 2 || summary.quizCorrect !== 1) fail('練習答對統計錯誤');
  if (summary.lastPalace !== '命宮') fail('最後學習的宮位記錄錯誤');

  const entryB = loadProgress(storage, keyB);
  if (Object.keys(entryB.palaces).length) fail('另一張命盤讀到了上一張命盤的進度');

  // 重新從同一份儲存體讀出來,進度必須還在(等同重新整理頁面)
  const reread = loadProgress(storage, keyA);
  if (!isPalaceComplete(reread, '命宮')) fail('重新讀取後進度消失');

  if (nextPalaceToLearn(reread) !== '兄弟宮') fail(`「繼續上次學習」應指向下一個未完成的宮位，實際為 ${nextPalaceToLearn(reread)}`);

  resetProgress(storage, keyA);
  const afterReset = loadProgress(storage, keyA);
  if (Object.keys(afterReset.palaces).length || afterReset.lastPalace) fail('重設後仍留有進度資料');
  if (!isPalaceComplete(loadProgress(storage, keyB), '命宮') === false) { /* keyB 本來就沒有資料,略過 */ }

  // 儲存體壞掉(無痕模式)時不得丟例外
  const brokenStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  try {
    markStepRead(brokenStorage, keyA, '命宮', 'self');
    loadProgress(brokenStorage, keyA);
    progressSummary(loadProgress(brokenStorage, keyA));
  } catch (err) {
    fail(`儲存體不可用時丟出例外:${err.message}`);
  }

  // 損壞的 JSON 也要能安全略過
  store.set('zwbz-learning-progress', '{壞掉的資料');
  const recovered = loadProgress(storage, keyA);
  if (Object.keys(recovered.palaces).length) fail('損壞的進度資料沒有被安全忽略');
}
ok('學習進度:依命盤分開儲存、可重設、重新讀取仍在、儲存體異常不會壞掉');

// ---------- 5. 步驟序號不得跳號、來源不得指向看不到的步驟 ----------
// 使用者回報初階讀到「第一步、第二步、第五步」——序號當時寫死在資料裡，
// 初階濾掉三方四正與四化之後就跳號了。這一節守住兩件事：
//   a. 序號一律由顯示順序重新編，任何階段都是連續的 1..n。
//   b. 結論裡「← 第 N 步」標的來源，那一步必須在當前階段真的看得到。
{
  if (LESSON_STEPS.some((step) => /第[一二三四五]步/.test(step.name))) {
    fail('LESSON_STEPS 的 name 又把序號寫死了，切階段後會跳號');
  }

  for (const level of LEARNING_LEVELS) {
    const visible = LESSON_STEPS.filter((step) => level.steps.includes(step.id));
    if (visible.length !== level.steps.length) {
      fail(`${level.label} 的 steps 有對不到 LESSON_STEPS 的 id`);
    }
    const titles = visible.map((step, index) => `${stepOrdinal(index)}：${step.name}`);
    const expected = ['第一步', '第二步', '第三步', '第四步', '第五步'].slice(0, visible.length);
    expected.forEach((prefix, index) => {
      if (!titles[index].startsWith(prefix)) {
        fail(`${level.label} 第 ${index + 1} 個步驟顯示成「${titles[index]}」，序號跳號了`);
      }
    });
  }

  const ziWei = convertToZiWei(fixture.cases[0].input);
  const stepIds = new Set(LESSON_STEPS.map((s) => s.id));
  let orphan = 0;
  let hidden = 0;
  for (const palaceName of PALACE_ORDER) {
    const lesson = buildPalaceLesson({ ziWei, palaceName });
    for (const item of lesson.evidence.interactionSteps ?? []) {
      if (typeof item.source !== 'object' || !item.source?.step) {
        orphan++;
        fail(`${palaceName} 的推導來源不是 { step, label }：${JSON.stringify(item.source)}`);
        continue;
      }
      if (!stepIds.has(item.source.step)) {
        orphan++;
        fail(`${palaceName} 的推導來源指向不存在的步驟 ${item.source.step}`);
      }
      // 初階看不到的步驟，畫面會整句濾掉；這裡只確認來源本身是可解析的步驟 id，
      // 濾除行為由 smoke 測試在 DOM 上驗。
      const basic = LEARNING_LEVELS[0];
      if (!basic.steps.includes(item.source.step)) hidden++;
    }
  }
  if (!orphan) ok(`推導來源都指向真實步驟（初階會濾掉其中 ${hidden} 句指向未顯示步驟的推導）`);
}

// ---------- 6. 大限／流年四化必須分出「落在本宮」與「落在別宮」 ----------
// 使用者回報：大限四化跟流年四化在每個宮位都顯示一樣的東西，懷疑是 bug。
// 資料沒錯——那四條由大限天干／流年天干決定，本來就是這十年、這一年共通的；
// 錯在呈現，把四條全部平鋪，讀者看不出哪一條跟他正在讀的這一宮有關。
// 這一節守住兩件事：landsHere 標記正確，以及它真的區分得出宮位。
{
  const ziWei = convertToZiWei(fixture.cases[0].input);
  const limit = ziWei.majorLimits[4];
  const signatures = new Set();
  let hereTotal = 0;
  for (const palaceName of PALACE_ORDER) {
    const lesson = buildPalaceLesson({ ziWei, palaceName, year: 2026, majorLimit: limit });
    const mutagen = lesson.steps.find((s) => s.id === 'mutagen').data;

    if (mutagen.palaceName !== palaceName) fail(`${palaceName} 的四化步驟沒有帶上宮名，畫面無法分組`);

    for (const layer of ['decadal', 'annual']) {
      for (const flight of mutagen[layer]) {
        const expected = flight.landing === palaceName;
        if (flight.landsHere !== expected) {
          fail(`${palaceName} 的${layer}四化 ${flight.star}化${flight.mutagen} landsHere 標錯（落點 ${flight.landing}）`);
        }
      }
    }
    hereTotal += mutagen.decadal.filter((f) => f.landsHere).length;
    signatures.add(mutagen.decadal.map((f) => `${f.star}${f.mutagen}${f.landsHere ? '★' : ''}`).join(','));
  }
  // 十二宮的大限四化「內容」相同是對的（那四條本來就是這十年共通的），
  // 但「落在本宮」的標記必須讓十二宮的呈現長得不一樣。
  // 四條四化最多落在四個宮位，所以分組結果至少會有「有落點」與「沒落點」兩種以上。
  if (signatures.size < 3) {
    fail(`十二宮的大限四化分組結果只有 ${signatures.size} 種，落點標記沒有發揮作用`);
  }
  if (hereTotal !== 4) fail(`大限四化落在本宮的總數是 ${hereTotal}，應該剛好等於四條四化各落一宮`);
  else ok(`大限／流年四化有標出落在本宮的那幾條（四條各落一宮，分組結果 ${signatures.size} 種）`);
}

// ---------- 7. 練習題不能十二宮出同一份 ----------
// 使用者回報：「幾乎每個宮位的學習問題都一樣，一套做下來感覺是複習了十二次」。
// 通則題（判讀順序、雜曜的角色）答案跟宮位無關，基本功題（本宮主星、對宮）題型一字不差。
// 現在兩者都會隨著答對次數退場，名額讓給這一宮才有的題目。
{
  const ziWei = convertToZiWei(fixture.cases[0].input);
  const limit = ziWei.majorLimits[4];

  // 模擬一路答對走完十二宮，記錄每一宮實際出到的題目
  const mastery = new Map();
  const perPalace = [];
  for (const palaceName of PALACE_ORDER) {
    const lesson = buildPalaceLesson({ ziWei, palaceName, year: 2026, majorLimit: limit });
    const questions = buildPalaceQuiz(lesson, ziWei, { mastery });
    perPalace.push({ palaceName, questions });
    for (const q of questions) mastery.set(q.id, (mastery.get(q.id) ?? 0) + 1);
  }

  if (perPalace.some(({ questions }) => !questions.length)) {
    fail('有宮位一題都出不出來，練習區會變成空的');
  }

  // 通則題最多只能出現一次
  for (const id of ['reading-order', 'minor-priority', 'malefic-rule', 'double-star']) {
    const times = perPalace.filter(({ questions }) => questions.some((q) => q.id === id)).length;
    if (times > 1) fail(`通則題 ${id} 出現在 ${times} 個宮位，答對一次就該退場`);
  }

  // 基本功題最多三次
  for (const id of ['self-stars', 'opposite', 'triad', 'is-empty']) {
    const times = perPalace.filter(({ questions }) => questions.some((q) => q.id === id)).length;
    if (times > 3) fail(`基本功題 ${id} 出現在 ${times} 個宮位，超過三次就變成抄寫練習`);
  }

  // 後半段必須以「這一宮才有」的題目為主。
  // 不要求百分之百，因為有些通則題要等到遇得到那個結構才會第一次出現
  // （例如雙星怎麼讀，只有雙星同宮的宮位才有），那是第一次出現，不是重複。
  const later = perPalace.slice(6);
  for (const { palaceName, questions } of later) {
    const repeats = questions.filter((q) => q.kind !== 'chart').length;
    if (repeats > 1) fail(`${palaceName} 仍有 ${repeats} 題基本功／通則題，重複感沒有解決`);
  }
  const chartRatio = later.flatMap(({ questions }) => questions).filter((q) => q.kind === 'chart').length
    / later.flatMap(({ questions }) => questions).length;
  if (chartRatio < 0.8) fail(`後六宮只有 ${Math.round(chartRatio * 100)}% 是這一宮專屬的題目`);

  // 十二宮的題目組合不得全部相同
  const combos = new Set(perPalace.map(({ questions }) => questions.map((q) => q.id).sort().join(',')));
  if (combos.size < 4) fail(`十二宮的題目組合只有 ${combos.size} 種，還是像複習十二次`);
  else ok(`練習題不重複：十二宮共 ${combos.size} 種組合，第七宮之後只出這一宮才有的題目`);

  // quizMastery 要能從真實的進度結構算出次數（畫面就是靠它決定出哪些題）
  const entry = { palaces: { 命宮: { steps: [], quiz: { 'reading-order': true, 'self-stars': false } },
    兄弟宮: { steps: [], quiz: { 'reading-order': true } } } };
  const counts = quizMastery(entry);
  if (counts.get('reading-order') !== 2) fail('quizMastery 沒有正確累計答對次數');
  if (counts.has('self-stars')) fail('quizMastery 把答錯的也算進去了');
}

// ---------- 8. triadOf 對所有宮位都要回傳四宮 ----------
{
  const ziWei = convertToZiWei(fixture.cases[0].input);
  for (const palaceName of PALACE_ORDER) {
    const triad = triadOf(ziWei, palaceName);
    if (!triad || triad.members.length !== 4) fail(`triadOf(${palaceName}) 沒有回傳四個宮位`);
    if (new Set(triad.branches).size !== 4) fail(`triadOf(${palaceName}) 出現重複地支`);
  }
  if (triadOf(ziWei, '不存在的宮')) fail('triadOf 對不存在的宮位應回傳 null');
  if (buildPalaceLesson({ ziWei, palaceName: '不存在的宮' })) fail('buildPalaceLesson 對不存在的宮位應回傳 null');
}
ok('三方四正輔助函式對十二宮與異常輸入都正確');

console.log(failed
  ? `\n${failed} 項失敗 ❌`
  : `\n${fixture.cases.length} 張學習模式 Golden Charts × 12 宮全部通過 ✅`);
process.exit(failed ? 1 : 0);

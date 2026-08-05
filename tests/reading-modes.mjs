// tests/reading-modes.mjs — 兩段式閱讀模式的界線測試
//
// 這支測試的由來：使用者截圖指出「明明都是白話模式，呈現出來的東西不一樣」，
// 而且「學習模式和專業模式在各個頁面都沒差別」。追下去是兩個獨立的問題：
//
//   1. learn 在組裝解讀文字時等同 public（見改版前的 composerMode），
//      所以除了命盤總覽有教學區以外，學習模式和白話模式產出的文字一模一樣。
//   2.「專業命理依據」那塊不看模式、照常渲染，所以白話模式反而混進了
//      廟旺、四化、十神這些術語——白話模式沒有做到它承諾的事。
//
// 併成兩段之後，界線只有一條，這支測試就是守它：
//   白話模式 → 全站不出現命理術語
//   學習模式 → 術語可以出現，但每一塊都要能說出它從命盤哪裡來
//
// 這裡驗的是引擎層的產出（畫面層由 smoke.mjs 驗），兩邊合起來才完整。
//
// 執行：node tests/reading-modes.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { convertToBaZi } from '../src/engines/bazi.js';
import { composeZiWeiLuck, composeBaZiLuck } from '../src/engines/compose-luck.js';
import { composeElementAnalysis } from '../src/engines/compose-elements.js';
import { generatePlainZiweiTopics, generatePlainBaziTopics } from '../src/engines/compose-plain.js';
import { composeChartReading } from '../src/engines/compose.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/learning-mode-charts.json', import.meta.url), 'utf8'));

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

// 白話模式絕對不能出現的字。這份清單刻意包含使用者截圖裡真的看到的那幾個
// （「亮度是」「廟」「旺」「化忌」），以免同樣的東西再漏回白話面板。
const JARGON = ['亮度是', '廟旺', '落陷', '化祿', '化權', '化科', '化忌', '自化', '宮干',
  '三方四正', '借對宮', '日主', '十神', '喜用神', '納音', '藏干', '來因宮'];

const collect = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collect(v, out));
  return out;
};

// ---------- 1. 白話模式的產出不得含術語 ----------
{
  const hits = [];
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    const baZi = convertToBaZi(testCase.input);
    const zwLuck = composeZiWeiLuck(ziWei, { mode: 'public' });
    const bzLuck = composeBaZiLuck(baZi, { mode: 'public' });
    const elements = composeElementAnalysis(baZi.fiveElementDistribution);

    // technical 與 evidence 這兩個欄位本來就是「依據」，只會在學習模式被讀取，
    // 白話面板從不渲染它們，所以不列入這一節的檢查範圍。
    // 檢查的是白話模式下真的會出現在畫面上的那些字。
    const strip = (cards) => cards.map(({ technical, evidence, ...rest }) => rest);
    const texts = [
      ...collect(strip(generatePlainZiweiTopics(ziWei, zwLuck))),
      ...collect(strip(generatePlainBaziTopics(baZi, bzLuck, elements))),
      ...collect(composeChartReading(ziWei, { mode: 'public' }).palaces.map(({ technical, ...r }) => r)),
    ];
    for (const text of texts) {
      const found = JARGON.filter((w) => text.includes(w));
      if (found.length) hits.push(`${testCase.id ?? ''}「${text.slice(0, 30)}」含 ${found.join('、')}`);
    }
  }
  if (hits.length) fail(`白話模式產出含術語 ${hits.length} 處：${hits.slice(0, 4).join('；')}`);
  else ok(`白話模式：${fixture.cases.length} 張命盤的白話產出完全不含命理術語`);
}

// ---------- 2. 學習模式必須真的比白話模式多東西 ----------
// 改版前 learn 等同 public，這一節就是為了讓那個 bug 不可能再悄悄回來：
// 只要有人把 composerMode 改回「learn 對應 public」，兩份產出會變成完全相同，這裡就會紅。
{
  let identical = 0;
  let richer = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    const pub = JSON.stringify(composeChartReading(ziWei, { mode: 'public' }));
    const learn = JSON.stringify(composeChartReading(ziWei, { mode: 'study' }));
    if (pub === learn) identical++;
    else if (learn.length > pub.length) richer++;
  }
  if (identical) fail(`${identical} 張命盤的學習模式產出與白話模式完全相同——學習模式等於沒有作用`);
  else if (richer !== fixture.cases.length) fail('學習模式的產出沒有比白話模式更完整');
  else ok(`學習模式：${richer} 張命盤的產出都比白話模式更完整，不是同一份東西換個名字`);
}

// ---------- 3. 學習模式的依據要能對回命盤 ----------
// 「有術語」不等於「教得會」。使用者的原話是要教會依據從哪裡來，
// 所以學習模式拿到的 technical.judgment 必須含有可以回命盤核對的具體標的
// （宮位名、星曜名或天干地支），不能只是形容詞。
{
  const PALACES = ['命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮',
    '遷移宮', '僕役宮', '官祿宮', '田宅宮', '福德宮', '父母宮'];
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  let vague = 0;
  let checked = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    const zwLuck = composeZiWeiLuck(ziWei, { mode: 'study' });
    for (const card of generatePlainZiweiTopics(ziWei, zwLuck)) {
      const judgment = card.technical?.judgment ?? '';
      if (!judgment) continue;
      checked++;
      const grounded = PALACES.some((p) => judgment.includes(p))
        || BRANCHES.some((b) => judgment.includes(b))
        || /[紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍]/.test(judgment);
      if (!grounded) {
        vague++;
        fail(`學習模式的依據無法對回命盤：「${judgment.slice(0, 40)}」`);
      }
    }
  }
  if (!checked) fail('沒有取到任何學習模式的依據，這一節等於沒驗到');
  else if (!vague) ok(`學習模式：${checked} 條依據都指得出命盤上的宮位、星曜或干支`);
}

console.log(failed ? `\n${failed} 項失敗 ❌` : '\n兩段式閱讀模式的界線全部守住 ✅');
process.exit(failed ? 1 : 0);

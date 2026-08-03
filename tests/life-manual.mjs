// tests/life-manual.mjs — 「人生說明書」回歸測試
//
// 完整報告開頭的敘事必須真的因人而異。最容易悄悄退化的地方是：
// 同一個大限落宮的兩個人讀到一模一樣的十年描述——那等於沒有依命盤產生。
// 這支測試守住四件事：
//   1. 階段文案覆蓋完整：12 宮 × 14 主星一格都不能少，缺一格就會退回通用句。
//   2. 真的個人化：同一個大限宮位、不同主星，內容必須不同。
//   3. 事實正確：階段對應的宮位、年份與大限一致，空宮借星要標示。
//   4. 文字品質：不用術語、不寫成必然、同一份報告裡沒有重複句。
//
// 執行：node tests/life-manual.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { buildLifeManual } from '../src/engines/life-manual.js';
import { similarityScore } from '../src/engines/text-quality.js';
import { PALACE_ORDER } from '../src/engines/learning-palace.js';

const stageDetails = JSON.parse(readFileSync(new URL('../src/data/life-stage-details.json', import.meta.url), 'utf8'))['階段'];
const STARS = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);
const compact = (value) => String(value ?? '').replace(/\s+/g, '');

// ---------- 1. 覆蓋完整 ----------
{
  const missing = [];
  for (const palace of PALACE_ORDER) {
    if (!stageDetails[palace]) { missing.push(`${palace}（整宮缺漏）`); continue; }
    for (const star of STARS) if (!stageDetails[palace][star]) missing.push(`${palace}/${star}`);
  }
  const extra = Object.keys(stageDetails).filter((name) => !PALACE_ORDER.includes(name));
  if (missing.length) fail(`階段文案缺漏 ${missing.length} 格：${missing.slice(0, 6).join('、')}${missing.length > 6 ? '…' : ''}`);
  if (extra.length) fail(`階段文案出現不存在的宮位：${extra.join('、')}`);
  if (!missing.length && !extra.length) {
    ok(`階段文案覆蓋完整：${PALACE_ORDER.length} 宮 × ${STARS.length} 主星 = ${PALACE_ORDER.length * STARS.length} 組`);
  }
}

// ---------- 2. 真的個人化 ----------
{
  const duplicates = [];
  for (const palace of PALACE_ORDER) {
    const table = stageDetails[palace] ?? {};
    for (let i = 0; i < STARS.length; i++) {
      for (let j = i + 1; j < STARS.length; j++) {
        const a = table[STARS[i]];
        const b = table[STARS[j]];
        if (a && b && similarityScore(compact(a), compact(b)) > 0.72) {
          duplicates.push(`${palace}：${STARS[i]} ≈ ${STARS[j]}`);
        }
      }
    }
  }
  // 同一顆主星在不同宮位也該講不同的事（破軍在夫妻宮與在田宅宮不會是同一段人生）
  const acrossPalace = [];
  for (const star of STARS) {
    for (let i = 0; i < PALACE_ORDER.length; i++) {
      for (let j = i + 1; j < PALACE_ORDER.length; j++) {
        const a = stageDetails[PALACE_ORDER[i]]?.[star];
        const b = stageDetails[PALACE_ORDER[j]]?.[star];
        if (a && b && similarityScore(compact(a), compact(b)) > 0.72) {
          acrossPalace.push(`${star}：${PALACE_ORDER[i]} ≈ ${PALACE_ORDER[j]}`);
        }
      }
    }
  }
  if (duplicates.length) fail(`同一宮位有主星文案雷同：${duplicates.slice(0, 5).join('、')}${duplicates.length > 5 ? `…共 ${duplicates.length} 組` : ''}`);
  if (acrossPalace.length) fail(`同一主星跨宮位文案雷同：${acrossPalace.slice(0, 5).join('、')}${acrossPalace.length > 5 ? `…共 ${acrossPalace.length} 組` : ''}`);
  if (!duplicates.length && !acrossPalace.length) ok('每一格文案彼此有足夠差異：換宮位或換主星，讀到的都不一樣');
}

// ---------- 3. 文字品質 ----------
{
  const BANNED = ['化祿', '化權', '化科', '化忌', '喜用神', '忌神', '廟旺', '落陷', '借星', '來因宮', '自化', '宮干', '藏干', '納音', '三方四正'];
  const ABSOLUTE = ['一定會', '必定', '肯定會', '絕對會', '注定'];
  const NEGATIVE = ['不低', '不差', '不算少', '並非不', '不是不'];
  const issues = [];
  for (const palace of PALACE_ORDER) {
    for (const star of STARS) {
      const text = compact(stageDetails[palace]?.[star]);
      if (!text) continue;
      const where = `${palace}/${star}`;
      // 「七殺」寫成「七殺星」時指的是紫微主星，這裡的文案不需要提到星名，一律不得出現
      const jargon = BANNED.filter((term) => text.includes(term));
      if (jargon.length) issues.push(`${where} 使用術語（${jargon.join('、')}）`);
      const absolute = ABSOLUTE.filter((term) => text.includes(term));
      if (absolute.length) issues.push(`${where} 寫成必然（${absolute.join('、')}）`);
      const negative = NEGATIVE.filter((term) => text.includes(term));
      if (negative.length) issues.push(`${where} 使用雙重否定（${negative.join('、')}）`);
      if (text.length < 20) issues.push(`${where} 過短（${text.length} 字）`);
      if (text.length > 90) issues.push(`${where} 過長（${text.length} 字）`);
      if (!text.includes('你')) issues.push(`${where} 沒有對讀者說話`);
    }
  }
  if (issues.length) fail(`文字品質：${issues.slice(0, 6).join('；')}${issues.length > 6 ? `…共 ${issues.length} 項` : ''}`);
  else ok('文字品質檢查通過：無術語、無斷定語氣、無雙重否定、長度合理');
}

// ---------- 4. 端到端：實際命盤的說明書 ----------
{
  const charts = [
    { id: 'A', input: { year: 2002, month: 9, day: 4, hour: 13, gender: 'female' } },
    { id: 'B', input: { year: 1978, month: 2, day: 21, hour: 3, gender: 'female' } },
    { id: 'C', input: { year: 1998, month: 6, day: 21, hour: 19, gender: 'male' } },
    { id: 'D', input: { year: 1965, month: 7, day: 28, hour: 23, gender: 'male' } },
  ];
  const currentYear = 2026;
  const stageTexts = new Map();

  for (const chart of charts) {
    const ziWei = convertToZiWei(chart.input);
    const manual = buildLifeManual({ ziWei, birthYear: chart.input.year, currentYear });
    if (!manual) { fail(`${chart.id} 無法產生說明書`); continue; }

    if (!manual.opening.length) fail(`${chart.id} 開場段落是空的`);
    if (manual.stages.length !== ziWei.majorLimits.length) fail(`${chart.id} 階段數與大限數不符`);
    if (!manual.currentStage) fail(`${chart.id} 找不到現在所在的階段`);
    if (manual.stages.filter((s) => s.current).length !== 1) fail(`${chart.id} 現在所在的階段不是唯一一段`);

    const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
    for (const stage of manual.stages) {
      const where = `${chart.id}/${stage.ageRange}`;
      // 階段對應的宮位必須真的是大限地支落到的那一宮
      const expected = byBranch[stage.ganZhi[1]];
      if (expected?.name !== stage.palaceName) fail(`${where} 宮位應為 ${expected?.name}，實際 ${stage.palaceName}`);
      // 年份換算：虛歲 n 對應出生年 + n - 1
      if (stage.startYear !== chart.input.year + stage.startAge - 1) fail(`${where} 起始年份換算錯誤`);
      if (stage.endYear !== chart.input.year + stage.endAge - 1) fail(`${where} 結束年份換算錯誤`);
      if (!stage.paragraphs.length) fail(`${where} 沒有內容`);

      // 空宮借星必須誠實標示，不能默默把對宮的主星當成本宮的
      const palace = expected;
      const borrowed = palace && palace.majorStars.length === 0;
      const bodyText = stage.paragraphs.join('');
      if (borrowed && !bodyText.includes('借對宮')) fail(`${where} 是空宮卻沒有標示借星`);
      if (!borrowed && bodyText.includes('借對宮')) fail(`${where} 有主星卻標示成借星`);

      // 內容必須真的來自這一宮這一顆星，而不是退回通用句
      const lead = palace?.majorStars?.[0]?.name
        ?? byBranch[BRANCHES[(BRANCHES.indexOf(palace.position[1]) + 6) % 12]]?.majorStars?.[0]?.name;
      if (lead) {
        const detail = compact(stageDetails[stage.palaceName]?.[lead]);
        if (detail && !compact(bodyText).includes(detail.slice(0, 14))) {
          fail(`${where} 沒有用到 ${stage.palaceName}/${lead} 的階段文案`);
        }
        const key = `${stage.palaceName}|${lead}`;
        if (!stageTexts.has(key)) stageTexts.set(key, new Set());
        stageTexts.get(key).add(compact(bodyText));
      }
    }

    // 轉折點：數量、年份遞增、收尾句不重複
    const turns = manual.turningPoints;
    if (turns.length !== ziWei.majorLimits.length - 1) fail(`${chart.id} 轉折點數量不符`);
    for (let i = 1; i < turns.length; i++) {
      if (turns[i].year <= turns[i - 1].year) fail(`${chart.id} 轉折點年份沒有遞增`);
    }
    const closers = turns.map((t) => t.body);
    if (closers.length !== new Set(closers).size) fail(`${chart.id} 轉折點出現一字不差的重複句`);

    // 課題不得重複
    const themeBodies = manual.themes.map((t) => t.body);
    if (themeBodies.length !== new Set(themeBodies).size) fail(`${chart.id} 反覆課題出現重複句`);

    // 整份說明書不得出現術語（術語資料留在收合的專業依據）
    const wholeText = [...manual.opening, ...manual.stages.flatMap((s) => s.paragraphs),
      ...manual.themes.map((t) => t.body), ...turns.map((t) => t.body)].join('');
    for (const term of ['化祿', '化權', '化科', '化忌', '喜用神', '宮干', '自化']) {
      if (wholeText.includes(term)) fail(`${chart.id} 說明書出現術語：${term}`);
    }
    if (/七殺(?!星)/.test(wholeText)) fail(`${chart.id} 說明書出現未加「星」的七殺，會被讀成八字十神`);
    if (wholeText.includes('身宮') && !wholeText.includes('命理上稱為身宮')) {
      fail(`${chart.id} 提到身宮卻沒有白話說明`);
    }
  }

  // 同一組（宮位 × 主星）在不同命盤上應該產生一致的敘述，代表內容真的由命盤決定而非隨機
  for (const [key, texts] of stageTexts) {
    if (texts.size > 1) fail(`${key} 在不同命盤上產生了不一致的敘述`);
  }
  ok(`${charts.length} 張命盤端到端驗證通過：宮位、年份換算、借星標示與內容來源都正確`);
}

// ---------- 5. 不同命盤在同一年齡段必須讀到不同內容 ----------
{
  const a = convertToZiWei({ year: 2002, month: 9, day: 4, hour: 13, gender: 'female' });
  const b = convertToZiWei({ year: 2002, month: 9, day: 4, hour: 1, gender: 'female' });
  const manualA = buildLifeManual({ ziWei: a, birthYear: 2002, currentYear: 2026 });
  const manualB = buildLifeManual({ ziWei: b, birthYear: 2002, currentYear: 2026 });
  const textA = compact(manualA.currentStage.paragraphs.join(''));
  const textB = compact(manualB.currentStage.paragraphs.join(''));
  if (manualA.currentStage.palaceName === manualB.currentStage.palaceName
    && manualA.currentStage.paragraphs.join('') === manualB.currentStage.paragraphs.join('')) {
    // 同宮同主星時內容相同是正確的，只有在主星不同卻仍相同時才是問題
    const starA = a.palaces.find((p) => p.name === manualA.currentStage.palaceName)?.majorStars?.[0]?.name;
    const starB = b.palaces.find((p) => p.name === manualB.currentStage.palaceName)?.majorStars?.[0]?.name;
    if (starA !== starB) fail('兩張命盤主星不同，現在這一段卻讀到一模一樣的內容');
  }
  if (textA === textB && manualA.currentStage.palaceName !== manualB.currentStage.palaceName) {
    fail('兩張命盤大限落宮不同，內容卻完全相同');
  }
  ok('只差一個時辰的兩張命盤，現在這一段的敘述會依落宮與主星產生差異');
}

console.log(failed
  ? `\n共 ${failed} 項人生說明書問題 ❌`
  : `\n${PALACE_ORDER.length} 宮 × ${STARS.length} 主星階段文案，加上 4 張命盤端到端驗證全部通過 ✅`);
process.exit(failed ? 1 : 0);

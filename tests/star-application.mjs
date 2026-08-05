// tests/star-application.mjs — 星曜落宮應用資料的回歸測試
//
// 這份資料回答使用者最想知道的問題：「這顆星在我這一宮，可以怎麼發揮、要注意什麼」。
// 它同時餵給學習模式與命理小百科，所以最需要守住的是覆蓋率與一致性——
// 缺一格，就會有人在自己的命盤上點到空白。
//
// 執行：node tests/star-application.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { buildPalaceLesson } from '../src/engines/learning-palace.js';
import { similarityScore } from '../src/engines/text-quality.js';
import { PALACE_ORDER } from '../src/engines/learning-palace.js';
import { LEARNING_LEVELS } from '../src/data/learning-mode.js';

const app = JSON.parse(readFileSync(new URL('../src/data/star-palace-application.json', import.meta.url), 'utf8'));
const MAJOR = app['主星應用'];
const AUX = app['吉煞祿馬落宮'];
const MINOR = app['雜曜落宮'];
const GROUPS = app['宮位分類'];

const STARS = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
const AUX_STARS = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞', '擎羊', '陀羅', '火星', '鈴星', '地空', '地劫', '祿存', '天馬'];

let failed = 0;
const fail = (m) => { failed++; console.log(`❌ ${m}`); };
const ok = (m) => console.log(`✅ ${m}`);
const compact = (v) => String(v ?? '').replace(/\s+/g, '');

// ---------- 1. 覆蓋完整 ----------
{
  const missing = [];
  for (const palace of PALACE_ORDER) {
    for (const star of STARS) {
      const entry = MAJOR[palace]?.[star];
      if (!entry) { missing.push(`${palace}/${star}`); continue; }
      for (const field of ['發揮', '注意', '怎麼做']) {
        if (!entry[field]) missing.push(`${palace}/${star}/${field}`);
      }
    }
  }
  for (const star of AUX_STARS) {
    for (const palace of PALACE_ORDER) {
      if (!AUX[star]?.[palace]) missing.push(`${star}/${palace}`);
    }
  }
  const groupNames = Object.keys(GROUPS);
  for (const [star, table] of Object.entries(MINOR)) {
    for (const group of groupNames) if (!table[group]) missing.push(`${star}/${group}`);
  }
  if (missing.length) fail(`應用資料缺漏 ${missing.length} 格：${missing.slice(0, 6).join('、')}…`);
  else {
    ok(`覆蓋完整：主星 ${PALACE_ORDER.length}×${STARS.length}×3 = ${PALACE_ORDER.length * STARS.length * 3} 句、`
      + `吉煞祿馬 ${AUX_STARS.length}×12 = ${AUX_STARS.length * 12} 條、`
      + `雜曜 ${Object.keys(MINOR).length}×${groupNames.length} = ${Object.keys(MINOR).length * groupNames.length} 條`);
  }

  // 宮位分類必須剛好蓋滿十二宮且不重複，否則會有宮位查不到雜曜影響
  const covered = Object.values(GROUPS).flat();
  if (covered.length !== PALACE_ORDER.length || new Set(covered).size !== PALACE_ORDER.length) {
    fail(`宮位分類沒有剛好蓋滿十二宮：${covered.length} 個、去重後 ${new Set(covered).size} 個`);
  }
  const uncovered = PALACE_ORDER.filter((p) => !covered.includes(p));
  if (uncovered.length) fail(`這些宮位沒有被分類：${uncovered.join('、')}`);
}

// ---------- 2. 同一顆星在不同宮位要真的不同 ----------
{
  const dup = [];
  for (const star of STARS) {
    for (let i = 0; i < PALACE_ORDER.length; i++) {
      for (let j = i + 1; j < PALACE_ORDER.length; j++) {
        const a = MAJOR[PALACE_ORDER[i]]?.[star]?.['發揮'];
        const b = MAJOR[PALACE_ORDER[j]]?.[star]?.['發揮'];
        if (a && b && similarityScore(compact(a), compact(b)) > 0.72) {
          dup.push(`${star}：${PALACE_ORDER[i]} ≈ ${PALACE_ORDER[j]}`);
        }
      }
    }
  }
  // 同一宮位的不同主星也不能寫成同一套
  for (const palace of PALACE_ORDER) {
    for (let i = 0; i < STARS.length; i++) {
      for (let j = i + 1; j < STARS.length; j++) {
        const a = MAJOR[palace]?.[STARS[i]]?.['發揮'];
        const b = MAJOR[palace]?.[STARS[j]]?.['發揮'];
        if (a && b && similarityScore(compact(a), compact(b)) > 0.72) {
          dup.push(`${palace}：${STARS[i]} ≈ ${STARS[j]}`);
        }
      }
    }
  }
  if (dup.length) fail(`內容雷同：${dup.slice(0, 5).join('、')}${dup.length > 5 ? `…共 ${dup.length} 組` : ''}`);
  else ok('換宮位或換星曜，寫出來的內容都不一樣');
}

// ---------- 3. 文字品質 ----------
{
  const BANNED = ['化祿', '化權', '化科', '化忌', '喜用神', '宮干', '自化', '來因宮', '三方四正'];
  const ABSOLUTE = ['一定會', '必定', '肯定會', '絕對會', '注定'];
  const issues = [];
  const check = (where, text) => {
    const t = compact(text);
    const j = BANNED.filter((x) => t.includes(x));
    if (j.length) issues.push(`${where} 用了術語（${j.join('、')}）`);
    const a = ABSOLUTE.filter((x) => t.includes(x));
    if (a.length) issues.push(`${where} 寫成必然（${a.join('、')}）`);
    // 有些落宮影響本來就是一句話講完（「出外有貴人拔擢」），不必為了字數灌水；
    // 門檻設在能表達完整意思的最低限度即可。
    if (t.length < 10) issues.push(`${where} 過短（${t.length} 字）`);
    if (t.length > 90) issues.push(`${where} 過長（${t.length} 字）`);
  };
  for (const palace of PALACE_ORDER) {
    for (const star of STARS) {
      const e = MAJOR[palace]?.[star];
      if (!e) continue;
      for (const f of ['發揮', '注意', '怎麼做']) check(`${palace}/${star}/${f}`, e[f]);
    }
  }
  for (const [star, table] of Object.entries(AUX)) {
    for (const [palace, text] of Object.entries(table)) check(`${star}/${palace}`, text);
  }
  for (const [star, table] of Object.entries(MINOR)) {
    for (const [group, text] of Object.entries(table)) check(`${star}/${group}`, text);
  }
  if (issues.length) fail(`文字品質：${issues.slice(0, 6).join('；')}${issues.length > 6 ? `…共 ${issues.length} 項` : ''}`);
  else ok('文字品質通過：無術語、無斷定語氣、長度合理');
}

// ---------- 4. 分階設定正確 ----------
{
  const keys = LEARNING_LEVELS.map((l) => l.key);
  if (keys.join(',') !== 'basic,intermediate,advanced') fail(`階段順序不對：${keys.join(',')}`);
  const [basic, inter, advanced] = LEARNING_LEVELS;
  if (basic.steps.length >= inter.steps.length) fail('初階的步驟數應該少於進階');
  if (inter.steps.length !== advanced.steps.length) fail('進階與高級的步驟數應該相同，差別在內容深度');
  // 高級必須是最完整的：不能有任何一項在低階開著、高階關著
  for (const level of [basic, inter]) {
    for (const [flag, value] of Object.entries(level.show)) {
      if (value && !advanced.show[flag]) fail(`${level.label} 顯示了 ${flag}，高級卻沒有——階段應該是遞增的`);
    }
  }
  for (const [flag, value] of Object.entries(basic.show)) {
    if (value && !inter.show[flag]) fail(`初階顯示了 ${flag}，進階卻沒有——階段應該是遞增的`);
  }
  if (basic.show.flying || basic.show.selfMutagen) fail('初階不該出現飛化或自化');
  if (!advanced.show.flying || !advanced.show.selfMutagen) fail('高級必須包含飛化與自化');
  if (!basic.show.application) fail('初階就該給「這顆星怎麼發揮」，那是使用者最想看的');
  if (!failed) ok('三個階段的內容遞增，初階不碰飛化、高級最完整');
}

// ---------- 5. 端到端：實際命盤查得到 ----------
{
  const charts = [
    { year: 2002, month: 9, day: 4, hour: 13, gender: 'female' },
    { year: 1978, month: 2, day: 21, hour: 3, gender: 'female' },
    { year: 1998, month: 6, day: 21, hour: 19, gender: 'male' },
  ];
  let checked = 0;
  let blank = 0;
  for (const input of charts) {
    const ziWei = convertToZiWei(input);
    for (const palace of PALACE_ORDER) {
      const lesson = buildPalaceLesson({ ziWei, palaceName: palace, year: 2026, majorLimit: ziWei.majorLimits[2] });
      const self = lesson.steps.find((s) => s.id === 'self').data;
      for (const s of self.majorStarFunctions) {
        checked++;
        if (!s.application?.['發揮']) { blank++; fail(`${palace}/${s.name} 查不到應用`); }
      }
      // 吉煞雜曜也必須查得到落宮影響
      for (const item of [...self.auspiciousDetail, ...self.maleficDetail, ...self.otherDetail]) {
        checked++;
        if (!item.application?.['影響']) { blank++; fail(`${palace}/${item.name} 查不到落宮影響`); }
      }
      // 空宮借來的星要查本宮的應用，不是對宮的
      if (lesson.emptyGuide) {
        for (const b of lesson.emptyGuide.borrowedStars) {
          const expected = MAJOR[palace]?.[b.name]?.['發揮'];
          if (expected && b.application?.['發揮'] !== expected) {
            fail(`${palace} 借來的 ${b.name} 應該查本宮的應用，實際查到別的`);
          }
        }
      }
    }
  }
  if (!blank) ok(`${charts.length} 張命盤 × 12 宮共 ${checked} 顆星，每一顆都查得到落宮應用`);
}

console.log(failed ? `\n共 ${failed} 項星曜應用問題 ❌` : '\n星曜落宮應用資料全部通過 ✅');
process.exit(failed ? 1 : 0);

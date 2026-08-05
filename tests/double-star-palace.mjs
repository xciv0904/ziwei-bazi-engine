// tests/double-star-palace.mjs — 雙星組合逐宮文案的回歸測試
//
// 這份資料的由來：使用者說「光看百科敘述根本看不懂」。
// 雙星的一句話介紹（「領導特質加上務實理財觀」）之所以難懂，不是寫得不好，
// 是因為雙星必須落在某一宮才有意義——同一組落在命宮與落在夫妻宮講的是兩回事。
//
// 守住四件事：
//   1. 覆蓋完整：23 組 × 12 宮一格都不能少，缺一格就會有人查到空白。
//   2. 每一格都要真的不同：同一組在十二宮不得雷同，同一宮在不同組也不得雷同。
//      這是這份資料唯一的價值所在——如果十二宮講的都差不多，那就退回一句話介紹就好。
//   3. 不用術語：這是給看不懂術語的人讀的，出現廟旺、四化就失去意義。
//   4. 端到端：任一張命盤上有雙星的宮位，學習模式都要取得到對應的那一格。
//
// 執行：node tests/double-star-palace.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { PALACE_ORDER, buildPalaceLesson } from '../src/engines/learning-palace.js';
import { similarityScore } from '../src/engines/text-quality.js';

const url = (p) => new URL(p, import.meta.url);
const combos = JSON.parse(readFileSync(url('../src/data/double-star-combinations.json'), 'utf8'))['雙主星組合'];
const table = JSON.parse(readFileSync(url('../src/data/double-star-palace.json'), 'utf8'))['雙星落宮'];
const fixture = JSON.parse(readFileSync(url('./golden/cases/learning-mode-charts.json'), 'utf8'));

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);
const FIELDS = ['表現', '取捨'];

// ---------- 1. 覆蓋完整 ----------
{
  const missing = [];
  for (const key of Object.keys(combos)) {
    const entry = table[key];
    if (!entry) { missing.push(`${key}（整組缺漏）`); continue; }
    for (const palace of PALACE_ORDER) {
      const cell = entry[palace];
      if (!cell) { missing.push(`${key}/${palace}`); continue; }
      for (const field of FIELDS) {
        if (!cell[field]) missing.push(`${key}/${palace}/${field}`);
      }
    }
  }
  const extra = Object.keys(table).filter((k) => !combos[k]);
  if (missing.length) fail(`缺漏 ${missing.length} 項：${missing.slice(0, 6).join('、')}${missing.length > 6 ? '…' : ''}`);
  if (extra.length) fail(`有對不到雙星組合的項目：${extra.join('、')}`);
  if (!missing.length && !extra.length) {
    ok(`覆蓋完整：${Object.keys(combos).length} 組 × ${PALACE_ORDER.length} 宮 = ${Object.keys(combos).length * PALACE_ORDER.length} 格`);
  }
}

// ---------- 2. 每一格都要真的不同 ----------
// 這一節是這份資料的核心價值檢查。整份 552 句若有一批互相接近，
// 讀者翻到自己那一宮時就會發現「跟別宮講的一樣」，等於白做。
{
  const compact = (t) => String(t ?? '').replace(/\s+/g, '');
  let clashes = 0;
  const report = (kind, a, b, score) => {
    clashes++;
    if (clashes <= 6) fail(`${kind}雷同（${score.toFixed(2)}）：${a} ↔ ${b}`);
  };

  // 2a 同一組雙星，十二宮之間
  for (const [key, entry] of Object.entries(table)) {
    for (const field of FIELDS) {
      for (let i = 0; i < PALACE_ORDER.length; i++) {
        for (let j = i + 1; j < PALACE_ORDER.length; j++) {
          const a = compact(entry[PALACE_ORDER[i]]?.[field]);
          const b = compact(entry[PALACE_ORDER[j]]?.[field]);
          if (a && b && similarityScore(a, b) > 0.6) {
            report(`${key} 的${field}在不同宮`, PALACE_ORDER[i], PALACE_ORDER[j], similarityScore(a, b));
          }
        }
      }
    }
  }

  // 2b 同一個宮位，不同雙星組合之間
  const keys = Object.keys(table);
  for (const palace of PALACE_ORDER) {
    for (const field of FIELDS) {
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const a = compact(table[keys[i]][palace]?.[field]);
          const b = compact(table[keys[j]][palace]?.[field]);
          if (a && b && similarityScore(a, b) > 0.6) {
            report(`${palace}的${field}在不同組`, keys[i], keys[j], similarityScore(a, b));
          }
        }
      }
    }
  }
  if (clashes > 6) fail(`（另有 ${clashes - 6} 組雷同未列出）`);
  if (!clashes) ok('552 句兩兩比對，同組跨宮與同宮跨組都沒有雷同');
}

// ---------- 3. 不用術語、語氣不絕對 ----------
{
  const BANNED = ['廟旺', '落陷', '化祿', '化權', '化科', '化忌', '自化', '宮干', '三方四正', '大限', '流年', '借星'];
  const ABSOLUTE = ['一定會', '必定', '肯定會', '絕對會', '注定'];
  const issues = { jargon: [], absolute: [], short: [] };
  for (const [key, entry] of Object.entries(table)) {
    for (const palace of PALACE_ORDER) {
      for (const field of FIELDS) {
        const text = String(entry[palace]?.[field] ?? '');
        const where = `${key}/${palace}/${field}`;
        const jargon = BANNED.filter((w) => text.includes(w));
        if (jargon.length) issues.jargon.push(`${where}（${jargon.join('、')}）`);
        if (ABSOLUTE.some((w) => text.includes(w))) issues.absolute.push(where);
        if (text.length < 12) issues.short.push(`${where}（${text.length} 字）`);
      }
    }
  }
  for (const [kind, list] of Object.entries(issues)) {
    if (list.length) fail(`${kind}：${list.slice(0, 5).join('、')}${list.length > 5 ? `…共 ${list.length} 項` : ''}`);
  }
  if (!Object.values(issues).some((l) => l.length)) ok('沒有命理術語、沒有絕對語氣，長度都足夠');
}

// ---------- 4. 端到端：學習模式真的取得到 ----------
{
  let checked = 0;
  let borrowed = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    for (const palaceName of PALACE_ORDER) {
      const lesson = buildPalaceLesson({ ziWei, palaceName });
      const ds = lesson.steps.find((s) => s.id === 'self').data.doubleStar;
      if (ds?.combined) {
        checked++;
        if (!ds.application?.['表現']) fail(`${testCase.id ?? ''}${palaceName}（${ds.pair}）取不到落宮文案`);
      } else if (ds?.application) {
        fail(`${palaceName}只有一顆主星卻帶了雙星落宮文案`);
      }
      // 借來的雙星要查「本宮」那一格，不是對宮
      const bd = lesson.emptyGuide?.borrowedDouble;
      if (bd) {
        borrowed++;
        const own = table[Object.keys(table).find((k) => k.split('+').every((n) => bd.pair.includes(n)))]?.[palaceName];
        if (own && bd.application?.['表現'] !== own['表現']) {
          fail(`${palaceName}借來的${bd.pair}查到的不是本宮那一格`);
        }
      }
    }
  }
  if (!checked) fail('Golden Charts 裡沒有任何雙星同宮，這一節等於沒驗到');
  else ok(`端到端：${fixture.cases.length} 張命盤共 ${checked} 個雙星宮位都取得到，另驗了 ${borrowed} 個借來的雙星`);
}

console.log(failed ? `\n${failed} 項失敗 ❌` : '\n雙星逐宮文案全部通過 ✅');
process.exit(failed ? 1 : 0);

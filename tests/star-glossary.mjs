// tests/star-glossary.mjs — 命理小百科星曜詞條回歸測試
//
// 這份詞條庫的用途是「使用者在命盤上看到任何一顆星，都查得到它是什麼」。
// 最容易退化的地方有兩個：
//   1. 引擎日後多排出一顆星，詞條卻沒跟上，使用者點了會看到空白。
//   2. 三合派（南派）與飛星派（北派）的說法混在一起，讀者學到互相矛盾的東西。
// 這支測試把這兩件事釘住。
//
// 執行：node tests/star-glossary.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';

const glossary = JSON.parse(readFileSync(new URL('../src/data/star-glossary.json', import.meta.url), 'utf8'));
const entries = glossary['詞條'];

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

// ---------- 1. 覆蓋命盤上實際會出現的每一顆星 ----------
// 不用寫死清單：直接跑一批分佈夠廣的命盤，把引擎真的排得出來的星全部蒐集起來。
// 這樣即使日後換了排盤庫或調整輸出，這支測試也會第一時間抓到落差。
{
  // 取樣需要涵蓋十天干、十二地支與各種時辰，才會把所有星曜掃出來；
  // 但也不必窮舉——下面這組合已足夠命中全部 94 顆，掃描量刻意壓到測試跑得動的範圍。
  const seen = new Set();
  for (let year = 1984; year <= 1995; year += 1) {
    for (const month of [2, 8]) {
      for (const day of [5, 20]) {
        for (const hour of [1, 7, 13, 19, 23]) {
          for (const gender of ['female', 'male']) {
            let ziWei;
            try { ziWei = convertToZiWei({ year, month, day, hour, gender }); } catch { continue; }
            for (const palace of ziWei.palaces) {
              for (const raw of palace.minorStars) seen.add(String(raw).replace(/[(（].*$/, ''));
              for (const item of palace.auxiliary.shensha) seen.add(item);
              if (palace.auxiliary.twelveStage) seen.add(palace.auxiliary.twelveStage);
            }
          }
        }
      }
    }
  }
  const missing = [...seen].filter((name) => !entries[name]);
  if (missing.length) {
    fail(`命盤會顯示但小百科查不到的星曜共 ${missing.length} 顆：${missing.join('、')}`);
  } else {
    ok(`命盤上可能出現的 ${seen.size} 顆星曜全部都有詞條`);
  }

  // 反向：詞條裡的星名如果引擎根本排不出來，代表資料過期或打錯字
  const CONCEPTS = new Set(['生年四化', '化祿', '化權', '化科', '化忌', '自化', '離心自化', '向心自化', '宮干飛化', '來因宮']);
  const orphan = Object.keys(entries).filter((name) => !seen.has(name) && !CONCEPTS.has(name));
  if (orphan.length) fail(`詞條存在但命盤排不出來的項目：${orphan.join('、')}`);
}

// ---------- 2. 每一條的欄位齊全 ----------
{
  // 類別是短標籤（例如「六吉星」），只要求非空。
  // 核心是一句話定義，本來就該短（「該有的暫時不在」）。白話與南派看法是段落，長度不足代表沒寫完。
  const MIN_LENGTH = { 核心: 5, 白話: 20, 南派看法: 30 };
  const problems = [];
  for (const [term, item] of Object.entries(entries)) {
    if (!item['類別']) problems.push(`${term} 缺少類別`);
    for (const [field, min] of Object.entries(MIN_LENGTH)) {
      if (!item[field] || String(item[field]).trim().length < min) problems.push(`${term} 缺少或過短：${field}`);
    }
    if (!item['要留意']) problems.push(`${term} 缺少「要留意」`);
    // 必須有「落在不同宮位」或「怎麼看」其中之一，讀者才知道怎麼用
    if (!item['落在不同宮位'] && !item['怎麼看']) problems.push(`${term} 沒有說明怎麼運用`);
  }
  if (problems.length) fail(`欄位不完整：${problems.slice(0, 6).join('；')}${problems.length > 6 ? `…共 ${problems.length} 項` : ''}`);
  else ok(`${Object.keys(entries).length} 條詞條的欄位都齊全`);
}

// ---------- 3. 派別不得混用 ----------
// 使用者選的是南派。飛星派專有的概念必須集中在「飛星派補充」這一類並標明歸屬，
// 不能散落在南派詞條裡，否則讀者會以為三合派也在用宮干飛化。
{
  const FLYING_ONLY = ['自化', '宮干飛化', '來因宮', '離心自化', '向心自化'];
  const leaks = [];
  for (const [term, item] of Object.entries(entries)) {
    if (item['類別'] === '飛星派補充') continue;
    const text = [item['白話'], item['南派看法'], item['落在不同宮位'], item['怎麼看'], item['要留意']].filter(Boolean).join('');
    const hit = FLYING_ONLY.filter((concept) => text.includes(concept));
    if (hit.length) leaks.push(`${term}（${hit.join('、')}）`);
  }
  if (leaks.length) fail(`南派詞條混入飛星派概念：${leaks.join('、')}`);

  // 飛星派詞條必須明講自己屬於北派，讀者才不會誤以為是三合派的說法
  const unlabelled = Object.entries(entries)
    .filter(([, item]) => item['類別'] === '飛星派補充')
    .filter(([, item]) => !String(item['南派看法']).includes('飛星派') && !String(item['南派看法']).includes('北派'))
    .map(([term]) => term);
  if (unlabelled.length) fail(`飛星派詞條沒有標明派別：${unlabelled.join('、')}`);

  if (!leaks.length && !unlabelled.length) ok('南派與飛星派的內容分得乾淨，飛星派詞條都標明了派別歸屬');
}

// ---------- 4. 措辭不得寫成必然 ----------
{
  const ABSOLUTE = ['一定會', '必定', '肯定會', '絕對會', '注定'];
  const problems = [];
  for (const [term, item] of Object.entries(entries)) {
    const text = Object.values(item).join('');
    const hit = ABSOLUTE.filter((word) => text.includes(word));
    if (hit.length) problems.push(`${term}（${hit.join('、')}）`);
  }
  if (problems.length) fail(`詞條使用斷定語氣：${problems.join('、')}`);
  else ok('沒有任何詞條把命理推論寫成必然會發生的事');
}

// ---------- 5. 分類一致 ----------
{
  const KNOWN = new Set(['六吉星', '六煞星', '財祿與驛馬', '空亡類', '雜曜',
    '博士十二神', '將前十二神', '歲前十二神', '長生十二神', '四化', '飛星派補充']);
  const unknown = [...new Set(Object.values(entries).map((item) => item['類別']))].filter((c) => !KNOWN.has(c));
  if (unknown.length) fail(`出現未預期的分類：${unknown.join('、')}`);
  else ok('所有詞條都落在既有分類內');

  if (!glossary['派別說明']?.['南派'] || !glossary['派別說明']?.['北派']) {
    fail('缺少派別說明，讀者無從判斷詞條依據哪一派');
  }
}

console.log(failed
  ? `\n共 ${failed} 項小百科詞條問題 ❌`
  : `\n${Object.keys(entries).length} 條星曜與四化詞條全部通過 ✅`);
process.exit(failed ? 1 : 0);

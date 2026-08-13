// tests/build-output.mjs — 對「建置產物」排一張盤，不是對原始碼
//
// 這支測試的由來是一個上線後才被使用者發現的錯誤，而且整套測試當時全綠。
//
// 事情經過：為了省 gzip 8.3 kB，打包時把 iztro 四個用不到的語系換成空物件。
// iztro 的 kot()（把翻譯後的字串反查回內部 key）實作是掃過 resources 裡
// 「每一個語系」的每一組 key/value 去比對：
//
//   for (const [, item] of Object.entries(resources))
//     for (const [transKey, trans] of Object.entries(item.translation))
//       if (trans === value) return transKey;
//
// 語系被換成空物件之後 item.translation 是 undefined，這個迴圈直接爆掉或回傳原值，
// 安星時查不到正確的 key，輔星與雜曜整批安錯宮。
//
// 關鍵在於：那個外掛只在 vite build 生效，而 smoke、prelaunch、cross-test
// 全部都是直接 import 原始碼。原始碼那條路徑完全正常，所以 700 多項檢查沒有一項會紅，
// 正式站卻是壞的。使用者回報「輔星全部錯亂」，用無痕視窗仍然錯。
//
// 教訓不是「不要動 iztro 的語系」，而是「沒有人驗過建置產物」。
// 這支就是補那個缺口：npm run build 之後，直接載入 dist 的 chunk 排一張盤，
// 跟原始碼跑出來的結果逐宮比對。任何只在打包階段才會發生的問題——
// tree-shaking 砍錯、外掛改壞、minify 動到動態 key——都會在這裡露出來。
//
// 執行：npm run build-output（已掛在 npm run smoke 的檢查串裡，會先跑一次 build）
import { readdirSync, readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { convertToZiWei as convertFromSource } from '../src/engines/ziwei.js';

// 建置產物是給瀏覽器跑的：Vite 的 preload helper 一載入就會摸 document。
// 這裡給它一個真的 DOM（happy-dom），比手寫一堆 stub 可靠，
// 也比較接近它實際執行的環境。
const w = new Window({ url: 'http://localhost/' });
for (const key of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'MutationObserver']) {
  try { globalThis[key] = w[key]; } catch { /* 唯讀屬性略過 */ }
}
globalThis.window = w;
globalThis.requestIdleCallback = (fn) => setTimeout(fn, 0);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
// ziwei chunk 會連帶把入口的共用程式碼拉進來，而那段是整個應用程式的啟動流程：
// 它會去抓 index.html 裡的節點。給它一份真正的 body，讓啟動跑得完，
// 這支測試才有辦法拿到 chunk 匯出的 convertToZiWei。
w.document.body.innerHTML = readFileSync(new URL('../index.html', import.meta.url), 'utf-8')
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, '');

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

const distDir = new URL('../dist/assets/', import.meta.url);
let files;
try {
  files = readdirSync(distDir);
} catch {
  fail('找不到 dist/assets——這支測試要先 npm run build');
  process.exit(1);
}

const ziweiChunk = files.find((f) => /^ziwei-.*\.js$/.test(f));
if (!ziweiChunk) {
  fail('dist 裡找不到 ziwei chunk');
  process.exit(1);
}

const built = await import(new URL(ziweiChunk, distDir).href);
if (typeof built.convertToZiWei !== 'function') {
  fail('建置產物沒有匯出 convertToZiWei');
  process.exit(1);
}

// 幾張涵蓋不同條件的盤：不同年份、性別、時辰，讓安星規則走到不同分支。
const CASES = [
  { year: 2002, month: 9, day: 4, hour: 13, gender: 'female' },
  { year: 1978, month: 2, day: 21, hour: 3, gender: 'female' },
  { year: 1990, month: 5, day: 20, hour: 19, gender: 'male' },
  { year: 2006, month: 7, day: 12, hour: 9, gender: 'male' },
];

const flatten = (chart) => chart.palaces.map((p) => [
  p.name,
  p.position,
  p.majorStars.map((s) => `${s.name}${s.brightness ?? ''}${s.transformation ?? ''}`).join(','),
  p.minorStars.join(','),
].join('|')).join('\n');

let mismatched = 0;
let starCount = 0;
for (const input of CASES) {
  const fromSource = convertFromSource(input);
  const fromBuild = built.convertToZiWei(input);
  starCount += fromSource.palaces.reduce((n, p) => n + p.minorStars.length, 0);
  const a = flatten(fromSource);
  const b = flatten(fromBuild);
  if (a !== b) {
    mismatched++;
    const linesA = a.split('\n');
    const linesB = b.split('\n');
    const firstDiff = linesA.findIndex((line, i) => line !== linesB[i]);
    fail(`${input.year}-${input.month}-${input.day} 建置產物與原始碼結果不同`);
    console.log(`   原始碼：${linesA[firstDiff]}`);
    console.log(`   建置版：${linesB[firstDiff]}`);
  }
}

if (!mismatched) {
  ok(`${CASES.length} 張盤的十二宮、主星、亮度、四化與輔星（共 ${starCount} 顆）`
    + '，建置產物與原始碼逐項一致');
}

// 上面那個錯誤的直接成因是語系被打包階段拿掉，這裡另外釘死一條：
// kot() 需要 resources 裡每一個語系都有 translation 才能反查，
// 少一個就會安錯星。與其只驗結果，也一併驗這個前提還在。
{
  const chart = built.convertToZiWei(CASES[0]);
  const total = chart.palaces.reduce((n, p) => n + p.minorStars.length, 0);
  if (total < 30) {
    fail(`建置產物只安出 ${total} 顆輔星與雜曜，明顯偏少——通常代表反查（kot）失敗`);
  } else {
    ok(`建置產物的輔星與雜曜數量正常（${total} 顆）`);
  }
}

console.log(failed
  ? `\n${failed} 項失敗 ❌　建置產物與原始碼不一致，正式站會跟測試結果不同`
  : '\n建置產物與原始碼跑出同一張盤 ✅');
process.exit(failed ? 1 : 0);

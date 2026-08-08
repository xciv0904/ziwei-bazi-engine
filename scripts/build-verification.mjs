// scripts/build-verification.mjs — 產出公開的「排盤驗證」頁（public/verify/index.html）
//
// 為什麼要這一頁：
// 這個網站有兩種「準確」，性質完全不同——
//   1. 排盤準確：命宮落哪、四化落哪、斗君在哪。這是客觀的，可以跟別的工具對答案。
//   2. 解讀準確：「今年感情會怎樣」。這沒有經過實證檢驗，命理預測本來就沒有。
// 我們對前者做了交叉驗證，但結果只印在 CI log 裡，使用者一個字都看不到；
// 而市面上的排盤站沒有一個公開對答案。這一頁就是把可驗證的那半攤出來，
// 並且明白寫出後者不在驗證範圍內——不含糊其詞，也不用前者的數字暗示後者。
//
// 數字全部來自 tests/reports/cross-validation.json（由三支 cross-test 寫入）。
// 這裡不手寫任何統計值：手寫會過期，而「宣稱驗過但其實沒驗」比沒有這一頁更糟。
// 找不到 JSON 時頁面會明說資料未產出，不會顯示空的 0/0 假裝驗過。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(root, 'tests', 'reports', 'cross-validation.json');
const outDir = join(root, 'public', 'verify');

const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
}[c]));

let report = null;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch {
  report = null;
}

const CSS = `
  :root{--bg:#f4ede0;--card:#fbf6ec;--ink:#2b2621;--muted:rgba(43,38,33,.55);--red:#a63d2f;--gold:#8a6d3b;--border:rgba(43,38,33,.14);--ok:#2e7d5b}
  *{box-sizing:border-box}body{margin:0;background:#e9e2d3;color:var(--ink);font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;line-height:1.9}
  .wrap{max-width:820px;margin:0 auto;padding:28px 20px;background:var(--bg);min-height:100vh}
  h1{font-family:'Noto Serif TC',serif;font-size:26px;color:var(--red);margin:6px 0 10px}
  h2{font-family:'Noto Serif TC',serif;font-size:17px;color:var(--gold);margin:28px 0 8px}
  h3{font-size:14.5px;margin:16px 0 6px}
  p{font-size:14.5px}
  .top{font-size:13px;margin-bottom:14px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin:10px 0;font-size:14px}
  .lede{border-left:3px solid var(--red);padding-left:14px;margin:14px 0 22px;font-size:14.5px}
  table{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}
  th{font-size:12.5px;color:var(--muted);font-weight:600;white-space:nowrap}
  tr:last-child td{border-bottom:0}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .ok{color:var(--ok);font-weight:700}
  .bad{color:var(--red);font-weight:700}
  .scope{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--muted)}
  .warn{background:rgba(166,61,47,.07);border-color:rgba(166,61,47,.3)}
  a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
  .cta{display:inline-block;margin-top:20px;background:var(--red);color:#f4ede0;padding:10px 22px;border-radius:4px;font-size:13.5px}
  footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
`;

function suiteSection(entry) {
  const rate = entry.total ? Math.round((entry.pass / entry.total) * 100) : 0;
  const mismatchHtml = entry.mismatches.length
    ? `<h3>不一致的項目（${entry.mismatches.length}）</h3>
       <table><thead><tr><th>項目</th><th>對照來源</th><th>本站</th></tr></thead><tbody>
       ${entry.mismatches.map((m) => `<tr><td>${esc(m.label)}</td><td>${esc(JSON.stringify(m.expected))}</td><td>${esc(JSON.stringify(m.actual))}</td></tr>`).join('')}
       </tbody></table>`
    : '<p style="font-size:13.5px;color:rgba(43,38,33,.55)">這一組沒有不一致的項目。</p>';
  return `<h2>${esc(entry.title)}</h2>
    <div class="card">
      <div><strong>對照來源</strong>　${esc(entry.reference)}</div>
      <div><strong>受測命盤</strong>　${esc(entry.subject)}</div>
      <div><strong>比對結果</strong>　<span class="num"><span class="${entry.fail ? 'bad' : 'ok'}">${entry.pass}</span> / ${entry.total} 項一致（${rate}%）</span>${entry.fail ? `　<span class="bad">${entry.fail} 項不一致</span>` : ''}</div>
      <div><strong>執行日期</strong>　${esc(entry.ranAt)}</div>
      <strong>驗證範圍</strong>
      <ul class="scope">${entry.scope.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    ${mismatchHtml}`;
}

const suites = report ? Object.values(report) : [];
const totalPass = suites.reduce((n, s) => n + s.pass, 0);
const totalAll = suites.reduce((n, s) => n + s.total, 0);
const totalFail = suites.reduce((n, s) => n + s.fail, 0);

const body = suites.length
  ? `<div class="card${totalFail ? ' warn' : ''}">
      <div style="font-size:20px;font-weight:700" class="num">
        ${totalPass} / ${totalAll} 項一致
        ${totalFail ? `<span class="bad">（${totalFail} 項不一致）</span>` : '<span class="ok">（全部一致）</span>'}
      </div>
      <div style="font-size:13px;color:rgba(43,38,33,.55)">
        涵蓋 ${suites.length} 組驗證。每次部署前都會重跑，不一致就會擋下部署，這一頁的數字也跟著更新。
      </div>
    </div>
    ${suites.map(suiteSection).join('')}`
  : `<div class="card warn"><strong>驗證資料尚未產出。</strong>
      這一頁的數字來自 <code>tests/reports/cross-validation.json</code>，
      需要先執行 <code>node cross-test.mjs</code>、<code>node cross-test-bazi.mjs</code>、
      <code>node cross-test-wenmo.mjs</code>。在正式部署流程中這三支一定會先跑，
      所以線上版本不會看到這段文字。</div>`;

const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>排盤驗證：我們跟誰對過答案|紫微斗數・八字排盤</title>
<meta name="description" content="公開本站排盤結果與文墨天機等來源的逐項交叉驗證：驗了哪些欄位、一致率多少、哪裡不一致。排盤可以對答案，解讀不能——這一頁只講可驗證的那半。">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body><div class="wrap">
<div class="top"><a href="../">← 回排盤首頁</a>　|　<a href="../wiki/">命理小百科</a></div>
<h1>排盤驗證：我們跟誰對過答案</h1>

<div class="lede">
  <p>這個網站有兩種「準確」，性質完全不同，值得先分清楚。</p>
  <p><strong>排盤準確</strong>——命宮落在哪一宮、四化落在哪幾宮、斗君在哪、大限怎麼排。
  這是客觀的：同樣的生辰、同樣的流派規則，答案就是固定的，可以跟別的工具對答案。
  <strong>這一頁講的就是這件事。</strong></p>
  <p><strong>解讀準確</strong>——「今年感情會怎麼走」這類。
  這沒有經過實證檢驗，命理預測本來就沒有。所以我們不會給你命中率、好評數或準確率保證，
  下面的數字也不能拿來當作解讀可信的證據。本站的解讀是依傳統規則自動組裝的推論，
  在學習模式裡每一句都會交代依據來自命盤哪裡——你可以自己判斷推得合不合理，
  這比任何準確率宣稱都有用。</p>
</div>

${body}

<h2>為什麼要公開這個</h2>
<p>排盤是可以驗證的，那就應該讓人驗。如果我們算錯了命宮，後面所有解讀都不必談；
反過來說，敢把逐項比對攤出來，也比在首頁寫「專業精準」有意義。</p>
<p>你也可以自己驗：排完盤後在命盤總覽展開「完整命盤資料」，
把宮位、主星、四化抄去任何一個你信任的排盤工具對照。如果對不上，
歡迎到 <a href="https://github.com/xciv0904/ziwei-bazi-engine/issues" target="_blank" rel="noopener">GitHub Issues</a> 回報，
附上生辰與你認為正確的結果。</p>

<h2>驗證的限制</h2>
<div class="card">
  <p style="margin-top:0">誠實講清楚這一頁不能證明什麼：</p>
  <ul style="font-size:13.5px;margin:0;padding-left:18px">
    <li>受測命盤數量少。目前是逐欄位深度比對少數幾張盤，不是大量抽樣，
    無法宣稱「所有生辰都正確」。邊界情況（閏月、跨年、晚子時、時辰不明）需要更多樣本。</li>
    <li>只驗排盤，不驗解讀。文字內容的品質由另外十幾支測試套件把關（術語是否附白話、
    結論是否可回溯到盤面資料、有沒有寫成必然發生的事），但那些是一致性檢查，不是準確度證明。</li>
    <li>流派差異不算錯。不同流派在子時換日、四化表、安星方法上本來就有分歧，
    對照來源與本站選擇不同流派時，結果不同是預期的，不是 bug。</li>
  </ul>
</div>

<a class="cta" href="../">免費排出你的命盤 →</a>
<footer>本站內容由傳統命理規則自動組裝生成，僅供娛樂與文化參考，不構成醫療、財務或任何人生決策建議。
所有排盤計算皆在你的瀏覽器內完成，生辰資料只儲存在本機。
<a href="https://github.com/xciv0904/ziwei-bazi-engine" target="_blank" rel="noopener">原始碼</a></footer>
</div></body></html>`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
console.log(`排盤驗證頁：${suites.length} 組、${totalPass}/${totalAll} 項一致 → public/verify/index.html`);

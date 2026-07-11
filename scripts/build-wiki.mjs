// scripts/build-wiki.mjs — 命理小百科靜態頁面生成
// 把 src/data 的解讀資料庫輸出成獨立的靜態 HTML 詞典頁(public/wiki/*.html),
// 讓搜尋引擎能收錄內容(SPA 本體只有一個 URL,爬不到解讀文案)。
// 執行:node scripts/build-wiki.mjs(已掛在 npm run build 前置步驟)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'wiki');
const SITE = 'https://xciv0904.github.io/ziwei-bazi-engine/';

const json = async (p) => (await import(`../src/data/${p}`, { with: { type: 'json' } })).default;

const palaceStarDb = await json('palace-star-meanings.json');
const doubleStarDb = await json('double-star-combinations.json');
const tenGodsDb = await json('ten-gods-meanings.json');
const shenshaDb = await json('shensha-analysis.json');
const branchRelDb = await json('branch-interactions-analysis.json');
const { starMeanings } = await import('../src/data/star-meanings.js');
const { palaceMeanings } = await import('../src/data/palace-meanings.js');
const { PLAIN_SHENSHA } = await import('../src/engines/compose-shensha.js');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PALACE_ORDER = ['命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮', '遷移宮', '僕役宮', '官祿宮', '田宅宮', '福德宮', '父母宮'];

// ---------- 頁面模板 ----------
const CSS = `
  :root{--bg:#f4ede0;--card:#fbf6ec;--ink:#2b2621;--muted:rgba(43,38,33,.55);--red:#a63d2f;--gold:#8a6d3b;--border:rgba(43,38,33,.14)}
  *{box-sizing:border-box}body{margin:0;background:#e9e2d3;color:var(--ink);font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;line-height:1.9}
  .wrap{max-width:760px;margin:0 auto;padding:28px 20px;background:var(--bg);min-height:100vh}
  h1{font-family:'Noto Serif TC',serif;font-size:26px;color:var(--red);margin:6px 0 2px}
  h2{font-family:'Noto Serif TC',serif;font-size:16px;color:var(--gold);margin:26px 0 8px}
  .cat{font-size:12px;color:var(--muted);letter-spacing:.15em}
  .card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin:10px 0;font-size:14.5px}
  a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
  .top{font-size:13px;margin-bottom:14px}
  .rel{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .rel a{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:4px 12px;font-size:12.5px}
  .cta{display:inline-block;margin-top:18px;background:var(--red);color:#f4ede0;padding:10px 22px;border-radius:4px;font-size:13.5px}
  footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
  ul.idx{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}ul.idx a{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:5px 13px;font-size:13px;display:inline-block}
`;

function page({ title, category, desc, bodyHtml, related = [] }) {
  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}是什麼?|命理小百科・紫微斗數八字排盤</title>
<meta name="description" content="${esc(desc.slice(0, 120))}">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body><div class="wrap">
<div class="top"><a href="./">← 命理小百科</a>　|　<a href="../">回排盤首頁</a></div>
<div class="cat">${esc(category)}</div>
<h1>${esc(title)}</h1>
${bodyHtml}
${related.length ? `<h2>同類詞條</h2><div class="rel">${related.map((r) => `<a href="./${encodeURIComponent(r)}.html">${esc(r)}</a>`).join('')}</div>` : ''}
<a class="cta" href="../">免費排出你的命盤 →</a>
<footer>本頁內容由傳統命理規則資料庫生成,僅供娛樂與文化參考,不構成任何決策建議。<a href="../">紫微斗數・八字排盤</a></footer>
</div></body></html>`;
}

const para = (label, text) => `<div class="card">${label ? `<strong style="color:var(--gold)">${esc(label)}</strong>　` : ''}${esc(text)}</div>`;

// ---------- 生成詞條 ----------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const entries = []; // { term, category }

function emit(term, category, desc, bodyHtml, related) {
  writeFileSync(join(outDir, `${term}.html`), page({ title: term, category, desc, bodyHtml, related }));
  entries.push({ term, category });
}

// 1. 十四主星:核心特質 + 十二宮逐宮表現
const starNames = Object.keys(starMeanings);
for (const star of starNames) {
  const m = starMeanings[star];
  const body = [
    para('核心特質', `${m.core}。關鍵詞:${m.keywords.join('、')}。`),
    '<h2>在十二宮的表現</h2>',
    ...PALACE_ORDER.map((p) => (palaceStarDb[p]?.[star] ? para(p, palaceStarDb[p][star]) : '')),
    '<h2>常見雙星組合</h2>',
    ...Object.entries(doubleStarDb['雙主星組合'])
      .filter(([k]) => k.includes(star))
      .map(([k, v]) => para(k.replace('+', '・'), v)),
  ].join('');
  emit(star, '紫微斗數・十四主星', `紫微斗數${star}星:${m.core}`, body, starNames.filter((s) => s !== star).slice(0, 8));
}

// 2. 十二宮位
for (const p of PALACE_ORDER) {
  const body = [
    para('宮位主題', palaceMeanings[p] ?? ''),
    '<h2>十四主星入此宮</h2>',
    ...starNames.map((s) => (palaceStarDb[p]?.[s] ? para(s, palaceStarDb[p][s]) : '')),
  ].join('');
  emit(p, '紫微斗數・十二宮位', `紫微斗數${p}:${palaceMeanings[p] ?? ''}`, body, PALACE_ORDER.filter((x) => x !== p));
}

// 3. 十神(「七殺」與紫微主星撞名,加註消歧,避免檔名互相覆蓋)
const godNames = Object.keys(tenGodsDb['十神核心意義']);
const godTerm = (g) => (starMeanings[g] ? `${g}(十神)` : g);
for (const g of godNames) {
  const core = tenGodsDb['十神核心意義'][g];
  const body = [
    para('核心意義', core.core),
    para('關鍵詞', core.keywords.join('、')),
    tenGodsDb['十神短語']?.[g] ? para('一句話理解', tenGodsDb['十神短語'][g]) : '',
    starMeanings[g] ? `<div class="card">注意:八字十神的「${esc(g)}」與紫微斗數主星「<a href="./${encodeURIComponent(g)}.html">${esc(g)}</a>」名稱相同,但屬於不同系統的概念。</div>` : '',
    '<h2>出現在不同柱位</h2>',
    ...Object.entries(tenGodsDb['柱位背景句'] ?? {}).filter(([k]) => k.endsWith('柱'))
      .map(([k, v]) => para(k, v)),
  ].join('');
  emit(godTerm(g), '八字・十神', `八字十神「${g}」:${core.core}`, body, godNames.filter((x) => x !== g).map(godTerm));
}

// 4. 神煞
const shenshaAll = { ...shenshaDb['貴人星解讀'], ...shenshaDb['煞星解讀'] };
const shenshaNames = Object.keys(shenshaAll);
for (const s of shenshaNames) {
  const body = [
    PLAIN_SHENSHA[s] ? para('白話理解', `${PLAIN_SHENSHA[s]}。`) : '',
    para('完整解讀', shenshaAll[s]),
  ].join('');
  emit(s, '八字・神煞', `八字神煞「${s}」:${PLAIN_SHENSHA[s] ?? shenshaAll[s]}`, body, shenshaNames.filter((x) => x !== s).slice(0, 10));
}

// 5. 地支關係
const relNames = Object.keys(branchRelDb['關係類型解讀']);
for (const r of relNames) {
  const body = para('意涵', branchRelDb['關係類型解讀'][r]);
  emit(r, '八字・地支關係', `地支${r}是什麼意思:${branchRelDb['關係類型解讀'][r]}`, body, relNames.filter((x) => x !== r));
}

// ---------- 索引頁 ----------
const byCat = {};
for (const e of entries) (byCat[e.category] ??= []).push(e.term);
const indexBody = Object.entries(byCat).map(([cat, terms]) => `
  <h2>${esc(cat)}(${terms.length})</h2>
  <ul class="idx">${terms.map((t) => `<li><a href="./${encodeURIComponent(t)}.html">${esc(t)}</a></li>`).join('')}</ul>`).join('');
writeFileSync(join(outDir, 'index.html'), page({
  title: '命理小百科',
  category: '紫微斗數與八字名詞完整詞典',
  desc: '十四主星、十二宮位、八字十神、神煞、地支關係的白話解釋詞典,共收錄' + entries.length + '個詞條。',
  bodyHtml: indexBody,
}));

// ---------- sitemap / robots ----------
const urls = [SITE, `${SITE}wiki/`, ...entries.map((e) => `${SITE}wiki/${encodeURIComponent(e.term)}.html`)];
writeFileSync(join(root, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(root, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

console.log(`✓ 命理小百科生成完成:${entries.length} 個詞條 + 索引頁 + sitemap`);

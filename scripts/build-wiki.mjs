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
const commonCombos = await json('common-combinations.json');
const { convertToZiWei } = await import('../src/engines/ziwei.js');
const { convertToBaZi } = await import('../src/engines/bazi.js');
const { generateZiweiComprehensiveReading, generateBaziComprehensiveReading } = await import('../src/engines/comprehensive.js');

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
  // 反查:這顆星有沒有出現在「常見命盤組合」文章裡,有的話互相連結(增加站內連結密度)
  const relatedCombos = Object.keys(commonCombos).filter((term) => commonCombos[term].stars.includes(star));
  const body = [
    para('核心特質', `${m.core}。關鍵詞:${m.keywords.join('、')}。`),
    '<h2>在十二宮的表現</h2>',
    ...PALACE_ORDER.map((p) => (palaceStarDb[p]?.[star] ? para(p, palaceStarDb[p][star]) : '')),
    '<h2>常見雙星組合</h2>',
    ...Object.entries(doubleStarDb['雙主星組合'])
      .filter(([k]) => k.includes(star))
      .map(([k, v]) => para(k.replace('+', '・'), v)),
    relatedCombos.length
      ? `<h2>延伸閱讀:相關命盤組合</h2><div class="rel">${relatedCombos.map((t) => `<a href="./${encodeURIComponent(t)}.html">${esc(t)}</a>`).join('')}</div>`
      : '',
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

// 6. 常見命盤組合(殺破狼/機月同梁等固定結構格局,以及紫府/武貪等同宮組合)
// 內容全部組裝自既有的 star-meanings / double-star-combinations 資料庫,不新增未經驗證的命理主張,
// 只是換一個「以組合為主角」的角度重新呈現,同時大量互相連結既有的星曜/其他組合頁面。
const comboNames = Object.keys(commonCombos);
for (const term of comboNames) {
  const c = commonCombos[term];
  const pairText = c.stars.length === 2
    ? (doubleStarDb['雙主星組合'][`${c.stars[0]}+${c.stars[1]}`] ?? doubleStarDb['雙主星組合'][`${c.stars[1]}+${c.stars[0]}`])
    : null;
  const body = [
    para(c.aka ? `又稱「${c.aka}」` : '', c.intro),
    '<h2>組成星曜</h2>',
    ...c.stars.map((s) => para(s, `${starMeanings[s].core}。關鍵詞:${starMeanings[s].keywords.join('、')}。`)),
    pairText ? `<h2>同宮時的整體解讀</h2>${para('', pairText)}` : '',
    `<h2>想知道自己的命盤是不是這個組合?</h2>${para('', '每個人的命宮星曜組合都不一樣,直接排一次自己的命盤最準——免費線上排盤,馬上看到你的十二宮與主星落點。')}`,
  ].join('');
  emit(term, '紫微斗數・常見命盤組合', `${term}${c.aka ? `(${c.aka})` : ''}是什麼:${c.intro.slice(0, 80)}`,
    body, [...c.stars, ...comboNames.filter((t) => t !== term)]);
}

// 7. 示範案例解讀:實際餵兩組示範生辰資料進排盤引擎,展示「解讀報告」與「命盤解析」節錄長什麼樣子。
// 明確標示為示範命盤、非真實委託人資料,内容也全部來自引擎真實輸出,不手寫杜撰解讀文字。
const demoCases = [
  {
    term: '示範案例・紫微天府坐命的命盤解讀',
    input: { year: 1975, month: 3, day: 21, hour: 2, gender: 'female' },
    combo: '紫微天府同宮',
  },
  {
    term: '示範案例・天同坐命的命盤解讀(機月同梁格)',
    input: { year: 1980, month: 1, day: 5, hour: 1, gender: 'female' },
    combo: '機月同梁格',
  },
];
for (const dc of demoCases) {
  const zw = convertToZiWei(dc.input);
  const bz = convertToBaZi(dc.input);
  const zwReading = generateZiweiComprehensiveReading(zw);
  const bzReading = generateBaziComprehensiveReading(bz);
  const lifeStars = zw.palaces.find((p) => p.name === '命宮').majorStars.map((s) => s.name);
  const body = [
    para('', `以下是一張示範命盤(以固定的示範生辰資料產生,非真實委託人資料),用來展示「解讀報告」與「命盤解析」實際會呈現的內容。這張盤的命宮主星是${lifeStars.join('、')},出生於${dc.input.year}年${dc.input.month}月${dc.input.day}日。`),
    '<h2>紫微綜合解讀(節錄)</h2>',
    para(zwReading.sections[0].title, zwReading.sections[0].text),
    para(zwReading.sections[1].title, zwReading.sections[1].text),
    '<h2>八字綜合解讀(節錄)</h2>',
    para(bzReading.sections[0].title, bzReading.sections[0].text),
    `<h2>相關命盤組合</h2><div class="rel"><a href="./${encodeURIComponent(dc.combo)}.html">${esc(dc.combo)}</a>${lifeStars.map((s) => `<a href="./${encodeURIComponent(s)}.html">${esc(s)}</a>`).join('')}</div>`,
  ].join('');
  emit(dc.term, '紫微斗數・案例解讀',
    `示範命盤解讀案例:命宮${lifeStars.join('、')},完整紫微+八字解讀報告節錄(非真實委託人資料)`,
    body, [dc.combo, ...lifeStars]);
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

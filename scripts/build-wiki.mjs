// scripts/build-wiki.mjs — 命理小百科靜態頁面生成
// 把 src/data 的解讀資料庫輸出成獨立的靜態 HTML 詞典頁（public/wiki/*.html）,
// 讓搜尋引擎能收錄內容（SPA 本體只有一個 URL,爬不到解讀文案）。
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
const doubleStarPalaceDb = await json('double-star-palace.json');
const tenGodsDb = await json('ten-gods-meanings.json');
const shenshaDb = await json('shensha-analysis.json');
const branchRelDb = await json('branch-interactions-analysis.json');
// 星曜落宮的實際應用。與學習模式共用同一份資料，兩邊不會有落差。
const starApp = await json('star-palace-application.json');
const MAJOR_APP = starApp['主星應用'];
const AUX_APP = starApp['吉煞祿馬落宮'];
const MINOR_APP = starApp['雜曜落宮'];
const PALACE_GROUPS = starApp['宮位分類'];
const DOUBLE_APP = doubleStarPalaceDb['雙星落宮'];
const { starMeanings } = await import('../src/data/star-meanings.js');
const { palaceMeanings } = await import('../src/data/palace-meanings.js');
const { PLAIN_SHENSHA } = await import('../src/engines/compose-shensha.js');
// 神煞在前、紫微星曜詞條在後，但判斷撞名時就需要紫微側的名稱，所以先讀進來
const glossaryEntriesForClash = (await json('star-glossary.json'))['詞條'];

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
<footer>本頁內容由傳統命理規則資料庫生成，僅供娛樂與文化參考，不構成任何決策建議。<a href="../">紫微斗數・八字排盤</a></footer>
</div></body></html>`;
}

const para = (label, text) => `<div class="card">${label ? `<strong style="color:var(--gold)">${esc(label)}</strong>　` : ''}${esc(text)}</div>`;

// ---------- 生成詞條 ----------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const entries = []; // { term, category }

// 詞條檔名就是星名，所以同名的兩條會互相覆蓋，而且不會有任何錯誤訊息——
// 使用者只會發現點八字的「孤辰」跑出紫微的內容。撞名時直接讓建置失敗。
const emitted = new Map(); // term → category
function emit(term, category, desc, bodyHtml, related) {
  if (emitted.has(term)) {
    throw new Error(`詞條撞名：「${term}」同時被「${emitted.get(term)}」與「${category}」使用，`
      + '後者會覆蓋前者的頁面。請為其中一方加上消歧後綴（例如「孤辰(八字神煞)」）。');
  }
  emitted.set(term, category);
  writeFileSync(join(outDir, `${term}.html`), page({ title: term, category, desc, bodyHtml, related }));
  entries.push({ term, category });
}

// 1. 十四主星：核心特質 + 十二宮逐宮表現
const starNames = Object.keys(starMeanings);
for (const star of starNames) {
  const m = starMeanings[star];
  // 反查這顆星參與了哪幾組雙星同宮，互相連結（增加站內連結密度）
  const relatedCombos = Object.keys(doubleStarDb['雙主星組合'])
    .filter((k) => k.split('+').includes(star))
    .map((k) => `${k.split('+')[0]}${k.split('+')[1]}同宮`);
  const body = [
    para('核心特質', `${m.core}。關鍵詞：${m.keywords.join('、')}。`),
    '<h2>落入十二宮：怎麼發揮、要注意什麼</h2>',
    ...PALACE_ORDER.map((p) => {
      const base = palaceStarDb[p]?.[star];
      const app = MAJOR_APP[p]?.[star];
      if (!base && !app) return '';
      return `<div class="card"><strong style="color:var(--red)">${esc(p)}</strong>
        ${base ? `<div style="margin-top:6px">${esc(base)}</div>` : ''}
        ${app ? `<div style="margin-top:8px"><strong style="color:var(--gold)">最能發揮　</strong>${esc(app['發揮'])}</div>
        <div style="margin-top:4px"><strong style="color:var(--red)">要注意　</strong>${esc(app['注意'])}</div>
        <div style="margin-top:4px"><strong style="color:var(--gold)">怎麼做　</strong>${esc(app['怎麼做'])}</div>` : ''}
      </div>`;
    }),
    '<h2>常見雙星組合</h2>',
    ...Object.entries(doubleStarDb['雙主星組合'])
      .filter(([k]) => k.includes(star))
      .map(([k, v]) => para(k.replace('+', '・'), v)),
    relatedCombos.length
      ? `<h2>延伸閱讀：這顆星的雙星組合</h2><div class="rel">${relatedCombos.map((t) => `<a href="./${encodeURIComponent(t)}.html">${esc(t)}</a>`).join('')}</div>`
      : '',
  ].join('');
  emit(star, '紫微斗數・十四主星', `紫微斗數${star}星：${m.core}`, body, starNames.filter((s) => s !== star).slice(0, 8));
}

// 2. 十二宮位
for (const p of PALACE_ORDER) {
  const body = [
    para('宮位主題', palaceMeanings[p] ?? ''),
    '<h2>十四主星入此宮：怎麼發揮、要注意什麼</h2>',
    ...starNames.map((s) => {
      const base = palaceStarDb[p]?.[s];
      const app = MAJOR_APP[p]?.[s];
      if (!base && !app) return '';
      return `<div class="card"><strong style="color:var(--red)">${esc(s)}</strong>
        ${base ? `<div style="margin-top:6px">${esc(base)}</div>` : ''}
        ${app ? `<div style="margin-top:8px"><strong style="color:var(--gold)">最能發揮　</strong>${esc(app['發揮'])}</div>
        <div style="margin-top:4px"><strong style="color:var(--red)">要注意　</strong>${esc(app['注意'])}</div>
        <div style="margin-top:4px"><strong style="color:var(--gold)">怎麼做　</strong>${esc(app['怎麼做'])}</div>` : ''}
      </div>`;
    }),
  ].join('');
  emit(p, '紫微斗數・十二宮位', `紫微斗數${p}:${palaceMeanings[p] ?? ''}`, body, PALACE_ORDER.filter((x) => x !== p));
}

// 3. 十神（「七殺」與紫微主星撞名，加註消歧，避免檔名互相覆蓋）
const godNames = Object.keys(tenGodsDb['十神核心意義']);
const godTerm = (g) => (starMeanings[g] ? `${g}(十神)` : g);
for (const g of godNames) {
  const core = tenGodsDb['十神核心意義'][g];
  const body = [
    para('核心意義', core.core),
    para('關鍵詞', core.keywords.join('、')),
    tenGodsDb['十神短語']?.[g] ? para('一句話理解', tenGodsDb['十神短語'][g]) : '',
    starMeanings[g] ? `<div class="card">注意：八字十神的「${esc(g)}」與紫微斗數主星「<a href="./${encodeURIComponent(g)}.html">${esc(g)}</a>」名稱相同，但屬於不同系統的概念。</div>` : '',
    '<h2>出現在不同柱位</h2>',
    ...Object.entries(tenGodsDb['柱位背景句'] ?? {}).filter(([k]) => k.endsWith('柱'))
      .map(([k, v]) => para(k, v)),
  ].join('');
  emit(godTerm(g), '八字・十神', `八字十神「${g}」：${core.core}`, body, godNames.filter((x) => x !== g).map(godTerm));
}

// 4. 神煞
// 八字神煞有五條與紫微星曜同名（孤辰、空亡、喪門、劫煞、將星），指的是不同系統的東西。
// 檔名相同會互相覆蓋，所以這裡比照十神的做法加上消歧後綴，並在頁面內互相標註。
const shenshaAll = { ...shenshaDb['貴人星解讀'], ...shenshaDb['煞星解讀'] };
const shenshaNames = Object.keys(shenshaAll);
const ziweiTermNames = new Set([...Object.keys(glossaryEntriesForClash), ...starNames]);
const shenshaTerm = (s) => (ziweiTermNames.has(s) ? `${s}(八字神煞)` : s);
for (const s of shenshaNames) {
  const body = [
    PLAIN_SHENSHA[s] ? para('白話理解', `${PLAIN_SHENSHA[s]}。`) : '',
    para('完整解讀', shenshaAll[s]),
    ziweiTermNames.has(s)
      ? `<div class="card">注意：紫微斗數也有一顆叫「<a href="./${encodeURIComponent(s)}.html">${esc(s)}</a>」的星，那是另一套系統的概念，兩者不相通。</div>`
      : '',
  ].join('');
  emit(shenshaTerm(s), '八字・神煞', `八字神煞「${s}」：${PLAIN_SHENSHA[s] ?? shenshaAll[s]}`,
    body, shenshaNames.filter((x) => x !== s).map(shenshaTerm).slice(0, 10));
}

// 5. 地支關係
const relNames = Object.keys(branchRelDb['關係類型解讀']);
for (const r of relNames) {
  const body = para('意涵', branchRelDb['關係類型解讀'][r]);
  emit(r, '八字・地支關係', `地支${r}是什麼意思：${branchRelDb['關係類型解讀'][r]}`, body, relNames.filter((x) => x !== r));
}

// 6. 雙星組合（23 組）
// 原本這裡是「常見命盤組合」與「示範案例解讀」，但使用者反映點進去看不懂：
// 前者混了殺破狼這類三方結構格局與紫府這類同宮組合，兩種東西放在一起講；
// 後者是整段引擎輸出的節錄，沒有前後脈絡，讀起來像別人的報告。
// 改成單純的雙星組合介紹：紫微斗數的雙星同宮只有固定的 23 種，
// 這是使用者在自己命盤上真的會看到、也真的需要查的東西。
const doubleCombos = doubleStarDb['雙主星組合'];
const doubleNames = Object.keys(doubleCombos);
for (const key of doubleNames) {
  const [a, b] = key.split('+');
  const term = `${a}${b}同宮`;
  const body = [
    para('一句話理解', doubleCombos[key]),
    `<h2>兩顆星各自是什麼</h2>`,
    para(a, `${starMeanings[a].core}。關鍵詞：${starMeanings[a].keywords.join('、')}。`),
    para(b, `${starMeanings[b].core}。關鍵詞：${starMeanings[b].keywords.join('、')}。`),
    // 使用者反映「光看百科敘述根本看不懂」——一句話理解太抽象，
    // 因為同一組雙星落在命宮與落在夫妻宮講的是兩回事。逐宮列出才讀得懂。
    '<h2>落在十二宮分別是什麼樣子</h2>',
    para('', `雙星的介紹之所以難懂，是因為它必須落在某一宮才有意義。${a}${b}同宮在你的盤上只會出現在一個宮位，先找到它在哪一宮，再看下面對應的那一格。`),
    ...PALACE_ORDER.map((palace) => {
      const app = DOUBLE_APP[key]?.[palace];
      if (!app) return '';
      return `<div class="card"><strong style="color:var(--red)">${esc(palace)}</strong>
        <div style="margin-top:6px">${esc(app['表現'])}</div>
        <div style="margin-top:6px"><strong style="color:var(--gold)">這一組的取捨　</strong>${esc(app['取捨'])}</div></div>`;
    }),
    '<h2>怎麼讀雙星</h2>',
    para('', '兩顆十四主星同坐一宮，要當成一個新的組合來讀，不是把兩顆星的特質相加。'),
    para('', '兩顆星常常一個主導、一個修飾：先看哪一顆入廟或帶生年四化，那顆多半主導；再看另一顆把它往哪個方向調整。'),
    para('常見的誤讀', '把兩顆星的優點都算上、缺點都跳過。實際上雙星多半是一種取捨：得到某種能力，同時也帶著相應的代價。'),
    '<h2>接下來看什麼</h2>',
    para('', '三合派的判讀順序是：主星 → 廟旺利陷 → 雙星組合 → 生年四化 → 六吉六煞 → 雜曜。雙星讀完之後，再往下看這一宮有沒有四化、有沒有吉星煞星同宮。'),
    `<div class="cta-wrap"><a class="cta" href="../">排一次自己的命盤，看看這組雙星落在你的哪一宮 →</a></div>`,
  ].join('');
  emit(term, '紫微斗數・雙星組合', `${a}${b}同宮是什麼：${doubleCombos[key]}`,
    body, [a, b, ...doubleNames.filter((k) => k !== key).map((k) => `${k.split('+')[0]}${k.split('+')[1]}同宮`).slice(0, 8)]);
}

// 8. 輔星、煞曜、雜曜、四組十二神與四化
// 這一批的收錄範圍以「命盤上實際會顯示的星曜」為準（94 顆），使用者點到任何一顆都查得到，
// 不會出現看得到卻查不到的空白。解讀觀點以三合派（南派）為主；自化、宮干飛化、來因宮
// 屬於飛星派（北派）的方法，資料裡已標成獨立類別，這裡照原樣輸出，不混進南派的說法。
const glossary = await json('star-glossary.json');
const glossaryEntries = glossary['詞條'];
const glossaryTerms = Object.keys(glossaryEntries);
const glossaryByCategory = {};
for (const [term, item] of Object.entries(glossaryEntries)) {
  (glossaryByCategory[item['類別']] ??= []).push(term);
}
const SCHOOL_NOTE = glossary['派別說明'];

for (const [term, item] of Object.entries(glossaryEntries)) {
  const category = item['類別'];
  const sameCategory = (glossaryByCategory[category] ?? []).filter((t) => t !== term);
  const isFlying = category === '飛星派補充';
  const body = [
    para('一句話理解', item['核心']),
    para('', item['白話']),
    isFlying
      ? `<div class="card" style="border-left:3px solid var(--red)"><strong style="color:var(--red)">派別提醒　</strong>${esc(item['南派看法'])}</div>`
      : `<h2>三合派（南派）怎麼看</h2>${para('', item['南派看法'])}`,
    item['落在不同宮位'] ? `<h2>落在不同宮位</h2>${para('', item['落在不同宮位'])}` : '',
    // 落入各宮位的實際影響。六吉六煞與祿存天馬逐宮列出；
    // 其餘雜曜依宮位分類列出——同類宮位的差異很小，逐宮窮舉只會變成灌水。
    AUX_APP[term]
      ? `<h2>落入十二宮的影響</h2>${PALACE_ORDER.map((p) => para(p, AUX_APP[term][p])).join('')}`
      : (MINOR_APP[term]
        ? `<h2>落入各類宮位的影響</h2>${Object.entries(MINOR_APP[term])
          .map(([group, text]) => para(`${group}（${PALACE_GROUPS[group].join('、')}）`, text)).join('')}`
        : ''),
    item['怎麼看'] ? `<h2>怎麼看</h2>${para('', item['怎麼看'])}` : '',
    item['要留意'] ? `<h2>要留意</h2>${para('', item['要留意'])}` : '',
    `<h2>派別說明</h2>${para('南派（三合派）', SCHOOL_NOTE['南派'])}${para('北派（飛星派）', SCHOOL_NOTE['北派'])}${para('本站的做法', SCHOOL_NOTE['本站的做法'])}`,
  ].join('');
  emit(term, `紫微斗數・${category}`, `紫微斗數${term}是什麼：${item['核心']}。${item['白話'].slice(0, 60)}`,
    body, sameCategory.slice(0, 10));
}

// ---------- 索引頁 ----------
// 拆成三個入口，理由是使用者反映混在一起難以判讀：
//   1. 紫微斗數與八字是兩套完全不同的系統，星曜名稱還會撞名（七殺、咸池、華蓋），
//      放同一份清單會讓人以為是同一個東西。
//   2. 紫微內部又分三合派（南派）與飛星派（北派）：兩派看同一張盤的方法不同，
//      自化、飛化、來因宮只有北派在用。分開放，學哪一派就看哪一區。
const CATEGORY_GROUPS = [
  {
    slug: 'ziwei-south',
    title: '紫微斗數・三合派（南派）',
    lead: '三合派用數十至上百顆星，判斷重點是星曜的廟旺利陷、三方四正的會照、格局是否成立，以及出生年天干決定的生年四化。本站的解讀文案以這一派為主體。',
    order: ['紫微斗數・十四主星', '紫微斗數・雙星組合', '紫微斗數・十二宮位', '紫微斗數・六吉星',
      '紫微斗數・六煞星', '紫微斗數・財祿與驛馬', '紫微斗數・空亡類', '紫微斗數・雜曜',
      '紫微斗數・博士十二神', '紫微斗數・將前十二神', '紫微斗數・歲前十二神',
      '紫微斗數・長生十二神', '紫微斗數・四化'],
  },
  {
    slug: 'ziwei-north',
    title: '紫微斗數・飛星派（北派）',
    lead: '飛星派只用約十八顆星，核心是四化飛星：每個宮位用自己的宮干再引動一組四化，藉此追蹤事情的起因、過程與結果。三合派並不使用這一套，兩者請分開理解。',
    order: ['紫微斗數・飛星派補充'],
  },
  {
    slug: 'bazi',
    title: '八字',
    lead: '八字與紫微斗數是兩套獨立的系統，判斷方式與名詞都不相通。少數名詞會與紫微撞名（例如七殺、咸池、華蓋），指的是不同的東西。',
    order: ['八字・十神', '八字・神煞', '八字・地支關係'],
  },
];

const byCat = {};
for (const e of entries) (byCat[e.category] ??= []).push(e.term);

// 分類頁的檔名。分類名含「・」與中文，直接當檔名不好讀也不好連，
// 統一加 cat- 前綴並只取「・」後面的短名（十四主星、六吉星…）。
const categorySlug = (cat) => `cat-${cat.split('・').at(-1)}`;
const categoryShortName = (cat) => cat.split('・').at(-1);

// 每個分類各自一頁：點「十四主星」就只看到十四主星。
// 這一層原本不存在，索引上的分類直接連到整個分區頁，
// 結果不管點哪個分類，看到的都是那一區的全部詞條。
for (const group of CATEGORY_GROUPS) {
  for (const cat of group.order) {
    const terms = byCat[cat];
    if (!terms?.length) continue;
    const siblings = group.order.filter((c) => c !== cat && byCat[c]?.length);
    const body = [
      `<div class="card">${esc(group.title)}　共 ${terms.length} 條。</div>`,
      `<ul class="idx">${terms.map((t) => `<li><a href="./${encodeURIComponent(t)}.html">${esc(t)}</a></li>`).join('')}</ul>`,
      siblings.length
        ? `<h2>同一區的其他分類</h2><div class="rel">${siblings.map((c) => `<a href="./${categorySlug(c)}.html">${esc(categoryShortName(c))}（${byCat[c].length}）</a>`).join('')}</div>`
        : '',
      `<div class="rel" style="margin-top:14px"><a href="./${group.slug}.html">← 回${esc(group.title)}</a><a href="./">← 回命理小百科</a></div>`,
    ].join('');
    writeFileSync(join(outDir, `${categorySlug(cat)}.html`), page({
      title: categoryShortName(cat),
      category: group.title,
      desc: `${group.title}的${categoryShortName(cat)}詞條總覽，共 ${terms.length} 條：${terms.slice(0, 12).join('、')}。`,
      bodyHtml: body,
    }));
  }
}

// 分區頁：只列分類與條數，不再把所有詞條攤在同一頁
const catLinksHtml = (cats) => `<ul class="idx">${cats.filter((cat) => byCat[cat]?.length)
  .map((cat) => `<li><a href="./${categorySlug(cat)}.html">${esc(categoryShortName(cat))}（${byCat[cat].length}）</a></li>`).join('')}</ul>`;

for (const group of CATEGORY_GROUPS) {
  const count = group.order.reduce((sum, cat) => sum + (byCat[cat]?.length ?? 0), 0);
  const others = CATEGORY_GROUPS.filter((g) => g.slug !== group.slug);
  const body = [
    `<div class="card">${esc(group.lead)}</div>`,
    `<h2>分類（共 ${count} 條）</h2>`,
    catLinksHtml(group.order),
    `<h2>其他分區</h2><div class="rel">${others.map((g) => `<a href="./${g.slug}.html">${esc(g.title)}</a>`).join('')}</div>`,
  ].join('');
  writeFileSync(join(outDir, `${group.slug}.html`), page({
    title: group.title,
    category: '命理小百科',
    desc: `${group.title}詞條總覽，共 ${count} 條。${group.lead.slice(0, 60)}`,
    bodyHtml: body,
  }));
}

// 總入口：三個分區的說明，各自列出底下的分類
const indexBody = [
  '<div class="card">這裡收錄紫微斗數與八字的名詞解釋。兩套系統的判斷方式與名詞並不相通，所以分開放；紫微斗數內部再依三合派與飛星派分成兩區，避免把兩派的方法混著學。</div>',
  ...CATEGORY_GROUPS.map((group) => {
    const count = group.order.reduce((sum, cat) => sum + (byCat[cat]?.length ?? 0), 0);
    return `<h2><a href="./${group.slug}.html">${esc(group.title)}</a>（${count} 條）</h2>
      <div class="card">${esc(group.lead)}</div>
      ${catLinksHtml(group.order)}`;
  }),
].join('');
writeFileSync(join(outDir, 'index.html'), page({
  title: '命理小百科',
  category: '紫微斗數與八字名詞完整詞典',
  desc: `紫微斗數與八字的白話解釋詞典，依系統與派別分區，共收錄 ${entries.length} 個詞條。`,
  bodyHtml: indexBody,
}));

// 未歸入任何分區的類別要及早發現，否則新增分類後詞條會在索引上消失
const grouped = new Set(CATEGORY_GROUPS.flatMap((g) => g.order));
const ungrouped = Object.keys(byCat).filter((cat) => !grouped.has(cat));
if (ungrouped.length) {
  console.error(`⚠ 有分類沒有歸入任何分區，索引頁上看不到：${ungrouped.join('、')}`);
  process.exitCode = 1;
}

// ---------- sitemap / robots ----------
const urls = [SITE, `${SITE}wiki/`, `${SITE}verify/`,
  ...CATEGORY_GROUPS.map((g) => `${SITE}wiki/${g.slug}.html`),
  ...CATEGORY_GROUPS.flatMap((g) => g.order.filter((cat) => byCat[cat]?.length)
    .map((cat) => `${SITE}wiki/${encodeURIComponent(categorySlug(cat))}.html`)),
  ...entries.map((e) => `${SITE}wiki/${encodeURIComponent(e.term)}.html`)];
writeFileSync(join(root, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(root, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

console.log(`✓ 命理小百科生成完成：${entries.length} 個詞條 + 索引頁 + sitemap`);

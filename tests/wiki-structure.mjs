// tests/wiki-structure.mjs — 命理小百科的頁面結構檢查
//
// 這支測試起因於一個實際回報的問題：索引上點「十四主星」，出現的卻是整個南派分區的
// 所有詞條（雜曜、宮位、吉星全都在）。原因是分類連結指到分區頁，而不是分類自己的頁面。
// 這種錯誤不會讓建置失敗、也不會有紅字，只有人點進去才發現，所以用測試釘住。
//
// 檢查四件事：
//   1. 三層結構齊全：總索引 → 分區頁 → 分類頁 → 詞條頁。
//   2. 分類頁只列自己的詞條，不會混進別的分類。
//   3. 所有連結都指得到實際存在的檔案（不會 404）。
//   4. 紫微與八字、南派與北派確實分在不同頁。
//
// 執行：node tests/wiki-structure.mjs（需先跑過 npm run wiki）
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wikiDir = join(fileURLToPath(new URL('../', import.meta.url)), 'public', 'wiki');

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

if (!existsSync(join(wikiDir, 'index.html'))) {
  console.log('❌ 找不到 public/wiki/index.html，請先執行 npm run wiki');
  process.exit(1);
}

const read = (name) => readFileSync(join(wikiDir, name), 'utf8');
const linksIn = (html) => [...html.matchAll(/href="\.\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
const idxLinks = (html) => {
  // 只取索引清單（ul.idx）裡的連結，忽略頁尾的排盤連結與麵包屑
  const block = html.match(/<ul class="idx">([\s\S]*?)<\/ul>/g) ?? [];
  return block.flatMap((b) => [...b.matchAll(/href="\.\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1])));
};

const GROUPS = ['ziwei-south.html', 'ziwei-north.html', 'bazi.html'];

// ---------- 1. 三層結構齊全 ----------
{
  const missing = GROUPS.filter((f) => !existsSync(join(wikiDir, f)));
  if (missing.length) fail(`缺少分區頁：${missing.join('、')}`);
  const catPages = readdirSync(wikiDir).filter((f) => f.startsWith('cat-'));
  if (!catPages.length) fail('沒有任何分類頁（cat-*.html）');
  else ok(`三層結構齊全：總索引 + ${GROUPS.length} 個分區頁 + ${catPages.length} 個分類頁`);
}

// ---------- 2. 分類頁只列自己的詞條 ----------
{
  const problems = [];
  const catPages = readdirSync(wikiDir).filter((f) => f.startsWith('cat-'));
  const termToCategory = new Map();

  for (const file of catPages) {
    const html = read(file);
    const terms = idxLinks(html).filter((l) => !l.startsWith('cat-') && l.endsWith('.html'));
    if (!terms.length) { problems.push(`${file} 沒有列出任何詞條`); continue; }
    for (const term of terms) {
      // 同一個詞條不該同時出現在兩個分類頁——那代表分類定義重疊
      if (termToCategory.has(term) && termToCategory.get(term) !== file) {
        problems.push(`${term} 同時出現在 ${termToCategory.get(term)} 與 ${file}`);
      }
      termToCategory.set(term, file);
    }
    // 每個詞條頁的分類標示，必須和它所在的分類頁一致
    const shortName = file.replace(/^cat-|\.html$/g, '');
    for (const term of terms.slice(0, 40)) {
      if (!existsSync(join(wikiDir, term))) continue;
      const category = read(term).match(/<div class="cat">([^<]+)<\/div>/)?.[1] ?? '';
      if (!category.endsWith(shortName)) {
        problems.push(`${term} 列在「${shortName}」頁，但它自己標的分類是「${category}」`);
      }
    }
  }
  if (problems.length) fail(`分類頁內容錯置：${problems.slice(0, 5).join('；')}${problems.length > 5 ? `…共 ${problems.length} 項` : ''}`);
  else ok(`每個分類頁只列自己的詞條，共 ${termToCategory.size} 條各歸各位`);
}

// ---------- 3. 連結不得 404 ----------
{
  const broken = new Set();
  const pages = readdirSync(wikiDir).filter((f) => f.endsWith('.html'));
  for (const file of pages) {
    for (const link of linksIn(read(file))) {
      if (!link.endsWith('.html')) continue;
      if (!existsSync(join(wikiDir, link))) broken.add(`${file} → ${link}`);
    }
  }
  if (broken.size) fail(`連到不存在的頁面：${[...broken].slice(0, 6).join('、')}${broken.size > 6 ? `…共 ${broken.size} 條` : ''}`);
  else ok(`${pages.length} 個頁面的內部連結全部指得到實際檔案`);
}

// ---------- 4. 兩套系統與兩派確實分開 ----------
{
  // 索引上的分類連結，必須指到分類頁而不是分區頁——這正是原本出錯的地方
  const indexCatLinks = idxLinks(read('index.html'));
  const pointingToGroup = indexCatLinks.filter((l) => GROUPS.includes(l));
  if (pointingToGroup.length) {
    fail(`總索引的分類連結指到分區頁（點分類會看到整區全部）：${pointingToGroup.join('、')}`);
  }
  if (!indexCatLinks.length || !indexCatLinks.every((l) => l.startsWith('cat-'))) {
    fail('總索引的分類連結沒有全部指向分類頁');
  }

  const southCats = idxLinks(read('ziwei-south.html'));
  const northCats = idxLinks(read('ziwei-north.html'));
  const baziCats = idxLinks(read('bazi.html'));
  const overlap = (a, b) => a.filter((x) => b.includes(x));
  if (overlap(southCats, baziCats).length) fail('紫微與八字的分類有重疊');
  if (overlap(southCats, northCats).length) fail('南派與北派的分類有重疊');
  if (!northCats.some((c) => c.includes('飛星派'))) fail('北派分區沒有收錄飛星派的分類');
  if (southCats.some((c) => c.includes('飛星派'))) fail('南派分區混入了飛星派的分類');

  if (!failed) ok('紫微與八字、南派與北派各自獨立，索引的分類連結都指向分類頁');
}

console.log(failed ? `\n共 ${failed} 項小百科結構問題 ❌` : '\n命理小百科的頁面結構檢查全部通過 ✅');
process.exit(failed ? 1 : 0);

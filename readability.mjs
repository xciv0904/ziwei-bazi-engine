// readability.mjs — 白話可讀性檢查（npm run readability）
//
// 為什麼要有這支：
// smoke.mjs 只跑一兩張命盤，但解讀文字是「依命盤條件組裝」的——四化落在哪個宮、
// 十神是哪一個、有沒有借星，都會走到不同的模板分支。只驗一張盤，等於大部分文案分支從沒被看過。
// 實際上就發生過：某段模板在 A 盤乾淨無誤,B 盤卻冒出「命宮化權,」這種一般人看不懂的開頭。
//
// 這支用多張差異大的命盤（不同年代、性別、時辰，含子時邊界）渲染真實 DOM,
// 只看「白話面板」(專業命理依據面板本來就該有術語，會先被移除),檢查三件事：
//   1) 術語外洩：白話面板不該出現只有學過命理的人才懂的詞；
//   2) 一字不差的重複句：同一頁讀到兩次一模一樣的話，是最傷閱讀意願的問題；
//   3) 空話：放到任何人身上都成立、沒有資訊量的句子；
//   4) 跨分頁重複：「重點摘要」與「完整報告」不能讀起來像同一頁（這是使用者實際反映過的問題）。
//
// 例外：少數核心概念（身宮）允許出現，但必須就地附上白話說明，見 GLOSSED_TERMS。
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { inspectAiTone, inspectHeadingHierarchy } from './src/engines/text-quality.js';

/** 白話面板不得出現的術語 */
const BANNED_JARGON = [
  '化祿', '化權', '化科', '化忌', '喜用神', '忌神', '食傷', '比劫', '正官', '七殺', '偏財',
  '正印', '偏印', '傷官', '食神', '劫財', '比肩', '廟旺', '落陷', '借星', '來因宮', '自化',
  '納音', '藏干', '會照', '宮干', '命局', '本氣', '當令', '入柱', '日支', '年干',
];
/**
 * 「七殺」同時是紫微主星與八字十神的名稱。白話段落若寫成「七殺星」，
 * 指的明確是紫微主星，屬於一般讀者看得懂的星名，不算術語外洩；
 * 單獨出現的「七殺」才是要攔下的八字十神用法。
 */
const jargonHits = (text) => BANNED_JARGON.filter((term) => (term === '七殺'
  ? /七殺(?!星)/.test(text)
  : text.includes(term)));

/** 允許出現，但必須帶著白話說明一起出現 */
const GLOSSED_TERMS = { 身宮: '命理上稱為身宮' };
/** 沒有資訊量、套在誰身上都成立的句子 */
const VAGUE_FILLER = ['實際狀況仍會', '可以著力的方向', '會比單看', '要更務實地經營', '因人而異'];
/** 表面像白話，但一般使用者仍難以對照生活的抽象說法 */
const HARD_TO_APPLY = ['課題性', '能量傾向', '議題被引動', '資源流向', '內在動力結構', '人生展開的場域'];

/** 刻意選差異大的命盤：跨 1965–2010、男女各半、含子時（23 時）與早晚不同時辰 */
const CHARTS = [
  [1990, 5, 20, '9', 'female'], [1978, 11, 3, '1', 'male'],
  [2001, 2, 14, '15', 'female'], [1965, 7, 28, '23', 'male'],
  [1995, 9, 9, '5', 'female'], [1983, 12, 31, '19', 'male'],
  [2010, 6, 1, '11', 'female'], [1972, 4, 7, '3', 'male'],
];
const VIEWS = ['topics', 'report', 'comprehensive'];

let failed = 0;
const fail = (msg) => { failed++; console.log(`❌ ${msg}`); };

for (const [y, m, d, hour, gender] of CHARTS) {
  const w = new Window({ url: 'http://localhost/' });
  for (const k of ['document', 'Event', 'HTMLElement', 'Node', 'location', 'navigator', 'localStorage', 'matchMedia', 'requestIdleCallback']) {
    try { globalThis[k] = w[k]; } catch { /* 某些屬性唯讀 */ }
  }
  globalThis.window = w;
  const html = readFileSync('./index.html', 'utf-8');
  w.document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/, '');
  // 每張盤都要一個乾淨的模組實體（main.js 有模組層級狀態），用 query string 繞過 ESM 快取
  await import(`./src/main.js?chart=${y}${m}${d}${hour}`);

  const doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const settle = () => new Promise((r) => setTimeout(r, 250));

  $('#birth-year').value = String(y);
  $('#birth-year').dispatchEvent(new w.Event('input'));
  $('#birth-month').value = String(m);
  $('#birth-month').dispatchEvent(new w.Event('change'));
  $('#birth-day').value = String(d);
  $('#birth-day').dispatchEvent(new w.Event('change'));
  $('#birth-hour').value = hour;
  $$('#gender-toggle .pill').find((p) => p.dataset.value === gender)?.click();
  $('#birth-form').dispatchEvent(new w.Event('submit'));
  await settle();
  await settle();

  const viewText = {};
  for (const view of VIEWS) {
    $$('.nav-item').find((n) => n.dataset.view === view).click();
    await settle();
    const root = $(`#view-${view}`).cloneNode(true);
    for (const el of [...root.querySelectorAll('.analysis-card__panel--technical, .palace-technical, .tech-block, .topic-answer--basis, [data-report-panel="technical"]')]) el.remove();
    const text = root.textContent.replace(/\s+/g, ' ');
    const where = `${y}/${m}/${d} ${hour}時 ${gender}｜${view}`;

    const jargon = jargonHits(text);
    if (jargon.length) fail(`${where} 白話面板出現術語：${jargon.join('、')}`);

    for (const [term, gloss] of Object.entries(GLOSSED_TERMS)) {
      if (text.includes(term) && !text.includes(gloss)) fail(`${where} 出現「${term}」卻沒有白話說明`);
    }

    const filler = VAGUE_FILLER.filter((v) => text.includes(v));
    if (filler.length) fail(`${where} 出現空話：${filler.join('、')}`);
    const abstract = HARD_TO_APPLY.filter((v) => text.includes(v));
    if (abstract.length) fail(`${where} 出現難以對照生活的抽象說法：${abstract.join('、')}`);

    // 以單一段落/條列為單位，不把整頁按鈕與標題串成假長句。
    for (const node of [...root.querySelectorAll('p, li, .analysis-card__summary, .palace-explain')]) {
      const issues = inspectAiTone(node.textContent).filter((issue) => issue.startsWith('句子過長') || issue.startsWith('空泛句型') || issue.startsWith('通用結尾'));
      if (issues.length) fail(`${where} 段落不夠白話：${issues.join('、')}`);
    }

    const primaryHeadings = [...root.querySelectorAll('h2, h3, .analysis-card__title, .acc-title')]
      .map((node) => node.textContent.trim());
    const headingIssues = inspectHeadingHierarchy(primaryHeadings);
    if (headingIssues.length) fail(`${where} 主標題重複：${headingIssues.join('、')}`);

    const sentences = text.split(/[。;；]/).map((t) => t.trim()).filter((t) => t.length >= 14);
    const counts = new Map();
    sentences.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    const dup = [...counts.entries()].filter(([, n]) => n > 1);
    if (dup.length) fail(`${where} 同頁重複句：${dup.map(([t, n]) => `${n}× ${t.slice(0, 40)}`).join(' / ')}`);
    viewText[view] = text;
  }

  // ---- 跨分頁：重點摘要 與 完整報告 不能讀起來像同一頁 ----
  // 這兩頁最常被反映「看不出差別」。曾經的原因很具體：完整報告每段的導讀句
  // 直接重用重點摘要卡片的第一句，使用者點進去看到一字不差的開頭，就認定兩頁一樣。
  // 兩頁本來就該有不同的入口感受——重點摘要給結論，完整報告給脈絡。
  const sentsOf = (t) => [...new Set(t.split(/[。;；]/).map((x) => x.trim()).filter((x) => x.length >= 14))];
  const repS = sentsOf(viewText.report ?? '');
  const compS = sentsOf(viewText.comprehensive ?? '');
  if (repS.length && compS.length) {
    if (repS[0] === compS[0]) fail(`${y}/${m}/${d} 重點摘要與完整報告的第一句一字不差：${repS[0].slice(0, 40)}`);
    const shared = repS.filter((x) => compS.includes(x));
    const ratio = shared.length / repS.length;
    // 少量重疊可以接受（兩頁本來就講同一張命盤），但超過三成就會失去分頁的意義
    if (ratio > 0.3) fail(`${y}/${m}/${d} 兩頁重疊過高：${shared.length}/${repS.length} 句相同(${Math.round(ratio * 100)}%)`);
  }
}

console.log(failed === 0
  ? `\n${CHARTS.length} 張命盤 × ${VIEWS.length} 個分頁，白話面板無術語、無重複句、無空話 ✅`
  : `\n${failed} 項可讀性問題 ❌`);
process.exit(failed === 0 ? 0 : 1);

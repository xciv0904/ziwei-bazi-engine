// tests/modifiers.mjs — 輔星、煞曜、雜曜與四化真的有進到解讀裡
//
// 這支測試的由來：使用者說「看命盤跟解析的時候，不要只單看主星，輔星跟四化也要考慮進去」。
// 當時的狀況是輔星煞曜只出現在「專業資料」的清單，一句解讀都沒有用到——
// 命盤上明明擺著左輔右弼與擎羊陀羅，讀出來的東西卻跟沒有它們一樣。
//
// 這支守四件事：
//   1. 修正層本身正確：吉星算助力、煞星算阻力、四化與廟旺都要進來。
//   2. 真的有差：把同一顆主星放在輔星煞曜不同的宮位，解讀必須不一樣。
//      這是核心——如果拿掉輔星結論也一樣成立，就代表根本沒用到。
//   3. 白話模式仍然零術語：修正句不得出現星名（星名也是術語）。
//   4. 全站與 AI 都吃得到：主題分析、重點解讀卡片、AI 提示詞都要帶上。
//
// 執行：node tests/modifiers.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { convertToBaZi } from '../src/engines/bazi.js';
import { composeZiWeiLuck } from '../src/engines/compose-luck.js';
import { generatePlainZiweiTopics } from '../src/engines/compose-plain.js';
import { composePalaceModifiers, composeChartModifiers } from '../src/engines/compose-modifiers.js';
import { buildTopicReport, resolveTopicStar } from '../src/engines/topic-report.js';
import { formatChartForAI, formatPalacePromptForAI, formatTopicPromptForAI } from '../src/engines/format-ai.js';
import { TOPIC_CONTRACTS } from '../src/data/topic-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/learning-mode-charts.json', import.meta.url), 'utf8'));

/**
 * 第 5 件事：白話修正句不可以只講好消息。
 *
 * 由來：一張天梁落陷又帶生年化祿的夫妻宮，主題分析的「你的盤上還有這些條件」
 * 印出四句話，全部是加分項——機會會自己出現、對方有才藝、能帶來經濟支持。
 * 落陷（發揮吃力）那一面完全不見，因為廟旺當時被整個排除在白話句之外。
 * 命盤說的是「有資源但吃力」，使用者讀到的是「一路順風」。
 *
 * 這一條守的是：只要主星有亮度，白話修正句的第一句就必須交代底子，
 * 不論那個底子是好是壞。有沒有講清楚無法自動判斷，但「有沒有講」可以。
 */
function checkBrightnessAlwaysSpoken(charts) {
  let missing = 0;
  let checked = 0;
  let dragCases = 0;
  for (const chart of charts) {
    const ziWei = convertToZiWei(chart);
    for (const palace of ziWei.palaces) {
      const lead = (palace.majorStars ?? [])[0];
      if (!lead?.brightness) continue;
      const mods = composePalaceModifiers(palace);
      if (!mods?.hasSignal) continue;
      checked++;
      const brightnessItem = mods.technical.items.find((i) => i.category === 'brightness');
      if (!brightnessItem) continue;
      // 底子必須是第一句，而且必須真的出現在白話句裡
      const voice = brightnessItem.voice.replaceAll('{領域}', '').slice(0, 6);
      if (!mods.plainLines[0] || !mods.plainLines[0].includes(voice.slice(-4))) missing++;
      // 底子偏弱時特別要盯：這正是「四句話全是好消息」的來源。
      // 第一句必須是那句底子，而不是某個加分項。
      if (brightnessItem.tone === 'drag') {
        dragCases++;
        const first = mods.plainLines[0] ?? '';
        if (/會自己出現|加分|省力|狀態很穩/.test(first)) missing++;
      }
    }
  }
  return { missing, checked, dragCases };
}

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

const AUSPICIOUS = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞'];
const MALEFIC = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];
const bare = (raw) => String(raw).replace(/[(（].*$/, '').trim();

// ---------- 1. 修正層本身要正確 ----------
{
  let checkedAus = 0;
  let checkedMal = 0;
  let checkedMut = 0;
  let wrong = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    for (const palace of ziWei.palaces) {
      const mod = composePalaceModifiers(palace);
      const stars = (palace.minorStars ?? []).map(bare);

      for (const name of stars.filter((n) => AUSPICIOUS.includes(n))) {
        checkedAus++;
        const item = mod.technical.items.find((i) => i.star === name);
        if (!item) { wrong++; fail(`${palace.name} 的六吉星 ${name} 沒有進到修正層`); }
        else if (item.tone !== 'boost') { wrong++; fail(`${palace.name} 的 ${name} 被算成 ${item.tone}，六吉應該是助力`); }
      }
      for (const name of stars.filter((n) => MALEFIC.includes(n))) {
        checkedMal++;
        const item = mod.technical.items.find((i) => i.star === name);
        if (!item) { wrong++; fail(`${palace.name} 的六煞星 ${name} 沒有進到修正層`); }
        else if (item.tone !== 'drag') { wrong++; fail(`${palace.name} 的 ${name} 被算成 ${item.tone}，六煞應該是阻力`); }
      }
      for (const star of palace.majorStars ?? []) {
        if (!star.transformation) continue;
        checkedMut++;
        const mutagen = String(star.transformation).replace(/^化/, '');
        if (!mod.technical.items.some((i) => i.star === `${star.name}化${mutagen}`)) {
          wrong++;
          fail(`${palace.name} 的生年${star.name}化${mutagen} 沒有進到修正層`);
        }
      }
      // 有主星就一定有亮度，亮度是主星的力道，不能漏
      if ((palace.majorStars ?? []).length && palace.majorStars[0].brightness
        && !mod.technical.items.some((i) => i.source === '廟旺利陷')) {
        wrong++;
        fail(`${palace.name} 有主星亮度卻沒有進到修正層`);
      }
    }
  }
  if (!wrong) ok(`修正層涵蓋完整：六吉 ${checkedAus} 次、六煞 ${checkedMal} 次、生年四化 ${checkedMut} 次都算進去了`);
}

// ---------- 2. 真的有差：輔星不同，解讀就要不同 ----------
// 這一節是整支測試的重點。做法是拿真實命盤上「同一顆主星、不同輔星組合」的宮位比對，
// 如果修正層對它們給出一樣的東西，代表輔星根本沒有發揮作用。
{
  const bySignature = new Map();
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    for (const palace of ziWei.palaces) {
      const major = (palace.majorStars ?? []).map((s) => s.name).join('、');
      if (!major) continue;
      const mod = composePalaceModifiers(palace);
      const minorKey = (palace.minorStars ?? []).map(bare).sort().join(',');
      const key = `${major}@${palace.name}`;
      if (!bySignature.has(key)) bySignature.set(key, new Map());
      bySignature.get(key).set(minorKey, mod.plainLines.join('｜'));
    }
  }
  let compared = 0;
  let identical = 0;
  for (const [key, variants] of bySignature) {
    if (variants.size < 2) continue;
    const entries = [...variants.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        compared++;
        if (entries[i][1] === entries[j][1] && entries[i][0] !== entries[j][0]) {
          identical++;
          fail(`${key}：輔星組合不同（${entries[i][0] || '無'} vs ${entries[j][0] || '無'}）修正句卻一樣，等於沒用到輔星`);
        }
      }
    }
  }
  if (!compared) fail('Golden Charts 裡找不到「同主星同宮位但輔星不同」的組合，這一節等於沒驗到');
  else if (!identical) ok(`輔星真的有作用：${compared} 組「同主星、不同輔星」的比對全部產出不同的修正`);
}

// ---------- 3. 白話模式的修正句不得出現星名 ----------
{
  const STAR_NAMES = [...AUSPICIOUS, ...MALEFIC, '祿存', '天馬', '天刑', '天姚', '紅鸞', '華蓋',
    '紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
  const JARGON = ['化祿', '化權', '化科', '化忌', '廟旺', '落陷', '六吉', '六煞', '雜曜'];
  let leaks = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    for (const mod of composeChartModifiers(ziWei)) {
      for (const line of [...mod.plainLines, mod.summary]) {
        const found = [...STAR_NAMES, ...JARGON].filter((w) => line.includes(w));
        if (found.length) {
          leaks++;
          fail(`白話修正句出現術語（${found.join('、')}）：「${line}」`);
        }
      }
    }
  }
  if (!leaks) ok('白話模式的修正句完全不出現星名與術語');
}

// ---------- 3b. 每一句都要跟它所屬的宮位有關 ----------
// 使用者回報：夫妻宮出現「你反應快，同樣的東西你上手比較快」，
// 原話是「不明白這跟感情這塊的關聯性」。原因是白話句用了星的通性文案，
// 而通性跟宮位無關——同一句話會原封不動出現在十二宮任何一宮。
//
// 這一節守兩件事：
//   a. 有逐宮文案的星，白話句必須用逐宮那一份。
//   b.「該宮」這種模板殘留的字不得印到畫面上。
{
  const app = JSON.parse(readFileSync(new URL('../src/data/star-palace-application.json', import.meta.url), 'utf8'));
  const AUX = app['吉煞祿馬落宮'];
  const GROUPS = app['宮位分類'];
  const MINOR = app['雜曜落宮'];
  const groupOf = (palaceName) =>
    Object.entries(GROUPS).find(([, list]) => list.includes(palaceName))?.[0] ?? null;

  let generic = 0;
  let template = 0;
  let checked = 0;
  for (const testCase of fixture.cases) {
    const ziWei = convertToZiWei(testCase.input);
    for (const palace of ziWei.palaces) {
      const mod = composePalaceModifiers(palace);
      const text = [...mod.plainLines, mod.narrative].join('');
      if (/該宮/.test(text)) {
        template++;
        fail(`${palace.name} 的白話句印出模板殘留字「該宮」：${text.slice(0, 40)}`);
      }
      for (const item of mod.technical.items) {
        if (item.category === 'brightness' || item.category === 'mutagen') continue;
        const perPalace = AUX[item.star]?.[palace.name]
          ?? (groupOf(palace.name) ? MINOR[item.star]?.[groupOf(palace.name)] : null);
        if (!perPalace) continue;
        checked++;
        // 逐宮文案存在時，白話句就不該退回通性文案
        if (text.includes(item.voice.replace(/[。，]$/, '')) && item.voice !== perPalace) {
          generic++;
          fail(`${palace.name} 的 ${item.star} 用了通性文案而不是逐宮文案：「${item.voice}」`);
        }
      }
    }
  }
  if (!checked) fail('沒有比對到任何逐宮文案，這一節等於沒驗到');
  else if (!generic && !template) {
    ok(`每一句都貼著宮位：${checked} 顆有逐宮文案的星全部採用逐宮版本，沒有模板殘留字`);
  }
}

// ---------- 4. 全站與 AI 都吃得到 ----------
{
  const testCase = fixture.cases[0];
  const ziWei = convertToZiWei(testCase.input);
  const baZi = convertToBaZi(testCase.input);

  // 4a 重點解讀卡片：修正層是獨立欄位，不再 push 進 explanation。
  //    第一版是 push 進去的，結果三個頁面（命盤總覽取前 2 句、重點解讀取前 1 句、
  //    完整報告取前 3 句）全部把它截掉，只有主題分析剛好看得到。
  //    這裡守住「卡片算得出修正層，而且逐條版與敘事版都有內容」，
  //    畫面上有沒有渲染由 smoke.mjs 在 DOM 上驗。
  const cards = generatePlainZiweiTopics(ziWei, composeZiWeiLuck(ziWei, { mode: 'public' }));
  const withMod = cards.filter((c) => c.modifiers?.hasSignal);
  if (!withMod.length) fail('重點解讀卡片沒有帶上修正層');
  for (const card of withMod) {
    if (!card.modifiers.plainLines.length) fail(`${card.title} 有修正項卻產不出逐條版句子`);
    if (!card.modifiers.narrative) fail(`${card.title} 有修正項卻產不出完整報告用的敘事版`);
    if (card.modifiers.plainLines.some((line) => card.explanation.includes(line))) {
      fail(`${card.title} 又把修正句塞回 explanation 了，三個頁面會再次把它截掉`);
    }
  }

  // 4b 逐條版與敘事版必須是兩種寫法。
  //
  //    這裡刻意不要求「零重疊」。兩頁講的是同一張命盤，引用同一批事實是必然的，
  //    而且一個宮位常常只有一兩顆星可講，硬要換句話說只會開始編。
  //    真正該守的是「整段讀起來不一樣」——那由 readability.mjs 的兩頁重疊比例把關。
  //    這裡守的是敘事版真的有自己的框架，而不是把逐條版接起來換行變成一段。
  for (const card of withMod) {
    const { plainLines, narrative } = card.modifiers;
    if (narrative === plainLines.join('')) {
      fail(`${card.title} 的敘事版只是把逐條版接起來，不算另一種寫法`);
    }
    // 框架句：敘事版要交代「這幾項跟前面談的是同一個領域」。
    // 原本這裡寫死檢查「除了上面說的」，但那句已經拿掉了——
    // 使用者回報整段是贅字，實際輸出確實如此：卡片標題已經是
    //「這一塊，你跟別人不一樣的地方」，內文再寫「${領域}這一塊，除了上面說的」
    // 是同一件事講第二次，收尾句的「上面那段話」又講第三次。
    // 現在的框架是「同樣是${領域}」，一句帶完，所以改成檢查意圖而不是字面。
    if (!narrative.startsWith('同樣是')) {
      fail(`${card.title} 的敘事版缺少承接上文的框架句`);
    }
    // 防退回冗長版：這幾個詞就是當初被判定為贅字的來源
    for (const filler of ['除了上面說的', '上面那段話', '還有幾件事一起在影響', '這一塊，']) {
      if (narrative.includes(filler)) {
        fail(`${card.title} 的敘事版又出現贅句「${filler}」`);
      }
    }
    // 數量詞要對得上實際項數。原本只有一項時也寫「還有幾件事」。
    const listed = narrative.split('：')[1]?.split('、').length ?? 0;
    const expectWord = listed > 1 ? '這幾項' : '這一項';
    if (!narrative.includes(expectWord)) {
      fail(`${card.title} 列了 ${listed} 項卻用了錯的數量詞（應為「${expectWord}」）`);
    }
    // 逐條版是一項一句、句末句號；敘事版把幾項串進同一句。
    // 句子邊界不同，兩頁的「相同句」比例才壓得下來。
    const standalone = plainLines.filter((line) => narrative.includes(line)).length;
    if (standalone > 1) {
      fail(`${card.title} 的敘事版有 ${standalone} 句跟逐條版一字不差，兩頁會讀起來一樣`);
    }
  }

  // 4c 主題分析：命盤依據要說明「這些星怎麼改變判斷」，不是只列星名
  const contract = TOPIC_CONTRACTS[0];
  const report = buildTopicReport({ contract, ziWei, ziweiCard: cards[0], baziCards: [] });
  const resolved = resolveTopicStar(contract, ziWei);
  if (resolved?.palace && composePalaceModifiers(resolved.palace).hasSignal) {
    if (!report.chartBasis.some((r) => r.label === '這些星怎麼改變判斷')) {
      fail('主題分析的命盤依據沒有說明輔星煞曜改變了什麼');
    }
    if (!report.directAnswer.modifierNote?.length) {
      fail('主題分析的答案沒有附上修正句');
    }
  }

  // 4d AI 提示詞：資料與指示都要在。只給資料而不要求使用，AI 一樣會只挑主星講。
  const fullPrompt = formatChartForAI({ input: testCase.input, ziWei, baZi });
  if (!fullPrompt.includes('判讀修正：')) fail('完整命盤 AI 提示詞沒有帶上每宮的判讀修正');
  if (!fullPrompt.includes('不得只用主星下結論')) fail('完整命盤 AI 提示詞沒有要求把輔星煞曜算進去');
  if (!fullPrompt.includes('代表沒有用到')) fail('AI 提示詞缺少可自我檢查的判準');

  const palacePrompt = formatPalacePromptForAI({ input: testCase.input, ziWei, palaceName: '命宮' });
  if (!palacePrompt.includes('判讀修正')) fail('宮位 AI 提示詞沒有帶上判讀修正');
  if (!palacePrompt.includes('不得只用主星下結論')) fail('宮位 AI 提示詞沒有要求把輔星煞曜算進去');

  if (report.modifiers?.hasSignal) {
    const topicPrompt = formatTopicPromptForAI({ contract, report });
    if (!topicPrompt.includes('對應宮位的判讀修正')) fail('主題 AI 提示詞沒有帶上判讀修正');
  }
  ok('重點解讀、主題分析與三種 AI 提示詞都吃得到修正層');
}

{
  const { missing, checked, dragCases } = checkBrightnessAlwaysSpoken(fixture.cases.map((c) => c.input ?? c));
  if (missing) fail(`白話修正句漏掉主星力道：${missing} 處只印了加分項，讀起來像一路順風`);
  else ok(`白話修正句一定先交代底子：${checked} 個有亮度的宮位（其中 ${dragCases} 個底子偏弱）都講了`);
}

console.log(failed ? `\n${failed} 項失敗 ❌` : '\n輔星、煞曜、雜曜與四化都真的進到解讀裡了 ✅');
process.exit(failed ? 1 : 0);

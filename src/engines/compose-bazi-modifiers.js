// src/engines/compose-bazi-modifiers.js — 八字的修正層
//
// 這一支是 compose-modifiers.js（紫微修正層）的八字對應版本，補的是一個結構性的缺口：
//
// 紫微的每一張白話卡都有「你跟別人不一樣的地方」——主星定方向，廟旺改力道，
// 吉煞改順逆，四化決定能量往哪走。八字這邊完全沒有對應的東西，
// 於是八字卡只剩下「日主是什麼」「十神是什麼」這種骨架，
// 而骨架人人都有，看起來就特別單薄。實測字數：紫微 6 張共 12,259 字，
// 八字 5 張共 4,578 字，八字只有紫微的 37%。
//
// 但資料一直都在，只是沒有被用：convertToBaZi() 早就算好了每一柱的神煞
//（一張盤通常十幾個）、地支之間的合沖刑害、納音、十二長生、空亡。
// 這些正是八字裡「同樣的日主，為什麼兩個人差這麼多」的答案，
// 跟紫微的吉煞四化是同一個層級的東西。這支模組把它們組成讀得懂的句子。
//
// 結構刻意跟 composePalaceModifiers() 一模一樣（summary / plainLines / technical），
// 呼叫端才不必為了兩個系統各寫一套渲染邏輯，
// 而且「白話面板永不渲染 technical」這條全站界線也才守得住。
import shenshaData from '../data/shensha-analysis.json' with { type: 'json' };
import branchData from '../data/branch-interactions-analysis.json' with { type: 'json' };

const SHENSHA_NOBLE = shenshaData['貴人星解讀'];
const SHENSHA_MALEFIC = shenshaData['煞星解讀'];
const RELATION_MEANING = branchData['關係類型解讀'];

const PILLAR_LABEL = {
  yearPillar: '年柱', monthPillar: '月柱', dayPillar: '日柱', hourPillar: '時柱',
  yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支',
};

/**
 * 柱位對應到的人生面向。
 * 神煞落在哪一柱，影響的就是哪一段——這是八字讀盤最基本的一層，
 * 但白話卡從來沒講過，使用者只看得到「你有天乙貴人」，不知道那是在講誰、哪個階段。
 */
const PILLAR_LIFE_WORD = {
  yearPillar: '早年與家庭背景',
  monthPillar: '成長環境、人際與事業土壤',
  dayPillar: '你自己與親密關係',
  hourPillar: '晚年、子女與人生後半段',
};

/**
 * 十二長生：日主在月令上的狀態，八字裡最接近紫微「廟旺利陷」的一層。
 *
 * 兩者要處理的是同一件事——先天的力道夠不夠。紫微的廟旺改的是主星能不能發揮，
 * 八字的十二長生改的是日主撐不撐得住。所以這裡的寫法也跟廟旺那組對齊：
 * 放在最前面單獨講底子，零術語，不出現長生、帝旺、墓、絕這些字。
 */
const TWELVE_STAGE = {
  長生: { tone: 'boost', effect: '日主處於初生之地，根基乾淨，後勁比爆發力強', voice: '你的底子是慢慢長出來的那一種：起步不快，但越往後越有東西' },
  沐浴: { tone: 'shift', effect: '日主未定型，易變動、易受環境影響', voice: '你的狀態容易被環境帶著走，換一個場合你可能整個人都不一樣' },
  冠帶: { tone: 'boost', effect: '日主漸成形，開始能承擔', voice: '你的底子正在成形：該扛的事你扛得起來，只是還在累積經驗' },
  臨官: { tone: 'boost', effect: '日主得地，自立能力強', voice: '你的底子夠自立：靠自己站得住，不太需要誰替你撐著' },
  帝旺: { tone: 'boost', effect: '日主最旺，力量足但易過剛', voice: '你的先天力道很足，做起事來比別人有勁，但也容易用力過頭' },
  衰: { tone: 'drag', effect: '日主過旺後轉弱，收斂但續航有限', voice: '你的力氣不是沒有，是續航比較短，撐太久會突然掉下來' },
  病: { tone: 'drag', effect: '日主偏弱，需要外援', voice: '你天生比較吃力，同樣的事你要花更多力氣，也更需要有人接一把' },
  死: { tone: 'drag', effect: '日主無力，靠內在而非外顯', voice: '你的能量不是往外衝的那種：硬拚會很累，把力氣用在想清楚上比較划算' },
  墓: { tone: 'shift', effect: '日主收藏，內斂而不外顯', voice: '你的東西都收在裡面：外人看不太出來，但你自己知道累積了什麼' },
  絕: { tone: 'shift', effect: '日主至極而轉，起伏大', voice: '你的狀態起伏比較大：有時候什麼都做得動，有時候整個提不起勁' },
  胎: { tone: 'shift', effect: '日主初萌，可塑性高', voice: '你還在成形的階段：現在學什麼像什麼，選擇比努力更關鍵' },
  養: { tone: 'boost', effect: '日主受養，得庇蔭而穩', voice: '你的底子有人在養著：不管是家人還是環境，你不太會真的落空' },
};

/**
 * 神煞的讀者視角。
 *
 * 資料檔（shensha-analysis.json）寫的是教學視角——「代表文書、學識與考運方面的加分」。
 * 那句話對想學八字的人是對的，但對只想知道「所以我會怎樣」的人沒有用。
 * 這裡每一顆各給一句第二人稱、給得出畫面的話，不出現神煞名，也不出現任何術語。
 *
 * 沒有寫進資料檔的那幾顆（十二神煞裡的亡神、地煞、天煞、年煞、月煞、災煞、
 * 華蓋、驛馬、將星、攀鞍、六害）在這裡一併補上 effect 與 voice，
 * 否則它們會出現在「專業資料」的清單卻沒有任何說明。
 */
const SHENSHA_VOICE = {
  // 貴人（助力）
  天乙貴人: { tone: 'boost', voice: '你遇到難處時常有人出手，而且多半是你沒開口的時候' },
  天德貴人: { tone: 'boost', voice: '你身上有一種讓人願意幫你的氣質，危險的事常在發生前就避開了' },
  月德貴人: { tone: 'boost', voice: '你心軟、也真的會幫人，這份善意長期會回到你身上' },
  天德合: { tone: 'boost', voice: '該有人接住你的時候通常會有人接住，你的運氣在關鍵時刻偏好' },
  文昌貴人: { tone: 'boost', voice: '你在考試、文件、需要條理表達的場合特別吃香' },
  學堂: { tone: 'boost', voice: '你學東西比別人快，讀書這件事對你是加分不是負擔' },
  太極貴人: { tone: 'boost', voice: '你對抽象、看不見的東西特別有感，這類領域你一學就通' },
  天廚貴人: { tone: 'boost', voice: '你不太會餓著：吃穿用度這一塊，你多半有辦法' },
  國印貴人: { tone: 'boost', voice: '你適合掌實權的位置，名分與職務對你是真的加分' },
  福星貴人: { tone: 'boost', voice: '你的日子有底：真的很糟的處境不太容易發生在你身上' },
  將星: { tone: 'boost', voice: '你在一群人裡自然會被推到帶頭的位置，你也扛得住' },
  攀鞍: { tone: 'boost', voice: '你有往上走的機會，而且多半是被人拉上去的' },
  十靈: { tone: 'boost', voice: '你的直覺準：說不出理由，但你的第一反應常常是對的' },
  華蓋: { tone: 'shift', voice: '你一個人的時候最有產能，熱鬧的場合反而會消耗你' },
  驛馬: { tone: 'shift', voice: '你停不太下來：搬家、換工作、往外跑，你的人生是移動的' },
  // 煞（阻力或需要留意的形式）
  紅艷煞: { tone: 'shift', voice: '你對人有吸引力，感情的事在你身上發生得比別人頻繁' },
  孤辰: { tone: 'drag', voice: '你習慣自己扛，久了跟人的距離就拉開了' },
  空亡: { tone: 'drag', voice: '有些事看起來到手了，真的要用的時候才發現抓不住' },
  喪門: { tone: 'drag', voice: '你對別人的離開特別敏感，那種失落你要很久才走得出來' },
  劫煞: { tone: 'drag', voice: '你容易在沒防備的地方被拿走一些東西——錢、時間或信任' },
  元辰: { tone: 'drag', voice: '你會在自己都說不清楚的時候消耗掉力氣，事後也想不起花在哪' },
  亡神: { tone: 'drag', voice: '你心裡總有一塊懸著：明明沒事，卻覺得有什麼還沒解決' },
  災煞: { tone: 'drag', voice: '突發的狀況你遇得比別人多，事先留一點餘裕對你特別重要' },
  天煞: { tone: 'drag', voice: '你會遇到自己怎麼努力都改不了的處境，那不是你的問題' },
  地煞: { tone: 'drag', voice: '你的阻力常來自環境本身，換一個地方情況就會不一樣' },
  年煞: { tone: 'drag', voice: '你容易被上一輩的事情牽住，那些不是你選的，但確實影響了你' },
  月煞: { tone: 'drag', voice: '你身邊的人事變動比較多，穩定的關係要靠你主動維持' },
  六害: { tone: 'drag', voice: '你和某些人就是合不來，不必勉強，保持距離對雙方都好' },
};

/** 十二神煞裡沒有寫進資料檔的那幾顆，在這裡補上教學視角的說明 */
const SHENSHA_EXTRA_EFFECT = {
  將星: '代表領導與統御的力量，容易在群體中取得主導位置。',
  攀鞍: '代表晉升與被提拔的機會，常與功名、職務調動有關。',
  驛馬: '代表移動與變遷，主奔波、遷徙、外出發展。',
  華蓋: '代表孤高與才藝，主宗教、藝術、研究等需要獨處的領域。',
  亡神: '代表內耗與失落，主心神不寧、暗中損耗。',
  災煞: '代表突發的災厄與意外，主無預警的變故。',
  天煞: '代表來自上位或不可抗力的壓制。',
  地煞: '代表來自環境與地域的阻礙。',
  年煞: '代表來自長輩或家族的牽制。',
  月煞: '代表人事變動與親近之人的離合。',
  六害: '代表相互妨害的關係，主人際上的猜忌與不合。',
};

/** 教學視角：資料檔有就用資料檔的，沒有的補上，兩邊說法才不會分歧 */
const shenshaEffect = (name) =>
  SHENSHA_NOBLE[name] ?? SHENSHA_MALEFIC[name] ?? SHENSHA_EXTRA_EFFECT[name] ?? '';


/**
 * 地支關係的讀者視角。
 *
 * 合沖刑害是八字裡最能解釋「為什麼你這一塊特別順／特別卡」的一層，
 * 但它一直只出現在專業資料的清單裡。這裡把每一種各給一句白話。
 */
const RELATION_VOICE = {
  六合: { tone: 'boost', voice: '你身上有兩股力量是互相幫忙的，這一塊的事情比較容易談成' },
  半合: { tone: 'boost', voice: '你有一組條件會互相搭配，遇到對的時機就會一起發揮' },
  半會: { tone: 'boost', voice: '你有一群同方向的力量，往那個方向走會特別順' },
  拱: { tone: 'boost', voice: '你有一塊沒說出口的優勢，時機到了它會自己補上來' },
  暗合: { tone: 'shift', voice: '有些事在檯面下就談好了，你自己都未必說得出是怎麼成的' },
  六沖: { tone: 'drag', voice: '你身上有兩股力量是互相拉扯的，這一塊的事情容易反覆' },
  六害: { tone: 'drag', voice: '你有一組條件會互相妨礙，事情常常在快成的時候出岔' },
  三刑: { tone: 'drag', voice: '你會在同一種情境上反覆卡住，那個坑你可能已經踩過好幾次' },
  相破: { tone: 'drag', voice: '你辛苦建立起來的東西容易被打散，收尾比開始更需要花力氣' },
};

const trimEnd = (text) => String(text).replace(/[。，、；\s]+$/, '');

/**
 * 組出這張八字盤的修正層。
 *
 * @param {object} baZi convertToBaZi() 的輸出
 * @param {object} [options]
 * @param {number} [options.maxShensha=6] 神煞取前幾個。一張盤通常有十幾個，
 *   全列出來會稀釋真正重要的訊號——這跟紫微那邊只取值得注意的雜曜是同一個判斷。
 * @returns {{
 *   summary: string,
 *   plainLines: string[],
 *   hasSignal: boolean,
 *   boostCount: number, dragCount: number, shiftCount: number,
 *   technical: { items: object[], lines: string[] }
 * }|null}
 */
export function composeBaziModifiers(baZi, options = {}) {
  if (!baZi) return null;
  const maxShensha = options.maxShensha ?? 6;
  const items = [];

  const push = (name, category, tone, effect, voice, source, pillar = null) => {
    if (!voice) return;
    items.push({ name, category, tone, effect, voice, source, pillar });
  };

  // 1) 日主的底子（十二長生）。放第一個，理由跟紫微把廟旺放第一個一樣：
  //    它修飾的是骨架本身，不是加減項。
  const stageName = baZi.pillarDetails?.dayPillar?.twelveStages;
  const stage = TWELVE_STAGE[stageName];
  if (stage) push(`日主${stageName}`, 'stage', stage.tone, stage.effect, stage.voice, '十二長生', 'dayPillar');

  // 2) 神煞。四柱輪流取，不是一柱一柱吃完。
  //
  //    第一版是依柱位順序走到額滿為止，結果年柱一柱就有六個神煞，
  //    額度全被吃光——輸出裡「早年與家庭背景」出現六次，月日時三柱一句都沒有。
  //    使用者看到的會是一張只講童年的八字盤。
  //    改成輪流取（年一個、月一個、日一個、時一個，再繞回來），
  //    人生四個階段才都講得到。
  const pillarOrder = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];
  const queues = pillarOrder.map((key) => ({ key, list: [...(baZi.shenshaList?.[key] ?? [])] }));
  let taken = 0;
  let round = 0;
  while (taken < maxShensha && queues.some((q) => q.list.length > round)) {
    for (const { key, list } of queues) {
      if (taken >= maxShensha) break;
      const name = list[round];
      if (!name) continue;
      const spec = SHENSHA_VOICE[name];
      if (!spec) continue;
      const isNoble = Boolean(SHENSHA_NOBLE[name]);
      push(name, isNoble ? 'noble' : 'malefic', spec.tone, shenshaEffect(name), spec.voice,
        isNoble ? '貴人星' : '神煞', key);
      taken++;
    }
    round++;
  }

  // 3) 地支關係。同一組關係會在 branchRelations 裡出現兩次（A對B、B對A），
  //    去重之後只講一次，否則同一句話會印兩遍。
  const seenRelations = new Set();
  for (const rel of baZi.branchRelations ?? []) {
    const key = `${rel.relation}:${[rel.branch, rel.with].sort().join('-')}`;
    if (seenRelations.has(key)) continue;
    seenRelations.add(key);
    const spec = RELATION_VOICE[rel.relation];
    if (!spec) continue;
    push(`${rel.pair}${rel.relation}`, 'relation', spec.tone,
      RELATION_MEANING[rel.relation] ?? '', spec.voice, '地支關係', rel.branch);
  }

  const boosts = items.filter((i) => i.tone === 'boost');
  const drags = items.filter((i) => i.tone === 'drag');
  const shifts = items.filter((i) => i.tone === 'shift');

  return {
    summary: summaryOf(items, boosts, drags, shifts),
    plainLines: plainLinesOf(items),
    narrative: narrativeOf(items),
    hasSignal: items.length > 0,
    boostCount: boosts.length,
    dragCount: drags.length,
    shiftCount: shifts.length,
    // 帶術語的一律收在 technical 底下，跟紫微同一個約定：
    // 叫 technical 的東西只會在學習模式與 AI 提示詞被讀取，白話面板從不渲染它。
    technical: {
      items,
      lines: items.map((i) => `${i.source}｜${i.name}：${i.effect}${
        i.pillar && PILLAR_LIFE_WORD[i.pillar] ? `（影響${PILLAR_LIFE_WORD[i.pillar]}）` : ''}`),
    },
  };
}

/**
 * 一句話講完這張盤被修成什麼樣子。
 * 跟紫微那邊一樣，刻意不給分數或強弱等級——命理沒有公認的權重，
 * 給了分數等於發明一套假的精準度，而使用者會把它當真。
 */
function summaryOf(items, boosts, drags, shifts) {
  // 這幾句會出現在白話模式，所以一個術語都不能有——「日主」「十神」都算術語
  // （tests/reading-modes.mjs 是硬界線）。講「你的底子」「基本的那幾項」就夠了。
  if (!items.length) return '你的盤上除了基本的那幾項以外，沒有特別突出的加減條件，底子怎麼說大致就是怎麼回事。';
  const parts = [];
  if (boosts.length) parts.push(`${boosts.length} 項助力`);
  if (drags.length) parts.push(`${drags.length} 項阻力`);
  if (shifts.length) parts.push(`${shifts.length} 項會改變形式的因素`);
  const mix = parts.join('、');
  if (boosts.length && drags.length) {
    return `你的盤上同時有${mix}，是拉扯型的：順的時候很順，卡的時候也真的卡，不能只看基本的那幾項。`;
  }
  if (drags.length && !boosts.length) {
    return `你的盤上有${mix}，方向不變，但過程會比字面上寫的費力。`;
  }
  if (boosts.length && !drags.length) {
    return `你的盤上有${mix}，方向不變，實際做起來比字面上寫的順。`;
  }
  return `你的盤上有${mix}，主題不變，但呈現的方式會跟只看基本那幾項不太一樣。`;
}

/**
 * 白話模式用的修正句。
 *
 * 底子（十二長生）先講，理由與紫微那邊完全相同：只印加分項會讓整段讀起來像一路順風，
 * 而命盤說的往往是「有資源但吃力」。底子不論好壞都要出現在第一句。
 * 其餘依助力、阻力、形式各取一到兩句，總數控制在五句以內——
 * 再多就變成清單，而清單是專業資料的形式，不是白話。
 */
function plainLinesOf(items) {
  const lines = [];
  const stage = items.find((i) => i.category === 'stage');
  if (stage) lines.push(`${trimEnd(stage.voice)}。`);

  const rest = items.filter((i) => i.category !== 'stage');
  const pick = (tone, n) => rest.filter((i) => i.tone === tone).slice(0, n);
  for (const item of [...pick('boost', 2), ...pick('drag', 2), ...pick('shift', 1)]) {
    lines.push(`${trimEnd(item.voice)}。`);
  }
  return lines.slice(0, 5);
}

/**
 * 完整報告用的敘事版。
 *
 * 為什麼要第二種寫法：完整報告與重點摘要取的是同一份修正層，
 * 兩頁印出一模一樣的句子就會回到「這兩頁根本一樣」那個老問題
 *（readability.mjs 有一條檢查專門擋跨頁重複句）。
 * 逐條版一項一句、句末是句號；這裡把兩項串進同一句，句子邊界就不會重疊。
 * 只取兩項是為了長度——可讀性檢查擋 78 字以上的句子。
 */
function narrativeOf(items) {
  const rest = items.filter((i) => i.category !== 'stage');
  if (!rest.length) return '';
  const picked = rest.length > 2 ? rest.slice(1, 3) : rest.slice(0, 2);
  const facts = picked.map((item) => trimEnd(item.voice)).join('、');
  const countWord = picked.length > 1 ? '這幾項' : '這一項';
  return `同樣看你的盤，還多了${countWord}：${facts}。`;
}

/**
 * 四柱各段人生：年月日時分別在講誰、什麼階段，以及那一柱上有什麼。
 *
 * 八字最基本的一層結構，但白話卡從來沒呈現過——使用者看得到四柱干支，
 * 卻不知道「年柱」是在講什麼。納音與十二長生也一併帶上，
 * 那兩項是每一柱都算好了卻從來沒被用到的資料。
 */
export function composePillarStages(baZi, modifiers = null) {
  if (!baZi?.fourPillars) return [];
  const order = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];
  // 修正層已經講過的神煞不要在這裡再講一次。
  // 兩塊常常出現在同一頁（命盤總覽的八字區、完整報告的第六節），
  // 同一句話印兩次會被 readability 的「同一頁不得有一字不差的重複句」擋下——
  // 那條檢查是對的，重複的句子會讓整頁看起來像機器湊出來的。
  // 同一顆神煞也可能同時落在兩柱（空亡、六害都很常見），所以這個集合在四柱之間共用、
  // 邊挑邊加——不然兩段會挑到同一顆，印出來還是重複句。
  const used = new Set((modifiers?.technical?.items ?? []).map((item) => item.name));
  return order.map((key) => {
    const pillar = baZi.fourPillars[key];
    const detail = baZi.pillarDetails?.[key] ?? {};
    const shensha = (baZi.shenshaList?.[key] ?? []).slice(0, 3);
    const tone = TWELVE_STAGE[detail.twelveStages]?.tone ?? 'shift';
    // 這一段的實際樣子：先講整體力道（由該柱的十二長生決定），
    // 再補一句這一柱上最明顯的神煞在生活裡怎麼出現。
    const named = shensha.find((name) => SHENSHA_VOICE[name] && !used.has(name));
    if (named) used.add(named);
    const impact = [
      PILLAR_IMPACT[key][tone],
      named ? trimEnd(SHENSHA_VOICE[named].voice) : '',
    ].filter(Boolean).map((text) => `${trimEnd(text)}。`).join('');
    return {
      key,
      label: PILLAR_LABEL[key],
      ganZhi: pillar ? `${pillar.stem}${pillar.branch}` : '',
      lifeWord: PILLAR_LIFE_WORD[key],
      impact,
      // technical 底下的東西白話面板不會渲染，跟全站約定一致
      technical: {
        nayin: detail.nayin ?? '',
        twelveStages: detail.twelveStages ?? '',
        shensha,
      },
    };
  });
}

/**
 * 每一柱在生活裡實際的樣子。
 *
 * 第一版寫的是「這一柱看的是你從哪裡來：家庭給了你什麼底子」——那是在解釋
 * 年柱這個名詞是什麼意思。使用者的回饋很準：「這些只能解釋那些位置要幹麻，
 * 適合放在學習的頁面，但一般使用者看不懂，與其解釋年柱，不如直接陳述它帶來的影響。」
 *
 * 完全同意。定義屬於學習模式，白話模式要回答的是「所以我會怎樣」。
 * 現在每一柱依它自己的十二長生取一句，講那一段人生實際走起來是順是卡，
 * 後面再接一句該柱最明顯的神煞在生活裡怎麼出現——兩句都是從這張盤算出來的，
 * 不是套在誰身上都成立的通則。
 */
const PILLAR_IMPACT = {
  yearPillar: {
    boost: '你的起點是穩的：早年家裡給得出支撐，讓你不必太早為生存操心',
    drag: '你的早年要靠自己補起來：家裡能給的有限，很多事你得比同齡人早學會',
    shift: '你的早年環境變動不小：搬遷、家裡狀況起伏，讓你很早就學會適應',
  },
  monthPillar: {
    boost: '你成長的環境是幫你的：機會、人脈與可以請教的人都不缺，發展比別人省力',
    drag: '你成長的環境給的壓力比資源多：能力多半是被磨出來的，不是被養出來的',
    shift: '你成長的環境常在換：換城市、換圈子、換方向，你的路線不是一條直線',
  },
  dayPillar: {
    boost: '你自己這一塊是穩的：狀態好的時候撐得住事，親近的關係也給得起支持',
    drag: '你自己這一塊比較耗：撐久了會掉下來，最親近的關係也需要你多花心力經營',
    shift: '你自己這一塊起伏明顯：有時候什麼都做得動，有時候整個提不起勁，親近的關係也跟著波動',
  },
  hourPillar: {
    boost: '你的後半段是往上的：越晚越有東西，跟晚輩的緣分也算順',
    drag: '你的後半段要及早準備：晚年的餘裕不會自己出現，跟晚輩的相處也需要主動經營',
    shift: '你的後半段會換一種活法：重心跟前半生不一樣，晚輩帶來的變化也不小',
  },
};

/** 四柱各自在講什麼：給「四柱各段人生」卡片用 */
export const PILLAR_MEANING = PILLAR_LIFE_WORD;

// src/engines/compose-synastry.js — 雙人合盤引擎(純規則組裝)
// 比對維度:
//   1) 日主五行生剋(兩人本質的互動方向)
//   2) 年支/日支合沖刑害(緣分結構:家庭層 vs 親密層)
//   3) 喜用神互補(誰天生補得到誰)
//   4) 紫微夫妻宮 × 對方命宮(理想伴侶輪廓 vs 真實本性,雙向)
//   5) 契合指數與相處建議
import traitTags from '../data/star-trait-tags.json' with { type: 'json' };
import { relationsBetween, relationDisplayName } from './compose-branch-relations.js';
import { computeYongShen } from './compose-yongshen.js';
import { tenGodOf } from './compose-luck.js';

const TAGS = traitTags['主星特質標籤'];
const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// ---------- 白話句庫 ----------

const DAYMASTER_PLAIN = {
  同氣: (a, b) => `${a}和${b}本質相近,相處像照鏡子——理解彼此很快,但意見相左時也容易互不相讓。`,
  A生B: (a, b) => `${a}天生會滋養、成就${b},付出多半是自然而然的;要留意的是別讓這份照顧變成單向消耗。`,
  A剋B: (a, b) => `${a}對${b}有塑造力——能推動${b}成長,但力道太強會變成壓力,拿捏分寸是這段關係的功課。`,
};

// 關係型態:各自的用詞(相處層名稱、紫微對照宮位、「理想輪廓」說法)
export const RELATION_TYPES = {
  戀人: { layer: '親密', palace: '夫妻宮', ideal: '心中理想伴侶的樣貌' },
  親子: { layer: '家人相處', palace: '子女宮', ideal: '心中期待的家人樣貌' },
  朋友: { layer: '相處', palace: '僕役宮', ideal: '心中理想朋友的輪廓' },
  同事: { layer: '共事', palace: '僕役宮', ideal: '心中理想隊友的輪廓' },
};

// 日支(相處層)關係白話({L} = 關係型態的相處層用詞)
const DAY_BRANCH_PLAIN = {
  六合: (L) => `兩人的${L}頻道天生合拍,在一起自帶默契,不太需要解釋就懂彼此。`,
  半合: () => '相處同頻加分,興趣與步調容易走在一起。',
  半會: () => '氣場同類相吸,愈熟愈像,是會互相強化的組合。',
  暗合: () => '有種外冷內熱的隱形牽引,表面平淡、私下熟,緣分常在不知不覺中加深。',
  拱: () => '兩人聯手時能量會聚焦,一起做事比各自努力更有成果。',
  沖: () => '互相吸引也互相拉扯,聚散的節奏比較大,關係需要「留白」才走得久。',
  刑: (L) => `容易在${L}關係裡較勁,磨合期比別人長,急不得、吵不贏。`,
  害: () => '小誤會容易悄悄累積,要刻意保持溝通,別讓「以為對方知道」變成心結。',
  相破: () => '生活節奏容易互相打亂,計畫多留彈性,少排死行程。',
  伏吟: () => '日支相同,像遇到同款靈魂——相處舒服省力,但也少了點火花,需要主動製造新鮮感。',
};

// 年支(家庭與整體緣分層)關係白話
const YEAR_BRANCH_PLAIN = {
  六合: '兩家的氣場合得來,長輩緣與家庭相處相對順利。',
  半合: '家庭背景與價值觀容易對頻,融入彼此生活圈不費力。',
  半會: '成長背景同氣相求,聊起過去特別有共鳴。',
  暗合: '兩人的緣分有隱性的家世牽連,認識後常發現意外的共同點。',
  拱: '兩個家庭合作時反而能成事,婚喪喜慶等大場面彼此幫襯。',
  沖: '原生家庭的習慣差異較大,過年過節等家庭場合需要多協調。',
  刑: '雙方家庭之間容易有立場較勁,當事人要當好中間的橋。',
  害: '家庭往來中留意言語誤會,尤其轉述話語要謹慎。',
  相破: '兩家的步調不同,重大決定避免倉促同步。',
  伏吟: '年支相同,成長背景相似度高,家庭觀念容易一致。',
};

// 紫微「理想 vs 真實」呼應句(ideal = 關係型態的「理想輪廓」用詞)
const RESONANCE_PLAIN = {
  high: (a, b, ideal) => `${a}${ideal},和${b}的本性高度接近——這段關係「對頻」的成分是天生的。`,
  mid: (a, b) => `${a}期待的相處樣貌和${b}的本性有部分重疊,合拍的地方很合,其餘要靠認識彼此的真實面。`,
  low: (a, b) => `${b}並不是${a}想像中的「類型」——但這不一定是壞事,代表這段關係是在認識一個真實的人,而不是套模板。`,
};

// ---------- 工具 ----------

function effectiveStars(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const palace = ziWei.palaces.find((p) => p.name === palaceName);
  let stars = palace.majorStars.map((s) => s.name);
  let borrowed = false;
  if (!stars.length) {
    const opp = byBranch[BRANCHES[(BRANCHES.indexOf(palace.position[1]) + 6) % 12]];
    stars = opp.majorStars.map((s) => s.name);
    borrowed = true;
  }
  return { stars, borrowed };
}

function tagOverlap(starsA, starsB) {
  const setA = new Set(starsA.flatMap((n) => TAGS[n] ?? []));
  const setB = new Set(starsB.flatMap((n) => TAGS[n] ?? []));
  return [...setA].filter((t) => setB.has(t)).length;
}

const fmtEls = (arr) => arr.map((x) => x.element).join('、');

/**
 * 雙人合盤
 * @param {object} A { name, input, baZi, ziWei }
 * @param {object} B { name, input, baZi, ziWei }
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ score, tier, sections: Array<{title, text}>, text }}
 */
export function composeSynastry(A, B, { mode = 'public', relation = '戀人' } = {}) {
  const REL = RELATION_TYPES[relation] ?? RELATION_TYPES['戀人'];
  const sections = [];
  let score = 60;

  const stemA = A.baZi.fourPillars.dayPillar.stem;
  const stemB = B.baZi.fourPillars.dayPillar.stem;
  const elA = STEM_EL[stemA];
  const elB = STEM_EL[stemB];

  // ---- 1. 性格底色:日主五行互動 ----
  const s1 = [];
  if (elA === elB) s1.push(DAYMASTER_PLAIN['同氣'](A.name, B.name));
  else if (SHENG[elA] === elB) s1.push(DAYMASTER_PLAIN['A生B'](A.name, B.name));
  else if (SHENG[elB] === elA) s1.push(DAYMASTER_PLAIN['A生B'](B.name, A.name));
  else if (KE[elA] === elB) s1.push(DAYMASTER_PLAIN['A剋B'](A.name, B.name));
  else if (KE[elB] === elA) s1.push(DAYMASTER_PLAIN['A剋B'](B.name, A.name));
  if (mode === 'study') {
    s1.push(`依據:${A.name}日主${stemA}(${elA})、${B.name}日主${stemB}(${elB});` +
      `${A.name}在${B.name}命中為${tenGodOf(stemB, stemA)},${B.name}在${A.name}命中為${tenGodOf(stemA, stemB)}。`);
  }
  sections.push({ title: '一、性格底色', text: s1.join('\n') });

  // ---- 2. 緣分結構:日支(親密層)+ 年支(家庭層) ----
  const s2 = [];
  const scoreRel = (rels, same, plainMap, weightMul) => {
    const WEIGHT = { 六合: 8, 半合: 5, 半會: 4, 暗合: 5, 拱: 4, 沖: -6, 刑: -5, 害: -4, 相破: -3 };
    const lines = [];
    if (same) {
      lines.push(typeof plainMap['伏吟'] === 'function' ? plainMap['伏吟'](REL.layer) : plainMap['伏吟']);
      score += Math.round(4 * weightMul);
    }
    for (const r of rels) {
      const entry = plainMap[r];
      if (entry) lines.push(typeof entry === 'function' ? entry(REL.layer) : entry);
      score += Math.round((WEIGHT[r] ?? 0) * weightMul);
    }
    return lines;
  };

  const dayBrA = A.baZi.fourPillars.dayPillar.branch;
  const dayBrB = B.baZi.fourPillars.dayPillar.branch;
  const dayRels = relationsBetween(dayBrA, dayBrB);
  const dayLines = scoreRel(dayRels, dayBrA === dayBrB, DAY_BRANCH_PLAIN, 1);
  s2.push(dayLines.length
    ? `${REL.layer}層(日支):${dayLines.join(' ')}`
    : `${REL.layer}層(日支):兩人的日支沒有特別的合沖,相處走自然發展路線,沒有天生的加速器、也沒有地雷。`);

  const yearBrA = A.baZi.fourPillars.yearPillar.branch;
  const yearBrB = B.baZi.fourPillars.yearPillar.branch;
  const yearRels = relationsBetween(yearBrA, yearBrB);
  const yearLines = scoreRel(yearRels, yearBrA === yearBrB, YEAR_BRANCH_PLAIN, 0.5);
  s2.push(yearLines.length
    ? `家庭層(年支):${yearLines.join(' ')}`
    : '家庭層(年支):兩家背景沒有明顯的牽動,家庭相處靠後天經營,起點是中性的。');

  if (mode === 'study') {
    const fmt = (rels, a, b) => rels.length ? rels.map((r) => relationDisplayName(r, a + b)).join('、') : '無';
    s2.push(`依據:日支${dayBrA}×${dayBrB}(${fmt(dayRels, dayBrA, dayBrB)});年支${yearBrA}×${yearBrB}(${fmt(yearRels, yearBrA, yearBrB)})。`);
  }
  sections.push({ title: '二、緣分結構', text: s2.join('\n') });

  // ---- 3. 能量互補:喜用神 ----
  const ysA = computeYongShen(A.baZi);
  const ysB = computeYongShen(B.baZi);
  const s3 = [];
  const aFeedsB = ysB.favorable.some((f) => f.element === elA);
  const bFeedsA = ysA.favorable.some((f) => f.element === elB);
  const aHurtsB = ysB.unfavorable.some((f) => f.element === elA);
  const bHurtsA = ysA.unfavorable.some((f) => f.element === elB);

  if (aFeedsB) { s3.push(`${A.name}的日主屬${elA},正是${B.name}命裡需要的喜用神——${A.name}的存在本身就在幫${B.name}補氣。`); score += 6; }
  if (bFeedsA) { s3.push(`${B.name}的日主屬${elB},正是${A.name}命裡需要的喜用神——跟${B.name}相處,${A.name}會覺得被穩穩接住。`); score += 6; }
  if (aHurtsB) { s3.push(`要留意:${A.name}屬${elA},是${B.name}的忌神方向——相處濃度太高時,${B.name}容易感到耗損,保留各自空間會更好。`); score -= 4; }
  if (bHurtsA) { s3.push(`要留意:${B.name}屬${elB},是${A.name}的忌神方向——${A.name}要注意別在關係裡過度消耗自己。`); score -= 4; }
  if (!s3.length) s3.push('兩人的五行能量互不衝突也不特別互補,是中性的組合——關係品質取決於相處方式,而不是天生體質。');
  if (mode === 'study') {
    s3.push(`依據:${A.name}${ysA.strength},喜${fmtEls(ysA.favorable)}、忌${fmtEls(ysA.unfavorable)};${B.name}${ysB.strength},喜${fmtEls(ysB.favorable)}、忌${fmtEls(ysB.unfavorable)}。`);
  }
  sections.push({ title: '三、能量互補', text: s3.join('\n') });

  // ---- 4. 理想與真實:依關係型態選對照宮位(戀人=夫妻宮、親子=子女宮、朋友/同事=僕役宮)× 對方命宮(雙向) ----
  const s4 = [];
  const pair = (X, Y) => {
    const spouse = effectiveStars(X.ziWei, REL.palace);
    const self = effectiveStars(Y.ziWei, '命宮');
    const overlap = tagOverlap(spouse.stars, self.stars);
    const tier = overlap >= 2 ? 'high' : overlap === 1 ? 'mid' : 'low';
    score += overlap >= 2 ? 5 : overlap === 1 ? 2 : 0;
    let line = RESONANCE_PLAIN[tier](X.name, Y.name, REL.ideal);
    if (mode === 'study') {
      line += `(依據:${X.name}${REL.palace}${spouse.stars.join('、')}${spouse.borrowed ? '(借)' : ''} × ${Y.name}命宮${self.stars.join('、')}${self.borrowed ? '(借)' : ''},特質交集${overlap}項)`;
    }
    return line;
  };
  s4.push(pair(A, B));
  s4.push(pair(B, A));
  sections.push({ title: '四、理想與真實', text: s4.join('\n') });

  // ---- 5. 總結 ----
  score = Math.max(5, Math.min(95, Math.round(score)));
  const tier =
    score >= 80 ? '天作之合型' :
    score >= 70 ? '自然契合型' :
    score >= 60 ? '互補成長型' :
    score >= 50 ? '磨合學習型' : '挑戰修煉型';
  const tierAdvice = {
    天作之合型: '底子非常好,唯一要防的是把默契當理所當然——好關係也需要說出口的感謝。',
    自然契合型: '大方向合拍,小地方的差異用溝通就能過,是省力型的組合。',
    互補成長型: '你們不像、但互相需要——把差異當分工而不是分歧,關係會愈走愈穩。',
    磨合學習型: '需要比別人多一點耐心與明說的溝通,熬過磨合期的感情反而扎實。',
    挑戰修煉型: '天生頻道差異較大,這段關係更像一場修煉——想清楚彼此要什麼,誠實面對比硬撐重要。',
  }[tier];

  sections.push({
    title: '五、契合總結',
    text: [
      `契合指數:${score}/100(${tier})`,
      tierAdvice,
      '提醒:指數由日支年支關係、喜用互補、紫微對照等規則計算,反映的是「天生的起點」,不是關係的結局——真正決定關係品質的,永遠是兩個人怎麼相處。',
    ].join('\n'),
  });

  const communicator = (el) => ({ 木:'先談方向與成長',火:'直接表達感受',土:'需要具體與穩定',金:'重視邏輯與原則',水:'傾向觀察後再說' }[el]);
  sections.push({
    title: '六、溝通與衝突修復',
    text: `${A.name}${communicator(elA)}，${B.name}${communicator(elB)}。發生衝突時，先各自說明「我需要什麼」，再討論誰對誰錯；若日支有沖刑害，更適合約定暫停時間與重新對話的方式。`,
  });
  sections.push({
    title: '七、金錢與合作節奏',
    text: `${A.name}的喜用方向為${fmtEls(ysA.favorable) || '中性'}，${B.name}的喜用方向為${fmtEls(ysB.favorable) || '中性'}。共同財務宜分成日常、個人與長期目標三個帳戶；命理互補只能提示習慣差異，不應取代預算、契約與風險評估。`,
  });
  const thisYear = new Date().getFullYear();
  sections.push({
    title: `八、${thisYear} 關係節奏`,
    text: `今年適合把關係目標寫成可執行安排：固定溝通、共同計畫與各自空間。流年只描述時間氛圍，若遇到健康、法律或財務問題，仍應以專業資訊為準。`,
  });

  return { score, tier, sections, text: sections.map((s) => `【${s.title}】\n${s.text}`).join('\n\n') };
}

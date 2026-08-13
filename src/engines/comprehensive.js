// src/engines/comprehensive.js — 命盤綜合解析（純規則組裝，不呼叫外部 API）
// generateZiweiComprehensiveReading:6 段紫微綜合解讀
// generateBaziComprehensiveReading:3 段八字綜合解讀
import palaceStarDb from '../data/palace-star-meanings.json' with { type: 'json' };
import doubleStarDb from '../data/double-star-combinations.json' with { type: 'json' };
import assembly from '../data/comprehensive-reading-assembly.json' with { type: 'json' };
import doubleLogic from '../data/double-star-assembly-logic.json' with { type: 'json' };
import traitTags from '../data/star-trait-tags.json' with { type: 'json' };
import focusSection from '../data/current-focus-section.json' with { type: 'json' };
import baziReading from '../data/bazi-comprehensive-reading.json' with { type: 'json' };
import elementDb from '../data/five-element-analysis.json' with { type: 'json' };
import tenGodsDb from '../data/ten-gods-meanings.json' with { type: 'json' };
import { BRIGHTNESS_ALIAS } from './compose.js';
import { tenGodOf, composeBaZiCycleOverlay, categoryOf, categoryLabel } from './compose-luck.js';
import { composeElementAnalysis } from './compose-elements.js';
import { composeShenShaReading } from './compose-shensha.js';
import { composePillarStages, composeBaziModifiers } from './compose-bazi-modifiers.js';
import { composeBranchRelationsReading, relationDisplayName } from './compose-branch-relations.js';
import luckOverlayDb from '../data/luck-cycle-overlays.json' with { type: 'json' };
import shenshaDb from '../data/shensha-analysis.json' with { type: 'json' };

const COMBOS = doubleStarDb['雙主星組合'];
const TAGS = traitTags['主星特質標籤'];
const STAR_ORDER = doubleLogic['星曜正規化排序表']['順序'];
const ADVICE = assembly['條件式建議句庫'];
const FOCUS = focusSection['第6段_當前焦點'];
const LUCK_CATEGORY_DESC = luckOverlayDb['八字大運流年類別疊加']['類別解讀'];
const SHENSHA_CORE = { ...shenshaDb['貴人星解讀'], ...shenshaDb['煞星解讀'] };

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];
const fill = (tpl, vars) => tpl.replace(/\{(.+?)\}/g, (_, k) => vars[k] ?? `{${k}}`);

// ---------- 文案變化（依主星/十神組合挑選不同連接句，避免每個人開頭都長得一模一樣） ----------
/** 由多個字串組成穩定的種子值：同一人多次產生報告時結果不變，但不同星曜/十神組合會落在不同分支 */
function seedFrom(...keys) {
  const s = keys.filter(Boolean).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
/** slot 可能是單一字串（舊格式）或多個變化版本的陣列；陣列時依 seed 挑一個，同一人穩定拿到同一版 */
function pick(slot, seed = 0) {
  return Array.isArray(slot) ? slot[seed % slot.length] : slot;
}
const branchOf = (p) => p.position[1];

// ---------- 雙星組裝邏輯（double-star-assembly-logic.json） ----------

/** 依星曜正規化排序表排序 */
function normalizeStars(names) {
  return [...names].sort((a, b) => STAR_ORDER.indexOf(a) - STAR_ORDER.indexOf(b));
}

/** 決定主句：單星 / 雙星組合 / 退回單星疊加（3星以上只取前兩顆判斷） */
function resolveMainText(contextPalace, starNames) {
  const get = (s) => palaceStarDb[contextPalace]?.[s] ?? '';
  if (starNames.length === 1) return get(starNames[0]);

  const pair = normalizeStars(starNames).slice(0, 2);
  const combo = COMBOS[`${pair[0]}+${pair[1]}`];
  if (combo) return combo;
  // 找不到組合 → 退回單星疊加:{星1單星解釋}同時,{星2單星解釋}
  return `${get(pair[0])}同時，${get(pair[1])}`;
}

const BRIGHTNESS_PLAIN = palaceStarDb['亮度原始等級白話'];

/**
 * 主句之後依序疊加亮度、四化（與四化亮度疊加的優先順序）。
 * 亮度疊加句是通用模板（依廟旺平陷分四級），若同一宮位有多顆星落在同一級距，
 * 直接各自套用會變成同一句話重複兩次、只換星名——比照五行分析的修正原則，
 * 改成先依等級分組，同級距的星合併成一句，避免重複段落。
 * 另外原本「星名亮度得——此星的特質穩定發揮」這種寫法太術語化，
 * 一般使用者看不懂「得」是什麼，改成白話說明（廟旺得利平不陷各自的白話 + 具體影響）。
 */
function applyOverlays(text, stars, mode = 'public') {
  const parts = [text];
  if (mode !== 'study') return parts.join(' '); // 大眾版：只留結論句，不引用亮度/四化依據

  const brightnessGroups = new Map(); // bKey -> [star,...]
  for (const s of stars) {
    const bKey = BRIGHTNESS_ALIAS[s.brightness];
    if (bKey && palaceStarDb['亮度疊加'][bKey]) {
      if (!brightnessGroups.has(bKey)) brightnessGroups.set(bKey, []);
      brightnessGroups.get(bKey).push(s);
    }
  }
  for (const [bKey, group] of brightnessGroups) {
    const label = group
      .map((s) => `${s.name}的亮度是「${s.brightness}」${BRIGHTNESS_PLAIN[s.brightness] ? `(${BRIGHTNESS_PLAIN[s.brightness]})` : ''}`)
      .join('、');
    parts.push(`${label},${palaceStarDb['亮度疊加'][bKey]}`);
  }

  for (const s of stars) {
    if (!s.transformation) continue;
    const key = `化${s.transformation}`;
    if (palaceStarDb['四化疊加'][key]) parts.push(`${s.name}${key}——${palaceStarDb['四化疊加'][key]}`);
  }
  return parts.join(' ');
}

/** 取某宮位的完整解釋（空宮自動借對宮，文案用對宮情境） */
function palaceReadingOf(ziWei, palace, { overlays: withOverlays = true, mode = 'public' } = {}) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  let stars = palace.majorStars;
  let ctx = palace.name;
  let borrowed = false;
  if (stars.length === 0) {
    const opp = byBranch[BRANCHES[(BRANCHES.indexOf(branchOf(palace)) + 6) % 12]];
    if (opp?.majorStars.length) { stars = opp.majorStars; ctx = opp.name; borrowed = true; }
    else return { text: '', stars: [], borrowed: false };
  }
  const main = resolveMainText(ctx, stars.map((s) => s.name));
  return {
    text: withOverlays ? applyOverlays(main, stars, mode) : main,
    stars: stars.map((s) => s.name),
    borrowed,
    ctx, // 借星時 = 借用的對宮名稱，否則 = 本宮名稱
  };
}

// ---------- 四化行動建議 fallback(條件式建議句庫未覆蓋的宮位，用「宮位領域×四化語氣」通用模板) ----------

const PALACE_DOMAIN = {
  命宮: '整體狀態與個人發揮', 兄弟宮: '手足與平輩關係', 夫妻宮: '感情關係',
  子女宮: '子女、晚輩與創作', 財帛宮: '財務', 疾厄宮: '健康',
  遷移宮: '外出與外在際遇', 僕役宮: '人際與合作', 官祿宮: '事業',
  田宅宮: '家庭與不動產', 福德宮: '心境與精神生活', 父母宮: '與長輩的互動',
};

// 大眾版（mode:'public'）不掛「僕役宮化忌,」這種前綴——那是判斷依據，不是給一般人看的內容。
// 一般人只需要知道「哪一塊、會怎樣、可以怎麼做」；要看依據的人本來就會切到專業命盤模式。
const ADVICE_FALLBACK = {
  祿: (p, cite) => `${cite(`${p}化祿，`)}${PALACE_DOMAIN[p]}方面有順遂加分的跡象，適合主動經營、把握機會。`,
  權: (p, cite) => `${cite(`${p}化權，`)}${PALACE_DOMAIN[p]}方面的主導性與企圖心增強，可以多承擔一些，但留意姿態別過於強勢。`,
  科: (p, cite) => `${cite(`${p}化科，`)}${PALACE_DOMAIN[p]}方面容易獲得肯定與貴人助力，適合累積口碑與形象。`,
  忌: (p, cite) => `${cite(`${p}化忌，`)}${PALACE_DOMAIN[p]}方面容易出現糾結或阻礙，建議放慢腳步、謹慎應對。`,
};

// ---------- 特質標籤呼應判斷（star-trait-tags.json） ----------

function resonanceSentence(starsA, starsB) {
  const setA = new Set(starsA.flatMap((n) => TAGS[n] ?? []));
  const setB = new Set(starsB.flatMap((n) => TAGS[n] ?? []));
  const overlap = [...setA].filter((t) => setB.has(t)).length;
  const logic = traitTags['呼應差異判斷邏輯'];
  if (overlap >= 2) return logic['交集數量>=2'];
  if (overlap === 1) return logic['交集數量=1'];
  return logic['交集數量=0'];
}

// ---------- 紫微 6 段綜合解析 ----------

/**
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} [opts] { year, age }
 * @returns {{ sections: Array<{title, text}>, text: string }}
 */
export function generateZiweiComprehensiveReading(ziWei, { year = new Date().getFullYear(), age = ziWei.age, mode = 'public' } = {}) {
  const byName = Object.fromEntries(ziWei.palaces.map((p) => [p.name, p]));
  const reading = (name, opt) => palaceReadingOf(ziWei, byName[name], { ...opt, mode });
  const sections = [];

  // 段落內去重：空宮借對宮時，若被借的對宮在同一段落已經完整講過，
  // 不再貼一次一模一樣的整段文字，改用短句指回（例：福德宮借財帛宮，而財帛宮上一句才剛講完）
  //
  // 另外還有一種跨段落的重複：同一個宮位本來就會在兩段裡各出現一次
  // (例如田宅宮同時屬於「事業與金錢」的資源面與「健康、家庭與人際」的居家面),
  // 舊版兩段都完整貼一次，使用者會在同一份報告裡讀到一字不差的整段文字。
  // reportSeen 記錄整份報告已經完整描述過的宮位，第二次出現時改成一句話指回去。
  const reportSeen = new Map(); // 宮位名稱 → 該宮位第一次出現時所在的段落標題
  const readingDeduped = (name, seen, opt) => {
    const r = reading(name, opt);
    if (r.borrowed && seen.has(r.ctx)) {
      seen.add(name);
      return { ...r, text: `本宮無主星，借對宮${r.ctx}的${r.stars.join('、')}參看，方向與前述${r.ctx}的特質一致。` };
    }
    seen.add(name);
    if (reportSeen.has(name)) {
      return { ...r, text: `這一塊在「${reportSeen.get(name)}」已經談過，方向一致，這裡不再重複。` };
    }
    return r;
  };
  /** 段落組完後呼叫：把這一段完整描述過的宮位登記起來，之後其他段落再遇到就只做指回 */
  const markDescribed = (sectionTitle, ...names) => {
    for (const n of names) if (!reportSeen.has(n)) reportSeen.set(n, sectionTitle);
  };

  // 第1段：性格才華（命宮 + 身宮）
  // 身宮偶爾會與命宮落在同一宮（同宮），此時直接各自完整輸出會變成同一段星曜解釋重複兩次，
  // 需先檢查兩者是否同宮，同宮時合併講一次並點出『高度疊合』的意義，而非各自平鋪直述。
  const life = reading('命宮');
  const bodyPalace = ziWei.palaces.find((p) => p.isBodyPalace);
  const bodyIsLifePalace = bodyPalace.name === '命宮';
  const s1p = assembly['第1段_性格才華'];
  const s1seed = seedFrom(...life.stars);
  const s1lines = [
    pick(life.borrowed ? s1p['命宮空宮時開頭'] : s1p['命宮有主星時開頭'], s1seed) + life.text,
    bodyIsLifePalace
      ? fill(s1p['身宮與命宮同宮時'], { 命宮解釋: life.text })
      : fill(pick(s1p['連接句模板'][1], s1seed), { 身宮宮位名稱: bodyPalace.name, 身宮解釋: reading(bodyPalace.name).text }),
  ];
  sections.push({ title: '一、性格與才華', text: s1lines.join('') });

  // 第2段：事業金錢（官祿 → 財帛 → 福德 → 田宅 + 呼應判斷）
  const s2p = assembly['第2段_事業金錢'];
  const s2seen = new Set();
  const career = readingDeduped('官祿宮', s2seen);
  const wealth = readingDeduped('財帛宮', s2seen);
  const s2seed = seedFrom(...career.stars, ...wealth.stars);
  const s2lines = [
    fill(pick(s2p['連接句模板'][0], s2seed), { 官祿宮解釋: career.text }),
    fill(s2p['連接句模板'][1], { 財帛宮解釋: wealth.text }),
    fill(s2p['連接句模板'][2], { 福德宮解釋: readingDeduped('福德宮', s2seen).text }),
    fill(s2p['連接句模板'][3], { 田宅宮解釋: readingDeduped('田宅宮', s2seen).text }),
    fill(s2p['連接句模板'][4], { 是否呼應判斷句: resonanceSentence(career.stars, wealth.stars) }),
  ];
  sections.push({ title: '二、事業與金錢', text: s2lines.join('') });
  // 這一段已完整描述過的宮位：第4段再遇到田宅宮時只做指回，不再貼一次同樣的整段文字
  markDescribed('二、事業與金錢', '官祿宮', '財帛宮', '福德宮', '田宅宮');

  // 第3段：戀愛婚姻（夫妻宮 + 四化）
  const s3p = assembly['第3段_戀愛婚姻'];
  const spousePalace = byName['夫妻宮'];
  const spouse = palaceReadingOf(ziWei, spousePalace, { overlays: false, mode });
  const spouseMutagens = spousePalace.majorStars.filter((s) => s.transformation);
  const s3seed = seedFrom(...spouse.stars);
  const s3lines = [fill(pick(s3p['連接句模板'][0], s3seed), { 夫妻宮解釋: spouse.text })];
  if (spouseMutagens.length) {
    for (const s of spouseMutagens) {
      const key = `化${s.transformation}`;
      s3lines.push(fill(s3p['連接句模板'][1], { 四化名稱: `${s.name}${key}`, 四化疊加句: palaceStarDb['四化疊加'][key] }));
    }
  } else {
    s3lines.push(s3p['無四化時結尾句']);
  }
  sections.push({ title: '三、戀愛與婚姻', text: s3lines.join('') });

  // 第4段：健康家庭人際（疾厄 → 父母 → 田宅 → 交友/僕役）
  const s4p = assembly['第4段_健康家庭人際'];
  const s4seen = new Set();
  const illness = readingDeduped('疾厄宮', s4seen);
  const s4seed = seedFrom(...illness.stars);
  const s4lines = [
    fill(pick(s4p['連接句模板'][0], s4seed), { 疾厄宮解釋: illness.text }),
    fill(s4p['連接句模板'][1], { 父母宮解釋: readingDeduped('父母宮', s4seen).text }),
    fill(s4p['連接句模板'][2], { 田宅宮解釋: readingDeduped('田宅宮', s4seen, { overlays: false }).text }),
    fill(s4p['連接句模板'][3], { 交友宮解釋: readingDeduped('僕役宮', s4seen).text }),
  ];
  sections.push({ title: '四、健康、家庭與人際', text: s4lines.join('') });

  // 第5段：行動建議(掃描 12 宮四化 → 條件式建議句庫；句庫沒有的宮位組合退回通用模板，
  // 避免像舊版一樣紫微化權（子女宮）、武曲化忌（僕役宮）因缺 key 被整條跳過)
  const s5p = assembly['第5段_行動建議'];
  const cite = (text) => (mode === 'study' ? text : ''); // 判斷依據只在專業命盤模式出現
  const hits = [];
  for (const p of ziWei.palaces) {
    for (const s of p.majorStars) {
      if (!s.transformation) continue;
      // 句庫裡的句子是以「官祿宮化權，事業上…」這種格式寫死的。
      // 大眾版把開頭的依據剝掉，只留後面看得懂的部分；句庫本身不動，專業命盤模式照舊完整顯示。
      const fromDb = ADVICE[`化${s.transformation}_${p.name}`];
      const sentence = fromDb
        ? (mode === 'study' ? fromDb : fromDb.replace(/^[一-龥]{1,4}宮化[祿權科忌][,，]\s*/, ''))
        : ADVICE_FALLBACK[s.transformation]?.(p.name, cite);
      if (sentence && !hits.includes(sentence)) hits.push(sentence);
    }
  }
  // 結尾句原本是「掌握有利的流向、留意需要調整的模式，是這段時間可以著力的方向。」——
  // 它沒有傳達任何新資訊，只是把上面講過的話換句話說，直接拿掉比留著更好讀。
  sections.push({
    title: '五、行動建議',
    text: [s5p['開頭句'], ...hits].join(''),
  });

  // 第6段：當前焦點（大限 + 流年,current-focus-section.json）
  // 大限宮位與流年宮位偶爾會剛好相同，此時要先比對、合併成一次完整解讀，
  // 不要大限、流年各自完整輸出一次同一段星曜解讀（跟八字大運流年類別重複是同一種bug）。
  const limit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return age >= a && age <= b;
  });
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [branchOf(p), p]));
  const gz = yearGanZhi(year);
  const annualPalace = byBranch[gz[1]];
  const annualReading = palaceReadingOf(ziWei, annualPalace, { mode });

  const s6lines = [FOCUS['開頭句']];
  let limitPalace = null;
  let sameAsAnnual = false;
  if (limit) {
    limitPalace = byBranch[limit.ganZhi[1]];
    sameAsAnnual = limitPalace.name === annualPalace.name;
    const [startAge, endAge] = limit.ageRange.split('~');
    if (sameAsAnnual) {
      s6lines.push(fill(FOCUS['大限流年同宮模板'], {
        startAge, endAge, 大限干支: limit.ganZhi,
        西元年: year, 流年干支: gz,
        宮位名稱: annualPalace.name,
        宮位星曜解釋: annualReading.text,
      }));
    } else {
      s6lines.push(fill(FOCUS['大限句模板'], {
        startAge, endAge,
        大限干支: limit.ganZhi,
        大限宮位名稱: limitPalace.name,
        大限宮位星曜解釋: palaceReadingOf(ziWei, limitPalace, { mode }).text,
      }));
    }
  }
  if (!sameAsAnnual) {
    s6lines.push(fill(FOCUS['流年句模板'], {
      西元年: year,
      流年干支: gz,
      流年宮位名稱: annualPalace.name,
      流年宮位星曜解釋: annualReading.text,
    }));
  }
  // 結尾句原本是「掌握這段期間的重點，會比單看命盤整體更貼近你現在實際會遇到的際遇。」——
  // 純粹在誇這個段落本身，沒有給使用者任何新東西，現在留空；若日後想放回有內容的收尾，
  // 改 current-focus-section.json 的「結尾句」即可，這裡會自動略過空字串。
  if (FOCUS['結尾句']) s6lines.push(FOCUS['結尾句']);
  sections.push({ title: '六、當前焦點', text: s6lines.join('') });

  return { sections, text: sections.map((s) => `【${s.title}】\n${s.text}`).join('\n\n') };
}

// ---------- 八字 3 段綜合解析 ----------

const POSITIONS = [
  ['年柱天干', 'yearStem'], ['月柱天干', 'monthStem'], ['時柱天干', 'hourStem'],
  ['年支主氣', 'yearBranch'], ['月支主氣', 'monthBranch'], ['日支主氣', 'dayBranch'], ['時支主氣', 'hourBranch'],
];
const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };

// 五行 → 對應臟腑/身心保養重點（全盤概覽健康欄用；舊版誤把五行性格描述放進健康欄）
const ELEMENT_HEALTH = {
  木: '肝膽與筋骨', 火: '心血管、眼睛與睡眠', 土: '脾胃與消化',
  金: '呼吸道與皮膚', 水: '腎氣、泌尿與內分泌',
};

function findGod(tenGods, wanted) {
  for (const [label, key] of POSITIONS) {
    if (wanted.includes(tenGods[key])) return { label, god: tenGods[key] };
  }
  return null;
}

/**
 * 五行分析總結句：大眾版只用結論(composeElementAnalysis().summary);
 * 學習版額外附上五行數量依據（依據：木1、火1、土2、金1、水3），方便學習判斷邏輯怎麼算出來的。
 */
function elementSummaryForAnalysis(analysis, mode) {
  if (mode !== 'study') return analysis.summary;
  const counts = Object.entries(analysis.classification).map(([el, c]) => `${el}${c.count}`).join('、');
  return `${analysis.summary}(依據：${counts})`;
}

/**
 * mode = 'public'（預設）：結論句為主，不引用五行數量、十神完整依據；
 * mode = 'study':第二段附上五行數量依據，第三段附上大運/流年十神的完整依據句。
 * @param {object} baZi  convertToBaZi() 輸出
 * @param {object} [opts] { year, mode = 'public' | 'study' }
 * @returns {{ sections: Array<{title, text}>, text: string }}
 */
export function generateBaziComprehensiveReading(baZi, { year = new Date().getFullYear(), mode = 'public' } = {}) {
  const sections = [];
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const dayEl = STEM_EL[dayStem];
  const core = (god) => tenGodsDb['十神核心意義'][god]?.core ?? '';
  const t1 = baziReading['第1段_個性本質']['連接句模板'];
  const firstSentence = (s) => (s ? (s.match(/^[^。]*。/)?.[0] ?? s) : '');
  // 概覽用：取第一個逗號/頓號前的短句（不是完整句子），確保「一句話重點」真的簡短，並去掉開頭的「代表」贅字
  const firstClause = (s) => {
    if (!s) return '';
    const bare = s.replace(/^代表/, '');
    const m = bare.match(/^[^,，、。]*[,，、]?/);
    return (m?.[0] ?? bare).replace(/[,，、]$/, '');
  };

  // 第1段：個性本質
  const bs1seed = seedFrom(dayStem, baZi.tenGods.yearStem, baZi.tenGods.monthStem);
  // 年干/月干/日支三者可能落在同一個十神（相當常見）。
  // 舊版是三句各自展開，結果同一段裡會出現兩三次一字不差的解釋
  // (例如「代表壓力、挑戰與行動力，個性剛強果斷…」連著出現兩次),讀起來像壞掉的複製貼上。
  // 現在同一個十神只解釋一次，重複的柱位改成只點出它在哪些面向同時出現。
  const PILLAR_MEANING = {
    年干: '早年的家庭背景與根基',
    月干: '成長過程中的處世態度',
    日支: '你自己的核心性格與親密關係',
  };
  const pillarGods = [
    ['年干', baZi.tenGods.yearStem],
    ['月干', baZi.tenGods.monthStem],
    ['日支', baZi.tenGods.dayBranch],
  ];
  const seenGods = new Map(); // 十神 → 已出現過的柱位
  for (const [pos, god] of pillarGods) {
    if (!god) continue;
    if (!seenGods.has(god)) seenGods.set(god, []);
    seenGods.get(god).push(pos);
  }
  const s1lines = [
    fill(pick(t1[0], bs1seed), { 日主: `${dayStem}(${dayEl})`, 日主基本特質: elementDb['五行基本特質'][dayEl] }),
  ];
  const emitted = new Set();
  for (const [pos, god] of pillarGods) {
    if (!god || emitted.has(god)) continue;
    emitted.add(god);
    const positions = seenGods.get(god);
    const domains = positions.map((x) => PILLAR_MEANING[x]).join('、');
    s1lines.push(positions.length > 1
      ? `同一種特質在${positions.length}個地方同時出現：${core(god)}這一點會同時影響${domains},是你身上特別穩定、反覆出現的傾向。`
      : `${core(god)}這一面主要反映在${PILLAR_MEANING[pos]}。`);
  }
  sections.push({ title: '一、個性本質', text: s1lines.join('') });

  // 第2段：財官流向
  const t2 = baziReading['第2段_財官流向'];
  const wealthHit = findGod(baZi.tenGods, ['正財', '偏財']);
  const officerHit = findGod(baZi.tenGods, ['正官', '七殺']);
  const elementAnalysis = composeElementAnalysis(baZi.fiveElementDistribution);
  // 大眾版：只講結論，不掛「月柱顯示正財」「年柱天干顯示正官」這類依據——
  // 這些位置術語對沒學過的人是雜訊，而且會把真正的白話結論擠到句子後半。
  const plainCite = mode === 'study';
  const s2lines = [
    wealthHit
      ? (plainCite
        ? fill(t2['連接句模板'][0], { 財星出現位置: wealthHit.label, 財星十神: wealthHit.god, 財星核心解釋: core(wealthHit.god) })
        : `錢的部分，${core(wealthHit.god)}`)
      : (plainCite ? t2['無財星時'] : '錢的部分，本命沒有特別突出的財星，收入高低比較受後天的大運與流年帶動，靠持續累積會比等一次到位實在。'),
    officerHit
      ? (plainCite
        ? fill(t2['連接句模板'][1], { 官殺出現位置: officerHit.label, 官殺十神: officerHit.god, 官殺核心解釋: core(officerHit.god) })
        : `事業與名譽的部分，${core(officerHit.god)}`)
      : (plainCite ? t2['無官殺時'] : '事業與名譽的部分，你比較不受外在框架約束，適合走自主性高、自己定規則的路線。'),
    fill(t2['連接句模板'][2], { '五行分析總結句（來自five-element-analysis.json的整體平衡建議模板）': elementSummaryForAnalysis(elementAnalysis, mode) }),
  ];
  sections.push({ title: '二、財官流向', text: s2lines.join('') });

  // 第3段：人際健康與行動建議
  const t3 = baziReading['第3段_人際健康與行動建議'];
  const seen = new Set();
  const relParts = [];
  for (const r of baZi.branchRelations) {
    const key = [r.branch, r.with].sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    relParts.push(`${BRANCH_LABEL[r.branch]}與${BRANCH_LABEL[r.with]}${relationDisplayName(r.relation, r.pair)}(${r.pair})`);
  }
  const relSummary = relParts.length ? relParts.join('、') : '四柱地支之間沒有明顯的合沖刑害';

  // 大運類別與流年類別先比對是否相同：相同時合併成一段並點出疊加意義，
  // 不同時用對比句銜接，避免像舊版一樣各自完整輸出造成重複段落（共用 compose-luck.js 的判斷邏輯）
  const cycle = baZi.greatLuckCycles.find((c) => year >= c.startYear && year < c.startYear + 10);
  let decadalInfo = null;
  if (cycle) {
    const god = tenGodOf(dayStem, cycle.ganZhi[0]);
    const category = categoryOf(god);
    if (category) decadalInfo = { ganZhi: cycle.ganZhi, ageRange: cycle.ageRange, god, category };
  }
  const gz = baZi.annualPillars[year] ?? yearGanZhi(year);
  let annualInfo = null;
  {
    const god = tenGodOf(dayStem, gz[0]);
    const category = categoryOf(god);
    if (category) annualInfo = { ganZhi: gz, year, god, category };
  }
  const overlay = composeBaZiCycleOverlay(decadalInfo, annualInfo, { mode });
  const favorableCategory = decadalInfo?.category ?? annualInfo?.category;
  const cautiousCategory = annualInfo?.category ?? decadalInfo?.category;

  // 大運類別與流年類別相同時，結尾建議句也不該再講「把握A、同時對A謹慎」這種同一個類別講兩次的怪句子，
  // 改用「這段期間A格外集中，把握機會但留意過猶不及」的收斂版本。
  // 運別名稱在大眾版換成白話別名（食傷運 → 表達與才華運），術語版留給專業命盤模式
  const closingLine = overlay?.merged
    ? fill(t3['結尾行動建議句_大運流年類別相同時'], { 有利類別: categoryLabel(favorableCategory, mode) })
    : fill(t3['結尾行動建議句'], {
      有利類別: categoryLabel(favorableCategory, mode),
      需留意類別: categoryLabel(cautiousCategory, mode),
    });

  const citeGod = (god) => `細節上，${god}——${tenGodsDb['十神核心意義'][god].core}`;
  const godCitations = [];
  if (mode === 'study') {
    if (decadalInfo) godCitations.push(citeGod(decadalInfo.god));
    if (annualInfo && !(decadalInfo && overlay?.merged && decadalInfo.god === annualInfo.god)) {
      godCitations.push(citeGod(annualInfo.god));
    }
  }

  // 大眾版不該出現「年支與月支半會（巳午）」這種干支列表。
  // 而且下面第四段本來就已經用白話完整講過同一組地支關係了——
  // 在這裡再講一次（而且是術語版）既看不懂又重複，所以大眾版直接略過這一句。
  const s3lines = [
    mode === 'study' ? fill(t3['連接句模板'][0], { 地支關係列表摘要: relSummary }) : '',
    overlay?.text ?? '',
    ...godCitations,
    closingLine,
  ].filter(Boolean);
  sections.push({ title: '三、人際健康與行動建議', text: s3lines.join('') });

  // 第4段：地支關係（六合/害/沖/刑/相破/暗合/半合/拱/半會）
  // 大眾版：白話句（不出現術語與干支）；學習版：完整版（關係名+干支+解讀）
  const branchRelReading = composeBranchRelationsReading(baZi, { mode });
  sections.push({ title: '四、地支關係', text: branchRelReading.text });

  // 第5段：神煞（貴人星/煞星）
  // 大眾版：每柱「加分/留意」白話總結；學習版：神煞名稱——解釋逐條列出
  const shenshaReading = composeShenShaReading(baZi, { mode });
  sections.push({ title: '五、神煞', text: shenshaReading.text });

  // 第6段：四柱各段人生
  //
  // 這一段原本不存在，而它是八字最基本的一層結構：年月日時分別在講哪一段人生。
  // 紫微那邊十二宮每一宮都有名字（命宮、夫妻宮…），讀者一看就知道在講什麼；
  // 八字這邊整份報告都在講日主、十神、神煞，卻從來沒說過「年柱」是什麼意思。
  // 納音與十二長生也是每一柱都算好了、卻從來沒有出現在報告裡的資料。
  const stageLines = composePillarStages(baZi, composeBaziModifiers(baZi)).map((item) => {
    const tech = mode === 'study'
      ? `（${item.ganZhi}，納音${item.technical.nayin}、十二長生${item.technical.twelveStages}`
        + `${item.technical.shensha.length ? `、${item.technical.shensha.join('、')}` : ''}）`
      : '';
    return `${item.lifeWord}${tech}：${item.impact}`;
  });
  sections.push({ title: '六、四柱各段人生', text: stageLines.join('') });

  // ---- 全盤概覽：純粹排版/組裝順序調整，不做新的資料運算，完全取材自上面已算好的內容 ----
  const PHRASE = tenGodsDb['十神短語'];
  // 全盤概覽是使用者打開「深度解析」看到的第一段。
  // 舊版每一行都以判斷依據開頭（「正官當令,」「日支見七殺,」「年干見正官,」）,
  // 對沒學過命理的人來說，這些前綴不但看不懂，還把真正有意義的白話結論擠到後面。
  // 依據本身有價值，但屬於專業命盤模式；大眾版只留結論。
  const cite = (text) => (mode === 'study' ? text : '');
  const coreLine = mode === 'study'
    ? `日主${dayStem}(${dayEl}日生),${firstSentence(elementAnalysis.summary)}`
    : `你的先天底色偏${dayEl},${firstSentence(elementAnalysis.summary)}`;

  const careerLine = officerHit
    ? `事業：${cite(`${officerHit.god}當令，`)}${PHRASE[officerHit.god] ?? firstClause(core(officerHit.god))}。`
    : `事業：${cite('命局中官殺不顯，')}${mode === 'study' ? firstClause(t2['無官殺時']) : '沒有明顯的外在框架約束你，適合走自主性高、自己定規則的路線'}。`;

  const wealthLine = wealthHit
    ? `財運：${cite(`${wealthHit.god}入柱，`)}${PHRASE[wealthHit.god] ?? firstClause(core(wealthHit.god))}。`
    // 舊版這行是「財運：命局中財星不顯，命局中財星未在四柱天干或地支主氣中顯現。」——
    // 同一件事講了兩次，而且兩次都是術語。
    : `財運：${mode === 'study' ? firstClause(t2['無財星時']) : '本命沒有特別突出的財星，收入高低比較受後天的大運與流年帶動，靠累積而不是靠一次到位'}。`;

  // 感情：優先看日柱/時柱是否有桃花類神煞（紅艷煞），沒有就退回日柱地支十神（配偶宮本氣）
  const loveShenshaHit = ['紅艷煞'].find(
    (n) => (baZi.shenshaList?.dayPillar ?? []).includes(n) || (baZi.shenshaList?.hourPillar ?? []).includes(n),
  );
  const loveLine = loveShenshaHit
    ? `感情：${cite(`帶${loveShenshaHit},`)}${firstClause(SHENSHA_CORE[loveShenshaHit])}。`
    : `感情：${cite(`日支見${baZi.tenGods.dayBranch},`)}${PHRASE[baZi.tenGods.dayBranch] ?? firstClause(core(baZi.tenGods.dayBranch))}。`;

  // 健康：改用五行 → 臟腑保養重點（舊版誤放性格描述，標籤與內容對不上）
  // 取最鮮明的一項講保養重點，若有偏弱五行再點出第一個偏弱項的照顧面向
  const healthEl = elementAnalysis.dominant[0];
  const weakEl = elementAnalysis.weak[0];
  const healthLine = `健康：五行${healthEl}偏多，保養重點在${ELEMENT_HEALTH[healthEl]}`
    + (weakEl ? `;另${weakEl}偏弱，也留意${ELEMENT_HEALTH[weakEl]}的照顧。` : '。');

  // 家庭與原生背景：優先看年柱/月柱是否有孤辰/喪門，沒有就退回年干十神
  const familyShenshaHit = ['孤辰', '喪門'].find(
    (n) => (baZi.shenshaList?.yearPillar ?? []).includes(n) || (baZi.shenshaList?.monthPillar ?? []).includes(n),
  );
  const familyLine = familyShenshaHit
    ? `家庭：${cite(`年月柱帶${familyShenshaHit},`)}${firstClause(SHENSHA_CORE[familyShenshaHit])}。`
    : `家庭：${cite(`年干見${baZi.tenGods.yearStem},`)}${PHRASE[baZi.tenGods.yearStem] ?? firstClause(core(baZi.tenGods.yearStem))}。`;

  // 當前大運與今年流年重點：重用第三段已算好的 decadalInfo/annualInfo/overlay,不重新運算
  let luckLine;
  if (decadalInfo && annualInfo && overlay?.merged) {
    luckLine = `大運流年：${cite(`兩者同屬${favorableCategory},`)}${firstClause(LUCK_CATEGORY_DESC[favorableCategory] ?? '')},際遇格外集中的一年。`;
  } else if (decadalInfo && annualInfo) {
    luckLine = `大運流年：這十年偏向${categoryLabel(decadalInfo.category, mode)},今年轉向${categoryLabel(annualInfo.category, mode)},建議兼顧長期方向與這一年的短期焦點。`;
  } else if (decadalInfo) {
    luckLine = `大運：這十年偏向${categoryLabel(decadalInfo.category, mode)},${firstClause(LUCK_CATEGORY_DESC[decadalInfo.category] ?? '')}。`;
  } else {
    luckLine = '大運流年：資料不足，暫無法概覽。';
  }

  const overviewLines = [coreLine, careerLine, wealthLine, loveLine, healthLine, familyLine, luckLine];
  sections.unshift({ title: '全盤概覽', text: overviewLines.join(' ') });

  return { sections, text: sections.map((s) => `【${s.title}】\n${s.text}`).join('\n\n') };
}

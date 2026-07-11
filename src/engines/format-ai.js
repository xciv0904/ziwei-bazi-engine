// src/engines/format-ai.js — 把排盤結果轉換成給AI閱讀的純文字格式
// 用途:「複製給AI解讀」按鈕,把 convertToZiWei() / convertToBaZi() 的原始輸出攤平成
// 人類與LLM都好讀的純文字,附上固定的解讀指令,讓使用者可以直接貼給任何一個對話式AI。

import { relationDisplayName } from './compose-branch-relations.js';
import { computeYongShen } from './compose-yongshen.js';

const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };
const PILLAR_LABEL = { yearPillar: '年柱', monthPillar: '月柱', dayPillar: '日柱', hourPillar: '時柱' };

const line = (label, value) => `${label}:${value}`;

const STEMS_AI = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES_GZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const yearGanZhiOf = (y) => STEMS_AI[(y - 4) % 10] + BRANCHES_GZ[(y - 4) % 12];

// 五虎遁:年干 → 該年寅月(國曆約2月)的月干
const TIGER_MONTH_STEM = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' };

/**
 * 任一西元年的流月干支(國曆月對應節氣月:1月=前一年丑月、2月=寅月…12月=子月)。
 * 已驗證與 lunar-javascript 排出的 monthlyPillars 一致;供基準年 ≠ 排盤當年時使用。
 */
function monthlyPillarsOf(year) {
  const monthGz = (startStem, offset, branchIdx) =>
    STEMS_AI[(STEMS_AI.indexOf(startStem) + offset) % 10] + BRANCHES_GZ[branchIdx];
  const result = {};
  // 1月 = 前一年的丑月(寅月起算第 12 個月)
  result['01'] = monthGz(TIGER_MONTH_STEM[yearGanZhiOf(year - 1)[0]], 11, 1);
  for (let m = 2; m <= 12; m++) {
    // 2月=寅(idx2)、3月=卯…12月=子(idx0)
    result[String(m).padStart(2, '0')] = monthGz(TIGER_MONTH_STEM[yearGanZhiOf(year)[0]], m - 2, (m) % 12);
  }
  return result;
}

/** 單顆主星:名稱(亮度[,化X]) */
function formatMajorStar(s) {
  const tags = [];
  if (s.brightness) tags.push(s.brightness);
  if (s.transformation) tags.push(`化${s.transformation}`);
  return tags.length ? `${s.name}(${tags.join(',')})` : s.name;
}

// ---------- 紫微 ----------

function formatZiWeiSection(ziWei, input) {
  const lines = [];
  lines.push('【紫微斗數】');
  lines.push('');

  lines.push('◆ 基本資訊');
  lines.push(line('性別', input.gender === 'female' ? '女' : '男'));
  lines.push(line('生日', `${input.year}年${input.month}月${input.day}日 ${input.hour}時(陽曆,24小時制)`));
  lines.push(line('五行局', ziWei.fiveElementBureau));
  lines.push(line('命宮地支', ziWei.lifePalace));
  lines.push(line('身宮地支', ziWei.bodyPalace));
  lines.push(line('命主星', ziWei.lifeMaster));
  lines.push(line('身主星', ziWei.bodyMaster));
  lines.push('');

  lines.push('◆ 大限列表');
  ziWei.majorLimits.forEach((l, i) => {
    lines.push(`第${i + 1}限 ${l.ganZhi}(${l.ageRange}歲)`);
  });
  lines.push('');

  lines.push('◆ 流年');
  for (const [year, ganZhi] of Object.entries(ziWei.annualFlow)) {
    lines.push(`${year}年:${ganZhi}`);
  }
  lines.push('');

  lines.push('◆ 小限列表');
  for (const m of ziWei.minorLimits) {
    lines.push(`${m.year}年(虛歲${m.age}):${m.ganZhi}`);
  }
  lines.push('');

  lines.push('◆ 十二宮列表');
  for (const p of ziWei.palaces) {
    const bodyMark = p.isBodyPalace ? '(身宮)' : '';
    lines.push(`${p.name}${bodyMark} ${p.position}`);
    lines.push(`  主星:${p.majorStars.length ? p.majorStars.map(formatMajorStar).join(' ') : '無(空宮)'}`);
    lines.push(`  輔星:${p.minorStars.length ? p.minorStars.join(' ') : '無'}`);
    lines.push(`  運星:${p.auxiliary.twelveStage || '無'}`);
    lines.push(`  神煞:${p.auxiliary.shensha.length ? p.auxiliary.shensha.join('、') : '無'}`);
  }

  return lines.join('\n');
}

// ---------- 八字 ----------

function formatBaZiSection(baZi, baseYear = null) {
  const lines = [];
  lines.push('【八字】');
  lines.push('');

  lines.push('◆ 四柱');
  for (const key of ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']) {
    const p = baZi.fourPillars[key];
    lines.push(line(PILLAR_LABEL[key], `${p.stem}${p.branch}`));
  }
  lines.push('');

  lines.push('◆ 藏干');
  for (const key of ['yearBranch', 'monthBranch', 'dayBranch', 'hourBranch']) {
    lines.push(line(BRANCH_LABEL[key], baZi.hiddenStems[key].join('、')));
  }
  lines.push('');

  lines.push('◆ 十神(天干/地支)');
  const tg = baZi.tenGods;
  lines.push(`年干:${tg.yearStem}　年支:${tg.yearBranch}`);
  lines.push(`月干:${tg.monthStem}　月支:${tg.monthBranch}`);
  lines.push(`日干:${tg.dayStem}　日支:${tg.dayBranch}`);
  lines.push(`時干:${tg.hourStem}　時支:${tg.hourBranch}`);
  lines.push('');

  lines.push('◆ 各柱納音/十二長生/神煞');
  for (const key of ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']) {
    const d = baZi.pillarDetails[key];
    lines.push(`${PILLAR_LABEL[key]}:納音${d.nayin}、十二長生${d.twelveStages}、神煞${d.shensha}`);
  }
  lines.push('');

  lines.push('◆ 地支關係');
  if (baZi.branchRelations.length) {
    // 引擎輸出是雙向紀錄(A→B、B→A 各一筆),給 AI 的版本去重成單向,
    // 關係名稱與網站顯示共用同一張對照表(六害/六沖/三刑…,拱附上被拱之支)
    const seen = new Set();
    for (const r of baZi.branchRelations) {
      const key = [[r.branch, r.with].sort().join('-'), r.relation].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`${BRANCH_LABEL[r.branch]}與${BRANCH_LABEL[r.with]}${relationDisplayName(r.relation, r.pair)}(${r.pair})`);
    }
  } else {
    lines.push('四柱地支之間沒有明顯的合沖刑害');
  }
  lines.push('');

  lines.push('◆ 五行分佈');
  lines.push(
    Object.entries(baZi.fiveElementDistribution)
      .map(([k, v]) => `${ELEMENT_NAME[k]}${v}`)
      .join(' '),
  );
  lines.push('');

  lines.push('◆ 核心判斷值');
  lines.push(line('年柱空亡', baZi.coreValues.voidBranches.year));
  lines.push(line('日柱空亡', baZi.coreValues.voidBranches.day));
  lines.push(line('月令司令', baZi.coreValues.monthCommander));
  lines.push(line('大運起運歲數', baZi.coreValues.greatLuckStartAge != null ? `${baZi.coreValues.greatLuckStartAge}歲` : '未知'));
  {
    // 喜用神/忌神(扶抑法,附身強弱判定)
    const ys = computeYongShen(baZi);
    const fmt = (arr) => arr.map((x) => `${x.element}(${x.role})`).join('、');
    lines.push(line('日主強弱', `${ys.strength}(幫身${ys.helpScore}/抑身${ys.opposeScore},月令加權,扶抑法)`));
    lines.push(line('喜用神', fmt(ys.favorable)));
    lines.push(line('忌神', fmt(ys.unfavorable)));
  }
  lines.push('');

  lines.push('◆ 流年列表');
  let baseYearListed = false;
  for (const [year, ganZhi] of Object.entries(baZi.annualPillars)) {
    const isBase = Number(year) === baseYear;
    if (isBase) baseYearListed = true;
    lines.push(`${year}年:${ganZhi}${isBase ? '(基準)' : ''}`);
  }
  // 基準年落在預算的流年視窗之外(例如瀏覽遠期大限的年份)時,補一行標記
  if (baseYear && !baseYearListed) {
    lines.push(`${baseYear}年:${yearGanZhiOf(baseYear)}(基準)`);
  }
  lines.push('');

  // 流月列表:有指定基準年時,列基準年的流月(用五虎遁換算),否則用排盤時算好的當年流月。
  // 修正:舊版不論基準年是哪一年都列排盤當年的流月,導致流年提示詞附到錯年份的月干支。
  const monthly = baseYear ? monthlyPillarsOf(baseYear) : baZi.monthlyPillars;
  lines.push(`◆ 流月列表${baseYear ? `(${baseYear}年)` : ''}`);
  // 注意:monthlyPillars 的 key 是 '01'~'12' 這種補零字串,'10'/'11'/'12' 屬於JS的
  // 「類陣列索引」canonical 整數字串,會被引擎排到所有非canonical字串key(如'01')前面,
  // 直接用 Object.entries() 迭代會出現 10,11,12,1,2,...,9 這種錯亂順序,
  // 這裡改成明確依 1~12 月份順序取值,確保輸出是正確的時間序。
  lines.push(
    Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const key = String(m).padStart(2, '0');
      return `${m}月:${monthly[key]}`;
    }).join('　'),
  );
  lines.push('');

  lines.push('◆ 大運列表');
  for (const c of baZi.greatLuckCycles) {
    lines.push(`第${c.index}運 ${c.ganZhi}(西元${c.startYear}年起,${c.ageRange}歲)`);
  }

  return lines.join('\n');
}

// ---------- 固定解讀指令(最終版,完整附上,不省略任何一段) ----------

const AI_INSTRUCTION = `請以此資料為唯一事實來源進行分析:不要重新排盤,不要自行推算,不要補充資料中不存在的星曜、宮位、四化或流年資訊。
如果我提出的是具體問題(例如感情、工作、創業、健康,或某一年),請直接回答問題,不要先輸出完整人生分析;只有當我沒有提出具體問題時,才按以下框架做整體解盤。
請不要只解釋單顆星曜,也不要孤立看某一個宮位。分析時請留意以下對宮軸線,不要孤立看單一宮位:
命宮↔遷移宮(自我選擇與外部環境)、財帛宮↔福德宮(現實資源與精神滿足)、
夫妻宮↔官祿宮(親密關係與事業責任)、兄弟宮↔交友宮(熟人協作與外部人脈)、
子女宮↔田宅宮(投入產出與沉澱積累)、父母宮↔疾厄宮(規則身份與身心承載)。
請區分本命、大限、流年三個層次:本命看長期性格與反覆出現的人生課題,
大限看當前十年的階段性重心,流年看今年被推到前台的具體觸發點,不要混為一談。
請依序說明:
1) 天生性格與核心才華(命宮、身宮)
2) 事業與金錢流向(官祿宮、財帛宮、福德宮、田宅宮)
3) 戀愛婚姻(夫妻宮及相關宮位)
4) 健康、家庭、居住、人際(疾厄宮、父母宮、田宅宮、交友宮)
5) 能善用有利流向的行動,以及需要留意的現實模式
每個判斷都必須以資料中實際顯示的主星、輔星、亮度與四化,以及流向部分顯示的大限、流年、小限為主要依據。未顯示的數值不要推測。
輸出時請保持依據清楚,但不要寫成術數論文:
- 80%輸出應是對我有用的結論、現實場景、性格機制、關係模式等實際影響
- 20%輸出保留必要的依據(命宮、身宮、三方四正、大限流年四化)
- 不要逐條解釋每顆星、每個宮位
- 只在關鍵結論後簡短說明依據
請務必依據提供的命盤資料說明。`;

/**
 * 把排盤引擎的輸出轉成給AI解讀用的純文字。
 * @param {object} chartData
 * @param {object} chartData.input  { year, month, day, hour, gender } (computeAll() 組出的排盤輸入)
 * @param {object} chartData.ziWei  convertToZiWei() 的輸出
 * @param {object} chartData.baZi   convertToBaZi() 的輸出
 * @returns {string} 純文字字串,可直接複製貼給AI
 */
export function formatChartForAI({ input, ziWei, baZi, year = null }) {
  return [
    formatZiWeiSection(ziWei, input),
    '',
    formatBaZiSection(baZi, year),
    '',
    '---',
    '',
    AI_INSTRUCTION,
  ].join('\n');
}

// ---------- 宮位中心提示詞(12 宮各一套「問題+判讀順序」) ----------

// 每宮:副標、中心問題、判讀重點(第1步尾)、關聯宮判讀說明(第2步尾)、
// 「不要斷定…而要具體化…」(第4步)、策略與風險(第5步)。
// 關聯宮位名稱(三方四正:對宮+三合兩宮)由程式依宮位相對位置自動計算,不寫死。
const PALACE_PROMPTS = {
  命宮: {
    subtitle: '性格·人生格局',
    question: '請以這個人的命宮為中心,分析性格特質、天賦強項、決策風格與整體人生格局。',
    focus: '性格底色、思考與決策習慣、自我期待、能量的強弱起伏',
    relatedNote: '外在際遇、事業舞台與資源運用如何回饋、形塑本人的性格表現',
    avoid: '不要給籠統的性格標籤,而要具體化為日常行為模式、適合的成長路徑、需要留意的慣性',
    strategy: '提出發揮天賦的具體方向,以及性格上最值得修煉的一到兩個課題。',
  },
  兄弟宮: {
    subtitle: '手足·平輩協作',
    question: '請以這個人的兄弟宮為中心,分析手足緣分、平輩互動與親近夥伴的合作模式。',
    focus: '手足與親近朋友的互動基調、合作默契、彼此支援的方式',
    relatedNote: '外圍人脈、本人個性與家庭氛圍對平輩關係的影響',
    avoid: '不要斷定手足人數或緣分吉凶,而要具體化為相處模式、合作時適合的角色分工、需要設的界線',
    strategy: '提出經營平輩與合作關係的建議,以及容易出現的摩擦點與化解方式。',
  },
  夫妻宮: {
    subtitle: '感情·婚姻',
    question: '請以這個人的夫妻宮為中心,分析感情觀、擇偶傾向、親密關係的相處模式與婚姻經營。',
    focus: '感情中的角色慣性、被吸引的特質類型、關係中的需求與付出方式',
    relatedNote: '事業節奏、外在際遇與內在安全感如何影響感情的開展與穩定',
    avoid: '不要預言結婚時間或對象具體條件,而要具體化為適合的相處方式、關係中的強項、容易踩到的地雷',
    strategy: '提出經營感情的策略,以及親密關係中需要留意的風險與修復方式。',
  },
  子女宮: {
    subtitle: '子女·創造·晚輩',
    question: '請以這個人的子女宮為中心,分析子女緣分、教養風格、創造力表現與晚輩關係。',
    focus: '親子互動基調、創作與產出的方式、帶人與傳承的風格',
    relatedNote: '家庭根基、人際網絡與長輩經驗對教養與創造的影響',
    avoid: '不要斷定子女數量或性別,而要具體化為適合的教養方式、創造力的出口、與晚輩相處的模式',
    strategy: '提出發揮創造力與經營親子/晚輩關係的建議,以及需要留意的課題。',
  },
  財帛宮: {
    subtitle: '金錢·資源',
    question: '請以這個人的財帛宮為中心,分析賺錢方式、金錢觀、資源調度與財務風格。',
    focus: '進財的路徑、對錢的態度、花錢與存錢的慣性',
    relatedNote: '本人性格、事業型態與精神滿足感和金錢流向的連動',
    avoid: '不要斷定貧富或具體金額,而要具體化為適合的收入結構、理財習慣、容易破財的情境',
    strategy: '提出開源節流可以著力的策略,以及財務上需要防範的風險。',
  },
  疾厄宮: {
    subtitle: '健康·身心',
    question: '請以這個人的疾厄宮為中心,分析體質傾向、易累積壓力的部位、情緒與身體的連動。',
    focus: '體質基調、壓力反應模式、需要優先保養的面向',
    relatedNote: '性格慣性、家庭作息與長輩健康史對身心狀態的影響',
    avoid: '不要做醫療診斷或疾病斷言,而要具體化為生活作息建議、壓力調節方式、適合的運動型態',
    strategy: '提出日常保養的優先順序,以及身心失衡的早期警訊。',
  },
  遷移宮: {
    subtitle: '外出·際遇',
    question: '請以這個人的遷移宮為中心,分析外出運、環境變動的適應力、在外的人緣與際遇。',
    focus: '離開舒適圈後的表現、外地/外部環境給的機會、對外形象',
    relatedNote: '本人個性、事業選擇與感情狀態對「留下或出走」的影響',
    avoid: '不要斷定該不該搬家移民,而要具體化為適合發展的環境類型、外出時能放大的強項、需要注意的水土不服',
    strategy: '提出向外發展的策略,以及環境轉換期需要留意的風險。',
  },
  僕役宮: {
    subtitle: '人脈·合作',
    question: '請以這個人的僕役宮(交友宮)為中心,分析朋友圈性質、合作夥伴關係與團隊中的位置。',
    focus: '交友的篩選慣性、在群體中扮演的角色、與夥伴的互動方式',
    relatedNote: '手足經驗、本人個性與外在際遇對人脈經營的影響',
    avoid: '不要斷定朋友好壞,而要具體化為適合深交的類型、合作時的權責安排、需要保持距離的相處模式',
    strategy: '提出經營人脈與合作的策略,以及人際往來中需要防範的消耗。',
  },
  官祿宮: {
    subtitle: '職業·社會位置',
    question: '請以這個人的官祿宮為中心,分析職業運、事業成就、社會角色與工作方式。',
    focus: '職業傾向、工作態度、成就方式、組織適應力',
    relatedNote: '關係/夥伴、本人傾向、收入連接性對工作的影響',
    avoid: '不要斷定某個具體職業,而要具體化為適合的工作環境、能發揮強項的角色、需要避開的工作方式',
    strategy: '提出發展事業的策略,以及職場/事業中需要留意的風險。',
  },
  田宅宮: {
    subtitle: '家宅·資產',
    question: '請以這個人的田宅宮為中心,分析居住環境偏好、置產傾向、家運與資產的累積方式。',
    focus: '對「家」的需求、置產與搬遷的節奏、家庭氣氛的營造',
    relatedNote: '子女/創造投入、財務狀況與家庭傳承對家宅的影響',
    avoid: '不要斷定何時買房,而要具體化為適合的居住型態、置產決策的節奏、家庭空間的經營方式',
    strategy: '提出安家與資產累積的策略,以及居住/不動產決策的風險。',
  },
  福德宮: {
    subtitle: '心靈·福分',
    question: '請以這個人的福德宮為中心,分析精神生活、興趣嗜好、內心滿足感的來源與福分厚薄。',
    focus: '心靈滿足的來源、休閒與獨處的品質、內在的焦慮模式',
    relatedNote: '金錢狀態、感情品質與外在際遇對內心安定感的影響',
    avoid: '不要空談福報,而要具體化為能真正回血的休閒方式、精神內耗的來源、值得培養的興趣方向',
    strategy: '提出照顧心理狀態的策略,以及精神層面需要留意的耗損。',
  },
  父母宮: {
    subtitle: '長輩·庇蔭',
    question: '請以這個人的父母宮為中心,分析與父母長輩的緣分、互動模式、以及上司與體制關係。',
    focus: '與父母的情感基調、受長輩影響的深淺、面對權威的姿態',
    relatedNote: '自身健康承載、家庭環境與個人性格對親子/上下關係的影響',
    avoid: '不要斷定父母吉凶,而要具體化為與長輩相處的方式、跟上司/體制打交道的策略、代際差異的化解',
    strategy: '提出經營長輩與上下關係的建議,以及需要留意的溝通風險。',
  },
};

// 三方四正:對宮(+6)與三合(+4、+8)
const BRANCHES_AI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function relatedPalaces(ziWei, palaceName) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const self = ziWei.palaces.find((p) => p.name === palaceName);
  const idx = BRANCHES_AI.indexOf(self.position[1]);
  return [6, 4, 8].map((off) => byBranch[BRANCHES_AI[(idx + off) % 12]].name);
}

/**
 * 宮位中心 AI 提示詞:完整紫微資料 + 該宮位的問題與判讀順序。
 * @param {object} chartData { input, ziWei, palaceName }
 */
export function formatPalacePromptForAI({ input, ziWei, palaceName }) {
  const t = PALACE_PROMPTS[palaceName];
  if (!t) return null;
  const related = relatedPalaces(ziWei, palaceName).join('、');
  return [
    `這是紫微斗數 ${palaceName}(${t.subtitle})提示詞。`,
    '',
    formatZiWeiSection(ziWei, input),
    '',
    `問題: ${t.question}`,
    '判讀順序:',
    `1) 看${palaceName}本宮的主星;只有在星曜括號內顯示亮度、四化時,才一併納入,說明${t.focus}。`,
    `2) 同時查看${related},判斷${t.relatedNote}。`,
    '3) 左輔、右弼、文昌、文曲、天魁、天鉞只有在摘要中出現時,作為協作、文書、推薦、提拔的依據;化祿說明順遂/資源,化權說明責任/權限,化科說明名聲/資格,化忌說明阻滯/壓力。',
    `4) ${t.avoid}。`,
    `5) ${t.strategy}`,
    '',
    '請以上述資料為唯一事實來源,未顯示的星曜與四化不要推測;輸出以對當事人有用的結論與具體建議為主,依據簡短附在關鍵結論後即可。',
  ].join('\n');
}

/**
 * 流年中心 AI 提示詞:完整八字資料(標記基準流年)+ 流年判讀順序。
 * @param {object} chartData { input, baZi, year }
 */
export function formatAnnualPromptForAI({ input, baZi, year }) {
  const gz = baZi.annualPillars?.[year] ?? yearGanZhiOf(year);
  return [
    `這是四柱八字 流年${year}年${gz ? `(${gz}年)` : ''}解讀提示詞。`,
    '',
    formatBaZiSection(baZi, year),
    '',
    line('性別', input.gender === 'female' ? '女性' : '男性'),
    '',
    `問題: 請以 ${year} 年${gz ? `(${gz}年)` : ''}為基準,分析這一年整體運勢的變化與重點。`,
    '判讀順序:',
    '1) 以流年天干對日主的十神關係判斷全年主軸(財/官殺/印/食傷/比劫),說明這一年的能量傾向。',
    '2) 檢查流年地支與四柱地支的合沖刑害,指出哪些人生領域被引動(年柱=家庭與長輩、月柱=職場與外在環境、日柱=自身與伴侶、時柱=晚輩與晚年布局)。',
    '3) 對照目前所在的大運方向,判斷這個流年是順勢加乘還是轉折試探。',
    '4) 不要做吉凶斷語,而要具體化為這一年適合推進的事、需要保守觀望的事。',
    '5) 依流月干支給出季度層級的節奏建議。',
    '',
    '請以上述資料為唯一事實來源,不要重新排盤或自行推算;輸出以對當事人有用的結論與具體建議為主,依據簡短附在關鍵結論後即可。',
  ].join('\n');
}

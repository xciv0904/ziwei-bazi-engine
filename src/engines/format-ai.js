// src/engines/format-ai.js — 把排盤結果轉換成給AI閱讀的純文字格式
// 用途:「複製給AI解讀」按鈕,把 convertToZiWei() / convertToBaZi() 的原始輸出攤平成
// 人類與LLM都好讀的純文字,附上固定的解讀指令,讓使用者可以直接貼給任何一個對話式AI。

import { relationDisplayName, relationsBetween } from './compose-branch-relations.js';
import { tenGodOf } from './compose-luck.js';
import { computeYongShen } from './compose-yongshen.js';
import { monthlyPillarsOf, computeSelfTransformations, computeLaiyinPalace, douJunBranchOf, composeZiWeiAnnualChange, composeZiWeiDecadalChange, computeFlyingTransformations, findFlyingConvergence, flyingOfStem, computeAnnualSnapshots, findAnnualRepeatedFocus } from './compose-annual.js';
// naming.js 會一併帶進 44KB 的 name-characters.json 字庫,但整支 format-ai 只有
// formatNamingPromptForAI 一個函式用得到。改成在那個函式內部動態 import,
// 其餘所有 AI 提示詞(命盤、宮位、流年、合盤、每日、時間軸)就不必為此背上字庫的重量。
import { generatePlainZiweiTopics, generatePlainBaziTopics } from './compose-plain.js';

const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };
const PILLAR_LABEL = { yearPillar: '年柱', monthPillar: '月柱', dayPillar: '日柱', hourPillar: '時柱' };

// 參考 allenloves/de-ai-tone 的臺灣繁中原則，縮成適合各專用提示詞共用的版本。
// 保留網站需要的標題、卡片與條列，不套用原規則中「短文不設小標題」的限制。
const NATURAL_TW_STYLE = '使用臺灣繁體中文。直接回答，不要用「值得注意的是、總的來說、深入探討」等空轉開場；少用「不是…而是…、不僅…更…」與破折號。句子過長就拆開，每段的開頭和收尾不要套同一格式。具體寫行為、感受、觸發情境與可執行做法。';

const line = (label, value) => `${label}:${value}`;

const STEMS_AI = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES_GZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const yearGanZhiOf = (y) => STEMS_AI[(y - 4) % 10] + BRANCHES_GZ[(y - 4) % 12];

function annualLifeStage(input, year) {
  const age = year - Number(input.year);
  if (age <= 5) return { age, label: '幼兒成長期', focus: '照護、安全感、作息、探索與家庭互動', avoid: '工作、職場、事業、創業、升遷或理財操作' };
  if (age <= 11) return { age, label: '兒童學習期', focus: '學習習慣、同儕、家庭支持與身心發展', avoid: '工作、職場、事業、創業或升遷' };
  if (age <= 17) return { age, label: '青少年求學期', focus: '學業、同儕、自我探索、家庭與師長互動', avoid: '把職場、升遷、創業或收入當成主要生活情境' };
  if (age <= 24) return { age, label: '升學／初入社會轉銜期', focus: '學業、實習、初入職場、人際與方向探索', avoid: '預設當事人已經有穩定職涯、婚姻或固定資產' };
  if (age <= 39) return { age, label: '成年發展期', focus: '工作、關係、財務獨立與生活選擇', avoid: '預設每個人都會結婚、生子或創業' };
  if (age <= 59) return { age, label: '中年整合期', focus: '責任調整、家庭、工作節奏與長期生活品質', avoid: '只談工作成就而忽略健康、照顧責任與生活品質' };
  if (age <= 74) return { age, label: '退休轉銜／熟齡期', focus: '生活重心轉換、健康、家庭、社群參與與資源安排', avoid: '預設仍全職工作；若提到事業，需改寫為仍持續參與的工作、社群或家庭事務' };
  if (age <= 89) return { age, label: '高齡生活期', focus: '健康維持、生活自主、家人互動、陪伴與資源協調', avoid: '以求職、升遷、創業、職場競爭或事業衝刺作為主要建議' };
  return { age, label: '超高齡生活期', focus: '照護品質、生活舒適、安全、陪伴、家人與支持系統', avoid: '任何工作、求職、升遷、創業、職場競爭或事業衝刺的預設情境' };
}

/** 單顆主星:名稱(亮度[,化X]) */
function formatMajorStar(s) {
  const tags = [];
  if (s.brightness) tags.push(s.brightness);
  if (s.transformation) tags.push(`化${s.transformation}`);
  return tags.length ? `${s.name}(${tags.join(',')})` : s.name;
}

// ---------- 紫微 ----------

/**
 * @param {object} ziWei convertToZiWei() 輸出
 * @param {object} input { year, month, day, hour, gender }
 * @param {number} [year] 要當成「目前」的西元年;預設今年。大限/流年飛化以它為準。
 */
function formatZiWeiSection(ziWei, input, year = new Date().getFullYear()) {
  const lines = [];
  lines.push('【紫微斗數】');
  lines.push('');

  lines.push('◆ 基本資訊');
  lines.push(line('性別', input.gender === 'female' ? '女' : '男'));
  lines.push(line('生日', `${input.year}年${input.month}月${input.day}日 ${input.hour}時(陽曆,24小時制)`));
  if (input.solarTime) {
    const { civil, corrected } = input.solarTime;
    const sign = corrected.correctionMinutes >= 0 ? '+' : '';
    lines.push(line(
      '真太陽時校正',
      `鐘錶時間${civil.year}/${civil.month}/${civil.day} ${String(civil.hour).padStart(2, '0')}:${String(civil.minute).padStart(2, '0')}，`
      + `經度${civil.longitude}°、UTC${civil.utcOffset >= 0 ? '+' : ''}${civil.utcOffset}，`
      + `校正${sign}${corrected.correctionMinutes.toFixed(1)}分鐘`,
    ));
  }
  lines.push(line('五行局', ziWei.fiveElementBureau));
  lines.push(line('命宮地支', ziWei.lifePalace));
  lines.push(line('身宮地支', ziWei.bodyPalace));
  lines.push(line('命主星', ziWei.lifeMaster));
  lines.push(line('身主星', ziWei.bodyMaster));
  {
    const dj = douJunBranchOf(ziWei, '子');
    if (dj) lines.push(line('子年斗君', dj));
    const laiyin = computeLaiyinPalace(ziWei);
    if (laiyin) lines.push(line('來因宮', `${laiyin.palaceName}(${laiyin.position})`));
  }
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

  lines.push('◆ 十二宮列表(↓=離心自化、↑=向心自化,飛星派)');
  const selfT = Object.fromEntries(computeSelfTransformations(ziWei).map((r) => [r.palaceName, r]));
  for (const p of ziWei.palaces) {
    const bodyMark = p.isBodyPalace ? '(身宮)' : '';
    lines.push(`${p.name}${bodyMark} ${p.position}`);
    lines.push(`  主星:${p.majorStars.length ? p.majorStars.map(formatMajorStar).join(' ') : '無(空宮)'}`);
    lines.push(`  輔星:${p.minorStars.length ? p.minorStars.join(' ') : '無'}`);
    lines.push(`  運星:${p.auxiliary.twelveStage || '無'}`);
    lines.push(`  神煞:${p.auxiliary.shensha.length ? p.auxiliary.shensha.join('、') : '無'}`);
    const st = selfT[p.name];
    if (st) {
      const marks = [
        ...st.outgoing.map((x) => `${x.star}↓${x.mutagen}`),
        ...st.incoming.map((x) => `${x.star}↑${x.mutagen}`),
      ].join('、');
      lines.push(`  自化:${marks}`);
    }
  }

  // ---- 十二宮飛化 ----
  // 之前只輸出自化,但自化只是飛化的特例(飛出去的星剛好留在本宮)。
  // 少了完整的飛化表,讀盤的一方就看不到「命宮把忌送進疾厄宮」這類跨宮關係,
  // 而宮位之間怎麼互相輸送資源與壓力,正是飛星派判斷的主體。
  // 這裡把 12 宮 × 4 化 = 48 條全部列出,並標示哪些屬於自化。
  const flying = computeFlyingTransformations(ziWei);
  lines.push('');
  lines.push('◆ 十二宮飛化(各宮宮干引動四化,箭頭右側為落入的本命宮位)');
  for (const src of flying) {
    const body = src.flights
      .map((f) => `${f.star}化${f.mutagen}→${f.palaceName}${f.isSelf ? '(自化)' : ''}`)
      .join('、');
    lines.push(`${src.palaceName}(宮干${src.stem}):${body}`);
  }

  // ---- 飛化疊加點 ----
  // 同一個宮位被兩三個宮位同時飛入同一種四化,遠比只被飛入一次值得注意。
  // 這種重複指向是解盤時最該優先看的地方,先算好,免得閱讀的人自己去比對上面 48 條。
  const convergence = findFlyingConvergence(flying);
  if (convergence.length) {
    lines.push('');
    lines.push('◆ 飛化疊加點(同一宮位被多個宮位飛入同一種四化,依重複次數排序)');
    for (const c of convergence) {
      lines.push(`${c.palaceName}被${c.from.length}個宮位化${c.mutagen}:${c.from.join('、')}`);
    }
  }

  // ---- 大限與流年飛化 ----
  // 規則跟宮干飛化相同,只是換成大限干、流年干在飛。
  // 三層(本命宮干／大限／流年)若指向同一宮位,代表同一個主題在不同時間尺度上重複出現。
  // 直接由命盤本身推出「目前」的大限與流年干支,不依賴呼叫端傳進運勢物件——
  // formatZiWeiSection 有六個呼叫點,其中多數手上沒有 zwLuck,自己算才不會有的有、有的沒有。
  const nominalAge = year - Number(input.year) + 1; // 虛歲
  const curLimit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return nominalAge >= a && nominalAge <= b;
  });
  const annualGanZhi = ziWei.annualFlow?.[year] ?? ziWei.annualFlow?.[String(year)] ?? yearGanZhiOf(year);
  const flyLine = (label, ganZhi) => {
    if (!ganZhi) return;
    const body = flyingOfStem(ziWei, ganZhi[0]).map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`).join('、');
    if (body) lines.push(`${label} ${ganZhi}:${body}`);
  };
  if (curLimit || annualGanZhi) {
    lines.push('');
    lines.push('◆ 大限／流年飛化(規則與宮干飛化相同,落入的是本命宮位)');
    if (curLimit) flyLine(`大限(${curLimit.ageRange}歲)`, curLimit.ganZhi);
    if (annualGanZhi) flyLine(`${year}年流年`, annualGanZhi);
  }

  const snapshots = computeAnnualSnapshots(ziWei, year, 3, input.year);
  const repeated = findAnnualRepeatedFocus(ziWei, snapshots);
  lines.push('');
  lines.push(`◆ ${year - 3}–${year + 3}流年快照(命宮疊本命宮；四化為流年干飛入本命宮)`);
  for (const snapshot of snapshots) {
    const flights = snapshot.flights.map((f) => `${f.mutagen}→${f.palaceName}`).join('、');
    const limit = snapshot.majorLimit ? `限${snapshot.majorLimit.ganZhi}(${snapshot.majorLimit.ageRange}歲)；` : '';
    lines.push(`${snapshot.year}${snapshot.ganZhi}:${limit}命宮→${snapshot.palaceName}；${flights}`);
  }
  if (repeated.transformations.length || repeated.axes.length) {
    lines.push('跨年重複焦點(程式比對):');
    for (const item of repeated.transformations) {
      lines.push(`${item.years.join('/')} 化${item.mutagen}→${item.palaceName}`);
    }
    for (const item of repeated.axes.slice(0, 4)) {
      lines.push(`${item.years.join('/')} 反覆觸及${item.axis}軸`);
    }
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

  lines.push('◆ 藏干(天干-十神)');
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
    const shensha = baZi.shenshaList?.[key]?.length ? baZi.shenshaList[key].join('、') : d.shensha;
    lines.push(`${PILLAR_LABEL[key]}:納音${d.nayin}、十二長生${d.twelveStages}、神煞${shensha}`);
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

// 這段是使用者按「複製給AI」時附在資料後面的解讀指令。
// 寫法刻意用自己的措辭與組織方式:功能上要求的東西(以資料為準、成對看宮位、
// 分開三層時間、控制術語比例)是紫微斗數本來就有的判讀原則,但文字表述必須是自己的。
const AI_INSTRUCTION = `請把這份資料視為已完成計算的觀察紀錄。只能引用資料中已有的宮位、星曜、四化、干支、
神煞與年份；不要重新排盤、自行推算或用記憶補齊缺項。

【內部判讀】
先找出一至三個最有解釋力的重複訊號，再以其他資料核對。程式列出的飛化疊加點與跨年重複焦點可直接採用。
紫微用來辨認人生領域、事件舞台與階段主題；先看命宮、身宮、福德宮、三方四正，涉及取捨時連同對宮。
八字用來驗證內在動力與應對方式；看日主強弱、十神、喜忌、地支關係、大運流年，藏干則補充未直接顯露、
但在特定情境會浮現的需求與能力。重要結論至少要有兩項資料支持，並盡可能由紫微與八字交叉驗證；
兩套系統不同調時，分別說明各自反映的層面，不要硬湊成一致。

神煞只作輔助，不可取代宮位、四化、十神、喜忌與地支關係。最多採用一至兩項最相關者，且須有主要結構支持。
談貴人時說明較容易得到哪類人、在哪種情境獲得幫助，不得保證一定出現或逢凶化吉。

區分三種來源：天生傾向、後天練出的能力、因環境要求形成的生存策略。除非資料足以支持，不要臆測童年事件；
也不要把過度察言觀色、補位、討好、過度準備、反覆確認、壓抑需求或事後才疲累一律美化成優點。

【白話翻譯】
使用臺灣繁體中文。刪除沒有資訊量的開場與收尾，不用「值得注意的是、總的來說、深入探討、揭示、賦能」等空泛語句。
「不是⋯⋯而是⋯⋯」「不僅⋯⋯更⋯⋯」只有在前後真的構成對比時才使用；少用破折號、三項式排比與每段固定總結。
句子有三層以上意思就拆開。各段要有不同的起點與節奏，但保留分類標題、卡片與條列，方便讀者掃讀。
每個重要結論都要讓讀者知道：生活中如何表現、何時最容易出現、別人可能如何感受、用得剛好有何優勢、
使用過度付出什麼代價，以及可以怎麼調整。至少給一個可想像的日常情境，例如工作協作、面試考試、
重大決定、家人相處、戀愛爭執、花錢投資、面對權威、休息受壓或進入陌生環境。

「敏感、理性、負責、強勢、獨立、缺乏安全感、善於溝通、有領導力、感情被動」等抽象詞後，
必須立即說明對什麼、在何種情境、會做什麼、別人看見什麼，以及本人內在經歷什麼；做不到就刪除該詞。
可適度使用內外反差句型，但不要每段套同一模板。若同一配置可能有相反表現，要交代切換條件，
例如安全或受壓、熟人或陌生人、規則清楚或模糊、關係穩定或不確定、有選擇權或害怕讓人失望時。

每個短段落只處理一個核心結論，原則是「直接結論→生活表現→優勢→過度代價→實際建議」；
不必機械式逐項標示。複雜內容拆成兩至三句，每句不塞兩個以上的新判斷，少用連續的「既、又、同時、
因此、但另一方面、加上」。段落不得以宮位、星曜、四化、日主或十神術語起頭，先說白話結論。
正文若非必要不使用命理術語；確有助益時，首次出現立即翻成白話，之後不反覆教學。

建議必須回答做什麼、何時做、如何做，以及要解決前文哪個問題。不得只說相信自己、勇敢、放下、
不要想太多、保持正能量、做自己、設立界線或多休息。每個主要分類可放一至兩句「你可能會發現」
或「常見的情境是」供讀者核對，但不要變成測驗或連續反問。

【時間語氣】
本命只寫「容易、傾向、經常在某類情境出現、長期可能反覆遇到」；大限只寫「這個階段較常面對、
目前十年正在學習、這段期間容易被放大」；流年只寫「該年較容易明顯、可能需要優先處理、
某議題受到放大、外部機會或壓力可能增加」。不得把心理傾向直接斷成出國、搬家、轉職、結婚等外部事件，
也不得使用「注定、一定、必然、肯定會發生」。

【輸出】
若使用者已有明確問題，第一句直接回答，只選最相關的一至三類；沒有明確問題時，開場只用一至兩句，
直接點出最有辨識度的內外反差、選擇慣性或目前人生主題。不要以「首先、其次、綜合來看、根據命盤、
從紫微斗數來看、你的命宮顯示、以下將進行完整分析」起手。

完整解讀保留以下分類作為閱讀入口，但先依全盤重複訊號選出三個最重要的分類詳寫：
-「你是怎麼運作的」：外在表現、內在需求、決策方式與壓力反應。
-「工作與天賦」：擅長解決的問題、適合角色及容易卡住的工作情境。
-「金錢與價值感」：賺錢方式、定價與安全感，不預測具體金額。
-「感情與重要關係」：親密需求、被吸引的特質、衝突與修復方式。
-「人際、家庭與界線」：合作角色、家庭影響及容易過度承擔之處。
-「身心使用方式」：壓力累積、常忽略的訊號與恢復方法，不作醫療診斷。
-「你現在走到哪裡」：當前大限流年放大的主題，以及一至三項現在能做的事。

三個重點分類各寫一至兩個核心結論，至少放一個具體場景，並交代優勢與代價。其餘分類各用一個短段落，
只寫最有辨識度的行為表現，不延伸第二條主題。所有行動建議集中在「你現在走到哪裡」，共一至三項；
其他分類只在缺少做法就難以理解時補一句。若某分類確實沒有足夠資料，直接寫「這部分訊號較少」，
不要用通用人格描述補滿版面。

同一核心結論只能在一類完整說明，其他分類若再提及，只補該領域不同的影響，不得換形容詞重複。
全文以約1200至1600個中文字為目標。避免逐宮、逐星、逐十神巡禮，以及「第一個重複訊號」等報告語氣。

文末以「命理依據」為標題，最多三個短句：指出紫微宮位或飛化、大限流年，以及八字喜忌、十神、
大運或地支關係如何支持正文。正文不要逐條展示推理。

【輸出前自檢】
逐段確認：是否有具體行為與觸發情境；是否只有形容詞；是否美化壓力反應；是否把流年寫成必然事件；
是否跨分類重複；建議是否真的可執行；正文術語是否過多；相反表現是否交代切換條件；紫微與八字是否都
實際使用；文末依據是否不超過三句。任一段若只剩「敏感、負責、有能力」而答不出何時及如何表現，重寫。`;

// ---------- 白話摘要區塊(compose-plain.js 產出的 7 段式卡片,壓縮成給AI參考的精簡文字) ----------
// 白話摘要僅供明確要求的相容情境選用；完整命盤提示預設不附，
// 避免現成結論錨定模型，使它只做換句話說。
function formatPlainCard(card) {
  const lines = [`【${card.title}】${card.summary}`];
  if (card.explanation?.length) lines.push(card.explanation.join(' '));
  if (card.lifeExamples?.length) lines.push(`生活中的表現:${card.lifeExamples.join(';')}`);
  if (card.challenges?.length) lines.push(`可能的挑戰:${card.challenges.join(';')}`);
  if (card.advice?.length) lines.push(`發揮建議:${card.advice.join(';')}`);
  return lines.join('\n');
}

function formatPlainSummarySection(ziWei, baZi, zwLuck, bzLuck, elements) {
  const ziweiCards = generatePlainZiweiTopics(ziWei, zwLuck);
  const baziCards = generatePlainBaziTopics(baZi, bzLuck, elements);
  return [
    '◆ 網站已生成的白話摘要(紫微)',
    ...ziweiCards.map(formatPlainCard),
    '',
    '◆ 網站已生成的白話摘要(八字)',
    ...baziCards.map(formatPlainCard),
  ].join('\n');
}

/**
 * 把排盤引擎的輸出轉成給AI解讀用的純文字。
 * @param {object} chartData
 * @param {object} chartData.input  { year, month, day, hour, gender } (computeAll() 組出的排盤輸入)
 * @param {object} chartData.ziWei  convertToZiWei() 的輸出
 * @param {object} chartData.baZi   convertToBaZi() 的輸出
 * @param {object} [chartData.zwLuck]   composeZiWeiLuck() 的輸出(有給的話,資料包會多附上白話摘要)
 * @param {object} [chartData.bzLuck]   composeBaZiLuck() 的輸出
 * @param {object} [chartData.elements] composeElementAnalysis() 的輸出
 * @returns {string} 純文字字串,可直接複製貼給AI
 */
export function formatChartForAI({
  input, ziWei, baZi, zwLuck = null, bzLuck = null, elements = null, year = null,
  includePlainSummary = false, includeInstruction = true,
}) {
  const baseYear = year ?? new Date().getFullYear();
  const hasPlainData = includePlainSummary && zwLuck && bzLuck && elements;
  return [
    formatZiWeiSection(ziWei, input, baseYear),
    '',
    formatBaZiSection(baZi, year),
    ...(hasPlainData ? ['---', '', formatPlainSummarySection(ziWei, baZi, zwLuck, bzLuck, elements), ''] : []),
    ...(includeInstruction ? ['', '---', '', AI_INSTRUCTION] : []),
  ].join('\n');
}

/**
 * 單題主題提示詞只帶 Topic Contract 允許且已綁定 answerTarget 的證據。
 * 不復用 formatChartForAI()，避免把十二宮、48 條飛化與其他人生領域重新丟給 AI。
 */
export function formatTopicPromptForAI({ contract, report }) {
  if (!contract || !report) throw new TypeError('formatTopicPromptForAI 需要 contract 與 report');
  const evidenceLines = report.selectedEvidence.map((item, index) => [
    `${index + 1}. 來源：${item.publicBasis}`,
    `   支持的回答目標：${item.supportedTarget}`,
    `   可公開轉譯：${item.interpretation}`,
  ].join('\n'));
  const current = report.directAnswer;
  return [
    `【單一主題：${contract.categoryLabel}】`,
    `使用者問題：${contract.question}`,
    `回答焦點：${contract.questionFocus}`,
    `必須回答：${contract.answerTargets.join('、')}`,
    `不得延伸：${contract.excludedTargets.join('、')}`,
    '',
    '【網站已用相同證據生成的直接答案】',
    current.answer,
    '',
    '【本題已篩選命盤依據】',
    ...(evidenceLines.length ? evidenceLines : ['本題相關訊號不足，不得引用其他領域補滿。']),
    '',
    '【輸出結構】',
    '直接答案：一至兩句，第一句就回答。',
    '為什麼：只解釋上面證據支持的兩項原因。',
    '生活中可能怎麼出現：一個具體情境。',
    '你可以怎麼判斷或處理：一至兩項可執行做法。',
    '',
    `全文最多 ${contract.wordBudget.directAnswer} 個中文字。先刪重複句，不得直接截斷句子。`,
    '只能使用上面三項以內的已篩選依據；不重新排盤，不自行補星曜、宮位、十神或事件。',
    '不輸出任何內部欄位、稽核理由、知識庫短句或程式標籤。',
    '每個結論必須能對回上面某一項「支持的回答目標」；無法對回就刪除。',
    '使用臺灣繁體中文，不作醫療診斷、不預測具體金額、日期或必然事件。',
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
  const relatedNames = relatedPalaces(ziWei, palaceName);
  const related = relatedNames.join('、');
  const wanted = new Set([palaceName, ...relatedNames]);
  const selfByPalace = Object.fromEntries(computeSelfTransformations(ziWei).map((item) => [
    item.palaceName,
    [
      ...item.outgoing.map((e) => `${e.star}↓${e.mutagen}`),
      ...item.incoming.map((e) => `${e.star}↑${e.mutagen}`),
    ],
  ]));
  const flyingByPalace = Object.fromEntries(computeFlyingTransformations(ziWei).map((item) => [
    item.palaceName,
    item.flights.map((e) => `${e.star}化${e.mutagen}→${e.palaceName}`),
  ]));
  const facts = ziWei.palaces
    .filter((p) => wanted.has(p.name))
    .map((p) => {
      const stars = p.majorStars.length ? p.majorStars.map(formatMajorStar).join(' ') : '無主星(空宮)';
      const minor = p.minorStars.length ? `｜輔星:${p.minorStars.join(' ')}` : '';
      const self = selfByPalace[p.name]?.length ? `｜自化:${selfByPalace[p.name].join('、')}` : '';
      return `${p.name}${p.isBodyPalace ? '(身宮)' : ''} ${p.position}｜主星:${stars}${minor}${self}｜宮干飛化:${flyingByPalace[p.name].join('、')}`;
    });
  return [
    `這是紫微斗數 ${palaceName}(${t.subtitle})提示詞。`,
    '',
    `基本資料:${input.gender === 'female' ? '女' : '男'}，${input.year}年${input.month}月${input.day}日${input.hour}時；命宮${ziWei.lifePalace}、身宮${ziWei.bodyPalace}。`,
    `◆ ${palaceName}與三方四正必要資料`,
    ...facts,
    '',
    `問題: ${t.question}`,
    '輸出規則:',
    `1) 先用一句白話結論說明${t.focus}，再用1至2個具體生活情境讓本人可以核對。`,
    `2) 同時查看${related}，只補充${t.relatedNote}；不要展開其他人生分類。`,
    `3) 說明一項用得好的優勢、一項使用過度的代價，並給1至2個可執行做法。${t.avoid}。`,
    '4) 抽象形容詞後必須接「在什麼情況、會做出什麼行為」；正文先講白話，命理依據最後最多2句。',
    `5) ${NATURAL_TW_STYLE}`,
    '',
    '回覆控制在約500至800個中文字。以上資料由排盤引擎產生，請直接引用，不要重算或補入未列資料。',
  ].join('\n');
}

// ---------- 雙人合盤提示詞 ----------

const STEM_EL_AI = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const BR = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 單人濃縮摘要(合盤用,不塞完整十二宮避免提示詞過長) */
function personSummary({ name, input, baZi, ziWei }) {
  const fp = baZi.fourPillars;
  const ys = computeYongShen(baZi);
  const fmt = (arr) => arr.map((x) => `${x.element}(${x.role})`).join('、');
  const eff = (palaceName) => {
    const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
    const p = ziWei.palaces.find((x) => x.name === palaceName);
    const stars = p.majorStars.map(formatMajorStar).join(' ');
    if (stars) return `${stars}(${p.position})`;
    const opp = byBranch[BR[(BR.indexOf(p.position[1]) + 6) % 12]];
    return `空宮,借對宮${opp.majorStars.map(formatMajorStar).join(' ')}(${p.position})`;
  };
  return [
    `■ ${name}(${input.gender === 'female' ? '女' : '男'},${input.year}年${input.month}月${input.day}日 ${input.hour}時)`,
    `四柱:${fp.yearPillar.stem}${fp.yearPillar.branch} ${fp.monthPillar.stem}${fp.monthPillar.branch} ${fp.dayPillar.stem}${fp.dayPillar.branch} ${fp.hourPillar.stem}${fp.hourPillar.branch}`,
    `日主:${fp.dayPillar.stem}(${STEM_EL_AI[fp.dayPillar.stem]})|${ys.strength}|喜用神:${fmt(ys.favorable)}|忌神:${fmt(ys.unfavorable)}`,
    `紫微命宮:${eff('命宮')}`,
    `紫微夫妻宮:${eff('夫妻宮')}`,
  ].join('\n');
}

/**
 * 雙人合盤 AI 提示詞:兩人濃縮命盤 + 已算好的地支關係事實 + 判讀順序。
 * @param {object} data { a: {name,input,baZi,ziWei}, b: {name,input,baZi,ziWei} }
 */
export function formatSynastryPromptForAI({ a, b }) {
  const rel = (brA, brB) => {
    if (brA === brB) return `相同(${brA},伏吟)`;
    const rels = relationsBetween(brA, brB);
    return rels.length ? rels.map((r) => relationDisplayName(r, brA + brB)).join('、') + `(${brA}${brB})` : `無特殊關係(${brA}×${brB})`;
  };
  const dayA = a.baZi.fourPillars.dayPillar.branch;
  const dayB = b.baZi.fourPillars.dayPillar.branch;
  const yearA = a.baZi.fourPillars.yearPillar.branch;
  const yearB = b.baZi.fourPillars.yearPillar.branch;

  return [
    `這是雙人合盤(${a.name} × ${b.name})解讀提示詞。`,
    '',
    personSummary(a),
    '',
    personSummary(b),
    '',
    '◆ 兩人地支關係(已排定,請勿重算)',
    `日支×日支:${rel(dayA, dayB)}`,
    `年支×年支:${rel(yearA, yearB)}`,
    '',
    `問題: 請分析 ${a.name} 與 ${b.name} 的關係相性:相處模式、彼此扮演的角色、互補與消耗之處、長期經營的建議。`,
    '判讀順序:',
    '1) 以兩人日主五行的生剋比和,判斷關係的基本互動方向(誰滋養誰、誰推動誰)。',
    '2) 以日支關係看親密相處的頻道,年支關係看家庭與背景層的緣分。',
    '3) 以喜用神互補判斷「誰的存在天生補得到誰」,忌神方向則是需要留意的消耗。',
    '4) 以一方的紫微夫妻宮星曜對照另一方的命宮星曜(雙向各做一次),分析「理想伴侶輪廓 vs 真實本性」的落差與接納空間。',
    '5) 不要做「合/不合」的斷語,而要具體化為相處中的強項、容易起摩擦的情境、以及雙方各自可以調整的做法。',
    `6) ${NATURAL_TW_STYLE}`,
    '',
    '回覆控制在約800至1200個中文字；每個結論都要指出觸發情境與雙方可觀察的行為，不要擴寫個別完整人生報告。',
    '以上資料由排盤引擎產生,請直接引用,不要重算;回覆以兩人實際相處會遇到的情境與可行做法為主,依據最後最多3句。',
  ].join('\n');
}

function formatAnnualBaZiSection(baZi, year, gz) {
  const lines = ['◆ 八字本年必要資料'];
  const fp = baZi.fourPillars;
  const dayStem = fp.dayPillar.stem;
  const pillars = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']
    .map((key) => `${PILLAR_LABEL[key]}${fp[key].stem}${fp[key].branch}`)
    .join('、');
  lines.push(line('四柱', pillars));

  const ys = computeYongShen(baZi);
  const fmt = (arr) => arr.map((x) => `${x.element}(${x.role})`).join('、') || '無';
  lines.push(line('日主與喜忌', `${dayStem}日主、${ys.strength}；喜用${fmt(ys.favorable)}；忌${fmt(ys.unfavorable)}`));

  const cycle = baZi.greatLuckCycles.find((c) => year >= c.startYear && year < c.startYear + 10);
  if (cycle) {
    lines.push(line('目前大運', `${cycle.ganZhi}(${cycle.ageRange}歲)，天干對日主為${tenGodOf(dayStem, cycle.ganZhi[0])}`));
  }
  lines.push(line('本年干支', `${gz}，流年天干對日主為${tenGodOf(dayStem, gz[0])}`));

  const branchHits = [];
  const branchKeys = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];
  for (const key of branchKeys) {
    const natalBranch = fp[key].branch;
    for (const rel of relationsBetween(gz[1], natalBranch)) {
      branchHits.push(`${gz[1]}與${PILLAR_LABEL[key]}${natalBranch}${relationDisplayName(rel, `${gz[1]}${natalBranch}`)}`);
    }
  }
  lines.push(line('流年支引動', branchHits.join('、') || '與本命四支無明顯合沖刑害'));

  const natalRelations = [];
  const seen = new Set();
  for (const r of baZi.branchRelations ?? []) {
    const key = [[r.branch, r.with].sort().join('-'), r.relation].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    natalRelations.push(`${BRANCH_LABEL[r.branch]}與${BRANCH_LABEL[r.with]}${relationDisplayName(r.relation, r.pair)}`);
  }
  if (natalRelations.length) lines.push(line('本命地支關係', natalRelations.join('、')));

  const monthly = monthlyPillarsOf(year);
  lines.push(line(
    `${year}流月`,
    Array.from({ length: 12 }, (_, i) => `${i + 1}月${monthly[String(i + 1).padStart(2, '0')]}`).join('、'),
  ));
  return lines.join('\n');
}

/**
 * 流年中心 AI 提示詞:紫微流年重點(流年命宮/流年四化/所在大限)+ 完整紫微盤面
 * + 完整八字資料(標記基準流年)+ 雙系統流年判讀順序。
 * ziWei 可省略(容錯),省略時退回純八字版。
 * @param {object} chartData { input, baZi, ziWei, year }
 */
export function formatAnnualPromptForAI({ input, baZi, ziWei = null, year }) {
  const gz = baZi.annualPillars?.[year] ?? yearGanZhiOf(year);
  const lifeStage = annualLifeStage(input, year);
  const title = ziWei ? '紫微斗數×四柱八字' : '四柱八字';
  const lines = [
    `這是${title} 流年${year}年${gz ? `(${gz}年)` : ''}解讀提示詞。`,
    `當事人在該年度約${lifeStage.age}歲(周歲可能因生日尚未到而少1歲)，人生階段為「${lifeStage.label}」。`,
    `本年解讀應優先放在:${lifeStage.focus}。`,
    `禁止不合年齡的預設:${lifeStage.avoid}。命盤術語中的「官祿／事業／財」若與年齡不符，必須轉譯為當時實際可能存在的責任、學習、生活資源或家庭事務。`,
    '',
  ];

  if (ziWei) {
    // 紫微流年重點:流年命宮(該年地支疊本命何宮)、流年干四化落宮、所在大限與大限四化
    const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
    const annualPalace = byBranch[gz[1]];
    const zwAnnual = composeZiWeiAnnualChange(ziWei, year, { mode: 'study' });
    const age = year - input.year + 1; // 虛歲,與大限起始歲對齊
    const limit = ziWei.majorLimits.find((l) => {
      const [a, b] = l.ageRange.split('~').map(Number);
      return age >= a && age <= b;
    });

    lines.push(`◆ 紫微斗數 ${year}年(${gz}年)流年重點`);
    if (annualPalace) {
      const stars = annualPalace.majorStars.length
        ? annualPalace.majorStars.map(formatMajorStar).join(' ')
        : '無主星(空宮,借對宮)';
      lines.push(line('流年命宮', `${gz[1]}宮,疊本命${annualPalace.name}(${annualPalace.position})|主星:${stars}`));
    }
    if (zwAnnual.entries.length) {
      lines.push(line(`流年四化(${gz[0]}干)`, zwAnnual.entries.map((e) => `${e.star}化${e.mutagen}→${e.palace}`).join('、')));
    }
    let zwDecadal = null;
    if (limit) {
      lines.push(line('所在大限', `${limit.ganZhi}限(${limit.ageRange}歲)`));
      zwDecadal = composeZiWeiDecadalChange(ziWei, limit, { mode: 'study' });
      if (zwDecadal.entries.length) {
        lines.push(line(`大限四化(${limit.ganZhi[0]}干)`, zwDecadal.entries.map((e) => `${e.star}化${e.mutagen}→${e.palace}`).join('、')));
      }
    }
    lines.push('');

    const relevantNames = new Set([
      annualPalace?.name,
      ...zwAnnual.entries.map((e) => e.palace),
      ...(zwDecadal?.entries ?? []).map((e) => e.palace),
    ].filter(Boolean));
    const selfByPalace = Object.fromEntries(computeSelfTransformations(ziWei).map((item) => [
      item.palaceName,
      [
        ...item.outgoing.map((e) => `${e.star}↓${e.mutagen}`),
        ...item.incoming.map((e) => `${e.star}↑${e.mutagen}`),
      ],
    ]));
    lines.push('◆ 本年相關本命宮位');
    for (const palace of ziWei.palaces.filter((p) => relevantNames.has(p.name))) {
      const stars = palace.majorStars.length
        ? palace.majorStars.map(formatMajorStar).join(' ')
        : '無主星(空宮,借對宮)';
      const self = selfByPalace[palace.name]?.join('、') ?? '';
      lines.push(`${palace.name}(${palace.position})｜主星:${stars}${self ? `｜自化:${self}` : ''}`);
    }
    lines.push('');
  }

  const order = ziWei
    ? [
        '1) 先用一句話點出全年最重要主題，再列2至3個具體生活表現。',
        '2) 交叉比對流年命宮與大限／流年四化、八字目前大運與本年十神；一致處優先，不同調時分開說明。',
        '3) 說明一項適合推進、一項需要留意的事，各給具體做法，不作吉凶或必然事件斷語。',
        '4) 依十二流月整併成上半年／下半年或四季節奏，不逐月寫十二段。',
        `5) 全部情境必須符合約${lifeStage.age}歲的「${lifeStage.label}」，不得預設穩定職涯、婚姻或固定資產。`,
      ]
    : [
        '1) 先用一句話點出全年主題，再列2至3個具體生活表現。',
        '2) 交叉目前大運、本年十神與流年支引動，說明一項適合推進及一項需要留意的事。',
        '3) 依十二流月整併成上半年／下半年或四季節奏，不逐月寫十二段。',
        `4) 全部情境必須符合約${lifeStage.age}歲的「${lifeStage.label}」，不作吉凶或必然事件斷語。`,
      ];

  lines.push(
    formatAnnualBaZiSection(baZi, year, gz),
    '',
    line('性別', input.gender === 'female' ? '女性' : '男性'),
    line('該年人生階段', `約${lifeStage.age}歲・${lifeStage.label}`),
    '',
    `問題: 請以 ${year} 年${gz ? `(${gz}年)` : ''}為基準,${ziWei ? '綜合紫微斗數與八字,' : ''}分析這一年整體運勢的變化與重點。`,
    '判讀順序:',
    ...order,
    `寫作風格:${NATURAL_TW_STYLE}`,
    '',
    '回覆控制在約800至1200個中文字。以上資料由排盤引擎產生,請直接引用,不要重算或自行推導；',
    '正文先講白話與生活情境，命理依據集中在最後最多3句。',
  );
  return lines.join('\n');
}

// ---------- 姓名學提示詞(五格剖象法真實數字 + 姓名五行×喜用神 + 紫微角度 + 生肖,全部是已算好的事實;
// 「姓名賦予的特質/天賦/隱患/事業運勢/人生階段運勢/生肖姓名速配」這種長篇narrative沒有把握逐條核對
// 正確的固定對照表,不在網站上手刻,改成把真實數據整理好,交給AI依這些事實去合理詮釋撰寫) ----------

/**
 * @param {object} data
 * @param {object} data.input   { year, month, day, hour, gender }
 * @param {string} data.surname 姓
 * @param {string} data.given   名
 * @param {object} data.baZi    convertToBaZi() 輸出(取喜用神/日主用)
 * @param {object} data.ziWei   convertToZiWei() 輸出(取命宮主星用)
 * @returns {Promise<string|null>} 純文字提示詞;姓名用字不在字典或姓名結構不支援時回傳 null
 *   (姓名字庫是動態載入的,所以這支是唯一一個非同步的 format*PromptForAI)
 */
export async function formatNamingPromptForAI({ input, surname, given, baZi, ziWei }) {
  const { computeWuGe, analyzeNameElements, analyzeZiweiOverlap, zodiacOf } = await import('./naming.js');
  const fullName = `${surname}${given}`;
  const wuGe = computeWuGe(surname, given);
  const ys = computeYongShen(baZi);
  const nameEl = analyzeNameElements(fullName, ys);
  if (!wuGe.ok && !nameEl.known.length) return null; // 姓名用字完全不在字典裡,給不出任何真實依據,不硬湊提示詞

  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  let lifeStars = life.majorStars.map((s) => s.name);
  let lifeBorrowed = false;
  if (!lifeStars.length) {
    const oppBranch = BRANCHES_GZ[(BRANCHES_GZ.indexOf(life.position[1]) + 6) % 12];
    lifeStars = byBranch[oppBranch]?.majorStars.map((s) => s.name) ?? [];
    lifeBorrowed = true;
  }
  const zw = analyzeZiweiOverlap(nameEl.known, lifeStars);
  const zodiac = zodiacOf(input.year);

  const lines = [];
  lines.push('【姓名學基本資料】');
  lines.push(line('姓名', `${fullName}(${input.gender === 'female' ? '女' : '男'})`));
  lines.push(line('出生年', `西元${input.year}年,生肖${zodiac.animal}(五行屬${zodiac.element})`));
  lines.push('');

  if (wuGe.ok) {
    lines.push('◆ 五格剖象法(熊崎氏姓名學公式計算,以下數字均為實算結果)');
    for (const k of ['天格', '人格', '地格', '外格', '總格']) {
      lines.push(line(k, `${wuGe.grid[k]}(五行屬${wuGe.elements[k]})`));
    }
    lines.push(line('天格→人格', wuGe.sancai.tianRen));
    lines.push(line('人格→地格', wuGe.sancai.renDi));
    lines.push('');
  } else if (wuGe.unknown?.length) {
    lines.push(`◆ 五格剖象法:「${wuGe.unknown.join('、')}」不在筆畫字典裡,無法計算,請不要自行假設筆畫數。`);
    lines.push('');
  }

  if (nameEl.known.length) {
    lines.push('◆ 姓名用字五行');
    lines.push(nameEl.known.map((k) => `${k.char}(${k.strokes}畫,${k.element})`).join('、'));
    lines.push(line('日主', `${baZi.fourPillars.dayPillar.stem}(${ys.dayEl})|${ys.strength}`));
    lines.push(line('喜用神', ys.favorable.map((f) => `${f.element}(${f.role})`).join('、') || '無'));
    lines.push(line('忌神', ys.unfavorable.map((f) => `${f.element}(${f.role})`).join('、') || '無'));
    lines.push(line('姓名五行 vs 喜用神判斷', `${nameEl.verdict}——${nameEl.verdictNote}`));
    lines.push('');
  }

  if (zw) {
    lines.push('◆ 紫微命宮主星五行');
    lines.push(line('命宮主星', `${lifeBorrowed ? '(命宮無主星,借對宮)' : ''}${zw.stars.join('、')},五行屬${zw.starEls.join('、')}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '請根據以上已計算資料，回答「這個名字如何補益本人、最值得發揮什麼、要留意什麼」。',
    '輸出分成「名字帶來的氣質」「可發揮的方向」「需要留意」三段，每段只留1至2個最有依據的結論。',
    '',
    '寫作要求:',
    '- 只能使用上面提供的真實數字與五行資料做詮釋依據,不要自己另外編造筆畫數、宮位或星曜',
    '- 語氣自然易懂、像在對本人說話,避免堆砌艱澀命理術語',
    '- 抽象形容詞必須接具體行為或生活情境；不要從姓名延伸預測完整人生階段',
    `- ${NATURAL_TW_STYLE}`,
    '- 回覆控制在約600至900個中文字，命理依據最後最多3句',
    '- 結尾加一句提醒:這是傳統命理規則的娛樂性解讀,不構成人生決策依據',
  );
  return lines.join('\n');
}

// ---------- 每日／週運提示詞(完整命盤 + 七日逐日十神,取代原本只有摘要沒有命盤的通用格式) ----------

/**
 * @param {object} data
 * @param {object} data.input  { year, month, day, hour, gender }
 * @param {object} data.baZi   convertToBaZi() 輸出
 * @param {object} data.ziWei  convertToZiWei() 輸出
 * @param {Array}  data.days   [{ date, week, gz, god, yi, theme, avoidHit }]
 * @param {object} data.curLimit       目前所在大限 { ganZhi, ageRange }
 * @param {string} data.curLimitPalace 目前大限對應的紫微宮位名稱
 * @param {Array}  data.favorable  computeYongShen().favorable
 * @param {Array}  data.unfavorable computeYongShen().unfavorable
 */
export function formatDailyPromptForAI({ input, baZi, ziWei, days, curLimit, curLimitPalace, favorable, unfavorable }) {
  const fmtEls = (arr) => (arr.length ? arr.map((x) => `${x.element}(${x.role})`).join('、') : '無');
  const fp = baZi.fourPillars;
  const pillars = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']
    .map((key) => `${PILLAR_LABEL[key]}${fp[key].stem}${fp[key].branch}`)
    .join('、');
  const limitPalace = ziWei.palaces.find((p) => p.name === curLimitPalace);
  const limitStars = limitPalace?.majorStars.length
    ? limitPalace.majorStars.map(formatMajorStar).join(' ')
    : '無主星(空宮)';
  const decadal = composeZiWeiDecadalChange(ziWei, curLimit, { mode: 'study' });
  return [
    '這是紫微斗數×八字 每日／週運提示詞。',
    '',
    line('基本資料', `${input.gender === 'female' ? '女' : '男'}，${input.year}年${input.month}月${input.day}日${input.hour}時`),
    line('四柱', pillars),
    line('日主', `${fp.dayPillar.stem}；${computeYongShen(baZi).strength}`),
    line('喜用神', fmtEls(favorable)),
    line('忌神', fmtEls(unfavorable)),
    line('目前階段', `${curLimit.ganZhi}限(${curLimit.ageRange}歲)・紫微${curLimitPalace}｜主星:${limitStars}`),
    line('大限四化', decadal.entries.map((e) => `${e.star}化${e.mutagen}→${e.palace}`).join('、') || '無'),
    '',
    '◆ 未來七日逐日干支與十神(黃曆宜取自傳統宜忌,忌神五行僅指當日天干或地支五行貼近本命忌神)',
    ...days.map((d) => `${d.date} ${d.week}｜${d.gz}｜十神:${d.god}｜黃曆宜:${d.yi}${d.avoidHit ? '｜貼近忌神五行' : ''}`),
    '',
    '問題: 請分析這七天的節奏，指出適合推進、適合整理、需要放慢的日期。',
    '輸出規則:',
    '1) 開頭用2句白話概括本週主軸，不做七天逐項命理教學。',
    '2) 只挑最有差異的3至4天詳寫，每天包含適合做什麼、什麼情境要放慢；其餘日期用一行表格簡述。',
    '3) 交叉喜忌、每日十神與目前大限；「貼近忌神」只代表提高警覺，不等於當天會發生壞事。',
    '4) 建議必須能直接執行，不涉醫療、法律或財務決策；命理依據最後最多2句。',
    `5) ${NATURAL_TW_STYLE}`,
    '',
    '回覆控制在約600至900個中文字。資料是已完成計算的觀察紀錄，不要重算、補資料或擴寫完整人生報告。',
  ].join('\n');
}

// ---------- 生涯時間軸提示詞(完整命盤 + 十個大限四化 + 使用者記錄的真實事件) ----------

/**
 * @param {object} data
 * @param {object} data.input  { year, month, day, hour, gender }
 * @param {object} data.baZi   convertToBaZi() 輸出
 * @param {object} data.ziWei  convertToZiWei() 輸出
 * @param {Array}  data.events [{ year, title }] 使用者手動記錄的過往事件
 */
export function formatTimelinePromptForAI({ input, baZi, ziWei, events }) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const blocks = ziWei.majorLimits.map((l, i) => {
    const [start, end] = l.ageRange.split('~').map(Number);
    const from = input.year + start - 1, to = input.year + end - 1;
    const palace = byBranch[l.ganZhi[1]];
    const decadal = composeZiWeiDecadalChange(ziWei, l, { mode: 'study' });
    const huaTxt = decadal.entries.length ? decadal.entries.map((e) => `${e.star}化${e.mutagen}→${e.palace}`).join('、') : '無';
    const inside = events.filter((e) => Number(e.year) >= from && Number(e.year) <= to);
    const tag = `第${i + 1}限 ${l.ganZhi}限(${l.ageRange}歲,${from}-${to}年)｜宮位:${palace?.name ?? '—'}｜大限四化:${huaTxt}`;
    return inside.length ? `${tag}｜已記錄事件:${inside.map((e) => `${e.year} ${e.title}`).join('、')}` : tag;
  });
  const fp = baZi.fourPillars;
  const ys = computeYongShen(baZi);
  const baZiLuck = baZi.greatLuckCycles
    .map((cycle) => `${cycle.ganZhi}(${cycle.ageRange}歲，${cycle.startYear}年起)`)
    .join('、');
  return [
    '這是紫微斗數 生涯運勢時間軸與事件驗盤提示詞。',
    '',
    line('基本資料', `${input.gender === 'female' ? '女' : '男'}，${input.year}年${input.month}月${input.day}日${input.hour}時；命宮${ziWei.lifePalace}、身宮${ziWei.bodyPalace}`),
    line('四柱', `${fp.yearPillar.stem}${fp.yearPillar.branch} ${fp.monthPillar.stem}${fp.monthPillar.branch} ${fp.dayPillar.stem}${fp.dayPillar.branch} ${fp.hourPillar.stem}${fp.hourPillar.branch}`),
    line('八字核心', `${fp.dayPillar.stem}日主、${ys.strength}；喜用${ys.favorable.map((x) => x.element).join('、') || '無'}；忌${ys.unfavorable.map((x) => x.element).join('、') || '無'}`),
    line('八字大運', baZiLuck),
    '',
    '◆ 十個大限與已記錄事件',
    ...blocks,
    '',
    '問題: 請協助回顧人生階段，找出已記錄事件與大限／大運之間可核對的模式。',
    '輸出規則:',
    '1) 有事件的階段優先詳寫；沒有事件的階段只用一句主題概括，不逐限展開成十篇報告。',
    '2) 先整理2至4個跨階段重複模式，每個模式都要引用至少一項真實事件；資料不足就明說。',
    '3) 區分「事件已知事實」與「命理上的可能解釋」，不得把吻合寫成因果證明。',
    '4) 未來階段只說可觀察的主題，不預言具體事件；最後提供2個可用來繼續驗盤的問題。',
    `5) ${NATURAL_TW_STYLE}`,
    '',
    '回覆控制在約1000至1500個中文字，正文用白話，命理依據最後最多3句。不要重算或補入未提供的事件。',
  ].join('\n');
}

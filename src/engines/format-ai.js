// src/engines/format-ai.js — 把排盤結果轉換成給AI閱讀的純文字格式
// 用途:「複製給AI解讀」按鈕,把 convertToZiWei() / convertToBaZi() 的原始輸出攤平成
// 人類與LLM都好讀的純文字,附上固定的解讀指令,讓使用者可以直接貼給任何一個對話式AI。

import { relationDisplayName } from './compose-branch-relations.js';

const ELEMENT_NAME = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const BRANCH_LABEL = { yearBranch: '年支', monthBranch: '月支', dayBranch: '日支', hourBranch: '時支' };
const PILLAR_LABEL = { yearPillar: '年柱', monthPillar: '月柱', dayPillar: '日柱', hourPillar: '時柱' };

const line = (label, value) => `${label}:${value}`;

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

function formatBaZiSection(baZi) {
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
  lines.push('');

  lines.push('◆ 流年列表');
  for (const [year, ganZhi] of Object.entries(baZi.annualPillars)) {
    lines.push(`${year}年:${ganZhi}`);
  }
  lines.push('');

  lines.push('◆ 流月列表');
  // 注意:monthlyPillars 的 key 是 '01'~'12' 這種補零字串,'10'/'11'/'12' 屬於JS的
  // 「類陣列索引」canonical 整數字串,會被引擎排到所有非canonical字串key(如'01')前面,
  // 直接用 Object.entries() 迭代會出現 10,11,12,1,2,...,9 這種錯亂順序,
  // 這裡改成明確依 1~12 月份順序取值,確保輸出是正確的時間序。
  lines.push(
    Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const key = String(m).padStart(2, '0');
      return `${m}月:${baZi.monthlyPillars[key]}`;
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
export function formatChartForAI({ input, ziWei, baZi }) {
  return [
    formatZiWeiSection(ziWei, input),
    '',
    formatBaZiSection(baZi),
    '',
    '---',
    '',
    AI_INSTRUCTION,
  ].join('\n');
}

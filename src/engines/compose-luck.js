// src/engines/compose-luck.js — 大運/流年疊加解讀
// 紫微:當前大限(或流年)落在哪一宮 → 套該宮位×主星基礎解釋 → 疊時間框架句
// 八字:大運/流年天干對日主的十神 → 歸類五大運別 → 先比對大運類別與流年類別是否相同
//       → 相同時合併成一段(避免完整類別解讀重複輸出兩次),不同時用對比句銜接
import overlays from '../data/luck-cycle-overlays.json' with { type: 'json' };
import tenGodsDb from '../data/ten-gods-meanings.json' with { type: 'json' };
import { composePalaceReading } from './compose.js';

const ZW = overlays['紫微大限流年疊加'];
const BZ = overlays['八字大運流年類別疊加'];
const BZ_LOGIC = BZ['組裝判斷邏輯'];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const oppositeBranch = (b) => BRANCHES[(BRANCHES.indexOf(b) + 6) % 12];
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];
const fill = (tpl, vars) => tpl.replace(/\{(.+?)\}/g, (_, k) => vars[k] ?? `{${k}}`);

// ---------- 十神推算(大運/流年天干 vs 日主) ----------
const STEM_INFO = {
  甲: { e: '木', yang: true }, 乙: { e: '木', yang: false },
  丙: { e: '火', yang: true }, 丁: { e: '火', yang: false },
  戊: { e: '土', yang: true }, 己: { e: '土', yang: false },
  庚: { e: '金', yang: true }, 辛: { e: '金', yang: false },
  壬: { e: '水', yang: true }, 癸: { e: '水', yang: false },
};
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // 我剋

export function tenGodOf(dayStem, otherStem) {
  const me = STEM_INFO[dayStem];
  const it = STEM_INFO[otherStem];
  const same = me.yang === it.yang;
  if (it.e === me.e) return same ? '比肩' : '劫財';
  if (SHENG[me.e] === it.e) return same ? '食神' : '傷官';
  if (KE[me.e] === it.e) return same ? '偏財' : '正財';
  if (KE[it.e] === me.e) return same ? '七殺' : '正官';
  return same ? '偏印' : '正印'; // 生我
}

export const categoryOf = (god) =>
  Object.entries(BZ['類別對應']).find(([, gods]) => gods.includes(god))?.[0] ?? null;

// ---------- 紫微:大限 / 流年 ----------
function palaceMaps(ziWei, mode = 'public') {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const readingAt = (branch) =>
    composePalaceReading(byBranch[branch], byBranch[oppositeBranch(branch)], { mode });
  return { byBranch, readingAt };
}

/**
 * 紫微大限 + 流年疊加
 * 大限宮位與流年宮位偶爾會剛好相同(同宮),此時先比對再決定要不要合併,
 * 避免像舊版一樣大限、流年各自完整輸出一次同一段星曜解讀,造成重複段落。
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} [opts] { age = ziWei.age, year = 當年, mode = 'public' | 'study' }
 */
export function composeZiWeiLuck(ziWei, { age = ziWei.age, year = new Date().getFullYear(), mode = 'public' } = {}) {
  const { readingAt } = palaceMaps(ziWei, mode);

  // 大限:找 age 落在哪個區間 → 該干支地支即大限宮位
  const limit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return age >= a && age <= b;
  });

  // 流年:該年地支即流年宮位
  const gz = yearGanZhi(year);
  const annualReading = readingAt(gz[1]);

  let decadal = null;
  let merged = false;

  if (limit) {
    const [startAge, endAge] = limit.ageRange.split('~');
    const limitReading = readingAt(limit.ganZhi[1]);
    merged = limitReading.palaceName === annualReading.palaceName;

    decadal = merged
      ? {
          ganZhi: limit.ganZhi,
          ageRange: limit.ageRange,
          palaceName: limitReading.palaceName,
          text: [
            fill(ZW['大限流年同宮模板'], {
              startAge, endAge, 大限干支: limit.ganZhi,
              西元年: year, 流年干支: gz,
              宮位名稱: limitReading.palaceName,
              宮位星曜解釋: limitReading.text,
            }),
          ].join('\n'),
        }
      : {
          ganZhi: limit.ganZhi,
          ageRange: limit.ageRange,
          palaceName: limitReading.palaceName,
          text: [
            fill(ZW['大限開頭句模板'], { startAge, endAge, ganZhi: limit.ganZhi, 宮位名稱: limitReading.palaceName }),
            limitReading.text,
            fill(ZW['大限結尾句'], { 宮位名稱: limitReading.palaceName }),
          ].join('\n'),
        };
  }

  // 已經合併進 decadal 的話,annual 不再獨立輸出,避免呼叫端([decadal?.text, annual?.text].join)
  // 把同一段星曜解讀再接一次
  const annual = merged
    ? null
    : {
        year,
        ganZhi: gz,
        palaceName: annualReading.palaceName,
        text: [
          fill(ZW['流年開頭句模板'], { 西元年: year, 干支: gz, 宮位名稱: annualReading.palaceName }),
          annualReading.text,
          fill(ZW['流年結尾句'], { 宮位名稱: annualReading.palaceName }),
        ].join('\n'),
      };

  return { decadal, annual };
}

// ---------- 八字:大運 / 流年類別疊加(先比對是否重複,再決定合併或對比) ----------

/**
 * 依大運類別與流年類別是否相同,組出合併版/對比版/僅流年版的疊加文字。
 * 抽成共用函式,comprehensive.js 的八字第3段也呼叫同一份邏輯,避免兩處各自實作、
 * 各自忘記做重複檢查。
 * @param {{ganZhi, ageRange, category, god}|null} decadalInfo
 * @param {{ganZhi, year, category, god}|null} annualInfo
 * @returns {{ text: string, merged: boolean }|null}
 */
export function composeBaZiCycleOverlay(decadalInfo, annualInfo) {
  if (!decadalInfo && !annualInfo) return null;

  if (decadalInfo && annualInfo) {
    const [startAge, endAge] = decadalInfo.ageRange.split('~');
    if (decadalInfo.category === annualInfo.category) {
      return {
        merged: true,
        text: fill(BZ_LOGIC['類別相同時']['模板'], {
          大運干支: decadalInfo.ganZhi, 起始歲: startAge, 結束歲: endAge,
          西元年: annualInfo.year, 流年干支: annualInfo.ganZhi,
          類別名稱: decadalInfo.category, 類別解讀: BZ['類別解讀'][decadalInfo.category],
        }),
      };
    }
    return {
      merged: false,
      text: fill(BZ_LOGIC['類別不同時']['模板'], {
        大運干支: decadalInfo.ganZhi, 起始歲: startAge, 結束歲: endAge,
        大運類別: decadalInfo.category, 大運類別解讀: BZ['類別解讀'][decadalInfo.category],
        西元年: annualInfo.year, 流年干支: annualInfo.ganZhi,
        流年類別: annualInfo.category, 流年類別解讀: BZ['類別解讀'][annualInfo.category],
      }),
    };
  }

  if (annualInfo) {
    return {
      merged: false,
      text: fill(BZ_LOGIC['僅有流年無大運時']['模板'], {
        西元年: annualInfo.year, 流年干支: annualInfo.ganZhi,
        類別名稱: annualInfo.category, 類別解讀: BZ['類別解讀'][annualInfo.category],
      }),
    };
  }

  // 只有大運沒有流年,理論上不會發生(流年一定存在),保留容錯
  const [startAge, endAge] = decadalInfo.ageRange.split('~');
  return {
    merged: false,
    text: `這十年大運走${decadalInfo.ganZhi}(${startAge}歲至${endAge}歲),屬於${decadalInfo.category},${BZ['類別解讀'][decadalInfo.category]}`,
  };
}

/**
 * 八字大運 + 流年疊加(供「解讀報告」大運概況區塊使用)
 * mode = 'public'(預設):只留類別結論句;mode = 'study':額外附上「細節上,{十神}——{完整解釋}」的依據句。
 * @param {object} baZi  convertToBaZi() 輸出
 * @param {object} [opts] { year = 當年, mode = 'public' | 'study' }
 */
export function composeBaZiLuck(baZi, { year = new Date().getFullYear(), mode = 'public' } = {}) {
  const dayStem = baZi.fourPillars.dayPillar.stem;

  const cycle = baZi.greatLuckCycles.find(
    (c) => year >= c.startYear && year < c.startYear + 10,
  );
  let decadalInfo = null;
  if (cycle) {
    const god = tenGodOf(dayStem, cycle.ganZhi[0]);
    const category = categoryOf(god);
    if (category) {
      decadalInfo = { ganZhi: cycle.ganZhi, ageRange: cycle.ageRange, startYear: cycle.startYear, god, category };
    }
  }

  const gz = baZi.annualPillars[year] ?? yearGanZhi(year);
  let annualInfo = null;
  {
    const god = tenGodOf(dayStem, gz[0]);
    const category = categoryOf(god);
    if (category) annualInfo = { ganZhi: gz, year, god, category };
  }

  const overlay = composeBaZiCycleOverlay(decadalInfo, annualInfo);
  if (!overlay) return { decadal: null, annual: null };

  const detailLine = (info) => `細節上,${info.god}——${tenGodsDb['十神核心意義'][info.god].core}`;
  const detailLines = [];
  if (mode === 'study') {
    if (decadalInfo) detailLines.push(detailLine(decadalInfo));
    if (annualInfo && !(decadalInfo && overlay.merged && decadalInfo.god === annualInfo.god)) {
      detailLines.push(detailLine(annualInfo));
    }
  }

  const fullText = [overlay.text, ...detailLines].join('\n');

  // 大運與流年的類別敘述已經合併/對比成同一段文字,只掛在其中一個欄位上,
  // 避免呼叫端(main.js)用 [decadal?.text, annual?.text] 相接時,把同一段內容再疊一次。
  if (decadalInfo) {
    return { decadal: { ...decadalInfo, text: fullText }, annual: null };
  }
  return { decadal: null, annual: { ...annualInfo, text: fullText } };
}

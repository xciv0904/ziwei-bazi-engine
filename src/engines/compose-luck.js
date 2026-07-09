// src/engines/compose-luck.js — 大運/流年疊加解讀
// 紫微:當前大限(或流年)落在哪一宮 → 套該宮位×主星基礎解釋 → 疊時間框架句
// 八字:大運/流年天干對日主的十神 → 歸類五大運別 → 類別解讀(宏觀)+ 單一十神(細節)
import overlays from '../data/luck-cycle-overlays.json' with { type: 'json' };
import tenGodsDb from '../data/ten-gods-meanings.json' with { type: 'json' };
import { composePalaceReading } from './compose.js';

const ZW = overlays['紫微大限流年疊加'];
const BZ = overlays['八字大運流年類別疊加'];

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

const categoryOf = (god) =>
  Object.entries(BZ['類別對應']).find(([, gods]) => gods.includes(god))?.[0] ?? null;

// ---------- 紫微:大限 / 流年 ----------
function palaceMaps(ziWei) {
  const byBranch = Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));
  const readingAt = (branch) =>
    composePalaceReading(byBranch[branch], byBranch[oppositeBranch(branch)]);
  return { byBranch, readingAt };
}

/**
 * 紫微大限 + 流年疊加
 * @param {object} ziWei  convertToZiWei() 輸出
 * @param {object} [opts] { age = ziWei.age, year = 當年 }
 */
export function composeZiWeiLuck(ziWei, { age = ziWei.age, year = new Date().getFullYear() } = {}) {
  const { readingAt } = palaceMaps(ziWei);

  // 大限:找 age 落在哪個區間 → 該干支地支即大限宮位
  const limit = ziWei.majorLimits.find((l) => {
    const [a, b] = l.ageRange.split('~').map(Number);
    return age >= a && age <= b;
  });
  let decadal = null;
  if (limit) {
    const [startAge, endAge] = limit.ageRange.split('~');
    const reading = readingAt(limit.ganZhi[1]);
    decadal = {
      ganZhi: limit.ganZhi,
      ageRange: limit.ageRange,
      palaceName: reading.palaceName,
      text: [
        fill(ZW['大限開頭句模板'], { startAge, endAge, ganZhi: limit.ganZhi, 宮位名稱: reading.palaceName }),
        reading.text,
        fill(ZW['大限結尾句'], { 宮位名稱: reading.palaceName }),
      ].join('\n'),
    };
  }

  // 流年:該年地支即流年宮位
  const gz = yearGanZhi(year);
  const reading = readingAt(gz[1]);
  const annual = {
    year,
    ganZhi: gz,
    palaceName: reading.palaceName,
    text: [
      fill(ZW['流年開頭句模板'], { 西元年: year, 干支: gz, 宮位名稱: reading.palaceName }),
      reading.text,
      fill(ZW['流年結尾句'], { 宮位名稱: reading.palaceName }),
    ].join('\n'),
  };

  return { decadal, annual };
}

// ---------- 八字:大運 / 流年 ----------
function baZiOverlay(ganZhi, openLine) {
  const god = ganZhi ? tenGodOf(baZiOverlay.dayStem, ganZhi[0]) : null;
  const category = god && categoryOf(god);
  if (!category) return null;
  const detail = tenGodsDb['十神核心意義'][god];
  return {
    ganZhi,
    tenGod: god,
    category,
    text: [
      openLine + BZ['類別解讀'][category],
      `細節上,${god}——${detail.core}`,
    ].join('\n'),
  };
}

/**
 * 八字大運 + 流年疊加
 * @param {object} baZi  convertToBaZi() 輸出
 * @param {object} [opts] { year = 當年 }
 */
export function composeBaZiLuck(baZi, { year = new Date().getFullYear() } = {}) {
  baZiOverlay.dayStem = baZi.fourPillars.dayPillar.stem;

  // 大運:找 year 落在哪個十年
  const cycle = baZi.greatLuckCycles.find(
    (c) => year >= c.startYear && year < c.startYear + 10,
  );
  let decadal = null;
  if (cycle) {
    const [startAge, endAge] = cycle.ageRange.split('~');
    decadal = baZiOverlay(
      cycle.ganZhi,
      fill(BZ['大運開頭句模板'], {
        干支: cycle.ganZhi, startAge, endAge,
        類別名稱: categoryOf(tenGodOf(baZiOverlay.dayStem, cycle.ganZhi[0])),
      }),
    );
    if (decadal) Object.assign(decadal, { ageRange: cycle.ageRange, startYear: cycle.startYear });
  }

  // 流年
  const gz = baZi.annualPillars[year] ?? yearGanZhi(year);
  const annual = baZiOverlay(
    gz,
    fill(BZ['流年開頭句模板'], {
      西元年: year, 干支: gz,
      類別名稱: categoryOf(tenGodOf(baZiOverlay.dayStem, gz[0])),
    }),
  );
  if (annual) annual.year = year;

  return { decadal, annual };
}

// src/engines/compose-annual.js — 流年變動解讀(八字)
// 選定任一西元年,分析該年對本命盤的變動:
//   1) 流年天干對日主的十神 → 五大運別(全年主軸)
//   2) 流年地支與四柱地支的合沖刑害 → 哪些人生領域被引動
// mode='public':白話;mode='study':附干支、十神、關係術語依據。
import overlays from '../data/luck-cycle-overlays.json' with { type: 'json' };
import { tenGodOf, categoryOf } from './compose-luck.js';
import { relationsBetween, relationDisplayName } from './compose-branch-relations.js';

const BZ = overlays['八字大運流年類別疊加'];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const yearGanZhi = (y) => STEMS[(y - 4) % 10] + BRANCHES[(y - 4) % 12];

const PILLAR_KEYS = [
  ['yearPillar', '年柱', '家庭與長輩'],
  ['monthPillar', '月柱', '職場與外在環境'],
  ['dayPillar', '日柱', '自己與另一半'],
  ['hourPillar', '時柱', '晚輩與晚年布局'],
];

// 流年支引動某柱的白話句({D} = 領域詞)
const ANNUAL_PLAIN_REL = {
  六合: (D) => `和「${D}」特別合拍,這方面的事容易順利推進、遇到願意幫忙的人`,
  沖: (D) => `正面衝撞「${D}」,這領域容易出現變動——搬遷、換位置、關係緊張都算,宜提早準備`,
  害: (D) => `對「${D}」有暗中消耗,容易累積小誤會或被瑣事拖住,多溝通、少硬碰`,
  刑: (D) => `與「${D}」互相較勁,這方面容易糾結、進兩步退一步,急不得`,
  相破: (D) => `會打亂「${D}」的既定步調,計畫保留彈性、備案先想好`,
  暗合: (D) => `和「${D}」有檯面下的牽動,一些變化悄悄發生,值得多留意`,
  半合: (D) => `為「${D}」加分,相關的事有同氣相求的助力`,
  半會: (D) => `強化「${D}」的能量,這領域的事會被放大、更受關注`,
  拱: (D) => `與「${D}」形成合力,能把資源聚到同一個焦點上`,
};

// 同一柱被多種關係引動時,只講最主要的一種(影響力排序,與 compose-branch-relations 一致)
const PRIORITY = ['沖', '刑', '害', '相破', '六合', '暗合', '拱', '半合', '半會'];

/**
 * @param {object} baZi  convertToBaZi() 輸出
 * @param {number} year  要查看的西元年
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ year, ganZhi, god, category, hits: Array, text }}
 */
export function composeAnnualChange(baZi, year, { mode = 'public' } = {}) {
  const gz = baZi.annualPillars?.[year] ?? yearGanZhi(year);
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const god = tenGodOf(dayStem, gz[0]);
  const category = categoryOf(god);

  const lines = [];

  // 1) 全年主軸(流年天干十神 → 運別)
  if (category) {
    const desc = BZ['類別解讀'][category] ?? '';
    lines.push(mode === 'study'
      ? `${year}年(${gz}年)流年天干${gz[0]}對日主${dayStem}為${god},屬${category}——${desc}`
      : `${year}年對你整體是「${category.replace('運', '')}」性質的一年:${desc}`);
  }

  // 2) 流年地支與四柱的引動
  const annualBranch = gz[1];
  const hits = [];
  for (const [key, label, domain] of PILLAR_KEYS) {
    const pillarBranch = baZi.fourPillars[key].branch;
    if (pillarBranch === annualBranch) {
      // 伏吟:流年支與本命柱支相同
      hits.push({ pillar: label, domain, relations: ['伏吟'] });
      lines.push(mode === 'study'
        ? `流年地支${annualBranch}與${label}地支相同(伏吟),該柱所主之事重複顯象,舊事重提。`
        : `「${domain}」這一年會特別有存在感,過去的老議題容易再浮上檯面。`);
      continue;
    }
    const rels = relationsBetween(annualBranch, pillarBranch);
    if (!rels.length) continue;
    hits.push({ pillar: label, domain, relations: rels });
    const displayed = rels.map((r) => relationDisplayName(r, annualBranch + pillarBranch));
    const primary = PRIORITY.find((p) => rels.includes(p)) ?? rels[0];
    if (mode === 'study') {
      lines.push(`流年地支${annualBranch}與${label}地支${pillarBranch}構成${displayed.join('、')},引動${domain}相關領域。`);
    } else {
      const plain = ANNUAL_PLAIN_REL[primary];
      if (plain) lines.push(`這一年${plain(domain)}。`);
    }
  }

  if (!hits.length) {
    lines.push(mode === 'study'
      ? '流年地支與四柱地支之間沒有明顯的合沖刑害,屬於相對平穩、少受牽動的一年。'
      : '這一年跟你命盤裡的各個領域沒有特別強烈的牽動,整體相對平穩,適合按自己的步調做事。');
  }

  return { year, ganZhi: gz, god, category, hits, text: lines.join('\n') };
}

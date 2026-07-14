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

// 五虎遁:年干 → 該年寅月(國曆約2月)的月干(流月干支計算用,與 lunar-javascript 驗證一致)
const TIGER_MONTH_STEM = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' };

/** 任一西元年的流月干支(國曆月對應節氣月:1月=前一年丑月、2月=寅月…12月=子月) */
export function monthlyPillarsOf(year) {
  const monthGz = (startStem, offset, branchIdx) =>
    STEMS[(STEMS.indexOf(startStem) + offset) % 10] + BRANCHES[branchIdx];
  const result = {};
  result['01'] = monthGz(TIGER_MONTH_STEM[yearGanZhi(year - 1)[0]], 11, 1);
  for (let m = 2; m <= 12; m++) {
    result[String(m).padStart(2, '0')] = monthGz(TIGER_MONTH_STEM[yearGanZhi(year)[0]], m - 2, m % 12);
  }
  return result;
}

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

  // 2) 流年地支與四柱的引動(與流月共用同一套核心)
  const { hits, lines: impactLines } = branchImpactLines(baZi, gz[1], mode, '這一年', '流年');
  lines.push(...impactLines);

  if (!hits.length) {
    lines.push(mode === 'study'
      ? '流年地支與四柱地支之間沒有明顯的合沖刑害,屬於相對平穩、少受牽動的一年。'
      : '這一年跟你命盤裡的各個領域沒有特別強烈的牽動,整體相對平穩,適合按自己的步調做事。');
  }

  return { year, ganZhi: gz, god, category, hits, text: lines.join('\n') };
}

// ---------- 紫微:流年四化 ----------
// 流年天干使四顆星化祿/權/科/忌(中州派,與 iztro 生年四化同一張表),
// 找出這四顆星落在本命盤哪個宮位 → 該宮位領域就是這一年被「點亮/施壓」的地方。
const FLOW_SIHUA = {
  甲: { 祿: '廉貞', 權: '破軍', 科: '武曲', 忌: '太陽' },
  乙: { 祿: '天機', 權: '天梁', 科: '紫微', 忌: '太陰' },
  丙: { 祿: '天同', 權: '天機', 科: '文昌', 忌: '廉貞' },
  丁: { 祿: '太陰', 權: '天同', 科: '天機', 忌: '巨門' },
  戊: { 祿: '貪狼', 權: '太陰', 科: '右弼', 忌: '天機' },
  己: { 祿: '武曲', 權: '貪狼', 科: '天梁', 忌: '文曲' },
  庚: { 祿: '太陽', 權: '武曲', 科: '太陰', 忌: '天同' },
  辛: { 祿: '巨門', 權: '太陽', 科: '文曲', 忌: '文昌' },
  壬: { 祿: '天梁', 權: '紫微', 科: '左輔', 忌: '武曲' },
  癸: { 祿: '破軍', 權: '巨門', 科: '太陰', 忌: '貪狼' },
};

// 宮位 → 白話領域(流年四化落點用)
const ZW_DOMAIN = {
  命宮: '你自己的整體狀態', 兄弟宮: '手足與平輩', 夫妻宮: '感情與婚姻', 子女宮: '子女、晚輩與創作',
  財帛宮: '財務理財', 疾厄宮: '健康', 遷移宮: '外出與際遇', 僕役宮: '人脈與合作',
  官祿宮: '事業', 田宅宮: '家庭與居所', 福德宮: '心境與精神生活', 父母宮: '長輩與上司',
};

const SIHUA_PLAIN = {
  祿: (D) => `有明顯的順風與貴人,${D}值得主動經營`,
  權: (D) => `${D}的話語權與推進力增強,適合承擔更多、拍板做決定`,
  科: (D) => `${D}容易獲得肯定與好名聲,適合曝光、累積口碑`,
  忌: (D) => `考驗與糾結集中在${D},宜謹慎緩行、留餘裕`, // 措辭中性,大限(十年)與流年共用
};

/** 在本命盤找出某顆星所在的宮位(主星找 majorStars,輔星找 minorStars 的名稱前綴) */
function palaceOfStar(ziWei, starName) {
  return ziWei.palaces.find((p) =>
    p.majorStars.some((s) => s.name === starName)
    || p.minorStars.some((s) => s.replace(/[((].*$/, '') === starName));
}

/** 某地支對四柱的引動(流年/流月共用核心;periodWord = 這一年/這個月) */
function branchImpactLines(baZi, targetBranch, mode, periodWord, periodLabel) {
  const hits = [];
  const lines = [];
  for (const [key, label, domain] of PILLAR_KEYS) {
    const pillarBranch = baZi.fourPillars[key].branch;
    if (pillarBranch === targetBranch) {
      hits.push({ pillar: label, domain, relations: ['伏吟'] });
      lines.push(mode === 'study'
        ? `${periodLabel}地支${targetBranch}與${label}地支相同(伏吟),該柱所主之事重複顯象,舊事重提。`
        : `「${domain}」${periodWord}會特別有存在感,過去的老議題容易再浮上檯面。`);
      continue;
    }
    const rels = relationsBetween(targetBranch, pillarBranch);
    if (!rels.length) continue;
    hits.push({ pillar: label, domain, relations: rels });
    if (mode === 'study') {
      const displayed = rels.map((r) => relationDisplayName(r, targetBranch + pillarBranch));
      lines.push(`${periodLabel}地支${targetBranch}與${label}地支${pillarBranch}構成${displayed.join('、')},引動${domain}相關領域。`);
    } else {
      const primary = PRIORITY.find((p) => rels.includes(p)) ?? rels[0];
      const plain = ANNUAL_PLAIN_REL[primary];
      if (plain) lines.push(`${periodWord}${plain(domain)}。`);
    }
  }
  return { hits, lines };
}

/**
 * 八字流月變動:該月干支對日主的十神主軸 + 流月支與四柱的引動
 * @param {object} baZi convertToBaZi() 輸出
 * @param {number} year 西元年
 * @param {number} month 國曆月(1-12)
 * @param {object} [opts] { mode = 'public' | 'study' }
 */
export function composeMonthlyChange(baZi, year, month, { mode = 'public' } = {}) {
  const gz = monthlyPillarsOf(year)[String(month).padStart(2, '0')];
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const god = tenGodOf(dayStem, gz[0]);
  const category = categoryOf(god);
  const lines = [];

  if (category) {
    const desc = BZ['類別解讀'][category] ?? '';
    lines.push(mode === 'study'
      ? `${year}年${month}月(${gz}月)月干${gz[0]}對日主${dayStem}為${god},屬${category}——${desc}`
      : `${month}月對你是「${category.replace('運', '')}」性質的月份:${desc}`);
  }
  const { hits, lines: impactLines } = branchImpactLines(baZi, gz[1], mode, '這個月', '流月');
  lines.push(...impactLines);
  if (!hits.length) {
    lines.push(mode === 'study'
      ? '流月地支與四柱地支之間沒有明顯的合沖刑害,屬於相對平穩的月份。'
      : '這個月跟你命盤裡的各個領域沒有特別強烈的牽動,按自己的步調走就好。');
  }
  return { year, month, ganZhi: gz, god, category, hits, text: lines.join('\n') };
}

/** 某天干的四化落宮(大限/流年共用核心) */
function sihuaEntriesOf(ziWei, stem, mode) {
  const lines = [];
  const entries = [];
  for (const [mut, starName] of Object.entries(FLOW_SIHUA[stem] ?? {})) {
    const palace = palaceOfStar(ziWei, starName);
    if (!palace) continue;
    entries.push({ mutagen: mut, star: starName, palace: palace.name });
    lines.push(mode === 'study'
      ? `${stem}干${starName}化${mut},落本命${palace.name}(${palace.position})。`
      : `化${mut}落在${palace.name}:${SIHUA_PLAIN[mut](ZW_DOMAIN[palace.name] ?? palace.name)}。`);
  }
  return { entries, lines };
}

/**
 * 紫微流年變動:流年四化落宮
 * @param {object} ziWei convertToZiWei() 輸出
 * @param {number} year  西元年
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ year, ganZhi, entries, text }}
 */
export function composeZiWeiAnnualChange(ziWei, year, { mode = 'public' } = {}) {
  const gz = yearGanZhi(year);
  const { entries, lines } = sihuaEntriesOf(ziWei, gz[0], mode);
  const header = mode === 'study'
    ? `${year}年(${gz}年)流年四化:`
    : `${year}年,命盤裡被「點亮」與「施壓」的地方:`;
  return { year, ganZhi: gz, entries, text: [header, ...lines].join('\n') };
}

/**
 * 紫微大限四化:大限天干使哪四顆星化祿權科忌、落在哪些宮位(十年層)
 * @param {object} ziWei convertToZiWei() 輸出
 * @param {object} limit ziWei.majorLimits 的元素({ ganZhi, ageRange })
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ ganZhi, ageRange, entries, text }}
 */
export function composeZiWeiDecadalChange(ziWei, limit, { mode = 'public' } = {}) {
  const stem = limit.ganZhi[0];
  const { entries, lines } = sihuaEntriesOf(ziWei, stem, mode);
  const header = mode === 'study'
    ? `${limit.ganZhi}限(${limit.ageRange}歲)大限四化:`
    : `這十年(${limit.ageRange.replace('~', '–')}歲),長期被「點亮」與「施壓」的地方:`;
  return { ganZhi: limit.ganZhi, ageRange: limit.ageRange, entries, text: [header, ...lines].join('\n') };
}

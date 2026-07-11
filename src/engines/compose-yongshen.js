// src/engines/compose-yongshen.js — 八字喜用神/忌神(扶抑取用法)
// 判定流程:
//   1) 日主五行 + 幫身力量(同我=比劫、生我=印)vs 抑身力量(其餘),月令加權 ×2
//   2) 身強 → 喜「剋洩耗」(官殺/食傷/財),忌「生扶」(印/比劫)
//      身弱 → 喜「生扶」(印/比劫),忌「剋洩耗」(官殺為首)
//   3) 每個喜/忌五行依它對日主的十神角色,給對應的白話影響說明
// 註:取用神各派系方法不一(扶抑/調候/通關…),此處採最通行的扶抑法,學習版會註明依據。

const STEM_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const BRANCH_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const EL_KEY = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // 我剋
const ELEMENTS = ['木', '火', '土', '金', '水'];

// 五行 → 對日主的十神角色
function roleOf(dayEl, el) {
  if (el === dayEl) return '比劫';
  if (SHENG[el] === dayEl) return '印';
  if (SHENG[dayEl] === el) return '食傷';
  if (KE[dayEl] === el) return '財';
  if (KE[el] === dayEl) return '官殺';
  return null;
}

// 該十神角色的五行天干(喜忌之年提示用)
function stemsOfElement(el) {
  return Object.entries(STEM_EL).filter(([, e]) => e === el).map(([s]) => s).join('、');
}

// 喜用神影響(白話,依十神角色)
const FAVOR_IMPACT = {
  印: '學習、進修、貴人與長輩的助力是你的補給站,多請教前輩、累積內在實力,運勢自然穩',
  比劫: '同伴與盟友是你的底氣,不要單打獨鬥,找對隊友、經營平輩情誼會事半功倍',
  食傷: '表達與創作是你的出口,把想法說出來、做出來,機會就會跟著來',
  財: '務實執行與理財規劃是你的加分項,把精力放在能落地、能變現的事情上',
  官殺: '紀律、制度與適度的壓力反而能讓你成長,敢於接受挑戰與規範會走得更快',
};

// 忌神影響(白話,依十神角色)
const AVOID_IMPACT = {
  印: '過度依賴保護傘會鈍化行動力,留意想太多、遲遲不決的慣性',
  比劫: '人情往來容易破財,合夥、借貸、擔保要格外謹慎',
  食傷: '鋒芒太露容易得罪權威或說錯話,重要發言前多想一步',
  財: '追逐眼前利益容易分心耗神,別讓賺錢的方式綁架了生活節奏',
  官殺: '長期高壓環境會消耗你,避免硬扛到底,學會設停損、適時求援',
};

/**
 * 計算喜用神與忌神
 * @param {object} baZi convertToBaZi() 輸出
 * @returns {{ dayEl, strength, helpScore, opposeScore, favorable: Array, unfavorable: Array }}
 */
export function computeYongShen(baZi) {
  const dayEl = STEM_EL[baZi.fourPillars.dayPillar.stem];
  const helpEls = new Set([dayEl, Object.keys(SHENG).find((e) => SHENG[e] === dayEl)]); // 比劫 + 印

  // 八字(四干四支)計數
  let help = 0;
  let oppose = 0;
  for (const [key, count] of Object.entries(baZi.fiveElementDistribution)) {
    if (helpEls.has(EL_KEY[key])) help += count;
    else oppose += count;
  }
  // 月令加權:月支五行再算兩分(得令/失令是強弱判斷的最大權重)
  const monthEl = BRANCH_EL[baZi.fourPillars.monthPillar.branch];
  if (helpEls.has(monthEl)) help += 2;
  else oppose += 2;

  const strength = help > oppose ? '身強' : help < oppose ? '身弱' : '中和';

  // 依強弱排出喜/忌(順序即重要度)
  let favorEls;
  let avoidEls;
  if (strength === '身強') {
    favorEls = [KE[dayEl], SHENG[dayEl], Object.keys(KE).find((e) => KE[e] === dayEl)]; // 財、食傷、官殺
    avoidEls = [dayEl, [...helpEls].find((e) => e !== dayEl)]; // 比劫、印
  } else if (strength === '身弱') {
    favorEls = [[...helpEls].find((e) => e !== dayEl), dayEl]; // 印、比劫
    avoidEls = [Object.keys(KE).find((e) => KE[e] === dayEl), KE[dayEl]]; // 官殺、財
  } else {
    // 中和:順月令而行,月令屬幫身則喜洩耗,反之喜生扶(取最溫和的一組)
    favorEls = helpEls.has(monthEl) ? [SHENG[dayEl], KE[dayEl]] : [[...helpEls].find((e) => e !== dayEl), dayEl];
    avoidEls = ELEMENTS.filter((e) => !favorEls.includes(e) && e !== dayEl).slice(0, 1);
  }

  const wrap = (els) => els.filter(Boolean).map((el) => ({ element: el, role: roleOf(dayEl, el) }));
  return { dayEl, strength, helpScore: help, opposeScore: oppose, favorable: wrap(favorEls), unfavorable: wrap(avoidEls) };
}

/**
 * 組裝喜用神/忌神解讀
 * mode='public':白話;mode='study':附幫身/抑身分數、月令加權、取用方法說明
 * @returns {{ result, text }}
 */
export function composeYongShenReading(baZi, { mode = 'public' } = {}) {
  const r = computeYongShen(baZi);
  const dayStem = baZi.fourPillars.dayPillar.stem;
  const monthBranch = baZi.fourPillars.monthPillar.branch;
  const lines = [];

  // 1) 身強弱結論
  const strengthPlain = {
    身強: '自帶的能量偏旺,適合「洩」——把力氣用出去',
    身弱: '自帶的能量偏弱,需要「補」——多吸收支持與養分',
    中和: '能量大致平衡,順著季節與環境調節即可',
  }[r.strength];
  lines.push(mode === 'study'
    ? `日主${dayStem}(${r.dayEl}),生於${monthBranch}月(${BRANCH_EL[monthBranch]}當令)。幫身${r.helpScore}分、抑身${r.opposeScore}分(月令加權×2),判為「${r.strength}」。取用方法:扶抑法(各派系取用方式不一,結果僅供參考)。`
    : `你的日主是${dayStem}(${r.dayEl}),整體屬於「${r.strength}」:${strengthPlain}。`);

  // 2) 喜用神 + 影響
  for (const { element, role } of r.favorable) {
    lines.push(`喜用神「${element}」(${role}):${FAVOR_IMPACT[role]}。遇到天干屬${element}的年份(${stemsOfElement(element)}年),整體較順,適合推進重要的事。`);
  }

  // 3) 忌神 + 影響
  for (const { element, role } of r.unfavorable) {
    lines.push(`忌神「${element}」(${role}):${AVOID_IMPACT[role]}。遇到天干屬${element}的年份(${stemsOfElement(element)}年),宜放慢腳步、保守應對。`);
  }

  return { result: r, text: lines.join('\n') };
}

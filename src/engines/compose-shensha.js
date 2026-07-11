// src/engines/compose-shensha.js — 神煞(貴人星/煞星)解讀組裝引擎
// 組裝邏輯(照 shensha-analysis.json):
//   以「柱」為單位輸出,同一柱若有多個神煞,合併成一句,
//   柱位背景句只在該柱的敘述最後講一次,不逐條重複。
import db from '../data/shensha-analysis.json' with { type: 'json' };

const CORE = { ...db['貴人星解讀'], ...db['煞星解讀'] };
const PILLAR_BG = db['柱位修飾'];

const PILLARS = [
  { key: 'yearPillar', label: '年柱' },
  { key: 'monthPillar', label: '月柱' },
  { key: 'dayPillar', label: '日柱' },
  { key: 'hourPillar', label: '時柱' },
];

const stripPeriod = (s) => s.replace(/。\s*$/, '');
const stripLead = (s) => s.replace(/^代表/, '');

// ---------- 大眾版:白話短語 ----------
// 神煞名稱對一般人是黑話(天乙貴人?空亡?),大眾版不逐條丟術語+完整解釋,
// 改成「這一柱的人生領域:加分的地方…;要留意的是…」的口語總結。
// 每個神煞一句手寫白話短語(不從完整解讀截字,避免斷句斷出奇怪的半句)。
const PLAIN_SHENSHA = {
  // 加分面
  文昌貴人: '讀書、考試與文書運不錯',
  太極貴人: '對哲學、命理這類內在探索特別有領悟力',
  天廚貴人: '口福好,飲食方面常有好機緣',
  學堂: '學習力強、愛求知',
  月德貴人: '遇到麻煩常有人幫,特別是女性長輩',
  天乙貴人: '關鍵時刻總會出現幫你一把的人',
  天德合: '需要有人緩頰、調解時特別有人緣',
  國印貴人: '容易被上位者或體制賞識',
  福星貴人: '福氣底子好,日子容易過得安穩',
  天德貴人: '為人寬厚,自帶讓人安心的信賴感',
  十靈: '直覺敏銳,對氣氛和人心變化很有感',
  將星: '有領導架式,天生撐得起場面',
  // 提醒面
  紅艷煞: '異性緣強,感情上要懂得拿捏分寸',
  孤辰: '偶爾會覺得孤單、跟人有距離,關係要主動經營',
  空亡: '這塊領域容易使不上力、事倍功半,要更務實地經營',
  喪門: '情緒容易低落,要留意心情調適',
  劫煞: '提防突發的破財或意外,做決定別太衝動',
  元辰: '容易心神不寧、判斷搖擺,大事多想一晚再定',
};
const PLAIN_POSITIVE = new Set(['文昌貴人', '太極貴人', '天廚貴人', '學堂', '月德貴人', '天乙貴人', '天德合', '國印貴人', '福星貴人', '天德貴人', '十靈', '將星']);
const PILLAR_PLAIN = { 年柱: '早年與家庭', 月柱: '成長環境與工作圈', 日柱: '你自己與親密關係', 時柱: '晚年與子女緣' };

/** 大眾版:單一柱的白話總結(加分/留意兩籃,不出現神煞術語) */
function composePillarShenshaPlain(label, names) {
  const known = names.filter((n) => CORE[n]);
  if (!known.length) return null;
  const plus = known.filter((n) => PLAIN_POSITIVE.has(n)).map((n) => PLAIN_SHENSHA[n]).filter(Boolean);
  const minus = known.filter((n) => !PLAIN_POSITIVE.has(n)).map((n) => PLAIN_SHENSHA[n]).filter(Boolean);
  if (!plus.length && !minus.length) return null;
  // 短語內部本身就有逗號、頓號,項目之間改用分號分隔+分行,邊界才清楚
  const lines = [`【${PILLAR_PLAIN[label]}】`];
  if (plus.length) lines.push(`加分的地方:${plus.join(';')}。`);
  if (minus.length) lines.push(`要留意的是:${minus.join(';')}。`);
  return {
    pillar: label,
    shensha: known,
    text: lines.join('\n'),
  };
}

/**
 * 單一柱的神煞合併句:柱位背景句只講一次,但每個神煞「名稱——解釋」各自獨立、
 * 以分號隔開(舊版把 5、6 個神煞的解釋用逗號黏成一句 200 字無句號的長句,難以閱讀)
 */
function composePillarShensha(label, bg, names) {
  const known = names.filter((n) => CORE[n]);
  if (!known.length) return null;

  const nameList = known.length === 1
    ? known[0]
    : `${known.slice(0, -1).join('、')}與${known.at(-1)}`;

  const detail = known
    .map((n) => `${n}——${stripPeriod(stripLead(CORE[n]))}`)
    .join(';');

  return {
    pillar: label,
    shensha: known,
    text: `${label}${known.length > 1 ? '同時帶有' : '帶有'}${nameList}:${detail}。${bg}`,
  };
}

/**
 * 組裝四柱神煞解讀
 * mode = 'public'(預設):白話總結(不出現神煞術語,分「加分/留意」兩籃)
 * mode = 'study':完整版(神煞名稱——解釋,逐條列出+柱位背景句)
 * @param {object} baZi convertToBaZi() 輸出(需含 shenshaList)
 * @param {object} [opts] { mode = 'public' | 'study' }
 * @returns {{ entries: Array<{pillar, shensha, text}>, text: string }}
 */
export function composeShenShaReading(baZi, { mode = 'public' } = {}) {
  const shenshaList = baZi.shenshaList ?? {};
  const entries = [];
  for (const { key, label } of PILLARS) {
    const e = mode === 'study'
      ? composePillarShensha(label, PILLAR_BG[label], shenshaList[key] ?? [])
      : composePillarShenshaPlain(label, shenshaList[key] ?? []);
    if (e) entries.push(e);
  }
  return { entries, text: entries.map((e) => e.text).join('\n') }; // 每柱換行,搭配 UI 的 pre-line 呈現
}

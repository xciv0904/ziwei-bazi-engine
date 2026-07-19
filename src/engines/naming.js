// src/engines/naming.js — 姓名學:姓名五行 × 八字喜用神比對 + 五格剖象法(三才五行生剋)
//
// 說明(誠實揭露計算範圍,避免給人「完整專業命名工具」的錯誤印象):
// 1) 姓名五行 × 喜用神:沿用 compose-yongshen.js 已驗證過的喜用神判定邏輯,只是換個角度——
//    比對「姓名用字的五行屬性」跟「命盤算出的喜用神/忌神」是否呼應。
// 2) 五格剖象法:天格/人格/地格/外格/總格採標準熊崎氏公式計算,三才五行只做「生剋關係」的
//    白話傾向判讀,不做 81 數理逐條吉凶(那是另一套龐大的獨立對照表,沒有把握逐條核對正確
//    寧可不做,也不要生成看起來權威、實際上未經驗證的內容)。
// 3) 筆畫數與五行屬性資料庫(name-characters.json)僅收錄常見姓氏與命名用字(約 400 字),
//    採康熙字典慣用筆畫寫法,已盡力比對常見命名網站的公開對照表,但未逐字做外部交叉驗證,
//    僅供參考;字典未收錄的字會誠實告知,不會用猜測的筆畫數蒙混。
import nameChars from '../data/name-characters.json' with { type: 'json' };

const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // 我剋

/** 查單一字的筆畫與五行(未收錄回傳 null) */
export function charInfo(ch) {
  return nameChars[ch] ?? null;
}

/**
 * 姓名五行組成 vs 命盤喜用神/忌神
 * @param {string} fullName 完整姓名(含姓)
 * @param {{ favorable: Array<{element:string}>, unfavorable: Array<{element:string}> }} yongshen
 *        compose-yongshen.js 的 computeYongShen() 輸出
 */
export function analyzeNameElements(fullName, yongshen) {
  const chars = [...fullName].filter((c) => c.trim());
  const known = [];
  const unknown = [];
  for (const ch of chars) {
    const info = charInfo(ch);
    if (info) known.push({ char: ch, strokes: info.strokes, element: info.element });
    else unknown.push(ch);
  }
  const favorEls = new Set(yongshen.favorable.map((f) => f.element));
  const avoidEls = new Set(yongshen.unfavorable.map((f) => f.element));
  const favorHits = known.filter((k) => favorEls.has(k.element));
  const avoidHits = known.filter((k) => avoidEls.has(k.element));
  const neutralHits = known.filter((k) => !favorEls.has(k.element) && !avoidEls.has(k.element));

  let verdict;
  let verdictNote;
  if (favorHits.length && !avoidHits.length) {
    verdict = '補益喜用神';
    verdictNote = `姓名裡的${favorHits.map((k) => `「${k.char}」(${k.element})`).join('、')}剛好落在你的喜用神上,方向上算是加分。`;
  } else if (avoidHits.length && !favorHits.length) {
    verdict = '偏向忌神';
    verdictNote = `姓名裡的${avoidHits.map((k) => `「${k.char}」(${k.element})`).join('、')}落在你的忌神上,不代表一定不好,但方向上跟命盤喜用神比較不搭。`;
  } else if (favorHits.length && avoidHits.length) {
    verdict = '喜忌並存';
    verdictNote = `姓名同時有落在喜用神(${favorHits.map((k) => k.char).join('、')})跟忌神(${avoidHits.map((k) => k.char).join('、')})上的字,兩種力量互相拉扯,實際影響有限。`;
  } else if (known.length) {
    verdict = '中性';
    verdictNote = '姓名用字的五行不在喜用神也不在忌神範圍內,基本上是中性、沒有明顯加減分。';
  } else {
    verdict = '無法判斷';
    verdictNote = '姓名用字都不在目前收錄的字典裡,無法判斷五行組成。';
  }

  return { known, unknown, favorHits, avoidHits, neutralHits, verdict, verdictNote };
}

// ---------- 五格剖象法(熊崎氏姓名學,天格/人格/地格/外格/總格) ----------

/** 數字個位數 → 五行(81數理的基礎對照,1,2木;3,4火;5,6土;7,8金;9,0水) */
function elementOfNumber(n) {
  const d = ((n - 1) % 10) + 1; // 1~10 循環
  if (d === 1 || d === 2) return '木';
  if (d === 3 || d === 4) return '火';
  if (d === 5 || d === 6) return '土';
  if (d === 7 || d === 8) return '金';
  return '水'; // 9, 10
}

/** from 對 to 的五行關係(用於三才生剋的白話傾向判讀) */
function relationOf(from, to) {
  if (from === to) return '比和';
  if (SHENG[from] === to) return '相生';
  if (KE[from] === to) return '相剋';
  if (SHENG[to] === from) return '被生';
  if (KE[to] === from) return '被剋';
  return '未知';
}

const RELATION_NOTE = {
  相生: '五行相生,銜接較為順暢,基礎跟發展方向能互相帶動。',
  比和: '五行比和,狀態穩定,但也比較缺乏額外的推力,發展節奏偏平穩。',
  被生: '這一格能得到前一格的滋養與支持,發展上相對省力。',
  相剋: '中間有一層需要自己主動突破的磨合,比較需要花心力去調整跟磨合。',
  被剋: '這一格受到前一格的牽制較多,建議多留意基礎的打底與人際經營。',
  未知: '五行關係暫無法判斷。',
};

/**
 * 五格剖象法計算(支援單姓單名/單姓雙名/複姓單名/複姓雙名,涵蓋絕大多數常見姓名結構)
 * @param {string} surname 姓(1~2字)
 * @param {string} givenName 名(1~2字)
 * @returns {{ ok:true, grid, elements, sancai } | { ok:false, unknown?:string[], unsupported?:boolean }}
 */
export function computeWuGe(surname, givenName) {
  const s = [...surname].map((c) => ({ char: c, info: charInfo(c) }));
  const g = [...givenName].map((c) => ({ char: c, info: charInfo(c) }));
  const unknown = [...s, ...g].filter((x) => !x.info).map((x) => x.char);
  if (unknown.length) return { ok: false, unknown };
  if (s.length < 1 || s.length > 2 || g.length < 1 || g.length > 2) {
    return { ok: false, unsupported: true };
  }

  const sN = s.map((x) => x.info.strokes);
  const gN = g.map((x) => x.info.strokes);
  const total = [...sN, ...gN].reduce((a, b) => a + b, 0);

  let tian, ren, di, wai;
  if (s.length === 1 && g.length === 1) {
    // 單姓單名(例:王安)
    tian = sN[0] + 1;
    ren = sN[0] + gN[0];
    di = gN[0] + 1;
    wai = 2; // 虛設靈數,單姓單名固定為 2
  } else if (s.length === 1 && g.length === 2) {
    // 單姓雙名(最常見,例:王小明)
    tian = sN[0] + 1;
    ren = sN[0] + gN[0];
    di = gN[0] + gN[1];
    wai = gN[1] + 1;
  } else if (s.length === 2 && g.length === 1) {
    // 複姓單名(例:歐陽明)
    tian = sN[0] + sN[1];
    ren = sN[1] + gN[0];
    di = gN[0] + 1;
    wai = sN[0] + 1;
  } else {
    // 複姓雙名(例:歐陽小明)
    tian = sN[0] + sN[1];
    ren = sN[1] + gN[0];
    di = gN[0] + gN[1];
    wai = sN[0] + gN[1];
  }

  const grid = { 天格: tian, 人格: ren, 地格: di, 外格: wai, 總格: total };
  const elements = Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, elementOfNumber(v)]));

  const tianRen = relationOf(elements.天格, elements.人格);
  const renDi = relationOf(elements.人格, elements.地格);

  return {
    ok: true,
    grid,
    elements,
    sancai: {
      tianRen, renDi,
      tianRenNote: `天格(${elements.天格})→人格(${elements.人格}):${RELATION_NOTE[tianRen]}`,
      renDiNote: `人格(${elements.人格})→地格(${elements.地格}):${RELATION_NOTE[renDi]}`,
    },
  };
}

// src/engines/ziwei-school.js — 紫微排盤的流派設定（純資料，無任何相依）
//
// 刻意跟 ziwei.js 分開：ziwei.js 會 import iztro（約 460KB，走動態載入），
// 而畫面在使用者按下排盤之前就要顯示流派選項。如果選項定義放在 ziwei.js，
// main.js 靜態 import 就會把整個排盤引擎拉進首屏 bundle。
// （smoke.mjs 有一條測試在守這件事：「重型解讀模組維持動態載入」）
//
// 為什麼要開放流派選擇：紫微各派在「晚子時算哪一天」「安星用通行版還是中州派」上
// 本來就有分歧。免責聲明寫「不同流派可能造成差異」是誠實的，但使用者無法對齊
// 自己學的那一派——而懂紫微的人第一個問題就是「你用哪一派」。
//
// 四化表沒有開放選擇，這是刻意的：本站生年四化來自 iztro 預設表，流年飛化用
// compose-annual.js 的 FLOW_SIHUA，兩張表已逐干驗證完全一致。只換其中一張會讓
// 生年四化與流年四化分屬不同流派，那比不給選項更糟。

/**
 * key 會出現在網址與 localStorage，所以名稱要穩定，不要為了改文案而改 key。
 * default 標記的是本站預設值，也是所有交叉驗證與 golden 測試採用的組合——
 * 改動預設值會讓 cross-test 失敗，這是刻意的保護。
 */
export const ZIWEI_SCHOOL_OPTIONS = {
  dayDivide: {
    label: '晚子時換日',
    hint: '23:00–24:00 出生的人，這一段算當日還是隔日。只影響晚子時出生者，其他時辰不受影響。',
    default: 'forward',
    choices: [
      { value: 'forward', label: '算隔日（預設）', note: '多數現代排盤軟體採用。星曜落宮依隔日的農曆日推算。' },
      { value: 'current', label: '算當日', note: '部分傳統流派採用。晚子時仍歸出生當天，星曜落宮會因此不同。' },
    ],
  },
  algorithm: {
    label: '安星方法',
    hint: '部分輔星與雜曜的落宮規則在流派之間有差異。',
    default: 'default',
    choices: [
      { value: 'default', label: '通行版（預設）', note: '目前最普及的安星規則，本站的交叉驗證即以此版為基準。' },
      { value: 'zhongzhou', label: '中州派', note: '中州派版本，部分星曜落宮與通行版不同。' },
    ],
  },
};

/** 把使用者選擇夾回合法值。網址與 localStorage 都可能被手改，一律白名單比對。 */
export function normalizeZiWeiSchool(school = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(ZIWEI_SCHOOL_OPTIONS)) {
    const picked = school?.[key];
    out[key] = spec.choices.some((c) => c.value === picked) ? picked : spec.default;
  }
  return out;
}

/** 這組設定是不是全預設（用來決定要不要在畫面上提示「已改過流派」） */
export function isDefaultZiWeiSchool(school = {}) {
  const n = normalizeZiWeiSchool(school);
  return Object.entries(ZIWEI_SCHOOL_OPTIONS).every(([key, spec]) => n[key] === spec.default);
}

/** 給畫面與 AI 提示詞用的一行摘要 */
export function describeZiWeiSchool(school = {}) {
  const n = normalizeZiWeiSchool(school);
  return Object.entries(ZIWEI_SCHOOL_OPTIONS)
    .map(([key, spec]) => `${spec.label}：${spec.choices.find((c) => c.value === n[key])?.label ?? n[key]}`)
    .join('　');
}

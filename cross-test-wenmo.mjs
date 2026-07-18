// cross-test-wenmo.mjs — 與「文墨天機」排盤數據交叉驗證(Shelly 2002-09-04 14:11 女)
// 驗證範圍:主星七階亮度、生年四化、斗君、自化(離心/向心)、來因宮
import { convertToZiWei } from './src/engines/ziwei.js';
import { computeSelfTransformations, computeLaiyinPalace, douJunBranchOf } from './src/engines/compose-annual.js';

const z = convertToZiWei({ year: 2002, month: 9, day: 4, hour: 14, gender: 'female', refDate: new Date('2026-07-09') });

let pass = 0, fail = 0;
const cmp = (label, exp, act) => {
  const ok = JSON.stringify(exp) === JSON.stringify(act);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}: 預期=${JSON.stringify(exp)} 實際=${JSON.stringify(act)}`);
};

// --- 斗君(文墨:子年斗君在丑) ---
cmp('子年斗君', '丑', douJunBranchOf(z, '子'));

// --- 來因宮(文墨:父母宮[壬寅][來因]) ---
const laiyin = computeLaiyinPalace(z);
cmp('來因宮', '父母宮(壬寅)', `${laiyin?.palaceName}(${laiyin?.position})`);

// --- 主星亮度(文墨為七階制,應與 iztro 原始值一致) ---
const WENMO_BRIGHTNESS = {
  七殺: '旺', 廉貞: '廟', 破軍: '旺', 天同: '廟', 武曲: '旺', 天府: '旺',
  太陽: '得', 太陰: '不', 貪狼: '平', 天機: '旺', 巨門: '廟', 紫微: '得', 天相: '得', 天梁: '陷',
};
for (const p of z.palaces) {
  for (const s of p.majorStars) {
    cmp(`亮度|${s.name}`, WENMO_BRIGHTNESS[s.name], s.brightness);
  }
}

// --- 生年四化(文墨:天梁祿、紫微權、左輔科、武曲忌) ---
const mutFound = {};
for (const p of z.palaces) {
  for (const s of p.majorStars) if (s.transformation) mutFound[s.transformation] = s.name;
  for (const s of p.minorStars) {
    const m = s.match(/^(.+?)[((].*四化(.)/);
    if (m) mutFound[m[2]] = m[1];
  }
}
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort());
cmp('生年四化', sortObj({ 祿: '天梁', 權: '紫微', 科: '左輔', 忌: '武曲' }), sortObj(mutFound));

// --- 自化(文墨標記:田宅破軍↓權、交友武曲↑忌、遷移太陰↓祿+↑科、疾厄貪狼↓祿、財帛巨門↑權、夫妻天梁↑權+文曲↓科) ---
const selfT = Object.fromEntries(computeSelfTransformations(z).map((r) => [r.palaceName, r]));
const fmtOut = (p) => (selfT[p]?.outgoing ?? []).map((x) => `${x.star}↓${x.mutagen}`).sort().join(',');
const fmtIn = (p) => (selfT[p]?.incoming ?? []).map((x) => `${x.star}↑${x.mutagen}`).sort().join(',');
cmp('田宅宮離心', '破軍↓權', fmtOut('田宅宮'));
cmp('僕役宮向心', '武曲↑忌', fmtIn('僕役宮'));
cmp('遷移宮離心', '太陰↓祿', fmtOut('遷移宮'));
cmp('遷移宮向心', '太陰↑科', fmtIn('遷移宮'));
cmp('疾厄宮離心', '貪狼↓祿', fmtOut('疾厄宮'));
cmp('財帛宮向心', '巨門↑權', fmtIn('財帛宮'));
cmp('夫妻宮離心', '文曲↓科', fmtOut('夫妻宮'));
cmp('夫妻宮向心', '天梁↑權', fmtIn('夫妻宮'));

console.log(`\n合計:${pass} 通過 / ${fail} 不一致`);
process.exit(fail === 0 ? 0 : 1);

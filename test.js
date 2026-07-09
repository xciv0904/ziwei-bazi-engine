// test.js — 驗證入口:呼叫引擎模組,與 expected-chart-data.json 逐項比對
import { readFileSync, writeFileSync } from 'node:fs';
import { convertToBaZi } from './src/engines/bazi.js';
import { convertToZiWei } from './src/engines/ziwei.js';

const input = { year: 2002, month: 9, day: 4, hour: 14, minute: 11, gender: 'female' };

const baZi = convertToBaZi(input);
const ziWei = convertToZiWei(input);

// 完整輸出存檔,方便肉眼核對整份 schema
const actual = {
  input: { birthDate: '2002-09-04', birthTime: '14:11', gender: input.gender, age: ziWei.age },
  baZi,
  ziWei,
};
writeFileSync(new URL('./actual-chart-data.json', import.meta.url), JSON.stringify(actual, null, 2));

// --- 核心值比對 ---
const expected = JSON.parse(readFileSync(new URL('./expected-chart-data.json', import.meta.url), 'utf-8'));
const fp = expected.baZi.fourPillars;
const zw = expected.ziWei;
const join = (p) => p.stem + p.branch;

const rows = [
  ['八字|年柱', join(fp.yearPillar), join(baZi.fourPillars.yearPillar)],
  ['八字|月柱', join(fp.monthPillar), join(baZi.fourPillars.monthPillar)],
  ['八字|日柱', join(fp.dayPillar), join(baZi.fourPillars.dayPillar)],
  ['八字|時柱', join(fp.hourPillar), join(baZi.fourPillars.hourPillar)],
  ['紫微|五行局', zw.fiveElementBureau, ziWei.fiveElementBureau],
  ['紫微|命宮', zw.lifePalace, ziWei.lifePalace],
  ['紫微|身宮', zw.bodyPalace, ziWei.bodyPalace],
  ['紫微|命主', zw.lifeMaster, ziWei.lifeMaster],
  ['紫微|身主', zw.bodyMaster, ziWei.bodyMaster],
];

console.log('項目\t\t預期\t實際\t結果');
let diffs = 0;
for (const [label, exp, act] of rows) {
  const ok = exp === act;
  if (!ok) diffs++;
  console.log(`${label}\t${exp}\t${act}\t${ok ? '✅' : '❌'}`);
}
console.log(diffs === 0 ? '\n核心值全部一致 ✅(完整輸出見 actual-chart-data.json)' : `\n共 ${diffs} 項不一致 ❌`);

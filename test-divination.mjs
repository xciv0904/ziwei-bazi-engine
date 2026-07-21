import { hexagram, plumBlossom, qimenStructure, lineDiagram } from './src/engines/divination.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const pure = hexagram(1, 1, 1);
check(pure.name === '乾為天', '乾上乾下應為乾為天');
check(pure.changedName === '天風姤', '乾卦初爻變應為天風姤');

const plum = plumBlossom('2026-07-20T12:00', 8);
check(Boolean(plum.name) && plum.movingLine >= 1 && plum.movingLine <= 6, '梅花起卦結果不完整');

const qimen = qimenStructure('2026-07-20T12:00', '大暑');
check(qimen.dun === '陰遁' && qimen.palaces.length === 9, '奇門結構盤陰陽遁或九宮錯誤');
check(new Set(qimen.palaces.map((p) => p.palace)).size === 9, '奇門九宮不可重複');
check(lineDiagram(pure.lines, [1]).length === 6, '卦象應有六爻');

console.log('新增術數計算測試全部通過 ✅');

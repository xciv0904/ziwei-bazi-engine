import { hexagram, plumBlossom, qimenStructure, determineJu, tiYongAnalysis, lineDiagram } from './src/engines/divination.js';
import { convertToBaZi } from './src/engines/bazi.js';
import lunarPkg from 'lunar-javascript';
const { Solar } = lunarPkg.default ?? lunarPkg;

const check = (ok, message) => { if (!ok) throw new Error(message); };

const pure = hexagram(1, 1, 1);
check(pure.name === '乾為天', '乾上乾下應為乾為天');
check(pure.changedName === '天風姤', '乾卦初爻變應為天風姤');

const plum = plumBlossom('2026-07-20T12:00', 8);
check(Boolean(plum.name) && plum.movingLine >= 1 && plum.movingLine <= 6, '梅花起卦結果不完整');
const ty = tiYongAnalysis(plum);
check(['比和', '體生用', '用生體', '體剋用', '用剋體'].includes(ty.relation), '體用生剋關係應為五種之一');

// 定局:冬至上元固定為陽遁一局(傳統用局表「冬至驚蟄一七四」)
const dongzhi = determineJu('2025-12-21T10:00', { Solar });
check(dongzhi.bureau === 1 && dongzhi.yang === true, `冬至上元應為陽遁一局,實際為${dongzhi.yang ? '陽' : '陰'}遁${dongzhi.bureau}局`);
// 夏至上元固定為陰遁九局
const xiazhi = determineJu('2026-06-21T10:00', { Solar });
check(xiazhi.bureau === 9 && xiazhi.yang === false, `夏至上元應為陰遁九局,實際為${xiazhi.yang ? '陽' : '陰'}遁${xiazhi.bureau}局`);

const qimen = qimenStructure('2026-07-20T12:00', { convertToBaZi, Solar, gender: '女' });
check(qimen.palaces.length === 9, '奇門九宮應有九格');
check(new Set(qimen.palaces.map((p) => p.palace)).size === 9, '奇門九宮不可重複');
check(qimen.bureau >= 1 && qimen.bureau <= 9, '局數應介於1-9');
check(qimen.palaces.some((p) => p.yiqi), '地盤三奇六儀應有排入至少一宮');
check(qimen.zhiFuShi && qimen.zhiFuShi.palace >= 1 && qimen.zhiFuShi.palace <= 9, '值符值使應定位到某一宮');

check(lineDiagram(pure.lines, [1]).length === 6, '卦象應有六爻');

console.log('新增術數計算測試全部通過 ✅');

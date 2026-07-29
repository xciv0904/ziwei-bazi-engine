import { hexagram, plumBlossom, qimenStructure, determineJu, tiYongAnalysis, lineDiagram } from './src/engines/divination.js';
import { convertToBaZi } from './src/engines/bazi.js';
import lunarPkg from 'lunar-javascript';
import { toTrueSolarTime } from './src/engines/true-solar-time.js';
const { Solar } = lunarPkg.default ?? lunarPkg;

const check = (ok, message) => { if (!ok) throw new Error(message); };

const taipeiSolar = toTrueSolarTime({
  year: 2002, month: 9, day: 4, hour: 14, minute: 11, longitude: 121.5654, utcOffset: 8,
});
check(taipeiSolar.hour === 14 && taipeiSolar.minute >= 15 && taipeiSolar.minute <= 22,
  `台北真太陽時應約校正至14:19，實際為${taipeiSolar.hour}:${taipeiSolar.minute}`);

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

// ---------- 飛星:十二宮飛化 / 大限流年飛化 ----------
// 飛化是解盤時判斷「哪個宮位把資源或壓力送到哪裡」的主體,自化只是它的特例。
// 這裡用 2002-09-04 未時女命逐條核對:宮干四化與落宮全部固定,任何一條錯掉都會被抓出來。
{
  const { convertToZiWei } = await import('./src/engines/ziwei.js');
  const { computeFlyingTransformations, findFlyingConvergence, flyingOfStem, computeAnnualSnapshots, findAnnualRepeatedFocus } =
    await import('./src/engines/compose-annual.js');
  const z = convertToZiWei({ year: 2002, month: 9, day: 4, hour: 13, gender: 'female' });
  const fly = computeFlyingTransformations(z);
  const byName = Object.fromEntries(fly.map((f) => [f.palaceName, f]));
  const fmt = (p) => byName[p].flights.map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`).join('、');

  const cases = [
    ['命宮(癸)', fmt('命宮'), '破軍化祿→田宅宮、巨門化權→財帛宮、太陰化科→遷移宮、貪狼化忌→疾厄宮'],
    ['夫妻宮(辛)', fmt('夫妻宮'), '巨門化祿→財帛宮、太陽化權→遷移宮、文曲化科→夫妻宮、文昌化忌→福德宮'],
    ['僕役宮(丙)', fmt('僕役宮'), '天同化祿→官祿宮、天機化權→財帛宮、文昌化科→福德宮、廉貞化忌→父母宮'],
    ['田宅宮(甲)', fmt('田宅宮'), '廉貞化祿→父母宮、破軍化權→田宅宮、武曲化科→僕役宮、太陽化忌→遷移宮'],
    ['大限辛亥', flyingOfStem(z, '辛').map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`).join('、'),
      '巨門化祿→財帛宮、太陽化權→遷移宮、文曲化科→夫妻宮、文昌化忌→福德宮'],
    ['流年丙午', flyingOfStem(z, '丙').map((f) => `${f.star}化${f.mutagen}→${f.palaceName}`).join('、'),
      '天同化祿→官祿宮、天機化權→財帛宮、文昌化科→福德宮、廉貞化忌→父母宮'],
  ];
  let bad = 0;
  for (const [label, actual, expected] of cases) {
    const ok = actual === expected;
    if (!ok) { bad++; console.log(`❌ 飛化|${label}\n   預期 ${expected}\n   實際 ${actual}`); }
  }
  // 自化必須是飛化的子集合:標了 isSelf 的,落宮就等於來源宮
  const selfMismatch = fly.flatMap((p) => p.flights.filter((f) => f.isSelf && f.palaceName !== p.palaceName));
  if (selfMismatch.length) { bad++; console.log('❌ 自化標記與落宮不一致'); }
  // 疊加點:命宮與福德宮宮干同為癸,兩者必定同時把忌飛入疾厄宮
  const conv = findFlyingConvergence(fly);
  const hit = conv.find((c) => c.palaceName === '疾厄宮' && c.mutagen === '忌');
  if (!hit || !(hit.from.includes('命宮') && hit.from.includes('福德宮'))) {
    bad++; console.log('❌ 疊加點未偵測到命宮+福德宮同時忌入疾厄宮');
  }
  const snapshots = computeAnnualSnapshots(z, 2026);
  if (snapshots.length !== 7 || snapshots[0].year !== 2023 || snapshots[6].year !== 2029) {
    bad++; console.log('❌ ±3 年流年快照範圍錯誤');
  }
  if (snapshots.some((s) => !s.palaceName || s.flights.length !== 4)) {
    bad++; console.log('❌ 流年快照缺少命宮或四化');
  }
  const repeated = findAnnualRepeatedFocus(z, snapshots);
  if (!repeated.transformations.length || !repeated.axes.length) {
    bad++; console.log('❌ 跨年重複焦點未產生');
  }
  console.log(bad === 0 ? '飛星飛化測試全部通過 ✅' : `飛星飛化 ${bad} 項不一致 ❌`);
  if (bad) process.exitCode = 1;
}

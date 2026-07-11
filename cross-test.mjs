import { convertToZiWei } from './src/engines/ziwei.js';

const z = convertToZiWei({ year: 2006, month: 7, day: 12, hour: 19, gender: 'male', refDate: new Date('2026-07-09') });

let pass = 0, fail = 0;
const cmp = (label, exp, act) => {
  const ok = exp === act;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}: 預期=${exp} 實際=${act}`);
};

// --- 核心五值 ---
cmp('五行局', '火六局', z.fiveElementBureau);
cmp('命宮', '酉', z.lifePalace);
cmp('身宮', '巳', z.bodyPalace);
cmp('命主', '文曲', z.lifeMaster);
cmp('身主', '文昌', z.bodyMaster);
const body = z.palaces.find(p => p.isBodyPalace);
cmp('身宮宮位', '財帛宮(癸巳)', `${body.name}(${body.position})`);

// --- 大限 ---
const expLimits = [['丁酉','6~15'],['戊戌','16~25'],['己亥','26~35'],['庚子','36~45'],['辛丑','46~55'],['庚寅','56~65'],['辛卯','66~75'],['壬辰','76~85'],['癸巳','86~95'],['甲午','96~105']];
expLimits.forEach(([gz, range], i) => {
  const a = z.majorLimits[i];
  cmp(`大限${i+1}`, `${gz} ${range}`, `${a.ganZhi} ${a.ageRange}`);
});

// --- 流年 / 小限 ---
cmp('流年2026', '丙午', z.annualFlow['2026']);
const expMinor = { 2023:'癸卯', 2024:'甲辰', 2025:'乙巳', 2026:'丙午', 2029:'己酉', 2032:'壬子' };
for (const [y, gz] of Object.entries(expMinor)) {
  const m = z.minorLimits.find(m => m.year === Number(y));
  cmp(`小限${y}`, gz, m?.ganZhi);
}

// --- 12 宮:干支 + 主星(亮度/四化) ---
const expPalaces = {
  僕役宮: ['庚寅', '天機(旺,權) 太陰(旺)'],
  遷移宮: ['辛卯', '紫微(旺) 貪狼(平)'],
  疾厄宮: ['壬辰', '巨門(陷)'],
  財帛宮: ['癸巳', '天相(旺)'],
  子女宮: ['甲午', '天梁(廟)'],
  夫妻宮: ['乙未', '廉貞(平,忌) 七殺(廟)'],
  兄弟宮: ['丙申', '無主星'],
  命宮:   ['丁酉', '無主星'],
  父母宮: ['戊戌', '天同(平,祿)'],
  福德宮: ['己亥', '武曲(平) 破軍(平)'],
  田宅宮: ['庚子', '太陽(陷)'],
  官祿宮: ['辛丑', '天府(廟)'],
};
// 亮度階制正規化:iztro 為七階(廟旺得利平不陷),參考網站為四階(廟旺平陷),
// 對照 BRIGHTNESS_ALIAS(得→旺、利→平、不→陷)後比對,兩套說法等價
const B_ALIAS = { 廟: '廟', 旺: '旺', 得: '旺', 利: '平', 平: '平', 不: '陷', 陷: '陷' };
const fmt = (p) => p.majorStars.length
  ? p.majorStars.map(s => `${s.name}(${B_ALIAS[s.brightness] ?? s.brightness}${s.transformation ? ',' + s.transformation : ''})`).join(' ')
  : '無主星';
for (const [name, [pos, stars]] of Object.entries(expPalaces)) {
  const p = z.palaces.find(x => x.name === name);
  cmp(`${name}|干支`, pos, p?.position);
  cmp(`${name}|主星`, stars, p ? fmt(p) : '?');
}

console.log(`\n合計:${pass} 通過 / ${fail} 不一致`);
process.exit(fail === 0 ? 0 : 1); // 供 CI 當部署門檻

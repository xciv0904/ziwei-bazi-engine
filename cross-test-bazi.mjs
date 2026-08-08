import { convertToBaZi } from './src/engines/bazi.js';
import { makeReporter } from './cross-test-report.mjs';

const b = convertToBaZi({ year: 2006, month: 7, day: 12, hour: 19, minute: 23, gender: 'male', refDate: new Date('2026-07-09') });

// 比對結果同時寫進 tests/reports/cross-validation.json，供公開驗證頁使用
const { cmp, finish } = makeReporter({
  suite: 'bazi-core',
  title: '八字：四柱、藏干、十神、納音、五行分布、大運',
  reference: '另一份人工核對的命盤（弟弟命盤）',
  subject: '2006-07-12 19:23 男',
  scope: ['年月日時四柱干支', '各柱藏干', '十神', '納音', '五行分布統計', '大運起運與排列'],
});

// 四柱
const j = (p) => p.stem + p.branch;
cmp('年柱', '丙戌', j(b.fourPillars.yearPillar));
cmp('月柱', '乙未', j(b.fourPillars.monthPillar));
cmp('日柱', '壬寅', j(b.fourPillars.dayPillar));
cmp('時柱', '庚戌', j(b.fourPillars.hourPillar));

// 藏干
cmp('年支藏干', ['戊-七殺','辛-正印','丁-正財'], b.hiddenStems.yearBranch);
cmp('月支藏干', ['己-正官','丁-正財','乙-傷官'], b.hiddenStems.monthBranch);
cmp('日支藏干', ['甲-食神','丙-偏財','戊-七殺'], b.hiddenStems.dayBranch);
cmp('時支藏干', ['戊-七殺','辛-正印','丁-正財'], b.hiddenStems.hourBranch);

// 十神
cmp('十神', { yearStem:'偏財', monthStem:'傷官', dayStem:'日主', hourStem:'偏印', yearBranch:'七殺', monthBranch:'正官', dayBranch:'食神', hourBranch:'七殺' }, b.tenGods);

// 納音 / 十二長生 / 神煞
const pd = b.pillarDetails;
// 「沙中金/砂中金」為同一納音的異體字寫法,比對時正規化,避免長期掛紅
const normNayin = (s) => s.replace('沙', '砂');
cmp('納音', ['屋上土','砂中金','金箔金','釵釧金'], [pd.yearPillar.nayin, pd.monthPillar.nayin, pd.dayPillar.nayin, pd.hourPillar.nayin].map(normNayin));
cmp('十二長生', ['冠帶','養','病','冠帶'], [pd.yearPillar.twelveStages, pd.monthPillar.twelveStages, pd.dayPillar.twelveStages, pd.hourPillar.twelveStages]);
cmp('十二神煞', ['華蓋','攀鞍','地煞','華蓋'], [pd.yearPillar.shensha, pd.monthPillar.shensha, pd.dayPillar.shensha, pd.hourPillar.shensha]);

// 地支關係:參考網站列出年月刑、月時刑;引擎另涵蓋相破/拱等擴充類型(雙向紀錄共12筆)
const hasRel = (a, w, rel) => b.branchRelations.some(r => r.branch === a && r.with === w && r.relation === rel);
cmp('年月刑', true, hasRel('yearBranch', 'monthBranch', '刑'));
cmp('月時刑', true, hasRel('monthBranch', 'hourBranch', '刑'));
cmp('年月相破(擴充)', true, hasRel('yearBranch', 'monthBranch', '相破'));
cmp('年日拱(擴充)', true, hasRel('yearBranch', 'dayBranch', '拱'));
cmp('關係總數(含擴充類型,雙向12筆)', 12, b.branchRelations.length);

// 五行分佈
cmp('五行分佈', { wood:2, fire:1, earth:3, metal:1, water:1 }, b.fiveElementDistribution);

// 核心判斷值
cmp('空亡', { year:'午未', day:'辰巳' }, b.coreValues.voidBranches);
cmp('月令(司令)', '丁', b.coreValues.monthCommander);
cmp('大運數', 9, b.coreValues.greatLuckStartAge);

// 流年 / 流月
cmp('流年2021', '辛丑', b.annualPillars['2021']);
cmp('流年2026', '丙午', b.annualPillars['2026']);
cmp('流年2032', '壬子', b.annualPillars['2032']);
cmp('流月01', '己丑', b.monthlyPillars['01']);
cmp('流月07', '乙未', b.monthlyPillars['07']);
cmp('流月12', '庚子', b.monthlyPillars['12']);

// 大運九步
const expCycles = [['丙申',2015,'9~18'],['丁酉',2025,'19~28'],['戊戌',2035,'29~38'],['己亥',2045,'39~48'],['庚子',2055,'49~58'],['辛丑',2065,'59~68'],['壬寅',2075,'69~78'],['癸卯',2085,'79~88'],['甲辰',2095,'89~98']];
expCycles.forEach(([gz, y, range], i) => {
  const c = b.greatLuckCycles[i];
  cmp(`大運${i+1}`, `${gz} ${y} ${range}`, `${c.ganZhi} ${c.startYear} ${c.ageRange}`);
});

process.exit(finish()); // 供 CI 當部署門檻

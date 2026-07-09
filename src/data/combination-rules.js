// src/data/combination-rules.js — 組合規則(比照塔羅牌意組合引擎)
// condition:
//   palace          可選,限定宮位(不填 = 任何宮位)
//   stars           必填,該宮須同時具備的主星
//   transformations 可選,宮內須出現的四化(祿/權/科/忌)
// 規則由上而下逐條比對,命中可複數。

export const combinationRules = [
  {
    condition: { palace: '命宮', stars: ['紫微', '天府'] },
    interpretation: '命宮紫府同宮,通常個性穩重又有領導欲,重視格局與體面,一生資源不虞匱乏,但容易好面子、放不下身段。',
  },
  {
    condition: { palace: '命宮', stars: [] },
    interpretation: '命宮無主星(空宮),個性彈性大、受環境影響深,人生走向多借對宮(遷移宮)星曜來看,適合往外發展、離鄉更有舞台。',
  },
  {
    condition: { stars: ['紫微', '天相'] },
    interpretation: '紫微天相同宮,有「君臣相輔」之象,做事講規矩、重承諾,適合在制度中擔任管理或幕僚要職。',
  },
  {
    condition: { stars: ['天機', '巨門'] },
    interpretation: '機巨同宮,頭腦靈活、口才犀利,靠專業與言語生財,但想得多、易鑽牛角尖,決策宜快刀斬亂麻。',
  },
  {
    condition: { stars: ['太陽', '太陰'] },
    interpretation: '日月同宮,性格陰晴並濟、內外兩面,情緒與運勢起伏較明顯,人生常在兩種選擇間擺盪,中晚年漸入佳境。',
  },
  {
    condition: { stars: ['武曲', '天府'] },
    interpretation: '武府同宮,理財務實、善於積蓄,是典型的財庫組合;唯個性偏保守,錢賺得穩但衝勁稍嫌不足。',
  },
  {
    condition: { palace: '財帛宮', stars: ['天機', '巨門'] },
    interpretation: '財帛宮見機巨,收入多與口才、企劃、專業知識掛鉤,適合顧問、教學、傳播、業務等動腦動口的行業,財路多但宜防口舌糾紛破財。',
  },
  {
    condition: { palace: '夫妻宮', stars: ['天梁'], transformations: ['祿'] },
    interpretation: '夫妻宮天梁化祿,伴侶多具長者風範、願意照顧你,感情中容易遇到年齡或閱歷有差距的對象,婚後多得對方庇蔭。',
  },
  {
    condition: { palace: '官祿宮', stars: ['天同'] },
    interpretation: '官祿宮天同,工作講求氣氛與興趣,不愛高壓環境,適合服務、企劃、療癒相關領域;事業心不算重,晚發但安穩。',
  },
  {
    condition: { palace: '遷移宮', stars: ['太陽', '太陰'] },
    interpretation: '遷移宮日月同守,在外形象鮮明、貴人與變動並存,離開出生地發展反而更能展現才華。',
  },
  {
    condition: { stars: ['七殺'] },
    interpretation: '七殺坐守,行動力強、敢衝敢變,人生起伏較大,宜學習沉澱與長期布局。',
  },
  {
    condition: { stars: ['破軍'], transformations: ['權'] },
    interpretation: '破軍化權,變革的力道被放大,敢於打掉重練且多能成事,但過程勞心勞力,留意與人硬碰硬。',
  },
];

// src/data/star-meanings.js — 星曜基本義(種子資料,可持續擴充)

/** 十四主星 */
export const starMeanings = {
  紫微: { core: '領導、尊貴、自我要求高', keywords: ['權威', '面子', '統御'] },
  天機: { core: '機智、企劃、善變通', keywords: ['謀略', '思考', '流動'] },
  太陽: { core: '博愛、外放、付出', keywords: ['名聲', '熱情', '奉獻'] },
  武曲: { core: '務實、執行力、與財有緣', keywords: ['財星', '果決', '剛毅'] },
  天同: { core: '溫和、享福、知足', keywords: ['福星', '隨和', '安逸'] },
  廉貞: { core: '理性與感性拉扯、重原則', keywords: ['囚星', '桃花', '官祿'] },
  天府: { core: '穩重、保守、善守成', keywords: ['庫星', '包容', '安定'] },
  太陰: { core: '細膩、內斂、重家庭', keywords: ['田宅', '母性', '柔和'] },
  貪狼: { core: '多才多藝、慾望、社交', keywords: ['桃花', '才藝', '開創'] },
  巨門: { core: '口才、是非、深入研究', keywords: ['口舌', '猜疑', '專業'] },
  天相: { core: '輔佐、公正、重形象', keywords: ['印星', '服務', '協調'] },
  天梁: { core: '庇蔭、老成、愛照顧人', keywords: ['蔭星', '長者', '化解'] },
  七殺: { core: '衝勁、獨立、變動大', keywords: ['將星', '肅殺', '開創'] },
  破軍: { core: '破舊立新、先破後成', keywords: ['耗星', '變革', '衝鋒'] },
};

/** 六吉星 */
export const auspiciousStars = {
  左輔: { core: '得力助手、貴人扶持', keywords: ['助力'] },
  右弼: { core: '暗中相助、人緣佳', keywords: ['助力'] },
  文昌: { core: '文書、考運、條理', keywords: ['科甲'] },
  文曲: { core: '口才、才藝、感性', keywords: ['才華'] },
  天魁: { core: '明面貴人、機會', keywords: ['貴人'] },
  天鉞: { core: '暗處貴人、提攜', keywords: ['貴人'] },
};

/** 六煞星 */
export const maleficStars = {
  擎羊: { core: '衝突、刑傷、行動激烈', keywords: ['刑'] },
  陀羅: { core: '拖延、糾纏、內耗', keywords: ['忌'] },
  火星: { core: '急躁、爆發、來得快', keywords: ['火爆'] },
  鈴星: { core: '悶燒、記恨、後勁強', keywords: ['隱性'] },
  地空: { core: '空想、破財於無形', keywords: ['空'] },
  地劫: { core: '劫財、起伏、反潮流', keywords: ['劫'] },
};

/** 綜合查詢:主星 → 吉星 → 煞星 */
export function lookupStar(name) {
  return starMeanings[name] ?? auspiciousStars[name] ?? maleficStars[name] ?? null;
}

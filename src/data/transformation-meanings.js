// src/data/transformation-meanings.js — 四化基本義
// iztro 的 mutagen 只給單字(祿/權/科/忌),兩種 key 都支援

export const transformationMeanings = {
  化祿: '順遂、財氣、人緣加分',
  化權: '掌控欲、爆發力、也可能強勢',
  化科: '名聲、貴人、文書之喜',
  化忌: '阻礙、糾結、需要留意的課題',
};

export function lookupTransformation(key) {
  if (!key) return null;
  const full = key.startsWith('化') ? key : `化${key}`;
  return transformationMeanings[full] ?? null;
}

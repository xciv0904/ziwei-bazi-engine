// src/engines/life-manual.js — 「人生說明書」敘事組裝
//
// 完整報告原本是一段段各自獨立的分析，讀完知道很多零件，卻拼不出「這是我的人生」的感覺。
// 這支把既有排盤結果重新排成一條時間線：你是什麼樣的人 → 人生會怎麼展開 →
// 反覆遇到的課題 → 轉折點落在哪幾年。
//
// 界線與其他引擎一致：
//   1. 不重新排盤。大限、宮位、生年四化、飛化疊加全部沿用既有函式。
//   2. 不新增命理結論。敘事只重組已算出的事實，措辭保留「多半、容易、可能」。
//   3. 不寫死任何一張命盤。星名、宮名、年份全部由傳入的 ziWei 決定。

import {
  AGE_CONTEXT,
  BIRTH_MUTAGEN_LIFE_THEME,
  BODY_PALACE_NOTE,
  LIMIT_PALACE_THEME,
  PALACE_DOMAIN_WORD,
  STAR_APPROACH,
  STAR_DISPLAY_NAME,
  TURNING_POINT_CLOSERS,
} from '../data/life-manual.js';
import stageDetails from '../data/life-stage-details.json' with { type: 'json' };
import { starMeanings } from '../data/star-meanings.js';
import { computeFlyingTransformations, findFlyingConvergence } from './compose-annual.js';

const STAGE_DETAIL = stageDetails['階段'];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 主星在白話敘事中的顯示名（處理「七殺」與八字十神同名的問題） */
const showStar = (name) => STAR_DISPLAY_NAME[name] ?? name;

const byBranchOf = (ziWei) => Object.fromEntries(ziWei.palaces.map((p) => [p.position[1], p]));

/** 該宮的主星；空宮則借對宮，並標示是借來的 */
function leadStarOf(ziWei, palace) {
  if (palace?.majorStars?.length) return { name: palace.majorStars[0].name, borrowed: false };
  if (!palace) return { name: null, borrowed: false };
  const opposite = byBranchOf(ziWei)[BRANCHES[(BRANCHES.indexOf(palace.position[1]) + 6) % 12]];
  return { name: opposite?.majorStars?.[0]?.name ?? null, borrowed: Boolean(opposite?.majorStars?.length) };
}

const ageContextOf = (age) => AGE_CONTEXT.find((item) => age <= item.until) ?? AGE_CONTEXT.at(-1);

/**
 * 第一段：你是什麼樣的人。
 * 用命宮主星、身宮位置與命主身主組成，避免只丟形容詞。
 */
function buildOpening(ziWei) {
  const life = ziWei.palaces.find((p) => p.name === '命宮');
  const lead = leadStarOf(ziWei, life);
  const body = ziWei.palaces.find((p) => p.isBodyPalace);
  const paragraphs = [];

  if (lead.name) {
    const core = starMeanings[lead.name]?.core ?? '';
    const approach = STAR_APPROACH[lead.name] ?? '';
    paragraphs.push(lead.borrowed
      ? `你的命宮沒有主星，這代表你不是那種一出生就有固定樣子的人：你的性格比多數人更受環境、經歷與你自己的選擇影響。從對宮借過來看，${showStar(lead.name)}的特質最能描述你——${core}。${approach}。`
      : `你的底色是${showStar(lead.name)}：${core}。${approach}。`);
  }

  if (body) {
    paragraphs.push(body.name === '命宮'
      ? BODY_PALACE_NOTE.same
      : BODY_PALACE_NOTE.other(body.name, PALACE_DOMAIN_WORD[body.name] ?? body.name));
  }

  const birth = ziWei.palaces.flatMap((p) => p.majorStars
    .filter((s) => s.transformation)
    .map((s) => ({ palace: p.name, star: s.name, mutagen: String(s.transformation).replace(/^化/, '') })));
  const ji = birth.find((item) => item.mutagen === '忌');
  const lu = birth.find((item) => item.mutagen === '祿');
  // 這一段是給沒有命理基礎的人讀的，所以不出現四化的術語名稱，
  // 只講它實際代表的意思；完整的術語資料留在下方收合的專業依據裡。
  if (lu) {
    paragraphs.push(`比較順的地方在${PALACE_DOMAIN_WORD[lu.palace] ?? lu.palace}。命盤在這裡放了一顆帶來助力的星（${showStar(lu.star)}），資源和機會多半從這個方向來，你也容易不知不覺把最多時間投在這裡。`);
  }
  if (ji) {
    paragraphs.push(`比較費力的地方在${PALACE_DOMAIN_WORD[ji.palace] ?? ji.palace}。命盤在這裡放了一顆帶來課題的星（${showStar(ji.star)}），意思不是這一塊會出事，而是你這輩子在這裡投入的心力會比別人多，同一類問題也會用不同形式一再出現。`);
  }
  return paragraphs;
}

/**
 * 第二段：你的人生會怎麼展開。
 * 逐個大限敘述：這十年的重心是什麼、會實際發生哪些事、你會用什麼方式面對。
 */
function buildStages(ziWei, birthYear, currentYear) {
  const byBranch = byBranchOf(ziWei);
  const nominalAge = currentYear - birthYear + 1;
  return ziWei.majorLimits.map((limit) => {
    const [startAge, endAge] = limit.ageRange.split('~').map(Number);
    const palace = byBranch[limit.ganZhi[1]];
    const theme = LIMIT_PALACE_THEME[palace?.name] ?? null;
    const lead = leadStarOf(ziWei, palace);
    const context = ageContextOf(endAge);
    const current = nominalAge >= startAge && nominalAge <= endAge;
    const startYear = birthYear + startAge - 1;
    const endYear = birthYear + endAge - 1;

    const paragraphs = [];
    if (theme) {
      paragraphs.push(`這十年的重心是${theme.focus}。${theme.scenes[0]}。`);
      if (theme.scenes[1]) paragraphs.push(`${theme.scenes[1]}。`);
      // 宮位決定這十年的主題，主星決定這個人會怎麼過這十年。
      // 兩者合起來才是個人化的內容——只用宮位主題的話，同一個大限落宮的人會讀到一模一樣的段落。
      const detail = lead.name ? STAGE_DETAIL[palace?.name]?.[lead.name] : null;
      if (detail) {
        paragraphs.push(`${detail}${lead.borrowed ? `（${palace.name}無主星，這一段借對宮的${showStar(lead.name)}參看）` : ''}`);
      } else if (lead.name && STAR_APPROACH[lead.name]) {
        paragraphs.push(`${STAR_APPROACH[lead.name]}${lead.borrowed ? '（這一宮無主星，借對宮參看）' : ''}。`);
      }
      paragraphs.push(`這段最容易被消耗的地方是：${theme.cost}。`);
    }
    return {
      ganZhi: limit.ganZhi,
      ageRange: limit.ageRange,
      startAge,
      endAge,
      startYear,
      endYear,
      palaceName: palace?.name ?? '',
      stageLabel: context.label,
      stageNote: context.note,
      current,
      paragraphs,
    };
  });
}

/**
 * 第三段：你反覆遇到的課題。
 * 兩個來源：生年四化(一輩子的底色)與飛化疊加點(多個宮位同時指向同一個地方)。
 */
function buildThemes(ziWei) {
  const items = [];
  for (const palace of ziWei.palaces) {
    for (const star of palace.majorStars) {
      if (!star.transformation) continue;
      const mutagen = String(star.transformation).replace(/^化/, '');
      const build = BIRTH_MUTAGEN_LIFE_THEME[mutagen];
      if (!build) continue;
      items.push({
        headline: `${PALACE_DOMAIN_WORD[palace.name] ?? palace.name}`,
        body: build(palace.name, PALACE_DOMAIN_WORD[palace.name] ?? palace.name),
        weight: mutagen === '忌' ? 0 : 1,
      });
    }
  }
  // 每一種四化只取最強的一個疊加點:同類型取兩個的話，兩句話的後半會完全一樣，
  // 分句之後就是同一頁出現兩次一模一樣的句子。
  const seenMutagen = new Set();
  const convergence = findFlyingConvergence(computeFlyingTransformations(ziWei))
    .filter((item) => item.mutagen === '忌' || item.from.length >= 3)
    .filter((item) => {
      if (seenMutagen.has(item.mutagen)) return false;
      seenMutagen.add(item.mutagen);
      return true;
    })
    .slice(0, 2);
  // 四種疊加各有各的說法。若全部共用同一句收尾，同一頁就會出現兩句只有前半不同的話。
  const convergenceBody = {
    忌: (domain, n) => `命盤裡有 ${n} 個位置同時把壓力送往${domain}。這代表這個部分承接的東西比表面上看起來多，累的時候通常先從這裡出狀況。`,
    祿: (domain, n) => `命盤裡有 ${n} 個位置同時把資源送往${domain}。這是你可以放心加碼的地方，投入通常收得回來。`,
    權: (domain, n) => `命盤裡有 ${n} 個位置同時把主導權集中在${domain}。這一塊的決定多半得由你自己扛，別人不太幫得上忙。`,
    科: (domain, n) => `命盤裡有 ${n} 個位置同時讓${domain}被看見。你的名聲與別人對你的印象，多半是從這裡建立起來的。`,
  };
  for (const item of convergence) {
    const domain = PALACE_DOMAIN_WORD[item.palaceName] ?? item.palaceName;
    const build = convergenceBody[item.mutagen];
    if (!build) continue;
    items.push({ headline: domain, body: build(domain, item.from.length), weight: 2 });
  }
  // 同一段敘述可能由不同來源產生（例如兩個宮位都被多方飛入同一種四化），
  // 一份報告裡讀到兩句一模一樣的話會立刻破功，這裡以內容去重。
  const seen = new Set();
  return items.sort((a, b) => a.weight - b.weight)
    .filter((item) => {
      const key = `${item.headline}|${item.body}`;
      if (seen.has(key) || seen.has(item.body)) return false;
      seen.add(key);
      seen.add(item.body);
      return true;
    })
    .slice(0, 4)
    .map(({ headline, body }) => ({ headline, body }));
}

/**
 * 第四段：你的轉折點。
 * 大限交界是紫微斗數裡最明確的階段切換點，直接換算成西元年，讓人可以對照自己的經歷。
 */
function buildTurningPoints(ziWei, birthYear, currentYear) {
  const byBranch = byBranchOf(ziWei);
  const nominalAge = currentYear - birthYear + 1;
  let pastIndex = 0;
  let futureIndex = 0;
  return ziWei.majorLimits.slice(1).map((limit) => {
    const startAge = Number(limit.ageRange.split('~')[0]);
    const palace = byBranch[limit.ganZhi[1]];
    const theme = LIMIT_PALACE_THEME[palace?.name] ?? null;
    const year = birthYear + startAge - 1;
    const past = year < currentYear;
    // 收尾句輪替，避免同一頁重複同一句話
    const pool = past ? TURNING_POINT_CLOSERS.past : TURNING_POINT_CLOSERS.future;
    const closer = pool[Math.min(past ? pastIndex++ : futureIndex++, pool.length - 1)];
    return {
      year,
      age: startAge,
      palaceName: palace?.name ?? '',
      past,
      body: theme
        ? `${year}年前後（虛歲${startAge}），重心換到${palace.name}：${theme.focus}。${closer}`
        : `${year}年前後（虛歲${startAge}）進入下一個十年。`,
      distance: Math.abs(startAge - nominalAge),
    };
  }).sort((a, b) => a.year - b.year);
}

/**
 * @param {object} args
 * @param {object} args.ziWei convertToZiWei() 輸出
 * @param {number} args.birthYear 出生西元年
 * @param {number} [args.currentYear] 用來判斷現在走到哪一段，預設今年
 */
export function buildLifeManual({ ziWei, birthYear, currentYear = new Date().getFullYear() }) {
  if (!ziWei?.palaces?.length) return null;
  const stages = buildStages(ziWei, birthYear, currentYear);
  return {
    opening: buildOpening(ziWei),
    stages,
    currentStage: stages.find((item) => item.current) ?? null,
    themes: buildThemes(ziWei),
    turningPoints: buildTurningPoints(ziWei, birthYear, currentYear),
    disclaimer: '以上是依命盤結構整理出的傾向與時間順序，用來對照你已經走過的路、以及提早準備接下來的階段，不是預言必然會發生的事。',
  };
}

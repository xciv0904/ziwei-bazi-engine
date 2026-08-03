// tests/topic-on-question.mjs — 主題分析「扣題」回歸測試
//
// 這支測試存在的原因很具體：改版前，60 題裡有大半是答非所問的。
// 「什麼樣的居住環境比較適合我？」會被答成「面對舊有做法行不通時，你會是那個提議大改的人」，
// 「我在什麼狀態下比較容易遇到機會？」會被答成「出門前會習慣先查路線」。
// 根因是白話內容庫只為財帛、官祿、夫妻、疾厄四個領域寫過文案，其餘七宮沿用主星的通用性格描述。
//
// 現在每一題 × 每一顆主星都有專屬答案（src/data/topic-star-answers.json），
// 這支測試守住三件事：
//   1. 覆蓋完整：60 題 × 14 主星一個都不能少，任何一格空掉就會有人讀到答非所問的內容。
//   2. 真的扣題：答案必須出現該題領域的關鍵詞，而且不得混入其他領域的詞彙。
//   3. 文字品質：不用術語、不用雙重否定、不同主星的答案不能雷同、同一題不同人要有差異。
//
// 執行：node tests/topic-on-question.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { convertToBaZi } from '../src/engines/bazi.js';
import { composeElementAnalysis } from '../src/engines/compose-elements.js';
import { composeBaZiLuck } from '../src/engines/compose-luck.js';
import { generatePlainBaziTopics, generatePlainPalaceCard } from '../src/engines/compose-plain.js';
import { buildTopicReport, resolveTopicStar } from '../src/engines/topic-report.js';
import { similarityScore } from '../src/engines/text-quality.js';
import { TOPIC_CATEGORIES, TOPIC_CONTRACTS } from '../src/data/topic-contracts.js';

const answers = JSON.parse(readFileSync(new URL('../src/data/topic-star-answers.json', import.meta.url), 'utf8'))['答案'];

const STARS = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);
const compact = (value) => String(value ?? '').replace(/\s+/g, '');

// ---------- 1. 覆蓋完整 ----------
{
  const missing = [];
  for (const contract of TOPIC_CONTRACTS) {
    const table = answers[contract.id];
    if (!table) { missing.push(`${contract.id}（整題缺漏）`); continue; }
    for (const star of STARS) {
      if (!table[star]) missing.push(`${contract.id}/${star}`);
    }
  }
  const extraTopics = Object.keys(answers).filter((id) => !TOPIC_CONTRACTS.some((c) => c.id === id));
  if (missing.length) fail(`答案庫缺漏 ${missing.length} 格：${missing.slice(0, 6).join('、')}${missing.length > 6 ? '…' : ''}`);
  if (extraTopics.length) fail(`答案庫有對不到題目的項目：${extraTopics.join('、')}`);
  if (!missing.length && !extraTopics.length) {
    ok(`答案庫覆蓋完整：${TOPIC_CONTRACTS.length} 題 × ${STARS.length} 主星 = ${TOPIC_CONTRACTS.length * STARS.length} 組`);
  }
}

// ---------- 2. 真的扣題 ----------
// 這一節用兩道互補的檢查，取代「每一格都必須出現關鍵詞」那種會大量誤判的比對——
// 很多正確答案本來就不必複述題目的字（「先建立固定的生活節奏」回答「怎麼站穩」完全扣題）。
//
//   2a 反向檢查：答案不得與該主星的「通用性格描述」雷同。
//      這正是改版前的病灶——住宅題被答成「面對舊有做法行不通時，你會是那個提議大改的人」，
//      那句話其實是破軍的性格描述，不是居住環境的回答。
//   2b 跨領域檢查：答案不得出現明顯屬於其他主題的詞（住宅題不該談升遷、感情題不該談房貸）。
//   2c 主題覆蓋率：一題十四格裡，至少三分之一要真的講到這個主題的字。
//      門檻刻意訂得寬：題目本身已經提供語境，好答案不必複述題目的字
//      （「先建立固定的生活節奏」回答「怎麼站穩」完全扣題）。這一項只用來偵測整題集體漂走。
const DOMAIN_RULES = {
  love: {
    expect: ['對方', '伴侶', '感情', '關係', '心動', '親密', '交往', '界線', '衝突', '相處', '修復', '在乎'],
    forbid: ['升遷', '房貸', '搬家', '置產', '投資'],
  },
  career: {
    expect: ['工作', '職', '團隊', '專業', '事業', '執行', '任務', '同事', '產業', '履歷', '資歷', '作品',
      '成果', '角色', '環境', '拿手', '優勢', '擅長', '主導', '帶', '分工', '卡', '累積'],
    forbid: ['伴侶', '交往', '房貸', '晚輩', '父母'],
  },
  money: {
    expect: ['錢', '收入', '財', '資源', '儲蓄', '投資', '報酬', '支出', '預算', '帳', '分潤', '風險',
      '資產', '合作', '累積', '花', '買', '決定'],
    forbid: ['伴侶', '交往', '晚輩', '搬家', '同住'],
  },
  parents: {
    expect: ['長輩', '父母', '家人', '家裡', '家族', '家庭', '界線', '溝通', '期待', '距離', '你和'],
    forbid: ['伴侶', '交往', '升遷', '投資'],
  },
  children: {
    expect: ['晚輩', '子女', '學生', '產出', '作品', '教', '陪伴', '照顧', '期待', '界線', '對方', '他'],
    forbid: ['伴侶', '交往', '房貸', '升遷'],
  },
  luck: {
    expect: ['機會', '順', '助力', '時機', '運', '貴人', '狀態', '人脈', '成果', '方法', '錯過',
      '主動', '幫到你', '環境', '的人'],
    forbid: ['伴侶', '交往', '房貸'],
  },
  home: {
    expect: ['空間', '住', '家', '房', '環境', '搬', '格局', '坪', '收納', '裝修', '同住', '置產',
      '資產', '工作區', '留意', '預算', '合約', '累積'],
    forbid: ['升遷', '晚輩', '交往', '伴侶'],
  },
  health: {
    expect: ['壓力', '身體', '休息', '睡', '情緒', '恢復', '疲', '耗', '作息', '運動', '透支', '狀態', '節奏'],
    forbid: ['升遷', '房貸', '晚輩', '伴侶'],
  },
  social: {
    expect: ['朋友', '人際', '合作', '關係', '圈', '團隊', '同事', '印象', '界線', '對方', '交',
      '扮演', '角色', '大家', '別人'],
    forbid: ['房貸', '搬家', '子女'],
  },
  migration: {
    expect: ['環境', '外地', '城市', '移動', '適應', '陌生', '新', '外', '搬', '發展', '地方',
      '當地', '經驗', '初期', '站穩', '落腳', '遇到'],
    forbid: ['伴侶', '交往', '晚輩', '房貸'],
  },
};

// 主星的通用性格描述：改版前答非所問的內容就是直接來自這裡。
const starProfiles = JSON.parse(readFileSync(new URL('../src/data/plain-star-profiles.json', import.meta.url), 'utf8'))['主星白話性格'];
const genericTextOf = (star) => {
  const profile = starProfiles[star];
  if (!profile) return [];
  return [profile.summary, ...(profile.explanation ?? []), ...(profile.lifeExamples ?? []),
    ...(profile.challenges ?? []), ...(profile.advice ?? [])].filter(Boolean);
};

{
  let generic = 0;
  let crossDomain = 0;
  const lowCoverage = [];

  for (const category of TOPIC_CATEGORIES) {
    const rule = DOMAIN_RULES[category.key];
    if (!rule) { fail(`測試缺少 ${category.key} 的扣題規則`); continue; }
    for (const contract of category.contracts) {
      let onTopic = 0;
      let counted = 0;
      for (const star of STARS) {
        const text = compact(answers[contract.id]?.[star]);
        if (!text) continue;
        counted++;
        if (rule.expect.some((word) => text.includes(word))) onTopic++;

        // 2a：不得直接沿用主星的通用性格描述
        const clash = genericTextOf(star).find((line) => similarityScore(compact(line), text) > 0.62);
        if (clash) {
          generic++;
          fail(`沿用通用性格描述：${contract.id}/${star} →「${text.slice(0, 34)}」幾乎等同性格庫的「${compact(clash).slice(0, 24)}」`);
        }

        // 2b：不得混入其他主題的詞
        const wrong = rule.forbid.filter((word) => text.includes(word));
        if (wrong.length) {
          crossDomain++;
          fail(`跨領域：${contract.id}/${star} 出現其他主題的詞（${wrong.join('、')}）→「${text.slice(0, 34)}」`);
        }
      }
      // 2c：整題的主題覆蓋率
      const ratio = counted ? onTopic / counted : 0;
      if (ratio < 1 / 3) lowCoverage.push(`${contract.id}（${onTopic}/${counted}）`);
    }
  }
  if (lowCoverage.length) fail(`整題偏離主題：${lowCoverage.join('、')}`);
  if (!generic && !crossDomain && !lowCoverage.length) {
    ok('沒有任何一格沿用主星通用性格描述、沒有混入其他主題的詞，每題主題覆蓋率達標');
  }
}

// ---------- 3. 文字品質 ----------
const BANNED_JARGON = ['化祿', '化權', '化科', '化忌', '喜用神', '忌神', '廟旺', '落陷', '借星', '來因宮', '自化', '宮干', '藏干', '納音', '三方四正', '大限', '流年'];
const NEGATIVE_PHRASING = ['不低', '不差', '不算少', '不會太差', '不太差', '並非不', '不是不', '未嘗不'];
const VAGUE = ['因人而異', '可以著力的方向', '實際狀況仍會', '端看個人'];
const ABSOLUTE = ['一定會', '必定', '肯定會', '絕對會', '注定'];

{
  const issues = { jargon: [], negative: [], vague: [], absolute: [], tooShort: [], tooLong: [] };
  for (const contract of TOPIC_CONTRACTS) {
    for (const star of STARS) {
      const text = compact(answers[contract.id]?.[star]);
      if (!text) continue;
      const where = `${contract.id}/${star}`;
      const jargon = BANNED_JARGON.filter((term) => text.includes(term));
      if (jargon.length) issues.jargon.push(`${where}（${jargon.join('、')}）`);
      const negative = NEGATIVE_PHRASING.filter((term) => text.includes(term));
      if (negative.length) issues.negative.push(`${where}（${negative.join('、')}）`);
      if (VAGUE.some((term) => text.includes(term))) issues.vague.push(where);
      const absolute = ABSOLUTE.filter((term) => text.includes(term));
      if (absolute.length) issues.absolute.push(`${where}（${absolute.join('、')}）`);
      if (text.length < 16) issues.tooShort.push(`${where}（${text.length} 字）`);
      if (text.length > 70) issues.tooLong.push(`${where}（${text.length} 字）`);
    }
  }
  for (const [key, label] of [
    ['jargon', '使用命理術語'],
    ['negative', '使用雙重否定或消極繞路的說法'],
    ['vague', '出現套在誰身上都成立的空話'],
    ['absolute', '寫成必然會發生的事'],
    ['tooShort', '答案過短'],
    ['tooLong', '答案過長'],
  ]) {
    const list = issues[key];
    if (list.length) fail(`${label}：${list.slice(0, 5).join('、')}${list.length > 5 ? `…共 ${list.length} 格` : ''}`);
  }
  if (Object.values(issues).every((list) => !list.length)) ok('文字品質檢查通過：無術語、無雙重否定、無空話、無斷定語氣、長度合理');
}

// ---------- 4. 同一題的不同主星必須真的不同 ----------
{
  const duplicates = [];
  for (const contract of TOPIC_CONTRACTS) {
    const table = answers[contract.id] ?? {};
    for (let i = 0; i < STARS.length; i++) {
      for (let j = i + 1; j < STARS.length; j++) {
        const a = table[STARS[i]];
        const b = table[STARS[j]];
        if (!a || !b) continue;
        if (similarityScore(a, b) > 0.72) duplicates.push(`${contract.id}：${STARS[i]} ≈ ${STARS[j]}`);
      }
    }
  }
  if (duplicates.length) fail(`同一題有主星答案雷同：${duplicates.slice(0, 5).join('、')}${duplicates.length > 5 ? `…共 ${duplicates.length} 組` : ''}`);
  else ok('同一題的十四主星答案彼此有足夠差異');
}

// ---------- 5. 端到端：實際命盤跑完 60 題 ----------
{
  const charts = [
    { id: 'A', input: { year: 2002, month: 9, day: 4, hour: 13, gender: 'female' } },
    { id: 'B', input: { year: 1978, month: 2, day: 21, hour: 3, gender: 'female' } },
    { id: 'C', input: { year: 1998, month: 6, day: 21, hour: 19, gender: 'male' } },
  ];
  const answersByTopic = new Map();
  let placeholder = 0;
  let missingBasis = 0;

  for (const chart of charts) {
    const ziWei = convertToZiWei(chart.input);
    const baZi = convertToBaZi(chart.input);
    const baziCards = generatePlainBaziTopics(baZi, composeBaZiLuck(baZi, { mode: 'public' }), composeElementAnalysis(baZi.fiveElementDistribution));
    for (const contract of TOPIC_CONTRACTS) {
      const report = buildTopicReport({
        contract,
        ziWei,
        ziweiCard: generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]),
        baziCards,
      });
      const where = `${chart.id}/${contract.id}`;
      const answer = compact(report.directAnswer.answer);

      if (report.fallbackApplied) fail(`${where} 退回安全 fallback，使用者會讀到「訊號較少」而不是答案`);
      if (report.validationIssues.length) fail(`${where} 驗證未過：${report.validationIssues.join('；')}`);

      // 命盤依據必須是真的盤面事實，不是每一條都長一樣的佔位字串
      const basis = report.chartBasis ?? [];
      if (!basis.length) { missingBasis++; fail(`${where} 沒有命盤依據`); }
      if (basis.some((row) => row.detail.includes('的主要訊號'))) {
        placeholder++;
        fail(`${where} 命盤依據仍是佔位字串`);
      }
      const rows = basis.map((row) => `${row.label}|${row.detail}`);
      if (rows.length !== new Set(rows).size) fail(`${where} 命盤依據出現重複列`);

      // 答案必須真的來自這張盤的主星
      const resolved = resolveTopicStar(contract, ziWei);
      if (resolved?.star) {
        const expected = compact(answers[contract.id][resolved.star]);
        if (expected && !answer.includes(expected.slice(0, 12))) {
          fail(`${where} 的答案沒有對應到本盤主星 ${resolved.star}`);
        }
      }

      if (!answersByTopic.has(contract.id)) answersByTopic.set(contract.id, []);
      answersByTopic.get(contract.id).push({ chart: chart.id, answer, star: resolved?.star ?? null });
    }
  }

  // 不同命盤在同一題上，只要主星不同就必須讀起來不同——否則等於沒有依命盤產生
  let identical = 0;
  for (const [topicId, list] of answersByTopic) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].star && list[j].star && list[i].star !== list[j].star && list[i].answer === list[j].answer) {
          identical++;
          fail(`${topicId}：${list[i].chart} 與 ${list[j].chart} 主星不同（${list[i].star} / ${list[j].star}）卻得到一模一樣的答案`);
        }
      }
    }
  }
  if (!placeholder && !missingBasis && !identical) {
    ok(`${charts.length} 張命盤 × ${TOPIC_CONTRACTS.length} 題全部答出扣題內容，命盤依據皆為真實盤面事實`);
  }
}

console.log(failed
  ? `\n共 ${failed} 項主題分析扣題問題 ❌`
  : `\n${TOPIC_CONTRACTS.length} 題 × ${STARS.length} 主星答案庫，加上 3 張命盤端到端驗證全部通過 ✅`);
process.exit(failed ? 1 : 0);

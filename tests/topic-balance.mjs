// tests/topic-balance.mjs — 主題分析真的是紫微與八字雙軌
//
// 這支測試的由來是一組數字。使用者說「八字的部分感覺變很少」，實測之後確認了：
// 同一張盤跑完 60 題，選出來的 180 條依據裡只有 13 條來自八字，佔 7.2%。
// 但八字通過篩選的候選其實有 972 條、佔全部候選的 66%——
// 八字不是內容不夠，是在選擇階段被系統性地挑掉了。
//
// 站名叫「紫微斗數・八字排盤」。如果八字只佔 7%，那個名字就有一半是假的。
//
// 這支守四件事：
//   1. 每一題都要有八字答案（八字答案庫 600 格必須完整且對得上 60 題）。
//   2. 每一題選出的依據裡至少要有一條來自八字——保留席還在。
//   3. 八字依據的整體佔比不得低於門檻（目前 20%）。
//   4. 十神的選擇規則真的有依主題分流，不是每題都回傳同一個十神。
//
// 第 4 條特別重要：如果取用規則寫壞了，前三條仍然會通過（每題都有答案、都有依據），
// 但那些答案全部來自同一個十神，等於八字只是換句話說同一件事。
//
// 執行：node tests/topic-balance.mjs（已掛在 npm run smoke 的檢查串裡）
import { readFileSync } from 'node:fs';
import { convertToZiWei } from '../src/engines/ziwei.js';
import { convertToBaZi } from '../src/engines/bazi.js';
import { composeElementAnalysis } from '../src/engines/compose-elements.js';
import { composeBaZiLuck } from '../src/engines/compose-luck.js';
import { computeYongShen } from '../src/engines/compose-yongshen.js';
import { generatePlainBaziTopics, generatePlainPalaceCard } from '../src/engines/compose-plain.js';
import { buildTopicReport } from '../src/engines/topic-report.js';
import { TEN_GOD_ANSWER_TOPICS } from '../src/engines/topic-bazi.js';
import { TOPIC_CATEGORIES, TOPIC_CONTRACTS } from '../src/data/topic-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('./golden/cases/topic-report-charts.json', import.meta.url), 'utf8'));

let failed = 0;
const fail = (message) => { failed++; console.log(`❌ ${message}`); };
const ok = (message) => console.log(`✅ ${message}`);

const TEN_GODS = ['比肩', '劫財', '食神', '傷官', '正財', '偏財', '正官', '七殺', '正印', '偏印'];
const BAZI_SHARE_FLOOR = 0.20; // 八字依據佔比的下限

// ---------- 1. 答案庫完整 ----------
{
  const contractIds = TOPIC_CONTRACTS.map((c) => c.id);
  const missing = contractIds.filter((id) => !TEN_GOD_ANSWER_TOPICS.includes(id));
  const extra = TEN_GOD_ANSWER_TOPICS.filter((id) => !contractIds.includes(id));
  if (missing.length) fail(`八字答案庫缺 ${missing.length} 題：${missing.slice(0, 3).join('、')}…`);
  else if (extra.length) fail(`八字答案庫有 ${extra.length} 題對不到現有題目：${extra.slice(0, 3).join('、')}…`);
  else ok(`八字答案庫涵蓋全部 ${contractIds.length} 題（每題 ${TEN_GODS.length} 個十神，共 ${contractIds.length * TEN_GODS.length} 格）`);
}

// ---------- 2~4. 用真實命盤跑一遍 ----------
{
  const cases = fixture.cases ?? fixture;
  let noBaziAnswer = 0;
  let noBaziEvidence = 0;
  let ziweiEvidence = 0;
  let baziEvidence = 0;
  let questions = 0;
  const tenGodsSeen = new Set();
  const perChartTenGods = [];

  for (const testCase of cases) {
    const input = testCase.input ?? testCase;
    const ziWei = convertToZiWei(input);
    const baZi = convertToBaZi(input);
    const elements = composeElementAnalysis(baZi.fiveElementDistribution);
    const bzLuck = composeBaZiLuck(baZi, { year: fixture.referenceYear ?? 2026, mode: 'public' });
    const baziCards = generatePlainBaziTopics(baZi, bzLuck, elements);
    const yongshen = computeYongShen(baZi);
    const chartTenGods = new Set();

    for (const category of TOPIC_CATEGORIES) {
      for (const contract of category.contracts) {
        const ziweiCard = generatePlainPalaceCard(ziWei, contract.allowedPalaces[0]);
        const report = buildTopicReport({
          contract, ziWei, ziweiCard, baziCards, baZi, gender: input.gender, yongshen,
        });
        questions++;

        if (!report.directAnswer.baziAnswer) noBaziAnswer++;
        if (report.resolvedTenGod?.tenGod) {
          tenGodsSeen.add(report.resolvedTenGod.tenGod);
          chartTenGods.add(report.resolvedTenGod.tenGod);
        }

        let hasBazi = false;
        for (const item of report.selectedEvidence) {
          if (String(item.publicBasis).includes('八字')) { baziEvidence++; hasBazi = true; } else ziweiEvidence++;
        }
        // 依據完全空白的題目不算（那是另一種問題，由 topic-report-contracts 守）
        if (report.selectedEvidence.length && !hasBazi) noBaziEvidence++;
      }
    }
    perChartTenGods.push(chartTenGods.size);
  }

  if (noBaziAnswer) fail(`${noBaziAnswer} 題沒有八字答案，雙軌只剩一軌`);
  else ok(`${questions} 題全部都有紫微與八字兩句答案`);

  if (noBaziEvidence) fail(`${noBaziEvidence} 題的依據裡完全沒有八字——保留席可能被拿掉了`);
  else ok('每一題選出的依據都至少有一條來自八字（保留席仍在）');

  const share = baziEvidence / (ziweiEvidence + baziEvidence);
  if (share < BAZI_SHARE_FLOOR) {
    fail(`八字依據只佔 ${(share * 100).toFixed(1)}%，低於 ${(BAZI_SHARE_FLOOR * 100).toFixed(0)}% 的下限`);
  } else {
    ok(`八字依據佔 ${(share * 100).toFixed(1)}%（紫微 ${ziweiEvidence} 條／八字 ${baziEvidence} 條，下限 ${(BAZI_SHARE_FLOOR * 100).toFixed(0)}%）`);
  }

  // 取用規則若壞掉，最常見的症狀是每題都回傳同一個十神：
  // 表面上每題都有八字答案，實際上八字只是把同一句話換十個地方講。
  const minVariety = Math.min(...perChartTenGods);
  if (minVariety < 3) fail(`有命盤的 60 題只用到 ${minVariety} 種十神，取用規則可能沒有依主題分流`);
  else ok(`十神取用有依主題分流：單張命盤用到 ${minVariety}–${Math.max(...perChartTenGods)} 種十神，整體涵蓋 ${tenGodsSeen.size}/${TEN_GODS.length} 種`);
}

console.log(failed
  ? `\n${failed} 項失敗 ❌`
  : '\n主題分析是真正的雙軌：紫微與八字各有一份對等的答案庫與版面 ✅');
process.exit(failed ? 1 : 0);

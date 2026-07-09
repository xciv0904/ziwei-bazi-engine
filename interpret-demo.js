// interpret-demo.js — 用測試命例跑一遍:排盤 → 座標 → 解讀
import { convertToZiWei } from './src/engines/ziwei.js';
import { interpretChart } from './src/engines/interpret.js';
import { buildGrid } from './src/data/layout-positions.js';

const ziWei = convertToZiWei({ year: 2002, month: 9, day: 4, hour: 14, gender: 'female' });

// --- 1. UI 座標 ---
console.log('=== 井字盤座標 ===');
const grid = [...buildGrid(ziWei.palaces)].sort((a, b) => a.row - b.row || a.col - b.col);
for (const g of grid) {
  console.log(`(${g.row},${g.col}) ${g.branch} ${g.palace.name}${g.palace.isBodyPalace ? '[身]' : ''} ${g.palace.majorStars.map((s) => s.name).join('') || '空宮'}`);
}

// --- 2. 解讀 ---
const { overview, palaces } = interpretChart(ziWei);
console.log('\n=== 總論 ===\n' + overview);
for (const p of palaces) {
  console.log(`\n--- ${p.palaceName}(${p.position})${p.isBodyPalace ? '[身宮]' : ''} ---`);
  console.log(p.text);
}

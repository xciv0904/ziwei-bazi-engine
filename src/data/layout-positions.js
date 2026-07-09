// src/data/layout-positions.js — 12 宮 → 4×4 井字盤固定座標(row/col 皆 1 起算)
// 標準命盤排法:巳午未申在頂列、寅丑子亥在底列、中央 2×2 留給基本資訊面板
//
//   巳 │ 午 │ 未 │ 申
//   ───┼────────┼───
//   辰 │  (中宮) │ 酉
//   ───┤  資訊  ├───
//   卯 │  面板  │ 戌
//   ───┼────────┼───
//   寅 │ 丑 │ 子 │ 亥

export const LAYOUT_POSITIONS = {
  巳: { row: 1, col: 1 },
  午: { row: 1, col: 2 },
  未: { row: 1, col: 3 },
  申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 },
  酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 },
  戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 },
  丑: { row: 4, col: 2 },
  子: { row: 4, col: 3 },
  亥: { row: 4, col: 4 },
};

/** 中央資訊面板佔的格子(可放四柱、五行局、命主身主) */
export const CENTER_PANEL = { rowStart: 2, colStart: 2, rowSpan: 2, colSpan: 2 };

/**
 * 把 convertToZiWei() 的 palaces 掛上座標,直接供 UI grid 渲染
 * @param {Array} palaces  ziWei.palaces
 * @returns {Array<{branch, row, col, palace}>}
 */
export function buildGrid(palaces) {
  return palaces.map((palace) => {
    const branch = palace.position[1]; // position 形如「癸卯」
    return { branch, ...LAYOUT_POSITIONS[branch], palace };
  });
}

/**
 * T4.2:L3 输入包生成(设计文档 2.7,轻量形态素材)。
 * 合格格(base 设备 parity 格,L1 真产 diff)→ 三联图 + 簇坐标 + 量规 + 回填合同,落 reports/<nodeDir>/l3/。
 * uiv 进程本身零 LLM 调用:输入包供 harness 模型(轻量形态)或 provider(B3)读判。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeTriptych } from './triptych.js';
import { RUBRIC_ITEMS } from './types.js';
import type { L3RubricItem } from './types.js';

export interface L3CellInput {
  cellId: string; state: string; assertionScope: string;
  triptychPath: string; clusters: Array<{ x: number; y: number; w: number; h: number }>; diffRatio: number;
}
export interface L3InputPack {
  schemaVersion: 1; kind: 'l3-input'; nodeId: string; version: string;
  coordsNote: string;          // 坐标单位/三联图布局说明
  rubric: string[];            // 7 条 '<item id>: <一句中文判据>',序=RUBRIC_ITEMS
  verdictContract: string;     // 回填合同:输出 L3Verdict 数组;证据须锚定簇;仅建议不改 pass;经 uiv l3-attach 回填
  cells: L3CellInput[];
}
export interface L3Candidate {
  cellId: string; state: string; assertionScope: string;
  artifacts: { baseline: string | null; render: string | null; diff: string | null };
  pixel: { diffRatio: number; clusters: Array<{ x: number; y: number; w: number; h: number }> } | null;
}

/** 7 项中文判据(从 RUBRIC_ITEMS map 生成防序漂移)。 */
const RUBRIC_TEXT: Record<L3RubricItem, string> = {
  elements_complete: '设计稿元素全部出现且无多余',
  hierarchy: '层级嵌套与父子包含关系与设计稿一致',
  spacing: '几何间距与对齐与设计稿一致',
  typography: '字号字重与设计稿一致',
  color: '颜色与设计稿一致(含前景/背景对比)',
  corner_shadow: '圆角与阴影与设计稿一致',
  adaptive: '当前配置下无溢出/截断/错位',
};

const COORDS_NOTE = '坐标单位 px(density=2,÷2 得 dp);三联图布局 左=baseline 中=rendered 右=diff,gutter 8px';
const VERDICT_CONTRACT =
  '逐项输出 L3Verdict JSON 数组(item/verdict/evidence/severity/suggestion);'
  + 'fail 或 uncertain 的 evidence 必须引用本包 cells[].clusters 内的簇坐标(同 cellId 且矩形相交),否则该项回填时被丢弃;'
  + '结论仅建议,不改变 page-report 的 pass;经 `uiv l3-attach` 回填。';

/**
 * 合格格 = artifacts 三路径非 null 且 existsSync 全真(diff 缺失=零差异/advisory 失败,无 L3 素材,跳过)。
 * 零合格格 → null(不落盘、不建 l3/ 目录)。产物:<reportsRoot>/<nodeDir>/l3/{l3-input.json, triptych-<cellId>.png}。
 */
export function buildL3InputPack(candidates: L3Candidate[], nodeDir: string,
                                 reportsRoot: string, nodeId: string, version: string):
  { pack: L3InputPack; packPath: string } | null {
  const qualified = candidates.filter((c) => {
    const { baseline, render, diff } = c.artifacts;
    return baseline !== null && render !== null && diff !== null
      && existsSync(baseline) && existsSync(render) && existsSync(diff);
  });
  if (qualified.length === 0) return null;

  const l3Dir = join(reportsRoot, nodeDir, 'l3');
  mkdirSync(l3Dir, { recursive: true });

  const cells: L3CellInput[] = qualified.map((c) => {
    const triptychPath = join(l3Dir, `triptych-${c.cellId}.png`);
    // filter 已保证三路径非 null 且存在:非空断言收敛类型
    composeTriptych(c.artifacts.baseline!, c.artifacts.render!, c.artifacts.diff!, triptychPath);
    return {
      cellId: c.cellId, state: c.state, assertionScope: c.assertionScope, triptychPath,
      clusters: c.pixel?.clusters ?? [], diffRatio: c.pixel?.diffRatio ?? 0,
    };
  });

  const pack: L3InputPack = {
    schemaVersion: 1, kind: 'l3-input', nodeId, version,
    coordsNote: COORDS_NOTE,
    rubric: RUBRIC_ITEMS.map((item) => `${item}: ${RUBRIC_TEXT[item]}`),
    verdictContract: VERDICT_CONTRACT,
    cells,
  };
  const packPath = join(l3Dir, 'l3-input.json');
  writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  return { pack, packPath };
}

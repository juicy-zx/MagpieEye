/**
 * L2-parity 逐属性断言(T1.3 Step 6,设计文档 2.4 节)。
 * 执行口径:每属性仅当双侧值均可得才执行并计入 executed;
 *   position L1 距离≤2dp(high)、size 各轴≤2dp(high)、fontSize ≤0.5sp(high)、
 *   color CIEDE2000 ΔE<3(high)、cornerRadius 0.5dp 网格(medium)、
 *   padding 与 itemSpacing 仅容器 pair、语义侧派生自子节点、0.5dp 网格(medium)。
 * 圆角:exporter v0 cornerRadiusDp 恒 null → 自动不执行,不计分母。
 * hint 留空,由 report.ts makeHint 在 runL2 组装时确定性填充。
 */
import { TOL_DELTA_E, TOL_FONT_SP, TOL_POS_DP, EXACT_GRID_DP } from './constants.js';
import { ciede2000 } from './color.js';
import { DEFAULT_INSET_RATIO, samplePixelColor } from './sampler.js';
import type { DecodedPng } from './sampler.js';
import type { FigmaNode, Pair, PixelDiagnostic, SemDp, Severity, Violation } from './types.js';

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** “精确比”:框架量化噪声上界 0.5dp 内视为相等。 */
const gridEqual = (a: number, b: number): boolean => Math.abs(a - b) <= EXACT_GRID_DP;

/** 子节点按 (y,x) 偏序排序(拷贝,不改入参)。 */
function sortedChildren(sem: SemDp): SemDp[] {
  return [...sem.children].sort((p, q) =>
    p.positionDp.y - q.positionDp.y || p.positionDp.x - q.positionDp.x);
}

export interface PixelSampleCtx { png: DecodedPng; density: number; insetRatio?: number }

export function assertPair(
  p: Pair, pixel?: PixelSampleCtx, excludeProperties?: readonly string[],
): { violations: Violation[]; executed: number; diagnostics: PixelDiagnostic[] } {
  const violations: Violation[] = [];
  let executed = 0;
  const diagnostics: PixelDiagnostic[] = [];
  const testTag = `fig:${p.figma.id}`;
  const figmaName = p.figma.name;
  // T3.3:命中 excludeProperties 的属性整体跳过(不产 violation、不计 executed)。
  const excluded = (property: string): boolean => excludeProperties?.includes(property) ?? false;
  const add = (property: string, expected: string, actual: string, severity: Severity): void => {
    violations.push({ judgePath: 'parity', testTag, figmaName, property, expected, actual, severity, hint: '' });
  };

  const fb = p.figma.absoluteBoundingBox;
  const sem = p.sem;

  // position(L1 距离≤2dp)
  if (fb !== null && !excluded('position')) {
    executed++;
    const l1 = Math.abs(fb.x - sem.positionDp.x) + Math.abs(fb.y - sem.positionDp.y);
    if (l1 > TOL_POS_DP) {
      add('position', `(${fb.x},${fb.y})`, `(${sem.positionDp.x},${sem.positionDp.y})`, 'high');
    }
  }

  // size(各轴≤2dp)
  if (fb !== null && !excluded('size')) {
    executed++;
    const dw = Math.abs(fb.width - sem.sizeDp.width);
    const dh = Math.abs(fb.height - sem.sizeDp.height);
    if (dw > TOL_POS_DP || dh > TOL_POS_DP) {
      add('size', `${fb.width}x${fb.height}`, `${sem.sizeDp.width}x${sem.sizeDp.height}`, 'high');
    }
  }

  // fontSize(≤0.5sp,不换算)
  if (p.figma.style?.fontSize !== undefined && sem.fontSizeSp !== null && !excluded('fontSize')) {
    executed++;
    if (Math.abs(p.figma.style.fontSize - sem.fontSizeSp) > TOL_FONT_SP) {
      add('fontSize', `${p.figma.style.fontSize}sp`, `${sem.fontSizeSp}sp`, 'high');
    }
  }

  // color:文本节点语义通道;非文本叶子像素通道(T2.7);其余值不可得跳过。excluded('color') 时两分支均跳过。
  const firstFill = p.figma.fills?.[0];
  if (!excluded('color') && firstFill?.color !== undefined && sem.colorHex !== null) {
    executed++;
    const figHex = rgbToHex(firstFill.color);
    if (ciede2000(figHex, sem.colorHex) >= TOL_DELTA_E) add('color', figHex, sem.colorHex, 'high');
  } else if (!excluded('color') && sem.colorHex === null && (p.figma.fills?.length ?? 0) > 0 && pixel !== undefined) {
    const skip = (code: PixelDiagnostic['code'], detail: string): void => {
      diagnostics.push({ code, testTag, detail });
    };
    if (firstFill?.type !== 'SOLID' || firstFill.color === undefined) {
      skip('pixel_sample_skipped_nonsolid', `首 fill ${firstFill?.type ?? '?'} 非纯色`);
    } else if (sem.children.length > 0) {
      skip('pixel_sample_skipped_container', '容器子像素污染');
    } else {
      const d = pixel.density;
      const sampled = samplePixelColor(pixel.png,
        { x: sem.positionDp.x * d, y: sem.positionDp.y * d, width: sem.sizeDp.width * d, height: sem.sizeDp.height * d },
        { insetRatio: pixel.insetRatio ?? DEFAULT_INSET_RATIO });
      if (sampled === null) skip('pixel_sample_empty_region', '采样区为空(越界)');
      else {
        executed++;
        const figHex = rgbToHex(firstFill.color);
        if (ciede2000(figHex, sampled.hex) >= TOL_DELTA_E) {
          violations.push({ judgePath: 'parity-pixel-sampled', testTag, figmaName,
            property: 'color', expected: figHex, actual: sampled.hex, severity: 'high', hint: '' });
        }
      }
    }
  }

  // cornerRadius(0.5dp 网格;sem 恒 null 时跳过)
  if (p.figma.cornerRadius !== undefined && sem.cornerRadiusDp !== null && !excluded('cornerRadius')) {
    executed++;
    if (!gridEqual(p.figma.cornerRadius, sem.cornerRadiusDp)) {
      add('cornerRadius', `${p.figma.cornerRadius}`, `${sem.cornerRadiusDp}`, 'medium');
    }
  }

  // padding*(容器 pair:首/末子相对父边距)
  const kids = sortedChildren(sem);
  const first = kids[0];
  const last = kids[kids.length - 1];
  if (first !== undefined && last !== undefined) {
    const parentRight = sem.positionDp.x + sem.sizeDp.width;
    const parentBottom = sem.positionDp.y + sem.sizeDp.height;
    const derived: Record<'paddingLeft' | 'paddingTop' | 'paddingRight' | 'paddingBottom', number> = {
      paddingLeft: first.positionDp.x - sem.positionDp.x,
      paddingTop: first.positionDp.y - sem.positionDp.y,
      paddingRight: parentRight - (last.positionDp.x + last.sizeDp.width),
      paddingBottom: parentBottom - (last.positionDp.y + last.sizeDp.height),
    };
    const figPad: Record<keyof typeof derived, number | undefined> = {
      paddingLeft: p.figma.paddingLeft, paddingTop: p.figma.paddingTop,
      paddingRight: p.figma.paddingRight, paddingBottom: p.figma.paddingBottom,
    };
    for (const key of Object.keys(derived) as Array<keyof typeof derived>) {
      const fig = figPad[key];
      if (fig !== undefined && !excluded(key)) {
        executed++;
        if (!gridEqual(fig, derived[key])) add(key, `${fig}`, `${derived[key]}`, 'medium');
      }
    }
  }

  // itemSpacing(相邻子间距,需 ≥2 子)
  if (p.figma.itemSpacing !== undefined && kids.length >= 2 && !excluded('itemSpacing')) {
    const a = kids[0];
    const b = kids[1];
    if (a !== undefined && b !== undefined) {
      executed++;
      const derived = b.positionDp.y - (a.positionDp.y + a.sizeDp.height);
      if (!gridEqual(p.figma.itemSpacing, derived)) {
        add('itemSpacing', `${p.figma.itemSpacing}`, `${derived}`, 'medium');
      }
    }
  }

  return { violations, executed, diagnostics };
}

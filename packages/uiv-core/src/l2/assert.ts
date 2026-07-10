/**
 * L2-parity 逐属性断言(T1.3 Step 6,设计文档 2.4 节)。
 * 执行口径:每属性仅当双侧值均可得才执行并计入 executed;
 *   position L1 距离≤2dp(high)、size 各轴≤2dp(high)、fontSize ≤0.5sp(high)、
 *   color CIEDE2000 ΔE<3(high)、cornerRadius 0.5dp 网格(medium)、
 *   padding 与 itemSpacing 仅容器 pair、语义侧派生自子节点、0.5dp 网格(medium),
 *   须先过双门:A′ 身份双射(Codex D1)+ 设计侧可推导性(R1-①),任一不过保守跳过记 diagnostic。
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

/**
 * A′ 结构可判定门(Codex D1):语义直接子节点 ↔ Figma 可见直接子节点的一对一身份双射。
 * 身份映射取语义子节点自身的 fig:<nodeId> tag(不依赖数组顺序、不依赖 bbox 猜测);
 * 任一语义子未挂 tag / tag 重复 / tag 不指向 Figma 可见直接子 / Figma 侧 id 重复(R2-②)/
 * 两侧数量不等 → 双射不成立返回 null(fail-closed)。
 * 成立时按 Figma 直接子节点文档顺序返回已映射语义子节点(B2:优于坐标排序,可处理负 spacing/重叠;不改入参)。
 */
function mapDirectChildren(semKids: readonly SemDp[], figKids: readonly FigmaNode[]): SemDp[] | null {
  if (semKids.length !== figKids.length) return null;
  const semByFigId = new Map<string, SemDp>();
  for (const k of semKids) {
    if (k.testTag === null || !k.testTag.startsWith('fig:')) return null;
    const id = k.testTag.slice(4);
    if (semByFigId.has(id)) return null;                       // 非单射
    semByFigId.set(id, k);
  }
  const ordered: SemDp[] = [];
  const seenFigIds = new Set<string>();
  for (const f of figKids) {
    if (seenFigIds.has(f.id)) return null;                     // R2-②:Figma 侧重复 id,同一 sem 子被复用非双射
    seenFigIds.add(f.id);
    const s = semByFigId.get(f.id);
    if (s === undefined) return null;                          // sem tag 未覆盖该 Figma 可见直接子
    ordered.push(s);
  }
  return ordered;
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

  // padding*/itemSpacing(容器 pair:语义侧派生自子节点几何)—— 双门制:
  // 门 1(Codex D1 A′):语义树会拍平未挂 tag 的中间容器与不产语义节点的 INSTANCE,直接子节点派生天然失真;
  //   仅当语义直接子节点与 Figma 可见直接子节点(bbox 非 null 且 visible!==false)身份双射成立时继续。
  // 门 2(R1-① 设计侧可推导性):见下方 designMismatch 区块。
  // 任一门不过即保守跳过并按容器合并 informational diagnostic(D2:不进 violations、不计 executed)。
  const semKids = sem.children;
  const figKids = (p.figma.children ?? []).filter((c) => c.absoluteBoundingBox !== null && c.visible !== false);
  const paddingKeys = ['paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom'] as const;
  const hasAuthoredPadding = paddingKeys.some((k) => p.figma[k] !== undefined && !excluded(k));
  const hasAuthoredSpacing = p.figma.itemSpacing !== undefined && !excluded('itemSpacing');
  // R2-①:任一侧达最小基数即入门 —— 数量不对称(如 Figma 1 子被拍平为 0 语义子)由双射门
  // fail-closed 记 diagnostic,不得在入口静默漏报;两侧都不足最小基数才视为天然不可观察。
  const wantPadding = hasAuthoredPadding && (semKids.length >= 1 || figKids.length >= 1);
  const wantSpacing = hasAuthoredSpacing && (semKids.length >= 2 || figKids.length >= 2);
  if (wantPadding || wantSpacing) {
    const skipDerived = (
      reason: NonNullable<PixelDiagnostic['reason']>, rules: NonNullable<PixelDiagnostic['rules']>,
    ): void => {
      diagnostics.push({
        code: 'l2_derived_geometry_skipped', testTag, nodeId: p.figma.id, reason, rules,
        semChildCount: semKids.length, figChildCount: figKids.length,
        detail: `派生几何断言跳过(${reason}):语义直接子 ${semKids.length} / Figma 可见直接子 ${figKids.length},规则 [${rules.join(',')}]`,
      });
    };
    const mapped = mapDirectChildren(semKids, figKids);
    if (mapped === null) {
      skipDerived('direct_child_correspondence_unproven', [
        ...(wantPadding ? ['padding' as const] : []), ...(wantSpacing ? ['itemSpacing' as const] : []),
      ]);
    } else {
      // R1-①(Codex):第二层"设计侧可推导性门"—— 同一套包络/相邻间隙 derivation 先跑在 Figma
      // direct-child bbox 上,design-derived ≈ authored(同 0.5dp 网格容差)才证明该规则在此拓扑下
      // 可由子几何重建,再拿 semantic-derived 与 authored 比;不可重建(counter-axis CENTER/MAX
      // 对齐、SPACE_BETWEEN 等分布式对齐)按规则粒度跳过并记 design_derivation_mismatch。
      // 门只消费设计数据 → 真实实现偏差(语义侧)不会被它转成 skip。
      // 门禁正确性遗留(P2,勿动 normalize):spec v0 未导出 layoutWrap 与 layoutPositioning ——
      // WRAP 容器 layoutMode 仍为 HORIZONTAL/VERTICAL 无法识别;ABSOLUTE 定位子节点无法从双射/
      // 推导门中过滤。两者当前由本门部分兜底(此类拓扑下 authored 值通常无法由子几何重建而保守跳过),
      // 非完备,待 spec 升版补采字段。
      const designMismatch: NonNullable<PixelDiagnostic['rules']> = [];
      if (wantPadding) {
        const firstFig = figKids[0]!.absoluteBoundingBox!;
        const lastFig = figKids[figKids.length - 1]!.absoluteBoundingBox!;
        // fb null 时 design-derived 不可得 → 全部 padding 规则不可证,保守跳过(不回退语义侧派生)。
        const designDerived: Record<(typeof paddingKeys)[number], number> | null = fb === null ? null : {
          paddingLeft: firstFig.x - fb.x,
          paddingTop: firstFig.y - fb.y,
          paddingRight: fb.x + fb.width - (lastFig.x + lastFig.width),
          paddingBottom: fb.y + fb.height - (lastFig.y + lastFig.height),
        };
        const first = mapped[0]!;
        const last = mapped[mapped.length - 1]!;
        const parentRight = sem.positionDp.x + sem.sizeDp.width;
        const parentBottom = sem.positionDp.y + sem.sizeDp.height;
        const semDerived: Record<(typeof paddingKeys)[number], number> = {
          paddingLeft: first.positionDp.x - sem.positionDp.x,
          paddingTop: first.positionDp.y - sem.positionDp.y,
          paddingRight: parentRight - (last.positionDp.x + last.sizeDp.width),
          paddingBottom: parentBottom - (last.positionDp.y + last.sizeDp.height),
        };
        for (const key of paddingKeys) {
          const authored = p.figma[key];
          if (authored === undefined || excluded(key)) continue;
          if (designDerived === null || !gridEqual(authored, designDerived[key])) {
            designMismatch.push(key);
            continue;
          }
          executed++;
          if (!gridEqual(authored, semDerived[key])) add(key, `${authored}`, `${semDerived[key]}`, 'medium');
        }
      }
      if (wantSpacing) {
        // B1/B2:轴向由 layoutMode 决定,undefined 不得默认 VERTICAL,保守跳过;
        // GRID/其余非 flow 拓扑保守跳过(先于设计侧门:无轴向则 design-derived 不可算)。
        const mode = p.figma.layoutMode;
        if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
          const fa = figKids[0]!.absoluteBoundingBox!;
          const fc = figKids[1]!.absoluteBoundingBox!;
          const designGap = mode === 'HORIZONTAL' ? fc.x - (fa.x + fa.width) : fc.y - (fa.y + fa.height);
          if (!gridEqual(p.figma.itemSpacing!, designGap)) {
            designMismatch.push('itemSpacing');   // SPACE_BETWEEN 等:authored gap 无法由子几何重建
          } else {
            const a = mapped[0]!;
            const b = mapped[1]!;
            executed++;
            const derived = mode === 'HORIZONTAL'
              ? b.positionDp.x - (a.positionDp.x + a.sizeDp.width)
              : b.positionDp.y - (a.positionDp.y + a.sizeDp.height);
            if (!gridEqual(p.figma.itemSpacing!, derived)) {
              add('itemSpacing', `${p.figma.itemSpacing}`, `${derived}`, 'medium');
            }
          }
        } else {
          skipDerived(mode === undefined ? 'layout_mode_missing' : 'unsupported_layout', ['itemSpacing']);
        }
      }
      if (designMismatch.length > 0) skipDerived('design_derivation_mismatch', designMismatch);
    }
  }

  return { violations, executed, diagnostics };
}

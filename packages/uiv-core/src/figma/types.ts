/**
 * Figma REST 归一化后的 spec 类型(T1.2 Step 2)。
 * 坐标口径:bbox 已减根 frame 绝对原点;1 Figma 单位 = 1dp(T1.0a 标定)。
 */
export interface Rect { x: number; y: number; w: number; h: number }

export interface SpecNode {
  id: string; name: string; type: string; visible: boolean;
  bbox: Rect | null;                 // 已减根 frame 绝对原点;1 Figma 单位=1dp(T1.0a)
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  padding: { l: number; t: number; r: number; b: number };
  itemSpacing: number;
  cornerRadii: [number, number, number, number] | null;
  fills: Array<{ type: string; hex: string | null; opacity: number }>;
  text: { characters: string; fontSize: number; fontWeight: number;
          overrides: Array<{ start: number; end: number; style: Record<string, unknown> }> } | null;
  children: SpecNode[];
}

export interface Spec { specVersion: 0; fileKey: string; nodeId: string; version: string; root: SpecNode }

export class FigmaSpecInvalidError extends Error {}

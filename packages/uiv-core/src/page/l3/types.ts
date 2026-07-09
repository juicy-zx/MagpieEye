/** T4.2:L3 量规 7 项(设计文档 2.7 固定序:元素齐全→层级嵌套→几何间距→字号字重→颜色→圆角阴影→自适应)。 */
export const RUBRIC_ITEMS = ['elements_complete', 'hierarchy', 'spacing',
  'typography', 'color', 'corner_shadow', 'adaptive'] as const;
export type L3RubricItem = (typeof RUBRIC_ITEMS)[number];
export interface L3Evidence { cellId: string; x: number; y: number; w: number; h: number }  // px,须锚定输入包簇
export interface L3Verdict {
  item: L3RubricItem;
  verdict: 'pass' | 'fail' | 'uncertain';
  evidence: L3Evidence[];                     // fail/uncertain 必非空(证据锚定)
  severity: 'high' | 'medium' | 'low' | null; // fail ⇒ 非 null
  suggestion: string | null;                  // fail ⇒ 非空 string
}

export interface VariableResolver { readonly source: string; resolve(name: string): string | undefined }

export function resolveVariable(name: string, chain: VariableResolver[]): { name: string; value: string | null; source: string; unresolved: boolean } {
  for (const r of chain) {
    const value = r.resolve(name);
    if (value !== undefined) return { name, value, source: r.source, unresolved: false };
  }
  return { name, value: null, source: 'unresolved', unresolved: true };
}

export const mcpVariableDefs = (defs: Record<string, string>): VariableResolver =>
  ({ source: 'mcp-variable-defs', resolve: (n) => defs[n] });

type RGB = { r: number; g: number; b: number };
type RawN = { styles?: Record<string, string>; children?: RawN[]; fills?: Array<{ type?: string; color?: RGB }> };
const hex = (c: RGB) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase()).join('')}`;

export class StylesMappingResolver implements VariableResolver {
  readonly source = 'styles-mapping';
  private map = new Map<string, string>();
  constructor(raw: unknown) {
    const nodes = (raw as { nodes?: Record<string, { document?: RawN; styles?: Record<string, { name?: string }> }> }).nodes ?? {};
    for (const e of Object.values(nodes)) if (e.document) this.walk(e.document, e.styles ?? {});
  }
  private walk(n: RawN, table: Record<string, { name?: string }>): void {
    const name = n.styles?.fill ? table[n.styles.fill]?.name : undefined;
    const solid = n.fills?.find((f) => f.type === 'SOLID' && f.color);
    if (name && solid?.color) this.map.set(name, hex(solid.color));
    for (const c of n.children ?? []) this.walk(c, table);
  }
  resolve(n: string) { return this.map.get(n); }
}

export class TokensStudioJsonResolver implements VariableResolver {
  readonly source = 'tokens-studio-json';
  private map = new Map<string, string>();
  constructor(json: unknown) { this.flatten(json as Record<string, unknown>, []); }
  private flatten(node: Record<string, unknown>, path: string[]): void {
    if (node == null || typeof node !== 'object') return;
    const v = node.value;
    if (v !== undefined && typeof v !== 'object') {
      const put = (k: string) => { this.map.set(k, String(v)); this.map.set(k.replaceAll('.', '/'), String(v)); };
      put(path.join('.'));
      if (path.length > 1) put(path.slice(1).join('.'));   // 去 set 前缀别名
      return;
    }
    for (const [k, c] of Object.entries(node)) this.flatten(c as Record<string, unknown>, [...path, k]);
  }
  resolve(n: string) { return this.map.get(n); }
}

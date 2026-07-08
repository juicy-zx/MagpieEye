import { expect, it } from 'vitest';
import { StylesMappingResolver, TokensStudioJsonResolver, mcpVariableDefs, resolveVariable } from './variables.js';

const stylesRaw = { nodes: { '1:100': { document: { styles: { fill: 'S:a' },
  children: [{ styles: { fill: 'S:b' },
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 } }] }] },
  styles: { 'S:b': { name: 'color/swatch' } } } } };
const tokensJson = { global: { color: { accent: { value: '#FF9900' } } } };
const chain = (defs: Record<string, string> = {}) =>
  [mcpVariableDefs(defs), new StylesMappingResolver(stylesRaw), new TokensStudioJsonResolver(tokensJson)];

it('①级 MCP defs(agent 注入)命中即止', () => {
  const r = resolveVariable('color/swatch', chain({ 'color/swatch': '#112233' }));
  expect([r.value, r.source]).toEqual(['#112233', 'mcp-variable-defs']);
});
it('②级 styles 映射解出 hex(子树)', () => {
  const r = resolveVariable('color/swatch', chain());
  expect([r.value, r.source]).toEqual(['#FF9900', 'styles-mapping']);
});
it('③级 Tokens Studio:去 set 前缀+/.双键', () => {
  const r = resolveVariable('color/accent', chain());
  expect([r.value, r.source]).toEqual(['#FF9900', 'tokens-studio-json']);
});
it('全降级:token 名原样保留 + unresolved', () => {
  expect(resolveVariable('radius/card', chain()))
    .toEqual({ name: 'radius/card', value: null, source: 'unresolved', unresolved: true });
});

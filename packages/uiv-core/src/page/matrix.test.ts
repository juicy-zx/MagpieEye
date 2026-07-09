import { describe, expect, it } from 'vitest';
import { expandMatrix } from './matrix.js';

describe('expandMatrix', () => {
  it('l-shape:base×全态 + 全设备×typical + 三交叉,去重;格数=4+4+3', () => {
    const cells = expandMatrix('l-shape', ['typical', 'empty', 'longText', 'error']);
    expect(cells).toHaveLength(11);
    const ids = cells.map((c) => c.cellId);
    expect(new Set(ids).size).toBe(11);
    for (const id of ['fontScale1.3__longText', 'smallPhone__longText', 'pixel5-dark__error']) {
      expect(ids).toContain(id);                                          // 三交叉格
    }
    expect(cells.every((c) => c.qualifiers.includes('xhdpi'))).toBe(true); // 密度门:恒 2.0
  });
  it('typical 恒隐含;交叉仅当态在列;full=笛卡尔;custom 解析;未知报错', () => {
    expect(expandMatrix('l-shape', [])).toHaveLength(5);       // 无 longText/error → 无交叉
    expect(expandMatrix('full', ['longText'])).toHaveLength(10);
    expect(expandMatrix('custom:base/typical,pixel5-dark/typical', []).map((x) => x.cellId))
      .toEqual(['base__typical', 'pixel5-dark__typical']);
    expect(() => expandMatrix('custom:foo/typical', [])).toThrow(/unknown device/);
    expect(() => expandMatrix('diagonal', [])).toThrow(/unknown matrix/);
  });
});

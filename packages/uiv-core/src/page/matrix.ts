/** T3.3:设备 5 格 × 内容态矩阵展开(3.2/3.3)。全格恒 xhdpi(密度门 2.0),见口径①。 */
export const DEVICES = ['base', 'pixel5-dark', 'fontScale1.3', 'smallPhone', 'tablet'] as const;
export type Device = (typeof DEVICES)[number];
export const DEVICE_QUALIFIERS: Record<Device, string> = {
  'base': 'w360dp-h800dp-xhdpi', 'pixel5-dark': 'w360dp-h800dp-night-xhdpi',
  'fontScale1.3': 'w360dp-h800dp-xhdpi', 'smallPhone': 'w320dp-h640dp-xhdpi',
  'tablet': 'w800dp-h1280dp-xhdpi',
};
/** 三显式高频翻车交叉点(dark×error 的 dark 即 pixel5-dark 格)。 */
export const CROSSINGS: ReadonlyArray<readonly [Device, string]> = [
  ['fontScale1.3', 'longText'], ['smallPhone', 'longText'], ['pixel5-dark', 'error'],
];
export interface Cell { cellId: string; device: Device; state: string; qualifiers: string }
const mk = (device: Device, state: string): Cell =>
  ({ cellId: `${device}__${state}`, device, state, qualifiers: DEVICE_QUALIFIERS[device] });

export function expandMatrix(matrix: string, statesIn: readonly string[]): Cell[] {
  const states = [...new Set(['typical', ...statesIn])];        // typical 恒隐含(基准态本身)
  let cells: Cell[];
  if (matrix === 'l-shape') {
    cells = [
      ...states.map((s) => mk('base', s)),
      ...DEVICES.map((d) => mk(d, 'typical')),
      ...CROSSINGS.filter(([, s]) => states.includes(s)).map(([d, s]) => mk(d, s)),
    ];
  } else if (matrix === 'full') {
    cells = DEVICES.flatMap((d) => states.map((s) => mk(d, s)));
  } else if (matrix.startsWith('custom:')) {
    cells = matrix.slice('custom:'.length).split(',').map((pair) => {
      const [d, s] = pair.split('/');
      if (d === undefined || s === undefined || s === '') throw new Error(`bad custom cell: ${pair}`);
      if (!(DEVICES as readonly string[]).includes(d)) throw new Error(`unknown device: ${d}`);
      return mk(d as Device, s);
    });
  } else { throw new Error(`unknown matrix: ${matrix}`); }
  const seen = new Set<string>();
  return cells.filter((c) => !seen.has(c.cellId) && (seen.add(c.cellId), true));
}

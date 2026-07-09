/**
 * commands.ts 纯抽取冒烟:三段编排从 index.ts 原样搬移,行为不变。回归护栏以既有
 * exit-timing.test.ts(冷道 check e2e)/check-version.test.ts(--version 转发)为闸;本测仅冒烟
 * runBaselinePullCommand 的 cwd 注入与结构化返回(复用 baseline/pull 既有 fixture 套路)。
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runBaselinePullCommand } from './commands.js';

const FIXTURE = fileURLToPath(new URL('../../uiv-core/fixtures/rest-nodes-card.json', import.meta.url));

describe('runBaselinePullCommand(cwd 注入冒烟)', () => {
  it('fixture 驱动 → spec.json 落 <cwd>/.ui-verify/baselines/<nodeDir>,结构化返回', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'uiv-cmd-'));
    const r = await runBaselinePullCommand({ fixture: FIXTURE, file: 'FKEY', node: '1:100' }, cwd);
    expect(existsSync(r.specPath)).toBe(true);
    expect(basename(dirname(r.specPath))).toBe('1-100@T1_0A_V1');
    expect(r.baselinePngExists).toBe(false);   // fixture 无 PNG,只探测不阻断
    expect(basename(r.baselinePngPath)).toBe('baseline.png');
    const spec = JSON.parse(readFileSync(r.specPath, 'utf8')) as { root: { bbox: { w: number } } };
    expect(spec.root.bbox.w).toBe(360);
  });
});

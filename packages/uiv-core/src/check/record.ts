/** T2.6:check 全过后录 golden。pass=false 拒绝,CLI 映射 exit 3(防录坏 golden)。 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GradleRunner } from './run.js';
export class RecordRefusedError extends Error {}
export async function runRecord(runner: GradleRunner, opts: { demoDir: string; testFqn: string }, checkPassed: boolean): Promise<{ goldenPath: string }> {
  if (!checkPassed) throw new RecordRefusedError('--record refused: check pass=false');
  const short = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '');
  const goldenPath = join(opts.demoDir, 'app', 'src', 'test', 'snapshots', `${short}.png`);
  const { exitCode, stderr } = await runner.run(opts.demoDir, ['testDebugUnitTest', '--tests', opts.testFqn, '-Proborazzi.test.record=true', '--rerun']);
  if (exitCode !== 0) throw new Error(`record gradle failed (exit ${exitCode}): ${stderr.slice(-400)}`);
  if (!existsSync(goldenPath)) throw new Error(`golden not found after record: ${goldenPath}`);
  return { goldenPath };
}

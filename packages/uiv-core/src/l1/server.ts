/** T2.2:odiff 常驻 server 门面。懒拉起单例,失败当次降级 spawn;退出策略见子计划章。 */
import { ODiffServer, compare } from 'odiff-bin';
import type { ODiffOptions, ODiffResult } from 'odiff-bin';

export type OdiffMode = 'server' | 'spawn';
let srv: ODiffServer | null = null;
let bin: string | undefined;
process.on('exit', () => srv?.stop());   // 兜底
export function _setOdiffBinary(p: string | undefined): void { bin = p; stopOdiffServer(); }
export function stopOdiffServer(): void { srv?.stop(); srv = null; }

export async function odiffCompare(base: string, cmp: string, out: string, opts: ODiffOptions,
    mode: OdiffMode = process.env.UIV_ODIFF === 'spawn' ? 'spawn' : 'server'): Promise<ODiffResult> {
  if (mode === 'server') {
    try {
      if (srv === null) srv = new ODiffServer(bin);
      return await srv.compare(base, cmp, out, { ...opts, timeout: 15_000 });
    } catch (e) {
      console.warn(`uiv: odiff server fallback to spawn: ${(e as Error).message}`);
      stopOdiffServer();
    }
  }
  return compare(base, cmp, out, opts);
}

/** T2.2:odiff 常驻 server 门面。懒拉起单例,失败当次降级 spawn;退出策略见子计划章。 */
import type { ChildProcess } from 'node:child_process';
import { ODiffServer, compare } from 'odiff-bin';
import type { ODiffOptions, ODiffResult } from 'odiff-bin';

export type OdiffMode = 'server' | 'spawn';
let srv: ODiffServer | null = null;
let bin: string | undefined;
process.on('exit', () => srv?.stop());   // 兜底
export function _setOdiffBinary(p: string | undefined): void { bin = p; stopOdiffServer(); }

const ODIFF_EXIT_NOISE = 'odiff server exited unexpectedly';

/**
 * 批次⑤欠1:odiff-bin 的 ODiffServer.stop()(node_modules/odiff-bin/server.js)有已知竞态——
 * kill() 后 `exiting` 标志被同步复位为 false,而子进程真正的 'exit' 事件是异步触发的,
 * 触发时读到的 `exiting` 已经是 false,导致每次主动关停都会误打
 * "odiff server exited unexpectedly with code null"(实测:stop() 返回后 <5ms 内触发)。
 * 该行为在第三方依赖内部,不落 packages/** 源码,这里在我们主动 stop() 的窗口内临时过滤
 * 这一条已知噪声,子进程真正退出(我们自己的 exit 监听器,注册顺序晚于库内部监听器,
 * 保证在其 console.warn 之后触发)后立即还原 console.warn——不影响任何其它告警,
 * 也不影响真正意外退出(未经本函数发起的崩溃)时的告警,因为那种路径根本不会安装这层过滤。
 */
export function stopOdiffServer(): void {
  const s = srv;
  srv = null;
  if (s === null) return;
  const child = (s as unknown as { process: ChildProcess | null }).process;
  if (!child) { s.stop(); return; }
  const originalWarn = console.warn;
  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    console.warn = originalWarn;
  };
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith(ODIFF_EXIT_NOISE)) return;
    originalWarn(...args);
  };
  child.once('exit', restore);
  setTimeout(restore, 2000).unref();
  s.stop();
}

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

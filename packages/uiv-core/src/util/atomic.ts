/**
 * P0-9 原子写(alpha)。所有持久落盘 = 写同目录临时文件 → 同文件系统原子 rename 覆盖。
 * 目的:进程 writeFile/copyFile 中途被 kill 时,目标持久文件始终是【可解析的旧版或新版】,
 * 永不残缺半写(rename 是内核级原子操作,截断只发生在临时文件上,永不触及目标)。
 * 约束:临时文件必须与目标同目录(同文件系统),rename 方为原子;调用方须先建好目标目录。
 */
import { copyFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

let counter = 0;

/** 同目录唯一临时名(pid+进程内自增计数),后缀 .uivtmp 便于 .gitignore 兜底与非产物辨识。 */
function tempPath(dest: string): string {
  counter += 1;
  return `${dest}.${process.pid}.${counter}.uivtmp`;
}

/** 原子写:writeFileSync(临时) → renameSync(覆盖目标)。失败清理临时文件后原样抛出。 */
export function atomicWriteFileSync(filePath: string, data: string | Uint8Array, encoding?: BufferEncoding): void {
  const tmp = tempPath(filePath);
  try {
    if (encoding !== undefined) writeFileSync(tmp, data, encoding);
    else writeFileSync(tmp, data);
    renameSync(tmp, filePath);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** 原子复制:copyFileSync(源→临时) → renameSync(覆盖目标)。目标同 atomic 语义,永不半写。 */
export function atomicCopyFileSync(src: string, dest: string): void {
  const tmp = tempPath(dest);
  try {
    copyFileSync(src, tmp);
    renameSync(tmp, dest);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

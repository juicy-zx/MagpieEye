/**
 * P0-9 原子写单测:临时文件 + rename 语义,以及"失败即旧版完好、永不半写"的原子性质。
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicCopyFileSync, atomicWriteFileSync } from './atomic.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'uiv-atomic-')); });
afterEach(() => { try { chmodSync(dir, 0o755); } catch { /* noop */ } rmSync(dir, { recursive: true, force: true }); });

describe('atomicWriteFileSync', () => {
  it('写入新文件(utf8 字符串)', () => {
    const p = join(dir, 'a.json');
    atomicWriteFileSync(p, '{"x":1}\n', 'utf8');
    expect(readFileSync(p, 'utf8')).toBe('{"x":1}\n');
  });

  it('覆盖既有文件为新版', () => {
    const p = join(dir, 'a.json');
    writeFileSync(p, 'OLD', 'utf8');
    atomicWriteFileSync(p, 'NEW', 'utf8');
    expect(readFileSync(p, 'utf8')).toBe('NEW');
  });

  it('写入二进制(Uint8Array,无 encoding)', () => {
    const p = join(dir, 'b.bin');
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    atomicWriteFileSync(p, buf);
    expect(new Uint8Array(readFileSync(p))).toEqual(buf);
  });

  it('成功写后目录不残留 .uivtmp 临时文件', () => {
    const p = join(dir, 'a.json');
    atomicWriteFileSync(p, 'x', 'utf8');
    expect(readdirSync(dir).filter((n) => n.endsWith('.uivtmp'))).toEqual([]);
    expect(readdirSync(dir)).toEqual(['a.json']);
  });

  it('原子性质:写入失败时既有旧版完好无损、不残缺(临时写 EACCES 模拟中途夭折)', () => {
    const p = join(dir, 'a.json');
    writeFileSync(p, 'OLD-INTACT', 'utf8');
    chmodSync(dir, 0o555);   // 目录只读:临时文件 writeFileSync 必 EACCES(= kill 于 rename 前)
    expect(() => atomicWriteFileSync(p, 'NEW-SHOULD-NOT-APPEAR', 'utf8')).toThrow();
    chmodSync(dir, 0o755);
    // 目标从未被直接写,仍是完整旧版(可解析);不存在半写 NEW,也无临时残留
    expect(readFileSync(p, 'utf8')).toBe('OLD-INTACT');
    expect(readdirSync(dir).filter((n) => n.endsWith('.uivtmp'))).toEqual([]);
  });
});

describe('atomicCopyFileSync', () => {
  it('复制内容到目标,无临时残留', () => {
    const src = join(dir, 'src.png');
    const dest = join(dir, 'dest.png');
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    writeFileSync(src, bytes);
    atomicCopyFileSync(src, dest);
    expect(new Uint8Array(readFileSync(dest))).toEqual(bytes);
    expect(readdirSync(dir).filter((n) => n.endsWith('.uivtmp'))).toEqual([]);
  });

  it('原子性质:复制失败时既有旧目标完好', () => {
    const src = join(dir, 'src.png');
    const dest = join(dir, 'dest.png');
    writeFileSync(src, new Uint8Array([9, 9, 9]));
    writeFileSync(dest, 'OLD-DEST', 'utf8');
    chmodSync(dir, 0o555);
    expect(() => atomicCopyFileSync(src, dest)).toThrow();
    chmodSync(dir, 0o755);
    expect(readFileSync(dest, 'utf8')).toBe('OLD-DEST');
    expect(existsSync(join(dir, 'dest.png'))).toBe(true);
  });
});

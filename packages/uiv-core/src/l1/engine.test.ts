import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { runL1 } from './engine.js';
import { _setOdiffBinary, odiffCompare, stopOdiffServer } from './server.js';
import { addIgnoreRegion, loadIgnoreRegions } from './ignore.js';

let dir: string;
let basePng: string;
let samePng: string;
let diffPng: string;

/** 生成 64×64 纯白 PNG;withRedBlock 时左上 16×16 涂红。 */
function writeTestPng(path: string, withRedBlock: boolean): void {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const o = (y * 64 + x) * 4;
      const red = withRedBlock && x < 16 && y < 16;
      png.data[o] = 255;
      png.data[o + 1] = red ? 0 : 255;
      png.data[o + 2] = red ? 0 : 255;
      png.data[o + 3] = 255;
    }
  }
  writeFileSync(path, PNG.sync.write(png));
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'uiv-l1-'));
  basePng = join(dir, 'base.png');
  samePng = join(dir, 'same.png');
  diffPng = join(dir, 'diff.png');
  writeTestPng(basePng, false);
  writeTestPng(samePng, false);
  writeTestPng(diffPng, true);
});

describe('L1 engine (odiff + looks-same)', () => {
  it('相同图: diffCount=0 且无簇', async () => {
    const r = await runL1(basePng, samePng, join(dir, 'out-same.png'), []);
    expect(r.diffCount).toBe(0);
    expect(r.clusters.length).toBe(0);
  });
  it('不同图: 指标非零且首簇与差异区相交', async () => {
    const r = await runL1(basePng, diffPng, join(dir, 'out-diff.png'), []);
    expect(r.diffCount).toBeGreaterThan(0);
    expect(r.diffRatio).toBeGreaterThan(0);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    const c = r.clusters[0];
    // 与 (0,0,16,16) 相交
    expect(c.x < 16 && c.y < 16 && c.x + c.w > 0 && c.y + c.h > 0).toBe(true);
  });
  it('ignore 区域覆盖差异区: odiff 指标归零(looks-same 簇仍报,属 advisory)', async () => {
    const r = await runL1(basePng, diffPng, join(dir, 'out-ignored.png'), [{ x: 0, y: 0, w: 16, h: 16 }]);
    expect(r.diffCount).toBe(0);
  });
});

describe('ignore-regions 持久化', () => {
  it('addIgnoreRegion 两次 → loadIgnoreRegions 返回两条且 JSON 文件存在', () => {
    const uiVerifyDir = mkdtempSync(join(tmpdir(), 'uiv-ignore-'));
    addIgnoreRegion(uiVerifyDir, '1:100', { x: 0, y: 0, w: 16, h: 16 });
    addIgnoreRegion(uiVerifyDir, '1:100', { x: 32, y: 32, w: 8, h: 8 });
    const regions = loadIgnoreRegions(uiVerifyDir, '1:100');
    expect(regions).toHaveLength(2);
    expect(regions[1]).toEqual({ x: 32, y: 32, w: 8, h: 8 });
    expect(existsSync(join(uiVerifyDir, 'ignore-regions.json'))).toBe(true);
  });
  it('文件不存在时 loadIgnoreRegions 返回空表', () => {
    const uiVerifyDir = mkdtempSync(join(tmpdir(), 'uiv-ignore-empty-'));
    expect(loadIgnoreRegions(uiVerifyDir, '1:100')).toEqual([]);
  });
});

it('T2.2: server=spawn 一致(含 ignoreRegions);坏二进制降级', async () => {
  for (const ig of [[], [{ x: 0, y: 0, w: 16, h: 16 }]]) {
    const a = await runL1(basePng, diffPng, join(dir, `sv${ig.length}.png`), ig, 'server');
    expect(a).toEqual(await runL1(basePng, diffPng, join(dir, `sp${ig.length}.png`), ig, 'spawn'));
  }
  stopOdiffServer();
  _setOdiffBinary('/nonexistent/odiff');
  expect((await runL1(basePng, diffPng, join(dir, 'fb.png'), [], 'server')).diffCount).toBeGreaterThan(0);
  _setOdiffBinary(undefined);
});

// T2.2 补充:上一测试未覆盖 UIV_ODIFF=spawn 这条退出/降级策略——验证设了该环境变量时
// 直接跳过 server 分支(坏二进制也不触发 fallback warn),而非"先试 server 再降级"。
it('T2.2: UIV_ODIFF=spawn 环境变量强制降级,跳过 server 分支(不告警)', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const prevEnv = process.env.UIV_ODIFF;
  _setOdiffBinary('/nonexistent/odiff');
  process.env.UIV_ODIFF = 'spawn';
  try {
    const r = await runL1(basePng, diffPng, join(dir, 'forced-spawn.png'), []);
    expect(r.diffCount).toBeGreaterThan(0);
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    if (prevEnv === undefined) delete process.env.UIV_ODIFF; else process.env.UIV_ODIFF = prevEnv;
    _setOdiffBinary(undefined);
    warnSpy.mockRestore();
  }
});

// 批次⑤欠 1:odiff-bin 的 ODiffServer.stop() 在 kill() 后同步把 exiting 复位为 false,
// 而子进程真正的 'exit' 事件是异步触发的——等它触发时 exiting 早已是 false,导致主动关停
// 也会误打 "odiff server exited unexpectedly with code null"(yanhao 实证的 stderr 噪声源头)。
describe('odiff server 生命周期噪声(批次⑤欠1)', () => {
  it('主动 stopOdiffServer() 关停(正常收尾)不应打印"exited unexpectedly"噪声', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 真实起一次 server 模式比对,确保底层 ODiffServer 子进程已拉起
      await runL1(basePng, samePng, join(dir, 'noise-check.png'), [], 'server');
      stopOdiffServer();
      // 子进程 'exit' 事件异步触发,留出安全窗口等其发生(实测 <5ms 内触发)
      await new Promise((resolve) => setTimeout(resolve, 300));
      const noisy = warnSpy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('odiff server exited unexpectedly'),
      );
      expect(noisy).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('真异常退出(非主动 stop,子进程自行崩溃)仍应打印告警', async () => {
    const fakeDir = mkdtempSync(join(tmpdir(), 'uiv-odiff-fake-'));
    const fakeBin = join(fakeDir, 'fake-odiff-server.cjs');
    // 极简假 server:回应 ready 信号 + 一次合法响应,随后不经外部 stop() 自行退出(模拟真实崩溃)。
    writeFileSync(fakeBin, [
      '#!/usr/bin/env node',
      'process.stdout.write(JSON.stringify({ ready: true }) + "\\n");',
      'const readline = require("node:readline");',
      'const rl = readline.createInterface({ input: process.stdin });',
      'rl.on("line", (line) => {',
      '  const req = JSON.parse(line);',
      '  process.stdout.write(JSON.stringify({ requestId: req.requestId, match: true }) + "\\n");',
      '  setTimeout(() => process.exit(1), 20);',
      '});',
      '',
    ].join('\n'));
    chmodSync(fakeBin, 0o755);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    _setOdiffBinary(fakeBin);
    try {
      await odiffCompare(basePng, samePng, join(dir, 'crash-check.png'), {}, 'server');
      // 子进程崩溃退出的 'exit' 事件是异步触发的;整包测试并行跑时耗时会浮动,轮询等待而非
      // 固定 sleep,避免机器负载高时的假失败(超时上限 3s,足够远高于实测 <10ms 的正常耗时)。
      const deadline = Date.now() + 3000;
      let warned = false;
      while (Date.now() < deadline) {
        warned = warnSpy.mock.calls.some(
          (args) => typeof args[0] === 'string' && args[0].includes('odiff server exited unexpectedly'),
        );
        if (warned) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(warned).toBe(true);
    } finally {
      _setOdiffBinary(undefined);
      warnSpy.mockRestore();
    }
  });
});

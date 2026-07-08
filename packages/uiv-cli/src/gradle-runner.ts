/**
 * T2.1:uiv 双车道 gradle runner。
 * 冷路径 = 既有 SpawnGradleRunner 原样迁移(前插 extraArgs,如 --no-daemon);
 * 热路径 = UdsGradleRunner 薄 UDS 客户端(不碰 Gradle,由 daemon 内 Tooling API 执行);
 * selectGradleRunner 仅在选路时刻降级(sock 缺失 / 500ms ping 失败 → cold);选定后故障如实上抛。
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import type { GradleRunner } from '@magpie-eye/uiv-core';

/** 生产 gradle 层:spawn ./gradlew,GRADLE_USER_HOME 钉在 demo 工程内(与 T1.1 约定一致)。 */
export class SpawnGradleRunner implements GradleRunner {
  constructor(readonly extraArgs: string[] = []) {}

  run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('./gradlew', [...this.extraArgs, ...args], {
        cwd,
        env: { ...process.env, GRADLE_USER_HOME: path.join(cwd, '.gradle-home') },
      });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ exitCode: code ?? 1, stderr }));
    });
  }
}

/** 单请求单连接:写一行 JSON,读到首个 \n 即完成;超时/错误按约定 reject。 */
export function request(sockPath: string, req: { id: string; cmd: string; args: object }, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = connect(sockPath);
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`daemon timeout ${timeoutMs}ms`)); }, timeoutMs);
    sock.on('error', (e) => { clearTimeout(timer); sock.destroy(); reject(e); });
    sock.on('connect', () => { sock.write(`${JSON.stringify(req)}\n`); });
    sock.on('data', (d: Buffer) => {
      buf += d.toString();
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      sock.end();
      const res = JSON.parse(buf.slice(0, nl)) as { ok: boolean; payload?: unknown; error?: string };
      if (!res.ok) { reject(new Error(`daemon error: ${res.error ?? 'unknown'}`)); return; }
      resolve(res.payload);
    });
  });
}

/** 热路径 runner:UDS 薄客户端,gradle.run 透传 cwd/args,payload 校验后原样返回。 */
export class UdsGradleRunner implements GradleRunner {
  constructor(private readonly sockPath: string) {}

  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    const payload = await request(this.sockPath, { id: randomUUID(), cmd: 'gradle.run', args: { cwd, args } }, 600_000);
    if (
      typeof payload !== 'object' || payload === null
      || typeof (payload as { exitCode?: unknown }).exitCode !== 'number'
      || typeof (payload as { stderr?: unknown }).stderr !== 'string'
    ) {
      throw new Error('daemon payload malformed');
    }
    return payload as { exitCode: number; stderr: string };
  }
}

/** 选路(降级只在此刻):sock 缺失/ping 失败 → cold(spawn --no-daemon,自给自足);ping 通 → hot。 */
export async function selectGradleRunner(
  uiVerifyDir: string,
): Promise<{ runner: GradleRunner; lane: 'hot' | 'cold'; reason: string }> {
  const sock = path.join(uiVerifyDir, 'daemon.sock');
  if (!existsSync(sock)) {
    return { runner: new SpawnGradleRunner(['--no-daemon']), lane: 'cold', reason: 'no sock' };
  }
  try {
    await request(sock, { id: randomUUID(), cmd: 'ping', args: {} }, 500);
    return { runner: new UdsGradleRunner(sock), lane: 'hot', reason: 'ping ok' };
  } catch (e) {
    return { runner: new SpawnGradleRunner(['--no-daemon']), lane: 'cold', reason: `ping failed: ${(e as Error).message}` };
  }
}

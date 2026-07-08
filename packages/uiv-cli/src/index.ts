#!/usr/bin/env node
/**
 * uiv: 鹊眼薄验收客户端(T1.2 Step 9 接线;core 承载全部逻辑)。
 * 子命令:
 *   baseline pull --fixture <path> --file <fileKey> --node <nodeId>
 *   check --preview <PreviewFQN> --node <nodeId> --demo <dir> [--ignore-region x,y,w,h]
 * 约定:输出根 = cwd/.ui-verify;stdout 最后一行 = spec.json(pull)/report.json(check)绝对路径;
 * check 的 exit code = report.pass ? 0 : 1;pull 恒 0(baseline.png 缺失仅 WARN)。
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FixtureFigmaClient, UIV_CORE_VERSION, addIgnoreRegion, pullBaseline, runCheck,
} from '@magpie-eye/uiv-core';
import type { GradleRunner, MappingEntry } from '@magpie-eye/uiv-core';
import { CliUsageError, parseCliArgs, previewToTestFqn } from './args.js';

/** 生产 gradle 层:spawn ./gradlew,GRADLE_USER_HOME 钉在 demo 工程内(与 T1.1 约定一致)。 */
class SpawnGradleRunner implements GradleRunner {
  run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('./gradlew', args, {
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

/** check 的 version 取自 mapping.json(baseline pull 的 upsert 产物,source of truth)。 */
async function readMappingEntry(uiVerifyDir: string, nodeId: string): Promise<MappingEntry> {
  const mappingPath = path.join(uiVerifyDir, 'mapping.json');
  let text: string;
  try {
    text = await readFile(mappingPath, 'utf8');
  } catch {
    throw new CliUsageError(`mapping.json not found at ${mappingPath}; run \`uiv baseline pull\` first`);
  }
  const entries = JSON.parse(text) as MappingEntry[];
  const entry = entries.find((e) => e.nodeId === nodeId);
  if (entry === undefined) {
    throw new CliUsageError(`node ${nodeId} not in mapping.json; run \`uiv baseline pull\` first`);
  }
  return entry;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--version') {
    console.log(`uiv ${UIV_CORE_VERSION}`);
    return;
  }

  const cmd = parseCliArgs(argv);
  const uiVerifyDir = path.resolve(process.cwd(), '.ui-verify');

  if (cmd.kind === 'baseline-pull') {
    const client = new FixtureFigmaClient(path.resolve(cmd.fixture));
    const r = await pullBaseline(client, cmd.file, cmd.node, uiVerifyDir);
    if (!r.baselinePngExists) {
      console.log(`WARN baseline.png missing: ${r.baselinePngPath}`);
    }
    console.log(r.specPath);   // 最后一行 = spec.json 绝对路径;pull 恒 exit 0
    return;
  }

  // check
  const testFqn = previewToTestFqn(cmd.preview);
  if (cmd.ignoreRegion !== null) {
    addIgnoreRegion(uiVerifyDir, cmd.node, cmd.ignoreRegion);   // 先持久化再执行
  }
  const entry = await readMappingEntry(uiVerifyDir, cmd.node);
  const { report, reportPath } = await runCheck(new SpawnGradleRunner(), {
    demoDir: path.resolve(cmd.demo),
    testFqn,
    nodeId: cmd.node,
    version: entry.version,
    uiVerifyDir,
  });
  console.log(reportPath);   // 最后一行 = report.json 绝对路径
  process.exitCode = report.pass ? 0 : 1;
}

main().catch((e: unknown) => {
  if (e instanceof CliUsageError) {
    console.error(`uiv: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(e);
  process.exitCode = 2;
});

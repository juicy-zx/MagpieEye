#!/usr/bin/env node
/**
 * uiv: 鹊眼薄验收客户端(T1.2 Step 9 接线;core 承载全部逻辑)。
 * 子命令:
 *   baseline pull --fixture <path> --file <fileKey> --node <nodeId>
 *   check --preview <PreviewFQN> --node <nodeId> --demo <dir> [--ignore-region x,y,w,h] [--record]
 * 约定:输出根 = cwd/.ui-verify;stdout 最后一行 = spec.json(pull)/report.json(check)绝对路径;
 * check 的 exit code = report.pass ? 0 : 1(D-07(c):以 L2 report 为准,L1 advisory 失败不污染);
 * --record 在 check pass=false 时拒录 → exit 3;pull 恒 0(baseline.png 缺失仅 WARN);其余异常 exit 2。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FixtureFigmaClient, UIV_CORE_VERSION, addIgnoreRegion, pullBaseline, runCheckL2,
} from '@magpie-eye/uiv-core';
import type { MappingEntry } from '@magpie-eye/uiv-core';
import { RecordRefusedError, runRecord } from '@magpie-eye/uiv-core/check/record.js';
import { stopOdiffServer } from '@magpie-eye/uiv-core/l1/server.js';
import { CliUsageError, parseCliArgs, previewToTestFqn } from './args.js';
import { selectGradleRunner } from './gradle-runner.js';

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
  const sel = await selectGradleRunner(uiVerifyDir);
  console.error(`uiv: gradle lane=${sel.lane} (${sel.reason})`);
  const runner = sel.runner;
  try {
    const { report, reportPath } = await runCheckL2(runner, {
      demoDir: path.resolve(cmd.demo),
      testFqn,
      nodeId: cmd.node,
      version: entry.version,
      uiVerifyDir,
      minScore: entry.minScore,
    });
    process.exitCode = report.pass ? 0 : 1;   // D-07(c): exit code 以 L2 report pass/fail 为准
    if (cmd.record) {
      const { goldenPath } = await runRecord(runner, { demoDir: path.resolve(cmd.demo), testFqn }, report.pass);
      console.log(`golden recorded: ${goldenPath}\nhint: git add ${goldenPath} && git commit`);
    }
    console.log(reportPath);   // 最后一行 = report.json v1 绝对路径
  } finally {
    // D-07(a): check 完成(含失败/异常)后释放 odiff server 子进程,防其 idle 悬挂拖住进程退出(实证 idle 7 分钟)。
    stopOdiffServer();
  }
}

main().catch((e: unknown) => {
  if (e instanceof RecordRefusedError) {
    console.error(`uiv: ${e.message}`);
    process.exitCode = 3;
    return;
  }
  if (e instanceof CliUsageError) {
    console.error(`uiv: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(e);
  process.exitCode = 2;
});

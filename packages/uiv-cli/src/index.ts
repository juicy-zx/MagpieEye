#!/usr/bin/env node
/**
 * uiv: 鹊眼薄验收客户端(T1.2 Step 9 接线;裁判逻辑在 core,三段命令编排在 commands.ts)。
 * 子命令:
 *   baseline pull --fixture <path> --file <fileKey> --node <nodeId>
 *   check --preview <PreviewFQN> --node <nodeId> --demo <dir> [--ignore-region x,y,w,h] [--record]
 *   pin --file <fileKey> --node <nodeId> --test <FQN> --demo <dir> [--source <doc>] [--state name=<nodeId>]... [--min-score <n>] [--matrix <m>] [--fixture <path>]
 * 约定:输出根 = cwd/.ui-verify;stdout 最后一行 = spec.json(pull)/report.json(check)绝对路径;
 * check 的 exit code = report.pass ? 0 : 1(D-07(c):以 L2 report 为准,L1 advisory 失败不污染);
 * --record 在 check pass=false 时拒录 → exit 3;pull 恒 0(baseline.png 缺失仅 WARN);其余异常 exit 2。
 * 本入口只负责 argv 解析 / IO 呈现(末行路径、--json、WARN 打印)/ exitCode / 退出治理;
 * check/verify-page/baseline-pull 的实际编排复用 commands.ts(与 MCP server 同源)。
 */
import path from 'node:path';
import {
  CachedFigmaClient, FixtureFigmaClient, RecordRefusedError, RestFigmaClient, UIV_CORE_VERSION,
  pinBaseline, runRecord,
} from '@magpie-eye/uiv-core';
import type { FigmaClient } from '@magpie-eye/uiv-core';
import { CliUsageError, parseCliArgs, previewToTestFqn } from './args.js';
import { selectGradleRunner } from './gradle-runner.js';
import { runBaselinePullCommand, runCheckCommand, runVerifyPageCommand } from './commands.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--version') {
    console.log(`uiv ${UIV_CORE_VERSION}`);
    return;
  }

  const cmd = parseCliArgs(argv);
  const cwd = process.cwd();
  const uiVerifyDir = path.resolve(cwd, '.ui-verify');

  if (cmd.kind === 'baseline-pull') {
    const r = await runBaselinePullCommand({ fixture: cmd.fixture, file: cmd.file, node: cmd.node }, cwd);
    if (!r.baselinePngExists) {
      console.log(`WARN baseline.png missing: ${r.baselinePngPath}`);
    }
    console.log(r.specPath);   // 最后一行 = spec.json 绝对路径;pull 恒 exit 0
    return;
  }

  if (cmd.kind === 'pin') {
    // 口径 4:--fixture→Fixture,否则 FIGMA_PAT→Rest,双缺→usage error(B1);统一经 CachedFigmaClient 缓存。
    let inner: FigmaClient;
    if (cmd.fixture !== null) inner = new FixtureFigmaClient(path.resolve(cmd.fixture));
    else if (process.env.FIGMA_PAT) inner = new RestFigmaClient();
    else throw new CliUsageError('pin needs --fixture or FIGMA_PAT (B1)');
    const client = new CachedFigmaClient(inner, path.resolve(process.cwd(), '.uiv-cache'));
    const sourceDoc = cmd.source ?? process.env.UIV_SOURCE_DOC;   // scope 来源:--source ?? UIV_SOURCE_DOC(loop 注入)
    const r = await pinBaseline(client, process.cwd(), {
      fileKey: cmd.file,
      nodeId: cmd.node,
      testFqn: cmd.test,
      demoDir: cmd.demo,
      explicitStates: cmd.states,
      ...(sourceDoc !== undefined ? { sourceDoc } : {}),
      ...(cmd.minScore !== null ? { minScore: cmd.minScore } : {}),
      ...(cmd.matrix !== null ? { matrix: cmd.matrix } : {}),
    });
    for (const p of r.pulled) {
      if (!p.baselinePngExists) console.log(`WARN baseline.png missing: ${path.dirname(p.specPath)}`);
    }
    for (const w of r.warnings) console.error(`WARN ${w}`);
    console.error(r.repersistRequested
      ? 'uiv: re-persist requested (.magpie/uiv-repersist.json)'
      : r.entry.scope ? 'uiv: scoped pin' : 'uiv: standalone pin');
    console.log(r.mappingPath);   // 最后一行 = mapping.json 绝对路径;成功 exit 0
    return;
  }

  if (cmd.kind === 'verify-page') {
    const { report, reportPath } = await runVerifyPageCommand({
      test: cmd.test, node: cmd.node, demo: cmd.demo, session: cmd.session,
      states: cmd.states, matrix: cmd.matrix,
      ...(cmd.version !== null ? { version: cmd.version } : {}),
      ...(cmd.out !== null ? { out: cmd.out } : {}),
    }, cwd);
    process.exitCode = report.pass ? 0 : 1;   // UI 违规非零,report 必已落盘
    if (cmd.json) console.log(JSON.stringify(report, null, 2));
    console.log(reportPath);   // 最后一行恒为 page-report 绝对路径
    return;
  }

  // check
  const { report, reportPath } = await runCheckCommand({
    preview: cmd.preview, node: cmd.node, demo: cmd.demo,
    ...(cmd.version !== null ? { version: cmd.version } : {}),
    ...(cmd.ignoreRegion !== null ? { ignoreRegion: cmd.ignoreRegion } : {}),
  }, cwd);
  process.exitCode = report.pass ? 0 : 1;   // D-07(c): exit code 以 L2 report pass/fail 为准
  if (cmd.record) {
    // --record 罕用(T2.6 录 golden),不入 MCP 工具面;抽取后 runCheckCommand 不回传 runner,
    // record 分支就地重选一次(选路确定性,行为等价:cold=纯 SpawnGradleRunner 构造,hot=一次 500ms ping)。
    const sel = await selectGradleRunner(uiVerifyDir);
    const { goldenPath } = await runRecord(
      sel.runner, { demoDir: path.resolve(cwd, cmd.demo), testFqn: previewToTestFqn(cmd.preview) }, report.pass,
    );
    console.log(`golden recorded: ${goldenPath}\nhint: git add ${goldenPath} && git commit`);
  }
  console.log(reportPath);   // 最后一行 = report.json v1 绝对路径
}

/**
 * D-08(T2.9):一次性 CLI 收尾即时退出。odiff-bin 常驻 server 启动时会设一枚未 unref、
 * 无句柄可清的 5s 看门狗定时器(odiff-bin/server.js,仅非 CI 分支)。check 功能完成
 * (report 已落盘+打印、finally 已 stopOdiffServer)后,该定时器仍吊住事件循环 ~5s,
 * 令进程迟迟不退(实测 report→exit ~4964ms,占慢车道 P50 近半)。一次性命令理应即时收尾
 * (D-07 退出治理同旨),故 flush stdout(保末行 report/spec 路径契约)后显式退出,
 * 消除空转尾;不改 L1 常驻 server 架构本身。
 */
function flushAndExit(): void {
  const code = process.exitCode ?? 0;
  const hardExit = (): void => { process.exit(code); };
  if (process.stdout.writableLength === 0) { hardExit(); return; }
  // 末行(report/spec 路径契约)best-effort flush 后即退;但绝不把退出寄托于 drain 回调:冷道下
  // stdout 读端若已亡、或 spawn 链条/odiff server 的悬置句柄堵住事件循环,该回调可能永不触发。
  // 故补一枚 unref 兜底定时器——事件循环一旦仍被占住(未自然排空)即强制收尾,杜绝无限悬挂
  // (实证冷道 22+ 分钟未退;D-07/D-08 退出治理同旨)。
  process.stdout.write('', hardExit);
  setTimeout(hardExit, 250).unref();
}

main().then(flushAndExit, (e: unknown) => {
  if (e instanceof RecordRefusedError) {
    console.error(`uiv: ${e.message}`);
    process.exitCode = 3;
  } else if (e instanceof CliUsageError) {
    console.error(`uiv: ${e.message}`);
    process.exitCode = 2;
  } else {
    console.error(e);
    process.exitCode = 2;
  }
  flushAndExit();
});

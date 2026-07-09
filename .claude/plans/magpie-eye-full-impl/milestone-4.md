# M4(Phase 3)代码级子计划 — 门面与整页裁判

> 上游:orchestration.md M4 表 + 第 5 节全部经验条款;B3(vlm provider 无 key→轻量形态必交付)。
> M4 北极星 = Claude Code 经 MCP 完成 Phase 0 同场景(T4.1 stdio e2e)+ L3 输入包/回填链(T4.2)+ 本地 CI 红绿门(T4.3)。

## 执行序(编排者裁定)
- **Wave A:T4.1 先行且独占**——其"uiv-cli 抽取 commands.ts"是结构性重构,T4.2/T4.3 的 CLI 子命令(l3-attach/report)必须基于抽取后现状注册。
- **Wave B(A 后,串行)**:T4.3 → T4.2(两章都加 CLI 子命令,入口文件串行避冲突;其余路径互斥)。
- T4.4/T4.5:按 scoping 文件交 Codex 裁定,若 T4.5 获准最小版,可与 Wave B 并行(l2/ 路径互斥)。
- 共享文件照旧:barrel/gitignore 登记制,meta 归编排者;demo-android 排他。

---

### Task T4.1 — ui-verify MCP server(stdio,复用 uiv-core)

**依据**:编排计划 M4 T4.1 行 + 设计文档 2.6(三工具门面)/5.2 形态 B(.mcp.json 注册,server 进程在 Bash 沙箱外)。**前置**:M3 全 done;不依赖 T4.2/T4.3。**范围切割**:新包 `packages/ui-verify-mcp` + uiv-cli 编排逻辑抽取复用;`pin`/`--record` 不做 MCP 工具(涉 git 资产提交语义,CLI 已覆盖,YAGNI);HTTP transport/鉴权不做(stdio 单机门面);vlm-judge(T4.2)、CI(T4.3)不碰。

#### 口径钉死

**① SDK 版本(2026-07-09 已实查,实现日 Step 0 复核)**:`@modelcontextprotocol/sdk@^1.29.0`(npm latest=1.29.0,engines node>=18;zod peer `^3.25 || ^4.0`)→ 同装 `zod@^3.25.0`(registerTool 用 ZodRawShape,v3 线与 zod-to-json-schema 最稳)。复核 `npm view @modelcontextprotocol/sdk version`:minor 前进就近钉;major 变化回 Codex。

**② 复用方式(评估结论:CLI 内抽 commands 模块,MCP 直接依赖;最小改动)**:
- 否决 a)编排逻辑上移 uiv-core——gradle-runner 是 spawn/UDS 进程代码,入 core 破坏"纯逻辑库"边界,且触 core barrel(共享文件);
- 否决 b)MCP 复制 glue——gradle-runner.ts 承载 D-07(b) 悬挂修复与 T2.1 选路语义,fork 即漂移温床;
- 采纳 c)uiv-cli 内**纯抽取** `src/commands.ts`(check/verify-page/baseline-pull 三段编排原样搬移,零行为变化;pin 留 index.ts),package.json 加 exports 子路径;MCP 依赖 `@magpie-eye/uiv-cli`。依赖链 mcp→cli→core 与"两薄壳平行"理想有偏——**登记 Codex 审查项**(理由:可重用面在 CLI 层非 core 层,搬 core 代价更大)。

**③ stdout 纪律(stdio transport 硬约束)**:server 的 stdout=JSON-RPC 信道。抽取的 commands 函数**禁止 console.log**——"末行路径"打印留 CLI index.ts(函数返回值代打印);进度/lane 信息维持 console.error(MCP 允许 stderr 日志,CLI 行为不变)。附带观察(不修,只记录):现 CLI check 段 `readMappingEntry` 未传 cmd.version(verify-page 传了)——纯抽取原样保留,消歧补全另立 D-02 跟进。

**④ 工具契约(参数 schema 对齐 CLI)**:

| 工具 | 必填 | 可选 | 语义 |
|---|---|---|---|
| ui_check | preview,node,demo | version,ignoreRegion{x,y,w,h} | = `uiv check`(无 --record) |
| ui_verify_page | test,node,demo,session | version,states[],matrix,out | = `uiv verify-page`(无 --json,恒返回 report) |
| ui_baseline | fixture,file,node | — | = `uiv baseline pull`(REST 通道待 B1,同 CLI) |

返回=单块 text content(JSON 字符串;**不声明 outputSchema**,防与 core validateReportV1/validatePageReport 双源漂移):`{reportPath, report}`——ui_check 的 report **剥离 `artifacts` 字段**(PNG/diff 路径留盘上 report.json,模型按需 Read;与 CLI"末行给路径、内容自取"同口径);PageReport 无顶层 artifacts,原样返回(cells[].reportPath 指向逐格盘上报告);ui_baseline 返回 `{specPath, baselinePngExists}`。**`pass:false` 是正常返回**(报告即产品,不置 isError);CliUsageError/其余异常 → `isError:true` + 文本 `uiv: <message>`,server 不崩。

**⑤ 生命周期(D-07 同旨)**:每次工具调用 `finally { stopOdiffServer() }`(同 CLI,防 odiff 子进程 idle 悬挂);SIGINT/SIGTERM/stdin EOF(host 关停)→ stopOdiffServer + exit 0。**不搬 flushAndExit**(那是一次性 CLI 收尾治理,长驻 server 不适用)。

**⑥ 串行互斥**:工具执行经 promise 队列串行(state.json 读改写、odiff 全局单例、demo 工程 gradle 锁均非并发安全;MCP 协议允许并发请求)。

**⑦ 验收形态(HOTFIX 铁律:常驻 vitest,非一次性脚本)**:in-process 单测(InMemoryTransport+fake impl)+ **stdio 集成测试**(spawn 真实 dist server → JSON-RPC 调 ui_check → 断言 report 结构)。集成测试用 **mock-gradlew fixture**(exit-timing.test.ts 同款先例:tmpdir 造 .ui-verify(mapping+baseline)+ 假 gradlew 落渲染 PNG),hermetic 不依赖真 Android 构建;真 demo(CalibCardPreview/1:100/demo-android)交互演示仅补充非验收。

---

#### Step 0 — 包骨架 + 版本钉死(红→绿→commit)

① 复核 SDK 版本(口径①)。② 新建 `packages/ui-verify-mcp/package.json`:

```json
{ "name": "@magpie-eye/ui-verify-mcp", "version": "0.0.1", "private": true, "type": "module",
  "bin": { "ui-verify-mcp": "dist/index.js" }, "main": "dist/server.js",
  "dependencies": { "@magpie-eye/uiv-cli": "*", "@magpie-eye/uiv-core": "*",
    "@modelcontextprotocol/sdk": "^1.29.0", "zod": "^3.25.0" } }
```

tsconfig.json 抄 uiv-cli 模板(extends ../../tsconfig.base.json;rootDir src/outDir dist;exclude `src/**/*.test.ts`;references core+cli 两项)。③ `npm install`(workspaces `packages/*` 自动纳管;registry.npmjs.org 在白名单)。④ 冒烟测 `src/server.test.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createUiVerifyServer } from './server.js';

it('冒烟:in-process 连通,三工具可列出', async () => {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createUiVerifyServer().connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(['ui_baseline', 'ui_check', 'ui_verify_page']);
});
```

`src/server.ts` 先给空实现骨架(三工具注册、handler 一律 isError)让冒烟绿。验收:`npx vitest run packages/ui-verify-mcp` 绿;`npx tsc -b packages/ui-verify-mcp` exit 0。commit `T4.1: ① ui-verify-mcp 包骨架(sdk 1.29.0 钉版)`。

#### Step 1 — uiv-cli 纯抽取 commands.ts(闸=既有测试全绿)

新建 `packages/uiv-cli/src/commands.ts`,把 index.ts 三段编排**原样搬移**(含 fastlane 尝试/回落、mapping entry 读取、finally stopOdiffServer;console.log 改返回值):

```ts
export interface CheckParams { preview: string; node: string; demo: string; version?: string; ignoreRegion?: CliIgnoreRegion }
export async function runCheckCommand(p: CheckParams, cwd: string): Promise<{ report: ReportV1; reportPath: string }>
export interface VerifyPageParams { test: string; node: string; demo: string; session: string; version?: string; states?: string[]; matrix?: string; out?: string }
export async function runVerifyPageCommand(p: VerifyPageParams, cwd: string): Promise<{ report: PageReport; reportPath: string }>
export interface BaselinePullParams { fixture: string; file: string; node: string }
export async function runBaselinePullCommand(p: BaselinePullParams, cwd: string): Promise<{ specPath: string; baselinePngExists: boolean; baselinePngPath: string }>
```

要点:`uiVerifyDir = path.resolve(cwd, '.ui-verify')` 由参数注入(CLI 传 process.cwd(),MCP 同);--record 逻辑与打印**留 index.ts**(check pass 后调 runRecord 的分支在 index.ts 基于返回 report 继续,行为不变);readMappingEntry/selectMappingEntry 迁入或原地 import,不改语义。uiv-cli package.json 增:

```json
"exports": { "./commands": "./dist/commands.js" }
```

(NodeNext 下 dist/commands.d.ts 邻接自动解析;无 root export,bin 包现状不受影响。)新增 `commands.test.ts` 冒烟:fixture 驱动 runBaselinePullCommand(复用 baseline/pull 既有 fixture 套路)断言 specPath 落盘。**回归闸**:`npx vitest run packages/uiv-cli` 全绿——exit-timing.test.ts(真实 dist 冷道 e2e)与 args/gradle-runner/mapping-entry/fastlane 单测即抽取护栏。commit `T4.1: ② uiv-cli 纯抽取 commands.ts + exports 子路径(零行为变化)`。

#### Step 2 — server.ts 三工具实现(InMemoryTransport TDD)

`createUiVerifyServer(impl: CommandImpl = realImpl)`——模块边界 DI:`CommandImpl = { check, verifyPage, baselinePull }`,默认绑 `@magpie-eye/uiv-cli/commands` 真实现,测试注入 fake(委托而非继承)。先写测(红):

```ts
const fake: CommandImpl = {
  check: async () => ({ reportPath: '/tmp/r.json', report: { schemaVersion: 1, pass: false, artifacts: { baseline: 'b', render: 'r', diff: null }, /* 其余合法 v1 字段 */ } as ReportV1 }),
  verifyPage: async () => ({ reportPath: '/p.json', report: pageReportFixture }),
  baselinePull: async () => ({ specPath: '/s.json', baselinePngExists: false, baselinePngPath: '/b.png' }),
};
// ① ui_check 返回:text JSON 含 reportPath;report 无 artifacts 键;pass:false 但 isError 未置位
// ② schema 校验:缺 demo → SDK 层拒(callTool 抛/isError),impl 未被调用
// ③ CliUsageError('mapping.json not found…') → isError:true,text 含原文
// ④ ui_verify_page:states/matrix 可选透传;返回含 cells[].reportPath
// ⑤ 串行:两个并发 callTool,fake 内记 (start,end) 时间戳,断言 second.start >= first.end
// ⑥ 每次调用后 stopOdiffServer 被调(注入 spy 计数,含 impl 抛错路径)
```

后实现(绿):`registerTool` 三次,inputSchema 用 zod(对齐口径④表:ignoreRegion 为 `z.object({x,y,w,h: z.number()})`,states `z.array(z.string())`,matrix `z.string()`);handler 统一包装:`serialize(async () => { try { …impl… return { content: [{ type: 'text', text: JSON.stringify({ reportPath, report: stripped }) }] } } catch (e) { return { content: [{ type: 'text', text: `uiv: ${msg}` }], isError: true } } finally { stopOdiffServer() } })`;`serialize` = 尾链 promise 队列(~8 行);artifacts 剥离 = 解构去键,不 mutate 原对象。stopOdiffServer 经 impl 对象注入(默认真函数),规避真 odiff 依赖。commit `T4.1: ③ 三工具 server(schema 对齐 CLI+artifacts 剥离+串行+错误映射)`。

#### Step 3 — index.ts stdio 接线 + 生命周期

`src/index.ts`(bin):`#!/usr/bin/env node`;`createUiVerifyServer().connect(new StdioServerTransport())`;`process.stdin.on('end'|'close')` 与 SIGINT/SIGTERM → `stopOdiffServer(); process.exit(0)`。测试(常驻机判,D-07/HOTFIX 同旨)`src/lifecycle.test.ts`:构建 dist 后裸 spawn `node dist/index.js`,写入 initialize 请求→读到响应→`child.stdin.end()`,断言进程 ≤5s 内退出(HARD 15s 判悬挂);测前 `execSync('npx tsc -b packages/ui-verify-mcp')`(增量幂等,exit-timing 先例)。commit `T4.1: ④ stdio 接线+stdin-EOF/信号清场退出(常驻机判)`。

#### Step 4 — stdio 集成测试(本章验收核心)

`src/stdio-e2e.test.ts`:mock-gradlew fixture(抄 exit-timing.test.ts 的 makeFixture 套路,自建不共享:tmpdir 下 `.ui-verify/mapping.json`(FKEY/1:100/V1/minScore .9)+ `baselines/1-100@V1/baseline.png` + demo/gradlew 假脚本落 `*_actual` 渲染 PNG;无 spec.json → 走 inconclusive 路径,ReportV1 结构照常成立):

```ts
const transport = new StdioClientTransport({ command: 'node', args: [DIST_SERVER], cwd: fixtureDir });
const client = new Client({ name: 'e2e', version: '0' });
await client.connect(transport);
const res = await client.callTool({ name: 'ui_check', arguments: { preview: 'com.magpie.uiv.demo.CalibCardPreview', node: '1:100', demo: 'demo' } });
const payload = JSON.parse((res.content as [{ text: string }])[0].text);
// 断言:res.isError falsy;payload.reportPath 存在且盘上 JSON 过 validateReportV1(artifacts 完整);
// payload.report.schemaVersion===1、typeof pass==='boolean'、无 artifacts 键;
// 第二次 callTool 同参仍成功(odiff 起停跨调用自洽);ui_baseline 缺参 → isError。
await client.close();
```

testTimeout 120_000;冷道假 gradlew 秒级。验收 = 本文件绿(即编排计划 M4 T4.1 行验收:stdio 拉起 server → 调 ui_check → 断言 report.json 结构)。commit `T4.1: ⑤ stdio 集成测试(mock-gradlew fixture 端到端)`。

#### Step 5 — 注册样例文档 + 共享文件协调(独立 commit)

① `packages/ui-verify-mcp/README.md`(包内文件,非共享):三工具契约表(抄口径④)+ `.mcp.json` 注册样例:

```json
{ "mcpServers": { "ui-verify": {
  "command": "node", "args": ["packages/ui-verify-mcp/dist/index.js"] } } }
```

注明:Claude Code 以项目根为 cwd 拉起 stdio server → `.ui-verify`/demo 相对路径就地解析;server 在 Bash 沙箱外运行(设计文档 5.2 形态 B),无人值守 sandbox-runtime 场景需 allowUnixSockets 才能触达外部 daemon(热路径),冷路径自足。交互演示(补充非验收):`claude mcp list` 见 ui-verify → 会话内调 ui_check(真 demo:preview=com.magpie.uiv.demo.CalibCardPreview,node=1:100,demo=demo-android,cwd=仓库根)。② **共享文件协调**:root package.json 的 build/typecheck 脚本追加 `packages/ui-verify-mcp`——单独小 commit 标注 `[M4-integration]`(M2 固化解法;vitest.config include 已覆盖 `packages/*`,零改动)。commit `T4.1: ⑥ README(.mcp.json 样例)` + `[M4-integration] root scripts: ui-verify-mcp 构建纳管`。

---

#### 章末登记

- **barrel export 清单(core index.ts)**:无——本章不碰 uiv-core 任何文件。
- **共享文件清单**:root package.json(scripts.build/typecheck 追加,Step 5 独立 commit);uiv-cli index.ts/package.json(本章独占,M4 无并行任务争用)。
- **meta.json/.gitignore**:不碰(主会话维护;dist 已有既有 ignore 规则覆盖,无新增运行产物目录)。
- **Codex 审查项**:②的 mcp→cli→core 依赖链取舍;④的 record 不入 MCP、返回剥离 artifacts 口径;③的 check 不传 version 现状保留。

#### 本章验收(可机判)

```bash
npx tsc -b packages/ui-verify-mcp && npx vitest run packages/ui-verify-mcp packages/uiv-cli
```

exit 0(含 stdio-e2e、lifecycle 退出机判、uiv-cli 抽取回归全绿)。耗时预算:e2e 假 gradlew 秒级,全套 <2min。


---

# T4.3 —— CI 两道门(本地可机判形态)

## 0. 定位与依赖

M4 任务。**真实远程 CI(GitHub Actions/Jenkins 等 yaml)属用户侧 followup**,本任务只交付"本地脚本模拟 CI 入口"的可机判形态。前置:T3.3 verify-page(门 A 输入)、T2.6 record/golden(门 B 输入)、T1.2 baseline pull/mapping.json(哨兵输入),全部已 done。

**两道门性质区分(设计文档 5.3,不可混用名字,本表进 docs 与脚本注释)**:

| 门 | 命令 | 回答的问题 | 阻断性 |
|---|---|---|---|
| A:UI parity 硬门禁 | `uiv verify-page` + `uiv report --junit` | 像不像设计稿(L2 结构断言,唯一裁决者) | exit code 即门 |
| B:视觉回归套件 | `verifyRoborazziDebug`(同渲染器 这次 vs 上次) | UI 有没有非预期变更 | **默认仅报告**;显式声明容差(threshold validator)后方可阻断 |
| 哨兵:设计稿漂移 | `uiv baseline pull --check-version` | 钉住 version 是否落后 Figma /meta 最新 | **只告警不阻断**(exit 恒 0);重录基准人工触发 |

**验收总则(可机判)**:§3 三条命令全绿——单测集(含哨兵 fixture 单测)、`check-t43.mjs` 红绿四场景 exit 0、全量 vitest 不新增失败。

## 1. 现状锚点与硬约束

**符号锚点(实读核验,HEAD 15cc7c0)**:
- `packages/uiv-cli/src/args.ts`:手写解析器,`ParsedCommand` 联合 + `collectFlags/required/CliUsageError`;`index.ts` main 按 kind 分发,exit 语义:0/1=pass/fail、2=usage/异常、3=record 拒录;末行=产物绝对路径契约;`flushAndExit` 收尾。
- `packages/uiv-core/src/report/v1.ts` `validateReportV1`(pass/reason:'inconclusive'|null/subReason/structural.violations);`page/report.ts` `validatePageReport`(kind:'page-report'/perCell[]:cellId/device/state/pass/reason/subReason/failureClasses/topViolations/durationMs)。
- `baseline/mapping.ts` `MappingEntry{fileKey,nodeId,version,minScore,…}`;仓库根 `.ui-verify/mapping.json` 已入库(FKEY/1:100/version=T1_0A_V1)。
- `figma/client.ts` `FigmaClient` 仅 getNodes/getImages,**无 getMeta——本任务新增**;`FixtureFigmaClient(fixturePath)`;`rest.ts` `RestFigmaClient.get(p)` 私有通道可复用。
- `check/record.ts`:gradle 形态 `testDebugUnitTest --tests <FQN> -Proborazzi.test.record=true --rerun`;门 B verify 用 `-Proborazzi.test.verify=true` 同形(verifyRoborazziDebug 的等价显式形态,设计文档任务名照写注释)。
- `demo-android/build-logic/.../UivScreenshotConventionPlugin.kt`:gradleProperty→test worker systemProperty 转发清单(现 uiv.device/uiv.state)——容差属性照此挂。
- golden 现状:**仅 `demo-android/app/src/test/snapshots/CalibCard.png` 入库** → 门 B 范围必须钉 `--tests '*CalibCardScreenshotTest'`(裸 `:app:verifyRoborazziDebug` 全量跑会因未录 golden 的测试假红)。
- demo gradle 三件套:`GRADLE_USER_HOME=demo-android/.gradle-home`、`-p demo-android`、`--console=plain`(沿 check-t34.mjs)。

**硬约束**:① check-t43.mjs 属写偏类验收(改 CalibCard.kt 与 golden),与其他写偏任务**排他串行**,trap 恒恢复;② 不碰 meta.json/core barrel/.gitignore(登记制,§5);③ junit.xml 落 `.ui-verify/reports/`(已被 ignore,无需改 .gitignore);④ xmllint=/usr/bin/xmllint(macOS 自带,依赖写脚本注释);⑤ FIGMA_PAT 缺位(B1):哨兵 fixture 驱动 + 单测,**真实 /meta 轮询与响应形状核验入 pending_followups**。

**铁律(写进 ci-gate.sh 头注释 + docs/ci-gate.md)**:golden 仅在 mac 录制(Linux 字体渲染不一致,Paparazzi #1465 实锤);若未来 CI 跑 Linux——回归套件改容差 comparator 或只跑 L2 结构断言,禁像素 golden 门禁。

## 2. 步骤(bite-size,TDD)

### Step 1 core 纯函数:`report/junit.ts`(测试先行)
`junit.test.ts`:手工构造过 validator 的 ReportV1 / PageReport fixture,断言 `toJUnitXml`:
- page-report:每 perCell 一个 `<testcase name="<cellId>" classname="<test>">`;pass→无子元素;fail 且 reason=null→`<failure message="<failureClasses join ','>">` 文本含 topViolations JSON;reason='inconclusive'→`<skipped message="<subReason>"/>`;testsuite 计数 tests/failures/skipped 与 perCell 一致,time=durationMs/1000。
- v1:单 testcase name='check';structural.violations 非空→failure(文本含 violations+score);inconclusive→skipped message=subReason。
- escapeXml:violation message 注入 `<tag>&"'` 造例,attr/text 全转义。

实现:`export function toJUnitXml(input: ReportV1 | PageReport, opts?: { suiteName?: string }): string`;以 `(x as any).kind==='page-report'` 判别;根 `<testsuites>` 含单 `<testsuite>`;**schema 写死**(载体=Step 2 XSD)。纯函数零 IO。

### Step 2 schema 钉死:junit.xsd + xmllint 验证测试
- `scripts/fixtures/junit/junit.xsd` 手写(~60 行,离线,不抄网络版):testsuites(必需 attrs name/tests/failures/skipped)> testsuite(同 attrs+time)> testcase(必需 name/classname),可选子元素 failure(message 必需)/skipped(message 必需)。这份 XSD 即"schema 写死"的机判契约。
- `report/junit-xmllint.test.ts`:两种 fixture 的 toJUnitXml 产物写临时文件 → `execFileSync('/usr/bin/xmllint',['--noout','--schema',xsd,tmp])` exit 0;手工去掉必需 attr 的坏 XML → 非 0 反证。

### Step 3 CLI `uiv report --junit`
- `args.test.ts` 新增:`report --junit --in a.json` → `{kind:'report', junit:true, in, out:null, suite:null}`;缺 `--junit` 或缺 `--in` → CliUsageError(现阶段仅支持 junit 转换,报错话术写明);`--out/--suite` 可选;unknown command 提示串补 'report'。
- `args.ts` 加 `ReportCmd`;`index.ts` 接线:读 --in → JSON.parse →(kind==='page-report' ? validatePageReport : validateReportV1)→ toJUnitXml → 写 `--out`(默认 <in 同目录>/junit.xml)→ 末行打印 xml 绝对路径。**exit 恒 0=转换成功(转换器语义,门禁职责在 verify-page;输入 schema 非法走异常 exit 2)**——注释写明,防有人拿 report 当门。

### Step 4 core 哨兵纯逻辑 + getMeta 通道
- `baseline/version-check.test.ts`:`extractMetaVersion({version:'v2'})==='v2'`;`({file:{version:'v2'}})==='v2'`(REST /meta 两种候选形状均容,真形状核验= followup);坏形状抛 `L2Error('figma_spec_invalid')`。`detectVersionDrift(entries, fileKey, latest)`:命中 fileKey 且 version≠latest → `[{nodeId, pinned, latest}]`;相等→[];他 fileKey 忽略。
- `baseline/version-check.ts` 实现(纯函数零 IO)。
- `figma/client.ts`:接口加 `getMeta(fileKey: string): Promise<unknown>`;FixtureFigmaClient 构造器加可选第二参 metaFixturePath,未配而被调 → 抛 `L2Error('fixture_unavailable')`;RestFigmaClient.getMeta = `GET /v1/files/:key/meta`(rest.test.ts 注入 fetchFn 断言 URL/头;client.test.ts 补 fixture 例)。

### Step 5 CLI `uiv baseline pull --check-version`
- `args.test.ts`:`baseline pull --check-version --file FKEY [--meta-fixture p.json]` → 新 kind `'baseline-check-version'`(与现 BaselinePullCmd 分离:此模式不需 --fixture/--node);缺 --file 报错。
- `index.ts`:无 --meta-fixture 且无 FIGMA_PAT → CliUsageError `'check-version needs --meta-fixture or FIGMA_PAT (B1)'`(镜像 pin 话术);读 `.ui-verify/mapping.json` 全量条目(缺失→提示先 pull)→ getMeta → extractMetaVersion → detectVersionDrift;逐条打 `WARN version drift: node <id> pinned <p> latest <l>`,无漂移打 `OK versions match latest (<v>)`;**exit 恒 0(告警不阻断,设计文档 5.3;重录走人工 re-pin)**。
- fixture 入库:`scripts/fixtures/figma-meta.drifted.json`(version='T4_3_DRIFT'≠T1_0A_V1,供 ci-gate 演示 WARN 路径)。

### Step 6 门 B 阻断通道(demo 侧最小改动)
- ConventionPlugin 转发清单加 `'uiv.ci.threshold'`(一行,照 uiv.device 模式)。
- `CalibCardScreenshotTest.kt`:读 `System.getProperty("uiv.ci.threshold")`,非空时 `captureRoboImage(path, roborazziOptions = RoborazziOptions(compareOptions = RoborazziOptions.CompareOptions(resultValidator = ThresholdValidator(v.toFloat()))))`;空=现行为(精确比对)。仅改此测试(门 B 范围内唯一入库 golden)。
- 绿基线核验:`GRADLE_USER_HOME=demo-android/.gradle-home demo-android/gradlew -p demo-android :app:testDebugUnitTest --tests '*CalibCardScreenshotTest' -Proborazzi.test.verify=true --rerun --console=plain` exit 0。

### Step 7 `scripts/ci-gate.sh`(本地 CI 入口)
`set -euo pipefail`;头注释=§0 三行性质表 + golden 仅 mac 铁律 + xmllint 依赖 + "远程 CI=用户侧 followup"。流程:
1. `npm run build`(dist 新鲜);
2. **门 A(硬门禁)**:`node packages/uiv-cli/dist/index.js verify-page --test $UIV_CI_TEST --node $UIV_CI_NODE --demo demo-android --session ci --json --out .ui-verify/reports/ci/page-report.json`(默认 test 取 `scripts/m3-t35/calib-page-report.snapshot.json` 的 .test,node=1:100,env 可覆盖);用 `if !` 捕获 rc **但恒执行**下一步 `uiv report --junit --in <page-report> --out .ui-verify/reports/ci/junit.xml` + `xmllint --noout --schema scripts/fixtures/junit/junit.xsd`(CI 平台失败时更需要 XML);rc≠0 → `echo "FAIL [gate-A] ui parity"; exit $rc`——**exit 即门**;
3. **门 B(默认仅报告)**:Step 6 verify 命令,`if !` 捕获;失败→`echo "WARN [gate-B] visual regression detected (diff: demo-android/app/build/outputs/roborazzi/); 默认不阻断——设计文档 5.3"`;`UIV_CI_BLOCK_REGRESSION=1` 时:未声明 `UIV_CI_TOLERANCE` → `echo "ERROR: blocking requires explicit tolerance (设计文档 5.3)"; exit 2`;已声明 → 追加 `-Puiv.ci.threshold=$UIV_CI_TOLERANCE` 重跑,仍失败 → exit 1;
4. **漂移哨兵**:`… baseline pull --check-version --file FKEY --meta-fixture ${UIV_CI_META_FIXTURE:-scripts/fixtures/figma-meta.drifted.json}`(注释:真实定期轮询 REST /meta = followup B1);WARN 照打,不影响 exit;
5. `echo "ci-gate: PASS"`。

### Step 8 验收器 `scripts/m4-t43/check-t43.mjs` + 文档
die/ok 形态(沿 check-t34.mjs),`trap`/finally 恒 `git checkout` 恢复 CalibCard.kt 与 golden:
- a. **绿**:跑 ci-gate.sh → exit 0;stdout 含 `ci-gate: PASS` 且含哨兵 `WARN version drift`(证告警不阻断);junit.xml 存在且 xmllint --schema 过;
- b. **门 A 红**:sed 写偏 CalibCard.kt(padding 16→13 类)→ ci-gate exit≠0,stdout 含 `FAIL [gate-A]`,且 junit.xml 含 `<failure`(失败时报告仍产出);恢复;
- c. **门 B 默认 WARN**:pngjs(根 devDeps 已有)翻改 golden 若干像素 → ci-gate exit 0 且 stdout 含 `WARN [gate-B]`;
- d. **门 B 开关红**:同篡改 + `UIV_CI_BLOCK_REGRESSION=1 UIV_CI_TOLERANCE=0.01` → exit≠0;`UIV_CI_BLOCK_REGRESSION=1` 无容差 → exit 2;恢复。
- `docs/ci-gate.md`(短):§0 性质表、用法与 env 变量、golden 仅 mac 铁律、Linux CI 降级口径(容差 comparator 或仅 L2)、远程 CI followup 指引。

## 3. 验收命令清单(可机判)

1. `npm run build && npx vitest run packages/uiv-core/src/report/junit.test.ts packages/uiv-core/src/report/junit-xmllint.test.ts packages/uiv-core/src/baseline/version-check.test.ts packages/uiv-core/src/figma/rest.test.ts packages/uiv-core/src/figma/client.test.ts packages/uiv-cli/src/args.test.ts` 全绿(含哨兵 fixture 单测与 JUnit schema 校验);
2. `node scripts/m4-t43/check-t43.mjs` exit 0(红绿四场景 a–d;写偏段与其他写偏验收排他串行);
3. `npx vitest run` 全量不新增失败。

## 4. 明确不做(防扩散)

真实远程 CI yaml(用户侧 followup);真实 /meta 轮询+响应形状核验(pending_followups,B1);golden 扩录(CalibPage 参数化格,按需后续);Roborazzi 侧 ignore-region 配置(容差通道已满足 5.3 阻断前提的最小形态,L1 check 另有 --ignore-region 通道);`uiv report` 非 junit 格式。

## 5. 共享文件登记(本任务不碰,交编排者协调)

- **core barrel** `packages/uiv-core/src/index.ts`:+`export * from './report/junit.js'`、+`export * from './baseline/version-check.js'`——Step 3/5 的 CLI 接线编译前需此协调提交(同 M3 `[M3-integration] barrel` 模式;Step 1/2/4 不受阻,可先行);
- `.gitignore` 无需改;`meta.json` 仅主会话写;
- CLI `args.ts`/`index.ts`:T4.3 独占编辑(T4.1 MCP server 为独立包不争用;若并行需登记排队)。


---

# T4.2 — vlm-judge L3:轻量形态必交付 + provider 接口(B3 受限)

> 上游:orchestration.md M4 表 T4.2 与 B3;设计文档 2.7(双形态/输入三件套/证据锚定/仅建议不门禁)+ 3.2 步骤 B(L1/L2 全过才触发;verdict 五元组 `{item,verdict,evidence,severity,suggestion}`;无证据判定丢弃)。TDD:每步红→绿→`npm test`(workspace 全量)→commit(message 带 T4.2)。
> **现状(已核对源码,不重做)**:`page/report.ts` 的 `l3Verdicts: never[]` 恒空、校验器仅查 isArray;`page/verifyPage.ts` 无任何 L3 逻辑;L1 现状——`check/run.ts` 在 base 设备格(`skipL1: device!=='base'`)已产 `reports/<nodeDir>/cells/<cellId>/diff.png`(odiff 差异高亮图,即"diff 叠加"形态,**match 时文件不落盘,但 artifacts.diff 仍写路径**)+ v1 `pixel.clusters[]`(looks-same 聚类,`{x,y,w,h}` px)+ v1 `artifacts{baseline,render,diff}` 绝对路径;**三联图尚无**;pngjs ^7 已是 uiv-core 依赖;meta.json `pending_followups` 已含"provider 形态 vlm-judge(视 API key)"——**不新增登记,meta.json 不碰**。
> **边界**:uiv 进程不调用任何 LLM(轻量形态=harness 模型自读输入包);真实 provider(anthropic/openai/gemini)不实现(B3);l3Verdicts 不影响 pass(仅建议,验收断言);skipL1 语义不动 → L3 输入只收 base 设备 parity 格。**共享文件纪律**:不碰 core barrel `index.ts`(章末登记,收尾 agent 集成);`uiv-cli/src/args.ts`、`index.ts` 改动(Step 6)若与 M4 其他章并发须排他串行。

## Step 1 l3Verdicts schema 定稿 + 校验器强化

红(`page/report.test.ts` 新 describe 'l3Verdicts schema'):合法 fail 项(全字段)通过;`verdict:'fail'` 且 `evidence: []` → throw `/evidence/`;fail 且 `severity: null` → throw;fail 且 `suggestion: null` → throw;`item:'contrast'`(非法)→ throw;`verdict:'maybe'` → throw;`verdict:'pass'` 且 `evidence: []`、severity/suggestion 均 null → **通过**(裁定注见下);evidence 项缺 `cellId`/坐标非 number → throw。

绿:

- 新建 `packages/uiv-core/src/page/l3/types.ts`:

```ts
/** T4.2:L3 量规 7 项(设计文档 2.7 固定序:元素齐全→层级嵌套→几何间距→字号字重→颜色→圆角阴影→自适应)。 */
export const RUBRIC_ITEMS = ['elements_complete', 'hierarchy', 'spacing',
  'typography', 'color', 'corner_shadow', 'adaptive'] as const;
export type L3RubricItem = (typeof RUBRIC_ITEMS)[number];
export interface L3Evidence { cellId: string; x: number; y: number; w: number; h: number }  // px,须锚定输入包簇
export interface L3Verdict {
  item: L3RubricItem;
  verdict: 'pass' | 'fail' | 'uncertain';
  evidence: L3Evidence[];                    // fail/uncertain 必非空(证据锚定)
  severity: 'high' | 'medium' | 'low' | null; // fail ⇒ 非 null
  suggestion: string | null;                  // fail ⇒ 非空 string
}
```

- `page/report.ts`:`PageReport.l3Verdicts: L3Verdict[]`(替换 never[]);`validatePageReport` 增 `checkL3Verdict(v, path)` 逐项校验上述约束(fail/uncertain ⇒ evidence 非空;fail ⇒ severity∈枚举 ∧ suggestion 非空)。
- **裁定注(供 Codex 审)**:2.7"禁止无证据 pass"与 3.2B"无证据判定丢弃"在零像素差异页会互斥——全绿零簇时 pass 判定无簇可引,若强制则 l3Verdicts 恒被清空。口径定为:**fail/uncertain 强制簇锚定(校验器拒绝 + attach 丢弃),pass 允许 evidence 空**;"禁止无证据 pass"的执行点=输入包 `verdictContract` 文本要求模型对有簇项引用簇、attach 对伪造坐标丢弃(Step 4)。

全绿→commit `T4.2: l3Verdicts schema 定稿+校验器强化`。

## Step 2 三联图拼接 composeTriptych(pngjs)

红(新 `page/l3/triptych.test.ts`):pngjs 造三张纯色小图落 tmp——红 4×6、绿 4×4、蓝 6×5 → `composeTriptych(b, r, d, out)` → out 存在;返回 `{width: 30, height: 6}`(4+4+6+2×8 gutter,h=max);像素抽查:(0,0) 红、(12,0) 绿、(24,0) 蓝、(12,5) 白(绿图高 4 之下补白)、(5,0) 白(gutter);两次调用产物字节级一致(确定性)。

绿(新 `page/l3/triptych.ts`):

```ts
export interface TriptychResult { path: string; width: number; height: number }
/** 横拼 基准|渲染|diff,gutter 8px 白(#FFFFFF 不透明),顶对齐,矮图底部白填。pngjs sync API。 */
export function composeTriptych(baselinePng: string, renderedPng: string,
                                diffPng: string, outPath: string): TriptychResult
```

实现:`PNG.sync.read` 三图 → 画布 `width=w1+w2+w3+16, height=max(h)` 全填 255 → `PNG.bitblt` 依次贴 x=0 / w1+8 / w1+w2+16 → `PNG.sync.write` 落 outPath(mkdirSync recursive)。

全绿→commit `T4.2: composeTriptych pngjs 三联图`。

## Step 3 L3 输入包 buildL3InputPack

红(新 `page/l3/inputPack.test.ts`):tmp 下手造两格候选——cellA:baseline/render/diff 三 PNG 齐全 + clusters 两簇;cellB:diff 路径指向**不存在**文件(模拟 odiff match 不落盘/L1 advisory 失败)→ `buildL3InputPack` → 返回非 null;`pack.cells` 恰 1 项(cellA);`l3/l3-input.json` 落盘且 `JSON.parse` 回读 `schemaVersion:1, kind:'l3-input'`;`l3/triptych-<cellA>.png` 存在;`pack.rubric` 长 7 且各条含对应 item id 前缀、序与 RUBRIC_ITEMS 一致;`verdictContract` 含 '仅建议' 与 'evidence';零合格格(全 cellB)→ 返回 null 且 **l3/ 目录不创建**。

绿(新 `page/l3/inputPack.ts`):

```ts
export interface L3CellInput { cellId: string; state: string; assertionScope: string;
  triptychPath: string; clusters: Array<{ x: number; y: number; w: number; h: number }>; diffRatio: number }
export interface L3InputPack {
  schemaVersion: 1; kind: 'l3-input'; nodeId: string; version: string;
  coordsNote: string;          // '坐标单位 px(density=2,÷2 得 dp);三联图布局 左=baseline 中=rendered 右=diff,gutter 8px'
  rubric: string[];            // 7 条:'<item id>: <一句中文判据>',序=RUBRIC_ITEMS
  verdictContract: string;     // 回填合同:逐项输出 L3Verdict JSON 数组;fail/uncertain 的 evidence 必须引用本包 clusters 内簇坐标(cellId+相交);结论仅建议、不改 pass;经 `uiv l3-attach` 回填
  cells: L3CellInput[];
}
export interface L3Candidate { cellId: string; state: string; assertionScope: string;
  artifacts: { baseline: string | null; render: string | null; diff: string | null };
  pixel: { diffRatio: number; clusters: Array<{ x: number; y: number; w: number; h: number }> } | null }
/** 合格格 = artifacts 三路径非 null 且 existsSync 全真(diff 缺失=零差异/advisory 失败,无 L3 素材,跳过)。
 *  零合格格 → null(不落盘)。产物:reports/<nodeDir>/l3/{l3-input.json, triptych-<cellId>.png}。 */
export function buildL3InputPack(candidates: L3Candidate[], nodeDir: string,
                                 reportsRoot: string, nodeId: string, version: string):
  { pack: L3InputPack; packPath: string } | null
```

RUBRIC_TEXT 常量 7 条中文判据(如 `elements_complete: 设计稿元素全部出现且无多余`;`adaptive: 当前配置下无溢出/截断/错位`),从 RUBRIC_ITEMS map 生成防序漂移。

全绿→commit `T4.2: L3 输入包生成(轻量形态素材)`。

## Step 4 verifyPage 接线(触发前置)+ attachL3Verdicts(回填)

红(`page/verifyPage.test.ts` 新 describe + 新 `page/l3/attach.test.ts`):

1. **触发前置(M4 表验收断言)**:复用既有 WritingRunner/setup/baseOpts fixture。故意 L2 fail(dump 写偏一格几何)跑 verifyPage → `pass===false` ∧ `reports/<nodeDir>/l3/` 目录**不存在** ∧ `l3Verdicts` 严格 `[]` ∧ page-report.json 原文不含 `'l3-input'`——L2 fail 报告零 L3 痕迹。
2. 全绿跑 → `report.l3Verdicts` 仍 `[]`(轻量形态生成输入包不自动回填);若 `l3/l3-input.json` 存在则可 parse 且 cells 每项 triptychPath existsSync(L1 真实 diff 落盘与否自适应,断言条件化)。
3. attach(自控 tmp fixture,不依赖 odiff):手造 page-report.json(pass:true)+ l3-input.json(单格两簇)→ 合法 verdicts(evidence 取包内真实簇)→ `{attached: n, dropped: 0}`,重读 page-report.json 的 l3Verdicts 长 n 且 **pass 前后不变**;混入 evidence 空的 fail 项 → dropped+1 且不入报;混入伪坐标(与该 cell 任一簇不相交)fail 项 → dropped+1;**全部为 fail verdict 时 pass 仍 true(仅建议,验收断言)**;attach 后报告过 `validatePageReport`;verdicts 非数组 → throw。

绿:

- 新 `page/l3/attach.ts`:

```ts
/** 证据锚定过滤(3.2B"无证据判定丢弃"):verdict≠'pass' 且(evidence 空 ∨ 任一 evidence 与其
 *  cellId 对应输入包簇集 AABB 不相交)→ drop。剩余项逐个过 Step 1 校验(非法项直接 throw,
 *  与 drop 区分:形状非法=调用方 bug,伪证据=模型幻觉)。写回后全报告 validatePageReport。pass 恒不动。 */
export function attachL3Verdicts(pageReportPath: string, verdicts: unknown, packPath: string):
  { attached: number; dropped: number }
```

- `page/verifyPage.ts`:cell 循环内 `route.judgePath==='parity'` 时收集 `L3Candidate`(report.artifacts + report.pixel);`validatePageReport` 后、写盘 page-report 前不动——**写盘后** `if (pageReport.pass) { try { buildL3InputPack(...) } catch (e) { console.warn('uiv: L3 input pack failed (advisory): ...') } }`(失败不影响返回值/exit,与 L1 advisory 同律);pass=false 分支零调用。

全绿→commit `T4.2: verifyPage L3 触发前置+attach 证据锚定回填`。

## Step 5 VlmProvider 接口 + fake 端到端(provider 形态,B3)

红(`page/verifyPage.test.ts` 新 describe 'vlm provider'):测试内 `FakeVlmProvider implements VlmProvider`(记录 `calls: L3InputPack[]`;返回引用 pack 首簇的合法 verdicts + 一条 evidence 空的 fail 项):

1. e2e 全绿 + 注入 fake:WritingRunner 改造为写"与 baseline 同尺寸但抹改少量像素"的 actual(pngjs 读 baseline 尺寸动态生成,保证 diffCount>0、diff.png 落盘、clusters 非空;L2 dump 仍全对,pass:true)→ 返回 report 与落盘 page-report.json 的 `l3Verdicts` **非空**、无证据项被 drop、`pass===true` 不受 fail verdict 影响;
2. **L2 fail + 注入 fake → `fake.calls.length===0`**(触发前置对 provider 同样生效);
3. provider `judge` 抛错 → warn 后 report 正常返回、l3Verdicts `[]`(advisory)。

绿:

- 新 `page/l3/provider.ts`:

```ts
/** provider 形态注入点(设计 2.7):真实 anthropic/openai/gemini 后端不在本章(B3,
 *  pending_followups 既有条目),仅接口+fake 单测。返回 unknown,一律经 attach 过滤校验。 */
export interface VlmProvider { judge(pack: L3InputPack): Promise<unknown> }
```

- `verifyPage.ts`:`VerifyPageOpts` 加 `vlmProvider?: VlmProvider`;pass ∧ pack 非 null ∧ 注入时 `await provider.judge(pack)` → `attachL3Verdicts(...)` → 重读并返回更新后 report;整段 try/catch warn(advisory)。默认不注入 = uiv 零 LLM 调用(轻量形态)。

全绿→commit `T4.2: VlmProvider 接口+fake e2e(真实 provider 留 B3)`。

## Step 6 CLI `uiv l3-attach`(轻量形态回填通道;共享文件,排他串行)

轻量形态闭环:模型 Read 输入包+三联图 → 自判产 verdicts.json → 经受校验通道回填(手改 page-report.json=绕过证据锚定,反模式)。

红:`uiv-cli/src/args.test.ts` 增——`l3-attach --report r.json --verdicts v.json --pack p.json` 解析;缺任一参 → CliUsageError;`args.ts` 未知命令提示串含 `l3-attach`。e2e(`uiv-cli` 测试,tmp fixture 复用 Step 4 attach 用例素材):跑 CLI 入口 → stdout 含 `attached=1 dropped=1` → exit 0;verdicts 文件非法 JSON → exit 1。

绿:`args.ts` 加 `kind:'l3-attach'` 三必选参;`index.ts` 接线调 core `attachL3Verdicts` 打印计数。**本步触碰 CLI 共享入口:与 M4 其他章(T4.1/T4.3)并发时排他串行,或交收尾 agent 统一集成。**

全绿→commit `T4.2: CLI l3-attach 回填通道`。

## 验收清单(可机判,对齐 M4 表)

| # | 断言 | 载体 |
|---|------|------|
| 1 | 输入包生成:合格格过滤/rubric 7 项固定序/triptych 尺寸与像素/零合格格 null | inputPack.test + triptych.test,`npm test` exit 0 |
| 2 | **触发前置:L2 fail → l3/ 目录不存在 ∧ l3Verdicts=[] ∧ 报告原文无 'l3-input' ∧ fake provider 0 调用** | verifyPage.test(Step 4-1、5-2) |
| 3 | schema 校验:无证据 fail 被 validatePageReport 拒绝(throw /evidence/);attach 对无证据/伪坐标项丢弃计数 | report.test + attach.test |
| 4 | fake provider e2e:全绿 → l3Verdicts 非空;**全 fail verdict 下 pass 仍 true(仅建议不门禁)** | verifyPage.test(Step 5-1) |
| 5 | CLI 回填:l3-attach 红绿 exit 码正确 | uiv-cli 测试 |

真实 provider:不实现,B3 条目已在 pending_followups(勿重复登记)。

## barrel export 登记(本章不碰 index.ts,收尾 agent 统一)

`uiv-core/src/index.ts` 追加:`composeTriptych`、`buildL3InputPack`、`attachL3Verdicts`、`RUBRIC_ITEMS`;类型 `L3Verdict`、`L3Evidence`、`L3InputPack`、`L3Candidate`、`VlmProvider`。


---

# T4.4 / T4.5 范围评估(决策材料,交 Codex 裁定)

目的:两个 M4 可选任务的做/不做/最小版边界裁定。非子计划,不含实现代码。
输入:设计文档 2.3/3.3/4/5.3/8 节 + 核查表 CS2/CS7;orchestration.md M4 表;仓库实读。

## 0. 现状事实基线(实读结论,两任务共用)

- demo-android **纯 Compose**:无 `res/` 目录、无 XML layout、无 View 渲染路径。唯一 View 触碰是 NativeTextMetrics/LegacyTextMetricsProbe 两个 CS2 探针(直构 TextView,非管线)。`minSdk=26` 已满足 CS2 门槛。
- `SemanticsDumpRule.kt` 全部走 Compose 专有 API(ComposeContentTestRule/SemanticsNode/TextLayoutResult),对 View 树零复用;uiv-core L2 输入是单一 `SemanticsDump` schema(testTag/positionInRoot/touchBounds/hasVisualOverflow/clickable/cd…)。
- T2.7 像素通道已打通且可复用:`check/runL2.ts` 同轮解码 rendered.png 喂 `pixelSource`,`assert.ts` 在断言点拿 png+boundsPx(`l2/sampler.ts` 取中位色)。
- Robolectric 4.16(≥4.15,满足 `robolectric.useRealAni`);convention plugin 已有 sysprop/gradleProperty 转发模式(robolectric.offline、uiv.device/state 同款),加一个 key 是一行改动。
- 仓库零 ATF/contrast 痕迹;libs.versions.toml 无 roborazzi-accessibility-check。
- verify-page 渲染入口 = 参数化测试类(CalibPageScreenshotTest:sysprop 选 device/state + captureRoboImage + dump),XML 版需对等新类;ComposablePreviewScanner 不适用 XML。

---

## 1. T4.4 XML View 路线(inflate + view tree 导出)

### 目标价值(设计文档定位)
- 文档一句话定位与"适用范围"均承诺"Compose **为主,兼顾** XML View";2.3 节给了 View 导出口径(`{resourceId, android:tag, bounds, text, TextView 字号/颜色}`),4 节给了 tag 契约变体(`android:tag="fig:<id>"`/resource-id `fig_123_456`)。
- 但 8 节 Phase 3 原文只是"**可选探索**";C1 已确认 Roborazzi 官方覆盖 XML inflate 形态(渲染可行性非风险)。5.3 CI 两道门对 XML 无专属口径(同一套 verify/verifyRoborazziDebug 通吃)。
- 价值本质:让存量 XML 宿主项目也能进 L2 验收。**当前 loop(../magpie_agent)的 ui_change 需求与 M0~M3 全部实证都在 Compose 上,XML 侧今天没有任何真实消费者。**

### 实现量级估算(若做完整闭环)
实为 T1.3+T3.4 的 View 侧重演,量级 ≈ M1 的 30~50%:
- **demo 侧**:res/layout fixture 卡片 + `ViewDumpRule`(递归 View 树导出成同 schema JSON)+ XML 版参数化截图测试类;convention plugin 不动。
- **uiv-core 侧**:SemanticsDump 各字段的 View 侧映射逐条核定——clickable(View.isClickable 语义≠Compose OnClick)、touchBounds(getHitRect+TouchDelegate,外扩语义不同)、hasVisualOverflow 无等价须换 `getEllipsisCount`(CS2 refuted 过一次:须 NATIVE+真 TextView measure+layout,T1.1 只钉过探针级)、colorHex/fontSize 仅 TextView、cornerRadius 不可得;join 增 resource-id 命名变体。
- **新增测试面**:ViewDumpRule 单测、schema 映射单测、View 侧 invariant 反例、"故意写偏 XML → violations 正确"端到端。
- 真正的成本不在 inflate(低风险)而在**字段语义对齐与 invariant 重钉**——每一项都是曾经返工过的口径类工作。

### 风险与依赖
- inflate 基建本身零新依赖(Robolectric 原生),风险低。
- 口径风险高:CS2 家族在 View 侧要重走"钉版本实测→定门禁/advisory"流程;混合页面(Compose 内嵌 AndroidView)两棵树拼接是文档未覆盖的开放题,极易范围失控。
- 无真实需求牵引 → 无法定义"够用"的验收锚点,违反方向锚定纪律②(YAGNI)。

### 建议
**入 backlog,登记触发条件 =「宿主项目出现真实 XML 页面验收需求」**。若 Codex 认为需留探路资产,可做**探针级最小版**(半个任务):仅 1 个 inflate+captureRoboImage 截图测试,机判"本工程 AGP9/Robolectric 组合下 XML 渲染形态可跑"(C1 边界在本仓库落地取证),**零 L2 接入、零 schema 扩展**。不建议中间态"最小闭环版"——tag join 一旦接入就拖动全部字段口径,砍不小。

---

## 2. T4.5 对比度 WCAG 像素增强(ATF ContrastCheck)

### 目标价值(设计文档定位)
- 3.3 节免基准套件第五类(CS7 confirmed):纯语义算不出 gradient/图片背景有效背景色,**须渲染 bitmap 交 Google ATF**;明文"归入 Phase 3 像素增强,**仅关键 UI 跑**"。
- 是 a11y invariant 面的自然补全(contentDescription 已在 T3.4 进门禁);分母是 WCAG 公理,与 parity 正交,不动存量断言。

### 实现量级估算(最小版 ≈ 半个~一个标准任务)
- **demo 侧**:引入 ATF 依赖——首选 `roborazzi-accessibility-check` 模块(与现 1.63 同版本族,官方封装 Robolectric+Compose 下的 ATF 检查,含 ContrastCheck)或直依 ATF jar;convention plugin 加一行转发 `robolectric.useRealAni`;新增 1 个关键 UI 对比度测试类(合格色/故意低对比两态红绿,即 M4 表验收原文)。
- **uiv-core 侧(可选二档)**:ATF 结果 → `violations`(judgePath:invariant, property:contrastInsufficient)注入 report;复用 T2.7 已打通的 png/bounds 解码基建做坐标反查。注意 **sampler 中位色不能直接复用为对比度算法**(文本区中位色混合字形与背景,前景/背景分离须 ATF 直方图法)——复用面是"像素通道管线",不是算法。
- **声明面**:"仅关键 UI"需 pin 时点显式声明(mapping.json 或 CLI 标志),不得运行期猜(设计原则 11)——这是最小版之外的新口径,可后置。

### 风险与依赖
- 依赖引入低风险(Google 官方 ATF,Maven Central;Roborazzi 模块同族)。
- `useRealAni` 切换对存量语义树导出/截图的扰动未验证 → 须一次机判回归(套 ConfigPinningTest 模式),且**仅在对比度测试类局部启用**更稳妥。
- 假阳性风险:抗锯齿/gradient 边缘在 xhdpi 截图上的噪声、大文本 3:1 例外——按 Phase 0 精神**未标定前只进 advisory,不进硬门禁**。
- 无真实"关键 UI"消费者,与 T4.4 同病,但它验收面小、可机判、依赖现成。

### 建议
**M4 内做最小版(A 档)**:ATF 依赖 + useRealAni 局部启用 + demo 关键 UI 用例红绿 + useRealAni 回归机判;report 注入与"仅关键 UI"声明面(B 档)**入 backlog 等真实需求**。若 M4 时间盒紧,整体 backlog 亦可接受——它与其他任务零耦合,随时可补。

---

## 3. 给 Codex 的裁定问题(逐条选边)

1. **T4.4 三选一**:(a) 纯 backlog+触发条件登记;(b) 探针级最小版(1 个 inflate 截图测试,零 L2 接入);(c) 最小闭环(ViewDumpRule+tag join+位置尺寸断言)。评估侧建议 (a),可接受 (b);(c) 认为砍不小,不建议。
2. **T4.4 若做 (b)/(c)**:是否明确排除 XML 侧 invariant(textOverflow/getEllipsisCount 重钉)出本期范围?评估侧:必须排除,否则拖入 CS2 重验。
3. **T4.5 三选一**:(A) 最小版进 M4(ATF+useRealAni+单用例红绿+回归机判,advisory 级);(B) A+report 注入+关键 UI 声明面;(C) backlog。评估侧建议 (A);(B) 的声明面口径等真实消费者。
4. **对比度结论落点**:未标定前 contrast 违规固定 advisory(subReason 类比 native_graphics_unverified),标定进门禁另立后续任务——是否认可此分期?
5. **优先级**:若 M4 只容一个,评估侧排序 T4.5 > T4.4(依赖现成/面小/验收原文已可机判 vs 口径重演/无消费者)。
6. **backlog 载体**:落 orchestration.md「4. 明确不做/显式推迟」段 + meta.json pending_followups,是否认可?

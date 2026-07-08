# 鹊眼(Magpie Eye)全量实现编排计划 v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行。里程碑开工前必须先生成该里程碑的代码级详细子计划(`.claude/plans/magpie-eye-full-impl/milestone-<N>.md`)并经 Codex 审查通过。
> v2 变更:吸收三视角对抗验证 30 条发现(覆盖率 12 / 反模式 8 / 自主性 10),关键修订:T1.0 拆分、T3.0 扩展点重核验(magpie_agent 已漂移 129 commit)、meta.json schema 扩充、全部验收改可机判形态。

**Goal:** 按 `docs/ui-visual-self-verification.md`(下称"设计文档")第 8 节 Phase 0~3 顺序,完整实现鹊眼工具链——headless JVM 渲染 + 三层裁判 + uiv CLI + magpie loop 接入 + CI 门禁,全程与 Codex 协同(计划共识 → 里程碑审查 → 争议决断)。

**Architecture:** 五层架构(工作流层/接口层/渲染层/基准层/裁判层),L2 结构断言为唯一硬门禁。实现顺序受设计文档 Phase 0 硬边界约束:口径标定与最小闭环达标前,不开工任何平台工程。

**Tech Stack:** uiv CLI = TypeScript(Node 26);渲染 = Gradle + AGP + Kotlin + Roborazzi 1.63 + Robolectric 4.16 + ComposablePreviewScanner 0.9;diff = odiff-bin 4.3.x + looks-same 10.x;基准 = Figma REST(主,fixture 先行)+ desktop MCP(辅)。

---

## 0. 执行模型(自主运行状态机)

- **状态文件** `.claude/plans/magpie-eye-full-impl/meta.json`(schema_version 2):
  - `tasks.<id>`: `{status: pending|in_progress|awaiting_review|done|blocked, last_commit}` —— commit message 必须带任务号,崩溃恢复按 last_commit 定位落盘点;
  - `milestones.<M>`: `{subplan: none|draft|approved, code_review: none|in_progress|approved, review_rounds: n}` —— 支撑"≤10 轮/节点"跨会话执行;
  - `codex`: `{transport: mcp|cli|plan-file, thread_id}` —— 三层降级后 id 语义不同,必须记通道;
  - `pending_followups[]` —— 延后补验项(如 PAT 到位后的 REST 交叉验证),防跨会话遗忘;
  - `calibration{}` / `latency_baseline{}` / `blockers[]`。
- **验收即门禁**:每任务验收必须是命令 + exit code / 测试 / 产物 schema 校验,禁止"需要人看"的验收。
- **提交纪律**:magpie_eye 每任务一 commit(带任务号);**mapping.json 与 baselines/\*\* 是提交资产必须入库**(baseline.png 体积大时评估 Git LFS),state.json/renders/reports 进 .gitignore;magpie_agent(M3)在分支 `feature/ui-visual-validation` 开发,不动 main。
- **无人值守权限预配**:开跑前一次性在项目 settings 配好 Bash allowlist(sdkmanager/gradlew/npm/npx/node)与网络域名白名单(dl.google.com、services.gradle.org、repo.maven.apache.org、maven.google.com、plugins.gradle.org、registry.npmjs.org),避免中途挂起等人。
- **Codex 协同节点**(单一 thread 贯穿):① 计划共识 → `consensus_reached: true`;② 里程碑子计划审查(开工前);③ 里程碑完成代码审查;每节点 ≤10 轮,超轮升级用户;决策链:设计文档 → Codex → 用户;Codex 决断优先。
- **失败处理**:环境类失败自主重试/换源;口径类失败(标定与文档假设冲突)回 Codex 决断;已证伪方案(C4/C6/CS2/CS5/CS6 原假设)不得复用。
- **方向锚定(防偏移,用户指令)**:北极星 = 设计文档的最终目标——Phase 0:模型仅凭 report.json ≤5 轮修到 L2 全过;全量:ui_change 需求在 magpie loop 全自动验收闭环。三条强制规则:① 任务开工前自检"这一步直接服务当前里程碑的哪条验收标准",答不上即停,回编排计划;② 实现内容超出编排计划范围或与设计文档冲突时,先回 Codex 决断/计划修订,禁止顺手扩散(YAGNI);③ 会话恢复或里程碑切换时,必须先重读本节 + 当前里程碑验收标准再行动;Codex 里程碑审查固定包含"是否偏离设计文档与最终目标"维度。

## 1. Blocker 清单

| # | 依赖 | 影响 | 缓解与降级 | 状态 |
|---|------|------|-----------|------|
| B1 | FIGMA_PAT(file_content:read + file_metadata:read,Dev/Full seat) | REST 真实拉取与 T1.0a③ 的 MCP↔REST 坐标交叉标定 | 开发期手工构造 REST-shape fixture;PAT 到位后执行 pending_followups:重录 fixture、复跑 T1.2 验收、完成 T1.0a 交叉标定 | 非阻塞降级中 |
| B2 | Figma desktop MCP 实际可用(≠端口探活):桌面 App 常驻、测试文件为活动 tab、MCP client 已注册(本会话 Figma MCP 已连接)、seat 非 View 档 | T1.0a 标定、T1.2 baseline.png 来源 | T1.0a 第一步先实调一次 `get_metadata` 校验返回结构(可机判);失败降级:人工导出 2x PNG + 按已知几何手写 spec fixture,降级触发与结果记 meta.json | 待 T1.0a 首步验证 |
| B3 | vlm-judge provider 形态需模型 API key(magpie providers) | T4.2 | 无 key 时只交付轻量形态(模型自读三联图),provider 形态入 pending_followups | 非阻塞 |

## 2. 里程碑与任务分解(优先级 = 列出顺序)

### M0 —— 仓库与环境奠基(全自主)

| 任务 | 内容 | 验收(可机判) |
|------|------|------|
| T0.1 ✅ | git init + .gitignore(运行产物三类 + .gradle-home + node_modules + build + local.properties)+ 首 commit | `git log` 非空 |
| T0.2 | Android SDK:cmdline-tools → `yes \| sdkmanager --licenses` → `platform-tools` + `platforms;android-36` + `build-tools;36.0.0`,**不装** emulator/system-images;安装根 `~/Library/Android/sdk`(覆盖空壳 cmdline-tools);demo 工程 local.properties 写 **sdk.dir**,任务级 env 设 ANDROID_HOME | `sdkmanager --sdk_root=$HOME/Library/Android/sdk --list_installed` 含三组件 |
| T0.3 | TS monorepo:`packages/uiv-core`(裁判/基准/报告纯逻辑)+ `packages/uiv-cli`(薄壳);vitest;严格 tsconfig | `npm test` exit 0 |

### M1 —— 设计文档 Phase 0:假设证伪 + 可用闭环(硬边界)

| 任务 | 内容 | 验收(可机判) |
|------|------|------|
| T1.0a | **Figma 侧标定(写 CLI 代码之前,纯 Figma 侧,不含 Robolectric)**(子计划须拆成三个独立机判断言:scale=2 像素尺寸 / Figma 单位→dp 标定 / get_metadata 坐标系判定):第一步实调 `get_metadata` 校验 B2;经 Figma MCP `create_new_file` 自建已知几何测试 frame(360×200 卡片:标题 16sp/padding 12/圆角 8/已知 fill);`get_screenshot`(2x)+ `get_metadata` 拉取 → ① 标定"1 Figma 单位=1dp"与 scale=2 像素对应;② `npx odiff-bin` 实测 2x 整页大图耗时;③ 标定 get_metadata 坐标系语义(绝对 vs 相对父级)。**calibration 标注 channel=mcp-only,容差常量在 PAT 交叉对比前视为暂定**;结论写 meta.json.calibration + `docs/calibration.md` | 随档附机判脚本:断言 \|报告尺寸×2 − PNG 实际像素\| ≤ 2px 等容差,exit 0 = 标定成立;非 0 = 证伪 → 回 Codex |
| T1.1 | **Day 1 demo 工程**:Gradle + `GRADLE_USER_HOME=./.gradle-home`;单 module Compose + build-logic convention plugin 雏形;Roborazzi 1.63 + Robolectric 4.16 + ComposablePreviewScanner;`@Config(qualifiers="w360dp-h800dp-xhdpi")` 钉死;`-Djava.awt.headless=true`;**可写可加载 dylib 的 java.io.tmpdir**;预热依赖 + android-all jar;中等复杂度卡片 + @Preview;实测暖/冷单轮延迟;**NATIVE 文本度量实测(CS1/CS2)**:NATIVE 下超长串 `hasVisualOverflow==true`、真 TextView measure+layout 后 `getEllipsisCount>0`、与 LEGACY 对比 → 结论决定文本溢出 invariant 门禁/advisory;**T1.0b 渲染侧标定**:渲染 T1.0a 同款卡片,与 Figma 侧标定值对比确认 density 对齐 | 截图测试 exit 0 出 PNG;离线重跑:`./gradlew --offline -Drobolectric.offline=true test...` exit 0;延迟/NATIVE/T1.0b 结论写 meta.json |
| T1.2 | **Day 2 uiv CLI 骨架**:`uiv baseline pull`(REST 客户端以**手工构造的 REST-shape fixture**驱动单测——几何值取自 T1.0a 自建 frame 已知设计值;baseline.png 用 desktop MCP `get_screenshot`(2x) 落盘;归一化含 C3 六条边界;写 mapping.json)+ `uiv check`(spawn `./gradlew testDebugUnitTest --tests ... -Proborazzi.test.compare=true`)+ L1(odiff 双指标 + looks-same 聚类,仅 advisory;**含 `--ignore-region` 声明持久化与 odiff ignore regions 传参**)→ report.json v0;pending_followups 登记"PAT 到位重录 fixture 复跑验收" | uiv check 端到端 exit 码正确且 report.json v0 过 schema 校验;归一化六边界单测过;mapping.json + baselines/** 已 git 跟踪入库 |
| T1.3 | **Day 3 semantics-exporter + L2 v0**:JUnit Rule(`onRoot(useUnmergedTree=true).fetchSemanticsNode()` 递归;`positionInRoot+size` px÷density→dp;不用 boundsInRoot)+ L2 v0(testTag `fig:<nodeId>` join;±2dp/精确 padding/±0.5sp/ΔE<3/圆角)+ **按设计文档 2.4 节"指标与判定口径"逐条实现:可比对节点集 N(三类排除,含 ignore-region 覆盖节点)、untaggedCoverage/matchRate/score 公式、severity 权重 v0(blocking=1.0/high=0.8/medium=0.4/low=0.1)、pass = (非 inconclusive) ∧ (**blockingSeverities 命中的违规数=0**,默认命中 blocking 与 high 两级) ∧ (score≥minScore) 三条件短路、blockingSeverities 默认 ["blocking","high"]** + state.json 防震荡(主键 blocking 违规数/次键 score、连续 2 轮停滞→regression+regressionReason、轮上限 5)→ report.json v1(violations + 确定性模板 hint) | 故意写偏卡片输出正确 violations;score/pass 判定单测与文档公式逐项一致;防震荡单测(含"先重构再修值"不误杀)过 |
| T1.4 | **Phase 0 验收(硬门)**:spawn 编码 subagent,**不下发渲染图路径且工具受限以机械落实"仅凭 report.json"**;写偏实现 → 迭代 → ≤5 轮 L2 全过 | 验收脚本核对最终 report.json pass=true 且轮次≤5;延迟数据落档 `docs/phase0-acceptance.md`;未达标 → 回 Codex,不进 M2 |

### M2 —— Phase 1:内循环提速 + 缓存

| 任务 | 内容 | 验收(可机判) |
|------|------|------|
| T2.1 | render-daemon 慢车道:Gradle Tooling API + **UDS** listener(0600);**daemon 由沙箱外进程启动(launchd user agent 或用户会话手动);热路径:Bash 内 uiv 仅为 UDS 薄客户端不碰 Gradle;冷路径(daemon 不可用时):允许 uiv 在沙箱内 spawn `--no-daemon` 跑 Gradle**;交付 `sandbox.network.allowUnixSockets` 白名单配置说明 | 热/冷两路径产出等价 report;沙箱模拟下热路径可达 |
| T2.2 | odiff server 模式常驻接入 | L1 耗时对比落档 |
| T2.3 | 快车道可行性验证(Paparazzi 2.0-alpha05 钩子 / 自建 persistent worker);**纳入前置加固:UDS 或 token 鉴权、禁裸 localhost HTTP 触发构建,加固完成是 Codex 决断纳入的前置条件** | 可行性结论 + 数据落档,交 Codex 决断 |
| T2.4 | figma-spec-cache:`(fileKey,nodeId,version)` 缓存、配额预算器(15/min·200/day);**变量解析可插拔三级降级:MCP get_variable_defs → styles 映射 → Tokens Studio 导出 JSON** | 客户端加请求计数器,内循环全程断言 Figma 请求数=0;MCP 不可用时经降级通道解出 token 值(fixture 驱动) |
| T2.5 | L2 降级匹配(文本相似度≥0.95 + GUIPilot 式 LCS)+ **untaggedCoverage 门禁语义:< 阈值(默认 0.9,随合同固化)→ `pass:false` + `inconclusive(tag_coverage_low)` + 缺 tag 清单;matchRate<0.8 熔断 → `pass:false` + `inconclusive(matching_rate_low)` + 匹配失败报告(非豁免)** | 匹配层单测五类:tag 缺失/文本命中/交换位/缺失组件/**低覆盖低匹配率下验收不得 pass** |
| T2.6 | `uiv check --record`:全过后录 Roborazzi golden(src/test/snapshots)并提示提交 | record 后 golden 存在且 `verifyRoborazziDebug` 可跑出绿 |
| 里程碑验收 | 慢车道 P50 ≤ Phase 0 实测值 60%;快车道可行则 P50≤6s/P90≤10s,否则如实记录 | 数据落档 + Codex 审查通过 |

### M3 —— Phase 2:magpie loop 接入(`/Users/zhuxi/AI/magpie_agent`,分支开发)

| 任务 | 内容 | 验收(可机判) |
|------|------|------|
| **T3.0** | **扩展点重核验(新增,前置)**:magpie_agent 已漂移(8e0dcb2→当前 HEAD,约 129 commit,文档行号锚点失效)。机判 grep 断言:RequirementEvidenceType union、`hasEvidenceType` 仍为 ANY-of(`items.some`)、`persistRequirementContract` 仍覆盖写、`runSafeCommand` 签名——任一语义变化即回 Codex 决断;后续实现一律用**符号名**不用行号 | 核验脚本 exit 0;HEAD hash + 各符号位置写 meta.json |
| T3.1 | 四文件改动:evidence-taxonomy.ts(union + collectRequirementEvidence)、state/types.ts(uiVisualValidationPath)、requirement-contract.ts(构建器读 mapping.json、仅合并 scope.sourceDocumentPath 匹配条目、合成独立判定单元、hash 仅漂移告警)、execute.ts(**仅当合同携带 uiParity 指纹时**经 runSafeCommand 调 verify-page)。禁止直接写合同 JSON | magpie_agent 存量测试不回归;无 uiParity 合同的 session 不产生 uiVisualValidationPath |
| T3.2 | `uiv pin`:mapping.json(fileKey/nodeId/version/minScore/matrix/scope/states[])+ 触发合同 re-persist;COMPONENT_SET 自动枚举 variant 分状态基准(CS6);无 scope 条目永不入合同 | pin 后合同含 uiParity 与专项 requiredEvidence;standalone pin 不入合同 |
| T3.3 | `uiv verify-page`:设备 5 格 × 内容态 **L 形 + 三个显式交叉点(fontScale1.3×longText、smallPhone×longText、dark×error)**;page-report.json 落 `.magpie/sessions/<id>/`;**失败分类映射(设计文档 3.2C):violations→behavior_drift、missing→implementation_gap、tag_coverage_low/matching_rate_low→implementation_gap、semantics_export_failed/render_harness_error/figma_spec_invalid/编译失败→environment_gap;仅 implementation_gap/behavior_drift 类注入 retryStateNote,环境故障不进模型修正回路**;violations 补 source 行号(testTag 字面量 grep) | 整页验收端到端跑通;perCell 含三交叉格;分类映射单测过 |
| T3.4 | 内容态验证:characters/imageRef fixture 注入(@PreviewParameter + FakeImageLoaderEngine);**fixture 放大确定性:种子固定、禁运行期 Random**;L2-invariant 套件(childClipped/siblingOverlap/`touchBoundsInRoot` 最小触控/contentDescription 进门禁;文本溢出截断按 T1.1 NATIVE 结论);judgePath 落 report | invariant 各项单测过;同 fixture 重复渲染字节级一致 |
| T3.5 | **五个反例测试**:① ANY-of 反例(有 integration_test_result 缺 ui_visual_validation → fail);② 合同重建幂等;③ 作用域反例;④ 内容态反例(longText 溢出→invariant fail;parity 态 fixture 几何可比);⑤ **环境故障反例(render_harness_error 归 environment_gap,不注入模型修正指引)** | 五反例 + 存量回归全绿;一个 ui_change 需求在 loop 全自动跑通 |

### M4 —— Phase 3:门面与整页裁判(按需)

| 任务 | 内容 | 验收(可机判) |
|------|------|------|
| T4.1 | ui-verify MCP server(stdio,复用 uiv-core) | 集成测试:stdio 拉起 server → 调 ui_check → 断言 report.json 结构;交互演示仅作补充 |
| T4.2 | vlm-judge:**仅 L1/L2 全过后触发 L3**;轻量形态(模型自读三联图+量规)必交付;provider 形态视 B3 | L2 fail 的整页报告不含 L3 调用痕迹;证据锚定(无证据判定丢弃)单测过 |
| T4.3 | CI 两道门(本地可机判形态):本地脚本模拟 CI 入口跑 `uiv verify-page`(parity 硬门禁)+ `verifyRoborazziDebug`(默认仅报告,声明容差比较器 + ignore-region 后方可阻断)+ `uiv report --junit` + 漂移哨兵(告警不阻断);**真实远程 CI 接入列用户侧后续项** | 本地 CI 脚本红绿正确;JUnit XML 过 schema 校验 |
| T4.4 | (可选)XML View 路线:inflate + view tree 导出 | 按需 |
| T4.5 | (可选)对比度 WCAG 像素增强:渲染 bitmap → Google ATF ContrastCheck,仅关键 UI,`robolectric.useRealAni`(4.15+) | 关键 UI 对比度用例红绿正确 |

## 3. 滚动详细计划策略

本文档是编排层。每里程碑开工前生成代码级 bite-size 子计划(完整测试代码/命令/预期输出,TDD),交 Codex 审查通过后执行。理由:M1 实测数据(延迟/NATIVE/标定)先于详设,与设计文档"先实测、再定预算"一致。

## 4. 明确不做 / 显式推迟 / Release Gate

不做:裸像素还原度门禁、VLM 直接打分、模拟器/真机路线、暖 daemon 秒级承诺、desktop MCP 免配额假设、Linux CI 像素 golden。
推迟(入 pending_followups):PAT 到位后的 REST 交叉标定与 fixture 重录;真实远程 CI;provider 形态 vlm-judge(视 API key)。
**Release Gate(Codex 裁定)**:"全量完成/生产可用"的定义包含 PAT 到位后的真实 Figma REST 通道闭环验证(交叉标定 + fixture 重录 + T1.2 验收复跑)。在此之前,即使 M0~M4 全部任务 done,状态只能标"fixture 驱动实现完成",不得宣称 REST 通道闭环。

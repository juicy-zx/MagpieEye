# 鹊眼(Magpie Eye)全量实现编排计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行。里程碑开工前必须先生成该里程碑的代码级详细子计划(`.claude/plans/magpie-eye-full-impl/milestone-<N>.md`)并经 Codex 审查通过。

**Goal:** 按 `docs/ui-visual-self-verification.md`(下称"设计文档")第 8 节 Phase 0~3 顺序,完整实现鹊眼工具链——headless JVM 渲染 + 三层裁判 + uiv CLI + magpie loop 接入 + CI 门禁,全程与 Codex 协同(计划共识 → 里程碑审查 → 争议决断)。

**Architecture:** 五层架构(工作流层/接口层/渲染层/基准层/裁判层),L2 结构断言为唯一硬门禁。实现顺序受设计文档 Phase 0 硬边界约束:口径标定与最小闭环达标前,不开工任何平台工程(daemon/MCP server/VLM judge/CI)。

**Tech Stack:** uiv CLI = TypeScript(Node 26,与 magpie 同栈);渲染 = Gradle + AGP + Kotlin + Roborazzi 1.63 + Robolectric 4.16 + ComposablePreviewScanner 0.9;diff = odiff-bin 4.3.x + looks-same 10.x;基准 = Figma REST(主)+ desktop MCP(辅)。

---

## 0. 执行模型(自主运行状态机)

- **状态文件**:`.claude/plans/magpie-eye-full-impl/meta.json`,结构:
  ```json
  {
    "task_slug": "magpie-eye-full-impl",
    "codex_thread_id": "<threadId>",
    "consensus_reached": false,
    "current_milestone": "M0",
    "tasks": { "T0.1": "pending|in_progress|done|blocked" },
    "blockers": [],
    "calibration": {},
    "latency_baseline": {}
  }
  ```
  每个任务状态变更后立即写回;任何新会话从 meta.json 恢复进度,幂等续跑。
- **验收即门禁**:每个任务定义可机判的验收命令(exit code / 测试通过 / 产物存在且 schema 合法)。验收不过不得置 done。
- **提交纪律**:magpie_eye 仓库 git init 后每任务一 commit;magpie_agent 仓库(M3)在独立分支 `feature/ui-visual-validation` 上开发,不动 main。
- **Codex 协同节点**(单一 threadId 贯穿):
  1. 计划共识(本文档)→ `consensus_reached: true`
  2. 每个里程碑子计划审查(开工前)
  3. 每个里程碑完成后代码审查(≤10 轮/节点,超轮升级用户)
  4. 决策链:设计文档 → Codex → 用户,不跳级;Codex 决断优先。
- **失败处理**:环境类失败(下载超时/工具缺失)自主重试与换源;口径类失败(标定结论与文档假设冲突)必须回 Codex 决断后再继续;设计文档被证伪的方案(C4/C6/CS2 等)一律不得复用。

## 1. Blocker 清单(唯一需用户输入项)

| # | 依赖 | 影响任务 | 缓解 | 状态 |
|---|------|---------|------|------|
| B1 | FIGMA_PAT(scope: file_content:read + file_metadata:read,Dev/Full seat) | T1.2 REST 真实拉取、M2 配额预算器真实验证 | 开发期以录制 fixture 驱动;标定走已连接的 Figma desktop MCP(端口 3845 已探活);PAT 到位后补一次真实 REST 验证 | **非阻塞降级中** |
| 其余 | 无 | — | Android SDK 自主安装;测试设计稿经 Figma MCP `create_new_file` 自建已知几何 frame | — |

## 2. 里程碑与任务分解(优先级 = 列出顺序)

### M0 —— 仓库与环境奠基(全自主,无外部 blocker)

| 任务 | 内容 | 验收 |
|------|------|------|
| T0.1 | `git init` + `.gitignore`(`.ui-verify/state.json|renders/|reports/`、`.gradle-home/`、`node_modules/`、`build/`、`.DS_Store`)+ 首次 commit(docs + plans) | `git log` 有初始提交 |
| T0.2 | 安装 Android SDK:cmdline-tools → `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`;**不装** system-images/emulator;写 `ANDROID_HOME` 至 local.properties 与任务级 env | `sdkmanager --list_installed` 含上述三项 |
| T0.3 | TS monorepo 脚手架:`packages/uiv-core`(裁判/基准/报告纯逻辑)+ `packages/uiv-cli`(薄壳);vitest;严格 tsconfig | `npm test` 通过(空测试集绿) |

### M1 —— 设计文档 Phase 0:假设证伪 + 可用闭环(硬边界)

| 任务 | 内容(设计文档锚点) | 验收 |
|------|------|------|
| T1.0 | **Day 0.5 口径标定,写 CLI 代码之前**:① 经 Figma MCP 自建已知几何测试 frame(如 360×200 卡片:标题 16sp、padding 12、圆角 8),`get_screenshot`(2x)+`get_metadata` 拉取,与 Robolectric `@Config(xhdpi)` 渲染对比,标定"1 Figma 单位=1dp"与 density 2.0↔scale=2 对齐;② `npx odiff-bin` 实测 2x 整页大图耗时;③ 标定 `get_metadata` 坐标系语义(绝对 vs 相对父级)。结论写入 meta.json `calibration` 并落档 `docs/calibration.md`。任一证伪 → 回 Codex 决断修正容差口径 | 三项结论落档;容差常量以配置文件固化 |
| T1.1 | **Day 1 demo 工程**:Gradle(禁用沙箱内 daemon 场景用 `--no-daemon`)+ `GRADLE_USER_HOME=./.gradle-home`;单 module Compose 应用 + build-logic convention plugin 雏形;Roborazzi 1.63 + Robolectric 4.16 + ComposablePreviewScanner;`@Config(qualifiers="w360dp-h800dp-xhdpi")` 钉死;`-Djava.awt.headless=true`;预热依赖 + android-all jar + `robolectric.offline=true` 断网验证;中等复杂度卡片组件 + @Preview;**实测暖/冷单轮延迟落档**;**NATIVE 文本度量钉版本实测(CS1/CS2)**:`@GraphicsMode(NATIVE)` 下超长串 `hasVisualOverflow==true`、真 TextView `getEllipsisCount>0`,与 LEGACY 对比,结论决定文本溢出 invariant 进门禁或永久 advisory | 截图测试跑通出 PNG;断网重跑通过;延迟与 NATIVE 结论写入 meta.json |
| T1.2 | **Day 2 uiv CLI 骨架**:`uiv baseline pull`(REST nodes+images 客户端以录制 fixture 驱动单测;version 钉住;Framelink 式归一化含 C3 六条边界:null bounds/rectangleCornerRadii/characterStyleOverrides/GRID/预算/图片 null;写 mapping.json)+ `uiv check`(spawn `./gradlew testDebugUnitTest --tests ... -Proborazzi.test.compare=true`)+ L1(odiff 双指标 + looks-same 聚类,**仅 advisory**)→ report.json v0(schema 含 pass/reason/subReason/compileError/pixel/artifacts) | uiv check 对 demo 卡片端到端跑通出 report.json v0;单测覆盖归一化六条边界 |
| T1.3 | **Day 3 semantics-exporter + L2 v0**:JUnit Rule(`onRoot(useUnmergedTree=true).fetchSemanticsNode()` 递归导出;`positionInRoot+size` px ÷ density→dp;**不用** boundsInRoot 当 dp)+ L2 v0(仅 testTag `fig:<nodeId>` 主策略 join;位置/尺寸 ±2dp、padding/itemSpacing 精确、字号 ±0.5sp、颜色 ΔE<3、圆角断言)+ state.json 防震荡(blocking 违规数主键 + score 次键,连续 2 轮停滞→regression+regressionReason,轮上限 5)→ report.json v1(violations+确定性模板 hint) | 对故意写偏的卡片输出正确 violations;防震荡单测(含"先重构再修值"不误杀用例)通过 |
| T1.4 | **Phase 0 验收(设计文档硬门)**:spawn 编码 subagent,给 Figma 测试卡片 spec → 写偏实现 → 仅凭 report.json(禁看渲染图)迭代 → **≤5 轮 L2 全过**;全程延迟数据落档 | 验收录档 `docs/phase0-acceptance.md`;未达标 → 回 Codex 分析根因,不进 M2 |

### M2 —— 设计文档 Phase 1:内循环提速 + 缓存

| 任务 | 内容 | 验收 |
|------|------|------|
| T2.1 | render-daemon 慢车道:Gradle Tooling API 常驻 + **UDS** listener(不裸 localhost HTTP);`uiv check` 热路径走 UDS、daemon 未启动降级 spawn `--no-daemon` 冷路径 | 热/冷两路径均出相同 report;UDS 权限 0600 |
| T2.2 | odiff server 模式常驻接入 daemon | L1 耗时对比落档 |
| T2.3 | 快车道可行性验证:Paparazzi 2.0.0-alpha05 程序化钩子渲染静态 @Preview;不可行 → 评估自建 persistent worker;均不可行 → 如实记录并定格慢车道预算 | 可行性结论 + 数据落档,交 Codex 决断是否纳入 |
| T2.4 | figma-spec-cache:`(fileKey,nodeId,version)` 缓存、配额预算器(15/min·200/day 默认)、desktop MCP 辅助通道(get_variable_defs 解 token) | 断网(预热后)内循环全程零 Figma 调用可跑 |
| T2.5 | L2 降级匹配:文本相似度 ≥0.95(降级 1)+ GUIPilot 式 LCS 几何对齐(降级 2);untaggedCoverage 指标;matchRate<0.8 熔断为匹配失败报告 + `inconclusive(matching_rate_low)` | 匹配层单测:tag 缺失/文本命中/交换位/缺失组件四类用例通过 |
| 里程碑验收 | 慢车道 P50 ≤ Phase 0 实测值 60%;快车道若可行 P50≤6s/P90≤10s,否则如实记录 | 数据落档 + Codex 审查通过 |

### M3 —— 设计文档 Phase 2:magpie loop 接入(仓库 `/Users/zhuxi/AI/magpie_agent`,分支开发)

| 任务 | 内容 | 验收 |
|------|------|------|
| T3.1 | 按设计文档 5.1 节四文件改动:evidence-taxonomy.ts(union + collectRequirementEvidence)、state/types.ts(uiVisualValidationPath)、requirement-contract.ts(构建器读 mapping.json、**仅合并 scope.sourceDocumentPath 匹配条目**、合成独立判定单元)、execute.ts(runSafeCommand 调 verify-page)。**禁止**直接写合同 JSON | magpie_agent 存量测试不回归 |
| T3.2 | `uiv pin`:写 mapping.json(fileKey/nodeId/version/minScore/matrix/scope/states[])+ 触发合同 re-persist;COMPONENT_SET 自动枚举 variant 分状态基准(CS6) | pin 后合同含 uiParity 与专项 requiredEvidence |
| T3.3 | `uiv verify-page`:设备 5 格 × 内容态 L 形矩阵;page-report.json 落 `.magpie/sessions/<id>/`;fail 摘要注入 retryStateNote;violations 补 `source` 行号(testTag 字面量 grep) | 整页验收端到端跑通 |
| T3.4 | 内容态验证:characters/imageRef fixture 注入(@PreviewParameter + FakeImageLoaderEngine);L2-invariant 套件(childClipped/siblingOverlap/`touchBoundsInRoot` 最小触控/contentDescription 进门禁;文本溢出截断按 T1.1 NATIVE 结论定门禁或 advisory);judgePath 落 report | invariant 各项单测通过 |
| T3.5 | **四个反例测试(设计文档 Phase 2 验收标准,一个不可少)**:① ANY-of 反例(有 integration_test_result 缺 ui_visual_validation → fail);② 合同重建幂等(反复 persistRequirementContract 不丢 uiParity);③ 作用域反例(他任务 pin 不污染不相关合同);④ 内容态反例(longText 故意溢出 → invariant fail;parity 态注入 fixture 几何可比) | 四反例 + 存量回归全绿;一个 ui_change 需求在 loop 全自动跑通 |

### M4 —— 设计文档 Phase 3:门面与整页裁判(按需)

| 任务 | 内容 | 验收 |
|------|------|------|
| T4.1 | ui-verify MCP server(stdio,复用 uiv-core;ui_check/ui_verify_page/ui_baseline) | Claude Code 经 MCP 完成 Phase 0 同场景 |
| T4.2 | vlm-judge 双形态:轻量(模型自读三联图+量规)+ provider 形态(复用 magpie providers);证据锚定,无证据判定丢弃,结论仅建议 | 整页报告含 L3 分级建议 |
| T4.3 | CI 两道门:`uiv verify-page` parity 硬门禁 + `verifyRoborazziDebug` 回归套件(默认仅报告)+ `uiv report --junit` + 漂移哨兵(告警不阻断) | CI 红绿门与漂移告警生效 |
| T4.4 | (可选)XML View 路线:inflate + view tree 导出 | 按需 |

## 3. 滚动详细计划策略

本文档是**编排层**(任务/顺序/验收/协议)。每个里程碑开工前,生成该里程碑的**代码级 bite-size 子计划**(含完整测试代码、命令、预期输出,TDD,遵循 writing-plans 规范),交 Codex 审查通过后执行。理由:一次性写出 4 个 Phase 的代码级计划会在 M1 实测数据(延迟/NATIVE/标定)出来后大面积作废——实测先于详设,与设计文档"先实测、再定预算"原则一致。

## 4. 明确不做(与设计文档非目标对齐)

裸像素还原度门禁、VLM 直接打分、模拟器/真机路线、暖 daemon 秒级承诺、desktop MCP 免配额假设、Linux CI 像素 golden 校验。

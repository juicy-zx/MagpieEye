---
id: design-ui-visual-self-verification
status: implemented
owner: "agent"
tags: ["android", "compose", "figma", "ui-validation", "loop", "rendering", "sandbox"]
created: 2026-06-12
verified: 2026-06-12
---

> 实现状态以 `.claude/plans/magpie-eye-full-impl/meta.json` 为准；§8 分阶段计划与 §2.5 CLI 示例为设计期历史口径（CLI 示例重写已单独落账 pending_followups）。

# 鹊眼（Magpie Eye）：安卓 UI 还原度自检与纠错工具链

一句话定位：一套零 TCC、免模拟器的 macOS 本地"渲染 → 比对 → 批判"工具链，把 headless JVM 渲染（Roborazzi/Robolectric）封装成模型随手可调的反馈工具，让 LLM 写 Compose/XML 布局时不再盲写。

> 本文档已按对抗验证结果修正了原方案中两条被证伪的承重断言（C4：desktop MCP 免配额；C6：暖 Gradle daemon 可达 2~6s 内循环）与两条存疑断言的边界（C5：语义树导出 API 口径；C9：证据验收 ANY-of 语义），详见 [事实核查结果表](#7-事实核查结果表)。

## 背景与动机

### 痛点：模型盲写 UI 的问题本质

在安卓自动化开发中，编码模型通过 Figma MCP 拿到设计稿上下文后编写布局代码（Jetpack Compose 为主，兼顾 XML View），但写完代码看不到渲染结果，实际效果与设计稿差距大。问题可以分解为三个缺失：

- **缺眼睛**：模型无法看到自己代码的渲染结果。间距、对齐、字号、颜色、层级全凭对 Modifier 语义的"想象"，错了也不自知。
- **缺尺子**：即使有了渲染图，"像不像设计稿"也无法量化。裸像素 diff 受跨渲染器底噪污染，VLM 对几像素差异天然盲视（实证仅 58% 低级几何任务准确率，[VLMs-are-blind, ACCV 2024](https://arxiv.org/abs/2407.06581)），都给不出"第 N 个节点 padding 期望 12dp 实际 16dp"级别的可执行结论。
- **缺裁判**：没有机器可判的验收门。magpie loop 的 requirement-contract 对 `ui_change` 类需求目前只能用 `integration_test_result` 兜底，"还原度"这一最核心的验收维度完全缺位。

迭代视觉反馈的收益已有实证：UI2Code^N（[arXiv 2511.08195](https://arxiv.org/html/2511.08195v3)）显示真实网页还原成功率随反馈轮数从 66.0%（1 轮）升至 74.0%（5 轮），5 轮后饱和。

### 目标

1. **组件级内循环**：模型"写一个组件 → 看到结构化违规清单 → 定向修正"，每轮延迟尽可能低（实测定预算，见 MVP 计划）。
2. **整页级外循环**：整页布局 vs 设计稿的还原度契约与门禁，覆盖多状态、多尺寸、深色模式、字号缩放。
3. **三种接入形态**：magpie loop requirement-contract 验收门、Claude Code 等通用 harness、CI 回归门。
4. **零 TCC、零 Hypervisor**：全链路不触发任何 macOS 权限弹窗，适合无人值守 agent 沙箱。
5. **反馈机器可读且可定位**：违规条目精确到属性、期望值、源码文件行号。

### 非目标

- 不追求与真机像素级一致（layoutlib/RNG 与真机存在系统性保真度偏差，见[适用范围](#适用范围)）。
- 不覆盖动画时序、滚动物理、手势、性能（掉帧/过度绘制）、IME/系统 inset 真实行为——这些仍需模拟器/真机。
- 不做"设计稿 PNG vs 渲染 PNG"的裸像素还原度打分——像素 diff 只做差异定位器，不做裁判。
- 不替代设计评审：L3 VLM 裁判的结论只作建议，不作硬门禁。

## 设计原则

1. **L2 结构断言是唯一硬门禁，L1 像素 diff 仅 advisory**。Figma 服务端渲染与 Skia headless 渲染在抗锯齿/字体度量上系统性不同，裸像素 diff 永远有底噪；几何/字号/颜色值断言不受渲染管线影响，跨平台稳定。L1 保留差异定位价值（差异簇坐标反查语义树节点），但不参与 pass/fail 判定——消除底噪驱动的噪声排查分支，这是防 flake 疲劳的最关键一条。
   *（取舍：原鹊眼方案 L1 为"双阈值闸"硬门禁，嫁接评审方案的 advisory 纪律后取消其门禁地位。）*
2. **防震荡由工具强制，不靠模型自律——但比较是分层的，不是单一分数严格单调**。`uiv` 在 `.ui-verify/state.json` 持久化上轮指标，按两级判定"有没有变好"：主键是 blocking/high 违规数（不得增加），次键是总分（high 违规数严格下降时容忍总分 ≤0.02 的小幅回退，避免卡在局部最优）。两级均无改善记一轮停滞，**连续 2 轮停滞才输出 `regression: true` 强制回退**，且必须同时输出 `regressionReason`（哪个指标、从多少到多少）；轮数上限 5（UI2Code^N 实证 5 轮饱和）。出处：ReLook 的 Forced Optimization 规则（[arXiv 2510.11498](https://arxiv.org/abs/2510.11498)），此处放宽为分层比较 + 两轮触发——纯严格单调会把"先重构再修值"这类合理路径误杀。
   *（取舍：原方案的 `roundDelta.improving` 仅是报告提示字段，嫁接后升级为 CLI 强制输出。）*
3. **渲染失败一律 fail**，防 reward hacking（同样出自 ReLook）。编译错误时报告只含 `compileError`，模型先修编译。
4. **零 TCC、零 Hypervisor、免模拟器**。headless JVM 渲染已经符号级取证确认为纯用户态进程内位图操作（核查项 C2）；模拟器（Hypervisor entitlement）、屏幕截图（Screen Recording TCC）、UI 自动化（Accessibility TCC）路线一概不用。
5. **Figma 配额预算化，内循环零 Figma 调用**。"desktop MCP 免配额"已被官方限额文档证伪（核查项 C4）：所有读取类 MCP 工具按 seat/plan 计量（Pro 计划 Dev/Full seat 仅 15 次/分、200 次/天）。因此基准必须按 `(fileKey, nodeId, version)` 钉版本落盘缓存，内循环全走本地缓存；拉取时合批请求并经配额预算器节流。
6. **基准指纹随合同固化，但 source of truth 是 mapping.json**。`uiv pin` 把 `{fileKey, nodeId, version, minScore, matrix}` 写入 `.ui-verify/mapping.json`，由合同构建器在每次重建时**按源文档作用域**合并进 RequirementContract（条目带 scope，旧任务的 pin 不污染新合同）——合同是源文档的纯函数式派生物，直接改生成后的合同 JSON 会被重建静默覆盖（见 5.1 节持久化口径）。重验时 version 不变即全走本地缓存，杜绝比对期间设计师改稿造成的假阳性。
7. **契约本身是被验收的对象，覆盖不足即不通过**。testTag 命名契约靠 prompt 强制，`uiv check` 输出 untaggedCoverage 指标：内循环中给出缺 tag 节点清单作为修正反馈；但在最终验收（verify-page / requirement-contract 门禁）里，覆盖率低于阈值直接 `pass: false, reason: "inconclusive"`——testTag 是 L2 的硬前置（C5），少打 tag 等于让结构断言失明，绝不能用 warning 放行，否则模型可以靠不打 tag 规避门禁。
8. **VLM 裁判必须证据锚定**。L3 仅整页验收触发，输入强制三件套（diff 叠加图 + 差异簇坐标 + 固定量规清单），逐项要求引用簇坐标作证据，无证据的 pass/fail 一律丢弃（依据 VLMs-are-blind 与量规分解实证 [RRD](https://arxiv.org/html/2602.05125v1/)）。
9. **沙箱通信首选 Unix domain socket**。Claude Code Seatbelt 沙箱内 Bash 子进程出站连 127.0.0.1 默认被拒（EPERM，[issue #28018](https://github.com/anthropics/claude-code/issues/28018)），薄客户端 → 渲染守护进程的通道默认走 UDS + `sandbox.network.allowUnixSockets` 路径白名单（核查项 C8 边界）。
10. **匹配失败防腐熔断，但熔断 = 不通过**。L2 匹配率 <80% 时不强行断言（坏匹配生成误导性违规清单会把模型带偏），改输出"匹配失败报告"（双树 dump + 未匹配清单）帮助模型修复匹配；但 verdict 是 `pass: false, reason: "inconclusive"`——验不了不等于过了，匹配失败的组件不可能通过验收。
11. **内容态分 parity / invariant 两条互斥判定路径，由"有没有 Figma 基准"决定，绝不混用**。同一组件在不同内容下（空/典型/超长/错误/RTL）渲染结果不同；某内容态在 Figma 里有对应设计（variant 或独立 frame）→ pin 成它自己的基准走 **parity**（沿用 L2 逐属性几何断言）；没有对应设计（超长服务端文案、动态大列表、运行期才知的 i18n）→ 无从谈"像不像稿"，只能走 **invariant**：从同一份已导出语义树算一组绝对正确性不变量（文本溢出、子超父裁剪、兄弟重叠、最小触控、contentDescription 缺失），任一触发即 fail。parity 的分母是 Figma 真值，invariant 的分母是 Material/WCAG/几何公理。详见 [3.3 节](#33-内容态验证parity-vs-invariant)。

## 标准做法

### 1. 方案总览

五层架构，数据自上而下流动，反馈自下而上回流：

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① 工作流层（消费方）                                                    │
│   magpie loop（requirement-contract 验收）│ Claude Code 等 harness │ CI │
└──────────┬──────────────────────┬───────────────────┬────────────────┘
           │ spawn CLI(exit+JSON)  │ MCP tools(stdio)   │ gradle task
┌──────────▼──────────────────────▼───────────────────▼────────────────┐
│ ② 接口层                                                               │
│   uiv CLI（pin / baseline / check / verify-page / report）             │
│   ui-verify MCP server（ui_check / ui_verify_page / ui_baseline，可选） │
│   ※ 两者都是同一 core 库的薄壳；MCP server 进程运行在 Bash 沙箱之外        │
└──────────┬───────────────────────────────────────────┬───────────────┘
           │ Unix socket（默认）或 127.0.0.1+token        │ 本地读写
┌──────────▼─────────────────────┐  ┌──────────────────▼───────────────┐
│ ③ 渲染层（沙箱外常驻）             │  │ ④ 基准层（figma-spec-cache）       │
│  render-daemon（JVM）            │  │  主通道: REST /v1/files/:k/nodes  │
│  ├ 慢车道（正确性兜底）:           │  │    + /v1/images（钉 version）     │
│  │  Gradle 直跑 testDebugUnitTest│  │  辅助通道: desktop MCP            │
│  │  --tests + Roborazzi compare  │  │    127.0.0.1:3845（variable_defs │
│  │  （单轮 10~30s，逐轮付冷启动）   │  │    解 token 值 / 截图）           │
│  └ 快车道（延迟优先，Phase 1）:    │  │  配额预算器（15/min·200/day 默认） │
│     常驻渲染 JVM persistent       │  │  归一化 spec.json + baseline.png │
│     worker（Paparazzi 程序化钩子   │  │  缓存键 (fileKey,nodeId,version) │
│     或自建嵌入式 Robolectric）      │  │  mapping.json（索引+契约登记表）   │
└──────────┬─────────────────────┘  └──────────────────┬───────────────┘
           │ rendered.png + semantics.json              │ spec.json + baseline.png
┌──────────▼────────────────────────────────────────────▼───────────────┐
│ ⑤ 裁判层（全本地）                                                       │
│  L1 像素（advisory，不参与门禁）: odiff server 模式（YIQ+忽略抗锯齿）       │
│     + looks-same 差异聚类 → 差异簇包围盒 → 反查语义树节点定位               │
│  L2 结构（唯一硬门禁）: 语义树↔Figma 节点树（testTag→文本→LCS 三级匹配）     │
│     → 逐属性断言（位置/尺寸±2dp、padding、字号±0.5sp、颜色ΔE<3、圆角）       │
│  L3 VLM（仅整页验收）: 三联图+簇坐标+量规清单 → 严重度分级+修正建议           │
│  输出: report.json（violations + source 行号 + hint）+ diff 叠加图        │
│  state.json: 防震荡工具强制（分层指标对比，连续 2 轮停滞→regression）      │
└────────────────────────────────────────────────────────────────────────┘
```

**数据流（一次内循环）**：模型改代码 → `uiv check` → daemon 增量编译 + 定向渲染 → PNG + 语义树 → L1（定位）/L2（门禁）比对（基准来自缓存，零 Figma API 调用）→ report.json 回给模型 → 模型按违规清单与 source 行号定向修正。整页外循环额外触发 L3，结果落入 `.magpie/sessions/<id>/` artifacts 供 requirement-contract 验收。

**产物目录约定**（全部落在 cwd 内，满足沙箱写白名单；按"提交资产 / 运行产物"分级）：

```
.ui-verify/
├── mapping.json                       # 【提交】{"fig:12:34": {fileKey, nodeId, version, previewFqn, scope}}
│                                      # 一份文件三个角色：基准缓存索引 / testTag 契约登记表 /
│                                      # 合同构建器合并 uiParity 的 source of truth（防重建覆盖丢失）
├── state.json                         # 【忽略】防震荡分层指标（上轮 blocking 违规数 + 总分），运行产物
├── baselines/<nodeId>@<version>/      # 【提交】spec.json + baseline.png（Figma 真值，钉版本）
├── renders/<component>/               # 【忽略】rendered.png + semantics.json，可再生
└── reports/<component>/               # 【忽略】report.json + diff-overlay.png + triptych.png，可再生
```

**资产分级**：`mapping.json` 与 `baselines/**` 是**提交资产**——前者是合同 source of truth，后者让 CI 的 parity 门禁离线可跑（不依赖 Figma PAT 与配额；baseline.png 体积大时上 Git LFS）。`state.json`、`renders/**`、`reports/**` 是**运行产物**，进 `.gitignore`、可随时再生；需要留档的验收报告由 `verify-page` 落到 `.magpie/sessions/<id>/`（session artifact）持久化，不靠工作区目录。convention plugin 接入时生成对应 `.gitignore` 片段——防止临时图与 state 入库，也防止反过来漏提交基准导致 CI 找不到。

### 2. 核心组件与技术选型

#### 2.1 figma-spec-cache（基准提取与缓存）

从 Figma 提取机器可比对的设计基准：规格 JSON（几何 + auto-layout + TypeStyle + fills）与基准 PNG，按版本钉住落盘，保证内循环零 Figma API 调用。

**通道设计（按 C4 证伪结果修正）**——原方案以 desktop MCP 为优先通道、理由是"免配额"；该前提已被官方限额文档证伪（[rate-limits-access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)：读取类 MCP 工具按 seat/plan 统一计量，无 desktop 豁免，且有 desktop 用户撞日配额的论坛实例）。修正后：

- **主通道：REST**。`GET /v1/files/:key/nodes`（absoluteBoundingBox / layoutMode / padding / itemSpacing / TypeStyle / fills / cornerRadius 全量精确基准）+ `GET /v1/images`（scale=2、`use_absolute_bounds=true`、合并 ids 单次请求、落盘字节防 30 天 URL 过期）。PAT scope 仅需 `file_content:read`（+ `file_metadata:read` 供 `/meta` 轮询）。两端点均 Tier 1 限流，拉取时显式传 `version` 参数钉版本。REST 可程序化、不依赖桌面 App 打开文件，对无人值守 agent 更可靠。
- **辅助通道：desktop MCP**（`http://127.0.0.1:3845/mcp`，免 token、复用桌面 App 登录态，本机已实测可 initialize）。价值在两点：`get_variable_defs` 解 token 名→值（这是非 Enterprise 团队解析变量值的唯一通道——Variables REST 仅对 Enterprise org 的 Full seat 开放）；流量走本机回环，外网域名不必进沙箱 allowlist。限制：消耗同一配额池；文件必须在桌面 App 中打开且为活动 tab；官方声明只有 [Figma MCP Catalog](https://github.com/figma/mcp-server-guide) 收录的 client 能连，自研裸 client 可能被拒——因此该通道实现为"经 harness 已注册的 MCP client 转发"或直接降级。
- **配额预算器**：按席位档默认 15 次/分、200 次/天（Professional Dev/Full）做请求预算与节流，合批 ids；执行 agent 的 Figma 账号必须持 Dev/Full seat（View/Collab 仅 6 次/月，不可用）。

**归一化**借鉴开源 Framelink（[GLips/Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP)，MIT）的 SimplifiedDesign 范式，extractors 可直接 fork。变量解析做成可插拔三级降级：MCP `get_variable_defs` → styles 映射 → Tokens Studio 导出 JSON。

**spec.json 生成器必须处理的边界**（核查项 C3 的修正项）：
- `absoluteBoundingBox` / `absoluteRenderBounds` 在官方 spec 中均为 `Rectangle | null`（不可见节点 renderBounds 为 null），比对器须判空；
- `cornerRadius` 仅四角一致时出现，四角不同只给 `rectangleCornerRadii[4]`，圆角断言两者都读；
- TEXT 顶层 `style` 只是基础样式，混排差异在 `characterStyleOverrides` + `styleOverrideTable`，只比顶层会漏同节点内字号/字重变化；
- `layoutMode` 自 2025 年起含 `GRID`，解析不能只枚举 HORIZONTAL/VERTICAL；padding/itemSpacing 缺省视为 0 且仅对 auto-layout frame 有意义；
- `/v1/images` 返回的 map 中个别节点可能为 null（渲染失败需重试），单图上限 32 megapixels（scale=2 下大画板可能触顶被缩小）。

**设计稿漂移哨兵**：`uiv baseline pull --check-version` 比对 mapping.json 钉住的 version 与 `GET /v1/files/:key/meta` 最新 version（Tier 3，轮询便宜），不一致**只告警不阻断**——设计更新走人工触发重录基准的流程，避免设计师改稿静默污染验收信号。

#### 2.2 render-daemon（常驻渲染守护进程）

沙箱外常驻 JVM 服务，接收渲染请求（preview FQN / 测试 FQN + 设备配置），返回 PNG + 语义树 JSON。

**双车道设计（按 C6 证伪结果重构）**——原方案断言"暖 Gradle daemon + `--tests` 过滤可把单轮压到 2~6s"，已被 Gradle 一手文档证伪：测试永远在独立 fork 的 test worker JVM 中执行（[Test DSL](https://docs.gradle.org/current/dsl/org.gradle.api.tasks.testing.Test.html)："Test are always run in (one or more) separate JVMs"；[Worker API](https://docs.gradle.org/current/userguide/worker_api.html)：进程隔离 worker 不跨 build 持久），Robolectric 的 SandboxClassLoader 缓存是 JVM 进程内静态缓存，随 test worker 进程死亡而消失——暖 Gradle daemon 只能摊薄 configuration 与编译相位，摊不薄 Robolectric 每轮数秒的 sandbox 初始化。修正后：

- **慢车道（主车道，正确性兜底）**：Gradle Tooling API 驱动 `:module:testDebugUnitTest --tests '<TestFqn>' -Proborazzi.test.compare=true`（Roborazzi 1.63.0 + Robolectric 4.16 + `@GraphicsMode(NATIVE)`）。唯一同时覆盖 Compose、XML View inflate、Activity 级整页、交互后截图的 JVM 路线，且月度活跃维护。**单轮现实延迟预算 10~30s**（配置缓存 0.5~2s + 增量编译 1~5s + test JVM fork 0.5~1s + Robolectric sandbox 初始化数秒 + 渲染写盘），不再宣称 2~6s。
- **快车道（延迟优先，Phase 1 引入，仅静态 @Preview）**：要达到秒级，必须让渲染 JVM 本身常驻（类似 Android Studio Compose Preview 的常驻渲染进程 / Bazel persistent worker），绕过 Gradle Test task 的逐轮 fork。两个候选实现，按风险排序：
  1. Paparazzi 2.0.0-alpha05 的 setup/teardown 程序化钩子，常驻进程内直接渲染静态 @Preview（layoutlib 渲染本身 80ms 级）。alpha 风险（强制 Java 21+/Kotlin 2.3/AGP 8.13+），只作加速插槽不入关键路径；
  2. 自建嵌入式 Robolectric persistent worker——工程量大且 Robolectric 与 JUnit runner 耦合紧，可行性需 Phase 1 验证。

  **加固条件**（硬性）：快车道 daemon 不得裸 localhost HTTP 触发构建/渲染，必须 Unix socket 或 token 鉴权。
- 配 [ComposablePreviewScanner 0.9.0](https://github.com/sergio-sastre/ComposablePreviewScanner) 自动从 @Preview 生成测试，模型零测试代码。
- 沙箱内冷路径降级：daemon 未启动时 `uiv` 直接 spawn `./gradlew --no-daemon`（慢但自给自足，防孤儿 daemon 带旧沙箱 profile 长驻）。

**选 Roborazzi 而非 Paparazzi 当主车道的理由**：稳定版活跃（1.63.0，2026-05）vs Paparazzi 稳定版停更约 1.5 年（1.3.5，2024-11）、2.0 仍 alpha；且整页外循环需要 Activity + 交互后截图能力，仅 Robolectric 路线具备。该承重断言已对抗核查 confirmed（核查项 C1）：四种渲染形态均有官方 README 文档化示例，RNG 的 macOS arm64 支持有 Maven Central 构件内置 `mac/aarch64` dylib 实物 + 官方 CI 矩阵显式跑 mac arm64 两层证据；AGP 9.0 兼容自 Roborazzi 1.56.0 官方声明。边界条件：(a) KMP 模块在 Gradle 9.4.1+ 有间歇性构建故障（[roborazzi#830](https://github.com/takahirom/roborazzi/issues/830) open，1.62/1.63 缓解未根治），纯 Android module 不受影响，走 KMP 需预案；(b) Robolectric 代码提交日常活跃但 release 节奏约半年一版，等修复的周期可能数月；(c) robolectric-processor 与 AGP 9 `android.builtInKotlin` 不兼容（[robolectric#10909](https://github.com/robolectric/robolectric/issues/10909)），仅影响自定义 shadow 项目；(d) Robolectric 4.16 跑 SDK 36 需 JDK 21（本机 Corretto 已满足）。

**渲染环境钉死**（核查项 C2/C5 边界）：
- `@Config(qualifiers = "wXXXdp-hYYYdp-xhdpi")` 显式钉死密度 2.0 与窗口逻辑尺寸（Robolectric 默认 mdpi/density=1.0、320x470dp，**不能依赖默认值**）；窗口尺寸取自 spec.json 画板尺寸，否则裁剪；
- JVM 统一加 `-Djava.awt.headless=true`，封死测试代码误初始化 AWT Toolkit 连接 WindowServer 的路径；
- 离线运行：预下载 android-all-instrumented jar 与 nativeruntime 工件，设 `robolectric.offline=true` + `robolectric.dependency.dir`（官方支持），保证断网沙箱不静默失败；
- 需要可写且可从中加载动态库的 `java.io.tmpdir`（dylib 与字体解包后 System.load）。

**接入打包**：渲染挽具（Roborazzi 配置 + 测试基类 + SemanticsDumpRule + PreviewScanner 接线 + qualifiers 约定）做成单个 Gradle convention plugin，存量工程一行 `apply` 接入——这是多模块工程推广成本的决定性因素。
*（取舍：嫁接评审方案的 convention plugin 打包；原方案要求逐工程手配依赖。）*

#### 2.3 semantics-exporter（语义树导出器）

渲染时同步导出 Compose 语义树 / View 层级为 JSON，作为 L2 结构比对的实现侧输入。以 JUnit Rule 形式打包进 convention plugin，测试代码一行接入。

**实现口径（按 C5 核查修正，原方案 4 处口径错误已订正）**：
- API：`onRoot(useUnmergedTree = true).fetchSemanticsNode()`（单数）后递归 `SemanticsNode.children` 导出全树，或 `onAllNodes(SemanticsMatcher("any") { true }, useUnmergedTree = true).fetchSemanticsNodes()`。原方案写的 `onRoot().fetchSemanticsNodes()` 这个 API 不存在；
- **无语义属性的纯布局节点不在语义树中**（官方文档明文）——这把 testTag 覆盖率从"匹配优化"升级为 L2 的硬前置条件，代码生成规范必须强制；
- 坐标：取 `positionInRoot + size`（unclipped 原始 **px**），除以 density(2.0) 换算 dp。不能直接拿 `boundsInRoot` 当 dp 用（它是 px 且是 clipped 值）；
- 框架自身量化噪声 ≤0.5dp（androidx BoundsAssertions 默认公差即 `Dp(.5f)`），±2dp 断言有 4 倍余量；
- XML View 等价物：Robolectric 环境内递归遍历 view tree，导出 `{resourceId, android:tag, bounds, text, TextView 字号/颜色}`。

#### 2.4 diff-engine（三层裁判引擎）

- **L1 像素（advisory）**：odiff-bin 4.3.8（SIMD，自报基准约 5.5~6.6x 快于 pixelmatch——注意该数字是 odiff 自家 hyperfine 端到端基准，含 Node 启动与 PNG 解码；server 常驻模式摊薄启动开销，4.3.x 已支持 server 模式 buffer 与 ignore regions）做差异检测与定位；looks-same 10.0.1（CIEDE2000 ΔE 容差 2.3 + `shouldCluster`）输出差异簇包围盒列表，簇坐标反查命中语义树节点，把"哪里错了"定位到组件。阈值借鉴 Chromatic/reg-cli：YIQ threshold≈0.063 + 忽略抗锯齿。**L1 结果只进报告不进门禁。**
- **L2 结构（唯一硬门禁）**，含两条子路径（同一份导出语义树，按"有无基准"分流，见[3.3 节](#33-内容态验证parity-vs-invariant)）：
  - **L2-parity（有 Figma 基准）**：自研薄匹配层（见[第 4 节](#4-渲染节点--figma-节点匹配策略)），逐属性断言：位置/尺寸 L1 距离 ±2dp、padding/itemSpacing 精确比、字号 ±0.5sp、颜色 ΔE<3、圆角精确比。违规分类沿用 GVT 分类法（位置/尺寸/缺失/多余/颜色/字体，[ICSE 2018](https://arxiv.org/abs/1802.04732)）。
  - **L2-invariant（无基准，绝对正确性不变量）**：纯几何可算项——子超父裁剪、兄弟重叠（unclipped Rect 运算，零额外依赖）；口径受限项——最小触控须读 `touchBoundsInRoot`（核查 CS3，**不可**用 layout 几何÷density，否则误判合规小图标）、文本溢出 `hasVisualOverflow` / 截断 `getEllipsisCount` 须 `@GraphicsMode(NATIVE)` 且经 Phase 0 实测钉住（核查 CS1/CS2），未钉住前列 advisory；纯语义项——contentDescription 缺失（CS7）。invariant 违规与 parity 违规同构进 `violations`，severity 默认 high。
- **可视化**：diffMask 半透明叠加图 + 基准|渲染|diff 三联图，供模型多模态查看与 L3 输入。
- **源码行归因**：violations 条目带 `source: "HeaderCard.kt:42"`——由违规节点的 testTag 字符串字面量（`figmaTag("123:456")` / `testTag("fig:123:456")`）在源码中纯文本检索得到，零 Compose 编译器内部 API 依赖、故障率低。把模型的修改动作从"找到 fig:title 对应的 composable"变成"改第 42 行的 padding"。
  *（取舍：嫁接评审方案的归因设计，并按其建议从后期阶段提前到 Phase 2 落地。）*

**指标与判定口径（实现前钉死，Phase 0 Day 3 照此实现）**——以下定义是全文 untaggedCoverage / matchRate / score / minScore / blockingSeverities 的唯一出处：

- **可比对节点集 N**：Figma 节点树中 `visible !== false` 的**叶子**节点，排除三类：纯装饰 vector/asset 节点（整体导出为图的 icon 不展开内部结构）、已被 ignore-region 声明覆盖的节点、`absoluteBoundingBox` 为 null 的节点。N 是以下所有比率的统一分母。
- **untaggedCoverage** = |N 中按 testTag 找到对应语义节点的元素| / |N|。衡量 tag 契约履约率，低于阈值（默认 0.9，随合同固化）→ `inconclusive(tag_coverage_low)`。
- **matchRate** = |三级匹配（tag→文本→LCS）后成功配对的节点| / |N|。衡量两棵树的可比性，<0.8 → 熔断 `inconclusive(matching_rate_low)`。两者区别：untaggedCoverage 只认 tag 主策略，matchRate 含降级匹配。
- **score** = 1 − Σ(violation 严重度权重) / |已执行断言数|。权重 v0 取值：blocking=1.0、high=0.8、medium=0.4、low=0.1（Phase 0 标定后调整）；score 只在非 inconclusive 时有意义。
- **判定优先级**：`pass = (reason ≠ inconclusive) ∧ (blockingSeverities 命中的违规数 = 0) ∧ (score ≥ minScore)`，三个必要条件按此顺序短路。**"无 blocking/high 违规"是先于 minScore 的硬条件，两者不互换**——minScore 只约束剩余 medium/low 违规的累积量。`blockingSeverities` 默认 `["blocking","high"]`，与 minScore 一起随合同 uiParity 固化。
- 防震荡分层比较（设计原则 2）的主键 = blockingSeverities 命中的违规计数，次键 = score。

#### 2.5 uiv CLI（薄验收客户端）

模型与 magpie loop 的主要调用入口，TypeScript（与 magpie 同栈）。子命令：

| 子命令 | 作用 |
|--------|------|
| `uiv pin --file <fileKey> --node <nodeId> [--source <docPath>] [--state <name>=<variantNodeId>]… [--min-score N] [--matrix ...]` | dev_preparation 阶段一条命令固化 parity contract：拉基准、钉 version、写 mapping.json（uiParity 的 source of truth，条目带 source document 作用域 + `states[]`）、触发合同 re-persist 由构建器合并进 RequirementContract。目标若为 COMPONENT_SET 则自动枚举 variant 各落一份分状态基准（CS6） |
| `uiv baseline pull [--check-version]` | 拉取/校验基准；`--check-version` 为漂移哨兵（告警不阻断） |
| `uiv check --preview <FQN> --node <nodeId> [--state <name>]` | 组件级内循环单轮：渲染 + L1/L2 + report.json；含防震荡 regression 检测；`--state` 单测某内容态 |
| `uiv verify-page --test <FQN> --node <nodeId> [--states ...] [--matrix l-shape\|full\|custom:...]` | 整页级外循环：设备矩阵 × 内容态矩阵（默认 L 形交叉，见 3.3），聚合 page-report.json |
| `uiv report [--junit]` | 报告转换（JUnit XML 供 CI 平台） |

行为约定：所有输出落 cwd 内 `.ui-verify/`，最后一行打印 report.json 绝对路径，exit 0/1 即验收门。check 命中 daemon 走热路径（UDS），daemon 未启动降级 spawn `./gradlew --no-daemon` 冷路径。

**选 CLI 为 loop 主形态的依据**：微软 @playwright/cli 实测同任务 token 消耗比 MCP 形态省约 4 倍（11.4 万 → 2.7 万）。

#### 2.6 ui-verify MCP server（门面，可选）

TypeScript MCP stdio server，与 CLI 共享 core 库，提供 `ui_check` / `ui_verify_page` / `ui_baseline` 三个工具。关键收益：MCP server 进程不受 Claude Code Bash 沙箱约束（官方文档明文："MCP servers and hooks are separate processes that run unconstrained on the host"，核查项 C8 confirmed），天然绕开 Gradle 全部沙箱坑。安卓免设备渲染 MCP 在业界是空白点，对标 chrome-devtools-mcp 范式。

#### 2.7 vlm-judge（L3 语义裁判，双形态）

仅整页验收触发，对 L1/L2 报不出的语义/层级/观感问题做批判与严重度分级。

- **轻量形态（Claude Code 等交互场景）**：直接让编码模型 Read 三联图 + rubric 自判——零新增服务、零新增网络面。
- **Provider 形态（magpie loop 无人值守场景）**：复用 magpie 已有 provider 体系（`src/platform/providers/`，anthropic/openai/gemini API 后端现成）。

两形态共用约束：输入强制三件套（diff 叠加图 + 差异簇坐标列表 + 固定量规清单：元素齐全→层级嵌套→几何间距→字号字重→颜色→圆角阴影→自适应），逐项引用簇坐标作证据，禁止无证据 pass；渲染失败一律 fail；结论只作建议不作硬门禁。
*（取舍：嫁接"模型即 VLM"轻量形态，原方案仅有 provider 调用版。）*

#### 2.8 magpie-shim（loop 接入层）

对 magpie 仓库的最小改动集，详见[第 5 节](#5-接入方式)。两个已核实的静默失效点：按核查项 C9，证据验收是 ANY-of 语义，**朴素加法集成不能强制新证据类型**，必须把 `ui_visual_validation` 做成独立判定单元；合同从源文档纯函数重建（session 启动即覆盖写），uiParity 必须经 mapping.json 由构建器合并，**不可直接写合同 JSON**（见 5.1 节持久化口径）。

#### 2.9 选型对比表

| 决策点 | 选择 | 落选项 | 理由（引用调研证据） |
|--------|------|--------|---------------------|
| 渲染引擎（主车道） | Roborazzi 1.63 + Robolectric 4.16 | Paparazzi（稳定版停更 1.5 年、2.0 仍 alpha 且强制 Java 21+/Kotlin 2.3/AGP 8.13+）；Google CPST（两年停在 0.0.1-alphaXX，绑定 AGP 9 + Studio canary）；直接调 layoutlib（等于重写 Paparazzi，API 无文档且随 Studio 漂移）；Compose Hot Reload（仅 JVM target，android-only 代码走不通，桌面 Skia 保真度不可比对） | Roborazzi 是唯一同时覆盖 Compose、XML inflate、Activity 整页、交互后截图的 JVM 路线，月度活跃维护（[takahirom/roborazzi](https://github.com/takahirom/roborazzi)） |
| 渲染引擎（快车道插槽） | Paparazzi 2.0 程序化钩子（可选） | 自建 persistent worker（工程量大需验证） | 2.0.0-alpha05 提供 setup/teardown 与 JUnit4 解耦；layoutlib 渲染本身 80ms 级；alpha 风险所以只作加速插槽 |
| 设备路线 | headless JVM | 模拟器（Hypervisor entitlement + Seatbelt 内 hv_vm_create 大概率被 deny + 4GB+ 磁盘）；屏幕截图（Screen Recording TCC，Sequoia 起周期性重确认）；真机（违反硬约束） | C2 符号级取证：渲染栈零 WindowServer/截屏/辅助功能 API 导入，sandbox-exec 严苛 profile 下实测零弹窗 |
| 像素 diff | odiff 4.3.8（advisory）+ looks-same 10.0.1（聚类） | pixelmatch（纯 JS 单像素循环，整页约 7.7s）；SSIM 族（块平均稀释小型局部差异，不适合做断言） | C7 confirmed：odiff SIMD + server 模式实证存在；looks-same `diffClusters` 包围盒是把像素 diff 转区域列表喂给模型的最现成接口 |
| 结构匹配算法 | testTag 确定性 join 主策略 + GUIPilot 式 LCS 降级 | GVT KNN 最近邻（对布局偏移不鲁棒，GUIPilot 在组件交换检测上精度高 66.2%） | GUIPilot（[arXiv 2506.07385](https://arxiv.org/html/2506.07385)）screen 一致性检测精度 94.5~100%、单屏 0.001s |
| 基准主通道 | REST nodes + images | desktop MCP 优先（"免配额"前提被 C4 证伪）；`get_design_context`（输出 React+Tailwind 参考代码，对 Compose 仅语义参考，不可当几何基准） | REST 字段全量精确、可程序化、不依赖桌面 App 活动 tab；配额同样计量但可预算化 |
| loop 主形态 | CLI（exit code + JSON） | MCP 形态 | @playwright/cli 实测同任务 token 省约 4 倍；loop 的 runSafeCommand 调用约定现成 |
| 沙箱通信 | Unix domain socket | 裸 localhost HTTP（Seatbelt 内 loopback 出站默认 EPERM，issue #28018 未解决） | C8 边界；`sandbox.network.allowUnixSockets` 是官方给本地 IPC 的通道 |

### 3. 模型自纠错回路

#### 3.1 组件级内循环

延迟预算：慢车道单轮 10~30s（Phase 0 实测定准）；快车道（静态 @Preview，Phase 1）目标 P50 ≤6s。

**步骤 0：基准就位（每需求一次，不进内循环）**

模型（或 loop 的 dev_preparation 阶段）执行：

```
uiv pin --file <fileKey> --node <nodeId> [--scale 2] [--min-score 0.9] [--matrix default5]
```

工具行为：figma-spec-cache 经 REST（带 version 参数钉版本）拉取并归一化，产出 `.ui-verify/baselines/<nodeId>@<version>/spec.json`（节点树：id/name/type/absoluteBoundingBox/layoutMode/padding/itemSpacing/fills/cornerRadius/TypeStyle/token 名→值）+ `baseline.png`（scale=2）；写 mapping.json（uiParity 的 source of truth，含 `{fileKey, nodeId, version, minScore, matrix}` 与 scope——loop 内自动取 `session.sourceDocumentPath`，standalone 用 `--source` 指定，无 scope 条目不入合同）；触发一次合同 re-persist，由构建器从 mapping.json 合并 uiParity 字段与专项 requiredEvidence（**不直接改合同 JSON**——会被重建覆盖，见 5.1 节）。返回给模型：spec.json 路径 + 摘要（节点数、画板尺寸、token 表）。

**步骤 1：模型写组件**

两条代码契约（由 codegen prompt / loop 阶段 prompt 强制）：
- (a) 每个对应 Figma 节点的 composable 根 Modifier 挂 `Modifier.figmaTag("123:456")`（封装扩展统一 `fig:<nodeId>` 格式）。注意这同时是 L2 的硬前置：无语义属性的节点不在语义树中（C5）；
- (b) 必写 @Preview 函数（showBackground、widthDp/heightDp 取自 spec.json 画板尺寸）。

**步骤 2：模型调用检查工具**

```
CLI: uiv check --preview com.app.ui.CardPreview --node 123:456
MCP: ui_check { previewFqn: "com.app.ui.CardPreview", figmaNodeId: "123:456" }
```

密度固定 2.0（`@Config(qualifiers="...xhdpi")` 显式钉死）与基准 scale=2 对齐，杜绝 dp/px 假阳性。

**步骤 3：工具内部执行（模型无感）**

CLI/MCP → UDS → daemon（快车道直接渲染；慢车道增量编译 + 定向跑该 preview 的截图测试）→ rendered.png + semantics.json → diff-engine 跑 L1（定位）+ L2（门禁）→ 写 report.json + diff-overlay.png + triptych.png → 更新 state.json 分数。

**步骤 4：模型拿回的反馈格式（report.json，机器可执行）**

```jsonc
{
  "pass": false,                      // 仅由 L2 决定
  "reason": null,                     // "inconclusive" = 无法判定，验收一律按不通过处理
  "subReason": null,                  // inconclusive 细分：tag_coverage_low | matching_rate_low |
                                      //   semantics_export_failed | render_harness_error | figma_spec_invalid |
                                      //   native_graphics_unverified | fixture_unavailable
  "state": "typical",                 // 本轮渲染的内容态（typical/empty/longText/error/loading/largeList/rtl）
  "compileError": null,               // 编译失败时给完整错误，其余字段为空 → 模型先修编译
  "pixel": {                          // advisory，不参与 pass 判定
    "diffRatio": 0.043,
    "clusters": [{"x":24,"y":108,"w":312,"h":48,"hitTags":["fig:123:458"]}]
  },
  "structural": {
    "matched": 11,
    "untaggedCoverage": 0.92,         // Figma 叶子节点的 tag 覆盖率，低于阈值 → pass:false + reason:"inconclusive"
    "missing": [{"figmaId":"123:460","name":"badge/new","expectedBounds":[268,12,44,20]}],
    "extra": [],
    "violations": [
      {"judgePath":"parity","testTag":"fig:123:458","figmaName":"title","property":"fontSize",
       "expected":"16sp","actual":"14sp","severity":"high",
       "source":"HeaderCard.kt:42",
       "hint":"Text style 应为 token text/title/md (16sp/SemiBold)"},
      {"judgePath":"invariant","testTag":"fig:123:458","property":"textOverflow",
       "expected":"no overflow","actual":"hasVisualOverflow=true","severity":"high",
       "source":"HeaderCard.kt:42",
       "hint":"longText 态下标题溢出，需 maxLines+ellipsis 或换行容纳"}
    ],
    "invariants": {                   // L2-invariant 子路径结果（无基准内容态）
      "textOverflow":      {"checked":true,  "violated":true,  "advisory":false},
      "childClipped":      {"checked":true,  "violated":false},
      "siblingOverlap":    {"checked":true,  "violated":false},
      "touchTargetTooSmall":{"checked":true, "violated":false},
      "missingContentDescription":{"checked":true,"violated":false}
      // advisory:true = 该项因 @GraphicsMode(NATIVE) 未经 Phase 0 钉住而降级，不进硬门禁（CS1/CS2）
    }
  },
  "artifacts": {"render":".ui-verify/renders/Card/rendered.png",
                "overlay":".ui-verify/reports/Card/diff-overlay.png",
                "triptych":".ui-verify/reports/Card/triptych.png"},
  "score": 0.78,
  "regression": false,                // 分层判定（blocking 违规数 + 总分）连续 2 轮停滞 → true，要求回退
  "regressionReason": null            // regression 时必填：哪个指标、从多少到多少
}
```

`hint` 的生成是确定性模板（违规属性 + spec.json 期望值 + testTag 反查 composable 名 → Modifier/Text 参数级建议），不依赖 LLM 再推理。`source` 由 testTag 字面量 grep 得到。

**步骤 5：模型决策**

- `compileError` 非空 → 修编译，回步骤 2；
- `reason: "inconclusive"` → 按 `subReason` 分流：`tag_coverage_low` / `matching_rate_low` 照"匹配失败报告"补 tag、修结构后回步骤 2；`semantics_export_failed` / `render_harness_error` / `figma_spec_invalid` / `native_graphics_unverified` / `fixture_unavailable` 是工具链、环境或基准故障，**不要改业务代码**，上报并按提示处理（基准类先 `uiv baseline pull`，`native_graphics_unverified` 待 Phase 0 钉住 NATIVE 模式，`fixture_unavailable` 该态自动降 invariant-only）；
- `violations` 非空 → 按 severity 排序，照 `source` + `hint` 逐条修，回步骤 2；
- `violations` 空但 pixel 簇异常 → 模型 Read diff-overlay.png 自查，判断是已知保真度噪声（阴影/字体 hinting 白名单）还是 L2 测不到的真差异；噪声则 `--ignore-region` 声明后重跑；
- `regression: true`（分层指标连续 2 轮停滞触发，附 `regressionReason`）→ 回退到停滞前的最好版本，停止微调，重读 spec.json 换实现策略；
- 轮数上限 5；
- 全过 → `uiv check --record` 落 golden，进入下一组件。

#### 3.2 整页级外循环

延迟 30s~2min 可接受，每阶段/验收时一次。

**步骤 A：5 格验收矩阵**。所有组件内循环通过后，模型（或 loop 的 integration_test 阶段自动）执行：

```
uiv verify-page --test com.app.HomeScreenTest --node <页面frame的nodeId> \
  --states "default,empty,longText"
```

默认矩阵 5 格（合同 `matrix` 字段可覆写）：

| 格 | 配置 | 拦截的高频翻车 |
|----|------|---------------|
| base | 360x800 light, fontScale 1.0 | 基础还原 |
| pixel5-dark | 深色模式 | 深色未适配（真实验收最高频漏网之一） |
| fontScale1.3 | 字号缩放 1.3 | 文本溢出/截断（另一最高频漏网） |
| smallPhone | 360dp 窄屏 | 挤压换行 |
| tablet | 800dp+ | FILL/HUG 语义错误 |

每格独立输出 topViolations；门禁配置 `{minScore, blockingSeverities}` 随合同固化。自适应检查 = 多尺寸下断言 Figma auto-layout 语义（FILL/HUG/固定）是否被 `fillMaxWidth`/`wrapContent` 正确表达。
*（取舍：原方案 `--sizes` 只覆盖尺寸，嫁接评审方案的 5 格矩阵补齐深色与字号缩放两个维度。）*

注意上表是**渲染配置**维度。真实使用中的**内容变化**（空/超长/错误/RTL）是与之正交的第二根轴——单靠占位内容渲染会漏掉真实场景的溢出/裁剪/换行翻车。两轴如何交叉、各内容态走 parity 还是 invariant，见 [3.3 节](#33-内容态验证parity-vs-invariant)。

**步骤 B**：L1/L2 全过后才触发 L3（控制成本与延迟）：vlm-judge 收三联图 + 簇坐标 + 量规清单，逐项输出 `{item, verdict, evidence(簇坐标), severity, suggestion}`，无证据的判定被丢弃。

**步骤 C**：聚合为 page-report.json `{pass, perCell[], l3Verdicts[], unresolvedKnownDeviations[]}`，写入 `.magpie/sessions/<id>/` 并登记到 `session.artifacts.uiVisualValidationPath` → requirement-contract 验收消费。fail 时违规清单摘要注入下一 attempt 的 prompt（复用 loop 现有 retryStateNote 机制，commit 3555a9b 引入的跨 attempt 状态反哺），形成外循环迭代。失败分类映射：`structural.violations` 非空 → `behavior_drift`；missing 组件 → `implementation_gap`；inconclusive 按 `subReason` 拆分——`tag_coverage_low` / `matching_rate_low` → `implementation_gap`（模型补 tag / 修结构后重验），`semantics_export_failed` / `render_harness_error` → `environment_gap`（工具链故障，不进模型修正回路），`figma_spec_invalid` → `environment_gap` 并提示重跑 `uiv baseline pull`；编译失败 → `environment_gap`。

#### 3.3 内容态验证（parity vs invariant）

**问题**：模型写的 @Preview / 测试常用占位或空内容，渲染出来是"空壳"——既无法和 Figma 默认态做几何比对（内容不一致几何就对不上），也测不到真实使用下的溢出/裁剪/换行翻车。解法是把"内容"拆成两个独立问题。

**前提问题：默认态比对要求内容对齐 Figma**。Figma TEXT 节点的 `characters` 字段就是设计稿真实文案（核查 CS3 确认 REST 暴露该字段，混排另读 `characterStyleOverrides`）。`spec.json` 已提取它，因此做法是把它做成 **content fixture 注入预览**——预览渲染"真实文案"而非"Lorem ipsum"，L2 几何断言才成立。注入路径：组件签名把硬编码 `Text("Hello")` 改为 `@PreviewParameter` 喂入，每个内容态一个 provider value。图片 fixture：从 `fills` 的 `imageRef` 经 `GET /v1/images` 下载真实位图落 `baselines/<nodeId>@<version>/assets/`，Robolectric 下用 `FakeImageLoaderEngine`（Coil 首选；Glide 须 `dontTransition()` 防 alpha 抖动）在 `@Before` 注入，可分别模拟"图已载入"与"加载失败占位"两态。

**枚举落地（核查 CS5，纠正了原假设）**：ComposablePreviewScanner 在**扫描阶段**就自动按 `PreviewParameterProvider` 的 values 序列逐值展开成多个 ComposablePreview，不存在"只渲染首值"。所以模型唯一职责是把要覆盖的内容态写进 Provider 的 values（注意 `@PreviewParameter(limit=)` 默认裁剪），测试侧遍历 scanner 已展开列表逐个 `captureRoboImage` 即可。超长/CJK/emoji/RTL 串由真实文案按确定性规则放大（种子固定，**禁运行期 Random**，否则截图不稳定）。

**判定路径二分**（设计原则 11）：每个内容态走 parity 还是 invariant，由 pin 时点显式声明、写进 mapping.json，**不在运行期猜**——

| 内容态 | 含义 | 有 Figma frame？→ 判定路径 |
|--------|------|---------------------------|
| typical | 设计真实内容（characters/imageRef 注入） | 通常有（基准态本身）→ **parity** |
| empty | 列表/字段为空 | 有 Empty variant → pin 成 empty 基准走 **parity**；否则 **invariant only** |
| longText | 超长文案 | 设计极少画 → 几乎总是 **invariant only** |
| error / loading | 错误 / 加载骨架 | 有对应 variant → **parity**；否则 **invariant only** |
| largeList | 大数量动态列表 | 设计画固定条数 → **invariant only** |
| rtl | LayoutDirection.Rtl 镜像 | 镜像后无对应基准 → **invariant only** |

**Figma 分状态基准（核查 CS6，纠正了原假设）**：Component Set 的每个 variant 是 COMPONENT_SET 下**独立子 COMPONENT 节点，各有独立 node id 与 absoluteBoundingBox**，几何可直接拉而非推断。`componentPropertyDefinitions.variantOptions[]` 只用来枚举有哪些状态（如 State=Empty/Filled/Error），拿到枚举后按 variant 名解析定位子节点，直接读其 bounds。`uiv pin` 识别 COMPONENT_SET 时批量为各 variant 落 `baselines/<variantNodeId>@<version>/`，并在 mapping.json 该 pin 的 `states[]` 登记 `{name:"empty", figmaVariantNodeId:"123:801"}`；设计师手画的独立状态 frame 用 `--state empty=<nodeId>` 显式钉。坐标纪律照旧：variant 的 absoluteBoundingBox 是绝对画布坐标，须 re-base 减 frame 原点、判 null。拉不到则该态自动降 invariant-only，report 标 `parityUnavailable:true`。

**正交矩阵（成本可控）**：设备矩阵（5 格）× 内容态矩阵笛卡尔积是 5×7=35 格，**默认不全展开**。`--matrix` 默认 L 形——base 设备 × 全部内容态 + 全部设备 × typical 内容态，再显式加测高频翻车交叉点（`fontScale1.3 × longText`、`smallPhone × longText`、`dark × error`）。`page-report.json` 的 `perCell` 增 `state` 维，聚合为"设备 × 内容态"二维。

**免基准不变量套件（核查校准后的可信度分级）**：
- **纯几何可算，可信**：子超父裁剪（注意严格检测"被裁"须同时取 clipped `boundsInRoot` 与 unclipped `positionInRoot+size` 作差；仅 unclipped 只能测"溢出父/超窗口"）、兄弟重叠（unclipped Rect 相交）。
- **最小触控 48dp（CS3 修正）**：**必须读 `SemanticsNode.touchBoundsInRoot`**——Compose 在输入层把 clickable 节点触控盒自动外扩到 48dp，layout 几何盒不反映外扩，用 `positionInRoot+size÷density` 判会把合规小图标误判违规；判"是否交互节点"用 `config.contains(SemanticsActions.OnClick)/Role/Focused`，无 `isClickable/isFocusable` 布尔属性。
- **文本溢出 / 截断（CS1 uncertain / CS2 refuted，最大约束）**：`hasVisualOverflow`（Compose）与 `getEllipsisCount`（XML TextView）依赖真实字形**测量**，Robolectric 默认 LEGACY 模式伪造测量会读出假阴。**只有 `@GraphicsMode(NATIVE)` 且经 Phase 0 实测钉住才进硬门禁**，未钉住前列 advisory（`subReason: native_graphics_unverified`）；XML 路径还须用真 TextView measure+layout 后断言（Robolectric 自证用的是直构 StaticLayout，不能假设等价）、minSdk≥26。
- **contentDescription 缺失（CS7 confirmed）**：交互节点 contentDescription 空 → fail，纯语义零像素，可信。
- **对比度 WCAG（CS7，须像素）**：纯语义算不出 gradient/图片背景的有效背景色，须渲染 bitmap 交 Google ATF；归入 Phase 3 像素增强，仅关键 UI 跑（Robolectric 下查 Compose 内容须 `robolectric.useRealAni`，4.15+）。

invariant 违规进同一 `violations` 数组，`judgePath:"invariant"`，property 用专名（textOverflow/childClipped/siblingOverlap/touchTargetTooSmall/missingContentDescription），source 仍由 testTag grep 行号归因——与 parity 违规同构，模型同一套修法消费。

### 4. 渲染节点 ↔ Figma 节点匹配策略

三级匹配 + 一条防腐契约：

**主策略：testTag 命名契约（确定性 join）**。每个对应 Figma 节点的 composable 挂 `testTag("fig:<figmaNodeId>")`，semantics.json 与 spec.json 按 nodeId 直接 join，O(n) 零歧义。XML View 等价物：`android:tag="fig:<nodeId>"` 或 resource-id 命名 `fig_123_456`。契约的执行保障是 `untaggedCoverage` 指标（多少 Figma 叶子节点没找到对应 tag）：内循环给缺 tag 清单作反馈，验收时低于阈值直接 `pass: false, reason: "inconclusive"`——契约本身是被验收的对象，覆盖不足即不通过。注意按 C5 修正，testTag 不只是匹配手段，更是节点进入语义树的前置条件。

**降级 1：文本内容匹配**。TEXT 节点：spec.json 的 `characters` ↔ 语义树 `text`，归一化（trim/空白折叠）后相似度 ≥0.95 视为匹配（GUIPilot 同款容差）。覆盖模型漏打 tag 但文案正确的常见情形。

**降级 2：GUIPilot 式几何匹配（兜底，零标注可跑）**。两棵树的叶子节点各按 (y,x) 偏序排序 → LCS 动态规划求全局最优对齐；相似度矩阵 = 位置（x,y,w,h 的 L1 距离，α=10 缩放）+ 面积 IoU + 宽高比 + 类型一致性（类型不同打 δ=0.5 折）。论文实证精度 94.5~100%、单屏 0.001s，对布局偏移比 GVT 最近邻更鲁棒。未匹配集合直接输出"缺失/多余组件"清单。

**可选增强：Code Connect**。若团队已维护 Code Connect（官方支持 Jetpack Compose），`get_code_connect_map` 提供组件级映射，L2 增加"此节点应使用 DSButton 而非裸 Row"级断言。无则静默跳过。

**坐标口径（防假阳性的关键细则，按 C5 修正）**：
- 布局断言：Figma `absoluteBoundingBox` 先减去目标 Frame 原点 re-base 为相对坐标；Compose 侧取 `positionInRoot + size`（unclipped px）÷ density(2.0) 得 dp；按"1 Figma 单位 ≈ 1dp"口径对比——注意这是 1x=mdpi 的行业惯例而非 Figma 官方明文等式，Day 0.5 用已知设计稿实测标定一次；
- 像素 diff 的裁剪对齐用 `absoluteRenderBounds` + `/v1/images use_absolute_bounds=true`（含阴影的真实渲染包围盒，判 null）；
- `get_metadata` XML 的坐标系（绝对 vs 相对父级）官方未明说，若使用该通道须先标定，结果写进 figma-spec-cache 适配层；
- 旋转/带阴影节点的 boundingBox 与渲染边界不一致，特殊处理或排除；文本基线不做比 ±2dp 更紧的断言（Robolectric 自带字体渲染与真机有亚 dp 级差异）。

**匹配失败的处置**：匹配率 <80% 时 L2 不强行断言，输出"匹配失败报告"（双方树可视化 dump + 未匹配清单）帮助模型补 tag / 修结构；但 report 的 verdict 为 `pass: false, reason: "inconclusive"`，最终验收按不通过处理——匹配失败只是换一种反馈形态，不是豁免。tag 覆盖率（untaggedCoverage）低于阈值同理。

### 5. 接入方式

#### 5.1 magpie loop（requirement-contract 验收）

最小侵入改动集，全部走已核验的扩展点（核查项 C9；行号以 main@8e0dcb2 工作区为准，提交后可能偏移）：

1. **`/Users/zhuxi/AI/magpie_agent/src/capabilities/loop/application/evidence-taxonomy.ts`**
   - `RequirementEvidenceType` union（L4，现有 8 类）追加 `'ui_visual_validation'`；
   - `collectRequirementEvidence()`（L68 起，逐 artifact 字段 if-push 结构）追加：
     ```ts
     if (artifacts.uiVisualValidationPath) {
       items.push({ type: 'ui_visual_validation', path: artifacts.uiVisualValidationPath })
     }
     ```
2. **`/Users/zhuxi/AI/magpie_agent/src/state/types.ts`**
   - `LoopSession.artifacts` 的 `*Path` 字段块（L299~376）新增 `uiVisualValidationPath?: string`。
3. **`/Users/zhuxi/AI/magpie_agent/src/capabilities/loop/application/execute.ts`**
   - 在 integration_test / green_fixup 阶段后期、`validateRequirementContract(session)` 调用点（工作区 L6682 / HEAD L6675）之前，当合同携带 uiParity 指纹时，经 `runSafeCommand()`（`/Users/zhuxi/AI/magpie_agent/src/capabilities/workflows/shared/runtime.ts` L1804，execFileSync 包装、返回 `{passed, output}`）执行：
     ```
     uiv verify-page --json --out .magpie/sessions/<sessionId>/ui-visual-validation.json
     ```
     然后 `session.artifacts.uiVisualValidationPath = 该路径`。
4. **`/Users/zhuxi/AI/magpie_agent/src/capabilities/loop/application/requirement-contract.ts`**
   - `buildRequirementContract()`（L279）增加可选 `workspaceRoot` 入参；构建末尾读 `<workspaceRoot>/.ui-verify/mapping.json`，**仅取 `scope.sourceDocumentPath` 匹配当前源文档的条目**（hash 不一致只告警），有匹配则合成 `uiParity` 字段、追加 `declaredEvidenceTypes = ['ui_visual_validation']` 的专项 requiredEvidence 条目与对应 coverageUnit；
   - `persistRequirementContract()`（L661）调用处传入 `session.artifacts.workspacePath`。

**关键修正（C9，ANY-of 语义陷阱）**：原方案"在 ui_change case 追加 `'ui_visual_validation'`，缺证据即 fail"的表述**不成立**——`hasEvidenceType`（evidence-taxonomy.ts L100~102）是 `items.some(item => types.includes(item.type))` 的 ANY-of 语义：若 ui_change 的期望类型为 `['integration_test_result', 'ui_visual_validation']`，session 只要有 greenTestResultPath 证据，缺 uiVisualValidationPath 时验证仍 PASS。要在不改 `validateRequirementContract` 主逻辑的前提下单独强制新证据类型，必须让它成为某个判定单元的**唯一**期望类型。本方案采用的路径：

- **持久化口径（防静默失效）：source of truth 是 `.ui-verify/mapping.json`，禁止直接改生成后的合同 JSON**。合同是源文档的纯函数式派生物——`buildRequirementContract`（requirement-contract.ts L279）只读源文档重建，`persistRequirementContract`（L661）每次全量重建并**覆盖** requirement-contract.json，且 session 启动即调用（execute.ts L7891）。pin 直接改 JSON 会在下次重建时静默丢失 uiParity 与专项条目，丢失后 ui_change 靠 integration_test 仍可 PASS——正好绕回 ANY-of 陷阱。因此 `uiv pin` 只写 mapping.json（含 `{fileKey, nodeId, version, minScore, matrix}` 验收基准指纹）并触发一次合同 re-persist；
- **构建器合并出专项判定单元**：`buildRequirementContract` 读到 mapping.json 后合成 `declaredEvidenceTypes = ['ui_visual_validation']` 的专项 requiredEvidence 条目（单独成判定单元，唯一期望类型），重建天然幂等；
- **mapping 条目带作用域，构建器只合并当前源文档的条目**：每条 pin 记录 `scope: {sourceDocumentPath, sourceDocumentHash, pinnedAt}`（path 为 repo 相对路径）。`buildRequirementContract` 只合并 `scope.sourceDocumentPath` 与当前构建源文档一致的条目——否则同仓库做过多个 UI 需求后，旧 pin 会给后续不相关合同注入专项判定单元，而该任务永远产不出 `ui_visual_validation` 证据，验收被假阳性卡死。**匹配主键用 path 而非 hash**：合同 `source.hash` 在源文档任何编辑后都会变化，按 hash 过滤等于"PRD 改一个字、uiParity 静默脱落"，与本节要防的静默失效同类；`sourceDocumentHash` 只作漂移告警（不一致时仍合并，但警告"pin 时点的文档已变更，请复核 pin 是否仍有效"）。无 scope 的条目（standalone 手工 pin）只服务 `uiv check`，**永不**合并进合同；loop 内 pin 自动取 `session.sourceDocumentPath` 作 scope，standalone 用 `--source` 显式指定；
- 不改 ui_change case 的默认返回（避免改变存量 ui_change 契约行为的回归面）；
- `inferEvidenceTypesFromRequirements()` 可选追加 `/还原|设计稿|像素|Figma/i → 'ui_visual_validation'` 正则分支作为自动识别兜底（注意该路径依赖源文档存在标题匹配的章节，仅作辅助）；
- **Phase 2 验收测试必须包含 ANY-of 反例场景**："有 integration_test_result 证据但缺 ui_visual_validation 证据 → 验收 fail"，防止只构造"零证据"场景的假性通过。

需求合同侧：`requirement-contract.ts` 的 `inferRequirementTypes()`（L256，已有 `/UI|弹窗|交互/` 正则识别 ui_change）无需改动。失败后沿用 `decideRequirementCompletion`（requirement-contract.ts L851）与 `src/core/failures/` 的签名/账本/恢复策略。

#### 5.2 Claude Code / 通用 harness

**形态 A（推荐起步）**：模型经 Bash 调 `uiv` CLI。沙箱配套（针对调研实锤的坑）：

- **loopback 出站默认被堵（C8 边界，对热路径致命）**：沙箱开启时 Bash 内进程连 127.0.0.1 默认 EPERM（issue #28018 未解决，代理不转发 loopback）。修法三选一，按优先级：
  1. daemon 监听 Unix domain socket，`uiv` 走 UDS，配 `sandbox.network.allowUnixSockets` 路径白名单（官方明示这是给本地 IPC 的通道）——**默认方案**；
  2. `sandbox.network.allowLocalBinding = true`（macOS-only，默认 false，全端口无细粒度）；
  3. 沙箱未启用时无此问题，但架构不假设沙箱关闭。
- `sandbox.network.allowedDomains` 放行 services.gradle.org、repo.maven.apache.org、dl.google.com、maven.google.com、plugins.gradle.org（首次依赖下载与 Robolectric android-all jar 预热后，内循环可离线）；
- 项目 gradle.properties 写 `systemProp.https.proxyHost/Port`（Java 不读 https_proxy 环境变量，issue #16222）；
- `GRADLE_USER_HOME=./.gradle-home` 指进项目目录（绕开 ~/.gradle 写入回归 issue #19380）；
- 沙箱内冷路径一律 `--no-daemon`（防孤儿 daemon 带旧沙箱 profile 长驻）；热路径由沙箱外 daemon 承担，Bash 内的 `uiv` 只是发 UDS 请求的薄客户端，不碰 Gradle。

**形态 B**：`.mcp.json` 注册 ui-verify MCP server（stdio）。server 进程在 Bash 沙箱之外运行，内部直连 daemon，零沙箱纠缠。注意边界：官方对无人值守 / `--dangerously-skip-permissions` 场景推荐用 sandbox-runtime 包裹整个 Claude Code 进程——该形态下 MCP server 也进沙箱，同样需要 allowUnixSockets/allowLocalBinding 才能触达外部 daemon。

render-daemon 本体经 launchd user agent 或手动启动于用户会话，仅监听 UDS（或 127.0.0.1 + token），不入沙箱管辖。

多 agent 并发：per-worktree `GRADLE_USER_HOME` + `GRADLE_RO_DEP_CACHE` 只读共享依赖缓存（[官方支持无锁并发读](https://docs.gradle.org/current/userguide/dependency_caching.html)），daemon 按 user home 三元组自然隔离不抢锁。

#### 5.3 CI（两道性质不同的门，不可混用名字）

- **UI parity 硬门禁（还原度验收，唯一）**：`uiv verify-page` exit code 即门禁，L2 结构断言驱动；`uiv report --junit` 转 JUnit XML 供 CI 平台展示。这是"像不像设计稿"的唯一裁决者。
- **视觉回归套件（防非预期变更，默认不阻断）**：`./gradlew verifyRoborazziDebug`，golden 提交在 `src/test/snapshots` 同库；diff 产物在 `module/build/outputs/roborazzi/`，HTML 报告 `build/reports/roborazzi/index.html`。注意它是**同渲染器**的"这次渲染 vs 上次渲染"比对，回答"UI 有没有变"而非"像不像设计稿"，与设计原则 1 禁止的跨渲染器像素门禁不是一回事——但同渲染器也有环境漂移噪声（Robolectric/JDK/OS 升级会让 golden 整批爆红），因此**默认仅报告；显式声明容差比较器（Roborazzi threshold validator）+ ignore-region 后才允许阻断**。
- **设计稿漂移哨兵**：CI 定期跑 `uiv baseline pull --check-version`，钉住的 version 与 `/meta` 最新 version 不一致**只告警不阻断**，重录基准走人工触发。
- **跨平台铁律**：golden 仅在 mac 上录制（Linux CI 字体渲染不一致，Paparazzi #1465 实锤）；若 CI 必须跑 Linux，回归套件改用容差 comparator，或 CI 仅跑 L2 结构断言（几何断言跨平台稳定，像素断言不稳定）。

### 6. macOS 权限矩阵（目标零 TCC，已达成）

| 组件 | TCC 权限 | Hypervisor | 网络 | 磁盘写 | 备注 |
|------|---------|-----------|------|--------|------|
| render-daemon（JVM 渲染） | 无（layoutlib/RNG 进程内离屏位图，符号级取证零 WindowServer/截屏 API 导入；统一加 `-Djava.awt.headless=true` 封死 AWT 误初始化路径） | 无 | 仅首次拉 Maven 依赖 + Robolectric android-all jar（百 MB 级，需预热 + `robolectric.offline=true`） | 项目内 `.ui-verify/` + `./.gradle-home` + 可写 tmpdir | 监听 UDS（或 127.0.0.1+token），不对外 |
| figma-spec-cache | 无 | 无 | api.figma.com（REST 主通道）；127.0.0.1:3845（desktop MCP 辅助，零外网） | `.ui-verify/baselines/` | PAT scope 仅 `file_content:read` + `file_metadata:read`；账号需 Dev/Full seat；**全通道消耗配额，预算器节流** |
| diff-engine（odiff/looks-same） | 无（纯本地二进制/Node 库） | 无 | 无 | `.ui-verify/reports/` | — |
| uiv CLI / MCP server | 无 | 无 | 仅转发至 daemon（UDS） | cwd 内 | MCP server 在 Bash 沙箱外 |
| vlm-judge（L3 provider 形态，可选） | 无 | 无 | 模型 API 域名（allowlist 放行） | cwd 内 | 唯一必须外网的环节，仅整页验收触发；轻量形态（模型自读图）零新增网络面 |
| Android SDK | 无 | 无 | 首次安装 dl.google.com | 约 500MB（cmdline-tools + 1 platform + 1 build-tools + platform-tools），不装 system-images/emulator（省 4GB+） | ANDROID_HOME 经环境变量或 local.properties |

被明确排除的高权限路线：模拟器（`com.apple.security.hypervisor` entitlement + Seatbelt 内 `hv_vm_create` 大概率被 deny）、屏幕截图（Screen Recording TCC，Sequoia 起周期性重确认弹窗）、UI 自动化（Accessibility TCC）。

### 7. 事实核查结果表

对方案的承重断言做了对抗验证（含符号级二进制取证与本机沙箱实证）。**被证伪或存疑的断言已在本文正文中如实修正，不沿用错误前提。**

| ID | 承重断言（缩写） | verdict | 对方案的影响与修正 | 关键证据 |
|----|----------------|---------|-------------------|---------|
| C1 | Roborazzi 1.63 + Robolectric 4.16（RNG）在 macOS arm64 纯 JVM headless 渲染 Compose / XML / Activity 整页 / 交互后截图，活跃维护且兼容 Gradle 9.5.1 / AGP 9.0 | **confirmed**（带四个边界） | 渲染主车道成立：四形态均有官方文档化示例；AGP 9.0 兼容自 Roborazzi 1.56.0 官方声明（PR #782）。边界已纳入 2.2 节：KMP×Gradle 9.4.1+ 间歇故障（#830 open，纯 Android 不受影响）；Robolectric release 约半年一版（非月度，提交日常活跃）；robolectric-processor 与 AGP 9 builtInKotlin 不兼容（#10909，仅自定义 shadow 受影响）；SDK 36 需 JDK 21。跨 OS 基线像素差异已由 5.3 节"golden 仅 mac 录制"铁律覆盖。另注：RNG 的 mac arm64 支持是"CI 矩阵 + 构件实物"级事实支持，非成文文档承诺 | [Maven Central nativeruntime-dist-compat 1.0.19](https://repo1.maven.org/maven2/org/robolectric/nativeruntime-dist-compat/1.0.19/)（jar 内含 `native/mac/aarch64/librobolectric-nativeruntime.dylib`，实物解包验证）；[graphics_tests.yml](https://github.com/robolectric/robolectric/blob/master/.github/workflows/graphics_tests.yml)（CI 矩阵显式含 macos-latest arm64）；[roborazzi releases](https://github.com/takahirom/roborazzi/releases)（1.63.0，2026-05-20，近 7 月 10 版）；[Roborazzi README](https://github.com/takahirom/roborazzi/blob/main/README.md)（四形态示例）；[AGP 9.0 release notes](https://developer.android.com/build/releases/past-releases/agp-9-0-0-release-notes) |
| C2 | headless JVM 渲染零 TCC / 零 Hypervisor，Seatbelt 沙箱内零弹窗可运行 | **confirmed** | 成立。三个边界条件已纳入 2.2 节：预下载 + `robolectric.offline=true`；可写可加载的 tmpdir；`-Djava.awt.headless=true` 封死 AWT→WindowServer 路径 | otool/nm 符号取证（nativeruntime-dist-compat 1.0.19、layoutlib-runtime 16.2.4：零 AppKit/CG/CT 绑定符号）；本机 sandbox-exec `(deny mach-lookup)(deny network*)` 下 dlopen 成功零弹窗；[Robolectric native runtime 报告](https://utzcoz.github.io/2026/03/01/robolectric-native-runtime-report.html)（HWUI_NULL_GPU/SkiaCpuPipeline 静态链接） |
| C3 | Figma REST nodes/images 提供全量精确基准，scope 仅 file_content:read | **confirmed** | 成立。6 条边界（null bounds、rectangleCornerRadii、characterStyleOverrides、GRID、配额预算、图片 null/30 天/32MP）已纳入 2.1 节 spec.json 生成器要求 | [file-endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/)、[file-node-types](https://developers.figma.com/docs/rest-api/file-node-types/)、[figma/rest-api-spec](https://github.com/figma/rest-api-spec/blob/main/dist/api_types.ts) |
| C4 | desktop MCP 免 token、**无配额限制**，可支撑高频内循环 | **refuted** | **核心前提被证伪**：官方限额对读取类 MCP 工具按 seat/plan 统一计量（Pro Dev/Full = 200/天 + 15/分），无 desktop 豁免，有 desktop 用户撞日配额实例。方案修正：REST 升为主通道；全通道配额预算化；内循环零 Figma 调用（缓存钉版本）；desktop MCP 降为 token 解析与回环流量的辅助通道。免 token / 零外网 / get_variable_defs 非 Enterprise 可用 / Variables REST 仅 Enterprise——这些子断言仍成立 | [rate-limits-access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)（"Per-minute rate limits apply in addition to daily or monthly tool call limits"）；本机实测 curl initialize 免凭证成功；[Figma 论坛 51927](https://forum.figma.com/report-a-problem-6/figma-mcp-rate-limit-exceeded-please-try-again-tomorrow-51927)（desktop 撞日配额）；[variables REST](https://developers.figma.com/docs/rest-api/variables/)（"must have a Full seat in an Enterprise org"） |
| C5 | `onRoot().fetchSemanticsNodes()` 完整导出语义树（testTag/boundsInRoot(dp)/text/role），密度固定 2.0 | **uncertain**（管线可行，原表述 4 处口径错误） | 修正已纳入 2.3/4 节：API 为 `fetchSemanticsNode()`（单数）递归或 `onAllNodes(...).fetchSemanticsNodes()`；**无语义节点不在树中**（testTag 覆盖成硬前置）；坐标取 `positionInRoot+size`（unclipped px）÷ density 换算 dp，不能直接拿 boundsInRoot 当 dp；Robolectric 默认 mdpi/1.0，密度与窗口必须显式 `@Config(qualifiers)` 钉死；Figma 坐标先 re-base 到 Frame 原点，"1 Figma 单位=1dp"是行业惯例需 Day 0.5 标定 | [androidx BoundsAssertions.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/ui/ui-test/src/commonMain/kotlin/androidx/compose/ui/test/BoundsAssertions.kt)（默认公差 `Dp(.5f)`）；[Compose semantics 文档](https://developer.android.com/develop/ui/compose/accessibility/semantics)；[robolectric.org/device-configuration](https://robolectric.org/device-configuration/)；[Now in Android screenshot-testing](https://github.com/android/nowinandroid/blob/main/core/screenshot-testing/build.gradle.kts) |
| C6 | 暖 Gradle daemon + `--tests` 可把单轮压到 2~6s，Robolectric 冷启动可被 daemon 摊薄 | **refuted** | **核心承重被证伪**：Gradle 测试永远 fork 全新 test worker JVM，Robolectric sandbox 缓存随 worker 进程死亡，暖 daemon 摊不薄逐轮数秒的初始化；"250 张 5s / 250 测试 20s"引用源不实且是批量吞吐非迭代固定成本。方案修正（2.2 节）：慢车道延迟预算改为 10~30s/轮；秒级目标只能靠常驻渲染 JVM（persistent worker）快车道，仅静态 @Preview，Phase 1 验证可行性；MVP 验收标准相应改写 | [Gradle Test DSL](https://docs.gradle.org/current/dsl/org.gradle.api.tasks.testing.Test.html)（"Test are always run in separate JVMs"）；[Worker API](https://docs.gradle.org/current/userguide/worker_api.html)（worker 不跨 build 持久）；[robolectric.org/architecture](https://robolectric.org/architecture/)；[robolectric#5561](https://github.com/robolectric/robolectric/issues/5561) |
| C7 | odiff 4.3.8 活跃维护、SIMD、server 常驻模式；looks-same 支持 CIEDE2000 + 差异簇包围盒 | **confirmed** | 成立。两处措辞收紧（2.4 节）："约 5.5~6.6x vs pixelmatch（自报端到端基准）"；looks-same 实际最新 10.0.1（2025-08，维护节奏慢于 odiff 但体系仍活） | [odiff README/releases](https://github.com/dmtrKovalenko/odiff)（benchmark 表、`class ODiffServer` 源码）；[looks-same 源码](https://github.com/gemini-testing/looks-same/blob/master/index.js)（`makeCIEDE2000Comparator`、`diffClusters`） |
| C8 | Seatbelt 沙箱只约束 Bash 子进程；MCP server / launchd 进程不受管辖 | **confirmed**（带两个边界） | 字面成立，但**Bash 内薄客户端连 127.0.0.1 默认被拒（EPERM）**——已修正为默认 UDS 通道 + `allowUnixSockets` 白名单（5.2 节）；无人值守 sandbox-runtime 包裹形态下 MCP server 也进沙箱，同样需要该配置 | [sandbox-environments](https://code.claude.com/docs/en/sandbox-environments)（"MCP servers and hooks ... run unconstrained on the host"）；[claude-code#28018](https://github.com/anthropics/claude-code/issues/28018)（loopback 出站 EPERM，open）；[sandbox-runtime Seatbelt profile 源码](https://github.com/anthropic-experimental/sandbox-runtime/blob/main/src/sandbox/macos-sandbox-utils.ts) |
| C9 | magpie 扩展点存在；新增证据类型 + artifact 路径后"缺证据即 fail"，无需改验证主逻辑 | **uncertain**（结构成立，强制语义不成立） | 结构性断言全部命中（union/if-push/调用点/runSafeCommand 行号均核验）。但 `hasEvidenceType` 是 ANY-of 语义：朴素追加到 ui_change case 时，只要有 integration_test_result 证据就 PASS。修正（5.1 节）：`uiv pin` 注入 declaredEvidenceTypes=['ui_visual_validation'] 的**独立判定单元**；Phase 2 验收必须含 ANY-of 反例测试 | 本仓库 main@8e0dcb2 实测：evidence-taxonomy.ts L4/L27/L68/L100-102、requirement-contract.ts L339-343/L419-421/L673-758/L851-877、execute.ts L6682（工作区）/L6675（HEAD）、runtime.ts L1804 |

**内容态验证承重断言核查（CS 系列，对应 3.3 节）**：

| ID | 承重断言（缩写） | verdict | 对方案的影响与修正 | 关键证据 |
|----|----------------|---------|-------------------|---------|
| CS1 | Compose `hasVisualOverflow` 可在 Robolectric headless 纯语义模式读出（含 maxLines 限制 + 超长文本正确返回 true），无需像素渲染 | **uncertain** | 不需像素**渲染**，但需真实**测量**：LEGACY 模式伪造测量（TextPaint 返零），超长+maxLines 下可能假阴读出 false。修正（3.3/2.4）：文本溢出 invariant 仅在 `@GraphicsMode(NATIVE)` 且 Phase 0 实测钉住后进硬门禁，否则 advisory（`native_graphics_unverified`） | Robolectric LEGACY 图形模式文本测量为桩值；NATIVE 模式 opt-in 提供真实字形测量；需 4.16 实测确认 |
| CS2 | XML TextView 截断可经 `getEllipsize()!=null` + `getLayout().getEllipsisCount(line)>0` 检测（measure+layout 完成后） | **refuted** | LEGACY 模式 `getEllipsisCount` 恒 0（ellipsize 模拟已 revert PR #9834）。修正：须 `@GraphicsMode(NATIVE)` + `@Config(minSdk≥26)`，且因 Robolectric 自证用直构 StaticLayout 非 TextView 路径，须补"真 TextView measure+layout 后断言"的钉版本测试 | Robolectric PR #9834（ellipsize 模拟回退）；ShadowNativeStaticLayoutTest 用直构 StaticLayout |
| CS3 | 裁剪/重叠/最小触控三项 100% 由导出语义树 bounds 纯几何算出，触控用 `positionInRoot+size÷density` 且仅对 isClickable/isFocusable 节点 | **uncertain**（裁剪重叠成立，触控口径错） | 修正（2.4/3.3）：最小触控**必须读 `touchBoundsInRoot`**——Compose 输入层把 clickable 触控盒自动外扩到 48dp，layout 几何盒不反映外扩，用它会误判合规小图标；判交互节点用 `SemanticsActions.OnClick/Role/Focused`，无 `isClickable/isFocusable` 布尔属性。裁剪严格检测须 clipped+unclipped 作差。density 2.0/unclipped 口径 doc 已闭合 | Compose `touchBoundsInRoot` 语义（ViewConfiguration 触控外扩）；`minimumInteractiveComponentSize` 仅影响 layout 占位 |
| CS4 | `@Config(qualifiers)` 可设 RTL 与文案膨胀：ar-XB 触发 RTL 镜像、en-XA 触发 ~30% 膨胀暴露溢出 | **uncertain**（RTL 成立，en-XA 不成立） | 修正（3.3/局限 3）：ar-XB（或 Compose 侧 `LocalLayoutDirection=Rtl`）翻转 layoutDirection 可信，作 RTL 探针；**en-XA 拉不出文案膨胀**——伪本地化是 AAPT2 构建期特性（须 `pseudoLocalesEnabled`），Robolectric 不合成。i18n 膨胀只能靠 fixture 注入长串模拟 | Robolectric PR #7410（ar-XB RTL flip，BootstrapTest 单测）；伪本地化为 AAPT2 build-time 输出 |
| CS5 | ComposablePreviewScanner 0.9.x **不会**自动枚举 PreviewParameterProvider 各值，须手写遍历否则只渲染首值 | **refuted** | 纠正心智模型：scanner 在扫描阶段就自动按 provider values 序列 `mapIndexed` 展开成多个 ComposablePreview（受 `@PreviewParameter(limit=)` 约束）。模型唯一职责是把状态写进 Provider values，测试侧遍历已展开列表逐个 capture 即可，无"只渲染首值"隐患 | ComposablePreviewScanner 扫描阶段 provider 展开逻辑 |
| CS6 | Figma REST 不返回 Component Set 各 variant 的独立几何，须客户端按属性绑定推断 | **refuted** | 纠正：每个 variant 是 COMPONENT_SET 下**独立子 COMPONENT 节点，各有独立 node id 与 absoluteBoundingBox**，几何直接读不用推断；`componentPropertyDefinitions.variantOptions` 仅用于枚举状态。分状态基准（3.3）因此可直接 pin。re-base 减 frame 原点 + null 判空仍是前置 | [figma/rest-api-spec](https://github.com/figma/rest-api-spec)（COMPONENT_SET 子 COMPONENT 节点结构） |
| CS7 | 对比度须渲染像素交 Google ATF 算（gradient/图片背景下语义算不出有效背景色）；contentDescription 缺失属纯语义可直接读 | **confirmed** | 成立。contentDescription 进 invariant 纯语义路径；对比度归 Phase 3 像素增强，Robolectric 查 Compose 内容须 `robolectric.useRealAni`（4.15+） | Google Accessibility Test Framework ContrastCheck；AccessibilityNodeInfo contentDescription |

### 8. MVP 分阶段计划

分四阶段。延迟相关验收标准已按 C6 证伪结果改写——先实测、再定预算，不预设秒级。

**Phase 0 是硬边界**：第一版只有三样东西——冷 Gradle、`uiv` CLI、L2 v0。daemon、MCP server、VLM judge、CI 接入、Figma token 解析（desktop MCP 辅助通道）、Paparazzi 快车道全部押后；在 Phase 0 验收标准（一个中等复杂度 Compose 卡片，模型仅凭 report.json 在 ≤5 轮内修到 L2 全过）达成之前，**不开工任何 Phase 1+ 的平台工程**。理由：基础口径（dp 换算、坐标 re-base、容差）没标定就堆平台层，错误口径会被固化进所有上层组件，返工成本成倍放大。

**Phase 0 —— 假设证伪 + 可用闭环（Day 0.5~3，无 daemon、无 MCP，纯 CLI + 冷 Gradle）**

- **Day 0.5（手动闭环日，写任何 CLI 代码之前）**：人工用 Figma 截图（REST images / MCP get_screenshot）+ `npx odiff-bin` 实测三个最便宜的关键口径假设：① density 2.0 ↔ scale=2 对齐是否成立（"1 Figma 单位=1dp"标定）；② odiff 对 2x 整页大图的实际耗时；③ `get_metadata` XML 坐标系语义（绝对 vs 相对父级，与 REST absoluteBoundingBox 对比标定）。任一证伪立即修正容差与口径设定，避免污染后续全部阈值。
  *（取舍：嫁接评审方案的 D2 前置证伪法；原方案 3 天直接开写被评为过于激进。）*
- **Day 1**：搭 demo Android 工程（1 个 module，Compose + Roborazzi 1.63 + Robolectric 4.16 + ComposablePreviewScanner，convention plugin 雏形；`GRADLE_USER_HOME=./.gradle-home`；预热依赖与 android-all jar + `robolectric.offline=true` 验证）。**实测并记录**：暖/冷 Gradle 下单 preview 截图测试的端到端延迟（预期 10~30s，以实测为准定内循环预算）。**NATIVE 文本度量钉版本实测（CS1/CS2 门槛）**：用 `@GraphicsMode(NATIVE)` 实跑 `Text(maxLines=1, overflow=Ellipsis)` + 超长串，确认 `hasVisualOverflow` 返回 true、真 TextView measure+layout 后 `getEllipsisCount>0`，并与 LEGACY 模式对比。未通过则文本溢出/截断两项 invariant 永久 advisory，不进硬门禁。
- **Day 2**：`uiv` CLI 骨架（TS）：`baseline pull`（REST nodes+images，version 钉住，归一化借 Framelink extractors，写 mapping.json）+ `check`（spawn `./gradlew testDebugUnitTest --tests ... -Proborazzi.test.compare=true`）+ L1（odiff 双指标 + looks-same 聚类，**仅 advisory**）→ report.json v0。
- **Day 3**：semantics-exporter JUnit Rule（`fetchSemanticsNode` 递归导出 + px→dp 换算 + qualifiers 钉死）+ L2 v0（仅 testTag 主策略 + 位置/尺寸/字号/颜色四类断言）+ state.json 防震荡分层指标 → report.json v1 含 violations+hint。用 Claude Code 经 Bash 实跑"给一个 Figma 卡片 → 模型写组件 → uiv check → 按违规清单修到 pass"全流程录屏验收。
- **验收标准**：模型不看渲染图、仅凭 report.json 在 ≤5 轮内把一个中等复杂度卡片修到 L2 全过；单轮延迟实测数据在手；Day 0.5 三项口径标定结论落档。

**Phase 1 —— 内循环提速 + 缓存（第 2 周）**

- render-daemon 慢车道（Gradle Tooling API）+ UDS 通道；`uiv check` 接热路径、保留 `--no-daemon` 冷路径降级；odiff server 模式常驻。
- **快车道可行性验证**：Paparazzi 2.0 程序化钩子嵌 daemon 渲染静态 @Preview；若 alpha 不可用则评估自建 persistent worker，均不可行则接受慢车道预算。启用快车道的前置加固：UDS 或 token 鉴权，禁止裸 localhost HTTP 触发构建。
- figma-spec-cache 加配额预算器与 `(fileKey,nodeId,version)` 缓存、desktop MCP 辅助通道（get_variable_defs）；L2 补降级 1/2（文本匹配 + LCS）与 untaggedCoverage 指标、<80% 匹配熔断。
- **验收标准**：断网（预热后）内循环可跑；慢车道单轮 P50 ≤ Phase 0 实测值的 60%（增量编译+配置缓存收益）；快车道若可行，静态 preview 单轮 P50 ≤6s、P90 ≤10s——若不可行，如实记录并把内循环预算定格在实测值。

**Phase 2 —— magpie loop 接入（第 3 周）**

- 按 5.1 节落地：evidence-taxonomy.ts / state/types.ts / requirement-contract.ts 构建器合并 mapping.json / execute.ts 调用点 + **`uiv pin` 写 mapping.json 注入独立判定单元**（C9 修正路径 + 防重建覆盖）。
- `verify-page` 子命令（Activity 级，设备矩阵 × 内容态矩阵 L 形交叉）；违规摘要注入 retryStateNote；violations 补 `source` 行号归因（testTag grep）。
- **内容态验证落地（3.3 节）**：content fixture 注入（characters/imageRef → @PreviewParameter / FakeImageLoaderEngine）；`uiv pin` 扩展 COMPONENT_SET variant 枚举与分状态基准（CS6）；L2-invariant 套件（裁剪/重叠/touchBoundsInRoot/contentDescription 进门禁，文本溢出截断按 Phase 0 实测结果定门禁/advisory）；mapping.json `states[]` 与 `judgePath` 落地。
- **验收标准**：一个含 ui_change 的需求在 magpie loop 全自动跑通；**ANY-of 反例测试通过**（有 integration_test_result 证据但缺 ui_visual_validation 证据时合同验收 fail）；**合同重建幂等测试通过**（mapping.json 存在时反复 `persistRequirementContract`，uiParity 与专项 requiredEvidence 条目不丢）；**作用域反例测试通过**（仓库存在其他任务的 pin 时，不相关源文档构建的合同不被注入 ui_visual_validation）；**内容态反例测试通过**（longText 态下故意写溢出布局 → L2-invariant fail；变长内容下 parity 态注入对应 fixture 几何仍可比）；报告达标后 pass；存量 loop 测试不回归。

**Phase 3 —— 门面与整页裁判（第 4 周+，按需）**

- ui-verify MCP server（stdio，复用 core）；vlm-judge 双形态（轻量"模型即 VLM" + magpie providers 版，量规清单+证据锚定）；CI 接两道门（`uiv verify-page` parity 硬门禁 + `verifyRoborazziDebug` 视觉回归套件，后者默认仅报告、声明容差后方可阻断）+ `uiv report --junit` + 漂移哨兵定时任务；可选探索 XML View 路线（inflate + view tree 导出）。
- **验收标准**：Claude Code 经 MCP 工具完成同 Phase 0 场景；整页验收报告含 L3 分级建议；CI 红绿门与漂移告警生效。

## 反模式

| 反模式 | 为什么禁止 |
|--------|-----------|
| 把"设计稿 PNG vs 渲染 PNG"裸像素 diff 当还原度门禁 | 跨渲染器底噪（Figma 服务端渲染 vs Skia headless 的抗锯齿/字体度量差异）永远存在，门禁化必然 flake；L1 只做差异定位器 |
| 让 VLM 直接对两张图打还原度分 | VLM 对低级几何差异盲视（58% 准确率）、绝对打分不稳、会幻觉差异；必须证据锚定且只作建议 |
| 依赖"暖 Gradle daemon"实现秒级渲染内循环 | 已被 Gradle 一手文档证伪（C6）：测试永远 fork 新 JVM，Robolectric sandbox 初始化逐轮重付；秒级只能靠常驻渲染 JVM |
| 把 `ui_visual_validation` 朴素追加到 ui_change 的默认证据类型 | `hasEvidenceType` 是 ANY-of 语义（C9）：有集成测试证据时缺视觉证据仍 PASS，门禁形同虚设；必须独立判定单元 |
| 薄客户端在 Bash 沙箱内裸连 127.0.0.1 | Seatbelt 内 loopback 出站默认 EPERM（C8 / issue #28018）；走 UDS + allowUnixSockets |
| 以 desktop MCP "免配额"为前提设计高频拉取 | 已被官方限额文档证伪（C4）；所有读取类 MCP 调用按 seat/plan 计量，必须缓存 + 预算 |
| 依赖 Robolectric 默认 qualifiers 渲染 | 默认 mdpi/density=1.0、320x470dp（C5），与基准 scale=2 不对齐，几何断言全是假阳性；必须显式 `@Config` 钉死 |
| 直接读 `boundsInRoot` 当 dp 比对 | 它是 clipped 的原始 px 值（C5）；须取 unclipped `positionInRoot+size` ÷ density |
| 模型自行判断"这轮有没有变好" | 防震荡必须由工具强制（state.json 分层指标 + regression/regressionReason 输出），模型自律不可靠 |
| 用单一分数严格单调做回退判据 | 会误杀"先重构再修值"的合理路径、卡在局部最优；判据是分层比较（blocking 违规数主键 + 总分次键）且连续 2 轮停滞才触发 |
| L2 匹配率很低时仍输出违规清单 | 坏匹配产生误导性违规会把模型带偏；<80% 熔断为"匹配失败报告"，但 verdict 必须是 `pass:false + inconclusive`，不是豁免 |
| 把 untaggedCoverage 低 / 匹配熔断当 warning 放行验收 | testTag 是 L2 硬前置：少打 tag = 结构断言失明，warning 放行等于给模型留下"少打 tag 规避门禁"的通道；验收一律 inconclusive fail |
| 把视觉回归套件（golden compare）当还原度门禁 | 它是同渲染器"这次 vs 上次"比对，回答"UI 变没变"而非"像不像设计稿"；环境漂移（Robolectric/JDK/OS 升级）会让 golden 整批爆红——默认仅报告，显式声明容差/ignore-region 后才可阻断 |
| `uiv pin` 直接修改生成后的 requirement-contract.json | 合同从源文档纯函数重建且 session 启动即覆盖写（execute.ts L7891），直接改 JSON 会被静默覆盖；uiParity 丢失后验收绕回 ANY-of 陷阱。唯一写入口是 mapping.json，由构建器合并 |
| 把工具链故障类 inconclusive 喂给模型修代码 | `semantics_export_failed` / `render_harness_error` 是环境问题，让模型"补 tag/改实现"会白烧轮次还可能改坏没错的代码；按 subReason 归类到 environment_gap |
| mapping.json 条目不带作用域全局合并 | 旧任务的 pin 会给所有后续合同注入 ui_visual_validation 专项判定单元，不相关需求永远产不出该证据、验收被假阳性卡死；构建器只合并 scope.sourceDocumentPath 匹配当前源文档的条目，hash 仅作漂移告警 |
| 把 renders/reports/state.json 提交入库，或漏提交 mapping.json/baselines | 前者用可再生临时产物污染仓库历史与评审 diff；后者让 CI parity 门禁离线跑不了、合同 source of truth 丢失。资产分级见第 1 节产物目录约定 |
| 在 Linux CI 上校验 mac 录制的像素 golden | 字体渲染跨平台不一致（Paparazzi #1465）；CI 跑 L2 结构断言或容差 comparator |
| 沙箱内启动长驻 Gradle daemon | 孤儿 daemon 带旧沙箱 profile 长驻，跨调用行为不可预期；沙箱内一律 `--no-daemon` |
| 设计稿漂移直接阻断 CI | version 漂移只告警；重录基准必须人工触发，防设计师改稿静默污染红绿信号 |
| 用占位/空内容渲染就当通过验收 | 空壳渲染既比不了 Figma 默认态（内容不一致几何对不上）也测不到真实溢出/裁剪；须从 characters/imageRef 注入真实内容做 fixture（3.3） |
| 对没有 Figma 基准的内容态硬套 parity 几何断言 | longText/largeList 设计师没画，没有真值可比；硬比会拿错位基准产假阳性。无基准态走 invariant only，由 pin 时点显式声明判定路径 |
| 用 `positionInRoot+size÷density` 判最小触控 48dp | Compose 自动把触控盒外扩到 48dp，layout 几何盒不反映外扩，会把合规小图标误判违规（CS3）；须读 `touchBoundsInRoot` |
| 在 LEGACY 图形模式下把 `hasVisualOverflow`/`getEllipsisCount` 当门禁 | LEGACY 伪造文本测量会读出假阴（CS1/CS2）；须 `@GraphicsMode(NATIVE)` 且 Phase 0 实测钉住，未钉住前列 advisory |
| 用 `@Config(qualifiers="en-XA")` 制造文案膨胀测溢出 | 伪本地化是 AAPT2 构建期特性，Robolectric 不合成（CS4）；i18n 膨胀靠 fixture 注入长串模拟，RTL 才走 ar-XB/LayoutDirection.Rtl |

## 适用范围

**适用**：macOS 本地开发环境下，LLM agent 编写 Jetpack Compose / XML View 布局的还原度自检与验收；magpie loop 的 ui_change 类需求验收；Claude Code 等 harness 的 UI 开发工作流；mac runner 上的 CI 回归。定位：覆盖开发内循环与布局还原验收，预计 90%+ 的 UI 还原问题（间距/对齐/字号/颜色/层级/缺失元素/自适应语义）在此被拦截。

**前置假设**：目标安卓工程可加入 Roborazzi/测试依赖且工具链版本兼容（Java 21 本机已有 Corretto 满足）；执行 agent 的 Figma 账号持 Dev/Full seat；magpie 集成基于 main@8e0dcb2 核验，后续重构需同步本文档。

### 局限与兜底（何时仍需模拟器/真机）

1. **layoutlib/RNG 与真机的系统性保真度偏差（最大局限）**：阴影/elevation 软件近似、字体 hinting 不同可致换行差异、Material You 动态取色返回硬编码默认值、Coil/Glide 网络图静默空白、动画只渲染首帧。应对：L2 结构断言为主门禁（几何/字号/颜色值不受渲染管线影响）、已知差异白名单（阴影区/动态色区 ignore-region）、设计同款字体打包进测试资源。白名单本身是需维护的资产，且可能吞掉白名单区域内的真实错误。
2. **跨渲染器像素噪声**：L1 的定位因此是"变化检测与差异定位器"而非"还原度打分器"，还原度结论以 L2 为准。
3. **真实内容/图片/i18n 不可预测（内容态方法论边界）**：fixture 的"超长/空/大列表"是确定性代理，真实后端可能返回更极端值（emoji 串、零宽连接符、超 4 字节字符）；真实图片的宽高比/透明区/加载耗时不在覆盖内（Robolectric 网络图本就静默空白）；真实 i18n 膨胀拉不到（en-XA 不可用，CS4），德语长词/阿拉伯连写/泰文断行只能真机核。invariant 只能拦"当前 fixture 下垮没垮"，拦不了"线上某条真实数据下垮没垮"——发版前列表页/长文案页/图片驱动布局仍需真实数据真机抽查。RTL 镜像可信，但 RTL 文本整形（bidi/连字）非 layoutlib 强项，须真机核。
4. **文本溢出/截断 invariant 押在 NATIVE 字形测量上**：本仓库无 Robolectric 工具链、未跑过验证，Phase 0 钉住前这两项只作 advisory；即便通过，layoutlib 字体度量与真机仍有亚 dp 差异，临界换行场景须真机核。
5. **设计师没画的状态永远只能回答"垮没垮"**：多数 longText/largeList 天然无基准，invariant 答不了"像不像设计稿"——这是方法论边界而非工具缺陷。
6. **内循环延迟**：慢车道 10~30s/轮为基于 Gradle 机制的推算，未实测；快车道（常驻渲染 JVM）可行性未验证。Phase 0/1 实测定预算，本文档不承诺秒级。
7. **版本风险**：Paparazzi 2.0 仍 alpha、Google CPST 两年停在 0.0.1-alphaXX、layoutlib 是非公开 API 随 Studio 版本漂移；主车道押 Roborazzi（最稳）但其性能受 Robolectric 上游 bug 波动。
8. **自研匹配层质量决定 L2 上限**：testTag 契约靠 prompt 强制，模型不遵守时退化为位置匹配（对换位/缺失组件较脆弱）；untaggedCoverage 指标是缓解不是根治。
9. **Figma 侧硬依赖**：Dev/Full seat、配额预算、desktop MCP 需桌面 App 常驻且文件为活动 tab、自研 MCP client 可能被 Catalog 白名单拒、MCP 工具 schema 2025-2026 间已多次变化需适配层。
10. **VLM 裁判固有缺陷**：对几像素差异盲视、绝对打分不稳、会幻觉差异——L3 已被约束为"仅语义批判+必须引用证据"，结论只作建议。
11. **覆盖盲区——以下场景本方案测不了，发版前保留一次模拟器/真机抽查清单**：GPU 真实渲染效果（复杂 shader/RenderEffect/模糊）、IME 与系统 UI inset 真实行为、滚动物理/手势/动画时序、性能（掉帧/过度绘制）、真实设备字体渲染细节、Material You 真机动态取色、多窗口/折叠屏 posture。
12. **未实测项**：odiff/looks-same 对 Compose 输出 PNG 的色彩空间（sRGB）一致性未验证，若有 P3/sRGB 混用需在渲染配置统一。

## 参考

**渲染**
- Roborazzi：https://github.com/takahirom/roborazzi
- Robolectric（releases / architecture / device-configuration / GraphicsMode）：https://robolectric.org/
- Robolectric native runtime 取证报告：https://utzcoz.github.io/2026/03/01/robolectric-native-runtime-report.html
- Paparazzi：https://cashapp.github.io/paparazzi/ 、https://github.com/cashapp/paparazzi
- ComposablePreviewScanner：https://github.com/sergio-sastre/ComposablePreviewScanner
- Google CPST：https://developer.android.com/studio/preview/compose-screenshot-testing
- Gradle Test DSL / Worker API（C6 证伪依据）：https://docs.gradle.org/current/dsl/org.gradle.api.tasks.testing.Test.html 、https://docs.gradle.org/current/userguide/worker_api.html
- androidx BoundsAssertions（0.5dp 默认公差）：https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/ui/ui-test/src/commonMain/kotlin/androidx/compose/ui/test/BoundsAssertions.kt

**Figma**
- REST file-endpoints / file-node-types / scopes / rate-limits：https://developers.figma.com/docs/rest-api/
- MCP rate-limits-access（C4 证伪依据）：https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/
- MCP tools-and-prompts / local-server-installation：https://developers.figma.com/docs/figma-mcp-server/
- Variables REST（Enterprise-only）：https://developers.figma.com/docs/rest-api/variables/
- figma/rest-api-spec：https://github.com/figma/rest-api-spec
- Framelink（SimplifiedDesign 范式）：https://github.com/GLips/Figma-Context-MCP
- Code Connect（Compose 支持）：https://developers.figma.com/docs/code-connect/

**比对与裁判**
- odiff：https://github.com/dmtrKovalenko/odiff
- looks-same：https://github.com/gemini-testing/looks-same
- reg-cli / Chromatic 阈值实践：https://github.com/reg-viz/reg-cli 、https://www.chromatic.com/docs/threshold/
- GVT（ICSE 2018）：https://arxiv.org/abs/1802.04732
- GUIPilot：https://arxiv.org/html/2506.07385
- VLMs-are-blind（ACCV 2024）：https://arxiv.org/abs/2407.06581
- UI2Code^N（迭代反馈实证）：https://arxiv.org/html/2511.08195v3
- ReLook（渲染失败零分 / Forced Optimization）：https://arxiv.org/abs/2510.11498
- Design2Code（NAACL 2025，分解式指标）：https://arxiv.org/abs/2403.03163
- DCGen（错误分类）：https://arxiv.org/abs/2406.16386

**沙箱与权限**
- Claude Code sandboxing / sandbox-environments：https://code.claude.com/docs/en/sandboxing 、https://code.claude.com/docs/en/sandbox-environments
- loopback 出站 EPERM：https://github.com/anthropics/claude-code/issues/28018
- sandbox-runtime Seatbelt profile：https://github.com/anthropic-experimental/sandbox-runtime
- Gradle 沙箱坑：https://github.com/anthropics/claude-code/issues/16222 、https://github.com/anthropics/claude-code/issues/19380
- Hypervisor entitlement：https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.hypervisor
- Gradle 依赖缓存并发：https://docs.gradle.org/current/userguide/dependency_caching.html

**magpie 内部（接入点核验，main@8e0dcb2）**
- `src/capabilities/loop/application/evidence-taxonomy.ts`（L4 union / L68 collectRequirementEvidence / L100 hasEvidenceType ANY-of）
- `src/capabilities/loop/application/requirement-contract.ts`（L256 inferRequirementTypes / L279 buildRequirementContract 纯函数重建 / L661 persistRequirementContract 覆盖写 / L673 validateRequirementContract / L851 decideRequirementCompletion）
- `src/capabilities/loop/application/execute.ts`（validateRequirementContract 调用点，工作区 L6682）
- `src/capabilities/workflows/shared/runtime.ts`（L1804 runSafeCommand）
- `src/state/types.ts`（L299~376 artifacts *Path 字段块）

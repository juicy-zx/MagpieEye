# 项目状态

> 对外状态唯一来源 · 最近更新：2026-07-15

鹊眼（Magpie Eye）是一个 Android UI 还原度自检 **CLI 工具**：对 Figma 设计稿与
Android 实现（Jetpack Compose / View）做自动化视觉与结构一致性校验，产出可定位到
属性与期望值的违规清单，供编码模型内循环修正与 CI 门禁消费。当前为 **macOS-only**
技术预览开发阶段。交付形态为 **CLI 单通道**；MCP server 代码保留但不作为本预览的
交付通道（见“执行模型与信任边界”）。

本文只陈述可以向第三方承诺的交付与支持状态。架构设计文档可能保留历史方案、
实验结论或尚未交付的能力；它们不构成发布承诺。

## 当前发布状态

目前**没有**可供第三方安装或受支持的发布版本。仓库正准备
`v0.1.0-alpha.1` 技术预览；三个 npm 包仍为私有包，不能作为独立的
`npm publish`/`npx` 安装通道使用。

在完整 bundle、第三方接入文档、许可与安全披露等发布门完成前，仓库中的源码、
构建产物和示例工程都仅供开发验证，不应被表述为第三方可用的 alpha。

## 执行模型与信任边界（重要，安全相关）

`uiv check` 会**执行目标工程的 Gradle 测试代码**。有两条执行 lane：

- **默认 direct**：以当前用户权限直接运行目标工程的 `./gradlew`（用宿主 `~/.gradle`
  缓存、正常联网、继承宿主环境），仅作**本地开发者为自己代码背书**时的默认。它
  **不提供隔离**——目标工程的测试／插件／构建脚本以你的权限执行，可读写本机可访问
  内容并联网。**不要**对未知／AI 生成／不可信来源的代码使用默认 direct。
- **`--sandbox`（显式 opt-in）**：经 macOS Seatbelt 冷路径隔离（禁 network-outbound
  仅留 loopback、`$HOME` 内容读闸、项目本地 `GRADLE_USER_HOME`、`--offline`），
  用于跑未知／AI 生成／不可信 PR／未隔离 CI 的代码。每次运行父进程发射
  `execution` receipt（`effectiveLane` 等）记录实际执行姿态，任一 lane 失败不回退另一
  lane。

**诚实边界**：`--sandbox` 的隔离把 mavenLocal（`~/.m2`）作为已发布制品的显式
bootstrap 输入；它**不宣称**对任意用户 `~/.m2` 中的私有制品提供完整保密隔离——当前
对 `~/.m2` 的整体放行是一项**已登记的安全债**，在对外宣称“可安全运行任意不可信代码
且不暴露宿主制品”前须收紧为专用受控仓。CI／自动化含不可信 checkout 时应固定传
`--sandbox`，不应凭 `CI`／TTY 猜测信任。

**MCP**：server 代码保留且**恒强制 sandbox**（模型无法请求 direct），但本预览
**不以 MCP 作为交付通道**——编码模型经 CLI（`uiv ...`）调用。

## alpha P0 工程进度（内部里程碑，非支持承诺）

以下状态反映仓库当前 HEAD 相对交付检查单（`.claude/plans/delivery-readiness/checklist.md`）
的工程完成度，供技术评审参考；**不代表已发布或已支持**——完整 alpha 仍需下列
“待完成”项全部收口。

- 已完成：P0-1 冷路径执行沙箱（现为 `--sandbox` opt-in，默认改 direct，见上）、
  P0-2 陈旧产物门默认化、P0-3 编译错误分类修复、P0-4 npm 发布合同与 engines 声明、
  P0-9 并发隔离与原子写、P1 机器接口（`uiv preflight` 静态区间校验 + `--module`／
  `--variant` 参数化）。
- P0-8 Android harness 产品化：工程主体**已完成**（交付制品收敛为 view-dump／
  semantics-dump 两制品发 mavenLocal，消费侧接入零构建文件改动——转发由 uiv CLI
  的 init script 自动注入；已发布的 uiv-gradle-plugin:0.1.0-alpha.4 坐标留存不变但
  标记 deprecated，不再随交付演进；仓外 fixture 仅经已发布制品接入、冷道离线跑通；
  golden 四类硬门 View／Semantics／文本布局／bounds；双 lane 信任模型）。当前处
  **ready_for_clean_CI_gate**——仅待一次干净 CI 环境的在线首装（online-bootstrap）
  补证后方可标 alpha 就绪；本机因 JVM／Gradle TLS 路径限制无法替代该证据。
- 待完成：P0-5 完整 bundle 与两层信任链、P0-6 全面脱敏（B 轨）、P0-7 B 轨导出树、
  以及上述 P0-8 的 CI online-bootstrap 补证与已登记安全债（`~/.m2` 放行收紧）。

## 计划中的 alpha 边界（尚未发布）

首个技术预览的目标边界是窄而明确的：macOS arm64、单个 Android application 模块、
Compose 与 View 目标视图，经 `uiv check` 的 direct（默认）或 `--sandbox`（隔离）
lane 执行。daemon/worker、KMP/多模块、以及未验证的平台或工具链都不在 alpha 支持
范围内。在 `--sandbox` 隔离 lane 下，范围外环境（如 `minSdk<26`、非 application
模块、无法定位的模块目录）由 `uiv preflight` 与运行期硬门**明确拒绝**（非零退出码 +
`error.code`），而不是降级为未经声明的执行；`preflight` 对无法静态确认的轴以
`not_evaluated` 标注，不伪装为已验证。默认 direct lane 按设计**不提供隔离**（见
“执行模型与信任边界”），其信任由运行它的操作者承担。

这些是待交付的兼容性合同，不是对当前仓库 HEAD 的支持声明。发布时会在此处补充
实际版本、已验证的环境矩阵、安装入口与已知限制。

### 当前开发环境实测值（单机，非支持承诺）

以下为当前单台开发机的实测工具链版本（检查单 §5-C），仅供参考，**不构成已验证
的支持矩阵**——尚无 CI 覆盖，未做多机/多平台交叉验证：

macOS arm64 · Corretto 21.0.9（Java 17 字节码）· AGP 9.0.1 · Kotlin 2.2.10 ·
Gradle 9.5.1 · Android compileSdk 36 / minSdk 26 · Node 26.3.0 / npm 11.16.0。

Intel/Linux/Windows 明确不支持；Paparazzi 2.0.0-alpha05 为快车道 spike，不计入
本版本。

## 交付面与历史记录

- C 轨 npm/MCP 制品只会分发其显式白名单内的文件；每个候选制品须运行
  `scripts/p0-7-c-tarball-gate.sh`，由实际 `npm pack` 生成的三份 tarball 反向检查，
  拒绝任一包含 `.claude` 路径的归档。
- B 轨脱敏源码快照尚未生成，因而当前不可交付。生成时必须拒绝包含内部计划与过程
  记录的导出树；在该验证通过前，不把 B 轨标为可用。
- 内部计划、实验过程和决策记录不属于对外交付或支持依据。

## 对外文档

- [接入指南](onboarding-guide.md)：现有功能的使用与判定语义。
- [主设计文档](ui-visual-self-verification.md)：架构背景和设计取舍；其中历史内容不替代本页。
- [CI 门禁说明](ci-gate.md)：当前仓库内的本地验证入口。

## 更新规则

每次发布、撤销支持范围、修复安全问题或改变安装通道时，必须同步更新本页的发布状态、
支持矩阵和相关文档链接。没有更新本页的变更，不构成新的第三方支持承诺。

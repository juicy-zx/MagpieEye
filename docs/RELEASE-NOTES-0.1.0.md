# 鹊眼(Magpie Eye)0.1.0 发布说明

## 定位

**这是技术预览(technical preview),不是正式发布版本。**

按 `.claude/plans/delivery-readiness/checklist.md` §3.5.5(独立第三方接入验证)口径,
本版本**显式声明:尚未经过外部独立验证**——目前只有第一方(维护者自身)在本仓与有限
的仓外 fixture 上完成过接入验证,没有第一方仓库以外的真实第三方工程接入案例作为
佐证。请勿将本版本视为已具备生产可用性或安全性担保;详见下方"已知限制"与
[`SECURITY.md`](../SECURITY.md)。

我们正在征集早期接入者:如果你在自己的 Android 工程上试用了鹊眼,欢迎按下方"反馈
渠道"告诉我们结果(无论成功还是失败)。

## 版本配对

| 组件 | 版本 | 分发方式 |
|---|---|---|
| `uiv` CLI(`@magpie-eye/uiv-core` / `@magpie-eye/uiv-cli` / `@magpie-eye/ui-verify-mcp`) | `0.1.0` | git clone 本仓 + `scripts/install-uiv.sh` |
| Android harness AAR:`com.magpie.uiv:view-dump` | `0.1.0-alpha.4` | 预发布至维护者远程 Maven 仓 |
| Android harness AAR:`com.magpie.uiv:semantics-dump` | `0.1.0-alpha.4` | 预发布至维护者远程 Maven 仓 |

这是当前唯一受支持的版本配对——CLI `0.1.0` 只与 harness AAR `0.1.0-alpha.4`
一起验证过,请勿混用其他坐标版本。

历史坐标 `com.magpie.uiv:uiv-gradle-plugin` **已退场**:早期版本需要目标工程额外应用
一个 Gradle 插件做任务转发,现在转发职责已改由 `uiv` CLI 在执行 `check`/`verify-page`
时通过 Gradle init script 自动注入,消费方构建文件不需要声明该插件。已发布的
`uiv-gradle-plugin:0.1.0-alpha.4` 坐标保留但标记 **deprecated**,不再随后续交付演进。

制品完整性摘要(两枚 AAR 的 SHA-256、CLI 交付根摘要口径)见
[`docs/RELEASE-0.1.0-digests.md`](RELEASE-0.1.0-digests.md)。

## 能力面

`uiv` CLI 提供以下子命令:

- `uiv preflight`:静态前置校验(工具链版本、模块拓扑、`minSdk` 等区间检查),在真正
  执行 Gradle 之前尽早拒绝范围外环境。
- `uiv pin`:钉版本基准——从 Figma 拉取几何/色值归一化基线,写入 `spec.json` 与
  `mapping.json` 条目。
- `uiv check`:内循环校验入口,对单个已挂 `fig:<nodeId>` tag 的预览/测试跑一次结构与
  像素比对。
- `uiv verify-page`:整页/多控件矩阵校验,收口到页面级验收。

判定分两层:**L2 结构裁判为硬门禁**(违规即 `pass:false`,退出码非零),**L1 像素比对
为 advisory**(只进报告、不进门禁,用于人工定位差异区域)。

执行姿态分两条 lane:**`direct`(默认)** 以当前用户权限直连目标工程 `./gradlew`,
不提供隔离,仅供开发者为自己代码背书;**`--sandbox`(显式 opt-in)** 经 macOS Seatbelt
提供冷路径隔离,用于跑未知/AI 生成/不可信来源的代码。两条 lane 的边界、能力与限制见
[`SECURITY.md`](../SECURITY.md)"执行模型与威胁面"一节。

目标工程接入**零构建文件插件声明**:任务转发由 `uiv` CLI 每次执行时通过 Gradle
init script 自动注入,消费方只需按 [`docs/quickstart-external.md`](quickstart-external.md)
加远程 Maven 仓与两条测试依赖,不需要额外应用鹊眼专属插件。

完整、权威的支持环境矩阵(操作系统/工具链实测值/已验证边界)以
[`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md)为唯一来源,本文不重复列出,避免产生
第二份口径。

## 已知限制

以下限制按 [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md)与
`.claude/plans/delivery-readiness/checklist.md` P0-8 节口径如实列出,供第三方评估
是否适合当前场景:

1. **平台范围窄**:仅 macOS arm64 的完整校验闭环(`uiv check`/`verify-page` 实际
   渲染)已验证并受支持;Intel/Linux/Windows 明确不受支持,超出范围按未验证场景
   处理,不承诺可用性。
2. **安装通道非标准**:三个 npm 包(`uiv-core`/`uiv-cli`/`ui-verify-mcp`)仍是私有
   包,不提供 `npm publish`/`npx` 独立安装通道;CLI 需 `git clone` 本仓源码后经
   `scripts/install-uiv.sh` 构建安装。
3. **`~/.m2` 放行是已登记的安全债**:`--sandbox` 冷路径隔离把 `~/.m2`
   (mavenLocal)整体作为已发布制品的 bootstrap 输入放行,尚未收紧为专用受控仓,
   因此不对该目录下任意用户已有的私有制品提供完整保密隔离——请勿依赖
   `--sandbox` 保护 `~/.m2` 中的敏感内容。
4. **"干净环境从零可用"证据尚未由本仓独立复核**:P0-8 harness 要求的"在一台干净
   联网设备上从零解析并成功运行一次"验收证据,当前由用户侧留档持有(非本仓构建机
   产出),尚未经本仓或第三方独立复现。首次在自己的干净环境接入时,请预期需要真实
   联网首拉第三方依赖(如 Robolectric `android-all`、AGP、aapt2 等),并建议自行
   走一遍安装到 `uiv check` 通过的完整闭环再据此判断可用性。
5. **接入范围窄**:仅支持单个 `com.android.application` 模块、Compose 或 View
   目标视图,`minSdk` 须 ≥ 26;KMP、多模块、library 模块均不在本预览支持范围内,
   命中时 `uiv preflight` 与运行期硬门会明确拒绝(非零退出码 + `error.code`),不会
   静默降级。

## 安装指引

完整的第三方接入步骤(前置环境、安装 CLI、目标工程接入远程 Maven 仓与测试依赖、
`preflight`/`pin`/`check` 首次跑通、高频排障)见
[`docs/quickstart-external.md`](quickstart-external.md)。

## 反馈渠道

一般使用问题、功能请求、非安全类 bug,请使用仓库常规渠道(Issue/PR)。

安全相关问题请**不要**通过公开渠道报告,改为按
[`SECURITY.md`](../SECURITY.md)所述发送邮件;该文档同时说明了本版本的执行模型、
威胁面与受理范围。

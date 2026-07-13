# 鹊眼(Magpie Eye)

UI 视觉自校验系统:对 Figma 设计稿与 Android Compose 实现做自动视觉一致性验证。
零 TCC、免模拟器的 macOS 本地"渲染 → 比对 → 批判"工具链——headless JVM 渲染
(Roborazzi/Robolectric)出图与语义树,与钉版本的 Figma 基准比对,产出机器可读、
可定位到属性与期望值的违规清单,供编码模型内循环修正与 CI 门禁消费。

裁判分三层:L1 像素 diff 仅 advisory(差异定位器,不参与判定);L2 结构断言
(几何/字号/颜色)是唯一硬门禁;L3 VLM 裁判只作建议。

## 仓库布局

| 目录 | 内容 |
|---|---|
| `packages/uiv-core` | 裁判引擎:Figma 归一化、基准缓存、L1/L2/L3、整页验收与报告 |
| `packages/uiv-cli` | `uiv` CLI(pin / baseline / check / verify-page / report 等) |
| `packages/ui-verify-mcp` | MCP server 薄壳(与 CLI 共用同一 core 库) |
| `demo-android` | 示例 Android 工程(Compose + Roborazzi/Robolectric 渲染) |
| `fastlane-worker` | 快车道常驻渲染 worker(Paparazzi spike,见 `docs/fastlane-feasibility.md`) |
| `daemon` | `uiv-render-daemon` 常驻 Kotlin/JVM 进程(Gradle Tooling API + UDS 慢车道热路径) |
| `docs` | 设计文档、标定结论、CI 门禁、daemon 部署 |
| `scripts` | 验收/标定脚本与本地 CI 入口(`scripts/ci-gate.sh`) |

## 快速开始

```bash
npm install
npm run build   # tsc -b 三个 packages
npm test        # build + vitest run
```

Android 侧构建与 render-daemon 启动(launchd 常驻、沙箱 UDS 白名单)见
`docs/daemon-setup.md`。本地 CI 门禁(门 A 硬门禁 / 门 B 视觉回归 / 漂移哨兵)见
`docs/ci-gate.md`。

## 文档索引

- 主设计文档:`docs/ui-visual-self-verification.md`(架构、设计原则、分层判定口径)
- 真实接入指南:`docs/onboarding-guide.md`(第二个设计接入者从 pin 到 pass 的
  全流程与 tag 挂载方法论)
- 实施台账:`.claude/plans/magpie-eye-full-impl/meta.json`(M0~M4 任务状态、
  遗留项 `pending_followups`、Release Gate 落账)——实现状态以此为准
- Figma 侧标定结论:`docs/calibration.md`

## Release Gate 与 FIGMA_PAT

涉及真实 Figma REST 的标定与验证(Release Gate)需要 `FIGMA_PAT`(Figma 个人
访问令牌;本地放在 `.figma-pat`,已被 gitignore,勿入库)。REST 通道闭环验证已于
2026-07-09 通过(交叉标定 + 常驻回归测试 `cross-calib.test.ts`),详见 meta.json
的 `release_gate_note`。

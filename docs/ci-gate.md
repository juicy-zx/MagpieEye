# 本地 CI 入口(T4.3)

`scripts/ci-gate.sh` 是"CI 平台调用点"的本地可机判形态——真实远程 CI(GitHub Actions/
Jenkins 等 yaml)是用户侧 followup,尚未交付;本脚本是那份 yaml 未来会调用的等价本地命令
序列,`scripts/m4-t43/check-t43.mjs` 对它做红绿四场景验收。

## 0. 两道门 + 一个哨兵(性质区分,不可混用名字)

| | 命令 | 回答的问题 | 阻断性 |
|---|---|---|---|
| 门 A:UI parity 硬门禁 | `uiv verify-page` + `uiv report --junit` | 像不像设计稿(L2 结构断言,唯一裁决者) | exit code 即门 |
| 门 B:视觉回归套件 | `CalibCardScreenshotTest` + `-Proborazzi.test.verify=true`(`verifyRoborazziDebug` 等价显式形态) | UI 有没有非预期变更(同渲染器这次 vs 上次) | **默认仅报告**;显式声明容差(threshold validator)后方可阻断 |
| 哨兵:设计稿漂移 | `uiv baseline pull --check-version` | 钉住的 version 是否落后 Figma `/meta` 最新 | **只告警不阻断**(exit 恒 0);重录基准需人工触发(re-pin) |

三者性质不同,互不代偿:门 A 失败必须 FAIL;门 B 失败默认只是给你看;哨兵漂移永远只是提醒。

## 1. 用法

```bash
scripts/ci-gate.sh
```

exit 0 = 全部关卡通过(门 A 过 + 门 B 未阻断 + 哨兵已检查,不代表无漂移,只代表不阻断)。
非 0 = 门 A 失败(exit 沿用 `uiv verify-page` 自身的 exit code,恒非 0),或门 B 在显式声明
阻断的前提下超出容差(exit 1),或声明阻断但缺容差属用法错误(exit 2)。

## 2. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `UIV_CI_TEST` | `scripts/m3-t35/calib-page-report.snapshot.json` 的 `.test` 字段 | 门 A `verify-page --test` |
| `UIV_CI_NODE` | `1:100` | 门 A `verify-page --node` |
| `UIV_CI_BLOCK_REGRESSION` | (未设,即不阻断) | `1` = 声明门 B 阻断意图 |
| `UIV_CI_TOLERANCE` | (未设) | 门 B 阻断时的显式容差,0..1,传给 `-Puiv.ci.threshold`;声明阻断但未设此项 → `exit 2`(用法错误) |
| `UIV_CI_META_FIXTURE` | `scripts/fixtures/figma-meta.drifted.json` | 哨兵 `--meta-fixture`;真实定期轮询 REST `/meta` 是 pending_followups(B1),此处仍是 fixture 驱动 |

## 3. golden 仅 macOS 录制(铁律)

`demo-android/app/src/test/snapshots/*.png` 只在 macOS 机器上录制/更新。Linux 字体渲染与
macOS 不一致(Paparazzi issue #1465 是实锤同类问题),跨平台像素比对会被字体渲染差异污染出
假红,不能作为可信门禁信号。

**若未来本 CI 迁到 Linux 跑**:门 B 改用容差 comparator(而非零容差精确比对),或干脆只跑
L1/L2 结构断言(门 A,像素无关),禁止裸像素 golden 门禁。门 A 本身(语义树 + 结构断言)与
平台字体渲染细节无关,可以照常跨平台跑。

## 4. 依赖

`/usr/bin/xmllint`(macOS 系统自带,libxml2 `--schema` 校验器,用于校验 `uiv report --junit`
产物过 `scripts/fixtures/junit/junit.xsd`)。非 macOS 环境需自行安装同名工具。

## 5. 远程 CI(followup,未交付)

真实 GitHub Actions/Jenkins 等 yaml 属用户侧 followup——本任务只交付本脚本这个"本地可机判
形态"。落地时 yaml 里的一个 job 基本等价于:checkout → 装 Node/JDK/Android SDK → 跑
`scripts/ci-gate.sh` → 将 `.ui-verify/reports/ci/junit.xml` 交给 CI 平台的 JUnit 报告插件
展示;golden 仅 mac 铁律(§3)意味着门 B 这一步若要在 Linux runner 上跑,需先按 §3 降级。

## 6. demo 全量测试集与 advisory 测试

`scripts/ci-gate.sh` 门 B 已刻意窄 scope 到 `--tests '*CalibCardScreenshotTest'`(§0),不会
触发 demo-android 模块的其余测试类,本节与 ci-gate.sh 自身无关。但如果远程 CI(§5)在
ci-gate.sh 之外**另外**跑一遍 demo 模块的全量单测(如 `./gradlew :app:testDebugUnitTest`
不带 `--tests` 过滤,常见于通用"跑全部测试"步骤),该全量测试集里有两个 advisory 性质的
测试类,红了不代表真回归:

| 测试类 | 性质 | 说明 |
|---|---|---|
| `ContrastCheckTest` | advisory,不进任何门禁 | WCAG 对比度检查(ATF),Codex 裁定的最小版仅供可见性,尚未接入 report/门禁(backlog) |
| `UseRealAniRegressionTest` | 环境敏感的一次性回归钉子 | 复用 `@GraphicsMode(NATIVE)` 语义导出,与 golden 像素比对同源(§3)受平台原生渲染细节影响 |

若 CI 需要跑这份全量测试集,建议二选一:
- 比照门 B 的做法,用 `--tests` 显式限定需要门禁的测试范围(不含上述两类);Gradle 的
  `--tests` 本身是"包含"语义,没有排除单个类的命令行写法,如需精确排除需在
  `demo-android/app/build.gradle.kts` 的 test task 里加 `filter { excludeTestsMatching(...) }`;
- 或者更省事:不改测试范围,把该 CI 步骤在平台层标记为不阻断(如 GitHub Actions
  `continue-on-error: true`、Jenkins "unstable" 阈值),让它的红只作为提示。

两者选一即可,但不要对它们的红默认阻断——那会把 T4.5 交付时明确的 advisory 定位,在 CI 平台
的默认"测试红即失败"规则下被动升级成硬门禁。

## 7. 验收

`node scripts/m4-t43/check-t43.mjs`(红绿四场景 a-d;写偏类验收,改 `CalibCard.kt` 与
golden PNG,与其他写偏任务排他串行;运行前后 `git status --short` 护栏,结束时工作树须与
开始一致)。

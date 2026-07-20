# 鹊眼(Magpie Eye)第三方接入 Quickstart

> 面向读者:**未参与本项目开发**的第三方使用者(人或 AI agent)。目标:仅凭本文档 +
> 仓库 clone + 远程 Maven 坐标,把鹊眼接入自己的 Android 工程,跑通第一个
> `uiv check` pass。
>
> 本文是独立新篇,不改写 `docs/onboarding-guide.md`(详细的 tag 挂载方法论/校验心智
> 模型/已知坑)与 `docs/PROJECT_STATUS.md`(对外发布状态与支持范围的唯一来源)——
> 三者口径一致,遇到本文未覆盖的细节,以另外两篇为准。

## 0. 先读一句话:这是技术预览

鹊眼当前是 **alpha 技术预览**,不是正式发布版本。已验证并受支持的环境范围很窄
(见第 1 节);超出该范围的使用属未验证场景。开始前请浏览一遍文末的"免责声明"。

## 1. 前置环境

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | macOS(推荐 arm64) | CLI 安装本身(`install-uiv.sh`)在 macOS/Linux 均可跑;但当前**已验证并受支持**的完整校验闭环(`uiv check`/`verify-page` 实际渲染)仅 macOS arm64——Intel/Linux/Windows 明确不受支持,超出范围按未验证处理。权威口径见 [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md)。 |
| Node.js | ≥ 26 | `engines` 字段硬门,版本不足 `install-uiv.sh` 会直接拒绝 |
| npm | ≥ 11 | 同上 |
| JDK | 与目标 Android 工程一致 | harness AAR 编译目标字节码为 Java 17;已验证环境用 Corretto 21 |
| Android SDK | 与目标工程一致 | harness `compileSdk 36`,`minSdk` 硬约束 ≥26(低于则 `preflight` 直接拒绝) |
| 目标工程形态 | 单个 `com.android.application` 模块,Compose 或 View 目标视图 | KMP/多模块/library 模块不在 alpha 支持范围内 |

AGP/Kotlin 具体版本组合不构成本文的独立支持矩阵——当前**唯一已验证过的工具链组合**
(而非承诺支持的矩阵范围)记录在 `docs/PROJECT_STATUS.md` 的"当前开发环境实测值"一节,
请以该处为准;本文不重复列出,以免与其产生第二份口径。

## 2. 安装 CLI

```bash
git clone <本仓 Git 地址>       # 由维护者提供;仓库当前为私有(LICENSE=UNLICENSED)
cd magpie_eye
./scripts/install-uiv.sh
```

脚本行为(细节以脚本本身为准,这里不重复):做前置版本检查、`npm install` + `npm run
build`(三个 workspace 包),然后尝试 `npm link` 建立全局 `uiv` 命令;若本机 npm 前缀
不可写,会自动退化为写入 `~/.local/bin/uiv` 的 wrapper 脚本。若不需要全局命令,可加
`--skip-link`,之后用 `node <仓库根>/packages/uiv-cli/dist/index.js` 调用。

脚本末尾会跑 `uiv --version` 做安装自检;看到版本号输出即安装成功。

**注意**:此步骤只装 CLI 本身;它不处理 Android harness 制品(见下一节),也不下载
Robolectric `android-all` (首次 `uiv check` 渲染时由 Gradle 联网下载,之后可离线)。

## 3. 目标工程配置

在**你要接入校验的 Android 工程**(不是本仓)里改动以下内容:

### 3.1 repositories 加远程 Maven 仓

```kotlin
// 目标工程根 build.gradle.kts 或对应模块
repositories {
    google()
    mavenCentral()
    maven { url = uri("<UIV_MAVEN_REPO_URL>") }   // 待维护者替换为实际远程仓地址
}
```

### 3.2 目标模块加测试依赖

```kotlin
dependencies {
    // View/XML 屏用 view-dump;Compose 屏用 semantics-dump;两者可在同工程并存
    testImplementation("com.magpie.uiv:view-dump:0.1.0-alpha.4")
    // testImplementation("com.magpie.uiv:semantics-dump:0.1.0-alpha.4")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.63.0")
}
```

`roborazzi` 插件仍需按常规方式在根 `build.gradle` 的 `buildscript.dependencies`(或
plugins DSL)引入并在目标模块 `apply`——它是渲染 PNG 用的通用第三方工具,不属于鹊眼
专属插件。

### 3.3 零插件零构建改动:uiv 自身的转发不需要你配置

历史上鹊眼需要目标工程额外应用一个 `uiv-gradle-plugin` 做任务转发;**现在不需要**——
转发职责改由 `uiv` CLI 在执行 `check`/`verify-page` 时通过 Gradle **init script** 自动
注入,消费方的构建文件里不需要添加任何鹊眼专属插件声明。3.1/3.2 两步(仓库源 + 测试
依赖 + 通用 roborazzi 插件)是唯一需要你手改的构建文件内容。

## 4. 首次校验

### 4.1 静态前置门:`uiv preflight`

```bash
uiv preflight --project <目标工程根> --module :app --json
```

- exit 0:硬前置满足(可能带 `W_DECLARED_STACK_UNVERIFIED` 警告,意为"声明的工具栈超出
  已验证基线,未被证伪但也未被证实",不阻断)。
- 非 0 + `error.code`:硬前置不满足,常见码见第 5 节。

### 4.2 写布局与测试:按 skill 规程

把 Figma 设计稿转写为 Android 布局(XML 或 Compose)并挂 `fig:<nodeId>` tag、写
`ScreenshotTest`,是学习曲线最陡的一步,**不在本文重复**——完整方法论(tag 挂载层级、
命名三锚点、双射门、常见坑)见仓内技能文档
[`.claude/skills/uiv-design-to-layout/SKILL.md`](../.claude/skills/uiv-design-to-layout/SKILL.md),
照着执行即可。

### 4.3 pin:钉版本基准

```bash
uiv pin --file <Figma 文件 Key> --node <Figma 节点 ID> \
  --test <你的测试类完全限定名> --demo <目标工程根>
```

产出 `spec.json`(几何/色值归一化基线)与 `mapping.json` 条目(记录 version/minScore/
matrix,供后续 `check`/`verify-page` 读取)。`WARN baseline.png missing` 属预期行为,只
影响 L1(advisory),不阻断硬门禁;如需 L1 像素比对,按 onboarding-guide 第 2.3 节手工
补 `baseline.png`。

### 4.4 check:内循环

```bash
uiv check --preview <pkg>.<Name>Preview --node <Figma 节点 ID> --demo <目标工程根> --module :app
```

stdout 末行是 `report.json` 绝对路径。**退出码契约**:

| exit | 含义 |
|---|---|
| `0` | pass |
| `1` | fail(违规确凿,按 `report.json` 的 `violations[]` 改实现)或 inconclusive(证据不足,按 `subReason` 修验证环境/契约本身,不要当 fail 去改 UI) |
| `2` | 用法错误(参数/前置校验异常) |

（另有 `--record` 录制 golden 场景:`pass=false` 时拒绝录制,exit `3`,防止误录失败态
基线;此为附加约束,不改变上表的 0/1/2 主契约。）

pass 后按需 `--record` 录制 golden PNG,再收口到整页矩阵 `uiv verify-page`(见
`docs/onboarding-guide.md` 第 6 节)。

## 5. 排障(最高频五条)

| 现象 | 原因 | 处理 |
|---|---|---|
| `structural.missing` 覆盖了几乎所有节点 / `matchRate` 接近 0 | 忘记给 tag 加 `fig:` 前缀,或前缀拼错 | 检查布局里的 `android:tag`/`testTag`,必须是 `fig:<原样 Figma nodeId>` |
| `reason: inconclusive`,`subReason: tag_coverage_low` | 打了 tag 的节点没覆盖到 0.9 门槛 | 读 `report.json` 的 `structural.untagged[]`,把每条 `suggestedTag` 逐个补到对应实现节点,不要人肉数节点 |
| `subReason: render_harness_error` | 渲染没有产出 PNG/语义 dump,没能进入 L2 判定 | 直接跑 `gradle :app:test<Variant>UnitTest --tests <测试类FQN>` 看真实报错;常见是没接 roborazzi(3.2 节)或 Robolectric `android-all` 缺本机缓存 |
| check 结果与刚改的代码对不上,像是读了旧产物 | Gradle up-to-date/build cache 让测试没真跑,吃了上一轮的陈旧 dump | 加环境变量强制真重跑:`UIV_RERUN=1 uiv check ...` |
| `uiv preflight` 非 0 退出,`error.code` 为 `E_MODULE_DIR_NOT_FOUND` / `E_MIN_SDK_BELOW_MIN` / `E_NON_APPLICATION_MODULE` | 依次为:`--module` 指向的目录下找不到 `build.gradle[.kts]` / 目标模块 `minSdk` 低于 26 / 所选模块不是 `com.android.application`(如选到了 library 模块) | 核对 `--module` 参数、目标模块的 `minSdk`、确认接入的是 application 模块而非 library |

更完整的诊断码速查表见 skill 文档(4.6 节末尾"诊断 codes 速查表")与
`docs/onboarding-guide.md` 第 5.3/8 节(FAQ,尤其 fail vs inconclusive 的区分)。

## 6. 免责声明

鹊眼当前处于**技术预览阶段**,尚未经过外部独立验证(第一方仓库外的真实工程接入案例
有限),不提供生产环境可用性或安全性的任何担保。使用前请阅读
[`SECURITY.md`](../SECURITY.md)了解执行模型与信任边界(尤其是 `direct` 与 `--sandbox`
两条执行 lane 的区别,以及对不可信目标工程的使用建议)。遇到问题或安全相关反馈,渠道
与 `SECURITY.md` 相同:zhuxi8518@gmail.com(best-effort 响应,非 SLA 承诺)。

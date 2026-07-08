verdict: feasible
p50_ms: 15
p90_ms: 17
diff_ratio: 0.0000313

# T2.3 快车道可行性验证报告(Paparazzi 常驻渲染 spike)

> 结论:**可行(feasible)**。G1 ∧ G2 同时满足,且语义树可达(L2 可喂)。
> 本报告只交付事实与数据;是否纳入由 Codex 决断(见末节决断问题)。
> 执行时间:2026-07-09 02:03–02:20(候选 1 实耗约 17 分钟,时间盒 2h 未触顶);判据表执行前写死,未调整任何阈值。

## 1. 版本事实(S1 复核,2026-07-09)

| 项 | 值 | 核验方式 |
|---|---|---|
| Paparazzi 最新 2.0.0-alpha* | **2.0.0-alpha05**(lastUpdated 2026-05-20,无更新版本) | Maven Central maven-metadata.xml 实查 |
| LayoutLib | 16.2.1(mac-arm runtime + resources,gradle transforms 缓存实证) | 测试 JVM 系统属性 dump |
| demo-android 工具链 | AGP 9.0.1 + 内建 Kotlin 2.2.10 + compose-bom 2026.06.00 + Gradle 9.5.1 | gradle/libs.versions.toml |
| 本机 JDK | Corretto 21.0.9(满足 alpha04+ 的 Java 21+ 要求) | java -version |
| 计划预判修正 | 「Paparazzi 插件大概率不能 apply 进 AGP 9.0.1」——**实测证伪**,见 §3 S2 | 机判 |

## 2. 判据逐项结果(执行前写死,事后未放宽)

| # | 判据 | 阈值 | 实测 | 结果 |
|---|------|------|------|------|
| G1 | 单轮延迟(预热 3 轮后连续 N=20;口径 = stdin 渲染指令写入 → PNG 落盘完成) | P50≤6000ms ∧ P90≤10000ms | **P50=15ms,P90=17ms**(20 样本区间 14–18ms) | **✓ 通过** |
| G2 | 与慢车道视觉一致(同一 CalibCard,720×400px @ density 2.0 对齐后 npx odiff-bin) | diffRatio<0.01 | 默认参数(t=0.1):9 像素差 / 288000 = **0.0000313**;L1 生产参数(t=0.063+antialiasing):**0 像素差(exit 0)** | **✓ 通过** |

**不可行条件 F1~F5:全部未命中。** F1 共存成立(见 S2);F2 时间盒剩余充足;F3/F4 见上表;F5 30 轮连续渲染零崩溃零 OOM(-Xmx512m 测试同款配置)。

## 3. 候选 1:Paparazzi 2.0.0-alpha05 程序化钩子(实测)

### S2 共存性机判——预判证伪,共存成立

coexist-probe(`experiments/fastlane-spike/coexist-probe/`)镜像 demo-android 工具链:AGP **9.0.1**(com.android.application)+ 内建 Kotlin(不 apply kotlin-android)+ kotlin.plugin.compose 2.2.10,叠加 `app.cash.paparazzi 2.0.0-alpha05`。
`gradlew tasks` 配置成功,record/verify/clean 全套任务注册(BUILD SUCCESSFUL;证据 `evidence/s2-coexist-gradlew-tasks.log`)。release note 仅承诺 "pre-AGP 9.0 consumers",AGP 9.0.1 属**未声明但实测可用**——不止配置期:S3 在同一 probe 上执行期出图成功。**因此隔离工程(钉 AGP 8.13.2/Kotlin 2.3.0 的 paparazzi-probe)分支未启用**,全部实验在 demo-android 同款工具链上完成——对产品化是强利好(无双工具链漂移)。

### S3 官方 JUnit4 路线首图

`recordPaparazziDebug` 出图成功(30s 含编译)。一处坑:DeviceConfig 默认 `orientation=PORTRAIT` 会把 720×400 归一为 400×720 并裁掉 badge,需显式 `LANDSCAPE`(已实证修正)。最终 720×400 px @ XHIGH(2.0)与慢车道 golden 逐项对齐。证据:`evidence/s3-record-first-png.log`。

### S4 常驻改造 + 延迟采样(核心)

- **结构**:`RenderWorker.kt`(JUnit-free `main()`)构造 `PaparazziSdk`(alpha05 新程序化入口;renderer/sessionParamsBuilder 为 SDK 静态字段 = JVM 级热态)→ `setup()`+`prepare()` 一次 → 循环读 stdin(`render <fqn> <out.png>` → `snapshot { CalibCardPreview() }` → onNewFrame 回调内 ImageIO 落盘 → 响应 JSON 行)→ `teardown()`。
- **启动配方**:JUnit-free 直启 `java`(绕开 Gradle),classpath/JVM args/系统属性 = `DumpEnvTest` 从真实测试 JVM dump 的地面真值(paparazzi.* 12 项属性、layoutlib runtime/resources 路径、`--add-opens=java.base/java.io`、headless、-Xmx512m)。
- **安全合规(硬性前置)**:worker 纯 stdin/stdout 驱动,**零 socket、零网络监听面**(代码可查证:`coexist-probe/src/test/java/com/magpie/uiv/demo/RenderWorker.kt`)。
- **数据**(`evidence/latency-fastlane.json`,含 30 轮逐轮原始值):

| 指标 | 值 |
|---|---|
| 冷启动(记录项④):java spawn → worker ready | **2286ms**(其中 PaparazziSdk setup 1866ms) |
| 预热 3 轮 | 273 / 27 / 17 ms |
| 采样 20 轮(G1 域) | 17,17,18,16,15,16,18,16,15,16,15,15,15,14,14,14,14,15,16,15 |
| P50 / P90 | **15ms / 17ms**(P50=第10/11位均值;P90=nearest-rank 第18位) |
| 确定性 | 30 轮 PNG **md5 全同**(单一哈希 ef2a23a1…) |
| 内存曲线(记录项②,30 轮) | heap 60→155MB 锯齿(GC 正常回收,第30轮回落 62MB);**RSS 稳定 335–353MB**;无 OOM、无崩溃 |

### S5 视觉一致性(G2)

比对对象:快车道 `evidence/fastlane-CalibCard.png` vs 慢车道 Roborazzi golden(`evidence/slowlane-golden-CalibCard.png`,源 demo-android build 产物)。
- odiff 默认(t=0.1):9 像素差,diffRatio=9/288000=**0.0000313**(exit 22,差异掩膜 `evidence/odiff-default.png`——差异集中于文字抗锯齿边缘)
- odiff L1 生产参数(t=0.063 + antialiasing,与 uiv l1 引擎同):**0 像素差,exit 0**
- 交叉验证:vs `.ui-verify` 管线工件 rendered.png 结果相同(9 / 0);**慢 vs 慢**(两轮 Roborazzi 产物)像素 0 差 → 慢车道像素确定,9 像素为两渲染栈(layoutlib vs Robolectric native)的全部真实差异,远低于 0.01 阈值,未动用 F4 的一次配置排查配额。

### S6 语义可达性(记录项①)

**可达(semantics_reachable=true)**,236ms。路径:worker 自建 `ComposeView(sdk.context).setContent{…}` → `sdk.snapshot(view)` → 在 onNewFrame 回调期(composition 存活)反射 `AndroidComposeView.getSemanticsOwner$ui_release()` → 公开 API 走 `unmergedRootSemanticsNode` 树。
产物 `evidence/fastlane-semantics.json`:5 个 testTag(fig:1:100–104)全在,text 全在,boundsInRoot 与慢车道 semantics.json **逐像素一致**(如 fig:1:101 均为 (24,24) 400×40 @2.0)。慢车道导出器的 colorHex/fontSizeSp 等字段同样取自 SemanticsNode config,快车道可等价导出 → **快车道可服务 L2,非仅 L1/预览**。
代价:1 处 internal API 反射(`$ui_release` 后缀 getter),compose-ui 升级可能漂移(维护风险 §7)。

### S7 候选 1 小结

G1 ✓ G2 ✓ 语义 ✓ 稳定性 ✓ 共存 ✓(AGP 9.0.1 实测)→ **候选 1 可行**。

## 4. 候选 2:自建 Robolectric persistent worker(备胎,不启用)

候选 1 判可行 → 按计划仅落结论:**备胎不启用,不做 P1~P4 完整纸面评估**。
归档最小 spike 判据(写死,T2.3 内不执行,留 Codex 决断后如需再启动):
> 单 JVM 手动构造 sandbox,同一 composable 渲染两次,第二次 <1s,且 10 轮 heap 增长 <50MB;任一不成立即候选 2 判死。

## 5. 慢车道对照与增益比(记录项③)

| 车道 | 值 | 计时口径 |
|---|---|---|
| 慢车道(T1.1 暖构建中位,T2.1 热路径未落地,**待回填**) | 5086ms | `uiv check` 全程:gradle 测试轮(增量编译+Robolectric 启动+渲染+捕获)+ L1/L2 比对 + 报告 |
| 快车道(本 spike) | 15ms | 常驻热进程内:渲染指令 → PNG 落盘(**不含**源码增量编译、不含 L1/L2 比对、不含进程启动) |

名义增益比 ≈ **339×**,但**口径不对等,禁止直接同台宣传**:快车道 15ms 是"已编译 composable 的渲染槽位"。产品化内循环若涉及源码改动,须叠加增量编译(秒级)与 worker 类重载(当前方案 = 重启,2.3s)。**适用域边界**:快车道原生适配的是"已编译 preview 的高频渲染"(preview 浏览、多 preview 扫描、L1 视觉预览);"改代码→看结果"场景的端到端收益需在纳入决策时按 编译+重启+渲染 ≈ 秒级 评估,仍显著优于 5.1s 全程,但不是 15ms。

## 6. 加固路径评估(纳入前置,实现不在 T2.3 范围)

实验期合规:worker 零网络面(纯 stdin/stdout)已满足硬性前置。纳入产品的通道设计(Codex 已确认约束:**UDS 0600 或 token 鉴权,禁裸 localhost HTTP 触发构建/渲染**):

- **推荐:T2.1 daemon 子进程托管**。uiv-render-daemon(已有 UDS `.ui-verify/daemon.sock`,0600,拒绝 workspace 外 cwd)新增 `fastlane.render` cmd → daemon 懒拉起 RenderWorker 为**子进程**并独占其 stdio 管道 → 指令经既有 UDS 转发。worker 本身永不监听任何 socket/端口 → 无新增网络面,自然满足"禁裸 localhost HTTP";鉴权复用 UDS 0600 文件权限,无需 token。
- 改造点清单:① daemon 增 worker 生命周期管理(懒拉起/崩溃重启/宿主退出时 stdin EOF 令其自杀——与 T2.2 odiff server 同款退出策略);② 启动配方产品化(DumpEnvTest 的 dump 逻辑固化为 gradle task,产 launch-spec 文件,worker 环境随构建刷新);③ uiv CLI 选路增 fast lane(报告与车道正交,沿用 T2.1 范式);④ 类重载策略(源码变更后重启 worker,2.3s 冷启动可接受;自定义 classloader 属过度设计,暂缓)。
- token 方案仅当未来跨机/非 UDS 环境才需要,当前无场景。

## 7. 维护风险

1. **alpha 漂移**:`PaparazziSdk` 属 2.0.0-alpha API,随版可变;必须钉死 2.0.0-alpha05,升级需重跑本 spike 判据(bench/s6 脚本已归档可复跑)。
2. **AGP 9.0.1 消费端属未声明支持**:官方口径 "pre-AGP 9.0";本次配置期+执行期实测可用,但每次 AGP/Paparazzi 升级必须重跑 S2 共存机判(coexist-probe 即现成机判夹具)。
3. **语义导出的内部 API 反射**(1 处):`getSemanticsOwner$ui_release`,compose-ui 升级可能改名;失败模式是显式异常,易检测。
4. **双渲染栈一致性**:当前 0 差(L1 参数)是 layoutlib 16.2.1 × Robolectric 4.16 的实测快照;任一侧升级可能引入系统性像素差 → 若纳入,建议把 G2 比对固化为回归检查项。
5. **无双工具链负担**(利好):因 S2 共存成立,快车道与 demo-android 同 AGP/Kotlin/BOM,免去钉旧版 AGP 8.13.2 的平行工具链维护。

## 8. 实验隔离与证据索引

一切实验物仅落 `experiments/fastlane-spike/`(demo-android 与 packages/** 零改动;CalibCard 为标注"不回流不维护"的实验副本;probe 的 build/.gradle 已在 .gitignore,由编排者预编辑)。GRADLE_USER_HOME 沿用 `demo-android/.gradle-home`。

| 证据 | 路径(experiments/fastlane-spike/evidence/) |
|---|---|
| S2 共存机判全文 | s2-coexist-gradlew-tasks.log |
| S3 首图日志 | s3-record-first-png.log |
| 延迟原始数据(30 轮逐轮 wall/worker/heap/RSS/md5) | latency-fastlane.json |
| G2 对照 PNG 对 + odiff 输出 | fastlane-CalibCard.png / slowlane-golden-CalibCard.png / odiff-default.{png,txt} / odiff-l1opts.txt / odiff-slow-vs-slow.txt |
| 语义树(快/慢对照) | fastlane-semantics.json / slowlane-semantics.json |
| 时间盒 | timebox-candidate1-{start,end}.txt(02:03:45 → 02:20:07) |
| worker/driver 源码 | ../coexist-probe/src/test/java/com/magpie/uiv/demo/RenderWorker.kt、../bench-fastlane.mjs、../s6-semantics.mjs |

## 9. 给 Codex 的决断问题

1. 是否纳入快车道(定位 = **加速插槽,不入关键路径**;慢车道仍为唯一验收真源)?
2. 若纳入:确认"UDS/token 加固完成"(§6 推荐 daemon 子进程托管方案)为纳入前置;加固任务与排期归属 **M2 尾 or M4**?
3. §5 口径边界下,"已编译 preview 高频渲染"(15ms)与"改码内循环"(秒级)两个适用域是否都要,还是只取前者?
4. 语义导出依赖 1 处内部反射(§7.3),是否接受该维护面(替代方案 = 快车道仅 L1,L2 仍走慢车道)?

---

## 10. T2.8 产品化落地(Codex D-05 立项后)

D-05 裁定纳入,定位钉死 = **静态 @Preview 组件级加速插槽,不替代慢车道、不进正确性关键路径**;任何不可判/语义不可达/配置漂移/fast lane 崩溃自动回落慢车道。落地结构:

- **`fastlane-worker/`**(独立 Android+Paparazzi Gradle 模块,daemon 工程域):从 §3 spike 的 `RenderWorker.kt` 拷贝改造(标注来源)。改造点:①`dumpSemantics` 升级为慢车道 `SemanticsDumpRule` 逐字段同格式的完整 `SemanticsDump`(density + positionInRoot/size/touchBoundsInRoot/colorHex/fontSizeSp/cornerRadiusPx),使 fast/slow 的 L2 等价;②渲染的 `CalibCard` 组件经构建期 `Sync` 从 demo-android 引入(单一事实源,禁副本漂移);③`render`/`semantics` 指令对 previewFqn 做白名单门。构建:`GRADLE_USER_HOME=demo-android/.gradle-home; demo-android/gradlew -p fastlane-worker testDebugUnitTest --tests *DumpEnvTest --offline`(复用已缓存 transforms,离线)。
- **daemon `renderPreview` cmd**(`daemon/.../FastLaneWorker.kt` 的 `WorkerManager`):懒拉起 worker 为 **stdin/stdout 子进程,零监听面**;两道新鲜度门(源 vs 构建、构建 vs 运行中 worker)确保绝不供陈旧渲染,漂移即回错→回落;随 daemon shutdown hook 清理,无孤儿。
- **uiv CLI 快车道**:静态 preview 先试 fast(daemon 可达 + worker 就绪),PNG+语义树经 `preRendered` 注入喂现有 L1/L2 管线;任何失败自动回落慢车道。`report.lane` ∈ {`fast`,`slow`,`fast-fallback-slow`}(v1 校验器允许缺省=slow 兼容存量)。

### 10.1 钉版本硬门禁条款(必守)

快车道与慢车道分属两套渲染栈(Paparazzi/LayoutLib vs Roborazzi/Robolectric),其像素与语义等价性是**特定版本组合下的实测快照**,非契约保证。故:

> **Paparazzi / AGP / Kotlin / LayoutLib 任一升级,必须重跑 T2.3 spike 判据(S2 共存机判、S3 首图、G1 延迟、G2 像素一致、S6 语义可达),全部通过方可升级;并将新版本组合与实测数据追加登记到本节下表。** 判据脚本已归档可复跑(`experiments/fastlane-spike/bench-fastlane.mjs`、`s6-semantics.mjs`;coexist-probe 为现成共存机判夹具)。未重跑即升级 = 违规。

钉死版本(源:`fastlane-worker/build.gradle.kts`;须与 `demo-android/gradle/libs.versions.toml` 逐一对齐):

| 组件 | 钉死版本 | 升级门禁 |
|---|---|---|
| Paparazzi | 2.0.0-alpha05 | 重跑 S2/S3/G1/G2/S6 |
| AGP | 9.0.1 | 重跑 S2(共存)/G2 |
| Kotlin(内建,plugin.compose) | 2.2.10 | 重跑 S2/G2 |
| LayoutLib | 16.2.1(mac-arm) | 重跑 G2(像素)/S6 |
| compose-bom | 2026.06.00 | 重跑 G2/S6(语义字段) |

升级重跑记录(初始):

| 日期 | 变更 | S2 | S3 | G1(P50) | G2(diffRatio) | S6 | 结论 |
|---|---|---|---|---|---|---|---|
| 2026-07-09 | T2.8 立项基线(上述钉死版本) | ✓ | ✓ | 14ms(worker 渲染中位) | 0.008(L1 advisory,pass 不受影响) | ✓ 语义与慢车道字节级一致 | 纳入 |

### 10.2 T2.8 验收证据(可机判)

| # | 验收项 | 证据 |
|---|---|---|
| 1 | fast 端到端 + L2 等价 | 正确卡片 `check` → `report.lane=fast`、`pass=true`、score=1、violations=[];同一写偏卡片(字号 16→14)fast 与 slow(回落)的 violations 集合**逐字段一致**(fig:1:101 fontSize high),pass/score(0.95)/matchRate(1)全等 |
| 2 | 杀 daemon 自动回落 | daemon 杀后 `check` 自动 `gradle lane=cold`,`report.lane=fast-fallback-slow`,结果正确(写偏 violation 与 fast 一致);worker 随 daemon 退出清理,无孤儿 |
| 3 | fast 单轮延迟 | `docs/latency-m2.json` `t2_8_fast`:wall p50=20ms(worker render 中位 14ms + semantics 4ms + UDS 往返),`pass=true`(≪ 6000ms) |
| 4 | 钉版本条款 | 本节 §10.1 |
| 5 | 回归 | `npm test` 30 文件/209 测试全绿;daemon 单测(含 renderPreview 路由)绿 |

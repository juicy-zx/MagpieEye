# 鹊眼真实接入指南(从 Figma 节点到 verify-page pass)

目标读者:第二个真实设计接入者(人或 AI agent)——手上有一个 Figma 节点,要把它的
Android 实现接入鹊眼并验证到 pass。本文把 2026-07-10 真实项目验证(yanhao 三判据:
39:10844 / 39:10822 / 39:10826)与 T4.4 XML 接入沉淀的全部隐性知识变成显性步骤,
尤其是**语义层级工程**:过 0.9 覆盖门需要刻意设计 tag 挂载层级,远超"抄 spec.json id"
的直觉成本。所有样板均为仓内真实文件,可直接照抄。

约定:下文 `uiv` = `node packages/uiv-cli/dist/index.js`(与 `scripts/ci-gate.sh:39`
同口径;先 `npm run build`)。示例节点均来自真实文件 `hH7NUAlm9DsLRaGScQP0Z1`。

## 1. 五分钟总览

### 1.1 验证心智模型:谁说了算

| 层 | 职责 | 地位 |
|---|---|---|
| L1 像素 diff | 差异定位器(odiff 聚类) | **advisory**,不参与判定 |
| **L2 结构断言** | 几何/字号/颜色逐属性断言 + 免基准 invariant | **唯一硬门禁**,check/verify-page 的 exit code 由它决定 |
| L3 VLM 裁判 | 视觉语义建议 | advisory,只回填建议 |

L2 的 pass 三条件按序短路(`packages/uiv-core/src/l2/verdict.ts`):
① 非 inconclusive(coverage/matchRate 等门全过)→ ② 无 blocking/high 违规 →
③ score ≥ minScore(默认 0.9,只约束 medium/low 累积)。
score = 1 − Σ(severity 权重)/executed,权重 blocking 1.0 / high 0.8 / medium 0.4 / low 0.1。

### 1.2 全流程图谱

```
pin(钉版本基准)                          一次性
  └─ 写实现:挂 fig:<nodeId> tag + ScreenshotTest 骨架
       └─ uiv check ──→ report.json ──→ 改代码 ──→ 再 check   ← 内循环
            └─ uiv verify-page(设备×状态矩阵)                 ← 收口
                 └─ uiv report --junit(CI 消费)
```

退出码约定(`packages/uiv-cli/src/index.ts`):check / verify-page 按
`report.pass ? 0 : 1`;用法错误 exit 2;`--record` 在 pass=false 时拒录 exit 3;
pin / baseline pull / report --junit / --check-version 成功恒 exit 0。

## 2. 前置:PAT、pin 与 baseline.png

### 2.1 FIGMA_PAT

真实 Figma REST 通道需要个人访问令牌。本地放 `.figma-pat`(已 gitignore,勿入库):

```bash
export FIGMA_PAT=$(cat .figma-pat)
```

### 2.2 pin:钉版本 + 落 spec.json + 写 mapping entry

```bash
uiv pin --file hH7NUAlm9DsLRaGScQP0Z1 --node 39:10826 --test com.magpie.uiv.demo.LanguageSelectXmlScreenshotTest --demo demo-android
```

产物(全部相对工程根):

| 产物 | 路径 | 说明 |
|---|---|---|
| spec.json | `.ui-verify/baselines/39-10826@<version>/spec.json` | 归一化 Figma 基准,几何/色值唯一事实源;目录名 = nodeId 冒号转连字符 `@` 响应 version |
| mapping entry | `.ui-verify/mapping.json`(+ 受控签名 `.sig`) | 记 fileKey/nodeId/version/minScore(默认 0.9)/matrix(默认 l-shape)/testFqn/demoDir;check 与 verify-page 的 version/minScore 从这里读,**不许手改**(改了 sig 失配) |

可选旗标:`--min-score <(0,1]>`、`--matrix <l-shape|full|custom:...>`、
`--state name=<变体nodeId>`(可重复,COMPONENT_SET 会自动枚举 variant)、
`--source <需求文档路径>`(决定 scope;不带 = standalone pin)、
`--fixture <本地响应文件>`(离线模式,免 PAT)。带显式参数的例子:

```bash
uiv pin --file hH7NUAlm9DsLRaGScQP0Z1 --node 39:10844 --test com.magpie.uiv.demo.HashtagPanelScreenshotTest --demo demo-android --min-score 0.9 --matrix l-shape
```

pin 后打印 `WARN baseline.png missing` 是**预期行为**:REST `/v1/files/:key/nodes`
只给结构不给图,baseline.png 要手工补(见 2.3);缺它只影响 L1 advisory,不阻断 L2。

### 2.3 手工下载 baseline.png(REST /v1/images,scale=2)

```bash
# 第一步:换取导出 URL(scale=2 对应 density 2.0 校准口径,见 docs/calibration.md)
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/images/hH7NUAlm9DsLRaGScQP0Z1?ids=39:10826&scale=2&format=png&use_absolute_bounds=true"
# 响应形如 {"images":{"39:10826":"https://figma-alpha-api.s3..."}}

# 第二步:下载到 spec.json 同目录(目录名以 pin 输出为准)
curl -sL -o .ui-verify/baselines/39-10826@2342874355766877359/baseline.png "<上一步返回的 URL>"
```

## 3. 写实现的两个契约

### 3.1 契约一:fig:<nodeId> tag

每个要参与比对的节点,挂 `fig:` + **原样** Figma nodeId(不清洗不转义,INSTANCE 内
子节点的 `I39:...;10221:...` 分号 id 照抄):

```kotlin
// Compose(demo-android/.../HashtagPanel.kt)
Modifier.testTag("fig:39:10844")
```

```xml
<!-- XML/View(demo-android/app/src/main/res/layout/language_select.xml) -->
<TextView android:tag="fig:39:10827" ... />
```

tag 契约细则(T4.4 Codex 冻结口径 D2):同一 dump 内 tag 唯一,重复 fail-fast;
非字符串 / 非 `fig:` 前缀的 tag 不参与匹配;XML 侧 `View.getTag()` 原样读默认槽
(业务冲突见第 7.7 条)。

### 3.2 契约二:ScreenshotTest 骨架与三处命名锚

`uiv check --preview <pkg>.<Short>Preview` 的 `<Short>` 是贯穿产物链的**短名锚**,
三处必须一致(`packages/uiv-core/src/check/run.ts`):

| 锚 | 口径 |
|---|---|
| 测试类 | `<pkg>.<Short>ScreenshotTest`(由 --preview 机械改写得到,gradle 跑它) |
| 渲染 PNG | 文件名含 `<Short>`(roborazzi 产物按短名 needle 收集) |
| semantics dump | `demo-android/app/build/uiv/<Short>.semantics.json`(Rule 的 dump 名) |

golden 入库路径同为短名:`src/test/snapshots/<Short>.png`(此目录未被 gitignore,
`--record` 录制后 git add)。注意:XML 靶没有 @Preview composable 也能 check——
`--preview` 只是命名把手,机械映射到测试 FQN,不要求该 composable 真实存在
(39:10826 实测口径)。

**Compose 组件级模板**(照抄 `demo-android/app/src/test/java/com/magpie/uiv/demo/CalibCardScreenshotTest.kt`
或 `HashtagPanelScreenshotTest.kt`):

```kotlin
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")   // density 2.0 门,必须 xhdpi
class HashtagPanelScreenshotTest {
    @get:Rule val composeRule = createComposeRule()
    @get:Rule val dumpRule = SemanticsDumpRule()          // 落 build/uiv/<Short>.semantics.json

    @Test fun captureHashtagPanel() {
        composeRule.setContent { HashtagPanel() }
        composeRule.onNodeWithTag("fig:39:10844")          // node capture 裁到 fig 根
            .captureRoboImage("src/test/snapshots/HashtagPanel.png")
        dumpRule.dump(composeRule, "HashtagPanel")
    }
}
```

**XML/View 模板**(照抄 `LanguageSelectXmlScreenshotTest.kt` + `ViewDumpRule.kt`):
真 Activity `setContentView` + 手动 measure/layout(裸 inflate 宽高全 0,dump 无效),
`ViewDumpRule().dump(root, "<Short>")` 产同 schema 的 semantics.json,引擎零改通吃。

**整页矩阵模板**(照抄 `UploadContentPageScreenshotTest.kt`):qualifiers **不钉在类上**,
`@Before` 里按 `uiv.device` system property `RuntimeEnvironment.setQualifiers(...)`,
fontScale1.3 格由 LocalDensity 覆写。组件级测试不能复用为矩阵测试——@Config 钉死
qualifiers 后 `-Puiv.device` 失效,得到假矩阵。

## 4. 核心章:tag 挂载方法论

这是学习曲线最陡的一章。coverage 门(0.9)的分母、双射门的成立条件都取决于你把
tag 挂在**哪一层**,而不是挂了多少个。

### 4.1 先懂分母:可比对节点集 N

`packages/uiv-core/src/l2/nodeset.ts`:N = spec.json 树中 `visible!==false` 的**叶子**,
剔除三类——纯装饰 VECTOR/BOOLEAN_OPERATION(整体当图,不展开内部)、bbox 为 null、
被 ignore-region 完全覆盖。**容器不进 N**。

两个门都以 N 为分母(`l2/metrics.ts`):

- `untaggedCoverage` = N 中 `fig:<id>` 命中 dump tag 的叶子数 / |N| —— **< 0.9 ⇒
  inconclusive(subReason=tag_coverage_low)**,不是 fail:意为"证据不足无法裁决"。
- `matchRate` = N 中配对成功叶子数 / |N| —— **< 0.8 ⇒ 熔断**:text/lcs 降级配对的
  断言全部抑制,score 归 0,subReason=matching_rate_low(coverage 门优先报)。

推论:给容器挂 tag **不加 coverage 分子**(容器不在 N),但容器 tag 另有大用(4.3)。

### 4.2 两种挂法形态(仓内都有真实样板)

| 形态 | 样板 | tag 数 | 适用 |
|---|---|---|---|
| 最小 tag | `demo-android/.../HashtagPanel.kt`(39:10844) | 6 | 节点少、层级浅的组件;只挂 N 叶子 + 参与 padding 断言的容器 |
| 挂满 tag | `demo-android/.../UploadContent.kt`(39:10822) | 39 | 整页/深层级;每个 Figma 可见节点(含全部中间容器)1:1 挂,39 tag 双射全成立 |

选择法:**先按最小 tag 起步过 coverage 门,报告的 `l2_derived_geometry_skipped`
诊断告诉你哪些容器断言被跳过;想吃满 padding/itemSpacing 派生断言,再向挂满形态
补容器 tag。** 整页接入建议直接挂满——中间容器缺 tag 会把双射打断在半路(4.3)。

### 4.3 双射门:容器 padding/itemSpacing 断言的先决条件

派生几何断言(padding*/itemSpacing,medium,0.5dp 网格容差)只在容器 pair 上跑,
且必须先过两道门(`packages/uiv-core/src/l2/assert.ts` mapDirectChildren):

**门 1(身份双射)**:该容器的**语义直接子节点**与 **Figma 可见直接子节点**形成
一对一双射——每个语义直接子都挂 `fig:` tag、id 恰好指向一个 Figma 可见直接子、
两侧数量相等。任一语义子没挂 tag、你在实现里多包了一层、或把 Figma 的中间容器
拍平掉,双射即失败 → 该容器全部派生断言保守跳过,记
`l2_derived_geometry_skipped(direct_child_correspondence_unproven)` 诊断(不产违规、
不扣分)。

**门 2(设计侧可推导性)**:先拿 Figma 自己的直接子 bbox 重建 authored padding/gap,
重建不出来(counter-axis CENTER/MAX 对齐等)说明该规则在此拓扑下本就不可断言,
按规则粒度跳过记 `design_derivation_mismatch`。这门只消费设计数据——你实现的偏差
不会被它转成 skip。

中间容器"要不要挂"的判断法:

1. Figma 层级里它是某 auto-layout 容器的**直接子**,而该容器有 authored padding
   或 itemSpacing → **必须挂**(否则父容器双射断)。
2. 它自己有 authored padding/itemSpacing 且你想吃这条断言 → 挂它 + 它的全部直接子。
3. 实现侧多出来的纯排版 wrapper(Figma 没有对应节点)→ **不能成为语义直接子**:
   要么不产语义节点,要么并入父测量(Compose 无 testTag 的纯 Modifier 组合通常
   不产节点,天然安全;XML 的 LinearLayout+Space 这类辅助 View 会产节点,故
   `language_select.xml` 刻意用 FrameLayout + 绝对 margin,保持恰好 2 个挂 tag 子)。

### 4.4 哪些节点刻意不挂(真实案例)

- **normalize 口径对不上的容器**:39:10845(input_hashtags)是非 auto-layout
  INSTANCE,归一化后 padding 全 0,与其真实内缩 (16,12,42,108) 永远对不上——挂了
  反而制造 4 条假 padding 违规(`HashtagPanel.kt` 头注释)。
- **会触 siblingOverlap 的装饰/空轨道**:UploadContent 的可见白 X(67518)与
  button 完全同框,若作为语义兄弟必触 siblingOverlap invariant(high)——改为容器
  `drawWithContent` 纯绘制,零语义节点;Frame 2117133853(空进度轨道)与 button
  完全同框,不实现不挂。
- **设计稿里 hidden 的兄弟**:`visible=false` 不进 N,不实现即可,别为它留占位节点。

### 4.5 反馈闭环:untagged.suggestedTag 就是补 tag 清单

coverage 不够时**不要人肉数节点**。report.json 的
`structural.untagged[] = {figmaId, name, suggestedTag}` 列出 N 中每个未命中 tag 的
叶子,`suggestedTag` 字段(`fig:<id>`)可直接复制进代码。标准姿势:

1. check → inconclusive(tag_coverage_low);
2. 读 `structural.untagged`,逐条把 suggestedTag 挂到对应实现节点;
3. 再 check,直到 coverage ≥ 0.9。

### 4.6 text/lcs 免 tag 后备的边界

三级匹配 tag→text→lcs(`packages/uiv-core/src/l2/match.ts`):TEXT 叶子可按文本
相似度(≥0.95)免 tag 配对,剩余叶子走 LCS 几何对齐。但**后备只救 matchRate,
救不了 coverage**——untaggedCoverage 的分子只认 tag 命中。所以"全靠文本配对"
的实现永远过不了 0.9 覆盖门;后备的真实用途是:少量装饰性叶子没挂 tag 时,
不至于把 matchRate 拖到 0.8 熔断线以下。

## 5. check 内循环

### 5.1 命令

```bash
uiv check --preview com.magpie.uiv.demo.HashtagPanelPreview --node 39:10844 --demo demo-android
```

stdout 末行 = report.json 绝对路径(`.ui-verify/reports/<node>@<version>/report.json`);
exit 0=pass,1=fail/inconclusive。XML 靶同形(命名把手见 3.2):

```bash
uiv check --preview com.magpie.uiv.demo.LanguageSelectXmlPreview --node 39:10826 --demo demo-android
```

刻意留空的背景区可以用 ignore-region 从 N 中剔除(持久化到 `.ui-verify`,dp 坐标
x,y,w,h;39:10844 的中部空区实例):

```bash
uiv check --preview com.magpie.uiv.demo.HashtagPanelPreview --node 39:10844 --demo demo-android --ignore-region 0,216,360,211
```

pass 后录 golden(pass=false 拒录,exit 3):

```bash
uiv check --preview com.magpie.uiv.demo.HashtagPanelPreview --node 39:10844 --demo demo-android --record
```

### 5.2 report.json 阅读法

先看四个顶层字段:`pass` / `reason`(null 或 `inconclusive`)/ `subReason` / `score`。
然后按序读 `structural`:

1. `matched` / `untaggedCoverage` / `matchRate` —— 配对健康度;
2. `violations[]` —— 每条含 `property`(position/size/fontSize/color/padding*/
   itemSpacing/missing/childClipped/...)、`expected`、`actual`、`severity`、
   `hint`(确定性修正建议,直接指到 Modifier 级)、`source`(verify-page 层富化的
   `路径:行号`,check 单跑时可能为 null);
3. `untagged[]` —— 补 tag 清单(4.5);
4. `missing[]` —— N 中配不上对的叶子,**每条计一 high 违规**(漏渲染或 tag 没导出);
5. `diagnostics.pixel[]` —— informational 跳过记录,速查表见 5.3;
6. `matchFailure` —— 熔断时才非 null,两侧叶子清单帮你肉眼对账。

容差口径(`packages/uiv-core/src/l2/constants.ts`,唯一出处):position L1 距离
≤2dp、size 各轴 ≤2dp、fontSize ≤0.5sp(读**声明值**,不受 fontScale 影响)、
color CIEDE2000 ΔE<3(以上均 high);cornerRadius/padding/itemSpacing 0.5dp
精确网格(medium);invariant 套件:可点击触控区 ≥48x48dp、裁剪容差 0.5dp、
兄弟交叠宽高均 >1dp 才判(均 high)。

### 5.3 诊断 codes 速查表(哪些是设计使然,哪些要处理)

| code(+reason) | 含义 | 要处理吗 |
|---|---|---|
| `l2_derived_geometry_skipped` + `primary_axis_space_between` | SPACE_BETWEEN 容器的 authored gap 语义是"剩余空间等分",一律跳 itemSpacing(padding 照常断言) | **正常设计**,不处理 |
| 同上 + `direct_child_correspondence_unproven` | 双射门没过:直接子没挂满 tag / 层级不一致 | 想吃 padding 断言就按 4.3 补;可接受 skip 则不处理 |
| 同上 + `design_derivation_mismatch` | 设计侧自己都重建不出 authored 值(CENTER/MAX 等) | **正常**,实现侧无解 |
| 同上 + `layout_mode_missing` | 旧 spec 缺 layoutMode 字段 | 重新 pin 刷新 spec |
| 同上 + `unsupported_layout` | GRID 等非 flow 拓扑 | 正常跳过 |
| `l2_color_skipped_translucent_paint` | 首 fill 半透明(alpha<1),显示色未合成背景,跳 ΔE | **正常**(见 7.4) |
| `pixel_sample_skipped_container` | 非文本节点有子节点,像素采样会被子污染 | 正常 |
| `pixel_sample_skipped_nonsolid` | 首 fill 渐变/图片非纯色 | 正常 |
| `pixel_sample_empty_region` | 采样区越界为空 | 值得看一眼:通常意味着位置/尺寸已大偏 |

这些诊断**不进 violations、不计 executed、不影响 score/pass**——它们存在的意义是
让"我明明写了 padding 为什么没被断言"这类疑问可以在报告里自答,而不是静默。

### 5.4 陈旧产物门

gradle up-to-date/build cache 可能让测试没真跑,semantics.json 是上一轮的——
mtime 新鲜度门会把它判成 `semantics_export_failed`(inconclusive)。遇到与代码
改动对不上的 inconclusive,先强制真实重跑:

```bash
UIV_RERUN=1 uiv check --preview com.magpie.uiv.demo.HashtagPanelPreview --node 39:10844 --demo demo-android
```

(`UIV_RERUN=1` 给 gradle 追加 `--rerun`;verify-page 逐格恒带 `--rerun`,无此坑。)

## 6. verify-page 矩阵与 JUnit 出口

组件级 check 全绿后,用整页矩阵测试(3.2 第三种骨架)收口:

```bash
uiv verify-page --test com.magpie.uiv.demo.UploadContentPageScreenshotTest --node 39:10822 --demo demo-android --session onboarding-1 --json
```

矩阵默认 `l-shape`(`packages/uiv-core/src/page/matrix.ts`):base 设备 × 全部状态
+ 5 设备(base / pixel5-dark / fontScale1.3 / smallPhone / tablet,恒 xhdpi)× typical
+ 三个高频翻车交叉点(fontScale1.3×longText、smallPhone×longText、pixel5-dark×error,
仅当相应状态在 states 里)。states 从 mapping entry 读,也可 `--states a,b` 覆盖;
`--matrix full|custom:device/state,...` 换矩阵。

页报告落 `.ui-verify/reports/<node>@<version>/page-report.json`(stdout 末行),
`perCell[]` 逐格 pass/subReason/topViolations(source 已富化为 `路径:行号`),
`classification` 把失败聚类为 environment_gap / implementation_gap / behavior_drift,
`retryNoteCandidate` 是给修复者的浓缩清单。exit = 全格 pass ? 0 : 1。

CI 消费转 JUnit XML(纯转换,exit 恒 0;门禁职责在 verify-page):

```bash
uiv report --junit --in .ui-verify/reports/39-10822@2342874355766877359/page-report.json --out demo-android/app/build/uiv/junit.xml --suite upload-content
```

设计稿漂移哨兵(只告警不阻断,适合定时任务):

```bash
uiv baseline pull --check-version --file hH7NUAlm9DsLRaGScQP0Z1
```

## 7. 已知坑与校准知识(每条都真实踩过)

### 7.1 CJK fallback 行距压过 LineHeightSpan → 假 textOverflow

全角标点(如"::")会把整段拉进 CJK fallback 字体;Robolectric/API36 下 fallback
的行距**压过 LineHeightSpan**(Fixed/Minimum/Trim 全失效,实测行高恒 19dp),
2 行 ×19=38dp > 34dp 设计盒必触 textOverflow(NATIVE hard-gate,high)。
对策(`UploadContent.kt` 的 `FigText(unboundedHeightMeasure = true)`):节点对外
仍报告设计尺寸(position/size 断言保真),文本内部以**无界高度**测量,墨迹完整
下画不裁——前提是设计里该文本下方本就是留白无遮挡。**不要改字符串**(半角冒号
替换全角是篡改基准)。

### 7.2 Robolectric 字体宽差 → fontScale 补偿技法

Robolectric(Roboto/Noto 回退)与设计字体的字宽差可让长行多折一行,触发假
textOverflow。对策(`HashtagPanel.kt` 的 `BODY_FONT_COMPENSATION = 0.99f`):
局部 `CompositionLocalProvider(LocalDensity provides Density(density, fontScale * 0.99f))`
把**物理**字号压回去;声明 fontSize 保持 14.sp——L2 fontSize 断言读 TextStyle
声明值,不受 fontScale 影响,零违规代价。注意别过度补偿:实测 0.925 时字形明显
偏小、折行断点前移,L1 diffRatio 反而变差。0.99 起步微调。

### 7.3 Compose Image(contentDescription=null)产 untagged 语义节点

本版本 Compose 的 `Image` 即使 cd=null 也会产语义节点(实测)。它作为语义兄弟
会触 siblingOverlap(与同框元素交叠),或成为破坏双射的多余直接子。对策:装饰图
改容器 `Modifier.drawWithContent { drawContent(); ...画在最后... }` 纯绘制零语义
(`UploadContent.kt` FileStatusBar 的白 X);或把 Image 包进挂了 tag 的 Box,
让 Box 承担身份(HashIcon 的挂法)。

### 7.4 半透明 paint 自动跳 ΔE:#FFFFFF@90% 文本是常态

Figma 里大量文本 fill 是 `#FFFFFF` + opacity 0.9(实现侧 `0xE6FFFFFF`)。首 fill
alpha<1 时引擎不做背景合成,**自动跳过 ΔE 断言**并记
`l2_color_skipped_translucent_paint`——这是裁定过的口径(几何/排版断言照常),
看到一排这种诊断不用管,也不要为了"吃到颜色断言"把透明度改成 1。

### 7.5 SPACE_BETWEEN 容器的 itemSpacing 必跳

显式 `primaryAxisAlignItems=SPACE_BETWEEN` 的容器,authored gap 是"剩余空间等分",
数值偶合也不构成可断言性,一律跳 itemSpacing(padding 照常)。诊断
`primary_axis_space_between` = 正常。实现侧照 spec 子节点坐标绝对摆放即可,
不必复刻 SpaceBetween 布局语义(39:10826 双轨实现都用绝对定位)。

### 7.6 陈旧产物 → 见 5.4(inconclusive 先 UIV_RERUN=1)

### 7.7 业务代码 View.setTag 冲突(XML 侧)

`fig:` tag 占用 View 的**默认 tag 槽**(`ViewDumpRule` 读 `view.tag as? String`),
它是保留槽。业务代码再 `setTag(obj)` 会覆盖 fig 身份:对象 tag 转型失败归 null,
**无害不崩,但该节点变 untagged**(掉 coverage/双射)。业务侧建议改用 keyed tag
`setTag(R.id.xxx, value)`,与 fig 槽互不干扰;同一 dump 内字符串 tag 重复会
fail-fast 抛异常(设计使然,不覆盖)。

## 8. FAQ

**Q1:inconclusive 和 fail 有什么区别?**
两者 exit 都是 1,但语义不同:fail = 证据充分,实现真的偏了,照 violations 修 UI;
inconclusive(`reason=inconclusive` + subReason)= 证据不足**无法裁决**,要修的是
验证环境/契约本身——tag_coverage_low 补 tag(4.5),matching_rate_low 查两树结构,
semantics_export_failed 查 dump 链路(先 5.4),render_harness_error 查测试环境,
figma_spec_invalid 重 pin。把 inconclusive 当 fail 去改 UI 是最常见的方向性浪费。

**Q2:为什么我的 pass 报告里有一堆 skip 诊断?**
设计使然(5.3):引擎对"不可断言"的场景选择显式跳过 + 记录,而不是硬断言产生
假违规。skip 不扣分;要审计断言执行面,看 `executed` 与 diagnostics 的规则明细。

**Q3:XML 与 Compose 的能力差异?**

| 能力 | Compose(SemanticsDumpRule) | XML/View(ViewDumpRule) |
|---|---|---|
| touchBoundsInRoot | 导出 → touchTarget(48dp)门执行 | **显式 null**(TouchDelegate 无 per-child getter,诚实缺席)→ touchTarget 门跳过 |
| boundsInRoot(childClipped 依据) | 恒导出 | 仅 getGlobalVisibleRect=true 的可见节点导出;完全不可见节点整键省略 → 该节点 childClipped 跳过;屏边裁剪/滚动离屏/根不完全可见未标定不支持 |
| textOverflow 口径 | TextLayoutResult.hasVisualOverflow | 遍历所有 layout 行 getEllipsisCount + lineCount>maxLines 补充;非 TextView 为 null |
| colorHex / fontSizeSp | 声明 TextStyle(fontSize 为声明 sp 值) | TextView currentTextColor / textSize÷scaledDensity;非 TextView 为 null |
| cornerRadius | 恒 null(断言自动跳过) | 恒 null(同) |
| violation.source 行号 | verify-page 富化 `.kt:行号` | 本期 null(XML 行号归因后置) |

同一子树(39:10826)双轨交叉印证过:tagged 节点的执行集/测量值/verdict 全等,
唯一差异就是上表的来源专属字段(T4.4 D6)。

**Q4:minScore 到底管什么?**
只管 medium/low 违规的累积(条件③);任何一条 high/blocking 都在条件②直接
fail,和分数无关。所以"score 0.95 还 fail"不是 bug——去 violations 里找那条 high。

## 参考

- 主设计文档:`docs/ui-visual-self-verification.md`(分层判定口径的规范出处)
- 判定引擎:`packages/uiv-core/src/l2/{constants,assert,match,report,invariant}.ts`
- 项目状态:`docs/PROJECT_STATUS.md`(对外支持与交付口径)
- daemon 加速(慢车道热路径/快车道):`docs/daemon-setup.md`;CI 门禁:`docs/ci-gate.md`

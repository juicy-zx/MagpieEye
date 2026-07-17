---
name: uiv-design-to-layout
description: Use when 需要把 Figma 设计稿实现成 Android 布局(XML 或 Compose)并用 uiv check 做 L2 结构校验——包括写 android:tag/testTag、写 ScreenshotTest、配 .ui-verify、跑 uiv check、按 report.json 修复。症状:tag 全 missing、matchRate=0、render_harness_error、touchTarget/childClipped 违规、不知道 --preview 对应哪个测试类。也用于生产 XML 禁 android:tag 时的 tools:tag 净化路线。也用于列表/RecyclerView 屏的容器级校验(每行独立设计 id、重复 tag fail-fast)。
---

# uiv 设计稿 → 布局 → 校验闭环

## Overview

uiv check 的本质:**你的布局在 Robolectric 无头渲染出的结构语义(dump) vs Figma 冻结基线(spec.json)逐节点比对**。L2 结构是唯一硬门,L1 像素是 advisory。设计几何忠实转写 = 校验通过;所有对齐都靠**命名与 tag 双铁律**,错一处产物就找不到/join 为空。

先跑 `scripts/spec_to_layout_table.py <spec.json>` 得到逐节点转写表(绝对 bbox + 相对父偏移),照表写布局。

## 铁律一:tag 格式(join 硬约定,uiv-core join.ts)

- 每个要被校验的节点:XML `android:tag="fig:<figmaId>"` / Compose `Modifier.testTag("fig:<figmaId>")`
- **`fig:` 前缀必须有**,figmaId 原样保留(含 instance 路径如 `fig:I39:10823;6116:67511`)
- 根节点必须 tag(= `--node` 传的 id);不 tag 的节点被跳过(不算失败,也没被校验)
- tag 节点的**嵌套层级须与 spec 一致**(spec 里谁是谁的后代,dump 里也要是)

## 铁律二:命名对齐(一屏四处同名,shortName 派生自测试类名)

屏名叫 `Player` 时:

| 位置 | 必须是 |
|---|---|
| 测试类名 | `PlayerScreenshotTest` |
| dump 调用 | `dumpRule.dump(root, "Player")` |
| 渲染 PNG 路径 | `captureRoboImage("src/test/snapshots/Player.png")` |
| CLI | `uiv check --preview <pkg>.PlayerPreview --node <figmaId> ...` |

产物落 `<module>/build/uiv/Player.semantics.json`(由 ViewDumpRule/SemanticsDumpRule 写,**不要手写 File 输出**)。

## 铁律三:几何单位

- **dp = 设计单位原值,逐字转写,永不乘 density**(dump 携 density 字段,L2 自动归一)
- 尺寸 = spec bbox 的 w/h;位置 = 相对最近 tagged 祖先的偏移(`child.bbox − parent.bbox`,脚本已算好)
- 文本字号 = 设计 fontSize 直接作 sp;粗体按设计

## 写布局:XML(View 体系)

嵌套 FrameLayout + `layout_gravity="top|start"` + margin 绝对摆放(勿用 Linear/Constraint 让系统重排):

```xml
<FrameLayout android:tag="fig:39:10826"
    android:layout_width="328dp" android:layout_height="48dp"
    android:layout_gravity="top|start"
    android:layout_marginStart="16dp" android:layout_marginTop="352dp"
    android:clipChildren="false">
    <TextView android:tag="fig:39:10827"
        android:layout_width="63dp" android:layout_height="17dp"
        android:layout_gravity="top|start" android:layout_marginTop="15.5dp"
        android:includeFontPadding="false" android:maxLines="1"
        android:text="Language" android:textColor="#E6FFFFFF" android:textSize="14sp" />
    <View android:tag="fig:39:10828"
        android:layout_width="24dp" android:layout_height="24dp"
        android:layout_gravity="top|start"
        android:layout_marginStart="304dp" android:layout_marginTop="12dp"
        android:background="#4DFFFFFF" />
</FrameLayout>
```

- TextView 必带:`includeFontPadding="false"`、`maxLines`、精确 w/h
- 图标/图片:结构校验用纯 `View` + background 占位即可(L2 不看 drawable 内容);真实工程用真 drawable
- 容器加 `android:clipChildren="false"`(防误触 childClipped 门)
- 小数 dp 合法(`15.5dp`)

## 写布局:Compose

自定义 Layout 绝对 place(**不用 Modifier.offset**),tag 用 `Modifier.testTag`:

```kotlin
Box(Modifier.size(328.dp, 48.dp).testTag("fig:39:10826")) {
    // 定位照 demo UploadContent.kt:每个容器用自定义 Layout 按 rel 坐标 place 子项
}
```

参照实现:demo-android `UploadContent.kt`(39 tag 全咬合通过件)。

## 写 ScreenshotTest

模板:`templates/XmlScreenshotTest.kt`(View)/ `templates/ComposeScreenshotTest.kt`(Compose)。每屏只改三处:类名、布局引用、屏名字符串。要点:

- 注解三件套:`@RunWith(RobolectricTestRunner::class)` + `@GraphicsMode(GraphicsMode.Mode.NATIVE)`(真字体度量,必须)+ `@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")`
- **sdk 必须钉本机已缓存的 android-all**(缺缓存会触发下载;Robolectric `android-all-instrumented-16` 的 16 是 Android 版本号 = API 36,勿混淆)
- qualifiers 宽度 = 设计画板宽(360 设计 → `w360dp`)
- View 路径:measure/layout 用 `MeasureSpec.EXACTLY` @ displayMetrics 全屏,dump 传 `content.getChildAt(0)`
- dump 规则类来自已发布制品:View 用 `com.magpie.uiv.harness.view.ViewDumpRule`,Compose 用 `com.magpie.uiv.harness.semantics.SemanticsDumpRule`;普通字段 + 显式 `dump(...)` 调用
- 测试里**不写断言**——pass/fail 由 CLI 的 L2 引擎判

## 生产净化:tools:tag 路线(生产 XML 禁 android:tag 时)

**触发条件**:合规/审计要求测试专用信息不得进入产线安装包时用此路线;无此约束时,默认 `android:tag` 路线仍是更短路径,不强推此节。

**机制**(已验证,无需自证):`tools:` 命名空间由 AAPT2 打包时剥离,不进最终 APK;dump 读的是运行时 `View.getTag()`,与 XML 里写的是 `android:tag` 还是 `tools:tag` 无关——只要运行时把值挂回 `view.tag` 即可。此机制已在 39 节点真实屏(yanhao)完成 RED→GREEN 回归:无 helper 时 check 失败于 `subReason: tag_coverage_low`;接入 helper 后 `pass:true`,39/39 与 `android:tag` 基线逐字段一致——消费者无需再自证一遍。

**三步法**:

1. 布局根加 `xmlns:tools="http://schemas.android.com/tools"`;每个要校验的节点写 `tools:tag="fig:<figmaId>"`,**必须同时配 `android:id` 作锚**(tools:tag 本身无法定位运行时 View,靠 id 找):

```xml
<FrameLayout xmlns:android="..." xmlns:tools="http://schemas.android.com/tools"
    android:id="@+id/uiv_I39_10823_6116_67511"
    tools:tag="fig:I39:10823;6116:67511"
    ...>
```

   id 净化规则:figmaId 中非字母数字字符→下划线,如 `fig:I39:10823;6116:67511` → `@+id/uiv_I39_10823_6116_67511`。

2. 拷入 `templates/UivToolsTags.kt`(改 package 即可用,逻辑不用改)。

3. ScreenshotTest 里 dump 前一行调用:

```kotlin
UivToolsTags.apply(root, File("src/main/res/layout/<布局>.xml"))
dumpRule.dump(root, "<Name>")   // dump 前已执行,tools:tag 已回填到 view.tag
```

**v1 边界(fail-fast,无静默兜底)**:仅 main 源集单布局文件,不递归 `<include>`;四类锚定失败一律抛异常而非跳过——缺 `android:id` / id 未在资源里注册 / id 已注册但树中找不到对应 View / 同文件内 tag 值重复。

**明令禁止**:`src/test/res` 同名布局覆盖真实布局来做校验——两份 XML 手工同步必然漂移,被验证的不是被发布的,不是本路线的退路。

**对比 `android:tag` 路线**:免去逐节点手写 `findViewById+setTag` 样板(39 节点手工映射 → 一行 helper 调用);figmaId↔视图的映射仍留在布局 XML 的 `tools:tag` 属性里,单一事实源不变,review 布局即可看到节点归属,不会因改布局而与测试代码里的映射脱节。

## 列表屏(RecyclerView):容器 node + fixture 灌注

**触发条件**:整屏含 RecyclerView 等长列表,每行独立 Figma id,需要多行一次性配对,不是仅验证单行组件。

**切法**:验证 node 是列表容器本身(如 RecyclerView 对应的 Figma frame),不是整屏——固定标题栏、悬浮 MiniPlayer 等浮层在 node 外单独处理(整屏另切或跳过)。**生产可滚动 ≠ 测试不可验**:固定高度的 RecyclerView 在 Robolectric 里一次 measure/layout 即摊平全部行(无虚拟化丢项),与生产态是否可滚动无关,不能以"列表会滚动"为由放弃容器级验证、退回单行组件测试。可选:测试内加 `check(recyclerView.childCount == N)` 类哨兵,前提被破坏时更响亮地失败。

**页面生成**:一份 item 布局承载全部变体(可选徽标等同层元素全部写进布局,默认 `android:visibility="gone"`,靠 ConstraintLayout barrier 实现某元素 GONE 时其余元素自动重排)——不按变体拆分多份布局,一份布局=一份漂移面。id 按自然语义命名(tvRank/ivCover 等),**item XML 本身零 `fig:` tag**:同一布局跨多个 position 复用,写死的静态 tag 会在 dump 时因重复而 fail-fast;tag 改为运行时由 fixture 逐 position 回填。与布局同时落盘一份 rolemap.json(role→Figma 定位路径,示例见下),作为生成器输入,也让 review 时能看清每个 id 对应哪个 Figma 节点。

**验证链**:①`uiv pin` 冻结列表容器 node 的 spec.json;②`scripts/spec_to_list_fixture.py <spec.json> <rolemap.json> <out fixture.json>` 按 rolemap 逐 role 在每个 item 子树内做「该层子树内首个 (name,type) 匹配」深度优先搜索,产出每 position 一组 op(`{viewId, visible, tag?, text?, fontSizeSp?, box?}`);隐藏/缺席 role 只输出 `{viewId, visible:false}`;box/fontSizeSp 仅该行几何/字号偏离布局静态值才产出。**每接一屏必须做地面真值自检**:手抄 ≥3 个含变体的 position 期望值,脱离生成器代码独立核对 spec.json 原文,逐字段比对,不一致即判定 rolemap 或生成器有误(脚本 docstring 内有详细要求)。③测试内一行灌注:`templates/UivStubAdapter.kt`(itemLayoutRes + fixture)供 RecyclerView.adapter,零逐行手写 tag/文本映射;容器自身 tag 仍走 `templates/UivToolsTags.kt` 静态回填(见上节)。

**快照纪律**:fixture 的 text 就是 spec 叶子节点原始 `text.characters`,**包括设计师笔误**(如某行文本本应是别的值但设计稿写错了)——照抄不修正;要改就是先改设计稿、重新 pin,不在校验链路里悄悄纠偏。

**列表实战坑**:

1. **徽标类组件 siblingOverlap**:"背板矩形+文字"同层兄弟交叠忠实还原会触发 dump 的 siblingOverlap 硬不变量违规;解法=背板叶子并入容器(tag 打容器,前提背板 bbox 与容器 bbox 重合)。
2. **逐行字号变体**走 fixture 的 `fontSizeSp` op,与 box 同口径:仅偏离布局静态值才产出。
3. **非整字号**(如 8.7111sp):density 2.0 下 dump 字号按 0.5sp 步进,XML 直写 spec 原值(如 8.49sp)靠 ±0.5sp 容差消化,不要四舍五入成整数(容差边缘反而更危险)。
4. **派生断言现实上限**:item 级 padding/itemSpacing 在 ConstraintLayout 平铺子节点 vs Figma 包裹帧的结构差异下通常跳过(`direct_child_correspondence_unproven`,是 diagnostic 不是违规);容器级(RecyclerView vs 多个 item 根)在 item 根有 tag 时能正常执行——这正是给 item 根打 tag 的价值。

rolemap.json 一个 role 示例:

```json
{ "viewId": "ivHd", "path": [ { "name": "HD", "type": "INSTANCE", "visibilitySource": true },
    { "name": "Rectangle 1329134939", "type": "RECTANGLE" } ],
  "optional": true, "checkBox": true, "staticBox": { "x": 320, "y": 22, "w": 24, "h": 24 } }
```

fixture.json 一个 op 示例(逐行字号变体):

```json
{ "viewId": "tvRank", "visible": true, "tag": "fig:1:16179", "text": "999",
  "fontSizeSp": 12, "box": { "x": 16, "y": 26, "w": 24, "h": 16 } }
```

## 模块接线(一次性)

`templates/module-wiring.gradle`(Groovy)/ `-kts` 版。要点:uiv.screenshot 插件 + roborazzi 插件;testImplementation view-dump(XML 屏)/semantics-dump(Compose 屏)+ junit + robolectric + roborazzi;`includeAndroidResources = true`;**Kotlin 2.0.x/2.1.x 工程消费 roborazzi 1.63+(Kotlin 2.3 编)须加 `freeCompilerArgs += ['-Xskip-metadata-version-check']`**。

## 跑校验

工作目录(任意,产物落此)需 `.ui-verify/`:

```
.ui-verify/
  mapping.json                                  # [{"fileKey":"...","nodeId":"39:10822","version":"<ver>","minScore":0.9,"matrix":"l-shape"}]
  baselines/39-10822@<ver>/spec.json            # 冻结基线(uiv baseline pull 拉取,或复用已冻结件;目录名 nodeId 冒号→连字符)
```

```bash
UIV_RERUN=1 uiv check --preview <pkg>.<Name>Preview --node 39:10822 --demo <工程根> --module :app
# exit 0=pass, 1=fail, 2=用法/异常;report 落 .ui-verify/reports/<node>@<ver>/report.json
# UIV_RERUN=1 强制真重渲(防 gradle up-to-date 陈旧产物);--sandbox 为不可信代码 opt-in 隔离
```

## 修复循环(读 report.json,改,重跑,直到 exit 0)

| report 信号 | 病因 | 修法 |
|---|---|---|
| `structural.missing` 含某 id | 布局缺该 tag / 前缀写错 | 补 `android:tag="fig:<id>"`(查 `fig:` 前缀) |
| matchRate=0 / 全 missing | tag 全没对上 | 几乎必是忘了 `fig:` 前缀 |
| bounds/size 违规(带 expected/actual) | 几何转写错 | 对照脚本表改 margin/尺寸;actual 是 px,÷density 比对 dp |
| `hasVisualOverflow` 违规 | 文本框太小/字体度量差 | 核对 w/h 与 maxLines;确认 @GraphicsMode(NATIVE) 在 |
| touchTarget 违规 | clickable 元素 <48dp | 设计如此则去 clickable;否则扩触达区 |
| childClipped 违规 | 子越父界被裁 | 容器 `clipChildren="false"` 或修 bounds |
| `compileError` 非空 | 代码写坏 | 按编译摘要修 Kotlin/XML |
| `subReason: render_harness_error` | 渲染没跑出产物 | 直接跑 `gradle :app:test<Variant>UnitTest --tests <类FQN>` 看真实栈;常见=PNG 没产(roborazzi 没接)或 android-all 缺缓存 |
| `subReason: stale_artifact` | gradle up-to-date 回填旧渲染 | 加 `UIV_RERUN=1` |
| `subReason: module_dir_missing` | --module 路径不存在 | 核对模块名 |

**修复原则**:先怀疑 tag 格式与单位假设,再怀疑具体数值;L1 pixel(diffRatio)是 advisory,**不要为它改已过 L2 的几何**。

## Common Mistakes(基线实测踩过)

- ❌ `android:tag="7:100"`(缺 `fig:`)→ join 全空
- ❌ 自造 dump 路径/API(`build/uiv/dumps/xx.json`、手写 File)→ 用 DumpRule + 命名铁律
- ❌ 自造 CLI(`--spec/--dump/--level`)→ 真契约是 `--preview/--node/--demo/--module` + `.ui-verify`
- ❌ `@Config(sdk=[33])` 随手写 → 触发 android-all 下载;钉已缓存版本(本机=36)
- ❌ 漏 `@GraphicsMode(NATIVE)` → 文本度量不可信
- ❌ 不产 PNG(没接 roborazzi)→ check 报 render_harness_error 不进 L2
- ❌ 用 SwitchCompat 等自带 clickable 的控件承载 <48dp 小图标 → touchTarget 门违规

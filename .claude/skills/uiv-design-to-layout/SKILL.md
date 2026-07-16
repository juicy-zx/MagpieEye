---
name: uiv-design-to-layout
description: Use when 需要把 Figma 设计稿实现成 Android 布局(XML 或 Compose)并用 uiv check 做 L2 结构校验——包括写 android:tag/testTag、写 ScreenshotTest、配 .ui-verify、跑 uiv check、按 report.json 修复。症状:tag 全 missing、matchRate=0、render_harness_error、touchTarget/childClipped 违规、不知道 --preview 对应哪个测试类。
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

# uiv-design-to-layout 测试档案(RED-GREEN,2026-07-16)

技法/参考类 skill,按 writing-skills 规程做应用场景测试(subagent 无/有 skill 各跑一次同一任务)。

## 测试任务(两轮同一题)

给定 3 节点 spec 节选(root FRAME 360×56 + TEXT@(16,19.5,80,17) + INSTANCE ic_switch@(308,16,36,24)),
要求产出:XML 布局 + ScreenshotTest + 确切校验命令与失败修复思路。纯写作,不读仓库。

## RED(无 skill,sonnet 基线)——7 处失败

1. tag 裸写 `android:tag="7:100"`,缺 `fig:` 前缀 → join 全空
2. 命名铁律全违:自造 dump 路径 `build/uiv/dumps/settings_row.json` + 手写 File 落盘
3. 自造 API `ViewDump.captureTree`(制品真实 API 是 ViewDumpRule)
4. 自造 CLI `uiv check --spec --dump --level L2`(真实为 --preview/--node/--demo/--module + .ui-verify 契约)
5. `@Config(sdk=[33])` 随手写(会触发 android-all 下载);漏 `@GraphicsMode(NATIVE)`
6. 不产 PNG(无 roborazzi)→ check 必 render_harness_error
7. 用 SwitchCompat 承载 36×24 图标(自带 clickable)→ touchTarget<48dp 门违规,agent 无意识

(基线也有做对的:FrameLayout+margin 绝对摆放、精确 dp、includeFontPadding=false、EXACTLY measure——skill 保留不重复教。)

## GREEN(带 skill,同 sonnet 同题)——7 处全治

fig: 前缀 ✓;SettingsRow 四处同名 ✓;真实 CLI+mapping.json+baselines/7-100@ver ✓;
sdk=36+NATIVE ✓;captureRoboImage+roborazzi 接线提醒 ✓;**主动拒绝 SwitchCompat 换纯 View 并说明 touchTarget 理由** ✓;
ViewDumpRule ✓。另正确套用修复表到本屏具体节点。无新 rationalization,REFACTOR 无需追加。

## 脚本地面真值测试

`scripts/spec_to_layout_table.py` 对真实 yanhao 冻结 spec(39:10822,122 节点)输出的 rel 偏移
与已通过 uiv check(pass:true,matched 39/39)的手写布局 margin 逐点一致:
39:10828 rel=(304,12) of 39:10826;39:10827 rel=(0,15.5);39:10836 rel=(10,4) of 39:10835。

# 待 Codex 决断队列

> Codex 通道(MCP + CLI)于 2026-07-08 ~15:40 触达 usage limit,预计 21:19 恢复。
> 恢复后按序发送以下决断请求(用 codex-reply, threadId 019f4082-3d47-77e3-a6d0-b060aa41f41a;若 MCP 仍不可用则 codex exec resume)。
> 在决断到达前:T1.0a 保持 awaiting_review 不置 done;T1.1 照常推进(不依赖以下任何决断)。

## D-2026-07-08-01: T1.0a 断言① 通道证伪的口径决断

【三断言结果】
① scale=2 像素对应:原定通道证伪——get_screenshot(maxDimension=720) 返回 360×200(1x);maxDimension 语义"只封顶不放大"。备选通道实测成立:use_figma 内 `node.exportAsync({format:'PNG', constraint:{type:'SCALE', value:2}})` → 720×400 PNG(11KB,base64 14.7k 字符经工具结果传回,落盘后 PNG 签名/sips/check-scale 三重校验通过,delta=[0,0])。
② 1 Figma 单位=1dp(Figma 侧):成立(CalibCard 360×200、CalibSwatch 80×40,±0.5 命中)。
③ get_metadata 坐标系:relative-to-parent(swatch 报 x=12 非 112;双分支自测正确)→ 该通道无须 re-base;REST 仍恒须 re-base,适配层统一为"相对目标 Frame"。
附:odiff 720×1600 median 2228ms(含 npx 开销);红/绿自测全部按预期;B2 已验证(Full seat)。

【请决断】
A. 断言① 落档口径:提议"get_screenshot 无 2x 能力(证伪);scale=2 经 exportAsync 通道成立";run-all.sh 的 check-scale 以 exportAsync 产物 card-2x.png 为对象。
B. T1.2 baseline.png 来源约定变更:从"get_screenshot(2x)"改为"use_figma exportAsync(SCALE 2) → base64 → 落盘"。边界:整页(720×1600)base64 估 100~300KB 可能超限——提议 M3 verify-page 整页基准优先走 REST /v1/images?scale=2(PAT 后),exportAsync 分块兜底,边界入 pending_followups。
C. T1.0a 按"三断言全部闭合(①经修正通道)"置 done 并单 commit 收口,是否同意?

(执行中口径决断;若计轮次,当前 M1 子计划节点 3/10。)

## D-2026-07-08-02: T1.2 core 两个自决口径复核(轻量)

T1.2 core 已完成(44/44 单测),两个子计划未指明处执行 agent 自决,请复核:
1. `uiv check` 的 version 来源:从 mapping.json 按 nodeId 查(baseline pull 的 upsert 产物,与设计文档"mapping.json 是 source of truth"一致);未 pull 先 check 报 "run baseline pull first" exit 2。
2. diff.png 落位 `renders/<nodeDir>/diff.png`(运行产物,.gitignore 的 renders/ 已覆盖)。
附:实现中修复两个库级坑——odiff-bin 空 ignoreRegions 序列化成非法 --ignore=(仅非空传参);looks-same 相同图返回 null 占位簇(equal 时清空)。

---
## 决断结果(2026-07-08 21:2x 通道恢复后)
- D-01 A/B/C:全部同意。C 附加:calibration 并记 get_screenshot_scale2=refuted / exportAsync_scale2=confirmed(已落 meta.json)。
- D-02:两项同意。附加:T1.3/T1.4 报告体系目录语义收敛——rendered.png 归 renders/,report.json/diff/overlay 归 reports/(已转发 T1.3 agent);M3 同 nodeId 多 scope 时再升级消歧。
- T1.1 两处非版本类修正无异议;NATIVE hard-gate 同意,约束已写死进 meta.json.text_metrics.hard_gate_constraints。
队列清空。

## D-03 决断结果(2026-07-08 21:5x)
A/B/C 全同意:A 优先自定义 Layout(禁 offset 替代品绕行);B 契约条款加边界措辞(offset 仅限非验收关键微调);C T1.3 awaiting_review,修复后 pass:true 为收尾验收门。已固化 orchestration.md 第 5 节。

## D-04 决断结果(2026-07-08 ~22:5x)
(b) D3 改 CalibSubtitle #CCE0FF→#99B3E6(color@fig:1:102),Contract 不动;(c) M2 立项 T2.7 像素采样颜色断言,完成后 D3 回归 CalibSwatch;(a) 自声明语义属性否决入反模式;--verify-detection 独立设计确认,固化"循环前必过"规则。已落 orchestration.md 第 5 节与 meta.json。

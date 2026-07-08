# Phase 0 端到端验收报告(T1.4)

> 骨架占位文档。本文件的正式版本由 `node scripts/phase0-acceptance.mjs --finalize` 在
> 真实修正循环(pass=true 且轮次 ≤5)结束后自动生成并覆盖本文件(见 `scripts/phase0-lib.mjs`
> 的 `renderAcceptanceDoc()`)。当前占位内容仅描述验收协议与预置偏差,不代表任何一次真实验收结果。

## 验收协议

- 北极星:模型仅凭 `report.json`(剥离 `artifacts` 图片字段后)在 ≤5 轮内把故意写偏的
  `CalibCard` composable 修到 L2 全过(`pass:true`)。
- 角色分工:harness(`scripts/phase0-acceptance.mjs`)负责写偏注入、跑 `uiv check`、剥离
  artifacts、判停、计时;主会话在每轮 `--step` 之后 spawn 一个不跑任何命令、不读任何图片的
  通用修正者 subagent,仅依据剥离后的 report.json 编辑唯一允许的文件。
- 停止条件(`decide()`,优先级从高到低):`pass===true` → 成功;`regression===true` → 失败;
  第 5 轮仍未 pass → 失败(max_rounds);否则继续。
- 检出能力前置门(`--verify-detection`,独立于上述 5 轮预算):`--inject` 之后必须先证明
  第 1 次 `uiv check` 的 report 同时命中全部 4 项 seeded deviations,否则判"检出能力不足",
  验收作废、不进入修正循环。

## 预置偏差清单(D1~D4)

- D1 CalibTitle 位置:CHILD_POSITIONS 表 title 项 (16,16)dp(应为 (12,12))→ position 断言(±2dp)
- D2 CalibTitle 字号:14sp(应为 16sp)→ fontSize 断言(±0.5sp)
- D3 CalibSubtitle 文本颜色:#99B3E6(应为 #CCE0FF)→ color 断言(ΔE00<3)
- D4 CalibBadge 不渲染 → missing 断言(structural.missing 含 figmaId=1:104)

## 单步模式(供主会话逐轮驱动)

```
node scripts/phase0-acceptance.mjs --inject             # 写偏注入 + 重置轮次状态
node scripts/phase0-acceptance.mjs --verify-detection    # 检出能力门(不消耗轮次预算)
node scripts/phase0-acceptance.mjs --step                # 跑一轮,stdout 末行 JSON 含 next 字段
# ...主会话依 next 字段派修正者 agent、再次 --step,直至 next==="finalize" 或 "blocked"...
node scripts/phase0-acceptance.mjs --finalize            # 生成本文档 + 落 meta.latency_baseline
```

真实逐轮数据表格(由 `--finalize` 覆盖本节):

| 轮次 | violations | missing | score | pass | check 耗时(s) |
|---|---|---|---|---|---|
| _(尚未运行真实验收循环)_ | | | | | |

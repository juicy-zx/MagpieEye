# Phase 0 端到端验收报告(T1.4)

- 结论:**通过**(2 轮,上限 5 轮)
- 总耗时:134s
- 修正者输入:仅剥离 artifacts 字段后的 report.json,无任何图片路径

## 预置偏差清单

- D1 CalibTitle 位置:CHILD_POSITIONS 表 title 项 (16,16)dp(应为 (12,12))→ position 断言(±2dp)
- D2 CalibTitle 字号:14sp(应为 16sp)→ fontSize 断言(±0.5sp)
- D3 CalibSubtitle 文本颜色:#99B3E6(应为 #CCE0FF)→ color 断言(ΔE00<3)
- D4 CalibBadge 不渲染 → missing 断言(structural.missing 含 figmaId=1:104)

## 逐轮数据

| 轮次 | violations | missing | score | pass | check 耗时(s) |
|---|---|---|---|---|---|
| 1 | 3 | 1 | 0.7999999999999999 | false | 0.5 |
| 2 | 0 | 0 | 1 | true | 6.0 |

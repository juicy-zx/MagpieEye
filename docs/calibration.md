# T1.0a Figma 侧口径标定结论

- 通道: **channel=mcp-only**(Figma MCP;REST 交叉标定待 B1 PAT,已在 pending_followups)
- 本文所有容差常量在 PAT 交叉对比完成前 **视为暂定**。
- 标定文件: uiv-calibration, fileKey `a3EzhvJtAuEzTpM0bxzYjT`, CalibCard nodeId `1:2`(设计值见子计划 Canonical Calibration Contract 节点表;运行期 nodeId 1:2~1:6 不进 fixture)
- 技能加载记录: figma-create-new-file / figma-use 的 MCP resource 均不可用(server 不支持 resources),按预案裸调,建稿返回几何与合同逐项一致。

## B2 可用性

whoami/create_new_file/get_metadata 实调结果: **通过**。Full seat(xi zhu's team, starter tier),create_new_file 成功(fileKey 见上),get_metadata 返回页面列表(0:1)。B2 由"待验证"转"已验证"。

## 断言① scale=2 像素对应

- **原定通道 get_screenshot(maxDimension=720):证伪**——返回 360×200(=original,1x)。maxDimension 语义为"只封顶不放大",无 2x 渲染能力。check-scale 实测 actualPx=[360,200],pass=false(docs/calibration-assets/card-mcp.png 留档)。
- **备选通道 use_figma 内 Plugin API `exportAsync({format:'PNG', constraint:{type:'SCALE', value:2}})`:成立**——返回 720×400 PNG(11030 字节,base64 经工具结果传回落盘,PNG 签名/sips/check-scale 三重校验通过)。check-scale 实测 actualPx=[720,400],delta=[0,0] ≤ 2px,pass=true(docs/calibration-assets/card-2x.png)。
- 落档口径:**scale=2 像素对应成立(经 exportAsync 通道);get_screenshot 无 2x 能力**。⚠ 该口径变更(T1.2 baseline 来源约定)待 Codex 决断确认(见 pending-codex-decisions.md #A/#B,Codex 通道 usage-limit 恢复后补审)。

## 断言② 1 Figma 单位 = 1dp(Figma 侧)

check-figma-units.mjs: CalibCard 360×200、CalibSwatch 80×40(±0.5 精确命中)→ **成立**。
结合断言①(px = 单位×2)⇒ Figma 单位=dp 名义值、scale=2 ↔ density 2.0(xhdpi)。
渲染侧另一半由 T1.1 内嵌的 T1.0b(同款卡片 Robolectric 渲染对比)闭合。

## 断言③ get_metadata 坐标系

check-coords.mjs verdict: **relative-to-parent**(frame@(100,100),swatch 报告 x=12/y=60;双分支 fixture 自测均正确识别)
⇒ figma-spec-cache 适配层对 get_metadata 通道 **无须** 做减父原点 re-base;
REST absoluteBoundingBox 恒为绝对坐标、恒须 re-base(设计文档 C5),两通道口径在适配层统一为"相对目标 Frame"。

## odiff 2x 整页耗时(720×1600, 本地合成, 零 Figma 依赖)

runs=[2228,2404,2069]ms, median=**2228ms**(含 npx 转发开销,预热后;odiff exit 22 正确检出 100×100 差异块)。T1.2 集成时改用解析后的二进制直调,预期显著低于此值。

## 遗留

- REST(`/v1/files/:key/nodes` absoluteBoundingBox / `/v1/images scale=2`)交叉标定: 待 PAT(pending_followups)。
- **exportAsync base64 大小边界**:卡片级(720×400)14.7k 字符无压力;整页(720×1600)估 100~300KB base64,可能超 use_figma 返回限制——M3 verify-page 整页基准优先走 REST `/v1/images?scale=2`(PAT 后),exportAsync 分块仅兜底(pending_followups)。
- get_screenshot 降为快速预览用途,不再承担基准 PNG 职责(待 Codex 确认)。

## T1.0b 渲染侧标定(T1.1)

- 渲染环境:Robolectric 4.16 `@Config(qualifiers="w360dp-h800dp-xhdpi")`(density 2.0)+ `@GraphicsMode(NATIVE)`
- CalibCard(360x200dp)node capture 实际像素 720x400,与期望值及 T1.0a Figma 2x 标定值均在 |Δ|<=2px 内(scripts/check-t10b.mjs exit 0;scripts/calibration/check-scale.mjs 360 200 2 → deltaPx=[0,0] pass)
- 结论:渲染侧 density 2.0 与 Figma 侧 scale=2 对齐,"1 Figma 单位 = 1dp" 在渲染链路成立

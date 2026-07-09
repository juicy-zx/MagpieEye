# T1.0a Figma 侧口径标定结论

- 通道: **channel=mcp+rest**(Figma MCP 标定 + REST 交叉标定已完成,2026-07-09;B1 PAT 到位后经共享文件闭环)
- 容差常量经 REST 交叉标定 **已转正(不再暂定)**——见下"REST 交叉标定"节。
- 标定文件: uiv-calibration, fileKey `a3EzhvJtAuEzTpM0bxzYjT`, CalibCard nodeId `1:2`(设计值见子计划 Canonical Calibration Contract 节点表;运行期 nodeId 1:2~1:6 不进 fixture)
- 技能加载记录: figma-create-new-file / figma-use 的 MCP resource 均不可用(server 不支持 resources),按预案裸调,建稿返回几何与合同逐项一致。

## B2 可用性

whoami/create_new_file/get_metadata 实调结果: **通过**。Full seat(xi zhu's team, starter tier),create_new_file 成功(fileKey 见上),get_metadata 返回页面列表(0:1)。B2 由"待验证"转"已验证"。

## 断言① scale=2 像素对应

- **原定通道 get_screenshot(maxDimension=720):证伪**——返回 360×200(=original,1x)。maxDimension 语义为"只封顶不放大",无 2x 渲染能力。check-scale 实测 actualPx=[360,200],pass=false(docs/calibration-assets/card-mcp.png 留档)。
- **备选通道 use_figma 内 Plugin API `exportAsync({format:'PNG', constraint:{type:'SCALE', value:2}})`:成立**——返回 720×400 PNG(11030 字节,base64 经工具结果传回落盘,PNG 签名/sips/check-scale 三重校验通过)。check-scale 实测 actualPx=[720,400],delta=[0,0] ≤ 2px,pass=true(docs/calibration-assets/card-2x.png)。
- 落档口径:**scale=2 像素对应成立(经 exportAsync 通道);get_screenshot 无 2x 能力**。⚠ 该口径变更(T1.2 baseline 来源约定)已经 Codex D-01 裁定确认(2026-07-08)(见 pending-codex-decisions.md #A/#B,Codex 通道 usage-limit 恢复后补审)。

## 断言② 1 Figma 单位 = 1dp(Figma 侧)

check-figma-units.mjs: CalibCard 360×200、CalibSwatch 80×40(±0.5 精确命中)→ **成立**。
结合断言①(px = 单位×2)⇒ Figma 单位=dp 名义值、scale=2 ↔ density 2.0(xhdpi)。
渲染侧另一半由 T1.1 内嵌的 T1.0b(同款卡片 Robolectric 渲染对比)闭合。

## 断言③ get_metadata 坐标系

check-coords.mjs verdict: **relative-to-parent**(frame@(100,100),swatch 报告 x=12/y=60;双分支 fixture 自测均正确识别)
⇒ figma-spec-cache 适配层对 get_metadata 通道 **无须** 做减父原点 re-base;
REST absoluteBoundingBox 恒为绝对坐标、恒须 re-base(设计文档 C5),两通道口径在适配层统一为"相对目标 Frame"。

## REST 交叉标定(2026-07-09,B1 PAT 到位,Codex 口径 C)

- **触发与解锁**:FIGMA_PAT 到位。过程发现 PAT 账户 ≠ 标定文件归属账户(uiv-calibration 建于 zhuxi8518@gmail.com,PAT 来自另一账户 → REST 404 Not found)。经 zhuxi8518 将文件共享给 PAT 账户解锁;`/v1/files/{key}/meta` 与 `/nodes?ids=1:2` 均 200,`file_content:read`+`file_metadata:read` 生效。
- **真实 REST 结构**:page `0:1` 顶层仅 frame `1:2` CalibCard(children `1:3~1:6`);真实 fileKey `a3EzhvJtAuEzTpM0bxzYjT`,version `2373767505772482544`。
- **交叉标定判定:PASS** —— 真实 REST 响应经产品 `normalizeNodesResponse` 归一化后,与 canonical 手工 fixture(`rest-nodes-card.json`,1:100 体系)抹除 id/fileKey/version 标签后 root 树逐字段全等(bbox 相对坐标 / cornerRadii / fills{hex,opacity} / text{fontSize 16/12} / padding)。CalibSwatch re-base 相对坐标 `(12,60)` == 断言③ MCP 侧记录值,C5 re-base 口径实证一致。
- **节点映射(真实↔canonical;口径 C 保留稳定别名,不迁 nodeId 体系)**:

  | 名称 | 真实 nodeId | canonical nodeId |
  |---|---|---|
  | CalibCard | 1:2 | 1:100 |
  | CalibTitle | 1:3 | 1:101 |
  | CalibSubtitle | 1:4 | 1:102 |
  | CalibSwatch | 1:5 | 1:103 |
  | CalibBadge | 1:6 | 1:104 |

- **常驻回归**:`packages/uiv-core/src/figma/cross-calib.test.ts`(4 项,篡改几何必 FAIL 经对抗验证);真实 fixture 留存 `packages/uiv-core/fixtures/rest-nodes-card.real.json`(字节级原样)。
- **REST `/v1/images?scale=2` 通道**:拉 `1:2` 的 2x PNG,images API HTTP 200 + PNG 下载 200,PNG IHDR 与 sips 双验尺寸 **720×400** ✓(独立最小闭环,不替换现有 baseline)。
- **Codex 口径 C 裁定**:`1:100` 保留为标定合同稳定内部别名,不迁 nodeId 体系(A/B 账目对齐收益 < 工程扰动);`rest-nodes-componentset.json` 保持合成 fixture(真实文件无 COMPONENT_SET,CS6 验的是 variant 枚举与 re-base,不依赖真实组件集)。

## odiff 2x 整页耗时(720×1600, 本地合成, 零 Figma 依赖)

runs=[2228,2404,2069]ms, median=**2228ms**(含 npx 转发开销,预热后;odiff exit 22 正确检出 100×100 差异块)。T1.2 集成时改用解析后的二进制直调,预期显著低于此值。

## 遗留

- ~~REST 交叉标定: 待 PAT~~ **已完成(2026-07-09)**——见"REST 交叉标定"节;`/v1/files/:key/nodes` absoluteBoundingBox re-base 与 `/v1/images scale=2` 720×400 均实证通过。
- **exportAsync base64 大小边界**:卡片级(720×400)14.7k 字符无压力;整页(720×1600)估 100~300KB base64,可能超 use_figma 返回限制——M3 verify-page 整页基准优先走 REST `/v1/images?scale=2`(现 PAT 已到位、通道已验证 720×400),exportAsync 分块仅兜底。
- get_screenshot 降为快速预览用途,不再承担基准 PNG 职责(已经 Codex D-01 裁定确认(2026-07-08))。

## T1.0b 渲染侧标定(T1.1)

- 渲染环境:Robolectric 4.16 `@Config(qualifiers="w360dp-h800dp-xhdpi")`(density 2.0)+ `@GraphicsMode(NATIVE)`
- CalibCard(360x200dp)node capture 实际像素 720x400,与期望值及 T1.0a Figma 2x 标定值均在 |Δ|<=2px 内(scripts/check-t10b.mjs exit 0;scripts/calibration/check-scale.mjs 360 200 2 → deltaPx=[0,0] pass)
- 结论:渲染侧 density 2.0 与 Figma 侧 scale=2 对齐,"1 Figma 单位 = 1dp" 在渲染链路成立

## NATIVE 文本度量钉版本(T1.1,CS1/CS2)

- Robolectric 4.16 `@GraphicsMode(NATIVE)` sdk=36:Compose `hasVisualOverflow==true`(超长串+maxLines=1)、真 TextView measure+layout 后 `getEllipsisCount>0`(实测 488) —— 均实测通过
- LEGACY 对照:探针值见 meta.json.text_metrics.legacy(hasVisualOverflow=false 假阴 / ellipsisCount=0,伪造测量,不可用)
- 结论:文本溢出/截断两项 L2-invariant 可进硬门禁(text_overflow_invariant=hard-gate),约束条件:NATIVE + sdk>=26 钉死

## NATIVE hard-gate 约束条款(Codex 裁定,2026-07-08)

text_overflow_invariant=hard-gate 仅在以下钉死环境成立:Robolectric 4.16 + `@GraphicsMode(NATIVE)` + sdk/minSdk ≥ 26 + 当前测试字体环境。升级 Robolectric/AGP/SDK 或切换图形模式时**必须重跑 CS1/CS2 probe**(demo-android 的 NativeTextMetrics 测试),未重跑前该 invariant 降回 advisory。

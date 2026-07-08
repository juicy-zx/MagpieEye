# M1(Phase 0)代码级子计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。逐任务执行,每步验收通过才前进;证伪/验收失败按各任务"证伪处理"回 Codex。
> 上游:orchestration.md M1 表格(验收口径以编排计划为准,本文是其代码级展开)。
> 方向锚定:本里程碑唯一北极星 = T1.4 验收——模型仅凭 report.json ≤5 轮把故意写偏的卡片修到 L2 全过。
> 提交粒度:步骤级 commit 允许;每任务完成必须有带任务号的 commit(编排层口径已同步)。

---

## Canonical Calibration Contract(单一事实源,五章唯一基准)

所有章节的 Figma 标定 frame、Compose 组件、REST-shape fixture、验收偏差全部从本表派生;任何章节与本表冲突以本表为准。

**节点表**(fixture nodeId 是手工 fixture 的约定 id;T1.0a 真实创建的 frame 的 nodeId 运行期获得、仅用于标定断言,不进 fixture):

| 节点 name | 类型 | fixture nodeId | testTag | 相对父级位置 | 尺寸 | 样式 |
|-----------|------|---------------|---------|------------|------|------|
| CalibCard | FRAME(容器) | 1:100 | fig:1:100 | 画布 (100,100) | 360×200 | fill #3366CC,cornerRadius 8 |
| CalibTitle | TEXT(叶子) | 1:101 | fig:1:101 | (12,12) | 200×20 | "Calibration Card",fontSize 16(16sp),Inter Regular,fill #FFFFFF |
| CalibSubtitle | TEXT(叶子) | 1:102 | fig:1:102 | (12,36) | 200×16 | "Known geometry fixture",fontSize 12(12sp),Inter Regular,fill #CCE0FF |
| CalibSwatch | RECTANGLE(叶子) | 1:103 | fig:1:103 | (12,60) | 80×40 | fill #FF9900 |
| CalibBadge | RECTANGLE(叶子) | 1:104 | fig:1:104 | (296,12) | 52×20 | fill #FF3B30,cornerRadius 10 |

- 可比对叶子集 N = {CalibTitle, CalibSubtitle, CalibSwatch, CalibBadge},|N|=4;CalibCard 是容器,挂 tag 用于 re-base 与整体尺寸断言,但 untaggedCoverage/matchRate 的分子分母都只统计 N 中的叶子。
- testTag 格式铁律:fig:<nodeId>(nodeId 为上表 fixture nodeId)。可读别名不得替代 join 主键。
- 圆角:L2 v0 的 semantics exporter 不导出 cornerRadius(cornerRadiusPx=null,断言自动跳过),Phase 0 不启用圆角断言,不得把圆角用作验收偏差。
- 色值换算(Figma Plugin API r/g/b 为 0~1):#3366CC={r:0.2,g:0.4,b:0.8};#FF9900={r:1,g:0.6,b:0};#CCE0FF={r:0.8,g:0.878,b:1};#FF3B30={r:1,g:0.231,b:0.188};#FFFFFF={r:1,g:1,b:1}。

---

### Task T1.0a — Figma 侧口径标定（写 CLI 代码之前，纯 Figma 侧，不含 Robolectric）

**前置**：T0.3 已完成（monorepo 就绪，Node 26 可用）。本任务不写任何 `packages/` 代码。
**目标**：在写 uiv CLI 之前，用真实 MCP 调用证实/证伪三个承重口径假设（设计文档 Day 0.5 + C5/第 4 节）：① scale=2 像素对应；② "1 Figma 单位 = 1dp"（Figma 侧一半，渲染侧一半归 T1.1/T1.0b）；③ `get_metadata` 坐标系语义（绝对 vs 相对父级）。另实测 odiff 对 2x 整页大图（720×1600）的耗时。
**执行分工**：所有 `mcp__figma__*` 调用由主会话执行者直接发起（本会话 Figma MCP 已连接）；本计划写死每次调用的参数与期望返回结构。Bash/脚本步骤照抄执行。
**运行时变量约定**：`<FILE_KEY>`、`<FRAME_ID>`、`<SWATCH_ID>` 等尖括号符号指代前序步骤的实际返回值，执行时原样代入；这是变量引用，不是待补占位。
**证伪处理**：任一机判断言脚本非 0 退出且非环境原因（文件路径错、XML 属性名差异可修正的除外）→ 停止，携脚本输出回 Codex 决断（决策链：设计文档 → Codex → 用户），不得擅自放宽容差。

**测试 frame 设计值**：严格按本文 header 后的「Canonical Calibration Contract」节点表（5 节点：CalibCard/CalibTitle/CalibSubtitle/CalibSwatch/CalibBadge）执行，本章不重复列表；T1.2 手工 fixture 的 spec 来源同表。

frame 放在画布 (100,100) 是刻意的：子节点 `CalibSwatch` 设计相对位置 (12,60)，若报 x≈12 → 相对父级；若报 x≈112（即绝对 (112,160)）→ 绝对坐标。两值相差 100，±0.5 容差下无歧义。

---

#### Step 1（~2min）：建目录与 .gitignore

```bash
mkdir -p /Users/zhuxi/AI/magpie_eye/scripts/calibration/fixtures \
         /Users/zhuxi/AI/magpie_eye/docs/calibration-assets \
         /Users/zhuxi/AI/magpie_eye/.calib-tmp
echo ".calib-tmp/" >> /Users/zhuxi/AI/magpie_eye/.gitignore
git -C /Users/zhuxi/AI/magpie_eye check-ignore .calib-tmp && echo GITIGNORE-OK
```

预期输出末行：`GITIGNORE-OK`。`.calib-tmp/` 存放生成的大 PNG 与红测试临时物，不入库；`scripts/calibration/` 与 `docs/calibration-assets/` 是提交资产（满足"随档附机判脚本"）。

#### Step 2（~2min）：MCP 调用 ① `whoami` —— 登录态与 planKey

调用：`mcp__figma__whoami`，参数 `{}`。
期望返回：JSON，含当前用户 `email` 与 `plans[]`（每项含 `key`，形如 `team::123...` 或 `organization::123...`）。
机判判据：返回非错误且 `plans` 非空。取 `plans[0].key` 记为 `<PLAN_KEY>`（无人值守默认取第一个；若该 plan 后续 create 被拒，换下一个再试一次，仍拒 → 走 Step 4F 降级）。
失败（未登录/无 seat）→ 直接走 Step 4F 降级分支。

#### Step 3（~3min）：MCP 调用 ② `create_new_file` —— 自建标定文件

先加载 create 技能（若存在）：尝试读 MCP resource `skill://figma/figma-create-new-file/SKILL.md`（`ReadMcpResourceTool`）；resource 不存在则直接调用并在 calibration.md 记一笔"skill 不可用，裸调"。

调用：`mcp__figma__create_new_file`，参数：

```json
{ "fileName": "uiv-calibration", "planKey": "<PLAN_KEY>", "editorType": "design" }
```

期望返回：新文件的 `fileKey` 与 URL（`https://figma.com/design/<FILE_KEY>/uiv-calibration`）。记录 `<FILE_KEY>`。

#### Step 4（~2min）：MCP 调用 ③ `get_metadata`（无 nodeId）—— B2 可用性核验（首个硬门）

调用：`mcp__figma__get_metadata`，参数：

```json
{ "fileKey": "<FILE_KEY>", "clientLanguages": "typescript", "clientFrameworks": "unknown" }
```

期望返回：顶层页面列表，每项含 guid（形如 `0:1`）与 name。
机判判据：返回文本中能用正则 `\d+:\d+` 提出至少一个页面 id。记页面 id 为 `<PAGE_ID>`（通常 `0:1`）。
判定通过 → B2 状态由"待 T1.0a 首步验证"改为"已验证"（Step 13 写入 meta.json）。

**Step 4F（降级分支，仅 Step 2~4 任一失败时走）**：按编排计划 B2 缓解——人工在 Figma 桌面 App 中按上表手建 `CalibCard` 并导出 2x PNG 到 `docs/calibration-assets/card-2x.png`；`metadata.raw.xml` 无法获得 → 断言 ②③ 记 `skipped(b2-unavailable)`，坐标系口径悬置并作为 blocker 回 Codex；断言 ① 与 Step 11 odiff 实测照常执行（零 Figma 依赖）。降级触发原因与走向写入 `meta.json.blockers[]` 与 `docs/calibration.md`。后续步骤中依赖 metadata 的 Step 6、9、10 跳过，其余照常。②③ 被 skipped 时，T1.0a 任务状态只能置 blocked/awaiting-codex，不得置 done——标定悬置即 Phase 0 硬边界未过。

#### Step 5（~4min）：MCP 调用 ④ `use_figma` —— 构建已知几何 frame

先加载 use 技能：优先 `/figma-use` skill；无则读 MCP resource `skill://figma/figma-use/SKILL.md`；再无则裸调（记录）。

调用：`mcp__figma__use_figma`，参数（`code` 完整如下，一次调用建全 Canonical Calibration Contract 的 5 节点）：

```json
{
  "fileKey": "<FILE_KEY>",
  "description": "Create canonical calibration card per contract: 360x200 frame (corner 8) + title/subtitle/swatch/badge with fixed geometry and solid fills",
  "code": "(async () => { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); const frame = figma.createFrame(); frame.name = 'CalibCard'; frame.x = 100; frame.y = 100; frame.resize(360, 200); frame.cornerRadius = 8; frame.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8 } }]; const title = figma.createText(); title.name = 'CalibTitle'; title.characters = 'Calibration Card'; title.fontSize = 16; title.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]; title.textAutoResize = 'NONE'; title.resize(200, 20); frame.appendChild(title); title.x = 12; title.y = 12; const subtitle = figma.createText(); subtitle.name = 'CalibSubtitle'; subtitle.characters = 'Known geometry fixture'; subtitle.fontSize = 12; subtitle.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.878, b: 1 } }]; subtitle.textAutoResize = 'NONE'; subtitle.resize(200, 16); frame.appendChild(subtitle); subtitle.x = 12; subtitle.y = 36; const swatch = figma.createRectangle(); swatch.name = 'CalibSwatch'; swatch.resize(80, 40); swatch.fills = [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 } }]; frame.appendChild(swatch); swatch.x = 12; swatch.y = 60; const badge = figma.createRectangle(); badge.name = 'CalibBadge'; badge.resize(52, 20); badge.cornerRadius = 10; badge.fills = [{ type: 'SOLID', color: { r: 1, g: 0.231, b: 0.188 } }]; frame.appendChild(badge); badge.x = 296; badge.y = 12; figma.currentPage.appendChild(frame); return JSON.stringify({ frameId: frame.id, titleId: title.id, subtitleId: subtitle.id, swatchId: swatch.id, badgeId: badge.id, frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height, r: frame.cornerRadius }, titleRel: { x: title.x, y: title.y, w: title.width, h: title.height }, subtitleRel: { x: subtitle.x, y: subtitle.y, w: subtitle.width, h: subtitle.height }, swatchRel: { x: swatch.x, y: swatch.y, w: swatch.width, h: swatch.height }, badgeRel: { x: badge.x, y: badge.y, w: badge.width, h: badge.height, r: badge.cornerRadius } }); })()"
}
```

（几何与色值均出自 Canonical Calibration Contract（如 0.2/0.4/0.8 = `#3366CC`、1/0.231/0.188 = `#FF3B30`）。Plugin API 中子节点 x/y 相对父级。）
期望返回：上述 JSON——`frame` 应为 `{x:100,y:100,w:360,h:200,r:8}`，`titleRel`=`{x:12,y:12,w:200,h:20}`，`subtitleRel`=`{x:12,y:36,w:200,h:16}`，`swatchRel`=`{x:12,y:60,w:80,h:40}`，`badgeRel`=`{x:296,y:12,w:52,h:20,r:10}`。记录 `<FRAME_ID>`（形如 `1:2`，运行期真实 nodeId，不进 fixture）。返回值不符 → 该调用即已证伪"写入几何=读回几何"，回 Codex。

#### Step 6（~2min）：MCP 调用 ⑤ `get_metadata`（nodeId=页面）→ 落盘原始 XML

调用：`mcp__figma__get_metadata`，参数：

```json
{ "fileKey": "<FILE_KEY>", "nodeId": "<PAGE_ID>", "clientLanguages": "typescript", "clientFrameworks": "unknown" }
```

期望返回：XML 结构树，节点带 `id`/`name`/`type`/`x`/`y`/`width`/`height` 属性，应包含 name 为 `CalibCard`、`CalibTitle`、`CalibSubtitle`、`CalibSwatch`、`CalibBadge` 的五个节点。
执行者将返回的 XML 原文（仅 XML 部分，不含工具包装文字）用 Write 工具存为 `/Users/zhuxi/AI/magpie_eye/docs/calibration-assets/metadata.raw.xml`。

```bash
grep -c 'CalibSwatch' /Users/zhuxi/AI/magpie_eye/docs/calibration-assets/metadata.raw.xml
```

预期输出：`1`。

#### Step 7（~3min）：MCP 调用 ⑥ `get_screenshot`（2x）→ 落盘 PNG

调用：`mcp__figma__get_screenshot`，参数（`maxDimension: 720` = 长边 360×2，即请求 2x 渲染）：

```json
{ "fileKey": "<FILE_KEY>", "nodeId": "<FRAME_ID>", "maxDimension": 720, "contentsOnly": true }
```

期望返回：短时效 URL + curl 指令 + JSON 元数据，元数据含 `width`/`height`（渲染 PNG 尺寸，期望 720/400）与 `original_width`/`original_height`（期望 360/200）。将四个数记入 Step 12 的 calibration.md。
执行者按返回的 curl 指令下载：

```bash
curl -sSf -o /Users/zhuxi/AI/magpie_eye/docs/calibration-assets/card-2x.png "<返回的短时效URL>"
file /Users/zhuxi/AI/magpie_eye/docs/calibration-assets/card-2x.png
```

预期输出含：`PNG image data, 720 x 400`。若 `file` 显示 360×200（工具不放大）——这本身就是断言 ① 的证伪素材，继续 Step 9 让脚本红掉后回 Codex（备选通道：REST `/v1/images?scale=2` 待 PAT，或人工导出 2x）。

#### Step 8（~5min）：写 PNG 生成器（红测试物料 + odiff 物料）

写 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/gen-png.mjs`（纯 Node，零依赖，手写 IHDR/IDAT/CRC32）：

```js
// gen-png.mjs <out.png> <width> <height> <variant: a|b>
// 生成 8-bit RGBA PNG：渐变底；variant b 在 (300,700) 处叠一块 100x100 纯橙差异区
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const [out, wArg, hArg, variant] = process.argv.slice(2);
const w = Number(wArg), h = Number(hArg);
if (!out || !w || !h || !['a', 'b'].includes(variant)) {
  console.error('usage: gen-png.mjs <out.png> <w> <h> <a|b>'); process.exit(64);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, color type 6 (RGBA)
const raw = Buffer.alloc(h * (1 + w * 4));
for (let y = 0; y < h; y++) {
  const row = y * (1 + w * 4); // 行首 filter byte = 0
  for (let x = 0; x < w; x++) {
    const o = row + 1 + x * 4;
    const inBlock = variant === 'b' && x >= 300 && x < 400 && y >= 700 && y < 800;
    raw[o] = inBlock ? 255 : (x * 255 / w) | 0;
    raw[o + 1] = inBlock ? 153 : (y * 255 / h) | 0;
    raw[o + 2] = inBlock ? 0 : 128;
    raw[o + 3] = 255;
  }
}
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`wrote ${out} ${w}x${h} variant=${variant}`);
```

用 macOS 自带 `sips` 做独立交叉验证（生成器与后面的 IHDR 读取器不能互证，须第三方裁判）：

```bash
cd /Users/zhuxi/AI/magpie_eye
node scripts/calibration/gen-png.mjs .calib-tmp/probe.png 100 50 a
sips -g pixelWidth -g pixelHeight .calib-tmp/probe.png
```

预期输出含：`pixelWidth: 100` 与 `pixelHeight: 50`。不符 → 修 gen-png 直到符合，才能继续。

#### Step 9（~5min）：断言脚本 ①——scale=2 像素尺寸（红 → 绿 → 实测）

写 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/check-scale.mjs`：

```js
// check-scale.mjs <png> <expectedFigmaW> <expectedFigmaH> <scale>
// 读 PNG IHDR 实际像素宽高，断言 |实际 − 期望Figma单位×scale| ≤ 2px
import { readFileSync } from 'node:fs';
const [png, ewArg, ehArg, sArg] = process.argv.slice(2);
if (!png || !ewArg || !ehArg || !sArg) {
  console.error('usage: check-scale.mjs <png> <figmaW> <figmaH> <scale>'); process.exit(64);
}
const buf = readFileSync(png);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!buf.subarray(0, 8).equals(SIG)) { console.error('not a PNG'); process.exit(1); }
if (buf.toString('ascii', 12, 16) !== 'IHDR') { console.error('IHDR not first chunk'); process.exit(1); }
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
const ew = Number(ewArg) * Number(sArg), eh = Number(ehArg) * Number(sArg);
const dw = Math.abs(w - ew), dh = Math.abs(h - eh);
const pass = dw <= 2 && dh <= 2;
console.log(JSON.stringify({ png, actualPx: [w, h], expectedPx: [ew, eh], deltaPx: [dw, dh], tolerancePx: 2, pass }));
process.exit(pass ? 0 : 1);
```

红（用 Step 8 的 100×50 探针冒充 360×200@2x，必须失败）：

```bash
cd /Users/zhuxi/AI/magpie_eye
node scripts/calibration/check-scale.mjs .calib-tmp/probe.png 360 200 2; echo "exit=$?"
```

预期：JSON 中 `"pass":false`，`exit=1`。
绿（自洽）：

```bash
node scripts/calibration/check-scale.mjs .calib-tmp/probe.png 50 25 2; echo "exit=$?"
```

预期：`"pass":true`，`exit=0`。
实测（正式断言 ①）：

```bash
node scripts/calibration/check-scale.mjs docs/calibration-assets/card-2x.png 360 200 2; echo "exit=$?"
```

预期：`"actualPx":[720,400]`、`"pass":true`、`exit=0` = scale=2 口径成立。exit=1 → 证伪，携 JSON 回 Codex。

#### Step 10（~5min）：断言脚本 ②——Figma 单位→dp 标定（红 → 实测）

写 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/check-figma-units.mjs`：

```js
// check-figma-units.mjs <metadata.raw.xml>
// 断言 get_metadata 报告的宽高(Figma 单位)与设计值(dp 名义值)一致(±0.5)
// 与 check-scale(px = 单位×2)合并 ⇒ "1 Figma 单位 = 1dp @ density 2.0" Figma 侧成立
import { readFileSync } from 'node:fs';
const xml = readFileSync(process.argv[2], 'utf8');
function attrs(name) {
  const m = xml.match(new RegExp(`<[^>]*name="${name}"[^>]*>`));
  if (!m) return null;
  const num = (k) => {
    const a = m[0].match(new RegExp(`(?:^|\\s)${k}="(-?[\\d.]+)"`));
    return a ? Number(a[1]) : null;
  };
  return { x: num('x'), y: num('y'), width: num('width'), height: num('height') };
}
const EXPECT = [['CalibCard', 360, 200], ['CalibSwatch', 80, 40]];
const TOL = 0.5;
let fail = 0;
const results = EXPECT.map(([name, w, h]) => {
  const n = attrs(name);
  if (!n || n.width == null || n.height == null) { fail++; return { name, error: 'node or w/h attrs not found' }; }
  const ok = Math.abs(n.width - w) <= TOL && Math.abs(n.height - h) <= TOL;
  if (!ok) fail++;
  return { name, expectedUnits: [w, h], actualUnits: [n.width, n.height], ok };
});
console.log(JSON.stringify({ results, pass: fail === 0 }));
process.exit(fail === 0 ? 0 : 1);
```

写红测试 fixture `/Users/zhuxi/AI/magpie_eye/scripts/calibration/fixtures/units-bad.xml`：

```xml
<frame id="1:100" name="CalibCard" type="FRAME" x="100" y="100" width="999" height="200">
  <rectangle id="1:103" name="CalibSwatch" type="RECTANGLE" x="12" y="60" width="80" height="40"/>
</frame>
```

红：

```bash
cd /Users/zhuxi/AI/magpie_eye
node scripts/calibration/check-figma-units.mjs scripts/calibration/fixtures/units-bad.xml; echo "exit=$?"
```

预期：`"pass":false`，`exit=1`（CalibCard 999≠360）。
实测（正式断言 ②）：

```bash
node scripts/calibration/check-figma-units.mjs docs/calibration-assets/metadata.raw.xml; echo "exit=$?"
```

预期：两节点 `ok:true`，`exit=0`。若报 `attrs not found`：属性名与预期 XML 形态不符属格式差异——对照 metadata.raw.xml 实际属性名修正脚本正则后重跑（此为可修正环境差异，不算证伪）；若 XML 根本无尺寸信息，才是通道证伪 → 回 Codex。

#### Step 11（~5min）：断言脚本 ③——get_metadata 坐标系判定（双分支 fixture → 实测）

写 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/check-coords.mjs`：

```js
// check-coords.mjs <metadata.raw.xml>
// CalibSwatch 设计相对位置 (12,60)，父 frame 画布位置 (100,100)。
// 报告 x≈12 ⇒ relative-to-parent；x≈112 ⇒ absolute；皆非 ⇒ ambiguous(exit 2 → Codex)
import { readFileSync } from 'node:fs';
const xml = readFileSync(process.argv[2], 'utf8');
function attrs(name) {
  const m = xml.match(new RegExp(`<[^>]*name="${name}"[^>]*>`));
  if (!m) return null;
  const num = (k) => {
    const a = m[0].match(new RegExp(`(?:^|\\s)${k}="(-?[\\d.]+)"`));
    return a ? Number(a[1]) : null;
  };
  return { x: num('x'), y: num('y') };
}
const frame = attrs('CalibCard'), swatch = attrs('CalibSwatch');
if (!frame || !swatch || frame.x == null || swatch.x == null) {
  console.error('nodes or x/y attrs not found'); process.exit(3);
}
const TOL = 0.5;
const relOK = Math.abs(swatch.x - 12) <= TOL && Math.abs(swatch.y - 60) <= TOL;
const absOK = Math.abs(swatch.x - (frame.x + 12)) <= TOL && Math.abs(swatch.y - (frame.y + 60)) <= TOL;
let verdict = null;
if (relOK && !absOK) verdict = 'relative-to-parent';
else if (absOK && !relOK) verdict = 'absolute';
const out = { frame: { x: frame.x, y: frame.y }, swatch: { x: swatch.x, y: swatch.y }, verdict: verdict ?? 'ambiguous' };
console.log(JSON.stringify(out));
process.exit(verdict ? 0 : 2);
```

写两个分支 fixture（脚本自测：两种语义都必须被正确识别）：

`/Users/zhuxi/AI/magpie_eye/scripts/calibration/fixtures/coords-relative.xml`：

```xml
<frame id="1:100" name="CalibCard" type="FRAME" x="100" y="100" width="360" height="200">
  <rectangle id="1:103" name="CalibSwatch" type="RECTANGLE" x="12" y="60" width="80" height="40"/>
</frame>
```

`/Users/zhuxi/AI/magpie_eye/scripts/calibration/fixtures/coords-absolute.xml`：

```xml
<frame id="1:100" name="CalibCard" type="FRAME" x="100" y="100" width="360" height="200">
  <rectangle id="1:103" name="CalibSwatch" type="RECTANGLE" x="112" y="160" width="80" height="40"/>
</frame>
```

自测：

```bash
cd /Users/zhuxi/AI/magpie_eye
node scripts/calibration/check-coords.mjs scripts/calibration/fixtures/coords-relative.xml
node scripts/calibration/check-coords.mjs scripts/calibration/fixtures/coords-absolute.xml
```

预期：第一条输出 `"verdict":"relative-to-parent"`、第二条 `"verdict":"absolute"`，均 exit 0。
实测（正式断言 ③）：

```bash
node scripts/calibration/check-coords.mjs docs/calibration-assets/metadata.raw.xml; echo "exit=$?"
```

预期：exit=0 且 verdict 二者其一——**两种 verdict 都是合法标定结论**（不是红绿，是定口径），结论写入 calibration.md，并注明它决定 figma-spec-cache 适配层（T1.2）是否需要对 get_metadata 通道做 re-base。exit=2（ambiguous）→ 回 Codex。

#### Step 12（~4min）：odiff-bin 实测 2x 整页大图耗时（零 Figma 依赖）

写 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/time-odiff.mjs`：

```js
// time-odiff.mjs <a.png> <b.png> <diff.png>
// 经 npx 调 odiff-bin 比对 3 轮取中位数；exit 0(一致)/22(像素差异)均视为正常
import { spawnSync } from 'node:child_process';
const [a, b, out] = process.argv.slice(2);
if (!a || !b || !out) { console.error('usage: time-odiff.mjs <a> <b> <diff>'); process.exit(64); }
// 预热：触发 npx 缓存 odiff-bin，不计时
const warm = spawnSync('npx', ['-y', '-p', 'odiff-bin', 'odiff', '--version'], { encoding: 'utf8' });
if (warm.error) { console.error('npx unavailable: ' + warm.error.message); process.exit(1); }
const runs = [];
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const r = spawnSync('npx', ['-y', '-p', 'odiff-bin', 'odiff', a, b, out], { encoding: 'utf8' });
  const ms = Math.round(performance.now() - t0);
  if (r.status !== 0 && r.status !== 22) {
    console.error(`odiff unexpected exit=${r.status} stderr=${r.stderr}`); process.exit(1);
  }
  runs.push({ ms, exit: r.status });
}
const sorted = runs.map((r) => r.ms).sort((x, y) => x - y);
console.log(JSON.stringify({ note: 'includes npx forwarding overhead (warmed cache)', runs, median_ms: sorted[1] }));
```

生成两张 720×1600（= 360×800dp 整页 @2x）并计时：

```bash
cd /Users/zhuxi/AI/magpie_eye
node scripts/calibration/gen-png.mjs .calib-tmp/page-a.png 720 1600 a
node scripts/calibration/gen-png.mjs .calib-tmp/page-b.png 720 1600 b
node scripts/calibration/time-odiff.mjs .calib-tmp/page-a.png .calib-tmp/page-b.png .calib-tmp/page-diff.png
```

预期输出：JSON，`runs` 三项 `exit:22`（有 100×100 差异块），`median_ms` 为实测值。这是测量不是门禁，无阈值；数值落档，供 T1.2 L1 与 M2 odiff server 模式对比基线。注明该值含 npx 转发开销，T1.2 集成时改用解析后的二进制直调。

#### Step 13（~5min）：结论落档 —— docs/calibration.md + meta.json.calibration

写 `/Users/zhuxi/AI/magpie_eye/docs/calibration.md`，结构与内容如下（`<...>` 处填本次各步实测值，其余文字照写）：

```markdown
# T1.0a Figma 侧口径标定结论

- 通道: **channel=mcp-only**(Figma MCP;REST 交叉标定待 B1 PAT,已在 pending_followups)
- 本文所有容差常量在 PAT 交叉对比完成前 **视为暂定**。
- 标定文件: uiv-calibration, fileKey `<FILE_KEY>`, CalibCard nodeId `<FRAME_ID>`(设计值见子计划 Canonical Calibration Contract 节点表)

## B2 可用性
whoami/create_new_file/get_metadata 实调结果: <通过|降级>。<若降级:触发原因与人工导出流程记录>

## 断言① scale=2 像素对应
get_screenshot(maxDimension=720) 报告 width/height=<720/400>, original=<360/200>;
check-scale.mjs 实测 PNG IHDR=<720x400>, delta=<0,0> ≤ 2px → <成立|证伪>

## 断言② 1 Figma 单位 = 1dp(Figma 侧)
check-figma-units.mjs: CalibCard <360x200>, CalibSwatch <80x40>(±0.5) → <成立|证伪>
结合断言①(px = 单位×2)⇒ Figma 单位=dp 名义值、scale=2 ↔ density 2.0(xhdpi)。
渲染侧另一半由 T1.1 内嵌的 T1.0b(同款卡片 Robolectric 渲染对比)闭合。

## 断言③ get_metadata 坐标系
check-coords.mjs verdict: **<absolute|relative-to-parent>**(frame@(100,100), swatch 报告 x=<值>)
⇒ figma-spec-cache 适配层对 get_metadata 通道 <须|无须> 做减父原点 re-base;
REST absoluteBoundingBox 恒为绝对坐标、恒须 re-base(设计文档 C5),两通道口径在适配层统一为"相对目标 Frame"。

## odiff 2x 整页耗时(720×1600, 本地合成, 零 Figma 依赖)
runs=<[..,..,..]>ms, median=<n>ms(含 npx 转发开销,预热后)。

## 遗留
- REST(`/v1/files/:key/nodes` absoluteBoundingBox / `/v1/images scale=2`)交叉标定: 待 PAT(pending_followups)。
- get_screenshot 无显式 scale 参数,2x 经 maxDimension=长边×2 达成,该行为纳入 PAT 后交叉验证。
```

再写一键复跑脚本 `/Users/zhuxi/AI/magpie_eye/scripts/calibration/run-all.sh`（任务验收命令）：

```sh
#!/bin/sh
# T1.0a 机判验收: 三断言全过 exit 0;任一非 0 = 标定不成立
set -e
cd "$(dirname "$0")/../.."
node scripts/calibration/check-scale.mjs docs/calibration-assets/card-2x.png 360 200 2
node scripts/calibration/check-figma-units.mjs docs/calibration-assets/metadata.raw.xml
node scripts/calibration/check-coords.mjs docs/calibration-assets/metadata.raw.xml
echo "T1.0a CALIBRATION OK"
```

```bash
chmod +x /Users/zhuxi/AI/magpie_eye/scripts/calibration/run-all.sh
/Users/zhuxi/AI/magpie_eye/scripts/calibration/run-all.sh; echo "exit=$?"
```

预期输出末两行：`T1.0a CALIBRATION OK`、`exit=0`。

然后用 Edit 更新 `/Users/zhuxi/AI/magpie_eye/.claude/plans/magpie-eye-full-impl/meta.json`：`calibration` 键填入（数值以实测为准）：

```json
"calibration": {
  "channel": "mcp-only",
  "tolerances_provisional": true,
  "b2_verified": true,
  "figma_file_key": "<FILE_KEY>",
  "calib_frame_node_id": "<FRAME_ID>",
  "scale2_px": { "expected": [720, 400], "actual": [720, 400], "tolerance_px": 2, "pass": true },
  "figma_unit_eq_dp": { "figma_side": "pass", "render_side": "pending-T1.0b" },
  "metadata_coord_system": "<absolute|relative-to-parent>",
  "odiff_720x1600_median_ms": 0,
  "rest_cross_check": "pending-B1-PAT"
}
```

并确认 `pending_followups[]` 含"PAT 到位后:MCP↔REST 坐标交叉标定 + 容差常量转正"条目（无则追加）；`tasks."T1.0a".status` 改 `done` 留待 commit 后回填 `last_commit`。

#### Step 14（~3min）：单 commit 收口（每任务一 commit，带任务号）

```bash
cd /Users/zhuxi/AI/magpie_eye
git add .gitignore scripts/calibration docs/calibration.md docs/calibration-assets \
        .claude/plans/magpie-eye-full-impl/meta.json
git status --short   # 确认无 .calib-tmp 内容混入
git commit -m "feat(T1.0a): figma-side calibration - scale2 px check, figma-unit=dp, metadata coord-system verdict, odiff 2x timing (channel=mcp-only, tolerances provisional)"
git log --oneline -1
```

预期：`git log` 末行含 `T1.0a`。将该 commit hash 回填 `meta.json.tasks."T1.0a".last_commit`（此文件改动并入下一任务 commit 或即时 amend，二选一并保持后续一致）。

**任务验收（可机判）**：`scripts/calibration/run-all.sh` exit 0；`docs/calibration.md` 存在且含 `channel=mcp-only`（`grep -q 'channel=mcp-only' docs/calibration.md`）；`node -e "const m=require('./.claude/plans/magpie-eye-full-impl/meta.json'); process.exit(m.calibration && m.calibration.channel==='mcp-only' ? 0 : 1)"` exit 0。任一断言证伪（脚本非 0 且非可修正格式差异）→ 不标 done，携证据回 Codex 决断后再定容差与口径。

---

### Task T1.1 — demo Android 工程 + 延迟实测 + NATIVE 文本度量钉版本

> 对应:设计文档第 8 节 Phase 0 Day 1、2.2 节"渲染环境钉死"、核查项 C1/C2/CS1/CS2;编排计划 M1 表 T1.1(含 T1.0b 渲染侧标定)。
> 前置:T0.1(git)、T0.2(Android SDK)、T0.3(TS monorepo)、T1.0a(Figma 侧标定,`meta.json.calibration` 与 `docs/calibration.md` 已落盘)均 done。
> 产出:`demo-android/` 独立 Gradle 工程 + 截图测试绿 + 离线复跑绿 + 延迟基线 + CS1/CS2 实测结论 + T1.0b 渲染侧标定,全部落 `meta.json`。

#### 版本钉死(写死进 `libs.versions.toml`,2026-07-08 核实)

| 组件 | 钉定版本 | 依据 |
|------|---------|------|
| Gradle wrapper | **9.5.1** | 设计文档 C1 对抗核查显式验证过的组合(Gradle 9.5.1 / AGP 9.0);[roborazzi#830](https://github.com/takahirom/roborazzi/issues/830)(Gradle 9.4.1+ × KMP 间歇构建故障,open)仅影响 KMP 模块——本工程为**纯 Android module**,规避成立 |
| AGP | **9.0.1** | 9.0 线是 C1 验证基线(Roborazzi 自 1.56.0 官方声明兼容 AGP 9.0);9.0.1 为 2026-01 patch([release notes](https://developer.android.com/build/releases/past-releases/agp-9-0-0-release-notes))。不追 9.1/9.2(2026-04,超出 C1 验证基线,对 demo 无增量价值) |
| Kotlin | **AGP 9.0 内建 Kotlin(KGP 2.2.10)** | AGP 9.0 默认启用 built-in Kotlin,**不 apply `org.jetbrains.kotlin.android`**([JetBrains 迁移指南](https://blog.jetbrains.com/kotlin/2026/01/update-your-projects-for-agp9/));[robolectric#10909](https://github.com/robolectric/robolectric/issues/10909)(robolectric-processor × builtInKotlin 不兼容)仅影响自定义 shadow——本工程**不写任何自定义 shadow**,规避成立 |
| Compose 编译器插件 | **org.jetbrains.kotlin.plugin.compose 2.2.10** | 与内建 KGP 2.2.10 同版本;AGP 9 + Compose 官方接法:apply 该插件 + `buildFeatures.compose = true`([官方 setup 文档](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)) |
| Compose BOM | **2026.06.00** | 2026-07 时点最新稳定 BOM([developer.android.com](https://developer.android.com/develop/ui/compose/bom)、[mvnrepository](https://mvnrepository.com/artifact/androidx.compose/compose-bom)) |
| Roborazzi | **1.63.0**(2026-05-20) | 编排计划与 C1 核查锚定 1.63 线;1.63.x 最新即 1.63.0([releases](https://github.com/takahirom/roborazzi/releases),1.64~1.67 已出但未经本计划核查,不追新) |
| Robolectric | **4.16** | SDK 36 支持([release](https://github.com/robolectric/robolectric/releases/tag/robolectric-4.16));跑 SDK 36 需 JDK 21——本机 Corretto 21.0.9 满足 |
| ComposablePreviewScanner | **0.9.0** | 编排计划钉定;坐标 `io.github.sergio-sastre.ComposablePreviewScanner:android:0.9.0`;要求 Kotlin ≥2.0(满足)、配 Roborazzi ≥1.49(满足) |
| junit / androidx.test | **4.13.2 / core 1.7.0 / ext-junit 1.3.0** | Robolectric 4.16 官方样例配套线 |

#### 步骤

**T1.1.0 前置断言(约 1 分钟,无 commit)**

```bash
test -d "$HOME/Library/Android/sdk/platforms/android-36" \
  && test -d "$HOME/Library/Android/sdk/platform-tools" \
  && ls "$HOME/Library/Android/sdk/build-tools" | grep -q '^36\.' \
  && java -version 2>&1 | grep -q '"21' \
  && node -e 'const m=require("/Users/zhuxi/AI/magpie_eye/.claude/plans/magpie-eye-full-impl/meta.json"); process.exit(m.calibration ? 0 : 1)' \
  && test -f /Users/zhuxi/AI/magpie_eye/docs/calibration.md \
  && echo T1.1-PRECONDITION-OK
```

预期输出:`T1.1-PRECONDITION-OK`。任一断言失败 → 停止,回查 T0.2 / T1.0a,不得继续。

---

**T1.1.1 根脚手架 + build-logic convention plugin 雏形(约 5 分钟)**

创建以下 7 个文件(此步只写文件,还没有 gradlew,无法运行):

`/Users/zhuxi/AI/magpie_eye/demo-android/settings.gradle.kts`

```kotlin
pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "uiv-demo-android"
// include(":app") 在 T1.1.3 加入
```

`/Users/zhuxi/AI/magpie_eye/demo-android/gradle.properties`

```properties
org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8
org.gradle.configuration-cache=true
org.gradle.caching=true
android.useAndroidX=true
```

`/Users/zhuxi/AI/magpie_eye/demo-android/local.properties`(gitignore,不入库)

```properties
sdk.dir=/Users/zhuxi/Library/Android/sdk
```

`/Users/zhuxi/AI/magpie_eye/demo-android/gradle/libs.versions.toml`

```toml
[versions]
agp = "9.0.1"
kotlinComposePlugin = "2.2.10" # 跟随 AGP 9.0 内建 Kotlin(KGP 2.2.10)
composeBom = "2026.06.00"
roborazzi = "1.63.0"
robolectric = "4.16"
composablePreviewScanner = "0.9.0"
junit4 = "4.13.2"
androidxTestCore = "1.7.0"
androidxTestExtJunit = "1.3.0"

[libraries]
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
androidx-compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
androidx-test-core = { group = "androidx.test", name = "core", version.ref = "androidxTestCore" }
androidx-test-ext-junit = { group = "androidx.test.ext", name = "junit", version.ref = "androidxTestExtJunit" }
junit4 = { group = "junit", name = "junit", version.ref = "junit4" }
robolectric = { group = "org.robolectric", name = "robolectric", version.ref = "robolectric" }
roborazzi = { group = "io.github.takahirom.roborazzi", name = "roborazzi", version.ref = "roborazzi" }
roborazzi-compose = { group = "io.github.takahirom.roborazzi", name = "roborazzi-compose", version.ref = "roborazzi" }
roborazzi-preview-scanner-support = { group = "io.github.takahirom.roborazzi", name = "roborazzi-compose-preview-scanner-support", version.ref = "roborazzi" }
composable-preview-scanner = { group = "io.github.sergio-sastre.ComposablePreviewScanner", name = "android", version.ref = "composablePreviewScanner" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlinComposePlugin" }
roborazzi = { id = "io.github.takahirom.roborazzi", version.ref = "roborazzi" }
```

`/Users/zhuxi/AI/magpie_eye/demo-android/build-logic/settings.gradle.kts`

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "build-logic"
```

`/Users/zhuxi/AI/magpie_eye/demo-android/build-logic/build.gradle.kts`

```kotlin
plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        register("uivScreenshot") {
            id = "uiv.screenshot"
            implementationClass = "UivScreenshotConventionPlugin"
        }
    }
}
```

`/Users/zhuxi/AI/magpie_eye/demo-android/build-logic/src/main/kotlin/UivScreenshotConventionPlugin.kt`

```kotlin
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test

/**
 * 渲染挽具 convention plugin 雏形(T1.1,设计文档 2.2 节"接入打包")。
 * 当前只承载渲染环境钉死三件事(C2 边界);后续里程碑并入
 * Roborazzi 配置、SemanticsDumpRule、qualifiers 约定。
 */
class UivScreenshotConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        tasks.withType(Test::class.java).configureEach { test ->
            // C2:封死测试代码误初始化 AWT Toolkit -> WindowServer 的路径
            test.jvmArgs("-Djava.awt.headless=true")
            // C2:可写且可从中加载 dylib 的 tmpdir(RNG dylib 与字体解包后 System.load)
            val tmpDir = layout.buildDirectory.dir("robolectric-tmp").get().asFile
            test.systemProperty("java.io.tmpdir", tmpDir.absolutePath)
            test.doFirst { tmpDir.mkdirs() }
            // 关键:gradlew 命令行 -D 只落在 Gradle daemon JVM 上,
            // 必须显式透传给 fork 出来的 test worker JVM,离线验收才真正生效
            listOf("robolectric.offline", "robolectric.dependency.dir").forEach { key ->
                providers.systemProperty(key).orNull?.let { test.systemProperty(key, it) }
            }
            test.maxHeapSize = "2g"
        }
    }
}
```

再校验根 `.gitignore` 覆盖 demo 工程(缺哪行补哪行):

```bash
cd /Users/zhuxi/AI/magpie_eye
for line in 'demo-android/.gradle-home/' 'demo-android/.gradle/' 'demo-android/.robolectric-deps/' 'demo-android/local.properties' 'demo-android/**/build/'; do
  grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
done
git status --short   # 预期:.gitignore(可能)+ demo-android 新文件,local.properties 不出现
```

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: demo-android 脚手架 + build-logic convention plugin 雏形(AGP 9.0.1/Roborazzi 1.63.0/Robolectric 4.16 钉版本)"
```

---

**T1.1.2 Gradle wrapper 9.5.1 引导(约 3 分钟 + 下载时间)**

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
TMP_DL="$(mktemp -d)"
curl -fL -o "$TMP_DL/gradle-9.5.1-bin.zip" https://services.gradle.org/distributions/gradle-9.5.1-bin.zip
unzip -qo "$TMP_DL/gradle-9.5.1-bin.zip" -d "$TMP_DL"
"$TMP_DL/gradle-9.5.1/bin/gradle" wrapper --gradle-version 9.5.1 --distribution-type bin --no-daemon
./gradlew --version
./gradlew help
```

预期:`./gradlew --version` 输出含 `Gradle 9.5.1`;`./gradlew help` 输出 `BUILD SUCCESSFUL`(此步同时证明 build-logic 可编译)。`gradle/wrapper/gradle-wrapper.properties` 中 `distributionUrl` 应为 `https\://services.gradle.org/distributions/gradle-9.5.1-bin.zip`。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: Gradle wrapper 9.5.1 引导(build-logic 编译通过)"
```

---

**T1.1.3 app module 骨架(约 4 分钟 + 首次配置下载)**

`settings.gradle.kts` 末行 `// include(":app") 在 T1.1.3 加入` 替换为:

```kotlin
include(":app")
```

`/Users/zhuxi/AI/magpie_eye/demo-android/app/build.gradle.kts`

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose) // AGP 9 内建 Kotlin,不 apply kotlin-android
    alias(libs.plugins.roborazzi)
    id("uiv.screenshot")
}

android {
    namespace = "com.magpie.uiv.demo"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.magpie.uiv.demo"
        minSdk = 26 // CS2:NATIVE ellipsis 断言要求 sdk>=26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true // Robolectric 必需
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.preview.scanner.support)
    testImplementation(libs.composable.preview.scanner)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.androidx.compose.ui.test.manifest)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
}
```

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
```

验证(首次配置会下载 AGP/依赖,几分钟属正常,单动作不拆):

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:tasks --all | grep -E 'testDebugUnitTest|recordRoborazziDebug'
```

预期:两个任务名均出现(roborazzi 插件已接上),exit 0。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: app module 骨架(Compose BOM 2026.06.00 + Roborazzi/Robolectric/CPS 测试依赖接线)"
```

---

**T1.1.4 渲染环境钉死验证测试(约 4 分钟 + android-all 首次下载)**

写测试,机判 `@Config(qualifiers="w360dp-h800dp-xhdpi")` 真的生效(Robolectric 默认 mdpi/1.0,C5 边界,不能靠默认):

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/test/java/com/magpie/uiv/demo/ConfigPinningTest.kt`

```kotlin
package com.magpie.uiv.demo

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class ConfigPinningTest {

    @Test
    fun densityAndWindowArePinned() {
        val dm = ApplicationProvider.getApplicationContext<Context>().resources.displayMetrics
        assertEquals(2.0f, dm.density, 0.0f)      // xhdpi = 2.0,与 Figma scale=2 标定对齐
        assertEquals(720, dm.widthPixels)          // 360dp * 2.0
        assertEquals(1600, dm.heightPixels)        // 800dp * 2.0
    }
}
```

运行(**此步即"预热 android-all jar"**:Robolectric 运行期把 `android-all-instrumented-36...jar` 下载进 `~/.m2/repository/org/robolectric/`,约 100~200MB,首跑数分钟):

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.ConfigPinningTest'
```

预期:`BUILD SUCCESSFUL`,1 个测试通过。若 density 断言失败 → qualifiers 未生效,属口径类失败,回 Codex,不得继续。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: 渲染环境钉死验证(qualifiers w360dp-h800dp-xhdpi -> density 2.0/720x1600px)+ android-all 预热"
```

---

**T1.1.5 截图测试先行(红,约 3 分钟)**

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/test/java/com/magpie/uiv/demo/CalibCardScreenshotTest.kt`(`CalibCard` 此刻尚不存在,预期编译失败):

```kotlin
package com.magpie.uiv.demo

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class CalibCardScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun captureCalibCard() {
        composeRule.setContent { CalibCard() }
        // node capture 裁到 fig:1:100 的 unclipped bounds:360x200dp * 2.0 = 720x400 px
        composeRule.onNodeWithTag("fig:1:100")
            .captureRoboImage("build/outputs/roborazzi/CalibCard.png")
    }
}
```

确认失败:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:compileDebugUnitTestKotlin
```

预期输出含 `Unresolved reference 'CalibCard'`,`BUILD FAILED`。(红阶段不 commit。)

---

**T1.1.6 CalibCard 最小实现 + @Preview(绿,约 5 分钟)**

几何/色值/文案严格按 Canonical Calibration Contract(单一事实源,见本文 header 后合同表):蓝底 `#3366CC` 360×200 圆角 8;标题 "Calibration Card" 16sp 白;subtitle "Known geometry fixture" 12sp `#CCE0FF`;橙 swatch 80×40 `#FF9900`;红 badge 52×20 `#FF3B30` 圆角 10;testTag 一律 `fig:<fixture nodeId>`(fig:1:100 ~ fig:1:104)。**若 `docs/calibration.md` 实测值与合同表不一致,说明 T1.0a 标定未过——回查 T1.0a,不得在本步擅自改常量。**

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt`

```kotlin
package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Canonical Calibration Contract 的 Compose 实现(单一事实源见子计划 header 后合同表)。
 * 几何/色值/文案不得偏离合同表;T1.4 的 seeded deviations 以本文件为唯一被改对象。
 * CalibBadge 独立为单行调用,供 T1.4 D4(缺失节点)做单行机械移除。
 */
@Composable
fun CalibCard(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .testTag("fig:1:100")
            .size(width = 360.dp, height = 200.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF3366CC))
    ) {
        Text(
            text = "Calibration Card",
            fontSize = 16.sp,
            color = Color(0xFFFFFFFF),
            modifier = Modifier
                .testTag("fig:1:101")
                .offset(x = 12.dp, y = 12.dp)
                .size(width = 200.dp, height = 20.dp),
        )
        Text(
            text = "Known geometry fixture",
            fontSize = 12.sp,
            color = Color(0xFFCCE0FF),
            modifier = Modifier
                .testTag("fig:1:102")
                .offset(x = 12.dp, y = 36.dp)
                .size(width = 200.dp, height = 16.dp),
        )
        Box(
            Modifier
                .testTag("fig:1:103")
                .offset(x = 12.dp, y = 60.dp)
                .size(width = 80.dp, height = 40.dp)
                .background(Color(0xFFFF9900))
        )
        CalibBadge()
    }
}

@Composable
private fun CalibBadge() {
    Box(
        Modifier
            .testTag("fig:1:104")
            .offset(x = 296.dp, y = 12.dp)
            .size(width = 52.dp, height = 20.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFFF3B30))
    )
}

@Preview(name = "CalibCard", widthDp = 360, heightDp = 200, showBackground = true)
@Composable
fun CalibCardPreview() {
    CalibCard()
}
```

跑通:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.CalibCardScreenshotTest' -Proborazzi.test.record=true
test -f app/build/outputs/roborazzi/CalibCard.png && echo PNG-OK
```

预期:`BUILD SUCCESSFUL` + `PNG-OK`。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: CalibCard 标定卡片(Canonical Contract 5 节点,fig:1:100~1:104)+ 截图测试绿出 PNG"
```

---

**T1.1.7 T1.0b 渲染侧标定:PNG 尺寸 ↔ Figma 标定值对比(约 5 分钟)**

`/Users/zhuxi/AI/magpie_eye/scripts/check-t10b.mjs`

```js
#!/usr/bin/env node
// T1.0b(T1.1 内):渲染 PNG 像素尺寸 ↔ 期望值(360x200dp x density2)↔ T1.0a Figma 标定值
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const PNG = `${ROOT}/demo-android/app/build/outputs/roborazzi/CalibCard.png`;
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;
const EXPECTED = { width: 720, height: 400 }; // 360x200dp * 2.0(xhdpi)
const TOLERANCE = 2; // 与 T1.0a 机判脚本同容差(|Δ|<=2px)

const buf = readFileSync(PNG);
if (buf.readUInt32BE(12) !== 0x49484452) { // "IHDR"
  console.error('not a valid PNG (IHDR missing)');
  process.exit(1);
}
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
console.log(`rendered: ${w}x${h}px, expected: ${EXPECTED.width}x${EXPECTED.height}px`);

const meta = JSON.parse(readFileSync(META, 'utf8'));
// T1.0a 落盘的 2x 截图像素尺寸;若 T1.0a 实际键名不同,只改下面这一行的取键
const fig = meta.calibration && (meta.calibration.figma_png_px ?? meta.calibration.figmaPngPx ?? null);
if (fig) console.log(`figma 2x png (T1.0a): ${fig.width}x${fig.height}px`);
else console.log('warning: meta.calibration 无 figma_png_px 键,仅与常量 720x400 对比');

const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
const ok = near(w, EXPECTED.width) && near(h, EXPECTED.height)
  && (!fig || (near(w, fig.width) && near(h, fig.height)));

meta.calibration_render = {
  task: 'T1.1/T1.0b',
  rendered_px: { width: w, height: h },
  expected_px: EXPECTED,
  figma_2x_px: fig,
  tolerance_px: TOLERANCE,
  density_aligned: ok,
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(`density_aligned = ${ok}`);
process.exit(ok ? 0 : 1);
```

运行:

```bash
node /Users/zhuxi/AI/magpie_eye/scripts/check-t10b.mjs
echo "exit=$?"
```

预期:`rendered: 720x400px ...`、`density_aligned = true`、`exit=0`。exit 1 = 渲染侧与 Figma 侧 density 未对齐 → 口径类失败,回 Codex 决断,不得继续 T1.2。

exit 0 后在 `/Users/zhuxi/AI/magpie_eye/docs/calibration.md` 末尾追加:

```markdown
## T1.0b 渲染侧标定(T1.1)

- 渲染环境:Robolectric 4.16 `@Config(qualifiers="w360dp-h800dp-xhdpi")`(density 2.0)+ `@GraphicsMode(NATIVE)`
- CalibCard(360x200dp)node capture 实际像素 720x400,与期望值及 T1.0a Figma 2x 标定值均在 |Δ|<=2px 内(scripts/check-t10b.mjs exit 0)
- 结论:渲染侧 density 2.0 与 Figma 侧 scale=2 对齐,"1 Figma 单位 = 1dp" 在渲染链路成立
```

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1(T1.0b): 渲染 PNG 720x400 与 Figma 2x 标定值对齐,density 标定闭环(check-t10b.mjs exit 0)"
```

---

**T1.1.8 ComposablePreviewScanner 接线(约 4 分钟;纯接线验证,无红阶段)**

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/test/java/com/magpie/uiv/demo/PreviewScannerScreenshotTest.kt`

```kotlin
package com.magpie.uiv.demo

import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import sergio.sastre.composable.preview.scanner.android.AndroidComposablePreviewScanner
import sergio.sastre.composable.preview.scanner.android.AndroidPreviewInfo
import sergio.sastre.composable.preview.scanner.android.screenshotid.AndroidPreviewScreenshotIdBuilder
import sergio.sastre.composable.preview.scanner.core.preview.ComposablePreview

@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class PreviewScannerScreenshotTest(
    private val preview: ComposablePreview<AndroidPreviewInfo>,
) {
    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun previews(): List<ComposablePreview<AndroidPreviewInfo>> =
            AndroidComposablePreviewScanner()
                .scanPackageTrees("com.magpie.uiv.demo")
                .getPreviews()
    }

    @Test
    fun capturePreview() {
        val id = AndroidPreviewScreenshotIdBuilder(preview).build()
        preview.captureRoboImage(filePath = "build/outputs/roborazzi/previews/$id.png")
    }
}
```

运行:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.PreviewScannerScreenshotTest' -Proborazzi.test.record=true
ls app/build/outputs/roborazzi/previews/ | grep -c '\.png$'
```

预期:`BUILD SUCCESSFUL`;`grep -c` 输出 `1`(当前仅 `CalibCardPreview` 一个 @Preview)——证明 scanner 自动发现 @Preview 并渲染,模型侧零测试代码路径成立。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: ComposablePreviewScanner 0.9.0 接线,@Preview 自动发现渲染出 PNG"
```

---

**T1.1.9 NATIVE 实测 CS1:Compose `hasVisualOverflow`(约 5 分钟)**

这是**实测证伪步骤**:测试绿 = CS1 证实;红 = 证伪。两分支处理都在下方写明。

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/test/java/com/magpie/uiv/demo/NativeTextMetricsTest.kt`

```kotlin
package com.magpie.uiv.demo

import android.text.TextUtils
import android.view.View
import android.widget.TextView
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class NativeTextMetricsTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun composeHasVisualOverflow_isTrue_underNative() { // CS1
        var layoutResult: TextLayoutResult? = null
        composeRule.setContent {
            Text(
                text = "超长文本溢出探针".repeat(40),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                onTextLayout = { layoutResult = it },
                modifier = Modifier.width(100.dp),
            )
        }
        composeRule.waitForIdle()
        val overflow = requireNotNull(layoutResult).hasVisualOverflow
        writeProbe("native-compose.json", """{"hasVisualOverflow":$overflow}""")
        assertTrue("CS1:NATIVE 下超长串+maxLines=1 应 hasVisualOverflow==true", overflow)
    }

    @Test
    fun textViewEllipsisCount_isPositive_underNative() { // CS2:真 TextView measure+layout 路径
        val tv = TextView(ApplicationProvider.getApplicationContext()).apply {
            text = "x".repeat(500)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        tv.measure(
            View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        tv.layout(0, 0, tv.measuredWidth, tv.measuredHeight)
        val count = tv.layout.getEllipsisCount(0)
        writeProbe("native-textview.json", """{"ellipsisCount":$count}""")
        assertTrue("CS2:NATIVE 下真 TextView getEllipsisCount 应 >0,实际 $count", count > 0)
    }

    private fun writeProbe(name: String, json: String) {
        val dir = File("build/text-metrics").apply { mkdirs() }
        File(dir, name).writeText(json)
    }
}
```

先只跑 CS1 用例:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.NativeTextMetricsTest.composeHasVisualOverflow_isTrue_underNative'
cat app/build/text-metrics/native-compose.json
```

预期(证实分支):`BUILD SUCCESSFUL`,`{"hasVisualOverflow":true}`。
证伪分支(测试红):删除该用例中 `assertTrue` 一行只保留 probe 落盘,重跑使套件恢复绿;结论按 T1.1.12 落 `advisory`,并按编排计划"口径类失败"回 Codex 决断——**不得**擅自把该 invariant 塞进硬门禁。

commit(证实分支):

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1(CS1): NATIVE 下 Compose hasVisualOverflow==true 实测证实,probe 落盘"
```

---

**T1.1.10 NATIVE 实测 CS2:真 TextView `getEllipsisCount`(约 3 分钟)**

代码已在 T1.1.9 文件中,单独跑第二个用例:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.NativeTextMetricsTest.textViewEllipsisCount_isPositive_underNative'
cat app/build/text-metrics/native-textview.json
```

预期(证实分支):`BUILD SUCCESSFUL`,`{"ellipsisCount":N}` 且 N>0。证伪分支处理与 T1.1.9 相同(去断言留 probe,回 Codex)。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1(CS2): NATIVE 下真 TextView measure+layout 后 getEllipsisCount>0 实测证实"
```

---

**T1.1.11 LEGACY 对比用例(只记录不断言,约 5 分钟)**

`/Users/zhuxi/AI/magpie_eye/demo-android/app/src/test/java/com/magpie/uiv/demo/LegacyTextMetricsProbeTest.kt`

```kotlin
package com.magpie.uiv.demo

import android.text.TextUtils
import android.view.View
import android.widget.TextView
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * LEGACY 图形模式对比探针(CS1/CS2 对照组)。
 * 预期 LEGACY 伪造文本测量:hasVisualOverflow 假阴 / getEllipsisCount 恒 0(PR #9834 已 revert 模拟)。
 * 只记录实测值供 T1.1.12 汇总,不做硬断言(LEGACY 行为非本工具链依赖项)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class LegacyTextMetricsProbeTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun recordComposeOverflowUnderLegacy() {
        val result = runCatching {
            var layoutResult: TextLayoutResult? = null
            composeRule.setContent {
                Text(
                    text = "超长文本溢出探针".repeat(40),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    onTextLayout = { layoutResult = it },
                    modifier = Modifier.width(100.dp),
                )
            }
            composeRule.waitForIdle()
            requireNotNull(layoutResult).hasVisualOverflow
        }
        writeProbe(
            "legacy-compose.json",
            result.fold(
                { """{"hasVisualOverflow":$it,"error":null}""" },
                { """{"hasVisualOverflow":null,"error":"${it.javaClass.simpleName}"}""" },
            ),
        )
    }

    @Test
    fun recordTextViewEllipsisUnderLegacy() {
        val result = runCatching {
            val tv = TextView(ApplicationProvider.getApplicationContext()).apply {
                text = "x".repeat(500)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            tv.measure(
                View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            )
            tv.layout(0, 0, tv.measuredWidth, tv.measuredHeight)
            tv.layout.getEllipsisCount(0)
        }
        writeProbe(
            "legacy-textview.json",
            result.fold(
                { """{"ellipsisCount":$it,"error":null}""" },
                { """{"ellipsisCount":null,"error":"${it.javaClass.simpleName}"}""" },
            ),
        )
    }

    private fun writeProbe(name: String, json: String) {
        val dir = File("build/text-metrics").apply { mkdirs() }
        File(dir, name).writeText(json)
    }
}
```

运行:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest --tests 'com.magpie.uiv.demo.LegacyTextMetricsProbeTest'
cat app/build/text-metrics/legacy-compose.json app/build/text-metrics/legacy-textview.json
```

预期:`BUILD SUCCESSFUL`;两个 JSON 落盘(典型值 `hasVisualOverflow:false` / `ellipsisCount:0`,或 error 字段非空——均为合法记录,证明 LEGACY 不可用于文本度量)。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: LEGACY 文本度量对比探针落盘(与 NATIVE 对照)"
```

---

**T1.1.12 文本度量结论落 meta.json(约 4 分钟)**

`/Users/zhuxi/AI/magpie_eye/scripts/record-text-metrics.mjs`

```js
#!/usr/bin/env node
// T1.1:汇总 NATIVE/LEGACY 文本度量探针 → meta.json.text_metrics(决定文本溢出 invariant 门禁形态)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const PROBE_DIR = `${ROOT}/demo-android/app/build/text-metrics`;
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;

function probe(name) {
  const p = `${PROBE_DIR}/${name}`;
  if (!existsSync(p)) { console.error(`missing probe: ${p}`); process.exit(1); }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const nc = probe('native-compose.json');
const nt = probe('native-textview.json');
const lc = probe('legacy-compose.json');
const lt = probe('legacy-textview.json');

const gate = nc.hasVisualOverflow === true && nt.ellipsisCount > 0 ? 'hard-gate' : 'advisory';

const meta = JSON.parse(readFileSync(META, 'utf8'));
meta.text_metrics = {
  task: 'T1.1',
  robolectric: '4.16',
  graphics_mode_pinned: 'NATIVE',
  native: { hasVisualOverflow: nc.hasVisualOverflow, textViewEllipsisCount: nt.ellipsisCount },
  legacy: {
    hasVisualOverflow: lc.hasVisualOverflow,
    textViewEllipsisCount: lt.ellipsisCount,
    errors: [lc.error, lt.error].filter(Boolean),
  },
  text_overflow_invariant: gate, // hard-gate: T1.3/T3.4 可进硬门禁;advisory: 永久 advisory(设计文档 CS1/CS2)
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(`text_overflow_invariant = ${gate}`);
process.exit(gate === 'hard-gate' ? 0 : 2);
```

运行:

```bash
node /Users/zhuxi/AI/magpie_eye/scripts/record-text-metrics.mjs
echo "exit=$?"
```

预期(证实分支):`text_overflow_invariant = hard-gate`、`exit=0`。exit 2 = advisory 分支 → 结论如实落档(脚本已写入),同时将"CS1/CS2 证伪,文本溢出 invariant 定为 advisory"提交 Codex 确认。

同时在 `docs/calibration.md` 末尾追加(advisory 分支把结论行改为 advisory 并注明实测值):

```markdown
## NATIVE 文本度量钉版本(T1.1,CS1/CS2)

- Robolectric 4.16 `@GraphicsMode(NATIVE)` sdk=36:Compose `hasVisualOverflow==true`(超长串+maxLines=1)、真 TextView measure+layout 后 `getEllipsisCount>0` —— 均实测通过
- LEGACY 对照:探针值见 meta.json.text_metrics.legacy(伪造测量,不可用)
- 结论:文本溢出/截断两项 L2-invariant 可进硬门禁(text_overflow_invariant=hard-gate),约束条件:NATIVE + sdk>=26 钉死
```

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: CS1/CS2 结论落 meta.json.text_metrics 与 calibration.md(text_overflow_invariant 定档)"
```

---

**T1.1.13 离线复跑验收(约 5 分钟)**

android-all jar 已在 T1.1.4 预热进 `~/.m2`;拷入工程本地目录后断网形态复跑全部测试:

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
mkdir -p .robolectric-deps
find "$HOME/.m2/repository/org/robolectric" -name 'android-all-instrumented-*.jar' -exec cp {} .robolectric-deps/ \;
ls .robolectric-deps/
./gradlew --offline :app:testDebugUnitTest \
  -Drobolectric.offline=true \
  -Drobolectric.dependency.dir="$PWD/.robolectric-deps" \
  -Proborazzi.test.record=true --rerun
echo "offline-exit=$?"
```

预期:`ls` 至少列出 1 个 `android-all-instrumented-...jar`;`BUILD SUCCESSFUL`、`offline-exit=0`(convention plugin 已把两个 `-D` 透传进 test worker,这是本步能通过的关键)。失败 = 环境类失败:检查 `.gradle-home` 依赖缓存是否完整(可先在线重跑一次 `:app:testDebugUnitTest` 再重试),仍失败回 Codex。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: 离线复跑验收通过(--offline + robolectric.offline=true + 本地 dependency.dir)"
```

---

**T1.1.14 暖/冷单轮延迟实测(约 3 分钟写脚本 + 实测运行数分钟)**

`/Users/zhuxi/AI/magpie_eye/scripts/measure-latency.sh`

```bash
#!/usr/bin/env bash
# T1.1:暖/冷 Gradle 下单 preview 截图测试端到端延迟(设计文档第 8 节 Day 1;冷=冷 daemon,非冷缓存)
set -euo pipefail
DEMO="$(cd "$(dirname "$0")/../demo-android" && pwd)"
DOCS="$(cd "$DEMO/.." && pwd)/docs"
cd "$DEMO"
export GRADLE_USER_HOME="$DEMO/.gradle-home"

now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }
run_once() {
  ./gradlew "$@" :app:testDebugUnitTest \
    --tests 'com.magpie.uiv.demo.CalibCardScreenshotTest' \
    -Proborazzi.test.record=true --rerun >/dev/null
}

# 冷:daemon 全停 + --no-daemon
./gradlew --stop >/dev/null 2>&1 || true
t0=$(now_ms); run_once --no-daemon; t1=$(now_ms); COLD=$((t1 - t0))

# 暖:先空跑起 daemon,再测 3 轮
./gradlew help >/dev/null 2>&1
WARM=()
for i in 1 2 3; do
  t0=$(now_ms); run_once; t1=$(now_ms); WARM+=("$((t1 - t0))")
done

printf '{"cold_ms":%d,"warm_ms":[%d,%d,%d]}\n' "$COLD" "${WARM[0]}" "${WARM[1]}" "${WARM[2]}" \
  | tee "$DOCS/latency-t1.1.json"
```

`/Users/zhuxi/AI/magpie_eye/scripts/record-latency.mjs`

```js
#!/usr/bin/env node
// T1.1:延迟实测 → meta.json.latency_baseline(内循环预算以此为准,设计文档"先实测、再定预算")
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;
const data = JSON.parse(readFileSync(`${ROOT}/docs/latency-t1.1.json`, 'utf8'));
const sorted = [...data.warm_ms].sort((a, b) => a - b);

const meta = JSON.parse(readFileSync(META, 'utf8'));
meta.latency_baseline = {
  task: 'T1.1',
  scenario: 'testDebugUnitTest --tests CalibCardScreenshotTest --rerun (record)',
  cold_no_daemon_ms: data.cold_ms,
  warm_daemon_ms: data.warm_ms,
  warm_p50_ms: sorted[Math.floor(sorted.length / 2)],
  measured_at: new Date().toISOString().slice(0, 10),
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta.latency_baseline));
```

运行:

```bash
chmod +x /Users/zhuxi/AI/magpie_eye/scripts/measure-latency.sh
/Users/zhuxi/AI/magpie_eye/scripts/measure-latency.sh
node /Users/zhuxi/AI/magpie_eye/scripts/record-latency.mjs
```

预期:`docs/latency-t1.1.json` 落盘;`meta.json.latency_baseline` 写入,stdout 打印该对象。参考区间(C6 修正后):warm 10~30s、cold(--no-daemon)60~180s;**超出区间不算失败,如实记录即为验收**——该数据是 M2 "P50 ≤ Phase 0 实测值 60%" 的分母。

commit:

```bash
git -C /Users/zhuxi/AI/magpie_eye add -A
git -C /Users/zhuxi/AI/magpie_eye commit -m "T1.1: 暖/冷单轮延迟实测落 meta.json.latency_baseline 与 docs/latency-t1.1.json"
```

---

**T1.1.15 收尾:全量绿 + meta.json 任务状态(约 3 分钟)**

```bash
cd /Users/zhuxi/AI/magpie_eye/demo-android
export GRADLE_USER_HOME="$PWD/.gradle-home"
./gradlew :app:testDebugUnitTest -Proborazzi.test.record=true --rerun
echo "final-exit=$?"

cd /Users/zhuxi/AI/magpie_eye
node -e '
const fs = require("fs");
const p = "/Users/zhuxi/AI/magpie_eye/.claude/plans/magpie-eye-full-impl/meta.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.tasks = m.tasks || {};
m.tasks["T1.1"] = { status: "done", last_commit: process.argv[1] };
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
console.log("tasks[T1.1] =", JSON.stringify(m.tasks["T1.1"]));
' "$(git rev-parse HEAD)"
git add -A && git commit -m "T1.1: 任务完成,meta.json 状态 done(demo 工程+延迟基线+NATIVE 文本度量钉版本)"
```

预期:`final-exit=0`(6 个测试类全绿:ConfigPinning / CalibCardScreenshot / PreviewScanner / NativeTextMetrics×2 / LegacyProbe×2);meta.json 打印 done。

#### 验收清单(对照编排计划 M1 表 T1.1,全部可机判)

| # | 验收项 | 命令 | 判据 |
|---|--------|------|------|
| 1 | 截图测试出 PNG | `./gradlew :app:testDebugUnitTest --tests '*CalibCardScreenshotTest' -Proborazzi.test.record=true --rerun && test -f app/build/outputs/roborazzi/CalibCard.png` | exit 0 |
| 2 | 离线重跑 | T1.1.13 的 `--offline -Drobolectric.offline=true ...` 命令 | exit 0 |
| 3 | T1.0b 标定 | `node scripts/check-t10b.mjs` | exit 0 且 `meta.json.calibration_render.density_aligned == true` |
| 4 | CS1/CS2 结论落档 | `node -e 'const m=require(".../meta.json"); process.exit(m.text_metrics && m.latency_baseline ? 0 : 1)'` | exit 0(`text_overflow_invariant` 为 `hard-gate` 或经 Codex 确认的 `advisory`) |
| 5 | commit 纪律 | `git log --oneline --grep='^T1.1'` | 非空,末条为收尾 commit |

#### 风险与分支处理

- **CS1/CS2 任一证伪**(T1.1.9/T1.1.10 红):去断言留 probe → `text_overflow_invariant=advisory` → 回 Codex 决断,T1.3 的文本溢出 invariant 永久 advisory;不阻塞 T1.1 其余步骤。
- **T1.0b 未对齐**(T1.1.7 exit 1):口径类失败,冻结 T1.2 开工,连同 `meta.json.calibration` 与 `calibration_render` 全量数据回 Codex。
- **roborazzi#830 / robolectric#10909**:已通过"纯 Android module + 零自定义 shadow(不引 robolectric-processor)"在结构上规避,若仍现构建间歇故障按环境类失败重试一次后回 Codex。
- **依赖解析冲突**(androidx.test 1.7.0/1.3.0 与 BOM 冲突):仅允许升 patch 版并把实际解析版本回写 `libs.versions.toml` 与本节表格,不得改 Roborazzi/Robolectric/CPS/AGP 主版本。

---

### Task T1.2 — uiv CLI 骨架：baseline pull（fixture 模式）+ check + L1 advisory + report.json v0

**前置**：T1.1 已完成（`demo-android/` 工程可离线跑 `./gradlew testDebugUnitTest`，卡片截图测试 FQN 为 `com.magpie.uiv.demo.CalibCardScreenshotTest`，@Preview FQN 为 `com.magpie.uiv.demo.CalibCardPreview`，模块 `app`）；T1.0a 标定值已落 `meta.json.calibration`。
**产出**：`packages/uiv-core` 新增 figma 归一化器 / FigmaClient 接口 / L1 引擎 / report v0 校验器 / pull&check 核心函数；`packages/uiv-cli` 接线两个子命令。
**验收（可机判）**：`npm test` exit 0（含 C3 六边界 + schema 校验单测）；`node packages/uiv-cli/dist/index.js check ...` 端到端 exit 码正确且最后一行为 report.json 绝对路径；`git ls-files` 含 `.ui-verify/mapping.json` 与 `baselines/**`。

**口径约定（本任务内钉死，后续任务引用不重议）**：

| 项 | 约定 |
|---|---|
| 输出根 | 一律 cwd 下 `.ui-verify/`（`baselines/` `renders/` `reports/` `mapping.json` `ignore-regions.json` `state.json`） |
| 基准目录名 | `<nodeId 中 ':'→'-'>@<version>`，如 `1-100@T1_0A_V1`（macOS 路径避 `:`）；mapping.json 内保留原 id |
| baseline.png 来源 | fixture 模式下 REST images 通道不可用：**主会话在跑 `uiv check` 前，经 desktop MCP `get_screenshot`（2x）把 PNG 落盘至 `.ui-verify/baselines/<dir>/baseline.png`**；`baseline pull` 只校验存在性，缺失打 `WARN baseline.png missing: <绝对路径>` 但 exit 0；check 时缺失则 `pixel: null`（L1 本就 advisory） |
| v0 的 pass 语义 | v0 无 L2。`pass = 渲染管线成功`（gradle exit 0 且 rendered.png 收集到）；compileError 非空或收集失败 → `pass:false`。L1 结果只进 `pixel` 字段不进判定 |
| fixture 几何 | 与 Canonical Calibration Contract 节点表逐字段一致：根 FRAME `1:100` CalibCard 360×200（画布 (100,100)）、cornerRadius 8、fill `#3366CC`；TEXT `1:101` CalibTitle "Calibration Card" fontSize 16；TEXT `1:102` CalibSubtitle "Known geometry fixture" fontSize 12；RECTANGLE `1:103` CalibSwatch 80×40 `#FF9900`；RECTANGLE `1:104` CalibBadge 52×20 `#FF3B30` cornerRadius 10；version 固定 `T1_0A_V1` |
| commit | 每步一 commit，message 前缀 `T1.2:` |

---

**Step 1（约 3 min）安装依赖并确认基线绿**

```bash
cd /Users/zhuxi/AI/magpie_eye
npm install --save-dev pngjs @types/pngjs
npm install --workspace packages/uiv-core odiff-bin looks-same
npm test
```
预期：安装 exit 0；`npm test` 全绿（T0.3 存量测试）。
`git add -A && git commit -m "T1.2: add odiff-bin/looks-same/pngjs deps"`

---

**Step 2（约 5 min）spec 类型 + 归一化器 happy path（TDD）**

新建 `packages/uiv-core/src/figma/types.ts`：

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface SpecNode {
  id: string; name: string; type: string; visible: boolean;
  bbox: Rect | null;                 // 已减根 frame 绝对原点；1 Figma 单位=1dp(T1.0a)
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  padding: { l: number; t: number; r: number; b: number };
  itemSpacing: number;
  cornerRadii: [number, number, number, number] | null;
  fills: Array<{ type: string; hex: string | null; opacity: number }>;
  text: { characters: string; fontSize: number; fontWeight: number;
          overrides: Array<{ start: number; end: number; style: Record<string, unknown> }> } | null;
  children: SpecNode[];
}
export interface Spec { specVersion: 0; fileKey: string; nodeId: string; version: string; root: SpecNode }
export class FigmaSpecInvalidError extends Error {}
```

新建 fixture `packages/uiv-core/fixtures/rest-nodes-card.json`（REST `GET /v1/files/:key/nodes?ids=1:100` 形状，与 Canonical Calibration Contract 逐字段一致）：

```json
{ "name": "uiv-calibration", "version": "T1_0A_V1",
  "nodes": { "1:100": { "document": {
    "id": "1:100", "name": "CalibCard", "type": "FRAME",
    "absoluteBoundingBox": { "x": 100, "y": 100, "width": 360, "height": 200 },
    "cornerRadius": 8,
    "fills": [{ "type": "SOLID", "color": { "r": 0.2, "g": 0.4, "b": 0.8, "a": 1 } }],
    "children": [
      { "id": "1:101", "name": "CalibTitle", "type": "TEXT",
        "absoluteBoundingBox": { "x": 112, "y": 112, "width": 200, "height": 20 },
        "characters": "Calibration Card",
        "style": { "fontFamily": "Inter", "fontSize": 16, "fontWeight": 400 },
        "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1, "a": 1 } }],
        "children": [] },
      { "id": "1:102", "name": "CalibSubtitle", "type": "TEXT",
        "absoluteBoundingBox": { "x": 112, "y": 136, "width": 200, "height": 16 },
        "characters": "Known geometry fixture",
        "style": { "fontFamily": "Inter", "fontSize": 12, "fontWeight": 400 },
        "fills": [{ "type": "SOLID", "color": { "r": 0.8, "g": 0.878, "b": 1, "a": 1 } }],
        "children": [] },
      { "id": "1:103", "name": "CalibSwatch", "type": "RECTANGLE",
        "absoluteBoundingBox": { "x": 112, "y": 160, "width": 80, "height": 40 },
        "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 0.6, "b": 0, "a": 1 } }],
        "children": [] },
      { "id": "1:104", "name": "CalibBadge", "type": "RECTANGLE",
        "absoluteBoundingBox": { "x": 396, "y": 112, "width": 52, "height": 20 },
        "cornerRadius": 10,
        "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 0.231, "b": 0.188, "a": 1 } }],
        "children": [] }
    ] } } } }
```

新建 `packages/uiv-core/src/figma/normalize.test.ts`（先写失败测试）：

```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { normalizeNodesResponse } from './normalize.js';
const raw = JSON.parse(readFileSync(new URL('../../fixtures/rest-nodes-card.json', import.meta.url), 'utf8'));
describe('normalize happy path', () => {
  it('产出 re-base 后的 spec 树(canonical 5 节点)', () => {
    const s = normalizeNodesResponse(raw, 'FKEY', '1:100');
    expect(s.version).toBe('T1_0A_V1');
    expect(s.root.bbox).toEqual({ x: 0, y: 0, w: 360, h: 200 });      // 减根原点(100,100)
    expect(s.root.fills[0].hex).toBe('#3366CC');
    expect(s.root.cornerRadii).toEqual([8, 8, 8, 8]);
    const [title, subtitle, swatch, badge] = s.root.children;
    expect(title.bbox).toEqual({ x: 12, y: 12, w: 200, h: 20 });
    expect(title.text?.fontSize).toBe(16);
    expect(subtitle.bbox).toEqual({ x: 12, y: 36, w: 200, h: 16 });
    expect(subtitle.text?.fontSize).toBe(12);
    expect(swatch.bbox).toEqual({ x: 12, y: 60, w: 80, h: 40 });
    expect(swatch.fills[0].hex).toBe('#FF9900');
    expect(badge.bbox).toEqual({ x: 296, y: 12, w: 52, h: 20 });
    expect(badge.cornerRadii).toEqual([10, 10, 10, 10]);
  });
  it('nodeId 不存在时抛 FigmaSpecInvalidError', () =>
    expect(() => normalizeNodesResponse(raw, 'FKEY', '9:9')).toThrow(/9:9/));
});
```

`npx vitest run packages/uiv-core/src/figma` → 预期红（模块不存在）。
实现 `normalize.ts`：`export function normalizeNodesResponse(raw: unknown, fileKey: string, nodeId: string): Spec`，递归 `walk(node, rootOrigin)`，字段规则如下表（**逐条实现，无兜底 any**）：

| REST 字段 | spec 字段 | 规则 |
|---|---|---|
| `absoluteBoundingBox` | `bbox` | `null`/缺失 → `null`；否则 `{x: ab.x-root.x, y: ab.y-root.y, w: width, h: height}` |
| `rectangleCornerRadii` / `cornerRadius` | `cornerRadii` | 前者存在直接用（四元组）；仅后者时展开 `[r,r,r,r]`；均无 → `null` |
| `layoutMode` | `layoutMode` | 白名单 `HORIZONTAL/VERTICAL/GRID` 原样透传，缺失/其他 → `'NONE'`（禁止 switch 漏 GRID） |
| `paddingLeft/Top/Right/Bottom`,`itemSpacing` | `padding`,`itemSpacing` | `?? 0` |
| `fills[]` | `fills` | `SOLID`：`color.{r,g,b}`×255 四舍五入转 `#RRGGBB` 大写，`opacity = fill.opacity ?? color.a ?? 1`；非 SOLID：`hex: null` |
| `characters`+`style`+`characterStyleOverrides`+`styleOverrideTable` | `text` | 非 TEXT → `null`；overrides 数组逐字符映射 table key，**连续相同 key 合并为 `[start,end)` 区段**，key `0` 或缺失表示无覆盖跳过 |
| `visible` | `visible` | `?? true` |

再跑 → 绿。`git add -A && git commit -m "T1.2: figma nodes normalizer happy path"`

---

**Step 3（约 5 min）C3 六边界单测（TDD，先红后绿）**

追加 `normalize.test.ts` describe `C3 boundaries`。每条用例内联构造最小 REST-shape 对象（复制 happy fixture 后改动指定字段）。第 1 条完整示例：

```ts
it('C3-1 absoluteBoundingBox null 不抛错且 bbox=null', () => {
  const r = structuredClone(raw);
  r.nodes['1:100'].document.children[0].absoluteBoundingBox = null;
  const s = normalizeNodesResponse(r, 'FKEY', '1:100');
  expect(s.root.children[0].bbox).toBeNull();
});
```

其余五条按下表逐一编写（同构模式：clone→改字段→断言）：

| 用例 | fixture 改动 | 关键断言 |
|---|---|---|
| C3-2 四角不同 | 根节点删 `cornerRadius`，加 `rectangleCornerRadii:[8,8,0,0]` | `cornerRadii` 等于 `[8,8,0,0]` |
| C3-3 混排 overrides | TEXT 加 `characterStyleOverrides:[0,0,1,1]`、`styleOverrideTable:{"1":{"fontSize":20}}` | `text.overrides` 等于 `[{start:2,end:4,style:{fontSize:20}}]` |
| C3-4 GRID | 根 `layoutMode:"GRID"` | `layoutMode==='GRID'`（不得归入 NONE、不抛错） |
| C3-5 padding 缺省+显式 | canonical 根节点本就无 padding/`itemSpacing` 字段(缺省路径);克隆件根节点加 `paddingLeft/Top/Right/Bottom:12`、`itemSpacing:8`(显式路径,独立小 fixture 改动) | 原件 `padding` 全 0 且 `itemSpacing===0`;克隆件 `padding` 全 12 且 `itemSpacing===8` |
| C3-6 images null | 见 Step 4（`pickImageUrl`） | 抛 `FigmaImageNullError` 且 message 含 nodeId |

跑红 → 补实现（C3-3 的区段合并、C3-6 见下步）→ 跑绿。
`git commit -am "T1.2: C3 six boundary tests for normalizer"`

---

**Step 4（约 4 min）FigmaClient 接口化 + fixture 客户端 + images-null 边界**

新建 `packages/uiv-core/src/figma/client.ts`：

```ts
export interface FigmaClient {
  getNodes(fileKey: string, nodeId: string): Promise<unknown>;   // GET /v1/files/:key/nodes 形状
  getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>>;
}
export class FigmaImageNullError extends Error {}
export function pickImageUrl(images: Record<string, string | null>, nodeId: string): string {
  const url = images[nodeId];
  if (url == null) throw new FigmaImageNullError(`images API returned null for ${nodeId} (render failed, retry later)`);
  return url;
}
export class FixtureFigmaClient implements FigmaClient {
  constructor(private fixturePath: string) {}
  async getNodes() { return JSON.parse(await readFile(this.fixturePath, 'utf8')); }
  async getImages(): Promise<Record<string, string | null>> {
    return {};   // fixture 模式无 images 通道；baseline.png 走 MCP 落盘约定
  }
}
```

`client.test.ts` 三条：① `FixtureFigmaClient.getNodes()` 返回值可被 `normalizeNodesResponse` 消化（version=`T1_0A_V1`）；② `pickImageUrl({'1:100':'https://x/y.png'},'1:100')` 返回 url；③ **C3-6**：`pickImageUrl({'1:100':null},'1:100')` 抛 `FigmaImageNullError` 且 `/1:100/` 命中 message。红→实现→绿。
`git commit -am "T1.2: FigmaClient interface + fixture client + C3-6 image-null"`

---

**Step 5（约 5 min）report.json v0 手写校验器（TDD）**

新建 `packages/uiv-core/src/report/v0.ts`：

```ts
export interface Cluster { x: number; y: number; w: number; h: number }
export interface PixelResult { diffRatio: number; diffCount: number; clusters: Cluster[] }
export interface ReportV0 {
  schemaVersion: 0;
  pass: boolean;
  reason: 'inconclusive' | null;
  subReason: 'render_harness_error' | 'figma_spec_invalid' | null;
  compileError: string | null;
  pixel: PixelResult | null;                       // advisory,不参与 pass
  artifacts: { baseline: string | null; render: string | null; diff: string | null };
}
export function validateReportV0(x: unknown): ReportV0;  // 非法时抛 Error,message 含首个坏字段路径
```

校验器手写（不引 zod，v0 字段少）：逐字段类型检查 + reason/subReason 枚举检查 + 组合约束 **`reason==='inconclusive' ⇒ subReason 非 null`** 与 **`pass===true ⇒ compileError===null && reason===null`**。
`v0.test.ts` 用例表（先红）：

| 用例 | 输入 | 断言 |
|---|---|---|
| 合法通过件 | pass:true 全空错误字段 + pixel 对象 | 原样返回 |
| 合法失败件 | pass:false + compileError:"e: CalibCard.kt:5 unresolved" | 原样返回 |
| 缺字段 | 删 `artifacts` | 抛 `/artifacts/` |
| 枚举违规 | subReason:"whatever" | 抛 `/subReason/` |
| 组合违规 | reason:'inconclusive' + subReason:null | 抛 `/subReason/` |
| pass 组合违规 | pass:true + compileError 非空 | 抛 `/compileError/` |

红→实现→绿。`git commit -am "T1.2: report.json v0 schema + handwritten validator"`

---

**Step 6（约 5 min）L1 引擎 + ignore-region 持久化（TDD）**

新建 `packages/uiv-core/src/l1/engine.ts`：

```ts
import { compare } from 'odiff-bin';
import looksSame from 'looks-same';
export interface IgnoreRegion { x: number; y: number; w: number; h: number }
export async function runL1(baselinePng: string, renderedPng: string, diffOut: string,
                            ignore: IgnoreRegion[]): Promise<PixelResult> {
  const r = await compare(baselinePng, renderedPng, diffOut, {
    threshold: 0.063, antialiasing: true,
    ignoreRegions: ignore.map(g => ({ x1: g.x, y1: g.y, x2: g.x + g.w, y2: g.y + g.h })),
  });
  const diffCount = r.match ? 0 : (r as { diffCount: number }).diffCount;
  const diffRatio = r.match ? 0 : (r as { diffPercentage: number }).diffPercentage / 100;
  const ls = await looksSame(baselinePng, renderedPng, { shouldCluster: true, clustersSize: 10 });
  const clusters = (ls.diffClusters ?? []).map(c =>
    ({ x: c.left, y: c.top, w: c.right - c.left + 1, h: c.bottom - c.top + 1 }));
  return { diffRatio, diffCount, clusters };
}
```

同文件旁 `ignore.ts`：`loadIgnoreRegions(uiVerifyDir, nodeId): IgnoreRegion[]` / `addIgnoreRegion(uiVerifyDir, nodeId, r): void`，持久化格式 `.ui-verify/ignore-regions.json` = `{ "<nodeId>": [{x,y,w,h}] }`（文件不存在视为空表）。
`engine.test.ts`：beforeAll 用 pngjs 生成三张 64×64 临时 PNG——`base`（纯白）、`same`（纯白）、`diff`（左上 16×16 涂红）：

| 用例 | 断言 |
|---|---|
| 相同图 | `diffCount===0 && clusters.length===0` |
| 不同图 | `diffCount>0 && diffRatio>0`；`clusters.length>=1` 且首簇与 (0,0,16,16) 相交 |
| ignore 覆盖差异区 | 传 `[{x:0,y:0,w:16,h:16}]` 后 `diffCount===0`（odiff 指标归零；looks-same 簇仍报，属 advisory 说明写进注释） |
| 持久化往返 | `addIgnoreRegion` 两次 → `loadIgnoreRegions` 返回长度 2 且 JSON 文件存在 |

红→实现→绿。`git commit -am "T1.2: L1 odiff+looks-same engine with ignore-regions persistence"`

---

**Step 7（约 5 min）baseline pull 核心函数（TDD）**

新建 `packages/uiv-core/src/baseline/pull.ts`：

```ts
export interface PullResult { specPath: string; baselinePngPath: string; baselinePngExists: boolean; mappingPath: string }
export function baselineDirName(nodeId: string, version: string): string {
  return `${nodeId.replaceAll(':', '-')}@${version}`;
}
export async function pullBaseline(client: FigmaClient, fileKey: string, nodeId: string,
                                   uiVerifyDir: string): Promise<PullResult>;
```

行为：`getNodes` → `normalizeNodesResponse` → 写 `baselines/<dir>/spec.json`（pretty 2 空格）；探测同目录 `baseline.png` 存在性；读改写 `mapping.json`（数组，按 `fileKey+nodeId` upsert 条目 `{fileKey, nodeId, version, minScore: 0.9, matrix: 'default5'}`）。
`pull.test.ts`（tmpdir + FixtureFigmaClient）：① spec.json 落盘且 `JSON.parse` 后 `root.bbox.w===360`；② 目录名为 `1-100@T1_0A_V1`；③ `baselinePngExists===false`（未落盘时）；④ mapping.json 含 upsert 条目、重复 pull 不产生重复条目（length===1）。红→实现→绿。
`git commit -am "T1.2: baseline pull core (fixture mode) writes spec.json + mapping.json"`

---

**Step 8（约 5 min）check 核心函数（TDD，注入 runner 免真实 gradle）**

新建 `packages/uiv-core/src/check/run.ts`：

```ts
export interface GradleRunner {          // 生产实现用 node:child_process.spawn
  run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }>;
}
export interface CheckOpts { demoDir: string; testFqn: string; nodeId: string; version: string; uiVerifyDir: string }
export async function runCheck(runner: GradleRunner, opts: CheckOpts): Promise<{ report: ReportV0; reportPath: string }>;
```

固定 gradle 参数：`['testDebugUnitTest', '--tests', opts.testFqn, '-Proborazzi.test.compare=true']`，cwd=`opts.demoDir`。流程：exit≠0 且 stderr 匹配 `/^e: |Compilation error/m` → `compileError=stderr 截取匹配段, pass:false`；exit≠0 其他 → `reason:'inconclusive', subReason:'render_harness_error'`；exit 0 → 在 `demoDir/app/build/outputs/roborazzi/` 递归找文件名含组件短名（测试类短名去 `ScreenshotTest` 后缀，即 `CalibCard`）的最新 `.png`，复制为 `renders/<nodeDir>/rendered.png`，找不到同判 `render_harness_error`；baseline.png 存在则调 `runL1`（ignore regions 经 `loadIgnoreRegions` 注入）填 `pixel`，否则 `pixel:null`；`validateReportV0` 后写 `reports/<nodeDir>/report.json`。
`run.test.ts` 用 FakeRunner（预置 exitCode/stderr，exit 0 分支由测试预先在 outputs 目录种一张 pngjs 生成的 PNG）：

| 用例 | FakeRunner 返回 | 断言 |
|---|---|---|
| 编译失败 | exit 1, stderr 含 `e: CalibCard.kt:5: unresolved` | `compileError` 含该行、`pass:false`、`subReason:null` |
| 挽具失败 | exit 1, stderr 无编译特征 | `reason:'inconclusive'`+`subReason:'render_harness_error'` |
| 成功无基准 | exit 0 + 种 PNG | `pass:true`、`pixel:null`、rendered.png 已复制 |
| 成功有基准 | exit 0 + 种 PNG + 种 baseline.png | `pixel` 非空且过 `validateReportV0` |

红→实现→绿。`git commit -am "T1.2: uiv check core with injectable gradle runner"`

---

**Step 9（约 5 min）CLI 接线 + 行为约定**

重写 `packages/uiv-cli/src/index.ts`（手写 argv 解析，不引 commander）：子命令 `baseline pull --fixture <path> --file <fileKey> --node <nodeId>` 与 `check --preview <PreviewFQN> --node <nodeId> --demo <dir> [--ignore-region x,y,w,h]`。约定：`uiVerifyDir = path.resolve(process.cwd(), '.ui-verify')`；`--preview` 到 gradle 测试 FQN 的映射写死为 `<pkg>.<Name>Preview → --tests <pkg>.<Name>ScreenshotTest`（Phase 0 即 `com.magpie.uiv.demo.CalibCardPreview` → `--tests com.magpie.uiv.demo.CalibCardScreenshotTest`），CLI 求出 testFqn 后传 `runCheck`（core 接口不变）；`--ignore-region` 先 `addIgnoreRegion` 持久化再执行；**stdout 最后一行 = report.json（pull 为 spec.json）绝对路径**；`process.exitCode = report.pass ? 0 : 1`（pull 恒 0，baseline.png 缺失打 WARN 行）。生产 `GradleRunner` 用 `spawn('./gradlew', args, { cwd, env: { ...process.env, GRADLE_USER_HOME: path.join(demoDir, '.gradle-home') } })`。
验证（先构建再实跑，无单测、以端到端命令为验收）：

```bash
npm run build && cd /Users/zhuxi/AI/magpie_eye
node packages/uiv-cli/dist/index.js baseline pull \
  --fixture packages/uiv-core/fixtures/rest-nodes-card.json --file FKEY --node 1:100
# 预期: WARN baseline.png missing: .../baselines/1-100@T1_0A_V1/baseline.png
#       最后一行 /Users/zhuxi/AI/magpie_eye/.ui-verify/baselines/1-100@T1_0A_V1/spec.json ; echo $? → 0
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview \
  --node 1:100 --demo demo-android
# 预期: 真实 gradle 跑通,最后一行 .../.ui-verify/reports/1-100@T1_0A_V1/report.json ; echo $? → 0
cat .ui-verify/reports/1-100@T1_0A_V1/report.json   # pass:true, pixel:null(基准 PNG 未落盘)
```

`git add -A && git commit -m "T1.2: wire uiv CLI baseline-pull/check, .ui-verify conventions"`

---

**Step 9b（约 4 min）端到端：L1 严格 advisory 证明（有基准/坏基准两跑）**

存在 baseline.png 时跑 check：断言 report.json 含 `pixel` 字段（`diffRatio` 数值），且 pass/exit code 与 pixel 内容无关——把 baseline 换成全黑图重跑，pass 不变、`pixel.diffRatio` 变大：

```bash
cd /Users/zhuxi/AI/magpie_eye
B=.ui-verify/baselines/1-100@T1_0A_V1/baseline.png
# 已有真实 MCP baseline 则先备份、结束后恢复(防删验收资产,Codex 复审建议)
[ -f "$B" ] && cp "$B" "$B.bak"
# 第一跑:用 Step 9 产出的 rendered.png 充当 baseline(同图 → diffRatio≈0)
cp .ui-verify/renders/1-100@T1_0A_V1/rendered.png "$B"
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview \
  --node 1:100 --demo demo-android; echo "exit1=$?"
node -e 'const r=require("/Users/zhuxi/AI/magpie_eye/.ui-verify/reports/1-100@T1_0A_V1/report.json");
if(typeof (r.pixel&&r.pixel.diffRatio)!=="number")process.exit(1);
console.log("pass1="+r.pass,"diffRatio1="+r.pixel.diffRatio);'
# 第二跑:baseline 换成同尺寸全黑图(像素差拉满),pass/exit 不得变化
node -e 'const {PNG}=require("pngjs");const fs=require("fs");
const png=new PNG({width:720,height:400});
for(let i=3;i<png.data.length;i+=4)png.data[i]=255; // 全黑不透明
fs.writeFileSync("/Users/zhuxi/AI/magpie_eye/.ui-verify/baselines/1-100@T1_0A_V1/baseline.png",PNG.sync.write(png));'
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview \
  --node 1:100 --demo demo-android; echo "exit2=$?"
node -e 'const r=require("/Users/zhuxi/AI/magpie_eye/.ui-verify/reports/1-100@T1_0A_V1/report.json");
console.log("pass2="+r.pass,"diffRatio2="+r.pixel.diffRatio);
process.exit(r.pass===true&&r.pixel.diffRatio>0.5?0:1);'
if [ -f "$B.bak" ]; then mv "$B.bak" "$B"; else rm "$B"; fi   # 有真实 baseline 则恢复;否则删临时全黑图,免混入 Step 10 基准资产
```

预期：`exit1=0` 且 `exit2=0`（exit code 与 pixel 内容无关）；`pass1=true diffRatio1≈0`、`pass2=true diffRatio2>0.5`（diffRatio 变大而 pass/exit 不变）——机判证明 L1 严格 advisory、不参与 v0 判定。任一不符 → L1 混进了判定路径，属口径违规，回 Codex。本步为纯验证步、无新增源文件，不单独 commit（运行产物由 Step 10 的 .gitignore 排除）。

---

**Step 10（约 3 min）资产入库 + 状态收尾**

1. `.gitignore` 追加（保留基准资产，忽略运行产物）：

```gitignore
.ui-verify/renders/
.ui-verify/reports/
.ui-verify/state.json
```

2. `git add .ui-verify/mapping.json .ui-verify/baselines/` → `git ls-files .ui-verify` 须列出 mapping.json 与 spec.json。
3. `meta.json`：`tasks.T1.2 = {status:"awaiting_review", last_commit:"<hash>"}`；`pending_followups[]` 追加 `"PAT 到位后重录 REST fixture 并复跑 T1.2 验收(含 /v1/images 真实通道替代 MCP 落盘)"`。
4. 总验收复跑：`npm test`（预期全绿，含归一化 8 条 + client 3 条 + report 6 条 + L1 4 条 + pull 4 条 + check 4 条）。
`git commit -am "T1.2: track baseline assets, register PAT followup, task done"`

---

### Task T1.3 — semantics-exporter + L2 v0 + 防震荡(设计文档第 8 节 Day 3)

**前置**:T1.1(demo-android 可跑截图测试,density 钉死 xhdpi=2.0)、T1.2(uiv check 骨架 + report.json v0 + baselines/spec.json fixture)已 done。
**产物**:demo-android `SemanticsDumpRule.kt`;uiv-core `src/l2/`(9 个模块);report.json v1;`.ui-verify/state.json` 防震荡。
**验收(可机判)**:`npm test` exit 0 且覆盖下列全部用例;故意写偏卡片经 `uiv check` 输出含 fontSize 违规的 violations;score/pass/防震荡单测与设计文档 2.4 节、设计原则 2 逐项对照(测试名即文档条目)。

#### 模块结构与接口(先钉死)

```
packages/uiv-core/src/l2/
  constants.ts  口径常量(唯一出处)
  types.ts      FigmaNode/SemNode/Violation/ReportV1/StateFile
  rebase.ts     rebase(root: FigmaNode): FigmaNode
  nodeset.ts    comparableNodes(root, ignoreRegions: Box[]): FigmaNode[]   // N
  join.ts       joinByTag(root: FigmaNode, dump: SemanticsDump)
                  : { pairs: Pair[]; missing: FigmaNode[]; extra: string[] }
  color.ts      labDeltaE(lab1, lab2): number; ciede2000(hexA, hexB): number
  assert.ts     assertPair(p: Pair): { violations: Violation[]; executed: number }
  metrics.ts    untaggedCoverage(n,N) / matchRate(m,N) / score(violations, executed)
                  // n/m 与分母 N 均只统计 N 中的叶子;容器(如 CalibCard)tag 命中不计入分子
  verdict.ts    verdict(input): { pass: boolean }
  stability.ts  stepState(prev: StateFile|null, cur): StateFile
  report.ts     makeHint(v, figmaName): string; runL2(spec, dump, opts): ReportV1
```

#### Step 1 — 口径常量 + 类型(约 3 分钟)

写 `constants.ts`(全文如下,数值不得改动)与 `types.ts`,并写常量快照测试防止后续步骤悄改口径。

```ts
// constants.ts —— 设计文档 2.4 节 + 设计原则 2 的代码化,唯一出处
export const DENSITY = 2.0;
export const TOL_POS_DP = 2;          // 位置/尺寸 L1 距离 ±2dp
export const TOL_FONT_SP = 0.5;       // 字号 ±0.5sp
export const TOL_DELTA_E = 3;         // 颜色 CIEDE2000 ΔE<3
export const EXACT_GRID_DP = 0.5;     // “精确比”=round 到 0.5dp 网格后相等(框架量化噪声上界)
export const SEVERITY_WEIGHT = { blocking: 1.0, high: 0.8, medium: 0.4, low: 0.1 } as const;
export const DEFAULT_BLOCKING_SEVERITIES: readonly string[] = ['blocking', 'high'];
export const DEFAULT_MIN_SCORE = 0.9;
export const UNTAGGED_COVERAGE_THRESHOLD = 0.9;
export const MATCH_RATE_FUSE = 0.8;
export const STAGNATION_TRIGGER = 2; // 连续停滞轮数→regression
export const ROUND_LIMIT = 5;
export const SCORE_BACKSLIDE_TOLERANCE = 0.02;
```

`types.ts` 关键类型(完整写死):

```ts
export interface Box { x: number; y: number; width: number; height: number }
export interface FigmaNode {
  id: string; name: string; type: string; visible?: boolean;
  absoluteBoundingBox: Box | null;
  paddingLeft?: number; paddingTop?: number; paddingRight?: number; paddingBottom?: number;
  itemSpacing?: number; cornerRadius?: number;
  fills?: { type: string; color?: { r: number; g: number; b: number; a: number } }[];
  style?: { fontSize?: number }; characters?: string; children?: FigmaNode[];
}
export interface SemNode {           // 全部 px,由 uiv-core 侧 ÷density 转 dp
  testTag: string | null; text: string | null;
  positionInRoot: { x: number; y: number }; size: { width: number; height: number };
  touchBoundsInRoot: { left: number; top: number; right: number; bottom: number };
  colorHex: string | null; fontSizeSp: number | null; cornerRadiusPx: number | null;
  children: SemNode[];
}
export interface SemanticsDump { density: number; root: SemNode }
export type Severity = 'blocking' | 'high' | 'medium' | 'low';
export interface Violation { judgePath: 'parity'; testTag: string; figmaName: string;
  property: string; expected: string; actual: string; severity: Severity; hint: string }
export interface StateFile { round: number; stagnation: number; regression: boolean;
  regressionReason: string | null;
  history: { round: number; blockingHits: number; score: number }[] }
```

测试 `constants.test.ts`:`expect(SEVERITY_WEIGHT).toEqual({blocking:1,high:0.8,medium:0.4,low:0.1})` 等逐常量断言。红→绿:`npx vitest run packages/uiv-core/src/l2/constants.test.ts`(先 `1 failed`,建文件后 `passed`)。`git commit -am "T1.3: L2 口径常量与类型(设计文档2.4节代码化)"`

#### Step 2 — Figma 坐标 re-base(设计文档 4 节坐标口径)

失败测试 `rebase.test.ts`:root bbox `{x:100,y:200,w:360,h:200}`,子节点 `{x:112,y:212,w:80,h:20}` → rebase 后 root=`{0,0,360,200}`、子=`{12,12,80,20}`;bbox 为 null 的节点保持 null。实现:深拷贝树,所有非 null bbox 减 root 原点。红→绿→`git commit -am "T1.3: rebase Figma absoluteBoundingBox 为相对坐标"`

#### Step 3 — 可比对节点集 N(2.4 节三类排除)

测试 `nodeset.test.ts` 用例(fixture 树含 8 叶子,每例一个 `it`,测试名引用文档原文):

| 用例 | 输入 | 期望 |
|---|---|---|
| 只取叶子 | 容器 FRAME 带 2 叶子 | N 不含容器 |
| `visible!==false` | 叶子 `visible:false` | 排除;`visible` 缺省视为可见 |
| 纯装饰 vector | `type:'VECTOR'`(及 `BOOLEAN_OPERATION`) | 排除,不展开内部 |
| ignore-region 覆盖 | 叶子 bbox 完全落入 `ignoreRegions[0]` | 排除;部分相交不排除 |
| bbox null | `absoluteBoundingBox:null` | 排除 |

实现 `comparableNodes`:DFS,先剪 visible/VECTOR 子树,叶子判定后过 ignore/null 过滤。红→绿→`git commit -am "T1.3: 可比对节点集N三类排除"`

#### Step 4 — testTag 确定性 join + px→dp

测试 `join.test.ts`:spec 叶子 id `1:101`/`1:102`/`1:103`;dump(density 2.0)含 tag `fig:1:101`(pos px `{24,24}`)、`fig:1:102`、多余 tag `fig:9:9`。断言:`pairs` 长 2 且 `pairs[0].sem.positionDp` = `{x:12,y:12}`(px÷2.0,size/touchBounds/cornerRadius 同口径换算,fontSizeSp 不换算);`missing=[node 1:103]`;`extra=['fig:9:9']`;`dump.density!==2.0` 时 throw `L2Error('render_harness_error')`。实现:递归收集语义树 tag→节点 Map;对**全树所有带 tag 的 Figma 节点**(含容器,供 padding 断言)join——但容器 pair 不进 untaggedCoverage/matchRate 分子,两指标分子分母均只统计 N 中的叶子(见 Step 7 与 Canonical Contract)。红→绿→`git commit -am "T1.3: fig:<nodeId> 确定性join与px÷density换算"`

#### Step 5 — CIEDE2000

测试 `color.test.ts`(Sharma 2005 标准测例,kL=kC=kH=1,sRGB→Lab 用 D65):

| 断言 | 输入 | 期望(±0.001) |
|---|---|---|
| labDeltaE 例1 | Lab(50,2.6772,−79.7751) vs (50,0,−82.7485) | 2.0425 |
| labDeltaE 例3 | Lab(50,2.8361,−74.0200) vs (50,0,−82.7485) | 3.4412 |
| 同色 | `ciede2000('#FF6633','#FF6633')` | 0 |
| 黑白 | `ciede2000('#000000','#FFFFFF')` | 100(±0.5) |

实现:hex→线性 sRGB→XYZ(D65)→Lab→Sharma 公式(约 60 行,照公式直译,无自由发挥空间)。红→绿→`git commit -am "T1.3: CIEDE2000 色差(Sharma测例锚定)"`

#### Step 6 — 逐属性断言 assertPair

**执行口径**:每属性仅当**双侧值均可得**才执行并计入 `executed`(exporter v0 的 cornerRadiusPx 恒 null → 圆角断言自动不执行,不计分母);padding/itemSpacing 仅对容器 pair 执行,语义侧派生值 = 首/末子节点相对父边距、相邻子节点间距(dp)。完整示例(fontSize):

```ts
it('字号超过±0.5sp记high违规', () => {
  const r = assertPair(pair({ figma: { style: { fontSize: 16 } }, sem: { fontSizeSp: 14 } }));
  expect(r.violations).toContainEqual(expect.objectContaining({
    property: 'fontSize', expected: '16sp', actual: '14sp', severity: 'high' }));
});
it('字号偏差0.5sp内不违规且executed+1', () => { /* 16 vs 15.6 → violations 空, executed 含该项 */ });
```

其余属性同构,每行一对红绿用例(违规值/边界合格值):

| property | Figma 来源 | 语义侧(dp) | 判定 | severity | 违规用例→边界用例 |
|---|---|---|---|---|---|
| position | rebase 后 bbox.x/y | positionDp | L1 距离≤2 | high | 偏 3dp→偏 2dp |
| size | bbox.w/h | sizeDp | 各轴≤2 | high | 宽差 5→差 2 |
| paddingLeft/Top/Right/Bottom | padding* | 首子相对父 | 0.5dp 网格相等 | medium | 12 vs 16→12 vs 12.4(round 后等) |
| itemSpacing | itemSpacing | 相邻子间距 | 同上 | medium | 8 vs 12→8 vs 8 |
| fontSize | style.fontSize | fontSizeSp | ≤0.5 | high | 上例 |
| color | fills[0].color→hex | colorHex | ΔE00<3 | high | #F00 vs #00F→#FF6633 vs #FE6532 |
| cornerRadius | cornerRadius | cornerRadiusPx÷2 | 网格相等 | medium | 双侧可得时 8 vs 4;sem null→不执行 |

红→绿→`git commit -am "T1.3: L2逐属性断言(±2dp/精确/±0.5sp/ΔE<3)"`

#### Step 7 — 指标公式(2.4 节逐条对照)

测试 `metrics.test.ts`,每个 `it` 名带文档条目号:

| 测试 | 断言 |
|---|---|
| 2.4-untaggedCoverage | 分子=**N 中** tag 命中的叶子数、分母=\|N\|:N=10、命中 9 → 0.9;N=0 → 返回 1(空集不判 inconclusive 由 verdict 层管) |
| 2.4-untaggedCoverage-容器不计分 | 容器(CalibCard)tag 命中、N=4 个叶子全缺 tag → 0(容器命中不得进分子,防虚高;端到端反例见 Step 10) |
| 2.4-matchRate-v0 | v0 仅 tag 策略:分子=**N 中** tag 配对成功的叶子数,N=10、配对 7 → 0.7(容器配对同样不计入分子;注释:T2.5 接降级匹配后分子扩大) |
| 2.4-score | violations=[high,medium,low]、executed=10 → `1−(0.8+0.4+0.1)/10 = 0.87`(精确相等) |
| 2.4-score-空断言 | executed=0 → score=0 |

红→绿→`git commit -am "T1.3: untaggedCoverage/matchRate/score公式"`

#### Step 8 — pass 三条件短路(2.4 节判定优先级)

`verdict({ subReason, violations, score, minScore = 0.9, blockingSeverities = DEFAULT_BLOCKING_SEVERITIES })`。完整示例:

```ts
it('2.4-条件1短路: inconclusive时即便零违规满分也fail', () =>
  expect(verdict({ subReason: 'tag_coverage_low', violations: [], score: 1 }).pass).toBe(false));
```

| 测试 | 输入 | pass |
|---|---|---|
| 2.4-条件2:blockingSeverities 命中即 fail | 1 条 high、score 0.95 | false |
| 2.4-条件2 先于 minScore 不互换 | 1 条 high、score 1.0、minScore 0 | false |
| 2.4-blockingSeverities 可配 | 同上但 `blockingSeverities:['blocking']` | 转看条件3 → true |
| 2.4-条件3:minScore 只管 medium/low 累积 | 3 条 medium、score 0.88 < 0.9 | false |
| 2.4-全过 | 2 条 low、score 0.98 | true |

红→绿→`git commit -am "T1.3: pass三条件短路判定"`

#### Step 9 — state.json 防震荡(设计原则 2)

`stepState(prev, { blockingHits, score, pass })` 纯函数;"改善"定义:`blockingHits` 下降且 score 回退 ≤0.02,**或** blockingHits 持平且 score 上升;否则停滞 +1;`stagnation≥2 → regression:true`,`regressionReason` 格式 `"blockingHits 2→2, score 0.60→0.60, 连续2轮停滞"`;`round≥5 且未 pass → regression:true, reason "round_limit(5)"`;改善则 stagnation 清零。测试 `stability.test.ts`:

| 测试 | 轮序列(blockingHits, score) | 期望 |
|---|---|---|
| 先重构再修值不误杀 | (2,0.60)→(1,0.59)→(0,0.80) | 全程 regression:false,stagnation 归 0 |
| 容忍边界 | (2,0.60)→(1,0.58) | 回退恰 0.02 → 改善 |
| 超容忍 | (2,0.60)→(1,0.50) | 停滞 1 |
| 连续 2 轮停滞 | (2,0.6)→(2,0.6)→(2,0.6) | 第 3 轮 regression:true 且 regressionReason 非空含前后值 |
| reason 必填 | 任一 regression:true 结果 | `regressionReason !== null` |
| 轮上限 | 5 轮均未 pass | regression:true, reason 含 `round_limit(5)` |
| pass 重置 | pass:true | 返回初始态(round 0) |

红→绿→`git commit -am "T1.3: state.json防震荡分层比较"`

#### Step 10 — 确定性 hint + report.json v1 组装

`makeHint(v, figmaName)` 纯模板:`` `${property} 应为 ${expected}(Figma "${figmaName}"),当前 ${actual};检查 ${FIX_MAP[property]}` ``,FIX_MAP 写死:position→`布局排列/Modifier.offset`、size→`Modifier.size/width/height`、padding*→`Modifier.padding`、itemSpacing→`Arrangement.spacedBy`、fontSize→`TextStyle.fontSize`、color→`Color 参数或 token`、cornerRadius→`RoundedCornerShape`。测试:同输入两次调用字符串全等(确定性);fontSize 违规 hint 含 "TextStyle.fontSize" 与 "16sp"。
`runL2(spec, dump, opts)` 串起 Step 2–9 产出 v1 `structural` 块 `{matched, untaggedCoverage, matchRate, missing, extra, violations}` + 顶层 `{pass, reason, subReason, score, regression, regressionReason}`;`untaggedCoverage<0.9 → subReason 'tag_coverage_low'`、`matchRate<0.8 → 'matching_rate_low'`(均 `reason:'inconclusive'`,coverage 判定优先)。测试:合格 fixture → pass true;去掉 3 个 tag → inconclusive;写偏字号 → violations 恰 1 条。

另加**反例单测(完整代码,钉死"容器命中不虚高")**——容器有 tag、4 个叶子全缺 tag 时,coverage/matchRate 必须为 0:

```ts
it('反例:容器有tag、4叶子全缺tag → untaggedCoverage=0/matchRate=0 且 inconclusive', () => {
  const leaf = (id: string, name: string, x: number, y: number, w: number, h: number): FigmaNode => ({
    id, name, type: 'RECTANGLE',
    absoluteBoundingBox: { x, y, width: w, height: h },
  });
  const spec: FigmaNode = {              // Canonical Contract 5 节点,绝对坐标(根在画布 (100,100))
    id: '1:100', name: 'CalibCard', type: 'FRAME',
    absoluteBoundingBox: { x: 100, y: 100, width: 360, height: 200 },
    children: [
      { ...leaf('1:101', 'CalibTitle', 112, 112, 200, 20), type: 'TEXT',
        characters: 'Calibration Card', style: { fontSize: 16 } },
      { ...leaf('1:102', 'CalibSubtitle', 112, 136, 200, 16), type: 'TEXT',
        characters: 'Known geometry fixture', style: { fontSize: 12 } },
      leaf('1:103', 'CalibSwatch', 112, 160, 80, 40),
      leaf('1:104', 'CalibBadge', 396, 112, 52, 20),
    ],
  };
  const semLeaf = (x: number, y: number, w: number, h: number): SemNode => ({
    testTag: null, text: null,           // 4 个叶子全缺 tag
    positionInRoot: { x, y }, size: { width: w, height: h },
    touchBoundsInRoot: { left: x, top: y, right: x + w, bottom: y + h },
    colorHex: null, fontSizeSp: null, cornerRadiusPx: null, children: [],
  });
  const dump: SemanticsDump = {
    density: 2.0,
    root: {
      ...semLeaf(0, 0, 720, 400), testTag: 'fig:1:100',   // 只有容器命中 tag
      children: [semLeaf(24, 24, 400, 40), semLeaf(24, 72, 400, 32),
                 semLeaf(24, 120, 160, 80), semLeaf(592, 24, 104, 40)],
    },
  };
  const report = runL2(spec, dump, {});
  expect(report.structural.untaggedCoverage).toBe(0);   // 分子只数 N 中叶子:容器命中不计入,不得虚高
  expect(report.structural.matchRate).toBe(0);
  expect(report.reason).toBe('inconclusive');
  expect(['tag_coverage_low', 'matching_rate_low']).toContain(report.subReason);
  expect(report.pass).toBe(false);
});
```

红→绿→`git commit -am "T1.3: hint模板与report.json v1组装(runL2)"`

#### Step 11 — demo-android SemanticsDumpRule(Kotlin 侧 TDD)

先写失败测试 `demo-android/app/src/test/java/com/magpie/uiv/demo/SemanticsDumpTest.kt`:渲染 T1.1 的 CalibCard,`rule.dump(compose, "CalibCard")` 后断言 `build/uiv/CalibCard.semantics.json` 存在、含 `"fig:1:100` 与 `"density": 2.0`。跑 `cd demo-android && GRADLE_USER_HOME=./.gradle-home ./gradlew :app:testDebugUnitTest --tests "com.magpie.uiv.demo.SemanticsDumpTest"` → 编译失败(红)。实现 `src/test/java/com/magpie/uiv/demo/SemanticsDumpRule.kt`:

```kotlin
class SemanticsDumpRule(private val outDir: File = File("build/uiv")) : TestWatcher() {
  fun dump(rule: ComposeContentTestRule, name: String) {
    val root = rule.onRoot(useUnmergedTree = true).fetchSemanticsNode()
    outDir.mkdirs()
    File(outDir, "$name.semantics.json")
      .writeText("""{"density": ${rule.density.density}, "root": ${nodeJson(root)}}""")
  }
  private fun nodeJson(n: SemanticsNode): String {
    val tag = n.config.getOrNull(SemanticsProperties.TestTag)
    val text = n.config.getOrNull(SemanticsProperties.Text)?.joinToString("")
    val results = mutableListOf<TextLayoutResult>()
    n.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(results)
    val style = results.firstOrNull()?.layoutInput?.style
    val fontSp = style?.fontSize?.takeIf { it.isSp }?.value
    val color = style?.color?.takeIf { it != Color.Unspecified }
      ?.let { "\"#%06X\"".format(it.toArgb() and 0xFFFFFF) } ?: "null"
    val p = n.positionInRoot; val s = n.size; val t = n.touchBoundsInRoot
    return """{"testTag":${js(tag)},"text":${js(text)},
      "positionInRoot":{"x":${p.x},"y":${p.y}},
      "size":{"width":${s.width},"height":${s.height}},
      "touchBoundsInRoot":{"left":${t.left},"top":${t.top},"right":${t.right},"bottom":${t.bottom}},
      "colorHex":$color,"fontSizeSp":${fontSp ?: "null"},"cornerRadiusPx":null,
      "children":[${n.children.joinToString(",") { nodeJson(it) }}]}"""
  }
  private fun js(v: String?) = v?.let { "\"${it.replace("\\", "\\\\").replace("\"", "\\\"")}\"" } ?: "null"
}
```

口径注意:用 `positionInRoot + size`(unclipped px),**不用** `boundsInRoot`;`cornerRadiusPx` v0 恒 null(语义树不可得,断言侧自动跳过)——因此 Phase 0 验收偏差不含圆角(见 Canonical Contract)。再跑同命令 → `BUILD SUCCESSFUL`。`git commit -am "T1.3: SemanticsDumpRule 语义树导出(px口径)"`

#### Step 12 — CLI 接线 + 故意写偏端到端

1. uiv-cli `check` 流水线在 T1.2 基础上追加:gradle 跑完后读 `demo-android/app/build/uiv/<name>.semantics.json` + `.ui-verify/baselines/<nodeId>@<version>/spec.json` → `runL2` → 读写 `.ui-verify/state.json`(`stepState`)→ 合并进 report.json(v1)。core 层已全测,CLI 层只加一个集成测试:fixture 目录下跑 `check --preview ... --node 1:100`,断言 exit 1 + report.json 过 v1 结构校验(`node -e` 校验必备键)。
2. 端到端红绿:把 CalibCard 标题改为 `fontSize = 14.sp`(spec 期望 16),跑 `node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android`,预期 exit 1 且 `jq '.structural.violations[0].property' .ui-verify/reports/1-100@T1_0A_V1/report.json` = `"fontSize"`;改回 16.sp 重跑 → exit 0、`pass:true`。
3. 更新 `.claude/plans/magpie-eye-full-impl/meta.json`:`tasks."T1.3" = {status:"awaiting_review", last_commit:"<hash>"}`。
`git commit -am "T1.3: uiv check 接入L2+防震荡,report.json v1 端到端"`

**任务级验收命令**:`npm test && (cd demo-android && GRADLE_USER_HOME=./.gradle-home ./gradlew :app:testDebugUnitTest)` 双 exit 0;上述端到端红绿各一次通过。未过 → 按 superpowers:systematic-debugging 排查,口径冲突回 Codex。

---

### Task T1.4:Phase 0 端到端验收(硬门)

**对应验收标准(orchestration M1 表)**:验收脚本核对最终 report.json `pass=true` 且轮次 ≤5;延迟数据落档 `docs/phase0-acceptance.md`;未达标 → 回 Codex,不进 M2。
**设计文档依据**:第 8 节 Phase 0 验收标准("模型不看渲染图、仅凭 report.json 在 ≤5 轮内把一个中等复杂度卡片修到 L2 全过")+ 3.1 节内循环步骤 2~5(check → report → 按 violations/hint 修 → 重跑,轮上限 5,regression 回退)。

**前置依赖**:T1.1(demo-android 工程 + 卡片 composable + @Preview)、T1.2(`uiv baseline pull --fixture` / `uiv check` / report.json v0)、T1.3(L2 v0 + report.json v1 含 violations/hint/score/regression)全部 done。

**交付物**:

| 产物 | 说明 |
|------|------|
| `scripts/phase0-lib.mjs` | 纯函数:artifacts 剥离、停止条件判定、第 1 轮检出能力门、验收报告渲染(有单测) |
| `scripts/phase0-lib.test.mjs` | 停止条件三分支 + 检出能力门单测(假 report.json 序列驱动) |
| `scripts/phase0-acceptance.mjs` | 验收 harness:`reset` / `step` / `finalize` 三个子命令 |
| `scripts/phase0-acceptance.smoke.test.mjs` | harness 冒烟测试(stub uiv check,不碰 Gradle) |
| `scripts/phase0-config.json` | 验收配置(路径/命令单一事实源) |
| `scripts/fixtures/CalibCard.deviated.kt` + `CalibCard.original.kt` | 写偏实现与验收前快照(验收可重现) |
| 验收基准 | 复用 T1.2 canonical fixture(`rest-nodes-card.json`,已含 CalibBadge `1:104`)与 `1-100@T1_0A_V1` baseline,无需另造 fixture 或重录 |
| `docs/phase0-acceptance.md` | 每轮 violations 数/missing 数/score/耗时表格 + 结论 |
| meta.json 更新 | `latency_baseline.phase0_loop` + `tasks.T1.4` 状态 |

#### 写死的偏差清单(每项对应一类 L2 断言)

| # | 偏差 | 写偏值 | 设计值(Canonical Contract) | 对应 L2 断言类 |
|---|------|--------|---------------------------|----------------|
| D1 | CalibTitle 位置 | `CHILD_POSITIONS` 表 title 项 `16.dp to 16.dp` | `CHILD_POSITIONS` 表 title 项 `12.dp to 12.dp`(合同值) | position(±2dp) |
| D2 | CalibTitle 字号 | `fontSize = 14.sp` | `fontSize = 16.sp` | fontSize(±0.5sp) |
| D3 | CalibSwatch 颜色 | `Color(0xFFFF6600)` | `Color(0xFFFF9900)` | color(ΔE00<3) |
| D4 | CalibBadge 缺失 | 移除 `CalibBadge()` 调用行(不渲染) | 渲染 `fig:1:104`(52×20dp @ 卡内 (296,12)) | missing(`structural.missing` 含 `figmaId=1:104` + untaggedCoverage) |

(圆角不作偏差项:L2 v0 的 semantics exporter 不导出圆角,断言自动跳过,见 Canonical Contract。)

#### 修正循环接口约定(② 的合同,主会话执行时严格照此)

- **角色分工**:harness(`phase0-acceptance.mjs`)负责跑 `uiv check`、剥离 artifacts、判停、计时;**主会话**在每轮 `step` 之后 spawn 一个通用 subagent(Task 工具,general-purpose)扮演修正者;修正者**不运行任何命令**。
- **每轮修正者输入**(且仅有这些):
  1. 剥离 `artifacts` 字段后的 report.json 全文(`.ui-verify/phase0/round-<N>.report.json`,内容不含任何图片路径——由单测保证序列化结果不含 `.png`);
  2. 允许修改的唯一文件路径(卡片源文件);
  3. 代码契约说明(figmaTag 格式、dp/sp 语义)。
- **修正者禁令**:禁读任何图片、禁访问 `.ui-verify/`、禁跑命令、禁改 baselines/fixtures/scripts/测试/构建配置。**机械保障**:harness 每轮 `step` 开头执行 git 白名单守卫——`git diff --name-only HEAD` 出现白名单外文件即 exit 30(协议违规,本次验收作废)。
- **停止条件**(优先级从高到低,由 `decide()` 实现并被单测钉死):
  1. `report.pass === true` → **成功**(exit 10);
  2. `report.regression === true` → **失败,回 Codex**(exit 21);
  3. 本轮为第 5 轮仍未 pass → **失败 max_rounds,回 Codex**(exit 20);
  4. 否则 → 继续(exit 0)。

---

**Step 1:标记任务开工 + 生成 phase0-config.json 并核对前置产物(约 4 分钟)**

标记 in_progress:

```bash
cd /Users/zhuxi/AI/magpie_eye && node -e '
const fs=require("fs"),p=".claude/plans/magpie-eye-full-impl/meta.json";
const m=JSON.parse(fs.readFileSync(p,"utf8"));
m.tasks=m.tasks??{}; m.tasks["T1.4"]={...(m.tasks["T1.4"]??{}),status:"in_progress"};
fs.writeFileSync(p,JSON.stringify(m,null,2)); console.log("T1.4 in_progress");'
```

预期输出:`T1.4 in_progress`。

发现前置产物实际路径(以 T1.1~T1.3 落地为准):

```bash
cd /Users/zhuxi/AI/magpie_eye
grep -rln "@Preview" demo-android --include="*.kt"      # 卡片文件与 Preview FQN
cat .ui-verify/mapping.json                              # nodeId / version / baseline 目录
ls packages/uiv-core/fixtures/                           # T1.2 的 canonical REST-shape fixture(应含 rest-nodes-card.json)
npm run build                                            # 确保 uiv-cli dist 最新
```

写 `scripts/phase0-config.json`(下面的值为 T1.1~T1.3 章节的规范命名;若上一步发现的实际路径/FQN/nodeId 不同,**只改这个文件**,后续所有脚本都从它读):

```json
{
  "cardFile": "demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt",
  "backupSrc": "scripts/fixtures/CalibCard.original.kt",
  "deviatedSrc": "scripts/fixtures/CalibCard.deviated.kt",
  "allowedFixPaths": ["demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt"],
  "nodeId": "1:100",
  "badgeNodeId": "1:104",
  "fixturePath": "packages/uiv-core/fixtures/rest-nodes-card.json",
  "baselinePullCmd": "node packages/uiv-cli/dist/index.js baseline pull --fixture packages/uiv-core/fixtures/rest-nodes-card.json --file FKEY --node 1:100",
  "specPath": ".ui-verify/baselines/1-100@T1_0A_V1/spec.json",
  "checkCmd": "node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android",
  "reportPath": ".ui-verify/reports/1-100@T1_0A_V1/report.json",
  "stateDir": ".ui-verify/phase0",
  "docPath": "docs/phase0-acceptance.md",
  "metaPath": ".claude/plans/magpie-eye-full-impl/meta.json",
  "skipGitGuard": false,
  "deviations": [
    "D1 CalibTitle 位置:(16,16)dp(应为 (12,12))→ position 断言(±2dp)",
    "D2 CalibTitle 字号:14sp(应为 16sp)→ fontSize 断言(±0.5sp)",
    "D3 CalibSwatch 颜色:#FF6600(应为 #FF9900)→ color 断言(ΔE00<3)",
    "D4 CalibBadge 不渲染 → missing 断言(structural.missing 含 figmaId=1:104)"
  ]
}
```

机判前置产物齐备:

```bash
node -e '
const fs=require("fs");
const cfg=JSON.parse(fs.readFileSync("scripts/phase0-config.json","utf8"));
const must=["cardFile","fixturePath","metaPath"];
for (const k of must) if(!fs.existsSync(cfg[k])){console.error("缺前置产物:"+k+"="+cfg[k]);process.exit(1);}
if(!fs.existsSync("packages/uiv-cli/dist/index.js")){console.error("uiv-cli 未构建");process.exit(1);}
console.log("OK:T1.4 前置产物齐备");'
```

预期输出:`OK:T1.4 前置产物齐备`(exit 0)。非 0 → 停,先回查 T1.1~T1.3 状态,不得继续。

**Step 2:验收基准核对——canonical fixture 已含 CalibBadge(约 3 分钟)**

Canonical Calibration Contract 的 fixture(`rest-nodes-card.json`)本就含 `CalibBadge 1:104`,D4"缺失节点"由**写偏侧不渲染 badge**制造,无需向 fixture 加节点、也无需独立 version 重录基准;本步只机判基准就位:

```bash
node packages/uiv-cli/dist/index.js baseline pull --fixture packages/uiv-core/fixtures/rest-nodes-card.json --file FKEY --node 1:100
node -e '
const fs=require("fs");
const cfg=JSON.parse(fs.readFileSync("scripts/phase0-config.json","utf8"));
const spec=JSON.parse(fs.readFileSync(cfg.specPath,"utf8"));
function find(n,id){if(!n)return null;if(n.id===id)return n;for(const c of n.children??[]){const h=find(c,id);if(h)return h;}return null;}
const b=find(spec.root??spec,cfg.badgeNodeId);   // 根字段名以 T1.2 实现为准,兼容 spec.root 与顶层
if(!b){console.error("spec.json 中无 CalibBadge 1:104");process.exit(1);}
const bb=b.bbox??{};
if(!(bb.x===296&&bb.y===12&&bb.w===52&&bb.h===20)){console.error("CalibBadge bbox 与合同表不符:"+JSON.stringify(bb));process.exit(1);}
console.log("badge 已入基准(re-base 后):",JSON.stringify(bb));'
npm test   # 回归:T1.2/T1.3 存量单测不受影响(同一 canonical fixture)
```

预期:第 2 条输出 `badge 已入基准(re-base 后): {"x":296,"y":12,"w":52,"h":20}`;`npm test` exit 0。任一失败 → 回查 T1.2 fixture 是否偏离 Canonical Contract 后重跑,不得带病前进。

commit:

```bash
git add scripts/phase0-config.json .ui-verify/baselines .ui-verify/mapping.json
git commit -m "[T1.4] 验收基准核对:canonical fixture 的 CalibBadge(1:104)已入 spec/baseline"
```

**Step 3:生成写偏实现副本(约 4 分钟)**

写 `scripts/make-deviated-card.mjs`(机械变换 + 恰好一处匹配断言,防止静默错改):

```js
// T1.4 D1~D4:从当前正确 CalibCard 机械生成写偏副本(对应 L2 断言类:position/fontSize/color/missing)
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('scripts/phase0-config.json', 'utf8'));
let src = fs.readFileSync(cfg.cardFile, 'utf8');
fs.mkdirSync('scripts/fixtures', { recursive: true });
fs.writeFileSync(cfg.backupSrc, src); // 验收前快照,验收可重现

const subs = [
  [/12\.dp to 12\.dp,(\s*\/\/ fig:1:101 CalibTitle)/g, '16.dp to 16.dp,$1', 'D1 CalibTitle 位置(position,CHILD_POSITIONS 表 title 项)'],
  [/fontSize = 16\.sp/g, 'fontSize = 14.sp', 'D2 CalibTitle 字号(fontSize)'],
  [/Color\(0xFFFF9900\)/g, 'Color(0xFFFF6600)', 'D3 CalibSwatch 颜色(color)'],
  [/^[ \t]*CalibBadge\(\)[ \t]*\n/gm, '', 'D4 CalibBadge 调用行移除(missing,不渲染)'],
];
for (const [re, to, name] of subs) {
  const n = (src.match(re) ?? []).length;
  if (n !== 1) { console.error(`${name}:期望恰好 1 处匹配 ${re},实际 ${n} 处 —— 请对照 CalibCard.kt 实际写法调整正则后重跑`); process.exit(1); }
  src = src.replace(re, to);
}
if (/^[ \t]*CalibBadge\(\)/m.test(src)) { console.error('D4 失效:仍存在 CalibBadge() 调用'); process.exit(1); }
fs.writeFileSync(cfg.deviatedSrc, src);
console.log(`写偏副本已生成:${cfg.deviatedSrc}(D1~D3 已注入,D4 调用行已移除)`);
```

```bash
node scripts/make-deviated-card.mjs
diff scripts/fixtures/CalibCard.original.kt scripts/fixtures/CalibCard.deviated.kt
```

预期:脚本输出"写偏副本已生成…";diff 恰好显示 4 处改动(CHILD_POSITIONS title 项 16,16 / 14.sp / 0xFFFF6600 / 删 `CalibBadge()` 一行;`private fun CalibBadge` 定义保留但不再被调用)。commit:

```bash
git add scripts/make-deviated-card.mjs scripts/fixtures/
git commit -m "[T1.4] 写偏 CalibCard 副本与验收前快照(D1~D4 偏差注入)"
```

**Step 4:写 harness 纯函数失败测试(约 5 分钟)**

先让 vitest 能发现 scripts 下的测试——改 `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
```

写 `scripts/phase0-lib.test.mjs`(假 report.json 序列钉死停止条件三分支):

```js
import { describe, it, expect } from 'vitest';
import { stripArtifacts, decide, renderAcceptanceDoc, assertSeededDetection, MAX_ROUNDS } from './phase0-lib.mjs';

const fake = (over = {}) => ({
  pass: false, reason: null, score: 0.5, regression: false, regressionReason: null,
  structural: { violations: [{ property: 'fontSize', testTag: 'fig:1:101' }], missing: [{ figmaId: '1:104' }] },
  artifacts: {
    render: '.ui-verify/renders/1-100@T1_0A_V1/rendered.png',
    overlay: '.ui-verify/reports/1-100@T1_0A_V1/diff-overlay.png',
    triptych: '.ui-verify/reports/1-100@T1_0A_V1/triptych.png',
  },
  ...over,
});

describe('stripArtifacts', () => {
  it('剥离 artifacts 字段,序列化结果不含任何图片路径,其余字段原样保留', () => {
    const s = stripArtifacts(fake());
    expect(s.artifacts).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/\.png/);
    expect(s.structural.violations).toHaveLength(1);
    expect(s.score).toBe(0.5);
  });
});

describe('decide:停止条件三分支(轮次 1-based,上限 5)', () => {
  it('分支一 成功:序列 [fail, fail, pass] 在第 3 轮 pass 停止', () => {
    const seq = [fake(), fake(), fake({ pass: true, structural: { violations: [], missing: [] } })];
    const ds = seq.map((r, i) => decide(r, i + 1));
    expect(ds[0]).toEqual({ verdict: 'continue', reason: null });
    expect(ds[1]).toEqual({ verdict: 'continue', reason: null });
    expect(ds[2]).toEqual({ verdict: 'pass', reason: null });
  });
  it('分支二 超轮:连续 5 轮 fail → 第 5 轮判 max_rounds(即 轮次>5 不可能发生)', () => {
    const seq = Array.from({ length: 5 }, () => fake());
    const ds = seq.map((r, i) => decide(r, i + 1));
    expect(ds.slice(0, 4).every((d) => d.verdict === 'continue')).toBe(true);
    expect(ds[4]).toEqual({ verdict: 'fail', reason: 'max_rounds' });
  });
  it('分支三 regression:第 2 轮 regression=true 立即失败;第 5 轮 regression 归因 regression 而非 max_rounds', () => {
    expect(decide(fake({ regression: true, regressionReason: 'score 0.78→0.78 停滞 2 轮' }), 2))
      .toEqual({ verdict: 'fail', reason: 'regression' });
    expect(decide(fake({ regression: true }), 5)).toEqual({ verdict: 'fail', reason: 'regression' });
  });
  it('pass 优先级最高:最后一轮 pass 即使 regression 脏位也判成功', () => {
    expect(decide(fake({ pass: true, regression: true }), 5)).toEqual({ verdict: 'pass', reason: null });
  });
});

describe('assertSeededDetection:第 1 轮检出能力门(D1~D4 全命中,防假通过)', () => {
  const full = () => fake({ structural: {
    violations: [
      { property: 'position', testTag: 'fig:1:101' },
      { property: 'fontSize', testTag: 'fig:1:101' },
      { property: 'color', testTag: 'fig:1:103' },
    ],
    missing: [{ figmaId: '1:104' }],
  } });
  it('4 项全命中 → 返回空数组', () => expect(assertSeededDetection(full())).toEqual([]));
  it('color 以 fill 报告同样算命中', () => {
    const r = full(); r.structural.violations[2].property = 'fill';
    expect(assertSeededDetection(r)).toEqual([]);
  });
  it('缺 D4(missing 无 1:104)→ 返回含 D4 的缺失清单', () => {
    const r = full(); r.structural.missing = [];
    expect(assertSeededDetection(r)).toEqual(['D4 missing figmaId=1:104']);
  });
  it('缺 D1(无 position@fig:1:101)→ 清单含 D1', () => {
    const r = full(); r.structural.violations = r.structural.violations.slice(1);
    expect(assertSeededDetection(r)).toContain('D1 position@fig:1:101');
  });
});

describe('renderAcceptanceDoc', () => {
  it('输出含每轮一行的 violations/missing/score/耗时表格与结论', () => {
    const doc = renderAcceptanceDoc({
      rounds: [
        { round: 1, violations: 3, missing: 1, score: 0.62, pass: false, checkMs: 21000 },
        { round: 2, violations: 0, missing: 0, score: 0.98, pass: true, checkMs: 18500 },
      ],
      verdict: 'pass',
      deviations: ['D1 padding'],
      startedAt: 0, finishedAt: 120000,
    });
    expect(doc).toContain('| 轮次 | violations | missing | score | pass | check 耗时(s) |');
    expect(doc).toContain('| 1 | 3 | 1 | 0.62 | false | 21.0 |');
    expect(doc).toContain('| 2 | 0 | 0 | 0.98 | true | 18.5 |');
    expect(doc).toContain('通过');
    expect(doc).toContain('D1 padding');
    expect(doc).toContain(`上限 ${MAX_ROUNDS} 轮`);
  });
});
```

跑,确认失败:

```bash
npm test -- scripts/phase0-lib.test.mjs
```

预期:失败,报错 `Failed to load .../scripts/phase0-lib.mjs`(模块不存在)。

**Step 5:实现 phase0-lib.mjs → 测试通过 → commit(约 4 分钟)**

写 `scripts/phase0-lib.mjs`:

```js
// T1.4 验收 harness 纯函数:剥离 / 判停 / 报告渲染(被 phase0-lib.test.mjs 钉死)
export const MAX_ROUNDS = 5;

export function stripArtifacts(report) {
  const { artifacts, ...rest } = report;
  return rest;
}

// round 为 1-based 当前轮次。优先级:pass > regression > max_rounds > continue
export function decide(report, round, maxRounds = MAX_ROUNDS) {
  if (report.pass === true) return { verdict: 'pass', reason: null };
  if (report.regression === true) return { verdict: 'fail', reason: 'regression' };
  if (round >= maxRounds) return { verdict: 'fail', reason: 'max_rounds' };
  return { verdict: 'continue', reason: null };
}

// 第 1 轮检出能力门:初始 report 必须同时命中全部 seeded deviations(D1~D4),
// 否则"检出能力不足",验收作废(防假通过,先于修正循环)。返回缺失清单,空数组=全命中。
// color 允许以 property 'color' 或 'fill' 报告。
export function assertSeededDetection(report) {
  const v = report.structural?.violations ?? [];
  const hit = (props, tag) => v.some((x) => props.includes(x.property) && x.testTag === tag);
  const misses = [];
  if (!hit(['position'], 'fig:1:101')) misses.push('D1 position@fig:1:101');
  if (!hit(['fontSize'], 'fig:1:101')) misses.push('D2 fontSize@fig:1:101');
  if (!hit(['color', 'fill'], 'fig:1:103')) misses.push('D3 color@fig:1:103');
  if (!(report.structural?.missing ?? []).some((m) => (m.figmaId ?? m.id) === '1:104'))
    misses.push('D4 missing figmaId=1:104');
  return misses;
}

export function renderAcceptanceDoc({ rounds, verdict, deviations, startedAt, finishedAt }) {
  return [
    '# Phase 0 端到端验收报告(T1.4)',
    '',
    `- 结论:**${verdict === 'pass' ? '通过' : '未通过'}**(${rounds.length} 轮,上限 ${MAX_ROUNDS} 轮)`,
    `- 总耗时:${((finishedAt - startedAt) / 1000).toFixed(0)}s`,
    '- 修正者输入:仅剥离 artifacts 字段后的 report.json,无任何图片路径',
    '',
    '## 预置偏差清单',
    '',
    ...deviations.map((d) => `- ${d}`),
    '',
    '## 逐轮数据',
    '',
    '| 轮次 | violations | missing | score | pass | check 耗时(s) |',
    '|---|---|---|---|---|---|',
    ...rounds.map((r) =>
      `| ${r.round} | ${r.violations} | ${r.missing} | ${r.score} | ${r.pass} | ${(r.checkMs / 1000).toFixed(1)} |`),
    '',
  ].join('\n');
}
```

```bash
npm test -- scripts/phase0-lib.test.mjs
git add vitest.config.ts scripts/phase0-lib.mjs scripts/phase0-lib.test.mjs
git commit -m "[T1.4] phase0-lib:artifacts 剥离/停止条件三分支/检出能力门/验收报告渲染(TDD)"
```

预期:`Test Files 1 passed`,10 个用例全绿(strip 1 + decide 4 + 检出门 4 + render 1),exit 0。

**Step 6:写 harness 冒烟测试(stub uiv check,先失败)(约 5 分钟)**

写 `scripts/phase0-acceptance.smoke.test.mjs`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'scripts/phase0-acceptance.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase0-smoke-'));
const reportPath = path.join(tmp, 'report.json');
const cfgPath = path.join(tmp, 'config.json');

// failReport 构造为命中全部 seeded deviations(D1~D4),以通过 harness 的第 1 轮检出能力门
const failReport = {
  pass: false, reason: null, score: 0.62, regression: false,
  structural: {
    violations: [
      { property: 'position', testTag: 'fig:1:101' },
      { property: 'fontSize', testTag: 'fig:1:101' },
      { property: 'color', testTag: 'fig:1:103' },
    ],
    missing: [{ figmaId: '1:104' }],
  },
  artifacts: { render: 'x/rendered.png', overlay: 'x/o.png', triptych: 'x/t.png' },
};
const passReport = {
  pass: true, reason: null, score: 0.98, regression: false,
  structural: { violations: [], missing: [] },
  artifacts: { render: 'x/rendered.png', overlay: 'x/o.png', triptych: 'x/t.png' },
};

beforeAll(() => {
  // stub uiv check:第 1 次调用产出 fail report,之后产出 pass report
  fs.writeFileSync(path.join(tmp, 'stub.mjs'), `
import fs from 'node:fs';
const cnt = ${JSON.stringify(path.join(tmp, 'cnt'))};
const n = fs.existsSync(cnt) ? Number(fs.readFileSync(cnt, 'utf8')) + 1 : 1;
fs.writeFileSync(cnt, String(n));
fs.writeFileSync(${JSON.stringify(reportPath)},
  JSON.stringify(n === 1 ? ${JSON.stringify(failReport)} : ${JSON.stringify(passReport)}));
process.exit(n === 1 ? 1 : 0); // uiv check fail 时非零退出,harness 须容忍
`);
  fs.writeFileSync(path.join(tmp, 'deviated.kt'), 'DEVIATED');
  fs.writeFileSync(path.join(tmp, 'card.kt'), 'ORIGINAL');
  fs.writeFileSync(path.join(tmp, 'meta.json'), '{}');
  fs.writeFileSync(cfgPath, JSON.stringify({
    cardFile: path.join(tmp, 'card.kt'),
    deviatedSrc: path.join(tmp, 'deviated.kt'),
    allowedFixPaths: [], skipGitGuard: true,
    checkCmd: `node ${path.join(tmp, 'stub.mjs')}`,
    reportPath,
    stateDir: path.join(tmp, 'state'),
    docPath: path.join(tmp, 'phase0-acceptance.md'),
    metaPath: path.join(tmp, 'meta.json'),
    deviations: ['smoke 偏差'],
  }));
});

const run = (args) => {
  try {
    const out = execFileSync('node', [HARNESS, ...args],
      { env: { ...process.env, PHASE0_CONFIG: cfgPath }, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};

describe('phase0-acceptance harness 冒烟(stub uiv check)', () => {
  it('reset:安装写偏实现并初始化 state', () => {
    expect(run(['reset']).code).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'card.kt'), 'utf8')).toBe('DEVIATED');
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'state/state.json'), 'utf8')).rounds).toEqual([]);
  });
  it('step 第 1 轮 fail → exit 0,落盘剥离后的 round-1.report.json', () => {
    expect(run(['step']).code).toBe(0);
    const stripped = fs.readFileSync(path.join(tmp, 'state/round-1.report.json'), 'utf8');
    expect(stripped).not.toMatch(/\.png/);
    expect(JSON.parse(stripped).artifacts).toBeUndefined();
    expect(JSON.parse(stripped).structural.violations).toHaveLength(3);
  });
  it('step 第 2 轮 pass → exit 10', () => {
    expect(run(['step']).code).toBe(10);
  });
  it('finalize:生成验收文档并写 meta.latency_baseline.phase0_loop → exit 0', () => {
    expect(run(['finalize']).code).toBe(0);
    const doc = fs.readFileSync(path.join(tmp, 'phase0-acceptance.md'), 'utf8');
    expect(doc).toContain('| 1 | 3 | 1 | 0.62 | false |');
    expect(doc).toContain('| 2 | 0 | 0 | 0.98 | true |');
    const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'meta.json'), 'utf8'));
    expect(meta.latency_baseline.phase0_loop.rounds).toBe(2);
    expect(meta.latency_baseline.phase0_loop.checkMsPerRound).toHaveLength(2);
    expect(meta.latency_baseline.phase0_loop.p50CheckMs).toBeGreaterThan(0);
  });
});
```

```bash
npm test -- scripts/phase0-acceptance.smoke.test.mjs
```

预期:4 个用例全部失败(`e.status` 非 0/10,harness 文件不存在时 node 报 module not found)。

**Step 7:实现 harness → 冒烟通过 → commit(约 5 分钟)**

写 `scripts/phase0-acceptance.mjs`:

```js
#!/usr/bin/env node
// T1.4 Phase 0 端到端验收 harness:reset / step / finalize
// exit code 约定:0=continue 10=pass 20=max_rounds 21=regression 30=修正者协议违规 31=检出能力不足 1=harness 错误
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripArtifacts, decide, renderAcceptanceDoc, assertSeededDetection, MAX_ROUNDS } from './phase0-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = process.env.PHASE0_CONFIG || path.join(ROOT, 'scripts/phase0-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const stateDir = abs(cfg.stateDir);
const statePath = path.join(stateDir, 'state.json');
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const writeState = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2));

function reset() {
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.copyFileSync(abs(cfg.deviatedSrc), abs(cfg.cardFile));
  writeState({ startedAt: Date.now(), rounds: [] });
  console.log(`reset 完成:写偏实现已安装 → ${cfg.cardFile}`);
}

function gitGuard() {
  if (cfg.skipGitGuard) return;
  const changed = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const bad = changed.filter((f) => !cfg.allowedFixPaths.some((p) => f === p));
  if (bad.length > 0) {
    console.error(`协议违规:白名单外文件被改动:\n${bad.join('\n')}`);
    process.exit(30);
  }
}

function step() {
  const state = readState();
  const round = state.rounds.length + 1;
  gitGuard();
  const t0 = Date.now();
  try { execSync(cfg.checkCmd, { cwd: ROOT, stdio: 'inherit' }); }
  catch { /* uiv check 不通过时非零退出,report.json 仍产出,判定看 report */ }
  const checkMs = Date.now() - t0;
  const reportPath = abs(cfg.reportPath);
  if (!fs.existsSync(reportPath)) { console.error(`harness 错误:未产出 ${cfg.reportPath}`); process.exit(1); }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (round === 1) {
    // 检出能力门(防假通过,先于修正循环):第 1 轮 report 必须同时命中 D1~D4
    const misses = assertSeededDetection(report);
    if (misses.length > 0) {
      console.error(`检出能力不足:第 1 轮 report 未同时命中全部 seeded deviations:${misses.join('; ')}`);
      process.exit(31);
    }
  }
  const strippedPath = path.join(stateDir, `round-${round}.report.json`);
  fs.writeFileSync(strippedPath, JSON.stringify(stripArtifacts(report), null, 2));
  state.rounds.push({
    round,
    violations: report.structural?.violations?.length ?? null,
    missing: report.structural?.missing?.length ?? null,
    score: report.score ?? null,
    pass: report.pass === true,
    reason: report.reason ?? null,
    regression: report.regression === true,
    checkMs,
  });
  writeState(state);
  const d = decide(report, round, MAX_ROUNDS);
  console.log(JSON.stringify({ round, decision: d, strippedReport: path.relative(ROOT, strippedPath) }));
  if (d.verdict === 'pass') process.exit(10);
  if (d.verdict === 'fail') process.exit(d.reason === 'regression' ? 21 : 20);
  process.exit(0);
}

function finalize() {
  const state = readState();
  const last = state.rounds.at(-1);
  if (!last || last.pass !== true || state.rounds.length > MAX_ROUNDS) {
    console.error(`验收未达标:rounds=${state.rounds.length}, lastPass=${last?.pass ?? 'n/a'}`);
    process.exit(1);
  }
  const finishedAt = Date.now();
  fs.mkdirSync(path.dirname(abs(cfg.docPath)), { recursive: true });
  fs.writeFileSync(abs(cfg.docPath), renderAcceptanceDoc({
    rounds: state.rounds, verdict: 'pass', deviations: cfg.deviations,
    startedAt: state.startedAt, finishedAt,
  }));
  const meta = JSON.parse(fs.readFileSync(abs(cfg.metaPath), 'utf8'));
  const checkMsPerRound = state.rounds.map((r) => r.checkMs);
  const sorted = [...checkMsPerRound].sort((a, b) => a - b);
  meta.latency_baseline = meta.latency_baseline ?? {};
  meta.latency_baseline.phase0_loop = {
    rounds: state.rounds.length,
    checkMsPerRound,
    p50CheckMs: sorted[Math.floor((sorted.length - 1) / 2)],
    totalWallMs: finishedAt - state.startedAt,
    recordedAt: new Date(finishedAt).toISOString(),
  };
  fs.writeFileSync(abs(cfg.metaPath), JSON.stringify(meta, null, 2));
  console.log(`验收通过:${cfg.docPath} 已生成,latency_baseline.phase0_loop 已写入 ${cfg.metaPath}`);
}

const cmd = process.argv[2];
if (cmd === 'reset') reset();
else if (cmd === 'step') step();
else if (cmd === 'finalize') finalize();
else { console.error('用法:phase0-acceptance.mjs <reset|step|finalize>'); process.exit(2); }
```

```bash
npm test    # 全量:lib 测试 + 冒烟测试 + 存量测试
git add scripts/phase0-acceptance.mjs scripts/phase0-acceptance.smoke.test.mjs
git commit -m "[T1.4] phase0-acceptance harness:reset/step/finalize + stub 冒烟测试"
```

预期:`npm test` exit 0,冒烟 4 用例全绿(含 exit code 0/10 两分支与 meta 落盘断言)。

**Step 8:执行真实验收——修正循环(约 15~30 分钟,含 Gradle 轮次)**

前置:确认工作树干净(git guard 依赖 HEAD 基线):

```bash
git status --porcelain   # 预期:空输出;非空则先提交或还原
node scripts/phase0-acceptance.mjs reset
```

预期输出:`reset 完成:写偏实现已安装 → demo-android/...(cardFile)`。

随后主会话按以下状态机循环执行:

```bash
node scripts/phase0-acceptance.mjs step; echo "exit=$?"
```

- `exit=0`(continue):Read `.ui-verify/phase0/round-<N>.report.json` 全文,用下方模板 spawn 通用 subagent(Task 工具,general-purpose),等它结束后回到 `step`;
- `exit=10`(pass):进入 Step 9;
- `exit=20`/`exit=21`:进入 Step 10 失败分支;
- `exit=30`:协议违规——`git checkout -- <越界文件>` 还原后,本次验收作废,从 `reset` 重来;
- `exit=31`:检出能力不足(第 1 轮 report 未同时命中 D1~D4)——不是修正问题,是 L2 检出问题:本次验收作废、不进修正循环,携 `round-1` 原始 report.json 回 Codex;
- `exit=1`:harness/工具链故障,按 systematic-debugging 修 harness 或环境(不改卡片),修好后从 `reset` 重来。

修正 subagent 的 prompt 模板(逐字使用,替换 `<N>`、`<cardFile 绝对路径>`、`<剥离后 report.json 全文>` 三处):

```
你是 UI 修正 subagent。任务:仅依据下方 report.json 修正一个 Compose 组件实现。

硬约束:
1. 只允许编辑这一个文件:<cardFile 绝对路径>
2. 禁止读取或查看任何图片文件(png/jpg/webp);禁止访问 .ui-verify/ 目录;
   禁止运行任何命令(不要跑 uiv check / gradle / 测试,验证由外部 harness 完成);
   禁止修改 baselines、fixtures、scripts、测试代码、构建配置。
3. 代码契约:每个对应 Figma 节点的 composable 根 Modifier 挂
   Modifier.testTag("fig:<figmaNodeId>")。
4. violations[] 逐条修:expected/actual 中的 dp/sp 值按字面改到对应
   Modifier/TextStyle 参数,参考 hint。
5. missing[] 逐条补:按 figmaId/name/expectedBounds([x,y,w,h],单位 dp,
   相对卡片左上角)新增带 testTag("fig:<figmaId>") 的 composable 节点,
   fills 颜色按 hint/name 语义给纯色即可。
6. inconclusive(tag_coverage_low)时同样按 missing/缺 tag 清单补齐结构。

本轮为第 <N> 轮(上限 5 轮)。report.json(已剥离图片产物字段):

<剥离后 report.json 全文>

完成修改后直接结束,不要输出解释。
```

预期轨迹(实际数值以 report 为准,机判只看 exit code):第 1 轮 `step` 输出形如 `{"round":1,"decision":{"verdict":"continue","reason":null},"strippedReport":".ui-verify/phase0/round-1.report.json"}`,report **必须同时命中 4 项**——violations 含 `position@fig:1:101`、`fontSize@fig:1:101`、`color(或 fill)@fig:1:103` 三条,且 `structural.missing` 含 `figmaId=1:104`(任一未命中 → harness `exit=31` 检出能力不足,先于修正循环 fail)。小节点树下第 1 轮可能表现为 `reason:"inconclusive"`+`subReason:"tag_coverage_low"`(badge 缺失使 coverage=3/4<0.9),violations/missing 清单同样驱动修正;1~3 轮修正后 `step` 输出 `"verdict":"pass"` 且 `exit=10`。

**Step 9:finalize——机判验收 + 落档 + commit(约 4 分钟)**

```bash
node scripts/phase0-acceptance.mjs finalize
```

预期输出:`验收通过:docs/phase0-acceptance.md 已生成,latency_baseline.phase0_loop 已写入 .claude/plans/magpie-eye-full-impl/meta.json`(exit 0)。

机判复核(即 orchestration 的"验收脚本核对"):

```bash
node -e '
const fs=require("fs");
const cfg=JSON.parse(fs.readFileSync("scripts/phase0-config.json","utf8"));
const report=JSON.parse(fs.readFileSync(cfg.reportPath,"utf8"));
const state=JSON.parse(fs.readFileSync(cfg.stateDir+"/state.json","utf8"));
if(report.pass!==true){console.error("最终 report pass!==true");process.exit(1);}
if(state.rounds.length>5){console.error("轮次>5");process.exit(1);}
if(!fs.existsSync(cfg.docPath)){console.error("缺 docs/phase0-acceptance.md");process.exit(1);}
const meta=JSON.parse(fs.readFileSync(cfg.metaPath,"utf8"));
if(!meta.latency_baseline?.phase0_loop?.p50CheckMs){console.error("meta 缺 latency_baseline.phase0_loop");process.exit(1);}
console.log(`Phase 0 验收达标:${state.rounds.length} 轮,p50 check=${meta.latency_baseline.phase0_loop.p50CheckMs}ms`);'
npm test   # 全量回归仍绿
```

预期:`Phase 0 验收达标:N 轮,p50 check=XXXXXms`(exit 0)且 `npm test` exit 0。

标记任务完成并提交(修好的卡片 + 报告 + meta 一并入库):

```bash
node -e '
const fs=require("fs"),p=".claude/plans/magpie-eye-full-impl/meta.json";
const m=JSON.parse(fs.readFileSync(p,"utf8"));
m.tasks["T1.4"]={status:"done"};
fs.writeFileSync(p,JSON.stringify(m,null,2));'
git add demo-android docs/phase0-acceptance.md .claude/plans/magpie-eye-full-impl/meta.json
git commit -m "[T1.4] Phase 0 端到端验收通过:N 轮修至 L2 全过,latency_baseline 落档"
node -e '
const fs=require("fs"),p=".claude/plans/magpie-eye-full-impl/meta.json";
const m=JSON.parse(fs.readFileSync(p,"utf8"));
m.tasks["T1.4"].last_commit=require("child_process").execSync("git rev-parse HEAD").toString().trim();
fs.writeFileSync(p,JSON.stringify(m,null,2));'
git add .claude/plans/magpie-eye-full-impl/meta.json && git commit -m "[T1.4] meta:记录 last_commit"
```

(commit message 中 `N` 替换为实际轮数。)

**Step 10:失败分支处置(仅当 Step 8 得 exit=20/21 时执行)**

Phase 0 是硬门:未达标**不得进入 M2**,按编排计划回 Codex 决断。

```bash
node -e '
const fs=require("fs"),p=".claude/plans/magpie-eye-full-impl/meta.json";
const m=JSON.parse(fs.readFileSync(p,"utf8"));
m.tasks["T1.4"]={...(m.tasks["T1.4"]??{}),status:"blocked"};
m.blockers=m.blockers??[];
m.blockers.push({id:"T1.4-phase0-gate",detail:"Phase 0 验收未达标(max_rounds 或 regression),已回 Codex 决断",at:new Date().toISOString()});
fs.writeFileSync(p,JSON.stringify(m,null,2)); console.log("T1.4 blocked 已登记");'
```

然后用 meta.json `codex.thread_id` 经 `codex-reply`(或降级通道)发送,附:① 全部 `round-*.report.json`(剥离版)内容;② state.json 逐轮数据;③ 失败原因(max_rounds / regression + regressionReason);④ 待决断问题——"违规清单/hint 表达力不足(改 T1.3 hint 模板)还是断言口径问题(改 L2 容差),修正方向裁定后重跑 T1.4"。Codex 决断落地后从 Step 8 `reset` 重跑;累计争议超 10 轮升级用户。

#### 本任务完成定义(全部机判)

1. `npm test` exit 0(含 phase0-lib 三分支单测与 harness 冒烟测试);
2. `node scripts/phase0-acceptance.mjs finalize` exit 0,且 Step 9 复核脚本 exit 0(最终 report.json `pass=true`、轮次 ≤5、`docs/phase0-acceptance.md` 存在、`meta.json.latency_baseline.phase0_loop` 存在);
3. 修正循环全程修正者仅收到剥离 artifacts 的 report.json(单测保证无 `.png` 路径),第 1 轮检出能力门通过(无 exit 31),且无 exit 30 协议违规;
4. `git log --oneline | head -6` 可见带 `[T1.4]` 前缀的提交,`meta.json.tasks["T1.4"].status == "done"` 且 `last_commit` 已记录。

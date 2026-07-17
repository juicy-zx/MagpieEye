# .ui-verify 运行目录契约(uiv check 的输入/输出根)

`uiv check` 以**当前工作目录**的 `.ui-verify/` 为产物根。最小就绪结构:

```
<runDir>/.ui-verify/
  mapping.json
  baselines/<nodeId连字符>@<version>/spec.json     # 冻结 L2 基线;39:10822 → 目录名 39-10822@<ver>
  baselines/<...>/baseline.png                      # 可选;有则跑 L1 像素(advisory)
```

mapping.json(数组,一节点一条):

```json
[
  {
    "fileKey": "hH7NUAlm9DsLRaGScQP0Z1",
    "nodeId": "39:10822",
    "version": "2342874355766877359",
    "minScore": 0.9,
    "matrix": "l-shape"
  }
]
```

## 取得冻结 spec 的两条路

1. **在线冻结**(有 FIGMA_PAT):在 runDir 下执行 `FIGMA_PAT=<pat> uiv pin --file <fileKey> --node <nodeId> --test <ScreenshotTest 全限定名> --demo <Android工程根>` → 落 spec.json 并**同时写好 mapping.json**(默认 minScore 0.9、matrix l-shape,含 testFqn/demoDir)。baseline.png 未拉到时仅 WARN(L1 advisory 缺席,非阻塞)。勘误(2026-07-16 实测):`baseline pull` 只支持罐头 fixture 模式(其 `--fixture` 是 fixture 文件路径,传 runDir 目录会 EISDIR),不走 REST——在线冻结一律用 `pin`。
2. **复用已冻结件**:从别处拷贝 `spec.json`(冻结基线是自包含 JSON,可离线复用;mapping 的 version 须与 spec 内 version 一致)。

## 运行

```bash
cd <runDir>
UIV_RERUN=1 node <uiv-cli>/dist/index.js check \
  --preview <pkg>.<Name>Preview --node <nodeId> \
  --demo <Android工程根> --module :app          # --variant debug 默认;--sandbox 隔离 opt-in
```

- stdout 末行 = report.json 绝对路径;exit 0=pass / 1=fail / 2=用法或异常
- report 位置:`.ui-verify/reports/<node>@<ver>/report.json`;渲染件在 `renders/<node>@<ver>/`
- 先跑 `uiv preflight --project <工程根> --module :app --json` 可静态查环境门(JDK/AGP/minSdk 等)

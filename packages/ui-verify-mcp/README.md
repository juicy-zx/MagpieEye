# @magpie-eye/ui-verify-mcp

鹊眼 UI 验收的 **MCP stdio 门面**(T4.1,设计文档 2.6 三工具门面 / 5.2 形态 B)。
Claude Code 经 MCP 直接完成 Phase 0 同场景验收:渲染 → L1 像素 + L2 结构裁判 → 结构化 report。

裁判/编排逻辑零重复:`ui-verify-mcp → @magpie-eye/uiv-cli/commands → @magpie-eye/uiv-core`,
与 `uiv` CLI 同源(commands.ts 为 CLI 编排复用层)。`pin` / `--record`(涉 git 资产提交语义)
及 HTTP transport / 鉴权 **不做 MCP 工具**(CLI 已覆盖;stdio 单机门面)。

## 三工具契约

| 工具 | 必填 | 可选 | 语义 |
|---|---|---|---|
| `ui_check` | `preview`, `node`, `demo` | `version`, `ignoreRegion{x,y,w,h}` | = `uiv check`(无 `--record`) |
| `ui_verify_page` | `test`, `node`, `demo`, `session` | `version`, `states[]`, `matrix`, `out` | = `uiv verify-page`(无 `--json`,恒返回 report) |
| `ui_baseline` | `fixture`, `file`, `node` | — | = `uiv baseline pull`(REST 通道待 B1,同 CLI) |

### 返回口径

- 单块 **text content**(JSON 字符串);**不声明 outputSchema**(防与 core 校验器双源漂移)。
- `ui_check` / `ui_verify_page` 返回 `{reportPath, report}`:
  - `ui_check` 的 `report` **剥离 `artifacts` 字段**(PNG/diff 路径留盘上 `report.json`,模型按需 `Read`;
    与 CLI「末行给路径、内容自取」同口径);盘上 `report.json` 的 `artifacts` 完整。
  - `ui_verify_page` 的 page-report **无顶层 artifacts**,原样返回(`perCell[].reportPath` 指向逐格盘上报告)。
- `ui_baseline` 返回 `{specPath, baselinePngExists}`。
- **`pass:false` 是正常返回**(报告即产品,不置 `isError`)。
- `CliUsageError` / 其余异常 → `isError:true` + 文本 `uiv: <message>`,server 不崩。

### 生命周期与并发

- 每次工具调用 `finally` 释放 odiff server 子进程(与命令层 finally 双调用 = 幂等双保险,防悬挂)。
- 工具执行经 promise 队列 **串行**(state.json 读改写 / odiff 单例 / demo gradle 锁均非并发安全)。
- host 关停 stdin(EOF)或 `SIGINT` / `SIGTERM` → 清场后 `exit 0`。

## 注册(`.mcp.json`)

以项目根为 cwd 拉起 stdio server,`.ui-verify` / demo 相对路径就地解析:

```json
{
  "mcpServers": {
    "ui-verify": {
      "command": "node",
      "args": ["packages/ui-verify-mcp/dist/index.js"]
    }
  }
}
```

先 `npm run build`(产 `dist/`)。server 在 Bash 沙箱外运行(设计文档 5.2 形态 B):
冷路径(spawn `./gradlew`)自足;无人值守 sandbox-runtime 下要触达外部 daemon(热路径)需 `allowUnixSockets`。

## 交互演示(补充,非验收)

```
claude mcp list                 # 见 ui-verify
# 会话内调 ui_check:preview=com.magpie.uiv.demo.CalibCardPreview node=1:100 demo=demo-android(cwd=仓库根)
```

验收(可机判)见 `src/stdio-e2e.test.ts`(mock-gradlew fixture 端到端)与 `src/lifecycle.test.ts`(退出机判)。

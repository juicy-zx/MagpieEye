# M3(Phase 2)代码级子计划 — magpie loop 接入

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。逐任务执行;口径疑点回 Codex。
> 上游:orchestration.md M3 表 + 第 5 节 D-09 条目(双保险架构,本子计划的宪法);T3.0 核验报告事实(magpie HEAD 4d86bbc5)。
> 方向锚定:M3 北极星 = 一个 ui_change 需求在 magpie loop 全自动跑通,且"只缺 ui_visual_validation → session 终态不得 completed"端到端硬验收。
> magpie_agent 纪律:分支 feature/ui-visual-validation(T3.1a Step 0 自建);符号名+代码特征定位,禁死行号;存量回归门 = 失败集 ⊆ 3 条 Go 环境性基线。

## 执行波次(编排者裁定)

- **Wave A(并行,跨仓库互斥)**:T3.1a(magpie 合同证据层)、T3.2(uiv pin,uiv 仓库)。
- **Wave B(A 后)**:T3.1b(magpie 执行层,依赖 T3.1a 的 contract.uiParity 结构)、T3.4(uiv l2/invariant + demo Rule 扩展)。
- **Wave C(B 后)**:T3.3(verify-page,依赖 T3.4 落地后的 runL2 现状——两章均动 runL2/check 域与 demo-android,严格串行)。
- **Wave D(全后)**:T3.5(端到端反例集)。
- 共享文件:magpie 侧 execute.ts/requirement-contract.ts 由 Wave 串行天然互斥;uiv barrel 登记制照旧;meta.json 归编排者。

## 跨章契约裁定(以本节为准,章内缺失处补齐)

1. **verify-page 统一调用契约**:`uiv verify-page --test <FQN> --node <nodeId> --demo <dir> --session <id> --json --out <path>`;page-report v1 必含 `sessionId: string`(T3.1b schema 校验三键之一,standalone 跑允许 'standalone' 字面量);`--test`/`--node`/`--demo` 由 T3.1b 从 `contract.uiParity` 唯一 entry 读取组装(entry 新增 `testFqn`/`demoDir`,见 T3.2 口径钉死),禁止隐式默认。
2. **report 目标关联校验**:T3.1b adapter 增分支——`report.nodeId`+`version` 须命中当前 uiParity entry,不命中判 finding;`contract.uiParity.entries.length > 1` 时 M3 fail-fast(finding `'multiple uiParity entries not supported in M3'`,留 M4)。PageReport 顶层保留 `nodeId`/`version`/`matrix`(T3.3 schema,供本项消费)。
3. **re-persist 触发标记消费**(T3.2 定义写 `.magpie/uiv-repersist.json`):消费点归 **T3.1b** 的 execute.ts 接线步骤——在 validateRequirementContract 之前检查该标记,存在则先调 persistRequirementContract(workspaceRoot) 再删标记(幂等);T3.1a 只保证 persist 可带 workspaceRoot 重建。T3.1b 执行 agent 据此在其 S2 步骤内补一小步(含单测:标记在场→合同含 uiParity→标记被清)。
4. **hash 双轨**:scope.sourceDocumentHash 用 magpie 现行 hashContent(sha1 hex,**非** `sha256:<hex>`);mapping.json.sig sidecar 完整性摘要用 sha256,sidecar 统一落 `.ui-verify/mapping.json.sig`(随 mapping.json 入库,**不**落 `.ui-verify/state/mapping.sha256`)。两者用途不同不得混用;T3.1b 受控豁免同时识别 `mapping.json` 与 `mapping.json.sig` 两条路径。
5. **states[] canonical schema**(T3.1a/T3.2/T3.3/T3.4 四章统一):`states?: { name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }[]`;COMPONENT_SET 自动枚举/显式 `--state` 写入恒 `judgePath:'parity'` 且必带 `figmaVariantNodeId`;T3.3 据此字段路由。
6. **口径裁定(经 Codex 随子计划审查裁定,替换原"待裁定"表述)**:① invariant 违规不入 parity 态 runL2 的 score 分母,经 high/blocking severity 阻断 pass;invariant-only 报告的 score 仅 informational,pass/fail 只看有无 high/blocking 违规;② `missingContentDescription` 的文本豁免收窄为**同一 clickable semantics subtree 内的非空可见文本**(后代,非兄弟)——图标按钮旁的兄弟标签不豁免;③ invariant-only 报告 `untaggedCoverage`/`matchRate` 置 1,必标 `judgePath:'invariant-only'`+`parityUnavailable:true`,`structural.invariant.executed` 如实暴露执行数;④ `mapping.json.sig` 非安全边界,只是受控写入标记,蓄意伪造靠 PR review/git diff 兜底(见 T3.1b 残余风险)。T3.3"非 base 格暂 render-only"边界据①③精神收窄:base×invariant-only 态 M3 即走 `runInvariantOnly`;仅 fontScale1.3/smallPhone/tablet(及 pixel5-dark 无 pin 态)×invariant-only 暂留 render-only(M4 全格化),详见 T3.3 口径钉死③。

---

# T3.1a —— magpie_agent 合同与证据层(D-09 A 辅通道 + D/E)

**目标**:在 `/Users/zhuxi/AI/magpie_agent`(分支 `feature/ui-visual-validation`,基点 main@4d86bbc5)落地 `ui_visual_validation` 证据类型、artifacts 通道、构建器 uiParity 合并(作用域过滤+漂移告警+专属判定单元+coverageUnit),及 `persistRequirementContract` 透传 workspaceRoot 与**双调用点同步**(execute.ts 会话启动 + webhook-console 修订重建)。锚点=符号名+代码特征,禁死行号。

**不做(T3.1b/T3.2)**:adapter 主通道、verify-page 触发、`.ui-verify` 豁免、`uiv pin`;辅通道只保证计算正确+报告可见+防 ANY-of 回归,不宣称阻断 completed。

## Step 0:分支与基线

```bash
cd /Users/zhuxi/AI/magpie_agent
git status --short   # 必须为空,否则停
git checkout -b feature/ui-visual-validation 4d86bbc5 || git checkout feature/ui-visual-validation
npm run test:run -- tests/capabilities/loop/evidence-taxonomy.test.ts \
  tests/platform/webhook-console/agent-control.test.ts
```
不绿即停,报告编排者。

## Step 1:证据类型 + artifacts 通道

**红**:`tests/capabilities/loop/evidence-taxonomy.test.ts` describe 末尾追加;定向跑 → fail(union 缺类型,TS 红)。

```ts
  it('collects ui visual validation evidence when uiVisualValidationPath is present', () => {
    const session = { artifacts: { uiVisualValidationPath: '/tmp/uvv.json' } } as unknown as Pick<LoopSession, 'artifacts'>
    expect(collectRequirementEvidence(session)).toEqual([{ type: 'ui_visual_validation', path: '/tmp/uvv.json' }])
  })
```

**绿**(三处):
1. `src/capabilities/loop/application/evidence-taxonomy.ts`:`RequirementEvidenceType` union(8 成员,末位 `'coverage_report'`)追加 `| 'ui_visual_validation'`;
2. 同文件 `collectRequirementEvidence`:最后一个 if(`requirementCoverageReportPath`)之后、`return items` 之前插入:
```ts
  if (artifacts.uiVisualValidationPath) {
    items.push({ type: 'ui_visual_validation', path: artifacts.uiVisualValidationPath })
  }
```
3. `src/state/types.ts`:`LoopSession.artifacts` 内 `greenTestResultPath?: string` 行后加 `uiVisualValidationPath?: string`(经 `core/state` 的 `export *` 透出,零 barrel 改动)。

验收:定向全绿 + `npm run check:tests-types`。
**commit**:`feat(loop): T3.1a ui_visual_validation 证据类型与 uiVisualValidationPath 通道`

## Step 2:构建器合并 uiParity

**红**:新建 `tests/capabilities/loop/ui-parity-contract.test.ts`;定向跑 → fail(`UI_PARITY_EVIDENCE_LABEL` 等符号不存在)。

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  UI_PARITY_EVIDENCE_LABEL, buildRequirementContract, buildRequirementSpec,
  persistRequirementContract, validateRequirementContract,
} from '../../../src/capabilities/loop/application/requirement-contract.js'
import type { LoopSession } from '../../../src/core/state/index.js'

function setupWorkspace(mappingEntries?: unknown[]): { root: string; prdPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'magpie-ui-parity-'))
  mkdirSync(join(root, 'docs'), { recursive: true })
  const prdPath = join(root, 'docs', 'checkout-prd.md')
  writeFileSync(prdPath, '# PRD\n\n## 需求\n\n- 结算页 UI 弹窗按设计稿实现\n', 'utf-8')
  if (mappingEntries) {
    mkdirSync(join(root, '.ui-verify'), { recursive: true })
    writeFileSync(join(root, '.ui-verify', 'mapping.json'), JSON.stringify(mappingEntries), 'utf-8')
  }
  return { root, prdPath }
}

function pinEntry(sourceDocumentPath: string, scopeExtra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fileKey: 'FKEY', nodeId: '1:100', version: 'V7', minScore: 0.9, matrix: 'default5',
    testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android',
    scope: { sourceDocumentPath, pinnedAt: '2026-07-09T00:00:00Z', ...scopeExtra },
  }
}

describe('requirement contract uiParity', () => {
  it('merges scoped entries; hash drift only flags', () => {
    const { root, prdPath } = setupWorkspace([
      pinEntry('docs/checkout-prd.md'),
      { ...pinEntry('docs/checkout-prd.md', { sourceDocumentHash: 'deadbeef' }), nodeId: '2:200' },
    ])
    const contract = buildRequirementContract({ sourceDocumentPath: prdPath, sourceDocumentKind: 'prd', workspaceRoot: root })
    expect(contract.uiParity?.entries.map((e) => [e.nodeId, e.minScore, e.sourceDocumentDrifted]))
      .toEqual([['1:100', 0.9, false], ['2:200', 0.9, true]])
    expect(contract.acceptance.requiredEvidence).toContainEqual({
      label: UI_PARITY_EVIDENCE_LABEL, declaredEvidenceTypes: ['ui_visual_validation'],
    })
    const specItem = buildRequirementSpec(contract).requirements.find((r) => r.title === UI_PARITY_EVIDENCE_LABEL)
    expect(specItem).toMatchObject({ category: 'validation_requirement', expectedEvidenceTypes: ['ui_visual_validation'] })
  })

  it('ignores other-document pins and unscoped pins; no merge without workspaceRoot', () => {
    const { root, prdPath } = setupWorkspace([
      pinEntry('docs/other-task-prd.md'),
      { fileKey: 'FKEY', nodeId: '9:9', version: 'V1', minScore: 0.9, matrix: 'default5' },
    ])
    const contract = buildRequirementContract({ sourceDocumentPath: prdPath, sourceDocumentKind: 'prd', workspaceRoot: root })
    expect(contract.uiParity).toBeUndefined()
    expect(contract.acceptance.requiredEvidence.map((i) => i.label)).not.toContain(UI_PARITY_EVIDENCE_LABEL)
    expect(buildRequirementContract({ sourceDocumentPath: prdPath, sourceDocumentKind: 'prd' }).uiParity).toBeUndefined()
  })
})
```

**绿**:改 `src/capabilities/loop/application/requirement-contract.ts`。
(a) `RequirementContract` 接口前新增导出,并在其 `coverageUnits` 成员后追加 `uiParity?: RequirementUiParity`:

```ts
export const UI_PARITY_EVIDENCE_LABEL = 'UI 视觉还原验收（uiParity）'

export interface UiParityMappingScope {
  sourceDocumentPath: string
  sourceDocumentHash?: string
  pinnedAt?: string
}

export interface UiParityMappingEntry {
  fileKey: string
  nodeId: string
  version: string
  minScore: number
  testFqn: string
  demoDir: string
  matrix?: string
  states?: { name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }[]
  scope?: UiParityMappingScope
}

export interface RequirementUiParityEntry extends Omit<UiParityMappingEntry, 'scope'> {
  scope: UiParityMappingScope
  sourceDocumentDrifted: boolean
}

export interface RequirementUiParity {
  mappingPath: string
  entries: RequirementUiParityEntry[]
}
```

(b) 模块私有合并函数(置于 `buildRequirementContract` 前;复用既有私有工具 `toRepoRelativePath`/`normalizeRelativePath`/`hashContent`(sha1 hex)):

```ts
function mergeUiParityFromMapping(workspaceRoot: string, sourceDocumentPath: string, sourceDocumentRaw: string): RequirementUiParity | undefined {
  const mappingPath = join(workspaceRoot, '.ui-verify', 'mapping.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(mappingPath, 'utf-8'))
  } catch {
    return undefined // 无文件或解析失败：不合并（完整性追责在 T3.1b adapter）
  }
  if (!Array.isArray(parsed)) {
    return undefined
  }
  const sourceRelative = toRepoRelativePath(workspaceRoot, sourceDocumentPath)
  const sourceHash = hashContent(sourceDocumentRaw)
  const entries: RequirementUiParityEntry[] = []
  for (const item of parsed as UiParityMappingEntry[]) {
    const scope = item?.scope
    if (!scope?.sourceDocumentPath || !item.fileKey || !item.nodeId || !item.version || !item.testFqn || !item.demoDir
      || typeof item.minScore !== 'number' || normalizeRelativePath(scope.sourceDocumentPath) !== sourceRelative) {
      continue
    }
    const drifted = Boolean(scope.sourceDocumentHash && scope.sourceDocumentHash !== sourceHash)
    if (drifted) {
      console.warn(`[requirement-contract] uiParity pin ${item.nodeId}@${item.version}：源文档已变更，仅告警仍合并`)
    }
    entries.push({ ...item, scope, sourceDocumentDrifted: drifted })
  }
  return entries.length > 0 ? { mappingPath, entries } : undefined
}
```

缺 `testFqn`/`demoDir` 的条目与无 `scope` 的条目一样直接跳过(不合并入 `uiParity`)——兼容 legacy pull 写入、未带这两个字段的历史 mapping.json 条目;通用 mapping 条目的 `testFqn`/`demoDir` 是否必填见 T3.2 口径钉死①(pin 写入恒含,legacy pull 条目可缺省)。

(c) `buildRequirementContract` 的 input 签名增 `workspaceRoot?: string`;`coverageUnits` 数组字面量后、最终 `return` 前插入:

```ts
  const uiParity = input.workspaceRoot
    ? mergeUiParityFromMapping(input.workspaceRoot, input.sourceDocumentPath, raw)
    : undefined
  if (uiParity) {
    explicitRequiredEvidence.push({ label: UI_PARITY_EVIDENCE_LABEL, declaredEvidenceTypes: ['ui_visual_validation'] })
    coverageUnits.push({
      id: 'ui-parity-1',
      title: UI_PARITY_EVIDENCE_LABEL,
      category: 'validation_requirement',
      rationale: uiParity.entries.map((e) => `${e.fileKey}/${e.nodeId}@${e.version} minScore=${e.minScore}`).join('; '),
      status: 'planned',
      evidence: [],
    })
  }
```

(d) 最终 `return` 对象追加 `...(uiParity ? { uiParity } : {})`。不动扁平 `requiredEvidenceTypes`(ANY-of 语义下加了也无强制力,强制靠单类型专属条目)。

要点:coverageUnit.title 必须等于 requiredEvidence.label(`buildRequirementSpec` 按 label===title 关联);missingEvidence 对 requiredEvidence 逐条 `hasEvidenceType`,单类型条目=必备。

验收:定向本文件 + source-document-contract.test.ts 回归全绿。
**commit**:`feat(loop): T3.1a 构建器按作用域合并 mapping.json 为 uiParity 专属判定单元`

## Step 3:persist 透传 + 幂等/ANY-of 守卫

**红**:同测试文件 describe 内追加;定向跑 → fail(persist 不收第二参,TS 红)。

```ts
  it('persist is idempotent; ANY-of guard flags missing ui evidence', async () => {
    const { root, prdPath } = setupWorkspace([pinEntry('docs/checkout-prd.md')])
    const sessionDir = join(root, '.magpie', 'sessions', 'loop', 'loop-ui')
    mkdirSync(sessionDir, { recursive: true })
    const session = {
      id: 'loop-ui', prdPath, sourceDocumentPath: prdPath, sourceDocumentKind: 'prd',
      artifacts: { sessionDir, workspacePath: root },
    } as unknown as LoopSession
    await persistRequirementContract(session, { workspaceRoot: root })
    const second = await persistRequirementContract(session) // 无 options：走 workspacePath 回退
    const contract = JSON.parse(readFileSync(second!, 'utf-8')) as {
      uiParity?: { entries: unknown[] }
      acceptance: { requiredEvidence: Array<{ label: string }> }
      coverageUnits: Array<{ id: string }>
    }
    expect(contract.uiParity?.entries).toHaveLength(1)
    expect(contract.acceptance.requiredEvidence.filter((i) => i.label === UI_PARITY_EVIDENCE_LABEL)).toHaveLength(1)
    expect(contract.coverageUnits.filter((u) => u.id === 'ui-parity-1')).toHaveLength(1)
    session.artifacts.greenTestResultPath = join(root, 'green.json')
    const blocked = await validateRequirementContract(session)
    expect(blocked?.missingEvidence).toContainEqual({
      label: UI_PARITY_EVIDENCE_LABEL, expectedEvidenceTypes: ['ui_visual_validation'],
    })
    session.artifacts.uiVisualValidationPath = join(root, 'uvv.json')
    const cleared = await validateRequirementContract(session)
    expect(cleared?.missingEvidence.map((i) => i.label)).not.toContain(UI_PARITY_EVIDENCE_LABEL)
  })
```

**绿**:
1. `persistRequirementContract`(锚点:调用 `writeJsonFileAtomic` 的原子写函数)签名加 `options?: { workspaceRoot?: string }`;kind 守卫后解析并传入构建器,path 复用→原子写→回填 artifacts 三段不动:
```ts
  const workspaceRoot = options?.workspaceRoot || session.artifacts.workspacePath || session.artifacts.repoRootPath
  const contract = buildRequirementContract({
    sourceDocumentPath: session.sourceDocumentPath || session.prdPath,
    sourceDocumentKind,
    workspaceRoot,
  })
```
2. `execute.ts` 调用点(锚点:`persistedSession = session` 后、`persistRequirementSpec` 前的唯一调用;`workspacePath` 即 `captureAutoCommitBaseline({ cwd: workspacePath })` 所用局部变量):
```ts
  const requirementContractPath = await persistRequirementContract(session, { workspaceRoot: workspacePath })
```

验收:定向全绿 + `npm run check:tests-types` + `npm run build`(execute.ts 编译过=调用点同步机判)。
**commit**:`feat(loop): T3.1a persist 透传 workspaceRoot + 幂等/ANY-of 守卫`

## Step 4:webhook 第二调用点(D-09 E)

**红**:改 `tests/platform/webhook-console/agent-control.test.ts` 既有用例 `applies approved amendment proposals with source versioning and loop rewind`(既有 harness,只做加法)。
插入 A——该用例内写入 prdPath 的 `writeFileSync` 之后:
```ts
    mkdirSync(join(rootPath, '.ui-verify'), { recursive: true })
    writeFileSync(join(rootPath, '.ui-verify', 'mapping.json'), JSON.stringify([{
      fileKey: 'FKEY', nodeId: '1:100', version: 'V7', minScore: 0.9, matrix: 'default5',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android',
      scope: { sourceDocumentPath: 'docs/checkout-prd.md', pinnedAt: '2026-07-09T00:00:00Z' },
    }]), 'utf-8')
```
插入 B——用例末尾(`governance-events.jsonl` 断言后):
```ts
    const contract = JSON.parse(readFileSync(join(sessionDir, 'requirement-contract.json'), 'utf-8')) as {
      uiParity?: { entries: Array<{ nodeId: string }> }
      acceptance: { requiredEvidence: Array<{ label: string; declaredEvidenceTypes: string[] }> }
    }
    expect(contract.uiParity?.entries.map((e) => e.nodeId)).toEqual(['1:100'])
    expect(contract.acceptance.requiredEvidence).toContainEqual({
      label: 'UI 视觉还原验收（uiParity）', declaredEvidenceTypes: ['ui_visual_validation'],
    })
```
定向跑 → fail:该 session 的 artifacts 无 workspacePath/repoRootPath 且 webhook 未传 workspaceRoot → uiParity 被修订重建静默洗掉(D-09 E 要防的断裂)。pin 不带 hash,免修订后漂移噪声。

**绿**:`agent-control.ts` 的 `applyApprovedAmendment` 内(锚点:`applyPendingGovernedAmendment(...)` 后):
```ts
    const contractPath = await persistRequirementContract(loopSession, {
      workspaceRoot: loopSession.artifacts.workspacePath || loopSession.artifacts.repoRootPath || project.rootPath,
    })
```
验收:定向 agent-control.test.ts 全绿。
**commit**:`feat(webhook): T3.1a 修订重建透传 workspaceRoot 防 uiParity 静默丢失（D-09 E）`

## Step 5:总闸与交付

```bash
cd /Users/zhuxi/AI/magpie_agent
npm run check:tests-types && npm run build && npm run lint
npm run test:run   # 仅允许既有 3 个 Go 环境性 fail;新增用例全绿
```
lint 仅盯本章文件新增报错;回报编排者:4 个 commit hash、全量 pass/fail 计数、新增导出符号。

## 对 T3.1b/T3.2 的接口冻结

- 导出:`UI_PARITY_EVIDENCE_LABEL`、`RequirementUiParity(Entry)`、`UiParityMappingEntry/Scope`;entry 含 `sourceDocumentDrifted`;T3.1b adapter 以 `contract.uiParity` 为触发指纹。
- mapping.json:顶层数组(兼容 uiv-core 现行 schema);`scope.sourceDocumentPath` 为 workspaceRoot 相对路径;`sourceDocumentHash`=源文档全文 sha1 hex(同合同 `hashContent`,T3.2 pin 必须对齐);无 scope 条目永不入合同。
- entry 恒含 `testFqn`/`demoDir`(T3.2 pin 写入,T3.1b 组装 verify-page 调用串的唯一来源,禁止硬编码/隐式默认);缺任一者视同不合法条目,合并时跳过(同 fileKey/nodeId 等既有必填字段处理)。
- `states?: { name; judgePath:'parity'|'invariant-only'; figmaVariantNodeId? }[]`(states[] canonical schema,T3.1a/T3.2/T3.3/T3.4 四章统一,本章原样透传不解读)。
- 无 mapping/无匹配条目:合同零变化、不产生 `uiVisualValidationPath`(M3 表 T3.1 验收,由 Step 2 用例 2 覆盖)。


---

# T3.1b — magpie_agent 执行层硬门禁(D-09 A 主通道 + B verify-page 触发 + C 窄豁免)

> 公共事实源同 T3.1a:magpie_agent HEAD `4d86bbc5`(main),开发分支 `feature/ui-visual-validation`;**禁止依赖死行号**,一律符号名 + 代码特征定位;测试基线 = 改动前 `npx vitest run tests/capabilities/loop/` 全绿并记录用例数,完工后存量零回归。工作目录 `/Users/zhuxi/AI/magpie_agent`。

## 0. 依赖与范围

**前置依赖(T3.1a 已落地)**:① `RequirementContract` 新增可选 `uiParity` 字段(本章只判 `contract.uiParity != null`,不消费内部结构);② `LoopSession.artifacts.uiVisualValidationPath?: string`(state/types.ts);③ `RequirementEvidenceType` 含 `'ui_visual_validation'`。若 T3.1a 未合入,本章所有步骤编译不过——顺序硬约束。

**本章产出**:
- S1:uiParity 硬门禁 adapter(requirement-type-adapters.ts,含 context 注入扩展);
- S2:verify-page 触发器(新文件 ui-visual-validation.ts + execute.ts 一处接线);
- S3:scope-drift 窄豁免(requirement-contract.ts `detectRequirementScopeDiff` 内部,uiParity 门控);
- S4:验收测试与回归。

**不做**(防扩散):mapping.json 合并进合同(T3.1a)、`uiv pin`/sidecar 写入端(T3.2)、verify-page 本体与 page-report 生成/失败分类映射/retryStateNote(T3.3)、五反例端到端(T3.5)。

## 1. 已实读的生效链事实(设计依据,勿再核验行号)

- `decideRequirementCompletion(validation, coverage, 'implementation')`(requirement-contract.ts):`implementationReasons` 包含 `validation.typeFindings` 的 message;scope==='implementation' 时 **missingEvidence 被豁免、typeFindings 不被豁免**——任一 typeFinding ⇒ status:'fail'。这就是 D-09 主通道的生效层:adapter 产 finding 即阻断 implementation 完成,与 severity 无关(`validateRequirementContract` 的 passed 判定也要求 `typeFindings.length===0`)。
- execute.ts `if (stage === 'implementation')` 块(特征:`const contractValidation = await validateRequirementContract(session)`):先 validate → persist → scopeDiff → coverage → `decideRequirementCompletion(...,'implementation')`;fail 且 `failureCategory==='scope_drift'` 时走 `restoreOutOfScopeFiles/restoreOutOfScopeHunks`(git restore --source=HEAD,**仅 git 跟踪文件**);typeFindings 走 evidence_gap 类别,decision 层丢弃 evidence_gap 类别但保留 fail 状态,不触发 restore——阻断与回滚两条路互不干扰。
- `validateRequirementTypes(contract)` 唯一调用点在 `validateRequirementContract(session)` 内(session 可得,context 有注入通道)。现有 adapter 均为纯合同形状校验;`RequirementTypeValidationFinding` 的 category 枚举现为三值,union 可安全扩。
- `detectRequirementScopeDiff(contract, changedFiles, options)`:先按 `ignoredPaths`(**精确路径匹配**,非前缀)过滤,再经 `isMagpieRuntimePath` 过滤 `.magpie/**` 运行态(受管交付物 `MAGPIE_MANAGED_DELIVERABLES` 例外)——**这就是"运行态豁免 + 受管产物例外"的现成先例**,S3 完全仿此模式;`allowedFiles` 为空时 fail-open。
- `runSafeCommand(cwd, command, options)`(runtime.ts,特征:execFileSync + parseCommandArgs):无 shell,PATH 解析可执行文件;返回 `{passed, output}`,非零退出/超时/阻断均 `passed:false` 不抛异常;支持 `timeoutMs`、`governance`。
- 会话目录真实形态是 `<repo>/.magpie/sessions/loop/<id>/`(state-manager),**代码一律用 `session.artifacts.sessionDir`**,不硬拼设计文档的 `.magpie/sessions/<id>/` 字面量。
- `readGitDirtyPaths` 基于 git status(含未跟踪条目;整目录未跟踪时可能折叠为目录条目)。

## 2. S1 — uiParity 硬门禁 adapter(TDD:先写拒绝分支测试)

**文件**:`src/capabilities/loop/application/requirement-type-adapters.ts`;测试 `tests/capabilities/loop/requirement-type-adapters.test.ts`(沿用现有 `baseContract(overrides)` helper)。

### 2.1 接口扩展(向后兼容)

```ts
export interface RequirementTypeValidationContext {
  sessionId?: string
  uiVisualValidationPath?: string        // session.artifacts.uiVisualValidationPath
  latestImplementationChangeMtimeMs?: number // 本轮脏源文件最大 mtime(见 2.3)
}
```
- `RequirementTypeAdapter.validate(contract, context?)`、`validateRequirementTypes(contract, context?)` 增可选第二参;现有五个 adapter 签名不动(TS 允许实现少参)。
- `RequirementTypeValidationFinding.category` union 追加 `'ui_visual_validation_gate'`;severity 用现有 `'high'`。
- 调用点改造:`validateRequirementContract` 内 `validateRequirementTypes(contract, context)`,context 由 session 组装(sessionId=session.id、path=artifacts 字段、mtime 见 2.3)。

### 2.2 门禁逻辑(不进 adapters 数组的 per-type 循环)

uiParity 不是 `RequirementType`,不按 `contract.requirementTypes` 触发。在 `validateRequirementTypes` 末尾追加:`if (contract.uiParity) findings.push(...validateUiParityGate(contract, context))`。`validateUiParityGate` 导出(便于单测),按序短路产出**恰一条** finding(type:'ui_change', severity:'high', category:'ui_visual_validation_gate'):

0. **multiple_entries**(结构前置检查,先于报告读取,不依赖文件):`contract.uiParity.entries.length > 1` → "同一源文档命中多条 uiParity pin,M3 暂不支持多 entry(multiple uiParity entries not supported in M3),请拆分需求或精简 pin;支持留 M4"——命中即返回,不再往下走(避免猜测该用哪条 entry 组装/校验);
1. **missing**:`context?.uiVisualValidationPath` 空 → "uiParity 合同要求 UI 视觉验收,本轮未产出 ui-visual-validation report(verify-page 未运行/被阻断/工具链故障)";
2. **not_found**:`existsSync(path)` 为假 → 同类措辞;
3. **parse_failed**:readFileSync + JSON.parse 抛错 → "report 无法解析";
4. **schema_mismatch**:最小结构校验失败——`typeof report.pass !== 'boolean' || !Array.isArray(report.perCell) || typeof report.sessionId !== 'string'`(与 T3.3 page-report v1 的跨任务契约,见 §6);
5. **session_mismatch**:`report.sessionId !== context.sessionId` → "report 归属其他 session,判为陈旧/伪造";
6. **target_mismatch**(新增):设 `entry = contract.uiParity.entries[0]`(经分支 0 已保证恰一条)——`report.nodeId !== entry.nodeId || report.version !== entry.version` → "report 的 nodeId/version 与当前 uiParity entry 不符,判为陈旧/伪造/串扰";
7. **stale**:`statSync(path).mtimeMs < context.latestImplementationChangeMtimeMs` → "report 早于本轮 implementation 改动,须重跑 verify-page";
8. **not_passed**:`report.pass !== true` → message 附前 3 条 `perCell` 失败摘要(截断,防 risks 爆炸)。

全部通过 → 返回 `[]`。**adapter 只读文件与 context,不执行命令、不读 git**——保持与现有 adapter 同样的可纯测性(用户委托规范:能力可注入、Fake 可测)。target_mismatch 依赖 T3.3 page-report v1 顶层保留的 `nodeId`/`version` 字段(见 §6);multiple_entries 依赖 T3.1a `contract.uiParity.entries` 结构,与 report 内容无关。

### 2.3 新鲜度 context 组装(requirement-contract.ts)

`validateRequirementContract` 已持有 `dirtyPaths` 与 repoRoot:`latestImplementationChangeMtimeMs = max(statSync(join(repoRoot,p)).mtimeMs)`,遍历 dirtyPaths 时**排除** `.ui-verify/**`、`.magpie/**` 与已删除文件(statSync 抛错跳过),空集则 undefined(跳过 stale 判定)。理由:report 由 S2 在 executor 完成后生成,正常轮次 mtime 必然晚于全部源改动;唯有"旧 report 残留 + 本轮触发被绕过"才会命中 stale——防御纵深,非主防线。

### 2.4 S1 测试清单(先红后绿)

- 九个拒绝分支各一例(tmpdir 造 report 文件;stale 用 `utimesSync` 回拨 mtime;multiple_entries 造 `contract.uiParity.entries` 长度 2 的合同,不落 report 文件也应命中;target_mismatch 造 `nodeId`/`version` 与 entry 不符的合法 report);
- 正例:合法 report(pass:true、sessionId 匹配、nodeId/version 与唯一 entry 一致、mtime 新)→ findings 为空;
- 回归例:`contract.uiParity` 未设时,任意 context 下不产 `ui_visual_validation_gate` finding;现有五 adapter 用例零改动通过;
- 生效链例:构造 `RequirementContractValidationResult` 含该 finding → `decideRequirementCompletion(v, coverage, 'implementation').status === 'fail'`(锁死 D-09 根因不复发:'implementation' scope 豁免 missingEvidence 但不豁免 typeFindings)。

## 3. S2 — verify-page 触发器(execute.ts 接线最小化)

**新文件** `src/capabilities/loop/application/ui-visual-validation.ts`(execute.ts 已 9700+ 行,遵循 M3 共享文件纪律,只加一 import 一调用):

```ts
export const UI_VISUAL_VALIDATION_TIMEOUT_MS = 10 * 60_000
export async function runUiVisualValidationIfRequired(input: {
  session: LoopSession
  cwd: string
  commandSafety: CommandSafetyConfig
  runCommand?: typeof runSafeCommand   // 注入点,测试用 Fake
}): Promise<{ ran: boolean; passed?: boolean; reportPath?: string }>
```

**逻辑**(顺序即规格):
1. **re-persist 触发标记消费**(D-09 ③,跨章契约裁定第 3 条落地;`uiv pin` 侧写入见 T3.2):`workspaceRoot = session.artifacts.workspacePath || session.artifacts.repoRootPath`;若 `existsSync(join(workspaceRoot, '.magpie/uiv-repersist.json'))` → 先 `await persistRequirementContract(session, { workspaceRoot })` 重建合同(纳入本轮 pin 后的最新 uiParity),再 `fs.rmSync` 删除该标记文件(幂等:标记不存在则整步跳过,不影响后续;删标记发生在 persist 成功之后,防重复重建);此步先于下一步读合同,保证读到的是消费后的最新合同。
2. 读合同(`session.artifacts.requirementContractPath || sourceDocumentContractPath`,与 execute.ts 同一 fallback 链);不存在、`!contract.uiParity` 或 `contract.uiParity.entries.length !== 1` → `{ran:false}`,**绝不设置 uiVisualValidationPath**(M3 表 T3.1 验收:无 uiParity 合同的 session 不产生该字段;多 entry 场景同样不跑 verify-page,直接让 S1 adapter 的 multiple_entries finding 阻断,避免执行一次注定被 fail-fast 忽略的 verify-page——无意义副作用);仅当 `entries.length === 1` 时取 `entry = entries[0]` 组装调用串;
3. `reportPath = join(session.artifacts.sessionDir, 'ui-visual-validation.json')`;**先 `rm -f` 旧 report**(fs.rmSync force)——实现"每次新改动重跑不复用",并保证崩溃路径上不残留上一轮文件冒充新鲜;
4. `runCommand(cwd, \`uiv verify-page --test "${entry.testFqn}" --node "${entry.nodeId}" --demo "${entry.demoDir}" --session "${session.id}" --json --out "${reportPath}"\`, { safety, timeoutMs, governance:{cwd, capability:'loop', sessionId} })`(uiv 经 PATH 解析;五参数为跨任务契约统一调用契约,见 §6;`--test`/`--node`/`--demo` 恒取自 `entry`,禁止硬编码或隐式默认值)。**quoting 要求**:`runSafeCommand(cwd, command: string, options)`(runtime.ts)第二参数是单个 command 字符串,不是 argv 数组——内部 `parseCommandArgs` 按空白分词、支持 `"…"`/`'…'` 引用与 `\` 转义,但硬拒绝 `| & ; < > \` $` 五类元字符;拼接时每个插值(testFqn/nodeId/demoDir/session.id/reportPath)须如上以双引号包裹,防止取值含空格时被误拆成多个 argv token;上述五值均为内部生成的 FQN/相对路径/sessionId/绝对路径,不含引号或反斜杠,双引号包裹已足够;若未来该函数暴露 argv 数组重载,则改走 argv 传参,无需手动 quoting;
5. 运行后 `existsSync(reportPath)` 为真 → `session.artifacts.uiVisualValidationPath = reportPath`(即使 verify-page 因 UI 违规退出非零——pass:false 的 report 是合法证据,adapter 按 not_passed 阻断且违规对模型可见);文件不存在(命令被 safety 阻断/崩溃/超时未落盘)→ **显式置 `undefined`,落缺失态**,由 adapter missing 分支阻断——D-09 ②"runSafeCommand 失败落缺失态"的实现;
6. 返回值供 execute.ts 记 observed event(`ui_visual_validation_executed` / `ui_visual_validation_missing`,复用 `appendObservedEvent` 现有模式),环境故障可审计,为 T3.3 的 environment_gap 分类留钩子。

**execute.ts 接线**:`if (stage === 'implementation')` 块内、`await validateRequirementContract(session)` **之前**插入 `await runUiVisualValidationIfRequired({ session, cwd: runCwd, commandSafety })`(该作用域内 runCwd/commandSafety/session 均可用,已核)。时序由此保证:re-persist 标记消费 → report 生成均先于合同验证,同一轮内 adapter 读到的必是本轮产物(含本轮 pin)。

### 3.1 S2 测试清单(新文件 `tests/capabilities/loop/ui-visual-validation.test.ts`)

Fake runCommand(记录调用参数,按剧本写/不写 report 文件):
- 无 uiParity 合同、或 `contract.uiParity.entries.length !== 1`(多 entry)→ runCommand 零调用、artifacts 字段保持 undefined;
- 有 uiParity → 命令串含 `verify-page`、`--test <entry.testFqn>`、`--node <entry.nodeId>`、`--demo <entry.demoDir>`、`--out <sessionDir>/ui-visual-validation.json`、`--session <id>`;
- **re-persist 标记消费**(单测,B6):`workspaceRoot` 下预置 `.magpie/uiv-repersist.json` + `.ui-verify/mapping.json`(scoped pin)但**旧合同文件不含 uiParity**(模拟"pin 发生在合同首次生成之后");调用后断言:① 合同文件被重写且含 uiParity;② 标记文件已删除;③ 若 workspaceRoot 下无标记文件,跳过该步且合同不被重建(零标记时不擅自 persist,防无谓 IO/覆盖并发写入);
- 旧 report 预置后调用 → 步骤 3(原步骤 2)已删除(Fake 不写文件时,终态 path=undefined 且旧文件不存在——"不复用旧 report"两面验证);
- Fake 写 pass:false report 且 passed:false → path 仍被登记;
- Fake 不写文件 → path 置 undefined(缺失态);
- 时序测试(mock uiv 命令):Fake 写合法 report(nodeId/version 与 entry 一致)后,直接对同一 session 调 `validateRequirementContract` → 无 uiParity gate finding;跳过触发直接 validate → missing finding。以"触发→验证"函数级串联替代整机 loop 起跑,e2e 反例归 T3.5。

## 4. S3 — scope-drift 窄豁免(D-09 C)

**位置**:`detectRequirementScopeDiff` 内部,紧邻 `isMagpieRuntimePath` 过滤处仿写(单一实现点,自动覆盖 execute.ts 与 validateRequirementContract 两个调用方——两处 ignoredPaths 均为精确匹配,加前缀豁免只能在此函数内做)。

```ts
const UI_VERIFY_RUNTIME_PREFIXES = ['.ui-verify/reports/', '.ui-verify/renders/', '.ui-verify/state']
// state 前缀同时命中 state.json / state-*.json / state/ 目录(渲染防震荡状态机,与 mapping sidecar 无关,两者恰好同名前缀)
function isUiVerifyRuntimePath(path: string): boolean { /* 前缀匹配,含目录折叠条目 ".ui-verify/reports/" 本身 */ }
function isControlledMappingWrite(path, repoRoot): boolean {
  if ((path !== '.ui-verify/mapping.json' && path !== '.ui-verify/mapping.json.sig') || !repoRoot) return false
  // 受控标记机制:读取 .ui-verify/mapping.json.sig(sidecar JSON,由 uiv pin 写,{schemaVersion, writtenBy:'uiv', algo:'sha256', digest})
  // 比对 sig.digest === sha256(mapping.json 字节);mapping.json 与其 sidecar 本身两条路径共用同一判据
}
```

过滤规则(**双重门控,窄豁免本义**):仅当 `contract.uiParity != null` 时,changed 集合再过一道 `!isUiVerifyRuntimePath(p) && !isControlledMappingWrite(p, repoRoot)`。要点:
- **豁免面**:reports/**、renders/**、state*(verify-page/check 的运行产物,工具写入,不该被判越界、更不该被 `restoreOutOfScopeFiles` 回滚——豁免在 detect 层生效,文件根本不进 outOfScopeFiles,restore 自然不可达);
- **mapping.json 受控豁免**:sha256(工作区 mapping.json) 与 sidecar `.ui-verify/mapping.json.sig` 的 `digest` 字段一致 → 视为 uiv 受控写入,豁免;sidecar 缺失/解析失败/digest 不符 → **不豁免**,照常判 scope_drift(模型手改 mapping 被拦)。`isControlledMappingWrite` 同时识别 `mapping.json` 与 `mapping.json.sig` 两条路径(sig 随 mapping 同写、每次 pin 都变,不落 state 前缀,须显式识别,不能只豁免 mapping.json 本体);sidecar 写入端属 `uiv pin`(T3.2,跨任务契约 §6);
- **明确不豁免**:`.ui-verify/baselines/**`、spec 文件——模型手改基准即 scope_drift,tracked 文件走 restore 回滚到 HEAD(防"改基准骗验证",D-09 两面验收的拦截面);
- **无 uiParity 合同零豁免**:非 UI 任务里模型写 `.ui-verify/**` 任何文件照常判越界(门控条件保证);
- Node 内置 `createHash('sha256')`,无新依赖;`normalizeRelativePath` 归一后再匹配。

### 4.1 S3 测试清单(在现有合同测试旁新增 describe,直测 detectRequirementScopeDiff + 一例 restore)

- 两面之一(工具写不回滚):uiParity 合同 + changed 含 reports/renders/state 路径 → outOfScopeFiles 为空;补一例目录折叠条目 `.ui-verify/reports/`;
- 两面之二(手改拦截):changed 含 `.ui-verify/baselines/123@v1/baseline.png` → 出现在 outOfScopeFiles;临时 git 仓库中 tracked baseline 改脏 → `restoreOutOfScopeFiles` 后内容回到 HEAD(仿 repair 相关测试的 tmp-repo 手法);
- mapping 三态(对 `mapping.json` 与 `mapping.json.sig` 两路径均验):sig digest 匹配 → 豁免;sidecar 缺失 → 不豁免;内容改动致 digest 失配 → 不豁免;
- 门控:无 uiParity 合同 + changed 含 `.ui-verify/reports/x.json` → 仍判越界;
- 既有 `.magpie/**` 豁免与 fail-open(allowedFiles 空)行为零回归。

## 5. S4 — 验收与提交

1. `npx vitest run tests/capabilities/loop/requirement-type-adapters.test.ts tests/capabilities/loop/ui-visual-validation.test.ts` 及合同/scope 相关测试全绿(新增用例数 ≥ 上述清单数);
2. `npx vitest run tests/capabilities/loop/` 与改动前基线数比对零回归;`npm run lint` 涉改文件无新错;
3. 机判反例(D-09 主通道最小闭环,脚本化):构造 uiParity 合同 + 空 report 状态 → `decideRequirementCompletion(await validateRequirementContract(session), coverage, 'implementation')` 为 fail;写入合法 pass:true report 后同调用为 pass;
4. 提交:分支 `feature/ui-visual-validation`,每步一 commit,message 带 T3.1b 与步骤号;只 add 本章四个触点文件 + 两个测试文件,**严禁 add -A**。

## 6. 跨任务契约登记(供编排者同步到 T3.2/T3.3 派发词)

- **T3.3(verify-page)**:统一调用契约 `uiv verify-page --test <FQN> --node <nodeId> --demo <dir> --session <id> --json --out <path>`;必须支持 `--session <id>` 并把它写进 page-report 顶层 `sessionId`;report 顶层至少含 `pass:boolean`、`perCell:array`、`sessionId:string`(S1 schema 校验的三键),另需保留 `nodeId:string`/`version:string`(S1 的 target_mismatch 分支消费);exit code 语义:UI 违规非零但**必须已落盘 report**,工具链故障可不落盘(落缺失态);
- **T3.2(uiv pin)**:mapping v2 entry 恒含 `testFqn`/`demoDir`(T3.1b S2 组装 verify-page 调用串的唯一来源);写 mapping.json 后原子写 sidecar `.ui-verify/mapping.json.sig`(JSON:`{schemaVersion, writtenBy:'uiv', algo:'sha256', digest:<mapping.json 字节 sha256 hex>}`);T3.1b 测试先以手写该 sidecar 模拟;
- **多 entry 边界**:`contract.uiParity.entries.length > 1` 时 M3 由 T3.1b adapter fail-fast(finding `multiple uiParity entries not supported in M3`),T3.2/T3.1a 不需要在写入侧做去重或合并,按各自现有逻辑各自产出即可,留 M4 支持多 entry。
- **登记制**:本章不碰 meta.json / barrel / .gitignore;evidence-taxonomy.ts 与 state/types.ts 归 T3.1a,若其字段名有变(uiParity/uiVisualValidationPath),以 T3.1a 落地命名为准同步本章。

## 7. 残余风险(明示,不在本章修)

- **sidecar 非安全边界,只是受控写入标记**(口径裁定④):可被模型连带伪造(算 sha256 后同写 mapping.json 与 mapping.json.sig 两文件)——防线定位同 `.magpie/config.yaml` 先例:受控标记防"误改/顺手改",蓄意伪造由 PR review/git diff 兜底,不承诺抵御蓄意攻击;
- stale 判定依赖文件系统 mtime 精度(APFS ns 级,无虞;异构 CI 文件系统若粗粒度,主防线仍是 S2 的先删后跑);
- uiv 不在 PATH 时永远落缺失态阻断——属正确的 fail-closed,但需在 M3 联调时于目标仓库先验证 `uiv --version` 可达。


---

### Task T3.2 — `uiv pin`:parity contract 固化(mapping v2 + CS6 variant 枚举 + re-persist 触发)

> 上游:orchestration M3 表 T3.2 + D-09;设计文档 2.5/3.3/5.1。前置:T2.4 done。与 T3.1a/b 并行:**跨仓库无共享包,JSON 形状即接口**——mapping 条目/受控 sig/触发标记三份 schema 由本章定义,T3.1a/b 只引用不重定义。文件:`packages/uiv-core/src/baseline/` + `packages/uiv-cli/src/`;存量只碰 pull.ts、args.ts、cli index.ts;不碰 core barrel/.gitignore(登记制)。逐步红→绿→commit(精确路径 add);验收失败非环境因回 Codex。

#### 口径钉死

1. **mapping.json = uiParity source of truth**(5.1,数组)。条目 v2:`{fileKey, nodeId, version, minScore, testFqn?, demoDir?, matrix, scope?, states?}`(`testFqn`=Robolectric 测试 FQN,`demoDir`=demo 模块相对 workspace 路径,由 `pin` CLI 新增 `--test`/`--demo` 必填旗标写入;**pin 写入的 uiParity entry 恒含 testFqn/demoDir,legacy pull entry(既有 baseline pull 产出,无 --test/--demo 旗标)可缺省这两个字段**,故通用 `MappingEntry` 类型上二者可选(见 Step 1);T3.1b 组装 verify-page 调用串时**只**从该 entry 读取这两个字段,禁止隐式默认);`scope={sourceDocumentPath(repo 相对 posix), sourceDocumentHash(源文档字节 sha1 hex,对齐 magpie `hashContent`,**非** sha256), pinnedAt(ISO)}`;`states[]={name, judgePath:'parity'|'invariant-only', figmaVariantNodeId?}`(states[] canonical schema,T3.1a/T3.2/T3.3/T3.4 四章统一;本章 CS6 自动枚举与显式 `--state` 写入的条目恒 `judgePath:'parity'` 且必带 `figmaVariantNodeId`,本章不产生 invariant-only 条目)。**无 scope = standalone pin,永不入合同**——T3.1a 构建器只合并 path 匹配当前源文档的条目,hash 仅漂移告警。禁止直接写合同 JSON(ANY-of 陷阱)。
2. **upsert 主键 = (fileKey, nodeId, scope?.sourceDocumentPath ?? '')**(D-02 消歧写侧落地);re-pin 同键 version 变更 = 替换非追加(幂等)。cli `readMappingEntry` 仍 nodeId 首条(消费侧消歧归 T3.3);pull 默认 matrix `default5` 不动,pin 默认 `l-shape`,矩阵语义由 verify-page 统一消费。
3. **受控标记(D-09 ③,T3.1b 对接)**:每次写 mapping.json 同写 `.ui-verify/mapping.json.sig = {schemaVersion:1, writtenBy:'uiv', algo:'sha256', digest:<mapping.json 字节 sha256 hex>}`(无时间戳→内容确定性)。豁免判据 = sig 存在且 digest 匹配;手改即失配→不豁免。sig 随 mapping 入库;pull 同步切换受控写入。
4. **基准通道复用 M2**:`client = CachedFigmaClient(inner, <cwd>/.uiv-cache)`;inner = `--fixture`→Fixture,否则 FIGMA_PAT→Rest,双缺→usage error(B1)。首拉不带 version,以响应 version 钉;variant 内联同一响应零额外请求;每显式 `--state` +1 次 getNodes(带钉定 version)。
5. **CS6**:COMPONENT_SET 时 **set 本体不落 baseline**;children 中 type=COMPONENT 的每个 variant 是独立状态节点(独立 id/bounds),各落 `baselines/<variantId>@<version>/spec.json`,re-base 到 variant 自身原点(复用 normalize)。状态名 = variant 名 `"State=Empty[, Size=Big]"` 取值段小写 `-` 连(`empty-big`),无 `=` 整名小写。`componentPropertyDefinitions` 中 type=VARIANT 的 `variantOptions` 仅交叉校验:无对应子节点→WARN 不阻断。显式 `--state name=<nodeId>`(手画独立 frame)单独拉取登记,同名覆盖自动枚举。
6. **scope 解析(fail-fast,先于拉取)**:`--source` ?? env `UIV_SOURCE_DOC`(loop 侧注入约定,T3.1a 下发)?? 无 = standalone。源文档须存在且在工作区内,否则 PinScopeError(exit 2)。
7. **re-persist 解耦(uiv 零 magpie 依赖)**:pin 成功、有 scope、探测到 `<root>/.magpie/` 三者齐备 → 写 `.magpie/uiv-repersist.json = {schemaVersion:1, reason:'uiv-pin', mappingPath:'.ui-verify/mapping.json', requestedAt}`;**T3.1b** 在 execute.ts 的 `validateRequirementContract` 前消费(S2 步骤 1:调 `persistRequirementContract(workspaceRoot)` 后删标记,见 T3.1b 正文)。
8. **CLI 行为**:末行 = mapping.json 绝对路径;成功 exit 0;usage/scope 错 exit 2;baseline.png 缺失逐目录 WARN 不阻断(与 pull 同)。

#### Step 1:mapping.ts 受控写入(pull 切换)

新建 `src/baseline/mapping.test.ts`:

```ts
const base: MappingEntry = { fileKey: 'F', nodeId: '1:100', version: 'V1', minScore: 0.9, matrix: 'l-shape',
  testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android' };
const scoped = (v: string): MappingEntry => ({ ...base, version: v,
  scope: { sourceDocumentPath: 'docs/req.md', sourceDocumentHash: 'aa', pinnedAt: '2026-07-09T00:00:00.000Z' } });
it('主键含 scope.path;幂等 re-pin(version 替换);sig 受控/手改失配', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uiv-map-'));
  upsertMappingEntry(dir, base);
  upsertMappingEntry(dir, scoped('V1'));            // 同 nodeId 异 scope → 两条(D-02)
  const p = upsertMappingEntry(dir, scoped('V2'));  // 同键 re-pin → 替换
  const m = JSON.parse(readFileSync(p, 'utf8')) as MappingEntry[];
  expect([m.length, m[1]!.version]).toEqual([2, 'V2']);
  expect(verifyMappingSig(dir)).toBe(true);
  writeFileSync(p, readFileSync(p, 'utf8').replace('0.9', '0.1'));   // 模型手改 → T3.1b 不豁免
  expect(verifyMappingSig(dir)).toBe(false);
});
```

→ 红。新建 `src/baseline/mapping.ts`:

```ts
export interface MappingScope { sourceDocumentPath: string; sourceDocumentHash: string; pinnedAt: string }
export interface MappingStateRef { name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }
export interface MappingEntry { fileKey: string; nodeId: string; version: string; minScore: number;
  testFqn?: string; demoDir?: string; matrix: string; scope?: MappingScope; states?: MappingStateRef[] }
const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const key = (e: MappingEntry): string => `${e.fileKey} ${e.nodeId} ${e.scope?.sourceDocumentPath ?? ''}`;

export function upsertMappingEntry(uiVerifyDir: string, entry: MappingEntry): string {
  mkdirSync(uiVerifyDir, { recursive: true });
  const mappingPath = join(uiVerifyDir, 'mapping.json');
  const entries: MappingEntry[] = existsSync(mappingPath) ? JSON.parse(readFileSync(mappingPath, 'utf8')) : [];
  const i = entries.findIndex((e) => key(e) === key(entry));
  if (i >= 0) entries[i] = entry; else entries.push(entry);
  const body = `${JSON.stringify(entries, null, 2)}\n`;
  writeFileSync(mappingPath, body, 'utf8');
  writeFileSync(`${mappingPath}.sig`,
    `${JSON.stringify({ schemaVersion: 1, writtenBy: 'uiv', algo: 'sha256', digest: sha256(body) })}\n`, 'utf8');
  return mappingPath;
}
```

另导出 `verifyMappingSig(uiVerifyDir)`:mapping/sig 缺失→false,否则 `sig.digest === sha256(mapping 字节)`(T3.1b 判据,magpie 仓按本 schema 重写)。

`pull.ts` 切换:删本地 `MappingEntry`/`upsertMapping`,改 import + `export type { MappingEntry } from './mapping.js'`(cli 导入面不变)。→ 绿且 pull.test 不回归(可选字段缺省,精确相等断言仍过)。commit:`T3.2: mapping v2 受控写入(scope 主键消歧+sig,pull 切换)`

#### Step 2:pin 核心(standalone/scope/幂等)

新建 `src/baseline/pin.test.ts`(`card()`=Fixture 客户端(rest-nodes-card.json),`now=() => new Date('2026-07-09T00:00:00Z')`):

```ts
it('standalone:无 scope 无标记;基准落盘', async () => {
  const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
  const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
    testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
  expect(r.entry).toEqual({ fileKey: 'F', nodeId: '1:100', version: 'T1_0A_V1', minScore: 0.9, matrix: 'l-shape',
    testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android' });
  expect(r.repersistRequested).toBe(false);
  expect(existsSync(join(root, '.ui-verify/baselines/1-100@T1_0A_V1/spec.json'))).toBe(true);
});
it('scoped:三字段(hash=源文档字节 sha1)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
  mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/req.md'), 'PRD');
  const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
    testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc: 'docs/req.md', now, minScore: 0.95 });
  expect(r.entry.scope).toEqual({ sourceDocumentPath: 'docs/req.md',
    sourceDocumentHash: createHash('sha1').update('PRD').digest('hex'),
    pinnedAt: '2026-07-09T00:00:00.000Z' });
  expect(r.entry.minScore).toBe(0.95);
});
```

第三用例:`sourceDoc='nope.md'`(不存在)/`'../esc.md'`(越界)均 rejects `PinScopeError`。

→ 红。新建 `src/baseline/pin.ts`(按口径 1/5/6;类型:`PinOptions{fileKey; nodeId; testFqn; demoDir; sourceDoc?; explicitStates?: MappingStateRef[]; minScore?; matrix?; now?: () => Date}`、`PinnedBaseline{nodeId; specPath; baselinePngExists}`、`PinResult{entry; mappingPath; pulled; repersistRequested; warnings}`、`class PinScopeError extends Error`):

- `writeSpecFromRaw(raw, fileKey, nodeId, uiVerifyDir)`:normalize → `baselines/<baselineDirName(nodeId, spec.version)>/spec.json` 落盘 + baseline.png 探测(同 pull.ts 现状);
- `resolveScope(root, sourceDoc, now)`:undefined→undefined;相对路径按 root 解析,`relative(root, abs)` 以 `..` 开头或文件不存在→`PinScopeError`;返回 `{sourceDocumentPath: rel(posix 化), sourceDocumentHash: sha1(文件字节) hex(对齐 magpie hashContent,**非** sha256), pinnedAt: now().toISOString()}`;
- `export function variantStateName(name)`:

```ts
export function variantStateName(name: string): string {
  return name.split(',').map((p) => { const [k, v] = p.split('='); return (v ?? k ?? '').trim(); })
    .filter(Boolean).join('-').toLowerCase();
}
```

- `export async function pinBaseline(client: FigmaClient, workspaceRoot, opts): Promise<PinResult>`:① `resolveScope`(fail fast,先于拉取);② `getNodes(fileKey, nodeId)` 无 version,取 `raw.nodes[nodeId].document` 与 `raw.version`,缺任一抛 `FigmaSpecInvalidError`;③ 收集 `states = Map<name, variantId>`——COMPONENT_SET 时:遍历 `children` 中 `type==='COMPONENT'` 且有 id 的 variant,**合成单节点响应 `{version, nodes: {[v.id]: {document: v}}}` 交 `writeSpecFromRaw`**(normalize 即 re-base 到 variant 原点),`states.set(variantStateName(v.name), v.id)`;再对 type=VARIANT 的每个 `variantOptions` 值 `o`,若无任一 state 名的 `-` 分段等于 `o.toLowerCase()` → push warning `` `variantOption 未见对应子节点: ${o}` ``;非 SET 直接 `writeSpecFromRaw(raw, ..., nodeId, ...)`;④ 逐个 `explicitStates`:`getNodes(fileKey, s.figmaVariantNodeId, version)` → `writeSpecFromRaw` → `states.set`(同名覆盖);⑤ 组装 entry(minScore ?? 0.9,matrix ?? 'l-shape',`testFqn`/`demoDir` 原样透传,scope 仅非空才带字段;`states` 由 `states` Map 转数组时逐项补 `judgePath:'parity'`——本函数产出的 state 恒有 figmaVariantNodeId,恒 parity——仅非空才带该字段)→ `upsertMappingEntry`;⑥ `repersistRequested = scope !== undefined && requestContractRepersist(workspaceRoot)`。

`repersist.ts` 先置桩 `export function requestContractRepersist(_root: string): boolean { return false }`。→ 绿。commit:`T3.2: pin 核心(standalone 无 scope/scoped 三字段/fail-fast)`

#### Step 3:COMPONENT_SET fixture + variant 枚举

新建 `fixtures/rest-nodes-componentset.json`(REST-shape,绝对画布坐标):顶层 `{name:'uiv-cs', version:'CS_V1', nodes:{'9:100':{document}}}`;document = `{id:'9:100', type:'COMPONENT_SET', absoluteBoundingBox:{x:0,y:0,width:800,height:300}, componentPropertyDefinitions:{State:{type:'VARIANT', variantOptions:['Empty','Filled','Error']}}, children:[三个 COMPONENT]}`:9:101 `State=Empty` bbox(20,20,360,200) 含 TEXT 子 9:111 bbox(32,32,100,16) characters "No items";9:102 `State=Filled` bbox(400,20,360,200);9:103 `State=Error` bbox(20,240,360,40);后两者 children:[]。

pin.test.ts 追加(`cs()`=FixtureFigmaClient(该 fixture);`multi=(m)=>({ getNodes: async (_f, id) => m[id], getImages: async () => ({}) })`):

```ts
it('CS6:批量分状态基准+states[];re-base 到 variant 原点;set 本体不落', async () => {
  const root = mkdtempSync(join(tmpdir(), 'uiv-cs-'));
  const r = await pinBaseline(cs(), root, { fileKey: 'F', nodeId: '9:100',
    testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
  expect(r.entry.states).toEqual([{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '9:101' },
    { name: 'filled', judgePath: 'parity', figmaVariantNodeId: '9:102' },
    { name: 'error', judgePath: 'parity', figmaVariantNodeId: '9:103' }]);
  const spec = JSON.parse(readFileSync(join(root, '.ui-verify/baselines/9-101@CS_V1/spec.json'), 'utf8'));
  expect(spec.root.bbox).toEqual({ x: 0, y: 0, w: 360, h: 200 });
  expect(spec.root.children[0].bbox).toEqual({ x: 12, y: 12, w: 100, h: 16 });
  expect(existsSync(join(root, '.ui-verify/baselines/9-100@CS_V1'))).toBe(false);
  expect(r.warnings).toEqual([]);
});
it('variantStateName+显式 --state 覆盖同名', async () => {
  expect(variantStateName('State=Empty, Size=Big')).toBe('empty-big');
  expect(variantStateName('Fallback')).toBe('fallback');
  const csRaw = JSON.parse(readFileSync(csPath, 'utf8'));
  const alt = { version: 'CS_V1', nodes: { '7:200': { document: { id: '7:200', name: 'EmptyAlt', type: 'FRAME',
    absoluteBoundingBox: { x: 5, y: 5, width: 360, height: 200 }, children: [] } } } };
  const r = await pinBaseline(multi({ '9:100': csRaw, '7:200': alt }), mkdtempSync(join(tmpdir(), 'uiv-cs-')),
    { fileKey: 'F', nodeId: '9:100', testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android',
      explicitStates: [{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '7:200' }], now });
  expect(r.entry.states!.find((s) => s.name === 'empty')!.figmaVariantNodeId).toBe('7:200');
});
```

再加一用例(WARN):`structuredClone(csRaw)` 删 Empty variant 子节点后重 pin,断言 `warnings` 恰为 `['variantOption 未见对应子节点: Empty']`。

→ 应即绿(Step 2 已覆盖,红则修 pin.ts)。commit:`T3.2: CS6 variant 枚举(fixture+显式 state 覆盖+variantOptions 交叉校验)`

#### Step 4:re-persist 触发标记

pin.test.ts 追加 `it('触发标记:scoped+.magpie/ 才写;standalone 不写')`:root 下 `mkdirSync('.magpie')` + 写 `req.md` → scoped pin 后断言 `repersistRequested === true` 且 `.magpie/uiv-repersist.json` 解析出 `[schemaVersion, reason, mappingPath] === [1, 'uiv-pin', '.ui-verify/mapping.json']`;同 root 再 standalone pin(无 sourceDoc)→ `repersistRequested === false`。

→ 红。`repersist.ts`:`.magpie/` 不存在→false;存在→写 `uiv-repersist.json`(四字段,requestedAt=ISO now)→true。→ 绿。commit:`T3.2: re-persist 触发标记(.magpie 探测,零 magpie 依赖)`

#### Step 5:CLI 接线

`args.test.ts` 追加:

```ts
it('pin argv:repeatable --state/--min-score 域/--matrix 白名单', () => {
  expect(parseCliArgs(['pin', '--file', 'F', '--node', '9:100', '--test', 'com.magpie.uiv.demo.CalibCardTest',
    '--demo', 'demo-android', '--fixture', 'f.json', '--source', 'docs/req.md',
    '--state', 'empty=9:101', '--state', 'error=9:103', '--min-score', '0.95', '--matrix', 'full']))
    .toEqual({ kind: 'pin', file: 'F', node: '9:100', test: 'com.magpie.uiv.demo.CalibCardTest', demo: 'demo-android',
      fixture: 'f.json', source: 'docs/req.md',
      states: [{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '9:101' },
        { name: 'error', judgePath: 'parity', figmaVariantNodeId: '9:103' }],
      minScore: 0.95, matrix: 'full' });
});
```

反例(各 `toThrow(CliUsageError)`):`--state empty`(无 `=`)、`--min-score 1.2`、`--matrix diag`、缺 `--test`、缺 `--demo`。→ 红。`args.ts`:`PinCmd{kind:'pin'; file; node; test:string; demo:string; fixture:string|null; source:string|null; states:PinStateArg[]; minScore:number|null; matrix:string|null}` 入 `ParsedCommand`;`--test`/`--demo` 与 `--file`/`--node` 同为必填(缺失即 usage error,和 fixture/source 的"可选"区分开);新增 `extractRepeatable(rest, flag)`(先剥离 repeatable 对再走 collectFlags,"取末次"规则不变)与 `parsePinState`(首个 `=` 切分,空 name/id 报错,解析结果恒补 `judgePath:'parity'`——CLI `--state` 语义上只用于声明"有具体 Figma 变体节点"的态,和 CS6 自动枚举一致);`--min-score` 须 `(0,1]` 有限数,`--matrix` 须 `/^(l-shape|full|custom:.+)$/`。→ 绿。

cli `index.ts` 接 pin 分支(头注释/usage 补 pin 行;错误走既有 exit 2 通道):client 按口径 4 选路(双缺抛 `CliUsageError('pin needs --fixture or FIGMA_PAT (B1)')`);`pinBaseline(client, process.cwd(), {fileKey, nodeId, testFqn: cmd.test, demoDir: cmd.demo, sourceDoc: cmd.source ?? process.env.UIV_SOURCE_DOC, explicitStates: cmd.states, minScore/matrix 仅非 null 传})`;逐个 `pulled` 缺 png 打 `WARN baseline.png missing: <dir>`,warnings 逐条 WARN;stderr 打三态之一(re-persist requested / scoped pin / standalone pin 字样);末行 `console.log(r.mappingPath)`。commit:`T3.2: uiv pin CLI(fixture/PAT 双通道+UIV_SOURCE_DOC 兜底)`

#### 任务门(可机判)+ 登记清单

1. `npm test`、`npm run build` exit 0(pull/args/cli 存量不回归)。
2. 验收锚:mapping.test(schema/sig/幂等 re-pin)、pin.test(CS6 枚举、standalone 无 scope、scoped 三字段、触发标记)、args.test(pin argv)。
3. 端到端抽查(dist 构建后):`uiv pin --file F --node 9:100 --test com.magpie.uiv.demo.CalibCardTest --demo demo-android --fixture packages/uiv-core/fixtures/rest-nodes-componentset.json` → exit 0,末行 mapping.json 路径,`baselines/9-10{1,2,3}@CS_V1/` 三目录 + mapping.json.sig 存在。
4. **跨章联测(T3.1a/b 落地后 magpie 仓执行,登记 pending_followups)**:scoped pin → 合同含 uiParity+专项 requiredEvidence;standalone → 不入合同(T3.1a 构建器测试消费本章 mapping v2 形状);手改 mapping → T3.1b 不豁免。
5. **barrel export 清单(收尾 agent 集成,本任务不碰 core index.ts)**:`./baseline/mapping.js`、`./baseline/pin.js`、`./baseline/repersist.js`;测试期以相对路径导入。`.gitignore` 无新增(sig 随 mapping 入库;`.uiv-cache/` 已有)。
6. 主会话:meta.json 置 T3.2 `awaiting_review` 记 last_commit;交付口径 = fixture 驱动(REST 闭环受 Release Gate 约束)。


---

### Task T3.3 — `uiv verify-page` 整页外循环(5 格 × L 形 + 失败分类)

**依据**:编排计划 M3 T3.3 行 + 设计文档 3.2/3.3/2.4。**前置**:M2 全 done;T3.2 的 mapping.states[] 可选读(并行开发,缺省按无 pin 处理)。**范围切割**:本章只做矩阵展开、逐格编排(渲染+L1/L2)、聚合、失败分类、source 归因;invariant 断言套件归 T3.4(留 judgePath 数据位);retryStateNote **注入动作**归 magpie 侧 T3.1b,本章产数据契约。

#### 口径钉死

**① 设备 5 格(qualifiers 写死)**:join 密度门 `density≠2.0 → L2Error`(l2/join.ts),故**全格恒 xhdpi**只变宽高/night;fontScale 非资源 qualifier,由测试侧 `LocalDensity(fontScale=1.3)` 表达;pixel5-dark 尺寸钉 base(360×800)只翻 night——保几何 parity 对同一基准有效(小/大屏由 smallPhone/tablet 轴覆盖)。表见 Step 1。

**② gradle 跑法(实地评估结论:方案 A=每格一次 `-P` 属性覆盖 + 单参数化测试类)**。依据:@Config 静态注解无法按 invocation 参数化,多测试类组合爆炸且 fontScale 无法用 @Config 表达;convention plugin 已有 `-D` 转发先例,`gradleProperty` 同型三行;`GradleRunner.run(cwd,args)` 冷热两道均透传 args,零 daemon 改动。每格命令:`testDebugUnitTest --tests <FQN> -Proborazzi.test.compare=true -Puiv.device=<d> -Puiv.state=<s> --rerun`(--rerun 恒带:防同格重跑被 up-to-date 跳过)。**verify-page 恒慢车道**(fast lane=静态组件预览插槽,D-05)。

**③ 每格判定档(写死,pin 态未来放宽;`judgePath` 路由依据 = 该内容态在 mapping.states[] 中的声明,states[] canonical schema 见跨章契约裁定第 5 条)**:

| 格 | judgePath | assertionScope | 说明 |
|---|---|---|---|
| base × parity 可用态 | parity | full | parity 可用 = typical(隐式)或 mapping.states[] 命中该态名且 `judgePath:'parity'`(用 variant 基准 nodeDir) |
| base × 无 pin 态(mapping.states[] 命中该态名且 `judgePath:'invariant-only'`,或未声明) | invariant-only | invariant-only | M3 即走 T3.4 `runInvariantOnly`(读该格渲染产出的 semantics dump 直接判定,不比对 baseline);不再 render-only |
| pixel5-dark × parity 可用态 | parity | geometry-only | 排除 color 断言(无 dark 基准时深色比浅色 spec 必假阳);dark pin 支持推迟登记 |
| pixel5-dark × 无 pin 态;fontScale1.3/smallPhone/tablet × 一切态 | render-only | render-only | 走 runCheck(v0)渲染成功性;M3 暂不跑 invariant,留 M4 全格化升级(仅这一档,base 已按上一行提前) |

L1 仅 base 设备跑(其余 skipL1:尺寸/配色不同,纯噪声)。**state.json 防震荡不参与**(disableState:那是组件内循环状态机,页级反馈走 retryStateNote 外循环)。

**④ 产物路径**:逐格 `renders|reports/<nodeDir>/cells/<cellId>/…`(cellId=`<device>__<state>`);页报告 `reports/<nodeDir>/page-report.json`,`--out <path>` 时**另复制**一份(magpie 传 `.magpie/sessions/<id>/`);stdout 最后一行=页报告绝对路径,exit=pass?0:1;CLI 必须接受 `--session <id>` 并写入报告顶层 `sessionId`(standalone 跑允许字面量 `'standalone'`,统一调用契约见跨章契约裁定第 1 条)。

**⑤ 失败分类映射(设计文档 3.2C,完整表)**:`Record<SubReason,FailureClass>` 编译期全覆盖,映射值见 Step 2 代码(violations→behavior_drift;missing→implementation_gap;compileError→environment_gap;subReason 按表;figma_spec_invalid 的 hint 提示重跑 `uiv baseline pull`;3.2C 未列两项按语义归类并单测锁死)。一格可命中多类,输出序固定(ORDER:env→impl→drift)。

**⑥ retryStateNote 数据契约与分工**:本章产 `classification:{classes[], actionable, retryNoteCandidate, environmentCells[]}`。retryNoteCandidate 仅由 implementation_gap/behavior_drift 证据构建(逐 actionable 格:top3 violations 权重降序 + 前 3 missing,行式 `[<cellId>] <property> @<testTag>: expected E actual A (<source>)`,封顶 20 行);仅 environment_gap 的格进 environmentCells 不进 note;无 actionable 格 → null。**magpie 侧消费点(T3.1b,D-09 adapter)**:execute.ts implementation 完成路径跑 verify-page 后读 page-report,`actionable=true` 才注入 retryStateNote(commit 3555a9b 机制);仅 environment_gap → 不注入,落 typeFinding 阻断 + 工具链升级,**不进模型修正回路**;注入行为验收归 T3.5 反例⑤。

**⑦ source 行号归因**:violation.testTag(`fig:x:y`)作字面量在 `<demoDir>/app/src/main/**/*.kt`(路径排序)检索首个含 `"fig:x:y"` 的行 → `source:"app/src/main/.../CalibCard.kt:63"`(demoDir 相对路径);无命中 → null。在 verify-page 层富化(l2 引擎不改,`Violation` 加可选 `source?: string|null`,v1 校验器不深校验 violations 项,零破坏)。

**⑧ 耗时预算**:串行,预算=格数×~5.1s(D-08 热 P50 5090ms);L 形 4 态 11 格 ≈60s,在设计文档 30s~2min 包线内;`durationMs` 落实测。

---

#### Step 1 — 矩阵展开 `page/matrix.ts`(红→绿→commit)

新建 `packages/uiv-core/src/page/matrix.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expandMatrix } from './matrix.js';

describe('expandMatrix', () => {
  it('l-shape:base×全态 + 全设备×typical + 三交叉,去重;格数=4+4+3', () => {
    const cells = expandMatrix('l-shape', ['typical', 'empty', 'longText', 'error']);
    expect(cells).toHaveLength(11);
    const ids = cells.map((c) => c.cellId);
    expect(new Set(ids).size).toBe(11);
    for (const id of ['fontScale1.3__longText', 'smallPhone__longText', 'pixel5-dark__error']) {
      expect(ids).toContain(id);                                          // 三交叉格
    }
    expect(cells.every((c) => c.qualifiers.includes('xhdpi'))).toBe(true); // 密度门:恒 2.0
  });
  it('typical 恒隐含;交叉仅当态在列;full=笛卡尔;custom 解析;未知报错', () => {
    expect(expandMatrix('l-shape', [])).toHaveLength(5);       // 无 longText/error → 无交叉
    expect(expandMatrix('full', ['longText'])).toHaveLength(10);
    expect(expandMatrix('custom:base/typical,pixel5-dark/typical', []).map((x) => x.cellId))
      .toEqual(['base__typical', 'pixel5-dark__typical']);
    expect(() => expandMatrix('custom:foo/typical', [])).toThrow(/unknown device/);
    expect(() => expandMatrix('diagonal', [])).toThrow(/unknown matrix/);
  });
});
```

红后新建 `matrix.ts`:

```ts
/** T3.3:设备 5 格 × 内容态矩阵展开(3.2/3.3)。全格恒 xhdpi(密度门 2.0),见口径①。 */
export const DEVICES = ['base', 'pixel5-dark', 'fontScale1.3', 'smallPhone', 'tablet'] as const;
export type Device = (typeof DEVICES)[number];
export const DEVICE_QUALIFIERS: Record<Device, string> = {
  'base': 'w360dp-h800dp-xhdpi', 'pixel5-dark': 'w360dp-h800dp-xhdpi-night',
  'fontScale1.3': 'w360dp-h800dp-xhdpi', 'smallPhone': 'w320dp-h640dp-xhdpi',
  'tablet': 'w800dp-h1280dp-xhdpi',
};
/** 三显式高频翻车交叉点(dark×error 的 dark 即 pixel5-dark 格)。 */
export const CROSSINGS: ReadonlyArray<readonly [Device, string]> = [
  ['fontScale1.3', 'longText'], ['smallPhone', 'longText'], ['pixel5-dark', 'error'],
];
export interface Cell { cellId: string; device: Device; state: string; qualifiers: string }
const mk = (device: Device, state: string): Cell =>
  ({ cellId: `${device}__${state}`, device, state, qualifiers: DEVICE_QUALIFIERS[device] });

export function expandMatrix(matrix: string, statesIn: readonly string[]): Cell[] {
  const states = [...new Set(['typical', ...statesIn])];        // typical 恒隐含(基准态本身)
  let cells: Cell[];
  if (matrix === 'l-shape') {
    cells = [
      ...states.map((s) => mk('base', s)),
      ...DEVICES.map((d) => mk(d, 'typical')),
      ...CROSSINGS.filter(([, s]) => states.includes(s)).map(([d, s]) => mk(d, s)),
    ];
  } else if (matrix === 'full') {
    cells = DEVICES.flatMap((d) => states.map((s) => mk(d, s)));
  } else if (matrix.startsWith('custom:')) {
    cells = matrix.slice('custom:'.length).split(',').map((pair) => {
      const [d, s] = pair.split('/');
      if (d === undefined || s === undefined || s === '') throw new Error(`bad custom cell: ${pair}`);
      if (!(DEVICES as readonly string[]).includes(d)) throw new Error(`unknown device: ${d}`);
      return mk(d as Device, s);
    });
  } else { throw new Error(`unknown matrix: ${matrix}`); }
  const seen = new Set<string>();
  return cells.filter((c) => !seen.has(c.cellId) && (seen.add(c.cellId), true));
}
```

#### Step 2 — 分类映射 `page/classify.ts`(红→绿→commit)

`classify.test.ts` 六条:① `SUBREASON_CLASS` 覆盖 `SUB_REASONS` 全 7 键且逐项等于下表;② violations 非空 fail → `['behavior_drift']`;③ missing 非空 → 含 `implementation_gap`,双非空 → 固定序双类;④ compileError → `['environment_gap']`;⑤ pass=true → `[]`;⑥ classifyPage:env-only 格 → `actionable=false`、note=null、cellId 进 `environmentCells`;混合 → note 含 `[base__typical]`、expected/actual 与 `(CalibCard.kt:63)`。实现(核心):

```ts
import type { SubReason } from '../l2/types.js';
import type { ReportV1 } from '../report/v1.js';

export type FailureClass = 'environment_gap' | 'implementation_gap' | 'behavior_drift';
const ORDER: readonly FailureClass[] = ['environment_gap', 'implementation_gap', 'behavior_drift'];
/** 3.2C 完整映射;末两项为 3.2C 未列,按语义归类(⑤)。 */
export const SUBREASON_CLASS: Record<SubReason, FailureClass> = {
  tag_coverage_low: 'implementation_gap', matching_rate_low: 'implementation_gap',
  semantics_export_failed: 'environment_gap', render_harness_error: 'environment_gap',
  figma_spec_invalid: 'environment_gap',
  native_graphics_unverified: 'environment_gap', fixture_unavailable: 'implementation_gap',
};
export function classifyCell(r: ReportV1): FailureClass[] {
  if (r.pass) return [];
  const hit = new Set<FailureClass>();
  if (r.compileError !== null) hit.add('environment_gap');       // 编译失败
  if (r.reason === 'inconclusive' && r.subReason !== null) hit.add(SUBREASON_CLASS[r.subReason]);
  if ((r.structural?.missing.length ?? 0) > 0) hit.add('implementation_gap');
  if ((r.structural?.violations.length ?? 0) > 0) hit.add('behavior_drift');
  if (hit.size === 0) hit.add('behavior_drift');                 // 兜底(违规被 scope 过滤等)
  return ORDER.filter((c) => hit.has(c));
}
```

另导出 `PageClassification { classes: FailureClass[]; actionable: boolean; retryNoteCandidate: string|null; environmentCells: string[] }` 与 `classifyPage(cells: {cellId, report}[])`:实现按⑥;classes=各格并集按 ORDER 序;note 违规排序=severity 权重降序平手 testTag 字典序;missing 行式 `[cellId] missing: <name> <figmaId>`。

#### Step 3 — page-report schema `page/report.ts`(红→绿→commit)

`PageReport`:`{ schemaVersion:1, kind:'page-report', pass, test, sessionId, nodeId, version, matrix, states:string[], perCell:PageCell[], l3Verdicts:[], unresolvedKnownDeviations:[], classification, durationMs }`(`sessionId:string`,standalone 跑允许字面量 `'standalone'`;`nodeId`/`version`/`matrix` 与 `sessionId` 均为 T3.1b adapter 的 schema/target 校验依据,见跨章契约裁定第 1/2 条);`PageCell`:`{ cellId, device, state, qualifiers, judgePath:'parity'|'render-only'|'invariant-only'(T3.4 已交付,不再是预留), assertionScope:'full'|'geometry-only'|'render-only'|'invariant-only', pass, reason, subReason, score, failureClasses, topViolations(≤5,含 source), reportPath }`。`pass=perCell 全 pass`;`l3Verdicts/unresolvedKnownDeviations` 恒 `[]`(M4 填)。手写 `validatePageReport`(同 v0/v1 风格);单测:合法样例过、l3Verdicts 缺失/非数组红、perCell 缺 cellId 红、schemaVersion≠1 红、`sessionId` 缺失/非 string 红、`judgePath==='invariant-only'` 的合法样例过。

#### Step 4 — source 归因 `page/source-attr.ts`(红→绿→commit)

`attributeSource(testTag, demoDir): string | null` + `enrichViolations(violations, demoDir)`(逐条填 `v.source`,已有值不覆写)。递归遍历 `app/src/main` 下 `.kt`(路径字典序),`includes` 纯文本检索(非正则,tag 含 `:` 不误伤)首个含 `"<testTag>"`(带双引号)的 `相对路径:行号`。单测 scratch tmp 造两文件:行号正确、多文件取字典序首个、无命中 null。

#### Step 5 — 复用面扩展(runCheck/runCheckL2/runL2,全部可选参数零破坏;红→绿→commit)

- `CheckOpts`(check/run.ts)+ `skipL1?`(baseline 存在也不跑 L1)、`extraGradleArgs?: string[]`(拼在 compare 参数后)、`artifactSubdir?`(**仅** renders/reports 路径变 `<nodeDir>/cells/<sub>`;baselines 仍 `<nodeDir>`)。
- `RunCheckL2Opts`(check/runL2.ts)+ `disableState?`(不读写 state.json,regression 恒 false)、`semanticsMinMtimeMs?`(semantics.json mtime 早于此值 → `semantics_export_failed`,防上一格陈旧 dump 复用)、`excludeProperties?`(透传 runL2)。
- `RunL2Opts`(l2/report.ts)+ `excludeProperties` → `assertPair` 同名参:命中属性跳过(不产 violation、**不计 executed**)。
- 单测四条(FakeRunner 既有模式):`artifactSubdir` 产物落 `cells/<id>/` 两格互不覆写;陈旧 semantics → `semantics_export_failed`;排除 color 后无 color 违规且 executed 减少;`disableState` 后无 state.json。

#### Step 6 — 编排器 `page/verifyPage.ts`(红→绿→commit)

```ts
export interface VerifyPageOpts {
  demoDir: string; testFqn: string; nodeId: string; version: string; uiVerifyDir: string; sessionId: string;
  matrix: string; states: readonly string[]; minScore?: number; outPath?: string;
  pinnedStates?: ReadonlyArray<{ name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }>;  // T3.2/T3.4 mapping.states[],states[] canonical schema
}
export async function verifyPage(runner: GradleRunner, opts: VerifyPageOpts): Promise<{ report: PageReport; reportPath: string }>
```

逻辑:`expandMatrix` → **串行**逐格:t0=Date.now();judgePath 路由(③;读 `pinnedStates` 找该态名对应声明——命中 `judgePath:'parity'` 用 variant 基准 nodeDir,命中 `judgePath:'invariant-only'` 或未声明按 base/非 base 分流,见③表);render-only 走 `runCheck`,parity 走 `runCheckL2`,invariant-only(仅 base 设备命中)走 `runCheck` 渲染产出 semantics dump 后再调 T3.4 `runInvariantOnly(dump, opts)` 取真实 pass/violations(非仅渲染成功性),传 `{ artifactSubdir: cellId, skipL1: device!=='base', extraGradleArgs: ['-Puiv.device='+device, '-Puiv.state='+state, '--rerun'], disableState: true, semanticsMinMtimeMs: t0, excludeProperties: scope==='geometry-only' ? ['color'] : undefined }` → `enrichViolations` → 组 PageCell(render-only 的 score=pass?1:0 占位;invariant-only 的 score 取 `runInvariantOnly` 结果,仅 informational,不参与该格 pass 判定之外的门禁)→ `classifyPage` → `validatePageReport`(写入 `sessionId: opts.sessionId`)→ 写 `reports/<nodeDir>/page-report.json`(+ outPath 复制)。单测(FakeRunner 造 fixture,沿 runL2.test.ts):2 格 custom → perCell 长度序正确、cells/ 隔离、一格 fail→页 fail、l3Verdicts=[]、gradle 录参含 `-Puiv.device/--rerun`、env-only → note=null、report 顶层 `sessionId===opts.sessionId`;新增:base×invariant-only 态格(`pinnedStates` 命中 `judgePath:'invariant-only'`)→ `judgePath==='invariant-only'`、`assertionScope==='invariant-only'`,区别于 fontScale1.3/smallPhone/tablet 同态格仍 `judgePath==='render-only'`。

#### Step 7 — demo 侧:参数化页测试 + plugin 转发(红=属性未转发时恒 base;绿→commit)

`UivScreenshotConventionPlugin.kt` 既有 `-D` 转发后追加:

```kotlin
listOf("uiv.device", "uiv.state").forEach { key ->
    providers.gradleProperty(key).orNull?.let { systemProperty(key, it) }
}
```

新建 `demo-android/app/src/test/.../CalibPageScreenshotTest.kt`(CalibCard 当页面;短名 CalibPage 对齐 runCheck 的 PNG needle 与 semantics 口径):

```kotlin
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])                 // qualifiers 不钉类上,由 uiv.device 每格 invocation 决定
class CalibPageScreenshotTest {
    @get:Rule val composeRule = createComposeRule()
    @get:Rule val dumpRule = SemanticsDumpRule()
    private val device = System.getProperty("uiv.device") ?: "base"
    private val state = System.getProperty("uiv.state") ?: "typical"  // fixture 分支 T3.4 接管
    @Before fun configureDevice() { RuntimeEnvironment.setQualifiers(QUALIFIERS.getValue(device)) }
    @Test fun capturePage() {
        composeRule.setContent {
            val d = LocalDensity.current
            val fs = if (device == "fontScale1.3") 1.3f else d.fontScale
            CompositionLocalProvider(LocalDensity provides Density(d.density, fs)) { CalibCard() }
        }
        composeRule.onNodeWithTag("fig:1:100")
            .captureRoboImage("build/outputs/roborazzi/CalibPage_${device}_${state}.png")
        dumpRule.dump(composeRule, "CalibPage")
    }
    companion object { val QUALIFIERS = mapOf(/* 与 core DEVICE_QUALIFIERS 逐项同表写死,5 键 */) }
}
```

验证:`./gradlew testDebugUnitTest --tests '*.CalibPageScreenshotTest' -Puiv.device=pixel5-dark --rerun` exit 0,产 `CalibPage_pixel5-dark_typical.png` 与 `build/uiv/CalibPage.semantics.json`。

#### Step 8 — CLI 接线(红→绿→commit)

`args.ts`:`VerifyPageCmd { kind:'verify-page'; test; node; demo; session: string; states: string[]; matrix: string; json: boolean; out: string | null }`;`--session <id>` 与 `--test`/`--node`/`--demo` 同为必填(统一调用契约,见跨章契约裁定第 1 条),缺失即 `CliUsageError`;`--states` 逗号拆分(缺省 `[]`),`--matrix` 缺省 `'l-shape'`,`--json` 布尔旗标(同 `--record` 剔除法)。单测:全旗标解析(含 `--session`)、缺 `--test`/缺 `--session` 各报错、未知子命令消息含 verify-page。`index.ts`:读 mapping entry → `states` 合并 = `--states` 显式 > `entry.states?.map(s => s.name)` 名单 > `[]`(供 `expandMatrix` 展开);`pinnedStates = entry?.states`(canonical schema 对象原样透传,供 `verifyPage` 按 `judgePath` 路由,见 Step 6)→ `selectGradleRunner` → `verifyPage({ ..., sessionId: cmd.session })` → exit `report.pass?0:1`;`--json` 时先打印完整 JSON,最后一行恒为 page-report 绝对路径;finally `stopOdiffServer()`(flushAndExit 沿用)。

#### Step 9 — 端到端烟测 + 预算实测(commit)

```bash
cd /Users/zhuxi/AI/magpie_eye && npm run build \
&& node packages/uiv-cli/dist/index.js verify-page --test com.magpie.uiv.demo.CalibPageScreenshotTest \
  --node 1:100 --demo demo-android --session standalone --matrix custom:base/typical,pixel5-dark/typical --json
```

机判断言(node -e 读产物):exit 0;过 `validatePageReport`;`sessionId==='standalone'`;`perCell.length===2` 且 cellId 序 `['base__typical','pixel5-dark__typical']`;base 格 `judgePath==='parity'&&assertionScope==='full'&&pass`;dark 格 `assertionScope==='geometry-only'&&pass`(CalibCard 硬编码色,night 下几何不变);`classes===[]`;`durationMs` 落盘(预期 ~2×5.1s+固定开销)。fail 聚合由 Step 6 单测覆盖,E2E 只跑绿路径(写偏反例归 T3.5)。

#### 验收清单(可机判)

1. `npm test -w packages/uiv-core` exit 0(矩阵展开含三交叉与格数断言、分类映射全覆盖、page-report schema、source 归因、复用面四单测);
2. `npm test -w packages/uiv-cli` exit 0(verify-page args);
3. Step 7 gradle 单格命令 exit 0 且 qualifiers 生效;
4. Step 9 E2E 烟测 exit 0 且断言全过(base+dark 两格);
5. 全仓 `npm test` 存量零回归。

#### 共享文件登记(不在本任务内直接改)

- **barrel `uiv-core/src/index.ts` 待收尾 agent 集成**:page/ 四模块 value export(expandMatrix、DEVICES、DEVICE_QUALIFIERS、CROSSINGS、classifyCell、classifyPage、SUBREASON_CLASS、validatePageReport、verifyPage)+ 配套 type(Cell/FailureClass/PageClassification/PageReport/PageCell/VerifyPageOpts)。
- .gitignore 无新增(`.ui-verify/` 已忽略)。
- 写偏排他:本章改 demo-android(plugin+新测试类),与其他动 demo 任务串行(派发条款⑤)。


---

# T3.4 — 内容态验证:fixture 注入 + L2-invariant 套件

> 上游:orchestration.md M3 表 T3.4;设计文档 3.3 全节 + 2.4 L2-invariant(CS1/CS2/CS3/CS5/CS6/CS7)。TDD:每步红→绿→`npm test`(uiv-core)或 gradle 全量→commit(带 T3.4)。
> **现状(已核对源码,不重做)**:SemanticsDumpRule 已导出 touchBoundsInRoot(px),未导出 boundsInRoot(clipped)/hasVisualOverflow/clickable/contentDescription;`Violation.judgePath` 仅 `'parity'|'parity-pixel-sampled'`;l2/ 无 invariant 模块;MappingEntry 无 states[];demo 无 Coil、无图片组件、无 @PreviewParameter。**NATIVE hard-gate 已实证**(meta.json.text_metrics=hard-gate),约束条款见 docs/calibration.md:Robolectric 4.16 + NATIVE + sdk≥26 + 当前字体环境钉死,环境升级必重跑 CS1/CS2 probe,否则降 advisory。
> **边界**:mapping.json states[] 由 T3.2(uiv pin)写入,本章只定义类型+读取器;设备×内容态矩阵编排与 CLI `--state` 归 T3.3;本章交付 core 能力 + demo fixture + 端到端。**禁碰 CalibCard.kt**(标定合同,写偏排他)。

## Step 1 类型与常量

红:`l2/constants.test.ts` 追加一用例断言 `TOUCH_TARGET_MIN_DP===48`、`CLIP_TOL_DP===0.5`、`OVERLAP_MIN_DP===1`;`l2/join.test.ts` 新 it:构造带全部新字段的 SemNode,断言 `toDp` 透传(bounds ÷density,布尔/字符串原样)。

绿(目录均指 packages/uiv-core/src/):

- `l2/constants.ts` 末尾追加(注释注明出处):`TOUCH_TARGET_MIN_DP = 48`(CS3 最小触控)、`CLIP_TOL_DP = 0.5`(裁剪判定容差=量化噪声,对齐 EXACT_GRID_DP)、`OVERLAP_MIN_DP = 1`(兄弟重叠须交叠宽高均 >1dp,容抗锯齿贴边)。
- `l2/types.ts`:
  - `Violation.judgePath` 加 `| 'invariant'`;
  - SemNode 加**可选**字段(可选=存量 TS fixture 免改;Rule 侧恒导出):`boundsInRoot?: {left,top,right,bottom}`(px,**clipped**,与 unclipped positionInRoot+size 作差判被裁)、`hasVisualOverflow?: boolean | null`(非文本 null)、`clickable?: boolean`(config 含 OnClick,CS3 口径)、`contentDescription?: string | null`;
  - SemDp 对应加 `boundsDp?`(÷density)与后三者原样;`SemanticsDump` 加 `graphicsMode?: string`(hard-gate 执行依据)。
- `l2/join.ts` toDp 透传新字段(undefined 保持 undefined,不造默认值)。

全绿→commit `T3.4: invariant 类型与常量`。

## Step 2 l2/invariant.ts 纯函数套件

红 `l2/invariant.test.ts`:自带 builder(不动 t25):`semX(tag, text, x, y, w, h, extra: Partial<SemNode> = {})`(px=dp×2;touchBounds 默认=几何盒;新字段经 extra 注入);`dumpX(kids, graphicsMode?)` 包 root(0,0,360,200)。用例(各一正一反):

1. **childClipped**:子 unclipped(0,180,100,40)而 `boundsInRoot`=(0,180,100,20)(高被父裁半)→ 恰 1 条 `property:'childClipped'`(expected=unclipped 盒/actual=clipped 盒);差 ≤0.5dp → 无;boundsInRoot 缺省 → 不执行不计数。
2. **siblingOverlap**:兄弟 (10,10,100,20)/(50,10,100,20) 交叠 60×20dp → 恰 1 条(同对只报一次,DFS 序定);贴边交叠 0 → 无;交叠宽 ≤OVERLAP_MIN_DP → 无。
3. **touchTargetTooSmall**:`clickable:true` 且 touchBounds 40×40dp → 1 条(expected `'>=48x48dp'`);**clickable:true、layout 几何 20×20 但 touchBounds 48×48(框架自动外扩)→ 无**(CS3 反证:layout 几何判定即误杀合规小图标,必须读 touchBoundsInRoot);`clickable:false` 40×40 → 无。
4. **missingContentDescription**:clickable 且 cd null 且**该 clickable 节点自身子树内**无 text → 1 条;clickable、cd null 但**该 clickable 节点自身子树内有 text**(如文本按钮,text 是其后代)→ 无(merged 可及名,收窄口径见口径裁定②);clickable、cd null 且自身子树无 text,但**同级兄弟节点有 text**(如图标按钮旁边的说明文字,非其后代)→ 仍 1 条(兄弟文本不豁免,防误判为该按钮的可及名);cd="头像" → 无。
5. **textOverflow**:`dumpX(..., 'NATIVE')` 且节点 `hasVisualOverflow:true` → 1 条 severity high(**hard-gate 生效**);graphicsMode 缺省/≠'NATIVE' 且 overflow:true → violations 不含之,`advisories` 含 `{property:'textOverflow', testTag, reason:'native_graphics_unverified'}`(环境未钉住降 advisory);hasVisualOverflow null/缺省 → 不执行不计数。
6. **确定性与计数**:同输入两次调用 `toEqual`;组合 fixture 断言 `executed` 恰为计数规则之和。
7. `density!==2` → 抛 `L2Error('render_harness_error')`。

绿 `l2/invariant.ts`(签名与规则钉死):

```ts
export interface InvariantAdvisory { property: string; testTag: string | null; reason: 'native_graphics_unverified' }
export interface InvariantResult { violations: Violation[]; executed: number; advisories: InvariantAdvisory[] }
/** L2-invariant 免基准套件(设计 3.3)。DFS 前序;每节点按 [childClipped, touchTarget, missingCd,
 * textOverflow] 序执行,siblingOverlap 在父访问时按子序枚举 C(k,2) 对。
 * executed 计数:childClipped +1/有 boundsDp 的非根节点;siblingOverlap +1/兄弟对;
 * touchTarget、missingCd 各 +1/clickable 节点;textOverflow +1/hasVisualOverflow 非空节点。
 * 违规:judgePath:'invariant',severity 一律 'high'(3.3 默认),figmaName=testTag??text??'(sem)',
 * hint=本模块确定性模板(不走 makeHint,无 figma 侧期望值)。 */
export function runInvariants(dump: SemanticsDump): InvariantResult
```

判定式(dp):childClipped=clipped 与 unclipped 四边任一差 >CLIP_TOL_DP;overlap=交叠宽 >OVERLAP_MIN_DP ∧ 高 >OVERLAP_MIN_DP;touch=(right−left)<TOUCH_TARGET_MIN_DP ∨ (bottom−top)<TOUCH_TARGET_MIN_DP;textOverflow=hasVisualOverflow===true(graphicsMode==='NATIVE' → violation,否则 → advisory)。hint 模板各一句(如 childClipped:"子节点溢出父容器被裁剪:检查尺寸/约束或父容器空间")。

全绿→commit `T3.4: L2-invariant 纯函数套件`。

## Step 3 runL2 集成 + invariant-only 路径 + report v1

红:
- `l2/report.test.ts` 新 describe:① calib 合格 dump 的 swatch 注入 `clickable:true`+touchBounds 40×40 → runL2 → violations 含 touchTargetTooSmall、`pass:false`(条件 2),且 **score 与未注入时相等**(invariant 不入 score 分母,审查点 1);② 同 fixture `opts.invariant:false` → 违规消失;③ `runInvariantOnly`(良构 dump)→ `pass:true`、`judgePath:'invariant-only'`、`parityUnavailable:true`、`structural.matched===0`;含 overflow(NATIVE)dump → `pass:false`;density≠2 → `subReason:'render_harness_error'`。
- `report/v1.test.ts`:合法值通过;负例:judgePath 非法值 → throw;`'invariant-only'` 而 parityUnavailable 非 true → throw;structural.invariant.advisories 非数组 → throw。
- `baseline/pull.test.ts`:`stateJudgePath(entry,'rtl')` states 未声明该名 → 抛 `L2Error('figma_spec_invalid')`(**运行期不猜**);声明 parity 缺 figmaVariantNodeId → 同抛;合法声明返回原样。

绿:
- `report/v1.ts`:ReportV1 加 `judgePath?: 'parity' | 'invariant-only'`(缺省⇒parity,存量兼容)、`parityUnavailable?: boolean`(缺省⇒false);StructuralV1 加 `invariant?: { executed: number; advisories: InvariantAdvisory[] }`;校验器:两枚举 + invariant 块形状(executed number/advisories array)+ 组合约束 `judgePath==='invariant-only' ⇒ parityUnavailable===true`。
- `l2/report.ts`:RunL2Opts 加 `invariant?: boolean`(**默认 true**);runL2 在 missing 循环与 `sc` 计算之后:`if (opts.invariant !== false) { inv = runInvariants(dump); violations.push(...inv.violations); }`——sc 已按 parity violations/executed 先行算得,invariant 违规只进 verdict 条件 2 与 structural(存量 score 断言零漂移);structural 加 `invariant: inv 块`(关闭时 `{executed:0,advisories:[]}`)。新 export `runInvariantOnly(dump, opts: {minScore?, blockingSeverities?, prevState?}): ReportV1`:density 守卫(≠2 → inconclusiveReport('render_harness_error'))→ runInvariants → `score = 1 − Σweight/executed`(executed=0 ⇒ 1,**仅 informational 展示用,不参与 pass 判定**,口径裁定①)→ verdict **只按条件 2(存在 high/blocking severity violation ⇒ fail)判定,不走条件 1(score<minScore 阻断)**→ stepState 沿用;structural=`{matched:0, untaggedCoverage:1, matchRate:1, 各数组空, diagnostics 空对象形态, matchFailure:null, invariant 块(`executed` 如实暴露本轮规则执行数,供审计不参与门禁), violations}`(置 1 约定见口径裁定③);顶层 `judgePath:'invariant-only'`、`parityUnavailable:true`。runL2 输出不写 judgePath(缺省=parity)。
- `baseline/pull.ts`:复用 T3.2 `mapping.ts` 已定义的 `MappingStateRef { name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }`(states[] canonical schema,四章统一,见跨章契约裁定第 5 条;`MappingEntry.states?: MappingStateRef[]` 已由 T3.2 Step 1 引入,本章不重复定义接口,只加读取器);`export function stateJudgePath(e: MappingEntry, state: string): MappingStateRef`(未声明该名/声明 `judgePath==='parity'` 却缺 `figmaVariantNodeId` → `L2Error('figma_spec_invalid')`)。
- `check/runL2.ts`:RunCheckL2Opts 加 `invariant?: boolean` 同名透传(--state 编排归 T3.3)。

存量修正预案:新字段全可选、invariant 不动 score/executed,预期存量零改;若个别用例 structural 整对象 `toEqual` 或 bad-dump 兄弟意外交叠出新违规,按红灯最小修(补 `invariant` 键 / 该用例传 `invariant:false`),逐处注明。

全绿→commit `T3.4: runL2 invariant 集成 + invariant-only 报告 + states 读取器`。

## Step 4 demo semantics 导出扩展

红:`SemanticsDumpTest` 追加断言:dump JSON 顶层含 `"graphicsMode":"NATIVE"`;节点含 `boundsInRoot` 四键;CalibTitle `hasVisualOverflow` false、swatch `clickable` false、`contentDescription` null。

绿:`SemanticsDumpRule.kt`(仅加字段,存量键序不动):
- `dump()` 构造参 `graphicsMode: String = "NATIVE"`,头部写该键(注释:环境由 ConfigPinningTest 钉死;切 LEGACY 必须同步传参并重跑 CS1/CS2 probe——calibration.md hard-gate 条款);
- `nodeJson` 追加:`"boundsInRoot":{left/top/right/bottom ← n.boundsInRoot}`;`"hasVisualOverflow":${results.firstOrNull()?.hasVisualOverflow ?: "null"}`(已取 results,零新查询);`"clickable":${n.config.contains(SemanticsActions.OnClick)}`;`"contentDescription":${js(n.config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" "))}`。

gradle 全量绿→commit `T3.4: semantics 导出扩展(clipped bounds/overflow/clickable/cd)`。

## Step 5 demo 内容态 fixture + Coil 注入

依赖(libs.versions.toml + app/build.gradle.kts):`coil = "3.3.0"`;io.coil-kt.coil3 的 coil-compose(implementation)/coil-test(testImplementation)。**不引 network artifact**:图片全经 FakeImageLoaderEngine / model=null,零网络零抖动。

main 新增两文件:
- `ContentFixtures.kt`:`enum class ContentState { TYPICAL, EMPTY, LONG_TEXT, ERROR, LOADING, LARGE_LIST, RTL }`(3.3 七态表);`object ContentFixtures`:真实文案常量(TITLE="Calibration Report"、BODY 一句)+ `fun amplify(base: String, targetLen: Int)` = base + CJK 块("鹊眼校准超长中文混排样例")+ emoji 块("🦅📐")循环拼接截断——**纯函数零随机源(禁 Random;"种子固定"以零随机上位满足)**;`class ContentStateProvider : PreviewParameterProvider<ContentState>`(values=七态全序)。
- `FixtureCard.kt`:`@Composable fun FixtureCard(state: ContentState)`——根 `Modifier.width(360.dp)`(高 wrap,LARGE_LIST 免意外裁剪)Column 布局(D-03:禁 offset 主定位),元素均挂 testTag:标题 `Text(maxLines=1, softWrap=false, overflow=Clip, Modifier.width(200.dp))`(LONG_TEXT 态喂 `amplify(TITLE,120)` → 必溢出);正文 Text;头像 `AsyncImage(model = if (state==ERROR) null else "https://fixture/avatar.png", contentDescription="头像", fallback/error=ColorPainter 占位, Modifier.size(48.dp).clickable {})`(ERROR 态经 **model=null 走确定性失败占位**,审查点 6);EMPTY→空态文案"—";LOADING→两骨架 Box;LARGE_LIST→Column 30 行×16dp(索引拼接文案);RTL→`CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl)` 包 TYPICAL 内容。`@Preview(name="FixtureCard", widthDp=360) fun FixtureCardPreview(@PreviewParameter(ContentStateProvider::class) state: ContentState)`——**不设 limit**(CS5:scanner 扫描期即按 provider values 逐值展开,limit 缺省 Int.MAX_VALUE 不裁剪;验收以 PNG 数=7 反证)。

test 新增两文件:
- `ContentFixturesTest.kt`(纯 JVM):amplify 两次调用 equals、长度=targetLen、前缀=base。
- `FixtureCardScreenshotTest.kt`:`ParameterizedRobolectricTestRunner`(参数=ContentState.entries)+ NATIVE + `@Config(sdk=[36], qualifiers="w360dp-h800dp-xhdpi")` + createComposeRule + SemanticsDumpRule;`@Before`:`SingletonImageLoader.setSafe { ctx -> ImageLoader.Builder(ctx).components { add(FakeImageLoaderEngine.Builder().intercept("https://fixture/avatar.png", ColorImage(0xFF3366CC.toInt())).build()) }.build() }`("图已载入"态);`@After` `SingletonImageLoader.reset()`(@OptIn(DelicateCoilApi));@Test:setContent{FixtureCard(state)} → `captureRoboImage("build/uiv/fixture_<state小写>.png")` + `dump(rule, "fixture_<state小写>")`。

gradle 全量绿→commit `T3.4: 内容态 fixture + Coil FakeImageLoaderEngine 注入`。

## Step 6 端到端验收 + 确定性(scripts/check-t34.mjs)

沿 check-t10b.mjs 形态(纯 node,常量路径,exit code 机判);invariant 断言经 `packages/uiv-core/dist/index.js`(先 `npm run build`)导入 runInvariants/runInvariantOnly:

1. `grep -rn "kotlin.random\|java.util.Random" demo-android/app/src/main` 命中 → exit 1(禁运行期 Random)。
2. 跑 `./gradlew testDebugUnitTest --tests '*FixtureCard*' --tests '*PreviewScanner*'`(demo-android 内,GRADLE_USER_HOME=./.gradle-home)→ previews/ 下 `*FixtureCardPreview*` PNG 恰 **7** 张(CS5 展开 + limit 反证),≠7 → exit 3。
3. 读 `build/uiv/fixture_long_text.semantics.json` → runInvariants → 含 `property==='textOverflow'` 且 high(**故意溢出→invariant fail,hard-gate 端到端证明**),缺 → exit 4。
4. 读 `fixture_rtl.semantics.json` → runInvariantOnly → `pass===true ∧ judgePath==='invariant-only' ∧ parityUnavailable===true`(**RTL 态 invariant-only 跑通**),否则 exit 5。
5. **字节级确定性**:暂存 fixture_long_text.png 与 .semantics.json 的 sha256 → 二次 `--rerun` 跑 `*FixtureCardScreenshotTest*` → 双文件 sha256 一致,否则 exit 2(--rerun 防 build cache 假热,D-07 纪律)。

验收:`npm test` + `npm run build` exit 0;`node scripts/check-t34.mjs` exit 0。commit `T3.4: 内容态端到端 + 确定性验收`。

## 共享文件登记(收尾 agent 统一集成,本任务不碰)

- barrel `packages/uiv-core/src/index.ts`:追加 `export * from './l2/invariant.js'`。
- .gitignore:无新增(build/ 已覆盖)。meta.json 由主会话写。

## 设计裁量记录(①②③经 Codex 随子计划审查裁定,详见文首跨章契约裁定第 6 条;④⑤⑥为既有设计说明,非待裁量项)

1. invariant 违规**不入 score 分母**:全 high 由 verdict 条件 2 承担,score 保持 parity 语义(存量锚点零漂移)——**已裁定**(口径裁定①):invariant-only 报告的 score 同理仅 informational,不参与 pass 判定,pass/fail 只看有无 high/blocking severity violation。
2. missingContentDescription 加"同一 clickable 语义子树内有非空可见文本才豁免"(merged 可及名,防文本按钮假阳;**兄弟节点的文本不豁免**,防图标按钮借兄弟标签蒙混)——**已裁定**(口径裁定②),范围较 3.3 字面"cd 空即 fail"收窄。
3. invariant-only 报告 `untaggedCoverage`/`matchRate` 置 1(无基准无 tag 契约,免误触 coverage 门禁)——**已裁定**(口径裁定③),另需顶层必标 `judgePath:'invariant-only'`+`parityUnavailable:true`,`structural.invariant.executed` 如实暴露本轮执行数(供审计,不参与门禁)。
4. invariant 不消费 ignore-region(其坐标系在 Figma 侧,invariant 无 spec;如需语义侧豁免另立任务)。
5. textOverflow 未钉住环境的 advisory 落 `structural.invariant.advisories` 而非顶层 subReason(advisory ≠ inconclusive)。
6. Coil 钉 coil3 3.3.0;ERROR 态用 model=null(Coil 语义:null→fallback/error 占位),不依赖 FakeImageLoaderEngine 未拦截路径行为。


---

# T3.5 —— 端到端反例集与 M3 硬验收

## 0. 定位与依赖

M3 收官门禁任务。前置:T3.1a(辅通道:合同构建器合并 mapping → 专属 requiredEvidence 单元)、T3.1b(主通道:uiParity requirement-type adapter + verify-page 触发 + .ui-verify 窄豁免)、T3.2(uiv pin)、T3.3(verify-page + 失败分类映射)、T3.4(内容态 fixture + L2-invariant)。本任务只写测试与演示脚本,**不改产品代码**;测试红了 = 上游任务缺口,回对应任务修,不在 T3.5 内打补丁。

**验收总则(可机判)**:七场景测试全绿 + magpie_agent 存量回归(基线 3349 中 3346 pass,3 failed 为 Go 缺失环境性)不新增失败 + 演示脚本 exit 0。

## 1. 模板、锚点与硬约束

**模板测试(实地核验,照抄构造模式)**,均在 `/Users/zhuxi/AI/magpie_agent/tests/capabilities/loop/`:

- **E2E 全 loop 模板**:`loop.test.ts` 内 `'fails implementation when local TRD contract requires files that were not produced'`(临时目录 + TRD fixture 含"改动文件清单"表 + config.yaml `stages: [implementation]` + `strict_stage_evaluation: true` + `providerMocks.factory` mock planner/executor + `plannerMocks.generateLoopPlan.mockResolvedValueOnce` + `runCapability(loopCapability, {mode:'run', prdPath, waitHuman:false, dryRun:false}, ctx)` → 断言 `result.result.status` 与 `session.status`);姊妹用例 `'fails implementation when a TRD-listed file exists in the repo but was not changed in this run'` 提供 **git init + baseline commit + 预置脏文件** 模式(⑦ 用)。完成态正模板:`'keeps a completed loop result when skill candidate generation fails'`。executor 重试 prompt 捕获模式:同文件 `executorPrompts` 数组(providerMocks.factory 内 push `messages[0]?.content`,⑥ 用)。
- **合同/session 单元模板**:`source-document-contract.test.ts` 内 `'tracks missing evidence per declared evidence type…'`(buildRequirementContract + session 字面量 `as LoopSession`(artifacts 只填 requirementContractPath/repoRootPath/证据路径)→ `validateRequirementContract`)、`'includes requirement type findings directly in contract validation'`(typeFindings 断言形态)、`'excludes magpie runtime artifacts (.magpie/*) from out-of-scope detection'`(⑦ 单元直接模板)、文件头 `initRepo()` helper。
- **证据计算模板**:`evidence-taxonomy.test.ts`(collectRequirementEvidence / hasEvidenceType)。

**符号锚点(HEAD 4d86bbc5,禁行号)**:`src/capabilities/loop/application/requirement-contract.ts` — `buildRequirementContract` / `persistRequirementContract` / `validateRequirementContract` / `decideRequirementCompletion`(scope='implementation' 分支:仅 implementationReasons 阻断,**typeFindings 在内、missingEvidence 不在** —— D-09 根因)/ `detectRequirementScopeDiff` + `isMagpieRuntimePath` + `MAGPIE_MANAGED_DELIVERABLES`;`execute.ts` — implementationCompletionDecision 消费点、`restoreOutOfScopeFiles`/`restoreOutOfScopeHunks`(scope_drift 回滚)、retryStateNote 拼装;`runtime.ts` — `runSafeCommand`;`webhook-console/agent-control.ts` — persistRequirementContract 第二调用点。

**硬约束**:① **fixture 禁 .go 文件**(基线 3 个失败即 Go 工具链缺失环境性;语言 adapter 见 .go 会探测 go,反例必须用 `src/app.ts` 类 TS 路径 + .md);② uiParity typeFinding 的 category/message 字面量以 T3.1b 落地为准,本章用占位 `ui_parity_*` 并在实现时对齐符号;③ verify-page 由 loop 经 runSafeCommand 拉起,测试用 **PATH 前置 shim `uiv`**(node 脚本,写死输出;若 T3.1 落地为 UIV_BIN 覆盖则改用之);④ 新测试文件独立提交,git add 精确路径,不碰 meta.json/共享文件。

**文件布局**:magpie_agent 侧全部入 `tests/capabilities/loop/ui-visual-validation.test.ts`(新文件,describe 按场景分组);⑤ 在 magpie_eye 侧(uiv-core 单元 + demo 渲染,归 T3.4 建的目录);演示脚本 `scripts/m3-t35-demo.sh`(magpie_eye)。

## 2. 七场景设计

### ① 端到端硬验收(D-09 升级)—— 3 个测试

**①-A 判定链单元(负控制对照,钉死 D-09 根因)**:手工构造 `RequirementContractValidationResult` fixture 两份 + 空 coverage:
- fixture-1:`missingEvidence=[{label:'UI 视觉验收', expectedEvidenceTypes:['ui_visual_validation']}]`,`typeFindings=[]`,其余全空 → 断言 `decideRequirementCompletion(v, c, 'implementation').status === 'pass'`(**辅通道单独不足** —— 把漂移根因固化为负控制,该断言若未来变 fail 说明豁免语义又变,需回 Codex);
- fixture-2:同上但 `typeFindings=[{type:'ui_change', category:'ui_parity_*', message:…}]` → 断言 status==='fail' 且 reasons 含该 message(**主通道必要且充分**)。

**①-B E2E:report 缺失 → 终态非 completed**。模板 = 'fails implementation…not produced'。构造:临时 git 仓 + TRD(改动文件清单含 `src/ui/card.ts`;含"测试用例"章节使通用测试证据单元存在)+ `.ui-verify/mapping.json`(scope.sourceDocumentPath=该 TRD 相对路径)+ **不放 uiv shim**(runSafeCommand 失败 → 落缺失态);executor mock 真写 `src/ui/card.ts`(通过文件级合同)。断言:`result.result.status` ≠ 'completed';session.status ≠ 'completed';implementation stageResults.risks 含 uiParity finding message;requirement-contract-validation 产物 `typeFindings` 非空(证明阻断经 adapter,而非仅 validateRequirementContract 布尔)。

**①-C E2E:report 存在但 pass:false**。同 ①-B 但放 shim uiv:verify-page 写 schema 合法、`pass:false`(violations 非空)的 page-report.json 到 `.magpie/sessions/<id>/`。断言同 ①-B,另加:risks 不含"report 不存在"类措辞(区分两条 adapter 分支:存在性 vs pass 校验)。可加变体(时间允许):report pass:true 但 **stale**(mtime 早于本轮改动/关联 session 不符,按 T3.1b stale 判据)→ 仍阻断。

### ② ANY-of 反例(辅通道计算层)

设计文档 5.1 末尾钦定场景:"有 integration_test_result 证据但缺 ui_visual_validation → fail,防零证据假通过"。单元:buildRequirementContract(TRD + mapping 在场,经 T3.1a 合并出专属单元)→ session 字面量 `artifacts.greenTestResultPath='/tmp/green.json'`(有集成测试证据)、无 uiVisualValidationPath → `validateRequirementContract` 断言 `missingEvidence` 含 `{label:<T3.1a 专属单元 label>, expectedEvidenceTypes:['ui_visual_validation']}` 且**不含**通用测试单元(其已被 green 证据满足 —— 证明专属单元独立判定、未被 ANY-of 吞并)。辅以 `hasEvidenceType([{type:'integration_test_result',…}], ['ui_visual_validation'])===false` 直接单元。模板:`'tracks missing evidence per declared evidence type…'`。

### ③ 合同重建幂等(T3.1a 衔接)

临时仓 + TRD + scoped mapping.json。对同一 session 连续 `persistRequirementContract(session)` 三次,每次重读 requirement-contract.json 断言:`uiParity` 字段在且值恒等(fileKey/nodeId/version/minScore/matrix);专属 requiredEvidence 单元**恰好一条**(不丢失、不累积重复);coverageUnits 中 'validation_requirement' 复用单元恰好一条(D-09 ④)。再断言 execute.ts 与 agent-control.ts 两调用点等价:直接调用 agent-control 所用同一导出函数即可覆盖(双调用点共享实现,无需起 webhook)。对照:删 mapping.json 后再 persist → uiParity 与专属单元消失(纯函数派生,无残留)。

### ④ 作用域反例(他任务 pin 不污染)

mapping.json 两条:条目 A scope.sourceDocumentPath='docs/other-feature.md'(他任务),条目 B **无 scope**(standalone 手工 pin)。对 sourceDocumentPath='docs/current.md' 的 session persist → 断言合同**无** uiParity、无专属单元、无 'ui_visual_validation' 相关 coverageUnit;E2E 轻量版:同构造跑 dry-run loop(模板 'keeps a completed loop result…',dryRun:true)断言无 uiParity 合同的 session 不产生 uiVisualValidationPath、终态 completed 不被卡(T3.1 验收行的反向面)。hash 漂移仅告警(同 path 不同 sourceDocumentHash → 仍合并 + 告警)归 T3.1a 正面测试,此处不重复,仅交叉引用。

### ⑤ 内容态反例(magpie_eye 侧,T3.4 衔接)

- **longText 溢出 → invariant fail(单元,uiv-core)**:构造合成 semantics 树 fixture(子节点 bounds 超出父容器 / NATIVE `hasVisualOverflow=true` 字段,按 T1.1 结论的门禁形态)→ L2-invariant 引擎输出 childClipped/文本溢出违规,verdict fail。禁真渲染,纯 JSON 进出,确定性。
- **溢出 → 整页分类(demo 渲染,归入演示脚本前置步)**:CalibCard longText 内容态 fixture 用**故意超长串**(种子固定)真渲染一格 → page-report 对应 perCell fail 且分类 behavior_drift(violations→behavior_drift,T3.3 映射)。
- **parity 态几何可比(反"fixture 注入破坏几何")**:parity(默认)内容态在 fixture 注入机制加载下渲染 → 与 baseline spec join 后 matchRate ≥ 熔断阈值、score 可计算、非 inconclusive —— 证明 T3.4 的注入不改变默认几何。同 fixture 重复渲染字节级一致(T3.4 验收已含,此处引用不重测)。

### ⑥ 环境故障反例(T3.3 分类映射衔接)

- **uiv 侧**(T3.3 已有映射单测,此处只补端到端一格):shim/真实 harness 下模拟 gradle 拉起失败(shim gradle exit 非 0)→ page-report cell `category='environment_gap'`、failureKind=render_harness_error。
- **magpie 侧 E2E(本章主体)**:①-C 构造 + shim uiv 输出 `pass:false` 且失败类别为 environment_gap(render_harness_error)的 report;config `retries_per_stage: 2` 使触发一次重试。断言:(a) 终态 ≠ completed(环境故障不放行);(b) contract-validation 的 failureCategory==='environment_gap'(不误归 implementation_gap/evidence_gap);(c) **executorPrompts 捕获的重试 prompt 不含 UI 修正指引标记**(retryStateNote 的 uiParity 修正段落 / violations 摘要 / report 路径指引,具体字面量以 T3.3 注入实现为准,断言 `not.toContain` 其注入哨兵字符串);(d) 对照组:同构造但 report 为 behavior_drift(violations 非空)→ 重试 prompt **含**修正指引 —— 两面成对,防"从不注入"的假绿。

### ⑦ 窄豁免两面(D-09 ③)

**单元(模板 = '.magpie/* 豁免'测试,对 `detectRequirementScopeDiff`)**:changedFiles 混合 `['src/app.ts', '.ui-verify/reports/page-report.json', '.ui-verify/renders/a.png', '.ui-verify/state.json', '.ui-verify/mapping.json', '.ui-verify/baselines/1-100@V1/spec.json', '.ui-verify/baselines/1-100@V1/baseline.png']`(合同只授权 src/app.ts)→ 断言 outOfScopeFiles **恰为两条 baselines 路径**;reports/renders/state 连 changedFiles 都不进(运行态豁免);mapping.json 豁免仅在 T3.1b 受控条件(写入来源/hash 约束)满足时成立 —— 若落地为条件豁免,加一条"受控条件不满足 → mapping.json 回到 outOfScope"的反面断言(以 T3.1b 符号为准)。

**E2E 面一(工具写不被 scope restore 回滚)**:①-C 的 E2E 构造,fixture 仓**故意不 .gitignore** `.ui-verify/`(最坏情形:豁免必须由 detectRequirementScopeDiff 自身成立,不依赖 gitignore),`.ui-verify/reports/old.json` 先提交再于 run 前改写(脏文件模式,模板 = 'TRD-listed file…not changed' 的预置脏文件手法)。run 后断言:该文件内容 = 改写后内容(**未被 restoreOutOfScopeFiles 回滚**);risks 无 '.ui-verify/reports' 字样;失败原因(若 fail)与 scope_drift 无关。

**E2E 面二(模型手改 baselines 拦截)**:同构造,脏文件换成 `.ui-verify/baselines/1-100@V1/spec.json`(已提交基线后改写,模拟模型骗验证)。断言:终态 ≠ completed;failureCategory==='scope_drift';risks 含该路径;run 后文件内容**回滚为提交版**(restoreOutOfScopeFiles 生效);repair 产物存在(writeRepairArtifacts 路径)。

## 3. 存量回归门禁

跑法:`cd /Users/zhuxi/AI/magpie_agent && npx vitest run --reporter=json > /tmp/t35-vitest.json`。机判脚本(演示脚本内联):解析 JSON,断言 (a) 失败用例名集合 ⊆ 开工时记录的 3 条 Go 环境性基线(开工第一步先全量跑一次,把失败名单写入 `tests/fixtures/ui-visual/known-env-failures.txt` 随分支提交);(b) 通过数 ≥ 3346;(c) 新文件 `ui-visual-validation.test.ts` 全 pass。任何新失败 = 门禁红,禁止以"环境性"名义扩充名单(扩充需 Codex 决断)。

## 4. 演示场景:一个 ui_change 需求在 loop 全自动跑通

**可测入口实地结论**:magpie loop 的机判入口是 vitest 内 `runCapability(loopCapability, …)`(loop.test.ts 全文件即此模式;真实 CLI 跑需真 LLM provider,不可机判)。真实渲染入口是 magpie_eye demo-android(uiv 现有 baseline pull/check,T3.3 加 verify-page;`.ui-verify/` 已在 demo 侧存在)。故演示 = **两半拼合,非 LLM 环节全真实**:

- **半程 1(真实工具链,magpie_eye)**:`uiv pin`(CalibCard 已知 fileKey/nodeId/version,scope 指向 CalibCard 需求文档 fixture)→ `uiv verify-page --json` 对 demo-android 真渲染真裁判 → 断言 exit 0、page-report schema 合法、pass:true、perCell 含三显式交叉格。产出 report 存为 fixture 快照。
- **半程 2(真实 loop 链路,magpie_agent vitest)**:`ui-visual-validation.test.ts` 收官用例 `'completes a ui_change requirement end-to-end with ui visual validation'`:临时仓 + **CalibCard 需求文档 fixture**(`tests/fixtures/ui-visual/calib-card-trd.md`:改动文件清单含 `src/ui/CalibCard.ts`(TS 路径,避 Go)、"UI 还原验收"章节)+ scoped mapping.json + shim uiv(输出**提交入库的半程 1 真实 report 快照**,保 CI 确定性)+ mock executor 真写文件 → dryRun:false 跑通。断言:合同含 uiParity;verify-page 被触发(shim 落调用痕迹文件);`session.artifacts.uiVisualValidationPath` 已设;collectRequirementEvidence 含 `{type:'ui_visual_validation'}`;`result.result.status==='completed'` 且 session.status==='completed'。
- **拼合脚本** `scripts/m3-t35-demo.sh`(magpie_eye):半程 1 → 校验新鲜 report 与提交快照关键字段一致(nodeId/version/pass)→ 半程 2(vitest 单文件)→ 第 3 节回归门禁 → exit 0。该脚本 exit 0 即 T3.5 行"一个 ui_change 需求在 loop 全自动跑通"的机判形态;跑完把结果记 meta.json(编排者做)。

## 5. 步骤分解(bite-size,每步一 commit 带 T3.5)

| 步 | 内容 | 验收 |
|---|---|---|
| S1 | 全量基线跑 + known-env-failures.txt 落盘;建 `ui-visual-validation.test.ts` 骨架与 fixtures 目录 | vitest 该文件 0 用例可运行;名单恰 3 条 |
| S2 | ①-A 判定链单元(含负控制) | 2 断言绿;负控制注释引用 D-09 |
| S3 | ② + ③ + ④(合同/证据单元层) | `npx vitest run tests/capabilities/loop/ui-visual-validation.test.ts` 绿 |
| S4 | ⑦ 单元 + shim uiv fixture 脚本 | 单元绿;shim 可执行产合法 report |
| S5 | ①-B/①-C + ⑥ E2E + ⑦ 两面 E2E | 同文件绿;E2E 各用例 <30s |
| S6 | ⑤(magpie_eye:invariant 单元;溢出渲染格并入演示脚本) | uiv-core vitest 绿 |
| S7 | 收官 E2E + calib-card-trd.md + report 快照 + m3-t35-demo.sh | 演示脚本 exit 0 |
| S8 | 回归门禁全量跑 + 名单比对 | 失败集 ⊆ 基线名单;通过数 ≥3346 |

失败升级:任一场景红且判定为上游缺口 → 停,报告对应任务(T3.1a/b/T3.2/T3.3/T3.4)与最小复现,不自行改产品代码;30 分钟未自解即停。

## 6. M3 硬验收清单(汇总,全部机判)

1. 七场景测试全绿(①×3、②、③、④、⑤×2、⑥×2、⑦×3,共 ~13 用例 ±,以落地为准);
2. ①-A 负控制在案(辅通道单独 pass、主通道 fail)—— D-09 根因永久钉死;
3. 存量回归:失败集 ⊆ 3 条 Go 环境性基线,通过 ≥3346;
4. `scripts/m3-t35-demo.sh` exit 0(真实 verify-page pass + loop E2E completed);
5. 分支 feature/ui-visual-validation,不动 main;每步 commit 带任务号。

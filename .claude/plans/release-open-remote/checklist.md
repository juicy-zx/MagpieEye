# 开放远程仓库检查单(执行日:2026-07-16 之后)

背景:历史提交 b40de80 含真实 Figma presigned URL,`X-Amz-Date=20260709 + X-Amz-Expires=604800` → **2026-07-16T00:00:00Z 过期**。用户决策(2026-07-10):不做历史清洗,私有至过期后再开放。

## 前置条件(全部满足才执行)
- [ ] 当前时间已过 2026-07-16T00:00:00Z(URL 已自然失效)
- [ ] 发布文档就绪:#11 CLI 示例重写 + #14 接入指南已入库(2026-07-13 启动)
- [ ] 工作区干净、全量测试绿(`npm test` + demo gradle)

## 开放前终扫(在 HEAD 上,历史中已过期的 URL 可留)
- [ ] secrets 扫描:`git grep -iE 'figd_|AKIA[0-9A-Z]{16}|X-Amz-Signature=[0-9a-f]{20}' -- ':!*.real.json'` 应零命中(fixture 中 REDACTED 保形占位属预期,真实值不得出现)
- [ ] `.figma-pat`:确认 gitignored(`git check-ignore .figma-pat`)且权限 0600
- [ ] `git ls-files | grep -iE 'secret|token|credential'` 目检

## 执行(需用户提供远程地址;push 是对外动作,执行前向用户确认)
- [ ] `git remote add origin <用户提供的远程地址>`
- [ ] `git push -u origin main`
- [ ] 仓库可见性由用户在平台侧设置(先私有验证 push 完整,再转公开)

## 开放后
- [ ] 记忆清理:magpie-eye-project-overview.md 中"presigned URL 2026-07-16 后本条失效可删"一条按注删除
- [ ] pending_followups 中"真实远程 CI 接入"条目触发条件此时可能被满足(用户侧接 CI 平台时启动)

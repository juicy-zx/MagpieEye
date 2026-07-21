# 鹊眼(Magpie Eye)GitHub 发布自动化

本文说明本仓的发布自动化方案:发布形态是 **GitHub Pages 静态 Maven 仓**(harness 两枚
AAR,消费者零凭据即可拉取)+ **GitHub Release**(CLI 侧的版本锚点与制品完整性摘要)。

## 1. 两条 tag 约定

发布触发方式是打 tag,两条 lane 互斥、互不干扰:

| tag 形态 | 触发的 workflow | 发布对象 |
|---|---|---|
| `v<版本号>`,如 `v0.1.0` | [`.github/workflows/release-cli.yml`](../.github/workflows/release-cli.yml) | CLI 侧 GitHub Release(正文 + 摘要清单附件) |
| `harness-v<版本号>`,如 `harness-v0.1.0` | [`.github/workflows/publish-harness.yml`](../.github/workflows/publish-harness.yml) | Android harness 两枚 AAR,发到 gh-pages 分支 `/maven` |

`harness-v*` 不以字面字符 `v` 开头,天然不会被 `v[0-9]*` pattern 撞上,两条 workflow 的
触发条件互斥,无需额外排除逻辑。`publish-harness.yml` 还支持 `workflow_dispatch` 手动
触发(输入 `version`,如 `0.1.0`),便于在 Actions 页面直接点按钮发布,不必依赖打 tag。

一切版本号从 tag(或 `workflow_dispatch` 的 `version` 输入)推导,两个 workflow 与
`android-harness` 的两个 `build.gradle.kts` 均不硬编码具体版本。

## 2. GitHub Pages 启用

1. `gh-pages` 分支由 `publish-harness.yml` **自动维护**:检测到远程不存在该分支时,
   workflow 会自动创建一个孤儿分支(`git worktree add --orphan`)并推送,不需要手工
   初始化。
2. 仓库 **Settings → Pages**(一次性手工步骤,GitHub 未提供本项目决策范围内可用的
   自动化开关):Source 选择 "Deploy from a branch",Branch 选择 `gh-pages` /
   `/ (root)`,保存。
3. 之后消费者按第 6 节的 URL 形态即可访问该静态 Maven 仓,无需任何凭据。

## 3. 历史记录:0.1.0-alpha.4 首发(锚定字节,已完成)

harness 的 `0.1.0-alpha.4` 版本曾用锚定字节首发——在已持有该批字节的机器上跑
`./scripts/stage-harness-maven.sh`(逐件比对 `docs/RELEASE-0.1.0-digests.md` 登记的
SHA-256)、手工创建 `gh-pages` 分支并推送。**该流程已是历史,不再重复**:自本文档起,
`0.1.0` 及之后的 harness 版本一律走第 4 节的 CI 全自动流程。改用新版本号 `0.1.0`
(而非复用 `0.1.0-alpha.4` 坐标)的原因是 CI 重新构建的字节与本机 `~/.m2` 锚定字节
不同——同坐标对应两种字节会污染信任链,发新版本号既避免该问题,也消除了
"CLI 0.1.0 ↔ harness alpha.4" 的版本不对称。`scripts/stage-harness-maven.sh` 保留作为
离线/应急兜底(见脚本头注释),不再是首发路径。

## 4. 当前流程:CI 全自动发布(0.1.0 起)

打 `harness-vX.Y.Z` tag 并推送,或在 Actions 页面手动触发 `workflow_dispatch`(输入
`version`),`publish-harness.yml` 全自动执行以下步骤,**用户不手工上传任何制品**:

1. 用 CI 环境(JDK 21 + Android SDK + Gradle 9.5.1)以该版本号重新构建两枚 AAR,发布到
   build 内 staging 目录(不碰 mavenLocal)。
2. **P0-8 兼容性防线**(断言不过即 fail,不继续上仓):
   - 两枚 AAR 的 `.pom`/`.module` 零 `kotlin-stdlib` 传递依赖;
   - Kotlin metadata version 下探到 `2.0.0`(解 AAR → `classes.jar`,用 `javap -v`
     解析 `@Metadata` 的 `mv` 字段;此为尽力而为断言,若该法在某次 CI 环境下不可靠,
     退化为断言构建配置(`languageVersion`/`apiVersion`)存在,并在 job summary 打印
     实际解析情况供人工核)。
3. `gh-pages` 分支若不存在则按第 2 节自动创建;append-only 校验通过后,把三件套拷入
   `gh-pages` 分支的 `/maven` 路径。
4. 逐件生成 `.sha256` sidecar,并在每个 artifact 的版本目录下生成 `SHA256SUMS` 汇总
   (可用 `sha256sum -c` 校验);摘要表同时打印进 Actions job summary,供带外公示取用。
5. 提交并推送 `gh-pages` 分支。

CLI 侧同理:打 `vX.Y.Z` tag 并推送,`release-cli.yml` 跑 `npm ci` → `npm run build` →
`npm test` 质量门,通过后创建 GitHub Release;正文取
`docs/RELEASE-NOTES-<版本号>.md`(存在才用,缺省生成占位说明并把 Release 标记为
draft),摘要清单文件 `docs/RELEASE-<版本号>-digests.md` 存在则作为附件挂上去。

## 5. append-only 纪律

`gh-pages` 分支 `/maven` 树下**已存在的版本路径不可被覆盖**——`publish-harness.yml`
在拷贝前会做结构性校验:若某个 `<artifactId>/<version>` 目录已存在于 `gh-pages`,
立即 fail,不覆盖、不静默跳过。已发布版本的字节一旦公示即视为不可变;需要修正只能发
新版本号,不能改写旧版本号下的内容。

## 6. 消费者接入 URL

消费者在目标 Android 工程的 `repositories` 里加一条:

```
maven { url = uri("https://juicy-zx.github.io/MagpieEye/maven") }
```

该地址由本仓 GitHub Pages(`juicy-zx/MagpieEye` 的 `gh-pages` 分支 `/maven`)提供,与
[`docs/quickstart-external.md`](quickstart-external.md) 中给消费者的接线口径一致,
消费者不需要任何凭据即可拉取。

## 7. 为什么排除 GitHub Packages 与 JitPack

- **GitHub Packages**:即便是公开仓库,拉取 GitHub Packages 的 Maven 制品仍强制要求
  鉴权(PAT),不符合"消费者零凭据"的冻结决策,故排除。
- **JitPack**:JitPack 按 tag/commit 现拉现建,坐标与产出字节由 JitPack 自己的构建
  环境决定,既改变坐标形态又会重建字节,与"首发不重建、用锚定原字节"的冻结决策冲突,
  故排除。

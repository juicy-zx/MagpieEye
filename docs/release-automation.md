# 鹊眼(Magpie Eye)GitHub 发布自动化

本文说明本仓的发布自动化方案:发布形态是 **GitHub Pages 静态 Maven 仓**(harness 两枚
AAR,消费者零凭据即可拉取)+ **GitHub Release**(CLI 侧的版本锚点与制品完整性摘要)。

## 1. 两条 tag 约定

发布触发方式是打 tag,两条 lane 互斥、互不干扰:

| tag 形态 | 触发的 workflow | 发布对象 |
|---|---|---|
| `v<版本号>`,如 `v0.1.0` | [`.github/workflows/release-cli.yml`](../.github/workflows/release-cli.yml) | CLI 侧 GitHub Release(正文 + 摘要清单附件) |
| `harness-v<版本号>`,如 `harness-v0.1.0-alpha.5` | [`.github/workflows/publish-harness.yml`](../.github/workflows/publish-harness.yml) | Android harness 两枚 AAR,发到 gh-pages 分支 `/maven` |

`harness-v*` 不以字面字符 `v` 开头,天然不会被 `v[0-9]*` pattern 撞上,两条 workflow 的
触发条件互斥,无需额外排除逻辑。

一切版本号从 tag 推导(`${GITHUB_REF_NAME}` 去掉 `v` / `harness-v` 前缀),两个
workflow 与 `android-harness` 的两个 `build.gradle.kts` 均不硬编码具体版本。

## 2. GitHub Pages 启用(一次性手工步骤)

1. 仓库需先有一个 `gh-pages` 分支,分支内 `/maven` 路径下按 Maven 仓布局
   (`com/magpie/uiv/<artifactId>/<version>/...`)存放 harness 制品——本仓 CI 不会自动
   创建这个分支,首次必须手工初始化(见下节)。
2. 仓库 **Settings → Pages**,Source 选择 "Deploy from a branch",Branch 选择
   `gh-pages` / `/ (root)`,保存。
3. 之后消费者按第 5 节的 URL 形态即可访问该静态 Maven 仓,无需任何凭据。

## 3. 首发流程(用锚定字节,不重新构建)

已发布的 `0.1.0-alpha.4` 两枚 AAR 摘要已在
[`docs/RELEASE-0.1.0-digests.md`](RELEASE-0.1.0-digests.md) 中锚定
本机 `~/.m2` 字节。首次上仓**必须使用这批原字节**,不允许用 CI 重新构建同坐标产物
(重建会产生不同字节,污染已公示的信任链)。首发步骤:

1. 在已持有这批锚定字节的机器上跑:
   ```
   ./scripts/stage-harness-maven.sh <输出目录>
   ```
   脚本会逐件比对输出文件与 `docs/RELEASE-0.1.0-digests.md` 登记的 SHA-256,
   任一不符立即失败,不产出可能被污染的目录。
2. 手工创建 `gh-pages` 分支,把脚本输出目录的 `com/magpie/uiv/...` 树放入分支的
   `/maven` 路径下,提交并推送。
3. 完成第 2 节的 Pages 启用步骤。
4. 首发之后的版本一律走第 4 节的 CI 流程,不再手工重复本节步骤。

## 4. 未来版本流程(tag 即发)

`gh-pages` 分支存在之后,后续 harness 版本只需打 `harness-vX.Y.Z` tag 并推送:
`publish-harness.yml` 会用 CI 环境(JDK 21 + Android SDK + Gradle 9.5.1)以该版本号
重新构建两枚 AAR,发布到 build 内 staging 目录,append-only 校验通过后拷入 `gh-pages`
分支的 `/maven` 路径并提交推送。

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
maven { url = uri("https://<user>.github.io/<repo>/maven") }
```

`<user>`/`<repo>` 为占位符,替换为本仓实际的 GitHub 用户名/组织与仓库名——与
[`docs/quickstart-external.md`](quickstart-external.md) 中 `UIV_MAVEN_REPO_URL` 的
占位符口径一致,消费者不需要任何凭据即可拉取。

## 7. 为什么排除 GitHub Packages 与 JitPack

- **GitHub Packages**:即便是公开仓库,拉取 GitHub Packages 的 Maven 制品仍强制要求
  鉴权(PAT),不符合"消费者零凭据"的冻结决策,故排除。
- **JitPack**:JitPack 按 tag/commit 现拉现建,坐标与产出字节由 JitPack 自己的构建
  环境决定,既改变坐标形态又会重建字节,与"首发不重建、用锚定原字节"的冻结决策冲突,
  故排除。

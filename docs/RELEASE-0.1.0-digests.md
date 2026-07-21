# 鹊眼(Magpie Eye)0.1.0 交付摘要清单

> 本文是发布信任链的**摘要清单**,不是安装文档。安装步骤见
> [`docs/quickstart-external.md`](quickstart-external.md);对外发布状态与支持范围见
> [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md)。
>
> 口径依据:`.claude/plans/delivery-readiness/checklist.md` §3.5.2(制品信任链与签名,
> alpha 口径)——alpha 阶段的信任链等价物 = **发布 commit SHA(git 内容寻址)+ 两枚
> harness AAR 的 SHA-256 摘要清单**,经与制品本身不同的信道公示。GA 阶段将改为完整
> 制品签名,不在本文范围内。

## 1. Android harness 制品(两件,经 CI 全自动发布至维护者远程 Maven 仓)

版本坐标:`com.magpie.uiv:view-dump:0.1.0`、`com.magpie.uiv:semantics-dump:0.1.0`。

这两件制品由 [`.github/workflows/publish-harness.yml`](../.github/workflows/publish-harness.yml)
在 CI 环境(JDK 21 + Android SDK + Gradle 9.5.1)以版本号 `0.1.0` 全自动构建并发布,不
经本机 `~/.m2` 中转,也不由维护者手工上传。发布前 CI 会先跑 P0-8 兼容性防线断言(两枚
AAR 的 `.pom`/`.module` 零 `kotlin-stdlib` 传递依赖、Kotlin metadata version 下探到
`2.0.0`),断言不过即 fail 且不上仓。

摘要与产物**同源生成、随发布产物一起公示**,本文件不预先登记具体 SHA-256 值:

- 每件产物旁有 CI 生成的 `.sha256` sidecar(如 `view-dump-0.1.0.aar.sha256`);
- 每个 artifact 的版本目录下有 CI 生成的 `SHA256SUMS` 汇总,可用 `sha256sum -c` 校验;
- 摘要表同时打印进该次发布所在 Actions 运行的 job summary,供带外核对。

第三方核验时,应直接比对从 gh-pages Maven 仓下载到的文件与同目录下的 `.sha256`/
`SHA256SUMS`,而不是依赖本文件登记的静态值——这与 §3(可信信道说明)"摘要应经与制品
分发信道不同的另一信道公示"的口径一致:CI 运行的 job summary 即是该独立信道。

> `0.1.0-alpha.4` 版本(本机构建、非本次交付坐标)的历史摘要见文末附录,供既有 spike
> 复核,不适用于当前 `0.1.0` 坐标。

## 2. CLI 交付根摘要

CLI 的交付形态是 **git 仓库本体**(`git clone` + `scripts/install-uiv.sh`,见
`docs/quickstart-external.md` §2),不是打包 tarball,因此没有单一"安装包文件"可取
摘要。按上述 checklist §3.5.2 口径,CLI 一侧的根摘要 = **发布 commit 的 SHA(git 内容
寻址,覆盖仓库内全部受版本控制文件,包括三个 workspace 包与 `package-lock.json`)**。

```
发布 commit SHA:8f7587028013cfa2322e7f01859c2d5cbee5be3c(tag `v0.1.0` 所指)
```

已于 2026-07-20 打 tag 时回填(回填提交本身在 tag 之后——tag 指向的提交无法自引用其
SHA;带外公示以本文件 main 版本为准)。

第三方 npm 依赖(即 `@modelcontextprotocol/sdk`、`zod`、`looks-same`、`odiff-bin`、
`pngjs` 等)不在本仓 git 树内,其完整性由根 `package-lock.json` 中各依赖条目的
`integrity`(SRI)字段承载——`npm install` 时 npm 自身会校验,本清单不重复列出。

## 3. 可信信道说明(alpha 口径,§3.5.2)

alpha 阶段不提供制品签名(签名是 GA 阶段的 Done when)。为防止"同一个被攻陷的信道
既分发制品又分发摘要"导致摘要形同虚设,**本摘要文件应经与制品分发信道不同的另一条
信道公示**——例如:制品经 git clone / 远程 Maven 仓分发,则本文件(或其中的 commit
SHA 与两 AAR SHA-256 值)应额外通过维护者的另一渠道(如独立公告、邮件、非仓库托管的
静态页)发布,供第三方交叉核对,而不是仅依赖同一次 `git clone` 或同一个 Maven 仓返回
的内容自证。第三方在核验完整性前,不应仅信任单一信道下载到的文件与其自带的摘要
互相吻合。

## 附录:0.1.0-alpha.4 历史摘要(本机构建的历史版本,供既有 spike 复核,非本次交付坐标)

以下摘要取自 `0.1.0-alpha.4` 在本机 `publishToMavenLocal` 产生的字节,是发布 `0.1.0`
之前的历史版本——**不是本次交付坐标**,仅为已引用该坐标的既有 spike 提供历史复核依据,
原样保留、不做变动。

版本坐标:`com.magpie.uiv:view-dump:0.1.0-alpha.4`、
`com.magpie.uiv:semantics-dump:0.1.0-alpha.4`。

这两件制品当前存在于本机 `~/.m2/repository/com/magpie/uiv/{view-dump,semantics-dump}/0.1.0-alpha.4/`
(本地 `publishToMavenLocal` 产物)。

### A.1 view-dump:0.1.0-alpha.4

| 文件 | 大小(bytes) | SHA-256 |
|---|---:|---|
| `view-dump-0.1.0-alpha.4.aar` | 5998 | `02c6f8ea0ef1d98694ba4fb2ed329248e60c556d0fd66698216d89d579ce2f21` |
| `view-dump-0.1.0-alpha.4.pom` | 791 | `0451346e7be5f0e9943846e6257d8503d9352381a1f25be7e1e4af037e6dc9c6` |
| `view-dump-0.1.0-alpha.4.module` | 1895 | `36427c09e7134b86fdb31933d36705a08469fb59b643e5d88c0a5ce49b6f88ff` |

### A.2 semantics-dump:0.1.0-alpha.4

| 文件 | 大小(bytes) | SHA-256 |
|---|---:|---|
| `semantics-dump-0.1.0-alpha.4.aar` | 6694 | `ef751407fe10b4b1248753b13741b2aa2d99c58141b426982288321918eb2887` |
| `semantics-dump-0.1.0-alpha.4.pom` | 796 | `24541201c27adfb3f2a69b8cd9f554a31481dfa2c0c5b5dc0894f02085c710b0` |
| `semantics-dump-0.1.0-alpha.4.module` | 1920 | `2d0cc1110a28a984b771e269bbe4f392c8278734a1e6966c71d54beac751ccca` |

摘要生成方式:`shasum -a 256 <file>`。

> 说明:历史坐标 `com.magpie.uiv:uiv-gradle-plugin` 已随批次⑤(init-script 转发方案)
> 退场,不再随本次交付演进,标记 deprecated,不在本摘要清单内。

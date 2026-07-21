# 鹊眼(Magpie Eye)0.1.0 交付摘要清单

> 本文是发布信任链的**摘要清单**,不是安装文档。安装步骤见
> [`docs/quickstart-external.md`](quickstart-external.md);对外发布状态与支持范围见
> [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md)。
>
> 口径依据:`.claude/plans/delivery-readiness/checklist.md` §3.5.2(制品信任链与签名,
> alpha 口径)——alpha 阶段的信任链等价物 = **发布 commit SHA(git 内容寻址)+ 两枚
> harness AAR 的 SHA-256 摘要清单**,经与制品本身不同的信道公示。GA 阶段将改为完整
> 制品签名,不在本文范围内。

## 1. Android harness 制品(两件,预发布至维护者远程 Maven 仓)

版本坐标:`com.magpie.uiv:view-dump:0.1.0-alpha.4`、
`com.magpie.uiv:semantics-dump:0.1.0-alpha.4`。

这两件制品当前存在于本机 `~/.m2/repository/com/magpie/uiv/{view-dump,semantics-dump}/0.1.0-alpha.4/`
(本地 `publishToMavenLocal` 产物)。下表摘要取自**这批同字节文件**——维护者随后会把
**完全相同字节**的 `.aar`/`.pom`/`.module` 三件套预发布到远程 Maven 仓(见
`docs/quickstart-external.md` §3.1 的 `UIV_MAVEN_REPO_URL`);第三方接入后应能用下表
摘要逐字节核验其从远程仓下载到的文件与本清单一致。

### 1.1 view-dump:0.1.0-alpha.4

| 文件 | 大小(bytes) | SHA-256 |
|---|---:|---|
| `view-dump-0.1.0-alpha.4.aar` | 5998 | `02c6f8ea0ef1d98694ba4fb2ed329248e60c556d0fd66698216d89d579ce2f21` |
| `view-dump-0.1.0-alpha.4.pom` | 791 | `0451346e7be5f0e9943846e6257d8503d9352381a1f25be7e1e4af037e6dc9c6` |
| `view-dump-0.1.0-alpha.4.module` | 1895 | `36427c09e7134b86fdb31933d36705a08469fb59b643e5d88c0a5ce49b6f88ff` |

### 1.2 semantics-dump:0.1.0-alpha.4

| 文件 | 大小(bytes) | SHA-256 |
|---|---:|---|
| `semantics-dump-0.1.0-alpha.4.aar` | 6694 | `ef751407fe10b4b1248753b13741b2aa2d99c58141b426982288321918eb2887` |
| `semantics-dump-0.1.0-alpha.4.pom` | 796 | `24541201c27adfb3f2a69b8cd9f554a31481dfa2c0c5b5dc0894f02085c710b0` |
| `semantics-dump-0.1.0-alpha.4.module` | 1920 | `2d0cc1110a28a984b771e269bbe4f392c8278734a1e6966c71d54beac751ccca` |

摘要生成方式:`shasum -a 256 <file>`。

> 说明:历史坐标 `com.magpie.uiv:uiv-gradle-plugin` 已随批次⑤(init-script 转发方案)
> 退场,不再随本次交付演进,标记 deprecated,不在本摘要清单内。

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

# 第三方依赖披露(THIRD_PARTY_NOTICES)

> 生成日期:2026-07-20 · 依据仓库当前 HEAD(`npm ls --omit=dev --all --json` 实测 +
> `node_modules/*/package.json` 逐包核实)。

## 分发模型说明

鹊眼(Magpie Eye)本身**不再分发任何第三方制品**。alpha 技术预览的交付通道是:

1. **CLI 通道**:第三方使用者 `git clone` 本仓,运行 `scripts/install-uiv.sh`,由 `npm install`
   在使用者本机从 npm registry 自行拉取本清单所列依赖并本地 `npm run build`。本仓不打包、
   不随附、不二次分发这些依赖的源码或构建产物。
2. **harness 通道**:`com.magpie.uiv:view-dump` 与 `com.magpie.uiv:semantics-dump` 两个
   Android AAR 由维护者预发布到远程 Maven 仓(坐标见下文"harness 依赖面"一节),消费方从该
   远程仓拉取,同样不经本仓分发。

本清单的性质是**"使用到的第三方依赖"归属披露**,而非"随本仓分发的制品清单"——目的是让
使用者(以及使用者所在组织的合规/法务审查)在其本机 `node_modules`/Gradle 缓存中落地这些
依赖之前,能预先了解其许可证与来源。清单覆盖 `packages/uiv-core`、`packages/uiv-cli`、
`packages/ui-verify-mcp` 三个 npm 包的**全部生产依赖(直接 + 传递)**,共 101 个不同名称/
版本组合的第三方包;开发/测试期依赖(`typescript`、`vitest`、`@types/node`、`@types/pngjs`
等,声明于仓根 `package.json` 的 `devDependencies`)不随任何交付物分发,不计入本清单。

## 许可证分布(101 个生产依赖包)

| 许可证 | 数量 |
|---|---|
| MIT | 88 |
| ISC | 7 |
| BSD-3-Clause | 3 |
| Apache-2.0 | 1 |
| BSD-2-Clause | 1 |
| MIT(推定,见下文说明) | 1 |

**结论:全部 101 个生产依赖均为宽松式(permissive)开源许可证,未发现 copyleft 许可证
(GPL/LGPL/AGPL/MPL 等均为零)。**

## 三包生产依赖树(直接 + 传递,共 101 项)

`packages/uiv-core` 直接依赖 `looks-same`、`odiff-bin`、`pngjs`;`packages/uiv-cli` 仅直接
依赖工作区内部包 `@magpie-eye/uiv-core`(非第三方,不计入本清单);`packages/ui-verify-mcp`
直接依赖工作区内部包 `@magpie-eye/uiv-cli`/`@magpie-eye/uiv-core`,以及第三方包
`@modelcontextprotocol/sdk`、`zod`——`@modelcontextprotocol/sdk` 又传递引入了 Express/Hono
等 HTTP 服务端框架整条依赖链。以下为三包生产依赖树的**并集**(按包名字母序):

<!-- DEP_TABLE_START -->
| 包名 | 版本 | 许可证 | 仓库 |
|---|---|---|---|
| @hono/node-server | 1.19.14 | MIT | https://github.com/honojs/node-server |
| @jsquash/png | 3.1.1 | Apache-2.0 | https://github.com/jamsinclair/jSquash |
| @modelcontextprotocol/sdk | 1.29.0 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| accepts | 2.0.0 | MIT | https://github.com/jshttp/accepts |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats |
| ajv | 8.20.0 | MIT | https://github.com/ajv-validator/ajv |
| body-parser | 2.3.0 | MIT | https://github.com/expressjs/body-parser |
| buffer-crc32 | 1.0.0 | MIT | https://github.com/brianloveswords/buffer-crc32 |
| bytes | 3.1.2 | MIT | https://github.com/visionmedia/bytes.js |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound |
| color-convert | 0.5.3 | MIT（推定，见下文说明） | http://github.com/harthur/color-convert |
| color-diff | 1.4.0 | BSD-3-Clause | https://github.com/markusn/color-diff |
| content-disposition | 1.1.0 | MIT | https://github.com/jshttp/content-disposition |
| content-type | 1.0.5 | MIT | https://github.com/jshttp/content-type |
| content-type | 2.0.0 | MIT | https://github.com/jshttp/content-type |
| cookie-signature | 1.2.2 | MIT | https://github.com/visionmedia/node-cookie-signature |
| cookie | 0.7.2 | MIT | https://github.com/jshttp/cookie |
| cors | 2.8.6 | MIT | https://github.com/expressjs/cors |
| cross-spawn | 7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn |
| debug | 4.4.3 | MIT | https://github.com/debug-js/debug |
| depd | 2.0.0 | MIT | https://github.com/dougwilson/nodejs-depd |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto |
| ee-first | 1.1.1 | MIT | https://github.com/jonathanong/ee-first |
| encodeurl | 2.0.0 | MIT | https://github.com/pillarjs/encodeurl |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms |
| escape-html | 1.0.3 | MIT | https://github.com/component/escape-html |
| etag | 1.8.1 | MIT | https://github.com/jshttp/etag |
| eventsource-parser | 3.1.0 | MIT | https://github.com/rexxars/eventsource-parser |
| eventsource | 3.0.7 | MIT | https://github.com/EventSource/eventsource |
| express-rate-limit | 8.5.2 | MIT | https://github.com/express-rate-limit/express-rate-limit |
| express | 5.2.1 | MIT | https://github.com/expressjs/express |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal |
| fast-uri | 3.1.3 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| finalhandler | 2.1.1 | MIT | https://github.com/pillarjs/finalhandler |
| forwarded | 0.2.0 | MIT | https://github.com/jshttp/forwarded |
| fresh | 2.0.0 | MIT | https://github.com/jshttp/fresh |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd |
| has-symbols | 1.1.0 | MIT | https://github.com/inspect-js/has-symbols |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn |
| hono | 4.12.28 | MIT | https://github.com/honojs/hono |
| http-errors | 2.0.1 | MIT | https://github.com/jshttp/http-errors |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite |
| inherits | 2.0.4 | ISC | https://github.com/isaacs/inherits |
| ip-address | 10.2.0 | MIT | https://github.com/beaugunderson/ip-address |
| ipaddr.js | 1.9.1 | MIT | https://github.com/whitequark/ipaddr.js |
| is-promise | 4.0.0 | MIT | https://github.com/then/is-promise |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe |
| jose | 6.2.3 | MIT | https://github.com/panva/jose |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse |
| json-schema-typed | 8.0.2 | BSD-2-Clause | https://github.com/RemyRylan/json-schema-typed |
| looks-same | 10.0.1 | MIT | https://github.com/gemini-testing/looks-same |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics |
| media-typer | 1.1.0 | MIT | https://github.com/jshttp/media-typer |
| merge-descriptors | 2.0.0 | MIT | https://github.com/sindresorhus/merge-descriptors |
| mime-db | 1.54.0 | MIT | https://github.com/jshttp/mime-db |
| mime-types | 3.0.2 | MIT | https://github.com/jshttp/mime-types |
| ms | 2.1.3 | MIT | https://github.com/vercel/ms |
| negotiator | 1.0.0 | MIT | https://github.com/jshttp/negotiator |
| nested-error-stacks | 2.1.1 | MIT | https://github.com/mdlavin/nested-error-stacks |
| object-assign | 4.1.1 | MIT | https://github.com/sindresorhus/object-assign |
| object-inspect | 1.13.4 | MIT | https://github.com/inspect-js/object-inspect |
| odiff-bin | 4.3.8 | MIT | https://github.com/dmtrKovalenko/odiff |
| on-finished | 2.4.1 | MIT | https://github.com/jshttp/on-finished |
| once | 1.4.0 | ISC | https://github.com/isaacs/once |
| parse-color | 1.0.0 | MIT | https://github.com/substack/parse-color |
| parseurl | 1.3.3 | MIT | https://github.com/pillarjs/parseurl |
| path-key | 3.1.1 | MIT | https://github.com/sindresorhus/path-key |
| path-to-regexp | 8.4.2 | MIT | https://github.com/pillarjs/path-to-regexp |
| pkce-challenge | 5.0.1 | MIT | https://github.com/crouchcd/pkce-challenge |
| pngjs | 7.0.0 | MIT | https://github.com/pngjs/pngjs |
| proxy-addr | 2.0.7 | MIT | https://github.com/jshttp/proxy-addr |
| qs | 6.15.3 | BSD-3-Clause | https://github.com/ljharb/qs |
| range-parser | 1.3.0 | MIT | https://github.com/jshttp/range-parser |
| raw-body | 3.0.2 | MIT | https://github.com/stream-utils/raw-body |
| require-from-string | 2.0.2 | MIT | https://github.com/floatdrop/require-from-string |
| router | 2.2.0 | MIT | https://github.com/pillarjs/router |
| safer-buffer | 2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer |
| send | 1.2.1 | MIT | https://github.com/pillarjs/send |
| serve-static | 2.2.1 | MIT | https://github.com/expressjs/serve-static |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof |
| shebang-command | 2.0.0 | MIT | https://github.com/kevva/shebang-command |
| shebang-regex | 3.0.0 | MIT | https://github.com/sindresorhus/shebang-regex |
| side-channel-list | 1.0.1 | MIT | https://github.com/ljharb/side-channel-list |
| side-channel-map | 1.0.1 | MIT | https://github.com/ljharb/side-channel-map |
| side-channel-weakmap | 1.0.2 | MIT | https://github.com/ljharb/side-channel-weakmap |
| side-channel | 1.1.1 | MIT | https://github.com/ljharb/side-channel |
| statuses | 2.0.2 | MIT | https://github.com/jshttp/statuses |
| toidentifier | 1.0.1 | MIT | https://github.com/component/toidentifier |
| type-is | 2.1.0 | MIT | https://github.com/jshttp/type-is |
| unpipe | 1.0.0 | MIT | https://github.com/stream-utils/unpipe |
| vary | 1.1.2 | MIT | https://github.com/jshttp/vary |
| which | 2.0.2 | ISC | https://github.com/isaacs/node-which |
| wrappy | 1.0.2 | ISC | https://github.com/npm/wrappy |
| zod-to-json-schema | 3.25.2 | ISC | https://github.com/StefanTerdell/zod-to-json-schema |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
<!-- DEP_TABLE_END -->

### 特别说明

- **`color-convert@0.5.3`**:`package.json` 缺 `license` 字段(SPDX 标识缺失,常见于较早期
  npm 包)。已核实其随包 `LICENSE` 文件(`node_modules/color-convert/LICENSE`)文本为标准
  MIT 许可证正文,故在此推定为 MIT;它是 `color-diff`(经 `looks-same` 传递引入)的依赖。
- **`odiff-bin@4.3.8`**(MIT):是 L1 像素 diff 引擎使用的原生二进制外壳包。它以 npm 包形式
  随附 macOS/Linux/Windows 多平台预编译原生二进制(`raw_binaries/` 目录),`postinstall` 脚本
  在安装时选取匹配当前平台的二进制并链接为可执行文件——该二进制由使用者的 `npm install`
  在其本机自行拉取,不经本仓二次分发。**更正**:交付任务原始描述称其为"Rust 原生二进制",
  经核实其上游 `package.json` 自述为"Zig port of odiff"(Zig 重写版),本清单以包自身元数据
  为准,未采信"Rust"一说,详见交付报告的"需用户确认事项"。
- **`@modelcontextprotocol/sdk@1.29.0`** 声明了对等依赖(peerDependency)`@cfworker/json-schema`
  (`^4.1.1`),但该包在本仓 `node_modules` 中**未实际安装**(`npm ls` 确认其解析为空),不构成
  实际依赖面,故不计入上表。
- 两个 Android harness AAR(`view-dump`/`semantics-dump`,详见下节)与本节的 npm 依赖树相互
  独立,不共享依赖图。

## harness 依赖面(Android AAR,`com.magpie.uiv:*:0.1.0-alpha.4`)

`view-dump` 与 `semantics-dump` 两个 AAR 经远程 Maven 仓分发(坐标占位符
`<UIV_MAVEN_REPO_URL>`,待维护者以实际仓库地址替换)。二者发布制品的 **POM/`.module` 均为
零传递依赖**——即消费方 `testImplementation` 这两个坐标后,不会被动引入任何额外的第三方
库(已于 0.1.0-alpha.4 由仓内 P0-8 批次逐项验证:两 AAR 的 POM 均无任何 `<dependency>`
节点,`.module` 的 `releaseApi`/`releaseRuntime` 两个 variant 依赖列表均为空)。

编译期使用、但按 `compileOnly` 声明**不进入 POM/`.module`、不构成分发内容**的依赖(消费方
需自行在其工程提供对应运行时):

| 包(compileOnly) | 用于 | 许可证(据发行方公开声明,信息性列示,非本仓审计范围) |
|---|---|---|
| Kotlin stdlib 2.0.21 | 两 AAR 均需 | Apache License 2.0(JetBrains) |
| AndroidX Compose BOM / `ui` / `ui-graphics` / `ui-text` / `ui-unit` / `ui-test-junit4` | 仅 `semantics-dump` | Apache License 2.0(Google AndroidX) |
| Android SDK(`android.*`,来自 `compileSdk` bootclasspath) | 两 AAR 均需 | Apache License 2.0(AOSP) |

## 已知空白 / 需用户确认

- 两 AAR 当前经维护者手工 `publishToMavenLocal`/预发布验证零传递依赖,尚未完成"CI 环境下
  在线首装(online-bootstrap)"这一独立证据链(见 `docs/PROJECT_STATUS.md` 的
  `ready_for_clean_CI_gate` 状态)——不影响本清单的许可证披露结论,但清单所述"零传递依赖"
  结论目前建立在本机验证证据上。

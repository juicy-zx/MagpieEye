# 安全政策(Security Policy)

> 本文档适用于鹊眼(Magpie Eye)当前的技术预览(alpha)阶段。技术预览**不提供任何安全
> SLA 承诺**;以下响应时限为尽力而为(best-effort)目标,非合同义务。

## 支持版本范围

安全报告仅受理以下版本范围内的问题:

| 组件 | 版本 | 说明 |
|---|---|---|
| `uiv` CLI(`uiv-core`/`uiv-cli`/`ui-verify-mcp`) | `0.1.0-alpha.x` | 技术预览,经 `scripts/install-uiv.sh` 从源码构建 |
| Android harness AAR(`com.magpie.uiv:view-dump`、`com.magpie.uiv:semantics-dump`) | `0.1.0-alpha.4` | 经远程 Maven 仓分发 |

早于上表的历史版本、已废弃坐标(如 `uiv-gradle-plugin`)、以及仓库内非交付内容(实验性
代码、内部计划文档)不在受理范围内。

## 如何报告安全问题

请**不要**通过公开 GitHub Issue 报告安全漏洞。改为发送邮件至:

**zhuxi8518@gmail.com**

请在邮件中尽量包含:问题描述、复现步骤、受影响版本/组件、潜在影响范围。我们会尽力在
**7 个工作日内**确认收到并给出初步响应;alpha 阶段无法承诺具体修复时限,严重问题会优先
处理。

## 执行模型与威胁面(请报告前先读)

`uiv check` / `uiv verify-page` 会**执行目标 Android 工程的 Gradle 测试代码**。这是本工具
最主要的安全边界,请据此评估你的使用场景:

- **默认 direct lane**:以当前用户权限直接运行目标工程的 `./gradlew`,复用宿主
  `~/.gradle` 缓存、正常联网、继承宿主环境——**不提供隔离**。目标工程的测试/插件/构建
  脚本将以你的操作系统用户权限执行,可读写你本机可访问的内容并联网。**请勿**对来源不可信、
  AI 生成、未经审查的第三方工程使用默认 direct lane。
- **`--sandbox`(显式 opt-in)**:经 macOS Seatbelt 提供冷路径隔离(禁出站网络仅留
  loopback、`$HOME` 读闸、项目本地 `GRADLE_USER_HOME`、`--offline`)。**消费不可信工程时
  应使用 `--sandbox`。** 已知限制:`--sandbox` 将 `~/.m2`(mavenLocal)作为已发布制品的
  bootstrap 输入整体放行,尚不提供针对该目录内容的细粒度保密隔离——这是一项已登记的安全
  债,在收紧为专用受控仓之前,不应依赖 `--sandbox` 对任意用户 `~/.m2` 中的私有制品提供
  完整保密性。

更完整的执行模型与信任边界说明见 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)的
"执行模型与信任边界"一节。

## 支持渠道之外

一般使用问题、功能请求、非安全类 bug,请使用仓库常规渠道(Issue/PR),不要发送到上述
安全邮箱。

# render-daemon 启动与沙箱配置(T2.1 慢车道热路径)

`uiv-render-daemon` 是常驻 Kotlin/JVM 进程,内部经 Gradle Tooling API 复用
`ProjectConnection`、保暖 Gradle daemon,通过 UDS(`<WS>/.ui-verify/daemon.sock`,
0600)对 uiv 提供 `gradle.run`。uiv 热路径仅为薄 UDS 客户端。以下 `<WS>` = 工程根
`/Users/zhuxi/AI/magpie_eye`。

## 1. 手动启动 / 停止

```bash
# 构建发行版(首次或改动 daemon 源码后)
export GRADLE_USER_HOME=$PWD/demo-android/.gradle-home
demo-android/gradlew -p daemon installDist

# 启动(前台会阻塞;后台加 nohup ... & 或用 launchd,见 §2)
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
daemon/build/install/uiv-render-daemon/bin/uiv-render-daemon --workspace "$PWD" >>.ui-verify/daemon.log 2>&1 &

# 冒烟(期望含 "ok":true)
printf '{"id":"s","cmd":"ping","args":{}}\n' | nc -U -w 3 .ui-verify/daemon.sock

# 停止
pkill -f uiv-render-daemon
```

- 重复启动:若 sock 已存在且能连通,第二个实例打印 `daemon already running` 并 `exit 11`;
  若 sock 是残留死档(连不通),自动删除后正常接管。
- 停止时 shutdown hook 关闭 UDS 并删除 sock 文件,不留残档。

## 2. launchd 常驻(开机自启 + 崩溃自拉起)

样例 plist:`docs/launchd/com.magpie.uiv-render-daemon.plist`(`JAVA_HOME` 已写死
`/usr/libexec/java_home -v 21` 实值;`RunAtLoad=true`、`KeepAlive={SuccessfulExit:false}`;
stdout/stderr 汇入 `<WS>/.ui-verify/daemon.log`)。

```bash
cp docs/launchd/com.magpie.uiv-render-daemon.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.magpie.uiv-render-daemon.plist

# 卸载
launchctl bootout gui/$(id -u)/com.magpie.uiv-render-daemon
```

## 3. 沙箱网络配置

沙箱默认封堵 loopback,故触发通道用 UDS(设计文档 5.2 默认方案)。在 sandbox 的
`settings.json` 放通 UDS 白名单与首次构建所需域名:

```json
{
  "sandbox": {
    "network": {
      "allowUnixSockets": ["<WS>/.ui-verify/daemon.sock"],
      "allowedDomains": ["repo.gradle.org", "…既有域名(services.gradle.org 等)"]
    }
  }
}
```

- `allowUnixSockets`:放通 daemon 的 UDS,uiv 热路径经此触发 `gradle.run`。
- `repo.gradle.org`:仅 daemon **首次构建**需要(`gradle-tooling-api:9.5.1` 仅此仓库有);
  内循环预热后零外网。
- 备选 `allowLocalBinding=true`(macOS-only)可放通本机绑定,但粒度粗,不如 UDS 白名单精确。

## 4. 降级语义(自动,无需干预)

`selectGradleRunner` 仅在**选路时刻**降级:

- sock 缺失,或 500ms 内 ping 失败 → 自动回落冷路径 `spawn ./gradlew --no-daemon`
  (慢但自给自足,无需 daemon)。
- ping 通 → 热路径 UDS 客户端。
- 选定车道后若发生故障,如实上抛(不静默再降级)。
- 车道决策打印于 **stderr**(`uiv: gradle lane=<hot|cold> (<reason>)`);stdout 末行仍为
  report.json 路径。**报告内容与车道无关**(两路径 report 逐字段等价)。

## 5. 安全边界

- UDS sock **0600**,仅属主可连;不监听任何 TCP 端口(含 localhost)。
- daemon 拒绝 workspace 外的 cwd(`cwd_outside_workspace`),`gradle.run` 只能在
  `<WS>` 子树内执行;`renderPreview` 的 outPng/outSemantics 同样拒绝 workspace 外路径。
- 未知命令 → `unknown_cmd`;非法 JSON → `bad_request`。

## 6. 快车道 worker(T2.8,fast lane)

daemon 除慢车道 `gradle.run` 外,还托管 **Paparazzi 快车道 worker**(`renderPreview` cmd)。
worker = `fastlane-worker/` 模块编译出的 JUnit-free 常驻 JVM 子进程,**纯 stdin/stdout,零监听面**
(Codex D-05 硬约束);由 daemon 懒拉起、复用、随 daemon 退出清理(无孤儿)。

### 6.1 构建 worker(首次,或改动 fastlane-worker / demo-android 组件源后)

```bash
export GRADLE_USER_HOME=$PWD/demo-android/.gradle-home
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
# 编译 worker(含构建期 Sync demo-android 的 CalibCard 组件源)并落 worker-env(classpath/jvm-args 地面真值)
demo-android/gradlew -p fastlane-worker testDebugUnitTest --tests "com.magpie.uiv.fastlane.DumpEnvTest" --offline --rerun-tasks
```

产物落 `fastlane-worker/build/worker-env/`(daemon 据此直启 `java` worker 子进程)。
**未构建即触发 fast lane** → daemon 回 `worker_env_missing` → CLI 自动回落慢车道。

### 6.2 新鲜度门(绝不供陈旧渲染,配置漂移即回落)

- **门1(构建新鲜度)**:慢车道组件源 `demo-android/.../CalibCard.kt` 比 worker-env 新
  ⇒ 未重建 ⇒ 回 `worker_stale`,CLI 回落慢车道。改了组件源必须重跑 §6.1。
- **门2(运行新鲜度)**:worker-env 比运行中的 worker 启动时刻新 ⇒ 重建过 ⇒ daemon 杀旧进程重启,
  自动拾取新类。无需手动重启 daemon。

### 6.3 降级语义(自动)

CLI 侧对**静态 @Preview 白名单**(当前钉 `CalibCardPreview`)先试 fast:daemon 可达且 worker 就绪
→ `report.lane=fast`;daemon 不可达 / worker stale / 崩溃 / 渲染错 → 自动回落慢车道,
`report.lane=fast-fallback-slow`;白名单外 preview 恒走慢车道 `report.lane=slow`。
**报告内容与车道正交**:同一卡片 fast/slow 两道 L2 violations 集合逐字段一致(T2.8 实测)。

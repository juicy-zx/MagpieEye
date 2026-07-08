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
  `<WS>` 子树内执行。
- 未知命令 → `unknown_cmd`;非法 JSON → `bad_request`。

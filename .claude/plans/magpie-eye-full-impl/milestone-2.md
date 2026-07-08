# M2(Phase 1)代码级子计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。逐任务执行,每步验收通过才前进;口径疑点回 Codex。
> 上游:orchestration.md M2 表(验收口径以编排计划为准);M1 已交付现状为既定事实(158 单测/demo 8 测试/phase0 harness)。
> 方向锚定:本里程碑北极星 = 慢车道 P50 ≤ Phase 0 实测值 60%(≤3.1s)+ 断网(预热后)内循环零 Figma 调用可跑 + T2.7 落地后 D3 回归 CalibSwatch 检出 4/4。

## 执行波次与冲突协调(编排者裁定)

- **Wave 1(并行,路径互斥)**:T2.1(daemon/,opus)、T2.2+T2.6(uiv-core l1 + check/run.ts + cli,sonnet)、T2.3(experiments/,fable 研究型)、T2.4(uiv-core figma/,opus)。各 agent 只 add 自己路径;latency-m2.json 按键分治(t2_1_hot / t2_2_odiff)。
- **Wave 2(严格串行,均动 l2/ 与 report)**:T2.5(opus)→ T2.7(opus)。**diagnostics 字段结构由 T2.5 首先定义,T2.7 开工前必须读 T2.5 落地后的现状适配**(两章草稿独立起草,以先执行者的落地为准)。Wave 2 与 Wave 1 可同时启动(l2/ 与 Wave1 路径互斥;T2.5 的 check/runL2.ts 与 T2.6 的 check/run.ts 是不同文件)。
- 沙箱/网络前置(编排者一次性处理):域名白名单补 repo.gradle.org(T2.1 gradle-tooling-api 仅此仓库有 9.5.1)。
- 三章字符数超软限(T2.1/T2.4/T2.5),内容完整性优先,已豁免。

---

### Task T2.1 — render-daemon 慢车道(热:UDS+Tooling API 常驻;冷:spawn --no-daemon 降级)

**上游**:orchestration M2/T2.1;设计文档 2.2、5.2。**前置**:M1 全过,`npm run build` 产 dist。**口径**:热路径 P50 ≤ M1 暖实测 5.1s×60%=**3.1s**。**证伪处理**:机判非 0 且非环境原因→停,携输出回 Codex,禁自行放宽。
**编写约定**:机械内容以**精确枚举**写死断言/字面量/exit code(照条成码,非占位符);核心新工件给完整代码。

#### 事实源(全章写死;2026-07-09 实测核验)

| 项 | 值 |
|---|---|
| WS | `/Users/zhuxi/AI/magpie_eye`(命令 cwd 恒 WS);`GW=demo-android/gradlew`;`export GRADLE_USER_HOME=$PWD/demo-android/.gradle-home` |
| UDS/协议 | `<workspace>/.ui-verify/daemon.sock`,0600(本机 46B<AF_UNIX 104B);JSON-line 一行一 JSON:请求 `{id,cmd,args}`/响应 `{id,ok,payload\|error}`;`ping {}`→`{pong,pid,workspace}`;`gradle.run {cwd,args[]}`→`{exitCode,stderr(截尾200KB)}`;错误 `bad_request`/`cwd_outside_workspace`/`unknown_cmd` |
| daemon 模块 | `WS/daemon/` 独立 Gradle 工程,Kotlin/JVM,包 `com.magpie.uiv.daemon`;复用 demo wrapper,跑测=`$GW -p daemon test` |
| tooling-api | `org.gradle:gradle-tooling-api:9.5.1`(=wrapper Gradle 版)。**Central 仅有 7.3 陈旧快照(实测),必须加仓 `https://repo.gradle.org/gradle/libs-releases`(实存 9.5.1)** |
| 其余依赖 | Kotlin JVM/serialization 插件 **2.3.21**(Gradle 9 兼容,实存已核验);`kotlinx-serialization-json:1.11.0`;`slf4j-simple:2.0.17`(=TAPI POM 的 slf4j-api 版) |
| CHECK | `node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android` |
| report/CARD | `.ui-verify/reports/1-100@T1_0A_V1/report.json`(v1 **无时间戳字段**→排除表空);CARD=`demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt` |

**契约**:热路径 uiv 仅为 UDS 薄客户端(不碰 Gradle);daemon 内 TAPI `ProjectConnection` 按 projectDir 缓存复用,Gradle daemon 常驻保暖。冷路径=既有 SpawnGradleRunner 原样迁移+前插 `--no-daemon`(5.2 沙箱铁律)。降级只在选路时刻(sock 缺失/500ms ping 失败→cold)。`run.ts/runL2.ts` 零改动→报告与车道正交;stdout 末行=report 路径不变(lane 走 stderr)。
**沙箱前置(编排者一次性配)**:`allowedDomains`+`repo.gradle.org`(仅首次构建);`allowUnixSockets`+`WS/.ui-verify/daemon.sock`。【外】=沙箱外用户会话/编排者执行。

#### Step 1:daemon 模块+协议+UDS 服务器(commit `[T2.1] daemon: protocol + UDS server (0600)`)

建目录 `mkdir -p daemon/src/{main,test}/kotlin/com/magpie/uiv/daemon`;.gitignore 追加 `.ui-verify/daemon.sock` 与 `.ui-verify/daemon.log` 两行;`git check-ignore daemon/build` 应 exit 0(通配已覆盖)。
`daemon/settings.gradle.kts` 一行:`rootProject.name = "uiv-render-daemon"`。`daemon/build.gradle.kts` 照条成码:plugins=`kotlin("jvm")`+`kotlin("plugin.serialization")`(均 `version "2.3.21"`)+`application`;repositories=`mavenCentral()`+`maven("https://repo.gradle.org/gradle/libs-releases")`;dependencies=implementation(tooling-api 与 serialization-json,坐标见事实源)+runtimeOnly(slf4j-simple)+testImplementation(`kotlin("test")`);`kotlin { jvmToolchain(21) }`;`application { mainClass = "com.magpie.uiv.daemon.MainKt"; applicationName = "uiv-render-daemon" }`;`tasks.test { useJUnitPlatform() }`。

**先写失败测试** `daemon/src/test/kotlin/com/magpie/uiv/daemon/DaemonTest.kt`。前置:`ws=Files.createTempDirectory("uivd")`;`sock=ws.resolve("daemon.sock")`;`FakeExec: GradleExecutor`(记录 `calls`,恒回 `RunPayload(0,"fake-stderr")`);起 `DaemonServer(sock, fake, ws)`;客户端 `SocketChannel.open(StandardProtocolFamily.UNIX)` 连 sock,逐行"写→flush→readLine";finally `server.stop()`。单 @Test 五断言:
1. `PosixFilePermissions.toString(Files.getPosixFilePermissions(sock)) == "rw-------"`;
2. 发 `{"id":"1","cmd":"ping","extra":1}` → 响应含 `"pong":true`;
3. 发 `{"id":"2","cmd":"gradle.run","args":{"cwd":"$ws","args":["t","--tests","X"]}}` → 响应含 `"exitCode":0` 与 `fake-stderr`,且 `fake.calls.single().second == listOf("t","--tests","X")`;
4. 发 id=3、cwd=`/private/tmp` → 含 `cwd_outside_workspace`;
5. 发 `{"id":"4","cmd":"nope"}` → 含 `unknown_cmd`。

跑红:unresolved `GradleExecutor`。**最小实现** `daemon/src/main/kotlin/com/magpie/uiv/daemon/Daemon.kt`(单线程顺序服务;一连接多行,EOF 收尾)。imports:`java.io.File`/`java.net.*`/`java.nio.channels.*`/`java.nio.file.*`/`java.nio.file.attribute.PosixFilePermissions`/`kotlinx.serialization.Serializable`/`kotlinx.serialization.json.*`。顶层声明:@Serializable data class `RunArgs(val cwd: String? = null, val args: List<String> = emptyList())` 与 `Request(val id: String, val cmd: String, val args: RunArgs? = null)`;`data class RunPayload(val exitCode: Int, val stderr: String)`;`interface GradleExecutor { fun run(cwd: File, args: List<String>): RunPayload }`;`private val json = Json { ignoreUnknownKeys = true }`;`private fun ok(id, p: JsonObject)`/`err(id, m)`=buildJsonObject 单行序列化(键序 id,ok,payload|error)。`class DaemonServer(private val sock: Path, private val exec: GradleExecutor, private val ws: Path)` 骨架照条:字段 `ch` = `ServerSocketChannel.open(StandardProtocolFamily.UNIX).bind(UnixDomainSocketAddress.of(sock))` 并立即 `.also { Files.setPosixFilePermissions(sock, PosixFilePermissions.fromString("rw-------")) }`;`fun start(): Thread`=自启动循环线程(`while (ch.isOpen)`:`runCatching { ch.accept() }.getOrNull() ?: break`,每连接 `use{}` 内 `w=Channels.newOutputStream(it).bufferedWriter()`,`Channels.newInputStream(it).bufferedReader().forEachLine { l -> w.write(handle(l)); w.write("\n"); w.flush() }`);`fun stop()`=`runCatching { ch.close() }; Files.deleteIfExists(sock)`。`handle()`(完整):

```kotlin
  private fun handle(line: String): String {
    val q = runCatching { json.decodeFromString<Request>(line) }.getOrElse { return err("?", "bad_request: ${it.message}") }
    return when (q.cmd) {
      "ping" -> ok(q.id, buildJsonObject { put("pong", true); put("pid", ProcessHandle.current().pid()); put("workspace", "$ws") })
      "gradle.run" -> {
        val cwd = q.args?.cwd?.let { File(it).canonicalFile } ?: return err(q.id, "bad_request: args.cwd required")
        if (!cwd.toPath().startsWith(ws.toRealPath())) return err(q.id, "cwd_outside_workspace: $cwd")
        val r = exec.run(cwd, q.args.args)
        ok(q.id, buildJsonObject { put("exitCode", r.exitCode); put("stderr", r.stderr) })
      }
      else -> err(q.id, "unknown_cmd: ${q.cmd}")
    }
  }
```

跑绿后 `git add daemon .gitignore`,commit。

#### Step 2:TapiGradleExecutor+Main+冒烟(commit `[T2.1] Tooling API executor + main`)

**先写失败测试**(追加 DaemonTest.kt;TAPI 真实联调由 Step 5 覆盖):`MainArgsTest` 单 @Test:`assertEquals(Path.of("/w"), parseWorkspace(arrayOf("--workspace","/w")))`;`assertFailsWith<IllegalArgumentException> { parseWorkspace(emptyArray()) }`。跑红。**实现** `Main.kt`(imports:`java.io.*`/`java.net.*`/`java.nio.channels.SocketChannel`/`java.nio.file.*`/`java.util.concurrent.ConcurrentHashMap`/`kotlin.system.exitProcess`/`org.gradle.tooling.*`)。`class TapiGradleExecutor : GradleExecutor, AutoCloseable` 照条成码:
- 连接缓存复用:`private val conns = ConcurrentHashMap<String, ProjectConnection>()`;`private fun connect(cwd: File) = conns.computeIfAbsent(cwd.canonicalPath) { GradleConnector.newConnector().forProjectDirectory(cwd).useBuildDistribution().useGradleUserHomeDir(File(cwd, ".gradle-home")).connect() }`(对齐 Spawn 路径 GRADLE_USER_HOME 约定);
- `override fun run(cwd, args)`:`val err = ByteArrayOutputStream()`;`connect(cwd).newBuild().withArguments(args).setStandardOutput(OutputStream.nullOutputStream()).setStandardError(err).run()` → `RunPayload(0, err.tail())`(任务名+选项按序透传,`--tests` 顺序敏感);
- `catch (e: BuildException)` → `RunPayload(1, err.tail())`(构建失败→非零;run.ts 只判 `!==0`);`catch (e: GradleConnectionException)` → `conns.remove(cwd.canonicalPath)?.let { runCatching { it.close() } }`(废弃,重建)+ `RunPayload(1, "GradleConnectionException: ${e.message}\n${err.tail()}")`;
- `private fun ByteArrayOutputStream.tail(n: Int = 200_000) = toString(Charsets.UTF_8).takeLast(n)`;`close()`=逐连接 `runCatching { it.close() }`。

同文件顶层函数按条成码:
- `parseWorkspace(a: Array<String>): Path`:取 `--workspace` 后一参数→`Path.of(v).toAbsolutePath().normalize()`;缺失→`require` 失败,消息 `usage: uiv-render-daemon --workspace <dir>`。
- `main(a)`:`ws=parseWorkspace(a)`;`sock=ws.resolve(".ui-verify/daemon.sock")`;`Files.createDirectories(sock.parent)`;`check(sock 串字节数<=100)`(AF_UNIX 自检);sock 已存在:试连(UNIX SocketChannel),连通→stderr `daemon already running`+`exitProcess(11)`;否则 `Files.delete(sock)`;起 executor+server;shutdown hook `{server.stop(); ex.close()}`;stdout `listening on $sock`;`server.start().join()`。

跑绿后冒烟(未启沙箱可直跑,否则首行归【外】;期望 SMOKE-OK):

```bash
$GW -p daemon installDist && daemon/build/install/uiv-render-daemon/bin/uiv-render-daemon --workspace "$PWD" >>.ui-verify/daemon.log 2>&1 &
sleep 2 && printf '{"id":"s","cmd":"ping","args":{}}\n' | nc -U -w 3 .ui-verify/daemon.sock | grep -q '"ok":true' && echo SMOKE-OK
```

(0600 机判由 Step 1 与 leg hot 覆盖。)

#### Step 3:uiv 双车道 runner+自动降级(commit `[T2.1] uiv dual-lane runner`)

**先写失败测试** `packages/uiv-cli/src/gradle-runner.test.ts`。设施:`dir()=mkdtempSync(join(tmpdir(),'uivd-'))`(短路径守 104B);`fakeDaemon(sock, respond)`=`net.createServer`,按 `\n` 拆行,每行回 `respond(req)` 的 JSON+`\n`;`listen(sock)` 后 resolve 关闭句柄。5 用例照条成测(断言即代码):
1. respond 记录 req 并回 `{id:req.id,ok:true,payload:{exitCode:7,stderr:'e: boom'}}` → `await expect(new UdsGradleRunner(sock).run('/d',['t'])).resolves.toEqual({exitCode:7,stderr:'e: boom'})`;req `toMatchObject({cmd:'gradle.run',args:{cwd:'/d',args:['t']}})`(参数序由 Step 1 断言 3 覆盖);
2. respond 回 `{id:req.id,ok:false,error:'nope'}` → `rejects.toThrow(/daemon error: nope/)`;
3. 无 sock(空目录):`s=await selectGradleRunner(dir())` → `s.lane==='cold'`,instanceOf SpawnGradleRunner,`extraArgs` 含 `'--no-daemon'`;
4. respond 回 `{id:req.id,ok:true,payload:{pong:true}}` → `s.lane==='hot'`,instanceOf UdsGradleRunner;
5. sock 为普通文件(`writeFileSync(join(d,'daemon.sock'),'')`)→ `lane==='cold'`。

跑红(模块不存在)。**最小实现** `packages/uiv-cli/src/gradle-runner.ts`,imports:`spawn`/`randomUUID`/`existsSync`/`connect`/`path` 各自 node 内置模块 + `type GradleRunner`(uiv-core)。三部分:
(a) `SpawnGradleRunner`:既有 index.ts 内联类**原样迁移**(逻辑勿改),仅两处:`constructor(readonly extraArgs: string[] = [])`;spawn 第二参改 `[...this.extraArgs, ...args]`。
(b) `export function request(sockPath: string, req: { id: string; cmd: string; args: object }, timeoutMs: number): Promise<unknown>`——单请求单连接:`connect(sockPath)`;timeoutMs 定时器到期→destroy+reject `daemon timeout ${timeoutMs}ms`;`'error'`→清定时器+destroy+reject(e);`'connect'`→写 `JSON.stringify(req)+'\n'`;`'data'`→累积 buf 至首个 `\n` 后清定时器、`sock.end()`、`JSON.parse` 为 `{ok,payload?,error?}`,`!ok`→reject `daemon error: ${error ?? 'unknown'}`,否则 resolve(payload)。
`export class UdsGradleRunner implements GradleRunner`:构造器存 `sockPath`;`run(cwd, args)` = `await request(sockPath, { id: randomUUID(), cmd: 'gradle.run', args: { cwd, args } }, 600_000)`,payload 需 `exitCode: number` 且 `stderr: string`(否则 throw `daemon payload malformed`),原样返回。
(c) `export async function selectGradleRunner(uiVerifyDir: string): Promise<{ runner: GradleRunner; lane: 'hot' | 'cold'; reason: string }>`,`sock=path.join(uiVerifyDir,'daemon.sock')`,照条返回(降级仅在选路时刻,选定后故障如实上抛):`!existsSync(sock)`→cold/`'no sock'`;`await request(sock,{id:randomUUID(),cmd:'ping',args:{}},500)` 成功→hot/`'ping ok'`;抛 e→cold/`'ping failed: '+(e as Error).message`。runner:cold=`new SpawnGradleRunner(['--no-daemon'])`,hot=`new UdsGradleRunner(sock)`。

**接线** `packages/uiv-cli/src/index.ts`(surgical):删内联 SpawnGradleRunner 与 `spawn` import;加 `import { selectGradleRunner } from './gradle-runner.js';`;check 分支调 `runCheckL2` 前插 `const sel = await selectGradleRunner(uiVerifyDir); console.error(\`uiv: gradle lane=${sel.lane} (${sel.reason})\`);`(stderr),首参改 `sel.runner`。
跑绿:`npm test && npm run build` exit 0。

#### Step 4:启动物料+沙箱文档(commit `[T2.1] setup docs + launchd + allowUnixSockets`)

生成 `docs/launchd/com.magpie.uiv-render-daemon.plist`(plist XML 键值照条;`JAVA_HOME` 以 `$(/usr/libexec/java_home -v 21)` 命令替换写死实值);机判 `plutil -lint docs/launchd/*.plist`→`… OK`:
- Label=`com.magpie.uiv-render-daemon`;ProgramArguments=[`WS/daemon/build/install/uiv-render-daemon/bin/uiv-render-daemon`,`--workspace`,`WS`];
- EnvironmentVariables:`JAVA_HOME`=命令替换实值;RunAtLoad=`true`;KeepAlive=`{SuccessfulExit: false}`;StandardOutPath=StandardErrorPath=`WS/.ui-verify/daemon.log`。

写 `docs/daemon-setup.md`(照条成文,五节全含);机判 `grep -q allowUnixSockets docs/daemon-setup.md`:
1. 手动启动:`demo-android/gradlew -p daemon installDist`;【外】执行 Step 2 冒烟首行;停止 `pkill -f uiv-render-daemon`;重复启动 exit 11;
2. launchd:cp 到 `~/Library/LaunchAgents/` 后 `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.magpie.uiv-render-daemon.plist`;卸载 `launchctl bootout gui/$(id -u)/com.magpie.uiv-render-daemon`;
3. 沙箱:settings.json `{"sandbox":{"network":{"allowUnixSockets":["<WS>/.ui-verify/daemon.sock"],"allowedDomains":["repo.gradle.org","…既有域名"]}}}`;UDS 白名单=设计文档 5.2 默认方案(沙箱堵 loopback);备选 `allowLocalBinding=true`(macOS-only,粒度粗);
4. 降级语义:sock 缺失/ping 失败→自动 spawn `./gradlew --no-daemon`(慢但自给自足);lane 打印于 stderr;报告与车道无关;
5. 安全边界:sock 0600 仅属主可连;daemon 拒绝 workspace 外 cwd;不监听 TCP。

#### Step 5:验收三件套——等价/P50/0600(commit `[T2.1] acceptance: equivalence+P50+perms`)

三脚本照条成码,放 `scripts/t2.1/`。

`diff-reports.mjs`(等价判据,node ESM):读两个 argv JSON;`EXCLUDE=[]`=时间戳类字段 dot-path(**v1 实测无→空表**,未来在此登记),逐路径 delete;递归键排序后 `JSON.stringify`;相等→stdout `EQUIVALENT`、exit 0;否则 `DIVERGENT@<首个分歧下标>`+两侧上下文、exit 1。

`equivalence.sh`(bash,`set -euo pipefail`,cd WS;变量 CARD(事实源)、`R=.ui-verify/reports/1-100@T1_0A_V1/report.json`、`T=.calib-tmp/t2.1`(mkdir -p)、`S=.ui-verify/daemon.sock`;子命令 case):
- `deviate`:`git diff --quiet -- "$CARD"` 否则 exit 3;`sed -i '' 's/12\.dp to 36\.dp,/20.dp to 44.dp,/' "$CARD"`(subtitle +8,+8→稳定 position 违规);`grep -q '20.dp to 44.dp' "$CARD" && echo DEVIATED`;
- `leg cold|hot`:前置——cold 要求 `[ ! -S $S ]` 否则 exit 3;hot 要求 `-S $S` 且 `test "$(stat -f %Lp $S)" = 600` 否则 exit 5。共用 leg():①`rm -f .ui-verify/state.json`(防震荡状态污染);②跑 CHECK,stdout 弃、stderr 存 `$T/$1.err`,`set +e` 捕 ec;③`grep -q "lane=$1" "$T/$1.err"` 且 ec==1(写偏必 fail),否则 exit 4;④`cp "$R" "$T/$1.json"`;echo `LEG-$1-OK`;
- `diff`:`node scripts/t2.1/diff-reports.mjs "$T/cold.json" "$T/hot.json"`(继承其 exit);`git checkout -- "$CARD"`;echo RESTORED。

`measure-hot.mjs`(P50 机判):
- 每轮先 toggle:CARD 末尾追加/去除行 `// t2.1-touch`(强制重编译+重跑,对齐内循环单轮改代码;M1 用 `--rerun`,差异记入 protocol);
- 1 轮预热不计+10 轮实测;每轮 `spawnSync('node', CMD)`(CMD=CHECK 拆数组),耗时=`Date.now()` 差;`status!==0`→打印 stderr、exit 2;stderr 不含 `lane=hot`→exit 3;
- P50=samples 升序第 5/6 位均值;`pass = p50 <= 3100`;
- 落档 `docs/t2.1-latency.json`:`{task:'T2.1',lane:'hot',protocol:'EOF-comment-toggle (M1: --rerun)',warmupRounds:1,samples,p50Ms,targetMs:3100,m1WarmMedianS:5.1,pass,measuredAt:new Date().toISOString()}`;
- 收尾:去除残留 MARK;`execSync('git diff --quiet -- '+CARD)` 复原机判;stdout `{"p50Ms":…,"pass":…}`;`exit(pass?0:1)`。

**验收执行序**(期望输出即判据):

```bash
bash scripts/t2.1/equivalence.sh deviate   # DEVIATED
pkill -f uiv-render-daemon || true         # 【外】停 daemon
bash scripts/t2.1/equivalence.sh leg cold  # LEG-cold-OK
# 【外】起 daemon(Step 2 冒烟首行)
bash scripts/t2.1/equivalence.sh leg hot   # LEG-hot-OK(0600 机判)
bash scripts/t2.1/equivalence.sh diff      # EQUIVALENT+RESTORED
node scripts/t2.1/measure-hot.mjs          # {"p50Ms":…,"pass":true},exit 0
```

#### 失败处理与收尾

机判集=各 Step 跑绿命令+执行序六条+Step 4 两项机判,全部 exit 0 即过。P50 未达标→落档 JSON 携 samples 回 Codex(候选:daemon 预热、配置缓存、测量协议复核);DIVERGENT 输出即最小复现证据,回 Codex。收尾报请编排者更新 meta.json(`tasks.T2.1=awaiting_review`,`latency_baseline.t2_1_hot`=落档 JSON)。


---

# M2 章:T2.2 odiff server 常驻 + T2.6 `uiv check --record`

> worker:sonnet(executing-plans);红→绿→commit,message 带任务号;meta.json 由主会话回填。上游:orchestration M2 表 + 设计文档 2.4/3.1/5.3。前置:`ls node_modules/odiff-bin/server.js .ui-verify/mapping.json demo-android/gradlew && npm test` 过。证伪:server≠spawn、定向 verify 非绿=口径类→停回 Codex;环境类重试一次。

## T2.2 odiff server 常驻(spawn 保留为降级)

**已查证(实物核验)**:odiff-bin@4.3.8 双导出 `compare`/`ODiffServer`;`srv.compare(base,cmp,diffOut,opts&{timeout?})` 与 spawn 结果同构,透传 threshold/antialiasing/**ignoreRegions**;构造即 spawn `--server`(超时 5s),崩溃后自动重拉,`stop()` 幂等;buffer 形态不用(官方:已落盘优先路径);空 ignoreRegions 沿用仅非空传守卫。

**退出策略**:首次 L1 比对**懒拉起**(uiv 单发或 T2.1 daemon 宿主同规则,daemon 场景随其生命周期复用);宿主收尾 `stopOdiffServer()` + 模块一次性 `process.on('exit')` 兜底;宿主强杀时 stdin EOF 令其自退。降级:server 抛错当次回落 spawn 并 warn;`UIV_ODIFF=spawn` 强制。

### Step 1(红)

`packages/uiv-core/src/l1/engine.test.ts` 顶部加 `import { _setOdiffBinary, stopOdiffServer } from './server.js';`,末尾追加:

```ts
it('T2.2: server=spawn 一致(含 ignoreRegions);坏二进制降级', async () => {
  for (const ig of [[], [{ x: 0, y: 0, w: 16, h: 16 }]]) {
    const a = await runL1(basePng, diffPng, join(dir, `sv${ig.length}.png`), ig, 'server');
    expect(a).toEqual(await runL1(basePng, diffPng, join(dir, `sp${ig.length}.png`), ig, 'spawn'));
  }
  stopOdiffServer();
  _setOdiffBinary('/nonexistent/odiff');
  expect((await runL1(basePng, diffPng, join(dir, 'fb.png'), [], 'server')).diffCount).toBeGreaterThan(0);
  _setOdiffBinary(undefined);
});
```

`npx vitest run packages/uiv-core/src/l1/engine.test.ts` → FAIL(module not found)。

### Step 2(绿):server.ts + 接线

新建 `packages/uiv-core/src/l1/server.ts`:

```ts
/** T2.2:odiff 常驻 server 门面。懒拉起单例,失败当次降级 spawn;退出策略见子计划章。 */
import { ODiffServer, compare } from 'odiff-bin';
import type { ODiffOptions, ODiffResult } from 'odiff-bin';

export type OdiffMode = 'server' | 'spawn';
let srv: ODiffServer | null = null;
let bin: string | undefined;
process.on('exit', () => srv?.stop());   // 兜底
export function _setOdiffBinary(p: string | undefined): void { bin = p; stopOdiffServer(); }
export function stopOdiffServer(): void { srv?.stop(); srv = null; }

export async function odiffCompare(base: string, cmp: string, out: string, opts: ODiffOptions,
    mode: OdiffMode = process.env.UIV_ODIFF === 'spawn' ? 'spawn' : 'server'): Promise<ODiffResult> {
  if (mode === 'server') {
    try {
      if (srv === null) srv = new ODiffServer(bin);
      return await srv.compare(base, cmp, out, { ...opts, timeout: 15_000 });
    } catch (e) {
      console.warn(`uiv: odiff server fallback to spawn: ${(e as Error).message}`);
      stopOdiffServer();
    }
  }
  return compare(base, cmp, out, opts);
}
```

`engine.ts`:`runL1` 加尾参 `mode?: OdiffMode`,`compare(...)` 调用改 `odiffCompare(baselinePng, renderedPng, diffOut, {…options 逐字不动…}, mode)`(删未用导入);core index 加 `export * from './l1/server.js'`;CLI `main().catch(...)` 链尾加 `.finally(stopOdiffServer)`。
验 `npm run build && npm test` 全绿后 commit:`git add -A && git commit -m "T2.2: odiff server 常驻门面,runL1 双模式一致,spawn 降级保留"`

### Step 3:耗时落档

新建 `scripts/bench-odiff-t22.mjs`(仓库根跑 `node scripts/bench-odiff-t22.mjs`;720×1600 对齐 T1.0a npx 中位 2228ms;两路结果不一致 exit 1,自身即机判):

```js
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compare, ODiffServer } from 'odiff-bin';
const d = '.calib-tmp/t22'; mkdirSync(d, { recursive: true });
const g = new PNG({ width: 720, height: 1600 }); g.data.fill(255);
writeFileSync(`${d}/a.png`, PNG.sync.write(g));
for (let y = 50; y < 150; y++) g.data.fill(0, (y * 720 + 50) * 4, (y * 720 + 150) * 4);
writeFileSync(`${d}/b.png`, PNG.sync.write(g));
const o = { threshold: 0.063, antialiasing: true }, med = a => [...a].sort((x, y) => x - y)[2];
const bench = async fn => { const ms = []; let r;
  for (let i = 0; i < 5; i++) { const t = performance.now(); r = await fn(i); ms.push(Math.round(performance.now() - t)); }
  return { ms, r }; };
const P = await bench(i => compare(`${d}/a.png`, `${d}/b.png`, `${d}/s${i}.png`, o));
const srv = new ODiffServer();
await srv.compare(`${d}/a.png`, `${d}/b.png`, `${d}/w.png`, o);
const S = await bench(i => srv.compare(`${d}/a.png`, `${d}/b.png`, `${d}/v${i}.png`, o));
srv.stop();
if (JSON.stringify(P.r) !== JSON.stringify(S.r)) { console.error('MISMATCH'); process.exit(1); }
const f = 'docs/latency-m2.json', all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
all.t2_2_odiff = { image: '720x1600', spawn_ms: P.ms, server_ms: S.ms, median_spawn_ms: med(P.ms),
  median_server_ms: med(S.ms), resultsIdentical: true, measured_at: new Date().toISOString().slice(0, 10) };
writeFileSync(f, JSON.stringify(all, null, 1) + '\n');
console.log('BENCH-OK', med(P.ms), med(S.ms));
```

验收:末行 `BENCH-OK <spawn中位> <server中位>`,latency-m2.json 含 t2_2_odiff(速度只落档,不覆盖他任务 key)。
commit:`git add scripts/bench-odiff-t22.mjs docs/latency-m2.json && git commit -m "T2.2: spawn vs server 耗时落档,结果一致门通过"`

## T2.6 `uiv check --record`

**已查证(jar 核验)**:Roborazzi 1.63.0 属性 `roborazzi.test.record/compare/verify`、任务 `verifyRoborazziDebug`;compare 产物 `<名>_actual.png`/`_compare.png` 落 `build/outputs/roborazzi`;**golden = captureRoboImage 显式路径**(现指 build/ 下被 ignore;`src/test/snapshots/` 未被)→golden 目录写死 `demo-android/app/src/test/snapshots/`(设计文档 5.3)。隐患:`_compare.png` 被"最新含短名"误收、unchanged 零产物→Step 6 修。

### Step 4(红→绿):args `--record`

`packages/uiv-cli/src/args.test.ts` 追加:

```ts
it('check --record 解析为 record:true;缺省 false', () => {
  const b = ['check', '--preview', 'a.BPreview', '--node', '1:1', '--demo', 'd'];
  expect((parseCliArgs([...b, '--record']) as CheckCmd).record).toBe(true);
  expect((parseCliArgs(b) as CheckCmd).record).toBe(false);
});
```

`npx vitest run packages/uiv-cli` → FAIL(unknown argument)。绿:`CheckCmd` 加 `record: boolean`;check 分支先 `const record = rest.includes('--record');`、`const rest2 = rest.filter((a) => a !== '--record');`,collectFlags 用 `rest2`,返回加 `record`。重跑绿,commit 并入 Step 6。

### Step 5(红→绿):runRecord 拒绝逻辑

`packages/uiv-core/src/check/run.test.ts` 底部追加(复用既有设施;顶部补 `import { RecordRefusedError, runRecord } from './record.js';`):

```ts
const rec: string[][] = [];
const okRunner = { async run(cwd: string, args: string[]) {
  rec.push(args);
  const s = join(cwd, 'app/src/test/snapshots');
  mkdirSync(s, { recursive: true }); writeWhitePng(join(s, 'CalibCard.png'));
  return { exitCode: 0, stderr: '' };
} };
it('T2.6 runRecord: pass:false 拒绝不跑 gradle;pass:true 参数+golden 校验', async () => {
  const r0 = new FakeRunner(0, '');
  await expect(runRecord(r0, { demoDir: makeDirs().demoDir, testFqn: TEST_FQN }, false)).rejects.toBeInstanceOf(RecordRefusedError);
  expect(r0.calls.length).toBe(0);
  const { demoDir } = makeDirs();
  const { goldenPath } = await runRecord(okRunner, { demoDir, testFqn: TEST_FQN }, true);
  expect(rec[0]).toEqual(['testDebugUnitTest', '--tests', TEST_FQN, '-Proborazzi.test.record=true', '--rerun']);
  expect(goldenPath).toBe(join(demoDir, 'app/src/test/snapshots/CalibCard.png'));
});
```

红(module not found)后新建 `packages/uiv-core/src/check/record.ts`:

```ts
/** T2.6:check 全过后录 golden。pass=false 拒绝,CLI 映射 exit 3(防录坏 golden)。 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GradleRunner } from './run.js';
export class RecordRefusedError extends Error {}
export async function runRecord(runner: GradleRunner, opts: { demoDir: string; testFqn: string }, checkPassed: boolean): Promise<{ goldenPath: string }> {
  if (!checkPassed) throw new RecordRefusedError('--record refused: check pass=false');
  const short = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '');
  const goldenPath = join(opts.demoDir, 'app', 'src', 'test', 'snapshots', `${short}.png`);
  const { exitCode, stderr } = await runner.run(opts.demoDir, ['testDebugUnitTest', '--tests', opts.testFqn, '-Proborazzi.test.record=true', '--rerun']);
  if (exitCode !== 0) throw new Error(`record gradle failed (exit ${exitCode}): ${stderr.slice(-400)}`);
  if (!existsSync(goldenPath)) throw new Error(`golden not found after record: ${goldenPath}`);
  return { goldenPath };
}
```

core index 加 `export * from './check/record.js'` → 绿。

### Step 6(红→绿):收集防 `_compare` 误收

`run.test.ts` 再追加(宽 64=应收,128=不应收;顶部补 `readFileSync, utimesSync` 导入):

```ts
const seed = (dir: string, name: string, w: number, ageMs = 0) => {
  mkdirSync(dir, { recursive: true });
  const png = new PNG({ width: w, height: 64 }); png.data.fill(255);
  const p = join(dir, name); writeFileSync(p, PNG.sync.write(png));
  if (ageMs > 0) { const t = new Date(Date.now() - ageMs); utimesSync(p, t, t); }
};
const W = (p: string) => PNG.sync.read(readFileSync(p)).width;
it('T2.6 收集: 新鲜 _actual 优先;陈旧 actual 回落 golden', async () => {
  let { demoDir, uiVerifyDir } = makeDirs();
  const robo = (dd: string) => join(dd, 'app/build/outputs/roborazzi');
  seed(robo(demoDir), 'CalibCard_actual.png', 64); seed(robo(demoDir), 'CalibCard_compare.png', 128);
  let r = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
  expect(W(r.report.artifacts.render!)).toBe(64);
  ({ demoDir, uiVerifyDir } = makeDirs());
  seed(robo(demoDir), 'CalibCard_actual.png', 128, 600_000);
  seed(join(demoDir, 'app/src/test/snapshots'), 'CalibCard.png', 64);
  r = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
  expect(W(r.report.artifacts.render!)).toBe(64);
});
```

红:双断言 FAIL(现行误收)。绿改 `run.ts`:findNewestPng 加第三参 `exclude?: (name: string) => boolean`,过滤加 `&& !(exclude?.(entry.name) ?? false)`;runCheck 在 `runner.run` 前加 `const t0 = Date.now();`,原调用块替换为:

```ts
const roboDir = join(opts.demoDir, 'app', 'build', 'outputs', 'roborazzi');
const goldenPath = join(opts.demoDir, 'app', 'src', 'test', 'snapshots', `${shortName}.png`);
const fresh = (p: string | null): string | null =>
  p !== null && statSync(p).mtimeMs >= t0 - 1000 ? p : null;
// ①本轮 _actual ②本轮非 _compare(旧 added 形态)③golden(unchanged 零产物)
const found = fresh(findNewestPng(roboDir, `${shortName}_actual`))
  ?? fresh(findNewestPng(roboDir, shortName, (n) => n.endsWith('_compare.png')))
  ?? (existsSync(goldenPath) ? goldenPath : null);
```

验:`npm run build && npm test` 全绿(既有 no-png 用例覆盖三级全空→render_harness_error)。
commit:`git add -A && git commit -m "T2.6: --record 解析+runRecord 拒绝+收集三级优先"`

### Step 7:CLI 接线 + golden 目录切换 + e2e

①`packages/uiv-cli/src/index.ts` 导入 RecordRefusedError/runRecord;`new SpawnGradleRunner()` 提为 `const runner`;`runCheckL2` 后、打印 reportPath 前插:

```ts
if (cmd.record) {
  const { goldenPath } = await runRecord(runner, { demoDir: path.resolve(cmd.demo), testFqn }, report.pass);
  console.log(`golden recorded: ${goldenPath}\nhint: git add ${goldenPath} && git commit`);
}
```

`main().catch` 内 CliUsageError 分支前插 `if (e instanceof RecordRefusedError) { console.error('uiv: ' + e.message); process.exitCode = 3; return; }`;头注释 exit 码表补 `3 = --record 被拒`。
②`CalibCardScreenshotTest.kt`:captureRoboImage 路径改 `"src/test/snapshots/CalibCard.png"`(行注释改:golden 入库目录 T2.6;compare 产物仍落 build/)。
③e2e(仓库根):

```bash
npm run build
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android --record; echo "exit=$?"
test -f demo-android/app/src/test/snapshots/CalibCard.png && echo GOLDEN-OK
(cd demo-android && ./gradlew testDebugUnitTest --tests com.magpie.uiv.demo.CalibCardScreenshotTest -Proborazzi.test.verify=true --rerun); echo "verify=$?"
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android; echo "exit2=$?"
```

预期:`exit=0`,stdout 含 `golden recorded: `,末行为 report.json 路径;`GOLDEN-OK`;`verify=0`(=编排表"对应 compare 任务";全量 verify 待 PreviewScanner golden 补录,列 M2 收尾);`exit2=0`(golden 在场收集不断)。不符 → 证伪。
commit:`git add -A && git commit -m "T2.6: uiv check --record 录 golden 入库,定向 verify 绿,e2e 闭环"`

收口:`npm run build && npm test` 全绿;报主会话:两任务 commit hash、t2_2_odiff 中位数、待办"PreviewScanner golden 补录评估"。


---

### Task T2.3 — 快车道可行性验证(研究型任务:产出结论与数据,非产品代码)

**北极星自检**:直接服务 M2 里程碑验收行"快车道可行则 P50≤6s/P90≤10s,否则如实记录"(编排 M2 表;判据出处 = 设计文档第 8 节 Phase 1 验收标准)。
**性质**:研究/实验。产物 = `docs/fastlane-feasibility.md` + meta 数据块 + 实验证据;**不产出产品代码**,不改 demo-android 与 packages/**,一切实验物只落 `experiments/fastlane-spike/`。
**前置**:M1 完成(CalibCard 慢车道 PNG 可作对照)。建议排在 T2.1 之后(取慢车道热路径 P50 作增益对照 + UDS 基建复用范式);若并行执行,对照值暂用 T1.1 暖构建中位数 5.09s(docs/latency-t1.1.json),T2.1 完成后回填。
**建议派发**:opus / effort high(含实测解读,§0 分层)。

#### 版本事实(2026-07-09 已查证;S1 执行时必须复核)

- Paparazzi 2.0.0 最新 alpha = **2.0.0-alpha05**(2026-05-20):新增 **setup/teardown 程序化钩子(与 JUnit4 解耦)**——快车道候选 1 的立论基础;LayoutLib 16.2.1、Compose 1.11.2、Gradle 插件基于 Gradle 9.3.1(并修复了 Gradle 8.x 兼容)。
- 2.0.0-alpha04(2026-01-20)起:**消费端必须以 Java 21+ 构建**;工具链 Kotlin 2.3.0、AGP 8.13.2。
- alpha05 release note 原文:"This release supports **pre-AGP 9.0** consumers"——**AGP 9.0.x 消费端支持未声明**。
- 本机对照:JDK Corretto 21.0.9 ✓;demo-android = AGP 9.0.1 + 内建 Kotlin 2.2.10 ✗(9.0.1 ∉ pre-9.0,Kotlin 2.2.10 < 2.3.0)。
- **预判**:Paparazzi 插件大概率不能直接 apply 进 demo-android → S2 用最小工程机判取证共存性,S3 起走独立实验模块隔离(编排任务书既定分支)。

#### 硬性安全前置(Codex 已确认,不可谈判)

- 实验期:探针进程**零网络面**——渲染由 stdin/stdout 驱动,不开任何 socket(含 localhost HTTP)。
- 纳入产品的前置条件:触发通道必须 **UDS(0600,复用 T2.1 基建)或 token 鉴权**,**禁止裸 localhost HTTP 触发构建/渲染**;该加固完成是 Codex 决断纳入的前置(编排 M2 表原文)。加固实现不在 T2.3 范围,但报告必须含"加固路径评估"一节。

#### 判据表(执行前写死,事后不得放宽)

| # | 判据 | 阈值 | 采法 |
|---|------|------|------|
| G1 | 单轮延迟 | P50≤6s 且 P90≤10s | 预热 3 轮后连续 N=20 轮;计时口径 = "stdin 渲染指令写入 → PNG 落盘完成" |
| G2 | 与慢车道视觉一致 | odiff diffRatio<0.01 | 同一 CalibCard @Preview:快车道 PNG vs demo-android Roborazzi PNG,密度/像素尺寸对齐后 `npx odiff-bin` |

**可行 = G1 ∧ G2**。**不可行条件(任一成立即判,如实落档,禁止调阈值救活)**:
- F1:版本约束与 demo-android 不共存,**且**独立模块隔离在时间盒内也跑不通首张 PNG;
- F2:候选时间盒(各 ≤2h)耗尽仍未产出可对比 PNG;
- F3:G1 不达标;
- F4:排除配置性差异(密度/尺寸/字体已对齐)后 G2 仍不达标(layoutlib vs Robolectric RNG 管线系统性差异属真实结论);
- F5:常驻进程连续渲染无法维持(20 轮采样期内崩溃/OOM 且无解)。

**记录项(不改判,但必须落档供 Codex 决断)**:① 语义树可达性——快车道能否导出 semantics.json 喂 L2;不能则快车道仅可服务 L1/视觉预览,价值折半;② 30 轮连续渲染内存曲线;③ 相对慢车道热路径 P50 的增益比(注明两者计时口径差异);④ 首轮冷启动耗时。

#### 实验隔离(编排 §0 路径隔离纪律)

```
experiments/fastlane-spike/          # 唯一写入区
├── coexist-probe/                   # S2:AGP 9.0.1 × Paparazzi 插件共存机判
├── paparazzi-probe/                 # S3~S6:独立 Gradle 工程,自带 settings+wrapper,钉 AGP 8.13.2/Kotlin 2.3.0
├── evidence/                        # 【提交】延迟原始 JSON、odiff 输出、对照 PNG、S2 报错全文
└── meta-fragment.json               # 【提交】交主会话合入 meta.json(子 agent 不写 meta.json)
```

GRADLE_USER_HOME 沿用仓库 `.gradle-home`(依赖缓存复用);probe 的 `build/`、`.gradle/` 进 .gitignore;CalibCard 源码**拷贝**进 probe(标注"实验专用副本,不回流不维护")。

#### 候选 1:Paparazzi 2.0.0-alpha 程序化钩子(时间盒 2h,超时即记 F2)

- **S1(~10min)版本复核**:查 Maven Central `app.cash.paparazzi` 最新 2.0.0-alpha*;若已出 >alpha05,以新版约束更新"版本事实"节再走后续(判据不变)。产出:版本事实落 `docs/fastlane-feasibility.md` 头部。
- **S2(~15min)共存性机判**:coexist-probe = demo-android 同款 AGP 9.0.1 + 内建 Kotlin + apply paparazzi 插件,跑一次 `./gradlew tasks`。**失败即取证**(报错全文落 evidence/),不 debug,共存性判"否";意外成功则记"共存成立",S3 在该 probe 上续做(仍不碰 demo-android)。
- **S3(~30min)隔离工程跑通官方路线**:paparazzi-probe 钉 AGP 8.13.2 + Kotlin 2.3.0 + compose 插件 + paparazzi(S1 版本);拷贝 CalibCard;按官方 JUnit4 路线 `recordPaparazziDebug` 出**首张 PNG**(证明工具链活)。Compose 版本优先对齐 demo-android BOM(2026.06.00),不通则退 Paparazzi 自带 1.11.2,取法落档(影响 G2 解读)。
- **S4(~30min)常驻改造 + 延迟采样**:JUnit-free `main()`:构造 Paparazzi 实例 → `setup()` → 循环读 stdin(`render <PreviewFqn>` → 渲染 → PNG 落盘 + 单轮耗时 JSON 行)→ `teardown()`。deviceConfig 钉 density=2.0、720×400px(与慢车道 golden 对齐)。预热 3 轮 → 连续 20 轮采样 P50/P90 → 再续至 30 轮记内存曲线。原始数据落 `evidence/latency-fastlane.json`。preview 发现机制(ComposablePreviewScanner 接线)属产品化事项,spike 写死 FQN。
- **S5(~10min)视觉一致性**:快车道 CalibCard PNG vs 慢车道 Roborazzi golden → `npx odiff-bin` 出 diffRatio 落档。≥0.01 时仅允许排查一次**配置性**差异(密度/尺寸/字体),复测仍超 = F4。
- **S6(~10min)语义可达性探测(记录项)**:常驻进程内探 SemanticsOwner 可达路径(composition 内部 API);10min 无路径即记"不可达,快车道仅 L1/预览可用",不深挖。
- **S7(~15min)候选 1 小结**:判据逐项 ✓/✗ + 数据表,写入报告。

#### 候选 2:自建嵌入式 Robolectric persistent worker(时间盒 2h;纸面评估,不写实现代码)

分支:候选 1 判可行 → 仅落"备胎不启用"结论 + 归档最小 spike 判据(~20min 收束);候选 1 不可行 → 完整纸面评估(≤2h)。
纸面评估逐项回答(证据 = Robolectric 源码/官方文档引用,写进报告):
- **P1 JUnit 解耦点**:绕开 RobolectricTestRunner 时,AndroidSandbox / SandboxFactory / TestEnvironment 能否手动构造并复用?列出涉及 internal API 清单与随版漂移风险(Robolectric 约半年一版)。
- **P2 进程内复用**:同一 JVM 第二次渲染能否复用 sandbox classloader(即真正绕开 C6 证伪的逐轮 fork 损耗)?给理论延迟下限估算。
- **P3 工程量级**:最小可用 worker 的人日估算(sandbox 构造/类插桩/资源加载/崩溃恢复)与长期维护面。
- **P4 并存成本**:与慢车道双管线的视觉一致性与配置同步负担。

**最小 spike 判据(写死归档,T2.3 内不执行,留 Codex 决断后启动)**:单 JVM 手动构造 sandbox,同一 composable 渲染两次,第二次 <1s,且 10 轮 heap 增长 <50MB;任一不成立即候选 2 判死。

#### 收口(~30min)

- **R1 报告** `docs/fastlane-feasibility.md`,头部机读块(逐行 `key: value`):`verdict: feasible|infeasible|partial`、`p50_ms:`、`p90_ms:`、`diff_ratio:`(数值或 `n/a` + F 码)。正文:版本事实 / 判据逐项结果 / 两候选数据与结论 / 慢车道对照与增益比 / 语义可达性 / 加固路径评估(常驻进程接 T2.1 UDS 的改造点)/ 维护风险(alpha 漂移、双工具链)/ 给 Codex 的决断问题:是否纳入(仅作加速插槽,不入关键路径);纳入则加固任务与排期归属(M2 尾 or M4)。
- **R2** `meta-fragment.json`:`{verdict, p50_ms, p90_ms, diff_ratio, n_rounds, versions:{paparazzi, agp_probe, kotlin_probe}, semantics_reachable, infeasible_codes[], measured_at}`,由主会话合入 meta.json。
- **R3 提交**:experiments/fastlane-spike/**(忽略 build 产物)+ docs/fastlane-feasibility.md,commit message 带 T2.3。
- **R4 交 Codex 决断**(既有 thread):纳入与否;若纳入,确认"UDS/token 加固完成"为前置并给排期归属。

#### 机判验收(对照编排 M2 表:"可行性结论 + 数据落档,交 Codex 决断")

```bash
#!/usr/bin/env bash
set -e
R=docs/fastlane-feasibility.md
grep -Eq '^verdict: (feasible|infeasible|partial)$' "$R"
grep -Eq '^p50_ms: ([0-9]+|n/a)' "$R"; grep -Eq '^p90_ms: ([0-9]+|n/a)' "$R"
grep -Eq '^diff_ratio: (0?\.[0-9]+|1(\.0+)?|n/a)' "$R"
node -e "const m=require('./experiments/fastlane-spike/meta-fragment.json');
for(const k of ['verdict','p50_ms','p90_ms','diff_ratio','n_rounds','versions','semantics_reachable','infeasible_codes','measured_at'])
  if(!(k in m)) process.exit(1)"
test -f experiments/fastlane-spike/evidence/latency-fastlane.json || grep -Eq 'F[12]' "$R"
git log --oneline | grep -q 'T2.3'
echo T2.3-ACCEPT-OK
```

exit 0 = 数据落档完成;Codex 决断结论由主会话回写 pending-codex-decisions.md 与 meta.json。

#### 风险与分支处理

- alpha06+ 释出改约束 → S1 按实况更新版本事实,判据表不动。
- probe 首次依赖解析慢 → 复用 .gradle-home 缓存;仍耗尽时间盒按 F2 如实记录(时间盒纪律优先于结论完美)。
- 快慢车道管线系统性像素差(layoutlib vs RNG 字体/抗锯齿)→ 正是 G2 要回答的问题;超标即 F4,不得调阈值。
- 候选 1 可行但语义不可达 → `verdict: partial`(仅 L1/预览价值),交 Codex 裁量是否值得纳入。
- 总时间盒:候选 1 ≤2h + 候选 2 ≤2h + 收口 0.5h,合计 ≤4.5h;任何步骤超时跳收口,以已得数据出报告。


---

### Task T2.4 — figma-spec-cache:钉版本缓存 + 配额预算器 + 变量解析三级降级

> 上游:orchestration.md M2 表 T2.4;设计文档 2.1。北极星:内循环 Figma 请求数=0 + MCP 不可用时降级解出 token 值(fixture 驱动)。前置:T1.2 done。文件均在 `packages/uiv-core/src/figma/`(下文省路径);存量只碰 client.ts/pull.ts/index.ts/.gitignore,可与其他 M2 任务并行。逐步红→绿→commit(统一 `git add packages/uiv-core <另列> && git commit -m <msg>`,下文只给 msg);验收失败非环境因 → 回 Codex。

#### 口径钉死

1. 缓存键 **(fileKey,nodeId,version)**:仅钉版本 getNodes 命中,命中即零网络;未钉必走网络并按响应 version 回填。getImages 不缓存(URL 30 天过期)但计数。**计数在接口层**:CachedFigmaClient 包裹任意 FigmaClient,暴露 `stats{networkCalls,cacheHits}`。缓存目录约定 `.uiv-cache/`(调用方传入,进 .gitignore)。getNodes 增可选参 `version?`(REST `?version=`);FixtureFigmaClient 无参实现天然兼容。
2. **预算器**:滑动窗 15/min + UTC 日 200/day(默认,可配)。分钟窗满 → **排队**:sleep 到最早一条滚出再试(有界 <60s);日预算满 → **立即抛** QuotaExceededError,不跨日排队。时钟/sleep 注入,单测假时钟。
3. **RestFigmaClient**:PAT = 构造参数 ?? env `FIGMA_PAT`,缺失构造即抛;fetchFn 可注入 → 单测全 mock **零真实请求**(可断网跑);每请求先过预算器;非 200 抛错(防御性,不设专测)。真实验证 = B1 PAT 到位后 followup,本任务不做。
4. **三级降级**:resolveVariable 沿链**首解即止**。① mcpVariableDefs——`get_variable_defs` 结果 map 由 agent 层调用后**注入**(MCP 调用在 agent 层,本库零 MCP 依赖);② StylesMapping——REST nodes 响应顶层 styles 表 × 节点 `styles.fill` 引用共现建 styleName→hex;③ TokensStudioJson——导出 JSON 扁平化(同时注册 `.`/`/` 双键 + 去 set 前缀别名;调用方读文件后传入)。全不可解 → `{value:null,source:'unresolved',unresolved:true}`,token 名原样保留。

#### Step 1:配额预算器

新建 `quota.test.ts`:

```ts
import { expect, it } from 'vitest';
import { QuotaBudgeter, QuotaExceededError } from './quota.js';

it('QuotaBudgeter:窗口滚动排队/日预算拒绝/UTC 日切清零', async () => {
  let t = Date.UTC(2026, 6, 9, 23, 0, 0); const slept: number[] = [];
  const q = new QuotaBudgeter({ perMinute: 2, perDay: 3 }, () => t,
                              async (ms) => { slept.push(ms); t += ms; });
  await q.acquire(); await q.acquire();
  await q.acquire();                 // 窗满:排队到最早一条滚出
  expect(slept).toEqual([60_000]);
  await expect(q.acquire()).rejects.toBeInstanceOf(QuotaExceededError);   // 日预算耗尽
  expect(slept).toEqual([60_000]);   // 拒绝未排队
  t += 86_400_000;
  await q.acquire();                 // 跨 UTC 0 点,新日清零
});
```

`npx vitest run packages/uiv-core/src/figma` → 红。新建 `quota.ts`:

```ts
export class QuotaExceededError extends Error {}

export class QuotaBudgeter {   // 策略见口径 2
  private stamps: number[] = []; private day = -1; private used = 0;
  constructor(private cfg: { perMinute: number; perDay: number } = { perMinute: 15, perDay: 200 },
              private now: () => number = Date.now,
              private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60_000);
      const day = Math.floor(t / 86_400_000);
      if (day !== this.day) { this.day = day; this.used = 0; }
      if (this.used >= this.cfg.perDay) throw new QuotaExceededError('daily budget exhausted');
      if (this.stamps.length < this.cfg.perMinute) { this.stamps.push(t); this.used++; return; }
      await this.sleep(this.stamps[0]! + 60_000 - t);
    }
  }
}
```

→ 绿。commit msg:`T2.4: 配额预算器(15/min+UTC 200/day,假时钟单测)`

#### Step 2:钉版本缓存+计数

新建 `cache.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { pullBaseline } from '../baseline/pull.js';
import { CachedFigmaClient } from './cache.js';
import { FixtureFigmaClient } from './client.js';

it('【T2.4 验收】钉版本命中零网络+不串键;内循环 3 次 check 零请求', async () => {
  const c = new CachedFigmaClient(
    new FixtureFigmaClient(fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url))),
    mkdtempSync(join(tmpdir(), 'uiv-c-')));
  await c.getNodes('F', '1:100', 'T1_0A_V1');
  await c.getNodes('F', '1:100', 'T1_0A_V1');
  expect(c.stats).toEqual({ networkCalls: 1, cacheHits: 1 });
  await c.getNodes('F', '1:100', 'V2');        // version 不同不串键
  expect(c.stats.networkCalls).toBe(2);
  const dir = mkdtempSync(join(tmpdir(), 'uiv-i-'));
  await pullBaseline(c, 'FKEY', '1:100', dir); // 预热(未钉,回填 version)
  const warm = c.stats.networkCalls;
  for (let i = 0; i < 3; i++) await pullBaseline(c, 'FKEY', '1:100', dir, 'T1_0A_V1');
  expect(c.stats.networkCalls).toBe(warm);     // 内循环 Figma 请求数=0
  expect(c.stats.cacheHits).toBe(4);
});
```

→ 红。绿改三处:① `client.ts` 接口行改 `getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown>;`;② `src/baseline/pull.ts`:`pullBaseline` 签名尾加 `version?: string`,取数行透传给 getNodes;③ 新建 `cache.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FigmaClient } from './client.js';

export class CachedFigmaClient implements FigmaClient {   // 口径 1
  readonly stats = { networkCalls: 0, cacheHits: 0 };
  constructor(private inner: FigmaClient, private dir: string) {}
  private file(k: string, n: string, v: string) {   // macOS 路径避 ':'
    return join(this.dir, `${k}__${n.replaceAll(':', '-')}@${v}.json`);
  }
  async getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown> {
    if (version !== undefined) {
      const p = this.file(fileKey, nodeId, version);
      if (existsSync(p)) { this.stats.cacheHits++; return JSON.parse(readFileSync(p, 'utf8')); }
    }
    this.stats.networkCalls++;
    const raw = await this.inner.getNodes(fileKey, nodeId, version);
    const v = version ?? (raw as { version?: string }).version;
    if (v) { mkdirSync(this.dir, { recursive: true }); writeFileSync(this.file(fileKey, nodeId, v), JSON.stringify(raw), 'utf8'); }
    return raw;
  }
  async getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>> {
    this.stats.networkCalls++;
    return this.inner.getImages(fileKey, nodeIds, scale);
  }
}
```

`echo ".uiv-cache/" >> .gitignore`;`npx vitest run packages/uiv-core` → 绿且存量不回归。commit(加 .gitignore)msg:`T2.4: 钉版本缓存+接口层请求计数(内循环零请求验收用例)`

#### Step 3:RestFigmaClient

新建 `rest.test.ts`:

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { QuotaBudgeter, QuotaExceededError } from './quota.js';
import { FigmaPatMissingError, RestFigmaClient, type FetchFn } from './rest.js';

function fakeFetch(body: unknown = {}) {
  const urls: string[] = []; let headers: Record<string, string> = {};
  const fn: FetchFn = async (u, i) => { urls.push(u); headers = i.headers; return { status: 200, json: async () => body }; };
  return { fn, urls, headers: () => headers };
}

afterEach(() => vi.unstubAllEnvs());
it('RestFigmaClient:URL/null 透传(C3)/env 兜底/PAT/预算接线', async () => {
  vi.stubEnv('FIGMA_PAT', 'ENV-PAT');
  const f = fakeFetch({ images: { '1:100': null } });
  const c = new RestFigmaClient({ fetchFn: f.fn });
  await c.getNodes('FKEY', '1:100', 'V9');
  expect(await c.getImages('FKEY', ['1:100', '1:101'], 2)).toEqual({ '1:100': null });
  expect(f.urls[0]).toBe('https://api.figma.com/v1/files/FKEY/nodes?ids=1%3A100&version=V9');
  expect(f.urls[1]).toContain('/v1/images/FKEY?ids=1%3A100%2C1%3A101&scale=2&format=png&use_absolute_bounds=true');
  expect(f.headers()).toEqual({ 'X-Figma-Token': 'ENV-PAT' });
  vi.stubEnv('FIGMA_PAT', '');
  expect(() => new RestFigmaClient({ fetchFn: f.fn })).toThrow(FigmaPatMissingError);
  const h = fakeFetch();
  const b = new RestFigmaClient({ pat: 'P', fetchFn: h.fn, budget: new QuotaBudgeter({ perMinute: 9, perDay: 1 }, () => 1e6) });
  await b.getNodes('F', '1:1');
  await expect(b.getNodes('F', '1:1')).rejects.toBeInstanceOf(QuotaExceededError);
  expect(h.urls).toHaveLength(1);   // 被拒不发请求
});
```

→ 红。新建 `rest.ts`:

```ts
import type { FigmaClient } from './client.js';
import { QuotaBudgeter } from './quota.js';

export class FigmaPatMissingError extends Error {}
export type FetchFn = (url: string, init: { headers: Record<string, string> }) => Promise<{ status: number; json(): Promise<unknown> }>;
const BASE = 'https://api.figma.com';

export class RestFigmaClient implements FigmaClient {
  private pat: string; private fetchFn: FetchFn; private budget: QuotaBudgeter;
  constructor(o: { pat?: string; fetchFn?: FetchFn; budget?: QuotaBudgeter } = {}) {
    this.pat = o.pat ?? process.env.FIGMA_PAT ?? '';
    if (!this.pat) throw new FigmaPatMissingError('FIGMA_PAT 未设置(B1)');
    this.fetchFn = o.fetchFn ?? (fetch as unknown as FetchFn);
    this.budget = o.budget ?? new QuotaBudgeter();
  }
  private async get(p: string): Promise<unknown> {
    await this.budget.acquire();
    const res = await this.fetchFn(BASE + p, { headers: { 'X-Figma-Token': this.pat } });
    if (res.status !== 200) throw new Error(`figma REST ${res.status}: GET ${p}`);
    return res.json();
  }
  getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown> {
    return this.get(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}${version ? `&version=${encodeURIComponent(version)}` : ''}`);
  }
  async getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>> {
    const raw = await this.get(`/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds.join(','))}&scale=${scale}&format=png&use_absolute_bounds=true`);
    return (raw as { images?: Record<string, string | null> }).images ?? {};
  }
}
```

→ 绿。commit msg:`T2.4: RestFigmaClient(mock 零真实请求,真实验证留 B1)`

#### Step 4:变量解析三级降级

新建 `variables.test.ts`(fixture 内联):

```ts
import { expect, it } from 'vitest';
import { StylesMappingResolver, TokensStudioJsonResolver, mcpVariableDefs, resolveVariable } from './variables.js';

const stylesRaw = { nodes: { '1:100': { document: { styles: { fill: 'S:a' },
  children: [{ styles: { fill: 'S:b' },
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 } }] }] },
  styles: { 'S:b': { name: 'color/swatch' } } } } };
const tokensJson = { global: { color: { accent: { value: '#FF9900' } } } };
const chain = (defs: Record<string, string> = {}) =>
  [mcpVariableDefs(defs), new StylesMappingResolver(stylesRaw), new TokensStudioJsonResolver(tokensJson)];

it('①级 MCP defs(agent 注入)命中即止', () => {
  const r = resolveVariable('color/swatch', chain({ 'color/swatch': '#112233' }));
  expect([r.value, r.source]).toEqual(['#112233', 'mcp-variable-defs']);
});
it('②级 styles 映射解出 hex(子树)', () => {
  const r = resolveVariable('color/swatch', chain());
  expect([r.value, r.source]).toEqual(['#FF9900', 'styles-mapping']);
});
it('③级 Tokens Studio:去 set 前缀+/.双键', () => {
  const r = resolveVariable('color/accent', chain());
  expect([r.value, r.source]).toEqual(['#FF9900', 'tokens-studio-json']);
});
it('全降级:token 名原样保留 + unresolved', () => {
  expect(resolveVariable('radius/card', chain()))
    .toEqual({ name: 'radius/card', value: null, source: 'unresolved', unresolved: true });
});
```

→ 红。新建 `variables.ts`(语义见口径 4):

```ts
export interface VariableResolver { readonly source: string; resolve(name: string): string | undefined }

export function resolveVariable(name: string, chain: VariableResolver[]): { name: string; value: string | null; source: string; unresolved: boolean } {
  for (const r of chain) {
    const value = r.resolve(name);
    if (value !== undefined) return { name, value, source: r.source, unresolved: false };
  }
  return { name, value: null, source: 'unresolved', unresolved: true };
}

export const mcpVariableDefs = (defs: Record<string, string>): VariableResolver =>
  ({ source: 'mcp-variable-defs', resolve: (n) => defs[n] });

type RGB = { r: number; g: number; b: number };
type RawN = { styles?: Record<string, string>; children?: RawN[]; fills?: Array<{ type?: string; color?: RGB }> };
const hex = (c: RGB) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase()).join('')}`;

export class StylesMappingResolver implements VariableResolver {
  readonly source = 'styles-mapping';
  private map = new Map<string, string>();
  constructor(raw: unknown) {
    const nodes = (raw as { nodes?: Record<string, { document?: RawN; styles?: Record<string, { name?: string }> }> }).nodes ?? {};
    for (const e of Object.values(nodes)) if (e.document) this.walk(e.document, e.styles ?? {});
  }
  private walk(n: RawN, table: Record<string, { name?: string }>): void {
    const name = n.styles?.fill ? table[n.styles.fill]?.name : undefined;
    const solid = n.fills?.find((f) => f.type === 'SOLID' && f.color);
    if (name && solid?.color) this.map.set(name, hex(solid.color));
    for (const c of n.children ?? []) this.walk(c, table);
  }
  resolve(n: string) { return this.map.get(n); }
}

export class TokensStudioJsonResolver implements VariableResolver {
  readonly source = 'tokens-studio-json';
  private map = new Map<string, string>();
  constructor(json: unknown) { this.flatten(json as Record<string, unknown>, []); }
  private flatten(node: Record<string, unknown>, path: string[]): void {
    if (node == null || typeof node !== 'object') return;
    const v = node.value;
    if (v !== undefined && typeof v !== 'object') {
      const put = (k: string) => { this.map.set(k, String(v)); this.map.set(k.replaceAll('.', '/'), String(v)); };
      put(path.join('.'));
      if (path.length > 1) put(path.slice(1).join('.'));   // 去 set 前缀别名
      return;
    }
    for (const [k, c] of Object.entries(node)) this.flatten(c as Record<string, unknown>, [...path, k]);
  }
  resolve(n: string) { return this.map.get(n); }
}
```

→ 绿。commit msg:`T2.4: 变量解析三级降级(MCP defs 注入→styles 映射→Tokens Studio JSON)`

#### Step 5:导出面 + 任务门

`src/index.ts` 追加四行 export(同 client.js 形式):`./figma/quota.js`、`cache.js`、`rest.js`、`variables.js`。

**任务门(可机判)**:① `npm test` exit 0(存量不回归,可断网复跑);② `npm run build` exit 0;③ 验收锚:cache.test【T2.4 验收】= 内循环零请求;variables.test = 降级解 token。

commit msg:`T2.4: figma 导出面收口`。主会话:meta.json 置 T2.4 `awaiting_review` 记 last_commit;pending_followups 含"PAT 到位后 REST 真实验证";交付口径 = fixture/mock 驱动完成,不得宣称 REST 闭环(Release Gate)。


---

# T2.5 — L2 降级匹配 + coverage 门禁 + 熔断 + missing 叶子过滤

> 上游:orchestration.md M2 表 T2.5 + 第 5 节审查建议①;设计文档第 4 节 + 2.4 节。TDD 每步红→绿→全量 `npm test`→commit(带 T2.5)。**现状(已核对源码,不重做)**:joinByTag/N 集/metrics 叶子口径/verdict 已有;runL2 已置 tag_coverage_low(cov<0.9,优先)与 matching_rate_low(mr<0.8)且 pass:false。**缺口=本章全部**:降级匹配、joinSource、熔断语义(现无熔断抑制与失败报告)、缺 tag 清单、coverage 阈值可配、missing 仅 comparable leaves+diagnostics。关键事实:tag 命中即配对 ⇒ mr≥cov,matching_rate_low 仅在调低 coverage 阈值后显形(⑤以 `untaggedCoverageThreshold: 0` 覆盖)。

## Step 1 降级算子(text+LCS)

`constants.ts` 末尾追加(注释注明工程钉值):`TEXT_SIM_MIN = 0.95`、`LCS_ALPHA = 10`、`LCS_TYPE_DISCOUNT = 0.5`、`LCS_SIM_MIN = 0.6`;`constants.test.ts` 补 import,加一用例断言四值。

红 `l2/fallback.test.ts`(目录均指 packages/uiv-core/src/),helper `const g = (kind: 'TEXT'|'OTHER', x, y, w, h): GeomLeaf => ({kind,x,y,w,h})`(参数均 number),三个 it:
- **相似度边界**:`textSimilarity('Calibration  Card', ' Calibration Card ')`→`toBe(1)`;`('  ', '')`→`toBe(1)`;`('a'.repeat(19)+'b', 'a'.repeat(20))`→`toBeCloseTo(0.95, 5)`;`('Hello', 'Goodbye!')`→`toBeLessThan(0.95)`。
- **LCS 公式**:`similarity(g('OTHER',12,60,80,40), 同参)`→`toBe(1)`;`similarity(g('TEXT',12,60,80,40), g('OTHER',12,60,80,40))`→`toBe(0.5)`;`similarity(g('OTHER',10,10,100,20), g('OTHER',12,12,100,20))`→`toBeGreaterThanOrEqual(0.6)`。
- **交换位与缺位**(预算:候选 sim≈0.092/0.417/0.464<0.6):`lcsAlign([g('TEXT',10,10,200,20), g('OTHER',10,40,80,40)], [g('OTHER',10,10,80,40), g('TEXT',10,40,200,20)])`→`toEqual([])`(互换不错配);`const f = [g('TEXT',0,0,100,20), g('OTHER',0,30,50,50), g('TEXT',0,90,100,20)]; lcsAlign(f, [f[0]!, f[2]!])`→`toEqual([[0, 0], [2, 1]])`。

绿 `similarity.ts`(公式写死,三 export):`normalizeText(s)` = `s.trim().replace(/\s+/g, ' ')`;`levenshtein(a, b)` = 标准两行滚动 DP 编辑距离;`textSimilarity(a, b)` = 归一化后全等(含双空)→ 1,否则 `1 - levenshtein(x, y) / Math.max(x.length, y.length)`。

绿 `lcs.ts`:
```ts
/** T2.5 降级 2:GUIPilot 式 LCS(第 4 节写死)。盲区:几何同构双胞胎互换不可检出,由 tag/text 层承担。 */
import { LCS_ALPHA, LCS_SIM_MIN, LCS_TYPE_DISCOUNT } from './constants.js';

export interface GeomLeaf { kind: 'TEXT' | 'OTHER'; x: number; y: number; w: number; h: number }
```

另 export 两个一行投影(import 相应 type):`figGeom(n: FigmaNode)` → `{kind: n.type==='TEXT'?'TEXT':'OTHER', x/y/w/h ← absoluteBoundingBox!(N 内非 null)}`;`semGeom(s: SemDp)` → `{kind: s.text!==null?'TEXT':'OTHER', x/y ← positionDp, w/h ← sizeDp}`。

```ts
/** sim=(simPos+IoU+simAR)/3,类型不同 ×δ;simPos=1/(1+L1/α),L1=|Δx|+|Δy|+|Δw|+|Δh|(dp)。 */
export function similarity(a: GeomLeaf, b: GeomLeaf): number {
  const l1 = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
  const simPos = 1 / (1 + l1 / LCS_ALPHA);
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  const iou = union <= 0 ? 0 : inter / union;
  const ra = a.h > 0 ? a.w / a.h : 0; const rb = b.h > 0 ? b.w / b.h : 0;
  const simAr = ra > 0 && rb > 0 ? Math.min(ra, rb) / Math.max(ra, rb) : 0;
  const s = (simPos + iou + simAr) / 3;
  return a.kind === b.kind ? s : s * LCS_TYPE_DISCOUNT;
}

/** 加权 LCS:dp[i][j]=max(跳过, sim≥LCS_SIM_MIN ? diag+sim : 弃);回溯输出升序 [figIdx,semIdx]。 */
export function lcsAlign(fig: GeomLeaf[], sem: GeomLeaf[]): Array<[number, number]> {
  const m = fig.length, n = sem.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const s = similarity(fig[i - 1]!, sem[j - 1]!);
    dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, s >= LCS_SIM_MIN ? dp[i - 1]![j - 1]! + s : -1);
  }
  const out: Array<[number, number]> = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    const s = similarity(fig[i - 1]!, sem[j - 1]!);
    if (s >= LCS_SIM_MIN && dp[i]![j]! === dp[i - 1]![j - 1]! + s) { out.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  return out.reverse();
}
```

全绿→commit `T2.5: 降级算子+常量`。

## Step 2 三级匹配编排

`join.ts`:`function toDp` 前加 `export`(仅此,行为不变)。红:新建 `l2/t25.test.ts`。**builder 规格(文件顶部,Step 4 复用;px=dp×2,根 (0,0) 免 rebase)**:`fig(id,name,type,x,y,w,h,extra: Partial<FigmaNode> = {})` → `{id,name,type,absoluteBoundingBox:{x,y,width:w,height:h},...extra}`;`sem(tag,text,x,y,w,h,fontSizeSp=null)` → SemNode(`testTag: tag`,positionInRoot/size/touchBoundsInRoot 全 ×2,touchBounds=位置至位置+尺寸,colorHex/cornerRadiusPx null,children `[]`);`root(kids)` = `fig('1:100','Card','FRAME',0,0,360,200,{children:kids})`;`dump(kids)` = `{density:2,root:{...sem('fig:1:100',null,0,0,360,200),children:kids}}`。用例:

describe「编排直测」单 it:`const r = root([fig('1:101','T1','TEXT',12,12,200,20,{characters:'Cal Card'}), fig('2:1','C','FRAME',0,100,100,100,{children:[fig('2:2','L','RECTANGLE',5,105,20,20)]})])`;`const m = matchThreeTier(r, dump([sem('fig:9:9','Cal  Card ',12,12,200,20), sem('fig:2:2',null,5,105,20,20), sem(null,null,300,180,9,9)]), comparableNodes(r,[]))`。断言:`m.pairs.find((p)=>p.figma.id==='1:101')?.joinSource`→`toBe('text')`(归一化命中);`m.extra`→`toEqual([])`(fig:9:9 被降级消费);`m.missingLeaves`→`toEqual([])`;`m.containerMissing.map((n) => n.id)`→`toEqual(['2:1'])`;`m.unmatchedSem`→`toHaveLength(1)`。

绿 `match.ts`:
```ts
/** T2.5 三级编排(第 4 节):tag→text(仅 TEXT)→LCS;容器只走 tag(padding 断言不受影响),降级只补配 N 中叶子。 */
import { TEXT_SIM_MIN } from './constants.js';
import { joinByTag, toDp } from './join.js';
import { figGeom, lcsAlign, semGeom } from './lcs.js';
import { textSimilarity } from './similarity.js';
import type { FigmaNode, Pair, SemDp, SemNode, SemanticsDump } from './types.js';

export type JoinSource = 'tag' | 'text' | 'lcs';
export interface MatchedPair extends Pair { joinSource: JoinSource }
export interface MatchResult { // missingLeaves=N 内未配叶;containerMissing→diagnostics;extra=多余 tag(降级消费的除外)
  pairs: MatchedPair[]; missingLeaves: FigmaNode[]; containerMissing: FigmaNode[];
  extra: string[]; semLeavesDp: SemDp[]; unmatchedSem: SemDp[];
}

const flat = (n: SemNode): SemNode[] => (n.children.length === 0 ? [n] : n.children.flatMap(flat));

export function matchThreeTier(rebased: FigmaNode, dump: SemanticsDump, N: FigmaNode[]): MatchResult {
  const joined = joinByTag(rebased, dump);
  const pairs: MatchedPair[] = joined.pairs.map((p) => ({ ...p, joinSource: 'tag' as const }));
  const pairedIds = new Set(joined.pairs.map((p) => p.figma.id));
  const consumedTags = new Set(joined.pairs.map((p) => `fig:${p.figma.id}`));

  const semLeavesDp = flat(dump.root).map((s) => toDp(s, dump.density))
    .sort((a, b) => a.positionDp.y - b.positionDp.y || a.positionDp.x - b.positionDp.x);
  const rest = semLeavesDp.filter((s) => s.testTag === null || !consumedTags.has(s.testTag));
  const used = new Set<SemDp>();
  const figRest = N.filter((n) => !pairedIds.has(n.id)).sort((a, b) =>   // N 保证 bbox 非 null
    a.absoluteBoundingBox!.y - b.absoluteBoundingBox!.y || a.absoluteBoundingBox!.x - b.absoluteBoundingBox!.x);

  // 降级 1:fig 按 (y,x) 序贪心取最高分 ≥TEXT_SIM_MIN,平分取语义序靠前者(确定性)。
  for (const f of figRest) {
    if (f.type !== 'TEXT' || f.characters === undefined) continue;
    let best: SemDp | null = null; let bestSim = 0;
    for (const s of rest) {
      if (used.has(s) || s.text === null) continue;
      const sim = textSimilarity(f.characters, s.text);
      if (sim >= TEXT_SIM_MIN && sim > bestSim) { best = s; bestSim = sim; }
    }
    if (best !== null) { used.add(best); pairedIds.add(f.id); pairs.push({ figma: f, sem: best, joinSource: 'text' }); }
  }

  // 降级 2:LCS 全局对齐(两侧均已 (y,x) 偏序)。
  const figLcs = figRest.filter((f) => !pairedIds.has(f.id)), semLcs = rest.filter((s) => !used.has(s));
  for (const [fi, si] of lcsAlign(figLcs.map(figGeom), semLcs.map(semGeom))) {
    used.add(semLcs[si]!); pairedIds.add(figLcs[fi]!.id);
    pairs.push({ figma: figLcs[fi]!, sem: semLcs[si]!, joinSource: 'lcs' });
  }

  const fallbackTags = new Set([...used].map((s) => s.testTag).filter((t): t is string => t !== null));
  return {
    pairs,
    missingLeaves: N.filter((n) => !pairedIds.has(n.id)),
    containerMissing: joined.missing.filter((n) => (n.children ?? []).length > 0),
    extra: joined.extra.filter((t) => !fallbackTags.has(t)),
    semLeavesDp,
    unmatchedSem: rest.filter((s) => !used.has(s)),
  };
}
```

`src/index.ts` 枚举区补三行 export(similarity/lcs/match)。全绿→commit `T2.5: 三级匹配编排(joinSource)`。

## Step 3 report v1 + runL2 接线

红:先落 schema 与存量修正,fail 符合预期再实现。

`report/v1.ts`:StructuralV1 原六字段不动,新增:

```ts
export interface MatchFailureV1 {
  figmaLeaves: string[]; semLeaves: string[];
  unmatchedFigma: Array<{ figmaId: string; name: string }>; unmatchedSem: string[];
}
// StructuralV1 新增:
  matchedNodes: Array<{ figmaId: string; name: string; joinSource: 'tag' | 'text' | 'lcs' }>;
  untagged: Array<{ figmaId: string; name: string; suggestedTag: string }>;
  diagnostics: { containerMissing: Array<{ figmaId: string; name: string }> };
  matchFailure: MatchFailureV1 | null;
```

校验器同步(沿既有 fail/数组检查风格):`checkStructural` 数组键集改 `['missing','extra','violations','matchedNodes','untagged']`;追加:`diagnostics.containerMissing` 非数组即 fail;`matchFailure` 非 null 时四字段逐一非数组即 fail。`validateReportV1` 组合约束区追加(仅 structural 非 null):matching_rate_low ⇒ matchFailure 非 null 且 violations 空,否则 fail;tag_coverage_low ⇒ untagged 非空,否则 fail。

`l2/report.ts`(其余行不动):import 去 `joinByTag` 换 `matchThreeTier`(+type `MatchResult`、`SemDp`);`RunL2Opts` 加 `untaggedCoverageThreshold?: number;`;runL2 内 `prevState` 行后加 `const covThreshold = opts.untaggedCoverageThreshold ?? UNTAGGED_COVERAGE_THRESHOLD;`,try 内改 `m = matchThreeTier(rebased, dump, N)`(catch 不变),mr 的 pairedIds 改自 `m.pairs`。模块级加四个一行格式器:`idName(n)` → `{ figmaId: n.id, name: n.name }`;`bounds4(b)` → null 或 `[b.x, b.y, b.width, b.height]`;`figLine(n)` → `` `${n.id} ${n.name} ${n.type} (${x},${y} ${w}x${h})` ``(bbox null → `-`);`semLine(s)` → `` `${s.testTag ?? '-'} ${s.text ?? '-'} (${x},${y} ${w}x${h})dp` ``(取 positionDp/sizeDp)。组装:原断言循环仅改 `joined.pairs`→`m.pairs` 并包进 `if (!fused) { … }`;其前加 `const fused = mr < MATCH_RATE_FUSE;`(熔断=不执行断言、不输出 violations,即"不强行断言");score 行改 `const sc = fused ? 0 : score(violations, executed);`;structural 与 subReason 替换为:

```ts
  const structural: StructuralV1 = {
    matched: m.pairs.length, untaggedCoverage: cov, matchRate: mr,
    matchedNodes: m.pairs.map((p) => ({ ...idName(p.figma), joinSource: p.joinSource })),
    untagged: N.filter((n) => !dumpTags.has(`fig:${n.id}`)).map((n) => ({ ...idName(n), suggestedTag: `fig:${n.id}` })),
    missing: m.missingLeaves.map((n) => ({ ...idName(n), expectedBounds: bounds4(n.absoluteBoundingBox) })),
    diagnostics: { containerMissing: m.containerMissing.map(idName) },
    matchFailure: fused ? {
      figmaLeaves: N.slice(0, 50).map(figLine), semLeaves: m.semLeavesDp.slice(0, 50).map(semLine),
      unmatchedFigma: m.missingLeaves.map(idName), unmatchedSem: m.unmatchedSem.slice(0, 50).map(semLine),
    } : null,
    extra: m.extra, violations,
  };

  let subReason: SubReason | null = null;   // coverage 优先;熔断行为与该优先级无关
  if (cov < covThreshold) subReason = 'tag_coverage_low';
  else if (fused) subReason = 'matching_rate_low';
```

`check/runL2.ts`:`RunCheckL2Opts` 加同名可选项,l2Opts 组装处 `if (opts.untaggedCoverageThreshold !== undefined)` 同名透传;`l2/metrics.ts` 头注释"v0 仅 tag 策略"改"三级匹配后配对率"。

**存量修正**(仅此三处;check/runL2.test.ts 不受影响):
1. `report/v1.test.ts`:两处 structural 字面量补 `matchedNodes:[],untagged:[],diagnostics:{containerMissing:[]},matchFailure:null`;tag_coverage_low 用例 untagged 改 `[{figmaId:'1:104',name:'CalibBadge',suggestedTag:'fig:1:104'}]`;加两负例:matching_rate_low+matchFailure:null → throw `/matchFailure/`;tag_coverage_low+untagged:[] → throw `/untagged/`。
2. `l2/report.test.ts` 端到端 4 类用例:badge 缺失致 mr=0.75<0.8 触熔断吞 violations——仅该用例内(不动共享 calibSpec)加第 5 叶子使 mr=0.8:spec push `{id:'1:105',name:'CalibFooter',type:'RECTANGLE',absoluteBoundingBox:{x:112,y:260,width:120,height:16}}`,bad dump push `sem('fig:1:105',24,320,240,32)`;断言 untaggedCoverage 0.75→0.8,其余不变。
3. `l2/report.test.ts` 反例用例:swatch/badge 被 LCS 补配(TEXT 叶 sem 无文本、类型折 0.5<0.6 不配)→ matchRate 断言 0→0.5;subReason 收紧 `'tag_coverage_low'`;追加 violations `toEqual([])`、matchFailure `not.toBeNull()`(mr=0.5 熔断)。

全绿→commit `T2.5: 熔断/缺tag清单/diagnostics/阈值可配+report v1`。

## Step 4 验收五类+回归

红→绿:`l2/t25.test.ts` 追加(import 补 `runL2`、`validateReportV1`):

```ts
const SPEC = () => root([
  fig('1:101', 'T1', 'TEXT', 12, 12, 200, 20, { characters: 'Ca' }),
  fig('1:102', 'T2', 'TEXT', 12, 36, 200, 16, { characters: 'Gk' }),
  fig('1:103', 'R1', 'RECTANGLE', 12, 60, 80, 40),
  fig('1:104', 'R2', 'RECTANGLE', 296, 12, 52, 20),
  fig('1:105', 'R3', 'RECTANGLE', 12, 160, 120, 16),
]);
const good = () => dump([
  sem('fig:1:101', 'Ca', 12, 12, 200, 20),
  sem('fig:1:102', 'Gk', 12, 36, 200, 16),
  sem('fig:1:103', null, 12, 60, 80, 40),
  sem('fig:1:104', null, 296, 12, 52, 20),
  sem('fig:1:105', null, 12, 160, 120, 16),
]);

```

describe「T2.5 验收五类」五个 it 逐条落码(除注明外 r = `runL2(SPEC(), d, {})`):
- **③交换位:不错配→双入 missing,不得 pass**:`const s2 = root([fig('2:1','T','TEXT',10,10,200,20,{characters:'X'}), fig('2:2','B','RECTANGLE',10,40,80,40)]); const r = runL2(s2, dump([sem(null,'Zw',10,40,200,20), sem(null,null,10,10,80,40)]), {});` → `r.structural?.missing.map((x)=>x.figmaId).sort()` `toEqual(['2:1','2:2'])`;`r.pass` `toBe(false)`。
- **①文本命中+缺 tag 清单+合同可配**:`const d = good(); d.root.children[0]!.testTag = null;` → `r.structural?.matchedNodes` `toContainEqual({figmaId:'1:101',name:'T1',joinSource:'text'})`;`r.subReason` `toBe('tag_coverage_low')`(cov=0.8,mr=1);`r.structural?.untagged` `toEqual([{figmaId:'1:101',name:'T1',suggestedTag:'fig:1:101'}])`;`r.pass` `toBe(false)`;`runL2(SPEC(), d, {untaggedCoverageThreshold:0.8}).pass` `toBe(true)`。
- **②文本也缺走 LCS**:`const d = good(); d.root.children[2]!.testTag = null;` → `r.structural?.matchedNodes` `toContainEqual({figmaId:'1:103',name:'R1',joinSource:'lcs'})`。
- **④缺失组件**:`const d = good(); d.root.children.splice(3, 1);`(Badge 整节点缺)→ `r.structural?.missing.map((x)=>x.figmaId)` `toEqual(['1:104'])`;`r.structural?.matchFailure` `toBeNull()`(mr=0.8 不熔断);`r.pass` `toBe(false)`(cov=0.8)。
- **⑤低覆盖低匹配率不得 pass**:`const d = dump([sem(null,'AAAA',200,300,10,10), sem(null,null,250,350,30,5)]);` → `r.pass` `toBe(false)`;`r.subReason` `toBe('tag_coverage_low')`(cov=0 优先);`r.structural?.violations` `toEqual([])`;`r.structural?.matchFailure?.unmatchedFigma` `toHaveLength(5)`;再取 `const r2 = runL2(SPEC(), d, {untaggedCoverageThreshold:0})`→ `r2.subReason` `toBe('matching_rate_low')`;`r2.pass` `toBe(false)`;`() => validateReportV1(r2)` `not.toThrow()`。

验收:`npm test`(158+新增≈10)与 `npm run build` 均 exit 0,无 skip。commit `T2.5: 验收五类端到端用例`。

## Codex 审查点

1. `LCS_SIM_MIN=0.6`、合成式 `(simPos+IoU+simAR)/3`、`simPos=1/(1+L1/α)` 为工程钉值(文档只钉 α/δ 与五要素);交换位/小偏移用例是行为锚。语义树无绘制类型,类型一致性仅判 TEXT/非 TEXT。
2. missing 叶子不生成 GVT"缺失"类 violation(沿 M1 语义由 coverage 门禁承载),合同调低阈值时有漏检窗口——是否补 `missing→violation(high)` 提请 Codex 决断(不顺手做)。


---

### Task T2.7 — 像素采样颜色断言(D-04:非文本节点颜色检出)

**依据**:编排计划 §5 D-04 + 设计文档 2.4。语义树无绘制信息,`colorHex` 仅文本节点非 null,纯色块颜色此前按"值不可得"跳过(D3 暂测 subtitle)。本章:非文本节点按 semantics bounds 在 rendered.png **内部安全区**取中位色,与 spec fills 做 ΔE00 比对,证据来自渲染真值。**自声明语义属性方案已否决为反模式**(被验代码自声明 = reward hacking),禁止实现。
**前置**:M1 全 done(rendered.png 720×400 @2x;semantics 含 px bounds;CIEDE2000 已在 `l2/color.ts`)。

#### 口径钉死

- **采样区域**:节点 px bounds(`positionDp/sizeDp × density`;rebase 后同以根为原点,与 rendered.png 对齐)各边内缩 `insetRatio`(默认 0.2 防圆角/边框/抗锯齿;代码级可配,不加 CLI 旗标)后 clamp 到 PNG 边界;交集空 → null。颜色 = RGB 通道独立中位(偶数取下中位),抗少量污染,不用均值。
- **通道分流**:文本节点(colorHex≠null)恒走语义通道 `judgePath:'parity'`;非文本**叶子**(colorHex=null 且 children 空)且 spec 首 fill 为 SOLID → 像素通道,violation `judgePath:'parity-pixel-sampled'`、`property:'color'`、high、容差同 `TOL_DELTA_E`、hint 模板不变;fill 非纯色或容器(子像素污染)→ 跳过并记 `structural.diagnostics`;无 pixelSource → 通道不执行(值不可得)。executed 仅在真正采样比对时 +1。
- **防 hacking 信任链(D-04 核心)**:采样输入是 harness 同轮 gradle 渲染产物 rendered.png,修正者无写权限:(a) gitGuard 白名单仅 `CalibCard.kt`,修正者改 sampler/L2/harness → exit 30;(b) `.ui-verify/` 不受 gitGuard 覆盖(gitignore),但每轮 check 重渲染**覆盖写** rendered.png 后立即采样,预改必被覆盖;(c) 修正循环开跑前 `--inject && --verify-detection` 全过是硬门,exit 31 归工具链缺口,不进修正回路(D-04 ④)。

#### Step 1 — 采样器(红→绿→commit)

`npm i -w packages/uiv-core pngjs@^7.0.0`(运行时依赖)。新建 `packages/uiv-core/src/l2/sampler.test.ts`(全文):

```ts
import { describe, it, expect } from 'vitest';
import { samplePixelColor } from './sampler.js';

function mkPng(w: number, h: number, at: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = at(x, y); const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('samplePixelColor:内缩安全区中位色', () => {
  it('纯色区命中;inset 默认 0.2(50×50→30×30)可配', () => {
    const png = mkPng(100, 100, () => [0x33, 0x66, 0x99]);
    expect(samplePixelColor(png, B(10, 10, 50, 50))).toEqual({ hex: '#336699', sampledPixels: 900 });
    expect(samplePixelColor(png, B(10, 10, 50, 50), { insetRatio: 0.4 })?.sampledPixels).toBe(100);
  });
  it('红边框被内缩排除采到内部绿;渐变取中位可复现', () => {
    const bordered = mkPng(40, 40, (x, y) => (x < 4 || y < 4 || x >= 36 || y >= 36 ? [255, 0, 0] : [0, 255, 0]));
    expect(samplePixelColor(bordered, B(0, 0, 40, 40))?.hex).toBe('#00FF00');
    const grad = mkPng(100, 20, (x) => [x, 0, 0]);
    expect(samplePixelColor(grad, B(0, 0, 100, 20))?.hex).toBe('#310000'); // x∈[20,80) 下中位 r=49
  });
  it('越界防御:全越界→null;部分越界 clamp 采样', () => {
    const png = mkPng(100, 100, () => [10, 20, 30]);
    expect(samplePixelColor(png, B(90, 90, 50, 50))).toBeNull();
    expect(samplePixelColor(png, B(-20, -20, 60, 60))?.hex).toBe('#0A141E');
  });
});
```

红后新建同目录 `sampler.ts`(全文):

```ts
/** T2.7(D-04):boundsPx 各边内缩 insetRatio 后与 PNG 交集,取 RGB 通道中位(偶数取下中位);null=交集空。 */
import type { Box } from './types.js';

export const DEFAULT_INSET_RATIO = 0.2;
export interface DecodedPng { width: number; height: number; data: Uint8Array }

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[(values.length - 1) >> 1] as number;
}

export function samplePixelColor(
  png: DecodedPng, boundsPx: Box, options?: { insetRatio?: number },
): { hex: string; sampledPixels: number } | null {
  const inset = options?.insetRatio ?? DEFAULT_INSET_RATIO;
  const x0 = Math.max(0, Math.round(boundsPx.x + boundsPx.width * inset));
  const y0 = Math.max(0, Math.round(boundsPx.y + boundsPx.height * inset));
  const x1 = Math.min(png.width, Math.round(boundsPx.x + boundsPx.width * (1 - inset)));
  const y1 = Math.min(png.height, Math.round(boundsPx.y + boundsPx.height * (1 - inset)));
  if (x1 <= x0 || y1 <= y0) return null;
  const rs: number[] = []; const gs: number[] = []; const bs: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4;
    rs.push(png.data[i] as number); gs.push(png.data[i + 1] as number); bs.push(png.data[i + 2] as number);
  }
  const h = (v: number): string => v.toString(16).padStart(2, '0').toUpperCase();
  return { hex: `#${h(median(rs))}${h(median(gs))}${h(median(bs))}`, sampledPixels: rs.length };
}
```

绿 → `git commit -m "T2.7 step1: samplePixelColor + pngjs deps"`。

#### Step 2 — assert.ts 像素通道(红→绿→commit)

`types.ts`:`Violation.judgePath` 改为 `'parity' | 'parity-pixel-sampled'`,末尾追加:

```ts
/** T2.7 像素通道跳过记录。 */
export interface PixelDiagnostic {
  code: 'pixel_sample_skipped_nonsolid' | 'pixel_sample_skipped_container' | 'pixel_sample_empty_region';
  testTag: string; detail: string;
}
```

`assert.test.ts` 追加(import 补 type `PixelSampleCtx`):

```ts
describe('assertPair 像素采样颜色通道(T2.7)', () => {
  const px = (r: number, g: number, b: number): PixelSampleCtx => ({
    png: { width: 4, height: 4, data: Uint8Array.from({ length: 64 }, (_, i) => [r, g, b, 255][i % 4] as number) },
    density: 2,
  });
  const fig = { absoluteBoundingBox: { x: 0, y: 0, width: 2, height: 2 },   // spec #FF9900
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0, a: 1 } }] };
  const sem = { sizeDp: { width: 2, height: 2 } };   // dp×2 = px(0,0,4,4)

  it('非文本叶子:偏色→parity-pixel-sampled;同色不违规计 executed;无 ctx 不执行', () => {
    const bad = assertPair(mkPair(fig, sem), px(0xff, 0x66, 0x00));
    expect(bad.violations).toContainEqual(expect.objectContaining({
      judgePath: 'parity-pixel-sampled', property: 'color',
      expected: '#FF9900', actual: '#FF6600' }));
    const ok = assertPair(mkPair(fig, sem), px(0xff, 0x99, 0x00));
    expect(has(ok, 'color', 'high')).toBe(false);
    expect(ok.executed).toBe(3);                            // position+size+color
    expect(assertPair(mkPair(fig, sem)).executed).toBe(2);  // 无 ctx 跳过
  });
  it('跳过三态记 diagnostics 不计 executed:非纯色/容器/完全越界', () => {
    const cases: Array<[string, Pair]> = [
      ['pixel_sample_skipped_nonsolid', mkPair({ ...fig, fills: [{ type: 'GRADIENT_LINEAR' }] }, sem)],
      ['pixel_sample_skipped_container', mkPair(fig, { ...sem, children: [mkPair({}, {}).sem] })],
      ['pixel_sample_empty_region', mkPair(fig, { ...sem, positionDp: { x: 99, y: 99 } })],
    ];
    for (const [code, pair] of cases) {
      const r = assertPair(pair, px(1, 2, 3));
      expect(r.diagnostics).toContainEqual(expect.objectContaining({ code }));
      expect(r.executed).toBe(2);
    }
  });
  it('文本节点恒走语义通道(subtitle 语义色检出保留)', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.878, b: 1, a: 1 } }] },  // #CCE0FF
      { colorHex: '#99B3E6' }), px(0x99, 0xb3, 0xe6));
    expect(r.violations).toContainEqual(expect.objectContaining({ judgePath: 'parity', property: 'color' }));
  });
});
```

红后改 `assert.ts`:imports 补 sampler 的 `DEFAULT_INSET_RATIO`/`samplePixelColor`/`DecodedPng` 与 types 的 `PixelDiagnostic`;签名改

```ts
export interface PixelSampleCtx { png: DecodedPng; density: number; insetRatio?: number }

export function assertPair(
  p: Pair, pixel?: PixelSampleCtx,
): { violations: Violation[]; executed: number; diagnostics: PixelDiagnostic[] } {
```

`let executed = 0;` 后追加 `const diagnostics: PixelDiagnostic[] = [];`;原 `// color(CIEDE2000 ΔE<3)` 整块替换为:

```ts
  // color:文本节点语义通道;非文本叶子像素通道(T2.7);其余值不可得跳过
  const firstFill = p.figma.fills?.[0];
  if (firstFill?.color !== undefined && sem.colorHex !== null) {
    executed++;
    const figHex = rgbToHex(firstFill.color);
    if (ciede2000(figHex, sem.colorHex) >= TOL_DELTA_E) add('color', figHex, sem.colorHex, 'high');
  } else if (sem.colorHex === null && (p.figma.fills?.length ?? 0) > 0 && pixel !== undefined) {
    const skip = (code: PixelDiagnostic['code'], detail: string) =>
      diagnostics.push({ code, testTag, detail });
    if (firstFill?.type !== 'SOLID' || firstFill.color === undefined) {
      skip('pixel_sample_skipped_nonsolid', `首 fill ${firstFill?.type ?? '?'} 非纯色`);
    } else if (sem.children.length > 0) {
      skip('pixel_sample_skipped_container', '容器子像素污染');
    } else {
      const d = pixel.density;
      const sampled = samplePixelColor(pixel.png,
        { x: sem.positionDp.x * d, y: sem.positionDp.y * d, width: sem.sizeDp.width * d, height: sem.sizeDp.height * d },
        { insetRatio: pixel.insetRatio ?? DEFAULT_INSET_RATIO });
      if (sampled === null) skip('pixel_sample_empty_region', '采样区为空(越界)');
      else {
        executed++;
        const figHex = rgbToHex(firstFill.color);
        if (ciede2000(figHex, sampled.hex) >= TOL_DELTA_E) {
          violations.push({ judgePath: 'parity-pixel-sampled', testTag, figmaName,
            property: 'color', expected: figHex, actual: sampled.hex, severity: 'high', hint: '' });
        }
      }
    }
  }
```

return 改 `return { violations, executed, diagnostics };`。绿 → `git commit -m "T2.7 step2: assertPair 像素通道"`。

#### Step 3 — runL2/report v1/runCheckL2 贯通(commit)

行为红绿由 Step 5 承担:贯通前 D3 必 miss(`--verify-detection` 3/4 exit 31 = 红),贯通后 4/4;本步过门 = build + `npm test` 全绿。改动:

- `report/v1.ts`:`StructuralV1` 追加 `diagnostics?: PixelDiagnostic[];`(补 type import);`checkStructural` 追加 ``if (s['diagnostics'] !== undefined && !Array.isArray(s['diagnostics'])) fail(`${path}.diagnostics`, 'array | undefined', s['diagnostics']);``。
- `l2/report.ts`:`RunL2Opts` 追加 `pixelSource?: { png: DecodedPng };`(不透传 insetRatio,YAGNI;补相应 type imports);断言循环前插入下方 pixelCtx 构造与 `const diagnostics: PixelDiagnostic[] = [];`,循环内 `assertPair(pair)` 改 `assertPair(pair, pixelCtx)` 并追加一行 `for (const d of r.diagnostics) diagnostics.push(d);`,`structural` 字面量 `violations,` 后追加 `diagnostics,`:

```ts
  const pixelCtx: PixelSampleCtx | undefined = opts.pixelSource === undefined
    ? undefined : { png: opts.pixelSource.png, density: dump.density };
```

- `check/runL2.ts`:import 追加 `import { PNG } from 'pngjs';`;在 `const l2Opts ... = { prevState };` 之后、`runL2(...)` 之前插入(PNG 实例结构兼容 DecodedPng):

```ts
  // T2.7:同轮渲染的 rendered.png 喂像素通道;不可读则跳过
  const renderPath = v0.report.artifacts.render;
  if (renderPath !== null) {
    try {
      const png = PNG.sync.read(readFileSync(renderPath));
      l2Opts.pixelSource = { png };
    } catch { /* 像素通道跳过 */ }
  }
```

`npm test` 全绿(既有 runCheckL2 用例 8×8 假 PNG 采样越界只落 diagnostics,断言不变)→ `git commit -m "T2.7 step3: pixelSource 贯通"`。

#### Step 4 — harness D3 回归 CalibSwatch(红→绿→commit,D-04 ③)

红:改 `scripts/phase0-lib.test.mjs` —— ① `expect(out).toContain('Color(0xFF99B3E6)'); // D3` 改为两行 `expect(out).toContain('Color(0xFFFF6600)'); // D3` 与 `expect(out).toContain('Color(0xFFCCE0FF)'); // subtitle 不再写偏`;② 检出门 fixture 中 `{ property: 'color', testTag: 'fig:1:102' }` 改 `'fig:1:103'`;③ 其余 `fig:1:102` 字面量全替换为 1:103 版,收尾 grep '1:102' 零命中。
绿:`scripts/phase0-lib.mjs` `DEVIATION_SUBS` 第 3 项替换为

```js
  { re: /Color\(0xFFFF9900\)/g, to: 'Color(0xFFFF6600)', name: 'D3 CalibSwatch 填充色(color,像素采样通道)' },
```

`assertSeededDetection` D3 行改 `if (!hit(['color', 'fill'], 'fig:1:103')) misses.push('D3 color@fig:1:103');`;`scripts/phase0-config.json` `deviations[2]` 改为 `"D3 CalibSwatch 填充色:#FF6600(应为 #FF9900)→ color 断言(像素采样通道 ΔE00<3,judgePath=parity-pixel-sampled)"`(实测 ΔE00=15.9 ≫ 3,可稳定检出)。
`npx vitest run scripts/phase0-lib.test.mjs` 绿 → `git commit -m "T2.7 step4: D3 回归 CalibSwatch"`。

#### Step 5 — 端到端回归复验(代码全部 commit 后)

顺序关键:`--inject` 重写已入库的 `scripts/fixtures` 快照,先提交再跑 `--verify-detection`,否则 gitGuard exit 30。

```bash
npm run build && npm test
node scripts/phase0-acceptance.mjs --inject            # 写偏 D3=swatch #FF6600
git add scripts/fixtures && git commit -m "T2.7 step5a: 快照重录 D3=swatch"
node scripts/phase0-acceptance.mjs --verify-detection  # 4/4 硬门
node -e "const r=require('./.ui-verify/phase0/verify-detection-report.json');const d=(r.structural?.violations??[]).find(v=>v.testTag==='fig:1:103'&&v.property==='color');if(d?.judgePath!=='parity-pixel-sampled')throw new Error('D3 非像素通道');console.log('D3:',d.expected,'->',d.actual)"
cp scripts/fixtures/CalibCard.original.kt demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt
node packages/uiv-cli/dist/index.js check --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android
node -e "const r=require('./.ui-verify/reports/1-100@T1_0A_V1/report.json');const cd=(r.structural?.diagnostics??[]).some(d=>d.code==='pixel_sample_skipped_container'&&d.testTag==='fig:1:100');if(r.pass!==true||!cd)throw new Error('正确态误报或容器 diagnostics 缺失');console.log('零假阳性 pass:true + 容器跳过已记录')"
```

预期:`hit:4/4`;正确态 swatch/badge ΔE=0 不误报,根容器落 diagnostics;`git status --porcelain` 为空。

#### 验收清单(全部可机判)

| # | 命令 | 判据 |
|---|------|------|
| 1 | `npm test` | exit 0(采样器/assert 通道/harness 回归,含 subtitle 语义通道用例) |
| 2 | inject 后 `--verify-detection` | exit 0,stdout 含 `"hit":4` |
| 3 | Step 5 两段 `node -e` | D3 走像素通道;正确态 `pass:true` + 容器跳过落 diagnostics |

meta.json 由主会话更新,本子计划不写。

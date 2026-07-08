package com.magpie.uiv.fastlane

import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsOwner
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.text.TextLayoutResult
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.PaparazziSdk
import app.cash.paparazzi.detectEnvironment
import com.android.ide.common.rendering.api.SessionParams
import com.android.resources.Density
import com.android.resources.ScreenOrientation
import com.magpie.uiv.demo.CalibCardPreview
import java.io.File
import javax.imageio.ImageIO

/**
 * T2.8:快车道常驻渲染 worker(产品化)。
 * 来源:experiments/fastlane-spike/coexist-probe/.../RenderWorker.kt(T2.3 spike,JUnit-free 候选 1);
 * 产品化改造:①dumpSemantics 升级为慢车道 SemanticsDumpRule 同格式的完整 SemanticsDump
 * (density + positionInRoot/size/touchBoundsInRoot/colorHex/fontSizeSp/cornerRadiusPx),使 fast/slow L2 等价;
 * ②render 指令对 previewFqn 做白名单门(仅 CalibCardPreview 可判定,其余回 error → CLI 回落慢车道)。
 *
 * 安全前置(Codex D-05):纯 stdin/stdout,零网络监听面;由 daemon 托管为子进程。
 *   stdin:  `render <PreviewFqn> <outPng>` | `semantics <PreviewFqn> <outSemanticsJson>` | `quit`
 *   stdout: 每轮一行 JSON {"event":"rendered"|"semantics"|"error",…}
 *   stderr: 就绪/退出事件(含一次性 setup 耗时 = 冷启动记录项)
 *
 * 渲染目标 Phase 0 钉死 CalibCardPreview(preview 发现机制属后续里程碑);deviceConfig 钉
 * 720x400px @ density 2.0(XHIGH),对齐慢车道 Roborazzi golden。
 */
private const val KNOWN_FQN = "com.magpie.uiv.demo.CalibCardPreview"

// density 从钉死的 deviceConfig 派生(XHIGH=320dpi → 2.0),与慢车道 rule.density.density 一致;
// 不用 sdk.context(它在 onNewFrame 回调所在的 sdk 初始化器内不可前向引用)。
private val DENSITY = Density.XHIGH.dpiValue / 160f

private val deviceConfig = DeviceConfig(
    screenHeight = 400,
    screenWidth = 720,
    xdpi = 320,
    ydpi = 320,
    orientation = ScreenOrientation.LANDSCAPE, // 默认 PORTRAIT 会把 720x400 归一成 400x720(spike S3 实证)
    density = Density.XHIGH,
    softButtons = false,
)

/** 反射取 AndroidComposeView.semanticsOwner(internal → getter 带 $ui_release 后缀)。 */
private fun findAndroidComposeView(v: View): View? {
    if (v.javaClass.name == "androidx.compose.ui.platform.AndroidComposeView") return v
    if (v is ViewGroup) for (i in 0 until v.childCount) findAndroidComposeView(v.getChildAt(i))?.let { return it }
    return null
}

/**
 * 语义树导出(格式逐字段对齐慢车道 demo-android/.../SemanticsDumpRule.kt):
 * 坐标取 positionInRoot + size(unclipped px),touchBoundsInRoot 一并导出;
 * colorHex/fontSizeSp 经 SemanticsActions.GetTextLayoutResult 取 TextLayoutResult.style;
 * cornerRadiusPx 恒 null(语义树不可得);px→dp 换算由 uiv-core L2 侧统一 ÷density 完成。
 */
private fun dumpSemantics(root: View, density: Float): String {
    val acv = findAndroidComposeView(root) ?: error("AndroidComposeView not found in view tree")
    val owner = acv.javaClass.methods.first { it.name.startsWith("getSemanticsOwner") }.invoke(acv) as SemanticsOwner
    return """{"density": $density, "root": ${nodeJson(owner.unmergedRootSemanticsNode)}}"""
}

private fun nodeJson(n: SemanticsNode): String {
    val tag = n.config.getOrNull(SemanticsProperties.TestTag)
    val text = n.config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }
    val results = mutableListOf<TextLayoutResult>()
    n.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(results)
    val style = results.firstOrNull()?.layoutInput?.style
    val fontSp = style?.fontSize?.takeIf { it.isSp }?.value
    val color = style?.color?.takeIf { it != Color.Unspecified }
        ?.let { "\"#%06X\"".format(it.toArgb() and 0xFFFFFF) } ?: "null"
    val p = n.positionInRoot
    val s = n.size
    val t = n.touchBoundsInRoot
    return """{"testTag":${js(tag)},"text":${js(text)},""" +
        """"positionInRoot":{"x":${p.x},"y":${p.y}},""" +
        """"size":{"width":${s.width},"height":${s.height}},""" +
        """"touchBoundsInRoot":{"left":${t.left},"top":${t.top},"right":${t.right},"bottom":${t.bottom}},""" +
        """"colorHex":$color,"fontSizeSp":${fontSp ?: "null"},"cornerRadiusPx":null,""" +
        """"children":[${n.children.joinToString(",") { nodeJson(it) }}]}"""
}

private fun js(v: String?): String =
    v?.let { "\"${it.replace("\\", "\\\\").replace("\"", "\\\"")}\"" } ?: "null"

fun main() {
    var outPath: String? = null
    var frames = 0
    var semanticsView: ComposeView? = null
    var semanticsResult: Result<String>? = null
    val sdk = PaparazziSdk(
        environment = detectEnvironment(),
        deviceConfig = deviceConfig,
        theme = "android:Theme.Material.Light.NoActionBar",
        renderingMode = SessionParams.RenderingMode.NORMAL,
        onNewFrame = { image ->
            frames++
            semanticsView?.let { v ->
                semanticsResult = runCatching { dumpSemantics(v, DENSITY) } // 在 session 存活期(帧回调)内读语义树
                semanticsView = null
            }
            outPath?.let { ImageIO.write(image, "PNG", File(it)) }
        },
    )
    val t0 = System.nanoTime()
    sdk.setup()
    sdk.prepare()
    System.err.println("""{"event":"ready","setupMs":${(System.nanoTime() - t0) / 1_000_000}}""")
    for (line in generateSequence(::readLine)) {
        val parts = line.trim().split(Regex("\\s+"))
        when {
            parts[0] == "render" && parts.size >= 3 -> {
                val fqn = parts[1]
                outPath = parts[2]
                if (fqn != KNOWN_FQN) {
                    outPath = null
                    println("""{"event":"error","fqn":"$fqn","message":"unsupported preview fqn (fast lane pins $KNOWN_FQN)"}""")
                    continue
                }
                frames = 0
                val start = System.nanoTime()
                val result = runCatching { sdk.snapshot { CalibCardPreview() } }
                val ms = (System.nanoTime() - start) / 1_000_000
                val rt = Runtime.getRuntime()
                val heapMb = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024)
                if (result.isSuccess && frames > 0 && File(parts[2]).isFile) {
                    println("""{"event":"rendered","fqn":"$fqn","ms":$ms,"heapUsedMb":$heapMb,"out":"${parts[2]}"}""")
                } else {
                    val msg = (result.exceptionOrNull()?.toString() ?: "no frame delivered").replace("\"", "'")
                    println("""{"event":"error","fqn":"$fqn","ms":$ms,"message":"$msg"}""")
                }
            }
            parts[0] == "semantics" && parts.size >= 3 -> {
                val fqn = parts[1]
                if (fqn != KNOWN_FQN) {
                    println("""{"event":"error","fqn":"$fqn","message":"unsupported preview fqn (fast lane pins $KNOWN_FQN)"}""")
                    continue
                }
                outPath = null
                semanticsResult = null
                val start = System.nanoTime()
                val run = runCatching {
                    val v = ComposeView(sdk.context)
                    v.setContent { CalibCardPreview() }
                    semanticsView = v
                    sdk.snapshot(v)
                }
                val ms = (System.nanoTime() - start) / 1_000_000
                val dump = semanticsResult
                when {
                    run.isFailure -> println("""{"event":"semantics","reachable":false,"ms":$ms,"message":"${run.exceptionOrNull().toString().replace("\"", "'")}"}""")
                    dump == null -> println("""{"event":"semantics","reachable":false,"ms":$ms,"message":"no frame callback"}""")
                    dump.isFailure -> println("""{"event":"semantics","reachable":false,"ms":$ms,"message":"${dump.exceptionOrNull().toString().replace("\"", "'")}"}""")
                    else -> {
                        File(parts[2]).writeText(dump.getOrThrow() + "\n")
                        println("""{"event":"semantics","reachable":true,"ms":$ms,"out":"${parts[2]}"}""")
                    }
                }
            }
            parts[0] == "quit" -> break
            parts[0].isEmpty() -> {}
            else -> println("""{"event":"error","message":"bad command"}""")
        }
    }
    sdk.teardown()
    System.err.println("""{"event":"bye"}""")
}

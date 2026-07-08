package com.magpie.uiv.demo

import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsOwner
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.PaparazziSdk
import app.cash.paparazzi.detectEnvironment
import com.android.ide.common.rendering.api.SessionParams
import com.android.resources.Density
import com.android.resources.ScreenOrientation
import java.io.File
import javax.imageio.ImageIO

/**
 * T2.3 S4:JUnit-free 常驻渲染 worker(快车道候选 1 spike)。
 *
 * 协议(纯 stdin/stdout,零网络监听面——硬性安全前置):
 *   stdin:  `render <PreviewFqn> <outPngPath>` | `quit`
 *   stdout: 每轮一行 JSON {"event":"rendered","ms":…,"heapUsedMb":…} 或 {"event":"error",…}
 *   stderr: 就绪/退出事件(含一次性 setup 耗时 = 冷启动记录项)
 *
 * spike 纪律:渲染目标写死 CalibCardPreview(preview 发现机制属产品化事项,不在 T2.3);
 * deviceConfig 钉 720x400px @ density 2.0,对齐慢车道 golden。
 */
private val deviceConfig = DeviceConfig(
    screenHeight = 400,
    screenWidth = 720,
    xdpi = 320,
    ydpi = 320,
    orientation = ScreenOrientation.LANDSCAPE, // 默认 PORTRAIT 会把 720x400 归一成 400x720(S3 实证)
    density = Density.XHIGH,
    softButtons = false,
)

/** S6:语义可达性探测。反射取 AndroidComposeView.semanticsOwner(internal → getter 带 $ui_release 后缀)。 */
private fun findAndroidComposeView(v: View): View? {
    if (v.javaClass.name == "androidx.compose.ui.platform.AndroidComposeView") return v
    if (v is ViewGroup) for (i in 0 until v.childCount) findAndroidComposeView(v.getChildAt(i))?.let { return it }
    return null
}

private fun dumpSemantics(root: View): String {
    val acv = findAndroidComposeView(root) ?: error("AndroidComposeView not found in view tree")
    val owner = acv.javaClass.methods.first { it.name.startsWith("getSemanticsOwner") }.invoke(acv) as SemanticsOwner
    val sb = StringBuilder()
    fun walk(n: SemanticsNode) {
        val tag = n.config.getOrNull(SemanticsProperties.TestTag)
        val text = n.config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }
        val b = n.boundsInRoot
        sb.append("{\"tag\":${tag?.let { "\"$it\"" } ?: "null"},\"text\":${text?.let { "\"$it\"" } ?: "null"}")
        sb.append(",\"boundsInRoot\":[${b.left},${b.top},${b.right},${b.bottom}],\"children\":[")
        n.children.forEachIndexed { i, c -> if (i > 0) sb.append(','); walk(c) }
        sb.append("]}")
    }
    walk(owner.unmergedRootSemanticsNode)
    return sb.toString()
}

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
                semanticsResult = runCatching { dumpSemantics(v) } // 在 session 存活期(帧回调)内读语义树
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
                val fqn = parts[1] // spike 写死渲染 CalibCardPreview;fqn 仅回显
                outPath = parts[2]
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
            parts[0] == "semantics" && parts.size >= 2 -> {
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
                        File(parts[1]).writeText(dump.getOrThrow() + "\n")
                        println("""{"event":"semantics","reachable":true,"ms":$ms,"out":"${parts[1]}"}""")
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

package com.magpie.uiv.demo

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.TextLayoutResult
import org.junit.rules.TestWatcher
import java.io.File

/**
 * semantics-exporter(T1.3 Step 11,设计文档 2.3 节,按 C5 修正口径)。
 * onRoot(useUnmergedTree=true).fetchSemanticsNode() 递归导出全树为 JSON:
 *   坐标取 positionInRoot + size(unclipped px),不用 boundsInRoot(它是 px 且 clipped);
 *   px→dp 换算由 uiv-core L2 侧统一 ÷density 完成,本侧只导出原始 px。
 *   touchBoundsInRoot 一并导出(供 L2-invariant 最小触控判定);
 *   cornerRadiusPx 恒 null(语义树不可得,断言侧自动跳过,Phase 0 无圆角断言)。
 */
class SemanticsDumpRule(private val outDir: File = File("build/uiv")) : TestWatcher() {

    // graphicsMode 默认 NATIVE(环境由 ConfigPinningTest 钉死;切 LEGACY 必须同步传参并重跑 CS1/CS2 probe——calibration.md hard-gate 条款)。
    fun dump(rule: ComposeContentTestRule, name: String, graphicsMode: String = "NATIVE") {
        val root = rule.onRoot(useUnmergedTree = true).fetchSemanticsNode()
        outDir.mkdirs()
        File(outDir, "$name.semantics.json")
            .writeText("""{"density": ${rule.density.density}, "graphicsMode": "$graphicsMode", "root": ${nodeJson(root)}}""")
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
        // T3.4:boundsInRoot 为 clipped px 盒(childClipped 依据,与 unclipped positionInRoot+size 作差);
        // hasVisualOverflow 取自已解出的 TextLayoutResult(非文本无 → null);clickable=config 含 OnClick;cd=merged 可及名。
        val b = n.boundsInRoot
        val overflow = results.firstOrNull()?.hasVisualOverflow?.toString() ?: "null"
        val clickable = n.config.contains(SemanticsActions.OnClick)
        val cd = n.config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ")
        return """{"testTag":${js(tag)},"text":${js(text)},""" +
            """"positionInRoot":{"x":${p.x},"y":${p.y}},""" +
            """"size":{"width":${s.width},"height":${s.height}},""" +
            """"touchBoundsInRoot":{"left":${t.left},"top":${t.top},"right":${t.right},"bottom":${t.bottom}},""" +
            """"boundsInRoot":{"left":${b.left},"top":${b.top},"right":${b.right},"bottom":${b.bottom}},""" +
            """"colorHex":$color,"fontSizeSp":${fontSp ?: "null"},"cornerRadiusPx":null,""" +
            """"hasVisualOverflow":$overflow,"clickable":$clickable,"contentDescription":${js(cd)},""" +
            """"children":[${n.children.joinToString(",") { nodeJson(it) }}]}"""
    }

    private fun js(v: String?): String =
        v?.let { "\"${it.replace("\\", "\\\\").replace("\"", "\\\"")}\"" } ?: "null"
}

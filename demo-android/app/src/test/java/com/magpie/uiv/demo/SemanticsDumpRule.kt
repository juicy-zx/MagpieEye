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

    fun dump(rule: ComposeContentTestRule, name: String) {
        val root = rule.onRoot(useUnmergedTree = true).fetchSemanticsNode()
        outDir.mkdirs()
        File(outDir, "$name.semantics.json")
            .writeText("""{"density": ${rule.density.density}, "root": ${nodeJson(root)}}""")
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
}

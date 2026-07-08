package com.magpie.uiv.demo

import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * semantics-exporter 导出测试(T1.3 Step 11)。
 * 渲染 T1.1 的 CalibCard,经 SemanticsDumpRule 导出语义树为 build/uiv/CalibCard.semantics.json;
 * 断言含 5 节点 tag、px 坐标/尺寸、touchBounds、density 2.0(与 Figma scale=2 标定对齐)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class SemanticsDumpTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Test
    fun dumpsCalibCardSemantics() {
        composeRule.setContent { CalibCard() }
        dumpRule.dump(composeRule, "CalibCard")

        val f = File("build/uiv/CalibCard.semantics.json")
        assertTrue("semantics.json 应已落盘", f.exists())
        val json = f.readText()
        // 密度钉死 2.0
        assertTrue("含 density 2.0", json.contains("\"density\": 2.0"))
        // 5 节点 tag 全在(容器 + 4 叶子)
        for (tag in listOf("fig:1:100", "fig:1:101", "fig:1:102", "fig:1:103", "fig:1:104")) {
            assertTrue("含 tag $tag", json.contains("\"$tag\""))
        }
        // px 坐标/尺寸/触控盒可得项
        assertTrue("含 positionInRoot", json.contains("\"positionInRoot\""))
        assertTrue("含 size", json.contains("\"size\""))
        assertTrue("含 touchBoundsInRoot", json.contains("\"touchBoundsInRoot\""))
        assertTrue("含 colorHex 键", json.contains("\"colorHex\""))
        assertTrue("含 fontSizeSp 键", json.contains("\"fontSizeSp\""))
        // 标题文本可得
        assertTrue("含标题文本", json.contains("Calibration Card"))
        // 圆角 v0 恒 null(exporter 不导出 cornerRadius)
        assertTrue("cornerRadiusPx 恒 null", json.contains("\"cornerRadiusPx\":null"))
    }
}

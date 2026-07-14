package com.magpie.uiv.harness.semantics

// ============================================================================
// P0-8 批次①:golden 测试随 semantics-dump 制品迁移(codex E 决断)。
//
// 停放位置说明(非 Gradle 源集):本文件依赖仓外 fixture —— CalibCard() 可组合项 + Compose
// 测试运行时(createComposeRule/ui-test-manifest)+ Robolectric 宿主。制品侧 Compose 为
// compileOnly(不供测试运行时,由目标工程供),且 CalibCard 属 demo fixture;把它们接入会
// 越过制品边界,故本批次不接入编译/运行,停放在此随制品迁移;fixture 接线留批次③。
//
// 已随迁移完成的 codex E 适配:
//  - package 迁至 com.magpie.uiv.harness.semantics;
//  - SemanticsDumpRule 去 TestWatcher → dumpRule 由 @get:Rule 退化为普通字段(显式 dump() 调用);
//    composeRule 仍是真 TestRule,保留 @get:Rule。
// ============================================================================

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
 * semantics-exporter 导出测试。
 * 渲染 CalibCard,经 SemanticsDumpRule 导出语义树为 build/uiv/CalibCard.semantics.json;
 * 断言含 5 节点 tag、px 坐标/尺寸、touchBounds、density 2.0(与 Figma scale=2 标定对齐)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class SemanticsDumpTest {

    @get:Rule
    val composeRule = createComposeRule()

    // P0-8:SemanticsDumpRule 去 TestWatcher 后不再是 TestRule,退化为普通字段(dump() 显式调用)。
    private val dumpRule = SemanticsDumpRule()

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
        // T3.4:导出扩展四字段 + graphicsMode(供 L2-invariant 消费)
        assertTrue("顶层含 graphicsMode NATIVE(hard-gate 执行依据)", json.contains("\"graphicsMode\": \"NATIVE\""))
        assertTrue("节点含 boundsInRoot 四键(clipped px)", json.contains("\"boundsInRoot\":{\"left\":"))
        assertTrue("CalibTitle hasVisualOverflow false(不溢出)", json.contains("\"hasVisualOverflow\":false"))
        assertTrue("swatch clickable false(非可点击)", json.contains("\"clickable\":false"))
        assertTrue("无 cd → contentDescription null", json.contains("\"contentDescription\":null"))
    }
}

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
 * T4.5 回归护栏(套 ConfigPinningTest 模式):`robolectric.useRealAni=true` 局部启用后,
 * 存量语义树导出管线(SemanticsDumpRule)是否仍与 SemanticsDumpTest 钉住的不变量一致——
 * 该扰动此前未经验证(m4-drafts/T4.4-T4.5-scoping.md §2 风险条),本测试是一次性机判钉死。
 * `robolectric.useRealAni` 无 @Config 层面开关(4.16 annotations jar 反编译确认 Config 无
 * properties 参数),只能靠 convention plugin 转发的 `-Drobolectric.useRealAni=true` gradle
 * 调用层开启;本类默认(不传该 -D)即回归基线本身(useRealAni 实际为 false),
 * `-Drobolectric.useRealAni=true` 显式跑一遍是本护栏机判"开启后是否扰动"的那一半。
 * 复用 CalibCard 仅作只读渲染(不改动该文件——标定合同排他),落盘到独立 dump 名
 * (CalibCard_useRealAni)避免与 SemanticsDumpTest/CalibCardScreenshotTest 的既有产物互相覆盖。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class UseRealAniRegressionTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Test
    fun semanticsDumpUnaffectedByUseRealAni() {
        composeRule.setContent { CalibCard() }
        dumpRule.dump(composeRule, "CalibCard_useRealAni")

        val f = File("build/uiv/CalibCard_useRealAni.semantics.json")
        assertTrue("semantics.json 应已落盘", f.exists())
        val json = f.readText()
        // 与 SemanticsDumpTest 同组断言(子集,取最载重项),对照 useRealAni=false 基线逐条钉死。
        assertTrue("含 density 2.0(useRealAni 不应扰动密度钉死)", json.contains("\"density\": 2.0"))
        for (tag in listOf("fig:1:100", "fig:1:101", "fig:1:102", "fig:1:103", "fig:1:104")) {
            assertTrue("含 tag $tag", json.contains("\"$tag\""))
        }
        assertTrue("含 positionInRoot", json.contains("\"positionInRoot\""))
        assertTrue("含 size", json.contains("\"size\""))
        assertTrue("含 touchBoundsInRoot", json.contains("\"touchBoundsInRoot\""))
        assertTrue("含标题文本(内容未被扰动)", json.contains("Calibration Card"))
        assertTrue("顶层 graphicsMode 仍 NATIVE", json.contains("\"graphicsMode\": \"NATIVE\""))
        assertTrue("CalibTitle hasVisualOverflow 仍 false", json.contains("\"hasVisualOverflow\":false"))
        assertTrue("swatch clickable 仍 false", json.contains("\"clickable\":false"))
    }
}

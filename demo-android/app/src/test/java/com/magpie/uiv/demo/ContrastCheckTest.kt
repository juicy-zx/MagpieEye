package com.magpie.uiv.demo

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.RoborazziATFAccessibilityCheckOptions
import com.github.takahirom.roborazzi.RoborazziATFAccessibilityChecker
import com.github.takahirom.roborazzi.checkRoboAccessibility
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityCheckPreset
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * T4.5:对比度 WCAG advisory 检查(Codex 裁定最小版,advisory 级,不进任何门禁)。
 * ATF(Google Accessibility Test Framework)经 roborazzi-accessibility-check 接入(与 roborazzi 1.63 同版本族)。
 * `robolectric.useRealAni` 实测(反编译 Robolectric 4.16 annotations-4.16.jar 的 Config.class)确认
 * @Config 无 properties 参数——4.15+ 该属性只经真实 JVM system property 读取(Robolectric 源码
 * `Boolean.parseBoolean(System.getProperty("robolectric.useRealAni","false"))`),故只能由 convention
 * plugin 转发的 `-Drobolectric.useRealAni=true` 在 gradle 调用层显式开启,默认不设=局部/advisory,
 * 不影响 `demo 全测` 默认调用路径。
 *
 * 红绿对照:lowContrast fixture → ATF TextContrastCheck 命中(断言异常消息含检查名,即"红"这一侧的机判形态);
 * 正常对比度 fixture → checkRoboAccessibility 零违规静默通过(即"绿")。
 * API 门槛(读官方源码 RoborazziATFAccessibilityChecker.kt 确认):ATF 检查仅 SDK>=34(UPSIDE_DOWN_CAKE)执行,
 * 本类沿用仓库既有 sdk=36 已满足;GraphicsMode 须 NATIVE(LEGACY 下 ATF 静默跳过,官方样例 notNative() 同证)。
 * advisory 输出形态:JUnit 测试日志(pass/fail 本身)+ build/contrast-check/ 下独立探针 json,不碰 report schema。
 */
@OptIn(ExperimentalRoborazziApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class ContrastCheckTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun options() = RoborazziATFAccessibilityCheckOptions(
        checker = RoborazziATFAccessibilityChecker(preset = AccessibilityCheckPreset.LATEST),
        failureLevel = RoborazziATFAccessibilityChecker.CheckLevel.Warning,
    )

    @Test
    fun lowContrast_isFlaggedByAtf() {
        composeRule.setContent { ContrastFixtureCard(lowContrast = true) }
        val error = assertThrows(Throwable::class.java) {
            composeRule.onNodeWithTag("contrastFixtureText").checkRoboAccessibility(
                roborazziATFAccessibilityCheckOptions = options(),
            )
        }
        assertTrue(
            "advisory:低对比度反例应触发 ATF TextContrastCheck,实际消息:${error.message}",
            error.message.orEmpty().contains("TextContrastCheck"),
        )
        writeProbe("low.json", """{"flagged":true,"fixture":"contrastFixtureText"}""")
    }

    @Test
    fun normalContrast_isClean() {
        composeRule.setContent { ContrastFixtureCard(lowContrast = false) }
        // 不包 assertThrows:任意违规都会在此处直接抛异常,测试自然转红——干净即绿本身就是断言。
        composeRule.onNodeWithTag("contrastFixtureText").checkRoboAccessibility(
            roborazziATFAccessibilityCheckOptions = options(),
        )
        writeProbe("normal.json", """{"flagged":false,"fixture":"contrastFixtureText"}""")
    }

    private fun writeProbe(name: String, json: String) {
        val dir = File("build/contrast-check").apply { mkdirs() }
        File(dir, name).writeText(json)
    }
}

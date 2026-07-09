package com.magpie.uiv.demo

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * 整页外循环渲染挽具(T3.3)。CalibCard 当页面(短名 CalibPage 对齐 runCheck 的 PNG needle 与 semantics 口径)。
 * qualifiers 不钉类上 —— 由 uiv.device 每格 invocation 经 RuntimeEnvironment.setQualifiers 决定(verify-page 逐格 -Puiv.device);
 * fontScale1.3 格由 LocalDensity 覆写 fontScale=1.3(非资源 qualifier);uiv.state 缺省 typical(fixture 分支归 T3.4)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class CalibPageScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    private val device = System.getProperty("uiv.device") ?: "base"
    private val state = System.getProperty("uiv.state") ?: "typical"

    @Before
    fun configureDevice() {
        RuntimeEnvironment.setQualifiers(QUALIFIERS.getValue(device))
    }

    @Test
    fun capturePage() {
        composeRule.setContent {
            val d = LocalDensity.current
            val fs = if (device == "fontScale1.3") 1.3f else d.fontScale
            CompositionLocalProvider(LocalDensity provides Density(d.density, fs)) { CalibCard() }
        }
        composeRule.onNodeWithTag("fig:1:100")
            .captureRoboImage("build/outputs/roborazzi/CalibPage_${device}_${state}.png")
        dumpRule.dump(composeRule, "CalibPage")
    }

    companion object {
        // 与 uiv-core DEVICE_QUALIFIERS 逐项同表写死(5 键);全格恒 xhdpi(密度门 2.0,口径①)。
        val QUALIFIERS = mapOf(
            "base" to "w360dp-h800dp-xhdpi",
            "pixel5-dark" to "w360dp-h800dp-night-xhdpi",
            "fontScale1.3" to "w360dp-h800dp-xhdpi",
            "smallPhone" to "w320dp-h640dp-xhdpi",
            "tablet" to "w800dp-h1280dp-xhdpi",
        )
    }
}

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
 * HashtagPanel(Figma 39:10844)整页矩阵测试,骨架照 CalibPageScreenshotTest。
 * qualifiers 不钉类上——verify-page 逐格 -Puiv.device 经 convention plugin 转成 system property,
 * @Before 里 RuntimeEnvironment.setQualifiers 生效;fontScale1.3 格由 LocalDensity 覆写。
 * 复用组件级测试会得到假矩阵(@Config 钉死 qualifiers,uiv.device 失效)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class HashtagPanelPageScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    private val device = System.getProperty("uiv.device") ?: "base"
    private val state = System.getProperty("uiv.state") ?: "typical"

    @Before
    fun configureDevice() {
        RuntimeEnvironment.setQualifiers(CalibPageScreenshotTest.QUALIFIERS.getValue(device))
    }

    @Test
    fun capturePage() {
        composeRule.setContent {
            val d = LocalDensity.current
            val fs = if (device == "fontScale1.3") 1.3f else d.fontScale
            CompositionLocalProvider(LocalDensity provides Density(d.density, fs)) { HashtagPanel() }
        }
        composeRule.onNodeWithTag("fig:39:10844")
            .captureRoboImage("build/outputs/roborazzi/HashtagPanelPage_${device}_${state}.png")
        dumpRule.dump(composeRule, "HashtagPanelPage")
    }
}

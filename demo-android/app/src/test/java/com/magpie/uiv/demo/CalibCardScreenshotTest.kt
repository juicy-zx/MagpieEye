package com.magpie.uiv.demo

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class CalibCardScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    // semantics-exporter(T1.3):CLI check 跑本测试时同步落 build/uiv/CalibCard.semantics.json
    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Test
    fun captureCalibCard() {
        composeRule.setContent { CalibCard() }
        // node capture 裁到 fig:1:100 的 unclipped bounds:360x200dp * 2.0 = 720x400 px
        composeRule.onNodeWithTag("fig:1:100")
            .captureRoboImage("build/outputs/roborazzi/CalibCard.png")
        dumpRule.dump(composeRule, "CalibCard")
    }
}

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
        // golden 入库目录(T2.6):src/test/snapshots/ 未被 .gitignore 忽略,record/compare 均指向此显式路径;
        // compare 产物(_actual.png/_compare.png)仍由 roborazzi 落 build/outputs/roborazzi/(build 产物,被忽略)。
        composeRule.onNodeWithTag("fig:1:100")
            .captureRoboImage("src/test/snapshots/CalibCard.png")
        dumpRule.dump(composeRule, "CalibCard")
    }
}

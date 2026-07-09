package com.magpie.uiv.demo

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import coil3.ColorImage
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.annotation.DelicateCoilApi
import coil3.test.FakeImageLoaderEngine
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * 内容态截图 + 语义导出(T3.4)。ParameterizedRobolectricTestRunner 遍历七态,NATIVE + 钉死 qualifiers;
 * @Before 装 FakeImageLoaderEngine("图已载入"态确定性 ColorImage),@After reset(零跨用例污染)。
 * 每态落 build/uiv/fixture_<state>.png + fixture_<state>.semantics.json,供 L2-invariant 端到端消费。
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class FixtureCardScreenshotTest(private val state: ContentState) {

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun states(): List<ContentState> = ContentState.entries
    }

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Before
    fun installFakeImageLoader() {
        SingletonImageLoader.setSafe { ctx ->
            ImageLoader.Builder(ctx).components {
                add(
                    FakeImageLoaderEngine.Builder()
                        .intercept("https://fixture/avatar.png", ColorImage(0xFF3366CC.toInt()))
                        .build(),
                )
            }.build()
        }
    }

    @OptIn(DelicateCoilApi::class)
    @After
    fun resetImageLoader() {
        SingletonImageLoader.reset()
    }

    @Test
    fun captureFixture() {
        val name = "fixture_${state.name.lowercase()}"
        composeRule.setContent { FixtureCard(state) }
        composeRule.onNodeWithTag("fixtureCard").captureRoboImage("build/uiv/$name.png")
        dumpRule.dump(composeRule, name)
    }
}

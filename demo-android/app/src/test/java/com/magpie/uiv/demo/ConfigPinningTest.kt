package com.magpie.uiv.demo

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class ConfigPinningTest {

    @Test
    fun densityAndWindowArePinned() {
        val dm = ApplicationProvider.getApplicationContext<Context>().resources.displayMetrics
        assertEquals(2.0f, dm.density, 0.0f)      // xhdpi = 2.0,与 Figma scale=2 标定对齐
        assertEquals(720, dm.widthPixels)          // 360dp * 2.0
        assertEquals(1600, dm.heightPixels)        // 800dp * 2.0
    }
}

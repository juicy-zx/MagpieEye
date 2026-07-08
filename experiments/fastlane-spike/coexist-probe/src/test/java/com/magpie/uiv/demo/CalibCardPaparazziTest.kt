package com.magpie.uiv.demo

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.Density
import com.android.resources.ScreenOrientation
import org.junit.Rule
import org.junit.Test

/**
 * T2.3 S3:官方 JUnit4 路线首张 PNG(证明工具链活)。
 * deviceConfig 对齐慢车道 golden:720x400 px @ density 2.0(xhdpi)= CalibCard 360x200dp。
 * 慢车道 = Robolectric w360dp-h800dp-xhdpi + node capture fig:1:100。
 */
class CalibCardPaparazziTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig(
            screenWidth = 720,
            screenHeight = 400,
            xdpi = 320,
            ydpi = 320,
            orientation = ScreenOrientation.LANDSCAPE, // 默认 PORTRAIT 会把 720x400 归一成 400x720(S3 首图实证)
            density = Density.XHIGH,
            softButtons = false,
        ),
        theme = "android:Theme.Material.Light.NoActionBar",
    )

    @Test
    fun record() {
        paparazzi.snapshot("CalibCard") { CalibCard() }
    }
}

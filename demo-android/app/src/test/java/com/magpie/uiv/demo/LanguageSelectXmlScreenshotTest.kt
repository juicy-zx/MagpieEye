package com.magpie.uiv.demo

import android.app.Activity
import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * T4.4 commit2:XML/View 主靶 39:10826 全链渲染挽具。
 * 真 Activity inflate + measure + layout(D8①:根+关键节点尺寸非零)→ ViewDumpRule dump
 * 落 build/uiv/LanguageSelectXml.semantics.json(runL2.ts:119 shortName=LanguageSelectXml,零改命中)
 * + View.captureRoboImage 走渲染像素通道。
 * 固定 density=2.0 / fontScale=1 / locale 默认 / xhdpi / sdk36 / w360dp-h800dp(D8③)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class LanguageSelectXmlScreenshotTest {

    @get:Rule
    val dumpRule = ViewDumpRule()

    private fun inflateAndLayout(activity: Activity, layoutRes: Int): View {
        activity.setContentView(layoutRes)
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val dm = activity.resources.displayMetrics
        content.measure(
            View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY),
        )
        content.layout(0, 0, content.measuredWidth, content.measuredHeight)
        return (content as ViewGroup).getChildAt(0)
    }

    @Test
    fun captureLanguageSelectXml() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val root = inflateAndLayout(activity, R.layout.language_select)

        // D8①:根 + 关键节点尺寸非零(裸 inflate 会全 0,证明确经真 measure+layout)。
        assertTrue("root size non-zero", root.width > 0 && root.height > 0)
        val text = root.findViewWithTag<TextView>("fig:39:10827")
        val arrow = root.findViewWithTag<ImageView>("fig:39:10828")
        assertTrue("text size non-zero", text.width > 0 && text.height > 0)
        assertTrue("arrow size non-zero", arrow.width > 0 && arrow.height > 0)
        // 尺寸精确(dp*density=px):Text 63x17dp→126x34;arrow 24x24dp→48x48;root 328x48dp→656x96。
        assertEquals(656, root.width); assertEquals(96, root.height)
        assertEquals(126, text.width); assertEquals(34, text.height)
        assertEquals(48, arrow.width); assertEquals(48, arrow.height)
        // 主靶镜像 Compose:非 clickable(same-in→same-out 纯净对照)。
        assertFalse("root not clickable", root.isClickable)
        // 14sp 文本 fontSize 上报口径(textSize 28px / scaledDensity 2.0 = 14sp)。
        assertEquals(28.0f, text.textSize, 0.01f)

        // Codex commit2 R1 req2:fig 根经 getGlobalVisibleRect 完全可见,且 visible rect 尺寸 == 根 measured 尺寸
        // (证谐上下文无裁剪、坐标系口径正确,boundsInRoot 重钉基有效)。
        val rootVis = Rect()
        assertTrue("root fully visible via getGlobalVisibleRect", root.getGlobalVisibleRect(rootVis))
        assertEquals("root visible width == measured", root.width, rootVis.width())
        assertEquals("root visible height == measured", root.height, rootVis.height())

        // req3:非裁剪节点 boundsInRoot(getGlobalVisibleRect 减根 visible 原点) == positionInRoot + size。
        // positionInRoot = getLocationInWindow − 根 location;两系若未对齐此门必失败(坐标系对齐正确性门)。主靶三节点全验。
        val rootLocWin = IntArray(2).also { root.getLocationInWindow(it) }
        assertBoundsAlignPosPlusSize(root, rootLocWin, rootVis)
        assertBoundsAlignPosPlusSize(text, rootLocWin, rootVis)
        assertBoundsAlignPosPlusSize(arrow, rootLocWin, rootVis)

        root.captureRoboImage("src/test/snapshots/LanguageSelectXml.png")
        dumpRule.dump(root, "LanguageSelectXml")
    }

    /** boundsInRoot(getGlobalVisibleRect 减根 visible 原点) == positionInRoot(getLocationInWindow 减根 location) + size。 */
    private fun assertBoundsAlignPosPlusSize(v: View, rootLocWin: IntArray, rootVis: Rect) {
        val loc = IntArray(2).also { v.getLocationInWindow(it) }
        val px = loc[0] - rootLocWin[0]
        val py = loc[1] - rootLocWin[1]
        val vis = Rect()
        assertTrue("node visible via getGlobalVisibleRect", v.getGlobalVisibleRect(vis))
        assertEquals("boundsInRoot.left == positionInRoot.x", px, vis.left - rootVis.left)
        assertEquals("boundsInRoot.top == positionInRoot.y", py, vis.top - rootVis.top)
        assertEquals("boundsInRoot.right == positionInRoot.x + width", px + v.width, vis.right - rootVis.left)
        assertEquals("boundsInRoot.bottom == positionInRoot.y + height", py + v.height, vis.bottom - rootVis.top)
    }

    @Test
    fun captureLanguageSelectXmlBadGeom() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val root = inflateAndLayout(activity, R.layout.language_select_badgeom)

        val arrow = root.findViewWithTag<ImageView>("fig:39:10828")
        // 负例:arrow 40x40dp→80x80px(应为 48x48);dump 后 fig:39:10828 触发 size 违规(TS 侧断言)。
        assertEquals(80, arrow.width); assertEquals(80, arrow.height)

        root.captureRoboImage("build/outputs/roborazzi/LanguageSelectXmlBadGeom.png")
        dumpRule.dump(root, "LanguageSelectXmlBadGeom")
    }
}

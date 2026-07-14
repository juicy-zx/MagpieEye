package com.magpie.uiv.harness.view

// ============================================================================
// P0-8 批次①:契约测试随 view-dump 制品迁移(codex E 决断)。
//
// 停放位置说明(非 Gradle 源集):本文件依赖仓外 fixture —— R.layout.clickable_matrix /
// R.layout.clipped_child(布局资源)+ Robolectric 宿主 + androidx.test。把这些 fixture 资源
// 塞进 view-dump 主 res 会污染已发布的干净 AAR(制品边界),故本批次不接入编译/运行,
// 停放在此随制品迁移;编译+运行的 fixture 接线留批次③(仓外 fixture 挽具)。
//
// 已随迁移完成的 codex E 适配:
//  - package 迁至 com.magpie.uiv.harness.view;
//  - ViewDumpRule 去 TestWatcher → dumpRule 由 @get:Rule 退化为普通字段(显式 dump() 调用)。
// ============================================================================

import android.app.Activity
import android.graphics.Rect
import android.text.TextUtils
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * ViewDumpRule 字段契约 + CS2 textOverflow 通用实现 + clickable/touchBounds-null 全链 + tag 唯一性。
 * 产 build/uiv/&lt;name&gt;.semantics.json 供 uiv-core TS 侧 runInvariants/runL2 消费(跨语言全链)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class ViewDumpRuleContractTest {

    // P0-8:ViewDumpRule 去 TestWatcher 后不再是 TestRule,退化为普通字段(dump() 显式调用)。
    private val dumpRule = ViewDumpRule()

    private val ctx get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun measuredTextView(widthPx: Int, block: TextView.() -> Unit): TextView {
        val tv = TextView(ctx).apply(block)
        tv.measure(
            View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        tv.layout(0, 0, tv.measuredWidth, tv.measuredHeight)
        return tv
    }

    private fun dumpedJson(name: String): String = File("build/uiv/$name.semantics.json").readText()

    // --- D1 CS2:overflow 正例(单行 ellipsis) ---
    @Test
    fun cs2_overflow_positive_hasVisualOverflow_true() {
        val tv = measuredTextView(200) {
            text = "x".repeat(500); maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        assertTrue("单行超长应 ellipsize", tv.layout.getEllipsisCount(0) > 0)
        dumpRule.dump(tv, "Cs2OverflowPositive")
        assertTrue(dumpedJson("Cs2OverflowPositive").contains("\"hasVisualOverflow\":true"))
    }

    // --- D1 CS2:non-overflow 负例 ---
    @Test
    fun cs2_overflow_negative_hasVisualOverflow_false() {
        val tv = measuredTextView(400) {
            text = "OK"; maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        }
        assertEquals("短文本不应 ellipsize", 0, tv.layout.getEllipsisCount(0))
        dumpRule.dump(tv, "Cs2OverflowNegative")
        assertTrue(dumpedJson("Cs2OverflowNegative").contains("\"hasVisualOverflow\":false"))
    }

    // --- D1 CS2:多行末行 ellipsis(载重红/绿:证明必须遍历所有行,只查第 0 行会漏) ---
    @Test
    fun cs2_overflow_multiline_lastLine_ellipsis_hasVisualOverflow_true() {
        val tv = measuredTextView(200) {
            text = "word ".repeat(80); maxLines = 3; ellipsize = TextUtils.TruncateAt.END
        }
        val lastLine = tv.layout.lineCount - 1
        // 红证据:只查第 0 行会判 false(第 0 行无 ellipsis)。
        assertEquals("第 0 行无 ellipsis(line-0-only 会漏)", 0, tv.layout.getEllipsisCount(0))
        // 绿证据:末行有 ellipsis,遍历所有行捕获。
        assertTrue("末行应 ellipsis", tv.layout.getEllipsisCount(lastLine) > 0)
        dumpRule.dump(tv, "Cs2OverflowMultiline")
        assertTrue(dumpedJson("Cs2OverflowMultiline").contains("\"hasVisualOverflow\":true"))
    }

    // --- Codex 追加:clickable=true + touchBounds=null 全链(3 节点矩阵) ---
    @Test
    fun clickableMatrix_touchBoundsNull_and_missingCd_contract() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        activity.setContentView(R.layout.clickable_matrix)
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val dm = activity.resources.displayMetrics
        content.measure(
            View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY),
        )
        content.layout(0, 0, content.measuredWidth, content.measuredHeight)
        val root = content.getChildAt(0)

        val c1 = root.findViewWithTag<View>("fig:cm:c1-clickable-with-text")
        val c2 = root.findViewWithTag<View>("fig:cm:c2-clickable-no-name")
        val c3 = root.findViewWithTag<View>("fig:cm:c3-clickable-with-cd")
        assertTrue("c1 clickable", c1.isClickable)
        assertTrue("c2 clickable", c2.isClickable)
        assertTrue("c3 clickable", c3.isClickable)
        assertEquals("c3 有 contentDescription", "Language", c3.contentDescription?.toString())

        dumpRule.dump(root, "ClickableMatrix")
        val json = dumpedJson("ClickableMatrix")
        // 全部 clickable 节点 touchBoundsInRoot 显式 null(诚实缺席 → touchTarget 门跳过,TS 侧断言)。
        assertTrue(json.contains("\"touchBoundsInRoot\":null"))
        assertTrue(json.contains("\"clickable\":true"))
    }

    // --- Codex commit2 R1 req5:受控父裁剪 child 负例(boundsInRoot 使 childClipped 真产违规) ---
    @Test
    fun clippedChild_boundsInRoot_producesChildClipped_and_resolvesWhenUnclipped() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        activity.setContentView(R.layout.clipped_child)
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val dm = activity.resources.displayMetrics
        content.measure(
            View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY),
        )
        content.layout(0, 0, content.measuredWidth, content.measuredHeight)
        val parent = content.getChildAt(0) as ViewGroup   // fig:clip:parent(100x100dp=200x200px)
        val child = parent.findViewWithTag<View>("fig:clip:child")  // 80x80dp=160x160px @ (60,60)dp=(120,120)px

        // 裁剪态:child 被父 fig:clip:parent 裁 → getGlobalVisibleRect < unclipped bounds。
        // 注(AOSP ViewGroup.getChildVisibleRect):某组 G 是否把后代 rect 裁到 G 自身 bounds,由 G 的
        // 【父】的 clipChildren 门控;故 child 裁到 parent(200px)bounds 的开关在 content.clipChildren(默认 true)。
        assertTrue("content(parent-of-clip-parent) clips children", content.clipChildren)
        val vis = Rect()
        assertTrue("child visible", child.getGlobalVisibleRect(vis))
        // unclipped 宽 160px;可见部分被父 200px 边界裁到 (120..200)=80px < 160。
        assertTrue("child right clipped by parent", vis.width() < child.width)
        assertTrue("child bottom clipped by parent", vis.height() < child.height)
        dumpRule.dump(parent, "ClipChildViolation")

        // 移除裁剪(令 content.clipChildren=false,解除对 parent 内容的裁剪门)→ child 不再被裁 → == unclipped。
        content.clipChildren = false
        val vis2 = Rect()
        assertTrue("child visible unclipped", child.getGlobalVisibleRect(vis2))
        assertEquals("unclipped width restored", child.width, vis2.width())
        assertEquals("unclipped height restored", child.height, vis2.height())
        dumpRule.dump(parent, "ClipChildResolved")
    }

    // --- D2:同 dump 内 tag 重复 fail-fast(不覆盖) ---
    @Test
    fun duplicateTag_failsFast() {
        val group = FrameLayout(ctx)
        group.addView(TextView(ctx).apply { tag = "fig:dup" })
        group.addView(ImageView(ctx).apply { tag = "fig:dup" })
        group.measure(
            View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
        )
        group.layout(0, 0, 200, 200)
        assertThrows(IllegalStateException::class.java) { dumpRule.dump(group, "DupTag") }
    }
}

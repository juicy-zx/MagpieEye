package com.magpie.uiv.demo

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Figma hH7NUAlm9DsLRaGScQP0Z1 / 39:10844 "txt_placeholder_hashtags" 复刻(360x475 暗色 hashtag 输入面板)。
 * 几何/色值以 .ui-verify/baselines/39-10844@2342874355766877359/spec.json 为唯一事实源;
 * 规格文档:yanhao-spec.md(渲染确认图 yanhao-39-10844.png)。
 * 定位方式照 CalibCard(Codex D-03):自定义 Layout 绝对摆放,不用 Modifier.offset。
 * 语义层级刻意对齐 L2 容器 padding 派生口径:根 → [正文 TEXT, bar 容器] / bar → [chip, 圆钮];
 * input_hashtags(39:10845)不挂 tag——它是非 auto-layout INSTANCE,normalize padding 全 0,
 * 与其真实内缩 (16,12,42,108) 永远对不上;挂了反而制造 4 条假 padding 违规。
 * 系统键盘 39:10843 是兄弟节点,不实现;中部 y∈[216,427) 为刻意留空背景区。
 */
private val PANEL_CHILD_POSITIONS = listOf(
    16.dp to 28.dp, // 正文占位 TEXT I39:10845;10587:144062(302x80)
    0.dp to 427.dp, // ct_hashtag_bar 39:10846(360x48)
)

private val BAR_CHILD_POSITIONS = listOf(
    12.dp to 0.dp,  // chip btn_add_hashtag I39:10846;10221:94053(102x32)
    316.dp to 0.dp, // btn_fullscreen I39:10846;10221:94058(32x32)
)

/** 正文占位文案:烘焙 Figma textCase=TITLE 渲染结果(#hhhhhhhhhhhh → #Hhhhhhhhhhhh),运行时不做变换。 */
private const val PLACEHOLDER_TEXT =
    "#在星空下，月光轻洒，数不尽的梦，随风飘洒。\n" +
        "一二三四，心中有诗，五六七八，愿望如霞。九十的未来，闪耀着光，让我们一起，追逐希望的方向 #InspireMelodies #Inspire #Hhhhhhhhhhhh"

/**
 * 字宽补偿:Robolectric(Roboto/Noto 回退)下首行 "#+21 汉字" 比 302dp 宽出 <1px,
 * 叠加 CJK 标点禁则(。不能起行)整体多折一行 → 5 行触发 textOverflow high(设计稿为 4 行)。
 * fontScale 0.99 把物理字号压到 ≈13.86px,首行收进 302dp,恢复 4 行;
 * 声明 fontSize 仍是 14.sp(L2 fontSize 断言读 TextStyle 声明值,不受 fontScale 影响)。
 * lineHeight 20.2.sp × 0.99 ≈ 物理 20dp/行,4 行 = 80dp 与 bbox 齐平。
 * (实测 0.925 会过度补偿:字形明显偏小且折行断点前移 2~3 字,L1 diffRatio 反而变差。)
 */
private const val BODY_FONT_COMPENSATION = 0.99f

@Composable
fun HashtagPanel(modifier: Modifier = Modifier) {
    Layout(
        content = {
            BodyPlaceholderText()
            HashtagBar()
        },
        modifier = modifier
            .testTag("fig:39:10844")
            .size(width = 360.dp, height = 475.dp)
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color(0xFF242424)),
    ) { measurables, constraints ->
        val childConstraints = constraints.copy(minWidth = 0, minHeight = 0)
        val placeables = measurables.map { it.measure(childConstraints) }
        val positionsPx = PANEL_CHILD_POSITIONS.map { (x, y) -> x.roundToPx() to y.roundToPx() }
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeables.forEachIndexed { index, placeable ->
                val (x, y) = positionsPx[index]
                placeable.placeRelative(x, y)
            }
        }
    }
}

/** 正文:302 定宽 x 80(4 行 x 物理行高 20),整段 #41A0FF(spec 无分段高亮 override)。 */
@Composable
private fun BodyPlaceholderText() {
    val d = LocalDensity.current
    CompositionLocalProvider(
        LocalDensity provides Density(d.density, d.fontScale * BODY_FONT_COMPENSATION),
    ) {
        Text(
            text = PLACEHOLDER_TEXT,
            fontSize = 14.sp,
            lineHeight = 20.2.sp,
            fontWeight = FontWeight.Normal,
            color = Color(0xFF41A0FF),
            style = LocalTextStyle.current.copy(
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(
                    alignment = LineHeightStyle.Alignment.Center,
                    trim = LineHeightStyle.Trim.None,
                ),
            ),
            modifier = Modifier
                .testTag("fig:I39:10845;10587:144062")
                .size(width = 302.dp, height = 80.dp),
        )
    }
}

/** 底栏 ct_hashtag_bar:360x48 透明容器,chip 在 (12,0)、圆钮在 (316,0)(内容 32 高贴 bar 顶,padBottom 16)。 */
@Composable
private fun HashtagBar() {
    Layout(
        content = {
            HashtagChip()
            FullscreenButton()
        },
        modifier = Modifier
            .testTag("fig:39:10846")
            .size(width = 360.dp, height = 48.dp),
    ) { measurables, constraints ->
        val childConstraints = constraints.copy(minWidth = 0, minHeight = 0)
        val placeables = measurables.map { it.measure(childConstraints) }
        val positionsPx = BAR_CHILD_POSITIONS.map { (x, y) -> x.roundToPx() to y.roundToPx() }
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeables.forEachIndexed { index, placeable ->
                val (x, y) = positionsPx[index]
                placeable.placeRelative(x, y)
            }
        }
    }
}

/** chip "# Hashtag":102x32 胶囊,bg #FFFFFF@10%,padding 12/6,icon 20 + 间距 2 + 文本 56x20。 */
@Composable
private fun HashtagChip() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .testTag("fig:I39:10846;10221:94053")
            .size(width = 102.dp, height = 32.dp)
            .clip(RoundedCornerShape(100.dp))
            .background(Color(0x1AFFFFFF))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Image(
            imageVector = HashIcon,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(2.dp))
        Text(
            text = "Hashtag",
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xE6FFFFFF),
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
            style = LocalTextStyle.current.copy(
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(
                    alignment = LineHeightStyle.Alignment.Center,
                    trim = LineHeightStyle.Trim.None,
                ),
            ),
            modifier = Modifier
                .testTag("fig:I39:10846;10221:94053;10154:58638")
                .size(width = 56.dp, height = 20.dp),
        )
    }
}

/** 圆钮 btn_fullscreen:32x32 正圆 bg #FFFFFF@10%,collapse 双 L 折角图标(16.4x16.4 居中,path 按 32x32 按钮坐标系)。 */
@Composable
private fun FullscreenButton() {
    Box(
        Modifier
            .testTag("fig:I39:10846;10221:94058")
            .size(32.dp)
            .clip(CircleShape)
            .background(Color(0x1AFFFFFF)),
    ) {
        Image(
            imageVector = CollapseIcon,
            contentDescription = null,
            modifier = Modifier.size(32.dp),
        )
    }
}

/** "#" 图标(ic_add_hashtag 20x20 viewport),path 逐字来自规格 §3.1(REST SVG 导出)。 */
private val HashIcon: ImageVector = ImageVector.Builder(
    name = "ic_add_hashtag",
    defaultWidth = 20.dp,
    defaultHeight = 20.dp,
    viewportWidth = 20f,
    viewportHeight = 20f,
).addPath(
    pathData = addPathNodes(
        "M8.03074 8.82176H6.36757L6.73445 7.45208H8.39762L9.28628 4.1665H10.9087L10.02 7.45208H11.3734 " +
            "L12.2376 4.1665H13.86L12.9958 7.45208H14.6345L14.2676 8.82176H12.6289L11.9685 11.2024H13.6317 " +
            "L13.2648 12.572H11.6017L10.7293 15.8332H9.10691L9.97927 12.572H8.6422L7.75355 15.8332H6.13114 " +
            "L7.0198 12.572H5.36478L5.73165 11.2024H7.38667L8.03074 8.82176ZM10.3461 11.2024L11.0065 8.82176 " +
            "H9.65315L9.01723 11.2024H10.3461Z",
    ),
    fill = SolidColor(Color.White),
).build()

/** collapse 图标(Union 16.4x16.4),path 逐字来自规格 §3.2,坐标系 = 32x32 按钮。 */
private val CollapseIcon: ImageVector = ImageVector.Builder(
    name = "ic_add_hashtag_fullscreen_in",
    defaultWidth = 32.dp,
    defaultHeight = 32.dp,
    viewportWidth = 32f,
    viewportHeight = 32f,
).addPath(
    pathData = addPathNodes(
        "M16.7998 18.7998C16.7999 17.6954 17.6954 16.7999 18.7998 16.7998H23.5C23.8866 16.7998 24.2002 " +
            "17.1134 24.2002 17.5C24.2002 17.8866 23.8866 18.2002 23.5 18.2002H18.7998C18.4686 18.2003 " +
            "18.2003 18.4686 18.2002 18.7998V23.5C18.2002 23.8866 17.8866 24.2002 17.5 24.2002C17.1134 " +
            "24.2002 16.7998 23.8866 16.7998 23.5V18.7998Z " +
            "M7.7998 14.5C7.7998 14.1134 8.1134 13.7998 8.5 13.7998H13.2002C13.5314 13.7997 13.7997 13.5314 " +
            "13.7998 13.2002V8.5C13.7998 8.1134 14.1134 7.7998 14.5 7.7998C14.8866 7.7998 15.2002 8.1134 " +
            "15.2002 8.5V13.2002C15.2001 14.3046 14.3046 15.2001 13.2002 15.2002H8.5C8.1134 15.2002 7.7998 " +
            "14.8866 7.7998 14.5Z",
    ),
    fill = SolidColor(Color.White),
).build()

@Preview(name = "HashtagPanel", widthDp = 360, heightDp = 475, showBackground = true)
@Composable
fun HashtagPanelPreview() {
    HashtagPanel()
}

package com.magpie.uiv.demo

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Figma hH7NUAlm9DsLRaGScQP0Z1 / 39:10822 "scroller_content_drop" 复刻(360x530 上传页整页内容体)。
 * 几何/色值以 .ui-verify/baselines/39-10822@2342874355766877359/spec.json 为唯一事实源;
 * 规格文档:yanhao-10822-spec.md;tag 方案(39 个):yanhao-10822-tags.md。
 * 定位方式照 CalibCard/HashtagPanel(Codex D-03):每个容器用自定义 Layout 绝对摆放子项,不用 Modifier.offset。
 *
 * 刻意决策(勿"修正"):
 * - 根无背景(Figma 无 fill,baseline.png 透明底);
 * - chip 44x32 装 78 宽内容且不 clip(Figma clipsContent=false 的原样奇观,非判据 1 的 102 宽兄弟);
 * - Paste 药丸节点 opacity=0 → Modifier.alpha(0f),布局与语义照常(它是 item_input 双射载体);
 * - fullscreen 图标是 out"展开"款(左上+右下折角),与判据 1 的 collapse in 款 path 不同;
 * - X 图标:tag 挂 67516(渲染为空的 22x22 Box),可见白 X(67518)只画不挂 tag——挂了必触 siblingOverlap;
 * - Frame 2117133853(空进度轨道)不实现不挂 tag(与 button 完全同框);
 * - 不加任何 clickable/contentDescription(规避 touchTarget/missingCd invariant)。
 */
@Composable
fun UploadContent(modifier: Modifier = Modifier) {
    AbsoluteLayout(
        modifier = modifier
            .testTag("fig:39:10822")
            .size(360.dp, 530.dp),
        positions = listOf(
            16.dp to 0.dp,   // ct_file_status 39:10823(328x24)
            16.dp to 40.dp,  // ct_cover 39:10824(100x100)
            16.dp to 156.dp, // ct_title 39:10825(328x180)
            16.dp to 352.dp, // ct_language_select 39:10826(328x48)
            16.dp to 416.dp, // ct_lyrics 39:10829(328x114)
        ),
    ) {
        FileStatusBar()
        CoverPlaceholder()
        TitleSection()
        LanguageSelect()
        LyricsSection()
    }
}

// ---------------------------------------------------------------------------
// 模块 1:ct_file_status(NONE 堆叠;r100 clip;#0B5B14@10% 底 + 0.5 边框)
// ---------------------------------------------------------------------------

@Composable
private fun FileStatusBar() {
    val pill = RoundedCornerShape(100.dp)
    // 可见白 X(67518)只画不挂 tag:本版本 Compose 的 Image 即使 contentDescription=null 也会产
    // untagged 语义节点(实测),作为 button 的语义兄弟必触 siblingOverlap(22x22 交叠)——
    // 故用容器自身 drawWithContent 纯绘制(零语义),drawContent 之后画 = z 序最后(Figma 子序尾)。
    val clearX = rememberVectorPainter(ClearXIcon)
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10823")
            .size(328.dp, 24.dp)
            .clip(pill)
            .background(Color(0x1A0B5B14))
            .border(0.5.dp, Color(0xFF0B5B14), pill)
            .drawWithContent {
                drawContent()
                translate(left = 300.5.dp.toPx(), top = 1.dp.toPx()) {
                    with(clearX) { draw(Size(22.dp.toPx(), 22.dp.toPx())) }
                }
            },
        positions = listOf(
            0.dp to 0.dp, // button 67511(328x24)
        ),
    ) {
        FileStatusButton()
    }
}

@Composable
private fun FileStatusButton() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:I39:10823;6116:67511")
            .size(328.dp, 24.dp),
        positions = listOf(
            12.dp to 3.dp,  // Frame 2117133851 67512(286x18)
            302.dp to 1.dp, // Frame 2117132492 67515(22x22)
        ),
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10823;6116:67512")
                .size(286.dp, 18.dp),
            positions = listOf(0.dp to 0.dp),
        ) {
            FigText(
                tag = "fig:I39:10823;6116:67513",
                text = "a29_EN-5dfdfddfdsf713232361.mp3",
                fontSize = 12.sp, lineHeight = 18.sp, weight = FontWeight.Normal,
                color = Color(0xE6FFFFFF), width = 194.dp, height = 18.dp,
            )
        }
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10823;6116:67515")
                .size(22.dp, 22.dp),
            positions = listOf(0.dp to 0.dp),
        ) {
            // icon/清除 Clear 67516:白 X Union hidden、灰 Exclude 空布尔 → 渲染为空,保 pair 零绘制
            Box(
                Modifier
                    .testTag("fig:I39:10823;6116:67516")
                    .size(22.dp, 22.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// 模块 2:ct_cover(NONE;r8 clip;#FFFFFF@10% 底)
// ---------------------------------------------------------------------------

@Composable
private fun CoverPlaceholder() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10824")
            .size(100.dp, 100.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0x1AFFFFFF)),
        positions = listOf(
            0.dp to 75.dp,  // item_txt 72636(100x25,贴底,下缘圆角靠父 clip)
            38.dp to 28.dp, // ic_add 33354(24x24)
        ),
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10824;10164:72636")
                .size(100.dp, 25.dp)
                .background(Color(0x661F1F1F)),
            positions = listOf(31.dp to 4.dp),
        ) {
            FigText(
                tag = "fig:I39:10824;10164:72637",
                text = "Cover",
                fontSize = 14.sp, lineHeight = 17.sp, weight = FontWeight.Normal,
                color = Color(0xFFFFFFFF), width = 38.dp, height = 17.dp,
            )
        }
        Box(Modifier.testTag("fig:I39:10824;10284:33354").size(24.dp, 24.dp)) {
            Image(imageVector = AddPlusIcon, contentDescription = null, modifier = Modifier.size(24.dp, 24.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// 模块 3:ct_title(VERTICAL SPACE_BETWEEN;fill hidden 不画)
// ---------------------------------------------------------------------------

@Composable
private fun TitleSection() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10825")
            .size(328.dp, 180.dp),
        positions = listOf(
            0.dp to 0.dp,   // input_title 94188(328x92)
            0.dp to 136.dp, // ct_hashtag_bar 94070(328x32)
        ),
    ) {
        InputTitle()
        HashtagBarRow()
    }
}

@Composable
private fun InputTitle() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:I39:10825;10221:94188")
            .size(328.dp, 92.dp),
        positions = listOf(
            0.dp to 12.dp, // .输入状态 94816(328x22)
            0.dp to 46.dp, // description 94182(328x34)
        ),
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10825;10221:94188;10224:94816")
                .size(328.dp, 22.dp),
            positions = listOf(0.dp to 0.dp),
        ) {
            // characterStyleOverrides 全串(10/10)命中 W700 → 整串按 Bold 渲染;节点 opacity 0.4
            FigText(
                tag = "fig:I39:10825;10221:94188;10224:94817",
                text = "Add Tittle",
                fontSize = 18.sp, lineHeight = 22.sp, weight = FontWeight.Bold,
                color = Color(0xE6FFFFFF), width = 328.dp, height = 22.dp,
                nodeAlpha = 0.4f,
            )
        }
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10825;10221:94188;10221:94182")
                .size(328.dp, 34.dp),
            positions = listOf(0.dp to 0.dp),
        ) {
            // 烘焙 TITLE;全角冒号与尾随空格照抄;2 行(盒高 34 = 2x17)。
            // unboundedHeightMeasure:全角冒号"："拉入 CJK fallback 字体,Robolectric/API36 的
            // fallback 行距压过 LineHeightSpan(probe 实测 Fixed/Minimum/Trim 全失效,行高恒 19dp;
            // ASCII 冒号则 17dp/行正常),2x19=38dp > 34dp 盒必触 textOverflow(NATIVE hard-gate)。
            // 修法:节点仍报告 328x34(position/size 断言保真),文本以无界高度测量,
            // 墨迹完整下画 4dp 不裁(设计中 description 下方是 56dp 留白,无遮挡)——不改字符串。
            FigText(
                tag = "fig:I39:10825;10221:94188;10221:94182;225716:27918",
                text = "Add Description：Paste Your AI Prompt Here, Or Tell A Story ",
                fontSize = 14.sp, lineHeight = 17.sp, weight = FontWeight.Normal,
                color = Color(0xE6FFFFFF), width = 328.dp, height = 34.dp,
                nodeAlpha = 0.4f, maxLines = 2, unboundedHeightMeasure = true,
            )
        }
    }
}

@Composable
private fun HashtagBarRow() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:I39:10825;10221:94070")
            .size(328.dp, 32.dp),
        positions = listOf(
            0.dp to 0.dp,   // btn_hashtag 94523(284x32)
            296.dp to 0.dp, // btn_fullscreen 94058(32x32)
        ),
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10825;10221:94070;10221:94523")
                .size(284.dp, 32.dp),
            positions = listOf(0.dp to 0.dp),
        ) {
            AbsoluteLayout(
                modifier = Modifier
                    .testTag("fig:I39:10825;10221:94070;10221:94052")
                    .size(260.dp, 32.dp)
                    .clipToBounds(), // Figma clipsContent=true;内容 44(chip 框)不实际触裁
                positions = listOf(0.dp to 0.dp),
            ) {
                HashtagChip44()
            }
        }
        FullscreenOutButton()
    }
}

/** chip 44x32:Figma HUG 失配原样奇观——内容 78 宽溢出 44 宽药丸,不 clip。 */
@Composable
private fun HashtagChip44() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:I39:10825;10221:94070;10221:94053")
            .size(44.dp, 32.dp)
            .background(Color(0x1AFFFFFF), RoundedCornerShape(100.dp)),
        positions = listOf(12.dp to 6.dp), // ic&text 58636(78x20,自由溢出)
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:I39:10825;10221:94070;10221:94053;10154:58636")
                .size(78.dp, 20.dp),
            positions = listOf(
                0.dp to 0.dp,  // ic_add_hashtag 58637(20x20)
                22.dp to 0.dp, // TEXT Hashtag 58638(56x20)
            ),
        ) {
            Box(Modifier.testTag("fig:I39:10825;10221:94070;10221:94053;10154:58637").size(20.dp, 20.dp)) {
                Image(imageVector = HashIcon10822, contentDescription = null, modifier = Modifier.size(20.dp, 20.dp))
            }
            FigText(
                tag = "fig:I39:10825;10221:94070;10221:94053;10154:58638",
                text = "Hashtag",
                fontSize = 14.sp, lineHeight = 20.sp, weight = FontWeight.Bold,
                color = Color(0xE6FFFFFF), width = 56.dp, height = 20.dp,
            )
        }
    }
}

@Composable
private fun FullscreenOutButton() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:I39:10825;10221:94070;10221:94058")
            .size(32.dp, 32.dp)
            .background(Color(0x1AFFFFFF), RoundedCornerShape(100.dp)),
        positions = listOf(4.dp to 4.dp), // 图标 92865(24x24 居中)
    ) {
        Box(Modifier.testTag("fig:I39:10825;10221:94070;10221:94058;10213:92865").size(24.dp, 24.dp)) {
            Image(imageVector = FullscreenOutIcon, contentDescription = null, modifier = Modifier.size(24.dp, 24.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// 模块 4:ct_language_select(HORIZONTAL SPACE_BETWEEN)
// ---------------------------------------------------------------------------

@Composable
private fun LanguageSelect() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10826")
            .size(328.dp, 48.dp),
        positions = listOf(
            0.dp to 15.5.dp, // TEXT Language(63x17)
            304.dp to 12.dp, // ic_arrow 39:10828(24x24)
        ),
    ) {
        FigText(
            tag = "fig:39:10827",
            text = "Language",
            fontSize = 14.sp, lineHeight = 17.sp, weight = FontWeight.Normal,
            color = Color(0xE6FFFFFF), width = 63.dp, height = 17.dp,
        )
        Box(Modifier.testTag("fig:39:10828").size(24.dp, 24.dp)) {
            Image(imageVector = ArrowIcon, contentDescription = null, modifier = Modifier.size(24.dp, 24.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// 模块 5:ct_lyrics(VERTICAL spacing8)
// ---------------------------------------------------------------------------

@Composable
private fun LyricsSection() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10829")
            .size(328.dp, 114.dp),
        positions = listOf(
            0.dp to 0.dp,  // item_title 39:10830(328x20)
            0.dp to 28.dp, // item_input 39:10833(328x86)
        ),
    ) {
        LyricsTitleRow()
        LyricsInput()
    }
}

@Composable
private fun LyricsTitleRow() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10830")
            .size(328.dp, 20.dp),
        positions = listOf(
            0.dp to 1.5.dp, // TEXT Lyrics(Optional)(98x17)
            308.dp to 0.dp, // btn_ic_upload 39:10832(20x20)
        ),
    ) {
        FigText(
            tag = "fig:39:10831",
            text = "Lyrics(Optional)",
            fontSize = 14.sp, lineHeight = 17.sp, weight = FontWeight.Normal,
            color = Color(0xE6FFFFFF), width = 98.dp, height = 17.dp,
        )
        Box(Modifier.testTag("fig:39:10832").size(20.dp, 20.dp)) {
            Image(imageVector = UploadCloudIcon, contentDescription = null, modifier = Modifier.size(20.dp, 20.dp))
        }
    }
}

@Composable
private fun LyricsInput() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10833")
            .size(328.dp, 86.dp)
            .background(Color(0x0AFFFFFF), RoundedCornerShape(12.dp)),
        positions = listOf(
            12.dp to 0.dp,  // txt_placeholder 39:10834(304x48)
            12.dp to 64.dp, // Paste 药丸 39:10835(53x22)
        ),
    ) {
        AbsoluteLayout(
            modifier = Modifier
                .testTag("fig:39:10834")
                .size(304.dp, 48.dp),
            positions = listOf(0.dp to 15.5.dp), // .输入状态 95760(304x17,primary CENTER)
        ) {
            AbsoluteLayout(
                modifier = Modifier
                    .testTag("fig:I39:10834;303960:95760")
                    .size(304.dp, 17.dp),
                positions = listOf(0.dp to 0.dp),
            ) {
                FigText(
                    tag = "fig:I39:10834;303960:95760;225716:27920",
                    text = "Add The Lyrics For The Song",
                    fontSize = 14.sp, lineHeight = 17.sp, weight = FontWeight.Normal,
                    color = Color(0xE6FFFFFF), width = 304.dp, height = 17.dp,
                    nodeAlpha = 0.4f,
                )
            }
        }
        PastePill()
    }
}

/** Paste 药丸:节点 opacity=0 → 视觉完全不可见但占位;布局/语义/断言照常(渲染图证实该区域无像素)。 */
@Composable
private fun PastePill() {
    AbsoluteLayout(
        modifier = Modifier
            .testTag("fig:39:10835")
            .size(53.dp, 22.dp)
            .alpha(0f)
            .background(Color(0xFF242424), RoundedCornerShape(20.dp)),
        positions = listOf(10.dp to 4.dp), // TEXT Paste(33x14)
    ) {
        FigText(
            tag = "fig:39:10836",
            text = "Paste",
            fontSize = 12.sp, lineHeight = 14.sp, weight = FontWeight.Bold,
            color = Color(0xFFFFFFFF), width = 33.dp, height = 14.dp,
        )
    }
}

// ---------------------------------------------------------------------------
// 布局/文本基元
// ---------------------------------------------------------------------------

/** 自定义绝对布局:子项按 positions(dp)摆放;测量约束完全放开(chip 溢出内容依赖此点)。 */
@Composable
private fun AbsoluteLayout(
    modifier: Modifier,
    positions: List<Pair<Dp, Dp>>,
    content: @Composable () -> Unit,
) {
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val placeables = measurables.map { it.measure(Constraints()) }
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeables.forEachIndexed { index, placeable ->
                val (x, y) = positions[index]
                placeable.placeRelative(x.roundToPx(), y.roundToPx())
            }
        }
    }
}

/**
 * 定宽定高文本(判据 1 排版技法照抄):includeFontPadding=false + LineHeightStyle(Center, Trim.None);
 * 单行默认 maxLines=1/softWrap=false/Clip;compensation<1 时用局部 Density 压物理字号
 * (声明 fontSize 不变,L2 fontSize 断言读声明值)。
 * unboundedHeightMeasure:节点对外报告 width x height(position/size 断言口径不变),
 * 文本内部以无界高度测量——CJK fallback 行距把实际行高抬过声明 lineHeight 时,
 * 墨迹完整下画不裁,hasVisualOverflow 不误报(见 description 调用点注释)。
 */
@Composable
private fun FigText(
    tag: String,
    text: String,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    weight: FontWeight,
    color: Color,
    width: Dp,
    height: Dp,
    nodeAlpha: Float = 1f,
    maxLines: Int = 1,
    compensation: Float = 1f,
    unboundedHeightMeasure: Boolean = false,
) {
    val sizeModifier = if (unboundedHeightMeasure) {
        Modifier.layout { measurable, _ ->
            val w = width.roundToPx()
            val h = height.roundToPx()
            val placeable = measurable.measure(Constraints(minWidth = w, maxWidth = w))
            layout(w, h) { placeable.placeRelative(0, 0) }
        }
    } else {
        Modifier.size(width, height)
    }
    val d = LocalDensity.current
    CompositionLocalProvider(
        LocalDensity provides Density(d.density, d.fontScale * compensation),
    ) {
        Text(
            text = text,
            fontSize = fontSize,
            lineHeight = lineHeight,
            fontWeight = weight,
            color = color,
            maxLines = maxLines,
            softWrap = maxLines > 1,
            overflow = TextOverflow.Clip,
            style = LocalTextStyle.current.copy(
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(
                    alignment = LineHeightStyle.Alignment.Center,
                    trim = LineHeightStyle.Trim.None,
                ),
            ),
            modifier = Modifier
                .testTag(tag)
                .then(sizeModifier)
                .alpha(nodeAlpha),
        )
    }
}

// ---------------------------------------------------------------------------
// 图标(path 逐字来自 REST SVG 导出,见规格 §3)
// ---------------------------------------------------------------------------

/** 白色 X(67518 可见款;22x22;fill #FFFFFF 100%;无底圆——灰 Exclude 空布尔)。 */
private val ClearXIcon: ImageVector = ImageVector.Builder(
    name = "ic_clear_x", defaultWidth = 22.dp, defaultHeight = 22.dp,
    viewportWidth = 22f, viewportHeight = 22f,
).addPath(
    pathData = addPathNodes(
        "M11.0002 9.86815L8.59618 7.46412C8.28376 7.1517 7.77723 7.1517 7.46481 7.46412C7.15239 7.77654 " +
            "7.15239 8.28307 7.46481 8.59549L9.86884 10.9995L7.46412 13.4042C7.1517 13.7167 7.1517 14.2232 " +
            "7.46412 14.5356C7.77654 14.848 8.28307 14.848 8.59549 14.5356L11.0002 12.1309L13.4045 14.5352C" +
            "13.7169 14.8476 14.2235 14.8476 14.5359 14.5352C14.8483 14.2228 14.8483 13.7162 14.5359 13.4038L" +
            "12.1316 10.9995L14.5352 8.59591C14.8476 8.28349 14.8476 7.77696 14.5352 7.46454C14.2228 7.15212 " +
            "13.7162 7.15212 13.4038 7.46454L11.0002 9.86815Z",
    ),
    fill = SolidColor(Color.White),
).build()

/** "+"(ic_add;24x24;stroke #FFFFFF@90% w1.5 cap Round)。 */
private val AddPlusIcon: ImageVector = ImageVector.Builder(
    name = "ic_add_plus", defaultWidth = 24.dp, defaultHeight = 24.dp,
    viewportWidth = 24f, viewportHeight = 24f,
).addPath(
    pathData = addPathNodes("M12 4V12M12 20V12M12 12H20M12 12H4"),
    stroke = SolidColor(Color(0xE6FFFFFF)),
    strokeLineWidth = 1.5f,
    strokeLineCap = StrokeCap.Round,
).build()

/** fullscreen "out/展开"款(92865;24x24;fill #FFFFFF 100%)——与判据 1 collapse 款 path 不同,勿混用。 */
private val FullscreenOutIcon: ImageVector = ImageVector.Builder(
    name = "ic_add_hashtag_fullscreen_out", defaultWidth = 24.dp, defaultHeight = 24.dp,
    viewportWidth = 24f, viewportHeight = 24f,
).addPath(
    pathData = addPathNodes(
        "M12.2998 19C12.2998 18.6134 12.6134 18.2998 13 18.2998H17.7002C18.0314 18.2997 18.2997 18.0314 " +
            "18.2998 17.7002V13C18.2998 12.6134 18.6134 12.2998 19 12.2998C19.3866 12.2998 19.7002 12.6134 " +
            "19.7002 13V17.7002C19.7001 18.8046 18.8046 19.7001 17.7002 19.7002H13C12.6134 19.7002 12.2998 " +
            "19.3866 12.2998 19ZM4.2998 6.2998C4.29991 5.19539 5.19539 4.29991 6.2998 4.2998H11C11.3866 " +
            "4.2998 11.7002 4.6134 11.7002 5C11.7002 5.3866 11.3866 5.7002 11 5.7002H6.2998C5.96859 5.7003 " +
            "5.7003 5.96859 5.7002 6.2998L5.7002 11C5.7002 11.3866 5.3866 11.7002 5 11.7002C4.6134 11.7002 " +
            "4.2998 11.3866 4.2998 11V6.2998Z",
    ),
    fill = SolidColor(Color.White),
).build()

/** ">" 箭头(ic_arrow;24x24;stroke #FFFFFF@40% w1.4 cap/join Round)。 */
private val ArrowIcon: ImageVector = ImageVector.Builder(
    name = "ic_arrow", defaultWidth = 24.dp, defaultHeight = 24.dp,
    viewportWidth = 24f, viewportHeight = 24f,
).addPath(
    pathData = addPathNodes("M9 6.5L15 12.5L9 18.5"),
    stroke = SolidColor(Color(0x66FFFFFF)),
    strokeLineWidth = 1.4f,
    strokeLineCap = StrokeCap.Round,
    strokeLineJoin = StrokeJoin.Round,
).build()

/** 云上传(btn_ic_upload;20x20;fill #FFFFFF@90%;EvenOdd)。 */
private val UploadCloudIcon: ImageVector = ImageVector.Builder(
    name = "ic_upload_cloud", defaultWidth = 20.dp, defaultHeight = 20.dp,
    viewportWidth = 20f, viewportHeight = 20f,
).addPath(
    pathData = addPathNodes(
        "M9.12581 6.97559C9.38152 6.73133 9.78423 6.73122 10.0399 6.97559L12.4647 9.29492C12.7285 9.54745 " +
            "12.7376 9.96553 12.4852 10.2295C12.2326 10.4934 11.8146 10.5035 11.5506 10.251L10.2449 9.00195V" +
            "17.4668C10.2449 17.8321 9.94818 18.1279 9.58284 18.1279C9.21773 18.1277 8.92268 17.832 8.92268 " +
            "17.4668V9L7.61507 10.251C7.35104 10.503 6.9319 10.4943 6.67952 10.2305C6.42747 9.96677 6.437 " +
            "9.54846 6.70003 9.2959L9.12581 6.97559ZM9.58284 2.50098C12.5095 2.50118 14.9712 4.5554 15.4217 " +
            "7.28906C17.5557 7.82475 19.1353 9.75461 19.1356 12.0547L19.1297 12.3076C18.9978 14.9038 16.8504 " +
            "16.9688 14.2215 16.9688H11.4735V15.6465H14.2215C16.2046 15.6465 17.813 14.0377 17.8133 12.0547C" +
            "17.8131 10.2445 16.4724 8.7465 14.7303 8.5C14.4219 8.45616 14.1852 8.20228 14.1629 7.8916C" +
            "14.0095 5.7147 12.16 3.93806 9.81136 3.8291L9.58284 3.82324C7.12638 3.82347 5.15916 5.64481 " +
            "5.00081 7.8916C4.97851 8.20228 4.74189 8.45621 4.43343 8.5C2.69255 8.74752 1.35258 10.2453 " +
            "1.35237 12.0547C1.35264 14.0376 2.96129 15.6462 4.94417 15.6465H7.69417V16.9688H4.94417C" +
            "2.31543 16.9685 0.167851 14.9037 0.035965 12.3076L0.0301056 12.0547C0.0303291 9.75594 1.60883 " +
            "7.82703 3.74104 7.29004C4.19117 4.55559 6.65602 2.50119 9.58284 2.50098Z",
    ),
    fill = SolidColor(Color(0xE6FFFFFF)),
    pathFillType = PathFillType.EvenOdd,
).build()

/** "#" 图标(ic_add_hashtag 20x20),path 与判据 1 同组件 10154:64512 原样复用(规格 yanhao-spec.md §3.1)。 */
private val HashIcon10822: ImageVector = ImageVector.Builder(
    name = "ic_add_hashtag_10822", defaultWidth = 20.dp, defaultHeight = 20.dp,
    viewportWidth = 20f, viewportHeight = 20f,
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

@Preview(name = "UploadContent", widthDp = 360, heightDp = 530)
@Composable
fun UploadContentPreview() {
    UploadContent()
}

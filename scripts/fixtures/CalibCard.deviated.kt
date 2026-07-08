package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Canonical Calibration Contract 的 Compose 实现(单一事实源见子计划 header 后合同表)。
 * 几何/色值/文案不得偏离合同表;T1.4 的 seeded deviations 以本文件为唯一被改对象。
 * CalibBadge 独立为单行调用,供 T1.4 D4(缺失节点)做单行机械移除。
 *
 * 定位方式(Codex D-03):四个叶子由自定义 Layout 按 CHILD_POSITIONS 摆放,而非 Modifier.offset——
 * offset 是绘制期位移,不体现在 positionInRoot 等语义几何属性(全报 (0,0)),会导致 L2 位置断言失明。
 * 摆放坐标与 content{} 中子节点的声明顺序一一对应(title/subtitle/swatch/badge)。
 */
private val CHILD_POSITIONS = listOf(
    16.dp to 16.dp,  // fig:1:101 CalibTitle
    12.dp to 36.dp,  // fig:1:102 CalibSubtitle
    12.dp to 60.dp,  // fig:1:103 CalibSwatch
    296.dp to 12.dp, // fig:1:104 CalibBadge
)

@Composable
fun CalibCard(modifier: Modifier = Modifier) {
    Layout(
        content = {
            Text(
                text = "Calibration Card",
                fontSize = 14.sp,
                color = Color(0xFFFFFFFF),
                modifier = Modifier
                    .testTag("fig:1:101")
                    .size(width = 200.dp, height = 20.dp),
            )
            Text(
                text = "Known geometry fixture",
                fontSize = 12.sp,
                color = Color(0xFF99B3E6),
                modifier = Modifier
                    .testTag("fig:1:102")
                    .size(width = 200.dp, height = 16.dp),
            )
            Box(
                Modifier
                    .testTag("fig:1:103")
                    .size(width = 80.dp, height = 40.dp)
                    .background(Color(0xFFFF9900))
            )
        },
        modifier = modifier
            .testTag("fig:1:100")
            .size(width = 360.dp, height = 200.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF3366CC)),
    ) { measurables, constraints ->
        val childConstraints = constraints.copy(minWidth = 0, minHeight = 0)
        val placeables = measurables.map { it.measure(childConstraints) }
        val positionsPx = CHILD_POSITIONS.map { (x, y) -> x.roundToPx() to y.roundToPx() }
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeables.forEachIndexed { index, placeable ->
                val (x, y) = positionsPx[index]
                placeable.placeRelative(x, y)
            }
        }
    }
}

@Composable
private fun CalibBadge() {
    Box(
        Modifier
            .testTag("fig:1:104")
            .size(width = 52.dp, height = 20.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFFF3B30))
    )
}

@Preview(name = "CalibCard", widthDp = 360, heightDp = 200, showBackground = true)
@Composable
fun CalibCardPreview() {
    CalibCard()
}

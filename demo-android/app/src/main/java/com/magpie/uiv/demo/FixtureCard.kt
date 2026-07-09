package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage

/**
 * 内容态 fixture 卡片(T3.4,设计 3.3)。根 Column 宽 360dp、高 wrap(LARGE_LIST 免意外裁剪),
 * 定位靠布局排布(D-03:禁 offset 主定位);元素均挂 testTag 供语义导出。
 * RTL 态以 LocalLayoutDirection.Rtl 包裹 TYPICAL 内容;其余态按内容变化分支。
 * 图片全经 FakeImageLoaderEngine / model=null(ERROR 态)确定性占位,零网络零抖动。
 * 禁碰 CalibCard.kt(标定合同排他),本卡为独立 fixture 组件。
 */
@Composable
fun FixtureCard(state: ContentState) {
    val effective = if (state == ContentState.RTL) ContentState.TYPICAL else state
    val direction = if (state == ContentState.RTL) LayoutDirection.Rtl else LayoutDirection.Ltr
    CompositionLocalProvider(LocalLayoutDirection provides direction) {
        Column(
            modifier = Modifier
                .testTag("fixtureCard")
                .width(360.dp)
                .background(Color(0xFFF5F5F5))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 标题:LONG_TEXT 喂 amplify(TITLE,120) → 必溢出;TYPICAL 文案 fontSize 16sp 稳落 200dp 内(不溢出,保 RTL invariant-only pass)。
            val titleText = if (effective == ContentState.LONG_TEXT) {
                ContentFixtures.amplify(ContentFixtures.TITLE, 120)
            } else {
                ContentFixtures.TITLE
            }
            Text(
                text = titleText,
                fontSize = 16.sp,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
                modifier = Modifier.testTag("fixtureTitle").width(200.dp),
            )

            when (effective) {
                ContentState.EMPTY ->
                    Text("—", fontSize = 14.sp, modifier = Modifier.testTag("fixtureBody"))
                ContentState.LOADING -> {
                    Box(Modifier.testTag("fixtureSkeleton1").width(200.dp).height(16.dp).background(Color(0xFFE0E0E0)))
                    Box(Modifier.testTag("fixtureSkeleton2").width(160.dp).height(16.dp).background(Color(0xFFE0E0E0)))
                }
                ContentState.LARGE_LIST ->
                    Column(Modifier.testTag("fixtureList")) {
                        repeat(30) { i ->
                            Text(
                                "Row ${i + 1}",
                                fontSize = 10.sp,
                                maxLines = 1,
                                modifier = Modifier.testTag("fixtureRow$i").height(16.dp),
                            )
                        }
                    }
                else ->
                    // fillMaxWidth + 多行:正文在整宽内自由换行,不触 textOverflow(保 TYPICAL/RTL invariant 干净)。
                    Text(
                        ContentFixtures.BODY,
                        fontSize = 14.sp,
                        maxLines = 3,
                        modifier = Modifier.testTag("fixtureBody").fillMaxWidth(),
                    )
            }

            // 头像:ERROR 态 model=null 走确定性失败占位(Coil 语义:null→fallback/error);cd 非空 + clickable 触控 48dp。
            AsyncImage(
                model = if (effective == ContentState.ERROR) null else "https://fixture/avatar.png",
                contentDescription = "头像",
                fallback = ColorPainter(Color(0xFF999999)),
                error = ColorPainter(Color(0xFFCC3333)),
                modifier = Modifier
                    .testTag("fixtureAvatar")
                    .size(48.dp)
                    .clickable {},
            )
        }
    }
}

@Preview(name = "FixtureCard", widthDp = 360)
@Composable
fun FixtureCardPreview(@PreviewParameter(ContentStateProvider::class) state: ContentState) {
    FixtureCard(state)
}

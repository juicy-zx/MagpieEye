# uiv-design-to-layout 测试档案(RED-GREEN,2026-07-16)

技法/参考类 skill,按 writing-skills 规程做应用场景测试(subagent 无/有 skill 各跑一次同一任务)。

## 测试任务(两轮同一题)

给定 3 节点 spec 节选(root FRAME 360×56 + TEXT@(16,19.5,80,17) + INSTANCE ic_switch@(308,16,36,24)),
要求产出:XML 布局 + ScreenshotTest + 确切校验命令与失败修复思路。纯写作,不读仓库。

## RED(无 skill,sonnet 基线)——7 处失败

1. tag 裸写 `android:tag="7:100"`,缺 `fig:` 前缀 → join 全空
2. 命名铁律全违:自造 dump 路径 `build/uiv/dumps/settings_row.json` + 手写 File 落盘
3. 自造 API `ViewDump.captureTree`(制品真实 API 是 ViewDumpRule)
4. 自造 CLI `uiv check --spec --dump --level L2`(真实为 --preview/--node/--demo/--module + .ui-verify 契约)
5. `@Config(sdk=[33])` 随手写(会触发 android-all 下载);漏 `@GraphicsMode(NATIVE)`
6. 不产 PNG(无 roborazzi)→ check 必 render_harness_error
7. 用 SwitchCompat 承载 36×24 图标(自带 clickable)→ touchTarget<48dp 门违规,agent 无意识

(基线也有做对的:FrameLayout+margin 绝对摆放、精确 dp、includeFontPadding=false、EXACTLY measure——skill 保留不重复教。)

## GREEN(带 skill,同 sonnet 同题)——7 处全治

fig: 前缀 ✓;SettingsRow 四处同名 ✓;真实 CLI+mapping.json+baselines/7-100@ver ✓;
sdk=36+NATIVE ✓;captureRoboImage+roborazzi 接线提醒 ✓;**主动拒绝 SwitchCompat 换纯 View 并说明 touchTarget 理由** ✓;
ViewDumpRule ✓。另正确套用修复表到本屏具体节点。无新 rationalization,REFACTOR 无需追加。

## 脚本地面真值测试

`scripts/spec_to_layout_table.py` 对真实 yanhao 冻结 spec(39:10822,122 节点)输出的 rel 偏移
与已通过 uiv check(pass:true,matched 39/39)的手写布局 margin 逐点一致:
39:10828 rel=(304,12) of 39:10826;39:10827 rel=(0,15.5);39:10836 rel=(10,4) of 39:10835。

---

## 档位一:tools:tag 生产净化(RED-GREEN,2026-07-16)

场景题:3 节点 spec(7:100 FRAME 360×56 / 7:101 TEXT / 7:102 INSTANCE),硬约束"生产 res/layout 禁 android:tag",要求 L2 join 仍全配对。

**skill 侧基线做对的(增补不重复教,如实保留)**:

- 正确推断 dump 读的是运行时 View.getTag(),XML android:tag 只是 setTag 语法糖
- 给出可行的手工方案:测试内 inflate 后 findViewById(...).tag = "fig:..." 逐个赋值
- 主动规避 SwitchCompat touchTarget 坑(用 ImageView + 行容器承载点击)
- 对 src/test/res 覆盖法的漂移风险有自觉披露

**skill 侧 RED(增补前,现版 skill,sonnet)——4 处失败**:

1. 每屏手写 tag 样板:逐节点 findViewById+setTag 写死在测试里;39 节点的真实屏会产生 39 行手工映射,无通用 helper。
2. 映射脱离 XML 无单一事实源:figmaId↔视图的对应只存在于测试代码,review 布局时看不到节点归属;改布局时映射易漂移。原话:"fig: tag 只在这段测试代码里……临时挂到运行时 View 对象上"。
3. 核心机制不敢确认:"置信度高但不是 100%……建议正式接入前先跑一次 uiv check 验证这个假设"——工具作者侧已验证的事实,消费者侧仍需自证,浪费一轮。
4. 退路方案是反模式:src/test/res 同名布局覆盖(两份 XML 手工同步)被作为正式退路提出,未列为禁止项。

**实现侧 spike 证据(UivToolsTags,id 锚定 v1;yanhao 真实屏 39 tag 含实例路径 id;编排者亲自复核)**:

- BASELINE:既有 android:tag 路线,check pass:true,39/39 配对
- RED:布局改用 tools:tag、未接 helper 时,check 失败于 `subReason: tag_coverage_low`
- GREEN:接入 `UivToolsTags.apply(root, File(...))` 后,check pass:true,39/39 配对,与 android:tag 基线逐字段一致

**GREEN 判据(五条,增补 skill 重测同题须满足)**:

1. 布局 XML 使用 xmlns:tools + tools:tag(每视图旁声明 figmaId,单一事实源)
2. 测试仅一行 UivToolsTags.apply(root, File(...)),零逐节点样板
3. 明确陈述机制已验证(不再要求消费者先自证)
4. 不再把 src/test/res 覆盖法作为退路;涉及时明确标注为禁止的反模式
5. 保留基线原有正确点(touchTarget 规避、几何转写等)

对应治疗:RED①②→ SKILL.md"生产净化"节三步法(helper 一行调用 + 映射留在 XML tools:tag 属性即单一事实源);RED③→ 节内"机制"段落陈述已验证事实,不再要求消费者自证;RED④→ 节内"明令禁止"段落明文禁止 src/test/res 覆盖法。

**GREEN(带增补 skill,新鲜 sonnet 同题重测)——五判据全过**:

tools:tag+id 锚三节点齐全 ✓;测试仅一行 UivToolsTags.apply ✓;机制按已验证事实定论陈述(AAPT2 剥离/运行时回填,引 39/39 回归)✓;src/test/res 覆盖法全文未再出现 ✓;基线正确点保留(纯 View 占位规避 touchTarget、几何精确转写、四处同名)✓。
无新 rationalization,REFACTOR 无需追加。另主动披露一条诚实边界(非失败点):装饰性节点的 uiv_* id 本质仍是"为测试而生的产线信息",合规若按精神而非字面审查,需与合规方对齐边界。

---

## 勘误(2026-07-16):ui-verify-setup.md 在线拉取命令过时

RED(实测即失败证据):按文档原文 `uiv baseline pull --fixture <runDir> ...` 执行 → EISDIR exit 2——`--fixture` 实为罐头 fixture 文件路径而非 runDir,且该命令从未接 REST(args.ts:131 注释停在"T1.2 仅 fixture 模式;REST 通道待 B1 PAT",PAT 到位后未回填)。
GREEN:改用 `pin`(index.ts:127 口径 4:无 --fixture 且有 FIGMA_PAT → REST)对 qobuz 1:15987 一次冻结 291 节点 spec + 自动写 mapping.json 成功。文档"取得冻结 spec 的两条路"第 1 条已改为 pin 口径并内嵌勘误注记。
代码侧跟进(只登记不实施):baseline pull 回填 REST 通道,或至少在其 usage error 中指向 pin。

---

## 档位二:列表屏(RecyclerView)容器级校验(RED-GREEN,2026-07-16)

场景题:列表屏(360×800:固定标题栏 92 高 + 列表区 360×680 十行 68 高间距 0 + MiniPlayer 悬浮压末行;行 0 HD 变体、行 9 Label 变体;每行独立 Figma id;生产用 RecyclerView)接入 uiv check。

**skill 侧基线做对的(增补不重复教,如实保留)**:

- fig: 字符串全程不进生产代码(Adapter/ViewHolder/布局零 figmaId 感知)——档位一"生产净化"节的迁移生效
- 提出 `recycler.childCount == 10` 运行时哨兵意识(前提破坏时响亮失败)
- 对覆盖缺口如实披露而非隐瞒;L1 advisory 定位正确(不为像素改已过 L2 的几何)
- 验证目标切分有意识(提出整屏 A / 行组件 B 两案并权衡)

**skill 侧 RED(增补前,现版 skill,sonnet)——5 处失败**:

1. 放弃列表容器级验证:主推方案 B = 按 viewType 切 3 个单行组件测试(main/first/last 各一份基线),10 行整体排列、行间关系、容器双射/派生断言全部缺席,并把它定性为"诚实的、有意为之的覆盖缺口,不是遗漏"——实际上通用桩 Adapter + spec 驱动 fixture 能完全闭合该缺口,工具能力被低估、覆盖被不必要地放弃。
2. item 布局分裂 3 份(item_song_row / _first / _last):变体本质是显隐+约束推移,单一并集布局即可;3 份布局 = 3 倍漂移面,违背"生产交付物持续演进"定位。
3. "可滚动 = 不可验"的误判:方案 A(整屏/整列表)被绑定在"产品承诺列表永不滚动"前提上,"一旦列表变得可滚动,应直接放弃方案 A"——混淆了生产滚动能力与测试态固定渲染(固定高度 RecyclerView 在 Robolectric 里一次性布局全部行,与滚动无关)。
4. per-position tag 无生成机制:每行独立设计 id 的配对靠测试代码手工映射(tier-1 RED 的手写样板问题在列表场景 ×10 放大),无 spec→fixture 生成器概念。
5. 假数据手造(自造 SongItem 数据)而非 spec 快照原值驱动——文本相关几何与冻结快照脱钩,且快照笔误类内容(如排名 '02')会被"好心修正"。

**实现侧证据(UivStubAdapter + spec_to_list_fixture.py,qobuz 1:15987 真实屏,291 节点冻结 spec;编排者亲手复核)**:

- RED:裸 Adapter(零 tag 灌注)接入 check → `subReason: tag_coverage_low`,coverage 0。
- 迭代 G1:首版灌注接入后 check 报 39 violations(结构/几何未收敛)。
- 迭代 G2:修正后 check `pass:true`、score 1、65/65 全 tag join、0 违规。
- 回归确认:同批复跑档位一 yanhao 39 节点屏,39/39 仍绿,未受本次改动波及。

**GREEN 判据(六条,增补 skill 重测同题须满足)**:

1. 以列表容器为验证 node,10 行在单次 check 中全配对(不放弃容器级覆盖;整屏因 MiniPlayer 遮挡/固定头另切)
2. 单一并集 item 布局(HD/Label 皆在,默认 GONE,约束表达推移),不分裂多份
3. per-position tag/text/显隐由 spec 驱动的 fixture 供给(生成器思路),测试零逐行手写映射
4. 桩数据 = spec 快照原值(含笔误原文,不修正)
5. 明确区分生产滚动与测试态固定渲染,不以"可滚动"为由弃验容器
6. 保留基线正确点(fig: 不进生产代码、childCount 哨兵、诚实披露)

对应治疗:RED①③→ SKILL.md"列表屏(RecyclerView):容器 node + fixture 灌注"节"切法"段(容器 node 验证 + 生产可滚动 ≠ 测试不可验);RED②→ 节内"页面生成"段(并集布局,不分裂多份);RED④→ 节内"验证链"段(pin → spec_to_list_fixture.py 生成器 → UivStubAdapter 一行灌注,含地面真值自检要求);RED⑤→ 节内"快照纪律"段(text 一律 spec 原值,笔误不修正)。

**GREEN(带增补 skill,新鲜 sonnet 同题重测)——六判据全过**:

容器 node 切法 + 整屏渲染但 dump 只取 RecyclerView 子树(合规变体)✓;单一并集布局 + Barrier 且写对 `barrierAllowsGoneWidgets="false"` 关键细节 ✓;rolemap+生成器+一行灌注零逐行手写、占位值明示须以 spec 转写表替换 ✓;桩数据照抄 spec 原文 ✓;"生产可滚动≠测试不可验"精确应用且诚实区分"≠验证了滚动行为" ✓;childCount 哨兵 + item XML 零 fig + 五条能力边界诚实披露(桩 Adapter≠生产 Adapter 正确性证据/地面真值自检是持续成本/变体组合不自动泛化等)✓。
无新 rationalization,REFACTOR 无需追加。注:容器 tag 直写生产 XML 系按 skill 决策树正确选择(场景无合规约束→默认 android:tag 路线),非失败点;其"box 覆盖是 ground truth 强摆再比对、不信任 Barrier 自动重排"的双层保障表述,精准复述了设计意图。

---

## 勘误(2026-07-16):module-wiring.gradle 指示 apply 已退场插件

RED:旧模板 `apply plugin: 'uiv.screenshot'` + buildscript classpath 引入
`uiv-gradle-plugin`,消费者会接线一个 harness 已不再交付的制品(现只发 view-dump／
semantics-dump 两件)。
GREEN:CLI init script 假矩阵三段反证实测——裸调 720px(-P 未达 test worker,假矩阵复现)→带脚本 640px
→CLI 全链路(init script 自动转发)640px,消费模块零构建文件改动。模板已删插件两行,
改为 init script 自动注入口径。

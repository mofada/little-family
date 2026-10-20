---
name: 小家记 (Little Family)
description: 家庭关系档案与生日管理的微信小程序设计系统
colors:
  persimmon: "#d4756a"
  persimmon-deep: "#9c433b"
  persimmon-ink: "#b5564c"
  roasted-bean: "#3d2f2a"
  rice-paper: "#f7f3ef"
  warm-gray: "#6b5751"
  warm-gray-light: "#a99c96"
  ochre: "#d4a76a"
  celadon: "#6b9d8a"
  celadon-ink: "#3f6b5c"
  clay-hairline: "#f2ece8"
  card-white: "#ffffff"
  alert-red: "#b91c1c"
  alert-tint: "#fff1f1"
  scrim: "rgba(0, 0, 0, 0.5)"
  print-rule: "#ddd0c7"
typography:
  editorial:
    fontFamily: "Songti SC, STSong, Noto Serif SC, Source Han Serif SC, serif"
    fontSize: "140rpx"
    fontWeight: 600
    lineHeight: 0.88
    letterSpacing: "-6rpx"
  display-xl:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "60rpx"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-2rpx"
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "44rpx"
    fontWeight: 800
    lineHeight: 1.1
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "38rpx"
    fontWeight: 700
    lineHeight: 1.35
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "31rpx"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "28rpx"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "24rpx"
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif"
    fontSize: "19rpx"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "2rpx"
rounded:
  sharp: "0"
  control: "8rpx"
  stamp: "4rpx"
  sm: "16rpx"
  md: "20rpx"
  lg: "24rpx"
  xl: "28rpx"
  sheet: "40rpx"
  pill: "9999rpx"
spacing:
  xs: "8rpx"
  sm: "12rpx"
  md: "16rpx"
  lg: "20rpx"
  xl: "28rpx"
  "2xl": "40rpx"
components:
  section-card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "28rpx"
  stat-card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "20rpx 8rpx"
    height: "132rpx"
  stat-card-accent:
    backgroundColor: "#fbf1f0"
    rounded: "{rounded.md}"
  button-primary:
    backgroundColor: "{colors.persimmon-ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "22rpx 40rpx"
    height: "80rpx"
  button-secondary:
    backgroundColor: "#eee8e4"
    textColor: "{colors.roasted-bean}"
    rounded: "{rounded.sm}"
    padding: "16rpx 22rpx"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.persimmon}"
    padding: "8rpx 12rpx"
  chip:
    backgroundColor: "#ede6e1"
    textColor: "{colors.warm-gray}"
    rounded: "{rounded.pill}"
    padding: "0 20rpx"
    height: "50rpx"
  chip-active:
    backgroundColor: "{colors.roasted-bean}"
    textColor: "{colors.card-white}"
  member-card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    width: "176rpx"
    height: "220rpx"
  bottom-sheet:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.sheet}"
  tab-bar:
    backgroundColor: "{colors.card-white}"
    height: "56px + env(safe-area-inset-bottom)"
---

# Design System: 小家记 (Little Family)

## Overview

**Creative North Star: "The Almanac Page（挂历的那一页）"**

整套界面是一张铺在木桌上的挂历：米色纸面承接内容，朱红的柿子色只用来标记"今天"和"该做的一件事"。日期被当成挂历上的日期来排——大、居中、独立成格——而不是仪表盘里的指标。深木 hero 已从四个自绘 Tab 页退出，系统的重音只剩柿子日期带一处。

密度是克制的：一屏一件事，至多三个数字，卡片之间靠 28rpx 的呼吸而不是分割线。没有玻璃拟态、没有渐变紫蓝、没有描边贴纸感；温暖来自纸与柿子两种材质感的颜色，而不是插画或阴影堆叠。

**明确的反参考：社交 App 信息流。** 不要无限滚动、不要点赞红心与未读红点、不要"本周家庭活跃度"这类排名与完成度徽章。这是一个私人的、低频但重要的记录工具，不是要被刷的页面。

**Key Characteristics:**
- 米色纸面（#f7f3ef）+ 白色轻浮卡片 + 1rpx 暖色细边
- 柿子红（#d4756a）稀缺使用：主按钮、今日标记、关键数字
- 柿子日期带是全系统唯一的重层，每屏最多一条、约占 15%
- 全暖中性色，没有一处冷灰或蓝灰
- 圆角温和（16–28rpx），药丸只给高度 ≤60rpx 的小控件
- 情绪位用 emoji，功能位用 Lucide 线性图标（TabBar 已接回）

## Colors

一套全暖的调色：纸、柿子、赭黄、青瓷，没有任何冷色参与。

### Primary

- **柿子红 Persimmon** (#d4756a)：选中态 Tab 文字、药丸标签、≤7 天徽章的浅色底，以及 ≥38rpx/700 的大字。白字不压在这一档上。它是全系统唯一的强调色，出现频率应该低到"一眼就能指出今天在哪"。
- **柿子深 Persimmon Deep** (#9c433b)：深柿子表面——日期带渐变终点、深色强调块。白字压在上面是 6.40:1，任意字号都成立。
- **柿子墨 Persimmon Ink** (#b5564c)：白底或浅底上的柿子系小字与按钮文字。#d4756a 在白底上达不到正文对比度，需要这一档更深的同相色；白底按钮文字、行内数字都用它。
- **烘豆棕 Roasted Bean** (#3d2f2a)：正文与标题的主色、深色 chip 的底色。它不是黑，而是被烘过的棕——所有"看起来像黑"的文字都用它。

### Secondary

- **赭黄 Ochre** (#d4a76a)：家族标签与少量暖色点缀。与柿子红同属暖橙相但更黄，用来和强调色拉开距离。
- **青瓷绿 Celadon** (#6b9d8a)：保留给"已加入/成功"这类罕见状态的色块与图标，不要把它变成第二个强调色。
- **青瓷墨 Celadon Ink** (#3f6b5c)：浅底上的成功文字（稻纸上 5.48:1、白底 6.05:1）。#6b9d8a 只做图形与色块，不承载小字。
- **告警红 Alert Red** (#b91c1c)：仅用于删除与错误文案，配告警浅底，不与柿子红混用。
- **告警浅底 Alert Tint** (#fff1f1)：危险按钮与错误提示的底色，只作底、不承载文字。
- **遮罩 Scrim** (`rgba(0, 0, 0, 0.5)`)：底部弹层与选择器的背景遮罩，是系统里唯一允许的纯黑用途。

### Neutral

- **稻纸 Rice Paper** (#f7f3ef)：页面底色。所有页面背景都用它，不用纯白铺满。
- **卡片白 Card White** (#ffffff)：卡片、弹层、TabBar 表面。
- **陶土细线 Clay Hairline** (#f2ece8)：卡片 1rpx 描边、列表分隔。系统的"线"永远是暖色，不是灰。
- **暖灰 Warm Gray** (#6b5751)：次要文字、说明、时间戳。
- **浅暖灰 Warm Gray Light** (#a99c96)：月份、单位、8–10px 的微型标签；再浅就会掉到看不清。

### Named Rules

**The Contrast Tint Rule.** 白底或浅底色上的柿子系文字一律用柿子墨（#b5564c），不用柿子红（#d4756a）。白字压在柿子色上时，底色必须不浅于柿子墨（白字 ≥4.77:1）；亮柿子 #d4756a 只承载 ≥38rpx/700 的大字（3.21:1，够大标题不够正文）。

**The No Cold Gray Rule.** 中性色只允许来自上表的暖色系。`#e5e7eb`、`#6b7280`、`#9ca3af` 这类冷灰一旦出现，整个纸感立刻破功——即使是从旧代码里复制来的。

**The Persimmon Scarcity Rule.** 柿子红在任何一屏的覆盖面积不超过 10%（深柿子日期带 #b5564c→#9c433b 是唯一例外：它本身就是“今天”，每屏最多一条，约占 15% 也成立）。它标记的是"今天"与"唯一该做的一件事"，两个都要强调时，另一个改用赭黄或深棕。

**The Family Color Rule.** 姓氏色（`--family-*`，13 个硬编码姓氏 + 默认 #a8866c）只用于成员卡片描边、头像底和家族标签，永远不作为大面积背景。新增姓氏必须落回 `--family-default`，不要临时发明第 14 个颜色。

## Typography

**Display Font:** 系统无衬线栈 `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif`
**Body Font:** 同一栈（中文落在 PingFang SC）

**Character:** 两套字：正文与控件用系统黑体（PingFang / 系统栈），**展示层用宋体**（`Songti SC`、`Noto Serif SC` 回退）。宋体只给日期数字、账页数字与姓名标题——它是「印刷品」的信号，用多了就变回装饰。不下载字体文件，避免 Android 跳字。

### Hierarchy

- **Editorial** (600, 140rpx, lh 0.88, letter-spacing −6rpx)：宋体的超大日期数字，首页专用，每屏一处。它替页面承担「这是哪一天」，其余元素都退到它下面。
- **Display XL** (800, 60rpx, lh 1, letter-spacing −2rpx)：无人过生日时的日期，或次级页面的大数字。
- **Display** (800, 44rpx, lh 1.1)：大号姓名与关键数字。全屏最多一处。
- **Headline** (700, 38rpx, lh 1.35)：页面级标题、邀请页标题、首页/生日页的今日状态句。
- **Title** (700, 31rpx, lh 1.3)：卡片区标题、成员姓名、分组标题。
- **Body** (400, 28rpx, lh 1.6)：成员信息、说明段落、输入值。
- **Label** (500, 24rpx, lh 1.4)：次要信息、徽章文字、TabBar 标签。
- **Micro** (600, 19rpx, letter-spacing 2rpx)：刻意的窄字距小标题（时间轴年代、单位）；当前页面很少用到，不要为了"有层次"而加。

单位说明：`rpx` 按 750 设计宽度换算，375pt 屏上 1rpx ≈ 0.5px，因此 28rpx ≈ 14px 正文。

### Named Rules

**The Almanac Steps Rule.** 正文字号只用上面六档（Display / Headline / Title / Body / Label / Micro），唯一的例外是 Display XL——它只给日历大数字，每屏最多一处。现存代码里漂移出 15/17/18/21/23/26/27/29/34/36/46/48/62/64/68rpx 等十余个中间值——那是历史遗留，不是新页面的许可。新增界面选最接近的一档，不要发明第 8 档。

**The Weight-Not-Angle Rule.** 中文不做斜体、不做全大写、不加字距（Micro 档除外）。强调靠 700/800 字重与柿子红，不靠变形。

## Layout

小程序固定三段式：自定义导航栏（44px，Android 48px）+ `scroll-view` 主区 + 固定 TabBar（56px + `env(safe-area-inset-bottom)`）。页面用 `height: 100vh` 的纵向 flex 撑满，主区 `flex: 1 1 auto` 自己滚动。

- **左右留白**：页面级 28rpx（`.section` 的 `margin: 0 28rpx`），图谱页内容区略紧，24rpx。
- **卡片内边距**：26–28rpx；列表行上下 18rpx，行之间用 1rpx `clay-hairline` 分隔，最后一行去掉。
- **网格**：单列卡片流；横向 chips 与"直系家庭"横滑行用 `flex` + `gap` 12–16rpx，子项 `min-width: 0`，禁止写死全宽。
- **圆角**：卡片 24–28rpx，统计卡 20rpx，次级容器 16–18rpx。
- **密度**：一屏一个主任务；数字只作辅助（成员数、天数、次数），不做指标墙。
- **页脚**：印刷页用一行 19rpx 宋体版权行收尾（家庭名 · 成员数 · 第 N 天），靠 margin-top: auto 贴近底部，填补内容不足时的空白。
- **无响应式断点**：目标只有手机竖屏。平板按同一版式拉伸，所以布局必须用 flex/百分比，禁止写死 750rpx 全宽。

## Elevation & Depth

两层、加一个重音：米色纸面（无阴影）→ 白色轻浮卡片（小半径暖影），重音只有柿子日期带一处。深度来自纸与色带的对比，不来自阴影强度；深木面板已随四个 Tab 页重做退出。

### Shadow Vocabulary

- **卡片静置** (`0 2rpx 14rpx rgba(0, 0, 0, 0.05)`)：默认卡片、日期带卡、我的页资料卡、列表容器。几乎看不见，只负责把白卡从米底上"抬起来 1mm"。
- **窄控件** (`0 2rpx 10rpx rgba(0, 0, 0, 0.05)`)：搜索框、工具条这类更小的表面。
- **柿子辉光** (`0 8rpx 18rpx rgba(212, 117, 106, 0.2)`)：仅用于主操作按钮与"今日"元素——阴影带强调色，等于把颜色再强调一次。
- **弹层**：不使用大投影，靠 `rgba(0, 0, 0, 0.5)` 的遮罩分离层次。

### Named Rules

**The Warm Shadow Rule.** 所有阴影必须带暖色相（棕或柿子红），禁止 `rgba(0,0,0,0.3)` 这种厚重黑影。系统里最深的一档也只有 0.17 透明度。

**The One Heavy Panel Rule.** 柿子日期带每屏最多一条，含白纸内页面积不超过视口高度的 20%。它是"值得看一眼"的地方，第二块出现就会让整屏变重。

**The Flat-By-Default Rule.** 静止的容器优先用 1rpx 细边 + 色差表达层次；阴影只在卡片需要离开纸面时出现，不为装饰而加。

## Shapes

形态语言是"圆角纸卡"：所有容器都有 16–28rpx 的温和圆角，没有直角容器，也没有超大圆角（唯一例外是底部弹层顶部 40rpx 与全药丸标签）。

- **卡片**：24rpx（首页 section）、26rpx（图谱分区）、28rpx（邀请卡、日期带卡、成员卡）。同一屏内允许两种，不要出现四种。
- **按钮**：大按钮用 16–20rpx 圆角矩形（`.submit` 20rpx、`.primary-button` 18rpx、`.small-button` 16rpx），高度 80rpx 的满宽药丸会被读成标签或聊天气泡；药丸（9999rpx）只给高度 ≤60rpx 的小控件——小按钮、chip、徽章、头像。
- **标签 / 徽章 / chip**：9999rpx 全药丸，高度 36–58rpx。
- **头像与圆形按钮**：50%（68rpx / 80rpx / 120rpx 三档直径）。
- **成员卡**：28rpx 圆角 + 5rpx 姓氏色描边，卡片本身宽 176rpx、高至少 220rpx。
- **分隔线**：1rpx，颜色取 `clay-hairline`、`#f0ebe6` 或印刷页的 `#ddd0c7`；账页用**双细线**（上下各 1rpx、间隔 10–12rpx）代替卡片阴影。
- **印刷页按钮**：8rpx 圆角 + 56rpx 高 + 2rpx 描边 + 1rpx 字距，像一枚小票根；印章保留 4rpx，弹层与纸片仍是 0 圆角。

### Named Rules

**The Hairline Rule.** 不用粗边框划分区域。1rpx 暖色细边 + 背景色差已经足够，2rpx 以上的实线只在"选中"时出现（如被聚焦的成员卡）。

**The Double Rule.** 印刷页（首页）用上下各 1rpx、间隔 10–12rpx 的双细线分段，不用卡片阴影、不用圆角卡片；留白从 26rpx 提到 40rpx。

**The Print Type Rule.** 宋体只用于展示层：日期数字、账页数字、姓名标题。正文、标签、按钮仍是系统黑体。两套字同时挤进一行，是这套系统里最容易变廉价的地方。

## Components

### Buttons

- **Shape:** 大按钮 20rpx 圆角矩形（现存 16–20rpx）；只有高度 ≤60rpx 的小按钮与标签用全药丸（9999rpx）；高度 60rpx（小）/ 80–88rpx（主）。
- **Primary:** 柿子墨底（#b5564c）+ 白字（4.77:1），`22rpx` 上下内边距；带柿子辉光。用于"提交 / 保存 / 邀请 / 生成祝福"。
- **Secondary:** `#eee8e4` 浅暖底 + 烘豆棕字（或 `#f2ece8` 底），与主按钮同宽同高，永远排在主按钮下方或右侧。
- **Outline action（印刷页）：** 2rpx 描边 + 8rpx 圆角 + 56rpx 高、24rpx 字，用于提示行与页脚里的动作（查看 / 开启提醒 / 去补充）。描边用暖灰，主行动用柿子墨描边；整行宽时用 `action--wide`（84rpx 高、两端对齐）。不要再用纯文字当按钮。
- **Text:** 透明底 + 柿子红字，`8rpx 12rpx` 内边距，仅用于真·行内低频操作（"刷新称呼""移除"）；首页这类印刷版式一律改用 Outline action。
- **Danger:** 浅红底 `#fff1f1` + `#b91c1c` 字，只在删除成员时出现。
- **States:** 按压反馈统一用 `hover-class`（`opacity: 0.72` 或 `transform: scale(0.98)`），不做长时动画；禁用态降饱和（`#c8bdb6`）而不是降透明度。

### Chips

- **Style:** 未选中：`#ede6e1` 底 + `warm-gray` 字，高 50rpx，全药丸，最小宽 78rpx。
- **Selected:** 烘豆棕底 + 白字 + 600 字重 + 小投影——选中靠"变深"而不是"变亮"，因为底色本来就是浅的。
- **Usage:** 时间轴与生日页的筛选，横向滚动（`white-space: nowrap`），永远单行。

### Cards / Containers

- **Corner Style:** 24–28rpx
- **Background:** 白（`#ffffff`）置于稻纸上；嵌套的小块（快速导航、输入框）用 `rice-paper` 底。
- **Shadow Strategy:** 见 Elevation——低透明度暖影，不叠加。
- **Border:** `1rpx solid #f2ece8`（部分用 `#eee7e2`、`#f0ebe6`，都属于同一族暖细线）。
- **Internal Padding:** 26–28rpx；窄控件 20rpx 8rpx。

### Inputs / Fields

- **Style:** `rice-paper` 底、16rpx 圆角、无边框、`18rpx 20rpx` 内边距，最小高 72rpx；输入值用烘豆棕 27rpx。
- **Focus:** 小程序无原生 focus ring 约定，靠光标与占位色（`#b5a7a1`）区分；不额外加发光边。
- **Error:** 文案走 `alert-red`，配 `#fff0ee` 底与 14rpx 圆角，出现在字段下方或表单顶部。

### Navigation

- **顶部：** 自定义 `navigation-bar`（44px，Android 48px），标题 17px 粗体居中，透明/米色背景，返回为 24px 线性箭头；详情页左上角返回，不做汉堡菜单。
- **底部 TabBar：** 自定义组件，白底、顶部 1rpx `#f0ece8` 细线、高 56px + 安全区；图标在上、文字 20rpx 在下。图标是自绘线条（24 网格、1.5 描边、方头线帽、81×81 PNG，`npm run icons:generate` 生成），选中态只换颜色不换形状：`#9b7b74` → `#d4756a`，文字同时变朱红。
- **层级：** Tab 页永远不带返回箭头；二级页（家庭管理、邀请、成员编辑）带返回且不显示 TabBar。

### Member Card（签名组件）

组件 `components/member-card` 当前零引用（族谱改成了行卡），规范保留供以后恢复节点图时使用：176rpx 宽、28rpx 圆角、5rpx 姓氏色描边的白卡，内含 68rpx 圆形头像（emoji 或姓名首字）、姓名（24rpx/700）、称呼（20rpx）、年龄（18rpx）。左上角"我"徽章（柿子红 28rpx 圆），右上角生日徽章（赭黄 32rpx 圆）。未关联成员整体降到 `opacity: 0.15` 而不是隐藏——"存在但未纳入"的信息本身有意义。

### Bottom Sheet（成员详情 / 选择器）

从底部升起，占满宽度，`max-height: 88vh`，方角纸片（0 圆角），白底，遮罩 `rgba(0,0,0,0.5)`；关闭按钮是 64rpx 描边块（2rpx 描边、8rpx 圆角）。头部 48rpx 40rpx 内边距，右上角 56rpx 圆形关闭按钮（白底 + 微影）。内部按 `gap: 32rpx` 分段，底部动作区放主/次按钮。

### Date Band（柿子日期带）

系统唯一的渐变表面，首页与生日页共用：`linear-gradient(135deg, #b5564c, #9c433b)`，白字任意字号可用（4.77–6.40:1）；只做卡片顶部色带，圆角随卡片，下方接白纸内页。带内层级固定为 60rpx 日期 → 38rpx 状态句 → 24rpx 农历/星期。每屏最多一条。

## Do's and Don'ts

### Do:

- **Do** 用 28rpx 页面留白与 26–28rpx 卡片内边距，让内容靠纸的边界呼吸，不靠分割线。
- **Do** 给每张白卡配 `1rpx solid #f2ece8` 细边 + 低透明暖影，两个一起用，缺一个就会显得脏或飘。
- **Do** 让柿子红只出现在主按钮、今日标记、关键数字上，一屏至多两处。
- **Do** 大按钮用 20rpx 圆角；药丸只给高度 ≤60rpx 的控件——满宽药丸会被读成标签而不是提交动作。
- **Do** 浅底上的柿子色文字用柿子墨 #b5564c；柿子色深底上只用 #fff——半透明白会把对比度拉到 4.5 以下。
- **Do** 用 emoji 表达情绪（🎂 生日、🏡 空家庭、⏳ 加载中），用线性图标表达功能（返回、关闭、搜索、提交）。
- **Do** 柿子日期带一屏最多一条，且不叠在另一张卡片里；带内只用白色文字。
- **Do** 大号数字（日期、成员数）用 Display XL / Display，标签用 Label + 暖灰，间距 4–8rpx。

### Don't:

- **Don't** 引入冷灰、蓝灰、紫蓝渐变或玻璃拟态——`#e5e7eb`、`#6b7280`、`backdrop-filter: blur()` 都属于破功项。
- **Don't** 做信息流式的无限滚动、点赞/收藏红点、"家族活跃度""本月排行"这类指标——反参考是社交 App，不是别的族谱软件。
- **Don't** 用纯黑 `#000` 作文字色，或纯灰作分隔线；正文一律 `#3d2f2a`，线一律暖色。
- **Don't** 新造字号：15/17/23/26/29/34/36/46/62/68rpx 这些存在于旧代码里的值不要复制到新页面（64rpx 仅作 emoji 字形尺寸，不算字号档）。
- **Don't** 给容器加大于 0.17 透明度的黑色阴影，也不要给静态卡片加"悬浮感"大投影。
- **Don't** 在同一屏放两条日期带，或让色带加内页超过视口高度 20%。
- **Don't** 把家族姓氏色当背景大面积铺开；它就是描边、头像底与标签。

### Known Drift（现状与已定规则的差异，改到哪收敛到哪）

- **图标**：页面与组件里已不再使用 emoji；功能图标是自绘线条（TabBar）或 CSS 形状，情绪位改由排版与朱印承担。
- **字号**：八个页面都收敛到 19/24/28/31/38/44rpx，展示数字另有 Display XL（60rpx）与 Editorial（140rpx）两档，每屏最多一处。
- **未使用的 token**：`--color-secondary`、`--color-teal`、`--color-accent-light`、`--color-gray-50…600`、`--family-*` 姓氏色（`getMemberColor` 实际按性别取色）在 `styles/theme.less` 里定义但全仓库没有 `var()` 引用；要么在下一个相关页面启用，要么删掉。
- **零引用组件**：`components/member-card` 已无页面引用（族谱改用行卡），保留待节点图恢复。
- **印刷版式的单一来源**：`styles/print.less` 持有报头、双细线、方角按钮、账页行与版权行；八个页面都从这里取用，不要再各写一份同义样式。
- **今日块重复**：首页与生日页的「今天」仍是两份实现（首页用 dateline、生日页用日期带），合并成组件是下一步。

---
title: '如何为 Fuwari 博客添加一个精美的“友情链接”页面'
published: 2026-04-06
description: '从数据结构到 Bento 布局引擎，拆解本站友链页的完整实现：一个会自己排版的卡片墙、一套申请友链区块，全部基于 Fuwari + Astro 原生能力，零 UI 框架依赖。'
image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Fuwari', '友情链接', 'CSS Grid']
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 0
---

## 前言

友链页大概是最容易做成"一排头像 + 一句简介"的页面——不是说这样不好，只是当友链超过十条，整齐的方阵就变成了无人细看的墙。

本站的做法是把它做成一面 **Bento 卡片墙**：卡片尺寸不一、错落拼贴，鼠标移上去会浮出简介，点一下展开详情；下方再挂一块「申请友链」区，把申请标准和本站信息摆清楚，附一个一键复制按钮。

:::note[借鉴来源]
视觉与布局思路来自 [时歌的博客（lapis.cafe）](https://www.lapis.cafe/friends/) 的友链页——那面会自己算排版的卡片墙第一次看到就让人想搬。本文不是照抄 DOM，而是把它的布局算法**从 TS 原样移植进 Astro 的客户端脚本**，再按本站的风格重做了配色（主题色 tint 轮换）、卡片交互与申请区块。感谢时歌。
:::

最终成品自上而下是四段：

| 区块 | 作用 |
|---|---|
| 页头 | 标题 + 一句话说明，与全站卡片风格一致 |
| Bento 卡片墙 | 核心。自算排版的友链卡片，支持展开简介、点击外链 |
| 申请友链 | 申请标准 4 条 + 本站信息（含一键复制）+ RSS |
| 评论 | 复用本站自建评论组件，访客可直接留言申请 |

## 一、数据层：先定结构

友链数据单独抽成一个 `.ts`，页面只负责渲染。这样加一条友链就是往数组里推一个对象，不用碰布局代码。

```ts title="src/friends_data.ts"
// 友链数据类型定义
export interface Friend {
    name: string;
    url: string;
    avatar: string;
    description: string;
}

export const friends: Friend[] = [
    {
        name: "AcoFork Blog",
        url: "https://2x.nz/",
        avatar: "https://q2.qlogo.cn/headimg_dl?dst_uin=2726730791&spec=5",
        description: "Protect What You Love!",
    },
    {
        name: "时歌的博客",
        url: "https://www.lapis.cafe/",
        avatar: "https://www.lapis.cafe/avatar.webp",
        description: "理解以真实为本，但真实本身并不会自动呈现",
    },
    // 占位卡：url 写 "#" 时不渲染右上角外链按钮
    { name: "虚位以待", url: "#", avatar: "", description: "这里可以放你的博客" },
];
```

两个约定：

- `url: "#"` 表示占位，页面会跳过外链按钮（见后文渲染层）
- `avatar` 可以留空或写一个随时会失效的外链地址——**不会破图**，因为图片带了 `onerror="this.remove()"`，加载失败会自动降级成首字母色块

## 二、页面骨架

`src/pages/friends.astro` 用主题的 `MainGridLayout` 包一个 `card-base`，内部三个区块依次铺开。这里只摘卡片墙的渲染部分（申请区块是常规的两栏表单式布局，不再展开）：

```astro title="src/pages/friends.astro"
---
import { siteConfig } from "../config";
import { friends } from "../friends_data";

// 每张卡片的主题色 tint：跟随主题 primary + 5 个固定色相轮换
const TINTS = [
    "var(--primary)",
    "oklch(0.70 0.14 250)", // 蓝
    "oklch(0.72 0.14 330)", // 粉
    "oklch(0.70 0.13 165)", // 青
    "oklch(0.72 0.14 30)",  // 橙
    "oklch(0.70 0.14 285)", // 紫
];
---

<div class="friends-bento-grid" data-friends-grid>
    {friends.map((friend, index) => (
        <article
            class="friend-bento-card"
            data-friend-card
            style={`--friend-tint: ${TINTS[index % TINTS.length]}`}
        >
            <button type="button" class="friend-card-surface" aria-expanded="false">
                <span class="friend-card-media" aria-hidden="true">
                    <span class="friend-card-initial">{friend.name.charAt(0)}</span>
                    {friend.avatar && (
                        <img src={friend.avatar} alt="" loading="lazy" decoding="async"
                             onerror="this.remove()" />
                    )}
                </span>
                <span class="friend-card-shade" aria-hidden="true"></span>
                <span class="friend-card-copy">
                    <span class="friend-card-name">{friend.name}</span>
                    <span class="friend-card-desc">{friend.description}</span>
                </span>
            </button>

            {friend.url !== "#" && (
                <a class="friend-card-link" href={friend.url}
                   target="_blank" rel="noopener noreferrer"
                   aria-label={`访问 ${friend.name}`} tabindex="-1">
                    <!-- 右上角外链小图标 -->
                </a>
            )}
        </article>
    ))}
</div>
```

注意结构上的三个细节：

1. **卡片的点击体是 `<button>` 不是 `<a>`**——整卡点击要做的是"展开简介"，跳转交给右上角那个独立的外链按钮。两者职责分开，键盘 Tab 导航才不会混乱（外链按钮默认 `tabindex="-1"`，展开后才可聚焦）。
2. **`--friend-tint` 是内联自定义属性**，每张卡按序号轮换一个色相，后面的配色全部从它派生。
3. 首字母 `<span class="friend-card-initial">` 常驻在图片**底层**：图片加载成功就盖住它，失败被 `onerror` 移除就自然露出——不需要任何 JS 状态判断。

## 三、Bento 布局引擎：让卡片自己排版

这是整页最费笔墨的部分。目标：给定 N 张卡和当前列数，自动决定哪几张做成大卡（`large` 2×2 / `wide` 2×1 / `tall` 1×2），以及每张卡放在第几行第几列，最终拼出一个**没有洞、没有空行、视觉重心均衡**的网格。

### 3.1 先算列数

列数不能写死，得跟容器宽度走。这里复刻 CSS 的 `auto-fill` 算法自己算一遍：

```ts
const gridColumnCount = (grid: HTMLElement): number => {
    const gap = 12;
    const minTrack = 132;
    const width =
        grid.getBoundingClientRect().width ||
        Math.min(1180, Math.max(320, window.innerWidth - 48));
    return Math.max(2, Math.floor((width + gap) / (minTrack + gap)));
};
```

算出列数后，再用 JS 把 `grid-template-columns` 设成固定列数——因为下一步的布局计算必须知道确切列数。

### 3.2 决定要几个大卡、什么形状

```ts
const featuredCount = (count: number): number =>
    count < 7 ? 0 : Math.max(1, Math.round(count / 7));

const shapePool = (count: number, columns: number) => {
    const target = featuredCount(count);
    if (!target || columns < 4) return [];   // 窄屏不做大卡
    const wide  = { type: "wide",  w: 2, h: 1 };
    const tall  = { type: "tall",  w: 1, h: 2 };
    const large = { type: "large", w: 2, h: 2 };
    if (columns < 5) return Array.from({ length: Math.min(target, 2) }, () => wide);
    if (target === 1) return [large];
    if (target === 2) return [large, wide];
    if (target === 3) return [large, wide, tall];
    if (target === 4) return [large, large, wide, tall];
    return [large, large, wide, wide, tall].slice(0, Math.min(target, 5));
};
```

两个保护：**卡片少于 7 张不做大卡**（十来张卡的墙里塞一个巨型卡会显得突兀），**列数小于 4 不做大卡**（手机上 2 列，一张 2×2 就占了整屏）。

### 3.3 摆放大卡：候选位置 + 打分

对每个大卡，枚举所有不重叠的落点，然后按一堆经验规则打分，取最高分：

```ts
const scored = candidates.map((candidate) => {
    const cx = candidate.x + candidate.w / 2;
    const cy = candidate.y + candidate.h / 2;
    // 与已放置大卡的距离越远越好（散开，别挤成一坨）
    const distance = placed.length
        ? Math.min(...placed.map((item) => Math.hypot(cx - (item.x + item.w / 2), cy - (item.y + item.h / 2))))
        : 0;
    let score = distance * 2.2 - candidate.y * 0.55 + Math.random() * 0.6;
    if (candidate.type === "large" && candidate.x + candidate.w >= columns) score -= 2.2;
    if (candidate.type === "wide"  && candidate.y > lowerLine) score += 1.4;
    if (candidate.type === "tall"  && candidate.y > lowerLine) score -= 3.4;
    // ...其余规则见源码
    return { candidate, score };
}).sort((a, b) => b.score - a.score);

placed.push(scored[0].candidate);
```

`Math.random() * 0.6` 这一项很关键：**每次刷新页面的排布略有不同**，十几个友链不会永远按同一个姿势躺着。

### 3.4 填小卡 + 给整个布局打分

大卡放完后，剩下的小卡按行扫描填空位（`fillSmallCards`）。然后对整个布局做一次评分，作为优劣判据：

```ts
const scoreLayout = (layout, columns) => {
    // 统计：洞（被包围的空格）、空行、行首空隙、下半部分行首空隙、
    //      末行空格、大卡间距总和、左右重量差、靠下的 tall、贴右边缘的 large
    return (
        featureDistance * 1.8 - holes * 11 - emptyRows * 80 - leadingGaps * 10
        - lowerLeadingGaps * 16 - finalEmpty * 0.8 - height * 3.5
        - balance * 0.9 - badTall * 10 - edgeLarge * 4 - floatingFeature * 90
    );
};
```

权重的含义大致是：**洞和空行是致命的**（`-11` / `-80`），大卡之间要尽量散开（`+1.8`），左右重量要均衡（`-0.9`），`tall` 卡跑到下半部分要扣分（`-10`）。

### 3.5 跑 500 次取最优

因为摆放过程带随机性，跑一次的结果不一定好。所以——**同一个布局算 500 遍，留分数最高的那个**：

```ts
const buildBestLayout = (count, columns, assignments) => {
    let best = null;
    for (let attempt = 0; attempt < 500; attempt++) {
        const smallIndexes = /* 未被选为大卡的下标 */;
        const features = placeFeatures(assignments, columns, count);
        if (!features) continue;
        const layout = fillSmallCards(features, smallIndexes, columns);
        const score = scoreLayout(layout, columns);
        if (!best || score > best.score) best = { layout, score };
    }
    return new Map((best?.layout || []).map((item) => [item.index, item]));
};
```

500 次纯计算在十几张卡的规模下是毫秒级的，用户完全无感。

:::tip
**必须做缓存**：结果按「列数 + 大卡分配」做 key 存进 `layoutCache`，且只在列数变化时重算。否则窗口 resize 会触发上百次 500 轮计算，风扇直接起飞。本站还在 resize 上加了 160ms 防抖。
:::

## 四、卡片视觉：一条渐变撑起全部质感

配色全部从 `--friend-tint` 派生，用 `color-mix` 和渐变叠出来：

```css
.friend-card-media {
    /* 主题色与卡片底色混合，得到一张低饱和的"色纸" */
    background: color-mix(in oklab, var(--friend-tint), var(--card-bg) 72%);
}

.friend-card-shade {
    background:
        /* 底部渐变：保证白色文字在任意头像上都读得清 */
        linear-gradient(to top, rgba(0,0,0,.76), rgba(0,0,0,.28) 46%, rgba(0,0,0,.04) 78%),
        /* 左下角光晕：用主题色给卡片一点"温度" */
        radial-gradient(circle at 18% 85%, color-mix(in oklab, var(--friend-tint), transparent 54%), transparent 44%);
}
```

三态统一用同一组选择器，一次写全：

```css
.friend-bento-card:hover .friend-card-desc,
.friend-bento-card.is-open .friend-card-desc,
.friend-bento-card:focus-within .friend-card-desc {
    max-height: 5.2em;
    opacity: .9;
    transform: none;
}
```

`focus-within` 那一项是为了键盘用户：Tab 到卡片就能看到简介，不依赖鼠标。

最后是两段媒体查询——移动端固定 2 列并取消悬浮位移（手机上没有 hover），`prefers-reduced-motion` 下关掉全部过渡动画。

## 五、交互：展开、收起、一键复制

卡片点击逻辑很直白：点自己切换展开，同时收起其他卡；点页面空白处全部收起。

```ts
const clickHandler = () => {
    const willOpen = !card.classList.contains("is-open");
    cards.forEach((openCard) => setOpen(openCard, false));
    setOpen(card, willOpen);
};
```

「复制全部」按钮把本站信息（名称 / 地址 / 头像 / 描述 / RSS）拼成一段文本写进剪贴板，2 秒后把按钮文案改回「复制全部」。这个文本是在**服务端**拼好塞进 `data-copy-text` 属性的：

```astro
const copyText = [
    `昵称：${siteConfig.title}`,
    `地址：${import.meta.env.SITE}`,
    `头像：${import.meta.env.SITE}/avatar.png`,
    `描述：${siteConfig.description}`,
    `RSS：${import.meta.env.SITE}/rss.xml`,
].join("\n");
```

站点信息直接读 `src/config.ts` 的 `siteConfig`——**改了站点配置，友链页的申请信息自动同步**，不会出现"博客改名了但友链页还写着旧名"。

## 六、Swup 无刷新导航兼容

本站开了 Swup，切页不重新执行脚本。所有初始化都挂两个事件，并且用一个 `cleanups` 数组收集解绑函数，**每次初始化前先全部执行一遍**，避免重复绑定：

```ts
let cleanups: (() => void)[] = [];

function initFriendsPage() {
    initFriendsBento();  // 内部先 cleanups.forEach(fn => fn())
    initCopyAll();
}

document.addEventListener("astro:page-load", initFriendsPage);
document.addEventListener("swup:page:view", initFriendsPage);
```

这一条对友链页尤其重要：它有全局 `document` 点击监听（点空白收卡片）和 `window` resize 监听，不做清理的话，来回切几次页面就会叠上好几层监听器。

## 七、零散但重要的几个坑

- **图片 `onerror` 必须写**：友链头像是外链，随时可能失效。没有降级的话，首页上会挂一排破图
- **卡片要 `overflow: hidden` + `border-radius`**：图片是 `object-fit: cover` 铺满的，不裁切会溢出圆角
- **`is-clipped` / 展开态别忘 `z-index`**：卡片 hover 时会 `translateY(-4px) scale(1.01)`，不给 z-index 会被相邻卡片盖住阴影
- **大卡数量别贪**：`count / 7` 这个比例是试出来的，超过这个密度整面墙会显得拥挤
- **占位卡别写真实 url**：`url: "#"` 是约定值，页面靠它判断是否渲染外链按钮

## 结语

拆下来看，这页没有用任何 UI 框架：数据是一个数组，布局是 CSS Grid + 一段自算的排列算法，配色全靠 CSS 自定义属性和 `color-mix`，交互是两个事件监听。真正花心思的地方只有那个「让卡片自己排版」的引擎——而它本质上就是**枚举 + 打分 + 取最优**，一个很朴素的思路。

如果你的友链不到十条，其实完全可以省掉布局引擎，直接用 `grid-template-columns: repeat(auto-fill, minmax(132px, 1fr))` 铺方阵——好看，且省事。卡片一多，再考虑让它自己算。

再次感谢 [lapis.cafe](https://www.lapis.cafe/friends/) 提供的布局思路与视觉参考。

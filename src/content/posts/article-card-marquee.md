---
title: '文章卡片魔改：标题溢出滚动与摘要悬停浮层'
published: 2026-08-30
description: 'Fuwari 首页的文章卡片默认会把过长的标题和摘要直接截断（ellipsis / line-clamp），看不全又没处展开。这篇记录我对卡片组件做的两个小魔改：标题超出一行时默认暂停、悬停才像跑马灯一样滚出全文；摘要被截断时悬停弹出固定定位浮层展示完整内容。全部在 src/components/PostCard.astro 一个文件里完成，并重点讲清楚 Swup 无刷新导航下不失效、暗色模式文字不丢色、以及躲开 overflow:hidden 裁剪这几个坑。'
image: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Fuwari', 'Astro', '文章卡片']
category: 博客魔改
draft: false
lang: ''
order: 0
---

Fuwari 的文章列表卡片原本很克制：标题一行放不下就 `text-overflow: ellipsis` 截断，摘要两行（移动端一行）之外的内容直接省略。平时没问题，但遇到长标题（比如带副标题的技术文）或长摘要，读者只能点进去才知道到底是什么。

因此我准备给卡片加了两个轻量交互，都集中在 `src/components/PostCard.astro` 这一个文件里：

1. **标题溢出滚动**：标题只有超出一行时才"滚动出场"，默认静止、鼠标悬停才慢慢滚出全文，滚完自动归位；
2. **摘要悬停浮层**：摘要被 `line-clamp` 截断时，鼠标悬停弹出一个固定定位的小浮层，把完整摘要贴在原卡片旁边。

:::note
两个魔改都刻意做成"按需触发"——没溢出就不滚动、没截断就不弹层。平时列表干干净净，只有真的放不下时才给读者一条出路。
:::

## 一、标题溢出滚动（marquee on overflow）

### 痛点与思路

卡片里的标题是 `a` 链接，原本就是单行 `white-space: nowrap` 被外层裁剪。如果直接上跑马灯动画，所有标题都会一直滚，很吵。

所以我用了一个 `is-overflow` 开关：**只有在 JS 检测到标题真的比容器宽时才挂动画**，而且默认 `animation-play-state: paused`，悬停才 `running`。这样既解决了长标题看不全，又不会打扰正常标题。

### 结构：clip 包 track

HTML 上把标题文字再包两层——外层 `.post-title-clip` 负责裁切，内层 `.post-title-track` 负责承载文字并位移：

```astro
<a href={url} class="... text-3xl ...">
    <span class="post-title-clip">
        <span class="post-title-track">
            {entry.data.order === 1 && <Icon class="inline ..." name="material-symbols:keep-outline-rounded" />}
            {title}
        </span>
    </span>
</a>
```

### 样式：裁切容器 + 渐隐遮罩 + 关键帧

`.post-title-clip` 设 `overflow: hidden` + `white-space: nowrap`，关键是 `container-type: inline-size`——这让内部能用容器查询单位 `100cqw` 精确知道"裁切框有多宽"，后面算位移用得上。

右侧那道渐隐遮罩是给用户一个"后面还有字"的暗示，平时半透明、悬停时消失（因为已经滚出来了）：

```css
.post-title-clip {
    display: block;
    overflow: hidden;
    position: relative;
    container-type: inline-size;
    white-space: nowrap;
}
/* 右侧渐隐遮罩：提示标题未展示完 */
.post-title-clip::after {
    content: "";
    position: absolute;
    top: 0; right: -0.5rem; bottom: 0;
    width: 2.5rem;
    background: linear-gradient(to right, transparent, var(--card-bg));
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
}
.post-title-clip.is-overflow::after { opacity: 1; }
.post-title-clip.is-overflow:hover::after { opacity: 0; }

/* 仅溢出时启用滚动，默认暂停，悬停播放 */
.post-title-clip.is-overflow .post-title-track {
    animation: post-title-scroll 6s linear infinite;
    animation-play-state: paused;
}
.post-title-clip.is-overflow:hover .post-title-track {
    animation-play-state: running;
}
```

关键帧里那个 `min(0px, calc(-100% + 100cqw))` 是精髓：`-100%` 是文字自身宽度，`100cqw` 是裁切框宽度，二者相减就是"溢出量"。用 `min(0px, …)` 包一层，保证位移不会被算成正值（否则会左移过头、右侧留白）。首尾各留 4% 静止，是为了滚动前有个停顿、滚完平滑归位：

```css
@keyframes post-title-scroll {
    0%, 4%   { transform: translateX(0); }
    46%, 54% { transform: translateX(min(0px, calc(-100% + 100cqw))); }
    96%, 100%{ transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
    .post-title-clip.is-overflow .post-title-track { animation: none; }
}
```

:::tip
尊重 `prefers-reduced-motion: reduce`：开了"减少动态效果"系统的用户直接不放动画， accessibility 友好。
:::

### 溢出检测：用 JS 决定要不要滚动

CSS 没法知道"文字到底超没超宽"，所以用一个 `initTitleClips()` 在渲染后比较 `track.scrollWidth` 和 `clip.clientWidth`：

```ts
function initTitleClips() {
    document.querySelectorAll<HTMLElement>(".post-title-clip").forEach((el) => {
        const track = el.querySelector<HTMLElement>(".post-title-track");
        if (!track) return;
        el.classList.toggle("is-overflow", track.scrollWidth > el.clientWidth + 1);
    });
}
document.addEventListener("astro:page-load", initTitleClips);
document.addEventListener("swup:page:view", initTitleClips);
initTitleClips();
```

后面三行是 Swup 兼容的关键——Fuwari 用 Swup 做无刷新导航，切页后卡片是重新插进 DOM 的，必须重新检测一遍溢出。

## 二、摘要悬停浮层

### 痛点与思路

摘要用 `line-clamp-2 md:line-clamp-1` 截断。截断只是"看不见"，内容还在 DOM 里。我想要的体验是：**鼠标停在摘要上，把被裁掉的那部分以浮层形式展示出来**。

```astro
<!-- description -->
<div class="post-desc transition text-75 mb-3.5 pr-4 line-clamp-2 md:line-clamp-1">
    { description || remarkPluginFrontmatter.excerpt }
</div>
```

### 浮层挂 body，躲开 overflow:hidden

最容易踩的坑：卡片外层是 `overflow: hidden`（圆角裁切需要），要是在卡片内部塞浮层，会被一起裁掉。所以浮层节点在运行时**直接挂到 `document.body` 上**，用 `position: fixed` 定位，天然不受任何祖先裁切影响：

```ts
const tip = document.createElement("div");
tip.className = "post-desc-tip";
tip.style.cssText = [
    "position:fixed", "display:none", "z-index:60", "pointer-events:none",
    "background:var(--card-bg)", "border:1px solid var(--line-divider)",
    "padding:0.5rem 0.875rem", "border-radius:0.5rem",
    "font-size:0.875rem", "line-height:1.6", "max-height:40vh", "overflow-y:auto",
    "box-shadow:0 4px 16px rgba(0,0,0,0.12)", "white-space:pre-wrap", "word-break:break-word",
].join(";");
document.body.appendChild(tip);
```

### 暗色文字色：必须 is:global + 显式颜色

运行时 `createElement` 出来的节点**不在 Astro 的 scoped 样式作用域内**，普通 `color: inherit` 在暗色下会失效（本项目 body 本身没有主题文字色变量，这点在之前评论区暗色修复时也踩过）。所以浮层文字色单独用 `<style is:global>` 写死：

```astro
<style is:global>
    .post-desc-tip {
        color: rgb(0 0 0 / 0.75);
    }
    .dark .post-desc-tip {
        color: rgb(255 255 255 / 0.75);
    }
</style>
```

### 定位与防 XSS

`showDescTip()` 先判断摘要到底截没截（`scrollHeight <= clientHeight + 2` 就直接不弹），再用 `textContent` 而非 `innerHTML` 回填——摘要来自 frontmatter，理论上可信，但用 `textContent` 能彻底杜绝任何注入风险：

```ts
function showDescTip(el: HTMLElement) {
    if (el.scrollHeight <= el.clientHeight + 2) return;          // 没截断就不弹
    tip.textContent = el.textContent?.trim() ?? "";               // textContent 渲染，杜绝 XSS
    tip.style.display = "block";
    const r = el.getBoundingClientRect();
    const card = el.closest(".card-base");
    const cr = card ? card.getBoundingClientRect() : r;
    tip.style.left = Math.max(8, cr.left + 12) + "px";
    tip.style.maxWidth = Math.min(560, cr.width - 24) + "px";
    // 默认显示在摘要下方；视口放不下则改到上方
    const th = tip.offsetHeight;
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 8) top = r.top - th - 6;
    tip.style.top = Math.max(8, top) + "px";
}
```

### 事件委托 + 滚动收起

这里有个常见陷阱：鼠标在摘要内部子节点间移动，会不断触发 `mouseout`/`mouseover`，浮层会闪。解决办法是用 `closest(".post-desc")` 判断目标，并在 `mouseout` 时用 `relatedTarget` 确认鼠标是不是真的离开了摘要：

```ts
function hideDescTip() { tip.style.display = "none"; }

// 事件委托，Swup 切页无需重新绑定
document.addEventListener("mouseover", (e) => {
    const el = (e.target as Element | null)?.closest?.(".post-desc") as HTMLElement | null;
    if (el) showDescTip(el);
    else hideDescTip();
});
document.addEventListener("mouseout", (e) => {
    const el = (e.target as Element | null)?.closest?.(".post-desc") as HTMLElement | null;
    // 鼠标在摘要内部子节点间移动不收起
    if (el && !(e.relatedTarget instanceof Element && el.contains(e.relatedTarget))) hideDescTip();
});
window.addEventListener("scroll", hideDescTip, { passive: true });
```

用 `document` 级的事件委托而非给每张卡片绑监听，好处是 Swup 切页后**完全不用重新绑定**——新卡片自动生效。另外 `scroll` 时立刻收起浮层，避免页面滚走了浮层还卡在原地。

:::important
两个魔改的所有"重新初始化"都只靠 `astro:page-load` / `swup:page:view` 两个事件（标题检测）或文档级事件委托（摘要浮层），**没有任何组件内的局部 `addEventListener`**。这正是 Swup 无刷新导航下不重复绑定、不泄漏监听器的关键。
:::

## 小结

核心思路很精炼

- **溢出才动**：标题用 JS 检测 `scrollWidth > clientWidth` 开 `is-overflow`，摘要用 `scrollHeight > clientHeight` 判断是否截断，正常卡片完全零开销；
- **躲开裁切**：浮层挂 `body` + `position: fixed`，不被卡片 `overflow: hidden` 吃掉；
- **暗色色值写死**：运行时创建 / 文档级浮层节点不在 scoped 作用域，明暗文字色必须 `is:global` 显式给 `rgb()`，别指望 `inherit`。


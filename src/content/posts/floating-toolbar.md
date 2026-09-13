---
title: '右侧悬浮工具栏：回顶部、随机一篇、目录抽屉与评论跳转是怎么做的'
published: 2026-08-30
description: '博客右侧竖排的五个悬浮按钮——回到顶部、回首页、随机一篇、目录、跳转评论区。原版 Fuwari 只有一个孤零零的回顶部按钮，这篇文章记录我如何把它改造成五合一工具栏：fixed 定位的两层 pointer-events 处理、全走主题变量的暗色适配、SSR 预判显隐、抽屉式目录，以及在 Swup 无刷新导航下不失控的一堆细节。'
image: 'https://images.unsplash.com/photo-1517180102446-f3ece451e9d8?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Fuwari', 'Astro', '悬浮工具栏']
category: 博客魔改
draft: false
lang: ''
order: 0
---

盯一眼博客右侧：五个竖排的小方块——回到顶部、回首页、随机一篇、目录、跳转评论区。Fuwari 原版这里只有一个「回到顶部」按钮，桌面大屏的目录又固定在右边缘（2xl 以上才显示），窄屏幕直接没目录可用。索性改造成一个五合一的悬浮工具栏，目录做成抽屉、随机文章做成按钮，手机上也能呼出。

这篇文章把它的实现拆开记录，核心就一个文件：`src/components/control/BackToTop.astro`。

## 整体结构：五个按钮 + 一个抽屉

组件本体分两块：一列 `.toolbar-btn` 按钮（五个），加一个从右侧滑出的 `#toc-drawer` 抽屉（带遮罩）。挂载位置在 `MainGridLayout.astro` 里、整个 main-grid **之外**：

```astro
<BackToTop></BackToTop>
```

为什么放外面？因为工具栏用的是 `position: fixed`，而 CSS 里只要**任何祖先元素带 `transform`**，fixed 就会降级成相对那个祖先定位——main-grid 里动画类横飞，放里面早晚出事。这也是整个组件最容易被忽略的一个坑。

## 定位：两层 pointer-events

工具栏容器需要「贴在右侧但不挡鼠标」，处理分两层：

```css
.floating-toolbar-wrapper {
    position: fixed;
    right: 1rem;
    bottom: 5rem;
    z-index: 50;
    pointer-events: none;   /* 容器整体放行点击 */
}
.floating-toolbar {
    pointer-events: auto;   /* 只有按钮本身接收点击 */
}
```

容器 `none`、按钮组 `auto`，这样容器虽然占着一块 fixed 区域，但空白处点击会穿透，不会挡住底下内容的交互。

## 按钮外观：全部走主题变量

每个按钮是 2.75rem（大屏 3rem）的圆角方块，样式上没有写死一个颜色：

```css
.toolbar-btn {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    color: var(--primary);           /* 图标用主题色 */
    background: var(--card-bg);      /* 底色跟卡片同源 */
    border: 1px solid var(--line-divider);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    transition: transform 0.2s ease, opacity 0.3s ease, background 0.2s ease;
}
.toolbar-btn:hover { background: var(--btn-plain-bg-hover); }
.toolbar-btn:active { transform: scale(0.92); }   /* 按压回缩 */
```

图标是 astro-icon 的 material-symbols 系列。因为颜色全走 `--primary` / `--card-bg` / `--line-divider` 这些主题变量，亮暗模式切换时按钮自动跟着变，一行额外的暗色适配代码都不用写。

## 五个按钮各自的逻辑

### 1. 回到顶部：滚动过 banner 才出现

按钮初始就带着 `hide` 类：

```css
.toolbar-btn.hide {
    opacity: 0;
    transform: translateX(5rem) scale(0.9);   /* 飞出屏幕外 */
    pointer-events: none;
}
```

显隐由 `Layout.astro` 里的全局滚动监听控制——滚动超过 banner 高度才把它请回来：

```js
window.onscroll = function () {
    let bannerHeight = window.innerHeight * (BANNER_HEIGHT / 100)
    if (document.documentElement.scrollTop > bannerHeight) {
        backToTopBtn.classList.remove('hide')
    } else {
        backToTopBtn.classList.add('hide')
    }
}
```

页面在顶部时按钮不存在（视觉上），滚下去才从右侧滑入——比「一直挂着但置灰」舒服。点击动作本身一行：`window.scroll({ top: 0, behavior: 'smooth' })`。

### 2. 回首页：一个 a 标签就够了

```astro
<a href={url("/")} class="toolbar-btn" aria-label="回到主页">
    <Icon name="material-symbols:home-outline-rounded" class="toolbar-icon"></Icon>
</a>
```

零 JS。`url()` 是主题的工具函数，自动处理 base path，别手写死 `/`。

### 3. 目录：SSR 预判 + 抽屉 + 克隆的细节

目录按钮只在文章页显示，这里做了**两道判断**：

- **SSR 阶段先判一次**（避免首屏闪烁）：构建时就按当前路径决定要不要渲染 `display:none`；
- **客户端再校正**：Swup 切页后 URL 变了，由 JS 重新按 `pathname.includes('/posts/')` 更新。

点击按钮弹出右侧抽屉。抽屉的目录内容不是另算一份，而是**从当前页隐藏的桌面版目录里现抄**：

```js
// 只克隆 <a> 链接，避免克隆 table-of-contents 自定义元素触发其 connectedCallback
const sourceLinks = document.querySelectorAll('#toc table-of-contents > a');
sourceLinks.forEach(function (a) {
    container.appendChild(a.cloneNode(true));
});
```

这里有个小坑：主题的目录是个 `<table-of-contents>` 自定义元素，自带 `connectedCallback` 做高亮初始化。如果整棵克隆，插入抽屉时会再触发一次初始化逻辑，行为不可控。所以只克隆里面的 `<a>` 链接，样式由抽屉自己接管。

交互上每次打开前重新填充（保证和当前文章一致），打开时 `body` 锁滚动，Esc、点遮罩、点目录项都能关。

### 4. 跳转评论区：存在性检测

```js
const commentEl = document.getElementById('post-comment');
const hasComment = !!commentEl && commentEl.children.length > 0;
commentBtn.style.display = (isPost && hasComment) ? '' : 'none';
```

不光要在文章页，还得页面里真有评论区锚点且有内容——毕竟评论区是懒加载的，Swup 刚切过来时可能还没就位。点击就是 `scrollIntoView({ behavior: 'smooth' })` 平滑滚到评论区。至于评论区本身是怎么搭的，见[自建评论系统那篇](/posts/self-hosted-comments/)。

### 5. 随机一篇文章：构建时注入 URL 列表

第五个按钮，点一下随机跳一篇——而且走 Swup 无刷新跳转，不打断阅读节奏：

```astro
{/* 随机一篇文章：URL 列表由构建时注入，客户端随机选一篇跳转 */}
<div id="random-post-btn" class="toolbar-btn"
     data-post-urls={JSON.stringify(postUrls)}
     onclick="toolbarRandomPost()" role="button" aria-label="随机一篇文章" tabindex="0">
    <Icon name="material-symbols:shuffle-rounded" class="toolbar-icon"></Icon>
</div>
```

`postUrls` 来自 Astro 的 `getCollection('posts')`，构建时就把全部文章 URL 算好塞进 `data-post-urls`，客户端直接读，不用运行时再去拉接口。点击逻辑：

```js
function toolbarRandomPost() {
    var urls = JSON.parse(btn.getAttribute('data-post-urls') || '[]');

    // 尽量不随机到当前正在读的这篇
    var here = window.location.pathname;
    var pool = urls.filter(function (u) { return u !== here; });
    if (pool.length === 0) pool = urls;

    var target = pool[Math.floor(Math.random() * pool.length)];

    // 走 Swup 无刷新跳转，失败则退化为普通跳转
    if (window.swup && typeof window.swup.navigate === 'function') {
        window.swup.navigate(target);
    } else {
        window.location.href = target;
    }
}
```

三个细节：

1. **构建时注入**：全部文章链接在 `astro build` 时就算好写死进 HTML，首屏零请求、零闪烁，也利于 SEO。代价是需要重新构建才能更新列表——但对静态博客这本来就是常态。
2. **排除当前篇**：`filter(u => u !== here)` 把正在读的这篇踢出候选池，避免"随机到自己"的尴尬；万一只有这一篇，再退回全量。
3. **优先 Swup**：`window.swup.navigate` 做无刷新跳转，阅读体验连续；拿不到 swup 再降级成 `location.href`。

> 如果想做成「首页置顶卡片」那种样式（而不是工具栏按钮），思路是一样的，只是组件形态不同——见[随机文章那篇](/posts/fuwari-random-post/)。

## Swup 无刷新导航下的三个细节

全站开了 Swup，切页不刷新，这是工具栏最容易失控的地方，处理就三条：

1. **监听替换时机**：`swup.hooks.on('content:replace', ...)`——DOM 换完立刻关掉可能开着的抽屉、重新判一遍按钮可见性；
2. **懒加载兜底**：评论区是异步渲染的，切到文章页 1.5 秒后再补一次检查，否则评论按钮该出现时没出现；
3. **防重复绑定**：整个脚本用 IIFE 包住，事件绑定加标志位，切 N 次页也只绑一份监听。

## 收尾

做完回看，这个工具栏没有一行复杂逻辑，难的全是「考虑到了没有」：transform 会让 fixed 失效、容器要放行点击、自定义元素不能整棵克隆、Swup 切页后状态要自己重置。写下来备忘，也方便想抄作业的朋友直接对照。

工具栏的目录 / 评论按钮只在文章页亮起，而文章页的侧栏默认是折起来的——这套折叠状态机另写在[侧栏折叠那篇](/posts/collapsible-sidebar/)；侧栏里的头像与签名则是[换掉那只紫鸟](/posts/sidebar-avatar-signature/)那篇的活儿。

## 相关阅读

- [读完那篇「跳出舒适区」，我把侧栏折了起来](/posts/collapsible-sidebar/)：侧栏默认折叠后的文章页，工具栏的目录 / 评论按钮只有在文章页才亮起，状态机就在那篇里。
- [换掉那只紫鸟：侧边栏头像与手写签名的折腾记录](/posts/sidebar-avatar-signature/)：同属侧栏周边的视觉折腾。
- [自建评论系统：用 Cloudflare Workers + D1 替换 Giscus](/posts/self-hosted-comments/)：右下角"跳评论"那个按钮，直达的就是这套自建评论区。
- [在 Fuwari 中添加「随机一篇文章」功能](/posts/fuwari-random-post/)：另一种"首页置顶卡片"式的随机文章方案，和本篇工具栏集成版思路不同，可对照看。

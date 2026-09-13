---
title: '在 Fuwari 中添加 “随机一篇文章” 功能'
published: 2026-03-30
description: '本仓库实际采用的「随机一篇文章」实现：集成在右侧悬浮工具栏里，构建时把所有文章 URL 注入按钮，点击即走 Swup 无刷新跳转，并尽量不随机到当前这篇。顺带附上另一种「首页置顶卡片」思路作为参考。'
image: 'https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Fuwari', 'Astro', '随机文章']
category: 博客魔改
draft: false
---

博客写久了，老文章就沉在列表底下没人看。加一个「随机一篇文章」按钮，让读者随手跳一篇，是提升旧文曝光最省事的办法。

本仓库最终落地的版本，是**把它做成右侧悬浮工具栏的一个按钮**——不是独立卡片，不占文章流位置。核心代码全在 `src/components/control/BackToTop.astro`。

## 本仓库的做法：工具栏第三个按钮

整个组件在构建时就通过 Astro 的 `getCollection('posts')` 把全部文章 URL 算好，塞进按钮的 `data-post-urls` 属性里。客户端点击时直接读这个列表，不走运行时请求，首屏零延迟、也利于 SEO。

```astro
---
import { getCollection } from "astro:content";
import { getPostUrlBySlug, url } from "../../utils/url-utils";

// 构建时注入全部文章 URL，供「随机一篇文章」在客户端随机跳转
const posts = await getCollection("posts");
const postUrls = posts.filter((p) => !p.data.draft).map((p) => getPostUrlBySlug(p.slug));
---

<!-- 悬浮工具栏：回顶部 / 回主页 / 随机一篇 / 显示目录 / 跳评论 -->
<div id="random-post-btn" class="toolbar-btn"
     data-post-urls={JSON.stringify(postUrls)}
     onclick="toolbarRandomPost()" role="button" aria-label="随机一篇文章" tabindex="0">
    <Icon name="material-symbols:shuffle-rounded" class="toolbar-icon"></Icon>
</div>
```

点击逻辑也很短：

```js
function toolbarRandomPost() {
    var btn = document.getElementById('random-post-btn');
    if (!btn) return;

    var urls = [];
    try { urls = JSON.parse(btn.getAttribute('data-post-urls') || '[]'); } catch (e) { urls = []; }
    if (!Array.isArray(urls) || urls.length === 0) return;

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

1. **构建时注入**：文章链接在 `astro build` 时就写死进 HTML，首屏零请求、零闪烁。代价是需要重新构建才能更新列表——静态博客本来就是常态。
2. **排除当前篇**：`filter(u => u !== here)` 把正在读的这篇踢出候选池，避免"随机到自己"；万一只有这一篇，再退回全量。
3. **优先 Swup**：`window.swup.navigate` 做无刷新跳转，阅读体验连续；拿不到 swup 再降级成 `location.href`。

按钮的显隐、抽屉、评论跳转这些同组功能，记在[右侧悬浮工具栏那篇](/posts/floating-toolbar/)。

## 另一种思路：首页置顶卡片（未采用）

下面这套是另一种常见做法——在首页放一张「随机一篇文章」卡片（`RandomPostCard`），点卡片跳随机篇。思路相通，只是形态不同。本仓库没采用它（工具栏按钮更不占地），但保留下来供参考。

> 方案整理自 [pinpe.top 的教程](https://pinpe.top/posts/random-post/)，按本仓库代码风格略有改写。

```javascript title="src/components/RandomPostCard.astro"
---
import { getCollection } from 'astro:content';
import { getPostUrlBySlug } from '../utils/url-utils';
import { Icon } from 'astro-icon/components';

// 1. 先判断当前页面是否为首页（仅主页执行后续逻辑）
const isHomePage = Astro.url.pathname === '/';
let postUrls = [];

// 2. 仅主页获取文章 URL（非主页跳过，减少无效计算）
if (isHomePage) {
  const posts = await getCollection('posts');
  postUrls = posts
    .filter(p => !p.data.draft && p.data.tags.length > 0)
    .map(p => getPostUrlBySlug(p.slug));
}
---

{/* 3. 核心条件：仅当是首页时，才渲染整个组件 */}
{isHomePage && (
  <div id="random-post-card" class="card-base ..." data-post-urls={JSON.stringify(postUrls)}>
    <a href="#" class="random-post-link ..." aria-label="随机文章">随机一篇文章</a>
  </div>
)}
```

它的脚本在客户端把 `data-post-urls` 解析出来、随机挑一个写进 `href`，Swup 会自动拦截链接做无刷新跳转。和工具栏版比：

| | 工具栏按钮（本仓库采用） | 首页置顶卡片 |
| :--- | :--- | :--- |
| 位置 | 右侧悬浮工具栏，全站常驻 | 仅首页文章流 |
| 占不占版面 | 不占 | 占一张卡片 |
| 随机范围 | 全部非草稿文章 | 全部带标签的非草稿文章 |

## 相关阅读

- [右侧悬浮工具栏：回顶部、随机一篇、目录抽屉与评论跳转是怎么做的](/posts/floating-toolbar/)：本仓库最终采用的随机文章实现，就集成在这套工具栏里。
- [读完那篇「跳出舒适区」，我把侧栏折了起来](/posts/collapsible-sidebar/)：侧栏周边其它魔改。

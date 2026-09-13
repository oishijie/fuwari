---
title: 转载｜Astro 静态博客的推荐算法：与我的「随机一篇」对比
published: 2026-09-13
category: 博客魔改
tags:
  - 推荐算法
  - Astro
  - 随机文章
---

> **转载声明**：本文主体整理自白咲雫《Astro 静态博客文章推荐功能的实现思路》（2026-09，<https://blog.cuteleaf.cn/posts/dev-notes/astro-blog-recommend-algorithm/>）。原文版权归原作者所有，此处为学习目的作中文整理与二次评注，**非逐字翻译**；算法公式、代码片段与设计决策均引自原文。文中「本站 / 留心博客」指笔者自己的部署，与原文方案并列对照。**本文只做记录，功能暂不落地。**

---

巧的是，本站悬浮工具栏里刚好也有一个「随机一篇」按钮（构建时把全量文章 URL 内联进 HTML，点击时零请求跳转）。所以读到这篇推荐算法文时，又是熟悉的配方——同一个栈（Astro 纯静态）、同一个痛点（静态站没有服务端运行时），但对方把「推荐」这件事做得比笔者系统得多：相关文章靠**构建时评分**，随机文章靠**客户端洗牌**，两栏各走各的路。下面先整理原作者怎么做，再和笔者的方案逐项比。

## 一、原文要解决什么

Astro 文章详情页底部通常只有「上一篇 / 下一篇」，读者读完后缺乏继续浏览的动力。作者想在页尾加一个推荐组件，分两栏：

- **左栏 · 相关文章**：基于算法在**构建时**预计算，输出纯静态 HTML，零客户端 JS；
- **右栏 · 随机文章**：每次刷新都不同，只能靠客户端 JS。

核心约束和本站一模一样：**纯静态站点，没有服务端运行时**。「相关」可以在构建时确定，「随机」只能在客户端实现。

## 二、推荐算法：四维加权评分

相关文章的多维综合评分公式：

```
totalScore = tagMatchScore + titleSimilarityScore + timeFreshnessScore + categoryBonus
```

### 1. 标签匹配分（0–100）

用 **Jaccard 相似度**衡量两篇文章标签的重叠程度：

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
tagMatchScore = Jaccard(当前文章标签, 候选文章标签) × 100
```

标签完全相同得 100，完全不同得 0。最直观的相关性信号。

### 2. 标题相似度分（0–100）

标签可能为空或过于宽泛，标题往往更精确。同样用 Jaccard，但要先分词。作者对比了三个方案：

| 方案 | 优点 | 缺点 |
|---|---|---|
| 按空格分割 | 简单 | 中文完全失效 |
| jieba 等分词库 | 效果好 | 引入重依赖 |
| **`Intl.Segmenter`** | 零依赖，Node.js 内置 | 需要 Node 16+ |

最终选 `Intl.Segmenter`，零依赖且天然支持中英混合：

```ts
function tokenizeTitle(title: string): Set<string> {
  const tokens = new Set<string>();
  const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  for (const { segment, isWordLike } of segmenter.segment(title)) {
    if (!isWordLike) continue; // 过滤标点和空白
    tokens.add(segment.toLowerCase()); // 英文统一小写
  }
  return tokens;
}
```

例如 `"Astro 博客主题开发指南"` 会被切成 `{"astro", "博客", "主题", "开发", "指南"}`。

### 3. 时间新鲜度分（0–30）

6 个月半衰期的指数衰减：

```
timeFreshnessScore = 30 × e^(-ln2 × daysSincePublished / 180)
```

刚发布 30 分，6 个月前约 15 分，一年前约 7.5 分——其他维度接近时新文章排前面。

### 4. 分类加成（0 或 10）

同分类额外 +10，锦上添花。

### 5. 选取策略

不是简单取 Top N，而是分两轮：

1. **优先取有标签匹配的**（`tagMatchScore > 0`），按总分排序；
2. **不足 5 篇**时，从无标签匹配的候选里按 `timeFreshnessScore + categoryBonus` 降序补齐；
3. **跳过加密文章**。

保证有相关标签必优先，没有也不会显示空列表。

## 三、随机文章：静态站的「真随机」

构建时的 `Math.random()` 只执行一次，结果被固化进 HTML——每次刷新看到的是同一个「随机」。作者的解法是**复用已有 API + 客户端渲染**：

1. 项目已有 `/api/allPostMeta.json` 端点（日历组件在用），补上 `category` 和 `password` 字段；
2. 客户端 fetch 该 JSON，过滤当前文章、相关文章和加密文章；
3. **Fisher-Yates 洗牌**取前 5 篇，DOM API 渲染；
4. 用 `window.__allPostMetaCache` 做全局缓存，日历和随机组件**共享同一次请求**，swup 切页不重复请求，只重新洗牌渲染。

## 四、组件架构

```
RecommendedPost.astro
├── 左栏：相关文章（Astro 静态渲染）
│   ├── 构建时由 getRelatedPosts() 预计算
│   └── 输出纯 HTML，零 JS
└── 右栏：随机文章（客户端渲染）
    ├── 只渲染卡片骨架
    ├── <div id="random-posts-list"> 作为挂载点
    └── inline script fetch API 后 DOM 渲染
```

两栏独立 `card-base` 卡片，`grid grid-cols-1 md:grid-cols-2` 响应式布局。

## 五、与本站「随机一篇」对比

| 维度 | 原文（夏夜流萤） | 本站（悬浮工具栏·随机一篇） |
|---|---|---|
| 数据源 | 客户端 fetch `/api/allPostMeta.json` | **构建时** `getCollection` 把全量 URL 塞进 `data-post-urls` 属性 |
| 首屏成本 | 多一次 JSON 请求（有跨组件缓存） | **零请求**（URL 内联在 HTML 里） |
| 随机质量 | Fisher-Yates 洗牌，真随机 | 前端 `Math.random` 选一条，真随机 |
| 候选过滤 | 排除当前文 / 相关文 / 加密文 | 排除当前文与 draft；**加密文未排除**（`BackToTop.astro:11` 只滤 `draft`，随机到上锁文只能被密码墙拦住） |
| 渲染形态 | 卡片列表（标题+封面可扩展） | 单按钮直接 `swup.navigate` 跳转 |
| swup 兼容 | 缓存挂 `window`，切页复用 | URL 常驻容器外工具栏，无重建问题 |

几个值得记下的点：

1. **随机入口的两种哲学**：本站追求「零请求、一点就走」，把随机性前置到点击时；原文追求「随机 + 信息」，随机的同时展示 5 张卡片引导继续浏览。目标不同，方案没有优劣。
2. **`Intl.Segmenter` 值得收藏**：Node 16+ 内置、零依赖、中英混合分词开箱即用。若将来落地相关文章，**完全可以在 `[...slug].astro` 构建时算好 Top 5**，输出静态 HTML——与本站「能构建时算就不留客户端」的取向一致，连原文右栏那种 fetch 都可以省掉。
3. **本站可借鉴的小改进**：原文随机组件会过滤加密文章，复查发现本站「随机一篇」的 URL 列表（`BackToTop.astro:11`）只滤了 `draft`，**加密文章仍在候选池里**——随机到上锁文章会被密码墙拦住，体验不佳。将来落地时加一行 `&& !p.data.password` 即可。

## 六、结语

原文最有价值的不是某个具体函数，而是把「静态站做推荐」拆成了两个正交问题：**确定性（相关）放构建时，不确定性（随机）放客户端**。这个分界线和本站现有架构天然对齐。功能本身先不动手，等哪天想给文章页底部加「相关阅读」了，这份评分公式和 `Intl.Segmenter` 分词方案可以直接抄作业。

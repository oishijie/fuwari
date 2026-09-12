---
title: 'Fuwari 博客魔改计划：为 Astro 加上在新标签页打开链接的功能'
published: 2026-07-06
description: '原版 Astro / Fuwari 的外链默认在当前页面打开。本文给出两条落地路线——官方 rehype-external-links 插件，与本站实际采用的零依赖自写插件，并说明为什么站内链接和页内锚点必须排除在外。'
image: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Astro', 'Fuwari', 'rehype', '插件', '教程']
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 0
---

## 前言

在原生 [Astro](https://astro.build/) 或 [Fuwari](https://github.com/saicaca/fuwari) 主题中，文章正文里的外部链接默认在当前页面打开。对教程类文章来说这体验并不友好——读者点开一个参考资料，正在读的文章就被顶掉了，回来还得重新找位置。

想要的效果很简单：

- [这是站内链接（当前窗口打开）](/archive/)
- [这是外部链接（新标签页打开）](https://www.bing.com/)

两者的 HTML 只差一个属性：

```html
<a href="https://www.bing.com">当前窗口打开</a>
<a href="https://www.bing.com" target="_blank">新标签页打开</a>
```

:::note
本文于 2026-09-12 基于本站的实际实现重写：除介绍社区常用的 `rehype-external-links` 方案外，重点补充本站采用的**零依赖自写插件**方案，以及排查过程中踩到的几个坑。
:::

## 原理：三十秒讲清

Markdown 里的 `[文字](链接)` 经过 remark 解析后，会变成一棵 **hast 树**（HTML 的 AST）里的 `element` 节点，标签名是 `a`。Astro 的 Markdown 管线在**生成 HTML 字符串之前**，会依次把 `rehypePlugins` 里的插件跑一遍，每个插件都能拿到并修改这棵树。

所以这件事的本质就是：**插一个 rehype 插件进去，遍历这棵树，给外链的 `a` 节点加上 `target="_blank"`**。

```text
Markdown → remark 解析 → mdast → remark-rehype → hast →【rehype 插件们】→ HTML
```

关键位置在 `astro.config.mjs` 的 `markdown.rehypePlugins` 数组。

## 两条路线怎么选

| | 路线 A：`rehype-external-links` | 路线 B：自写零依赖插件（本站采用） |
|---|---|---|
| 依赖 | 需要装包 | 0 个依赖 |
| 功能 | 丰富：可自动加外链图标、按域名排除、批量配 `rel` | 只有你写的那几行 |
| 配置量 | 一个数组项 | 一个 `.mjs` 文件 + 一个 import |
| 适合 | 需求复杂、愿意装包 | 需求简单、或本机 `pnpm install` 极慢/易卡死 |

本站选了路线 B：需求只有"外链加 `_blank`"这一条，而本机 `pnpm install` 装本地包时曾经卡死过十几分钟，为一个 20 行的功能引一个新依赖不划算。

## 路线 A：装 rehype-external-links

```bash
pnpm add rehype-external-links
```

然后在 `astro.config.mjs` 里引入并挂到 `rehypePlugins`：

```js title="astro.config.mjs"
import rehypeExternalLinks from "rehype-external-links";

// markdown.rehypePlugins 数组中新增一项：
rehypePlugins: [
    rehypeKatex,
    rehypeSlug,
    [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
    // ...其他插件
],
```

这一行的效果等价于路线 B，区别只是逻辑由社区包实现。

## 路线 B：零依赖自写插件（本站采用）

### 第一步：写插件

新建 `src/plugins/rehype-external-target.mjs`：

```js title="src/plugins/rehype-external-target.mjs"
/**
 * 给文章正文中的外部链接（http/https 绝对地址）自动添加 target="_blank"。
 * 站内相对链接与页内锚点不受影响，保持当前窗口打开（Swup 无刷新导航）。
 * 零依赖实现：手动遍历 hast 树，避免引入 rehype-external-links。
 */
export function rehypeExternalTarget() {
    return (tree) => {
        const walk = (node) => {
            if (!node || typeof node !== "object") return;
            if (node.type === "element" && node.tagName === "a") {
                const href = node.properties && node.properties.href;
                if (typeof href === "string" && /^https?:\/\//i.test(href)) {
                    node.properties.target = "_blank";
                    // rel 覆盖写（防止新标签页通过 window.opener 反向操作原页面）
                    node.properties.rel = "noopener noreferrer";
                }
                return; // 命中 a 就收，不深入其内部子节点
            }
            if (Array.isArray(node.children)) node.children.forEach(walk);
        };
        walk(tree);
    };
}
```

### 第二步：挂进配置

两处改动，都在 `astro.config.mjs`：

```js title="astro.config.mjs"
// 1. 顶部 import（与其他插件 import 放一起）
import { rehypeExternalTarget } from "./src/plugins/rehype-external-target.mjs";

// 2. markdown.rehypePlugins 数组中加一项（位置随意，建议放在 rehypeSlug 之后）
rehypePlugins: [
    rehypeKatex,
    rehypeSlug,
    rehypeExternalTarget,
    // ...其他插件
],
```

本站实际的文件里，它挂在 `rehypeSlug` 之后、`rehypeComponents`（提示框 / GitHub 卡片）之前。

### 三个设计决策，以及为什么

**① 只匹配 `http(s)` 绝对地址，站内链接一律放过**

正则 `/^https?:\/\//i` 决定了：以 `/` 开头的站内相对链接、以 `#` 开头的页内锚点都不会被加 `target`。这不是偷懒——本站开了 **Swup 无刷新导航**，站内链接如果被强制开新标签页，等于把无刷新切换的优势全部作废；而目录锚点开新窗更是直接破坏阅读体验。

**② `rel` 用覆盖写而不是追加**

`node.properties.rel = "noopener noreferrer"` 直接赋值。原因有二：一是 Markdown 里本来就极少给链接写 `rel`，不会覆盖有用信息；二是 `noopener` 是安全必需项——不写它，新打开的页面可以通过 `window.opener` 反向操作原页面（钓鱼的经典手法）。

**③ 命中 `a` 之后直接 `return`，不深入子节点**

链接内部的 `<code>`、`<img>` 等子元素不可能是另一个需要处理的链接，提前返回省一次遍历。更重要的是：如果不提前返回、继续往下走，遇到嵌套结构时会重复读写 `properties`，逻辑容易失控。

## 怎么验证真的生效

### 方法一：造一棵 hast 树直接跑（最快）

不用起服务，30 秒出结果：

```bash
node --input-type=module -e '
import { rehypeExternalTarget } from "./src/plugins/rehype-external-target.mjs";
const tree = { type: "root", children: [
  { type: "element", tagName: "p", children: [
    { type: "element", tagName: "a", properties: { href: "https://example.com/x" }, children: [] },
    { type: "element", tagName: "a", properties: { href: "/posts/foo/" }, children: [] },
    { type: "element", tagName: "a", properties: { href: "#section-1" }, children: [] },
    { type: "element", tagName: "a", properties: { href: "HTTPS://EXAMPLE.ORG" }, children: [] },
  ]},
]};
rehypeExternalTarget()(tree);
const out = [];
const walk = (n) => { if (!n || typeof n !== "object") return;
  if (n.type === "element" && n.tagName === "a") out.push(n.properties.href + " -> target:" + n.properties.target);
  if (Array.isArray(n.children)) n.children.forEach(walk); };
walk(tree);
console.log(out.join("\n"));
'
```

期望输出：外链带 `target:_blank`（大写协议也认），相对链接与锚点为 `target:undefined`。

### 方法二：抓 dev server 渲染后的 HTML

最硬的一锤定音——直接看浏览器会拿到的 HTML 里有没有 `target="_blank"`：

```bash
node --input-type=module -e '
const res = await fetch("http://127.0.0.1:4321/posts/<文章 slug>/");
const html = await res.text();
const i = html.indexOf("你要检查的外链域名");
console.log(html.slice(html.lastIndexOf("<a", i), i + 120));
'
```

:::tip
**中文标题的文章，slug 不能直接拿文件名拼**。Astro 生成 slug 时会去掉中文标点、空格转连字符，比如《Fuwari博客改造计划：给 Fuwari 换上自定义字体》的真实 slug 是 `fuwari博客改造计划给-fuwari-换上自定义字体`，用 `encodeURIComponent(文件名)` 拼出来的 URL 会 404。

最稳的取法：先抓 `/archive/` 页面，从 Svelte 岛序列化进 props 的数据里搜文章标题，前面那串 `slug` 就是真实值。
:::

## 三个容易踩的坑

:::important
**① 改完 `astro.config.mjs` 必须手动重启 dev server。** 页面和组件的改动会热更新，但 `astro.config.mjs` 是**服务级配置**——Astro 只在启动时读一次。本站排查时就被这个坑过：配置确认已落盘、插件单元测试也通过，但页面上就是没有 `target`，重启 dev server 后立即生效。
:::

**② 别用 `node -e` 直接 import `unified` / `remark-parse` 来验证。** 在 pnpm 的严格模式（isolated node_modules）下，这些是传递依赖，不在顶层 `node_modules`，直接 import 会报 `ERR_MODULE_NOT_FOUND`。要验证插件行为，用上面「方法一」造树的方式，绕开整个 unified 链路。

**③ 手写 `<a>` 标签不受这个插件影响。** rehype 插件只处理 **Markdown 渲染产物**。像友链页里手写的卡片链接、导航栏链接这类直接写在 `.astro` 里的 `<a>`，要新窗口打开就得自己加 `target="_blank"`——本站 `friends.astro` 的友链外链按钮就是手写的。

## 一点补充：为什么不干脆全部开新窗

内部链接保持当前窗口，是为了不破坏 Swup 的无刷新切换；外链开新窗，是为了保住读者的阅读位置。**判断标准不是"是不是本站的链接"，而是"跳转后会不会中断阅读"**。

顺着这个思路，本站的做法是：正文外链（插件自动）→ 新窗；站内导航 / 锚点（放过）→ 当前窗；友链卡片（手写）→ 新窗。

## 相关阅读

- [Markdown 求职实录：一场兼作本站 Markdown 样式陈列的面试](/posts/markdown-求职实录一场兼作本站-markdown-样式陈列的面试/)——本站 Markdown 与 Expressive Code 语法的陈列与对照
- [Expressive Code 官方文档](https://expressive-code.com/)

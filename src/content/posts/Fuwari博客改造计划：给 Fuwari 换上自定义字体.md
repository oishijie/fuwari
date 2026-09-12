---
title: 'Fuwari博客魔改计划：给 Fuwari 换上自定义字体'
published: 2026-08-17
description: '博客默认字体看腻了？本文记录如何在 Fuwari（Astro 5 + Tailwind 3）里把全局正文字体换成自己喜欢的字体（以霞鹜文楷为例）——从放字体文件、写 @font-face、改 Tailwind 配置到代码块字体一并讲清，并修正原教程里的几个过时坑。'
image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Fuwari', 'Astro', '博客魔改', '自定义字体', '字体']
category: 博客魔改
draft: false
lang: ''
order: 0
---

之前逛博客，看到有人把 Fuwari 的字体换成了自己喜欢的样式，整站的气质一下子就不一样了。原教程是 AULyPc 在 2024 年底写的（[原文](https://aulypc1.github.io/posts/website/use_custom_fonts_in_fuwari/)），但那会儿还是旧版 Fuwari，路径和配置跟现在（Astro 5 + Tailwind 3）对不上，照抄必踩坑。这里按我这个版本重新走一遍，顺手修掉原教程里几个写错 / 过时的地方。

:::note
本文是转载改写，思路和素材来自以下来源，转载已注明出处：
- AULyPc《在 Fuwari 使用自定义字体》[原文链接](https://aulypc1.github.io/posts/website/use_custom_fonts_in_fuwari/)
- Astro 官方文档《使用自定义字体》
- Alliana《Fuwariで好きなフォントを使う》

动手前请先备份相关文件。字体文件放在 `public/` 下会拖慢首屏加载，按需取舍。
:::

## 先搞清楚：Fuwari 现在的字体从哪来

改之前得知道它被谁控制着。翻一眼当前版本的源码就清楚：

- `src/layouts/Layout.astro` 顶部三行 `import "@fontsource/roboto/400.css"` 等，负责把 **Roboto** 的 `@font-face` 注册进页面；
- `tailwind.config.cjs` 里 `fontFamily.sans` 写的是 `["Roboto", "sans-serif", ...]`；
- Tailwind 的 preflight 会把 `fontFamily.sans` 这个字体栈默认挂到 `html` 上，所以全站正文其实都吃 Roboto。

也就是说，**换字体只需要做两件事**：让浏览器认识你的字体（写 `@font-face` 或装 `@fontsource` 包），再把它排到 `sans` 字体栈第一位。下面给两套做法。

## 方法一：自托管字体文件（最通用）

适合手头有一个 `.woff2` 字体文件、或者想完全自己掌控的情况。

### 1. 放字体文件

在 `public/fonts/` 下建个子目录把字体丢进去（没有 `fonts` 就自己建）：

```bash
public/fonts/lxgw-wenkai/LxgwWenKai-Regular.woff2
```

### 2. 在 main.css 里写 @font-face

打开 `src/styles/main.css`（这是 Fuwari 的全局样式表，已经在布局里全局引入），在**文件最顶部、`@tailwind` 指令之前**写：

```css
@font-face {
  font-family: "LxgwWenKai";
  src: url("/fonts/lxgw-wenkai/LxgwWenKai-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

:::tip
`@font-face` 必须写在 `@layer components { ... }` **外面**，直接放文件顶层。塞进 `@layer` 里浏览器不会生效。
`font-display: swap` 很重要——字体没下载完先显示兜底字体，避免首屏白屏。
:::

### 3. 改 Tailwind 配置注册字体族

编辑 `tailwind.config.cjs`，把自定义字体放到 `sans` 第一位：

```cjs
/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme")
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["LxgwWenKai", "Roboto", "sans-serif", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
}
```

排第一的字体优先，后面是兜底。改完重新构建，正文就换成你的字体了。

### 4. （可选）摘掉 Roboto

第 1 步那三行 `@fontsource/roboto` 的 import，作用只是注册 Roboto 的 `@font-face`。既然正文已经换成自定义字体，这仨留着只是多下载一点体积、不影响显示。想干净点就删掉，懒得动也行。

## 方法二：用 @fontsource（更省事，推荐）

如果你的字体在 [Fontsource](https://fontsource.org/) 上有现成包，连 `@font-face` 和 `public/fonts` 都不用自己管，直接装包最省事。以霞鹜文楷为例：

```bash
pnpm add @fontsource/lxgw-wenkai
```

然后在 `src/layouts/Layout.astro` 顶部加上（位置跟原来的 roboto import 放一起）：

```js
import "@fontsource/lxgw-wenkai/400.css";
import "@fontsource/lxgw-wenkai/700.css";
```

再走方法一的第 3 步去 `tailwind.config.cjs` 注册一下即可。包名以 Fontsource 实际发布为准，装之前去官网搜一下字体名确认，装错包名会 404。

## 代码块字体别忘了

正文换了，行内代码和代码块默认还是等宽字体（JetBrains Mono，仓库里通过 `@fontsource-variable/jetbrains-mono` 引入）。想让风格统一，改 `src/styles/markdown.css` 里的 `code`：

```css
code {
  font-family: 'LxgwWenKai', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
```

如果连代码块（Expressive Code）也想换，去 `astro.config.mjs` 改 `expressiveCode` 的 `codeFontFamily` 那一项。不过中文等宽字体观感见仁见智，我一般留着 Mono，正文和代码各司其职反而清楚。

## 原教程的几个坑（已修正）

| 原教程写法 | 问题 | 本文做法 |
| :--- | :--- | :--- |
| 全局样式写进 `scr\styles\global.css` | 新版 Fuwari 没有这个文件，全局样式表是 `src/styles/main.css` | 直接改 `src/styles/main.css` |
| `tailwind.config.cjs` 里 `sans` 键重复声明两次（先 Roboto 又被 Blueaka 覆盖） | 后一个覆盖前一个，纯属笔误 | 一个 `sans` 写完整字体栈 |
| `markdown.css` 的 `code` 片段大括号没闭合 | 复制过去 CSS 直接坏掉 | 已补全闭合 |
| 推荐「引用外部 CSS」加载霞鹜文楷 | 外部 CDN 有跨域和加载时序问题，且依赖第三方可用性 | 优先自托管 / `@fontsource`，可控又稳 |

:::important
字体是放在 `public/` 里的静态资源，每个访客都要下载，文件越大首屏越慢。中文网页字体动辄几 MB，务必满足三点：用 `woff2` 格式、加 `font-display: swap`、只对用到的字形做子集化（subset）。能用 Fontsource 的 variable 字体就别全量自托管。
:::

## 我最后怎么选的

我自己选了**霞鹜文楷（Lxgw WenKai）**——笔画带点手写感，长时间阅读不累，又比纯黑体有温度。走的是方法二（`@fontsource/lxgw-wenkai`），正文和标题统一文楷、代码块保留 JetBrains Mono 做对比。整体观感比默认 Roboto 顺眼不少，尤其是中文混排的时候。

字体这事没有标准答案，挑一套自己看着舒服的就行。照上面四步改完，重新 `pnpm build` 推上去就能看到效果。

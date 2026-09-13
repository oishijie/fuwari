---
title: 多图并排：给 Fuwari 加 Markdown 图片网格（附范例）
published: 2026-09-13
description: 借鉴夏夜流萤的方案，给博客加了一个 [grid] 标记：构建期把多张图重组成等高并排的网格，点击进灯箱。本文自带活的范例。
category: 博客魔改
tags:
    - Astro
    - Markdown
    - 插件开发
image: https://images.unsplash.com/photo-1516387938699-a93567ec168e?q=80&w=1200&h=800&auto=format&fit=crop
---

写博客经常碰到一个排版难题：一次截了好几张图，挨个贴出来就是一长竖条，图一多文章被拉得老长，读者滚半天；想并排又只能靠 HTML 硬写 `<div class="grid">`，Markdown 里塞这种东西又丑又容易写错。

[grid]

![黑客帝国代码雨](https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop)

![Twitter 立体图标](https://images.unsplash.com/photo-1611605698335-8b1569810432?q=80&w=800&auto=format&fit=crop)

![人像](https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=800&auto=format&fit=crop)

[/grid]

↑ 上面这三张就是**活的范例**：三张图自动三列并排、同排等高（矮图中心裁剪、不变形），点击任意一张进灯箱大图浏览。这段话本身没什么信息量，但它证明功能真的在跑——你现在看到的排版，就是本文要讲的东西渲染出来的。

## 借鉴来源

思路照抄不谢：**夏夜流萤**（[blog.cuteleaf.cn](https://blog.cuteleaf.cn/)）的[《Markdown 多图并排展示：Shiro 风格的图片网格》](https://blog.cuteleaf.cn/posts/dev-notes/markdown-image-grid/)。原文的核心想法很聪明——不去动 Markdown 渲染后的 HTML，而是在**更上游的 remark AST 阶段**就把图片段落重组掉，这样下游的一切（灯箱、代码高亮、摘要抽取）都无感知。

我的实现和原文同源，但 fuwari 的渲染链和 Shiro 不一样，适配过程有几个点值得记下来。

## 用法

正文里这样写：

````markdown
[grid]

![图一](https://example.com/a.webp)

![图二](https://example.com/b.webp)

![图三](https://example.com/c.webp)

[/grid]
````

规则：

- 图片数量决定列数：2 图两列、3 图三列，**最多四列封顶**（5 张图也只排四列）；1 张图等于没写，单列。
- 图片之间必须**空行分段**（每张图独立一段），这是插件跨段收集的依据。
- 忘了写 `[/grid]` 不会炸——插件兜底原样输出。
- 两图范例（顺带验证混合尺寸下的等高裁剪）：

[grid]

![手机上的聊天应用](https://images.unsplash.com/photo-1611746872915-64382b5c76da?q=80&w=800&auto=format&fit=crop)

![键盘上打字](https://images.unsplash.com/photo-1516387938699-a93567ec168e?q=80&w=800&auto=format&fit=crop)

[/grid]

## fuwari 适配的三个要点

**① 插件注册顺序有讲究。** fuwari 已经有 `remark-excerpt`（抽首段摘要）和 `remark-reading-time`（数字数）两个插件，它们都会遍历正文。网格重组必须**排在最前面**：先让 `[grid]` 块变成一个干净的 `div` 节点，后面的插件把它当普通节点处理即可。

**② 灯箱零改动。** fuwari 的 PhotoSwipe 灯箱是按 `.custom-md img` 委托绑定的，重组出来的网格里的 `<img>` 天然在容器内——**点击放大自动生效**，一行灯箱代码都没碰。这是"AST 阶段处理"这个架构选择送的红利。

**③ CSS 全用纯手写，不碰 `@apply`。** 本站踩过雷：`markdown.css` 独立走 Tailwind 编译，`@apply` 引用 `main.css` 里的自定义类会直接构建失败（`btn-regular-dark` 那次）。原文的 CSS 恰好全是 Tailwind 原生类所以没事，我干脆全部展开成纯 CSS，彻底免疫这个雷。布局本身很简单：`display: grid` + `grid-template-columns: repeat(N, 1fr)`，等高拉伸交给 `align-items: stretch`，行高用 `aspect-ratio: 16/10` 锚定，图片 `object-fit: cover` 中心裁剪不形变；移动端（窄屏）自动退回单列、恢复原比例。

## 踩掉一个真 bug

初版代码里数图片用的是箭头函数简写：

```js
grid.forEach((p) => visit(p, "image", () => count++));
```

看起来人畜无害，实际上**把 `count++` 表达式的返回值（0、1、2……）泄漏给了 `unist-util-visit` 当控制信号**——这个库约定回调返回 `SKIP`（1）就跳过子树、返回 `EXIT`（2）就终止遍历。于是数到第二张图时遍历被"跳过"，三张图计成了四列。改成显式块语句就正常了：

```js
grid.forEach((p) => visit(p, "image", () => { count++; }));
```

这类 bug 的可怕之处在于**不报错**，只是输出悄悄不对。以后给 `visit` 写回调，凡是不打算返回控制信号的，一律用块语句。

## 又一个：图片把文字盖住了

上线第一版我给网格项写的是两层 `height: 100%`——`<p>` 撑满网格行、`<img>` 撑满 `<p>`，看着天经地义，实际是个**循环依赖**：`<p>` 的高度依赖网格行高，网格行高又依赖 `<p>` 里图片的高度，图片高度还是百分比。浏览器解析这种环时直接把 `<p>` 的高度算成了 0，于是图片从塌掉的盒子里**溢出绘制**，正好压在上下相邻的文字上——页面上就出现了"图片条盖住正文"的灵异现场。

修法是打破循环：行高不再由内容反推，而是给图片一个确定的锚——`aspect-ratio: 16/10`。行高 = 列宽 × 0.625，与图片原始尺寸无关，`height: 100%` 从此有确定参照；等高拉伸交给 grid 默认的 `align-items: stretch`，`<p>` 上一个 height 都不用写。附带的好处是**任何图片组合排版完全一致**——不必担心一张竖图把整排撑到天上去（原来那条防撑爆的 `max-height` 反倒成了保底）。移动端退回单列时记得把 `aspect-ratio` 一并还原成 `auto`——`height: auto` 时它依然会按宽度算高，不还原的话手机上所有图都会变成横幅条。

两个坑同一个教训：**CSS 的"看起来对"和"算出来对"是两回事**，百分比高度这类有解析语义的属性，写之前想清楚参照物是谁、有没有环。

## 两个注意事项

- **`[grid]` 块别放正文第一段。** 首页卡片的摘要抽的是首段文本，网格段落里抽不出字，摘要会是空的。范例放文章开头演示没问题——本文写了 `description`，不走摘要回退。
- **标题和 alt 是给灯箱用的。** 网格图在灯箱里显示的大图标题取自 alt 文本，认真写。

改动本身没多少行：一个插件文件、一段 CSS、`astro.config.mjs` 加一行注册。真正花时间的是"确认它和 fuwari 原有的每一环都能和平共处"——摘要、字数、灯箱、Swup 切页，挨个验过去，比写代码久。

## 相关阅读

- [给博客上把锁：Astro 文章加密的 fuwari 实操](/posts/encrypt-your-posts/) —— 同样借鉴自夏夜流萤的一篇实操
- [加密文章示例：给博客加把锁](/posts/encrypted-post-demo/) —— 带密码的活示范（密码 `fuwari`）

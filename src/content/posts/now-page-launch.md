---
title: 'Now 页启用：把发布门槛降到零'
published: 2026-09-13
description: '受 Owen 的 Jant（Hidden from Latest）启发，给博客加了 Now 页：frontmatter 写 hidden: true 的文章不会出现在首页时间线和 RSS 里，只收录在归档、分类和这个 Now 页——写了就发，没有「打扰订阅者」的心理负担。'
tags: ['Fuwari', 'Now页面']
category: 博客魔改
draft: false
lang: ''
order: 0
hidden: true
---

从 [Owen 的 Jant](https://www.owenyoung.com/jant) 那里借来的理念：博客写不下去的最大原因是发布太重——要么憋长文，要么攒着不发。他给 Jant 设计的解法里我最认可的是 **Hidden from Latest**：发布帖子，但它不出现在首页和 RSS，只出现在归档和合集页。发的时候零心理负担，48 小时内 Now 合集有更新，导航栏的 Now 旁边会亮一个 `*`。

现在这个博客也有了同样的机制，规则很简单：

1. 任何文章的 frontmatter 加一行 `hidden: true`，它就从首页时间线和 RSS 里消失；
2. 它仍然会出现在归档页、分类页，以及导航栏的 **Now** 页——想看的人随时能看到；
3. 只要 48 小时内发过 hidden 文章，导航 Now 旁边就会亮 `*`，48 小时后自动熄灭。

从这条开始，随手记都发在这里。

> 今日随手记：读完 Jant 那篇文章最大的感触是——工具设计的第一性问题不是「功能多不多」，而是「摩擦小不小」。一个 `hidden: true` 解决的心理负担，比十篇「如何坚持写作」的鸡汤都管用。

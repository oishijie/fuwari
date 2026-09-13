---
title: 给博客上把锁：Astro 文章加密的 fuwari 实操
published: 2026-09-13
description: 借鉴夏夜流萤的方案，给 fuwari 博客加上文章加密——构建时 AES-256-GCM 加密、浏览器端解密，外加一个原文没有的「锁定本文」按钮，以及三个自己排查出来的泄露口。
category: 博客魔改
tags:
    - Astro
    - Web Crypto
    - 文章加密
image: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=1200&h=800&auto=format&fit=crop'
---

## 起因

总有一些内容，不想对所有人公开：写给特定朋友的记录、半成品的想法、或者单纯不想被搜索引擎收录的碎碎念。静态博客没有服务端，做不了传统的登录鉴权，但「输对密码才能看」这件事，其实纯前端就能做到。

这个功能的实现思路来自「夏夜流萤」的这篇文章，写得非常清楚，强烈推荐先读原文：

> **《Astro 静态博客文章加密功能的实现思路》**
> 作者：夏夜流萤（blog.cuteleaf.cn）
> 原文：<https://blog.cuteleaf.cn/posts/dev-notes/astro-blog-encrypted-post/>
> 发布于 2026-02-25

核心思路一句话：**构建时把文章 HTML 加密成密文写进页面，访客输密码后在浏览器端解密**。页面源码里不存在任何明文，密码也不会发往任何服务器。

本文不复读原文，只记录我在 fuwari 上落地时**不一样的东西**：Swup 无刷新导航带来的适配、三个自己排查出来的泄露口，以及一个原文没有的功能——**手动锁定按钮**。

## 方案核心（30 秒版）

- 算法：**AES-256-GCM**（自带认证，能检测密文被篡改/密码错误）+ **PBKDF2**（SHA-256，10 万次迭代）派生密钥
- 数据格式：`Base64( salt[16] + iv[12] + authTag[16] + ciphertext )`
- 加密时机：`.astro` 组件 frontmatter 里 `Astro.slots.render("default")` 拿到渲染好的正文 HTML，用 `node:crypto` 加密后写进页面
- 解密时机：浏览器里用 Web Crypto API（原生，零依赖）

一个反直觉的设计：**salt 和 iv 是确定性的**，由 `HMAC-SHA256(password + slug)` 派生，而不是随机。原因在原文里讲得很透：dev server 的 HMR 每次热更新都会重新渲染，如果 salt/iv 随机，密文就每次都变，`sessionStorage` 里缓存的密码对应不上，开发时每次热更新都要重新输密码。确定性派生保证「相同输入 → 相同密文」，同时不同文章之间 salt/iv 仍然不同。

## fuwari 适配：四个和原文不一样的地方

原文的博客和 fuwari 结构相似但细节不同，直接照搬会踩坑。以下四点是我实际改动时遇到的。

### 1. Swup 无刷新导航：脚本不会重新执行

原文没提这个，但 fuwari 全站启用了 Swup（只替换 `main` 和 `#toc` 两个容器）。这意味着 `<script>` 标签在切页后**不会重新执行**——从别的页面切到加密文章时，如果脚本只做「页面加载时初始化一次」，密码框就是个摆设。

解法是把逻辑写成「**幂等的全局初始化 + 事件钩子**」：

```ts
function boot() {
    const root = document.querySelector<HTMLElement>("#encrypted-post");
    if (root) initRoot(root);
}
document.addEventListener("astro:page-load", boot);
document.addEventListener("swup:page:view", boot);
document.addEventListener("swup:content:replace", boot);
```

每次切页都重新查找 `#encrypted-post`（新 DOM 里的那个），靠 `dataset.bound` 防止重复绑定。脚本本身只注册一次监听，DOM 换了几轮都不怕。

### 2. TOC 会泄露标题：SSR 时就得传空

fuwari 的目录是服务端渲染的——`[...slug].astro` 把 `headings`（从正文提取的标题列表）传给侧栏组件。如果加密文章也照常传，**访客看都没看正文，标题全在侧栏挂着了**，等于锁了门却把房间清单贴在门上。

所以加密文章要给布局传空 `headings`，等解密成功后再从真实 DOM 里重新扫描标题、重建目录：

```ts
function rebuildToc() {
    const el = document.querySelector("table-of-contents");
    const container = document.getElementById("encrypted-content");
    if (!el || !container) return;
    const headings = collectHeadings(container); // 从解密后的 DOM 抽 h1~h6
    // …重建目录项 HTML，重新初始化自定义元素
}
document.addEventListener("password:decrypted", rebuildToc);
```

fuwari 的 TOC 是个自定义元素（`<table-of-contents>`），重建时要先调它的 `disconnectedCallback()` 清掉旧的 IntersectionObserver，再 `init()`，否则滚动高亮会错乱。

### 3. 灯箱和代码块：挂同一个事件重跑

fuwari 的图片灯箱是 PhotoSwipe、代码块有裁剪初始化、KaTeX 公式有滚动容器设置——这些都是页面加载时对「当时存在的 DOM」做的初始化。解密后注入的正文不在其中，点击图片没反应、代码块样式不对。

解法和原文的 Fancybox 重绑思路一样：解密成功后延迟派发一个全局事件，各模块自己监听重跑：

```ts
window.setTimeout(() => {
    document.dispatchEvent(
        new CustomEvent("password:decrypted", { detail: { slug } }),
    );
}, 100);
```

任何「依赖正文 DOM」的初始化逻辑都监听这个事件——以后再加什么功能，记得也挂上。

### 4. Svelte 水合的坑：原文已经替我踩过了

原文试过用 Svelte 5 组件 + `client:load` 水合，结果 `$state` 在异步回调里赋值不触发 DOM 更新，F5 后按钮点不动，最后改成纯 `<script>` + 原生 DOM 操作。fuwari 这边我直接采用了同样的路线，省了一次踩坑——感谢原作者。

## 三个泄露口：锁了正文，别漏了别处

这是本文最想强调的部分。加密正文只是上了主锁，站点上还有好几处会「顺手」展示正文内容的地方，漏一个就全白锁了。我自己排查出三个：

### 泄露口 ①：首页卡片的摘要回退

fuwari 的文章卡片这样显示摘要：

```astro
{ description || remarkPluginFrontmatter.excerpt }
```

`description` 是 frontmatter 里手写的摘要；而 `remark-excerpt.js` 插件会在**没写 description 时用正文第一段当摘要**。也就是说，加密文章只要偷懒不写 `description`，首页就会把正文第一段明文印出来给所有人看。

修法很直接——插件开头加个判断，frontmatter 带 `password` 就不生成摘要：

```js
if (frontmatter.password) {
    data.astro.frontmatter.excerpt = "";
    return;
}
```

### 泄露口 ②：RSS 全文输出

fuwari 的 RSS 用 `post.body` 输出全文。RSS 阅读器一订阅，**加密文章的正文原样送达**，连解密的仪式感都省了。

修法：加密文章在 RSS 里只输出标题和描述，不渲染正文。

### 泄露口 ③：阅读时长（已知，未修）

`remark-reading-time` 会从正文算字数，卡片上显示「XXX 字 | N 分钟」——外人虽然看不到内容，但能推断出文章大概多长。这是**信息量极小的侧信道**，改掉的话卡片会显示「0 字」反而难看，所以我保留了。是否在意看个人。

另外还有个「半泄露」要说明：**文章标题是公开的**——首页卡片、归档页、RSS 里都会出现。加密保护的是正文，标题本身想藏就得连卡片一起隐藏（fuwari 有 `hidden` 字段可以做这件事）。

## 原文没有的功能：手动锁定

先说清楚解锁状态的保持机制：密码缓存在 `sessionStorage`（key 是 `pw:<slug>`），只在**当前标签页的生命周期内**有效——刷新不丢、切页回来不丢（静默解密），但关掉标签页、新开标签页就失效。这是刻意的：不落盘，借电脑给别人时关个标签页就干净了。

但实际用下来有个别扭的地方：**想「看完就锁回去」，只能关掉整个标签页**。如果在同一个标签页里还要继续逛博客，就得忍着它一直开着，或者关掉再重新打开。于是加了一个「锁定本文」按钮，解锁后显示在正文末尾：

```ts
function lock(root: HTMLElement) {
    // 1. 清掉 sessionStorage 里的密码缓存
    sessionStorage.removeItem("pw:" + root.dataset.slug);
    // 2. 关键：把明文从 DOM 里抹掉，否则「锁定」只是视觉上的
    content.innerHTML = "";
    content.classList.add("hidden");
    // 3. 恢复密码输入界面
    lockEl?.classList.remove("hidden");
    actions?.classList.add("hidden");
    // 4. 通知 TOC 等模块一并清空
    document.dispatchEvent(new CustomEvent("password:locked"));
}
```

四个步骤里最容易被忽略的是第二步：`innerHTML = ""`。不清 DOM 的话，按钮只是把输入界面换回来了，**正文明文还躺在页面里**——F12 一开全在，锁了个寂寞。

还有个连带问题：目录项是从解密后的正文里抽取出来的，正文抹掉了，侧栏目录还挂着各级标题——「锁了门，却把房间清单留在门上」。所以 TOC 也监听了 `password:locked`，收到后清空目录并停掉滚动监听。

## 加密范围一览

| 内容 | 处理方式 |
|---|---|
| 文章正文 | 🔒 加密 |
| 许可证块 | 🔒 加密（放在 slot 内一起） |
| 标题、封面、描述 | 公开（列表页可见） |
| 首页卡片摘要 | 置空（防首段泄露） |
| 侧栏目录 | 解密前隐藏，解密后重建 |
| 评论区 | 不渲染（加密文章没意义） |
| RSS | 只出标题和描述 |

## 安全性：必须说实话的部分

这套方案的安全性**完全取决于密码强度**：

- 密文就写在页面源码里，任何人都能拿到；
- 安全性 = AES-256-GCM + PBKDF2(10 万次) 的密码学强度；
- 弱密码（`123456`、`password`）理论上可以被离线暴力破解；
- 适合「防路人」「防搜索」的隐私场景，**不适合**真正高安全需求的内容。

对于静态博客来说，这已经是不依赖服务端能做到的最好方案之一了。

## 用法

frontmatter 加两个未知字段就行：

```yaml
---
title: 私密文章
published: 2026-09-13
description: 手写的摘要（记得写，防卡片回退泄露）
password: "你的密码"
passwordHint: "可选的密码提示，会显示在输入框下方"
---
```

本站放了一篇演示：[加密文章示例](/posts/encrypted-post-demo/)，密码提示是「本站用的博客框架名（小写英文，6 个字母）」——去试试解锁，再点点图片、代码块复制按钮，看看解密后的世界是否完整，最后拉到文末点一下「锁定本文」。

## 相关阅读

- [加密文章示例：给博客加把锁](/posts/encrypted-post-demo/) —— 本文功能的实际演示，解密后的正文就是为此准备的验收清单
- [悬浮工具栏：五个按钮的实现](/posts/floating-toolbar/) —— 同样依赖「解密/切页后重新初始化」这类事件钩子的组件
- [多图并排：Markdown 图片网格](/posts/markdown-image-grid/) —— 同样借鉴自夏夜流萤博客的另一个功能落地，自带活的网格范例

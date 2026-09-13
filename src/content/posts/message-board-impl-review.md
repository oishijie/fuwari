---
title: 转载｜从 Giscus 到自建留言板：与我的方案对比
published: 2026-09-13
category: 博客魔改
tags:
  - 评论系统
  - 自建后端
  - Cloudflare
image: 'https://images.unsplash.com/photo-1587560699334-cc4ff634909a?q=80&w=1200&h=800&auto=format&fit=crop'
---

> **转载声明**：本文主体整理自白咲雫《繁琐小事与留言板的实现教程》（2026-01-27，<https://blog.shiro.team/posts/dev-log/message-board-impl/>）。原文版权归原作者所有，此处为学习目的作中文整理与二次评注，**非逐字翻译**；文中的代码片段、接口设计与数值均引自原文。文中「本站 / 留心博客」指笔者自己的部署（Cloudflare Workers + D1 自建评论），与原文作者方案并列对照。

---

巧的是，笔者自己的博客在 2026-09-12 也刚把评论系统从 Giscus 迁到了自建后端。所以看到这篇教程时，与其说是"学新东西"，不如说是**拿到一份现成的对照样本**——同样的起点（逃离 Giscus）、同样的栈（Astro + Svelte），却走了不同的存储与部署路线。下面先整理原作者怎么做，再逐项和笔者的方案比。

## 一、原作者想解决什么

把博客原有的评论系统从 **Giscus** 迁到**自建留言板**，动机很直接：

- **更轻量**：访客无需 GitHub 登录就能留言；
- **深度集成**：能塞进 Astro 主题的视觉语言里；
- **自己掌控数据**：可随意定制样式、未来加邮件通知或后台管理；
- 技术载体选了 **Vercel KV（Redis）**。

## 二、技术栈一览

| 层 | 方案 | 说明 |
|---|---|---|
| 前端 | Astro（`output: static` 纯静态）+ Svelte + Tailwind | 和笔者的栈一致 |
| 后端 | Vercel Serverless Function（Astro API 路由，`prerender=false`） | 笔者拆成独立 Cloudflare Worker |
| 存储 | Vercel KV（Redis），单 Key `messages` 存整数组；无 Redis 时降级本地 JSON | 笔者用 Cloudflare D1（关系型 SQLite） |
| 部署 | Vercel | 笔者用 Cloudflare Pages + Worker |
| 渲染 | `markdown-it` + `sanitize-html` 白名单 | 笔者用纯文本 `textContent` |

## 三、数据模型与接口

**扁平数组 + `slug` 区分页面**：每条留言是一段对象，靠 `slug` 字段（默认取 `location.pathname`）过滤属于哪篇文章；嵌套回复用 `parentId` 指向父留言。

```ts
interface Message {
  id: string;
  slug?: string;
  parentId?: string;
  nickname: string;
  content: string;
  email?: string;
  website?: string;
  avatar: string;
  createdAt: number;
  replies?: Message[];   // 前端建树时填充
  os?: string; browser?: string; device?: string;
}
```

**接口**只有两个：

- `GET /api/messages/?slug=xxx` —— 取该页留言，返回 JSON；
- `POST /api/messages/` —— 收 `nickname / content / email / website / parentId / slug`，后端用 `ua-parser-js` 解析 `User-Agent` 入库设备信息，并按邮箱决定头像。

**头像逻辑**：邮箱匹配 QQ 号（或 `@qq.com`）→ 用 `https://q1.qlogo.cn/g?b=qq&nk=<qq>&s=100`；否则用 `dicebear` 生成 identicon：

```ts
const qqMatch = email.match(/^(\d{5,11})(@qq\.com)?$/);
const avatar = qqMatch
  ? `https://q1.qlogo.cn/g?b=qq&nk=${qqMatch[1]}&s=100`
  : `https://api.dicebear.com/7.x/identicon/svg?seed=${nickname}`;
```

## 四、防滥用与嵌套回复

**反垃圾**只做了三件事：非空校验（后端 400、前端按钮 `disabled`）、长度上限（昵称 20 / 内容 500 / 邮箱 50 / 网址 100）、以及**总量硬砍 2000 条**（`messages.pop()` 踢最旧）。原文**没有验证码，也没有频率限制**。

**嵌套回复**：库里扁平存，前端用 `Map<id>` 建树——遍历时若 `parentId` 存在就塞进父级的 `replies`，否则当根留言；根留言按 `createdAt` 倒序（新在前），回复按正序（对话时间线）。渲染用 `<svelte:self>` 组件自调用实现无限层级缩进。

## 五、实时性与几个取舍

- **非实时推送**：没有 WebSocket / SSE，提交成功后 `fetchMessages()` 重新拉全量刷新列表；
- **延迟拉取防 LCP 阻塞**：`onMount` 里 `setTimeout(() => fetchMessages(), 100)`，避免阻塞首屏；
- **Markdown 解析器单例化**：若在每条留言的 `MessageItem.svelte` 里 `new MarkdownIt()` 会每条建实例、吃内存，于是用 Svelte 的 `<script context="module">` 把解析器提升为模块级单例；
- **本地降级**：无 Redis 环境变量时自动改用 `data/messages.json`（`fs.writeFileSync`），降低本地起环境的门槛；
- **存储简化**：用单 Key 数组而非 Redis 复杂结构（Sorted Set / Hash），以简化逻辑，再用 2000 条上限防止无限膨胀。

XSS 防护是把 `markdown-it` 渲染结果过 `sanitize-html` 白名单（`span` 仅放行 `spoiler` class），并支持 `||黑幕||` 转 `<span class="spoiler">` 的剧透语法：

```svelte
<script context="module" lang="ts">
  import MarkdownIt from "markdown-it";
  import sanitizeHtml from "sanitize-html";
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
  const sanitizeOptions = {
    allowedTags: ["p","b","i","em","strong","a","code","pre","span","img","details","summary"],
    allowedAttributes: { img: ["src","alt","title"], a: ["href","title","target"], span: ["class"] },
    allowedClasses: { span: ["spoiler"] },
  };
  function renderContent(text: string) {
    const withSpoilers = text.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler">$1</span>');
    return sanitizeHtml(md.render(withSpoilers), sanitizeOptions);
  }
</script>
```

## 六、与「留心博客」自建评论的对比

笔者的方案 2026-09-12 上线，后端是独立 `workers/comments` Worker + D1，前端 `Comments.astro`。同一道题，两个答案：

| 维度 | 白咲雫（原文） | 留心博客（本站） |
|---|---|---|
| 存储 | Vercel KV，单 Key 数组 | Cloudflare D1，关系表 `comments` |
| 后端归属 | Astro API 路由（`prerender=false`） | 独立 Cloudflare Worker |
| 部署 | Vercel | CF Pages + 自定义域名 `comments.142588.xyz` |
| 匿名 | 完全匿名（昵称+内容必填） | 完全匿名 |
| 防滥用 | 仅长度上限 + 2000 总量 | 蜜罐 `trap` + 同 IP 同文 30s 限流 + 长度上限 + 可选审核 |
| XSS | `markdown-it` + `sanitize-html` 白名单 | 纯文本 `textContent`（结构上无口子） |
| 头像 | QQ 头像 / dicebear 外链 | 无（纯文字） |
| 嵌套回复 | 前端树形，删父不级联 | `parent_id` 校验 + 递归 CTE 级联删除 |
| 设备信息 | 解析 OS/Browser/Device 入库 | 未做 |
| 输入缓存 | `localStorage` 缓存昵称邮箱 | 未做 |
| 拉取时机 | `setTimeout(100ms)` 延迟拉取 | 提交后刷新（无 100ms 延迟） |

逐项说笔者的判断：

1. **存储架构：本站更"正"。** 原文把所有留言塞进一个 Redis Key 的数组，每次读写都要全量序列化；作者自己用 2000 条 `pop()` 兜底。文章一多、某篇爆火，全量读写会越拖越慢，且**无法按 slug 在服务端分页**。本站用 D1 可以直接 `WHERE post_slug = ? ORDER BY ... LIMIT`，天然索引、可分页、还能用递归 CTE 做级联删除——长期更稳。
2. **后端解耦：本站更干净。** 原文把 `src/pages/api/messages.ts` 声明 `prerender=false` 混进 Astro 静态站，靠 Vercel 把这条路由变 Serverless；本站把评论彻底拆成独立 Worker，Astro 只 `fetch`，不污染构建、不受静态输出约束。
3. **大陆可达性：本站已修坑，原文未讨论。** 原文的 `blog.shiro.team` 看着是 Cloudflare 代理域名，但教程本身没提部署地域。本站刚踩过"`*.workers.dev` 在国内被 DNS 污染连不上"的坑，已绑自定义域名——**这一条本站更稳**。
4. **防垃圾：本站更严。** 原文那版没有频率限制 / 验证码，匿名留言板一旦被爬被刷就是裸奔；本站已有蜜罐 + 限流 + 可选审核。
5. **XSS 取舍：各有权衡。** 原文支持富文本（`||黑幕||`、链接、代码块），但要背一条 sanitize 管线；本站走纯文本，牺牲富文本换"结构上不可能 XSS"。不是谁错，是取舍不同。

## 七、值得借鉴的点（按性价比）

| 项 | 价值 | 风险 | 建议 |
|---|---|---|---|
| `localStorage` 缓存昵称/邮箱/网址 | 高，体验立竿见影 | 极低 | **建议抄** |
| 延迟 100ms 拉取防 LCP | 中 | 极低 | **建议抄** |
| UA 解析设备小标签 | 中，评论区更"活" | 低（UA 不可信，仅展示） | 可抄 |
| QQ / dicebear 头像 | 中，视觉更丰富 | **中高**：外链 SVG，本站刚因图床失效炸过 favicon，对静态资源外链有痛教训 | 想做就走本地生成/缓存，别裸挂外链 |
| `||黑幕||` + Markdown 渲染 | 趣味 | **高**：要引入 `markdown-it`+`sanitize-html`，与本站纯文本防御哲学冲突 | 谨慎，除非正式支持富文本 |

## 八、小结

这篇教程对笔者的价值，主要在**验证路线**而非**提供新方案**：在存储（D1）、后端解耦（独立 Worker）、反垃圾（限流+蜜罐）、大陆可达（自定义域名）四个关键点上，本站 2026-09-12 的那版都**优于或等于**它。唯一明显不如、且成本低值得补的，是**用户输入缓存**和**拉取延迟优化**——两项几乎零风险。

如果你的博客也在用 Giscus 或别的第三方评论，不一定要马上换；但有两件事值得现在确认：评论数据存在哪里、出问题能不能拿回来，以及访客为了留一句话要付出多少成本。这两点，正是我们各自"出走 Giscus"的共同起点。

## 相关阅读

- [自建评论系统：从 Giscus 到 Cloudflare Workers + D1](/posts/self-hosted-comments/)：本站评论后端的完整实现与踩坑记录。
- [右侧悬浮工具栏：回顶部、随机一篇、目录抽屉与评论跳转](/posts/floating-toolbar/)：右下角"跳评论"按钮，直达的就是这套自建评论区。

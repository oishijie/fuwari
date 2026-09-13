---
title: '自建评论系统：用 Cloudflare Workers + D1 替换 Giscus'
published: 2026-09-08
description: 'GitHub 账号被风控，Giscus 评论连同历史数据一起消失。索性自己造一个——用 Cloudflare Workers + D1 写了套评论后端，访客不用登录任何账号就能留言，支持引用回复，数据握在自己手里。'
image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Workers', 'D1', '评论系统']
category: 博客魔改
draft: false
lang: ''
order: 0
---

之前本站的评论用的是 Giscus——一个把 GitHub Discussions 当评论存储、靠免登录的 GitHub OAuth 让访客发言的方案。它很好用，配置简单，还有现成的 Astro 组件。

直到某天，评论全没了。

## 起因：账号被风控，评论一起陪葬

排查过程很直接：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.github.com/repos/worhllo2/fuwari
# 404
```

Giscus 的后端仓库不见了。为了排除是我这边网络的问题（这台机器对 GitHub 的解析一直有点毛病），拿原作者的仓库做了对照：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.github.com/repos/saicaca/fuwari
# 200
```

对照返回 200，说明网络正常，**404 是真的**。

根因也清楚了：绑定 Giscus 的那个 GitHub 账号被平台风控（flagged），账号对外不可见，它名下的仓库自然一起 404。**存在 Discussions 里的历史评论，随账号一起消失了，救不回来。**

这件事给我留下的教训比评论本身更重要：

> **别把面向访客的服务后端，挂在自己的 GitHub 账号上。账号层面的风控会连带废掉你的服务，而且是静默的、不可恢复的。**

## 选型：为什么决定自己造

摆在前面的路有几条，我把它们摊开对比了一下：

| 方案 | 后端在哪 | 访客要登录吗 | 成本 | 风险 |
| :--- | :--- | :--- | :--- | :--- |
| Giscus | GitHub 仓库 | **要**（GitHub 账号） | 免费 | 再次被账号风控连坐 |
| Twikoo / Waline | Vercel + 云数据库 | 不用 | 免费额度 | 多两个第三方账号依赖 |
| 自建 Workers + D1 | 自己的 Cloudflare | 不用 | 免费额度足够 | 功能要自己写 |

两个决定性因素：

**第一，访客门槛。** Giscus 要求访客登录 GitHub 才能评论。对一个中文技术博客来说，这基本劝退九成读者——愿意为了留一句话去注册/登录 GitHub 的人太少了。自建方案可以做到昵称 + 正文就能发。

**第二，技术栈复用。** 本站的访问统计已经在用 Cloudflare Workers + D1，账号、部署流程、运维直觉都是现成的，边际成本几乎为零。

于是动手。

## 数据模型：一张表

评论系统的本质是「谁、在哪篇文章下、说了什么」，加上一点反垃圾需要的元信息。一张表就够：

```sql
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug  TEXT    NOT NULL,   -- 文章标识，如 /posts/xxx/
  author     TEXT    NOT NULL,   -- 昵称
  email      TEXT    NOT NULL DEFAULT '',  -- 仅站长可见，不对外输出
  website    TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL,   -- 正文（纯文本）
  created_at TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'approved',  -- approved / pending / spam
  ip_hash    TEXT    NOT NULL DEFAULT '',  -- IP 的 SHA-256，仅用于限流
  parent_id  INTEGER DEFAULT NULL          -- 被回复的评论 id
);
```

几个刻意的设计：

- **`post_slug` 存规范化后的路径**（统一首尾斜杠、抹掉域名和查询串）。这样即使以后换域名，旧评论也不会失联。
- **`email` 只存不返**。写入数据库，但 API 输出时直接剔除，避免公开暴露。
- **`ip_hash` 存哈希不存明文**。加盐后 SHA-256，仅用于「同一 IP 对同一篇文章 30 秒内只能发一条」的频控查询。哈希不可逆，就算数据库泄露也还原不出访客 IP。
- **`content` 按纯文本存**，不存 HTML。

## 后端：五个接口，三层反垃圾

Worker 一共暴露五个端点：

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| GET | `/api/comments?slug=/posts/xxx/` | 拉取某篇文章的评论 |
| GET | `/api/comments/count?slugs=a,b,c` | 批量统计各文章评论数 |
| POST | `/api/comments` | 发表评论 |
| DELETE | `/api/comments/:id` | 删除评论（需管理口令） |
| GET | `/health` | 健康检查 |

### 反垃圾的第一层：蜜罐

前端表单里藏了一个正常访客永远看不到的输入框：

```html
<input id="cmt-trap" type="text" name="trap" tabindex="-1"
       autocomplete="off" aria-hidden="true" />
```

CSS 把它挪到屏幕外（`position: absolute; left: -9999px`），真实用户用鼠标点不到、Tab 也跳不过去。而扫站的自动脚本只看 `input` 标签，往往无脑全填。

服务端一旦发现这个字段非空，**直接丢弃，但仍返回成功**：

```ts
// 蜜罐命中：静默丢弃，不给爬虫任何反馈
if (clean(body.trap, 50) !== "") {
  return json({ ok: true, pending: false, comment: null }, 200, cors);
}
```

不返回错误是故意的——报错等于告诉对方「你被识破了」，脚本作者改一行代码就能绕过。让它以为成功了，才有意义。

### 第二层：频率限制

同一 IP 对同一篇文章，30 秒内只允许提交一次。注意查询条件里带了 `post_slug`，所以换个说法就不算了：

```ts
const recent = await env.DB.prepare(
  `SELECT COUNT(*) AS n FROM comments
    WHERE ip_hash = ? AND post_slug = ? AND created_at > ?`,
).bind(ipHash, slug, since).first<{ n: number }>();

if ((recent?.n ?? 0) > 0) {
  return json({ error: "发得有点快，请等待 30 秒后再试" }, 429, cors);
}
```

### 第三层：长度上限

昵称 40、邮箱 120、网址 200、正文 2000 字符。同时过一遍控制字符过滤（保留换行和制表），避免有人往内容里塞不可见字符搞乱排版。

## 前端：Swup 兼容与 XSS 防护

前端是个纯 Astro 组件，没引入任何框架。有两件事必须处理好。

### 一是 Swup 无刷新导航

本站用 Swup 做页面过渡，切页时 DOM 是**局部替换**的，`DOMContentLoaded` 不会再触发。所以脚本必须挂 `astro:page-load` 钩子，并且用 `dataset` 标记防重复绑定：

```js
function init() {
  const section = document.getElementById("post-comment");
  // Swup 每次换页会插入新的 section，用标记避免同一节点重复绑定
  if (!section || section.dataset.cmtInit === "1") return;
  section.dataset.cmtInit = "1";
  // ...
}

document.addEventListener("astro:page-load", init);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
```

漏掉这一步的典型症状是：首次进入文章页评论正常，点进第二篇就失灵了。

### 二是 XSS

评论是唯一的用户产生内容，也是最大的注入面。这里的做法是**不用 `innerHTML`**，全部走 DOM API + `textContent`：

```js
const body = document.createElement("div");
body.className = "cmt-content";
body.textContent = node.content;   // 原样当文本，标签不会被解析
```

配合服务端「纯文本存储」，从数据到渲染整条链路都不存在 HTML 解析，结构上就没有 XSS 的口子。

## 引用回复：`parent_id` 的取舍

最初的版本是平铺列表，读起来像聊天室刷屏。加上引用回复只需要一个字段：`parent_id` 指向被回复的评论 id，`NULL` 表示顶层。

服务端在写入前会校验这个 id——**必须存在，且必须属于同一篇文章**：

```ts
let parentId: number | null = null;
const rawParent = Number(body.parentId);
if (Number.isInteger(rawParent) && rawParent > 0) {
  const parent = await env.DB.prepare(
    `SELECT id FROM comments WHERE id = ? AND post_slug = ?`,
  ).bind(rawParent, slug).first<{ id: number }>();
  if (!parent) return json({ error: "被回复的评论已不存在" }, 400, cors);
  parentId = parent.id;
}
```

前端拿到扁平列表后组装成树，递归渲染。有两个细节值得一提：

**缩进上限。** 无限层级嵌套在窄屏上会把正文挤成一条竖线，所以设了 3 层缩进上限，更深的回复视觉上不再往右推进：

```js
const MAX_INDENT_DEPTH = 3;
// ...
if (depth + 1 >= MAX_INDENT_DEPTH) kids.classList.add("cmt-children-flat");
```

**父评论被删怎么办。** 如果管理员删掉一条评论，它的回复就成了孤儿。这里用 SQLite 的递归 CTE 做级联删除，一条语句清掉整棵子树：

```sql
WITH RECURSIVE subtree(id) AS (
  SELECT ? AS id
  UNION ALL
  SELECT c.id FROM comments c JOIN subtree s ON c.parent_id = s.id
)
DELETE FROM comments WHERE id IN (SELECT id FROM subtree)
```

实测删掉一条有三层结构的根评论，返回 `{"ok":true,"deleted":3}`，三条一起清干净。

## 部署路上踩的两个坑

这两条坑都很隐蔽，值得单独说。

### 坑一：`*.workers.dev` 在国内不可用

部署完成后按惯例测健康检查：

```bash
curl https://blog-comments.3292722614.workers.dev/health
# HTTP 000
```

解析一下域名：

```
Addresses:  2a03:2880:f102:183:face:b00c:0:25de
            38.121.72.166
```

`38.121.72.166` 和 `face:b00c::` 这个组合是典型的 DNS 污染应答（Facebook 的 IP 段）。也就是说 `workers.dev` 这个域在国内根本连不上——**哪怕服务本身跑得好好的**。

解法是绑自定义域名。在 `wrangler.jsonc` 里加一段：

```jsonc title="wrangler.jsonc"
"routes": [
  { "pattern": "comments.142588.xyz", "custom_domain": true }
]
```

`custom_domain: true` 会让 wrangler 自动创建 DNS 记录和证书，重新部署后几十秒内生效。换成自己的域名再测，`200` 立刻就有了。

> 如果你的博客读者主要在国内，**给 Worker 绑自定义域名不是优化项，是必选项。**

### 坑二：环境变量把 OAuth 登录态遮掉了

`wrangler d1 create` 报了这么个错：

```
X [ERROR] A request to the Cloudflare API (/accounts/.../d1/database) failed.
  Authentication error [code: 10000]
```

但 `wrangler whoami` 显示一切正常，账号邮箱都对得上。迷惑性就在这儿。

真实原因是：这台机器的环境变量里存在一个 `CLOUDFLARE_API_TOKEN`（权限不含 D1），而它的**优先级高于** `~/.wrangler/config/default.toml` 里的 OAuth 凭据。wrangler 优先用它，于是权限不够，报认证失败。

解法是执行时临时屏蔽这两个环境变量，改用 OAuth 登录态：

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler deploy
```

没有动任何全局配置。

## 成本与收益

跑在 Cloudflare 免费额度内，实际开销：

- **Workers**：每天 10 万次请求（免费额度），评论这种低频接口根本用不完
- **D1**：5 GB 存储 + 每天 500 万次读取，一条评论不到 1 KB
- **打包体积**：整个 Worker gzip 后 **3.23 KiB**

换来的是：

- 访客**不用登录**任何账号，填个昵称就能说两句
- 评论数据在**自己的**数据库里，一条 `wrangler d1 export` 就能完整备份
- 不再有任何平台能因为「账号问题」让你的评论区消失

## 小结

如果你也在用 Giscus 或者别的第三方评论服务，不一定要马上换。但有两件事值得现在就确认一下：

1. **你的评论数据存在哪里？如果那个地方出问题，你还能拿回来吗？** 我的答案是「存在 GitHub Discussions，账号被封后全部丢失」——这是我最不想给的答案。
2. **你的访客为了留一句话，需要付出多少成本？** 如果要登录，那大概率他们不会留。

自建评论系统的代码量其实很小：一个 300 行的 Worker，一个 Astro 组件，加上一张表。真正的难点不在写代码，而在部署时那几个和平台特性、本机环境相关的坑——我踩过的都写在上头了，希望能帮你少走一段。

评论区就在下面，欢迎测试。

## 相关阅读

- [右侧悬浮工具栏：回顶部、随机一篇、目录抽屉与评论跳转是怎么做的](/posts/floating-toolbar/)：右下角工具栏的"跳评论"按钮，直达的就是这套自建评论区。
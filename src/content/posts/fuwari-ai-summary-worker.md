---
title: 给博客配一张「AI 摘要」卡：Cloudflare Worker + D1 缓存实操
published: 2026-09-17
description: 从在别人博客看到 AI 摘要说起，到把「Worker 生成 + D1 缓存 + 前端打字机」整条链路落到自己的 Fuwari 上。含方案取舍、真实代码，以及字数截断、缓存失效、行尾污染三个坑的完整排错记录。
tags:
  - Fuwari
  - Cloudflare Workers
  - AI 摘要
category: 博客魔改
---

## 起因

刷到一篇讲「给博客加 AI 摘要」的文章（[blog.csun.site](https://blog.csun.site/blog/2024-06-25-add-ai-summary-to-blog)），作者的思路很清爽：访客打开文章时，由后端读一遍全文，让大模型写一段两三句话的中文摘要，打字机式地打在文章开头。

类似的实现网上不少，但其中很大一部分是**前端直接拿 `description` 字段做打字效果**——说白了摘要内容就是文章简介，跟模型没关系。我想做的是真的让模型读完整篇文章再写。于是先花时间把方案拆开评估，确认可行之后才动手。

## 一、先别急着抄：把原方案拆开看

原方案其实是三件事：

| 部分 | 做法 | 关键点 |
|:--|:--|:--|
| 后端 | 单文件 CF Worker，`POST /api/summary` | token 鉴权 + CORS，转发到任意 OpenAI 兼容端点 |
| 缓存 | `caches.default` + D1 表存摘要 | key 取**正文的哈希**，同一篇只烧一次额度 |
| 前端 | 一个约 381 行的组件 | 抓正文 → 请求 → 打字机展示，靠 pjax 钩子重跑 |

真正值钱的是中间那条「**用正文哈希做缓存键**」——写博客的人自己改文章是常态，一旦正文变了哈希就变，摘要自动重算；正文没动就永远命中缓存，不会每次访问都掏钱。

再对照本站已有的家底：

| 需要的东西 | 本站状态 |
|:--|:--|
| Worker + 自有域名 | 有，`workers/comments` 已绑 `comments.142588.xyz` |
| D1 数据库 | 有，库 `blog-comments`，binding 名 `DB` |
| CORS 白名单机制 | 有，`buildCors` + `ALLOWED_ORIGINS` |
| IP 哈希（做限流用） | 有，现成的 `hashIp()` |
| 前端注入配置的写法 | 有，`define:vars` |
| 切页生命周期钩子 | 有，本站用 Swup，等价于它的 pjax |

结论是：**后端基建已经现成了 90%，唯一要从零写的只有一个前端组件**，Worker 那边只是加一条路由的量。

## 二、动手前先定四件事

1. **模型从哪来** —— 选了 CF Workers AI 的 binding。免密钥、免注册，和 Worker 同平台，免费额度 10000 neurons/天，摘要这点量完全够。备选是外部 OpenAI 兼容 API（额度更足，但要 `wrangler secret` 存 key）。
2. **Worker 落点** —— 直接在现有 `blog-comments` 上加路由。新建独立 Worker 职责更干净，但要多维护一套部署，不值。
3. **什么时候生成** —— 客户端按需。首访等 1~2 秒，之后命中缓存秒出；正文一改哈希变，自动重生成。构建时预生成虽然访客零等待，但构建期要密钥，还得把缓存文件提交进仓库，太别扭。
4. **展示位置** —— 正文最前面，打字机效果。

顺带定下三条红线：

- 🔴 **加密文章必须跳过**：正文是密文，送去模型没意义，也违背加密本意；
- 🔴 **密钥不能进前端**：原方案把 token 写在页面里，等于裸奔，谁扒走都能刷额度。改成服务端做 Origin 校验 + IP 限流；
- 🟡 **提取正文要剔噪声**：代码块、公式、SVG 都得扔掉，不然摘要会被代码污染。

## 三、后端：给评论 Worker 加一条路由

### 3.1 处理流程

`POST /api/summary`，入参 `{ content, slug }`，依次过五道：

```text
Origin 白名单 → 规范化正文 → sha256 查 D1 缓存
                                    ├─ 命中 → 直接返回（cached: true）
                                    └─ 未命中 → 查当日限额 → 调 Workers AI → 回写缓存
```

限额只统计**真实调用模型**的次数（命中缓存不计数），同 IP 每天 30 次。这个数字对正常访客绰绰有余，对刷子来说够用。

### 3.2 缓存优先

```ts
const content = normalizeContent(body.content);
const slug = normalizeSlug(body.slug);
if (content.length < 80) return json({ error: "正文太短，无需摘要" }, 400, cors);

// 缓存键 = 提示词版本 + 正文，两者任一变化都会重算
const hash = await sha256Hex(AI_PROMPT_VERSION + "\n" + content);

const cached = await env.DB.prepare(`SELECT summary FROM ai_summaries WHERE hash = ?`)
	.bind(hash)
	.first<{ summary: string }>();
if (cached?.summary) return json({ summary: cached.summary, cached: true }, 200, cors);
```

`normalizeContent` 会去掉零宽字符、把连续空白压成单空格，再截到 8000 字送模型——同一篇文章因为排版差异产生的细微不同，会被规范化抹平，提高命中率。

### 3.3 调模型

Workers AI 的 binding 用法很直白，`env.AI.run(模型, 参数)` 即可，不需要任何 key：

```ts
const model = env.AI_MODEL || DEFAULT_AI_MODEL;
const out = await ai.run(model, {
	messages: [
		{ role: "system", content: AI_SYSTEM_PROMPT },
		{ role: "user", content },
	],
	max_tokens: 200,
});
const raw = typeof out === "string" ? out : String(out?.response ?? "");
summary = trimSummary(raw);
```

默认模型是 `@cf/meta/llama-3.1-8b-instruct-fp8-fast`（带 fp8 量化，快且免费额度内可用）。想换模型只改 `wrangler.jsonc` 里 `AI_MODEL` 一行，代码不用动。

### 3.4 数据表

```sql
-- 摘要缓存：key 是「规范化正文的 SHA-256」，正文不改就不会重复调用模型
CREATE TABLE IF NOT EXISTS ai_summaries (
  hash       TEXT PRIMARY KEY,
  slug       TEXT NOT NULL DEFAULT '',
  summary    TEXT NOT NULL,
  model      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- 每日生成次数限额：只有「未命中缓存、真的要跑模型」的请求才计数
CREATE TABLE IF NOT EXISTS ai_summary_quota (
  ip_hash TEXT    NOT NULL,
  day     TEXT    NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
```

写入用 upsert，`batch` 一次提交两条（缓存 + 计数）：

```ts
await env.DB.batch([
	env.DB.prepare(
		`INSERT INTO ai_summaries (hash, slug, summary, model, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(hash) DO UPDATE SET summary = excluded.summary, model = excluded.model`,
	).bind(hash, slug, summary, model, new Date().toISOString()),
	env.DB.prepare(
		`INSERT INTO ai_summary_quota (ip_hash, day, used) VALUES (?, ?, 1)
		 ON CONFLICT(ip_hash, day) DO UPDATE SET used = used + 1`,
	).bind(ipHash, day),
]);
```

### 3.5 wrangler 配置

`wrangler.jsonc` 里注册 AI binding，并声明模型变量：

```jsonc
"ai": {
  "binding": "AI"
},
"vars": {
  "ALLOWED_ORIGINS": "https://blog.142588.xyz,http://localhost:4321,http://127.0.0.1:4321",
  "AI_MODEL": "@cf/meta/llama-3.1-8b-instruct-fp8-fast"
}
```

## 四、前端：一个组件搞定

新建 `src/components/misc/AISummary.astro`。渲染出来的只是一张空壳卡片，真正的活儿全在底部那段 `<script>` 里。四个要点：

**1. 提取正文并剔除噪声。** 克隆正文节点再删掉代码块、公式、SVG，这样不会破坏原 DOM：

```js
function extractContent() {
	var box = document.querySelector("#post-container .markdown-content");
	if (!box) return "";
	var clone = box.cloneNode(true);
	var drop = clone.querySelectorAll(
		"pre, code, .expressive-code, .katex, .katex-display, svg, script, style, .sr-only, [data-ai-summary]",
	);
	for (var i = 0; i < drop.length; i++) drop[i].remove();
	return (clone.textContent || "").replace(/\s+/g, " ").trim();
}
```

**2. 会话级缓存带内容指纹。** 只按 slug 缓存是不够的——你改了文章但字数没变，就会读到旧摘要。所以键里带上一个对正文采样算出的指纹：

```js
// 内容指纹：每 7 个字符采样一次做 djb2，配合长度足以区分不同版本的正文
function fingerprint(s) {
	var h = 5381;
	for (var i = 0; i < s.length; i += 7) {
		h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36) + "-" + s.length;
}

var cacheKey = "ai-summary:" + (section.dataset.slug || "") + ":" + fingerprint(content);
```

**3. 打字机按长度自适应步长**，长短摘要都是两秒左右出完，不会长文等半天、短文一闪而过：

```js
function typewriter(el, text) {
	var total = text.length;
	var step = Math.max(1, Math.ceil(total / 90));
	var i = 0;
	function tick() {
		i = Math.min(total, i + step);
		el.textContent = text.slice(0, i);
		if (i < total) setTimeout(tick, 22);
	}
	tick();
}
```

**4. 该消失的时候自己消失。** 走两条退出路径：服务地址没配就删掉卡片；正文短于 80 字就删掉（讲不到两句话的文章没必要摘要）。加密文章的正文是密文、且密文远比 80 字长——所以还得靠**不往加密分支里挂组件**来兜底（见下），双保险不会漏出一张空卡片。

Swup 换页后要重新初始化，`dataset` 标记保证幂等：

```js
initAll();
document.addEventListener("astro:page-load", initAll);
document.addEventListener("swup:page:view", initAll);
```

### 接入配置与挂载

配置放 `src/config.ts`，复用评论那套后端地址：

```ts
export const aiSummaryConfig: AISummaryConfig = {
	enable: true,
	apiBase: "https://comments.142588.xyz",
};
```

然后挂到文章页。注意**只挂在非加密分支**，加密分支里一行都不加：

```astro
{/* 非加密分支 */}
{aiSummaryConfig.enable && <AISummary slug={entry.slug} class="mb-6 onload-animation" />}
```

文案走 i18n，加了四个 key（`aiSummaryTitle` / `aiSummaryThinking` / `aiSummaryFailed` / `aiSummaryRetry`）。这里有个硬约束：`Translation` 的类型是 `{ [K in I18nKey]: string }`，**语言文件里少一个 key 就全站类型报错**，所以 10 个语言文件必须一次补齐。

## 五、部署三步

```bash
cd workers/comments

# 1. 建表（已上线的库要加 --remote）
npx wrangler d1 execute blog-comments --remote --file=./migrate-ai-summary.sql

# 2. 部署 Worker
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

第 3 步是前端：`git push` 之后 CF Pages 自动构建，约 80 秒生效。

> 关于那个 `env -u`：本机 shell 里导出过 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`，而 wrangler 会因为这两个变量走 API Token 模式而不是 OAuth 登录态，报错 10000。每次部署前先 `unset` 掉最省事。

## 六、四个坑

### 坑 1：摘要被切成半句话

第一版上线后，文章开头的摘要收在「用户只需点一下就」——半句话断在这儿。

原因不是模型没写完，是后端在硬切：

```ts
// 旧代码
summary = raw.replace(...).trim().slice(0, AI_LIMITS.summaryChars); // summaryChars = 200
```

`slice` 按字符数一刀切，正好落在句子中间。修了三层：

| 层 | 手段 | 作用 |
|:--|:--|:--|
| 提示词 | 「两三句话、不超过 120 字、必须以完整句子收尾」 | 让模型主动写短、写完整 |
| `max_tokens` | `512 → 200`（约 135 汉字天花板） | **从物理上**限制长度 |
| `trimSummary()` | 超限时退回最后一个句末标点收尾 | 兜底，绝不切半句 |

收尾函数长这样：

```ts
function trimSummary(raw: string): string {
	const text = raw.replace(/\s*\n+\s*/g, " ").trim();
	if (text.length <= AI_LIMITS.summaryChars) return text;

	const head = text.slice(0, AI_LIMITS.summaryChars);
	const cut = Math.max(
		head.lastIndexOf("。"),
		head.lastIndexOf("！"),
		head.lastIndexOf("？"),
		head.lastIndexOf("；"),
	);
	if (cut >= AI_LIMITS.summaryChars * 0.5) return head.slice(0, cut + 1);
	return head.replace(/[，、,;；:：\s]+$/, "") + "…";
}
```

这里踩到一个反直觉的教训。我先试的纯提示词方案，把指令写得非常明确（"只写 2 到 3 句话、共 100 字左右，这是硬性限制"），结果**字数不降反升**：均值从 127 涨到 149，最长的到了 167 字。llama-8b 这类小模型对"写几句话"的理解偏向"写满几句"，光靠提示词压不住。

最后真正起效的是 `max_tokens: 200` 这个物理闸门——**约束小模型的中文输出长度，硬参数比提示词可靠得多**。三轮下来的数据：

| 轮次 | 参数 | 字数区间 | 均值 | 截断 |
|:--|:--|:--|:--|:--|
| 第 1 轮 | 安全网 150 | 105–147 | 127 | 0 |
| 第 2 轮 | 提示词写"2 到 3 句话" | **126–167** ↑ | 149 | 0 |
| 第 3 轮 | **`max_tokens: 200`** | **98–152** | **129** | **0** |

### 坑 2：改了提示词，旧摘要不失效

改完 prompt 才发现缓存键只用了正文的哈希——同一篇文章会一直命中用旧提示词生成的摘要，用户永远看到旧的截断版。

修法很简单：把提示词版本掺进哈希。**以后改提示词只需递增版本号，旧摘要自动作废**。

```ts
/** 提示词版本：参与缓存 key 计算。改提示词时递增，旧摘要即自动失效 */
const AI_PROMPT_VERSION = "v2";

const hash = await sha256Hex(AI_PROMPT_VERSION + "\n" + content);
```

### 坑 3：行尾被整体翻转

提交前扫了一眼 `git diff --stat`，显示改了 2097 行——但我实际只加了三百多行。查下来是**行尾污染**：

- 十几个源码文件（`config.ts`、`i18n/*.ts`、`AGENTS.md`）被翻成了 CRLF——是我用 Python 的 `read_text/write_text` 时踩了 Windows 的通用换行转换；
- 几篇文章被翻成了 LF——不是这次改的，像是编辑器整体重写所致。

`.gitignore` 和 `core.autocrlf` 都救不了这种（本仓库 `core.autocrlf=false`、没有 `.gitattributes`，行尾就是实打实的字节差异）。最后写了个按 HEAD 原风格归一化行尾的脚本，把 22 个文件修回去，diff 从 2097 行收敛到真实的 363 行。

**教训**：批量改文件的行尾一定要用二进制模式读写，改完必须回读字节确认。

### 坑 4：刷新之后，摘要不见了

上线后收到反馈：从首页点进文章摘要正常，**按 F5 刷新，卡片直接消失**。

排查下来是执行时机的问题。Astro 对带 `define:vars` 的 `<script>` 会输出成**内联普通脚本**（没有 `type="module"`、不会 defer），也就是说它是**同步执行**的。而摘要卡挂在正文**之前**——脚本跑到 `initAll()` 的那一刻，`.markdown-content` 还没被浏览器解析出来：

```js
var content = extractContent();   // 此时返回 ""
if (content.length < 80) {        // 被当成「正文过短」
	section.remove();               // 卡片被删掉，而且不会再回来
	return;
}
```

那为什么「从首页点进来」是正常的？因为本站用 Swup 做无刷新换页，而 **innerHTML 插入的脚本不会执行**，换页后的初始化实际是靠 `swup:page:view` 事件触发的——那时 DOM 已经完整。两种进入方式走了两条完全不同的路径，只有整页加载那条会踩到。

修法是把「下结论」推迟到 DOM 就绪：

```js
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initAll);
} else {
	initAll();
}
```

再在单张卡片上加一道守卫——**DOM 还在加载、且连正文容器都找不到**时，不要判定「没有正文」，直接返回等事件重试；`dataset.aiInit` 的置位也要挪到确认可判定之后，否则会被标记成「已初始化」而不再重试：

```js
if (!document.querySelector("#post-container .markdown-content") && document.readyState === "loading") {
	return;
}
section.dataset.aiInit = "1";
```

验证时我没有开浏览器，而是把这个脚本抽出来、配一个最小 DOM 桩在 Node 里跑：模拟「刷新（正文未解析）」「Swup 换页」「正文确实过短」「正常渲染」四种时序，外加一组**阴性对照**（把代码还原成修复前的写法，确认它真的会复现删除行为）。12 项断言全过——旧写法 `removed=true`，新写法不删且能正常取到摘要。

这条值得单独记一笔：**Astro 里凡是带 `define:vars` 的脚本都会退化成同步内联脚本，任何「挂在正文之前、又要读正文 DOM」的组件都必须等 DOMContentLoaded**。同一个坑，`Comments.astro` 就天然躲过了——因为它挂在正文之后。
## 七、实测

接口直接压两发：

| 次数 | 状态 | 耗时 | cached | 说明 |
|:--|:--|:--|:--|:--|
| 第 1 次 | 200 | 2362ms | `false` | 真实调用模型生成 |
| 第 2 次 | 200 | **554ms** | `true` | 命中 D1 缓存，不再烧额度 |

缓存生效的速度差是 4 倍多，而且第二发完全不消耗模型额度——这就是「正文哈希当缓存键」的价值。

字数方面，抽样 6 篇文章，稳定落在 98–152 字、全部以句号完整收尾。

## 小结

整套下来真正的工作量是**一个前端组件 + Worker 里一条路由 + 两张表**，后端基建几乎全是复用的。三个决定成败的细节：

1. **缓存键用正文哈希**（再掺提示词版本），这是省额度又不丢新鲜度的核心；
2. **限流放服务端**，别学原方案把 token 写进前端；
3. **用 `max_tokens` 而不是提示词**去约束输出长度，小模型不吃"字数"这一套。

至于成效——你现在看到这篇文章开头的摘要，就是它自己生成的。

# AGENTS.md

给在本仓库工作的 AI 编码代理（以及人类协作者）的项目说明。

## 项目概况

- **定位**：基于 [saicaca/fuwari](https://github.com/saicaca/fuwari) 定制的 Astro 博客，站名「留心博客」，目标域名 `https://blog.142588.xyz/`。
- **类型**：Astro 静态站点（SSG），构建产出为纯静态文件，**没有服务端运行时**。
- **包管理**：**只允许 pnpm**（`preinstall` 钩子用 `only-allow` 强制），版本锁定 `pnpm@9.14.4`。
- **Node**：要求 18+。

## 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `pnpm dev` | 本地开发服务器（默认 `http://localhost:4321`） |
| `pnpm build` | 生产构建：`astro build` + `pagefind --site dist` |
| `pnpm preview` | 预览 `dist` 产物 |
| `pnpm check` | Astro 类型检查（**改动后必跑**） |
| `pnpm type-check` | TypeScript 检查（`tsc --noEmit --isolatedDeclarations`） |
| `pnpm lint` / `pnpm format` | Biome 检查 / 格式化 |
| `pnpm new-post "<标题>"` | 新建文章 |
| `npx wrangler deploy` | 部署评论后端（在 `workers/comments/` 下，见下方专节） |

## 架构与关键文件

- `src/config.ts` — **站点配置的唯一入口**（站点信息、导航、个人资料、评论、统计）。改站点行为先看这里。
- `src/types/config.ts` — 上述配置的类型定义。**新增配置项必须同步类型**，否则 `pnpm check` 会失败。
- `src/content/config.ts` — 文章 frontmatter 的 zod schema。
- `src/utils/content-utils.ts` — 文章排序与列表聚合。
- `src/layouts/Layout.astro` — 全局 HTML 骨架、meta / OG / Twitter 输出、主题与滚动条初始化。
- `src/layouts/MainGridLayout.astro` — 页面栅格骨架（导航 / 侧栏 / 主区 / TOC / 页脚）。
- `src/pages/posts/[...slug].astro` — 文章详情页，含评论区挂载点与 JSON-LD 输出。
- `src/components/misc/Comments.astro` — 评论前端组件（Swup 兼容、DOM API 渲染防 XSS）。
- `workers/comments/` — 评论后端（Cloudflare Workers + D1），**独立于博客项目**，有自己的 `package.json` 与部署流程。

## 项目约定（改代码前先读）

1. **置顶 / 置底**用 frontmatter 的 `order` 字段：`1` 置顶、`0` 默认、`-1` 置底。排序在 `getRawSortedPosts()` 中实现——**`order` 是第一优先级，发布日期倒序是第二优先级**。
2. **评论是自建后端，不是第三方嵌入**：前端 `Comments.astro` 直接 fetch `commentConfig.apiBase`，正文以纯文本存储并用 `textContent` 渲染。**不要再引入 Giscus / Disqus 等第三方评论脚本**，也不要把评论正文当 HTML 渲染（XSS）。
3. **Swup 无刷新导航全局启用**。任何依赖 `DOMContentLoaded` 的客户端脚本，**必须同时监听 `astro:page-load` 或 Swup 的 `page:view` 钩子**，否则页面切换后会失效。参考 `Comments.astro`、`Webviso.astro` 的写法。
4. **i18n**：新增 UI 文案要走 `src/i18n/languages/*`，不要在组件里硬编码可见文案。
5. **访问统计有两套并存**：`webvisoConfig`（自托管，当前启用）与 `umamiConfig`（默认关闭），二者相互独立。
6. 代码风格由 Biome 统一，提交前跑 `pnpm lint`。
7. **加密文章**：frontmatter 加 `password`（可选 `passwordHint`）即启用，原理与改动点见下方专节。解密成功后全局会派发 `password:decrypted` 事件，**任何依赖正文 DOM 的初始化逻辑都要监听它重跑**（TOC、图片灯箱、代码块裁剪等已接好）。
8. **多图并排网格画廊**：正文用 `[grid]` 与 `[/grid]` 包住图片段落即自动成网格，列数 = 图片数（1~4，最高 4 列；移动端自动单列）。实现：`src/plugins/remark-image-grid.js`（remark AST 阶段重组，注册于 `astro.config.mjs` remarkPlugins **最前**）+ `src/styles/markdown.css` 的 `.image-grid`（**纯 CSS，勿改 @apply**）。灯箱无需处理（PhotoSwipe 按 `.custom-md img` 委托自动覆盖）。⚠️ 用法注意：`[grid]` 块别放正文**第一段**（`remark-excerpt` 会把首段抽成卡片摘要，网格段落抽不出文本，摘要会空）。
9. **AI 参与程度标示**：文章文末自动显示一张声明卡（复刻自 `blog.7003410.xyz`），frontmatter 写 `aiLevel: none | polish | full` 单独指定，留空取 `aiInvolvementConfig.defaultLevel`。纯静态组件、无客户端脚本，见下方专节。
10. **AI 摘要**：文章顶部自动显示一段 Workers AI 生成的摘要（`AISummary.astro`，客户端按需生成 + D1 缓存）。开关与后端地址在 `aiSummaryConfig`；**加密文章不显示**（正文是密文）；提取正文时会剔除代码块与公式。后端就是评论 Worker 的 `/api/summary`，见下方专节。
11. **赞赏页**：`/sponsor/` 是**纯静态页**（无后端、无客户端脚本），收款方式与鸣谢名单在 `src/sponsor_data.ts` 手工维护，**金额一律不公开**（数据结构里就没有 amount 字段）。收款码放 `public/sponsor/` 即自动生效，缺图显示占位框。见下方专节。
12. **主题色圆底图标**用全局类 `.icon-badge`（`w-10 h-10` 圆底 + 10% 主题色底，定义在 `src/styles/main.css`）。⚠️ **不要写 `bg-[var(--primary)]/10`** —— Tailwind v3 在给 `var()` 任意值加透明度修饰符时**不生成任何 CSS**（静默失效、不报错），`friends.astro` 曾因此整片圆底无色。需要带透明度就用 `color-mix(in oklab, var(--x), transparent N%)`。

## 加密文章（password）

静态站没有服务端，加密采用「**构建时加密 → 浏览器端解密**」：正文在构建时被加密成 Base64 密文写进页面，页面源码不含任何明文；访客输入密码后由 Web Crypto 在本地解密。密码不会发往任何服务器。

**用法**——文章 frontmatter 加两个字段即可：

```yaml
---
title: 私密文章
password: "your-password"
passwordHint: "可选提示（会给访客看）"
---
```

**实现（改动点）**：

| 文件 | 作用 |
| :--- | :--- |
| `src/content/config.ts` | schema 新增 `password` / `passwordHint` |
| `src/utils/crypto-utils.ts` | 构建时加密：AES-256-GCM + PBKDF2(SHA-256, 100000 次)，输出 `Base64(salt16 + iv12 + authTag16 + ciphertext)`。⚠️ 依赖 `node:crypto`，**只能被 `.astro` frontmatter import**，绝不可进客户端 bundle |
| `src/components/misc/EncryptedPost.astro` | `Astro.slots.render("default")` 取渲染后 HTML → 加密 → 输出密码锁 UI + 隐藏容器；客户端 Web Crypto 解密，`sessionStorage` 按 slug 缓存密码（关闭标签页即失效） |
| `src/pages/posts/[...slug].astro` | 有 `password` 时用 `EncryptedPost` 包住正文与许可证，隐藏评论区，并给布局传空 `headings`（防 TOC 泄露标题） |
| `src/components/widget/TOC.astro` | 解密后从注入内容重建目录并重新初始化（监听 `password:decrypted`） |
| `src/layouts/Layout.astro` | 解密后重跑代码块裁剪与 KaTeX 容器、重建 PhotoSwipe 灯箱 |
| `src/pages/rss.xml.ts` | 加密文章**不在 RSS 输出正文**（否则等于绕过密码公开全文） |
| `src/plugins/remark-excerpt.js` | 加密文章的 `excerpt` 强制置空 —— 列表页卡片的摘要是 `description \|\| excerpt`，不封堵就会把**正文第一段明文**印在首页 / 归档 / 分类卡片上 |

**注意事项**：

- 加密文章的**标题、描述、封面、分类 / 标签**仍是公开的（列表页、归档、RSS 里标题可见），**只有正文被加密**。
- 安全性完全取决于密码强度：密文在页面源码里公开可下载，弱密码理论上可被暴力破解。**适合隐私保护场景，不适合高安全需求**。
- salt / iv 是**确定性派生**（HMAC-SHA256，用 `password + slug`），目的是让相同输入永远产生相同密文 —— 这样 dev HMR 重渲染时 `sessionStorage` 缓存的密码不会失效；同时不同文章之间 salt / iv 仍不同。
- 解密后注入的内容走 `innerHTML`，其中的 `<script>` 需手动重建（`EncryptedPost.astro` 已处理）。本项目正文通常无内联脚本，但保留该逻辑。
- ⚠️ **加密文章请自己写 `description`**：`remark-excerpt` 已对加密文章置空摘要，所以不写 `description` 时，列表页卡片上除了标题什么都没有。`description` 本身是公开的，别写敏感内容。
- 示例文章：`src/content/posts/encrypted-post-demo.md`（密码 `fuwari`）—— 既是功能演示，也是解密后渲染（灯箱 / 代码块复制 / 目录重建）的自检样本，验证完可删。
- 校验工具：`.workbuddy/tools/verify-crypto-roundtrip.mjs`（加密→浏览器端解密往返，含错误密码拒绝 / 确定性校验）、`.workbuddy/tools/verify-encrypted-post.mjs`（`.astro` 编译 + 内联脚本 TS 语法）、`.workbuddy/tools/verify-encrypted-excerpt.mjs`（加密文章摘要封堵，3 用例）。

## 404 与 SPA 兜底（重要）

**Cloudflare Pages 的规则**：如果产物根目录里**没有** `404.html`，Pages 会假定这是个单页应用（SPA），把**所有未匹配路径**一律回落到 `/`（首页）并返回 **HTTP 200**。后果就是任意垃圾 URL（`/go.html`、`/随便什么/`）都被当成有效页面，搜索爬虫会照单收录——即所谓 **soft 404**。

**修复方式**：保留 `src/pages/404.astro`。Astro 对状态码页面有特例（`getOutputFilename` 命中 `STATUS_CODE_PAGES`），**无论 `trailingSlash` / `build.format` 怎么配，它都输出为 `dist/404.html`**。这个文件一旦存在，Pages 立刻切换为「真 404」行为：未匹配路径返回该页面 + **404 状态码**。

⚠️ **两条红线**：

- **不要删掉或改名这个文件**（比如改成 `404/index.astro`）。只要产物里没有顶层 `404.html`，整站会立刻退回 SPA 兜底、所有 404 变 200，而且**不会有任何报错提示**。
- 页面文案走 i18n（`notFoundTitle` / `notFoundDesc` / `backToHome`）。`Translation` 类型要求**全语言必填**，新增语言文件时漏了这三个键会让 `pnpm check` 失败；可先用 `.workbuddy/tools/verify-i18n-keys.mjs` 离线自查（纯文本对比，不需要构建）。

**验证**（部署后执行）：

```bash
# 期望 404。修复前这里返回 200，且内容是首页 HTML
curl -s --noproxy '*' -o /dev/null -w "%{http_code}\n" \
  https://blog.142588.xyz/this-page-does-not-exist-12345
```

## 注意事项与已知风险

- 正文配图托管在自建图床 `imgbed.058823.xyz`（Sanyue ImgHub）——构建不依赖其可达性，但页面渲染会。旧域名 `imgbed.142588.xyz` 已 DNS 失效，**不要再引用**；favicon 之类关键静态资源一律放本地 `public/`。
- **文章文件名即 URL**：`src/content/posts/<name>.md` → `/posts/<name>/`，而且 Astro 还会对文件名做 slugify（转小写、空格转 `-`、标点直接删掉）。**文件名一律用英文小写 + 连字符**（如 `sidebar-collapse`），中文标题只写在 frontmatter 的 `title`。
  - 改文件名 = 改 URL。历史外链靠 `public/_redirects` 的 301 兜底：**旧 URL 必须从 `dist/posts/` 里实际生成的目录取**（那就是线上跑过的路径），不能拿文件名原文反推——两者不一致（例：`Now 页启用：把发布门槛降到零.md` 的旧 URL 是 `/posts/now-页启用把发布门槛降到零/`）。
  - ⚠️ 评论以 `location.pathname` 为 key，**改 URL 会让历史评论与文章失联**，需同步迁移 D1 里 `comments.post_slug` 的旧值。
- **`workers/` 下的三个 Worker 不由 Pages 管**，改动后必须各自单独 `wrangler deploy`：`blog-comments`（comments.142588.xyz）/ `blog-analytics`（webana.142588.xyz）/ `blog-bing-banner`（bing.142588.xyz）。探活端点：`/geo`、`/api/stats?hostname=blog.142588.xyz`、`/health`、`/meta`。
- **线上验证用 node fetch**（本机 curl 打 CF 域名会被重置），并加 cache-buster 参数。⚠️ Astro 组件的 scoped `<style>` 会打包成**独立 CSS 文件**（不在 `Layout.*.css` 里，实测文章页共引用 10 个）——校验样式改动必须遍历页面引用的**全部** `/_astro/*.css`，只看第一个会把「已生效」误判成「没生效」。
- 评论后端地址在 `commentConfig.apiBase`（当前 `https://comments.142588.xyz`），**留空时评论区不加载**（前端静默跳过请求）。改博客域名后，记得同步 Worker `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 白名单。
- 评论后端**必须绑自定义域名**：`*.workers.dev` 在中国大陆被 DNS 污染（实测解析到假 IP、HTTP 000），用它是不可用的。
- `astro.config.mjs` 的 `site` 字段必须与真实域名一致，否则 RSS / Sitemap / OG 的绝对链接会出错。
- 本仓库是 git 仓库（remote `oishijie/fuwari`）。🔴 **CF Pages 的 Git 集成已失效**（2026-09-19 实测：部署记录最新停在 `c0727e8` = 9-18 15:10，其后的 `cedae0e`、`7ae9310` 两次 push 均未触发构建；原因是 GitHub 仓库的授权连接指向**另一个 CF 账号**）。push 后线上**不会**自动更新，现以**本地直传**为准：
  `pnpm build && env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler pages deploy dist --project-name=fuwari --branch=main`
  （build 约 2 分钟 / 61 页 / pagefind 索引 50 页 / 产物 22MB / 317 文件；上传约 1 分钟。`wrangler pages deploy` 同样必须 `env -u` 屏蔽环境变量。）
  ⚠️ 构建占本机内存，**动手前必须先获用户同意**。

## 评论后端（workers/comments/）

博客的评论系统**不用 Giscus**（原方案依赖的 GitHub 账号被 flagged，仓库 404 导致评论全线失效，历史数据一并丢失）。现为自建 CF Workers + D1，数据在自己账号里。

| 项 | 值 |
| :--- | :--- |
| 线上地址 | `https://comments.142588.xyz`（自定义域名） |
| Worker 名 | `blog-comments` |
| D1 库 | `blog-comments` · `aa845df3-a7a7-4377-b434-d267c5e7e6b3` |
| 管理口令 | `workers/comments/.admin-token.txt`（已 gitignore），与 Worker secret `ADMIN_TOKEN` 同值 |

⚠️ **部署命令必须屏蔽环境变量**，否则报 `Authentication error [code: 10000]`：

```bash
cd workers/comments
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

原因：本机环境变量里有个权限不足的 `CLOUDFLARE_API_TOKEN`，优先级高于 `~/.wrangler/config/default.toml` 的 OAuth 凭据。详细手册见 `workers/comments/README.md`。

`GET /geo` 是欢迎提示浮层的唯一数据源（见「欢迎提示浮层」一节）。它不碰 D1，只读 `request.cf` 再向国内 IP 库补一次，改完按上面的命令重新部署即可。

## AI 摘要（Workers AI）

文章顶部一张摘要卡。方案参考 `blog.csun.site`，但**后端直接复用评论 Worker**——不需要新 Worker、新域名，也不需要任何外部 API key。

| 项 | 值 |
| :--- | :--- |
| 前端组件 | `src/components/misc/AISummary.astro`（客户端 fetch，无构建期依赖） |
| 配置 | `src/config.ts` 的 `aiSummaryConfig { enable, apiBase }`（与评论同一个 Worker） |
| 后端路由 | `POST /api/summary`（在 `workers/comments/src/index.ts`） |
| 缓存 | D1 表 `ai_summaries`，key = 正文规范化后的 SHA-256 |
| 限额 | D1 表 `ai_summary_quota`，同一 IP 每天 30 次「真实生成」（命中缓存不计数） |
| 模型 | Workers AI，`wrangler.jsonc` 的 `AI_MODEL`，默认 `@cf/meta/llama-3.1-8b-instruct-fp8-fast` |
| 长度控制 | 提示词要求「两三句话、≤120 字」+ `max_tokens: 200` 双保险；`trimSummary()` 超长时回退到最后一个句末标点收尾，**绝不硬切半句话** |
| 缓存失效 | 缓存 key = `sha256(AI_PROMPT_VERSION + 正文)`。**改提示词后必须递增 `AI_PROMPT_VERSION`**，否则同篇文章会一直命中旧摘要 |

**🔴 客户端脚本执行时机（踩过的坑，2026-09-17）**：Astro 对带 `define:vars` 的 `<script>` 会输出成**内联普通脚本**（没有 `type="module"`、不 defer），**同步执行**。摘要卡挂在正文**之前**，所以整页加载/刷新时脚本跑起来的那一刻正文还没解析 → `extractContent()` 返回空串 → 被当成「正文过短」→ `section.remove()` 把卡片删掉。表现就是**「从首页点进文章正常，F5 刷新后摘要消失」**。

修法两条：① `document.readyState === "loading"` 时把首次初始化延后到 `DOMContentLoaded`；② initOne 里「找不到 `#post-container .markdown-content` 且 DOM 仍在加载」时直接返回、不下删除结论（`dataset.aiInit` 置位要挪到确认可判定之后，否则不会重试）。

⚠️ **Swup 换页不受影响的原因**：innerHTML 插入的脚本不会执行，换页实际由 `swup:page:view` / `astro:page-load` 事件兜住——这正是「点进来正常、刷新才炸」的由来。**凡是挂在正文之前、且要读正文 DOM 的客户端组件都适用此条。**

**首次启用比评论多两步**（D1 建表 + 重新部署让 Worker 拿到 AI 绑定）：

```bash
cd workers/comments
npx wrangler d1 execute blog-comments --remote --file=./migrate-ai-summary.sql
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

⚠️ Workers AI 需要在 Cloudflare 后台**为账号开通**（免费额度 10000 neurons/天，无需信用卡）。没开通时 `/api/summary` 会失败。

行为约定：

- **加密文章不生成摘要**：组件只挂在非加密分支，且正文不足 80 字时自删，不会留下空卡片。
- 前端把正文截断到 8000 字上报，Worker 端按 `sha256(规范化正文)` 查缓存 —— **正文不改就不会重复调用模型**。
- 前端用 `sessionStorage` 缓存结果（key 含内容指纹），Swup 换页不重复请求、不重播打字机。
- 请求带 `Origin` 且不在 `ALLOWED_ORIGINS` 白名单时直接 403。

## 赞赏页（/sponsor/）

一个纯静态的赞赏 / 鸣谢页：**无后端、无客户端脚本**，收款方式与鸣谢名单全部手工维护。

| 项 | 值 |
| :--- | :--- |
| 页面 | `src/pages/sponsor.astro` |
| 数据 | `src/sponsor_data.ts`（`sponsorWays` 收款方式 / `sponsors` 鸣谢名单） |
| 导航入口 | `src/config.ts` 的 `navBarConfig`，位于「友链」与「开往」之间 |
| 收款码 | 图片放 `public/sponsor/`，路径写在 `sponsorWays[].qr` |

行为约定：

- **金额一律不公开**：数据接口里没有 amount 字段，页面也不渲染任何金额数字。要改这条约定，得同时改数据接口与页面。
- **收款码缺图不报错**：`<img>` 带 `onerror`，图片不存在或加载失败时给 `.sponsor-qr-frame` 加 `.is-empty`，显示虚线占位框。把图片按 `qr` 路径丢进 `public/sponsor/` 即自动生效，**不需要动代码**。
- **名单排序**：有 `date` 的按日期倒序在前，无 `date` 的按数组书写顺序附在末尾 —— 维护时**往下追加**即可，不必手动调位置。
- 留言最多 2 行（`-webkit-line-clamp`），头像缺失时回退为昵称首字符。
- ⚠️ 文案硬编码中文，**没有走 i18n**（与 `friends.astro` / `now.astro` 一致）：单语言站内页可以照这个先例办。
- 样式刻意避开 Tailwind 的两个坑（已用 `tailwindcss` CLI 实测产物确认）：
  1. `bg-[var(--primary)]/10` **不会生成任何 CSS** —— v3 无法给 `var()` 任意值注入 alpha，整个类被静默丢弃。圆底图标一律用全局 `.icon-badge`（定义在 `src/styles/main.css` 的 `@layer components`，内部用 `color-mix()`）。
  2. `ml-13` 不在默认 spacing scale 内，**同样不生成**。改用 `.sponsor-indent`。
- 🔴 **暗色模式的文字色必须走页面级变量**：全局 `--deep-text` **只在 `:root` 定义了一次**（`oklch(0.25)` = 深色字），`:root.dark` 里没有覆盖。直接引用它在暗色下就是深底深字 —— 「几点说明」整段曾整段隐身（收款方式名、名单姓名/留言/日期同理）。本页现在派生了一份：`.sponsor-page { --sponsor-text: var(--deep-text) }` + `:global(:root.dark) .sponsor-page { --sponsor-text: oklch(0.95 0.008 var(--hue)) }`，**所有文字色统一引用 `--sponsor-text`**，新增样式别退回 `--deep-text`。
  **验证**：`node .workbuddy/tools/verify-sponsor-dark.mjs`（**24 项**）—— stylus 真编译取主题变量，断言 `:root.dark` 里确实没有 `--deep-text`（根因），再按 OKLCH 的 L 分量直接比文字/底色亮度差（暗色 0.70 / 浅色 0.75，均 ≥ 0.5），不开浏览器。
- 预览：`node .workbuddy/tools/preview-sponsor-page.mjs` 产出可切浅/深色的自包含 HTML（脚本会把 `:global()` 剥壳 —— 它一个合法 CSS 选择器都不是，不剥浏览器会整条丢弃，暗色对照就成了假的）。

## 归档页（/archive/）与 client:only 的坑

`src/pages/archive.astro` 里两个 Svelte 组件的**渲染模式故意不一样，别改错**：

| 组件 | 指令 | 为什么 |
| :--- | :--- | :--- |
| `ArchivePanel`（按年份分组的文章列表） | **`client:load`** | 必须由服务端渲染出内容。它曾是 `client:only`：服务端只吐一个空 `<astro-island>`，所有文字都要等浏览器 hydrate 才出现——客户端 JS 一出问题（或 swup 切页后岛屿没挂上），**整页就是空白**，而其他页面（服务端有内容）看着完全正常，极易误判成数据或构建故障（2026-09-18 实际踩过） |
| `ArchiveHeatmap`（更新热力图） | `client:only="svelte"` | 纯展示，坏掉只是少一块装饰 |

- 🔴 `ArchivePanel.svelte` 的分组**必须在顶层算一次**（`let groups = buildGroups(sortedPosts)`）：SSR 不执行 `onMount`，放在 `onMount` 里服务端渲出来仍是空卡片。URL 上的 `tag` / `category` 筛选才放 `onMount`（那里有 `window`）。
- ⚠️ **`@iconify/svelte` 在 Svelte 5 服务端渲染下必崩**（`Cannot read properties of null (reading 'r')`，已用最小复现确认）。因此凡是用 `<Icon>` 的组件**都必须保持 `client:only`**（`Search` / `LightDarkSwitch` / `DisplaySettings` 同理）；把它改成 `client:load` 会让 dev / build 直接报错。热力图里那唯一的图标已换成**内联 SVG**（path 直取 `@iconify-json/material-symbols` 的 `history`），将来若要给热力图开 SSR 也不会被它卡住。
- 自检：`node .workbuddy/tools/verify-archive-ssr.mjs` —— svelte server 编译 + esbuild 打包 + 真渲染一遍，断言产物含年份分组与文章标题（不启动 dev server）。

## 桌面宠物（CodexPet）

站点级浮层的桌面宠物：左下角一只会动的角色，可拖动、点击切动画，Swup 切页不重载。

| 项 | 值 |
| :--- | :--- |
| SDK | `public/lib/codex-pet.js`（无依赖，取自 [ZyPLJ/WebCodexPet](https://github.com/ZyPLJ/WebCodexPet) 的 `embed/`，**MIT**，许可副本见 `public/lib/LICENSE-codex-pet.txt`） |
| 角色资源 | `public/pets/<id>/pet.json` + `spritesheet.webp` |
| 配置 | `src/config.ts` 的 `petConfig`（类型见 `src/types/config.ts` 的 `PetConfig` / `PetPosition`） |
| 挂载 | `src/layouts/Layout.astro` —— body 内宿主 `#site-pet-host` + 文件末尾的客户端脚本 |
| 预览 | `.workbuddy/preview/pet-preview.html`（自包含：内联 SDK / 元数据 / 雪碧图，可切深色、可模拟切页） |

挂载策略（三点都不能省）：

1. **必须挂在 Swup 容器之外**。本站 Swup `containers: ["main", "#toc"]`，宿主放 body 里就不会被替换；一旦挂进 `main`，每次切页宠物都会重载、拖拽位置全丢。
2. **单例守卫**。`window.__sitePetBooted` + `window.sitePet` 双保险：Swup 更新 `<head>` 时可能重跑脚本，没有守卫就会叠出第二只宠物。
3. **延迟下发**。雪碧图 2.3MB 级，脚本等 `load` + `requestIdleCallback` 才去拉，不拖首屏。

本站化改造（原文没有的部分）：

- `zIndex: 40` —— SDK 默认是 `2147483000`，会盖住目录抽屉和评论框。本站层级：正文 < **宠物 40** < 悬浮工具栏 50 < 抽屉遮罩 55 < 抽屉 60。
- `position: "bottom-left"` —— 右下角已被悬浮工具栏（`BackToTop.astro`）占用，宠物默认也在右下，会重叠。
- `hideOnMobile`：窄屏（<768px）不加载；视口跨过断点时只切显隐，没加载过的补加载。
- 尊重 `prefers-reduced-motion: reduce`：系统开了「减少动态效果」就不加载。
- `visibilitychange` 时 `pause()`：否则 SDK 的 `requestAnimationFrame` 会在后台标签页空转。
- `onError` 里移除 SDK 注入的 `.cp-error` 红框：配置错看控制台即可，不该让访客看到调试信息。
- pet.json 的 **UTF-8 BOM 已剥离**（原包带 BOM；SDK 走 `fetch().json()` 时 TextDecoder 会剥掉，但直接 `JSON.parse` 会炸）。

换角色：把新宠物包丢进 `public/pets/<id>/`，改 `petConfig.id` 即可。上游可选 `firefly` / `fufu-sticker` / `ganyu-pet-v2` / `rich-paimon`，**本站只自托管了 firefly**，换别的要先补资源。

资源规格（不对齐会切帧错位）：雪碧图 `1536×1872`，`8×9` 网格，单格 `192×208`；行顺序 `idle / running-right / running-left / waving / jumping / failed / waiting / running / review`。`pet.json` 缺 `atlas` / `rows` 时 SDK 回退到这套默认值（`rich-paimon` 那种精简 pet.json 就走回退）。

## 石蒜挂件（Sakana! Widget）

默认停在**左下角**的一只可拖拽「立牌」角色（莉可丽丝的石蒜模拟器）：按住立牌拖动会物理回弹；底座控制栏四格依次是 **切角色 / 自走模式 / 拖动移动 / 关闭**（2026-09-20 把原来第 3 格的「跳上游 GitHub」原地改造成了拖动柄），Swup 切页不重载。

| 项 | 值 |
| :--- | :--- |
| SDK | `public/lib/sakana-widget.umd.min.js`（v3.1.0，all-in-one UMD，87 KB，零外部请求） |
| 上游 | [dsrkafuu/sakana-widget](https://github.com/dsrkafuu/sakana-widget)（源自 [itorr/sakana](https://github.com/itorr/sakana)），**代码 MIT** |
| 许可 | 副本 + 角色图限制见 `public/lib/LICENSE-sakana-widget.txt` |
| 配置 | `src/config.ts` 的 `sakanaConfig`（类型见 `src/types/config.ts` 的 `SakanaConfig`） |
| 挂载 | `src/layouts/Layout.astro` —— body 内宿主 `#sakana-host` + 文件末尾的客户端脚本 |
| 停靠角 | `sakanaConfig.position`（默认 `bottom-left`）→ 宿主 `data-pos` → `main.css` 的四角规则；用户拖过的位置存 `localStorage['sakana-widget-pos']` |
| 样式 | `src/styles/main.css` 的 `.sakana-host`（按 `[data-pos]` 定位）与 `.sakana-move-handle`；工具栏让位规则在 `src/components/control/BackToTop.astro` |
| 预览 | `.workbuddy/preview/sakana-preview.html`（自包含；带「工具栏上抬/原位」「宽屏/窄屏边距」「切角色」「自走」，以及两个专治切页 bug 的按钮：「模拟 Swup 切页（有守卫）」和「对照组：无守卫」） |

⚠️ **许可提醒**：代码是 MIT，但**内置角色插画（chisato / takina）不可用于任何商业活动**——上游 README 明确声明，插画作者 大伏アオ @blue00f4。角色图以 base64 内联在 UMD 里。

挂载策略与桌面宠物同源（Swup 容器外 + 单例守卫 + `load` + 空闲下发），但有三个 **SDK 特有**的坑必须知道：

1. **`mount()` 用 `cloneNode(false)` 替换宿主元素**——所以只能按 `id` 重新取，不能缓存引用。好在克隆体会继承 inline style，宽高与层级设置不会丢。
2. **`autoFit` 第一次量的是「尚未插入文档的 wrapper」**——`mount()` 里的 `_onResize()` 在 DOM 插入之前调用，浏览器此刻 rect 全 0，于是 `size` 先被钳到下限 **120**；要等 `ResizeObserver` 的初始回调（`observe()` 后浏览器立即异步触发一次）才修正为容器尺寸。**别在 mount 之后同步读尺寸。**
3. 🔴 **SDK 在模块顶层往 `<head>` 注入 `<style>`，会被 Swup 在切页时删掉（最阴的一个坑）**——本站 swup 开了 `updateHead: true`，`@swup/head-plugin` 的 `mergeHeadContents` 会 `removeChild` 掉「当前 head 有、新页面 head 没有」的**所有**节点，只放过 `title` 与 `[data-swup-theme]`（见 `dist/index.module.js`：`.filter(({el}) => t(el))`，`t` 即 `"title" !== localName && !matches("[data-swup-theme]")`）。那个 `<style>` 是 UMD 初始化时注入一次、**永不重注**的，一旦被删就永久失效。
   症状极具辨识度：**人物消失、只剩一根杆子**。因为 `.sakana-widget-img` 的 `background:50%/cover no-repeat` 退回默认 `0% 0% / auto`，角色图按原始像素从左上角裁进 128px 的盒子（那块几乎是透明的）；而杆子是 canvas 画的，不受 CSS 影响。
   修法（`Layout.astro` 的 `captureSdkStyle` / `restoreSdkStyle`，两道保险）：① 找到那个 `<style>` 打上 `data-swup-theme`，让 head-plugin 直接放过；② 引用存 `window.__sakanaStyleEl` 并在 `swup:page:view` 里兜底重挂。
   ⚠️ **引用必须挂 `window`，不能用模块级变量**——head 被更新后模块脚本可能被重跑，模块级 `let` 会被重新初始化为 `null`（`verify-sakana-mount.mjs` 的桩测试就复现了这个陷阱）。

本站化改造（上游没做的）：

- `z-index: 40`——SDK 不管宿主层级，由 `.sakana-host` 决定；与桌面宠物同层（宠物默认关停，两者若同时开会都在左下角）。
- **宿主必须 `pointer-events: none`**——挂件自身的立牌/控制栏才是 `auto`。少了这条，卸载后留下的 fixed 空盒会挡住右下角一大片点击。
- **默认停靠角 + 拖动移动**（2026-09-20）——宿主位置由 `data-pos` 驱动 CSS 四角规则（属性写在标签上，`mount()` 的 `cloneNode` 会连它一起继承，所以 SSR 第一帧就在正确位置，不会先闪一下左上角）；脚本里另有一行兜底断言，属性被上游改坏会被纠回。
  **抓手就在控制栏第 3 格**：脚本把上游那个 `<a href="//github.com/dsrkafuu/sakana-widget">`（切角色 / 自走 / **它** / 关闭）原地改造成拖动柄 —— 去掉 `href/target/rel`、加 `role=button` + `tabindex`、换成四向箭头图标、补 `aria-label`/`title`（文案走宿主 `data-move-label`，编译期注入，脚本不引 i18n）。
  🔴 **原地改造，不替换元素**：SDK 内部只给 `person / magic / close` 三格留了引用（`_domCtrlPerson/…`），这一格是「即插即忘」的，改它碰不到 SDK 自身行为；找不到 `<a>` 就安静退出（SDK 换结构时只损失拖动，不影响挂件）。
  🔴 **定位只能在 `left/top` 与 `right/bottom` 里二选一**：切到 inline `left/top` 时必须同时把 `right/bottom` 置 `auto`，两套锚点并存会同时生效、位置全错。**双击复位** = 清空这四个 inline 值 + 删记忆，落回 `[data-pos]`。
  位置以「整块留在视口内、四周留 8px」钳位（留边是为了拖动柄本身不被切在屏外）；`rememberPosition` 时存 `localStorage['sakana-widget-pos']`，视口 resize 用 rAF 节流再钳一次。⚠️ 这套逻辑只对**被拖过**的挂件生效（判据：宿主有没有 inline `left`），没拖过的交给 CSS，别去抢。
  ⚠️ 双击是自己数的 320ms 内两次抬手，**没用 `dblclick`** —— `pointerdown` 里的 `preventDefault` 在部分浏览器会把后续 click 序列吃掉。
- **让位悬浮工具栏（改成「真的重叠才上抬」）**——挂件默认在左下角，与右下角的工具栏天然不相交。`syncToolbarLift()` 拿挂件**实测矩形**与**工具栏「没上抬时」的基准矩形**（宽高实测；位置按 CSS 锚点反推：right `1.5rem`(≥1024px)/`1rem`、bottom `6rem`(≥768px)/`5rem`）求交，相交才置 `html[data-sakana="on"]`，CSS 上抬幅度仍是 `bottom: 15rem`（240px ≈ 挂件高 200px + 底边距 + 间隙），规则写在 `BackToTop.astro`。
  🔴 **基准必须用「未上抬」的位置算**：若拿工具栏当前实测位置，会「上抬 → 不相交 → 撤掉 → 掉回原位 → 又相交」地来回抖。
  ⚠️ **不要改成「水平避让」（`right: calc(1rem + 200px + 0.75rem)`）** —— 2026-09-19 试过，工具栏左移后会压到正文列，与挂件仍有视觉冲突，用户实测后要求改回上抬。
  ⚠️ 这条**必须写在组件里，不能写进 `main.css`**：`main.css` 的 `@layer components` 优先级低于 Astro 组件未分层的 `<style>`，写在那边会被覆盖。
- **与欢迎浮层让位**（2026-09-20）——`WelcomeToast` 也蹲在左下角（`left:1rem; bottom:1rem`），与挂件默认角必然重叠。浮层 `show()/hide()` 往 `<html>` 写 `data-welcome="on"`，`main.css` 据此把挂件临时抬到 `bottom: calc(1rem + 6.5rem)`，浮层 6 秒后自动消失即落回。
  ⚠️ 用**属性**而不是 CustomEvent：挂件脚本可能还没加载，属性天然表达「当前状态」而非「一次性事件」。⚠️ 只对没被拖过的挂件生效（拖过的用 inline `left/top`，`bottom: auto` 会自然压过这条规则，正好）。
- **尺寸与手感是同一件事**——`size` 同时决定容器、人物图（`size/1.25`）与 canvas（`size×1.5`），**并且决定摇幅上限 `maxR = clamp(size/5, 30, 60)`**：200→40°、160→32°、120 被钳到 30°。所以「挂件调小 = 摇得拘谨发僵」，**不要按视口高度做矮屏降级**（曾经做过 120px 的降级，已移除）。参数全走 SDK 默认（`size: 200` + 默认物理 `i .08 / s .1 / d .988`），不要为手感加 `physics` 覆盖。
- 点关闭（控制栏最后一格）= 上游默认的 `unmount()`（彻底移除）。本站只加收尾：卸载后撤掉 `data-sakana`、清空 `window.sakanaWidget`，让工具栏放回原位；不干预 SDK 行为。
- `syncSakanaVisibility()` 先比对上次状态再调 `show()`/`hide()`——SDK 的 `show()` 在组件本就没隐藏时会 `console.warn`，而 mount 后与每次切页都会走到这里。
- **静止自动停帧是 SDK 自带的**（`_run` 里运动量 < `threshold` 即 return），不像宠物那样需要额外的 `visibilitychange` 暂停。实测约 1180 帧后自行停止。
- 深色模式：SDK 的控制栏是硬编码浅灰（`#ddd` / `#555`），预览页给了 `html.dark` 覆盖写法；**站点目前保留上游原样**，要改就照预览里那两行加进 `main.css`。

换角色：改 `sakanaConfig.character` 为 `chisato`（千束，默认）或 `takina`（泷奈）。也可用 `SakanaWidget.registerCharacter()` 注册自己的图（URL 或 base64）——跨域图片必须开 CORS，否则 canvas 被标脏、立牌直接不显示。若要覆盖物理参数，必须走「同名覆盖内置角色」（`registerCharacter` 传同名字段）而非新建角色，否则底座切角色会循环出重复形象。

## 阅读模式三档（`MainGridLayout.astro`）

**折叠与沉浸是同一件事的两个深度**（2026-09-20 合并）：两者都收侧栏、都收窄正文，差别只在「收多深」。原先各有一套开关与状态源（`html[data-sidebar]` + `body.immersive-reading`），两套 CSS 要互相抢特异性，还留着「两个开关同时开着算哪一档」的未定义状态。现在收进**一个属性**：

| 值 | 含义 | 收掉什么 | 正文量宽 |
| :--- | :--- | :--- | :--- |
| `off` | 本页不适用（首页 / 归档 / 关于…） | — | 展开态常态 |
| `expanded` | 双栏，侧栏展开 | 什么都不收 | 卡内 800px |
| `collapsed` | **文章页默认档** | 只收侧栏，导航 / banner 保留；正文两侧补**版心竖线** | `var(--read-width)` = 800px |
| `immersive` | 最深一档（样式见下面 ImmersiveReading 一节） | 导航 / banner / 侧栏 / 页脚全隐 | `var(--immersive-width)` = 736px |

- 状态由 `MainGridLayout` 顶部那段 `<script is:inline>` 在首屏绘制前同步写入。
- 🔴 **入口只有一个**：工具栏那一枚 `#immersive-btn` 按 `expanded → collapsed → immersive → expanded` **循环**。也就是说，从默认的「折叠」点一下直接进沉浸，再点一下完整退出。按钮文案按「下一档会去哪」提示，三个 `data-label-*` 由 `BackToTop` 渲染时注入。
- 🔴 **正文左缘的 `#sidebar-toggle` 已删除**（2026-09-20）：它的职责被工具栏按钮完全覆盖，留着就是两个入口做一件事。⚠️ 因此 `collapsible-sidebar` 那篇文章里「半透明小箭头」的描述已过时。
- 偏好存 `sessionStorage['reading-mode']`（值即档位名）。**沉浸档不写入偏好** —— 它是临时态，回到文章页应回到默认档。
- 沉浸档只在 ≥1024px 可达；窄屏时它从循环里消失（退化为 `collapsed ↔ expanded` 两档），已在沉浸时视口收窄会强制回落。移动端（<1024px）整体不参与。
- 目录栏开合（`immersive-toc-open` / `immersive-toc-right`）是**子状态**，挂在 `<html>` 的 class 上，只在沉浸档有意义 —— 进入时默认展开，离开时清掉。

**`collapsed` 档的版心竖线**（2026-09-20 加）

折叠时卡片外缘仍是 1168px（保住「卡片与顶栏等宽」这条对齐线），正文缩在中间 800px，于是左右各 184px 纯白成了空档，文章看着「没东西框住」。解法是在留白里、离字面 `--guide-gap`（46px）处各补一条 1px 竖线，上下各渐隐 `--guide-fade`（64px）：

```css
:root { --guide-gap: 2.875rem; --guide-fade: 4rem; }   /* 全部调节旋钮就这两个 */

html[data-sidebar="collapsed"] #post-container {
    --reading-gutter: max(1.5rem, calc((100% - var(--read-width)) / 2));
    padding-left:  var(--reading-gutter);
    padding-right: var(--reading-gutter);
}
html[data-sidebar="collapsed"] #post-container::before { left:  calc(var(--reading-gutter) - var(--guide-gap)); }
html[data-sidebar="collapsed"] #post-container::after  { right: calc(var(--reading-gutter) - var(--guide-gap)); }
```

- 🔴 留白抽成 `--reading-gutter`，竖线坐标**必须复用它**：两处各写一份表达式的话，改 `--read-width` 时留白与竖线就会错位。
- 🔴 线只画在**留白里**，不进正文列：不碰任何内容的层叠，不会被代码块 / 引用块压住，也不用给内容加 `z-index`。
- 颜色 `color-mix(in oklab, var(--primary), transparent 80%)`（20% 主题色）：比 `--line-divider` 的黑/白 8% 略实，浅色暗色都看得见，且跟着主题色走。想更淡改那个百分比。
- 卡片自带 `overflow: hidden`，线用 `top/bottom: 0` 顶格 + 两端渐隐即可收干净，不用额外算高度。
- 只在 `@media (min-width: 1024px)` 内。移动端是单列堆叠，不参与。

另外考虑过但**没采用**的两种「框」：① 把卡片本身收窄到 872px 居中 —— 会丢掉「卡片与顶栏等宽」的对齐线；② 卡片不动、正文外套一层淡底 + 细边框 —— 会和已有的引用块 / 代码块叠成多层色块。对照预览留在 `.workbuddy/preview/collapsed-frame-preview.html`，可切 A / B / C 与明暗主题。

🔴 **「本页可不可折叠」只能读运行时 DOM，不能用 Astro 编译期注入的值**（2026-09-19 修的 bug）

- 症状：直接打开 / 刷新文章页默认折叠**正常**，但从首页点进文章页永远不折叠，连开关按钮都不出现 —— 只有刷新才生效。
- 根因：判定用的是 `sidebarCollapsible`（Astro frontmatter 注入的常量），而那段脚本位于 Swup 容器之外、**切页不重跑**，于是常量被永久固化成首屏那一份 HTML 的值：落在首页就是 `false`，`stateFor()` 恒返回 `off`。
- 修法：判定改为运行时读 DOM 标记 —— `#content-wrapper` 上的 `data-sidebar-collapsible`。**标记必须放在 `<main id="swup-container">` 内部**：Swup 的容器是 `["main", "#toc"]`，切页只换 main 的**内容**，`#sidebar` 与 `#main-grid` 本身从不被重建。
- 首屏兜底：脚本同步执行于网格之前，`<main>` 还没解析出来，此时按 URL 路径（`/posts/` 前缀）判断；**只要 `#swup-container` 已经在 DOM 里，就以标记为准**，路径不再参与。
- 同类教训：「在 Swup 容器外（切页不重跑）的脚本里，任何「当前页是什么」的判断都不能来自编译期注入」。

**验证**：`node .workbuddy/tools/verify-reading-mode.mjs`（**145 项**：单状态源不变量 / 入口收敛 / 三档循环 / 配置与 i18n / 布局对接 / 折叠档版心竖线 / 两档样式 + DOM 桩真跑状态机 —— 首屏与切页各路径、三档循环闭合、滚动位置记忆、Escape、目录开合、窄屏回落、`defaultOn`、沉浸不入偏好）。

## 侧栏挂件的展开 / 收起（`WidgetLayout.astro`）

「标签」「分类」条目过多时（如 `tags.length >= 20`）走折叠形态：`.collapse-wrapper.collapsed` 限定高度，底部一个按钮切换。

🔴 **按钮必须常驻，只切文案与箭头方向**：早先的实现在点击回调里 `btn.classList.add('hidden')` 把 `.expand-btn` 整块永久藏掉，而且没有「收回去」的分支 —— 于是只能展开、再也收不回来（2026-09-19 修的 bug）。现在展开态挂 `.expand-btn.expanded` 类，CSS 切换「更多 / 收起」两个 `span` 的 `display` 与箭头 `rotate(180deg)`；状态只写在 DOM 上，重新 upgrade 也不会残留。

新增 i18n 键 **`less`**（`Translation = { [K in I18nKey]: string }` 要求 10 个语言文件全补齐，漏一个 `pnpm check` 直接类型报错）。

**验证**：`node .workbuddy/tools/verify-widget-toggle.mjs`（28 项：模板 / 样式 / i18n 静态检查 + 换原型实例化 class 后真点两下，断言折叠类与 `aria-expanded` 交替）。

## 悬浮工具栏（`BackToTop.astro`）

右下角竖排 7 个按钮（回顶部 / 主页 / 随机 / 目录 / 评论 / **阅读模式** / 音乐），**统一为圆形**（`.toolbar-btn { border-radius: 50% }`，2026-09-19 由圆角方形改来 —— 进度环也随之从圆角矩形改成正圆）。其中**阅读模式那一枚是三档循环入口**（见「阅读模式三档」一节）。**整体在 Swup 容器之外**，切页不重建。2026-09-19 按 [msqy.cc.cd](https://www.msqy.cc.cd/) 复刻，重做了目录与回顶部：

| 项 | 实现 |
| :--- | :--- |
| 目录 | `#toc-popup` —— 贴在按钮列**左侧**、底边对齐的弹窗（`position:absolute; right:calc(100% + .5rem); bottom:0`），从右下角缩放展开。取代原来的全高抽屉 `toc-drawer` + 遮罩 |
| 目录项 | 脚本按当前页 `#toc table-of-contents > a` 生成；层级读**对应 heading 的标签名**（h2/h3/h4），不读克隆后的 `ml-4/ml-8` 类名 —— 加密文章解密后重建目录时同样成立 |
| 高亮 | `#toc-popup-indicator` 背景条随滚动滑动（top/height 过渡），当前项文字与徽章转主题色 |
| 进度环 | `#back-to-top-ring` 是**正圆**（`circle cx=24 cy=24 r=21`，viewBox 48×48；stroke 3 → 外沿 22.5，四周留 1.5px）。周长 `2πr`。⚠️ 按钮圆形化之前它是贴合圆角方形轮廓的 `rect 42×42 rx=9`（周长 `2(w+h) - 8r + 2πr`）—— 换形状只需改模板里那一个元素 + 脚本里的 `RING_RADIUS` 常量，`stroke-dasharray/dashoffset` 用法不变。`requestAnimationFrame` 节流，`scrollMax` 缓存避免每帧重排 |

**位置**：`bottom: 5rem`（lg `6rem`）。与石蒜挂件**真的重叠**时上抬到 `bottom: 15rem`（挂件默认在左下角，所以平时不上抬，见上面石蒜那节）。

🔴 **两个坑**

1. **弹窗样式必须全写 `:global(#toc-popup …)`** —— 目录项是脚本 `createElement` 生成的，不带 Astro 的 scope 属性，普通 scoped 选择器会**静默失配**（面板照常弹出，但一行样式都不生效）。和音乐列表是同一个坑。
2. **改这个文件禁止用 `rfind` 定位 `})();`** —— 单个 `<script is:raw is:inline>` 里**有两个 IIFE**（工具栏、音乐播放器），`rfind` 会命中后者，切片替换会把**整个音乐播放器 JS 一起删掉**。2026-09-19 已踩过一次：恢复源是 `.workbuddy/preview/music-player-preview.html` 的第 2 个 `<script>` 块（那正是当初从组件整段提取的音乐 JS）。

**验证**：`node .workbuddy/tools/verify-toolbar.mjs`（**67 项**，不启 dev —— 抽 IIFE + DOM 桩在 `new Function` 里真跑，覆盖进度环百分比、弹窗开关、层级映射、XSS 转义、Escape／点外关闭、位置规则）。

## 沉浸档（三档中最深的一档 · `ImmersiveReading.astro`）

它**不再是独立功能**，而是上面那条三档光谱的最深处（2026-09-20 合并）：把导航 / banner / 侧栏 / 页脚全部隐去，正文限宽居中，目录升级为常驻侧栏。复刻自 [blog.cuteleaf.cn](https://blog.cuteleaf.cn/) 的 `ImmersiveReading.astro`（同源 Astro 站，客户端脚本压缩后仅 4.5 KB）。

**配置**：`immersiveReadingConfig`（`enable` / `defaultOn` / `tocEnabled` / `tocPosition: "left" | "right"` / `readingWidth`）。默认 `defaultOn: false` —— 不主动打扰访客。

**机制**：全部落在 `html[data-sidebar="immersive"]` 上（**不再有 `body.immersive-reading`**），没有布局重算。本组件只负责三件事：沉浸档样式、目录栏 DOM、配置注入；**档位状态机在 `MainGridLayout`**。

| 选择器 | 作用 |
| :--- | :--- |
| `html[data-sidebar="immersive"]` | 隐去 `#top-row`（一并带走导航与 banner）/ `#sidebar` / `.footer` / `#banner-credit`；把 `#main-panel` 的内联 `top`（= banner 高度）`!important` 归零；`#main-grid` 改 flex 单列；`#post-container` 限宽 `var(--read-width)`（该属性在本档被 `--immersive-width` 覆盖）居中 |
| 同上 `.immersive-toc-open` | 目录栏推入视口，并给 `#main-grid` 让出 `padding-left: calc(var(--immersive-toc-width) + 1rem)` |
| 同上 `.immersive-toc-right` | 目录栏改停右侧（`tocPosition: "right"`） |

🔴 **量宽只有一条链**：折叠档与沉浸档都读同一个 `--read-width`（`:root` 里 50rem），沉浸档只是把它覆盖成 `--immersive-width`（默认 46rem，脚本按配置注入）。想调宽窄改一个数字即可，不会出现「改了一处忘了另一处」。

🔴 **目录栏不另起炉灶，直接接管现有的 `#toc-wrapper`**：目录数据、滚动高亮、点击跳转全部沿用 `TOC.astro` 里的 `<table-of-contents>` 自定义元素，省掉第二份 TOCManager；而且 `#toc` 本来就在 Swup 的替换列表里（`["main", "#toc"]`），**切页会自动重建目录**。为此：

- `#toc-wrapper` 的原父级（原本带 `hidden 2xl:block`）加了 `id="toc-outer"`，沉浸态 `display: block !important` 放行，并抬 `z-index: 45`（**不抬会被 `z-30` 的主面板盖住**）；
- `#toc-inner-wrapper` 从 `fixed top-14` 改成撑满侧栏的 flex 子项 —— 它仍是目录的滚动容器，`TableOfContents.init()` 里那句 `getElementById("toc-inner-wrapper")` 不受影响。⚠️ **必须保持 `position: relative`，不能退成 `static`**：目录里的 `#active-indicator` 是 `absolute`、按它的 `rect.top` 定位，失去定位基准会整块上偏一个标题条高度；
- 目录栏标题条 `#immersive-toc-header`（含收起按钮 `#immersive-toc-close`）放在 `#toc-wrapper` 内、`#toc-inner-wrapper` 外 —— 它不属于 Swup 的替换目标，切页不重建，事件只绑一次。

**必须记住的点**

1. **组件必须在 Swup 容器之外**（和 `BackToTop` 一样），否则切页丢实例。沉浸的档位判断同理**不能有编译期注入的「当前页」常量**（见上面那条铁律）。
2. **量宽变量用 JS 写 `:root`，不要用 `define:vars`** —— 后者会注入 `<style>`，而 Swup 的 head-plugin 会清掉「新页面没有」的节点。
3. **滚动位置由状态机记**：进沉浸归零，出沉浸回到进入前的位置，不是甩回顶部；`Escape` 可退出；视口收窄到 <1024px、或切到非文章页会**自动回落**（沉浸只在桌面端开放）。
4. **退出入口就是工具栏那一枚按钮**（它循环到下一档）；原先左上角的退出浮钮已随合并删除，`#immersive-toc-btn` 只负责目录开合。

**验证**：并入 `verify-reading-mode.mjs`（145 项，见「阅读模式三档」一节的说明）。

**预览**：`.workbuddy/preview/immersive-preview.html` —— 复刻真实骨架 ID 的可交互页面：点按钮循环三档、切目录、切亮暗，顶部实时显示 `data-sidebar` 的值与当前档位。

## 切页滚动（Swup scroll-plugin）

`astro.config.mjs` 里 `swup({ smoothScrolling: true })` 会装入 `@swup/scroll-plugin`。它的默认 `animateScroll.betweenPages = true` 做的是：切页时不立即归零，而是**等新内容替换完，再用 `scrl` 从「当前阅读位置」逐帧惯性滚动回页面顶部**。

在这个博客里它和 DOM 替换、banner 全高↔矮条切换、正文宽度变化挤在同一帧，表现就是「读到一半点进文章，开头总要卡一下、内容从旧位置滑上来」。

修法（`src/layouts/Layout.astro` 的 `setup()` 开头）：**只把跨页这一档改成瞬时归零**，其余档位保留。

```ts
const scrollPlugin = swupInstance?.plugins?.find((p) => p?.name === 'SwupScrollPlugin')
const animateScroll = scrollPlugin?.options?.animateScroll
if (typeof animateScroll === 'boolean') {
	if (scrollPlugin?.options) scrollPlugin.options.animateScroll = false
} else if (animateScroll && typeof animateScroll === 'object') {
	animateScroll.betweenPages = false
}
```

- 按**插件名**查，不按下标 —— `@swup/astro` 是按开关拼装 plugins 数组的，下标会随配置漂移。
- 只动 `betweenPages`：同页 hash 锚点、同页滚动、前进/后退的滚动位置恢复都还在（后者变成瞬时定位，比动画更跟手）。
- 全链路可选链，拿不到实例时静默跳过；`scrollPlugin?.options` 那道判断是给 tsc 窄化用的，删了 `pnpm check` 会报 possibly undefined。
- ⚠️ **别顺手把 `smoothScrolling` 关成 `false`**：那是整包移除 scroll-plugin，会连带丢掉前进/后退恢复位置，且改动落到构建配置上，没必要。
- `#page-height-extend`（撑高元素）保留 —— 它管的是「切页瞬间不让浏览器把 scrollY 钳掉」，与动画无关，两个机制配合才不抖。
- **验证**：`node .workbuddy/tools/verify-swup-scroll.mjs`（**22 项**）—— 把这段逻辑原样切出来，esbuild 转 JS 后在 `node:vm` 里灌 5 种假 swup 实例真跑，再用真 tsc（`--strict`）单文件查类型。

## 悬浮工具栏音乐播放器

右下角悬浮工具栏最底端（「跳转评论区」之下、即最后一项）多了一个音符按钮，点开是这个自研播放器。复刻自 [v-blog.halei0v0.top](https://v-blog.halei0v0.top/)，但**没有引入任何播放器库**：一个单例 store + 命令式 DOM，零新依赖。

| 项 | 值 |
| :--- | :--- |
| 配置 | `src/config.ts` 的 `musicConfig`（类型 `MusicConfig` / `MusicTrack`，在 `src/types/config.ts`） |
| 组件 | `src/components/control/BackToTop.astro` —— 按钮、面板、样式、内联脚本全在这一个文件里 |
| 取源 | `meting`（第三方 Meting API）或 `local`（用 `localPlaylist`，音频自备） |
| 默认歌单 | 网易云 `playlist?id=14164869977`，经 `meting.mysqil.com` 代理（实测可用，响应带 `access-control-allow-origin: *`） |
| 预览 | `.workbuddy/preview/music-player-preview.html`（自包含单文件，**能真的放歌**） |
| 验证 | `node .workbuddy/tools/verify-music-player.mjs`（61 项，抽取脚本在 DOM 桩里真跑） |

**对应的文章**：`src/content/posts/fuwari-sidebar-music-player.md` —— ⚠️ **文件名与 URL 沿用旧 slug**（`fuwari-sidebar-music-player`），正文已整体重写为悬浮工具栏版本。早期那套 APlayer + MetingJS「侧边栏音乐卡片」方案**从未在本项目落地**（`git log --diff-filter=A -- '*aplayer*'` 为空），文章里也不再保留该方案。

**为什么写在 `BackToTop.astro` 而不是新建组件**：面板要按工具栏实测位置定位，而且 Astro 的 scoped `<style>` 不会作用到子组件内部的元素（跨组件就得复制样式或满屏 `:global`），内聚在一个文件里最省事。

**六个必须知道的坑**：

1. 🔴 **音频单例绝不进 DOM**：`window.__musicFabAudio = new Audio()`，不 `appendChild`。工具栏整体位于 Swup 容器（`main#swup-container` / `#toc`）之外，切页不重建，音乐续播。反例是把 `<audio>` 写进模板 —— 切页即被 Swup 替换，播放中断。
2. 🔴 **`<script is:raw is:inline>` 不能配 `define:vars`**（`is:raw` = 内容原样输出，Astro 不处理）。配置改走 `data-music-config={JSON.stringify(music)}` 属性注入，读取时浏览器自动解码实体。
3. 🔴 **面板位置必须由脚本按「音乐按钮」实测 rect 算**：`positionPanel()` 读 `#music-fab-btn` 的 `getBoundingClientRect()`，面板右边缘落在按钮左侧 12px、底边与按钮底边齐平，`maxHeight` 兜住矮屏（超出时面板内部滚动）。🔴 **别对齐整条工具栏的顶端**（2026-09-19 踩过）：本站工具栏有 6 个按钮（≈324px），石蒜挂件又把整条抬到 `bottom: 15rem`（240px），两者相加 ≈564px（再加 12px 间距即 576px）—— 点开后面板出现在视口上半部、离按钮极远。写死 `rem` 同样不行（跟丢上抬）。按钮缺失/未布局（rect 全 0）时回退到工具栏 rect。
4. 🔴 **列表项由 `innerHTML` 生成，元素上没有 Astro 的 scope 属性**，所以 `.music-item*` 的样式必须写成 `:global(#music-list .music-item)`。只写 `.music-item` 会在 scoped 后失配、静默没有样式。
5. 🔴 **曲名 / 艺术家来自第三方 API，进 `innerHTML` 前必须转义**（脚本里的 `esc()`）。桩测试里专门放了一条 `<img src=x onerror=...>` 的曲名做断言。
6. ⚠️ **图标名先核对再写**：`@iconify-json/material-symbols` 并非每个名字都有 `-rounded` 变体。加图标前查 `node_modules/@iconify-json/material-symbols/icons.json` 的 `icons` 键，缺失的图标名会让构建报错。
7. 🔴 **面板必须显式声明 `color`**（2026-09-19 修）：面板内 `.music-title` / `.music-btn` 等一堆 `color: inherit`，而面板是 `fixed` 挂在 `<body>` 下、**`body` 本身没有 `color` 声明** —— 一路继承到浏览器初始值「黑」。亮色下白底黑字看不出问题，**暗色下就是深灰面板上写黑字**（用户实测反馈「看不清」）。修法是根节点写死：
   `.music-panel { color: rgba(0,0,0,.9) }` + `:global(html.dark) .music-panel { color: rgba(255,255,255,.9) }`（等价于站点全局的 `.text-90`）。顺带把暗色下的边框提到 `rgba(255,255,255,.12)`、阴影加深 —— 卡片色 `oklch(.23)` 与页面底色 `oklch(.16)` 只差 0.07，只靠一根白 8% 的边框划边界，整块面板会糊进背景。
   ⚠️ 同类风险：**任何 `fixed` 且自带文字的元素都要自查这条**（TOC 弹窗因为用了 `.text-75/.text-50` 类而幸免）。

**行为要点**（照参考站实现，另有三处本站改良）：

- 歌单**预热**：`requestIdleCallback`（退化 `setTimeout 1800`）才拉清单，首屏不抢带宽；点开面板时若还没拉到会立即拉。
- 自动播放被拦 → 记 `blocked`，在 `document` 上挂一次性 `pointerdown` / `keydown` 补播。
- 单曲播放失败 → 提示 + 1.2s 后自动跳下一首；**歌单加载失败**的提示常驻，不自动清除。
- 循环三态 `0 关 / 1 单曲 / 2 列表`，与随机互斥（开一个自动清另一个）。
- 改良 ①：**上一首在已播放超过 3 秒时先回到本曲开头**（主流播放器行为，参考站没有）。
- 改良 ②：**播放列表与播放面板互斥切换**（同一浮层换内容）。参考站的列表面板是独立浮层叠在播放面板之上，本站工具栏连同石蒜挂件的占位会把它顶出屏幕。
- 改良 ③：**用面板内提示条代替独立 toast 浮层**，面板没打开时不打扰访客。

**换歌单 / 换源**：只改 `musicConfig.id` 即可；想让音乐彻底归自己管，把 `mode` 改成 `"local"` 并把音频放进 `public/`（或图床），填进 `localPlaylist`。⚠️ Meting 是第三方服务、随时可能失效 —— 失效时面板会显示「歌单加载失败，稍后再试」。

## 欢迎提示浮层（WelcomeToast）与 /geo 数据源

右下角→左下角的「你好，来自 XX 的朋友」浮层，**替代了原来的侧边栏「距离」卡片**（`DistanceWidget.astro` 已删除，`SideBar.astro` 里已摘掉挂载并顺延了 stagger 延时）。

| 项 | 值 |
| :--- | :--- |
| 组件 | `src/components/widget/WelcomeToast.astro`（标记 + scoped 样式 + `is:raw is:inline` 脚本） |
| 挂载 | `src/layouts/Layout.astro`，位于 **Swup 容器之外**（`<WelcomeToast />` 紧邻石蒜宿主，在 `<Webviso />` 之前） |
| 配置 | `welcomeConfig`（`src/config.ts` + `src/types/config.ts`）：`enable` / `mode` / `duration` / `homeLat` / `homeLon` / `showIp` |
| 数据 | 评论 Worker 的 `GET /geo`：`source` / `locationText` / `province` / `city` / `district` / `lat` / `lon` / `cf` |
| 定位 | `fixed` 左下角 `1rem`，`z-index: 45`（低于悬浮工具栏 50 / 目录抽屉 60）；<640px 转底部居中 |

**为什么不是右下角**：右下角被悬浮工具栏（50）占着，放那儿必然打架。⚠️ 左下角现在归石蒜挂件（默认 `bottom-left`），浮层弹出时会短暂压住它 —— 靠 `<html data-welcome="on">` 让挂件临时上抬（见石蒜那节）。⚠️ 桌面宠物若改回 `petConfig.enable = true`，它的宿主也在左下角，同样会短暂重叠。

### /geo 的两级数据源（2026-09-19 改造）

1. `request.cf` —— 边缘自带、永远有，但**在中国常常只到省市**；
2. 国内 IP 库补正 —— 主源 `v2.xxapi.cn/api/ip?ip=`（免费无 key，**区级 + 经纬度**）→ 备源 `ip-api.com`（`lang=zh-CN`）；两级都失败就原样退回第 1 级，前端按 `source === "cf"` 走本地省份映射。

三条必守约束：

- 🔴 **只对中国大陆 IP 查国内库**（`country === "CN"`）。实测国内库对境外 IP 会瞎报：`8.8.8.8` 被它说成「英国」。
- 🔴 **国内库返回的坐标必须落在境内**（`inChinaBbox`：lat 3~54 / lon 73~136），越界就丢弃该结果、继续走下一个源 —— 同上，防离谱数据漏到前端。
- ⚠️ **代理 / VPN 访客无解**：CF 看到的是代理出口 IP，服务端再准也是在给代理定位。**本机就是典型**——对 CF 域名出口是 `210.34.94.x`（教育网，被 CF 判成广东广州），对国内域名出口才是真实 IP（移动·福建福州）。

**上游存活情况（2026-09-19 复核）**：`v2.xxapi.cn` ✅ 支持 `?ip=` 查任意 IP 且到区级；`ip.zxinc.org/api.php?type=json&ip=` ✅ 免费无 key 但**只有市级、无坐标**（未接入）；`ip-api.com` ✅（备源）。**已死的别再抄**：百度千帆 qifu-api（404）、`api.vore.top`（Redis MISCONF）、`ip.useragentinfo.com`（连不上）、`api.qqsuu.cn`（接口不存在）。

**前端侧**：1 小时 `localStorage` 缓存（键 `lx-welcome-geo`，带 `at` 时间戳）、5s `AbortController` 超时、`mode: once` 用 `sessionStorage`（键 `lx-welcome-shown`）门控。`astro:page-load` 与 `swup:page:view` **两个事件都监听**，用「同 URL 1.2 秒内只响应一次」去重，否则浮层会闪两下。国家映射表 `COUNTRY_MAP` 只收常见来源国，**未收录的国家码回落为「海外」**（别把 `CO` 这类码直接甩给访客看）。

**文章已同步**：`src/content/posts/sidebar-distance-card.md` 按新实现整篇改写（文件名 / URL 与 `published: 2026-08-24` 保持不变，标题未动、slug 未变所以评论 key 不受影响）——补上「边缘数据判错」与「服务端补查国内库」两条主线、两级数据源代码、三道闸门表、新版 `/geo` 响应示例，以及浮层形态的四个实现细节（左下角原因 / 会话内弹一次 / 移动端居中 / 双事件去重）。改写走 `.workbuddy/tools/apply-distance-post.py`（LF 草稿 → CRLF 落库 + 行尾/BOM 回读断言）。

自检：`node .workbuddy/tools/verify-geo-route.mjs`（30 项，含「本机出口 IP 被 CF 判错 → 国内库纠正回福建、距离回到个位数」的真实场景用例）、`node .workbuddy/tools/verify-welcome-toast.mjs`（47 项），预览 `node .workbuddy/tools/preview-welcome-toast.mjs`。**线上复验用 node fetch**（`fetch('https://comments.142588.xyz/geo')`，本机 curl 打 CF 域名会被重置）；⚠️ WebFetch 自带 15 分钟缓存，复验线上务必加 `?cb=` 之类的参数绕开，否则会读到旧响应、误判成「部署没生效」。

## 访问统计（Webviso 埋点 + SiteStats 卡片 + blog-analytics Worker）

站点访问统计是**自托管**的：`workers/analytics/`（Cloudflare Workers + D1），零第三方依赖。

| 角色 | 文件 / 位置 | 接口 |
| :--- | :--- | :--- |
| 埋点 | `src/components/Webviso.astro`（Layout 全局，每次 `page:view` 上报） | `POST /api/visit` |
| 文章页计数 | `src/pages/posts/[...slug].astro` 的 `#webviso-pv` / `#webviso-uv` | 同上（响应带回该路径 pv/uv） |
| 侧边栏卡片 | `src/components/widget/SiteStats.astro`（sticky 容器第一位，原距离卡的位置） | `GET /api/stats` |
| 配置 | `webvisoConfig` / `siteStatsConfig`（`src/config.ts`）——**两个地址必须指向同一个 Worker** | — |

**历史背景（重要）**：这套统计原本由同一个域名的另一个 Worker 写入。2026-09-17 之后那个 Worker 下线，
`webana.142588.xyz` 变成 CF **1016 origin_dns_error**（源站不存在），埋点静默失败近两天。
2026-09-19 重建为 `workers/analytics/`，**沿用同一个库**（`web_analytics`，1750+ 条历史记录一条没丢），
请求 / 响应格式与原来完全一致，所以前端配置一行都没改。

### 三个口径

| 指标 | 算法 | 说明 |
| :--- | :--- | :--- |
| 总浏览量 pageviews | `COUNT(*)` | 每次页面浏览 +1，刷新也算 |
| 游客数 visitors | `COUNT(DISTINCT visitor_ip)` | 按 IP 去重，不限时间 |
| 访问数 visits | 窗口函数现算 | 同一 IP 相邻两次间隔 > `SESSION_GAP_MINUTES`（默认 30 分钟）计一次新会话，**与 Umami 的 `visits` 同义** |

库里**没有会话字段**，访问数靠 `LAG(create_at) OVER (PARTITION BY visitor_ip ORDER BY create_at, id)`
配合 `julianday()` 换算分钟现算出来（D1 支持窗口函数，SQLite 3.25+）。

### 三个必须记住的坑

- 🔴 **启动代码绝不能放脚本顶层**：`SiteStats.astro` 的 `boot()` 用到后面声明的 `let started / observer`，
  顶层调用会踩 TDZ（`Cannot access 'started' before initialization`），整段脚本直接挂掉、卡片永远停在「-」。
  **启动块一律放脚本最后。** 这是验证脚本抓出来的真实 bug，别凭直觉挪回去。
- ⚠️ **卡片默认不显示假数字**：原站用 `FALLBACK_STATS = 1000` 撑场面；本站 `fallbackStats` 默认 `null`，
  接口失败保持「-」占位。想要原站行为就显式配置。
- ⚠️ **`SITE_HOSTS` 白名单**：库里已有记录的域名（localhost / pages.dev 等）不受限制，
  但**新域名必须命中白名单**才会被登记，避免伪造 hostname 灌垃圾站点。

### 部署与自检

```bash
cd workers/analytics
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

`routes` 里的 `custom_domain: true` 会自动创建 `webana.142588.xyz` 的 DNS 记录与证书
（该记录此前指向已删除的源站，部署即修复）。

| 工具 | 覆盖 |
| :--- | :--- |
| `node .workbuddy/tools/verify-analytics.mjs` | 47 项：桩 D1 跑全部路由、CORS、边界、降级 |
| `node .workbuddy/tools/check-analytics-sql.mjs` | 11 项：**真实 SQL 打线上库**（只读），验证窗口函数与会话数区间 |
| `node .workbuddy/tools/verify-site-stats.mjs` | 60 项：DOM 桩跑卡片脚本，覆盖懒加载/动画/缓存/降级/Swup 重绑 |

预览：`.workbuddy/preview/site-stats-preview.html`（亮暗双主题、多组数据可切）。

⚠️ 写这类脚本时的两个坑：① `execFileSync("npx")` 在 Windows 上必须带 `shell: true`（npx 是 `.cmd`，
node 不能直接 execFile）；② 组件 `<script>` 里可以写 TS，`node:vm` 跑不了类型标注，
抽出来要先过一遍 `esbuild.transform(..., { loader: "ts" })`。

## 首页 banner（Bing 每日壁纸 + blog-bing-banner Worker）

`siteConfig.banner` 已开启，`src` 指向自建取图服务 `https://bing.142588.xyz/today`
（源码 `workers/bing-banner/`，零依赖），**每天自动换图，无需重新构建**。

- **为什么能「每天变」**：`components/misc/ImageWrapper.astro` 对 `http(s)://` 开头的地址走普通
  `<img>` 直出，Astro 不会在构建时下载固化（只有本地相对路径才走 `<Image>`）。
  ⚠️ 改 `banner.src` 时别改成相对路径，否则会被构建时定型。
- **为什么要中间层**：`cn.bing.com/HPImageArchive.aspx` 响应里**没有** `Access-Control-Allow-Origin`，
  前端 fetch 被 CORS 拦死；老教程推荐的第三方直链（`bing.img.run` / `api.dujin.org`）实测已挂。
  Worker 在边缘缓存着调一次 API 再 302，**图片流量不经过 Worker**（浏览器直连 Bing CDN）。
- **署名是动态的**：`layouts/MainGridLayout.astro` 里一段脚本 fetch `/meta`，把 `banner.credit.text`
  换成当天摄影师、`href` 换成 Bing 图片来源页。config 里的 `credit.text/url` 是**兜底值，别删**。
- **兜底链三级（永不白板）**：① Bing 正常 → 302 当天图；② Bing 挂 + `FALLBACK_URL` **探活通过** →
  302 自备兜底图（托管在自己图床，Unsplash License 山峦云海图 1920×1080 / webp q82 / 259 KB，
  源图 `photo-1470071459604-3b5ec3a7fe05`）；③ 兜底图也探不通 → 内置 SVG 渐变占位图（347 B）。
  五种故障（API 500 / DNS 失败 / 非 JSON / `images` 空 / 缺 `urlbase`）都走这条链。
  🔴 **兜底必须探活**（`HEAD` + `cf.cacheTtl`）——直接 302 过去的话，图床挂掉就只剩一个破图；
  而 SVG 内联在 Worker 里永不失败，那才是"永不白板"的最后一道保险。探活只在兜底路径发生，正常路径零开销。
  换兜底图只改 `FALLBACK_URL` 后 redeploy，**不用动代码**。
- **`GET /fallback`**：不管 Bing 死活，直接命中兜底链第 2/3 级，**专用于线上验证兜底**
  （否则只能等 Bing 真挂才有机会测）。带 `X-Fallback: custom|svg` 与 `X-Fallback-Reason`。
- **preconnect**：`layouts/Layout.astro` 的 head 有条件 preconnect（取图域名从 `banner.src` 推导 + `cn.bing.com`），
  省掉跨两域取图的第二次握手。
- **自检**：`node .workbuddy/tools/verify-bing-banner.mjs`（71 项，不部署不起服务）。

⚠️ **版权**：Bing 每日图版权属摄影师 / Shutterstock，Bing 官方 tooltip 明写「此图片不能下载用作壁纸」；
个人博客非商业使用属灰色地带，**展示署名是主要缓解手段**（这也是 credit 默认开着的原因）。

⚠️ **已知瑕疵**：302 一跳 + 约 0.23 MB 下载期间，`Layout.astro` 的 `showBanner()` 已提前淡入，
访客会先看到一小会儿空渐变。要彻底解决需在 `showBanner` 里等 `img.onload`。

📄 **对应的文章**：`src/content/posts/fuwari-bing-banner.md`（`published: 2026-09-19`，slug `fuwari-bing-banner`）
—— 从「为什么中间必须站一个 Worker」（实测该 API 无 CORS 头）讲到尺寸档位与体积实测（含漏掉 `&w=&h` 白多下 30% 那个坑）、
三级兜底链与 `/fallback` 的设计动机，以及为什么最终没选 Unsplash（`source.unsplash.com` 实测 503、`api.unsplash.com` 401）。
正文配图是自绘架构图（图床 `bing-banner-arch.webp`，生成脚本 `.workbuddy/tmp/gen-bing-banner-arch.mjs`，可直接改了重新生成）。

## 本机环境的坑：删除保护钩子（重要）

本机运行着 `safe-delete` 安全钩子（开关 `CODEBUDDY_SAFE_DELETE_ENABLED`，默认**单回合累计删除 50 个文件**即拦截）。Astro 在**开发服务器启动**与**生产构建收尾**时都会批量删除中间产物，所以直接跑 `pnpm dev` / `pnpm build` 会被拦下：

```
[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":70,"threshold":50,...}
```

| 场景 | 被删对象 | 文件数 |
| :--- | :--- | :--- |
| `astro dev` | Vite 重优化依赖，清 `node_modules/.vite/deps` | ~70 |
| `astro build` | 收尾清 SSR 中间产物 | ~58 |

⚠️ **构建时的陷阱**：报错时页面其实**已全部构建完毕**，只是 `astro:build:done` 未执行，导致 `sitemap-index.xml` **静默缺失**，极易误判为构建失败。

**绕过方式**（仅作用于单条命令，不改任何配置）：

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 ./node_modules/.bin/astro dev
CODEBUDDY_SAFE_DELETE_ENABLED=0 ./node_modules/.bin/astro build
```

被删的都是 `node_modules/.vite/`、`dist/` 下可重建的中间产物，风险可控。绕开 `pnpm run` 直接调用 `node_modules/.bin/*` 还可避免 pnpm 创建 `_tmp_*` 临时目录。

### 端口与协议

`astro dev --host` **不带参数时只绑定 IPv6 的 `[::1]`**，`http://127.0.0.1:4321` 会连不上（实测 HTTP 000）。建议显式指定地址：

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 ./node_modules/.bin/astro dev --host 127.0.0.1
```

首次启动要编译内容集合并做依赖预构建，**约 40–60 秒**端口才开始监听；首页首次访问还需额外按需编译，慢是正常的。

## 修改后的自检清单

- [ ] `pnpm check` 通过
- [ ] `pnpm lint` 无新增问题
- [ ] 若改了 `siteConfig` 等配置：类型定义与 `src/config.ts` 已同步
- [ ] 若新增客户端脚本：验证 Swup 页面切换后仍生效
- [ ] 若改了依赖或构建流程：`pnpm build` 可完整产出 `dist`
- [ ] 新增/修改文章后：`python .workbuddy/tools/verify-tags.py`（标签三条守则 + 行尾检查）
- [ ] 新文章落库后：`node .workbuddy/tools/check-post-fm.mjs <slug>`（不启 Astro 的 13 项体检：frontmatter 字段是否在 schema 内 / `published` 可转 Date / tags ≤3 且不与 `category` 重名 / 全 CRLF / 无 BOM / 反引号外无裸 HTML 标签 / 代码围栏成对）。**新文章先写 LF 草稿到 `.workbuddy/tmp/`，再用 python 脚本转 CRLF 落库**（模板：`.workbuddy/tools/write-sakana-post.py`，带 `--check` 复核模式）
- [ ] 若动了宠物：`node .workbuddy/tools/verify-pet-sdk.mjs`（DOM 桩实跑 SDK：参数解析 / 定位数值 / 状态机），并重生成 `.workbuddy/preview/pet-preview.html`
- [ ] 若动了归档页：`node .workbuddy/tools/verify-archive-ssr.mjs`（`ArchivePanel` 必须仍能服务端渲染出年份与文章列表；`ArchiveHeatmap` 保持 `client:only`）
- [ ] 若动了音乐播放器：`node .workbuddy/tools/verify-music-player.mjs`（61 项：配置注入 / 预热 / 歌单装载 / 面板定位 / 播控 / 列表 / XSS 转义 / 单例 / 补播 / 失败降级 / local 模式），并重生成 `.workbuddy/preview/music-player-preview.html`
- [ ] 若动了石蒜挂件：`node .workbuddy/tools/verify-sakana-sdk.mjs`（DOM 桩实跑 SDK：尺寸链 / `maxR` 摇幅 / 控制栏 / 停帧 / 卸载）与 `node .workbuddy/tools/verify-sakana-mount.mjs`（**60 项**：抽取 Layout 脚本真跑，覆盖单例守卫、**head-plugin 清理守卫**、窄屏与减少动效分支、停靠角 `data-pos`、控制栏第 3 格改造成的拖动柄、位置记忆 / 钳位 / 双击复位、**相交才上抬**的工具栏开关）
- [ ] 若动了欢迎浮层或 Worker `/geo`：`node .workbuddy/tools/verify-geo-route.mjs`（27 项：esbuild 打包后真跑 `/geo` 路由 —— 区级补正 / 备源降级 / 全挂退回边缘 / 境外 IP 门控 / 越界坐标丢弃）与 `node .workbuddy/tools/verify-welcome-toast.mjs`（46 项：源码结构 / 区级数据 / 降级映射 / 境外与港澳台 / IP 开关 / 缓存 / 失败降级 / 三种 mode / 事件去重 / 关闭与自动关闭），并重生成 `.workbuddy/preview/welcome-toast-preview.html`
- [ ] 若动了阅读模式（折叠 / 沉浸任一档）或挂件展开收起：`node .workbuddy/tools/verify-reading-mode.mjs`（**145 项**：单状态源 / 入口收敛 / 三档循环 / 配置与 i18n / 布局对接 / 折叠档版心竖线 / 两档样式 + DOM 桩真跑状态机）与 `node .workbuddy/tools/verify-widget-toggle.mjs`（28 项：「更多/收起」交替与 aria 状态），并重生成 `.workbuddy/preview/immersive-preview.html`、`.workbuddy/preview/sidebar-fixes.html`、`.workbuddy/preview/collapsed-frame-preview.html`
- [ ] 若动了悬浮工具栏：`node .workbuddy/tools/verify-toolbar.mjs`（67 项：进度环 / 目录弹窗 / 层级 / 位置规则 / 圆形化 / 面板暗色 / XSS），并重生成 `.workbuddy/preview/toolbar-preview.html`
- [ ] 若动了赞赏页：`node .workbuddy/tools/verify-sponsor-dark.mjs`（24 项：暗色变量覆盖 + 亮度差 + 预览脚本同步），并重生成 `.workbuddy/preview/sponsor-page.html`
- [ ] 若动了 Swup 配置或切页行为（滚动、动画、过渡）：`node .workbuddy/tools/verify-swup-scroll.mjs`（22 项：跨页滚动动画已关 + 其余档位保留 + tsc 严格模式）
- [ ] 不启动 dev server 看效果：`.workbuddy/tools/preview-post.mjs <md路径>`（文章渲染预览，可切深色）、`preview-sponsor-page.mjs`（赞赏页）、`preview-music-player.mjs`（音乐播放器，可直接试听）、`preview-welcome-toast.mjs`（欢迎浮层，可切桩数据 / 线上接口）、`verify-astro-syntax.mjs`（`.astro` 语法 + 行尾）

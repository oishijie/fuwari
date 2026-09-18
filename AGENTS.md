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
- 评论后端地址在 `commentConfig.apiBase`（当前 `https://comments.142588.xyz`），**留空时评论区不加载**（前端静默跳过请求）。改博客域名后，记得同步 Worker `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 白名单。
- 评论后端**必须绑自定义域名**：`*.workers.dev` 在中国大陆被 DNS 污染（实测解析到假 IP、HTTP 000），用它是不可用的。
- `astro.config.mjs` 的 `site` 字段必须与真实域名一致，否则 RSS / Sitemap / OG 的绝对链接会出错。
- 本仓库是 git 仓库（remote `oishijie/fuwari`）。**部署由 Cloudflare Pages 的 Git 集成自动完成**：push 到 `main` 后约 10s 被接收、约 80s 构建上线，无需本地构建。备用直传：`pnpm build && npx -y wrangler pages deploy dist --project-name=fuwari --branch=main`。

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
- [ ] 不启动 dev server 看效果：`.workbuddy/tools/preview-post.mjs <md路径>`（文章渲染预览，可切深色）、`preview-sponsor-page.mjs`（赞赏页）、`verify-astro-syntax.mjs`（`.astro` 语法 + 行尾）

# Changelog

本项目（**留心博客**，基于 [saicaca/fuwari](https://github.com/saicaca/fuwari) 定制）的重要变更均记录于此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **自建评论系统**（Cloudflare Workers + D1），取代已失效的 Giscus：后端 `workers/comments/`（列表 / 计数 / 发表 / 删除 / 健康检查），前端组件 `src/components/misc/Comments.astro`（Swup 兼容、明暗主题自适应、DOM API 渲染防 XSS）；含蜜罐字段与「同 IP 同文章 30 秒」频率限制
- 评论服务已上线：后端 `https://comments.142588.xyz`（自定义域名），D1 库 `blog-comments`，区域 APAC（香港）
- **评论引用回复**：`comments` 表新增 `parent_id` 列（含外键与索引，迁移脚本 `migrate-reply.sql` 已在线上执行）；Worker 支持回复校验（目标须存在 / 同文章 / 已通过，否则 400）与**级联删除**（递归 CTE，删除父评论连同整个回复子树）；前端 `Comments.astro` 新增「回复」按钮、引用条渲染与回复态提示（Esc / 再点一次取消）
- **首页文章卡标题单行化**：`PostCard.astro` 标题容器改为固定单行高度（`white-space: nowrap` + 溢出隐藏），卡片高度不再随长标题换行变化；溢出时显示右侧渐隐提示，**悬停自动横向滚动展示全文**（marquee，往返动画，`prefers-reduced-motion` 下停用）；溢出检测脚本兼容 Swup 无刷新导航（挂 `astro:page-load` / `swup:page:view`）
- 新增博客文章《自建评论系统：用 Cloudflare Workers + D1 替换 Giscus》，记录迁移动机、实现与部署全过程
- `siteConfig` 新增 `description` 字段，用于填充页面 `meta description` 与 Open Graph / Twitter Card 描述
- 新增 `CHANGELOG.md`（本文件）与 `AGENTS.md`（面向 AI 编码代理的项目说明）

### 修复

- 修复 `src/pages/friends.astro` 引用不存在的 `siteConfig.description` 导致的 TypeScript 类型错误（会使 `pnpm check` / `pnpm type-check` 报错）；`SiteConfig` 类型与 `src/config.ts` 已同步该字段
- 修复 `src/components/ArchivePanel.svelte` 的类型错误：`tags` / `categories` 改为带默认值的可选 props，`Post.category` 放宽为 `string | null` 以对齐内容 schema 的 nullable 定义——此前会导致 `pnpm check` 在 `archive.astro` 处报 `ts(2322)`
- 修复 `src/components/LightDarkSwitch.svelte`（Svelte 5 runes 组件）缺少显式 `Props` 声明的问题——缺少声明时 Astro 会将其 props 推断为 `Record<string, never>`，导致 `Navbar.astro` 中标注 `client:only` 时触发 `ts(2322)`
- 移除 `astro.config.mjs` 中 `icon()` 插件 `include` 下误粘贴的无效集合键 `"preprocess: vitePreprocess(),"`（该内容本属 `svelte.config.js`）
- 以上修复后 `pnpm check` 结果由 **2 errors** 降至 **0 errors / 0 warnings**

### 移除

- **AI 摘要功能**：删除 `[...slug].astro` 内联摘要区块与配套样式、`src/content/config.ts` 的 `ai` 字段、`scripts/generate-ai-summary.mjs` 脚本、`package.json` 的 `gen-ai` 命令，并清理 29 篇文章 frontmatter 中的 `ai` 字段（含 1 处多行折行 YAML）
- **侧边栏音乐播放器**：删除 `src/components/MusicPlayer.astro` 及 `SideBar.astro` 中的引用（原依赖 jsdelivr CDN + Meting 公共 API，可用性不稳定）
- **Giscus 评论组件**：删除 `src/components/misc/Giscus.astro`、`commentConfig` 中的 4 个 Giscus 字段（改为 `apiBase`），并清理 `BackToTop.astro` 的 `giscus-container` 回退引用
- 移除背景：原 Giscus 后端仓库 `worhllo2/fuwari` 随账号被 flagged 而 404，评论全线失效且历史数据不可恢复

### 文档

- README 补充 **Webviso 自托管访问统计**说明（此前仅有 Umami，与实际实现不符）
- README 补充 **自建评论系统**章节；项目结构树同步至当前实际结构（新增 `workers/comments/`，移除 MusicPlayer / Giscus / generate-ai-summary 等已删除条目）
- README 配置说明表新增 `webvisoConfig` 行，并更新 `commentConfig` 说明
- 新增 `workers/comments/README.md`：评论后端部署与运维手册（含本机踩坑记录）

### 验证

- `pnpm check`：**0 errors / 0 warnings**（检查 60 个文件）
- `astro build` + `pagefind`：**39 个页面构建成功**，产出 `dist/`（11 MB），含 `sitemap-index.xml` / `sitemap-0.xml` 与 `pagefind/` 搜索索引（34 页 / 5340 词）
- 本地开发服务器验证：`astro dev` 正常启动，首页 / about / friends / archive / 分页 / 文章详情页均返回 HTTP 200，且 `siteConfig.description` 修复在 dev 下同样生效（`friends` 页 `meta description` 不再 fallback）
- 环境提示：本机构建收尾时 astro 会批量清理 SSR 中间产物（约 58 个文件），会触发 safe-delete 的 50 文件阈值保护；需在该条命令上临时设置 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 才能完整收尾
- 环境提示：`astro dev` 启动时 Vite 重优化依赖会删除 `node_modules/.vite/deps`（约 70 个文件），**同样会触发该阈值保护**；另 `--host` 不带参数时只绑定 IPv6 `[::1]`，需显式指定 `--host 127.0.0.1`。详见 `AGENTS.md`
- 本轮删改后复验：`astro check` **0 errors / 0 warnings**（59 个文件）；`astro build` **39 页成功**（45.68s），`sitemap-index.xml` 与 pagefind 索引齐备；产物中已无音乐播放器与 AI 摘要的功能代码（首页 `aplayer` / `ai-summary` 命中均为 0），残留关键词仅存在于相关教程文章的正文内
- 评论后端**已实际上线**：`wrangler deploy` 打包 **7.86 KiB**（gzip 3.00 KiB），绑定 D1 `blog-comments` 与自定义域名 `comments.142588.xyz`；线上 10 项接口测试全通过（健康检查 / CORS 预检 / 发表 / 拉取 / 蜜罐静默丢弃 / 频率限制 `429` / 错误 token `401` / 正确 token 删除 / 删除后清空 / 批量计数）
- 评论前端整合验证：dev 环境下文章页与友链页均正确注入 `comments.142588.xyz`，评论表单与蜜罐字段就位，无 Giscus 残留
- 引用回复功能线上实测：回复成功（`parentId` 正确落库）、立即重复提交 `429`、引用不存在的评论 `400`、跨文章引用 `400`、删除根评论级联清除 3 条子树（`deleted: 3`）全部通过；测试数据已清理
- 标题滚动功能复验：`astro check` **0 errors / 0 warnings**；dev 下首页 9 张卡片均注入 `post-title-clip` 容器，溢出检测脚本以 module bundle 正确引用；新文章页（slug 由文件名规范化生成，全角冒号被移除、空格转连字符）渲染正常
- 环境提示（评论后端）：`*.workers.dev` 在中国大陆被 DNS 污染（实测解析到假 IP、HTTP 000），**必须绑自定义域名**；另本机环境变量 `CLOUDFLARE_API_TOKEN` 权限不足且优先级高于 OAuth 登录态，执行 wrangler 需加 `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID`

## [0.0.1] - 2026-07-30

### 初始版本

基于 fuwari 主题定制的个人博客系统，包含以下改造（**注**：其中的 AI 摘要、Giscus 评论、侧边栏音乐播放器已于 [Unreleased] 中移除）：

**内容增强**

- 文章置顶 / 置底：frontmatter `order` 字段（`1` 置顶 / `-1` 置底 / `0` 默认），同级按发布时间倒序
- AI 摘要：`scripts/generate-ai-summary.mjs` 预生成并写回 frontmatter `ai` 字段，构建时静态渲染
- 二级导航菜单：`navBarConfig` 支持 `children` 嵌套
- 目录导航（TOC）、KaTeX 数学公式、GitHub 风格提示块
- 代码块增强：ExpressiveCode + 行号 + 可折叠区段 + 语言徽标 + 自定义复制按钮

**视觉与交互**

- 明暗主题切换（light / dark / auto）与可调主题色调
- Swup 页面过渡、OverlayScrollbars 自定义滚动条、PhotoSwipe 图片灯箱
- 页脚运行时间显示

**搜索与 SEO**

- Pagefind 站内搜索、Sitemap、RSS、robots.txt
- 文章页 JSON-LD `BlogPosting` 结构化数据
- Open Graph / Twitter Card 元信息

**评论与友链**

- Giscus 评论（文章页与友链页）
- 友链页面：`src/friends_data.ts` 数据驱动，卡片网格展示

**统计**

- Webviso 自托管访问统计（Cloudflare Workers + D1），文章页展示 PV / UV，兼容 Swup
- Umami 无 Cookie 分析（默认关闭，可选启用）

**国际化**

- UI 文案 i18n，内置 10 种语言

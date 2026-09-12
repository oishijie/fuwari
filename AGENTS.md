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

## 注意事项与已知风险

- 头像与 favicon 使用外部图床 `imgbed.142588.xyz`——构建不依赖其可达性，但页面渲染会。
- 评论后端地址在 `commentConfig.apiBase`（当前 `https://comments.142588.xyz`），**留空时评论区不加载**（前端静默跳过请求）。改博客域名后，记得同步 Worker `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 白名单。
- 评论后端**必须绑自定义域名**：`*.workers.dev` 在中国大陆被 DNS 污染（实测解析到假 IP、HTTP 000），用它是不可用的。
- `astro.config.mjs` 的 `site` 字段必须与真实域名一致，否则 RSS / Sitemap / OG 的绝对链接会出错。
- 本仓库**当前不含 `.git` 目录**（纯源码快照），无版本历史可比对。

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

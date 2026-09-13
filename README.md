<div align="center">

# 🌸 Fuwari Enhanced

**基于 [saicaca/fuwari](https://github.com/saicaca/fuwari) 定制的个人博客系统**

[![Astro](https://img.shields.io/badge/Astro-5.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Svelte](https://img.shields.io/badge/Svelte-5.x-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## ✨ 已实现特性

在保留原版 fuwari 设计的基础上，本仓库当前实际包含以下功能：

### 📝 内容增强
- **文章置顶/置底** — frontmatter `order` 字段（`1` 置顶 / `-1` 置底 / `0` 默认），同级按发布时间倒序
- **目录导航 (TOC)** — 长文自动生成右侧目录，支持 1~3 级深度
- **数学公式** — KaTeX 渲染，支持 LaTeX 语法
- **GitHub 风格提示块** — `note` / `tip` / `important` / `caution` / `warning`
- **代码块增强** — ExpressiveCode + 行号 + 可折叠区段 + 语言徽标 + 自定义复制按钮（GitHub Dark 主题）
- **二级导航菜单** — `navBarConfig` 支持 `children` 字段

### 🎨 视觉与交互
- **明暗主题切换** — 支持 light / dark / auto 三种模式，可记忆选择
- **主题色调** — 可调 hue，支持锁定
- **页面过渡** — Swup 驱动的淡入切换
- **自定义滚动条** — OverlayScrollbars
- **图片灯箱** — PhotoSwipe（点击图片放大、滚轮缩放、双击缩放）
- **页脚运行时间** — 显示站点已运行时长

### 🔍 搜索与 SEO
- **站内搜索** — Pagefind（生产环境异步加载）
- **Sitemap** — 自动生成 `sitemap-index.xml`
- **RSS** — 自动生成 `rss.xml`
- **robots.txt** — 自动生成
- **JSON-LD** — 文章页输出 `BlogPosting` 结构化数据
- **Open Graph / Twitter Card** — 基础元信息输出

### 💬 评论与友链
- **自建评论系统** — Cloudflare Workers + D1，文章页与友链页均启用。后端源码见 `workers/comments/`，前端组件 `src/components/misc/Comments.astro`。访客**无需登录任何账号**即可评论；含蜜罐 + 频率限制反垃圾
- **友链页面** — 静态数据驱动（`src/friends_data.ts`），卡片网格展示

### 🔒 隐私与分析
- **Webviso 访问统计** — 自托管方案（Cloudflare Workers + D1），文章页展示浏览量（PV）与访客数（UV），并兼容 Swup 无刷新导航；在 `config.ts` 中配置 `webvisoConfig` 后启用
- **Umami 分析** — 无 Cookie 的隐私友好分析，默认关闭，在 `config.ts` 中配置 `umamiConfig` 后启用

### 🌐 国际化
- **UI 文案 i18n** — 内置 10 种语言（en / zh_CN / zh_TW / ja / ko / es / th / vi / tr / id）

---

## 🚀 快速开始

### 环境要求
- **Node.js** 18+（推荐 22）
- **pnpm** 9+（已通过 `preinstall` 钩子强制）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/oishijie/fuwari.git
cd fuwari

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:4321` 即可预览。

---

## 📂 项目结构

```
src/
├── config.ts          # 站点配置入口（必改）
├── friends_data.ts    # 友链数据
├── content/
│   ├── posts/         # 博客文章（Markdown）
│   └── spec/          # about / friends 等特殊页面
├── components/        # UI 组件
│   ├── Webviso.astro       # 自托管访问统计
│   ├── ConfigCarrier.astro # 主题色等前端配置载体
│   ├── Navbar.astro        # 导航栏（含二级菜单）
│   ├── Footer.astro        # 页脚（含运行时间）
│   ├── control/       # 分页、按钮、回到顶部
│   ├── misc/          # Comments 评论、图片包装、License、Markdown
│   └── widget/        # 侧边栏、TOC、分类、标签、Profile、二级导航面板
├── layouts/           # 页面布局
├── pages/             # 路由页面（含 friends.astro）
├── plugins/           # Rehype/Remark 插件
├── i18n/              # 国际化
├── styles/            # 样式
├── utils/             # 工具函数
└── types/             # 类型定义
scripts/
└── new-post.js        # 创建新文章脚本

workers/
└── comments/          # 自建评论后端（Cloudflare Workers + D1）
    ├── src/index.ts   #   API 实现（列表/计数/发表/删除）
    ├── schema.sql     #   D1 表结构
    ├── wrangler.jsonc #   部署配置（含自定义域名路由）
    └── README.md      #   部署与运维手册
```

---

## ⚙️ 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本（含 Pagefind 索引生成） |
| `pnpm preview` | 预览生产构建 |
| `pnpm new-post "标题"` | 创建新文章 |
| `pnpm check` | Astro 类型检查 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm lint` | 代码检查（Biome，自动修复） |
| `pnpm format` | 代码格式化（Biome） |

---

## 📝 文章 Frontmatter

```yaml
---
title: '文章标题'           # 必填
published: 2026-03-30       # 必填，发布日期
description: '文章摘要'     # 选填，默认空字符串
image: '封面图链接'          # 选填，默认空字符串
tags: ['标签1', '标签2']    # 选填，默认空数组
category: '文章类别'        # 选填，默认空字符串
draft: false                # 选填，默认 false
lang: ''                    # 选填，默认空字符串（留空则使用站点语言）
order: 0                    # 选填，1=置顶 / -1=置底 / 0=默认
updated: 2026-04-01         # 选填，更新日期
---
```

---

## 🔧 配置说明

主要配置位于 `src/config.ts`：

| 配置项 | 说明 |
| :--- | :--- |
| `siteConfig` | 站点标题、副标题、语言、主题色、banner、TOC、favicon |
| `navBarConfig` | 导航栏链接，支持一级与二级菜单 |
| `profileConfig` | 作者头像、昵称、简介、社交链接 |
| `licenseConfig` | 文章页底部版权声明 |
| `expressiveCodeConfig` | 代码块主题（建议选暗色主题） |
| `webvisoConfig` | Webviso 自托管访问统计（Workers + D1，当前启用） |
| `umamiConfig` | Umami 无 Cookie 分析配置（默认关闭） |
| `commentConfig` | 自建评论服务配置（`apiBase` = `https://comments.142588.xyz`，文章页与友链页共用） |

部署前请确保已配置 `astro.config.mjs` 中的 `site` 字段为实际域名。

---

## 💬 评论系统

评论后端**独立部署**在 Cloudflare Workers + D1 上，源码在 `workers/comments/`，
完整部署与运维说明见 **[`workers/comments/README.md`](./workers/comments/README.md)**。

| 项 | 值 |
| :--- | :--- |
| 后端地址 | `https://comments.142588.xyz`（自定义域名，**不要用 `*.workers.dev`**——国内被 DNS 污染） |
| 前端组件 | `src/components/misc/Comments.astro`（Swup 兼容、明暗主题自适应） |
| 接入配置 | `src/config.ts` → `commentConfig.apiBase` |
| 管理口令 | `workers/comments/.admin-token.txt`（已 gitignore） |

改代码后重新上线：

```bash
cd workers/comments
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

> `env -u ...` 是必需的：本机环境变量里的 `CLOUDFLARE_API_TOKEN` 权限不足，
> 会覆盖 `~/.wrangler` 的 OAuth 登录态，导致 `Authentication error [code: 10000]`。

---

## 🌐 部署

站点托管在 **Cloudflare Pages**，域名 [`blog.142588.xyz`](https://blog.142588.xyz)。

| 项 | 值 |
| :--- | :--- |
| Pages 项目 | `fuwari` |
| Git 源 | `oishijie/fuwari`（Cloudflare GitHub App 集成） |
| 生产分支 | `main` |
| 构建命令 | `pnpm build` → `dist` |
| Node 版本 | `NODE_VERSION=22`（已在 Pages 环境变量中设定） |

### 日常发布：push 即部署

```bash
git add -A && git commit -m "..." && git push origin main
```

推送到 `main` 后 Cloudflare Pages 会自动 clone → `pnpm install` → `pnpm build` →
上传 `dist`，整条流水线约 70 秒。任何其他分支的 push 会生成独立的预览部署。

> 仓库内**没有** GitHub Actions 配置 —— 构建完全交给 Cloudflare，这也是刻意的选择。

### 备用方案：本地构建直传

需要绕开 Git 集成（比如临时回滚某次改动）时，本地构建后直接上传产物：

```bash
pnpm build
npx -y wrangler@latest pages deploy dist --project-name=fuwari --branch=main
```

> 注意：直传**不会**解除 Git 集成，项目的 Git 源保持不变。

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

内容遵循 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 协议。

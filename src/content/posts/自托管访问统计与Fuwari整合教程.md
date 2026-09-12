---
title: 完全自托管网站访问统计：从 Cloudflare 部署到整合进 Fuwari 博客
published: 2026-08-09
description: 一步步把极简访问统计工具自托管到 Cloudflare Workers + D1，并整合进 Fuwari（Astro）博客，实现脚本 + 后端 + 数据库全部自己掌控。
image: 'https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?q=80&w=1200&h=800&auto=format&fit=crop'
tags: [教程, 自托管, Cloudflare, Fuwari, 访问统计, Astro, Swup]
category: 博客魔改
---

## 为什么要自托管

想要一个类似「不蒜子」的文章阅读计数（PV / UV），但又不想把访客数据交给第三方？
开源项目 [yestool/analytics_with_cloudflare](https://github.com/yestool/analytics_with_cloudflare) 提供了一个极简方案：技术栈是 `Cloudflare Workers + D1(数据库) + Hono`，只统计两个核心指标——**PV（页面浏览量）** 和 **UV（独立访客，按 IP 去重）**。

但原项目有个隐患：**默认模式数据在作者服务器上，前端计数脚本也挂在作者的 CDN 上**。本文的目标是把「脚本 + 后端 + 数据库」三层**全部自托管**，做到真正 own your data。

效果就是文章顶部那一行「N 次浏览 / N 位访客」，每刷新一次 PV +1，UV 按 IP 去重。
（注意：它是计数器，**不是分析看板**，没有图表/趋势；想要看板请看 Cloudflare Web Analytics、Umami、Plausible。）

---

## 一、准备后端项目

先建一个标准的 Cloudflare Workers 项目（目录就叫 `analytics-deploy/`），关键文件：

- `package.json` / `wrangler.toml` / `tsconfig.json`：标准工程配置
- `schema.sql`：建表语句（`t_web_visitor`，记录域名、路径、来源、IP、时间）
- `src/index.ts`：核心接口
  - `POST /api/visit`：记录一次访问，返回该页最新 PV / UV
  - `GET  /api/stats`：返回整站统计 JSON（方便自己查数据，原项目没有）
- `public/counter.js`：**自己写的前端脚本**，不依赖作者的 `webviso.yestool.org/js/index.min.js`

`src/index.ts` 里记录访问的核心逻辑（节选）：

```ts title="src/index.ts"
// POST /api/visit
app.post("/api/visit", async (c) => {
  const { web, path, ref } = await c.req.json();
  const ip = c.req.header("CF-Connecting-IP") ?? "0.0.0.0";
  // 写入 D1：域名 + 路径 + 来源 + IP + 时间
  await c.env.DB.prepare(
    `INSERT INTO t_web_visitor (domain,url_path,referrer_domain,referrer_path,ip,visit_time)
     VALUES (?,?,?,?,?,datetime('now'))`
  ).bind(web, path, ref?.domain ?? "", ref?.path ?? "", ip).run();
  // 再查该路径的 PV / UV 返回
  const pv = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM t_web_visitor WHERE domain=? AND url_path=?`
  ).bind(web, path).first();
  const uv = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT ip) n FROM t_web_visitor WHERE domain=? AND url_path=?`
  ).bind(web, path).first();
  return c.json({ pv: pv?.n ?? 0, uv: uv?.n ?? 0 });
});
```

---

## 二、部署到 Cloudflare

在你**自己的电脑终端**里执行（需要 Node 和 `wrangler`）：

```bash
cd analytics-deploy
npm install

# 唯一需要你本人用浏览器授权的步骤
npx wrangler login

# 创建 D1 数据库，复制返回的 database_id
npx wrangler d1 create web_analytics

# 把 database_id 填进 wrangler.toml 最后一行
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 建表
npm run initSql

# 部署
npm run deploy
# 记下输出的 https://xxx.workers.dev
```

部署成功后，去 Cloudflare 控制台把自定义域名（本文用的是 `webana.142588.xyz`）绑定到这个 Worker。
**这个域名就是后端的 `baseUrl`**，前端脚本会把访问数据 POST 到这里。

---

## 三、前端脚本自托管（关键）

不要引用作者的 CDN 脚本，改用自己项目里的 `public/counter.js`，并在博客里这样嵌入：

```html title="public/counter.js"
<p>浏览量：<span id="page_pv">…</span> 访客：<span id="page_uv">…</span></p>
<script defer src="/counter.js" data-base-url="https://webana.142588.xyz"></script>
```

这样脚本、后端、数据库三层全在你自己手里，作者那边一个字节都收不到。

---

## 四、整合进 Fuwari 博客（Astro + Svelte + Swup）

Fuwari 用 **Swup** 做无刷新翻页，这是个坑：**普通 `<script defer>` 只在首屏执行一次，之后点文章链接不会重新计数**。
必须把统计挂到 Swup 的 `page:view` 事件上。

### 1. `src/config.ts` 加配置

```ts title="src/config.ts"
export const webvisoConfig = {
  enable: true,
  baseUrl: "https://webana.142588.xyz", // 你的 Worker 后端地址，末尾不要带斜杠
  pvId: "page_pv",
  uvId: "page_uv",
};
```

### 2. 新建 `src/components/Webviso.astro`

组件里的脚本会 `POST /api/visit`，拿回 PV / UV 写进页面；首屏跑一次，再挂 Swup 的 `page:view` 钩子：

```astro
---
import { webvisoConfig } from "@/config";
const { enable, baseUrl, pvId, uvId } = webvisoConfig;
---
{enable && (
  <script is:inline define:vars={{ baseUrl, pvId, uvId }}>
    const track = () => {
      const web = location.host;
      const path = location.pathname;
      const elPv = document.getElementById(pvId);
      const elUv = document.getElementById(uvId);
      if (!elPv && !elUv) return;
      fetch(`${baseUrl}/api/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ web, path }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (elPv) elPv.textContent = d.pv;
          if (elUv) elUv.textContent = d.uv;
        })
        .catch(() => {});
    };
    document.addEventListener("DOMContentLoaded", track);
    // Swup：每次无刷新切页后重新统计
    window.addEventListener("pageswap", track);
  </script>
)}
```

> Fuwari 自身就是靠 Swup 的 `pageswap` / `page:view` 事件做导航钩子的，照抄它的写法最稳。

### 3. `src/layouts/Layout.astro` 引入并渲染

```astro title="Webviso.astro"
import Webviso from "@components/Webviso.astro";
// … 在 </body> 前：
<Webviso />
```

### 4. `src/pages/posts/[...slug].astro` 显示数字

在文章顶部「字数 / 阅读时长」那一行旁边加两项，图标风格和原有一致：

```astro
<div class="flex flex-row items-center">
  <div class="...bg-black/5...mr-2"><Icon name="material-symbols:visibility-outline-rounded"></Icon></div>
  <div class="text-sm"><span id="page_pv">–</span> 次浏览</div>
</div>
<div class="flex flex-row items-center">
  <div class="...bg-black/5...mr-2"><Icon name="material-symbols:person-outline-rounded"></Icon></div>
  <div class="text-sm"><span id="page_uv">–</span> 位访客</div>
</div>
```

⚠️ 图标名一定要用**仓库里已经在用的**（`visibility-outline-rounded`、`person-outline-rounded` 都在其他地方用过），否则 `astro-icon` 构建会直接报错。

---

## 五、本地装依赖并构建

Fuwari 用 `pnpm`，但它的 `pnpm` 经常不在 PATH 里。项目 `package.json` 锁定了 `pnpm@9.14.4`，用 Node 自带的 `corepack` 拉起即可：

```bash title="package.json"
# 一劳永逸：启用后直接 pnpm
corepack enable
pnpm install
pnpm build      # 验证改动能否编译通过
pnpm dev        # 本地预览，默认 http://localhost:4321
```

如果 `corepack` 也找不到，退一步 `npm install -g pnpm` 全局装一个。
（本项目也可以用绝对路径绕过 PATH：`"C:/Users/你的用户/.workbuddy/binaries/node/versions/22.22.2/corepack" pnpm@9.14.4 <命令>`。）

---

## 六、上传到 GitHub

博客目录已经是 git 仓库，远程 `origin` 通常也已配好：

```bash
git add -A
git commit -m "feat: 整合自托管访问统计并新增部署教程"
git push -u origin main
```

> 如果你的运行环境连不上 GitHub（例如某些沙箱），`push` 会失败——这时换到你**本机直连终端**执行上面这行 `git push` 即可。

---

## 七、验证与排错

打开任意一篇文章，标题上方应先显示「– 次浏览 / – 位访客」占位符，一两秒后变成真实数字；刷新一次 PV +1。

如果数字一直是 `–`：

1. **baseUrl 填错**：确认 `src/config.ts` 里的 `baseUrl` 是 Worker 的地址（`https://webana.142588.xyz`），末尾别带 `/`。
2. **Worker 没部署好**：浏览器开 `https://webana.142588.xyz/api/visit` 看是否 404 / 报错。
3. 打开浏览器控制台（F12 → Network / Console）看是否有红色报错，把报错贴出来即可定位。

---

## 隐私提醒

该工具按访客 **IP** 去重 UV，并且 D1 里存的是**原始 IP**。如果你的博客面向欧盟用户，这有 GDPR 合规风险——它是个玩具级方案，不是合规级。需要合规可以自己把 UV 去重逻辑改成基于 cookie / 浏览器指纹。

---

## 小结

| 层 | 是否自托管 |
|----|------------|
| 数据库（D1） | ✅ 你的 Cloudflare 账号 |
| 后端（Worker） | ✅ 你的 Cloudflare 账号 |
| 前端脚本（counter.js） | ✅ 你自己的服务器 / 博客静态目录 |

至此，从 Cloudflare 后端到 Fuwari 前端，访问统计完全握在自己手里。
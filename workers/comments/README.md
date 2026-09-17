# 博客评论后端（Cloudflare Workers + D1）

博客的自建评论系统。取代原 Giscus 方案——原方案依赖 GitHub 账号
`worhllo2`，该账号被 flagged 后仓库 `worhllo2/fuwari` 404，评论全线失效。

数据存在自己 Cloudflare 账号的 D1 里，不依赖任何第三方评论服务，
**访客无需登录任何账号即可评论**（这是它相对 Giscus 最大的优势）。

---

## 当前部署状态（2026-09-12 上线）

| 项 | 值 |
| :--- | :--- |
| 后端地址 | **https://comments.142588.xyz** |
| Worker 名称 | `blog-comments` |
| D1 数据库 | `blog-comments` · `aa845df3-a7a7-4377-b434-d267c5e7e6b3` |
| 区域 | APAC（香港节点） |
| 自定义域名 | `comments.142588.xyz`（zone `142588.xyz`，CF 代理） |
| 前端接入点 | `src/config.ts` → `commentConfig.apiBase` |
| 管理口令 | 本地 `workers/comments/.admin-token.txt`（已 gitignore），同时作为 Worker secret `ADMIN_TOKEN` |

> ⚠️ **为什么必须绑自定义域名**：`*.workers.dev` 在中国大陆被 DNS 污染
> （实测解析到 `38.121.72.166` / `face:b00c::` 等假地址，HTTP 000 直连不通）。
> 同一账号下的 `142588.xyz` 走 CF anycast，国内可达。**不要图省事用 workers.dev。**

---

## 从零重建（换账号 / 换域名时）

全部命令在 `workers/comments/` 目录下执行。

### 1. 建 D1 数据库

```bash
npx wrangler d1 create blog-comments
```

把回显的 `database_id` 填进 `wrangler.jsonc` 的 `d1_databases[0].database_id`。

### 2. 建表

```bash
npm run db:init          # 远程库（生产）
npm run db:init:local    # 本地调试库（可选）
```

### 3. 设管理口令

用于删除评论，不设则删除接口返回 503：

```bash
npx wrangler secret put ADMIN_TOKEN     # 交互式粘贴，或见下方「无回显上传」
```

无回显上传（推荐，避免 token 进命令历史）：

```bash
openssl rand -hex 24 > .admin-token.txt
npx wrangler secret put ADMIN_TOKEN < .admin-token.txt
```

### 4. 绑自定义域名 + 部署

`wrangler.jsonc` 里已配好 `routes`（`custom_domain: true` 会自动建 DNS 记录与证书）：

```jsonc
"routes": [{ "pattern": "comments.142588.xyz", "custom_domain": true }]
```

```bash
npm run deploy
```

### 5. 接到博客上

```ts
// src/config.ts
export const commentConfig: CommentConfig = {
	enable: true,
	apiBase: "https://comments.142588.xyz", // 末尾不要带斜杠
};
```

---

## API

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/api/comments?slug=/posts/xxx/` | 拉取某篇文章的已通过评论 |
| GET | `/api/comments/count?slugs=a,b,c` | 批量统计评论数（最多 50 个） |
| POST | `/api/comments` | 发表评论 |
| DELETE | `/api/comments/:id` | 删除评论（需 `Authorization: Bearer <ADMIN_TOKEN>`） |
| GET | `/health` | 健康检查 |
| POST | `/api/summary` | 生成 / 读取文章 AI 摘要（Workers AI + D1 缓存） |

发表评论的请求体：

```json
{
  "slug": "/posts/xxx/",
  "author": "昵称",
  "email": "可选，不对外输出",
  "website": "可选，需 http(s):// 开头",
  "content": "正文，纯文本",
  "trap": "蜜罐字段，正常请求留空",
  "parentId": 3
}
```

### 引用回复（2026-09-12 新增）

- `parentId` 可选：填目标评论的 id 即为引用回复。
- 校验规则：目标评论必须**存在**、**属于同一篇文章**（跨文章引用返回 400）、且为 `approved` 状态。
- 存储为扁平的 `parent_id` 列（非嵌套树），前端按「回复了 @某某」渲染引用条。
- **级联删除**：删除任一评论会连同其整个回复子树一起删除（递归 CTE 实现），不会留下孤儿评论。
- 迁移脚本 `migrate-reply.sql` 已在 2026-09-12 执行，从零重建时 `schema.sql` 已包含该列，无需再跑迁移。

### AI 摘要（2026-09-17 新增）

- 请求体 `{ "content": "正文纯文本（≤8000 字）", "slug": "/posts/xxx/" }`，响应 `{ "summary": "...", "cached": true|false }`。
- 缓存键是**规范化正文的 SHA-256**（抹零宽字符、折叠空白），正文不变就不会重复消耗模型额度。
- 生成限额：同一 IP 每天 30 次（命中缓存不计数），记在 `ai_summary_quota` 表。
- 模型由 `wrangler.jsonc` 的 `AI_MODEL` 指定，走 Workers AI binding `AI`；需在 Cloudflare 后台为账号开通 Workers AI（免费 10000 neurons/天，无需信用卡）。
- 建表命令：`npx wrangler d1 execute blog-comments --remote --file=./migrate-ai-summary.sql`
- 首次调用若返回「服务端未启用 Workers AI」，说明 `ai` binding 没生效 —— 检查账号是否已开通并重新部署。

---

## 反垃圾

- **蜜罐字段**（`trap`）：前端渲染为屏幕外不可见元素，被自动脚本填写即静默丢弃，不返回错误（不给爬虫反馈）。
- **频率限制**：同一 IP 对同一篇文章 30 秒内只能提交一次。IP 经 SHA-256 加盐哈希后存储，不可逆。
- **长度限制**：昵称 40 / 邮箱 120 / 网址 200 / 正文 2000 字符。
- **人工审核**（可选）：把 `wrangler.jsonc` 的 `REQUIRE_APPROVAL` 设为 `"true"`，新评论进 `pending` 状态，需手工放行。
- **XSS**：正文按纯文本存储，前端用 `textContent` 渲染，不解析 HTML。

---

## 日常运维

```bash
npm run tail                                     # 实时看日志
npm run deploy                                   # 改完代码重新部署
```

删除某条评论（管理口令存在 `.admin-token.txt`）：

```bash
curl -X DELETE "https://comments.142588.xyz/api/comments/<id>" \
  -H "Authorization: Bearer $(cat .admin-token.txt)"
```

查库：

```bash
npx wrangler d1 execute blog-comments --remote \
  --command "SELECT id,post_slug,author,content,created_at FROM comments ORDER BY id DESC LIMIT 20"

npx wrangler d1 execute blog-comments --remote \
  --command "UPDATE comments SET status='approved' WHERE id=123"

npx wrangler d1 execute blog-comments --remote \
  --command "DELETE FROM comments WHERE status='spam'"
```

备份：`npx wrangler d1 export blog-comments --remote --output=backup.sql`

清空全部评论（谨慎）：`npm run db:init` 不会删数据，需显式执行
`npx wrangler d1 execute blog-comments --remote --command "DELETE FROM comments"`。

---

## 本机踩坑记录（2026-09-12 部署实录）

### 1. `CLOUDFLARE_API_TOKEN` 环境变量覆盖 OAuth 登录态

本机环境变量里存在一个 53 字符的 `CLOUDFLARE_API_TOKEN`，**权限不足以操作 D1**，
但它的优先级高于 `~/.wrangler/config/default.toml` 里的 OAuth 凭据，导致：

```
X [ERROR] A request to the Cloudflare API (/accounts/.../d1/database) failed.
  Authentication error [code: 10000]
```

`wrangler whoami` 显示的是 token 对应的身份（邮箱 `worhllo142587@outlook.com`），
看起来一切正常，极具迷惑性。

**解法**：执行 wrangler 命令时临时屏蔽这两个环境变量，改用 OAuth 凭据：

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler <命令>
```

### 2. `workers.dev` 域名国内不可用

实测 `https://blog-comments.3292722614.workers.dev/health` → HTTP 000，
DNS 解析得到 `38.121.72.166`、`2a03:2880:f102:183:face:b00c:0:25de`——均为污染应答。
**必须绑自定义域名。**

### 3. pnpm / Windows 相关

Worker 目录独立于博客主项目，用 `npx wrangler` 即可，不涉及 pnpm。
`npx` 首次执行建议加 `-y` 避免交互确认卡住非交互环境。

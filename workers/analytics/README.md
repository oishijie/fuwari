# blog-analytics

留心博客的自托管访问统计后端：**Cloudflare Workers + D1**，零第三方依赖。

## 为什么会有这个 Worker

博客的访问统计最早跑在同一个域名（`webana.142588.xyz`）上的另一个 Worker 里。
2026-09-17 之后那个 Worker 下线，域名变成 Cloudflare **1016 origin_dns_error**（源站不存在），
前端埋点一直在静默失败——**数据一条没丢，只是不再增长**。

本 Worker 是它的重建版：**沿用同一个 D1 库**（`web_analytics`，约 1788 条历史记录），
请求 / 响应格式与原来完全一致，所以前端的埋点配置一行都不用改。

## 端点

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/api/visit` | 记一次访问，返回**该路径**最新 PV / UV |
| `GET` | `/api/stats` | **整站**汇总，侧边栏卡片用 |
| `GET` | `/` | 健康检查 |

### POST /api/visit

```json
// 请求
{ "hostname": "blog.142588.xyz", "url": "/posts/hello/", "referrer": "https://example.com/" }

// 响应
{ "ret": "OK", "data": { "pv": 42, "uv": 31 } }
```

### GET /api/stats

`hostname` 可省略，会依次从 `Referer`、请求自身推断。

```json
{
  "ret": "OK",
  "data": {
    "pageviews": 384,      // 总浏览量：COUNT(*)
    "visits": 253,         // 访问数：会话数，按 30 分钟窗口现算
    "visitors": 49,        // 游客数：COUNT(DISTINCT visitor_ip)
    "pages": 67,           // 收录页面数
    "todayPageviews": 12,  // 今日 PV（按东八区切分）
    "todayVisitors": 5,
    "since": "2026-07-18 14:58:53",
    "last": "2026-09-17 08:35:53"
  }
}
```

## 三个口径

- **总浏览量 pageviews** —— `COUNT(*)`，每次页面浏览 +1（刷新也算）。
- **游客数 visitors** —— `COUNT(DISTINCT visitor_ip)`，同一 IP 只算一次，不限时间。
- **访问数 visits** —— 表里没有会话字段，用窗口函数现算：同一 IP 相邻两次访问间隔
  超过 `SESSION_GAP_MINUTES`（默认 30 分钟）计一次新会话。与 Umami 的 `visits` 同义。

## 部署

```bash
cd workers/analytics
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

⚠️ 必须清掉 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 这两个环境变量再跑，
否则会报认证错误 10000（本机环境里它们存在但无效）。

`routes` 里的 `custom_domain: true` 会让 wrangler 自动创建 `webana.142588.xyz`
的 DNS 记录与证书——该记录此前指向已删除的源站，部署即修复。

## 配置（wrangler.jsonc 的 vars）

| 变量 | 用途 |
| :--- | :--- |
| `ALLOWED_ORIGINS` | CORS 白名单，逗号分隔。换域名时记得同步 |
| `SITE_HOSTS` | 允许**自动登记**的域名；库里已有记录的域名不受此限制 |
| `SESSION_GAP_MINUTES` | 会话切分窗口，默认 30 |

## 验证

```bash
node .workbuddy/tools/verify-analytics.mjs     # 本地打桩，不起服务不部署
node .workbuddy/tools/check-analytics-sql.mjs  # 拿真实 SQL 打线上库，只读
```

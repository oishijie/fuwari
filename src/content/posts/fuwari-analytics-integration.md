---
title: '完全自托管网站访问统计：从 Cloudflare 部署到整合进 Fuwari 博客'
published: 2026-08-09
updated: 2026-09-19
description: '从照着开源项目搭一个 PV/UV 计数器，到把它换成零依赖的自研 Workers + D1 后端，再给侧边栏加一张三格统计卡。中间还经历了一次真实事故：后端域名悄悄下线两天、埋点全程静默失败——而数据其实一条没丢。含表结构、三个统计口径、Swup 接入与三个只有踩过才知道的坑。'
image: 'https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - 自托管
  - Cloudflare Workers
  - 访问统计
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 0
---

## 为什么要自托管

需求本身很简单：文章顶部想显示一行「N 次浏览 / N 位访客」，但又不想把访客数据交给第三方——不蒜子这类服务的脚本、后端、数据库，三样都不在自己手里。

开源项目 [yestool/analytics_with_cloudflare](https://github.com/yestool/analytics_with_cloudflare) 给了一个极简起点：`Cloudflare Workers + D1 + Hono`，只统计两个数——**PV（页面浏览量）** 和 **UV（独立访客，按 IP 去重）**。它的隐患也很直白：默认模式下数据在作者服务器上，前端计数脚本挂在作者的 CDN 上。

本站按这个思路做过一版（2026-08，就是这篇文章最早的样子）。到 09 月整体重写了一遍，原因有三个：

1. **后端不再是「照抄别人的项目」**，而是从零写的一个**零依赖 Worker**——没有 Hono，没有第三方包，`wrangler deploy` 上去的就是自己那份 `index.ts`；
2. **统计口径从「这一页」扩到了「整站」**，侧边栏多了一张三格统计卡；
3. 中间出了一次真实事故：**后端域名悄悄下线两天，埋点全程静默失败，而数据其实一条没丢**（详见第七节）。

### 先划清边界：这是计数器，不是分析看板

它没有趋势图、没有来源分析、没有实时在线人数，也没有归因漏斗。要这些请用 Cloudflare Web Analytics、Umami、Plausible。

它给的是三个数：

| 指标 | 含义 |
| :--- | :--- |
| **总浏览量** pageviews | 每次页面浏览 +1，刷新也算 |
| **访问数** visits | 会话数：同一个访客间隔超过 30 分钟算新的一次 |
| **游客数** visitors | 按 IP 去重，不限时间 |

前两个好理解，第二个值得多说一句。**PV 和 UV 其实都不回答「来过几次」这个问题**：PV 把一次访问里翻的五页算成五，UV 又把一个人跨月来了十次算成一次。中间那个「次数」才是运营常看的指标，Umami 管它叫 `visits`。本站这张卡也照这个名字来。

![自托管访问统计的整体架构：浏览器侧两个组件分别调用 Worker 的两个端点，数据落在 D1 的两张表里](https://imgbed.058823.xyz/file/1789818677232_arch.webp)

---

## 一、后端：两张表，两个端点

### 表结构

整个库就两张表：`t_website` 一个站点一行，`t_web_visitor` 一次访问一行。

```sql
CREATE TABLE IF NOT EXISTS t_website (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  domain    TEXT NOT NULL,
  create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS t_web_visitor (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id      INTEGER NOT NULL,
  url_path        TEXT NOT NULL,
  referrer_domain TEXT NOT NULL,
  referrer_path   TEXT NOT NULL,
  visitor_ip      TEXT NOT NULL,
  create_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

几张表都刻意留了 `update_at`，虽然这套统计只写不改。`create_at` 按 `CURRENT_TIMESTAMP` 存的是 **UTC**，前端要显示「今日」得自己加 8 小时，这一步很容易忘。

多站点是天然支持的：`t_web_visitor.website_id` 一关联，正式站、测试站、`localhost` 各自算各自的。本站库里现在有四行：

| id | domain |
| :--- | :--- |
| 1 | localhost |
| 2 | blog.142588.xyz（正式站，看数据只看这条） |
| 3 | blog-xxx.pages.dev |
| 4 | 127.0.0.1 |

### 端点一：`POST /api/visit`

埋点打进来的入口，写一行记录，然后把**该路径**的最新 PV / UV 回给前端（文章顶部那行数字就用它）：

```ts title="src/index.ts（节选）"
async function handleVisit(request: Request, env: Env, cors: Headers): Promise<Response> {
  const body = (await request.json()) as VisitPayload;
  const hostname = (body.hostname ?? "").trim().toLowerCase();
  const urlPath = (body.url ?? "/").trim() || "/";

  const websiteId = await resolveWebsiteId(db, hostname, env);
  if (websiteId === null) return json({ ret: "FAIL", msg: "unknown hostname" }, 400, cors);

  const ref = splitReferrer(body.referrer ?? "", hostname);

  await db
    .prepare(
      `INSERT INTO t_web_visitor (website_id, url_path, referrer_domain, referrer_path, visitor_ip)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(websiteId, urlPath, ref.domain, ref.path, visitorIp(request))
    .run();

  // 只回该路径的最新计数
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_ip) AS uv
         FROM t_web_visitor
        WHERE website_id = ? AND url_path = ?`,
    )
    .bind(websiteId, urlPath)
    .first<{ pv: number; uv: number }>();

  return json({ ret: "OK", data: { pv: row?.pv ?? 0, uv: row?.uv ?? 0 } }, 200, cors);
}
```

访客 IP 取的是 `CF-Connecting-IP`——这是 Cloudflare 边缘注入的、最可靠的一个头，客户端伪造不了。取不到就**留空**，而不是写个 `0.0.0.0` 之类的哨兵值：哨兵值会让所有取不到 IP 的访问被 `DISTINCT` 合并成一个「访客」，UV 直接失真。

来源（referrer）则交给 `splitReferrer()` 拆成域名 + 路径，**同站来源一律置空**——站内互相跳转不是「外部来源」，留着只会污染数据。

### 端点二：`GET /api/stats`

侧边栏卡片用的整站汇总，一次查询给全：

```json
{
  "ret": "OK",
  "data": {
    "pageviews": 384,
    "visits": 76,
    "visitors": 49,
    "pages": 67,
    "todayPageviews": 0,
    "todayVisitors": 0,
    "since": "2026-07-18 14:58:53",
    "last": "2026-09-17 08:35:53"
  }
}
```

`hostname` 参数可以省略：会依次从 `?hostname=`、`Referer` 头、请求自身的 host 里推断，怎么都能拿到。

### 访问数怎么算：窗口函数现算

这是整套后端里唯一有点技巧的地方。库里**没有会话字段**，`visits` 必须每次现算：把同一个 IP 的记录按时间排好，相邻两条间隔超过 30 分钟就算一次新会话。

好在 SQLite 支持窗口函数（3.25+，D1 满足），一条 SQL 就能表达：

```sql
SELECT COUNT(*) AS visits
  FROM (
    SELECT create_at,
           LAG(create_at) OVER (PARTITION BY visitor_ip ORDER BY create_at, id) AS prev
      FROM t_web_visitor
     WHERE website_id = ?
  )
 WHERE prev IS NULL
    OR (julianday(create_at) - julianday(prev)) * 1440 > ?   -- 30 分钟
```

`LAG(...) OVER (PARTITION BY visitor_ip ORDER BY create_at, id)` 取的是**同一访客的上一条记录**；`prev IS NULL` 说明是该访客的第一条，必然是新会话；否则用 `julianday()` 把两个时间转成天、乘 1440 换算成分钟，超过阈值就计数。

`ORDER BY` 里那个 `id` 不是多余的——同一秒内可能有多条记录（`CURRENT_TIMESTAMP` 只精确到秒），只按 `create_at` 排序时相邻关系的顺序是不确定的。

窗口是 30 分钟，也做成了可配的 `SESSION_GAP_MINUTES` 环境变量。

![同一个访客的 5 次浏览：间隔 42 分钟与 60 分钟两处超过 30 分钟阈值，5 次浏览被切成 3 次会话](https://imgbed.058823.xyz/file/1789818682811_metrics.webp)

---

## 二、部署到 Cloudflare

### 一次配好 `wrangler.jsonc`

后端零依赖，所以配置文件比代码还长。最要紧的三块：

```jsonc title="workers/analytics/wrangler.jsonc（节选）"
{
  "name": "blog-analytics",
  "main": "src/index.ts",
  "compatibility_date": "2025-07-03",

  // 自定义域名：custom_domain: true 会让 wrangler 自动建 DNS 记录与证书
  "routes": [{ "pattern": "webana.142588.xyz", "custom_domain": true }],

  "d1_databases": [
    {
      "binding": "ANALYTICS_DB",
      "database_name": "web_analytics",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ],

  "vars": {
    "ALLOWED_ORIGINS": "https://blog.142588.xyz,http://localhost:4321",
    "SITE_HOSTS": "blog.142588.xyz",
    "SESSION_GAP_MINUTES": "30"
  }
}
```

三个细节值得单独说：

- **`custom_domain: true` 不只是路由**。它会让 wrangler 顺带把 `webana.142588.xyz` 的 **DNS 记录和证书一起建好**。这个子域名之前指向一个已删除的源站，一直报 CF `1016 origin_dns_error`，部署这一步就顺手修掉了——不用再手动去控制台加记录。
- **`ALLOWED_ORIGINS` 是 CORS 白名单**，逗号分隔，命中才回显 `Access-Control-Allow-Origin`。换域名时最容易忘的就是这里，症状是浏览器报 CORS 而 Worker 日志里一切正常。
- **`SITE_HOSTS` 是「允许自动登记」的域名白名单**。库里已有的域名不受它约束；但**陌生 hostname 想新建站点，必须命中白名单**。没有这道闸，任何人构造一个请求就能往你的库里灌垃圾站点。

> `workers.dev` 域名在中国大陆被 DNS 污染、直连不通，所以自托管统计**必须走自有域名**——这也是为什么要费劲绑 `webana.142588.xyz` 而不是直接用默认域名。

### 建库与部署

假设数据库已经建好（首次要 `npx wrangler d1 create web_analytics`，把返回的 `database_id` 填进配置，再 `npx wrangler d1 execute web_analytics --remote --file=./schema.sql` 建表），日常部署就一条命令：

```bash
cd workers/analytics
npx wrangler deploy
```

⚠️ 本机环境有个坑：`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 这两个环境变量存在但无效（残留的旧凭据），wrangler 读到就会报认证错误 **10000**。显式清掉再跑就行：

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

部署成功后 `GET https://webana.142588.xyz/` 应该返回一句健康检查，`GET /api/stats` 拿到整站数据，就算通了。

---

## 三、前端埋点：必须挂到 Swup 上

Fuwari 用 **Swup** 做无刷新翻页，这是接入时最主要的坑：**站点只「启动」一次**，之后点文章链接都是 Swup 在替换 DOM，普通 `<script>` 不会重跑。如果只在首屏统计一次，那之后翻十几页，后台一条记录都不会多。

所以埋点必须挂到 Swup 的 `page:view` 钩子上：

```astro title="src/components/Webviso.astro"
---
// 兼容 Fuwari 的 Swup 无刷新导航：首次加载 + 每次 page:view 都统计一次
---

<script>
import { webvisoConfig } from "../config";

async function track() {
  if (!webvisoConfig.enable || !webvisoConfig.baseUrl) return;
  const base = webvisoConfig.baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: location.hostname,
        url: location.pathname,
        referrer: document.referrer,
      }),
    });
    const json = await res.json();
    if (json?.ret === "OK" && json.data) {
      const pvEl = document.getElementById(webvisoConfig.pvId);
      const uvEl = document.getElementById(webvisoConfig.uvId);
      if (pvEl && typeof json.data.pv === "number") pvEl.textContent = String(json.data.pv);
      if (uvEl && typeof json.data.uv === "number") uvEl.textContent = String(json.data.uv);
    }
  } catch (e) {
    /* 统计失败静默处理，不影响页面 */
  }
}

track(); // 首次进入站点

// 兼容 Swup：每次无刷新切页后重新统计
if (window?.swup?.hooks) {
  window.swup.hooks.on("page:view", track);
} else {
  document.addEventListener("swup:enable", () => {
    window.swup.hooks.on("page:view", track);
  });
}
</script>
```

这里有两个容易写错的地方：

1. **事件名是 `page:view`，不是 `pageswap`**。`pageswap` 属于浏览器的 View Transitions API，跟 Swup 是两回事；`pageswap`/`pagereveal` 在某些浏览器确实会触发，看起来「好像能用」，但 Swup 的导航走的是自己的钩子，**不接 `page:view` 就是会漏掉一部分切页**。（这篇文章最早那版写的就是 `window.addEventListener("pageswap", track)`，是个实打实的错误。）
2. **`window.swup` 可能还不存在**。脚本执行时机早于 Swup 初始化时，得退一步监听 `swup:enable` 事件，等它起来再注册钩子——上面 `if / else` 就是在处理这个先后顺序。

组件挂在 `Layout.astro` 的 `</body>` 前，全站生效。文章顶部那行数字则放在文章页元信息栏里，id 与配置对应：

```astro title="src/pages/posts/[...slug].astro（节选）"
<div class="flex flex-row items-center">
  <div class="...mr-2"><Icon name="material-symbols:visibility-outline-rounded"></Icon></div>
  <div class="text-sm"><span id="webviso-pv">–</span> 次浏览</div>
</div>
<div class="flex flex-row items-center">
  <div class="...mr-2"><Icon name="material-symbols:person-outline-rounded"></Icon></div>
  <div class="text-sm"><span id="webviso-uv">–</span> 位访客</div>
</div>
```

⚠️ 图标名要用**仓库里已经在用的**（`visibility-outline-rounded`、`person-outline-rounded` 都在别处用过），否则 `astro-icon` 构建会直接报错。

---

## 四、侧边栏统计卡片

文章顶部那行只讲「这一页」，侧边栏这张卡讲「整站」——数据来自同一个 Worker 的另一个端点，配置也是独立的一份：

```ts title="src/config.ts"
export const siteStatsConfig: SiteStatsConfig = {
  enable: true,
  apiBase: "https://webana.142588.xyz", // 和 webvisoConfig.baseUrl 必须指向同一个 Worker
  title: "统计",
  detailUrl: "",        // 留空 = 卡片不可点；填了会新窗口打开
  cacheMinutes: 10,     // 同一访客 10 分钟内只打一次接口
  fallbackStats: null,  // 接口挂了保持「-」占位，不编数字
};
```

卡片是三格版式：上面一个大号「总浏览量」，下面两格并排「访问数 / 游客数」。数字用 `tabular-nums` 等宽字形（滚动时不会左右抖），从 0 滚到目标值，`easeOutCubic` 缓动两秒；超过一千缩写成 `1.2K`、超过百万是 `1.2M`。

几处刻意的设计：

| 做法 | 为什么 |
| :--- | :--- |
| `IntersectionObserver` 懒加载 | 侧边栏折叠或小屏时，卡片根本不在视口里，没必要白打一次接口 |
| 10 分钟 `localStorage` 缓存 | 统计是低频数据，同一访客来回翻页不必每次都问 |
| 失败保持「-」占位 | 见下面第六节 |
| 监听 Swup `page:view` 重建 | 切页会把侧边栏整块换掉，得重新找元素、重新观察 |

卡片挂在侧边栏 sticky 容器的第一位：

```astro title="src/components/widget/SideBar.astro（节选）"
<SiteStats class="onload-animation" style="animation-delay: 100ms"></SiteStats>
```

---

## 五、三个只有踩过才知道的坑

### 坑一：脚本的「启动块」必须放在最后

这是整套前端里最阴的一个。`SiteStats.astro` 的脚本结构大致是：

```ts
function boot() { /* 用到 started / observer */ }
let started = false;
let observer: IntersectionObserver | null = null;

if (BASE && CFG.enable) {   // ← 启动块
  boot();
  window.swup?.hooks?.on("page:view", boot);
}
```

如果把启动块写在**顶层、但排在 `let started / observer` 声明之前**，`boot()` 里访问 `started` 就会踩 **TDZ（暂时性死区）**：

```
Uncaught ReferenceError: Cannot access 'started' before initialization
```

整段脚本当场挂掉，卡片永远停在「-」。**而 Astro 编译不报错、`astro check` 不报错、语法检查也过**——因为语法本身完全合法，只是执行顺序不对。定位它靠的是把脚本真跑一遍，不是读代码。

结论很简单：**启动块一律放脚本最后**。这不是风格问题，是正确性问题。

### 坑二：不要编假数字

很多统计卡片会在接口失败时显示一组写死的数字「撑场面」。本站最初也这么干，后来改掉了：`fallbackStats` 默认 `null`，接口挂了就保持「-」。

理由是那行数字的意义就是「真实」。显示一组假的，比显示「-」更糟——访客以为自己看到了数据，站主也失去了「后端挂了」这个无声的信号。（顺带一提，如果确实想要原站那种行为，显式配 `fallbackStats: { pageviews: 1000, … }` 就行。）

### 坑三：`SITE_HOSTS` 白名单不能省

前面提过一次，但值得再强调：埋点接口是**公开的**，谁都能 POST。如果不做任何限制，别人只要构造一个 `hostname: "abc.com"` 的请求，你的库里就会多出一个站点、并开始累计垃圾数据。

本站在 `resolveWebsiteId()` 里分成两步：库里已有记录的域名照常放行（`localhost`、`pages.dev` 这些历史域名不能被拦），**新域名则必须命中 `SITE_HOSTS` 白名单**才会被登记，否则直接 400 拒绝。

---

## 六、一次真实事故：后端域名挂了，数据还在

上面讲的都是「怎么做」。这一节讲一次实际翻车——它比任何文档都更能说明这套架构的边界在哪。

![事故时间线：7 月 18 日上线、9 月 17 日 Worker 被删除、9 月 19 日重建，全程数据一条没丢](https://imgbed.058823.xyz/file/1789818683053_timeline.webp)

### 症状：页面正常，后台不动

某天发现侧边栏的统计数字一直在涨，但**文章的 PV / UV 数字卡住了**。页面本身没有任何异常：没有报错弹窗、没有加载失败、控制台也没有红色。

原因藏在埋点的 `catch` 里——统计失败是**静默处理**的（这是对的，统计不该影响页面），所以后端挂了，前端一声不吭。

### 定位：CF 1016 与一条 NXDOMAIN

把 `webana.142588.xyz` 拿到浏览器里直接访问，得到的是 Cloudflare 的 **`1016 origin_dns_error`**（HTTP 530）：**源站不存在**。

也就是说，这个域名指向的那个 Worker 已经**被整个删掉了**，而不是代码报错或数据库故障。埋点从那天起就一直在失败，只是没人知道——因为它是静默的。

### 转折：数据一条没丢

真正让人松一口气的是下一步：**D1 库还在**。

统计数据和 Worker 是两码事。Worker 被删了，数据仍然躺在账号的 D1 里：

| 项 | 值 |
| :--- | :--- |
| 库名 | `web_analytics` |
| 表 | `t_website` / `t_web_visitor` |
| 历史记录 | **1788 行** |
| 独立访客 IP | 69 |
| 最早记录 | 2026-07-18 |
| 最后记录 | 2026-09-17（域名挂掉那天） |

两个月的数据、一条记录都没丢。所以这次不是「从零重建」，而是**把后端原地接回来**。

### 恢复：沿用同一个库，前端一行不改

重建时只需要守住一条原则：**请求 / 响应格式与原来完全一致**。

- `database_id` 指向原来的 `web_analytics`，**不建新库、不导数据**；
- `POST /api/visit` 的入参（`hostname` / `url` / `referrer`）和返回（`{ ret, data: { pv, uv } }`）照旧；
- `routes` 用 `custom_domain: true` 把 `webana.142588.xyz` 重新绑回来，DNS 记录和证书自动重建，顺手把 `1016` 修掉。

结果就是前端配置**一个字都不用改**——`webvisoConfig.baseUrl` 还是那个地址，只是它背后的 Worker 换了个实现。

部署上线后实测：

| 指标 | 值 |
| :--- | :--- |
| 总浏览量 | 384 |
| 访问数（会话） | 76 |
| 游客数 | 49 |
| 收录页面数 | 67 |

历史数据无缝接上，文章顶部那行「N 次浏览 / N 位访客」也跟着一起复活了。

### 这次事故留下的三条经验

1. **「前端正常」不等于「后端正常」**。静默失败的埋点是最危险的一类——它不会报错，只会安静地不干活。定期 `GET /api/stats` 看一眼 `last` 字段（最后一条记录的时间）就能发现异常。
2. **数据和计算要分开存**。这次能全身而退，唯一的原因是数据在 D1 里、而 D1 没被删。如果统计是「Worker 内存里计数、定期落盘」那种设计，Worker 一删就全没了。
3. **接口格式是前后端的契约**。正是因为重建时严格保持了响应格式，前端才做到了零改动——这条约束在平时看着多余，出事时就是救命的那根绳。

---

## 七、数字一直是「-」？按这个顺序查

| 现象 | 排查 |
| :--- | :--- |
| 卡片一直是「-」 | 浏览器直接开 `https://你的域名/api/stats`，看是否 200、`ret` 是否为 `OK` |
| 接口 404 | Worker 没部署，或 `routes` 里域名写错 |
| 接口 400 `unknown hostname` | 当前域名不在 `SITE_HOSTS` 白名单里，加进去重部署 |
| 浏览器报 CORS | `ALLOWED_ORIGINS` 里没加当前站点域；注意要带 `https://` 前缀 |
| 文章顶部数字不涨 | 埋点没挂到 Swup 的 `page:view` 上（第三节的坑） |
| 翻页后数字不变 | 同上；另外确认 `window.swup` 存在，必要时走 `swup:enable` 兜底 |
| 数字停在某个值不动了 | 后端可能又挂了——直接访问 `/api/stats` 看 `last` 字段是什么时候 |
| 部署报错 10000 | 环境变量里有无效凭据，用 `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID` 清掉再跑 |

---

## 隐私提醒

这套统计按访客 **IP** 去重 UV，并且 D1 里存的是**原始 IP**。如果博客面向欧盟用户，这有 GDPR 合规风险——**它是玩具级方案，不是合规级方案**。

真要合规，可以把去重键从 IP 换成服务端签发的匿名 cookie，或者存 IP 的加盐哈希。本站目前的做法是：IP 只用于去重，不做任何关联分析，也不对外暴露。

---

## 小结

| 层 | 是否自托管 |
| :--- | :--- |
| 数据库（D1） | ✅ 自己的 Cloudflare 账号 |
| 后端（Worker） | ✅ 自己的 Cloudflare 账号，零第三方依赖 |
| 前端（埋点 + 卡片） | ✅ 自己的博客静态目录 |

从 Cloudflare 后端到 Fuwari 前端，访问统计完全握在自己手里。整套东西加起来是两张表、两个端点、一个配置对象和一张卡片——但它顺带回答了一个更值得记住的问题：**当「统计」这种后台服务悄悄挂掉时，你怎么知道，以及你会损失什么。**

---

## 参考与致谢

- **起点项目**：[yestool/analytics_with_cloudflare](https://github.com/yestool/analytics_with_cloudflare)（Workers + D1 + Hono 的极简 PV/UV 方案。本文 2026-08 的首版据此搭建，现已重写为零依赖自研实现）
- **卡片版式参考**：[seasir.top《Umami 访问统计卡片》](https://seasir.top/posts/UmamiStats/)（三格布局与数字滚动动画的灵感来源；本站只借版式，数据源是自己的后端）
- **`visits` 口径**：与 [Umami](https://umami.is/) 的 `visits` 同义（按 30 分钟窗口切分会话）

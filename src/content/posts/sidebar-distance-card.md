---
title: '侧边栏「距离」卡片：用 Cloudflare 边缘数据免费定位访客'
published: 2026-08-24
description: '逛博客看到别人侧边栏有个「距离」卡片，能显示访客离博主多远。拆解后发现原站用的是付费 IP 接口，而免费的公共 API 一个接一个挂掉。于是换了个思路：在自家评论 Worker 上加个端点，直接读 Cloudflare 边缘自带的地理数据。后来又发现边缘数据在中国常常只到市级、还会把整段 IP 判错，于是再给服务端补了一层国内 IP 库，精度补到区级。'
image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Cloudflare', 'Workers', 'JavaScript']
category: 博客魔改
draft: false
lang: ''
order: 0
---

逛博客的时候看到一个有意思的小组件：侧边栏一张「距离」卡片，写着「欢迎来自 XX省XX市的小伙伴」「您现在距离我大约 X 公里」。访客和博主之间的物理距离被换算成一个具体的数字，一下子让"这个博客背后有个真实的人"变得具象了。

这篇写了三遍。先是照着它做了张侧边栏卡片，跑通之后发现**位置经常是错的**；折腾数据源的过程中又顺手把形态也换了——现在它是左下角一个欢迎浮层，不是卡片了。整个过程按顺序记一下，踩的坑比预想的多。

## 拆解原站的实现

直接 curl 它的页面，卡片逻辑一目了然：

- 一个 IP 定位 API，返回访客的省市和经纬度；
- Haversine 公式算访客坐标到博主坐标的球面距离；
- `localStorage` 缓存 1 小时，避免每次翻页都请求；
- IP 默认高斯模糊，悬停才显示——防旁人偷瞄，细节好评。

但它的数据源是 apihz.cn 的付费接口，URL 里带着站长自己注册的 `id` 和 `key`。这种凭证直接抄过来等于白嫖人家的额度，pass。

## 免费公共 API？试了一圈全灭

| 服务 | 结果 |
| :--- | :--- |
| 百度千帆 qifu-api | 接口已 404 下线 |
| api.vore.top | 后端 Redis 挂了，直接吐 PHP 报错 |
| api.ip.sb | 403，且境外服务国内可达性没保障 |
| ip.useragentinfo | 连不上 |
| apihz.cn | 要注册 key，付费 |

免费的东西果然最贵。但转念一想——我的博客已经有一个跑在 Cloudflare Workers 上的评论后端了（见上一篇），而 **Cloudflare 边缘本来就知道每个请求来自哪里**。

顺带说一句：这张表后来被我自己推翻了一格。`v2.xxapi.cn` 是能用的——免费、不用注册、支持 `?ip=` 查任意 IP，还能给到**区级**地址和经纬度。这轮"全灭"的结论下得太早了，后面它是主力。

## 换个思路：读边缘自带的地理数据

Cloudflare 会往每个进到 Worker 的请求上挂一个 `request.cf` 对象，里面就有访客的省市、经纬度、国家代码——免费计划就有，精度到城市级。评论 Worker 已经配好了自定义域名和 CORS，加一个端点就完事：

```ts title="workers/comments/src/index.ts"
/** 访客地理信息：直接读 Cloudflare 边缘注入的 request.cf，仅返回给访客本人 */
function geoLookup(request: Request, cors: Headers): Response {
	const cf = (request.cf ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === "string" ? v : "");
	const payload = {
		ip: request.headers.get("CF-Connecting-IP") ?? "",
		country: str(cf.country),
		province: str(cf.region),
		city: str(cf.city),
		lat: Number.parseFloat(str(cf.latitude)),
		lon: Number.parseFloat(str(cf.longitude)),
	};
	return json(payload, 200, cors);
}
```

这是第一版，只有一层数据源。上线自测的时候它返回了这么一份：

```json title="GET https://comments.example.com/geo"
{
  "ip": "210.34.94.91",
  "country": "CN",
  "province": "Guangdong",
  "city": "Guangzhou",
  "lat": 23.11667,
  "lon": 113.25
}
```

先别急着往下看，记住这份数据——它是错的，而且错得很有代表性。

有个 privacy 上的巧合：这个端点只把访客**自己的**位置返回给访客本人，不涉及任何第三方数据，天然合规。

## 边缘数据在中国不太够用

问题有两层。

第一层是**精度**。CF 返回的是英文省名（`Guangdong`、`Fuzhou`），中文站直接显示很出戏，得内置映射表——这是小事，能忍。

第二层是**判错**，而且是大范围判错。上面那份响应的 `province` 是 `Guangdong`、`city` 是 `Guangzhou`，但我人就在福州。差 694 公里，跨了一个省。

查了一圈才明白：本机出口是个教育网 IP，Cloudflare 把这一整段划到了广东。

更迷惑的是，同一台机器访问国内接口时，出口 IP 又是另一个网段的（移动宽带），归属地完全正确。也就是说本机出口**按目标域名分流**，CF 看到的那个 IP 和国内服务看到的并不是同一个——它未必是访客"真实所在"的 IP。

这也不全是 CF 的锅。免费计划白送一份城市级定位已经很够意思了，只是国内的 IP 数据对国内 IP 更懂。

## 再补一层：服务端查国内库

想法很直接：边缘数据当兜底，中国大陆的 IP 再去国内库补一次细。两级串联，前一级失败就退到后一级，全挂了也照常返回边缘数据，装饰性浮层绝不能因此报错。

```ts title="workers/comments/src/index.ts"
/** 主源 v2.xxapi.cn：免费、无 key、支持 ?ip= 查任意 IP，返回区级地址 + 经纬度 */
async function lookupViaXxapi(ip: string): Promise<GeoDetail | null> {
	const res = await fetchGeoUpstream(`https://v2.xxapi.cn/api/ip?ip=${encodeURIComponent(ip)}`);
	if (!res.ok) return null;
	const body = await res.json();
	if (body.code !== 200 || !body.data) return null;
	const parts = splitCnAddress(body.data.address); // 「中国福建省福州市仓山区」→ 省/市/区
	const lat = Number.parseFloat(String(body.data.lat));
	const lon = Number.parseFloat(String(body.data.lng));
	if (!inChinaBbox(lat, lon)) return null; // 坐标不在境内 → 这份结果不可信
	return { locationText: parts.province + parts.city + parts.district, ...parts, lat, lon, source: "xxapi" };
}
```

跟这套逻辑一起加的还有三道闸，每一道都是被真实数据打脸之后补的：

| 闸门 | 拦住什么 |
| :--- | :--- |
| 只对 `cf.country === "CN"` 的访客查国内库 | 国内库对境外 IP 会瞎报——实测 `8.8.8.8` 被它说成「英国伦敦」 |
| 坐标必须落在中国境内（纬度 3~54、经度 73~136） | 拦掉上面那种离谱结果，宁可退回边缘数据也不显示错的 |
| 上游 3 秒超时 + 主备两个源 | 国内库偶尔抽风，不能让它拖住整个页面 |

现在同一份访客请求，返回长这样：

```json title="GET https://comments.example.com/geo"
{
  "ip": "210.34.94.91",
  "source": "xxapi",
  "country": "CN",
  "province": "福建省",
  "city": "",
  "district": "",
  "locationText": "福建省",
  "lat": 26.0998,
  "lon": 119.297,
  "cf": { "province": "Guangdong", "city": "Guangzhou", "lat": 23.11667, "lon": 113.25 }
}
```

`cf` 里还是广东，但 `lat`/`lon` 已经被国内库拉回福州了——距离从 694 公里变成 3 公里。

故意留着 `cf` 这个字段：线上排查时一眼能看出访客是不是走了代理，以及两个数据源各自怎么说的，不用再猜。

## 前端：中文化、算距离、加缓存

国内库给的是中文地址，但边缘兜底那条路返回的还是英文省名（`Guangdong`、`Fujian`），所以映射表照样得留着——34 个省级行政区加 80 来个主要城市，未命中的城市回退只显示省名：

```ts title="src/components/widget/WelcomeToast.astro"
const PROVINCE_MAP: Record<string, string> = {
	Guangdong: "广东省",
	Fujian: "福建省",
	"Hong Kong": "中国香港",
	/* ……34 项省级行政区 */
};

function calculateDistanceKmRounded(lat: number, lon: number): number {
	const R = 6371; // 地球平均半径 km
	const rad = Math.PI / 180;
	const dLat = (lat - HOME_LAT) * rad;
	const dLon = (lon - HOME_LON) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(HOME_LAT * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2;
	return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
```

`HOME_LAT` / `HOME_LON` 就是"我"的坐标，精度到市级就够了。

载体这边最终做成了浮层，几个当初没想到的细节：

- **放左下角不是右下角**。右下角已经被悬浮工具栏和石蒜挂件占着了，浮层挤进去必然打架。层级定在 `z-index: 45`——低于工具栏和目录抽屉，高于正文。
- **只在会话里弹一次**（用 `sessionStorage` 记标记），可以手动关，也会自动消失。它不是常驻组件，只是一个"打个招呼"。
- **移动端换成底部居中**，贴左边在窄屏上会显得别扭。
- **无刷新切页要重新判定**，Swup 换页后得重新跑一遍展示逻辑；同一次导航 `astro:page-load` 和 `swup:page:view` 会都触发，得去重，否则一次导航弹两遍。

剩下的体验细节照抄原站：`localStorage` 缓存 1 小时、5 秒超时兜底、IP 值默认 `blur-sm` 悬停才清晰。

## 效果与边界

装好之后，中国大陆的访客能拿到**区级**地址（「你好，来自 福建省福州市仓山区 的朋友」），境外访客则回落到边缘数据的市级。三条如实相告的边界：

1. **精度仍然取决于 IP 库**。国内库对家宽、机房 IP 更准，教育网段这类大段 IP 可能只到省一级（上面那份响应就只给了「福建省」）。文案里那句「IP 定位可能有误差」不只是免责声明，是事实。
2. **开代理的访客会被"定位"到代理出口**。我自己测试时就撞上了——卡片显示了一个我从没去过的城市。这不是 bug，IP 定位的原理就是如此。也正因为我自己就在这个坑里，才顺手把 `cf` 原始数据一起返回了，至少排查时不用猜。
3. **国内库只对国内 IP 有意义**。它对境外 IP 会给出莫名其妙的结果，所以必须先用国家和坐标范围卡一遍，不能闭着眼往下游要数据。

比起接一个第三方 API，这套方案的所有东西都在自己手里：域名是自己的，Worker 是自己的，数据只在访客浏览器和自己的 Worker 之间走一趟。成本呢？Cloudflare 免费额度内，一个字：零。

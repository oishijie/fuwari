---
title: '侧边栏「距离」卡片：用 Cloudflare 边缘数据免费定位访客'
published: 2026-08-24
description: '逛博客看到别人侧边栏有个「距离」卡片，能显示访客离博主多远。拆解后发现原站用的是付费 IP 接口，而免费的公共 API 一个接一个挂掉。最后换了个思路：在自家评论 Worker 上加个端点，直接读 Cloudflare 边缘自带的地理数据——零成本、零第三方依赖。'
image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Cloudflare', 'Workers', 'JavaScript']
category: 博客魔改
draft: false
lang: ''
order: 0
---

逛博客的时候看到一个有意思的小组件：侧边栏一张「距离」卡片，写着「欢迎来自 XX省XX市的小伙伴」「您现在距离我大约 X 公里」。访客和博主之间的物理距离被换算成一个具体的数字，一下子让"这个博客背后有个真实的人"变得具象了。

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

线上实测返回长这样：

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

有个 privacy 上的巧合：这个端点只把访客**自己的**位置返回给访客本人，不涉及任何第三方数据，天然合规。

## 前端：中文化、算距离、加缓存

CF 返回的是英文省名（`Guangdong`、`Fuzhou`），中文站直接显示英文就很出戏，所以内置了一张映射表——34 个省级行政区加 80 来个主要城市，未命中的城市回退只显示省名：

```ts title="src/components/widget/DistanceWidget.astro"
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

剩下的是原站同款的体验细节：`localStorage` 缓存 1 小时、5 秒超时兜底、IP 值默认 `blur-sm` 悬停才清晰，以及 Swup 无刷新切页后重新填充数据。

## 效果与边界

装好之后就是你在侧边栏看到的那张卡片。两个如实相告的边界：

1. **精度是城市级的**。CF 用的 IP 库定位到城市，文案里那句「IP 定位可能有误差」不只是免责声明，是事实。
2. **开代理的访客会被"定位"到代理出口**。我自己测试时就看到卡片显示了一个我从没去过的城市——那是代理服务器的位置。这不是 bug，IP 定位的原理就是如此。

比起接一个第三方 API，这套方案的所有东西都在自己手里：域名是自己的，Worker 是自己的，数据只在访客浏览器和自己的 Worker 之间走一趟。成本呢？Cloudflare 免费额度内，一个字：零。

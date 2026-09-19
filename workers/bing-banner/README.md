# blog-bing-banner

把 Bing 每日壁纸变成博客 banner 的取图服务：**Cloudflare Workers，零第三方依赖**。

## 为什么需要这个 Worker

2026 年那批「把 Bing 壁纸变成网站背景」的教程推荐两种做法，实测都不能用：

| 教程推荐的做法 | 实测结果（2026-09-19） |
| :--- | :--- |
| 第三方直链 `bing.img.run/1920x1080.php` | ❌ **域名已失效** |
| 第三方直链 `api.dujin.org/bing/1920.php` | ❌ **521**（Cloudflare 源站挂了） |
| 前端 JS 直接调官方元数据 API | ❌ **CORS 拦死**——`cn.bing.com/HPImageArchive.aspx` 响应里没有 `Access-Control-Allow-Origin`，浏览器 fetch 拿不到 |

官方元数据 API 本身是好的（稳定、免费、无需 key），缺的只是一个**能加 CORS 头、且能缓存**的中转。本 Worker 就干这一件事。

顺带一个关键事实：**图片直链不受同源策略限制**（`<img>` 不是 fetch），所以只要能拿到「当天图的 URL」，`<img>` 就能直接显示——不需要代理图片流量。

## 端点

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/today`（`/` 与 `/bing` 等价） | **302** 到当天壁纸 |
| `GET` | `/fallback` | 直接返回兜底图（302 自备图 / 200 SVG），**用于线上验证兜底链** |
| `GET` | `/meta` | 当天壁纸元数据 JSON，前端用于展示署名 |
| `GET` | `/health` | 健康检查，不打 Bing（省配额） |

### GET /today

```
HTTP/1.1 302 Found
Location: https://cn.bing.com/th?id=OHR.AlphornBavaria_ZH-CN5896237112_1920x1080.jpg&pid=hp&w=1920&h=1080
Cache-Control: public, max-age=3600
```

**图片流量不经过本 Worker**——302 让浏览器直连 Bing CDN，Worker 只中转元数据请求。

### GET /fallback

不管 Bing 是死是活，直接命中兜底链的第 2/3 级——**兜底逻辑不能只靠"等 Bing 挂"来验证**，
所以单独开了这个端点，线上随时可以探：

```
$ curl -I https://bing.142588.xyz/fallback
HTTP/1.1 302 Found
Location: https://imgbed.058823.xyz/file/...webp
X-Fallback: custom
X-Fallback-Reason: manual
```

兜底图不可达时，同一个端点会返回 `200` + `image/svg+xml`（`X-Fallback: svg`）。

### GET /meta

```json
{
  "ret": "OK",
  "data": {
    "date": "20260918",
    "title": "慕尼黑啤酒节的阿尔卑斯之声",
    "credit": "阿尔卑斯长号演奏者，巴伐利亚州，德国 (© U. J. Alexander/Shutterstock)",
    "creditUrl": "https://www.bing.com/search?q=...",
    "image": "https://cn.bing.com/th?id=..._1920x1080.jpg&pid=hp&w=1920&h=1080"
  }
}
```

`credit` 已剥掉 Bing 自带的中文前缀（`图文：`），直接可显示。

## 兜底链（三级）

Bing 挂掉时**绝不白板**：

| 级 | 条件 | 返回 |
| :--- | :--- | :--- |
| 1 | Bing API 正常 | 302 → 当天壁纸 |
| 2 | Bing 失败，且 `FALLBACK_URL` **探活通过** | 302 → 自备兜底图 |
| 3 | 兜底图也探不通（或没配） | 200 → 内置 SVG 渐变占位图（347 B，无字体依赖） |

第 2 级的**探活是必要的**：直接 302 过去的话，图床挂掉时就只剩一个破图；
而 SVG 是内联在 Worker 里的、永远不会失败——那才是"永不白板"的最后一道保险。
探活用 `HEAD` + 边缘缓存（`cacheTtl: 300`），只在兜底路径发生，正常路径零开销。

HTTP 500 / DNS 失败 / 返回非 JSON / `images` 为空 / 缺 `urlbase`，五种故障模式走的都是同一条兜底链。

兜底图当前是一张 **Unsplash License** 的山峦云海图（1920×1080 / webp q82 / 259 KB），
托管在自有图床，源图 ID `photo-1470071459604-3b5ec3a7fe05`。
换图只需改 `FALLBACK_URL` 后重新 deploy，**不用动代码**。

## 部署

```bash
cd workers/bing-banner
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

⚠️ 必须清掉 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 再跑，否则报认证错误 10000
（本机环境里这两个变量存在但无效）。

`routes` 里的 `custom_domain: true` 让 wrangler 自动创建 `bing.142588.xyz` 的 DNS 记录与证书。
`workers.dev` 域名在中国大陆被 DNS 污染，直连不通，所以必须走自有域名。

## 配置（wrangler.jsonc 的 vars）

| 变量 | 默认 | 用途 |
| :--- | :--- | :--- |
| `BING_MKT` | `zh-CN` | 决定图片地区与文案语言，改 `en-US` 出英文 |
| `IMG_WIDTH` / `IMG_HEIGHT` | `1920` / `1080` | 向 Bing 请求的尺寸；填非法值会回退默认 |
| `CACHE_SECONDS` | `3600` | 跳转与元数据的缓存秒数 |
| `FALLBACK_URL` | 图床兜底图 | Bing 失败时 302 到此图；Worker 会先 HEAD 探活，探不通自动退回内置 SVG。留空则直接用 SVG |
| `ALLOWED_ORIGINS` | 博客域名 | CORS 白名单，逗号分隔；只有 `/meta` 需要跨域 |

体积参考（同一张图）：`1920×1080` 约 0.23 MB，API 默认 `1920×1080` 约 0.32 MB，
`1600×900` 约 0.16 MB，UHD 4K 约 0.57 MB。banner 是全宽大图，默认 1920×1080 足够。

## 前端接法

`src/config.ts`：

```ts
banner: {
  enable: true,
  src: "https://bing.142588.xyz/today",
  credit: { enable: true, text: "Bing 每日壁纸", url: "https://www.bing.com" },
}
```

**为什么能「每天自动变」不用重新构建**：`src/components/misc/ImageWrapper.astro`
对 `http(s)://` 开头的地址走普通 `<img>` 直出，Astro 不会在构建时把它下载固化
（只有本地相对路径才会走 `<Image>` 优化）。所以 `banner.src` 指向一个动态跳转是安全的。

`credit.text` / `credit.url` 是**兜底值**，`src/layouts/MainGridLayout.astro` 里的脚本
会在加载后 fetch `/meta`，把文案换成当天摄影师、链接换成 Bing 的图片来源页。

## 已知风险

- **版权**：Bing 每日图版权归摄影师 / Shutterstock 等，Bing 官方 tooltip 写着「此图片不能下载用作壁纸」。
  个人博客非商业使用属灰色地带。缓解手段是展示署名（本项目的 credit 就是干这个）。
- **首屏**：302 一跳 + 约 0.23 MB 下载期间，`showBanner()` 已提前淡入，会先看到空渐变。
  已通过 `preconnect` 到两个域名缓解，彻底解决需要在 `showBanner` 里等 `img.onload`。
- **Bing 改接口**：改了就改本 Worker。兜底链路保证不会白板。
- **兜底图依赖自有图床**：图床挂掉时会自动退回 SVG（不会破图），但兜底就只剩渐变占位了。

## 验证

```bash
node .workbuddy/tools/verify-bing-banner.mjs   # 本地打桩，不部署不起服务（71 项）
```

线上一把梭（四个端点一起探，含兜底链）：

```bash
node -e "const r=await fetch('https://bing.142588.xyz/today',{redirect:'manual'});console.log(r.status, r.headers.get('location'))"
```

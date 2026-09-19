---
title: '把 Bing 每日壁纸变成博客 Banner：265 行零依赖 Worker 与一条三级兜底链'
published: 2026-09-19
description: '博客首页 banner 想每天自动换图，又不想天天手动上传。本文是一条完整可抄的路径：从实测 Bing 官方接口的真实响应（它没有 CORS 头，这就是为什么中间必须站一个 Worker），到尺寸档位与 30% 体积差的实测数据，再到「永不白板」的三级兜底链——包括一个专门用来验证兜底、把「等它挂」变成一条命令的 /fallback 端点。'
image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - Cloudflare Workers
  - Bing 每日壁纸
  - 边缘缓存
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 0
---

Fuwari 的首页 banner 支持填一个图片地址，官方文档默认让你放一张本地图。但本地图的代价是：**这张图再也不会变**。想每天换一张风景，就得每天手动下载 + 压缩 + 提交 + 部署。

Bing 每天会换一张壁纸，图质量稳定、带摄影师署名、API 公开无需注册。拿它当 banner 图源是很自然的想法——而直接的实现路径全都走不通，最后落地的是一个 265 行的零依赖 Cloudflare Worker。

这篇只讲干货：接口真实长什么样、踩到的每个坑、以及为什么中间那一层不是"多余的封装"而是必需品。

![浏览器 → 自建 Worker → Bing CDN 的请求链路，以及 Bing 不可用时的三级兜底链](https://imgbed.058823.xyz/file/1789831039430_bing-banner-arch.webp)

---

## 一、为什么中间必须站一个 Worker

先看三个"直接就能用"的思路，全部实测过：

| 思路 | 实测结果 |
| :--- | :--- |
| 前端 `fetch` Bing 元数据 API 拿图地址 | ❌ 被 CORS 拦死——该 API 响应里**没有** `Access-Control-Allow-Origin` |
| 第三方直链接口（`bing.img.run`、`api.dujin.org` 等老教程推荐的） | ❌ 实测已挂，域名不解析或不响应 |
| 把图下载到 `public/` 每天提交一次 | ✅ 能用，但就不是"自动"了，等于上了一个每日闹钟 |

第一条是决定性的。实测一下就很清楚：

```bash
curl -sI 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN' | grep -i access-control
# （无输出）
```

浏览器发起的跨域 `fetch` 拿不到响应体，`no-cors` 模式下又读不出内容。**这个接口天生只能由服务端调用**——不是"可以加个代理更优雅"，而是"不加代理根本拿不到"。

所以链路变成了：

```text
浏览器 ──<img src>──> Worker（302）──> cn.bing.com 的图片 CDN
                        └─ 边缘缓存着调一次元数据 API
```

这里有个值得单独说的设计：**Worker 只做 302，不搬运图片字节**。

- 图片流量直接由浏览器连 Bing CDN，Worker 完全不参与传输；
- Worker 一天真正"干活"的次数约等于零（元数据被边缘缓存住，`cacheTtl: 1800`）；
- 免费额度（10 万请求/天）对这个用法来说是天文数字。

如果改成 Worker 拉图再回吐（`fetch` 图片然后 `Response` 出来），带宽会全部记在 Worker 账上，收益是零。302 是这里唯一正确的姿态。

---

## 二、Bing 的接口真实长什么样

`format=js` 时的响应（2026-09-19 实测截取）：

```json
{
  "images": [
    {
      "startdate": "20260918",
      "urlbase": "/th?id=OHR.AlphornBavaria_ZH-CN5896237112",
      "copyright": "阿尔卑斯长号演奏者，巴伐利亚州，德国 (© U. J. Alexander/Shutterstock)",
      "copyrightlink": "https://www.bing.com/search?q=..."
    }
  ]
}
```

真正要用的只有三个字段：

| 字段 | 用途 |
| :--- | :--- |
| `urlbase` | 图片地址的"主干"，补上尺寸档位才是完整 URL |
| `copyright` | 署名文案，已含摄影师与图库 |
| `copyrightlink` | Bing 上这张图的介绍页，拿来做照片来源链接 |

### 2.1 拼地址：尺寸档位与那 30% 的体积差

`urlbase` 拼图片地址的实际形态是：

```text
https://cn.bing.com/th?id=OHR.AlphornBavaria_ZH-CN5896237112_1920x1080.jpg&pid=hp&w=1920&h=1080
                                                      └───── 档位 ─────┘ └── 尺寸参数 ──┘
```

两处尺寸必须写一样，但**它们不是一回事**：

- `_1920x1080` 是**档位**，位图是 Bing 预压好的固定产物，白名单之外的档位直接 404；
- `&w=1920&h=1080&pid=hp` 是**让 Bing 按这个尺寸重新压一遍**的参数。

把 `&pid=hp&w=&h=` 去掉，同一张图会大一圈：

| 地址形态 | 实测体积 |
| :--- | :--- |
| `_1920x1080.jpg&pid=hp&w=1920&h=1080` | **231.2 KB** |
| `_1920x1080.jpg`（无尺寸参数） | **327.9 KB** |

**少了这串参数，banner 就白多下约 96 KB**（−30%）。这是最容易漏、也最值钱的一行。

档位白名单实测（同一天、同一张图）：

| 档位 | 结果 | 体积 |
| :--- | :--- | ---: |
| `_UHD` | ✅ 200 | 218.8 KB |
| `_1920x1080` | ✅ 200 | 231.2 KB |
| `_1366x768` | ✅ 200 | 157.0 KB |
| `_1280x720` | ✅ 200 | 132.5 KB |
| `_1024x768` | ✅ 200 | 124.7 KB |
| `_800x600` | ✅ 200 | 84.2 KB |
| `_400x240` | ✅ 200 | 32.3 KB |
| `_1920x1200` / `_1600x900` / 不写档位 | ❌ 404 | — |

两个可以直接抄的结论：

1. **别猜档位**。`1600x900` 和 `1920x1200` 看着很合理，实际 404。404 在 `<img>` 里不会报错，只会静默变成一张破图——比白屏更难发现。
2. **体积不随分辨率单调**。`_UHD` 反而比 `_1920x1080` 小（218.8 vs 231.2 KB），说明这些档位是不同批次压出来的固定产物。所以别按"分辨率越大越重"去推理，要按实测选。banner 是全宽大图，`1920x1080` 足够；窄屏或移动端为主可以降到 `_1366x768`，直接省掉三分之一。

### 2.2 署名要洗一遍

`copyright` 的值带着 Bing 自己的中文前缀：

```text
阿尔卑斯长号演奏者，巴伐利亚州，德国 (© U. J. Alexander/Shutterstock)
```

直接显示没问题，但如果想只留后面的部分，用一条正则剥掉「图文：」这类前缀即可：

```ts
// 匹配开头的任意非中文冒号内容 + 冒号
function cleanCredit(raw?: string): string {
  return str(raw).replace(/^[^：:]*[：:]\s*/, "");
}
```

顺手把"取不到就返回空"处理掉，前端的兜底文案（`config.ts` 里那一行）会顶上。

---

## 三、三级兜底链：Banner 不能白板

banner 是首屏第一眼。它挂了，整站看起来就像没做完。所以这里的兜底不是"锦上添花"，而是必须项：

| 级 | 触发条件 | 返回 |
| :--- | :--- | :--- |
| 1 | Bing API 正常 | 302 → 当天壁纸 |
| 2 | Bing 失败，且自备兜底图**探活通过** | 302 → 自备兜底图 |
| 3 | 兜底图也探不通（或没配） | 200 → 内置 SVG 渐变占位图（约 400 B） |

### 3.1 为什么第 2 级必须"先探活"

最容易写错的一步：拿到 `FALLBACK_URL` 就直接 302 过去。问题是**兜底图本身也是外部依赖**——它托管在图床上，而图床会挂。

图床挂掉时的表现是"302 到一个死链"，浏览器上就是一张破图。**兜底图挂掉造成的破图，比没有兜底更糟**，因为它伪装成了有兜底。

正确做法是探活：

```ts
async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cf: { cacheTtl: 300, cacheEverything: true } });
    return res.ok;
  } catch {
    return false;
  }
}
```

`HEAD` 不传输图片字节，`cacheTtl: 300` 让探活结果在边缘缓存 5 分钟——只在**兜底路径**上发生，正常路径零开销。

### 3.2 第 3 级为什么是内联 SVG

最后一道保险不能有任何外部依赖。所以它不是一张图，而是 Worker 里的一段字符串：

```ts
function placeholderSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="#2a3f5f"/><stop offset="0.55" stop-color="#1b2a41"/>'
    + '<stop offset="1" stop-color="#0f1a2b"/></linearGradient></defs>'
    + '<rect width="1920" height="1080" fill="url(#g)"/></svg>';
}
```

约 400 字节，纯渐变、**不含文字**（不依赖任何字体，也不会有中文乱码问题）。这段代码只要 Worker 还在跑，它就一定渲染得出来——这才是"永不白板"的物理保证。

实测确认：五种故障模式——HTTP 500、DNS 失败、返回非 JSON、`images` 为空、缺 `urlbase`——走的都是同一条兜底链，因为 `fetchTodayImage()` 把所有异常都吞掉并返回 `null`，由调用方统一决定去向。

---

## 四、`/fallback`：把"等它挂"变成一条命令

三级兜底链有个尴尬：**平时永远测不到**。第 2、3 级只有在 Bing 真挂的那天才会触发，而你想在出事前确认它可用时，只能干等。

所以专门开了一个端点：

```text
GET /fallback   →  不管 Bing 死活，直接命中兜底链的第 2/3 级
```

它带两个响应头说明自己走的是哪一级：

```text
X-Fallback: custom        # 命中了自备兜底图
X-Fallback-Reason: manual # 手动触发（自动触发时是 bing-unavailable）

X-Fallback: svg           # 自备图也没探通，退回内置 SVG
```

现在验证兜底链是一条命令的事：

```bash
node -e "const r=await fetch('https://bing.142588.xyz/fallback',{redirect:'manual'});console.log(r.status, r.headers.get('x-fallback'), r.headers.get('location'))"
```

**这个设计的价值在于：可测的兜底才算兜底。** 一段"只会在故障时执行、且从没被执行过"的代码，是没被验证过的代码。

---

## 五、Worker 端的四个取舍

整份实现 265 行、零依赖——`wrangler deploy` 上去的就是自己那份 `index.ts`。几个刻意的选择：

**① 不引框架。** 四个端点、一个 `switch` 就够了。上 Hono 会让"部署的产物"和"能读懂的代码"之间多隔一层。

**② 边缘缓存元数据。** 调 Bing 那次 `fetch` 带 `cacheTtl: 1800`，只有到期的第一次请求会真正回源。一天 48 次，不是"每个访客一次"。

**③ CORS 只给 `/meta`。** 只有它需要被前端 `fetch`（换署名），图片路径是 302 跳转，根本不需要 CORS 头。`ALLOWED_ORIGINS` 走白名单而不是 `*`。

**④ 跳转本身也缓存。** 302 带 `Cache-Control: public, max-age=3600`，浏览器和中间层一小时才回来问一次。

| 端点 | 作用 |
| :--- | :--- |
| `GET /` `GET /today` `GET /bing` | 302 → 当天壁纸（三个别名，用哪个都行） |
| `GET /fallback` | 手动命中兜底链，用于验证 |
| `GET /meta` | 当天壁纸元数据 JSON（标题 / 署名 / 原文链接 / 原图） |
| `GET /health` | 健康检查，返回市场、尺寸、当前兜底模式 |

---

## 六、前端三步

后端通了，前端只剩三件事——但每件都有一个"不做就静默失效"的坑。

### 6.1 `banner.src` 必须是 http(s) 绝对地址

```ts
// src/config.ts
banner: {
  enable: true,
  src: "https://bing.142588.xyz/today",
  credit: { enable: true, text: "Bing 每日壁纸", url: "https://www.bing.com" },
}
```

**这一步决定了"每天自动换"能不能成立。**

Fuwari 的 `ImageWrapper.astro` 对 `http(s)://` 开头的地址走普通 `<img>` 直出，Astro 不会在构建时把它下载固化（只有本地相对路径才会走 `<Image>` 优化）。所以 `src` 指向一个**动态 302** 是安全的：每次访问由浏览器现场解析，图片天然天天不同，**不需要重新构建**。

反过来，如果写成本地相对路径 `/banner.jpg`，它会在构建时被优化成一张固定图片——"每天自动换"就彻底没了。

### 6.2 署名是动态的

静态配置里只能写死一句兜底文案。真正的摄影师署名要去 `/meta` 换回来。这段脚本放在布局里，首次加载跑一次即可——banner 在 Swup 容器之外，切页不会重建。

```ts
// src/layouts/MainGridLayout.astro
const bannerMetaUrl = siteConfig.banner.src.replace(/\/today\/?$/, "/meta");
```

脚本 `fetch(bannerMetaUrl)` 拿到 `data.credit` 就写进 `#banner-credit-text`，拿到 `data.creditUrl` 就改 `#banner-credit` 的 `href`。

⚠️ 注意 `config.ts` 里的 `credit.text` / `credit.url` 是**兜底值，别删**：`/meta` 请求失败、或 Bing 挂掉走兜底图时，页面上显示的就是它俩。

### 6.3 两条 preconnect

链路里有两个域名要握手：取图服务、以及它 302 之后的 Bing CDN。两条预连接省掉两次完整握手：

```astro
{enableBanner && bannerOrigin && (
  <>
    <link rel="preconnect" href={bannerOrigin} />
    <link rel="preconnect" href="https://cn.bing.com" />
  </>
)}
```

第二条是最容易忘的——**redirect 的目标域名也要 preconnect**，否则 DNS + TLS 全挤在 302 之后才发生。

---

## 七、部署：两个非写不可的细节

```bash
cd workers/bing-banner
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx -y wrangler deploy
```

**① 必须清掉那两个环境变量。** 本机环境里它们存在但无效，不清掉会直接报认证错误 `10000`。这个坑的本站记录在另一篇文章里也出现过——凡是 `wrangler deploy` 报 10000，先 `env -u` 再跑。

**② `workers.dev` 域名必须放弃。** 它在国内被 DNS 污染，直连不通。配置里用 `custom_domain: true` 挂自有域名：

```jsonc
"routes": [
  { "pattern": "bing.142588.xyz", "custom_domain": true }
]
```

`custom_domain: true` 会让 wrangler 自动创建 DNS 记录与证书，不用手动去控制台点。

---

## 八、为什么没用 Unsplash

Unsplash 看起来是更"正规"的选择：图片许可干净（Unsplash License，可商用）。但实测下来，做 banner 图源它反而更麻烦：

| 对比项 | Bing 每日壁纸 | Unsplash |
| :--- | :--- | :--- |
| 随机图接口 | 官方 API，**无需注册、无需 key** | `source.unsplash.com` 实测 **503**（已停止服务） |
| 正式 API | `cn.bing.com/HPImageArchive.aspx`，直接 GET | `api.unsplash.com/photos/random` 实测 **401**，必须注册应用拿 Access Key |
| 调用配额 | 无（本方案靠边缘缓存，一天几十次） | Demo 版 50 请求/小时 |
| 图片体积（1920×1080） | **231.2 KB**（带尺寸参数） | 249.5 KB（jpg q80）/ 242.4 KB（webp q80） |
| 更新节奏 | 每天全站同一张 → **缓存友好**，图不变 | 每次请求可以不同 → 每次都要重新下载 |
| 许可 | 版权属摄影师 / Shutterstock，**非商业使用属灰色地带** | Unsplash License，可商用 |
| 署名 | 接口直接给摄影师与图库名 | 规范要求显著标注，需自己实现 |

三个结论：

- **稳定性上 Bing 完胜**：不需要 key、不需要注册、不会因为配额或接口下线而挂（`source.unsplash.com` 的前车之鉴就在眼前）。
- **体积上两者接近**（231 KB vs 250 KB），所以"省流量"不是选 Bing 的理由。
- **法律上 Unsplash 更干净**。Bing 的图版权归摄影师和 Shutterstock，Bing 官方 tooltip 甚至写着"此图片不能下载用作壁纸"。个人博客非商业使用属于灰色地带，缓解方式是**把署名显示出来**（本项目 `credit` 就是干这个的），但这不是免责。

如果这个站将来要商业化，正确做法是换成 Unsplash / Pexels 这类明确授权的图源，或者干脆换成自绘的 banner。技术链路（Worker + 兜底链 + 302）可以原样复用，只改 `FALLBACK_URL` 和第 1 级的取图逻辑。

另外，**兜底图本身就选了一张 Unsplash License 的图**（山峦云海，1920×1080 / webp q82 / 259 KB，托管在自有图床）——万一哪天真要撤掉 Bing，第 2 级已经在跑一张合法图了。

---

## 九、踩坑清单

| 现象 | 原因 | 处理 |
| :--- | :--- | :--- |
| 前端 fetch Bing API 报 CORS | 该接口无 `Access-Control-Allow-Origin` | 只能由服务端调，加中间层 |
| banner 是破图 | 尺寸档位不在白名单（如 `1600x900`），图片 404 | 只用实测可用的档位，Worker 侧保证档位不来自用户输入 |
| banner 加载慢、体积大 | 漏了 `&pid=hp&w=&h=` | 拼地址时补上，同一张图省约 30% |
| 署名一直是"Bing 每日壁纸" | `/meta` 请求失败，或 `bannerMetaUrl` 推导错了 | 检查 `src` 是否以 `/today` 结尾；`credit.text` 是兜底值不是 bug |
| 切页后署名或 banner 失效 | 脚本挂在 Swup 容器内被替换 | banner 与 credit 都应在 Swup 容器之外 |
| 部署报错 10000 | 环境里有无效凭据 | `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID` 后再 deploy |
| `workers.dev` 打不开 | 国内 DNS 污染 | 挂自有域名，`custom_domain: true` |
| 图片每天都一样 | `banner.src` 写成了本地相对路径，构建时被固化 | 必须用 http(s) 绝对地址指向动态 302 |
| 想测兜底链但没机会 | 兜底只在故障时触发 | 用 `GET /fallback` 手动命中 |

---

## 十、验证

整套逻辑可以完全离线验证，不需要部署、不需要起服务：

```bash
node .workbuddy/tools/verify-bing-banner.mjs   # 71 项
```

它用打桩的方式覆盖了：四种端点路由、302 的 `Location` 拼接、`&w=&h` 参数是否带上、CORS 白名单命中与不命中、五种故障模式是否都落到兜底链、`X-Fallback` 头是否正确、内置 SVG 是否合法且无外部引用。

线上快速探活（含兜底链）：

```bash
node -e "const r=await fetch('https://bing.142588.xyz/today',{redirect:'manual'});console.log(r.status, r.headers.get('location'))"
```

---

## 小结

整件事的核心可以压缩成三句话：

1. **中间层不是封装，是必需品**——Bing 的元数据接口没有 CORS 头，浏览器端根本拿不到数据。
2. **Worker 只做 302，不搬字节**——图片流量直连 Bing CDN，Worker 一天真正干活的次数屈指可数。
3. **兜底必须可测**——三级兜底链 + 一个专门用来手动命中它的 `/fallback` 端点。

最终成果：首页 banner 每天自动换图、显示摄影师署名、不需要重新构建、Bing 挂了也不会白板——代价是 265 行代码和一个自有子域名。

---

## 参考与致谢

- **接口**：[Bing `HPImageArchive.aspx`](https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN)（本文所有档位与体积数据均实测自该接口当天返回的图片）
- **兜底图**：Unsplash License，源图 ID `photo-1470071459604-3b5ec3a7fe05`
- **Banner 组件**：Fuwari 原生的 `ImageWrapper.astro` / `siteConfig.banner`

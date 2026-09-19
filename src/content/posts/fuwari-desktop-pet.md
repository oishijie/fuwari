---
title: '给博客养一只桌面宠物：CodexPet 嵌入实操，和上游不管的六个细节'
published: 2026-09-18
description: '站里早有一篇 Live2D 看板娘的调研，结论是暂不落地。这次换了一条路——纯 2D 雪碧图 + canvas，SDK 只有 23KB。从选型取舍、挂载决策、六处上游没管的细节，到不起 dev server 的验证手段与四个坑，一篇完整的落地记录。'
image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - Fuwari
  - 桌面宠物
  - CodexPet
category: ''
draft: false
hidden: false
---

## 起因

站里早有一篇 [Live2D 看板娘的调研](/posts/live2d-mascot-review/)，当时的觉得太重，没必要复刻。巧的是，最近在 [blog.pljzy.top](https://blog.pljzy.top/posts/%E5%8D%9A%E5%AE%A2%E7%AF%87%E7%BB%99%E5%8D%9A%E5%AE%A2%E5%8A%A0%E4%B8%8A%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/%E5%8D%9A%E5%AE%A2%E7%AF%87%E7%BB%99%E5%8D%9A%E5%AE%A2%E5%8A%A0%E4%B8%8A%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/) 看到「桌面宠物」时，第一反应是——这不还是看板娘吗？看完才发现不是一回事，它走的是另一条完全不同的技术路线。

| 维度 | Live2D | 雪碧图（本次方案） |
| :--- | :--- | :--- |
| 渲染方式 | WebGL，需要 GPU | Canvas 2D `drawImage` |
| 运行时 | Live2D Cubism Core，数百 KB 起 | 一个 22.8 KB 的 JS |
| 资源构成 | 模型配置 + 纹理 + 动作 JSON | **一张**雪碧图 |
| 资源体积 | 常见几 MB ~ 几十 MB | 2.2 MB |
| 表现力 | 强（跟随鼠标、物理摆动、口型） | 弱（固定状态循环） |
| 换角色成本 | 换模型包 + 调参数 | 换一张图 + 一个 JSON |
| 许可 | 各模型不同，商用多有限制 | 看素材来源标注 |

结论很清楚：**表现力换轻量**。雪碧图这条路的取舍很划算——没有 WebGL、没有模型解析、资源就一张图，而换成角色只要丢个目录进去。

三道坎里的「模型体积」和「Swup 重复初始化」，前者被压到 2.2MB，后者是本文的重点之一。于是决定：**走这条路，角色选流萤**——本站是 fuwari / Firefly 系，大小样式正合我意，话不多说，立刻开干。

## 一、资源三件套

方案来自 [ZyPLJ/WebCodexPet](https://github.com/ZyPLJ/WebCodexPet)，**MIT 许可**（已把许可副本归到 `public/lib/LICENSE-codex-pet.txt`）。宠物按目录分，仓库里有流萤、芙芙、甘雨、财神派蒙四个，挑来拣去看中了流萤：

| 文件 | 位置 | 大小 |
| :--- | :--- | :--- |
| SDK | `public/lib/codex-pet.js` | 22.8 KB |
| 元数据 | `public/pets/firefly/pet.json` | 2.5 KB |
| 雪碧图 | `public/pets/firefly/spritesheet.webp` | 2.2 MB |

雪碧图规格是 **1536×1872，8 列 × 9 行**，每格 192×208。九行对应九种状态：

| 行 | 状态 | 帧数 | 用途 |
| :--- | :--- | :--- | :--- |
| 0 | `idle` | 6 | 静息、呼吸、眨眼循环 |
| 1 | `running-right` | 8 | 向右拖拽移动 |
| 2 | `running-left` | 8 | 向左拖拽移动 |
| 3 | `waving` | 4 | 打招呼 / 吸引注意 |
| 4 | `jumping` | 5 | 悬停、跳跃 |
| 5 | `failed` | 8 | 受阻 / 失败 / 取消 |
| 6 | `waiting` | 6 | 等待输入 |
| 7 | `running` | 6 | 处理中 |
| 8 | `review` | 6 | 结果就绪 |

`pet.json` 就是描述这张表的说明书：

```json
{
  "pet_id": "firefly",
  "display_name": "流萤",
  "atlas": { "columns": 8, "rows": 9, "cell_width": 192, "cell_height": 208,
             "width": 1536, "height": 1872 },
  "rows": [
    { "state": "idle", "row": 0, "frames": 6, "purpose": "calm resting, breathing, and blinking loop" },
    { "state": "running-right", "row": 1, "frames": 8, "purpose": "rightward drag movement loop" }
  ]
}
```

SDK 侧的逻辑直白到一句话能讲完：`requestAnimationFrame` 推进帧号，然后按行列裁格画到 canvas 上——

```js
ctx.drawImage(spritesheet, col * 192, row * 208, 192, 208, 0, 0, 192, 208);
```

**为什么是自托管而不是引 CDN**：跨域雪碧图必须由对方开 CORS，否则 canvas 会被标记为「脏」，一旦后续有读像素的操作就会抛安全异常。自托管没这个问题，代价是 2.3MB 进仓库、走 CF 分发——这个代价我认为值得，理由在最后一节。

## 二、挂载：三个先想清楚的决策

配置收在 `src/config.ts` 的 `petConfig`（类型在 `src/types/config.ts`），挂载代码在 `src/layouts/Layout.astro` 末尾。有三件事必须在写第一行代码前定下来。

### 1. 宿主挂在 Swup 容器之外

本站是 Swup 做的前端路由，容器是 `["main", "#toc"]`。**宠物宿主必须在这两个容器之外**——挂在 body 里：

```astro
<!-- src/layouts/Layout.astro -->
{petConfig.enable && <div id="site-pet-host" aria-hidden="true"></div>}
```

如果图省事把它塞进 `main` 里，每次切页 Swup 都会把整块 innerHTML 换掉：canvas 没了、拖拽位置丢了、动画从头开始，而且极容易叠出两只宠物。这正是那篇 Live2D 调研担心的「Swup 重复初始化」。

### 2. 单例守卫

Swup 更新 `<head>` 时可能重跑脚本，所以用 `window` 标志位兜住，防止挂出第二只：

```ts
function mountPet() {
  if (!cfg.enable) return;
  if ((window as any).__sitePetBooted) return;
  (window as any).__sitePetBooted = true;
  // ...
}
```

### 3. 延迟下发

雪碧图 2.2MB，不能和首屏抢带宽。等 `load` 之后再丢给浏览器空闲时段：

```ts
function schedulePet() {
  if (!cfg.enable) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (cfg.hideOnMobile && narrow.matches) return;
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") ric(mountPet, { timeout: 2500 });
  else setTimeout(mountPet, 1200);
}

if (document.readyState === "complete") schedulePet();
else window.addEventListener("load", schedulePet, { once: true });
```

SDK 本身是按需注入的，也不进主 bundle：

```ts
const s = document.createElement("script");
s.src = `${BASE}lib/codex-pet.js`;
s.async = true;
s.onload = mount;
document.head.appendChild(s);
```

## 三、上游没管的六件事

SDK 的开箱默认值是「demo 友好」，直接照抄到博客上会出事。以下六处是我改的。

| # | 上游默认 | 我改成 | 为什么 |
| :--- | :--- | :--- | :--- |
| 1 | `zIndex: 2147483000` | `40` | 会盖住目录抽屉和评论框 |
| 2 | `position: bottom-right` | `bottom-left` | 右下角已被悬浮工具栏占用 |
| 3 | 所有视口都加载 | `<768px` 不加载 | 省流量，也不挡正文 |
| 4 | 忽略动画偏好 | 尊重 `prefers-reduced-motion` | 系统开了「减少动态效果」就不加载 |
| 5 | 后台持续播放 | 标签页隐藏时 `pause()` | 否则 `requestAnimationFrame` 空转烧 CPU |
| 6 | 出错插红框 | `onError` 里移除 | 那是给开发者看的，不该让访客看到 |

**第 1 条最要紧**。本站的浮层层级是有约定的：

| 层 | z-index |
| :--- | :--- |
| 正文 | 0 |
| **桌面宠物** | **40** |
| 悬浮工具栏（回到顶部等） | 50 |
| 遮罩 | 55 |
| 目录抽屉 | 60 |

SDK 默认那个 `2147483000` 是个「压过全世界」的值——宠物会飘在目录抽屉上面，点抽屉时被它挡住。配置里我把层级作为一个显式参数暴露出来，注释就写着本站在用的这几个值：

```ts
zIndex: 40, // 低于悬浮工具栏(50)与目录抽屉(60)
```

**第 2 条**是因为本站右下角已经有悬浮工具栏（回到顶部、主题切换那排按钮），宠物默认也在右下，会挤成一团。左下角是空的，放它正合适。

**第 5 条**如果漏了，你会收到用户关于「风扇转得厉害」的反馈——后台标签页里 `requestAnimationFrame` 是被节流的，但节流不等于停止，动画仍在跑：

```ts
document.addEventListener("visibilitychange", () => {
  const p = (window as any).sitePet;
  if (!p) return;
  if (document.hidden) p.pause();
  else p.resume();
});
```

**第 6 条**小但体面。SDK 加载失败时会往页面里插一个红色错误提示框，那是给开发者调试用的：

```ts
onError(err: any, inst: any) {
  console.warn("[sitePet]", err && err.message);
  try {
    inst?.shadow?.querySelector(".cp-error")?.remove();
  } catch { /* ignore */ }
},
```

另外还有第 7 处，不算「改」算「修」：上游那个 `pet.json` **带 UTF-8 BOM**。原文章的踩坑记录里也提过这一点。我在落地前去掉了 BOM，否则 `JSON.parse` 在某些解析路径上会直接抛错。


## 四、换角色 / 关掉

- **换角色**：宠物包整个目录丢进 `public/pets/<id>/`，改 `petConfig.id` 即可。上游还有芙芙（`fufu-sticker`）、甘雨（`ganyu-pet-v2`）、财神派蒙（`rich-paimon`）可选，但资源要自己下载自托管。
- **临时关掉**：`petConfig.enable = false`，宿主容器和脚本都不会输出。
- **调大小 / 速度**：`scale`（0.5 → 96×104 px）、`speed`（毫秒每帧，当前 120）。
- **换位置**：`position` 支持四个角，`margin` 是边距。

配置全文如下：

```ts
export const petConfig: PetConfig = {
	enable: true,
	id: "firefly", // 流萤；可选 fufu-sticker / ganyu-pet-v2 / rich-paimon（须自备资源）
	spritesheet: "", // 留空 = /pets/<id>/spritesheet.webp
	scale: 0.5, // 0.5 → 96×104 px
	speed: 120, // 毫秒/帧
	position: "bottom-left", // 左下角（右下角已被悬浮工具栏占用）
	margin: 18,
	state: "idle",
	zIndex: 40, // 低于悬浮工具栏(50)与目录抽屉(60)
	draggable: true,
	clickCycle: true,
	hideOnMobile: true,
};
```

## 小结

回头看，这件事真正花时间的不是「把宠物挂上去」——那部分是十来行配置和一次 `mount` 调用。花时间的是那三道老坎：

1. **体积**：从 Live2D 的几十 MB 换成一张 2.2MB 的图，从「不敢上」变成「可以上」；
2. **Swup**：把宿主挂在容器之外 + 单例守卫，切页时宠物纹丝不动、也不叠加；
3. **抢位**：主动改掉那个「压过全世界」的层级，让宠物老实待在正文之上、工具栏之下。



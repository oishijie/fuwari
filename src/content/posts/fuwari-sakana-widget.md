---
title: '给博客挂一只「石蒜」：Sakana! Widget 落地实操，和一个只在切页时发作的 bug'
published: 2026-09-18
description: '右下角一只可拖拽的立牌角色，87 KB 自包含 UMD，零外部请求。挂上去不难，难的是那个只在 Swup 切页时发作的 bug——人物凭空消失，只剩一根杆子。从尺寸链、摇幅公式，到 head-plugin 删掉运行时样式，一篇完整的落地记录。'
image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - Fuwari
  - Sakana
  - 博客挂件
category: 博客魔改
draft: false
hidden: false
---

## 起因

上一篇文章刚给博客养了只[桌面宠物](/posts/fuwari-desktop-pet/)，左下角一只流萤。转头逛到 [zhidongli.top](https://zhidongli.top/)，发现右下角还站着一个更"物理"的东西——一块立在杆子上的角色牌，按住能拖着晃，松手自己回弹。

查了一下，是 [dsrkafuu/sakana-widget](https://github.com/dsrkafuu/sakana-widget)，更早的原型是 [itorr/sakana](https://github.com/itorr/sakana)，也就是那个「石蒜模拟器」。既然本站左侧已经有宠物了，右侧放一只立牌正好——一左一右，互不打扰。

## 一、先看清它有多大、尺寸怎么算

| 项 | 值 |
| :--- | :--- |
| SDK | 单文件 all-in-one UMD，**87 KB**（89,208 字节） |
| 外部请求 | **零**——CSS 内联、两个内置角色图以 base64 内联 |
| 内置角色 | `chisato`（千束）/ `takina`（泷奈） |
| 依赖 | 无，不依赖任何框架 |
| 许可 | 代码 MIT，角色插画**不可商用**（副本归一在 `public/lib/LICENSE-sakana-widget.txt`） |

这种「一个文件丢进去就能用」的形态很适合博客：不必引 CDN、不必配构建、不会在打包时把依赖图搅乱。

理解它的关键是**尺寸链**。整个 SDK 对外只有一个 `size` 参数，其余全是推导出来的：

```js
_updateSize(e) {
  this._imageSize  = e / 1.25;   // 人物立牌图
  this._canvasSize = e * 1.5;    // 杆子与摆动挂点所在的 canvas
  this._domApp.style.width  = `${e}px`;
  this._domApp.style.height = `${e}px`;
}
```

`size = 200` 时：人物图 160px、canvas 300px、外层盒子 200px。canvas 比盒子还大，是因为杆子和摇摆的挂点需要伸出盒外——**那个 200px 的盒子不是它的视觉大小**。

摇幅同样是推出来的：

```js
_updateLimit(e) {
  let t = e / 5;
  if (t < 30) t = 30; else if (t > 60) t = 60;
  this._limit = { maxR: t, maxY: e / 4, minY: -e / 4 };
}
```

即 `maxR = clamp(size / 5, 30, 60)`。记住这行，第五节会用到。

| size | 人物图 | canvas | 摇幅上限 `maxR` |
| :--- | :--- | :--- | :--- |
| 120 | 96 | 180 | 30°（撞下限） |
| 160 | 128 | 240 | 32° |
| **200** | **160** | **300** | **40°** |

## 二、挂载：沿用桌面宠物那一套

配置收在 `src/config.ts` 的 `sakanaConfig`，客户端脚本在 `src/layouts/Layout.astro` 末尾。三件事和宠物完全同构：

1. **宿主挂在 Swup 容器之外**——`#sakana-host` 直接放 body，不放进 `main`，切页时就不会被连根换掉；
2. **单例守卫**——`window.__sakanaBooted` 兜住，防止 Swup 更新 head 时重跑脚本、挂出第二只；
3. **延迟下发**——`load` 之后交给 `requestIdleCallback`，87 KB 不与首屏抢带宽。

但 SDK 有一个特性让「宿主」这件事比宠物麻烦一点：

```js
// mount(host) 内部
const r = host.cloneNode(false);
r.appendChild(this._domWrapper);
host.replaceChild(r, host);   // 宿主元素被换掉了
```

**`mount()` 会把宿主元素克隆一份替换掉**。也就是说 `mount` 之后，你手上的那个引用已经不是页面上那个节点了。所以后面所有取宿主的操作都不能缓存引用，只能按 id 重新取：

```ts
function getHost() {
  // mount() 会把宿主替换成克隆体，所以每次都要重新取
  return document.getElementById("sakana-host");
}
```

好消息是克隆体继承 inline style，所以挂载前设好的宽高与层级不会丢。

另外宿主必须是**有确定尺寸的 BFC**——`autoFit` 靠 `ResizeObserver` 量它的尺寸反推 `size`，量不到就没有正确的尺寸。所以宽高由脚本按配置注入：

```ts
const px = sk.size;
host.style.width = `${px}px`;
host.style.height = `${px}px`;
host.style.zIndex = String(sk.zIndex);
```

## 三、四处站内适配

SDK 的默认值这次我基本照抄（与参考站一致），只动了几处站内必须动的：

| # | 上游默认 | 本站 | 为什么 |
| :--- | :--- | :--- | :--- |
| 1 | 不管宿主层级 | `z-index: 40` | 与桌面宠物同层，低于工具栏 50、抽屉 60 |
| 2 | 宿主整块可点 | `pointer-events: none` | 否则卸载后这个 fixed 空盒会挡住右下角一片点击 |
| 3 | 占满右下角 | 工具栏上抬 `15rem` | 挂件 200px + 1rem 边距 = 13.5rem，再留 1.5rem 间隙 |
| 4 | 关闭 = `unmount()` | 加一个收尾钩子 | 卸载后撤掉 `data-sakana`，工具栏回原位 |
| 5 | 所有视口都加载 | `<768px` 不加载 | 与宠物保持一致 |

**第 2 条容易被忽略**。宿主是个 `position: fixed` 的 200×200 盒子，即便挂件已经被关掉，盒子还在那里；不设 `pointer-events: none`，它就会静静地吃掉右下角的点击。而挂件自身（立牌、控制栏）在 SDK 里本来就设了 `pointer-events: auto`，所以不会有副作用。

**第 3 条**：这块空间是被挂件实打实占掉的，所以工具栏上抬规则只在挂件**真的出现**时生效：

```css
html[data-sakana="on"] .floating-toolbar-wrapper {
  bottom: 15rem;
}
```

`data-sakana` 这个属性由脚本断言——配置里关掉、窄屏不加载、或者用户自己点了关闭按钮，它都会被撤掉，工具栏随即回到原位。这样就不会出现「关掉挂件后工具栏孤零零悬在半空」的怪状态。

**第 4 条**：上游点关闭按钮的行为是 `unmount()`，也就是彻底移除。我不去改 SDK 的行为，只加收尾——卸载后清掉 `window.sakanaWidget`、撤掉 `data-sakana`：

```ts
closeBtn.addEventListener("click", () => {
  requestAnimationFrame(() => {
    if (!getHost()?.querySelector(".sakana-widget-wrapper")) {
      (window as any).sakanaWidget = null;
      syncToolbarLift();
    }
  });
});
```

`requestAnimationFrame` 是等 SDK 的卸载逻辑跑完再判断，不然会读到卸载前的 DOM。

## 四、那个坑：切页之后，人物没了，只剩一根杆子

这是全篇唯一真正花时间的地方。

### 症状

点任意文章链接进入新页面，右下角就变成这样：**杆子还在，人不见了**。刷新一下又好了，再点一次文章又没了——非常有规律的"只在切页发作"。

### 先分清哪部分是谁画的

| 部分 | 谁画的 | 丢了 CSS 会怎样 |
| :--- | :--- | :--- |
| 人物立牌 | `.sakana-widget-img` 的 `background` | 图直接没了 |
| 杆子、摆动挂点 | canvas `drawImage` 画的 | 完全不受影响 |

所以「只剩杆子」这个现象本身就在指路：**canvas 活着，CSS 死了**。

把那条关键规则从 SDK 产物里读出来，是这样：

```css
.sakana-widget-img {
  background: 50%/cover no-repeat;
  pointer-events: auto;
  cursor: move;
}
```

`background: 50%/cover` 里，`50%` 是 `background-position`（居中），`/cover` 是 `background-size`（铺满）。两个都不能丢：角色图是一张竖长条插画，靠 `cover` 撑满盒子、靠居中把角色摆在正中间。

这条规则一丢，浏览器就退回默认值——`background-position: 0% 0%`、`background-size: auto`。于是图片**按原始像素从左上角开始铺**，而 128px 那个小盒子里截到的正好是插画左上角几乎全透明的区域。人就这么没了。

### 规则为什么会被删

SDK 那套 CSS 不是写在某个 `.css` 文件里的，而是在**模块顶层**执行时动态注入的：

```js
document.head.appendChild(styleElement);   // 注入一次，永不重注
```

而本站 Swup 开了 `updateHead: true`。`@swup/head-plugin` 每次切页都会比对两份 head，把当前 head 里**「新页面 head 中不存在」**的节点直接删掉，只放过 `title` 与带 `data-swup-theme` 标记的元素。

SDK 注入的那个 `<style>` 是纯运行时产物，服务端渲染出来的新页面里当然没有它 → 被判定为"旧节点" → 删除。而 SDK 自己认为"注入过一次就够了"，不会补第二次 → 样式永久丢失。

这也解释了为什么**只有切页会触发**：整页刷新是重建整个文档，SDK 会重新注入一遍，所以看起来一切正常。

### 修法：两道保险

**① 打标记，让它根本不被删。** 找到那个 `<style>`，打上 `data-swup-theme`，head-plugin 就会放过它。

**② 留引用，万一真被删了再挂回去。**

```ts
function captureSdkStyle() {
  const w = window as any;
  if (w.__sakanaStyleEl && document.head.contains(w.__sakanaStyleEl)) return;
  const found = Array.from(document.head.querySelectorAll("style")).find((el) =>
    (el.textContent || "").includes("sakana-widget-wrapper"),
  );
  if (found) {
    found.setAttribute("data-swup-theme", "sakana-widget");
    w.__sakanaStyleEl = found;
  }
}

function restoreSdkStyle() {
  const w = window as any;
  if (!w.__sakanaStyleEl) { captureSdkStyle(); return; }
  if (!document.head.contains(w.__sakanaStyleEl)) document.head.appendChild(w.__sakanaStyleEl);
}
```

然后挂到切页事件上，和其它状态断言一起跑：

```ts
document.addEventListener("swup:page:view", () => {
  applyHostBox();
  syncToolbarLift();
  restoreSdkStyle();
});
```

为什么两道都要：打标记是**不删**，最干净——节点根本不出 DOM，连样式重算都省了；兜底重挂是**删了也能活**。前者应对正常情况，后者应对"将来 head-plugin 策略变了"或者标记被别的脚本冲掉。挂件这种小东西，多一层保险的代价几乎为零。

### 一个反直觉的点：引用必须挂 `window`

第一版我把 `__sakanaStyleEl` 写成了模块级的 `let`，逻辑上毫无毛病：捕获时赋值、切页时读。

但有个陷阱——本站的脚本是 module 类型，Swup 更新 head 的过程中，head 里那个 `<script type="module">` 会被换成新的并重新执行，**模块级变量随之被重新初始化成 `null`**。于是那个"待恢复的引用"自己先没了，第二道保险形同虚设。

```ts
// ❌ let styleEl = null;      —— 脚本被重跑后归零
// ✅ window.__sakanaStyleEl   —— 跨越脚本重跑保留
```

凡是需要跨 Swup 切页存活的运行时状态，都别放模块变量里——这是这次最值钱的一条经验。

## 五、关于手感：我差点把摇晃调没

上面说 SDK 默认值我基本照抄，但中间走过一段弯路，值得记一笔。

第一版我担心"挂件会不会挡住正文"，自作主张加了矮屏降级：屏幕矮的时候把 size 压到 120。结果——**摇晃变得非常生硬**，像是被硬掰过去的。

道理就在第一节那行公式里：

| size | `maxR` |
| :--- | :--- |
| 120 | 30°（**正好撞上下限**） |
| 160 | 32° |
| 200 | 40° |

`maxR = clamp(size / 5, 30, 60)`，30 是**下限**。size 120 算出来是 24°，被钳回 30°——也就是说在这个尺寸下，你**没法让它摇得更轻**，只能摇 30°，而相对这么小的立牌，30° 的摆幅看着就是在"甩"。我原本以为"挂件小一点、动作收敛一点"，实际是反的。

改法只有一句：**把矮屏降级删掉，统一 200**，同时删掉所有对物理参数的覆盖，全走默认。参考站用的就是这个尺寸，摇晃幅度也就是那个感觉。

结论：**想改手感就调 `size`，别去动别的**——摆幅上限、纵向行程（`maxY = size / 4`）全都是它的派生量。

## 小结

- **87 KB 自包含**，一个文件丢进 `public/lib/` 就能用，零外部请求，不碰构建链；
- **挂载策略与桌面宠物同构**：宿主在 Swup 容器外、单例守卫、延迟下发。外加一个 SDK 细节——`mount()` 会 `cloneNode` 换掉宿主，所以宿主只能按 id 重新取；
- **真正的坎是一个只在切页发作的 bug**：SDK 运行时注入 `<head>` 的 `<style>` 会被 `@swup/head-plugin` 当作"新页面没有的节点"删掉，`.sakana-widget-img` 的 `background: 50%/cover` 退回默认，人物图按原始像素从左上角裁进 128px 盒子——正好是透明区。修法是打 `data-swup-theme` 免删标记 + 切页兜底重挂，而引用的存放位置必须能跨脚本重跑，**挂 `window`，不能挂模块变量**；
- **手感只调 `size`**：摆幅上限和纵向行程都是它的派生量，而 30° 是硬下限，尺寸压得太小反而摇得更凶。

回头看，这两次挂件落地（[桌面宠物](/posts/fuwari-desktop-pet/)、石蒜立牌）踩的其实是同一类坑：**这些 SDK 是给"整页刷新"的传统网页写的，而本站是 Swup 驱动的单页应用**。宠物那次是宿主元素被换掉，这次是运行时样式被删掉。以后再引入任何第三方挂件，第一件事都该问一句：**它有没有在运行时往 `<head>` 里塞东西？**

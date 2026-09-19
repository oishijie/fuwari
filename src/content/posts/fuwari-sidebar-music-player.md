---
title: 'Fuwari 博客魔改计划：把音乐播放器放进悬浮工具栏'
published: 2026-07-29
updated: 2026-09-19
description: '参考站右侧工具栏最底下藏着一个完整的音乐控制中心。摸清它的实现（自研 store，不是 APlayer）、实测第三方 Meting 链路是否还活着之后，本站用零依赖的方式复刻了一遍——顺便记下六个只有踩过才知道的坑。'
image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - Fuwari
  - Astro
  - 音乐播放器
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 0
---

## 起因

逛到 [v-blog.halei0v0.top](https://v-blog.halei0v0.top/) 时注意到它右侧悬浮工具栏最底下多了一个音符按钮，点开是一个完整的播放面板：封面、曲名、进度条、播放控制、音量、播放列表，全挤在一个 320px 宽的浮层里。

本站的悬浮工具栏已经有五个按钮——回顶部、回主页、随机一篇、显示目录、跳评论区。这一条本来就是放「全局工具」的地方：常驻可见、不占正文宽度、不跟内容抢位置。再塞一个音符进去，比在侧边栏或页面角落另起一块更合拍。

> 这篇的标题原本写的是「侧边栏音乐播放器卡片」，那是最初的设想。真做下来才发现侧边栏是根 sticky 长条：卡片要跟距离卡、分类、标签抢纵向空间，滚动时还容易被推出视口，而播放器恰恰需要「一直在手边」。位置换成了悬浮工具栏，文章也跟着重写。

## 一、先摸清参考站是怎么做的

抓它的归档页 HTML，能看到两个 Svelte 岛：`MusicPlayer`（面板）和 `MusicFabButton`（入口按钮），状态集中在一个 `musicPlayerStore` 里。

| 项 | 值 |
| :--- | :--- |
| 实现 | Svelte 岛 `MusicPlayer` + `MusicFabButton`，状态在 `musicPlayerStore` |
| 是否用 APlayer | **没有**。自研 store，不引 APlayer / MetingJS |
| 配置来源 | 页面内联的 `window.siteConfig` |
| 取源 | Meting API（第三方代理） |
| 它自带的备用 API | `bilibili.uno` —— 实测**已挂** |

这里有个常见误会值得先拆掉：网上的 Fuwari 音乐播放器教程（包括这篇文章最初的版本）大多走 APlayer + MetingJS 那条路，但参考站用的是自研实现。两者差别不小——APlayer 是一整套带皮肤的播放器，塞进一个 320px 的浮层里要先想办法压掉它自带的样式；自研则是一切从零写，但每个像素和每个事件都在自己手里。

在决定照做之前，先实测这条链路到底还活不活着——这一步比什么都重要，因为第三方 API 挂掉是常态：

| 检查项 | 实测结果 |
| :--- | :--- |
| 歌单 API | HTTP **200**，返回 **12 首** |
| 返回字段 | `title` / `author` / `pic` / `url` / `lrc` |
| 音频直链 | HTTP **206**，`content-type: audio/mpeg` |
| 可播率 | **11 / 12**（有一首拉不到字节） |
| CORS | API 与音频直链都带 `access-control-allow-origin: *` |

`206` 意味着音频直链支持 Range 请求，进度条拖拽、断点续传都成立；`*` 意味着浏览器能直连，不需要自己再搭一层代理。链路可用，方案成立。

于是本站的取舍是：**照参考站的思路自己做，但不引任何播放器库**——零新依赖，一个音符按钮、一个面板、一份配置。

## 二、三个文件，零新依赖

| 文件 | 职责 |
| :--- | :--- |
| `src/types/config.ts` | 新增 `MusicConfig` / `MusicTrack` / `MusicSourceMode` |
| `src/config.ts` | 新增 `musicConfig`，换歌单只动这里 |
| `src/components/control/BackToTop.astro` | 按钮 + 面板 + 样式 + 内联脚本 |

按本站的惯例，配置一律集中在 `config.ts`，组件里不写死任何东西：

```ts title="src/config.ts"
export const musicConfig: MusicConfig = {
	enable: true,
	mode: "meting", // meting = 走第三方 API；local = 用下面的本地曲目表
	metingApi: "https://meting.mysqil.com/api?server=:server&type=:type&id=:id&auth=:auth&r=:r",
	id: "14164869977", // 网易云歌单 id：music.163.com 地址里 playlist?id= 后面那串
	server: "netease", // netease / tencent / kugou / xiami / baidu
	type: "playlist", // playlist / album / song / artist / search
	localPlaylist: [],
	volume: 0.7, // 初始音量；访客调过之后以 localStorage 为准
	autoplay: false, // 自动播放多半会被浏览器拦，被拦后等首次点击补播
};
```

API 模板里的 `:server` / `:type` / `:id` / `:auth` / `:r` 是占位符，运行时替换；`config.enable` 为 `false` 时，按钮与面板都不渲染，内联脚本也随之不启动——等于整套功能一起关掉。

## 三、结构：一个按钮、两个视图

按钮落在工具栏的**最底端**（跳评论区之下），和参考站的位置一致：

```astro title="src/components/control/BackToTop.astro"
{music && (
    <div id="music-fab-btn" class="toolbar-btn music-fab"
        data-music-config={JSON.stringify(music)}
        role="button" tabindex="0" aria-label="打开音乐控制中心" aria-expanded="false">
        <span class="music-fab__icon">
            <Icon name="material-symbols:music-note-rounded" class="music-fab__note" />
            <span class="music-fab__spinner" aria-hidden="true"></span>
        </span>
        <span class="music-fab__dot" aria-hidden="true"></span>
    </div>
)}
```

面板内部是**两个互斥的视图**——播放视图和播放列表视图，同一时刻只显示一个。这一点和参考站不同，第四节会说明原因。

图标切换没有一行 JS：脚本只在面板根节点上改 `data-*` 属性，显示哪个图标交给 CSS：

```css
/* 播放态：暂停图标 ↔ 播放图标 */
.music-panel[data-playing="1"] .mf-when-paused  { display: none; }
.music-panel[data-playing="1"] .mf-when-playing { display: block; }

/* 循环模式：关 / 列表 / 单曲，三个图标按 data-repeat 切换 */
.music-panel[data-repeat="1"] .mf-repeat-list,
.music-panel[data-repeat="2"] .mf-repeat-one { display: none; }

/* 音量：高 / 低 / 静音，按 data-vol 切换 */
.music-panel[data-vol="off"] .mf-vol-high,
.music-panel[data-vol="off"] .mf-vol-low { display: none; }
```

这样做的好处是状态与外观彻底解耦：脚本里只需要 `panel.setAttribute('data-vol', 'off')`，不必记着去哪几个地方换 `<Icon>`。

## 四、六个坑

### 1. `is:raw is:inline` 不能配 `define:vars`

配置要从服务端传到内联脚本。按常规写法应该用 `define:vars`，但 `is:raw` 会让 Astro 完全不处理脚本内容，两者一起用直接报错。最终走属性注入：

```astro
<!-- 内联脚本读这个属性，浏览器会自动解码实体 -->
<div id="music-fab-btn" data-music-config={JSON.stringify(music)} ...>
```

### 2. 面板位置必须按**按钮**自己的 rect 算

这是本次唯一一个需要回头改的地方。最初面板底边是**对齐整条工具栏顶端**的，看起来也说得通，实际会被顶得很远：

| 项 | 高度 |
| :--- | :--- |
| 工具栏 6 个按钮（44px × 6 + 12px 间隙 × 5） | 324 px |
| 石蒜挂件把整条工具栏上抬 `bottom: 15rem` | 240 px |
| 面板与工具栏之间预留的间距 | 12 px |
| **面板底边离屏幕底** | **约 576 px** |

面板直接被推到视口上半部，离最底下那个音符按钮隔着整条工具栏。改成读按钮自己的 rect 就正常了：

```js
function positionPanel() {
    var panel = $('music-panel');
    var btn = $('music-fab-btn');
    var anchor = btn && btn.getBoundingClientRect();
    // 按钮缺失或未布局（rect 全 0）时回退到整条工具栏
    if (!anchor || !anchor.width || !anchor.bottom) anchor = bar.getBoundingClientRect();

    var gap = 12;
    var w = panel.offsetWidth || 320;

    // 水平：面板右边缘落在按钮左侧 gap 处；左侧不够就贴视口左边 8px
    panel.style.left = Math.max(8, anchor.left - gap - w) + 'px';
    panel.style.right = 'auto';
    // 垂直：面板底边与按钮底边齐平
    panel.style.bottom = Math.max(8, window.innerHeight - anchor.bottom) + 'px';
    // 高度：上限是按钮底边以上的空间，超出时面板内部滚动
    panel.style.maxHeight = Math.max(220, anchor.bottom - gap * 2) + 'px';
}
```

顺带一提，参考站其实**也是顶端对齐**——它有个零尺寸的 anchor 元素，用 `--fab-visible-count` 动态算高度。只是它按钮少、又没有别的挂件把工具栏抬起来，所以看不太出来。位置计算的坑，往往要等自己的页面长出足够多的元素才会暴露。

### 3. `innerHTML` 生成的内容吃不到 Astro 的样式隔离

Astro 的 `<style>` 是 scoped 的：编译时给模板里的元素加上 `astro-xxxx` 属性，选择器也跟着改写。播放列表的每一项是脚本用 `innerHTML` 拼出来的，**元素上没有这个属性**，scoped 选择器全部失配——而且是静默失配，样式表看着没问题，页面就是不生效。解法是在组件里显式写 `:global()`，再用 `#music-list` 限定作用域：

```css
/* 列表项由脚本 innerHTML 生成，元素上没有 Astro 的 scope 属性 */
:global(#music-list .music-item) {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
}
:global(#music-list .music-item.is-active) {
    background: var(--btn-regular-bg);
}
```

### 4. 曲名来自第三方 API，进 `innerHTML` 前必须转义

歌单的曲名、艺术家名都是外部数据，直接拼进 `innerHTML` 等于把站点的 DOM 交给别人。统一过一遍转义函数：

```js
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

同一条要求也适用于封面地址、`title` 属性、`data-*` 值——凡是来自 API 的字符串，进 DOM 之前都过一次。

### 5. 图标名要先核对

Material Symbols 里不是每个图标都有 `-rounded` 变体，写错了构建期就报错。本站用的这一批都在：

| 用途 | 图标名 |
| :--- | :--- |
| 入口按钮 / 封面占位 | `music-note-rounded` |
| 播放 / 暂停 | `play-arrow-rounded` / `pause-rounded` |
| 上一首 / 下一首 | `skip-previous-rounded` / `skip-next-rounded` |
| 随机 / 循环 / 单曲循环 | `shuffle-rounded` / `repeat-rounded` / `repeat-one-rounded` |
| 播放列表 | `queue-music-rounded` |
| 音量高 / 低 / 静音 | `volume-up-rounded` / `volume-down-rounded` / `volume-off-rounded` |
| 收起 | `expand-more-rounded` |

### 6. 第三方 API 会挂，降级要提前想好

参考站配置里那个备用 API 已经失效，这就是提醒。本站的处理是：加载失败时面板顶部出现一条提示（「歌单加载失败，稍后再试」），播放列表里显示空状态，按钮上的 spinner 停下——而不是留一个转不完的圈。

同时，这个提示做成了**面板内的一条横幅**，而不是独立的 toast：面板没打开时不打扰用户，打开时又一定在视线里。

## 五、音频为什么挂在 `window` 上、还不进 DOM

这是整套实现里最容易做错、又最不容易发现的一处。

`BackToTop.astro` 整体在 Swup 容器**之外**，所以切页时工具栏本身不会被替换——音乐不会因为换页而中断。但内联脚本会随着新页面重新执行，于是：

```js
// 单例：脚本每次重跑都拿同一个 audio，不会被重建
var audio = window.__musicFabAudio || (window.__musicFabAudio = new Audio());
```

如果写成模块级的 `var audio = new Audio()`，切页时脚本重跑会新建一个 `Audio`，旧的那个还挂在内存里继续出声——症状是「切了几页之后开始有回音」。挂在 `window` 上则始终是同一个实例。

另外，这个 `audio` **不插入 DOM**。`new Audio()` 本身就是 `HTMLAudioElement`，不挂到文档里也能播；插进 DOM 反而会跟着容器一起被 Swup 替换掉，音乐就断了。

## 六、和参考站的三处不同

| 项 | 参考站 | 本站 |
| :--- | :--- | :--- |
| 「上一首」 | 直接切上一曲 | 已播 **> 3 秒**时先回到本曲开头（主流播放器行为），再按才切歌 |
| 播放列表 | 独立浮层叠在播放面板之上 | 与播放面板**互斥切换**（同一浮层换内容）——本站工具栏 6 个按钮加上石蒜上抬，叠两个浮层会被顶出屏幕 |
| 加载提示 | 独立 toast | 面板内的提示条，面板没打开时不打扰 |

## 七、想改就改这几处

- **换歌单**：只改 `musicConfig.id`（以及 `server` / `type`）。
- **换成自己的音频**：把 `mode` 改成 `"local"`，按 `MusicTrack` 的字段往 `localPlaylist` 里填曲目，音频和封面放进 `public/`。这条路径完全不依赖第三方 API。
- **换 Meting 服务**：改 `metingApi` 模板即可，占位符保持原样。
- **不要这个功能**：`musicConfig.enable` 设为 `false`，按钮、面板、内联脚本一起消失。

## 结语

比起装一个播放器库再想办法把它压进 320px 的浮层，这种「自己写一个单例」的路子反而更省事：没有额外依赖、没有要覆盖的皮肤、每个交互都在自己手里。代价是那些琐碎的细节——属性注入、定位参照物、样式隔离、转义、单例——都得自己过一遍。

也正因为如此，那个「面板底边离屏幕底 576px」的表格才值得记下来：不是算错了，而是**参照物选错了**。

---

## 参考与致谢

- **参考实现**：[v-blog.halei0v0.top](https://v-blog.halei0v0.top/) 的悬浮工具栏音乐播放器
- **数据服务**：Meting API（第三方代理，随时可能失效）

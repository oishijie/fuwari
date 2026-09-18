---
title: 给博客加一张「AI 参与程度」标示卡
published: 2026-09-17
description: 起因是在别人的 Firefly 博客里看到文末一张「AI 参与程度」卡片，顺手把它复刻进自己的 Fuwari。从抓源码、还原结构、补齐多语言，到把卡片挪到 CC 版权之上——一篇完整的实操记录。
image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=1200&h=800&auto=format&fit=crop'
tags:
  - Fuwari
  - 组件复刻
  - i18n
category: 博客魔改
---

## 起因：一张文末小卡片

前两天刷到一篇博客（[blog.7003410.xyz](https://blog.7003410.xyz/posts/telecomadmin/)），文章末尾有一张不起眼的小卡片：一个机器人图标，写着「AI 参与程度」，下面三个档位（润色 / 完全 / 不使用），再底下一条细进度条。

第一反应是：这东西轻量、诚实、还带点自黑幽默——现在写东西多少都沾点 AI，把它摆出来比写"本文纯人工"更有可信度。本站（Fuwari）没有现成组件，那就自己复刻一个。

## 一、先搞清楚它到底是什么
一顿折腾发现结构是 Tailwind 写的：一个外层圆角卡片，里面分两行——

- 第一行：机器人图标 + 「AI 参与程度」文字 + 三个 pill 状 chip（当前档位高亮）；
- 第二行：一条 `h-1.5` 的细进度条，按档位填不同宽度和颜色。


## 二、复刻卡片本体

我把它做成 **`src/components/misc/AIInvolvement.astro`**，关键决定有三个：

**1. 纯静态、零客户端脚本。** 它只是展示一张声明卡，不需要任何交互，所以不放 `<script>`。这有个隐藏好处：本站全局启用 Swup 做页面过渡，容器外的元素切页不重建，但任何带客户端脚本的新组件都得手动挂 `astro:page-load` 重跑——静态卡片直接免掉这层麻烦。

**2. 图标内联 mdi path，不新增图标依赖。** 项目只装了 `fa6-*` 和 `material-symbols` 两套 `@iconify-json`，而原站用的是 `mdi:robot-outline`。为了 100% 保真又不给 `package.json` 加一套图标集，直接把那段 SVG path 内联进组件：

```astro
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5 text-[var(--primary)]">
  <path fill="currentColor" d="M19 13a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3a2 2 0 0 0 0 4h1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 0-4M7 9a2 2 0 1 1 2 2a2 2 0 0 1-2-2m10 0a2 2 0 1 1 2 2a2 2 0 0 1-2-2" />
</svg>
```

**3. 三档状态集中在一张表里**，方便以后改配色：

```ts
const LEVELS = {
  none:   { label: i18n(I18nKey.aiLevelNone),  chip: "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60", bar: "w-0 bg-black/30 dark:bg-white/30" },
  polish: { label: i18n(I18nKey.aiLevelPolish), chip: "bg-green-500/15 text-green-600 dark:text-green-400",          bar: "w-1/3 bg-green-500" },
  full:   { label: i18n(I18nKey.aiLevelFull),   chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",          bar: "w-full bg-amber-500" },
};
```

其中三档视觉是这么定的（**`polish` 绿 + 1/3 进度条与原站截图完全一致**；`full` 琥珀 + 满格、`none` 灰 + 空条是原站无样本时我按语义补的）：

- `none` 不使用 → 灰色，进度条 `w-0`
- `polish` 润色 → 绿色，进度条 `w-1/3`
- `full` 完全 → 琥珀色，进度条 `w-full`

## 三、接入配置体系

一个正经组件不能硬编码开关，得走本站统一的 `config.ts` 体系。改动四处：

**1. 类型**（`src/types/config.ts`）：

```ts
export type AIInvolvementLevel = "none" | "polish" | "full";

export type AIInvolvementConfig = {
  enable: boolean;
  defaultLevel: AIInvolvementLevel;
};
```

**2. 站点配置**（`src/config.ts`）：

```ts
export const aiInvolvementConfig: AIInvolvementConfig = {
  enable: true,
  defaultLevel: "polish",
};
```

`defaultLevel` 是全站默认档，文章没写 `aiLevel` 时取它。

**3. 文章 frontmatter schema**（`src/content/config.ts`）：

```ts
aiLevel: z.enum(["none", "polish", "full"]).optional(),
```

**4. 用法**就这么一行，写在文章头部：

```yaml
---
title: 某篇文章
aiLevel: polish   # 不写就取 config 里的 defaultLevel
---
```

## 四、多语言是最容易翻车的一步

本站 `i18n` 的 `Translation` 类型是 `{ [K in I18nKey]: string }`——**少一个 key 全站类型直接报错**。卡片要 4 个新 key（标题 + 三档文案），而语言文件有 **10 个**，得逐个补齐。

先给 `i18nKey.ts` 加 key：

```ts
aiInvolvement = "aiInvolvement",
aiLevelPolish = "aiLevelPolish",
aiLevelFull = "aiLevelFull",
aiLevelNone = "aiLevelNone",
```


## 五、挂到文章页

最初挂在 **CC 版权卡片之后、评论之前**（`src/pages/posts/[...slug].astro`）：

```astro
{licenseConfig.enable && <License ... />}
{aiInvolvementConfig.enable && <AIInvolvement level={entry.data.aiLevel ?? aiInvolvementConfig.defaultLevel} class="mb-6 onload-animation" />}
{!entry.data.password && <Comments />}
```

头脑风暴过后，感觉「这篇文章有多少 AI 参与」应该压在正文和 CC 之间

```astro
{aiInvolvementConfig.enable && <AIInvolvement ... />}
{licenseConfig.enable && <License ... />}
```

这里有个坑：本站的 License 卡片**分叉在加密 / 非加密两个分支里**——加密文章的 License 写在 `<EncryptedPost>` 内部，会随正文一起被加密。所以卡片没法在分支外统一挂（那样只能是「正文之前」或「CC 之后」），必须**各插一份进分支**：

- 非加密分支：`class="mb-6 onload-animation"`，正常显示；
- 加密分支：`class="mb-6"`，**随正文一起被加密**，访客解锁后才出现在 CC 卡片上方。


## 小结

最终成果是一个 30 来行、零依赖、零客户端脚本的静态组件，挂在每篇文章末尾，由 `aiLevel` 字段控制档位，全站默认「润色」。它不解决任何技术问题，只是替作者把「这篇有多少 AI 味」摊开来讲清楚——比起写一句空洞的「本文纯人工」，这种带档位和进度条的自白，反而更让人愿意信。

（`AIInvolvement.astro` 里 `LEVELS` 数组集中了三档配色，想换风格改一处就行。）

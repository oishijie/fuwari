---
title: 转载｜Astro 博客接入 Live2D 看板娘：与本站取舍对比
published: 2026-09-13
category: 博客魔改
tags:
  - Live2D
  - 看板娘
  - 客户端渲染
---

> **转载声明**：本文主体整理自白咲雫《在 Astro 博客实现 Live2D 看板娘》（2026-05-20，<https://blog.cuteleaf.cn/posts/dev-notes/astro-live2d-mascot/>），原文采用 **CC BY-NC-SA 4.0** 许可。此处为学习目的作中文整理与二次评注，**非逐字翻译**；库名、配置项、代码片段均引自原文。文中「本站 / 留心博客」指笔者自己的部署，与原文方案并列对照。**本文只做记录，看板娘功能暂不落地。**

---

又一篇 cuteleaf 的 Firefly 主题魔改——看板娘（Live2D）。和上一篇推荐算法不同，这次是纯粹的**重客户端 WebGL 组件**，和本站「轻量、零运行时优先」的取向有张力。但文章里几个工程细节（data 属性透传配置、swup 场景下的初始化时机）值得边记边比对。

## 一、为什么是 l2d-widget

传统 Live2D 集成要手引 Cubism SDK、写渲染逻辑、处理动画状态机，量大难维护。作者选的 `l2d-widget`（hacxy 维护）是个轻量封装：

- **开箱即用**：一个函数调用完成集成；
- **双版本支持**：兼容 Cubism 2（`.moc`）+ Cubism 4/6（`.moc3`）；
- **内置功能**：菜单、提示气泡、多模型切换、响应式；
- **体积小**：比自己打包 SDK 轻。

```
pnpm add l2d-widget
```

最简用法几行就出图：

```ts
import { createWidget } from "l2d-widget";

createWidget({
  model: { path: "/models/snow_miku/model.json" },
  position: "bottom-left",
  size: { width: 200, height: 200 },
});
```

## 二、Astro 集成：组件 + 客户端脚本

核心套路是把配置在前端 `frontmatter` 算好，用 `data-*` 属性透传到 HTML，再在 `<script>` 里读取初始化。注意 **Live2D 走 WebGL，必须在浏览器跑**，所以初始化逻辑只能放客户端脚本。

`Live2DWidget.astro` 的容器：

```astro
---
interface Props {
  config: {
    enable: boolean;
    model: { path: string; volume?: number; scale?: number; x?: number; y?: number }
      | { path: string; volume?: number; scale?: number; x?: number; y?: number }[];
    position?: "bottom-left" | "bottom-right";
    size?: number | { width: number; height: number };
    primaryColor?: string;
    transitionDuration?: number;
    transitionType?: "slide" | "fade";
    menus?: { items?: { icon?: string; label: string; action: string }[];
              extraItems?: { icon?: string; label: string; action: string }[];
              align?: "left" | "right" };
    tips?: { welcomeMessage?: string[]; messages?: string[]; duration?: number; interval?: number };
    responsive?: { hideOnMobile?: boolean; mobileBreakpoint?: number };
  };
}
const { config } = Astro.props;
const models = Array.isArray(config.model) ? config.model : [config.model];
const modelConfigs = models.map((m) => ({
  path: m.path,
  ...(m.volume !== undefined && { volume: m.volume }),
  ...(m.scale !== undefined && { scale: m.scale }),
  ...(m.x !== undefined && { x: m.x }),
  ...(m.y !== undefined && { y: m.y }),
}));
---
<div id="l2d-widget-container" style="position: fixed; z-index: 999;"
     data-models={JSON.stringify(modelConfigs)}
     data-position={config.position || "bottom-left"}
     data-size={JSON.stringify(config.size || 300)}
     data-primary-color={config.primaryColor || ""}
     data-tips={JSON.stringify(config.tips || {})}
     data-responsive={JSON.stringify(config.responsive || {})}></div>
```

客户端脚本（JSON 无法序列化函数，所以菜单动作走 **action 字符串 + 客户端映射**）：

```ts
import { createWidget } from "l2d-widget";

const menuActions = {
  home: () => (window.location.href = "/"),
  scrollToTop: () => window.scrollTo({ top: 0, behavior: "smooth" }),
  sleep: (widget) => widget.sleep(),
  github: () => window.open("https://github.com/your-repo", "_blank"),
};

function initWidget() {
  const container = document.getElementById("l2d-widget-container");
  if (!container) return;
  const models = JSON.parse(container.dataset.models || "[]");
  if (models.length === 0) return;
  createWidget({
    model: models.length === 1 ? models[0] : models,
    position: container.dataset.position || "bottom-left",
    size: JSON.parse(container.dataset.size || "300"),
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWidget);
} else {
  initWidget();
}
```

## 三、配置详解

- **模型**：`path` 指向 `public/` 下的 json；支持数组传多个模型，菜单里自动出现切换按钮。
- **菜单系统**：`menus.items` 用 `{ icon, label, action }`，`action` 是字符串，客户端映射到真实函数（JSON 不能传函数）。
- **提示气泡**：`tips.welcomeMessage` / `tips.messages` / `duration` / `interval`，循环播报。
- **主题色**：`primaryColor: "var(--primary)"` 可跟随主题色——这点本站也用同样的 `var(--primary)` 约定，完全一致。
- **入场动画**：`transitionDuration` + `transitionType: "slide" | "fade"`。
- **响应式**：`responsive: { hideOnMobile: true, mobileBreakpoint: 768 }` 移动端隐藏。

布局里用：`{live2dWidgetConfig.enable && <Live2DWidget config={live2dWidgetConfig} />}`。

注意事项：模型文件放 `public/`（路径以 `/` 开头）；Cubism 2 = `.json`+`.moc`，Cubism 6 = `.model3.json`+`.moc3`；渲染依赖 WebGL。

## 四、与本站取舍对比

| 维度 | 原文（Firefly） | 本站（留心博客） |
|---|---|---|
| 渲染栈 | Astro + l2d-widget（WebGL） | Astro 5 + Svelte 5 + Swup |
| 视觉密度 | 看板娘独立角落，工具栏轻 | 已有悬浮工具栏 + 侧栏签名卡，元素已多 |
| swup 兼容 | 未显式处理（Firefly 不一定用 swup） | **必须处理**：切页不重建布局外节点，`createWidget` 重复 init 会叠多个看板娘 |
| 静资源策略 | 模型放 `public/` | 一致；但本站铁律「别用外链图床」→ 模型必须本地，体积大（Live2D 模型常几 MB~几十 MB） |
| 主题色 | `var(--primary)` | 一致，可无缝跟随 |
| 移动端 | `hideOnMobile` 隐藏 | 本站移动端已收起侧栏/工具栏，看板娘同样应隐藏 |

几个本站要记的坑：

1. **swup 重复初始化**：原文本站化时，若组件挂在 `#top-row`/布局外、且客户端脚本每次 `DOMContentLoaded` 都跑 `createWidget`，swup 无刷新切页会不断叠加看板娘。正确做法是像本站加密文章那样，初始化走 `astro:page-load` 或 swup `page:view` 钩子做**幂等**（已存在一个就跳过 / 销毁重建），不能直接裸 `initWidget()`。
2. **模型体积**：Live2D 模型动辄十几 MB，全走 CF Pages 静态分发，每次访问都额外拉资源——和本站「轻量」取向冲突，需要权衡是否值得。
3. **与现有浮层协调**：本站右下角已有悬浮工具栏（回顶 / 主页 / 随机 / 目录 / 评论），看板娘默认也是右下/左下角，两者在桌面端会抢位，布局上要错开。

## 五、结语

l2d-widget 把 Live2D 集成压到了「一个函数调用」的复杂度，配置项也周全（多模型、菜单、气泡、主题色跟随、响应式）。但它是重客户端 WebGL 组件，和本站「能构建时算就不留客户端、静态优先」的取向有本质张力，且模型体积、swup 重复初始化、与现有浮层抢位这三道坎都得先想清楚。功能先不落地，等哪天想给站点加点生动感时，这篇的配置表可以直接照抄，只需额外补一段 swup 幂等初始化。

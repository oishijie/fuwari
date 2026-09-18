---
title: 转载｜Astro 框架 Fuwari 主题实现仿 hexo-abbrlink 功能
published: 2026-09-17
image: 'https://images.unsplash.com/photo-1704213176120-8d38fdbe4ffe?q=80&w=1200&h=800&auto=format&fit=crop'
category: 博客魔改
tags:
  - Astro
  - Fuwari
  - 短链
---

> **转载声明**：本文转载自辰渊尘《Astro框架Fuwari主题实现仿hexo-abbrlink功能》（2026-02-26，<https://blog.mcxiaochen.top/posts/p403bf94e/>），原文采用 **CC BY-NC-SA 4.0** 许可。正文与代码片段均引自原文，未作改写；标题与排版按本站规范略作调整。

---

> **修改前必读**
>
> 本帖基于 Astro 框架进行修改方案编写，因此请读者优先掌握 [Astro 官方文档](https://docs.astro.build/) 的内容后再来进行魔改。由于修改内容较多，可能引发意料之外的问题，推荐使用 GitHub 配合 VSCode 进行修改，方便随时备份恢复。

## 前言

好久没写文章都生疏了，好在这个框架上手挺快的，配合 AI 一下午就实现了短链的功能。代码拼拼改改，也不知道有没有隐藏的 bug，反正我用到现在一切正常，想给自己博客也加上的可以接着读下去。

## 解析

先来讲一下这到底是个什么东西。如果你不知道 hexo-abbrlink 的话——当然我也只是个草台班子，所以尽量讲得简单点。

默认情况下，Astro 生成文章链接通常会基于文件路径或 slug。例如你有一篇文章文件：

```text
src/content/blog/how-to-build.md
```

默认生成出来的访问地址是：

```text
/web/post/how-to-build/
```

这种链接可读性强，但有两个问题：

- 文件名一旦改动，会影响链接；
- 链接长度不固定，SEO 迁移时不够稳定。

而 hexo-abbrlink 的思路是：给每篇文章生成一个固定的短 ID 作为访问路径，以后不管文件名或者内容怎么改，链接都不变。

比如原本地址是：

```text
/web/post/how-to-build/
```

改造后变成：

```text
/web/post/p2wt8g7/
```

那么 `p2wt8g7` 就是这篇文章的唯一标识符。

### 生产力环境下

假设你写了一篇文章《Astro 框架 Fuwari 主题实现仿 hexo-abbrlink 功能》，然后文件名是：

```text
astro-fuwari-theme-implement-hexo-abbrlink-feature.md
```

那么访问地址就是：

```text
/web/post/astro-fuwari-theme-implement-hexo-abbrlink-feature/
```

问题就很明显了：

- 链接非常长；
- 分享时不好看；
- 以后如果你想简化文件名，路径就会变。

如果你后期重命名文件，改成：

```text
astro-abbrlink.md
```

那访问地址就会变成：

```text
/web/post/astro-abbrlink/
```

原来的链接：

```text
/web/post/astro-fuwari-theme-implement-hexo-abbrlink-feature/
```

就直接 404 了。如果已经被搜索引擎收录，或者别人引用过，就会造成失效链接。

### 引入 abbrlink 后的效果

构建时在 frontmatter 加入：

```yaml
abbrlink: p403bf94e
```

访问地址就会变成：

```text
/web/post/p403bf94e/
```

此时无论你修改标题、文件名、内容、标签、分类等，路径都不会变，这就是 abbrlink 的优势所在。

## 修改

那么废话说了那么多，相信你已经理解了 abbrlink 究竟是什么东西、有什么作用，接下来就是教程了。

### 安装依赖

我们需要一个生成哈希值的库，这里推荐使用 `crc-32`，它生成的 ID 简短且碰撞率低。

```bash
pnpm add crc-32
```

### 定义内容 Schema

在内容集合的 schema 里加上 `abbrlink` 字段：

```ts
tags: z.array(z.string()).optional().default([]),
category: z.string().optional().nullable().default(""),
lang: z.string().optional().default(""),
abbrlink: z.string(),

/* For internal use */
prevTitle: z.string().default(""),
```

### 编写自动生成脚本

为了不用手动去写那个复杂的 ID，我们可以写一个脚本，在开发或构建时自动扫描没有 abbrlink 的文章并为其生成。

创建 `scripts/generate-abbrlink.mjs`：

```js
import fs from "fs";
import path from "path";
import crc32 from "crc-32";

const POSTS_DIR = "./src/content/posts";

// 收集已有 abbrlink（用于冲突检测）
const usedAbbrlinks = new Set();

function walk(dir) {
  return fs.readdirSync(dir).flatMap(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return walk(fullPath);
    }
    return fullPath.endsWith(".md") ? [fullPath] : [];
  });
}

const files = walk(POSTS_DIR);

// 先扫描所有已有 abbrlink
for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(/abbrlink:\s*(\S+)/);
  if (match) {
    usedAbbrlinks.add(match[1]);
  }
}

// 开始处理
for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");

  if (content.includes("abbrlink:")) continue;

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    console.log(`跳过无 frontmatter 文件: ${file}`);
    continue;
  }

  // 生成唯一 hash
  let salt = 0;
  let hash;
  let finalAbbr;

  do {
    const base = path.basename(file) + (salt || "");
    hash = (crc32.str(base) >>> 0).toString(16);
    finalAbbr = "p" + hash;
    salt++;
  } while (usedAbbrlinks.has(finalAbbr));

  usedAbbrlinks.add(finalAbbr);

  const newFrontmatter = `---\n${match[1].trimEnd()}\nabbrlink: ${finalAbbr}\n---`;

  const newContent = content.replace(match[0], newFrontmatter);

  fs.writeFileSync(file, newContent);

  console.log(`Generated ${finalAbbr} for ${file}`);
}
```

然后在 `package.json` 中配置脚本，确保每次运行前都执行生成：

```json
"scripts": {
  "gen:abbr": "node scripts/generate-abbrlink.mjs",
  "dev": "pnpm gen:abbr && astro dev",
  "build": "pnpm gen:abbr && astro build"
}
```

### 修改路由逻辑

这是最关键的一步。我们需要让 Astro 使用 abbrlink 而不是文件名作为路由。

修改 `src/pages/posts/[...slug].astro`，把 `getStaticPaths` 改为读取 frontmatter 里的 `abbrlink`：

```js
export async function getStaticPaths() {
  const blogEntries = await getSortedPosts();
  return blogEntries.flatMap((entry) => {
    if (!entry.data.abbrlink) {
      throw new Error(`Post "${entry.id}" missing abbrlink`);
    }

    return [
      // 新短链
      {
        params: { slug: entry.data.abbrlink },
        props: { entry },
      },
    ];
  });
}
```

> **编者注**：原文此处把「修改前」和「修改后」两个 `return` 直接贴在了同一段代码里（`return blogEntries.map(...)` 之后紧跟第二个 `return`），后一个 `return` 永远不会执行。上面已按作者本意删去失效的那段。同理，原文中形如 `abbrlink: z.string()` 的 schema 在实际项目里通常写成带默认值的形式，否则老文章缺失该字段时校验会失败。

同一文件里，传给 License 组件的 slug 也要跟着改：

```astro
{licenseConfig.enable && <License title={entry.data.title} slug={entry.data.abbrlink || entry.slug} pubDate={entry.data.published} class="mb-6 rounded-xl license-container onload-animation"></License>}
```

其中 `entry.data.abbrlink || entry.slug` 是关键：老文章还没生成 abbrlink 时回退到原 slug，避免一次性全站断链。

---

**本站说明**：这篇仅作方案存档。目前本站文章仍使用语义化 slug（如 `/posts/fuwari-ai-summary-worker/`），配合 `public/_redirects` 维护历史链接的 301。abbrlink 的取舍权衡见文末附记。

> 原文作者：辰渊尘 · 原文链接：<https://blog.mcxiaochen.top/posts/p403bf94e/> · 许可：CC BY-NC-SA 4.0

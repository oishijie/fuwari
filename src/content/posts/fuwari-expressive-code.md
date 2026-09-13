---
title: Fuwari 博客魔改计划：如何使用 Expressive Code
published: 2026-08-05
description: 探索如何在 Markdown 中使用 Expressive Code 增强代码块显示效果。
image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Markdown', 'Expressive Code']
category: 博客魔改
draft: false
---

在这篇文章中，我们将探索如何使用 [Expressive Code](https://expressive-code.com/) 来增强 Markdown 中的代码块显示。以下示例基于官方文档，您可以查阅文档以获取更多详细信息。

## 1. 语法高亮 (Syntax Highlighting)

Expressive Code 提供了强大的[语法高亮](https://expressive-code.com/key-features/syntax-highlighting/)功能。

#### 常规语法高亮
```js
console.log('这段代码具有语法高亮！')
```

#### 渲染 ANSI 转义序列
```ansi
ANSI 颜色示例:
- 标准: [31m红色[0m [32m绿色[0m [33m黄色[0m [34m蓝色[0m [35m洋红[0m [36m青色[0m
- 加粗: [1;31m红色[0m [1;32m绿色[0m [1;33m黄色[0m [1;34m蓝色[0m [1;35m洋红[0m [1;36m青色[0m
- 变暗: [2;31m红色[0m [2;32m绿色[0m [2;33m黄色[0m [2;34m蓝色[0m [2;35m洋红[0m [2;36m青色[0m

256 色 (显示 160-177):
[38;5;160m160 [38;5;161m161 [38;5;162m162 [38;5;163m163 [38;5;164m164 [38;5;165m165[0m
[38;5;166m166 [38;5;167m167 [38;5;168m168 [38;5;169m169 [38;5;170m170 [38;5;171m171[0m
[38;5;172m172 [38;5;173m173 [38;5;174m174 [38;5;175m175 [38;5;176m176 [38;5;177m177[0m

全 RGB 颜色:
[38;2;34;139;34m森林绿 - RGB(34, 139, 34)[0m

文本格式: [1m加粗[0m [2m变暗[0m [3m斜体[0m [4m下划线[0m
```

## 2. 编辑器与终端外框 (Editor & Terminal Frames)

[编辑器与终端外框](https://expressive-code.com/key-features/frames/)

#### 代码编辑器外框
```markdown
```js title="my-test-file.js"
console.log('带有标题属性的示例')```
```markdown


```js title="my-test-file.js"
console.log('带有标题属性的示例')
```markdown

---

```
```html  <!-- src/content/index.html -->
<div>通过注释指定文件名的示例</div>```
```

```html title="src/content/index.html"
<!-- src/content/index.html -->
<div>通过注释指定文件名的示例</div>
```
---

#### 终端外框

```markdown
```bash
echo "这个终端外框没有标题"```
```markdown

```bash
echo "这个终端外框没有标题"
```markdown

---

```
```powershell title="PowerShell 终端示例"
Write-Output "这个带有一个标题！"```
```

```powershell title="PowerShell 终端示例"
Write-Output "这个带有一个标题！"
```

#### 覆盖外框类型

```markdown
```sh frame="none"
echo "看，没有任何外框！"```
```markdown

```sh frame="none"
echo "看，没有任何外框！"
```markdown

---

```
```ps frame="code" title="PowerShell Profile.ps1"
# 如果不手动覆盖，这通常会被自动识别为终端外框
function Watch-Tail { Get-Content -Tail 20 -Wait $args }
New-Alias tail Watch-Tail```
```

```ps frame="code" title="PowerShell Profile.ps1"
# 如果不手动覆盖，这通常会被自动识别为终端外框
function Watch-Tail { Get-Content -Tail 20 -Wait $args }
New-Alias tail Watch-Tail
```

## 3. 文本与行标记 (Text & Line Markers)

[文本与行标记](https://expressive-code.com/key-features/text-markers/)

#### 标记整行或行范围

```markdown
```js {1, 4, 7-8}
// 第 1 行 - 通过行号标记
// 第 2 行
// 第 3 行
// 第 4 行 - 通过行号标记
// 第 5 行
// 第 6 行
// 第 7 行 - 通过范围 "7-8" 标记
// 第 8 行 - 通过范围 "7-8" 标记```
```markdown

```js {1, 4, 7-8}
// 第 1 行 - 通过行号标记
// 第 2 行
// 第 3 行
// 第 4 行 - 通过行号标记
// 第 5 行
// 第 6 行
// 第 7 行 - 通过范围 "7-8" 标记
// 第 8 行 - 通过范围 "7-8" 标记
```markdown

#### 选择行标记类型 (mark, ins, del)

```
```js title="line-markers.js" del={2} ins={3-4} {6}
function demo() {
  console.log('这一行被标记为已删除')
  // 这一行和下一行被标记为已插入
  console.log('这是第二个插入行')

  return '这一行使用中性的默认标记类型'
}```
```

```js title="line-markers.js" del={2} ins={3-4} {6}
function demo() {
  console.log('这一行被标记为已删除')
  // 这一行和下一行被标记为已插入
  console.log('这是第二个插入行')

  return '这一行使用中性的默认标记类型'
}
```

#### 为行标记添加标签

```markdown
```jsx {"1":5} del={"2":7-8} ins={"3":10-12}
// labeled-line-markers.jsx
<button
  role="button"
  {...props}
  value={value}
  className={buttonClassName}
  disabled={disabled}
  active={active}
>
  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>```
```markdown

```jsx {"1":5} del={"2":7-8} ins={"3":10-12}
// labeled-line-markers.jsx
<button
  role="button"
  {...props}
  value={value}
  className={buttonClassName}
  disabled={disabled}
  active={active}
>
  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>
```markdown

#### 添加长标签

```
```jsx title="labeled-line-markers.jsx"
// labeled-line-markers.jsx
<button
  role="button"
  {...props}

  value={value}
  className={buttonClassName}

  disabled={disabled}
  active={active}
>

  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>```
```

```jsx title="labeled-line-markers.jsx"
// labeled-line-markers.jsx
<button
  role="button"
  {...props}

  value={value}
  className={buttonClassName}

  disabled={disabled}
  active={active}
>

  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>
```

#### 使用类似 Diff 的语法

```markdown
```diff
+这一行将被标记为已插入
-这一行将被标记为已删除
这是一行普通代码```
```markdown

```diff
+这一行将被标记为已插入
-这一行将被标记为已删除
这是一行普通代码
```markdown

---

```
```diff title="README.md"
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
+这是一个真实的 diff 文件示例
-所有内容都将保持原样
 连空格也不会被移除```
```


```diff title="README.md"
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
+这是一个真实的 diff 文件示例
-所有内容都将保持原样
 连空格也不会被移除
```

#### 将语法高亮与 Diff 语法结合

```markdown
```diff lang="js"
  function thisIsJavaScript() {
    // 整个代码块按 JavaScript 高亮，
    // 同时我们仍然可以添加 diff 标记！
-   console.log('旧的代码将被移除')
+   console.log('全新的闪亮代码！')
  }```
```markdown

```diff lang="js"
  function thisIsJavaScript() {
    // 整个代码块按 JavaScript 高亮，
    // 同时我们仍然可以添加 diff 标记！
-   console.log('旧的代码将被移除')
+   console.log('全新的闪亮代码！')
  }
```markdown

#### 标记行内的特定文本

```
```js "指定文本"
function demo() {
  // 标记行内任何出现的“指定文本”
  return '支持多次匹配指定文本';
}```
```

```js "指定文本"
function demo() {
  // 标记行内任何出现的“指定文本”
  return '支持多次匹配指定文本';
}
```

#### 正则表达式

```markdown
```ts /ye[sp]/
console.log('单词 yes 和 yep 都将被标记。')```
```markdown

```ts /ye[sp]/
console.log('单词 yes 和 yep 都将被标记。')
```markdown

#### 标记行内标记类型 (mark, ins, del)

```
```js "return true;" ins="inserted" del="deleted"
function demo() {
  console.log('这些是 inserted 和 deleted 标记类型');
  // return 语句使用默认标记类型
  return true;
}```
```

```js "return true;" ins="inserted" del="deleted"
function demo() {
  console.log('这些是 inserted 和 deleted 标记类型');
  // return 语句使用默认标记类型
  return true;
}
```

## 4. 自动换行 (Word Wrap)

[自动换行](https://expressive-code.com/key-features/word-wrap/)

#### 为单个代码块配置换行

```markdown
```js wrap
// 开启换行的示例
function getLongString() {
  return '这是一段非常长的字符串，如果不开启自动换行，它很可能超出现在容器的显示范围，除非容器极宽。'
}```
```markdown

```js wrap
// 开启换行的示例
function getLongString() {
  return '这是一段非常长的字符串，如果不开启自动换行，它很可能超出现在容器的显示范围，除非容器极宽。'
}
```markdown

---

```
```js wrap=false
// 关闭换行的示例 (wrap=false)
function getLongString() {
  return '这是一段非常长的字符串，如果不开启自动换行，它很可能超出现在容器的显示范围，除非容器极宽。'
}```
```


```js wrap=false
// 关闭换行的示例 (wrap=false)
function getLongString() {
  return '这是一段非常长的字符串，如果不开启自动换行，它很可能超出现在容器的显示范围，除非容器极宽。'
}
```

#### 配置换行后的缩进

```markdown
```js wrap preserveIndent
// 保持缩进示例 (默认开启)
function getLongString() {
  return '长字符串换行后会保持与上一行相同的缩进位置。'
}```
```markdown

```js wrap preserveIndent
// 保持缩进示例 (默认开启)
function getLongString() {
  return '长字符串换行后会保持与上一行相同的缩进位置。'
}
```markdown

---

```
```js wrap preserveIndent=false
// 关闭保持缩进示例 (preserveIndent=false)
function getLongString() {
  return '长字符串换行后将不再保持缩进，而是从行首开始。'
}```
```


```js wrap preserveIndent=false
// 关闭保持缩进示例 (preserveIndent=false)
function getLongString() {
  return '长字符串换行后将不再保持缩进，而是从行首开始。'
}
```

## 5. 可折叠代码段 (Collapsible Sections)

[可折叠代码段插件](https://expressive-code.com/plugins/collapsible-sections/)

```markdown
```js collapse={1-5, 12-14, 21-24}
// 这里的初始化样板代码将被折叠
import { someBoilerplateEngine } from '@example/some-boilerplate'
import { evenMoreBoilerplate } from '@example/even-more-boilerplate'

const engine = someBoilerplateEngine(evenMoreBoilerplate())

// 这部分代码默认可见
engine.doSomething(1, 2, 3, calcFn)

function calcFn() {
  // 您可以设置多个折叠区域
  const a = 1
  const b = 2
  const c = a + b

  // 这一行保持可见
  console.log(`计算结果: ${a} + ${b} = ${c}`)
  return c
}

// 结尾的样板代码也会被再次折叠
engine.closeConnection()
engine.freeMemory()
engine.shutdown({ reason: 'End of example boilerplate code' })```
```markdown


```js collapse={1-5, 12-14, 21-24}
// 这里的初始化样板代码将被折叠
import { someBoilerplateEngine } from '@example/some-boilerplate'
import { evenMoreBoilerplate } from '@example/even-more-boilerplate'

const engine = someBoilerplateEngine(evenMoreBoilerplate())

// 这部分代码默认可见
engine.doSomething(1, 2, 3, calcFn)

function calcFn() {
  // 您可以设置多个折叠区域
  const a = 1
  const b = 2
  const c = a + b

  // 这一行保持可见
  console.log(`计算结果: ${a} + ${b} = ${c}`)
  return c
}

// 结尾的样板代码也会被再次折叠
engine.closeConnection()
engine.freeMemory()
engine.shutdown({ reason: 'End of example boilerplate code' })
```markdown

## 6. 行号 (Line Numbers)

[行号插件](https://expressive-code.com/plugins/line-numbers/)

### 为代码块显示行号

```
```js showLineNumbers
// 这个代码块将显示行号
console.log('来自第 2 行的问候！')
console.log('我在第 3 行')```
```

```js showLineNumbers
// 这个代码块将显示行号
console.log('来自第 2 行的问候！')
console.log('我在第 3 行')
```

---

```markdown
```js showLineNumbers=false
// 这个代码块禁用了行号
console.log('你好？')
console.log('抱歉，你知道我在哪一行吗？')```
```markdown


```js showLineNumbers=false
// 这个代码块禁用了行号
console.log('你好？')
console.log('抱歉，你知道我在哪一行吗？')
```markdown

### 修改起始行号

```
```js showLineNumbers startLineNumber=5
console.log('来自第 5 行的问候！')
console.log('我在第 6 行')```
```

```js showLineNumbers startLineNumber=5
console.log('来自第 5 行的问候！')
console.log('我在第 6 行')
```


## 7. 长代码块限高与内部滚动（本站魔改）

官方 Expressive Code 本身不限制代码块高度，一段 80 行的日志能把整篇文章撑到「滑不到底」。本站给它加了一层处理：超过约 17 行就在块内滚动，没滚到底时底部压一道渐隐，提示下方还有内容。

### 7.1 为什么只写一条 max-height 不生效

第一直觉是给 `pre` 加 `max-height`，但你会发现它不起作用。原因是 EC 的 reset 样式里有一条：

```css
.expressive-code :not(:is(svg, svg *)) {
    max-height: revert; /* 同优先级下会反悔我们的声明 */
}
```

`revert` 会把属性回滚到用户代理样式（也就是 `none`）。所以我们的选择器**权重必须比它高**——本站的写法是嵌套在 `.expressive-code` 下的 `.frame pre`：

```css title="src/styles/expressive-code.css"
.expressive-code {
    .frame {
        @apply !shadow-none relative; /* 去掉默认阴影；渐隐遮罩需要 relative 定位 */

        pre {
            max-height: 22rem;            /* 约 17 行，超出滚动 */
            overscroll-behavior: contain; /* 滚到头不带动整页一起滚 */
        }
    }
}
```

:::tip
不用嵌套写法时，等价形式是 `.expressive-code .frame pre { ... }`——两层类选择器，权重高于 reset 的单层 `:not(...)`。关键是**别只写一个 `.frame pre`**。
:::

### 7.2 底部渐隐：提示「下面还有」

限高之后最大的问题是读者不知道这块能滚。本站用一个 `::after` 伪元素做底部渐变：

```css title="src/styles/expressive-code.css"
.expressive-code .frame.is-clipped::after {
    content: "";
    pointer-events: none; /* 关键：别挡住最后几行代码的选中与点击 */
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3.5rem;
    /* 代码块恒为深色底（github-dark），渐变对齐其背景色 */
    background: linear-gradient(to top, #24292e 30%, transparent);
    border-radius: 0 0 var(--radius-large, 0.5rem) var(--radius-large, 0.5rem);
}
```

两个细节：

- `pointer-events: none` 必须写，否则这道遮罩会挡住底部几行代码的选中、复制和点击
- 渐变色要**对齐你实际使用的代码主题背景色**。本站 EC 主题恒为 github-dark（`#24292e`），如果你换成浅色主题，这里的颜色也要跟着换

### 7.3 JS：只在真的溢出时才显示渐隐

短代码块不该有渐隐条。用一个溢出检测给 `frame` 挂 `is-clipped` 类：

```js title="src/layouts/Layout.astro"
/* ===== 长代码块：溢出检测 + 底部渐隐提示 ===== */
function initCodeClips() {
    document.querySelectorAll('.expressive-code pre').forEach((pre) => {
        const frame = pre.closest('.frame');
        if (!frame) return;
        const clipped = pre.scrollHeight > pre.clientHeight + 4; // +4 容差，防亚像素抖动
        frame.classList.toggle('is-clipped', clipped);
        frame.classList.toggle('is-scrolled-end', !clipped);
    });
}
```

滚到底时把渐隐收掉，否则读完了还压着一道黑：

```js title="src/layouts/Layout.astro"
/* scroll 事件不冒泡，必须用捕获阶段委托 */
document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.tagName !== 'PRE') return;
    const frame = t.closest('.frame');
    if (!frame) return;
    if (t.scrollTop + t.clientHeight >= t.scrollHeight - 12) {
        frame.classList.remove('is-clipped');
        frame.classList.add('is-scrolled-end');
    } else if (t.scrollHeight > t.clientHeight + 4) {
        frame.classList.add('is-clipped');
        frame.classList.remove('is-scrolled-end');
    }
}, true);
```

:::important
**`scroll` 事件不冒泡**——它只在产生滚动的元素自己身上触发。所以要监听页面里所有代码块的滚动，不能把 `addEventListener('scroll', fn)` 直接挂在 `document` 上收事件，必须传第三个参数 `true` 走**捕获阶段**委托。这是这段逻辑里最容易写错的一处。
:::

### 7.4 Swup 无刷新导航兼容

本站启用了 Swup，切页时不会重新执行页面脚本。所以初始化函数要挂在两个事件上，并在首次加载时手动跑一次兜底：

```js title="src/layouts/Layout.astro"
document.addEventListener('astro:page-load', initCodeClips); // 首屏 + 视图过渡
document.addEventListener('swup:page:view', initCodeClips);  // Swup 切页后
initCodeClips();                                             // 兜底
```

### 7.5 想改高度？

`max-height: 22rem` 是唯一需要调的数字（约 17 行）。想宽松改 `30rem`，想紧凑改 `16rem`；`22rem` 是「一眼能看完大半屏、又不至于把文章撑爆」的折中值。

:::note
如果某段代码你**不希望**被限高（比如想完整展示一份长配置），EC 自带 `collapse` 折叠属性其实更好用——见前文第 5 节。限高解决的是「读者不想看但页面被拉长」，折叠解决的是「读者可以自己决定展开」，两者场景不同。
:::

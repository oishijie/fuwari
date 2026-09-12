---
title: 'Markdown 求职实录：一场兼作本站 Markdown 样式陈列的面试'
published: 2026-08-24
description: 'Markdown 语法全解析与 Fuwari 模板食用指南的合订本：每个语法先看写法、再看效果，全部源码公开。'
image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Markdown', 'Fuwari', '教程', '介绍']
category: 博客魔改
draft: false
lang: 'zh-CN'
order: 1
---

上周三下午，编辑部前台收到一份奇特的求职材料。投递者自称 **Markdown**——对，就是那个 Markdown，一份轻量级标记语言，声称能承包本站从标题到脚注的全部排版工作。

面试由 Fuwari 博客模板主持。本文同时作为本站 **Markdown 语法**（整合自旧文《Markdown 语法全解析：从基础到高级进阶》）与 **Fuwari 模板功能**（整合自《Fuwari 博客模板综合食用指南》）的样式陈列[^1]。

> **编者按**：每个环节先亮「写法」（Markdown 源码原样展示），再看「效果」（真实渲染）。如需学习语法，请专注代码框；如需吃瓜，请跳过代码框。两不误当然最好。

> [!NOTE]
> 文中所有「写法」框里的内容都是**源码原文**，你可以直接复制走用；所有「效果」都是真实渲染，没有截图。

## 面试记录 ☆ 第一轮：基础素养

H2 负责章节，比如现在这个；H3 负责小节，比如接下来每个带 ☆ 的；H4 负责不存在的小节，本文没有用到。至于 H1——它一般不单独出现在正文里，文章标题已经把它用掉了，就像入职当天才发现工位早就被人占了。

### 开场白 ☆ 文本格式

**写法**：

```markdown
*斜体*、**粗体**、~~删除线~~、`行内代码`
```

**效果**：面试者起立鞠躬：*各位编辑老师好*，我是 **Markdown**，来自纯文本世界。~~HTML~~ 是我表哥，比较胖，什么都要自己写。

「介绍一下行内代码。」

`行内代码` 长这样：写配置、标文件名、指路径，全靠它，比如 `src/config.ts` 或 `draft: false`。

> 复试意见：此人称代码是「inline」的，陈述时眼神没有游移，初步可信。
>
> > 主任批注：可信个屁，等代码块环节再看。

### 证件照 ☆ 图片与链接

**写法**：

```markdown
![alt 文字](图片地址)

[链接文字](https://example.com)
```

**效果**：面试者按要求提交证件照一张：

![证件照：Markdown 的工作环境，纯文本，无装饰](https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&h=800&auto=format&fit=crop)

同时提交了[个人主页](https://www.markdownguide.org/)与[方言证书（GFM）](https://github.github.com/gfm/)[^2]。

### 技能清单 ☆ 列表

**写法**：

```markdown
- 无序列表
  - 支持嵌套
    - 可以一直套

1. 有序列表
2. 自动编号

- [x] 任务清单：已完成
- [ ] 任务清单：未完成
```

**效果**——无序列表（熟练技能，支持套娃）：

- 标题与分割线
- 列表嵌套
  - 有序的
    - 无序的
      - 都是列表
- 表格（自己会排队）

有序列表（自我陈述）：

1. 我诞生于 2004 年
2. 我的方言有十余种，最常用的是 GFM
3. 我在 GitHub 上有数亿份口供

任务清单（入职准备进度）：

- [x] 《Markdown 语法全解析》复习完毕
- [x] 《Fuwari 博客模板综合食用指南》背诵完毕
- [ ] 等一个 offer

### 薪资期望 ☆ 删除线的正确用法

**写法**：

```markdown
期望月薪 ~~30000~~ ~~25000~~ 面议。
```

**效果**：期望月薪 ~~30000~~ ~~25000~~ 面议。

面试官在备注栏写道：这是全场唯一没出错的部分。

### 人际关系 ☆ 引用块

**写法**：

```markdown
> 第一层引用
>
> > 第二层引用，嵌套就多打一个 >
>
> 回到第一层
```

**效果**：

> 面试官评语：表达清晰，逻辑完整。
>
> > 复试意见：此人称代码是「inline」的，眼神没有游移，初步可信。
> >
> > > 主任批注：可信个屁，等代码块环节再看。

### 面试评分表 ☆ 表格

**写法**（冒号在哪边，就往哪边对齐）：

```markdown
| 左对齐 | 居中 | 右对齐 | 默认 |
| :--- | :---: | ---: | --- |
| 靠左 | 靠中 | 靠右 | 随缘 |
```

**效果**：

| 考核项 | 得分 | 权重 | 备注 |
| :--- | ---: | :---: | --- |
| 语法准确率 | 98.6 | 40% | 扣分项是话多 |
| 排版美观度 | 96.0 | 30% | 表格自己会排队 |
| 抗压能力 | 87.3 | 20% | 被划掉三次也没有崩溃 |
| 咖啡冲泡 | 0 | 10% | 完全不会，建议转岗行政 |

### 劳动纪律 ☆ 分割线

**写法**：

```markdown
---
```

**效果**：

---

分割线上方是简历，下方是人心。面试官表示，这个人用三条线讲了很多东西。

## 加试 ☆ 高级素养

### 数字敏感度 ☆ 数学公式

**写法**——行内公式用一对 `$` 包起来：

```markdown
行内公式：$\omega = d\phi / dt$
```

块级公式用 `math` 代码块（注意外面这层是四个反引号，因为里面也有三反引号）：

````markdown
```math
P(\text{offer}) = \frac{S_{\text{syntax}} \times W_{\text{排版}}}{\int_0^{1} f(t)\,dt + K_{\text{moral}}}
```
````

**效果**——面试官出题：请建立「录用概率模型」。行内公式热身：$\omega = d\phi / dt$（面试官：随便写的，装样子）。

块级公式，Markdown 白板推导：

```math
P(\text{offer}) = \frac{S_{\text{syntax}} \times W_{\text{排版}}}{\int_0^{1} f(t)\,dt + K_{\text{moral}}}
```

其中 $K_{\text{moral}}$ 为道德品质修正系数，取值 $[0.1, 1.0]$，由面试官心情决定。

Markdown 看完评价：「比我严谨。」

### 字符应激测试 ☆ 转义

**写法**（特殊符号前加反斜杠，它就只是个普通字符）：

```markdown
\*\*这样我就不是粗体，只是两个相亲相爱的星号\*\*
```

**效果**：面试官突然发难：**如果考官本身就是语法符号，你怎么办？**

Markdown 从容掏出反斜杠：

\*\*这样我就不是粗体，只是两个相亲相爱的星号\*\*

### 逃生舱口 ☆ 内嵌 HTML

**写法**：

```markdown
<span style="display:block; text-align:right; color:orangered;">橙色，居右</span>
```

**效果**——Markdown 坦白：遇到纯语法做不到的事，允许请 HTML 亲戚帮忙，比如让一行字**居右**、并且是橙色的：

<span style="display:block; text-align:right; color:orangered;">——本行由 HTML 代笔，橙色，居右，生活精致</span>

:::warning
HTML 只救急，不救穷。能不用就不用，否则排版会变得和面试者的发型一样自由散漫。
:::

## 压轴环节 ☆ Fuwari 模板功能

### 回答注意 ☆ 提示框

**写法**——`:::` 开头、`:::` 结尾，类型有 `note` `tip` `important` `warning` `caution` 五种，方括号里可以塞自定义标题；GitHub 的 `> [!TIP]` 写法也通吃：

```markdown
:::note
普通提示。
:::

:::note[自定义标题]
提示框也能自带标题。
:::

> [!TIP]
> GitHub 语法的提示块同样支持。
```

**效果**——面试问答实录：

:::note
第一题：请说明你的记忆方式。——我不用记，写下来就是排版。
:::

:::tip
第二题：给读者的可选建议。——多用列表，读者都是速读生物。
:::

:::important
第三题：关键信息。——`draft: true` 的文章不会出现在首页，就像没来面试一样。
:::

:::warning
第四题：风险意识。——本站暂不支持 `:spoiler[隐藏内容]` 语法，想藏私房钱请另寻高就。
:::

:::caution
第五题：负面后果。——如果 frontmatter 的 YAML 缩进写错，整篇文章会在构建时当场失踪，连归档都查无此人。
:::

:::note[第六题 ☆ 自定义标题]
提示框还能自带标题，就像现在这样。
:::

> [!TIP]
> GitHub 语法的提示块也支持。Markdown 表示这叫「入乡随俗」。

### 出身调查 ☆ 仓库卡片

**写法**（注意是**双冒号**开头——三个冒号会被当成容器指令，把后面半篇文章吞进去，本文字数骤降就是因为面试者一开始写错了这个）：

````markdown
::github{repo="用户名/仓库名"}
````

**效果**——面试官要求提供出身证明，Markdown 递上一张来自 GitHub 的卡片：

::github{repo="saicaca/fuwari"}

### 现场实操 ☆ 代码块全家桶

以下为实操表演，场地与灯光由 Expressive Code 提供。每题先看写法（围栏后跟的那些参数就是全部秘密），再看效果。

**第一题：文件名与行高亮**——`title=` 给文件名，`{1, 4, 6-7}` 高亮指定行：

````markdown
```js title="interview.js" {1, 4, 6-7}
// 第 1 行：重点关注
function expectSalary(current) {
  const expected = current * 1.5;
  // 第 4 行：重点关注
  const skills = ['标题', '列表', '表格', '公式'];
  const reality = current * 1.1; // 第 6 行：范围高亮起
  return reality;                // 第 7 行：范围高亮止
}
```
````

**效果**：

```js title="interview.js" {1, 4, 6-7}
// 第 1 行：重点关注
function expectSalary(current) {
  const expected = current * 1.5;
  // 第 4 行：重点关注
  const skills = ['标题', '列表', '表格', '公式'];
  const reality = current * 1.1; // 第 6 行：范围高亮起
  return reality;                // 第 7 行：范围高亮止
}
```

**第二题：插入与删除**——`del={2}` 删第 2 行，`ins={3-4}` 插第 3-4 行：

````markdown
```js title="salary-negotiation.js" del={2} ins={3-4}
function finalExpectation() {
  return '月薪三万，绝不还价';
  // 经纪人建议：初稿过于激进
  return '面议，公司管饭就行';
}
```
````

**效果**（面试者的薪资修订记录）：

```js title="salary-negotiation.js" del={2} ins={3-4}
function finalExpectation() {
  return '月薪三万，绝不还价';
  // 经纪人建议：初稿过于激进
  return '面议，公司管饭就行';
}
```

**第三题：diff 对照**——直接用 `diff` 语言，`+` 是新增、`-` 是删除：

````markdown
```diff title="resume.md"
+ 精通 Markdown 全部基础语法
+ 熟练使用 GFM 方言：表格、任务清单、脚注
- 精通一切，无需学习
+ 持续学习中，本站文章就是证据
```
````

**效果**（简历的迭代史）：

```diff title="resume.md"
+ 精通 Markdown 全部基础语法
+ 熟练使用 GFM 方言：表格、任务清单、脚注
- 精通一切，无需学习
+ 持续学习中，本站文章就是证据
```

**第四题：关键词标记**——围栏后写一对引号包住要标记的词：

````markdown
```js "候选人"
const review1 = '候选人态度端正，语法过硬';
const review2 = '候选人话太多，建议观察';
const finalReview = '综合两位面试官意见：候选人优先录用';
```
````

**效果**（面试官评语归档）：

```js "候选人"
const review1 = '候选人态度端正，语法过硬';
const review2 = '候选人话太多，建议观察';
const finalReview = '综合两位面试官意见：候选人优先录用';
```

**第五题：正则标记**——斜杠包正则，命中就亮：

````markdown
```ts /错误|警告|异常/
const log = [
  '08:30 系统启动，一切正常',
  '09:15 出现一次警告：咖啡机缺豆',
  '10:00 异常：求职者太紧张，自我介绍了三遍',
  '12:00 错误：盒饭没了，面试暂停',
];
```
````

**效果**（面试当日系统日志）：

```ts /错误|警告|异常/
const log = [
  '08:30 系统启动，一切正常',
  '09:15 出现一次警告：咖啡机缺豆',
  '10:00 异常：求职者太紧张，自我介绍了三遍',
  '12:00 错误：盒饭没了，面试暂停',
];
```

**第六题：自动换行**——围栏后加 `wrap`，超长行会折行而不会撑破容器：

````markdown
```js wrap
const closingStatement = '这是面试者在凌晨两点写下的陈述：……（超长内容）……';
```
````

**效果**（结案陈词，一气呵成）：

```js wrap
const closingStatement = '这是面试者在凌晨两点写下的陈述：经过长达三小时的鏖战，本人一致认为自己完全胜任排版工作，理由包括但不限于会加粗、会斜体、会划线、会背 frontmatter，望编辑部从速发放 offer，薪资面议，咖啡自备。';
```

**第七题：可折叠段落**——`collapse={起始行-结束行}`，被罩住的行默认收起：

````markdown
```js collapse={1-5, 12-15}
// 以下为样板代码，已折叠
import { Editor } from 'markdown-core'
import { Themes } from 'fuwari-themes'

const editor = new Editor(Themes.default)

// 核心逻辑：现场可见
editor.render('**你好，我是 Markdown**')
editor.highlight('表格、公式、脚注')
editor.fold('不重要的话')

// 结案归档流程，已折叠
editor.close('面试结束')
editor.archive('材料编号 LC-2026-009')
editor.notify({ to: '编辑部全体', cc: 'Markdown 本人' })
```
````

**效果**：

```js collapse={1-5, 12-15}
// 以下为样板代码，已折叠
import { Editor } from 'markdown-core'
import { Themes } from 'fuwari-themes'

const editor = new Editor(Themes.default)

// 核心逻辑：现场可见
editor.render('**你好，我是 Markdown**')
editor.highlight('表格、公式、脚注')
editor.fold('不重要的话')

// 结案归档流程，已折叠
editor.close('面试结束')
editor.archive('材料编号 LC-2026-009')
editor.notify({ to: '编辑部全体', cc: 'Markdown 本人' })
```

**第八题：行号管理**——`showLineNumbers=false` 关行号；`startLineNumber=42` 改起始行号：

````markdown
```js showLineNumbers=false
// 面试官：这段太短，不配拥有行号
console.log('同意。')
```

```js showLineNumbers startLineNumber=42
console.log('从第 42 行开始，前面的都是法律免责声明');
```
````

**效果**：

```js showLineNumbers=false
// 面试官：这段太短，不配拥有行号
console.log('同意。')
```

```js showLineNumbers startLineNumber=42
console.log('从第 42 行开始，前面的都是法律免责声明');
```

**第十题：着装规范**——shell 族代码默认穿终端便装（左上角三色圆点），报上文件名（`title=`）才算穿好编辑器西装：

**写法**：

````markdown
```sh
echo "便装出场：没报文件名，自动被归为终端窗口"
```

```sh title="formal.sh"
echo "西装出场：报了文件名，换编辑器边框"
```
````

**效果**：

```sh
echo "便装出场：没报文件名，自动被归为终端窗口"
```

```sh title="formal.sh"
echo "西装出场：报了文件名，换编辑器边框"
```

面试官点评，判定规则共三条：① `bash`、`sh`、`ansi` 这类终端语言默认穿便装；② `title=` 是文件名、或代码以 `#!/` 开头，自动换西装；③ `frame="terminal"`、`frame="code"` 可强制指定着装。面试者闻言递上自己最得意的 PHP 作品，坚称它穿的是终端便装——当场被纠正：`php` 不在终端语言名单里，你那是编辑器西装。面试者的脸红到了耳根，但红色恰好和它的主题色一致，勉强算体面。

**第十一题：灯光设备**——面试者自带了一套灯，说这叫 ANSI 转义序列渲染，写法上是把不可见的 `ESC` 字节（`\x1b`）缝进代码里：

**写法**（可读记法，`ESC` 实际是文件里的一个不可见字节）：

````markdown
```ansi
ESC[1;31m加粗红字 ESC[0m   ← 实际写的是 \x1b[1;31m 加粗红字 \x1b[0m
```
````

**效果**（面试官拿到源码时一度以为交了白卷——通篇不可见字符，直到渲染灯亮起）：

```ansi
灯光设备自检单（编号 LC-2026-009-ANSI）：

- 常规: [0;31m红 [0m [0;32m绿 [0m [0;33m黄 [0m [0;34m蓝 [0m [0;35m品 [0m [0;36m青 [0m
- 加粗: [1;31m红 [0m [1;32m绿 [0m [1;33m黄 [0m [1;34m蓝 [0m [1;35m品 [0m [1;36m青 [0m
- 调暗: [2;31m红 [0m [2;32m绿 [0m [2;33m黄 [0m [2;34m蓝 [0m [2;35m品 [0m [2;36m青 [0m

256 色（色号 160-177，面试官说这段像调色盘打翻了）：
[38;5;160m 160 [0m[38;5;161m 161 [0m[38;5;162m 162 [0m[38;5;163m 163 [0m[38;5;164m 164 [0m[38;5;165m 165 [0m
[38;5;166m 166 [0m[38;5;167m 167 [0m[38;5;168m 168 [0m[38;5;169m 169 [0m[38;5;170m 170 [0m[38;5;171m 171 [0m
[38;5;172m 172 [0m[38;5;173m 173 [0m[38;5;174m 174 [0m[38;5;175m 175 [0m[38;5;176m 176 [0m[38;5;177m 177 [0m

[38;2;34;139;34mForestGreen - RGB(34, 139, 34)[0m  ← 全彩 RGB，绿色代表 offer 在望

文字特效: [1m加粗[0m [2m调暗[0m [3m斜体[0m [4m下划线[0m
自检结论: 灯光一切正常，比候选人本人亮眼。
```

面试官的评语只有一句：设备比人亮。

**第十二题：低调模式**——`frame="none"`：外套、灯光统统脱掉，素颜谢幕：

````markdown
```sh frame="none"
# 低调执行，不留痕迹
echo "面试结束，清理现场"
```
````

**效果**：

```sh frame="none"
# 低调执行，不留痕迹
echo "面试结束，清理现场"
```

### 才艺展示 ☆ 视频自我介绍

**写法**——从 B 站复制嵌入代码，直接粘进 Markdown：

```markdown
<iframe width="100%" height="468"
  src="//player.bilibili.com/player.html?bvid=BV1fK4y1s7Qf&p=1"
  scrolling="no" border="0" frameborder="no" framespacing="0"
  allowfullscreen="true"></iframe>
```

**效果**——Markdown 播放了一段从 B 站找来的视频：

<iframe width="100%" height="468" src="//player.bilibili.com/player.html?bvid=BV1fK4y1s7Qf&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>

编辑部看完的评价：视频和本人一样，都是占位符。

Markdown 见状又补交了一份「海外才艺证明」——从 YouTube 复制的嵌入代码，坚称这段视频里有它的留学演讲。

**写法**——YouTube 的分享菜单里有现成的嵌入代码，复制粘贴即可：

````markdown
<iframe width="100%" height="468"
  src="https://www.youtube.com/embed/5gIf0_xpFPI?si=N1WTorLKL0uwLsU_"
  title="YouTube video player" frameborder="0" allowfullscreen></iframe>
````

**效果**：

<iframe width="100%" height="468" src="https://www.youtube.com/embed/5gIf0_xpFPI?si=N1WTorLKL0uwLsU_" title="YouTube video player" frameborder="0" allowfullscreen></iframe>

面试官并没有找到那段留学演讲，但鉴于视频和 B 站那份才艺一样都是占位符，勉强判定为「风格统一」。

### 个人档案 ☆ Frontmatter

其实连这份求职材料本身，也是用 Markdown 写的。以下是其元数据（真材实料，本文同款）：

```yaml
---
title: 'Markdown 求职实录：一场兼作本站 Markdown 样式陈列的面试'
published: 2026-09-12
description: 'Markdown 语法全解析与 Fuwari 模板食用指南的合订本。'
tags: ['Markdown', 'Fuwari', '教程']
category: '博客改造'
draft: false
hidden: false
order: 0
---
```

[^3]

## 录用通知

:::note[编辑部决议]
经全体编辑投票（3:0，另一位编辑弃权去吃饭），决定录用 Markdown 为本站终身排版工程师。待遇：每篇文章出场一次，无需打卡，不缴社保。
:::

<span style="display:block; text-align:right; color:orangered;">🖊 留心博客编辑部，2026 年 9 月 12 日</span>

[^1]: 样式陈列的灵感来自伏枥之间《草莓蛋糕失踪事件调查报告：兼作本站 Markdown 样式陈列》（https://leehenry.top/posts/words_in_wildness/markdown/），语法内容整合自本站两篇旧文《Markdown 语法全解析：从基础到高级进阶》与《Fuwari 博客模板综合食用指南》。
[^2]: 证件照注：照片内容为其日常工作环境，纯文本，无装饰，与本人自述一致。
[^3]: 脚注：其中 `hidden: false` 是本站私有字段——设为 `true` 时文章将从首页与 RSS 消失，只在 Now 页出现。Markdown 对此表示羡慕：「我也想 hidden。」

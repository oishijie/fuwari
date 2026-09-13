---
title: 'Markdown 编辑器如何修改图片大小'
published: 2026-07-13
description: '本文详细介绍了在 Markdown 中调整图片尺寸的三种实用方法：使用 HTML 标签、添加 CSS 样式后缀以及通过全局 Style 统一控制。'
image: 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['Markdown', '图片尺寸']
category: 技术茶谈
draft: false 
lang: 'zh-CN'
order: 0
---
## 方法一、嵌入HTML代码

### 1.1 使用 **img标签**

```
<img src="./xxx.png" width = "300" height = "200" alt="图片名称" align=center />
```

### 1.2 如果需要居中的话只要在外面包围**div标签**即可

```
<div align="center"> ... </div>
```

## 方法二、直接在图片后面加上对应的**CSS样式**即可

```
![test image size](url){:class="img-responsive"}
![test image size](url){:height="50%" width="50%"}
![test image size](url){:height="100px" width="400px"}
```

## 方法三、一劳永逸通用思路

在文章头部添加：


```
<style>
img{
    width: 60%;
    padding-left: 20%;
}
</style>
```

这个对文章所有图片都有效，如果图片尺寸标准差异过大，建议还是用单独的<img>标签来定义。


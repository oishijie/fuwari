# -*- coding: utf-8 -*-
"""批量替换 posts frontmatter 的 image 封面为 Unsplash 公共图床直链。"""
import os, re, sys

POSTS = r"D:\VibeCoding\fuwari-master\src\content\posts"
U = "https://images.unsplash.com/photo-{pid}?q=80&w=1200&auto=format&fit=crop"

# 文件名(含子目录条目) -> Unsplash photo id
MAPPING = {
    "3-2-1 备份规则.md": "1591799264318-7e6ef8ddb7ea",                      # 存储硬盘
    "Fuwari博客改造计划：Fuwari 博客模板食用指南 - Moeku's Blog.md": "1499750310107-5fef28a66643",  # 咖啡写作桌
    "Fuwari博客改造计划：为 Astro 加上在新标签页打开链接的功能.md": "1461749280684-dccba630e2f6",   # 代码屏幕
    "Fuwari博客改造计划：为 Fuwari 中添加 “随机一篇文章” 功能 - Pinpe 的云端.md": "1511882150382-421056c89033",  # 骰子
    "Fuwari博客改造计划：为 Fuwari 中添加友链功能.md": "1451187580459-43490279c0fa",               # 地球网络
    "Fuwari博客改造计划：为 Fuwari 添加 Giscus 评论系统 - THW's Blog.md": "1486312338219-ce68d2c6f44d",  # 打字交流
    "Fuwari博客改造计划：为 Fuwari 添加访问统计卡片 - THW's Blog.md": "1551288049-bebda4e38f71",    # 数据仪表盘
    "Fuwari博客改造计划：为Fuwari博客配置SEO .md": "1512486130939-2c4f79935e4f",                   # 桌面搜索
    "Fuwari博客改造计划：为Fuwaru添加二级导航 - PengXing's Blog.md": "1522252234503-e356532cafd5",  # 代码屏幕
    "Fuwari博客改造计划：在 Fuwari 博客页脚添加 ICP 备案及运行时间.md": "1501139083538-0139583c060f",  # 沙漏
    "Fuwari博客改造计划：如何使用expressive-code.md": "1555066931-4365d14bab8c",                   # 暗色编辑器
    "Fuwari博客改造计划：快速部署搭建一个 Fuwari 博客.md": "1531297484001-80022131f5a1",            # 暗色笔记本
    "Fuwari博客改造计划：文章置顶与置底：.md": "1543286386-713bdd548da4",                          # 图表排序
    "Fuwari博客改造计划：给fuwari博客添加AI摘要.md": "1677442136019-21780ecad995",                 # AI 抽象
    "Github连接神器dev-sidrcar.md": "1618401471353-b98afee0b2eb",                           # GitHub 屏幕
    "Markdown系列：Markdown 编辑器如何修改图片大小.md": "1516116216624-53e697fedbea",              # 笔记本代码
    "Markdown系列：Markdown语法介绍.md": "1455390582262-044cdead277a",                            # 钢笔书写
    "Windows 环境下配置 Path 环境变量教程.md": "1496181133206-80ce9b88a853",                      # 笔记本电脑
    "Word 添加页码操作教程.md": "1450101499163-c8848c66ca85",                              # 钢笔文件
    "fuwari主题侧边栏音乐播放器解决方案 - xagunelのblog.md": "1511671782779-c97d3d27a1d4",         # 音乐
    "x86_64和AMD64和ARM64？傻傻分不清楚？.md": "1518770660439-4636190af475",                      # 电路板
    "为项目添加一键部署按钮 - THW's Blog.md": "1542831371-29b0f74f9713",                          # 代码特写
    "使用 CF Workers 搭建 VlessTrojan 节点并优化 - Ad_closeNN 的小站.md": "1550751827-4bd374c3f58b",  # 网络安全
    "使用Cloudflare Workers+Pages制作永久免费的随机图API!.md": "1544197150-b99a580bb7a8",          # 网络
    "如何修改Windows用户名 - Betsy Blog.md": "1563013544-824ae1b704d3",                          # 安全锁
    "定制属于自己的Github主页.md": "1556075798-4825dfaaf498",                               # octocat
    "文摘：不要让无关的事情占据你的生活 - 迷雾笔记.md": "1506126613408-eca07ce68773",              # 冥想
    "文摘：提高50%学习和工作效率的好方法.md": "1506784983877-45594efa4cbe",                       # 手表计划
    "文摘：浅谈《驴得水》.md": "1489599849927-2ee91cede3ba",                                # 电影院
    "自建评论系统：用 Cloudflare Workers + D1 替换 Giscus.md": "1512820790803-83ca734da794",       # 打开的书
    "自托管访问统计与Fuwari整合教程.md": "1571171637578-41bc2dd41cd2",                            # 科技感
    "集合：Edge键盘快捷方式集合.md": "1587829741301-dc798b83add3",                               # 键盘
    "集合：常用的CMD命令集合.md": "1629654297299-c8506221ca97",                                 # 终端
}

def process(path, url):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return "NO_FRONTMAtter"
    fm = m.group(1)
    # 删除全部旧 image 行（兼容缩进式 frontmatter）
    fm_new = re.sub(r"^[ \t]*image:.*(?:\r?\n|\Z)", "", fm, flags=re.M)
    # 在 description 行后插入新 image（跟随其缩进）；无 description 则在 title 行后
    lines = fm_new.splitlines()
    insert_at, indent = 0, ""
    for i, ln in enumerate(lines):
        im = re.match(r"^([ \t]*)(description|title):", ln)
        if im:
            insert_at = i + 1
            indent = im.group(1)
            if im.group(2) == "description":
                break
    lines.insert(insert_at, "%simage: '%s'" % (indent, url))
    fm_new = "\n".join(lines)
    return None if fm_new == fm else text[:m.start(1)] + fm_new + text[m.end(1):]

changed, skipped = [], []
for fname, pid in MAPPING.items():
    # 顶层文件或「搭建一个 Fuwari 博客」目录内的文件
    fpath = os.path.join(POSTS, fname)
    if not os.path.isfile(fpath):
        fpath = os.path.join(POSTS, "Fuwari博客改造计划：搭建一个 Fuwari 博客", fname)
    if not os.path.isfile(fpath):
        skipped.append(fname); continue
    url = U.format(pid=pid)
    result = process(fpath, url)
    if result is None:
        changed.append("(no-change) " + fname)
    elif result == "NO_FRONTMAtter":
        skipped.append(fname + " [no frontmatter]")
    else:
        with open(fpath, "w", encoding="utf-8", newline="") as f:
            f.write(result)
        changed.append(fname)

print("CHANGED %d:" % len(changed))
for c in changed: print("  " + c)
print("SKIPPED %d:" % len(skipped))
for s in skipped: print("  " + s)

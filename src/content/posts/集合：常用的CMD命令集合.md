---
title: '常用 CMD 命令提示符大全'
published: 2026-07-06
description: 'Windows 系统管理必备！本文汇总了常用的 CMD 命令，涵盖系统工具调用、磁盘管理及电源管理快捷指令，助你摆脱繁琐的图形界面操作。'
image: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?q=80&w=1200&h=800&auto=format&fit=crop'
tags: ['CMD命令', '系统管理', 'Windows工具', '指令集']
category: 技术茶谈
draft: false 
lang: 'zh-CN'
order: 0
---


**CMD 命令提示符**是 Windows 操作系统中一个重要的工具，通过 CMD 命令可以执行各种系统管理和配置操作。本文将介绍常用的 CMD 命令，帮助读者更好地了解和使用 CMD 命令提示符。

### 常用系统管理命令表

| 序号 | 命令名称 | 功能描述 |
| :--- | :--- | :--- |
| 1 | `calc` | 启动计算器 |
| 2 | `appwiz.cpl` | 程序和功能（卸载或修改程序） |
| 3 | `certmgr.msc` | 证书管理实用程序 |
| 4 | `charmap` | 启动字符映射表 |
| 5 | `chkdsk.exe` | Chkdsk 磁盘检查（需管理员权限） |
| 6 | `cleanmgr` | 打开磁盘清理工具 |
| 7 | `cliconfg` | SQL SERVER 客户端网络实用工具 |
| 8 | `cmstp` | 连接管理器配置文件安装程序 |
| 9 | `cmd.exe` | 打开新的 CMD 命令提示符窗口 |
| 10 | `colorcpl` | 颜色管理（配置显示器和打印机色彩） |
| 11 | `compmgmt.msc` | 计算机管理 |
| 12 | `credwiz` | 备份或还原储存的用户名和密码 |
| 13 | `comexp.msc` | 打开系统组件服务 |
| 14 | `control` | 打开控制面板 |
| 15 | `dcomcnfg` | 打开系统组件服务 |
| 16 | `Dccw` | 显示颜色校准 |
| 17 | `devmgmt.msc` | 设备管理器 |
| 18 | `desk.cpl` | 屏幕分辨率设置 |
| 19 | `dfrgui` | 优化驱动器（Win7 为 `dfrg.msc` 磁盘碎片整理） |
| 20 | `dialer` | 电话拨号程序 |
| 21 | `diskmgmt.msc` | 磁盘管理 |
| 22 | `dvdplay` | DVD 播放器 |
| 23 | `dxdiag` | 检查 DirectX 信息 |
| 24 | `eudcedit` | 造字程序 |

---

### 电源管理快捷命令

针对自动关机与锁定操作，可以使用以下快速指令：

* **自动关机**：`Shutdown -s -t 30` （表示 30 秒后自动关机）
* **取消关机**：`shutdown -a`
* **自动重启**：`Shutdown -r -t 30` （表示 30 秒后自动重启）
* **锁定计算机**：`rundll32 user32.dll,LockWorkStation`

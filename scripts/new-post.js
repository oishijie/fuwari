/* This is a script to create a new post markdown file with front-matter */

import fs from "fs"
import path from "path"

function getDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error(`Error: No filename argument provided
Usage: pnpm new-post -- <filename>

<filename> 会成为文章的 URL：src/content/posts/<filename>.md -> /posts/<filename>/
请用英文小写 + 连字符（如 sidebar-collapse），中文名会变成一长串百分号编码。
标题写在 frontmatter 的 title 里，不受此限制。`)
  process.exit(1) // Terminate the script and return error code 1
}

let fileName = args[0]

// 文件名即 URL：Astro 用文件名生成 slug，且会对它做 slugify
//（转小写、空格转 -、标点删掉）。中文名最终是一串 %E4%BE%A7... 的编码，
// 既不美观也不利于分享，所以这里给个提醒（不阻断，仍按用户给的创建）。
if (/[^\x20-\x7E]/.test(fileName)) {
  console.warn(`\n⚠️  文件名含非 ASCII 字符：${fileName}`)
  console.warn("   本博客的文章 URL 直接取文件名，中文名会变成一长串 %E4%BE%A7... 编码。")
  console.warn('   建议改成英文小写 + 连字符，例如：pnpm new-post "sidebar-collapse"\n')
}

// Add .md extension if not present
const fileExtensionRegex = /\.(md|mdx)$/i
if (!fileExtensionRegex.test(fileName)) {
  fileName += ".md"
}

const targetDir = "./src/content/posts/"
const fullPath = path.join(targetDir, fileName)

if (fs.existsSync(fullPath)) {
  console.error(`Error: File ${fullPath} already exists `)
  process.exit(1)
}

// recursive mode creates multi-level directories
const dirPath = path.dirname(fullPath)
if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
}

const content = `---
title: ${args[0]}
published: ${getDate()}
description: ''
image: ''
tags: []
category: ''
draft: false 
lang: ''
---
`

fs.writeFileSync(path.join(targetDir, fileName), content)

console.log(`Post ${fullPath} created`)

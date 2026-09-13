#!/usr/bin/env node
/**
 * blog.mjs — 留心博客本地管理 CLI（零依赖，Node ≥ 18）
 *
 * 命令：
 *   post <标题> [--slug 英文名] [-d 描述] [-t 标签1,标签2] [-c 分类] [--dry-run]
 *   friend-add <名字> -u <URL> [-a 头像] [-d 描述] [--dry-run]
 *   friend-list
 *   publish [-m 说明] [--dry-run] [--yes]
 *   help
 *
 * 设计说明：
 *  - 文章文件名 = URL（英文小写 + 连字符），标题写 frontmatter；
 *  - posts/*.md 全站 CRLF 行尾，这里新建时统一转 CRLF；
 *  - 友链以 src/friends_data.ts 的 friends 数组为唯一真源，插入用
 *    括号深度配对定位，绝不动数组外的任何代码；
 *  - publish 必须显式确认（readline 输入 yes 或 --yes），绝不静默推送。
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const FRIENDS_FILE = path.join(ROOT, "src", "friends_data.ts");

// ---------- 工具 ----------

function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function toCRLF(text) {
  return text.replace(/\r?\n/g, "\r\n");
}

function escTs(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 解析 `--flag value` / `-f value` 与布尔旗标，返回 {flags, positionals} */
const ALIAS = { d: "desc", desc: "desc", t: "tags", tags: "tags", u: "url", url: "url", a: "avatar", avatar: "avatar", c: "category", category: "category", m: "message", message: "message", slug: "slug" };
function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  const valueFlags = new Set(["-u", "--url", "-a", "--avatar", "-d", "--desc", "-t", "--tags", "-c", "--category", "-m", "--message", "--slug"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--yes") flags.yes = true;
    else if (valueFlags.has(a)) {
      const v = argv[++i] ?? die(`选项 ${a} 缺少值`);
      const key = ALIAS[a.replace(/^--?/, "")];
      flags[key] = v;
    } else positionals.push(a);
  }
  return { flags, positionals };
}

// ---------- post ----------

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cmdPost({ flags, positionals }) {
  const title = positionals[0];
  if (!title) die('用法：blog post "<标题>" [--slug 英文名] [-d 描述] [-t 标签1,标签2] [-c 分类] [--dry-run]');
  const slug = flags.slug || slugify(title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    die(`文件名/URL 非法："${slug}"\n  文件名即 URL，必须英文小写 + 连字符（标题是中文时请用 --slug 指定英文名）。`);
  }
  const tags = (flags.tags || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fm = [
    "---",
    `title: ${title}`,
    `published: ${today()}`,
    `description: '${(flags.desc || "").replace(/'/g, "''")}'`,
    "image: ''",
    tags.length ? `tags:\n${tags.map((t) => `  - ${t}`).join("\n")}` : "tags: []",
    `category: '${flags.category || ""}'`,
    "draft: false",
    "lang: ''",
    "---",
    "",
  ].join("\n");
  const fullPath = path.join(POSTS_DIR, `${slug}.md`);
  if (fs.existsSync(fullPath)) die(`文件已存在：${fullPath}`);
  if (flags.dryRun) {
    console.log(`[dry-run] 将创建 ${path.relative(ROOT, fullPath)}\n`);
    console.log(toCRLF(fm));
    return;
  }
  fs.writeFileSync(fullPath, toCRLF(fm), "utf8");
  console.log(`✓ 已创建 ${path.relative(ROOT, fullPath)}`);
  console.log(`  URL 预览：/posts/${slug}/`);
  console.log("  接下来：用编辑器写正文，补全 tags/category，写完用 publish 发布。");
}

// ---------- 友链 ----------

/** 定位 friends 数组的起止下标，返回 {start, end}（start 指向 '['，end 指向配对的 ']'） */
function findArraySpan(text) {
  const m = text.match(/export const friends:\s*Friend\[\]\s*=\s*\[/);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let k = start; k < text.length; k++) {
    if (text[k] === "[") depth++;
    else if (text[k] === "]") {
      depth--;
      if (depth === 0) return { start, end: k };
    }
  }
  return null;
}

/** 按 {} 配对切分对象块，忽略字符串内的括号 */
function splitObjects(body) {
  const objs = [];
  let depth = 0, start = null, inStr = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== null) {
        objs.push(body.slice(start, i + 1));
        start = null;
      }
    }
  }
  return objs;
}

function parseFriends(text) {
  const span = findArraySpan(text);
  if (!span) throw new Error("未能在 friends_data.ts 中定位 friends 数组");
  const objs = splitObjects(text.slice(span.start + 1, span.end));
  return objs.map((o) => ({
    name: (o.match(/name:\s*"((?:[^"\\]|\\.)*)"/) || [])[1]?.replace(/\\"/g, '"') || "",
    url: (o.match(/url:\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "",
  }));
}

function cmdFriendList() {
  const friends = parseFriends(fs.readFileSync(FRIENDS_FILE, "utf8"));
  console.log(`共 ${friends.length} 条友链：`);
  for (const f of friends) console.log(`  - ${f.name}  ${f.url}`);
}

function cmdFriendAdd({ flags, positionals }) {
  const name = positionals[0];
  const url = flags.url;
  if (!name || !url) die('用法：blog friend-add "<名字>" -u <URL> [-a 头像URL] [-d 描述] [--dry-run]');
  const avatar = flags.avatar || "";
  const desc = flags.desc || "";
  const raw = fs.readFileSync(FRIENDS_FILE, "utf8");
  const span = findArraySpan(raw);
  if (!span) die("未能定位 friends 数组（文件结构可能已变，放弃修改）");

  const existing = parseFriends(raw);
  if (existing.some((f) => f.url === url)) die(`已存在相同 URL 的友链：${url}`);
  if (existing.some((f) => f.name === name)) die(`已存在同名友链：${name}`);

  const block = [
    "\t{",
    `\t\tname: "${escTs(name)}",`,
    `\t\turl: "${escTs(url)}",`,
    `\t\tavatar: "${escTs(avatar)}",`,
    `\t\tdescription: "${escTs(desc)}",`,
    "\t},",
  ].join("\n");

  const next = raw.slice(0, span.end) + block + "\n" + raw.slice(span.end);
  if (flags.dryRun) {
    console.log("[dry-run] 将在数组末尾插入：\n");
    console.log(block + "];");
    return;
  }
  fs.writeFileSync(FRIENDS_FILE, next, "utf8");
  console.log(`✓ 已添加友链「${name}」（第 ${existing.length + 1} 条），用 publish 发布后生效。`);
}

// ---------- publish ----------

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.error) die(`git 执行失败：${r.error.message}（请确认 git 在 PATH 中）`);
  return { out: (r.stdout || "").trim(), err: (r.stderr || "").trim(), code: r.status };
}

function cmdPublish({ flags }) {
  const st = git(["status", "--short"]);
  if (!st.out) {
    console.log("没有可发布的变更，工作区是干净的。");
    return;
  }
  const message = flags.message || `post: 内容更新 ${today()}`;
  console.log("待发布变更：");
  console.log(st.out.split("\n").map((l) => "  " + l).join("\n"));
  console.log(`\n将执行：git add -A → git commit -m "${message}" → git push origin main`);

  if (flags.dryRun) {
    console.log("\n[dry-run] 未执行任何 git 操作。");
    return;
  }

  if (!flags.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n确认发布？输入 yes 继续：", (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() !== "yes") {
        console.log("已取消。");
        return;
      }
      doPublish(message);
    });
    return;
  }
  doPublish(message);
}

function doPublish(message) {
  const add = git(["add", "-A"]);
  if (add.code !== 0) die(`git add 失败：${add.err}`);
  const commit = git(["commit", "-m", message]);
  if (commit.code !== 0) die(`git commit 失败：${commit.err}\n${commit.out}`);
  console.log(`✓ ${commit.out.split("\n")[0]}`);
  const push = git(["push", "origin", "main"]);
  if (push.code !== 0) die(`git push 失败：\n${push.err}`);
  console.log("✓ 已推送，Cloudflare Pages 正在自动构建（约 80s 后上线）。");
}

// ---------- 入口 ----------

function help() {
  console.log(`留心博客本地管理 CLI（零依赖）

  blog post <标题> [--slug 英文名] [-d 描述] [-t 标签1,标签2] [-c 分类] [--dry-run]
      新建文章。文件名即 URL（英文小写+连字符）；标题是中文时必须 --slug。
      新建后用编辑器写正文，写完 publish。

  blog friend-add "<名字>" -u <URL> [-a 头像URL] [-d 描述] [--dry-run]
      向 friends_data.ts 的 friends 数组末尾添加友链（重名/重 URL 拒绝）。

  blog friend-list
      列出全部友链。

  blog publish [-m 提交说明] [--dry-run] [--yes]
      列出变更 → add → commit → push（默认交互确认，--yes 跳过）。

  --dry-run 一律只预览不落盘。`);
}

const [cmd, ...rest] = process.argv.slice(2);
const parsed = parseArgs(rest);
switch (cmd) {
  case "post": cmdPost(parsed); break;
  case "friend-add": cmdFriendAdd(parsed); break;
  case "friend-list": cmdFriendList(); break;
  case "publish": cmdPublish(parsed); break;
  case "help":
  case undefined: help(); break;
  default: die(`未知命令：${cmd}\n\n` + help());
}

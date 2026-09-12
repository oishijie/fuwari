#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扫描文章中的围栏代码块，给“前面/内部有明确文件路径”的块自动补 title。
"""
import argparse
import re
from pathlib import Path

POSTS = Path("D:/VibeCoding/fuwari-master/src/content/posts")

# 语言标识符（避免把语言本身当文件名）
LANGS = {
    "astro", "ts", "tsx", "js", "jsx", "json", "md", "markdown",
    "sql", "css", "scss", "html", "xml", "yml", "yaml", "toml",
    "bash", "sh", "zsh", "powershell", "ps1", "cmd", "python", "py",
    "php", "csharp", "cs", "java", "kotlin", "go", "rust", "rs",
    "dockerfile", "nginx", "ini", "diff", "text", "txt", "plain",
}

# 1) 目录前缀，路径中可含 . [ ] -，允许被反引号/空格/中文标点打断
DIR_PREFIX = r"(?:(?:src|workers|public|scripts|components|layouts|pages|content)/[\w./\[\]\-]*|(?:src|components|layouts|pages|workers|public|scripts)/)"

# 2) 目录本身：src/xxx/xxx/
DIR_RE = re.compile(rf"{DIR_PREFIX}(?=[`|\s\n#\[\]，。；：！？,.;:!?]|$)", re.IGNORECASE)

# 3) 目录 + 文件名（连续）：src/xxx/xxx.ext
FULL_PATH_RE = re.compile(rf"{DIR_PREFIX}[\w./\[\]\-]+?\.[a-zA-Z0-9]{{1,10}}(?=[`|\s\n#\[\]，。；：！？,.;:!?]|$)", re.IGNORECASE)

# 4) 单独文件名：xxx.ext（引号作为可选的非捕获前缀/后缀）
FILE_RE = re.compile(
    r"(?:[`'\"]*)\b(?:package\.json|wrangler\.(?:jsonc|toml)|tsconfig\.json|README\.md|schema\.sql|migrate-reply\.sql|"
    r"[\w\[\]\-]+\.(?:astro|ts|tsx|js|jsx|jsonc|json|md|sql|css|html|yml|yaml|toml|cs|cshtml|svg|php|c))\b(?:[`'\"]*)",
    re.IGNORECASE,
)

# 围栏行：```lang 或 ```lang title="..."
FENCE_RE = re.compile(r"^(```)\s*(\S+)?(?:\s+title=\"[^\"]*\")?\s*(.*)$")


def split_path_dir_file(line):
    """尝试从 '在 `src/components` 中，创建文件 `RandomPostCard.astro`' 这类句子中拼接完整路径。"""
    matches = []
    for dm in DIR_RE.finditer(line):
        dir_path = dm.group(0).rstrip("/")
        tail = line[dm.end():]
        fm = FILE_RE.search(tail)
        # 放宽到 60 字符，覆盖反引号分隔、中文说明
        if fm and fm.start() < 60:
            file_name = fm.group(0).strip("`'\"")
            matches.append(f"{dir_path}/{file_name}")
    return matches


def extract_path(lines_before, body_first_line):
    """从代码块前文或首行注释里找一个最像文件路径的字符串。"""
    candidates = []

    # 1) 代码块首行注释通常最准
    if body_first_line:
        for pat in (FULL_PATH_RE, FILE_RE):
            m = pat.search(body_first_line.lstrip(" /#*<!-"))
            if m:
                p = m.group(0).strip("`'\"")
                if p.lower() not in LANGS:
                    return p

    # 2) 前文
    for line in lines_before:
        candidates.extend(FULL_PATH_RE.findall(line))
        candidates.extend(split_path_dir_file(line))
        for m in FILE_RE.finditer(line):
            candidates.append(m.group(0))

    if not candidates:
        return None

    # 去重、过滤语言名、过滤不完整路径
    seen = set()
    clean = []
    for p in candidates:
        p = p.strip(".,;:!?，。；：！？\"'`")
        if p.lower() in LANGS:
            continue
        if not p or p.endswith("/") or p.endswith("."):
            continue
        if p not in seen:
            seen.add(p)
            clean.append(p)

    if not clean:
        return None

    # 排序：优先完整路径（含 /），再按长度
    clean.sort(key=lambda p: (p.count("/"), len(p)), reverse=True)
    return clean[0]


def scan(dry_run=False):
    for md in sorted(POSTS.glob("*.md")):
        text = md.read_text(encoding="utf-8")
        lines = text.splitlines()
        out = []
        i = 0
        n = len(lines)
        changes = []
        while i < n:
            line = lines[i]
            m = FENCE_RE.match(line)
            if not m:
                out.append(line)
                i += 1
                continue

            lang_part = (m.group(2) or "").strip()
            has_title = 'title="' in line
            if has_title:
                out.append(line)
                i += 1
                while i < n and not lines[i].startswith("```"):
                    out.append(lines[i])
                    i += 1
                if i < n:
                    out.append(lines[i])
                    i += 1
                continue

            # 收集代码块内容
            j = i + 1
            body = []
            while j < n and not lines[j].startswith("```"):
                body.append(lines[j])
                j += 1
            end_line = lines[j] if j < n else "```"

            # 前文
            before = []
            k = i - 1
            while k >= 0 and len(before) < 3 and not lines[k].startswith("```"):
                before.insert(0, lines[k])
                k -= 1

            path = extract_path(before, body[0] if body else "")
            if path and path.lower() != lang_part.lower():
                new_fence = f"```{lang_part} title=\"{path}\""
                changes.append((md.name, i + 1, line, new_fence, path))
                out.append(new_fence)
            else:
                out.append(line)
            out.extend(body)
            out.append(end_line)
            i = j + 1

        if changes:
            if not dry_run:
                md.write_text("\n".join(out), encoding="utf-8")
            print(f"[{'WOULD UPDATE' if dry_run else 'UPDATED'}] {md.name}: {len(changes)} title(s)")
            for c in changes:
                print(f"  L{c[1]}: {c[4]}")
        else:
            print(f"[OK] {md.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-add code block titles to posts")
    parser.add_argument("--dry-run", action="store_true", help="预览改动，不写入")
    args = parser.parse_args()
    scan(dry_run=args.dry_run)
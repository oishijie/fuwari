-- 博客评论系统 · D1 表结构
-- 初始化： npm run db:init        （远程库）
--          npm run db:init:local （本地调试库）

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug  TEXT    NOT NULL,                 -- 文章标识（规范化后的路径，如 /posts/xxx/）
  author     TEXT    NOT NULL,                 -- 昵称
  email      TEXT    NOT NULL DEFAULT '',      -- 邮箱（仅站长可见，不对外输出）
  website    TEXT    NOT NULL DEFAULT '',      -- 个人网址（可选）
  content    TEXT    NOT NULL,                 -- 评论正文（纯文本存储，前端按文本渲染）
  created_at TEXT    NOT NULL,                 -- ISO8601 时间戳
  status     TEXT    NOT NULL DEFAULT 'approved',  -- approved / pending / spam
  ip_hash    TEXT    NOT NULL DEFAULT '',      -- IP 的 SHA-256，仅用于频率限制，不可逆
  parent_id  INTEGER DEFAULT NULL              -- 被回复的评论 id；NULL = 顶层评论（引用回复功能）
);

-- 按文章拉取评论
CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments (post_slug, created_at);

-- 频率限制查询
CREATE INDEX IF NOT EXISTS idx_comments_rate ON comments (ip_hash, created_at);

-- 批量统计每篇评论数
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status);

-- 回复树组装
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);

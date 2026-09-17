-- 迁移：AI 摘要缓存与限额（2026-09-17）
-- 已上线的库执行： npx wrangler d1 execute blog-comments --remote --file=./migrate-ai-summary.sql
-- 本地调试库执行： npx wrangler d1 execute blog-comments --local  --file=./migrate-ai-summary.sql

-- 摘要缓存：key 是「规范化正文的 SHA-256」，正文不改就不会重复调用模型
CREATE TABLE IF NOT EXISTS ai_summaries (
  hash       TEXT PRIMARY KEY,            -- 正文 SHA-256（缓存键）
  slug       TEXT NOT NULL DEFAULT '',    -- 文章标识，便于排查是哪篇
  summary    TEXT NOT NULL,               -- 摘要正文（单行）
  model      TEXT NOT NULL DEFAULT '',    -- 生成时使用的模型 ID
  created_at TEXT NOT NULL                -- ISO8601 时间戳
);

-- 每日生成次数限额：只有「未命中缓存、真的要跑模型」的请求才计数
CREATE TABLE IF NOT EXISTS ai_summary_quota (
  ip_hash TEXT    NOT NULL,               -- 访客 IP 的 SHA-256，不可逆
  day     TEXT    NOT NULL,               -- YYYY-MM-DD（UTC）
  used    INTEGER NOT NULL DEFAULT 0,     -- 当天已触发的生成次数
  PRIMARY KEY (ip_hash, day)
);

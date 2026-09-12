-- 迁移：为评论增加「引用回复」支持（2026-09-12）
-- 已上线的库执行： npx wrangler d1 execute blog-comments --remote --file=./migrate-reply.sql
-- 注意：D1 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，重复执行会报 duplicate column name。

ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);

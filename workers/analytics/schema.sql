-- 统计库 web_analytics 的表结构（导出于 2026-09-19）
--
-- ⚠️ 这个库**已经存在并且有历史数据**（约 1788 条访问记录，最早 2026-07-18）。
-- 本文件只是把线上结构落到仓库里存档，方便日后重建或迁移；
-- 不要拿它去"初始化"线上库。真要重建时才执行：
--   wrangler d1 execute web_analytics --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS t_website (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  domain    TEXT NOT NULL,
  create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS t_web_visitor (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id      INTEGER NOT NULL,
  url_path        TEXT NOT NULL,
  referrer_domain TEXT NOT NULL,
  referrer_path   TEXT NOT NULL,
  visitor_ip      TEXT NOT NULL,
  create_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 线上 t_website 现有数据（仅作参照，勿重复插入）：
--   id=1  localhost
--   id=2  blog.142588.xyz      ← 正式站，统计口径看这个
--   id=3  blog-fuwari-9f5.pages.dev
--   id=4  127.0.0.1

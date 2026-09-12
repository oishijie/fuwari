/**
 * 留心博客 · 评论 API
 * 运行环境：Cloudflare Workers + D1
 *
 * 路由：
 *   GET    /api/comments?slug=/posts/xxx/   拉取某篇文章的评论
 *   GET    /api/comments/count?slugs=a,b,c  批量统计评论数
 *   POST   /api/comments                    发表评论
 *   DELETE /api/comments/:id                删除评论（需 Authorization: Bearer <ADMIN_TOKEN>）
 *   GET    /geo                             访客自己的 IP 地理信息（Cloudflare 边缘数据，仅返回给本人）
 *   GET    /health                          健康检查
 */

export interface Env {
	DB: D1Database;
	ALLOWED_ORIGINS?: string;
	ADMIN_TOKEN?: string;
	REQUIRE_APPROVAL?: string;
}

interface CommentRow {
	id: number;
	post_slug: string;
	author: string;
	email: string;
	website: string;
	content: string;
	created_at: string;
	status: string;
	parent_id: number | null;
}

const LIMITS = {
	slug: 300,
	author: 40,
	email: 120,
	website: 200,
	content: 2000,
	/** 同一 IP 对同一篇文章的最小提交间隔（秒） */
	rateWindowSeconds: 30,
	pageSize: 200,
};

// ---------------------------------------------------------------- 工具函数

function parseAllowedOrigins(env: Env): string[] {
	return (env.ALLOWED_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function buildCors(req: Request, env: Env): Headers {
	const headers = new Headers();
	const origin = req.headers.get("Origin") ?? "";
	if (origin && parseAllowedOrigins(env).includes(origin)) {
		headers.set("Access-Control-Allow-Origin", origin);
	}
	headers.set("Vary", "Origin");
	headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	headers.set("Access-Control-Max-Age", "86400");
	return headers;
}

function json(data: unknown, status: number, cors: Headers): Response {
	const headers = new Headers(cors);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("Cache-Control", "no-store");
	return new Response(JSON.stringify(data), { status, headers });
}

/** 过滤控制字符（保留换行/制表），trim 后截断 */
function clean(input: unknown, max: number): string {
	if (typeof input !== "string") return "";
	return input
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
		.trim()
		.slice(0, max);
}

/** 规范化文章标识：抹掉域名、查询串，统一首尾斜杠 */
function normalizeSlug(raw: unknown): string {
	let s = typeof raw === "string" ? raw.trim() : "";
	if (/^https?:\/\//i.test(s)) {
		try {
			s = new URL(s).pathname;
		} catch {
			/* 保持原样 */
		}
	}
	s = s.split("?")[0].split("#")[0];
	s = `/${s.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/")}`;
	if (s !== "/") s += "/";
	return s.slice(0, LIMITS.slug);
}

async function hashIp(ip: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`blog-comments:${ip}`),
	);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** 对外输出的评论字段（剔除 email 与 ip_hash） */
function toPublic(row: CommentRow) {
	return {
		id: row.id,
		author: row.author,
		website: row.website,
		content: row.content,
		createdAt: row.created_at,
		parentId: row.parent_id ?? null,
	};
}

// ---------------------------------------------------------------- 处理器

async function listComments(url: URL, env: Env, cors: Headers): Promise<Response> {
	const slug = normalizeSlug(url.searchParams.get("slug"));
	const rows = await env.DB.prepare(
		`SELECT * FROM comments
		  WHERE post_slug = ? AND status = 'approved'
		  ORDER BY created_at ASC, id ASC
		  LIMIT ?`,
	)
		.bind(slug, LIMITS.pageSize)
		.all<CommentRow>();

	return json({ slug, comments: (rows.results ?? []).map(toPublic) }, 200, cors);
}

async function countComments(url: URL, env: Env, cors: Headers): Promise<Response> {
	const slugs = Array.from(
		new Set(
			(url.searchParams.get("slugs") ?? "")
				.split(",")
				.map((s) => normalizeSlug(s))
				.filter((s) => s !== "/"),
		),
	).slice(0, 50);

	if (slugs.length === 0) return json({ counts: {} }, 200, cors);

	const placeholders = slugs.map(() => "?").join(",");
	const rows = await env.DB.prepare(
		`SELECT post_slug, COUNT(*) AS n FROM comments
		  WHERE status = 'approved' AND post_slug IN (${placeholders})
		  GROUP BY post_slug`,
	)
		.bind(...slugs)
		.all<{ post_slug: string; n: number }>();

	const counts: Record<string, number> = {};
	for (const s of slugs) counts[s] = 0;
	for (const r of rows.results ?? []) counts[r.post_slug] = r.n;

	return json({ counts }, 200, cors);
}

async function createComment(req: Request, env: Env, cors: Headers): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "请求格式有误" }, 400, cors);
	}

	// 蜜罐字段：正常访客看不见它，被自动脚本填了就静默丢弃（不给爬虫报错反馈）
	if (clean(body.trap, 50) !== "") {
		return json({ ok: true, pending: false, comment: null }, 200, cors);
	}

	const slug = normalizeSlug(body.slug);
	const author = clean(body.author, LIMITS.author);
	const email = clean(body.email, LIMITS.email);
	const website = clean(body.website, LIMITS.website);
	const content = clean(body.content, LIMITS.content);

	if (slug === "/") return json({ error: "缺少文章标识" }, 400, cors);
	if (!author) return json({ error: "请填写昵称" }, 400, cors);
	if (content.length < 2) return json({ error: "评论内容太短" }, 400, cors);
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ error: "邮箱格式不正确" }, 400, cors);
	}
	if (website && !/^https?:\/\//i.test(website)) {
		return json({ error: "个人网址需以 http:// 或 https:// 开头" }, 400, cors);
	}

	// 引用回复：parentId 必须指向同一篇文章下已存在的评论
	let parentId: number | null = null;
	const rawParent = Number(body.parentId);
	if (Number.isInteger(rawParent) && rawParent > 0) {
		const parent = await env.DB.prepare(
			`SELECT id FROM comments WHERE id = ? AND post_slug = ?`,
		)
			.bind(rawParent, slug)
			.first<{ id: number }>();
		if (!parent) return json({ error: "被回复的评论已不存在" }, 400, cors);
		parentId = parent.id;
	}

	const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
	const ipHash = await hashIp(ip);

	// 频率限制
	const since = new Date(Date.now() - LIMITS.rateWindowSeconds * 1000).toISOString();
	const recent = await env.DB.prepare(
		`SELECT COUNT(*) AS n FROM comments
		  WHERE ip_hash = ? AND post_slug = ? AND created_at > ?`,
	)
		.bind(ipHash, slug, since)
		.first<{ n: number }>();

	if ((recent?.n ?? 0) > 0) {
		return json({ error: `发得有点快，请等待 ${LIMITS.rateWindowSeconds} 秒后再试` }, 429, cors);
	}

	const pending = (env.REQUIRE_APPROVAL ?? "false").toLowerCase() === "true";
	const createdAt = new Date().toISOString();

	const result = await env.DB.prepare(
		`INSERT INTO comments (post_slug, author, email, website, content, created_at, status, ip_hash, parent_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			slug,
			author,
			email,
			website,
			content,
			createdAt,
			pending ? "pending" : "approved",
			ipHash,
			parentId,
		)
		.run();

	if (pending) return json({ ok: true, pending: true }, 200, cors);

	return json(
		{
			ok: true,
			pending: false,
			comment: {
				id: result.meta?.last_row_id ?? null,
				author,
				website,
				content,
				createdAt,
				parentId,
			},
		},
		200,
		cors,
	);
}

async function deleteComment(path: string, req: Request, env: Env, cors: Headers): Promise<Response> {
	const token = env.ADMIN_TOKEN ?? "";
	if (!token) return json({ error: "服务端未配置 ADMIN_TOKEN" }, 503, cors);

	const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
	if (provided !== token) return json({ error: "无权操作" }, 401, cors);

	const id = Number(path.split("/").pop());
	if (!Number.isInteger(id) || id <= 0) return json({ error: "id 无效" }, 400, cors);

	// 级联删除整棵回复子树（含自身），避免留下孤儿回复
	const result = await env.DB.prepare(
		`WITH RECURSIVE subtree(id) AS (
		   SELECT ? AS id
		   UNION ALL
		   SELECT c.id FROM comments c JOIN subtree s ON c.parent_id = s.id
		 )
		 DELETE FROM comments WHERE id IN (SELECT id FROM subtree)`,
	)
		.bind(id)
		.run();

	return json({ ok: true, deleted: result.meta?.changes ?? 0 }, 200, cors);
}

// ---------------------------------------------------------------- 入口

/** 访客地理信息：直接读 Cloudflare 边缘注入的 request.cf，仅返回给访客本人 */
function geoLookup(request: Request, cors: Headers): Response {
	const cf = (request.cf ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === "string" ? v : "");
	const payload = {
		ip: request.headers.get("CF-Connecting-IP") ?? "",
		country: str(cf.country),
		province: str(cf.region),
		city: str(cf.city),
		lat: Number.parseFloat(str(cf.latitude)),
		lon: Number.parseFloat(str(cf.longitude)),
	};
	return json(payload, 200, cors);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cors = buildCors(request, env);
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		try {
			if (path === "/api/comments" && request.method === "GET") {
				return await listComments(url, env, cors);
			}
			if (path === "/api/comments/count" && request.method === "GET") {
				return await countComments(url, env, cors);
			}
			if (path === "/api/comments" && request.method === "POST") {
				return await createComment(request, env, cors);
			}
			if (/^\/api\/comments\/\d+$/.test(path) && request.method === "DELETE") {
				return await deleteComment(path, request, env, cors);
			}
			if (path === "/geo" && request.method === "GET") {
				return geoLookup(request, cors);
			}
			if (path === "/" || path === "/health") {
				return json({ ok: true, service: "blog-comments" }, 200, cors);
			}
			return json({ error: "Not Found" }, 404, cors);
		} catch (err) {
			console.error("[blog-comments] 未捕获异常", err);
			return json({ error: "服务异常，请稍后重试" }, 500, cors);
		}
	},
};

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
*   POST   /api/summary                     文章 AI 摘要（Workers AI 生成 + D1 缓存）
 */

export interface Env {
	DB: D1Database;
	AI: Ai;
	ALLOWED_ORIGINS?: string;
	ADMIN_TOKEN?: string;
	REQUIRE_APPROVAL?: string;
	/** Workers AI 模型 ID，缺省用 DEFAULT_AI_MODEL */
	AI_MODEL?: string;
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

/** AI 摘要相关上限 */
const AI_LIMITS = {
	/** 送去模型的最大正文字数（超出截断，控制 token 消耗） */
	content: 8000,
	/** 摘要字数安全网：超过才在句末标点处收尾。目标长度由提示词 + max_tokens 控制，这里留足余量 */
	summaryChars: 170,
	/** 同一 IP 每天最多触发的「真实生成」次数（命中缓存不计数） */
	dailyPerIp: 30,
};

/** 默认摘要模型：Workers AI 免费额度内可用，可用 wrangler.jsonc 的 AI_MODEL 覆盖 */
const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

/** 提示词版本：参与缓存 key 计算。改提示词时递增，旧摘要即自动失效 */
const AI_PROMPT_VERSION = "v2";

/** 摘要用系统提示词：约束成「单行、约 100 字、不带链接」 */
const AI_SYSTEM_PROMPT =
	"你是一个文章摘要工具。请用中文概括用户发来的文章讲了什么。" +
	"只写两三句话，总共不超过 120 字，这是硬性限制。" +
	"必须以完整的句子收尾（以句号结束），绝不允许中途断掉。" +
	"不要换行，不要分点，不要包含链接和代码，不要提及用户，" +
	"不要提出建议或补充，直接输出摘要正文。";

// ---------------------------------------------------------------- 工具函数

/** 摘要收尾：未超限原样返回；超限则回退到最后一个句末标点，避免切出半句话 */
function trimSummary(raw: string): string {
	const text = raw.replace(/\s*\n+\s*/g, " ").trim();
	if (text.length <= AI_LIMITS.summaryChars) return text;

	const head = text.slice(0, AI_LIMITS.summaryChars);
	const cut = Math.max(
		head.lastIndexOf("。"),
		head.lastIndexOf("！"),
		head.lastIndexOf("？"),
		head.lastIndexOf("；"),
	);
	// 句末标点在合理位置才用它收尾，否则退而求其次去掉尾部残句并加省略号
	if (cut >= AI_LIMITS.summaryChars * 0.5) return head.slice(0, cut + 1);
	return head.replace(/[，、,;；:：\s]+$/, "") + "…";
}

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

// ---------------------------------------------------------------- AI 摘要

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** 规范化正文：抹掉零宽字符、折叠空白 —— 保证「内容相同 → 同一个缓存键」 */
function normalizeContent(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, AI_LIMITS.content);
}

/**
* POST /api/summary  { content, slug }
* 命中 D1 缓存直接返回（不烧额度）；未命中才调 Workers AI 生成并回写。
* 防滥用：Origin 白名单 + 同 IP 每日生成次数上限。
*/
async function generateSummary(req: Request, env: Env, cors: Headers): Promise<Response> {
	if (!env.AI) return json({ error: "服务端未启用 Workers AI" }, 503, cors);

	// Origin 白名单只是第一道闸，浏览器之外可伪造，真正兜底的是下面的限额
	const origin = req.headers.get("Origin");
	if (origin && !parseAllowedOrigins(env).includes(origin)) {
		return json({ error: "来源不被允许" }, 403, cors);
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "请求格式有误" }, 400, cors);
	}

	const content = normalizeContent(body.content);
	const slug = normalizeSlug(body.slug);
	if (content.length < 80) return json({ error: "正文太短，无需摘要" }, 400, cors);

	const hash = await sha256Hex(AI_PROMPT_VERSION + "\n" + content);

	const cached = await env.DB.prepare(`SELECT summary FROM ai_summaries WHERE hash = ?`)
		.bind(hash)
		.first<{ summary: string }>();
	if (cached?.summary) return json({ summary: cached.summary, cached: true }, 200, cors);

	const ipHash = await hashIp(req.headers.get("CF-Connecting-IP") ?? "0.0.0.0");
	const day = new Date().toISOString().slice(0, 10);
	const quota = await env.DB.prepare(
		`SELECT used FROM ai_summary_quota WHERE ip_hash = ? AND day = ?`,
	)
		.bind(ipHash, day)
		.first<{ used: number }>();
	if ((quota?.used ?? 0) >= AI_LIMITS.dailyPerIp) {
		return json({ error: "今天生成得有点多，明天再来吧" }, 429, cors);
	}

	const model = env.AI_MODEL || DEFAULT_AI_MODEL;
	let summary = "";
	try {
		const ai = env.AI as unknown as {
			run: (m: string, i: Record<string, unknown>) => Promise<unknown>;
		};
		const out = await ai.run(model, {
			messages: [
				{ role: "system", content: AI_SYSTEM_PROMPT },
				{ role: "user", content },
			],
			max_tokens: 200,
		});
		const raw =
			typeof out === "string" ? out : String((out as { response?: string })?.response ?? "");
		summary = trimSummary(raw);
	} catch (err) {
		console.error("[blog-comments] AI 摘要生成失败", err);
		return json({ error: "摘要生成失败，请稍后重试" }, 502, cors);
	}

	if (!summary) return json({ error: "摘要生成失败，请稍后重试" }, 502, cors);

	try {
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO ai_summaries (hash, slug, summary, model, created_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(hash) DO UPDATE SET summary = excluded.summary, model = excluded.model`,
			).bind(hash, slug, summary, model, new Date().toISOString()),
			env.DB.prepare(
				`INSERT INTO ai_summary_quota (ip_hash, day, used) VALUES (?, ?, 1)
				ON CONFLICT(ip_hash, day) DO UPDATE SET used = used + 1`,
			).bind(ipHash, day),
		]);
	} catch (err) {
		console.error("[blog-comments] 摘要缓存写入失败", err);
	}

	return json({ summary, cached: false }, 200, cors);
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
			if (path === "/api/summary" && request.method === "POST") {
				return await generateSummary(request, env, cors);
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

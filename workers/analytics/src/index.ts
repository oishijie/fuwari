/**
 * 留心博客 · 自托管访问统计后端
 * Cloudflare Workers + D1（库 web_analytics，沿用历史数据）
 *
 * 端点
 *   POST /api/visit   记一次访问，返回该路径最新 PV / UV
 *                     → 前端 src/components/Webviso.astro（文章顶部「N 次浏览 / N 位访客」）
 *   GET  /api/stats   整站汇总：总浏览量 / 访问数 / 游客数 / 收录页面数 / 今日
 *                     → 前端 src/components/widget/SiteStats.astro（侧边栏卡片）
 *   GET  /            健康检查
 *
 * 历史背景：这个库原本由同一个域名的另一个 Worker 写入，2026-09-17 之后那个 Worker 下线，
 * 埋点一直在静默失败。重建时保持原有的请求 / 响应格式，所以前端配置一行都不用动。
 */

export interface Env {
	ANALYTICS_DB: D1Database;
	/** CORS 白名单，逗号分隔 */
	ALLOWED_ORIGINS?: string;
	/** 允许自动登记的站点域名，逗号分隔；留空表示不限制 */
	SITE_HOSTS?: string;
	/** 同一次「访问」的切分窗口（分钟） */
	SESSION_GAP_MINUTES?: string;
}

const DEFAULT_SESSION_GAP = 30;

/* ─────────────────────────── 公共工具 ─────────────────────────── */

function parseList(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

function buildCors(request: Request, env: Env): Headers {
	const headers = new Headers();
	const origin = (request.headers.get("Origin") ?? "").toLowerCase();
	if (origin && parseList(env.ALLOWED_ORIGINS).includes(origin)) {
		headers.set("Access-Control-Allow-Origin", origin);
		headers.set("Vary", "Origin");
	}
	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type");
	headers.set("Access-Control-Max-Age", "86400");
	return headers;
}

function json(payload: unknown, status: number, cors: Headers): Response {
	const headers = new Headers(cors);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("Cache-Control", "no-store");
	return new Response(JSON.stringify(payload), { status, headers });
}

/** 把 document.referrer 拆成域名 + 路径；来自本站的来源不算外部来源 */
function splitReferrer(referrer: string, hostname: string): { domain: string; path: string } {
	if (!referrer) return { domain: "", path: "" };
	try {
		const u = new URL(referrer);
		const host = u.hostname.toLowerCase();
		if (host === hostname) return { domain: "", path: "" };
		return { domain: host, path: u.pathname + u.search };
	} catch {
		return { domain: "", path: "" };
	}
}

/** 访客 IP：CF 边缘注入的 CF-Connecting-IP 最可靠，取不到就留空（不写哨兵值） */
function visitorIp(request: Request): string {
	return request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-real-ip") ?? "";
}

/** hostname → website_id；库里没有该域名时，只有命中 SITE_HOSTS 白名单才自动登记 */
async function resolveWebsiteId(db: D1Database, hostname: string, env: Env): Promise<number | null> {
	if (!hostname) return null;

	const row = await db
		.prepare(`SELECT id FROM t_website WHERE lower(domain) = ?`)
		.bind(hostname)
		.first<{ id: number }>();
	if (row && typeof row.id === "number") return row.id;

	const allowed = parseList(env.SITE_HOSTS);
	if (allowed.length > 0 && !allowed.includes(hostname)) return null;

	const name = hostname.replace(/[^a-z0-9]+/gi, "_");
	const res = await db.prepare(`INSERT INTO t_website (name, domain) VALUES (?, ?)`).bind(name, hostname).run();
	const id = res.meta?.last_row_id;
	return typeof id === "number" && id > 0 ? id : null;
}

/** 依次从 query / Referer / 请求自身推断 hostname */
function pickHostname(request: Request, url: URL): string {
	const fromQuery = (url.searchParams.get("hostname") ?? "").trim().toLowerCase();
	if (fromQuery) return fromQuery;
	const referer = request.headers.get("Referer");
	if (referer) {
		try {
			return new URL(referer).hostname.toLowerCase();
		} catch {
			/* 忽略畸形 Referer */
		}
	}
	return url.hostname.toLowerCase();
}

/* ─────────────────────── POST /api/visit ─────────────────────── */

interface VisitPayload {
	hostname?: string;
	url?: string;
	referrer?: string;
}

async function handleVisit(request: Request, env: Env, cors: Headers): Promise<Response> {
	let body: VisitPayload;
	try {
		body = (await request.json()) as VisitPayload;
	} catch {
		return json({ ret: "FAIL", msg: "invalid json" }, 400, cors);
	}

	const db = env.ANALYTICS_DB;
	const hostname = (body.hostname ?? "").trim().toLowerCase();
	const urlPath = (body.url ?? "/").trim() || "/";

	const websiteId = await resolveWebsiteId(db, hostname, env);
	if (websiteId === null) return json({ ret: "FAIL", msg: "unknown hostname" }, 400, cors);

	const ref = splitReferrer(body.referrer ?? "", hostname);

	await db
		.prepare(
			`INSERT INTO t_web_visitor (website_id, url_path, referrer_domain, referrer_path, visitor_ip)
			 VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(websiteId, urlPath, ref.domain, ref.path, visitorIp(request))
		.run();

	// 只回该路径的最新计数，前端拿它填文章顶部那行
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_ip) AS uv
			   FROM t_web_visitor
			  WHERE website_id = ? AND url_path = ?`,
		)
		.bind(websiteId, urlPath)
		.first<{ pv: number; uv: number }>();

	return json({ ret: "OK", data: { pv: row?.pv ?? 0, uv: row?.uv ?? 0 } }, 200, cors);
}

/* ─────────────────────── GET /api/stats ─────────────────────── */

interface SiteStats {
	pageviews: number;
	visits: number;
	visitors: number;
	pages: number;
	todayPageviews: number;
	todayVisitors: number;
	since: string | null;
	last: string | null;
}

async function handleStats(request: Request, env: Env, cors: Headers, url: URL): Promise<Response> {
	const db = env.ANALYTICS_DB;
	const hostname = pickHostname(request, url);

	const websiteId = await resolveWebsiteId(db, hostname, env);
	if (websiteId === null) return json({ ret: "FAIL", msg: "unknown hostname" }, 404, cors);

	const parsed = Number.parseInt(env.SESSION_GAP_MINUTES ?? "", 10);
	const gapMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_GAP;

	const totals = await db
		.prepare(
			`SELECT COUNT(*) AS pageviews,
			        COUNT(DISTINCT visitor_ip) AS visitors,
			        COUNT(DISTINCT url_path) AS pages,
			        MIN(create_at) AS since,
			        MAX(create_at) AS last
			   FROM t_web_visitor
			  WHERE website_id = ?`,
		)
		.bind(websiteId)
		.first<{
			pageviews: number;
			visitors: number;
			pages: number;
			since: string | null;
			last: string | null;
		}>();

	// 「访问数」= 会话数。表里没有现成的会话字段，用窗口函数现算：
	// 同一 IP 相邻两次访问间隔超过窗口（默认 30 分钟）就算一次新会话。
	// 窗口函数要求 SQLite 3.25+，D1 满足。
	const sessions = await db
		.prepare(
			`SELECT COUNT(*) AS visits
			   FROM (
			     SELECT create_at,
			            LAG(create_at) OVER (PARTITION BY visitor_ip ORDER BY create_at, id) AS prev
			       FROM t_web_visitor
			      WHERE website_id = ?
			   )
			  WHERE prev IS NULL
			     OR (julianday(create_at) - julianday(prev)) * 1440 > ?`,
		)
		.bind(websiteId, gapMinutes)
		.first<{ visits: number }>();

	// 今日按东八区切分（库里的 create_at 存的是 UTC）
	const today = await db
		.prepare(
			`SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_ip) AS uv
			   FROM t_web_visitor
			  WHERE website_id = ?
			    AND date(create_at, '+8 hours') = date('now', '+8 hours')`,
		)
		.bind(websiteId)
		.first<{ pv: number; uv: number }>();

	const data: SiteStats = {
		pageviews: totals?.pageviews ?? 0,
		visits: sessions?.visits ?? 0,
		visitors: totals?.visitors ?? 0,
		pages: totals?.pages ?? 0,
		todayPageviews: today?.pv ?? 0,
		todayVisitors: today?.uv ?? 0,
		since: totals?.since ?? null,
		last: totals?.last ?? null,
	};

	return json({ ret: "OK", data }, 200, cors);
}

/* ─────────────────────────── 入口 ─────────────────────────── */

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cors = buildCors(request, env);
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		try {
			if (path === "/api/visit" && request.method === "POST") {
				return await handleVisit(request, env, cors);
			}
			if (path === "/api/stats" && request.method === "GET") {
				return await handleStats(request, env, cors, url);
			}
			if (path === "/") {
				return json(
					{
						ret: "OK",
						msg: "blog-analytics is running",
						endpoints: ["POST /api/visit", "GET /api/stats"],
					},
					200,
					cors,
				);
			}
			return json({ ret: "FAIL", msg: "not found" }, 404, cors);
		} catch (err) {
			// 统计服务挂了也绝不能连累调用方：一律结构化返回
			return json({ ret: "FAIL", msg: err instanceof Error ? err.message : String(err) }, 500, cors);
		}
	},
};

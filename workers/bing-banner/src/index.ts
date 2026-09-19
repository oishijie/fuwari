/**
 * blog-bing-banner —— 把 Bing 每日壁纸变成博客 banner 的取图服务
 *
 * 前端用法：src/config.ts → siteConfig.banner.src = "https://bing.142588.xyz/today"
 *
 * 为什么必须有这个中间层：
 *   Bing 官方元数据 API（cn.bing.com/HPImageArchive.aspx）响应里没有
 *   Access-Control-Allow-Origin，浏览器前端 fetch 会被 CORS 拦死；
 *   而老教程推荐的第三方直链接口（bing.img.run / api.dujin.org）实测已挂。
 *   所以由 Worker 在边缘缓存着调一次 API，然后 302 —— 图片流量不经过 Worker，
 *   浏览器直连 Bing CDN，本 Worker 一天只中转几次元数据请求。
 *
 * 端点：
 *   GET /        → 302 到当天壁纸（等价 /today）
 *   GET /today   → 同上
 *   GET /fallback → 直接返回兜底图（302 自备图 / 200 SVG），用于验证兜底链
 *   GET /meta    → 当天壁纸元数据 JSON（标题 / 署名 / 原图），给前端展示 credit
 *   GET /health  → 健康检查
 *
 * 兜底链（三级，保证 banner 永不白板）：
 *   1. Bing API 正常          → 302 到当天壁纸
 *   2. Bing 失败 + 兜底图可达 → 302 到自备兜底图（托管在自己的图床）
 *   3. 兜底图也不可达         → 返回内置 SVG 渐变占位图（零外部依赖，约 400 B）
 *   GET /fallback 可随时直接命中第 2/3 级，用于线上验证兜底链。
 */

export interface Env {
	/** 可选。API 失败时 302 到此图片地址；留空则返回内置 SVG 占位图 */
	FALLBACK_URL: string;
	/** Bing 市场，决定图片地区与文案语言，如 zh-CN / en-US */
	BING_MKT: string;
	/** 向 Bing 请求的图片宽高 */
	IMG_WIDTH: string;
	IMG_HEIGHT: string;
	/** 跳转 / 元数据的缓存秒数 */
	CACHE_SECONDS: string;
	/** CORS 白名单，逗号分隔；填 * 表示放开 */
	ALLOWED_ORIGINS: string;
}

const BING_HOST = "https://cn.bing.com";
const BING_API = "/HPImageArchive.aspx";

interface BingImage {
	startdate?: string;
	enddate?: string;
	url?: string;
	urlbase?: string;
	title?: string;
	copyright?: string;
	copyrightlink?: string;
}

/* ── 小工具 ── */

function int(value: unknown, dflt: number): number {
	const n = Number.parseInt(String(value ?? "").trim(), 10);
	return Number.isFinite(n) && n > 0 ? n : dflt;
}

function str(value: unknown, dflt = ""): string {
	return String(value ?? "").trim() || dflt;
}

/** 命中白名单才回 CORS 头；白名单为空或为 * 时放开 */
function corsHeaders(env: Env, origin: string | null): Record<string, string> {
	const raw = str(env.ALLOWED_ORIGINS, "*");
	if (raw === "*") return { "Access-Control-Allow-Origin": "*" };
	const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
	if (origin && list.includes(origin)) {
		return {
			"Access-Control-Allow-Origin": origin,
			Vary: "Origin",
			"Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
			"Access-Control-Max-Age": "86400",
		};
	}
	return {};
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...extra },
	});
}

/** API 全挂时的兜底图：纯渐变，不含文字（避免字体依赖），约 400 字节 */
function placeholderSvg(): string {
	return '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">'
		+ '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
		+ '<stop offset="0" stop-color="#2a3f5f"/><stop offset="0.55" stop-color="#1b2a41"/>'
		+ '<stop offset="1" stop-color="#0f1a2b"/></linearGradient></defs>'
		+ '<rect width="1920" height="1080" fill="url(#g)"/></svg>';
}

/* ── Bing ── */

/** 取当天壁纸的元数据；任何异常都吞掉并返回 null（由调用方决定兜底） */
async function fetchTodayImage(env: Env): Promise<BingImage | null> {
	const mkt = str(env.BING_MKT, "zh-CN");
	const api = `${BING_HOST}${BING_API}?format=js&idx=0&n=1&mkt=${encodeURIComponent(mkt)}`;
	try {
		const res = await fetch(api, {
			// 边缘缓存住，避免每个访客都回源打一次 Bing
			cf: { cacheTtl: 1800, cacheEverything: true },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { images?: BingImage[] };
		const img = data?.images?.[0];
		if (!img || !img.urlbase) return null;
		return img;
	} catch {
		return null;
	}
}

/** urlbase 形如 /th?id=OHR.XXX_ZH-CN1234567890 → 拼成指定尺寸的图片地址 */
function buildImageUrl(env: Env, img: BingImage): string {
	const w = int(env.IMG_WIDTH, 1920);
	const h = int(env.IMG_HEIGHT, 1080);
	return `${BING_HOST}${img.urlbase}_${w}x${h}.jpg&pid=hp&w=${w}&h=${h}`;
}

/** Bing 的 copyright 形如 "图文：Alps, Bavaria (© Slawek Staszczuk/Getty Images)" */
function cleanCredit(raw?: string): string {
	return str(raw).replace(/^[^：:]*[：:]\s*/, "");
}

/* ── 路由处理 ── */

async function handleToday(env: Env, cors: Record<string, string>): Promise<Response> {
	const img = await fetchTodayImage(env);
	if (img) {
		const maxAge = int(env.CACHE_SECONDS, 3600);
		return new Response(null, {
			status: 302,
			headers: {
				Location: buildImageUrl(env, img),
				"Cache-Control": `public, max-age=${maxAge}`,
				...cors,
			},
		});
	}
	// Bing 不可用 → 交给兜底链
	return handleFallback(env, cors, "bing-unavailable");
}

/** 探活兜底图。带边缘缓存，避免兜底期间每个访客都回源探一次 */
async function isReachable(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, {
			method: "HEAD",
			cf: { cacheTtl: 300, cacheEverything: true },
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * 兜底链：自备图（**先探活**）→ 内置 SVG。
 *
 * 为什么要探活：直接 302 过去的话，图床挂掉时就只剩一个破图；
 * 而 SVG 是内联在 Worker 里的，永远不会失败 —— 那才是「永不白板」的最后一道保险。
 */
async function handleFallback(
	env: Env,
	cors: Record<string, string>,
	reason: string,
): Promise<Response> {
	const fallback = str(env.FALLBACK_URL);
	if (fallback && (await isReachable(fallback))) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: fallback,
				"Cache-Control": "public, max-age=300",
				"X-Fallback": "custom",
				"X-Fallback-Reason": reason,
				...cors,
			},
		});
	}
	return new Response(placeholderSvg(), {
		status: 200,
		headers: {
			"content-type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "public, max-age=300",
			"X-Fallback": "svg",
			"X-Fallback-Reason": reason,
			...cors,
		},
	});
}

async function handleMeta(env: Env, cors: Record<string, string>): Promise<Response> {
	const img = await fetchTodayImage(env);
	if (!img) {
		return json({ ret: "ERROR", msg: "Bing API 暂不可用" }, 503, {
			"Cache-Control": "public, max-age=60",
			...cors,
		});
	}
	const maxAge = int(env.CACHE_SECONDS, 3600);
	return json(
		{
			ret: "OK",
			data: {
				date: str(img.startdate),
				title: str(img.title),
				credit: cleanCredit(img.copyright),
				creditUrl: str(img.copyrightlink, "https://www.bing.com"),
				image: buildImageUrl(env, img),
			},
		},
		200,
		{ "Cache-Control": `public, max-age=${maxAge}`, ...cors },
	);
}

function handleHealth(env: Env, cors: Record<string, string>): Response {
	return json(
		{
			ret: "OK",
			data: {
				service: "blog-bing-banner",
				mkt: str(env.BING_MKT, "zh-CN"),
				size: `${int(env.IMG_WIDTH, 1920)}x${int(env.IMG_HEIGHT, 1080)}`,
				fallback: str(env.FALLBACK_URL) ? "custom" : "svg",
			},
		},
		200,
		cors,
	);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		const path = pathname.replace(/\/+$/, "") || "/";
		const cors = corsHeaders(env, request.headers.get("Origin"));

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			return json({ ret: "ERROR", msg: "Method Not Allowed" }, 405, cors);
		}

		if (path === "/" || path === "/today" || path === "/bing") {
			return handleToday(env, cors);
		}
		if (path === "/fallback") return handleFallback(env, cors, "manual");
		if (path === "/meta") return handleMeta(env, cors);
		if (path === "/health") return handleHealth(env, cors);

		return json(
			{ ret: "ERROR", msg: "Not Found", endpoints: ["/today", "/fallback", "/meta", "/health"] },
			404,
			cors,
		);
	},
};

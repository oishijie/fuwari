import type { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";

export type SiteConfig = {
	title: string;
	subtitle: string;
	description?: string;

	lang:
		| "en"
		| "zh_CN"
		| "zh_TW"
		| "ja"
		| "ko"
		| "es"
		| "th"
		| "vi"
		| "tr"
		| "id";

	themeColor: {
		hue: number;
		fixed: boolean;
	};
	banner: {
		enable: boolean;
		src: string;
		position?: "top" | "center" | "bottom";
		credit: {
			enable: boolean;
			text: string;
			url?: string;
		};
	};
	toc: {
		enable: boolean;
		depth: 1 | 2 | 3;
	};

	favicon: Favicon[];
};

export type Favicon = {
	src: string;
	theme?: "light" | "dark";
	sizes?: string;
};

export enum LinkPreset {
	Home = 0,
	Archive = 1,
	About = 2,
}

export type NavBarLink = {
	name: string;
	url: string;
	external?: boolean;
	children?: NavBarLink[]; // 支持二级菜单
};

export type NavBarConfig = {
	links: (NavBarLink | LinkPreset)[];
};

export type ProfileConfig = {
	avatar?: string;
	name: string;
	bio?: string;
	/**
	 * 手写签名图：透明底、单色即可（颜色由主题色填充）。
	 * 放在 public 下，例如 "/signature.webp"。
	 * 配置后 PC 端侧边栏用签名替代文字 name，并浮在头像下缘之上；留空则显示纯文字。
	 */
	signature?: string;
	links: {
		name: string;
		url: string;
		icon: string;
	}[];
};

export type LicenseConfig = {
	enable: boolean;
	name: string;
	url: string;
};

/** AI 参与程度：不使用 / 润色 / 完全 */
export type AIInvolvementLevel = "none" | "polish" | "full";

export type AIInvolvementConfig = {
	/** 是否在全站文章文末显示「AI 参与程度」标示卡 */
	enable: boolean;
	/** 文章 frontmatter 未写 aiLevel 时使用的默认档 */
	defaultLevel: AIInvolvementLevel;
};

export type LIGHT_DARK_MODE =
	| typeof LIGHT_MODE
	| typeof DARK_MODE
	| typeof AUTO_MODE;

export type BlogPostData = {
	body: string;
	title: string;
	published: Date;
	description: string;
	tags: string[];
	draft?: boolean;
	image?: string;
	category?: string;
	prevTitle?: string;
	prevSlug?: string;
	nextTitle?: string;
	nextSlug?: string;
};

export type ExpressiveCodeConfig = {
	theme: string;
};

export type UmamiConfig = {
	enable: boolean;
	src: string; // Umami 脚本地址，如 https://your-umami-server/script.js
	websiteId: string; // Umami 后台分配的 website id
};

/** 侧边栏「访问统计」卡片（数据来自自托管统计 Worker 的 GET /api/stats） */
export type SiteStatsConfig = {
	/** 是否显示卡片 */
	enable: boolean;
	/** 统计接口基址，与 webvisoConfig.baseUrl 是同一个 Worker；末尾不带斜杠 */
	apiBase: string;
	/** 卡片标题 */
	title: string;
	/** 点击卡片跳转的地址；留空则卡片不可点 */
	detailUrl?: string;
	/** 客户端缓存时长（分钟），避免每次翻页都打接口 */
	cacheMinutes?: number;
	/** 接口失败时用来撑场面的写死数字；留空则保持「-」占位（不显示假数据） */
	fallbackStats?: { pageviews: number; visits: number; visitors: number } | null;
};

export type CommentConfig = {
	enable: boolean; // 是否启用评论
	apiBase: string; // 自建评论服务地址（Cloudflare Worker），末尾不带斜杠
};

export type AISummaryConfig = {
	enable: boolean; // 是否启用文首的 AI 摘要卡片
	apiBase: string; // 摘要服务地址（与评论同一个 Worker），末尾不带斜杠
};
export type PetPosition =
	| "bottom-left"
	| "bottom-right"
	| "top-left"
	| "top-right";

export type PetConfig = {
	/** 是否启用站点桌面宠物（站点级浮层，挂在 Swup 容器外，切页不重载） */
	enable: boolean;
	/** public/pets/<id>/ 目录名，如 firefly */
	id: string;
	/** 自定义雪碧图 URL；留空则用 /pets/<id>/spritesheet.webp */
	spritesheet?: string;
	/** 显示倍率，1 = 原始单元格 192×208 */
	scale: number;
	/** 毫秒/帧 */
	speed: number;
	/** 停在屏幕哪个角落 */
	position: PetPosition;
	/** 角落边距（px） */
	margin: number;
	/** 初始动画状态，如 idle */
	state: string;
	/** 层级：本站悬浮工具栏 50 / 目录抽屉 60，故需低于它们 */
	zIndex: number;
	/** 可拖拽 */
	draggable: boolean;
	/** 单击循环切换动画 */
	clickCycle: boolean;
	/** 窄屏（<768px）不加载，省流量也不挡正文 */
	hideOnMobile: boolean;
};

/** 右下角「石蒜模拟器」挂件（Sakana! Widget）配置 */
export type SakanaConfig = {
	/** 是否启用（站点级浮层，挂在 Swup 容器外，切页不重载） */
	enable: boolean;
	/** 内置角色：chisato（千束）/ takina（泷奈） */
	character: string;
	/** 容器与组件边长（px），默认 200。
	 *  摇摆幅度上限 maxR = clamp(size/5, 30, 60)（160→32°、200→40°），
	 *  所以调小 size 会连带让摇摆变拘谨；autoFit 会用容器实测尺寸覆盖它，下限 120 */
	size: number;
	/** 底座控制栏（切换角色 / 自走模式 / 关闭） */
	controls: boolean;
	/** 支撑杆 */
	rod: boolean;
	/** 可拖拽（按住立牌拖，松手回弹） */
	draggable: boolean;
	/** 关闭按钮是否写入 localStorage 记忆（true = 下次访问也不再出现） */
	saveState: boolean;
	/** 层级：本站悬浮工具栏 50 / 目录抽屉 60，故需低于它们 */
	zIndex: number;
	/** 窄屏（<768px）不加载，省流量也不挡正文 */
	hideOnMobile: boolean;
	/** 自动上抬右下角悬浮工具栏，避免与该挂件重叠 */
	liftToolbar: boolean;
};

/** 音轨条目：Meting 与本地两种模式统一后的结构 */
export type MusicTrack = {
	/** 唯一标识（Meting 返回的歌曲 id；本地模式可写自增数字） */
	id: number | string;
	/** 曲名 */
	title: string;
	/** 艺术家 */
	artist: string;
	/** 封面地址（站内相对路径或完整 URL） */
	cover: string;
	/** 音频地址。Meting 模式下通常填 `type=url` 端点，浏览器会跟随 302 跳到真实 CDN */
	url: string;
	/** 时长（秒）；0 = 未知，播放成功后会由 audio 元数据补全 */
	duration: number;
};

/** 播放器取源方式：meting = 第三方 Meting API，local = 站内静态曲目表 */
export type MusicSourceMode = "meting" | "local";

/** 右下角悬浮工具栏里的音乐播放器配置 */
export type MusicConfig = {
	/** 是否启用（工具栏音符按钮 + 播放面板） */
	enable: boolean;
	/** 取源方式；`meting` 走 API，`local` 用下面的 localPlaylist */
	mode: MusicSourceMode;
	/** Meting API 模板。占位符 `:server` / `:type` / `:id` / `:auth` / `:r` 会被运行时替换 */
	metingApi: string;
	/** 歌单 / 专辑 / 单曲 id（含义随 type 变化）。网易云歌单在 music.163.com 地址里 playlist?id= 后面那段 */
	id: string;
	/** 平台：netease / tencent / kugou / xiami / baidu */
	server: string;
	/** 类型：playlist / album / song / artist / search */
	type: string;
	/** local 模式下的曲目表（mode = "local" 时生效） */
	localPlaylist: MusicTrack[];
	/** 初始音量 0~1；访客手动调过之后以 localStorage 里的值为准 */
	volume: number;
	/** 是否在页面加载后尝试自动播放（多数浏览器会拦截，被拦后等首次点击再补播） */
	autoplay: boolean;
};

/** 欢迎浮层的显示时机：once = 每个标签页会话首次进入 / home = 仅首页 / always = 每次页面加载 */
export type WelcomeToastMode = "once" | "home" | "always";

/** 右下角「欢迎提示」浮层配置（替代原来的侧边栏距离卡） */
export type WelcomeConfig = {
	/** 是否启用浮层 */
	enable: boolean;
	/** 显示时机 */
	mode: WelcomeToastMode;
	/** 自动关闭延时（毫秒）；0 = 不自动关，只等访客点关闭 */
	duration: number;
	/** 博主所在纬度（距离原点），默认福州 */
	homeLat: number;
	/** 博主所在经度 */
	homeLon: number;
	/** 是否在浮层里显示访客 IP（默认高斯模糊，悬停或聚焦才看得清） */
	showIp: boolean;
};

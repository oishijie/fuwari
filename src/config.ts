import type {
	AIInvolvementConfig,
	AISummaryConfig,
	CommentConfig,
	ExpressiveCodeConfig,
	ImmersiveReadingConfig,
	LicenseConfig,
	MusicConfig,
	NavBarConfig,
	PetConfig,
	ProfileConfig,
	SakanaConfig,
	SiteConfig,
	SiteStatsConfig,
	UmamiConfig,
	WelcomeConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

export const siteConfig: SiteConfig = {
	title: "留心博客",
	subtitle: "风过留痕，雁过留声",
	description: "风过留痕，雁过留声。记录技术折腾、效率工具与生活碎片。",
	lang: "zh_CN",
	themeColor: {
		hue: 250, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: false, // Hide the theme color picker for visitors
	},
	banner: {
		enable: true,
		// Bing 每日壁纸：由自建 Worker 302 转发到当天图片（见 workers/bing-banner/）
		// 远程 http(s) 地址走普通 <img> 直出，Astro 不会在构建时下载固化 → 每天自动变，无需重新构建
		src: "https://bing.142588.xyz/today", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: true, // Display the credit text of the banner image
			// 以下两项是兜底值，页面加载后会用 /meta 拿到的当天署名与链接覆盖
			text: "Bing 每日壁纸", // Credit text to be displayed
			url: "https://www.bing.com", // (Optional) URL link to the original artwork or artist's page
		},
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	// 留空 = 使用 src/constants/icon.ts 里的 defaultFavicons：
	// 本地 public/favicon/*.png（亮/暗两套 × 32/128/180/192），零外部依赖。
	// ⚠️ 不要再写外链。曾指向 imgbed.142588.xyz，该域名后来 DNS 整体失效，
	// 而 siteConfig.favicon 非空会覆盖默认值，导致整站 favicon 静默加载失败（浏览器退回空白页图标）。
	favicon: [],
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		{
			name: "Now", // Jant 式 Now 页：不上首页的随手记录，48h 内更新过导航会带 *
			url: "/now/",
			external: false,
		},
		LinkPreset.About,
		{
			name: "友链",
			url: "/friends/", // Internal links should not include the base path, as it is automatically added
			external: false, // Show an external link icon and will open in a new tab
		},
		{
			name: "赞赏",
			url: "/sponsor/", // 赞赏页：收款码 + 鸣谢名单，金额一律不公开
			external: false,
		},
		{
			name: "其他", // 二级菜单
			url: "#", // 内部链接不应包含基本路径，因为它是自动添加的
			children: [
				{
					name: "主页",
					url: "https://home.142588.xyz", // 个人主页门户
					external: true, // 显示外部链接图标，并将在新选项卡中打开
				},
				{
					name: "开往",
					url: "https://www.travellings.cn/typewriter.html", // 开往（Travellings）：随机跳到友站
					external: true, // 显示外部链接图标，并将在新选项卡中打开
				},
			],
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "/avatar.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "Watch Your Back",
	bio: "风过留痕，雁过留声",
	// 手写签名图（透明底单色即可，颜色自动跟随主题色）；留空则 PC 端显示上面的 name 文字
	signature: "/signature.webp",
	links: [
		{
			name: "Github",
			icon: "fa6-brands:github",
			url: "https://github.com/oishijie",
		},
		{
			name: "Gitee",
			icon: "local:gitee",
			url: "https://gitee.com/worhllo",
		},
		{
			name: "BiliBili",
			icon: "fa6-brands:bilibili",
			url: "https://space.bilibili.com/701203100",
		},
		{
			name: "Email",
			icon: "fa6-regular:envelope",
			url: "mailto:shushan2800@agent.qq.com",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

// 文章文末的「AI 参与程度」标示卡（复刻自 blog.7003410.xyz）
// 每篇文章可在 frontmatter 里写 aiLevel: none | polish | full 单独覆盖默认档
export const aiInvolvementConfig: AIInvolvementConfig = {
	enable: true,
	defaultLevel: "polish",
};

// 文章顶部的 AI 摘要（Workers AI 生成 + D1 缓存，同一篇只烧一次额度）
export const aiSummaryConfig: AISummaryConfig = {
	enable: true,
	apiBase: "https://comments.142588.xyz",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (such as background color) are being overridden, see the astro.config.mjs file.
	// Please select a dark theme, as this blog theme currently only supports dark background color
	theme: "github-dark",
};

export const umamiConfig: UmamiConfig = {
	enable: false, // 设为 true 启用 Umami 分析
	src: "", // Umami 脚本地址，如 https://your-umami-server/script.js
	websiteId: "", // Umami 后台分配的 website id
};

// Webviso 自托管访问统计（Cloudflare Workers + D1）
// baseUrl 填你自己部署的 Worker 地址（自定义域名或 xxx.workers.dev），末尾不要带斜杠
export const webvisoConfig = {
	enable: true, // 是否启用访问统计
	baseUrl: "https://webana.142588.xyz", // 你的 Worker 后端地址
	pvId: "webviso-pv", // 显示 PV 的元素 id
	uvId: "webviso-uv", // 显示 UV 的元素 id
};

// 侧边栏「访问统计」卡片：整站汇总（总浏览量 / 访问数 / 游客数）
// 和 webvisoConfig 是同一个自托管后端（源码见 workers/analytics/）：
//   webvisoConfig 记的是「当前这一页」，这张卡片看的是「整站」
// 换域名时这两个 baseUrl 要一起改
export const siteStatsConfig: SiteStatsConfig = {
	enable: true,
	apiBase: "https://webana.142588.xyz",
	title: "统计",
	detailUrl: "", // 留空 = 卡片不可点；填了会新窗口打开
	cacheMinutes: 10, // 同一访客 10 分钟内只打一次接口
	fallbackStats: null, // 接口挂了保持「-」占位，不编数字
};

// 自建评论系统（Cloudflare Workers + D1，源码见 workers/comments/）
// 部署完成后，把 Worker 地址填到 apiBase，末尾不要带斜杠
export const commentConfig: CommentConfig = {
	enable: true, // 是否启用评论
	apiBase: "https://comments.142588.xyz", // Cloudflare Worker 后端地址
};

// 站点桌面宠物（Codex 宠物包 + 无依赖 SDK，见 public/lib/codex-pet.js）
// 换角色：把新宠物包放进 public/pets/<id>/（pet.json + spritesheet.webp），改下面的 id 即可
// 关掉：enable 设为 false
export const petConfig: PetConfig = {
	enable: false, // 2026-09-18 按用户要求先关停（代码与资源全部保留，改回 true 即恢复）
	id: "firefly", // 流萤；可选 fufu-sticker / ganyu-pet-v2 / rich-paimon（须自备资源）
	spritesheet: "", // 留空 = /pets/<id>/spritesheet.webp
	scale: 0.5, // 0.5 → 96×104 px
	speed: 120, // 毫秒/帧
	position: "bottom-left", // 左下角（右下角已被悬浮工具栏占用）
	margin: 18,
	state: "idle",
	zIndex: 40, // 低于悬浮工具栏(50)与目录抽屉(60)
	draggable: true,
	clickCycle: true,
	hideOnMobile: true,
};

// 「石蒜模拟器」挂件（Sakana! Widget，MIT 代码 + 角色插画不可商用，见 public/lib/LICENSE-sakana-widget.txt）
// 玩法：按住立牌拖动、松手弹跳；底座控制栏依次为 切换角色 / 自走模式 / 上游仓库 / 关闭
// 挪位置：按住左上角小拖动柄拖到任意处（位置记忆在浏览器里），双击拖动柄回默认角
// 换角色：改 character 为 chisato 或 takina；关掉：enable 设为 false
export const sakanaConfig: SakanaConfig = {
	enable: true,
	character: "chisato", // 千束；takina 为泷奈
	position: "bottom-left", // 默认停靠角：左下（拖过之后以本地记忆为准）
	movable: true, // 左上角拖动柄：挪整个挂件的位置
	rememberPosition: true, // 记住拖过的位置，刷新与切页都保持
	size: 200, // SDK 默认值；容器与组件同尺寸（人物图 = size/1.25 = 160px，canvas = size×1.5 = 300px）
	controls: true,
	rod: true,
	draggable: true,
	saveState: false, // false = 点关闭仅本次移除，刷新恢复
	zIndex: 40, // 低于悬浮工具栏(50)与目录抽屉(60)，与桌面宠物同层
	hideOnMobile: true,
	liftToolbar: true, // 挂件会占用右下角底部，自动上抬悬浮工具栏
};

// 悬浮工具栏里的音乐播放器（复刻自 v-blog.halei0v0.top，自研单例 store + 原生 DOM，不用任何播放器库）
// 两种取源：
//   meting —— 走第三方 Meting API（返回 JSON 歌单，音频地址是 meting 自己的 type=url 端点，靠 302 跳真实 CDN）
//   local  —— 用下面的 localPlaylist，音频文件放 public/ 或图床
// ⚠️ meting 模式依赖第三方服务（默认的 meting.mysqil.com 实测可用且带 CORS *），随时可能失效；
//    换歌单只改 id；想让音乐彻底归自己管，就把 mode 改成 "local" 并自备音频。
export const musicConfig: MusicConfig = {
	enable: true,
	mode: "meting",
	metingApi: "https://meting.mysqil.com/api?server=:server&type=:type&id=:id&auth=:auth&r=:r",
	id: "14164869977", // 网易云歌单 id（music.163.com 地址里 playlist?id= 后面那串）
	server: "netease", // netease / tencent / kugou / xiami / baidu
	type: "playlist", // playlist / album / song / artist / search
	localPlaylist: [
		// mode = "local" 时的曲目表，形如：
		// { id: 1, title: "曲名", artist: "艺术家", cover: "/music/cover.webp", url: "/music/song.mp3", duration: 0 },
	],
	volume: 0.7, // 初始音量；访客调过之后以 localStorage 为准
	autoplay: false, // 自动播放多半会被浏览器拦，被拦后等首次点击补播
};

// 右下角「欢迎提示」浮层（替代原侧边栏距离卡）
// 数据链路：浏览器 -> 自建评论 Worker /geo（Cloudflare 边缘数据 + 国内 IP 库补正到区级）
//   ⚠️ 只有中国大陆 IP 才会去查国内库；境外 IP 直接用边缘数据——实测国内库对境外 IP 会瞎报（8.8.8.8 被说成英国）。
//   ⚠️ 访客在代理 / VPN 后面时，服务端看到的是代理出口 IP，这是任何服务端方案都解不了的死结。
// mode：once = 每个标签页会话只弹一次（sessionStorage）/ home = 仅首页 / always = 每次页面加载都弹
export const welcomeConfig: WelcomeConfig = {
	enable: true,
	mode: "once",
	duration: 6000,
	homeLat: 26.0745, // 福州市
	homeLon: 119.2965,
	showIp: true,
};

export const immersiveReadingConfig: ImmersiveReadingConfig = {
	enable: true,
	defaultOn: false,
	tocEnabled: true,
	tocPosition: "left",
	readingWidth: "46rem",
};

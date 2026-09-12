import type {
	CommentConfig,
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
	UmamiConfig,
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
		enable: false,
		src: "assets/images/demo-banner.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: false, // Display the credit text of the banner image
			text: "", // Credit text to be displayed
			url: "", // (Optional) URL link to the original artwork or artist's page
		},
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		{
			src: "https://imgbed.142588.xyz/file/1774865152688_image.png", // Path of the favicon, relative to the /public directory
			theme: "light", // (Optional) Either 'light' or 'dark', set only if you have different favicons for light and dark mode
			sizes: "32x32", // (Optional) Size of the favicon, set only if you have favicons of different sizes
		},
	],
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
			name: "开往",
			url: "https://www.travellings.cn/typewriter.html", // 内部链接不应包含基本路径，因为它是自动添加的
			external: true, // 显示外部链接图标，并将在新选项卡中打开
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
			],
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "/avatar.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "Watch Your Back",
	bio: "风过留痕，雁过留声",
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

// 自建评论系统（Cloudflare Workers + D1，源码见 workers/comments/）
// 部署完成后，把 Worker 地址填到 apiBase，末尾不要带斜杠
export const commentConfig: CommentConfig = {
	enable: true, // 是否启用评论
	apiBase: "https://comments.142588.xyz", // Cloudflare Worker 后端地址
};

// 友链数据类型定义
export interface Friend {
	name: string;
	url: string;
	avatar: string;
	description: string;
}

// 友链数据
export const friends: Friend[] = [
	{
		name: "AcoFork Blog",
		url: "https://2x.nz/",
		avatar: "https://q2.qlogo.cn/headimg_dl?dst_uin=2726730791&spec=5",
		description: "Protect What You Love!",
	},
	{
		name: "时歌的博客",
		url: "https://www.lapis.cafe/",
		avatar: "https://www.lapis.cafe/avatar.webp",
		description: "理解以真实为本，但真实本身并不会自动呈现",
	},
	{
		name: "晴雨笔记",
		url: "https://memo.moieo.net",
		avatar: "https://memo.moieo.net/favicon.ico",
		description: "素白清韵，简静安然",
	},
	{
		name: "伏枥之间",
		url: "https://leehenry.top",
		avatar: "https://leehenry.top/favicon.ico",
		description: "漫想与杂谈，记录生活与思考",
	},
	{
		name: "LQQ",
		url: "https://lqq.ai/",
		avatar: "https://lqq.ai/favicon.ico",
		description: "记录所见，思考未完",
	},
	{
		name: "莫比乌斯",
		url: "https://mobius.blog",
		avatar: "https://mobius.blog/favicon.ico",
		description: "写作，一场自我悖驳的旅程",
	},
	{
		name: "夏夜流萤",
		url: "https://blog.cuteleaf.cn/",
		avatar: "https://blog.cuteleaf.cn/favicon.ico",
		description: "飞萤之火自无梦的长夜亮起，绽放在终竟的明天",
	},
	{
		name: "清羽飞扬",
		url: "https://blog.liushen.fun/",
		avatar: "https://p.liiiu.cn/i/2025/03/13/67d2fc82d329c.webp",
		description: "清羽飞扬的技术博客：建站教程、编程实战与生活点滴",
	},
	{
		name: "THW 的博客",
		url: "https://blog.tianhw.top/",
		avatar: "https://image.tianhw.top/avatar.webp",
		description: "前途似海，来日方长",
	},
	{
		name: "枝动力の小站",
		url: "https://zhidongli.top/",
		avatar: "https://zhidongli.top/Photo.jpg",
		description: "华风夏韵，洛水天依！",
	},
	{
		name: "阮一峰的网络日志",
		url: "https://www.ruanyifeng.com/blog/",
		avatar: "https://www.ruanyifeng.com/blog/images/person_shot.jpg",
		description: "科技爱好者周刊，记录每周值得分享的科技内容",
	},
	{
		name: "lcrworld's Blog",
		url: "https://lcrworld.xyz/",
		avatar: "https://lcrworld.xyz/apple-touch-icon.png",
		description: "个人博客，分享技术文章、项目展示与生活动态",
	},
	{
		name: "MSQY 的博客",
		url: "https://www.msqy.cc.cd/",
		avatar: "https://www.msqy.cc.cd/_astro/avatar.BhxfBZ-m_Z12zhvA.webp",
		description: "所见所闻，所思所想",
	},
	// ---- 博客组织 / 聚合站 ----
	{
		name: "开往",
		url: "https://www.travellings.cn/",
		avatar: "https://www.travellings.cn/assets/favicon.png",
		description: "友链接力：随机开往下一个博客",
	},
	{
		name: "笔墨迹",
		url: "https://blogscn.fun/",
		avatar: "https://blogscn.fun/images/blogscn-icon.png",
		description: "发现仍在认真写作的中文独立博客",
	},
	{
		name: "十年之约",
		url: "https://www.foreverblog.cn/",
		// 站点声明的只有 favicon.ico（32px 级，卡片按 132px+ 显示会糊），实测 /favicon.png 是 800×800
		avatar: "https://www.foreverblog.cn/favicon.png",
		description: "把博客从爱好变成习惯，约定十年不关站",
	},
	{
		name: "BlogsClub",
		url: "https://www.blogsclub.org/",
		avatar: "https://www.blogsclub.org/usr/themes/default/favicon.png",
		description: "互联网独立博客俱乐部",
	},
	{
		name: "博友圈",
		url: "https://www.boyouquan.com/",
		// 用 og:image 里的 PNG（120×120），比官网 rel=icon 的 .ico 清楚
		avatar: "https://www.boyouquan.com/assets/images/sites/logo/logo-small.png",
		description: "博客人的专属朋友圈",
	},
	{
		// 域名 = 🕸💍.ws（emoji 国际化域名）；该域名在国内网络不可达，故不填 avatar，
		// 卡片会自动回退成首字母色块（friends.astro 的 .friend-card-initial）。
		name: "IndieWeb Webring",
		url: "https://xn--sr8hvo.ws/",
		avatar: "",
		description: "🕸💍 IndieWeb 站点之间的环形友链",
	},
	// ---- 更多博客目录 / 聚合站 ----
	{
		name: "博客录",
		url: "https://boke.lu/",
		avatar: "https://boke.lu/favicon.ico",
		description: "博客收录展示平台，发现并展示中文独立博客",
	},
	{
		name: "有个站",
		url: "https://www.ygz.ink/",
		avatar: "https://www.ygz.ink/favicon.ico",
		description: "独立博客书架，聚合发现优质个人博客",
	},
	{
		name: "博客集",
		url: "https://bloginc.cn/",
		avatar: "https://bloginc.cn/favicon.ico",
		description: "优质中文博客图鉴",
	},
	{
		name: "博客大联盟",
		url: "https://bo.ke/",
		avatar: "https://bo.ke/favicon.ico",
		description: "发现值得反复阅读的独立博客",
	},
	{
		name: "HeyBlog",
		url: "https://www.heyblog.net/",
		avatar: "https://www.heyblog.net/favicon.ico",
		description: "发现优秀个人博客（已与集博栈合并）",
	},
	{
		name: "若梦博客",
		url: "https://www.rmbk.cc/",
		avatar: "https://www.rmbk.cc/favicon.ico",
		description: "汇聚散落的文字星光，点亮整片思想的夜空",
	},
	{
		name: "BlogFinder",
		url: "https://bf.zzxworld.com/",
		avatar: "https://bf.zzxworld.com/favicon.ico",
		description: "发现优秀的个人博客",
	},
	{
		name: "博客中心",
		url: "https://bokehub.com/",
		avatar: "https://bokehub.com/favicon.ico",
		description: "中文独立博客收录聚合平台",
	},
	{
		name: "壹個博客",
		url: "https://oneblog.net/",
		avatar: "https://oneblog.net/favicon.ico",
		description: "精选优秀个人生活博客",
	},
];

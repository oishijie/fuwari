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
	// ---- 以下为空占位（bento 布局试验用），avatar 留空时卡片显示首字母色块 ----
	{
		name: "虚位以待",
		url: "#",
		avatar: "",
		description: "期待与你交换友链",
	},
	{
		name: "待补",
		url: "#",
		avatar: "",
		description: "这里留给下一个朋友",
	},
	{
		name: "空位",
		url: "#",
		avatar: "",
		description: "友链招新中",
	},
	{
		name: "预留位",
		url: "#",
		avatar: "",
		description: "或许下一个就是你",
	},
	{
		name: "未命名",
		url: "#",
		avatar: "",
		description: "欢迎来评论区申请",
	},
	{
		name: "占位卡",
		url: "#",
		avatar: "",
		description: "等一个有趣的博客",
	},
	{
		name: "空白格",
		url: "#",
		avatar: "",
		description: "虚位以待",
	},
	{
		name: "占位",
		url: "#",
		avatar: "",
		description: "来交换友链吧",
	},
	{
		name: "等你",
		url: "#",
		avatar: "",
		description: "评论区见",
	},
];

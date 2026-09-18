// 赞赏页数据 —— 全部手动维护，改完这个文件即可，不需要动页面代码。
//
// 【收款码】把图片放进 public/sponsor/ 目录，文件名对上下面的 qr 路径即可自动生效；
//   图片暂时不存在时，页面会自动显示一个虚线占位框，不会报错也不会出现破图。
//   建议：正方形（1:1）、边长 600px 左右、webp/png，单张控制在 100KB 以内。
//
// 【鸣谢名单】按约定**不记录、不展示金额**，只记昵称与留言。
//   列表在页面上按时间倒序（最新的在最前），所以这里可以按加入的先后顺序往下写。
//   不想署名的朋友，昵称写「一位朋友」即可。

export interface SponsorWay {
	/** 收款方式名称，如：微信 / 支付宝 */
	name: string;
	/** 收款码图片路径，相对 public 目录；图片不存在时自动回退为占位框 */
	qr: string;
	/** 图片下方的一行说明，可留空 */
	hint?: string;
}

export interface Sponsor {
	/** 昵称（必填，公开显示） */
	name: string;
	/** 头像地址；留空则显示昵称首字符 */
	avatar?: string;
	/** 留言 / 一句话简介 */
	message?: string;
	/** 支持日期，格式 YYYY-MM-DD；留空则不显示 */
	date?: string;
	/** 对方的主页或站点，填了会在卡片右上角显示外链按钮 */
	url?: string;
}

/** 收款方式（按数组顺序从左到右展示） */
export const sponsorWays: SponsorWay[] = [
	{
		name: "微信",
		qr: "/sponsor/wechat.png",
		hint: "微信扫一扫",
	},
	{
		name: "支付宝",
		qr: "/sponsor/alipay.png",
		hint: "支付宝扫一扫",
	},
];

/** 鸣谢名单（页面按 date 倒序排列；date 为空则按数组顺序排在末尾） */
export const sponsors: Sponsor[] = [
	// 示例（取消注释并把内容换成真实数据即可）：
	// {
	// 	name: "一位朋友",
	// 	message: "写得不错，继续加油",
	// 	date: "2026-09-18",
	// },
];

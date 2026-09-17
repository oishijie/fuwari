import { defineCollection, z } from "astro:content";

const postsCollection = defineCollection({
	schema: z.object({
		title: z.string(),
		published: z.date(),
		updated: z.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		lang: z.string().optional().default(""),
		order: z.number().default(0), // 新增字段：0=默认, 1=置顶, -1=置底
		hidden: z.boolean().default(false), // Jant 式 Hidden from Latest：不进首页时间线和 RSS，但仍出现在归档/分类/Now 页
		/* 加密文章（借鉴「夏夜流萤」方案）：构建时把正文加密成密文写入页面，访客输密码后浏览器端解密 */
		password: z.string().optional().default(""),
		passwordHint: z.string().optional().default(""),

		/* AI 参与程度标示（文末卡片）：none=不使用 / polish=润色 / full=完全；留空取 siteConfig 默认档 */
		aiLevel: z.enum(["none", "polish", "full"]).optional(),

		/* For internal use */
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});
const specCollection = defineCollection({
	schema: z.object({}),
});
export const collections = {
	posts: postsCollection,
	spec: specCollection,
};

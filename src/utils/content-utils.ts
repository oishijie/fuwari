import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl } from "@utils/url-utils.ts";

// Retrieve posts and sort them by publication date
async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	// 原本的排序逻辑
	// 	const sorted = allBlogPosts.sort((a, b) => {
	// 		const dateA = new Date(a.data.published);
	// 		const dateB = new Date(b.data.published);
	// 		return dateA > dateB ? -1 : 1;
	// 	});
	// 	return sorted;
	// }

	// 自定义排序逻辑
	const sorted = allBlogPosts.sort((a, b) => {
		// 第一优先级：按 order 字段排序（1 > 0 > -1）
		if (a.data.order !== b.data.order) {
			return b.data.order - a.data.order; // 降序：置顶(1)在前，置底(-1)在后
		}

		// 第二优先级：order 相同时，按发布日期倒序（新文章在前）
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});

	return sorted;
}

export async function getSortedPosts() {
	const sorted = await getRawSortedPosts();

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].slug;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].slug;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	return sorted;
}

/**
 * 「可见」的文章：hidden !== true。
 * 用于首页时间线（[...page].astro）和 RSS —— Jant 式 Hidden from Latest：
 * hidden 文章不在这里出现，但仍保留在归档 / 分类 / Now 页。
 */
export async function getVisiblePosts() {
	const sorted = await getSortedPosts();
	return sorted.filter((post) => post.data.hidden !== true);
}

/**
 * 所有 hidden 文章，按发布时间倒序。
 * 用于 Now 页列表和导航栏 48h 更新星标。
 */
export type NowEntry = {
	slug: string;
	title: string;
	published: Date;
	description: string;
};

export async function getHiddenPosts(): Promise<NowEntry[]> {
	const hidden = await getCollection<"posts">("posts", ({ data }) => {
		const draftOk = import.meta.env.PROD ? data.draft !== true : true;
		return draftOk && data.hidden === true;
	});

	return hidden
		.map((post) => ({
			slug: post.slug,
			title: post.data.title,
			published: new Date(post.data.published),
			description: post.data.description || "",
		}))
		.sort((a, b) => (a.published > b.published ? -1 : 1));
}
export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
};
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		slug: post.slug,
		data: post.data,
	}));

	return sortedPostsList;
}

export type HeatmapEntry = {
	/** YYYY-MM-DD */
	date: string;
	/** 字数：去掉围栏代码块后的中日韩字符数 + 英文/数字词数 */
	words: number;
};

/**
 * 归档页热力图数据源：每篇文章的发布日期 + 字数。
 * 用 getRawSortedPosts（未剔除 body），因为字数要从正文算。
 */
export async function getHeatmapEntries(): Promise<HeatmapEntry[]> {
	const posts = await getRawSortedPosts();

	return posts.map((post) => {
		const text = (post.body ?? "").replace(/```[\s\S]*?```/g, "");
		const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
		const words = (text.match(/[A-Za-z0-9]+/g) ?? []).length;
		const d = post.data.published;
		const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
			d.getUTCDate(),
		).padStart(2, "0")}`;
		return { date, words: cjk + words };
	});
}

export type Tag = {
	name: string;
	count: number;
};export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

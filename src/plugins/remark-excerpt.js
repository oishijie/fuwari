// biome-ignore lint/suspicious/noShadowRestrictedNames: <toString from mdast-util-to-string>
import { toString } from "mdast-util-to-string";

/* Use the post's first paragraph as the excerpt */
export function remarkExcerpt() {
	return (tree, { data }) => {
		// 加密文章：正文一律不外泄。PostCard 的摘要是 `description || excerpt`，
		// 若这里不置空，等于把正文第一段明文印在首页卡片上（归档/分类/标签页同）。
		if (data.astro.frontmatter.password) {
			data.astro.frontmatter.excerpt = "";
			return;
		}
		let excerpt = "";
		for (const node of tree.children) {
			if (node.type !== "paragraph") {
				continue;
			}
			excerpt = toString(node);
			break;
		}
		data.astro.frontmatter.excerpt = excerpt;
	};
}

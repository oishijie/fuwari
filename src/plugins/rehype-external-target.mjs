/**
 * 给文章正文中的外部链接（http/https 绝对地址）自动添加 target="_blank"。
 * 站内相对链接与页内锚点不受影响，保持当前窗口打开（Swup 无刷新导航）。
 * 零依赖实现：手动遍历 hast 树，避免引入 rehype-external-links。
 */
export function rehypeExternalTarget() {
	return (tree) => {
		const walk = (node) => {
			if (!node || typeof node !== "object") return;
			if (node.type === "element" && node.tagName === "a") {
				const href = node.properties && node.properties.href;
				if (typeof href === "string" && /^https?:\/\//i.test(href)) {
					node.properties.target = "_blank";
					// rel 覆盖写（防止旧标签页对-blog 的 window.opener 访问）
					node.properties.rel = "noopener noreferrer";
				}
				return;
			}
			if (Array.isArray(node.children)) node.children.forEach(walk);
		};
		walk(tree);
	};
}

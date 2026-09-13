import { visit } from "unist-util-visit";

/**
 * [grid] … [/grid] 多图并排自适应网格画廊。
 *
 * 借鉴「夏夜流萤」的方案（blog.cuteleaf.cn/posts/dev-notes/markdown-image-grid/），
 * 在 remark（mdast）阶段把标记之间的图片段落重组为 div.image-grid.image-grid-N，
 * N = 网格内图片数量（1~4，无图时兜底 2）；样式见 src/styles/markdown.css 的 .image-grid。
 *
 * 用法：
 *
 *     [grid]
 *     ![图一](url1)
 *
 *     ![图二](url2)
 *     [/grid]
 *
 * 实现要点：
 *  - [grid] / [/grid] 各占一个段落（或与图片同段），AST 会按空行切成多个 paragraph，
 *    因此用 inGrid 状态机跨段落收集；
 *  - 只认「段落首 text 以 [grid] 开头 / 段落尾 text 以 [/grid] 结尾」，剥离标记文本本身；
 *  - 未写闭合标签时兜底原样输出（标记文本已被剥离，不会渲染出来）；
 *  - 输出走 hName/hProperties（remark-rehype 的 data 通道），由 rehype 生成
 *    <div class="image-grid image-grid-N">，后续 rehype 插件（含 PhotoSwipe 所在页面）
 *    无感知，正文容器 .custom-md 内的 img 自动被灯箱覆盖。
 */
const GRID_START = "[grid]";
const GRID_END = "[/grid]";

/** 剥掉段落首部的 [grid] 标记；命中返回 true */
function stripStart(node) {
	const first = node.children[0];
	if (first.type !== "text" || !first.value.trimStart().startsWith(GRID_START)) {
		return false;
	}
	first.value = first.value.replace(/^\s*\[grid\]\s*/, "");
	if (first.value.trim() === "") node.children.shift();
	return true;
}

/** 剥掉段落尾部的 [/grid] 标记；命中返回 true */
function stripEnd(node) {
	const last = node.children[node.children.length - 1];
	if (last.type !== "text" || !last.value.trimEnd().endsWith(GRID_END)) {
		return false;
	}
	last.value = last.value.replace(/\s*\[\/grid\]\s*$/, "");
	if (last.value.trim() === "") node.children.pop();
	return true;
}

export function remarkImageGrid() {
	return (tree) => {
		if (tree.type !== "root") return;

		const out = [];
		let grid = null; // 正在收集的网格内容（段落数组）；null = 不在网格中

		const flush = () => {
			// 动态列数：按网格内图片数量 1~4 定列，空网格兜底 2
			let count = 0;
			grid.forEach((p) =>
				visit(p, "image", () => {
					count++;
					// 注意：visitor 必须无返回值——unist-util-visit 会把返回的
					// 数字当控制信号（1=SKIP、2=EXIT），写 count++ 会泄漏计数。
				}),
			);
			const cols = count >= 1 ? Math.min(count, 4) : 2;
			out.push({
				type: "paragraph",
				data: {
					hName: "div",
					hProperties: { className: ["image-grid", `image-grid-${cols}`] },
				},
				children: grid,
			});
			grid = null;
		};

		for (const node of tree.children) {
			const isPara = node.type === "paragraph" && node.children.length > 0;

			if (grid === null) {
				if (isPara && stripStart(node)) {
					// [grid] 与图片同段、且同段闭合：[grid] ![]() [/grid]
					if (node.children.length > 0 && stripEnd(node)) {
						grid = [node];
						flush();
						continue;
					}
					// 开启网格；标记独占一段时 children 可能已空
					grid = node.children.length > 0 ? [node] : [];
					continue;
				}
				out.push(node);
			} else {
				if (isPara && stripEnd(node)) {
					if (node.children.length > 0) grid.push(node);
					flush();
					continue;
				}
				grid.push(node);
			}
		}

		// 兜底：忘了写 [/grid] —— 剩余段落原样输出，不包网格
		if (grid !== null) out.push(...grid);

		tree.children = out;
	};
}

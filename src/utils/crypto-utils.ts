import { createCipheriv, createHmac, pbkdf2Sync } from "node:crypto";

/**
 * 构建时加密工具（借鉴「夏夜流萤」《Astro 静态博客文章加密功能的实现思路》）。
 *
 * ⚠️ 本文件依赖 `node:crypto`，只能在 `.astro` 的 frontmatter（构建时 / SSR）里 import，
 *    绝不可被任何客户端脚本 import —— 否则会被打进浏览器 bundle 导致构建失败。
 *
 * 加密方案：AES-256-GCM + PBKDF2(SHA-256, 100000 次迭代)
 * 数据格式：Base64( salt[16] + iv[12] + authTag[16] + ciphertext )
 */

/** 用 HMAC-SHA256 从 "password + context" 确定性派生指定长度的字节 */
function deriveBytes(key: string, context: string, length: number): Uint8Array {
	// @types/node v22 把 Buffer 泛型化为 Buffer<ArrayBufferLike>，与 crypto 期望的
	// Uint8Array<ArrayBufferLike> 不再兼容；Buffer 运行时本就是 Uint8Array 子类，这里断言放行。
	return createHmac("sha256", key).update(context).digest().subarray(0, length) as unknown as Uint8Array;
}

/**
 * 把渲染后的文章 HTML 加密成 Base64 密文。
 *
 * salt / iv 采用**确定性派生**（而非随机），目的是让相同输入永远产生相同密文：
 * Astro 的 dev server 在 HMR 时会重渲染页面，若 salt/iv 随机，每次热更新密文都变，
 * 而 sessionStorage 里缓存的密码是按旧密文解密的 → 缓存失效、每次都要重新输密码。
 * 确定性派生同时保证不同文章之间 salt/iv 不同（context 里带了 slug）。
 */
export function encryptContent(html: string, password: string, slug: string): string {
	const salt = deriveBytes(password, `salt:${slug}`, 16);
	const iv = deriveBytes(password, `iv:${slug}`, 12);
	// pbkdf2Sync 返回 Buffer，断言为 Uint8Array 以匹配 CipherKey 签名（@types/node v22 兼容）
	const key = pbkdf2Sync(password, salt, 100000, 32, "sha256") as unknown as Uint8Array;
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()] as unknown as Uint8Array[]);
	return Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted] as unknown as Uint8Array[]).toString("base64");
}

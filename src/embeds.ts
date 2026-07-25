import type { App, TFile } from "obsidian";
import * as path from "path";

// Obsidian embeds (`![[image.jpg]]`) have no meaning to Pandoc — left to the
// generic wikilink stripping in text-utils.ts they'd collapse to bare text
// ("!image.jpg") instead of a picture. This resolves the embed target to a
// real file on disk and rewrites it into standard Pandoc image syntax.
// Only image files are handled here; other embeds (notes, PDFs, audio) are
// left for the normal wikilink stripping, same as today.

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|svg|webp|tiff?)$/i;

// Mirrors resolve-file.ts's resolution order (same-folder-relative, then
// exact path, then path suffix for qualified links, then vault-wide
// basename match) but over *all* vault files rather than just markdown ones,
// since embeds point at images, not notes.
function resolveEmbedFile(app: App, name: string, fromDir: string): TFile | null {
	const all = app.vault.getFiles();
	const norm = name.toLowerCase().replace(/\\/g, "/");
	const qualified = norm.includes("/");
	const key = (f: TFile) => f.path.toLowerCase().replace(/\\/g, "/");

	const rel = (fromDir.toLowerCase().replace(/\\/g, "/") + "/" + norm).replace(/\/+/g, "/");
	let hit = all.find((f) => key(f) === rel);
	if (hit) return hit;

	hit = all.find((f) => key(f) === norm);
	if (hit) return hit;

	if (qualified) {
		hit = all.find((f) => key(f).endsWith("/" + norm));
		return hit || null;
	}

	const base = norm.split("/").pop() as string;
	hit = all.find(
		(f) =>
			path.dirname(f.path).toLowerCase().replace(/\\/g, "/") === fromDir.toLowerCase().replace(/\\/g, "/") &&
			path.basename(f.path).toLowerCase() === base,
	);
	if (hit) return hit;
	return all.find((f) => path.basename(f.path).toLowerCase() === base) || null;
}

export function resolveImageEmbeds(app: App, content: string, fromDir: string, vaultPath: string): string {
	const re = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
	return content.replace(re, (full, rawTarget: string, rawAlt: string | undefined) => {
		const target = rawTarget.trim();
		if (!IMAGE_EXT_RE.test(target)) return full; // not an image embed — leave for stripWikilinks

		const tfile = resolveEmbedFile(app, target, fromDir);
		if (!tfile) return `*[image not found: ${target}]*`;

		// Absolute filesystem path, wrapped in <...> so spaces in vault paths
		// don't get parsed as the end of the link destination.
		const absPath = path.join(vaultPath, tfile.path);
		const alt = rawAlt && !/^\d+$/.test(rawAlt.trim()) ? rawAlt.trim() : "";
		return `![${alt}](<${absPath}>)`;
	});
}

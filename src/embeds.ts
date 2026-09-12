import type { App, TFile } from "obsidian";
import * as path from "path";

// Obsidian embeds (`![[image.jpg]]`) have no meaning to Pandoc — left to the
// generic wikilink stripping in text-utils.ts they'd collapse to bare text
// ("!image.jpg") instead of a picture. This resolves the embed target to a
// real file on disk and rewrites it into standard Pandoc image syntax.
// Only image files are handled here; other embeds (notes, PDFs, audio) are
// left for the normal wikilink stripping, same as today.

// Formats a LaTeX engine can actually \includegraphics. Anything outside this
// set is deliberately NOT emitted as an image (see UNRENDERABLE_EXT_RE).
const IMAGE_EXT_RE = /\.(png|jpe?g|pdf|eps)$/i;

// Image formats Obsidian displays happily but no LaTeX engine can read. Left
// as an image these reach xelatex as \includegraphics{...} and abort the whole
// render with "Unknown graphics extension", losing the entire PDF over one
// attachment — so they degrade to a visible placeholder instead.
const UNRENDERABLE_EXT_RE = /\.(gif|bmp|svg|webp|avif|heic|heif|tiff?)$/i;

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

interface EmbedParts {
	target: string;
	alt: string;
	width: string | null;
	height: string | null;
}

// Split an embed's innards into target + alias/size. Obsidian requires pipes
// inside a table cell to be written "\|", so both spellings are accepted —
// without this, an embed in a table keeps a trailing backslash on the
// filename, fails the extension test, and silently degrades to bare text.
// A "#heading"/"#^block" subpath is meaningless for an image and dropped.
function splitEmbed(inner: string): EmbedParts {
	const parts = inner.split(/\\\||\|/);
	const target = (parts.shift() as string).replace(/#.*$/, "").trim();

	let alt = "";
	let width: string | null = null;
	let height: string | null = null;
	for (const part of parts) {
		const t = part.trim();
		// Obsidian's size syntax: "300" (width) or "300x200" (width × height).
		const size = t.match(/^(\d+)(?:x(\d+))?$/i);
		if (size) {
			width = size[1];
			height = size[2] ?? null;
		} else if (t) {
			alt = t;
		}
	}
	return { target, alt, width, height };
}

export function resolveImageEmbeds(app: App, content: string, fromDir: string, vaultPath: string): string {
	const re = /!\[\[([^[\]]+?)\]\]/g;
	return content.replace(re, (full, inner: string) => {
		const { target, alt, width, height } = splitEmbed(inner);

		if (UNRENDERABLE_EXT_RE.test(target)) {
			// Obsidian shows it; LaTeX cannot. Say so rather than killing the run.
			return `*[image format not supported by LaTeX: ${path.basename(target)}]*`;
		}
		if (!IMAGE_EXT_RE.test(target)) return full; // not an image embed — leave for stripWikilinks

		const tfile = resolveEmbedFile(app, target, fromDir);
		if (!tfile) return `*[image not found: ${target}]*`;

		// Absolute filesystem path, wrapped in <...> so spaces in vault paths
		// don't get parsed as the end of the link destination.
		const absPath = path.join(vaultPath, tfile.path);
		// Obsidian's pixel sizes carry over as a Pandoc width/height attribute;
		// without one the image renders at its natural size, which for a pasted
		// screenshot means it swells to the full text block every time.
		const dims: string[] = [];
		if (width) dims.push(`width=${width}px`);
		if (height) dims.push(`height=${height}px`);
		const attr = dims.length ? `{${dims.join(" ")}}` : "";
		return `![${alt}](<${absPath}>)${attr}`;
	});
}

// A line holding nothing but a resolved image, as produced above.
const IMAGE_ONLY_RE = /!\[[^\]]*\]\(<[^>]*>\)(?:\{[^}]*\})?/g;

// Obsidian treats a lone embed as a block: two `![[shot.png]]` lines in a row
// stack vertically. Pandoc treats them as one paragraph, so the two images run
// side by side and — at the width a pasted screenshot actually has — spill
// past the right margin. Giving each image-only line its own paragraph
// restores the stacking. Runs after resolveImageEmbeds, on its output.
export function isolateBlockImages(content: string): string {
	const lines = content.split("\n");
	const out: string[] = [];
	let inFence = false;

	const isImageOnly = (line: string) => line.trim() !== "" && line.replace(IMAGE_ONLY_RE, "").trim() === "";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*(`{3,}|~{3,})/.test(line)) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence || !isImageOnly(line)) {
			out.push(line);
			continue;
		}
		if (out.length && out[out.length - 1].trim() !== "") out.push("");
		out.push(line);
		if (i + 1 < lines.length && lines[i + 1].trim() !== "") out.push("");
	}
	return out.join("\n");
}

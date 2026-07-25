import type { App } from "obsidian";
import * as fs from "fs";
import * as path from "path";

// Arbitrary CSS can't be translated into LaTeX, but the common case a vault
// snippet is used for — colouring, resizing, or changing the font of a run
// of text via a custom `<span class="...">` — has a direct LaTeX
// equivalent. This reads the vault's *currently enabled* snippets (the same
// set Obsidian itself applies in Reading view) and pulls out that handful
// of properties for any class selector it finds, so notes using a custom
// span class pick up matching styling in the PDF instead of rendering as
// plain, unstyled text.

export interface SpanStyle {
	color?: string; // xcolor colour spec: a 6-digit hex string, or one of XCOLOR_BASE_NAMES
	colorIsHex?: boolean;
	fontFamily?: string;
	fontSizePt?: number;
	bold?: boolean;
	italic?: boolean;
}

// xcolor's driver-independent base colour names — the subset of CSS colour
// keywords cheaply usable without shipping a full ~150-entry named-colour
// table.
const XCOLOR_BASE_NAMES = new Set([
	"red", "green", "blue", "cyan", "magenta", "yellow", "black", "white",
	"darkgray", "gray", "lightgray", "brown", "lime", "olive", "orange",
	"pink", "purple", "teal", "violet",
]);

function parseColor(value: string): { color: string; isHex: boolean } | null {
	const v = value.trim().toLowerCase();
	let m = v.match(/^#([0-9a-f]{6})$/);
	if (m) return { color: m[1], isHex: true };
	m = v.match(/^#([0-9a-f]{3})$/);
	if (m) {
		const [r, g, b] = m[1].split("");
		return { color: `${r}${r}${g}${g}${b}${b}`, isHex: true };
	}
	m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (m) {
		const hex = [m[1], m[2], m[3]].map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, "0")).join("");
		return { color: hex, isHex: true };
	}
	const named = v === "grey" ? "gray" : v;
	if (XCOLOR_BASE_NAMES.has(named)) return { color: named, isHex: false };
	return null;
}

// CSS sizes are converted to LaTeX points on a best-effort basis (96px/in,
// 72pt/in; em/rem/% assume a 10pt document base) — close enough for the
// small accent-text spans this is meant for, not pixel-exact.
function parseFontSize(value: string): number | null {
	const v = value.trim().toLowerCase();
	let m = v.match(/^([\d.]+)px$/);
	if (m) return Math.round(parseFloat(m[1]) * 0.75 * 100) / 100;
	m = v.match(/^([\d.]+)pt$/);
	if (m) return parseFloat(m[1]);
	m = v.match(/^([\d.]+)(?:em|rem)$/);
	if (m) return Math.round(parseFloat(m[1]) * 10 * 100) / 100;
	m = v.match(/^([\d.]+)%$/);
	if (m) return Math.round((parseFloat(m[1]) / 100) * 10 * 100) / 100;
	return null;
}

function parseFontFamily(value: string): string | null {
	const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
	if (!first) return null;
	const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial", "unset"]);
	if (generic.has(first.toLowerCase())) return null;
	return first;
}

// Extracts `.class { decls }` rules from CSS text. Deliberately simple — no
// nesting, no @media, no specificity resolution — enough to catch a
// snippet's own text-styling classes, which is the case this exists for.
function extractClassRules(css: string): Map<string, SpanStyle> {
	const styles = new Map<string, SpanStyle>();
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const blockRe = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = blockRe.exec(stripped)) !== null) {
		const classNames = m[1]
			.split(",")
			.map((s) => s.trim().match(/^[a-zA-Z0-9]*\.([\w-]+)$/))
			.filter((mm): mm is RegExpMatchArray => mm !== null)
			.map((mm) => mm[1]);
		if (!classNames.length) continue;

		const style: SpanStyle = {};
		const declRe = /([\w-]+)\s*:\s*([^;]+);?/g;
		let d: RegExpExecArray | null;
		while ((d = declRe.exec(m[2])) !== null) {
			const prop = d[1].trim().toLowerCase();
			const val = d[2].trim();
			if (prop === "color") {
				const c = parseColor(val);
				if (c) {
					style.color = c.color;
					style.colorIsHex = c.isHex;
				}
			} else if (prop === "font-family") {
				const f = parseFontFamily(val);
				if (f) style.fontFamily = f;
			} else if (prop === "font-size") {
				const sz = parseFontSize(val);
				if (sz) style.fontSizePt = sz;
			} else if (prop === "font-weight") {
				const w = val.toLowerCase();
				if (w === "bold" || w === "bolder" || (/^\d+$/.test(w) && parseInt(w, 10) >= 600)) style.bold = true;
			} else if (prop === "font-style") {
				if (val.toLowerCase() === "italic" || val.toLowerCase() === "oblique") style.italic = true;
			}
		}
		if (!Object.keys(style).length) continue;
		for (const name of classNames) styles.set(name, { ...styles.get(name), ...style });
	}
	return styles;
}

// Reads only the snippets Obsidian currently has enabled for this vault
// (appearance.json's enabledCssSnippets), so a PDF never picks up styling
// from a snippet the user has switched off. A missing/unreadable config is
// not an error — it just means no snippet styling is applied.
export function loadSnippetSpanStyles(app: App, vaultPath: string): Map<string, SpanStyle> {
	const styles = new Map<string, SpanStyle>();
	try {
		const configDir = app.vault.configDir;
		const appearancePath = path.join(vaultPath, configDir, "appearance.json");
		if (!fs.existsSync(appearancePath)) return styles;
		const appearance = JSON.parse(fs.readFileSync(appearancePath, "utf8")) as { enabledCssSnippets?: string[] };
		const snippetsDir = path.join(vaultPath, configDir, "snippets");
		for (const name of appearance.enabledCssSnippets ?? []) {
			const file = path.join(snippetsDir, `${name}.css`);
			if (!fs.existsSync(file)) continue;
			for (const [cls, style] of extractClassRules(fs.readFileSync(file, "utf8"))) {
				styles.set(cls, { ...styles.get(cls), ...style });
			}
		}
	} catch {
		/* best-effort: a malformed snippet/config just yields no span styling */
	}
	return styles;
}

function buildLatexPrefix(style: SpanStyle): string {
	const cmds: string[] = [];
	if (style.fontFamily) cmds.push(`\\fontspec{${style.fontFamily}}`);
	if (style.fontSizePt) cmds.push(`\\fontsize{${style.fontSizePt}}{${Math.round(style.fontSizePt * 1.2 * 100) / 100}}\\selectfont`);
	if (style.bold) cmds.push("\\bfseries");
	if (style.italic) cmds.push("\\itshape");
	if (style.color) cmds.push(style.colorIsHex ? `\\textcolor[HTML]{${style.color.toUpperCase()}}` : `\\textcolor{${style.color}}`);
	return cmds.join("");
}

// Rewrites `<span class="...">text</span>` runs whose class matches a
// snippet rule into a raw-LaTeX-bracketed group: a raw `{<styling>` inline
// opens the group, the inner text passes through normally (so Pandoc still
// escapes/typesets it), and a raw `}` closes it. Spans with nested tags or
// backticks are left untouched rather than risking a malformed rewrite —
// this is meant for short inline runs (a styled word or phrase), not blocks.
export function applySpanStyles(content: string, styles: Map<string, SpanStyle>): string {
	if (!styles.size) return content;
	const spanRe = /<span[^>]*\bclass="([^"]+)"[^>]*>([^<>`]*)<\/span>/gi;
	return content.replace(spanRe, (full, classAttr: string, inner: string) => {
		let merged: SpanStyle = {};
		let matched = false;
		for (const c of classAttr.trim().split(/\s+/)) {
			const s = styles.get(c);
			if (s) {
				merged = { ...merged, ...s };
				matched = true;
			}
		}
		if (!matched) return full;
		const prefix = buildLatexPrefix(merged);
		if (!prefix) return full;
		return "`{" + prefix + "`{=latex}" + inner + "`}`{=latex}";
	});
}

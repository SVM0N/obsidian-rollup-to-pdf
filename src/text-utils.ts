// Small string helpers shared by both walk modes (inline expansion and
// appendix mode). Ported verbatim from the original Templater script's logic
// — see templates/rollup-renderer.md in git history for the pre-plugin form.

export function stripFrontmatter(s: string): string {
	return s.replace(/^---[\s\S]*?\n---\n/, "").trim();
}

export function stripBacklinks(s: string): string {
	return s.replace(/^←.*\[\[.*\]\].*$/gm, "");
}

export function stripWikilinks(s: string): string {
	return s
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1");
}

export function pageTitle(content: string, fallback: string | null): string | null {
	const m = content.match(/^#{1,6} (.+)$/m);
	return m ? stripWikilinks(m[1]).trim() : fallback;
}

export function expansionTarget(line: string): string | null {
	const m = line.match(/^→\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
	return m ? m[1].trim() : null;
}

export function shiftHeadingLine(line: string, offset: number): string {
	return line.replace(/^(#{1,6})(\s)/, (_, h: string, sp: string) => "#".repeat(Math.min(h.length + offset, 6)) + sp);
}

export const CALLOUT_RE = /^>\s*\[!(summary|overview)\]/i;

export function calloutBox(bodyLines: string[]): string {
	const text = bodyLines.join(" ").trim();
	const escaped = text.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}~^])/g, "\\$1");
	return ["", "```{=latex}", "\\begin{tcolorbox}[colback=gray!8,colframe=gray!40,title=\\textbf{Overview},fonttitle=\\bfseries,arc=2pt,boxrule=0.4pt,left=6pt,right=6pt]", escaped, "\\end{tcolorbox}", "```", ""].join("\n");
}

// Codepoints that need a CJK font: ideographs (including extension A, the
// supplementary-plane extensions, and the compatibility block), kana, hangul,
// and the CJK punctuation and fullwidth forms that travel with them.
const CJK_RE =
	/[\u1100-\u11FF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]|[\u{20000}-\u{2FA1F}]/u;

// Whether a compiled document contains anything the CJK font is needed for.
// Naming a CJK font is not free: fontspec aborts the whole run if the family
// can't be resolved on this machine, which would turn a Latin-only document
// that used to compile into a hard failure just because a font was detected
// for it. So the setting is only passed to Pandoc when the document actually
// has CJK text in it.
export function hasCjkText(s: string): boolean {
	return CJK_RE.test(s);
}

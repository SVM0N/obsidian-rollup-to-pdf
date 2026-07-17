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

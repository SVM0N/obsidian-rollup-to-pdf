import type { App } from "obsidian";
import * as path from "path";
import { CALLOUT_RE, calloutBox, expansionTarget, pageTitle, shiftHeadingLine, stripBacklinks, stripFrontmatter, stripWikilinks } from "./text-utils";
import { expandCsvViews } from "./csv-view";
import { resolveFile } from "./resolve-file";

// ── Inline-expansion walker ──────────────────────────────────────
// Every page is parsed identically (no index/leaf distinction). Walk top to
// bottom tracking the current heading level. A line-leading "→ [[Page]]"
// expands that page inline at currentLevel+1, using the heading above it (or
// the page's filename) as the section title, then recurses. Any other "→"
// (list item, inline) stays plain text.
//
// • Headings in a page pass through, shifted to fit their slot.
// • Multiple links under one heading sit at the same level.
// • Loose content / a deeper heading after a link re-anchors with
//   "<Heading> (continued)"; a higher heading or rule does not.
// • "> [!summary]" / "> [!overview]" → Overview box; plain "> " blockquotes
//   pass through unchanged.
// • Cycles render as "*[see: X]*".
export async function walkInline(app: App, content: string, baseLevel: number, fromDir: string, visited: Set<string>, depth: number, maxDepth: number): Promise<string> {
	content = await expandCsvViews(app, content, fromDir);
	const s = stripBacklinks(stripFrontmatter(content));
	const lines = s.split("\n");
	// The page's shallowest heading maps to baseLevel. With H1s omitted (notes
	// start at H2), this keeps nesting correct regardless of the top level used.
	let topLevel = 7;
	for (const ln of lines) {
		const m = ln.match(/^(#{1,6})\s+\S/);
		if (m) topLevel = Math.min(topLevel, m[1].length);
	}
	if (topLevel === 7) topLevel = 1;
	const offset = baseLevel - topLevel;
	const out: string[] = [];

	// Before any heading is seen, the "current heading level" is one above the
	// page's base, so a bare link at the top of a page emits at baseLevel (not
	// baseLevel+1). Real headings overwrite this as they appear.
	let curHeadingLevel = Math.max(baseLevel - 1, 1);
	let curHeadingText = pageTitle(content, null);
	let sawLinkUnderHeading = false;
	let contentSinceLink = false;
	// Set to the current heading's text right after a heading is emitted, and
	// cleared by any real content. When a link fires while this is set, the
	// link reuses that heading as its section title (the linked page's own H1
	// is dropped) — so every index hop is exactly one heading level.
	let immediateHeadingText: string | null = null;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];

		// callout
		if (CALLOUT_RE.test(raw)) {
			const body = [raw.replace(CALLOUT_RE, "").replace(/^>?\s*/, "").trim()];
			while (i + 1 < lines.length && /^>/.test(lines[i + 1])) {
				body.push(lines[i + 1].replace(/^>\s?/, "").trim());
				i++;
			}
			out.push(calloutBox(body.filter(Boolean)));
			if (sawLinkUnderHeading) contentSinceLink = true;
			// A summary callout between a heading and its link does not break
			// heading-reuse: the link still adopts the heading above the callout.
			continue;
		}

		// heading
		const hm = raw.match(/^(#{1,6})\s+(.+)$/);
		if (hm) {
			const lvl = Math.min(hm[1].length + offset, 6);
			out.push("\n" + stripWikilinks(shiftHeadingLine(raw, offset)) + "\n");
			curHeadingLevel = lvl;
			curHeadingText = stripWikilinks(hm[2]).trim();
			immediateHeadingText = curHeadingText;
			sawLinkUnderHeading = false;
			contentSinceLink = false;
			continue;
		}

		// expansion link
		const target = expansionTarget(raw);
		if (target) {
			const linkLevel = Math.min(curHeadingLevel + 1, 6);

			if (depth >= maxDepth) {
				// depth cap reached: leave a plain reference instead of expanding
				out.push(`\n*[see: ${stripWikilinks(target)}]*\n`);
				sawLinkUnderHeading = true;
				contentSinceLink = false;
				immediateHeadingText = null;
				continue;
			}
			const tfile = resolveFile(app, target, fromDir);
			if (!tfile) {
				out.push(`\n${"#".repeat(linkLevel)} [Page not found: ${target}]\n`);
				sawLinkUnderHeading = true;
				contentSinceLink = false;
				immediateHeadingText = null;
				continue;
			}
			if (visited.has(tfile.path)) {
				out.push(`\n*[see: ${stripWikilinks(target)}]*\n`);
				sawLinkUnderHeading = true;
				contentSinceLink = false;
				immediateHeadingText = null;
				continue;
			}

			const childContent = await app.vault.read(tfile);
			// Title for a link that has no heading to reuse: the note's filename
			// (notes no longer carry an H1). Never the first body heading, which
			// would duplicate it.
			const childTitle = target.split("/").pop() as string;

			// If this link sits directly under a heading (only blanks/a summary
			// callout between), that heading IS the section title: reuse it and
			// nest the page's content one level below. Otherwise (a bare list of
			// sibling links, or a link after prose) emit the filename as the
			// section heading and nest the page's content below that.
			let childBaseLevel: number;
			if (immediateHeadingText !== null) {
				childBaseLevel = curHeadingLevel + 1; // under the reused heading
			} else {
				out.push(`\n${"#".repeat(linkLevel)} ${childTitle}\n`);
				childBaseLevel = Math.min(linkLevel + 1, 6); // content below the title
			}

			const nextVisited = new Set(visited);
			nextVisited.add(tfile.path);
			out.push(await walkInline(app, childContent, childBaseLevel, path.dirname(tfile.path).replace(/\\/g, "/"), nextVisited, depth + 1, maxDepth));

			sawLinkUnderHeading = true;
			contentSinceLink = false;
			immediateHeadingText = null;
			continue;
		}

		// ordinary line
		const isContent = raw.trim() !== "" && !/^-{3,}\s*$/.test(raw.trim());
		if (sawLinkUnderHeading && !contentSinceLink && isContent && curHeadingText) {
			out.push(`\n${"#".repeat(curHeadingLevel)} ${curHeadingText} (continued)\n`);
			contentSinceLink = true;
		}
		// Prose between a heading and its link does NOT break heading reuse; it
		// becomes the chapter intro. Reuse is only consumed by a link or reset
		// by the next heading (immediateHeadingText is intentionally not
		// cleared here).
		out.push(stripWikilinks(raw));
	}
	return out.join("\n");
}

// ── Appendix-mode walker ─────────────────────────────────────────
// Like walkInline, but instead of expanding a linked note INLINE, it moves
// the note's content to an APPENDIX at the end of the document and leaves a
// reference in the body: "**Page Title** (see Appendix 2.4.1)". The
// appendix number tracks the body heading position at the point the link
// appears: <section>.<subsection>.<n>, where n counts links under that
// subsection. Links found INSIDE an appendix recurse into deeper appendices
// (e.g. 2.4.1.1).
export interface Appendix {
	number: string;
	title: string;
	content: string;
}

export async function walkAppendix(
	app: App,
	content: string,
	baseLevel: number,
	fromDir: string,
	visited: Set<string>,
	depth: number,
	maxDepth: number,
	numberPrefix: string,
	appendices: Appendix[],
): Promise<string> {
	content = await expandCsvViews(app, content, fromDir);
	const s = stripBacklinks(stripFrontmatter(content));
	const lines = s.split("\n");
	let topLevel = 7;
	for (const ln of lines) {
		const m = ln.match(/^(#{1,6})\s+\S/);
		if (m) topLevel = Math.min(topLevel, m[1].length);
	}
	if (topLevel === 7) topLevel = 1;
	const offset = baseLevel - topLevel;
	const out: string[] = [];

	// Position counters for the appendix numbering of links found here.
	// secCtr increments on each shallowest-level heading; subCtr on the next
	// level down; linkCtr counts links since the last subheading change.
	let secCtr = 0,
		subCtr = 0,
		linkCtr = 0;
	let calloutAcc: string[] | null = null;
	// To embed a reference into the chapter heading: remember the out[] index
	// of the most recent heading and whether any real content has appeared
	// since.
	let lastHeadingIdx = -1;
	let contentSinceHeading = true;

	function flushCallout() {
		if (calloutAcc) {
			out.push(calloutBox(calloutAcc));
			calloutAcc = null;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];

		// accumulate a summary/overview callout block
		if (CALLOUT_RE.test(raw)) {
			calloutAcc = [];
			let j = i + 1;
			const first = raw.replace(CALLOUT_RE, "").replace(/^>?\s*/, "").trim();
			if (first) calloutAcc.push(first);
			while (j < lines.length && /^>/.test(lines[j])) {
				calloutAcc.push(lines[j].replace(/^>\s?/, "").trim());
				j++;
			}
			i = j - 1;
			continue; // a callout between a heading and its link is fine
		}
		flushCallout();

		// heading: update position counters and emit (shifted)
		const hm = raw.match(/^(#{1,6})\s+(.+)$/);
		if (hm) {
			const lvl = hm[1].length;
			if (lvl === topLevel) {
				secCtr++;
				subCtr = 0;
				if (!numberPrefix) linkCtr = 0;
			} else if (lvl === topLevel + 1) {
				subCtr++;
				if (!numberPrefix) linkCtr = 0;
			}
			out.push("\n" + stripWikilinks(shiftHeadingLine(raw, offset)) + "\n");
			lastHeadingIdx = out.length - 1;
			contentSinceHeading = false;
			continue;
		}

		// expansion link → move to appendix, leave a reference in the body
		const target = expansionTarget(raw);
		if (target) {
			const shownTitle = target.split("/").pop() as string;
			linkCtr++;

			const here = numberPrefix ? `${numberPrefix}.${linkCtr}` : subCtr > 0 ? `${secCtr}.${subCtr}.${linkCtr}` : `${secCtr}.${linkCtr}`;

			const tfile = resolveFile(app, target, fromDir);
			if (!tfile) {
				out.push(`\n**${shownTitle}** *(missing — see Appendix ${here})*\n`);
				appendices.push({ number: here, title: shownTitle, content: `*Page not found: ${shownTitle}*` });
				contentSinceHeading = true;
				continue;
			}

			const refMark = visited.has(tfile.path) ? `*(see Appendix ${here}; already included)*` : `*(see Appendix ${here})*`;

			// If a chapter heading sits directly above this link (only blanks or
			// a callout between), embed the reference INTO that heading instead
			// of emitting a separate line: "### Covert Operations (see Appendix …)".
			if (lastHeadingIdx !== -1 && !contentSinceHeading) {
				out[lastHeadingIdx] = out[lastHeadingIdx].replace(/\s*$/, "") + ` ${refMark}\n`;
			} else {
				out.push(`\n**${shownTitle}** ${refMark}\n`);
			}
			contentSinceHeading = true;

			const nextVisited = new Set(visited);
			nextVisited.add(tfile.path);
			if (visited.has(tfile.path)) continue;

			const childContent = await app.vault.read(tfile);
			const childDir = path.dirname(tfile.path).replace(/\\/g, "/");

			// Push the parent appendix entry FIRST (document order), then
			// recurse so any nested-link appendices are queued after it.
			const entry: Appendix = { number: here, title: shownTitle, content: "" };
			appendices.push(entry);

			// All appendix titles render flat at h2, so each appendix's own
			// content starts at h3 regardless of how deep its number is.
			const innerBase = 3;

			if (depth + 1 <= maxDepth) {
				entry.content = await walkAppendix(app, childContent, innerBase, childDir, nextVisited, depth + 1, maxDepth, here, appendices);
			} else {
				entry.content = stripWikilinks(stripBacklinks(stripFrontmatter(childContent)));
			}
			continue;
		}

		const cleaned = stripWikilinks(raw);
		out.push(cleaned);
		if (cleaned.trim() !== "") contentSinceHeading = true;
	}
	flushCallout();
	return out.join("\n");
}

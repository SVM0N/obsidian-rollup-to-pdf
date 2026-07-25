// The Multi-Column Markdown community plugin (MCM) lays out columns using its
// own delimiter syntax, understood only by that plugin's Reading-view
// renderer. Pandoc has no idea what to do with it — left alone, a region
// prints as literal "--- start-multi-column: ..." lines and an empty
// ```column-settings``` fence. This rewrites each region into a LaTeX
// `multicols` environment before the region reaches Pandoc.
//
// Only MCM's current (non-deprecated) "---"-based syntax is handled. Column
// settings other than "Number of Columns" (border, alignment, width, ...)
// are discarded — out of scope for this first pass. \columnbreak is used
// between columns rather than relying on natural text flow, since column
// content in practice is short (a heading + an image) and won't fill a
// column on its own.

const START_TAG_RE = /^-{3}[ \t]*(?:start-multi-column|multi-column-start):[ \t]*\S+[ \t]*$/im;
const END_TAG_RE = /^-{3}[ \t]*end-multi-column[ \t]*$/im;
const COLUMN_BREAK_RE = /^-{3}[ \t]*(?:end-column|column-end|column-break|break-column)[ \t]*-{3}[ \t]*$/gim;
const SETTINGS_BLOCK_RE = /```[ \t]*column-settings[ \t]*\r?\n([\s\S]*?)```/i;
const NUM_COLUMNS_RE = /Number of Columns:[ \t]*(\d+)/i;

function latexBlock(tex: string): string {
	return "```{=latex}\n" + tex + "\n```";
}

// Turn the raw text between a start and end tag into the multicols LaTeX
// wrapper. Returns null if the region doesn't have a parseable column count,
// in which case the caller leaves the original text untouched rather than
// guessing.
function renderRegion(body: string): string | null {
	const settingsMatch = body.match(SETTINGS_BLOCK_RE);
	if (!settingsMatch) return null;
	const numColumnsMatch = settingsMatch[1].match(NUM_COLUMNS_RE);
	const numColumns = numColumnsMatch ? parseInt(numColumnsMatch[1], 10) : NaN;
	if (!numColumns || numColumns < 1) return null;

	const settingsStart = settingsMatch.index as number;
	const withoutSettings = (body.slice(0, settingsStart) + body.slice(settingsStart + settingsMatch[0].length)).trim();

	const columns = withoutSettings.split(COLUMN_BREAK_RE).map((c) => c.trim());

	const parts = [latexBlock(`\\begin{multicols}{${numColumns}}`), columns.join(`\n\n${latexBlock("\\columnbreak")}\n\n`), latexBlock("\\end{multicols}")];
	return `\n\n${parts.join("\n\n")}\n\n`;
}

export function expandMultiColumn(content: string): string {
	const startRe = new RegExp(START_TAG_RE.source, "gim");
	let out = "";
	let cursor = 0;
	let m: RegExpExecArray | null;
	while ((m = startRe.exec(content)) !== null) {
		const regionStart = m.index;
		const afterStart = startRe.lastIndex;
		const rest = content.slice(afterStart);
		const endMatch = rest.match(END_TAG_RE);
		if (!endMatch || endMatch.index === undefined) {
			// No matching close tag — leave this start line (and everything
			// from here on) as-is rather than guessing at intent.
			continue;
		}

		const body = rest.slice(0, endMatch.index);
		const rendered = renderRegion(body);
		const regionEnd = afterStart + endMatch.index + endMatch[0].length;

		if (rendered === null) {
			// Couldn't parse a column count — leave the whole region untouched.
			continue;
		}

		out += content.slice(cursor, regionStart) + rendered;
		cursor = regionEnd;
		startRe.lastIndex = regionEnd;
	}
	out += content.slice(cursor);
	return out;
}

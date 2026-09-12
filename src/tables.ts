// Obsidian's parser lets a pipe table start on the very next line after a
// paragraph, a list item, or an image embed. Pandoc's does not: a table that
// isn't preceded by a blank line is swallowed into the running paragraph and
// reaches the PDF as a stream of literal "|" characters instead of a table.
// Since notes are authored against Obsidian's rules, the table has to be
// re-separated before Pandoc sees it.
//
// Only genuine tables are touched: a delimiter row ("|---|:--:|") directly
// under a row containing pipes. Fenced code and blockquote/callout bodies are
// skipped, so a table drawn inside a code sample stays literal.

function hasPipe(line: string): boolean {
	return line.includes("|");
}

function isBlockquote(line: string): boolean {
	return /^\s*>/.test(line);
}

// "|---|---|", "| :--- | ---: |", "---|---" — a row of nothing but dashes,
// colons and pipes. A bare "---" (a thematic break or YAML fence) has no pipe
// and is deliberately not a match.
function isDelimiterRow(line: string): boolean {
	const t = line.trim();
	if (!hasPipe(t)) return false;
	const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|");
	return cells.length > 0 && cells.every((c) => /^\s*:?-{1,}:?\s*$/.test(c));
}

export function normalizeTables(content: string): string {
	const lines = content.split("\n");
	const out: string[] = [];
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (/^\s*(`{3,}|~{3,})/.test(line)) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}

		const header = i > 0 ? lines[i - 1] : "";
		if (!isDelimiterRow(line) || !hasPipe(header) || header.trim() === "" || isBlockquote(header)) {
			out.push(line);
			continue;
		}

		// out's last entry is the header row; the one before it decides whether
		// this table is already separated from what precedes it.
		if (out.length >= 2 && out[out.length - 2].trim() !== "") {
			out.splice(out.length - 1, 0, "");
		}
		out.push(line);

		// Consume the body so its rows can't be mistaken for another header,
		// then make sure whatever follows starts its own block.
		let j = i + 1;
		while (j < lines.length && lines[j].trim() !== "" && hasPipe(lines[j])) {
			out.push(lines[j]);
			j++;
		}
		if (j < lines.length && lines[j].trim() !== "") out.push("");
		i = j - 1;
	}

	return out.join("\n");
}

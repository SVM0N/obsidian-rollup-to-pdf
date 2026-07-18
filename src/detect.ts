import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Obsidian.app is launched by Finder/launchd, not a login shell, so it does
// not inherit PATH entries added by .zshrc/.zprofile (e.g. Homebrew's
// /opt/homebrew/bin). A bare "pandoc"/"xelatex" that resolves fine in a
// terminal often fails inside Obsidian with `spawn pandoc ENOENT`. These
// candidate lists check known install locations directly by filesystem
// existence, sidestepping PATH entirely.

function findInSubdirs(baseDir: string, filename: string): string | null {
	try {
		for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const candidate = path.join(baseDir, entry.name, filename);
			if (fs.existsSync(candidate)) return candidate;
		}
	} catch {
		/* baseDir doesn't exist or isn't readable — not installed here */
	}
	return null;
}

function firstExisting(candidates: string[]): string | null {
	return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export function detectPandoc(): string | null {
	const home = os.homedir();
	const platform = os.platform();

	if (platform === "darwin") {
		return firstExisting(["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/opt/local/bin/pandoc"]);
	}
	if (platform === "linux") {
		return firstExisting(["/usr/bin/pandoc", "/usr/local/bin/pandoc", "/snap/bin/pandoc", path.join(home, ".local/bin/pandoc")]);
	}
	if (platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		return firstExisting([...(localAppData ? [path.join(localAppData, "Pandoc", "pandoc.exe")] : []), "C:\\Program Files\\Pandoc\\pandoc.exe"]);
	}
	return null;
}

export function detectPdfEngine(): string | null {
	const home = os.homedir();
	const platform = os.platform();

	if (platform === "darwin") {
		return (
			firstExisting(["/Library/TeX/texbin/xelatex", "/usr/local/bin/xelatex", "/opt/homebrew/bin/xelatex"]) ??
			findInSubdirs(path.join(home, "Library/TinyTeX/bin"), "xelatex")
		);
	}
	if (platform === "linux") {
		return (
			firstExisting(["/usr/bin/xelatex", "/usr/local/bin/xelatex"]) ??
			findInSubdirs(path.join(home, ".TinyTeX/bin"), "xelatex") ??
			findInTexliveYears("/usr/local/texlive", "xelatex")
		);
	}
	if (platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		return (
			firstExisting(localAppData ? [path.join(localAppData, "Programs", "MiKTeX", "miktex", "bin", "x64", "xelatex.exe")] : []) ??
			findInTexliveYears("C:\\texlive", "xelatex.exe", "windows")
		);
	}
	return null;
}

// TeX Live installs under <root>/<year>/bin/<arch>/<binary>; the year and
// arch subdirectories vary by install, so search all of them.
function findInTexliveYears(root: string, binary: string, archHint?: string): string | null {
	try {
		for (const year of fs.readdirSync(root, { withFileTypes: true })) {
			if (!year.isDirectory()) continue;
			const binDir = path.join(root, year.name, "bin");
			if (archHint) {
				const candidate = path.join(binDir, archHint, binary);
				if (fs.existsSync(candidate)) return candidate;
				continue;
			}
			const hit = findInSubdirs(binDir, binary);
			if (hit) return hit;
		}
	} catch {
		/* root doesn't exist — TeX Live not installed there */
	}
	return null;
}

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

// A LaTeX engine only draws a Chinese/Japanese/Korean glyph if a CJK font is
// configured; with the setting empty, xelatex drops every hanzi/kana/hangul
// with nothing but a stderr warning and still exits 0, so a vocabulary note
// compiles to a "successful" PDF full of holes. Rather than ship an empty
// default, look for a CJK font the engine is known to be able to find.
//
// Each candidate is a (file we can test for, family name fontspec resolves)
// pair: the file check is what makes this safe, since naming a font that
// isn't installed doesn't degrade the render, it aborts it.
interface FontCandidate {
	file: string;
	family: string;
}

function firstExistingFamily(candidates: FontCandidate[]): string | null {
	return candidates.find((c) => fs.existsSync(c.file))?.family ?? null;
}

export function detectCjkFont(): string | null {
	const home = os.homedir();
	const platform = os.platform();

	if (platform === "darwin") {
		return firstExistingFamily([
			// PingFang is the system default on modern macOS, but on some
			// versions it ships as an on-demand asset outside /System/Library/
			// Fonts — hence the fallbacks, all of which are always present.
			{ file: "/System/Library/Fonts/PingFang.ttc", family: "PingFang SC" },
			{ file: "/System/Library/Fonts/Supplemental/Songti.ttc", family: "Songti SC" },
			{ file: "/System/Library/Fonts/Hiragino Sans GB.ttc", family: "Hiragino Sans GB" },
			{ file: "/System/Library/Fonts/STHeiti Light.ttc", family: "Heiti SC" },
			{ file: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", family: "Arial Unicode MS" },
		]);
	}
	if (platform === "linux") {
		return firstExistingFamily([
			{ file: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", family: "Noto Sans CJK SC" },
			{ file: "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf", family: "Noto Sans CJK SC" },
			{ file: "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", family: "Noto Sans CJK SC" },
			{ file: "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", family: "Noto Sans CJK SC" },
			{ file: "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc", family: "Noto Sans CJK SC" },
			{ file: path.join(home, ".local/share/fonts/NotoSansCJK-Regular.ttc"), family: "Noto Sans CJK SC" },
			{ file: "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", family: "WenQuanYi Zen Hei" },
			{ file: "/usr/share/fonts/wenquanyi/wqy-zenhei/wqy-zenhei.ttc", family: "WenQuanYi Zen Hei" },
		]);
	}
	if (platform === "win32") {
		const fonts = path.join(process.env.SystemRoot || "C:\\Windows", "Fonts");
		return firstExistingFamily([
			{ file: path.join(fonts, "msyh.ttc"), family: "Microsoft YaHei" },
			{ file: path.join(fonts, "msyh.ttf"), family: "Microsoft YaHei" },
			{ file: path.join(fonts, "simsun.ttc"), family: "SimSun" },
			{ file: path.join(fonts, "meiryo.ttc"), family: "Meiryo" },
			{ file: path.join(fonts, "malgun.ttf"), family: "Malgun Gothic" },
		]);
	}
	return null;
}

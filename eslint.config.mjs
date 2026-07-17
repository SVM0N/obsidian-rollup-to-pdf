import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		// main.js is esbuild's generated/minified bundle (see its own banner
		// comment) — it is never edited by hand and Obsidian's review only
		// looks at the built artifact functionally (Phase 3 checks), not its
		// style. test/** is a plain Node/CommonJS test harness that never
		// ships inside the plugin bundle, so the obsidianmd plugin-specific
		// rules (no-console, ESM-only imports, etc.) don't apply to it either.
		ignores: ["main.js", "test/**", "node_modules/**"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["main.ts", "src/**/*.ts"],
		languageOptions: { parser: tsparser, parserOptions: { project: "./tsconfig.json" } },
	},
	{
		files: ["package.json"],
		rules: {
			// builtin-modules is dev-only build tooling (feeds esbuild's
			// `external` list so Node core modules aren't bundled into
			// main.js) — it is never shipped in the plugin runtime and has
			// no meaningful drop-in alternative for that narrow purpose.
			"depend/ban-dependencies": "off",
		},
	},
]);

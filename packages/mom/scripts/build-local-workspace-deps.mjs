import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const momRoot = path.resolve(scriptDir, "..");

const workspaceBuildOrder = [
	{ name: "@mariozechner/pi-tui", path: path.resolve(momRoot, "../tui"), marker: "dist/index.d.ts" },
	{ name: "@mariozechner/pi-ai", path: path.resolve(momRoot, "../ai"), marker: "dist/index.d.ts" },
	{ name: "@mariozechner/pi-agent-core", path: path.resolve(momRoot, "../agent"), marker: "dist/index.d.ts" },
	{
		name: "@mariozechner/pi-coding-agent",
		path: path.resolve(momRoot, "../coding-agent"),
		marker: "dist/index.d.ts"
	}
];

for (const pkg of workspaceBuildOrder) {
	const packageJsonPath = path.join(pkg.path, "package.json");
	if (!existsSync(packageJsonPath)) {
		continue;
	}

	const markerPath = path.join(pkg.path, pkg.marker);
	if (existsSync(markerPath)) {
		continue;
	}

	console.log(`[mom] Building local workspace dependency ${pkg.name}...`);
	const result = spawnSync("npm", ["run", "build"], {
		cwd: pkg.path,
		stdio: "inherit",
		shell: process.platform === "win32"
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const marker = join(process.cwd(), 'node_modules', '.better-sqlite3-node-module-version');
const binary = join(process.cwd(), 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const currentAbi = process.versions.modules ?? process.versions.node;

let needsRebuild = true;
if (existsSync(marker) && existsSync(binary)) {
	try {
		const saved = readFileSync(marker, 'utf8').trim();
		if (saved === currentAbi) {
			needsRebuild = false;
		}
	} catch (err) {
		// ignore read errors
	}
}

if (!needsRebuild) {
	console.log(`better-sqlite3 already built for Node ${process.version} (ABI ${currentAbi}).`);
	process.exit(0);
}

console.log(`Rebuilding better-sqlite3 for Node ${process.version} (ABI ${currentAbi})...`);

const result = spawnSync('npm', ['rebuild', 'better-sqlite3', '--build-from-source'], {
	stdio: 'inherit',
	shell: true
});

if (result.status !== 0) {
	process.exit(result.status);
}

try {
	writeFileSync(marker, `${currentAbi}\n`);
} catch (err) {
	console.warn(`Could not write marker file ${marker}: ${err.message}`);
}

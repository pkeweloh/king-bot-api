const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

// Point node-gyp at the project venv when there is one, so the build does not depend on
// whatever `python` happens to resolve to on this machine. Opt-in by presence: the Docker
// images have no .venv and keep using the system python3 they install setuptools into.
function venvPython() {
	const candidates = [
		join(process.cwd(), '.venv', 'Scripts', 'python.exe'), // Windows
		join(process.cwd(), '.venv', 'bin', 'python3') // POSIX
	];
	return candidates.find(existsSync);
}

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

const env = { ...process.env };
const python = venvPython();
if (python && !env.NODE_GYP_FORCE_PYTHON) {
	// Deliberately overrides npm's `python` config. A stale user-level ~/.npmrc pointing at
	// a long-gone interpreter is common on Windows (windows-build-tools left a python27
	// entry here), and node-gyp would otherwise fall through to whatever `python3` resolves
	// to system-wide. NODE_GYP_FORCE_PYTHON stays available as the explicit escape hatch.
	console.log(`Using project venv Python: ${python}`);
	env.npm_config_python = python;
}

const result = spawnSync('npm', ['rebuild', 'better-sqlite3', '--build-from-source'], {
	stdio: 'inherit',
	shell: true,
	env
});

if (result.status !== 0) {
	process.exit(result.status);
}

try {
	writeFileSync(marker, `${currentAbi}\n`);
} catch (err) {
	console.warn(`Could not write marker file ${marker}: ${err.message}`);
}

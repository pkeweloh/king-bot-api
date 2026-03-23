const { execSync } = require('child_process');
const { resolve } = require('path');

const pkg = require(resolve(__dirname, '../package.json'));
const version = pkg.version;

execSync(
	`docker build -t skunk1/king-bot-api:${version} -t skunk1/king-bot-api:latest -f Dockerfile .`,
	{ stdio: 'inherit' }
);

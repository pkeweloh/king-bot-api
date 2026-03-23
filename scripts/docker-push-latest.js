const { execSync } = require('child_process');
const { resolve } = require('path');

const pkg = require(resolve(__dirname, '../package.json'));
const version = pkg.version;

execSync(`docker push skunk1/king-bot-api:${version}`, { stdio: 'inherit' });
execSync('docker push skunk1/king-bot-api:latest', { stdio: 'inherit' });

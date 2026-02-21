import lowdb, { AdapterSync } from 'lowdb';
const FileSync = require('lowdb/adapters/FileSync');

import settings from './settings';

const adapter: AdapterSync = new FileSync(settings.assets_folder + settings.database_name);

const database = lowdb(adapter);

database.defaults({
	account: {
		user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
	},
	hero: { options: {} },
	farming: { options: [] },
	language: 'en'
}).write();

export default database;

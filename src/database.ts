import lowdb, { AdapterSync } from 'lowdb';
const FileSync = require('lowdb/adapters/FileSync');

import settings from './settings';

const adapter: AdapterSync = new FileSync(settings.assets_folder + settings.database_name);

const database = lowdb(adapter);

database.defaults({
	account: {
		user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
		logzio_enabled: false,
		logzio_host: 'listener.logz.io',
		logzio_token: 'GwcFiWmxTgedlLRgCjyGNSzNtZEojIhp',
		debug_enabled: false
	},
	hero: { options: {} },
	farming: { options: [] },
	language: 'en',
	map_cache: {
		last_seeded_at: null,
		radius: 60,
		map_data_updated_at: null,
		map_data_radius: 60
	},
	travian_config: {
		world_radius: null,
		raw: null
	}
}).write();

export default database;

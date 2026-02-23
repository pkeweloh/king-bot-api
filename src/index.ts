import api from './api';
import settings, { Icredentials } from './settings';
import { Iunits, Iplayer } from './interfaces';
import { tribe } from './data';
import server from './server';
import logger from './logger';
import scheduler from './scheduler';

import { farming, village, player } from './gamedata';

class kingbot {
	async start_server(
		gameworld: string = '',
		email: string = '',
		password: string = '',
		sitter_type: string = '',
		sitter_name: string = '',
		port: number = 3000,
		proxy: string = null
	) {
		await settings.init();
		await this.login(gameworld, email, password, sitter_type, sitter_name, proxy);

		server.start(port);
		scheduler.start();
	}

	async login(
		gameworld: string,
		email: string = '',
		password: string = '',
		sitter_type: string = '',
		sitter_name: string = '',
		proxy: string = null
	): Promise<void> {

		if (!email || !password || !gameworld) {
			let cred: Icredentials = settings.read_credentials();

			if (cred) {
				email = cred.email;
				password = cred.password;
				gameworld = cred.gameworld;
				sitter_name = cred.sitter_name;
				sitter_type = cred.sitter_type;
				proxy = cred.proxy;
			}
		}

		if (!email || !password || !gameworld) {
			logger.error('please provide email, password and gameworld', 'api');
			process.exit();
		}

		api.init(proxy);
		if (proxy)
			await api.test_proxy();
		logger.info('start login...', 'api');
		await api.login(email, password, gameworld, sitter_type, sitter_name);

		// schedule ping task
		scheduler.scheduleTask({
			id: 'ping',
			name: 'ping',
			nextRun: Math.floor(Date.now() / 1000),
			run: async () => {
				await api.ping();
				return 100; // seconds
			}
		}, false);
	}

	async scout(farmlist_name: string, village_id: number, amount: number = 1, spy_mission: string = 'resources') {
		const params = [
			village.collection_own_ident,
			farming.farmlist_ident
		];

		// fetch data
		const response = await api.get_cache(params);

		const list_obj = farming.find(farmlist_name, response);
		if (!list_obj) return;

		const list_id: number = list_obj.listId;
		if (!list_id) return;

		const player_data: Iplayer = await player.get();
		if (!player_data) return;
		const own_tribe: tribe = player_data.tribeId;

		const units: Iunits = {
			1: 0,
			2: 0,
			3: 0,
			4: 0,
			5: 0,
			6: 0,
			7: 0,
			8: 0,
			9: 0,
			10: 0,
			11: 0
		};

		// scouts are on different positions
		if (own_tribe == tribe.gaul) units[3] = amount;
		else units[4] = amount;

		// send scouts
		for (let target of list_obj.villageIds) {
			await api.send_units(village_id, target, units, 6, spy_mission);
		}
	}
}

export default new kingbot();

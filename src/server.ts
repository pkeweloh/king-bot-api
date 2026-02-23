import express from 'express';
import path from 'path';
import kingbot from './index';
import api from './api';
import settings from './settings';
import logger from './logger';
import { inactive_finder, crop_finder, resource_finder, nature_finder } from './extras';
import { building_types, tribe, troops_status, troops_type, unit_types } from './data';
import { Ifeature_params, feature } from './features/feature';
import { Ivillage, Ibuilding, Iplayer, Iunits } from './interfaces';
import { find_state_data } from './util';
import {
	finish_earlier,
	auto_adventure,
	send_farmlist,
	building_queue,
	raise_fields,
	trade_route,
	timed_send,
	train_troops,
	improve_troops,
	robber_hideouts,
	celebrations,
	stolen_goods
} from './features';
import { farming, village, player, troops } from './gamedata';
import database from './database';

class server {
	app: any = null;

	features: feature[] = [
		finish_earlier,
		auto_adventure,
		send_farmlist,
		building_queue,
		raise_fields,
		trade_route,
		timed_send,
		train_troops,
		improve_troops,
		robber_hideouts,
		celebrations,
		stolen_goods
	];

	constructor() {
		this.app = express();

		this.app.use(express.json());

		this.app.use(express.static(path.resolve(__dirname, '../public')));

		this.app.get('/api/allfeatures', (req: any, res: any) => {
			let response: Ifeature_params[] = [];

			for (let feat of this.features) response = [...response, ...feat.get_feature_params()];

			res.send(response);
		});

		this.app.post('/api/feature', (req: any, res: any) => {
			const { feature } = req.body;
			const ident = feature.ident;

			let response: string = '';

			for (let feat of this.features) {
				if (feat.get_ident() == ident) {
					response = feat.handle_request(req.body);
					break;
				}
			}

			res.send(response);
		});

		this.app.get('/api/data', async (req: any, res: any) => {
			const { ident } = req.query;

			if (ident == 'villages') {
				const villages = await village.get_own();
				const data = find_state_data(village.collection_own_ident, villages);
				res.send(data);
				return;
			}

			if (ident == 'worldwonders') {
				const response = await api.get_world_wonders();
				res.send(response.results);
				return;
			}

			if (ident == 'farmlists') {
				const farmlists = await farming.get_own();
				const data = find_state_data(farming.farmlist_ident, farmlists);
				res.send(data);
				return;
			}

			if (ident == 'player_tribe') {
				const player_data: Iplayer = await player.get();
				if (!player_data) {
					logger.error('could not get player data', 'server');
					res.send(null);
					return;
				}
				const data: tribe = player_data.tribeId;
				res.send(data);
				return;
			}

			if (ident == 'player_settings') {
				const player_data: Iplayer = await player.get();
				if (!player_data) {
					logger.error('could not get player data', 'server');
					res.send(null);
					return;
				}
				const settings_ident: string = 'Settings:' + player_data.playerId;
				const response: any[] = await api.get_cache([settings_ident]);
				const settings_data = find_state_data(settings_ident, response);
				res.send(settings_data);
				return;
			}

			if (ident == 'buildings') {
				const { village_id } = req.query;
				const queue_ident: string = village.building_collection_ident + village_id;
				const response: any[] = await api.get_cache([queue_ident]);
				const rv = [];
				const data = find_state_data(queue_ident, response) ?? [];
				for (let bd of data) {
					const build: Ibuilding = bd.data;

					if (Number(build.buildingType) != 0)
						if (Number(build.lvl) > 0)
							rv.push(build);
				}
				res.send(rv);
				return;
			}

			if (ident == 'building') {
				const { village_id, building_type } = req.query;
				const building_data: Ibuilding = await village.get_building(Number(village_id), Number(building_type));
				res.send(building_data);
				return;
			}

			if (ident == 'village') {
				const { village_id } = req.query;
				const village_data = await village.get_own();
				const village_obj: Ivillage = village.find(village_id, village_data);
				res.send(village_obj);
				return;
			}

			if (ident == 'building_types') {
				res.send(building_types);
				return;
			}

			if (ident == 'units') {
				const { village_id } = req.query;
				const units: Iunits = await troops.get_units(village_id, troops_type.stationary, troops_status.home);
				res.send(units);
				return;
			}

			if (ident == 'unit_types') {
				res.send(unit_types);
				return;
			}

			if (ident == 'research') {
				const { village_id, unit_type } = req.query;
				const research_ident: string = 'Research:' + village_id;
				const response: any[] = await api.get_cache([research_ident]);
				const rv = [];
				const data = find_state_data(research_ident, response);
				for (let research_unit of data.units) {
					if (unit_type && research_unit.unitType != unit_type)
						continue;
					rv.push(research_unit);
				}
				res.send(rv);
				return;
			}

			if (ident == 'settings') {
				res.send({
					email: settings.email,
					gameworld: settings.gameworld,
					avatar_name: settings.avatar_name
				});
				return;
			}

			if (ident == 'logger') {
				const { limit } = req.query;
				if (limit && Number(limit) > 0)
					res.send(logger.log_list.slice(-Number(limit)));
				else
					res.send(logger.log_list);
				return;
			}

			if (ident == 'log_files') {
				const fs = require('fs');
				const p = require('path');
				const folder = settings.assets_folder;
				if (!fs.existsSync(folder)) {
					res.send([]);
					return;
				}
				const files = fs.readdirSync(folder)
					.filter((f: string) => f.endsWith('.log'))
					.sort((a: string, b: string) => fs.statSync(p.join(folder, b)).mtimeMs - fs.statSync(p.join(folder, a)).mtimeMs);
				res.send(files);
				return;
			}

			if (ident == 'log_history') {
				const { file } = req.query;
				const fs = require('fs');
				const p = require('path');
				if (!file || !file.endsWith('.log') || file.includes('..')) {
					res.send([]);
					return;
				}
				const filepath = p.join(settings.assets_folder, file);
				if (!fs.existsSync(filepath)) {
					res.send([]);
					return;
				}

				const content = fs.readFileSync(filepath, 'utf8');
				const lines = content.split('\n').map((l: string) => l.replace(/\r/g, '').trim()).filter((l: string) => l !== '');
				const historyLogList = [];
				for (const line of lines) {
					const ESC = String.fromCharCode(27);
					const cleanLine = line.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
					const match = cleanLine.match(/^.*?\[\s*(info|debug|warn|error)\s*\].*?\s+(.*?)\s+\[(.*?)\]\s+(.*)$/i);
					if (match) {
						historyLogList.push({
							level: match[1].toLowerCase(),
							timestamp: match[2],
							group: match[3],
							message: match[4]
						});
					} else {
						historyLogList.push({
							level: 'unknown',
							timestamp: '',
							group: 'unknown',
							message: cleanLine
						});
					}
				}
				res.send(historyLogList);
				return;
			}

			if (ident == 'language') {
				const language = database.get('language').value();
				res.send({ language });
				return;
			}

			res.send('error');
		});

		this.app.post('/api/language', async (req: any, res: any) => {
			const { language } = req.body;
			database.set('language', language).write();
			res.send({ status: 'ok' });
		});

		this.app.post('/api/find', async (req: any, res: any) => {
			const response = await api.get_cache(req.body);
			res.send(response);
		});

		this.app.post('/api/checkTarget', async (req: any, res: any) => {
			const response = await api.check_target(req.body.villageId, req.body.destVillageId, 4);
			res.send(response);
		});

		this.app.post('/api/easyscout', (req: any, res: any) => {
			const { village_id, list_name, amount, spy_mission } = req.body;

			kingbot.scout(list_name, village_id, amount, spy_mission);

			res.send('success');
		});

		this.app.post('/api/login', async (req: any, res: any) => {
			const { gameworld, email, password, sitter_type, sitter_name } = req.body;

			settings.write_credentials(gameworld, email, password, sitter_type, sitter_name);
			process.exit();
		});

		this.app.post('/api/settings', (req: any, res: any) => {
			const { action } = req.body;

			let response: {};

			if (action == 'get') {
				response = {
					data: {
						logzio_enabled: database.get('account.logzio_enabled').value(),
						logzio_host: database.get('account.logzio_host').value(),
						logzio_token: database.get('account.logzio_token').value(),
						user_agent: database.get('account.user_agent').value()
					}
				};
			}

			if (action == 'save') {
				const { logzio_enabled, logzio_host, logzio_token, user_agent } = req.body;
				database.set('account.logzio_enabled', logzio_enabled).write();
				database.set('account.logzio_host', logzio_host).write();
				database.set('account.logzio_token', logzio_token).write();
				database.set('account.user_agent', user_agent).write();

				response = { status: 'ok' };
			}

			res.send(response);
		});

		this.app.post('/api/inactivefinder', async (req: any, res: any) => {
			const { action, data } = req.body;

			if (action == 'get') {
				const {
					village_id,
					min_player_pop,
					max_player_pop,
					min_village_pop,
					max_village_pop,
					inactive_for,
					min_distance,
					max_distance
				} = data;

				const response = await inactive_finder.get_inactives(
					village_id, min_player_pop, max_player_pop,
					min_village_pop, max_village_pop,
					inactive_for, min_distance, max_distance
				);

				res.send(response);
				return;
			}

			if (action == 'toggle') {
				const { farmlist, village } = data;
				const response = await inactive_finder.add_inactive_player(farmlist, village);

				res.send(response);
				return;
			}

			res.send({
				error: true,
				message: 'could not identify action',
				data: []
			});
		});

		this.app.post('/api/cropfinder', async (req: any, res: any) => {
			const { action, data } = req.body;

			if (action == 'get') {
				const {
					village_id,
					find_15c,
					find_9c,
					only_free
				} = data;

				const response = await crop_finder.get_crops(
					village_id,
					find_15c,
					find_9c,
					only_free
				);

				res.send(response);
				return;
			}

			res.send({
				error: true,
				message: 'could not identify action',
				data: []
			});
		});

		this.app.post('/api/resourcefinder', async (req: any, res: any) => {
			const { action, data } = req.body;

			if (action == 'get') {
				const {
					village_id,
					find_wood,
					find_clay,
					find_iron,
					only_free
				} = data;

				const response = await resource_finder.get_resources(
					village_id,
					find_wood,
					find_clay,
					find_iron,
					only_free
				);

				res.send(response);
				return;
			}

			res.send({
				error: true,
				message: 'could not identify action',
				data: []
			});
		});

		this.app.post('/api/naturefinder', async (req: any, res: any) => {
			const { action, data } = req.body;

			if (action == 'get') {
				const {
					village_id,
					nature_type
				} = data;

				const response = await nature_finder.get_nature(
					village_id,
					nature_type
				);

				res.send(response);
				return;
			}

			res.send({
				error: true,
				message: 'could not identify action',
				data: []
			});
		});

		// handles all 404 requests to main page
		this.app.get('*', (req: any, res: any) => {
			res.sendFile(path.resolve(__dirname, '../public', 'index.html'));
		});
	}

	async start(port: number) {
		this.app.listen(port, () => {
			logger.info(`server running on => http://${settings.ip}:${port}`, 'server');

			// start all features on startup
			for (let feat of this.features) feat.start_for_server();
		});
	}

}

export default new server();

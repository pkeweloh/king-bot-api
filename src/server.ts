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
import map_scanner from './map_scanner';
import world_scan_proxy from './world_scan_proxy';
import cache from './cache';
import { xy2id } from './util';

function analyze_map_data(mapData: any) {
	if (!mapData) {
		return { cells_count: 0, layer1: 0, layer3: 0 };
	}
	const cells = Array.isArray(mapData?.map?.cells)
		? mapData.map.cells
		: Array.isArray(mapData?.cells)
			? mapData.cells
			: [];
	const layer1 = new Set<number>();
	const layer3 = new Set<number>();
	for (const cell of cells) {
		const x = Number(cell.x);
		const y = Number(cell.y);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		layer1.add(xy2id(Math.floor(x / 7), Math.floor(y / 7)));
		layer3.add(xy2id(Math.floor(x / 21), Math.floor(y / 21)));
	}
	return {
		cells_count: Array.isArray(cells) ? cells.length : 0,
		layer1: layer1.size,
		layer3: layer3.size
	};
}

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

			res.json(response);
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

			res.json(response);
		});

		this.app.get('/api/data', async (req: any, res: any) => {
			const { ident } = req.query;

			if (ident == 'villages') {
				const villages = await village.get_own();
				const data = find_state_data(village.collection_own_ident, villages);
				res.json(data);
				return;
			}

			if (ident == 'worldwonders') {
				const response = await api.get_world_wonders();
				res.json(response.results);
				return;
			}

			if (ident == 'farmlists') {
				const farmlists = await farming.get_own();
				const data = find_state_data(farming.farmlist_ident, farmlists);
				res.json(data);
				return;
			}

			if (ident == 'player_tribe') {
				const player_data: Iplayer = await player.get();
				if (!player_data) {
					logger.error('could not get player data', 'server');
					res.json(null);
					return;
				}
				const data: tribe = player_data.tribeId;
				res.json(data);
				return;
			}

			if (ident == 'player_settings') {
				const player_data: Iplayer = await player.get();
				if (!player_data) {
					logger.error('could not get player data', 'server');
					res.json(null);
					return;
				}
				const settings_ident: string = 'Settings:' + player_data.playerId;
				const response: any[] = await api.get_cache([settings_ident]);
				const settings_data = find_state_data(settings_ident, response);
				res.json(settings_data);
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
				res.json(rv);
				return;
			}

			if (ident == 'building') {
				const { village_id, building_type } = req.query;
				const building_data: Ibuilding = await village.get_building(Number(village_id), Number(building_type));
				res.json(building_data);
				return;
			}

			if (ident == 'village') {
				const { village_id } = req.query;
				const village_data = await village.get_own();
				const village_obj: Ivillage = village.find(village_id, village_data);
				res.json(village_obj);
				return;
			}

			if (ident == 'building_types') {
				res.json(building_types);
				return;
			}

			if (ident == 'units') {
				const { village_id } = req.query;
				const units: Iunits = await troops.get_units(village_id, troops_type.stationary, troops_status.home);
				res.json(units);
				return;
			}

			if (ident == 'unit_types') {
				res.json(unit_types);
				return;
			}

			if (ident == 'research') {
				const { village_id, unit_type } = req.query;
				const research_ident: string = 'Research:' + village_id;
				const unit_research_queue_ident: string = 'UnitResearchQueue:' + village_id;
				const response: any[] = await api.get_cache([research_ident, unit_research_queue_ident]);
				const rv = [];
				const data = find_state_data(research_ident, response);
				for (let research_unit of data.units) {
					if (unit_type && research_unit.unitType != unit_type)
						continue;
					rv.push(research_unit);
				}
				res.json(rv);
				return;
			}

			if (ident == 'settings') {
				res.json({
					email: settings.email,
					gameworld: settings.gameworld,
					avatar_name: settings.avatar_name
				});
				return;
			}

			if (ident == 'logger') {
				const { limit } = req.query;
				if (limit && Number(limit) > 0)
					res.json(logger.log_list.slice(-Number(limit)));
				else
					res.json(logger.log_list);
				return;
			}

			if (ident == 'log_files') {
				const fs = require('fs');
				const p = require('path');
				const folder = settings.assets_folder;
				if (!fs.existsSync(folder)) {
					res.json([]);
					return;
				}
				const debug_enabled = database.get('account.debug_enabled').value();
				const files = fs.readdirSync(folder)
					.filter((f: string) => f.endsWith('.log'))
					.filter((f: string) => debug_enabled ? true : !f.startsWith('debug-'))
					.sort((a: string, b: string) => fs.statSync(p.join(folder, b)).mtimeMs - fs.statSync(p.join(folder, a)).mtimeMs);
				res.json(files);
				return;
			}

			if (ident == 'log_history') {
				const { file } = req.query;
				const fs = require('fs');
				const p = require('path');
				if (!file || !file.endsWith('.log') || file.includes('..')) {
					res.json([]);
					return;
				}
				const debug_enabled = database.get('account.debug_enabled').value();
				if (file.startsWith('debug-') && !debug_enabled) {
					res.json([]);
					return;
				}
				const filepath = p.join(settings.assets_folder, file);
				if (!fs.existsSync(filepath)) {
					res.json([]);
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
				res.json(historyLogList);
				return;
			}

			if (ident == 'language') {
				const language = database.get('language').value();
				res.json({ language });
				return;
			}

			res.json('error');
		});

		this.app.post('/api/language', async (req: any, res: any) => {
			const { language } = req.body;
			database.set('language', language).write();
			res.json({ status: 'ok' });
		});

		this.app.post('/api/find', async (req: any, res: any) => {
			const response = await api.get_cache(req.body);
			res.json(response);
		});

		this.app.get('/api/map_cache/status', (req: any, res: any) => {
			const last_seeded_at = database.get('map_cache.last_seeded_at').value() ?? null;
			const map_data_updated_at = database.get('map_cache.map_data_updated_at').value() ?? null;
			const map_data_radius = Number(database.get('map_cache.map_data_radius').value()) || null;
			const map_data = cache.load_map_data();
			const stats = analyze_map_data(map_data);
			res.json({
				last_seeded_at,
				map_data_updated_at,
				map_data_radius,
				map_data_cells: stats.cells_count,
				map_data_regions: {
					layer1: stats.layer1,
					layer3: stats.layer3
				}
			});
		});

		this.app.get('/api/map_cache/map_data', (req: any, res: any) => {
			const map_data = cache.load_map_data();
			const last_updated_at = database.get('map_cache.map_data_updated_at').value() ?? null;
			const map_data_radius = Number(database.get('map_cache.map_data_radius').value()) || null;
			res.json({
				last_updated_at,
				radius: map_data_radius,
				map_data
			});
		});

		this.app.post('/api/map_cache/seed', async (req: any, res: any) => {
			const stored_radius = Number(database.get('travian_config.world_radius').value());
			const default_radius = Number.isFinite(stored_radius) && stored_radius > 0 ? stored_radius : 400;
			const requested_radius = Number(req.body?.world_radius ?? req.body?.radius ?? 0);
			const initial_radius = Number.isFinite(requested_radius) && requested_radius > 0 ? requested_radius : default_radius;
			const gameworld = settings.gameworld;
			try {
				const map_data_response = await api.get_map(gameworld);
				if (!map_data_response || map_data_response.errors) {
					throw new Error(map_data_response?.errors?.[0]?.message ?? 'failed to fetch map data');
				}

				cache.save_map_data(map_data_response);
				const map_data_stats = analyze_map_data(map_data_response);
				const map_data_map = map_data_response?.map ?? map_data_response?.response?.map ?? null;
				const map_data_radius_value = Number(map_data_map?.radius ?? initial_radius);
				const effective_radius = Number.isFinite(map_data_radius_value) && map_data_radius_value > 0 ? map_data_radius_value : initial_radius;
				const map_data_updated_at = Date.now();
				database.set('map_cache.map_data_updated_at', map_data_updated_at).write();
				database.set('map_cache.map_data_radius', effective_radius).write();

				await map_scanner.scan_world(effective_radius, { collect_tiles: false, seed: true });
				const last_seeded_at = Date.now();
				database.set('map_cache.last_seeded_at', last_seeded_at).write();
				database.set('map_cache.radius', effective_radius).write();
				world_scan_proxy.clear();
				res.json({
					last_seeded_at,
					map_data_updated_at,
					map_data_radius: effective_radius,
					map_data_cells: map_data_stats.cells_count,
					map_data_regions: {
						layer1: map_data_stats.layer1,
						layer3: map_data_stats.layer3
					}
				});
			} catch (error: any) {
				logger.error(`failed to seed map cache: ${error}`, 'server');
				res.json({
					error: true,
					message: error?.message ?? 'could not seed map cache'
				});
			}
		});

		this.app.post('/api/checkTarget', async (req: any, res: any) => {
			const response = await api.check_target(req.body.villageId, req.body.destVillageId);
			res.json(response);
		});

		this.app.post('/api/easyscout', (req: any, res: any) => {
			const { village_id, list_name, amount, spy_mission } = req.body;

			kingbot.scout(list_name, village_id, amount, spy_mission);

			res.json('success');
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
						user_agent: database.get('account.user_agent').value(),
						debug_enabled: database.get('account.debug_enabled').value()
					}
				};
			}

			if (action == 'save') {
				const { logzio_enabled, logzio_host, logzio_token, user_agent, debug_enabled } = req.body;
				database.set('account.logzio_enabled', logzio_enabled).write();
				database.set('account.logzio_host', logzio_host).write();
				database.set('account.logzio_token', logzio_token).write();
				database.set('account.user_agent', user_agent).write();
				database.set('account.debug_enabled', debug_enabled).write();

				response = { status: 'ok' };
			}

			res.json(response);
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

				res.json(response);
				return;
			}

			if (action == 'toggle') {
				const { farmlist, village } = data;
				const response = await inactive_finder.add_inactive_player(farmlist, village);

				res.json(response);
				return;
			}

			res.json({
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
					find_7c,
					only_free
				} = data;

				const response = await crop_finder.get_crops(
					village_id,
					find_15c,
					find_9c,
					find_7c,
					only_free
				);

				res.json(response);
				return;
			}

			res.json({
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

				res.json(response);
				return;
			}

			res.json({
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

				res.json(response);
				return;
			}

			res.json({
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

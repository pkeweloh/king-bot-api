import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import createHttpsProxy from 'https-proxy-agent';
import { clash_obj, get_date, get_ms, camelcase_to_string, get_random_string, get_random_int } from './util';
import manage_login from './login';
import settings, { Icredentials } from './settings';
import database from './database';
import { Iresources, Iunits } from './interfaces';
import { default_Iunits, building_types } from './data';
import { getClientId } from './client_id_extractor';
import logger from './logger';
import { SessionManager } from './session_manager';

class api {
	private axios: AxiosInstance;
	private sessionManager = new SessionManager();
	private readonly LOBBY_ENDPOINT = 'https://lobby.kingdoms.com/api/index.php';
	private readonly BROWSER_HEADERS = {
		'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8',
		'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
		'Accept-Encoding': 'gzip, deflate',
		'Content-Type': 'application/json;charset=utf-8',
		'DNT': '1',
		'Sec-GPC': '1',
		'Connection': 'keep-alive',
		'Sec-Fetch-Dest': 'empty',
		'Sec-Fetch-Mode': 'cors',
		'Sec-Fetch-Site': 'same-origin',
		'TE': 'trailers'
	};

	session: string = '';
	token: string = '';
	msid: string = '';
	clientId: string = '';
	playerId: string = '';
	is_busy = false;

	init(proxy: string) {
		const options: AxiosRequestConfig = {};
		if (proxy != null && proxy != '') {
			const agent = createHttpsProxy(proxy);
			options.httpAgent = agent;
			options.httpsAgent = agent;
			options.proxy = false;
			logger.info(`using proxy ${proxy}`, 'api');
			database.set('account.proxy', proxy).write();
		}
		this.axios = axios.create(options);
		this.axios.defaults.withCredentials = true;

		const user_agent = database.get('account.user_agent').value();
		this.axios.defaults.headers.common['User-Agent'] = user_agent;

		// Set static browser-like headers
		for (const [key, value] of Object.entries(this.BROWSER_HEADERS)) {
			this.axios.defaults.headers.common[key] = value as string;
		}
	}

	apply_gameworld_state(gameworld: string, session: string, msid?: string, cookies?: string) {
		this.session = session;
		if (msid) this.msid = msid;

		this.axios.defaults.baseURL = `https://${gameworld.toLowerCase()}.kingdoms.com/api/`;
		this.axios.defaults.headers.common['Origin'] = `https://${gameworld.toLowerCase()}.kingdoms.com`;
		this.axios.defaults.headers.common['Referer'] = `https://${gameworld.toLowerCase()}.kingdoms.com/`;

		if (cookies) {
			this.axios.defaults.headers.common['Cookie'] = cookies;
		}
	}

	get_cookies(): string {
		return this.axios.defaults.headers.common['Cookie'] as string || '';
	}

	private parse_cookies_local(cookie_array: any[]): string {
		if (!cookie_array) return '';
		return cookie_array.map(x => x.split(';')[0]).join('; ') + '; ';
	}

	sync_player_state(cookies: string) {
		const playert5Match = cookies.match(/t5SessionKey=[^;]*%22id%22%3A%22(\d+)%22/);
		if (playert5Match) {
			const playerId = playert5Match[1];
			if (playerId && playerId !== this.playerId) {
				this.playerId = playerId;
				database.set('account.playerId', playerId).write();
				logger.debug(`player id synced: ${playerId}`, 'sync_player_state');
			}
		}
	}

	async test_proxy(): Promise<void> {
		logger.info('testing proxy...', 'api');

		let http_ip, https_ip;
		try {
			const http_response: any = await this.axios.get('http://api.ipify.org/?format=json');
			if (http_response.data) {
				http_ip = http_response.data.ip;
				if (http_ip == settings.ip)
					logger.warn('the ip address for http protocol has not changed', 'api');
			}
			const https_response: any = await this.axios.get('https://api.ipify.org/?format=json');
			if (https_response.data) {
				https_ip = https_response.data.ip;
				if (https_ip == settings.ip)
					logger.warn('the ip address for https protocol has not changed', 'api');
			}
		} catch (error: any) {
			logger.error(`proxy test fail: ${error.message}`, 'api');
			if (error.stack)
				logger.debug(error.stack, 'api');
			process.exit();
		}

		if (http_ip != https_ip || settings.ip == http_ip || settings.ip == https_ip) {
			logger.error('proxy test fail: a new ip address could not be obtained through the proxy', 'api');
			process.exit();
		}
		logger.info(`proxy test ok: using new ip address ${https_ip}`, 'api');
		database.set('account.proxy_ip', https_ip).write();
	}

	async refresh_token() {
		if (!this.is_busy) {
			this.is_busy = true;
			logger.info('refresh token...', 'api');

			// read credentials
			let cred: Icredentials = settings.read_credentials();
			if (!cred) {
				logger.error('credentials not found', 'api');
				return;
			}

			// log back in
			await this.login(cred.email, cred.password, cred.gameworld, cred.sitter_type, cred.sitter_name);
			this.is_busy = false;
		}
	}

	async login(email: string, password: string, gameworld: string, sitter_type: string, sitter_name: string) {
		this.sessionManager.reset();
		this.clientId = await manage_login(this.axios, email, password, gameworld, sitter_type, sitter_name);
	}

	async create_gameworld_session(gameworld: string, token: string, msid: string, redirectUrl: string): Promise<{ session: string, cookies: string }> {
		// establish session via redirect URL
		await this.axios.get(redirectUrl);

		// log into the game API
		const worldURL = `https://${gameworld.toLowerCase()}.kingdoms.com/api/login.php?token=${token}&msid=${msid}&msname=msid`;
		const res = await this.axios.get(worldURL, {
			maxRedirects: 0,
			validateStatus: (status) => status >= 200 && status < 303,
		});

		// get gameworld cookies
		const cookies = this.parse_cookies_local(res.headers['set-cookie']);

		// extract session from location header
		const sessionLink = res.headers.location;
		if (!sessionLink || sessionLink.indexOf('=') === -1) {
			logger.error('failed to extract session link from gameworld login response', 'api');
			throw new Error('Failed to extract session link from gameworld login response.');
		}
		const session = sessionLink.substring(sessionLink.lastIndexOf('=') + 1);

		this.apply_gameworld_state(gameworld, session, cookies, msid);

		return { session, cookies };
	}

	// here we check if the session is still valid by doing a ping
	// (this extra call shouldn't be done, but with ping it might still go unnoticed)
	async validate_gameworld_session(): Promise<boolean> {
		try {
			const data: any[] = await this.ping();
			return data && Array.isArray(data);
		} catch { return false; }
	}

	async validate_lobby_session(session: string): Promise<boolean> {
		try {
			const data = await this.lobby_post('getPossibleNewGameworlds', 'gameworld', {}, session);
			return data && !data.error;
		} catch { return false; }
	}

	async get_lobby_avatars(session: string): Promise<any[]> {
		const data = await this.lobby_post('get', 'cache', { names: ['Collection:Avatar:'] }, session);
		return this.merge_data(this.handle_errors(data, 'lobby.avatars'));
	}

	async get_lobby_sitters(session: string): Promise<any[]> {
		const sitterArray: string[] = Array.from({ length: 10 }, (_, i) => `Collection:Sitter:${i}`);
		const data = await this.lobby_post('get', 'cache', { names: sitterArray }, session);
		return this.merge_data(this.handle_errors(data, 'lobby.sitters'));
	}

	async get_all(): Promise<any[]> {
		return await this.post('getAll', 'player', { deviceDimension: '1920:1080' });
	}

	async get_cache(params: string[]): Promise<any[]> {
		return await this.post('get', 'cache', { names: params });
	}

	// TODO better program this api call
	async get_report(sourceVillageId: number): Promise<any> {
		const params = {
			collection: 'search',
			start: 0,
			count: 1,
			filters: [
				'1', '2', '3',
				{ villageId: sourceVillageId }
			],
			'alsoGetTotalNumber': true
		};

		return await this.post('getLastReports', 'reports', params);
	}

	async get_world_wonders(): Promise<any> {
		const params = {
			start: 0,
			end: 9,
			rankingType: 'ranking_WorldWonder'
		};

		return await this.post('getRanking', 'ranking', params);
	}

	async get_robber_villages_amount(kingdomId: number = 0): Promise<any> {
		const params = {
			kingdomId: kingdomId
		};

		return await this.post('getRobberVillagesAmount', 'player', params);
	}

	async send_partial_farmlists(listId: number, entryIds: number[], village_id: number): Promise<any> {
		const params = {
			listId: listId,
			entryIds: entryIds,
			villageId: village_id
		};

		return await this.post('startPartialFarmListRaid', 'troops', params);
	}

	async send_farmlists(lists: number[], village_id: number): Promise<any> {
		const params = {
			listIds: lists,
			villageId: village_id
		};

		return await this.post('startFarmListRaid', 'troops', params);
	}

	async toggle_farmlist_entry(villageId: number, listId: number): Promise<any> {
		const params = {
			villageId,
			listId
		};

		return await this.post('toggleEntry', 'farmList', params);
	}

	async copy_farmlist_entry(villageId: number, newListId: number, entryId: number): Promise<any> {
		const params = {
			villageId,
			newListId,
			entryId
		};

		return await this.post('copyEntry', 'farmList', params);
	}

	async upgrade_building(buildingType: number, locationId: number, villageId: number): Promise<any> {
		const params = {
			villageId,
			locationId,
			buildingType
		};

		return await this.post('upgrade', 'building', params);
	}

	async queue_building(buildingType: number, locationId: number, villageId: number, reserveResources: boolean, count: number = 1): Promise<any> {
		const params = {
			villageId,
			locationId,
			buildingType,
			reserveResources,
			count
		};

		return await this.post('useMasterBuilder', 'building', params);
	}

	async finish_now(villageId: number, queueType: number): Promise<any> {
		const params = {
			featureName: 'finishNow',
			params: {
				villageId,
				queueType,
				price: 0
			}
		};

		return await this.post('bookFeature', 'premiumFeature', params);

	}

	async check_target(villageId: number, destVillageId: number, movementType: number,
		redeployHero: boolean = false, selectedUnits: Iunits = default_Iunits): Promise<any> {
		const params = {
			destVillageId,
			villageId,
			movementType,
			redeployHero,
			selectedUnits
		};

		return await this.post('checkTarget', 'troops', params);
	}

	// FIXME: implement call checkTarget (x2) before sending units
	// TODO: implement catapult targets
	async send_units(
		villageId: number,
		destVillageId: number,
		units: Iunits,
		movementType: number,
		spyMission: string = 'resources'
		//catapultTargets = [] // TODO implement targets
	): Promise<any> {

		const params = {
			destVillageId,
			villageId,
			movementType,
			redeployHero: false,
			units,
			spyMission
			//catapultTargets = []  // TODO implement targets
		};

		return await this.post('send', 'troops', params);
	}

	async send_merchants(sourceVillageId: number, destVillageId: number, resources: Iresources): Promise<any> {
		const params = {
			destVillageId,
			sourceVillageId,
			resources,
			recurrences: 1
		};

		return await this.post('sendResources', 'trade', params);
	}

	async start_adventure(type: number): Promise<any> {
		const params = {
			questId: (type == 0) ? 991 : 992,
			dialogId: 0,
			command: 'activate'
		};

		return await this.post('dialogAction', 'quest', params);
	}

	async recruit_units(villageId: number, locationId: number, unit: number, amount: number): Promise<any> {
		let units: { [unit: number]: number; } = {};
		units[unit] = amount;

		const params = {
			villageId,
			locationId,
			units: units
		};
		return await this.post('recruitUnits', 'building', params);
	}

	async research_unit(villageId: number, locationId: number, buildingType: number, unitType: number): Promise<any> {
		const params = {
			villageId,
			locationId,
			buildingType,
			unitType
		};
		return await this.post('researchUnit', 'building', params);
	}

	async get_celebration_list(villageId: number, locationId: number): Promise<any> {
		const params = {
			villageId,
			locationId
		};
		return await this.post('getCelebrationList', 'building', params);
	}

	async start_celebration(villageId: number, type: number): Promise<any> {
		const params = {
			villageId,
			type
		};
		return await this.post('startCelebration', 'building', params);
	}

	async get_map_api_keys(gameworld: string): Promise<any> {
		const site_url = 'https://www.reddit.com';
		const site_name = get_random_string(8);
		const email = `${site_name}@gmail.com`;

		let url = `https://${gameworld}.kingdoms.com/api/external.php?`;
		url += 'action=requestApiKey&';
		url += `email=${email}&`;
		url += `siteName=${site_name}&`;
		url += `siteUrl=${site_url}&`;
		url += 'public=false';

		const response: any = await this.axios.get(url);
		response.data = this.handle_errors(response.data, 'get_map_api_keys');
		return this.merge_data(response.data);
	}

	async get_map(gameworld: string, date: Date = null): Promise<any> {
		// get api key
		const api_keys = await this.get_map_api_keys(gameworld);
		if (api_keys.errors)
			return api_keys;
		const privateApiKey = api_keys.privateApiKey;

		let url = `https://${gameworld}.kingdoms.com/api/external.php?`;
		url += 'action=getMapData&';
		url += `privateApiKey=${privateApiKey}&`;
		if (date) {
			// needs to be a date in format: d.m.Y (e.g. 27.08.2014)
			const date_formatted = [
				('0' + date.getDate()).slice(-2),
				('0' + (date.getMonth() + 1)).slice(-2),
				date.getFullYear()
			].join('.');
			url += `date=${date_formatted}`;
		}

		const response: any = await this.axios.get(url);
		response.data = this.handle_errors(response.data, 'get_map');
		return this.merge_data(response.data);
	}

	async get_duration_to_closest_village_with_influence(villageId: number): Promise<any> {
		const params = {
			villageId
		};
		return await this.post('getDurationToClosestVillageWithInfluence', 'hero', params);
	}

	async get_treasure_sell_price(): Promise<any> {
		return await this.post('getTreasureSellPrice', 'hero', {});
	}

	async hero_use_item(id: number, amount: number, villageId: number): Promise<any> {
		const params = {
			id,
			amount,
			villageId
		};
		return await this.post('useItem', 'hero', params);
	}

	async ping(): Promise<any> {
		const timestamp = get_ms();
		const params = this.sessionManager.getPingParams(timestamp);

		const response = await this.post('ping', 'player', params, timestamp);

		const refresh = params.cnt > 1; // No refresh for first ping
		if (refresh && response.data?.error?.type == 'ClientException' &&
			response.data?.error?.message == 'Authentication failed') {
			logger.error('authentication failed, refreshing token... ', 'ping.player');
			await this.refresh_token();
		}

		this.sessionManager.updateFromPingResponse(response?.data);

		return response;
	}

	async post(action: string, controller: string, params: object, timestamp?: number): Promise<any> {
		const session = this.session;
		const clientId = this.clientId;

		const isPing = action === 'ping' && controller === 'player';
		const finalTimestamp = timestamp || get_ms();
		const url = `?c=${controller}&a=${action}${this.playerId ? `&p${this.playerId}` : ''}&t${finalTimestamp}`;

		logger.debug(`post /${url}: ${JSON.stringify(params)}`, `${controller}.${action}`);

		let payload = {
			controller,
			action,
			params,
			session,
			clientId
		};
		let response: any = await this.axios.post(url, payload);

		// update session state for future pings
		this.sessionManager.registerInteraction(finalTimestamp, !isPing);

		if (!isPing && response.data?.error?.type == 'ClientException' &&
			response.data?.error?.message == 'Authentication failed') {
			logger.error('authentication failed, refreshing token and retrying... ', `${controller}.${action}`);
			await this.refresh_token();
			// retry
			payload.session = this.session;
			payload.clientId = this.clientId;
			response = await this.axios.post(url, payload);
		}
		if (!response)
			return {
				errors: [{
					message: 'response null',
					type: 'unknown'
				}]
			};
		response.data = this.handle_errors(response.data, `${controller}.${action}`);
		return this.merge_data(response.data);
	}

	private async lobby_post(action: string, controller: string, params: object, session: string): Promise<any> {
		const payload = {
			action,
			controller,
			params,
			session
		};
		const res = await this.axios.post(this.LOBBY_ENDPOINT, payload);
		return res.data;
	}

	// merges data into state object
	merge_data: any = (data: any) => clash_obj(data, 'cache', 'response');

	handle_errors: any = (data: any, group: string) => {
		let errors = [];
		if (data.response.errors) {
			for (let error of data.response.errors) {
				if (error.message.split(' ').length == 1)
					error.message = camelcase_to_string(error.message);
				errors.push({
					message: error.message,
					type: error.type,
					params: error.params
				});
			}
			data.response.errors = errors;
		}

		if (data.error) {
			if (data.error.message.split(' ').length == 1)
				data.error.message = camelcase_to_string(data.error.message);
			return {
				response: {
					errors: [{
						message: data.error.message,
						type: data.error.type
					}]
				}
			};
		}
		return data;
	};
}

export default new api();

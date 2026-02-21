import qs from 'qs';
import cheerio from 'cheerio';
import logger from './logger';
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { clash_obj } from './util';
import database from './database';
import settings from './settings';
import { getClientId } from './client_id_extractor';

const ci = cheerio;
const lobby_endpoint: string = 'https://lobby.kingdoms.com/api/index.php';

async function manage_login(
	axios: AxiosInstance,
	email: string,
	password: string,
	gameworld: string,
	sitter_type: string,
	sitter_name: string
): Promise<string> {

	// get account from database
	const db_email = database.get('account.email').value();
	const db_gameworld = database.get('account.gameworld').value();
	const db_sitter_type = database.get('account.sitter_type').value();
	const db_sitter_name = database.get('account.sitter_name').value();
	const db_avatar_name = database.get('account.avatar_name').value();

	// lowercase names
	gameworld = gameworld.toLowerCase();
	sitter_type = sitter_type.toLowerCase();
	sitter_name = sitter_name.toLowerCase();

	// set values to session
	settings.email = email;
	settings.gameworld = gameworld;
	settings.sitter_name = sitter_name;
	settings.sitter_type = sitter_type;
	settings.avatar_name = db_avatar_name;

	let clientId = '';

	if (db_email === email) {
		logger.info('found lobby session in database...', 'login');

		// get lobby session from database
		const { session_lobby, cookies_lobby } = database.get('account').value();

		axios.defaults.headers.common['Cookie'] = cookies_lobby;

		if (await test_lobby_connection(axios, session_lobby)) {
			logger.info(`successful database reconnection to lobby with account ${email}`, 'login');

			if (db_gameworld === gameworld && db_sitter_name === sitter_name && db_sitter_type === sitter_type) {
				// get credentials from database
				const { session_gameworld, cookies_gameworld } = database.get('account').value();

				logger.info(`found gameworld session in database: ${session_gameworld}`, 'login');

				axios.defaults.headers.common['Cookie'] += cookies_gameworld;
				if (await test_gameworld_connection(axios, gameworld, session_gameworld)) {
					logger.info(`successful database reconnection to gameworld ${gameworld}`, 'login');
				} else {
					logger.warn(`database connection to gameworld ${gameworld} failed`, 'login');
					axios.defaults.headers.common['Cookie'] = '';
				}
			}
		} else {
			logger.warn(`database connection to lobby with account ${email} failed`, 'login');
			axios.defaults.headers.common['Cookie'] = '';
		}
	}

	let cookies = axios.defaults.headers.common['Cookie'];

	// login if not recovered
	if (!cookies) {
		const { msid, session_lobby } = await login_to_lobby(axios, email, password);
		await login_to_gameworld(axios, gameworld, sitter_type, sitter_name, msid, session_lobby);
		cookies = axios.defaults.headers.common['Cookie'];
	}

	// get clientId
	clientId = await getClientId(gameworld, cookies);
	if (!clientId) {
		logger.error('could not resolve clientId. authentication aborted.', 'login');
		process.exit();
	}

	return clientId;
}

async function login_to_lobby(axios: AxiosInstance, email: string, password: string): Promise<any> {
	let res: AxiosResponse, options: AxiosRequestConfig, url: string, msid: string, token_lobby: string, session_lobby: string;

	// get msid
	url = 'https://mellon-t5.traviangames.com/authentication/login/ajax/form-validate?';
	res = await axios.get(url);
	let $ = ci.load(res.data);
	let html: string = $.html();
	if (!html) {
		let msi_retries: number = 1;
		while (!html) {
			if (msi_retries >= 5) {
				logger.error('couldn\'t get the msid', 'login');
				break;
			}
			logger.debug(`retrying to get the msid... ${msi_retries}`, 'login');
			// retry
			res = await axios.get(url);
			$ = ci.load(res.data);
			html = $.html();
			msi_retries++;
		}
	}

	const msidMatch = html.match(/msid["']?\s*[:=,]\s*["']?([a-zA-Z0-9.\-_]+)["']?/i);
	msid = msidMatch ? msidMatch[1] : '';

	if (!msid) {
		// Fallback to more permissive search if the structured one fails
		const rawMatch = html.match(/msid.*?([a-zA-Z0-9]{10,})/i);
		msid = rawMatch ? rawMatch[1] : '';
	}

	if (!msid) {
		logger.error('failed to extract a valid msid. Response data: ' + html.substring(0, 200), 'login');
		process.exit();
	}

	logger.info('msid: ' + msid, 'login');

	// logs in with credentials from file
	url = `https://mellon-t5.traviangames.com/authentication/login/ajax/form-validate?msid=${msid}&msname=msid`;

	let credentials: any = { email, password };

	options = {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		data: qs.stringify(credentials),
		url,
	};

	// gets token
	res = await axios(options);

	let rv: any = parse_token(res.data);
	let tokenURL: string = rv.url;
	token_lobby = rv.token;
	if (!token_lobby) {
		let token_retries: number = 1;
		while (!token_lobby) {
			if (token_retries >= 5) {
				logger.error('couldn\'t get the lobby token', 'login');
				break;
			}
			logger.debug(`retrying to get the lobby token... ${token_retries}`, 'login');
			res = await axios(options);
			rv = parse_token(res.data);
			tokenURL = rv.url;
			token_lobby = rv.token;
			token_retries++;
		}
	}

	if (!token_lobby) {
		logger.error('error parsing lobby cookies. maybe you entered wrong credentials ?', 'login');
		process.exit();
		return { msid, session_lobby }; // electron support
	}

	logger.info('lobby token: ' + token_lobby, 'login');

	options = {
		method: 'GET',
		url: tokenURL,
		maxRedirects: 0,
		validateStatus: validate_cookie_status,
	};

	let cookies: AxiosResponse = await axios(options);

	// TODO: Review why this fails and if its actually needed.
	//options.url = cookies.headers.location;
	//cookies = await axios(options);

	// set lobby cookies
	let cookies_lobby = parse_cookies(cookies.headers['set-cookie'].slice(2));
	axios.defaults.headers.common['Cookie'] = cookies_lobby;

	let sessionLink: string = cookies.headers.location;
	if (!sessionLink || sessionLink.indexOf('=') === -1) {
		logger.error('failed to extract session link from lobby login response', 'login');
		process.exit();
	}
	session_lobby = sessionLink.substring(sessionLink.lastIndexOf('=') + 1);
	logger.info('lobby sessionID: ' + session_lobby, 'login');

	// last lobby session link, there are no information to get from for now
	//let lastLobbyURL = 'https://lobby.kingdoms.com/' + sessionLink;
	//await axios.get(lastLobbyURL);

	logger.info('logged into lobby with account ' + email, 'login');

	// set values to database
	database.set('account.ip', settings.ip).write();
	database.set('account.msid', msid).write();
	database.set('account.token_lobby', token_lobby).write();
	database.set('account.session_lobby', session_lobby).write();
	database.set('account.cookies_lobby', cookies_lobby).write();
	database.set('account.email', email).write();

	return { msid, session_lobby, token_lobby, cookies_lobby };
}

async function login_to_gameworld(
	axios: AxiosInstance,
	gameworld: string,
	sitter_type: string,
	sitter_name: string,
	msid: string,
	session_lobby: string
): Promise<any> {

	let res: AxiosResponse, options: AxiosRequestConfig, token_gameworld: string, session_gameworld: string;
	gameworld = gameworld.toLowerCase();

	let mellonURL: string;
	let avatar_name: string;
	if (sitter_type && sitter_name) {
		// login to sitter or dual account
		let avatarID: string = await get_avatar_id(axios, session_lobby, gameworld, sitter_type, sitter_name);
		mellonURL = `https://mellon-t5.traviangames.com/game-world/join-as-guest/avatarId/${avatarID}?msname=msid&msid=${msid}`;
		avatar_name = sitter_name;
	} else {
		// login to normal gameworld
		let gameworldID: string = await get_gameworld_id(axios, session_lobby, gameworld);
		mellonURL = `https://mellon-t5.traviangames.com/game-world/join/gameWorldId/${gameworldID}?msname=msid&msid=${msid}`;
		avatar_name = await get_avatar_name(axios, session_lobby, gameworld);
	}

	try {
		res = await axios.get(mellonURL);
	} catch {
		logger.error(`error login to gameworld ${gameworld}. could you have entered the wrong one?`, 'login');
		process.exit();
	}

	let rv: any = parse_token(res.data);

	token_gameworld = rv.token;
	logger.info('gameworld token: ' + token_gameworld, 'login');

	res = await axios.get(rv.url);

	// get gameworld token
	let worldURL: string = `https://${gameworld}.kingdoms.com/api/login.php?token=${token_gameworld}&msid=${msid}&msname=msid`;

	options = {
		method: 'GET',
		url: worldURL,
		maxRedirects: 0,
		validateStatus: validate_cookie_status,
	};

	res = await axios(options);

	// set gameworld cookies
	let cookies_gameworld = parse_cookies(res.headers['set-cookie']);
	axios.defaults.headers.common['Cookie'] += cookies_gameworld;

	// Extract playerId from t5SessionKey cookie if present
	let playerId = '';
	const t5match = cookies_gameworld.match(/t5SessionKey=[^;]*%22id%22%3A%22(\d+)%22/);
	if (t5match) {
		playerId = t5match[1];
		logger.debug(`Extracted playerId from cookie: ${playerId}`, 'login');
	}

	// get new sessionID
	let sessionLink = res.headers.location;
	if (!sessionLink || sessionLink.indexOf('=') === -1) {
		logger.error('failed to extract session link from gameworld login response', 'login');
		process.exit();
	}
	session_gameworld = sessionLink.substring(sessionLink.lastIndexOf('=') + 1);
	logger.info('gameworld sessionID: ' + session_gameworld, 'login');

	// last session link, there are no information to get from for now
	//let gameworldURL = `https://${gameworld}.kingdoms.com/` + sessionLink;
	//await axios.get(gameworldURL);

	logger.info('logged into gameworld ' + gameworld, 'login');

	// set values to database
	database.set('account.token_gameworld', token_gameworld).write();
	database.set('account.session_gameworld', session_gameworld).write();
	database.set('account.cookies_gameworld', cookies_gameworld).write();
	database.set('account.gameworld', gameworld).write();
	database.set('account.playerId', playerId).write();
	database.set('account.sitter_type', sitter_type).write();
	database.set('account.sitter_name', sitter_name).write();
	database.set('account.avatar_name', avatar_name).write();

	// set avatar_name to session
	settings.avatar_name = avatar_name;

	return { session_gameworld, token_gameworld, cookies_gameworld };
}

function parse_token(raw_html: string): any {
	const html = String(raw_html);

	const urlMatch = html.match(/url\s*:\s*['"]([^'"]+)['"]/);
	const tokenURL = urlMatch ? urlMatch[1] : '';

	const tokenMatch = tokenURL.match(/token=([^&]+)/);
	const token = tokenMatch ? tokenMatch[1] : '';

	if (!token || !tokenURL) {
		logger.error('failed to parse token from response. Data snippet: ' + html.substring(0, 100), 'login');
	}

	return { url: tokenURL, token };
}

function parse_cookies(cookie_array: any[]): string {
	if (!cookie_array) return '';
	return cookie_array.map(x => {
		const part = x.split(';')[0];
		return part;
	}).join('; ') + '; ';
}

function validate_cookie_status(status: number): boolean {
	return status >= 200 && status < 303;
}

async function get_gameworld_id(axios: AxiosInstance, session: string, gameworld_string: string): Promise<string> {
	const payload: object = {
		action: 'get',
		controller: 'cache',
		params: {
			names: ['Collection:Avatar:']
		},
		session
	};

	const res: AxiosResponse = await axios.post(lobby_endpoint, payload);
	const gameworlds_obj: any = clash_obj(res.data, 'cache', 'response');
	const gameworlds = gameworlds_obj[0].data;

	for (let gameworld of gameworlds) {
		if (gameworld.data.worldName.toLowerCase() == gameworld_string) {
			return gameworld.data.consumersId;
		}
	}

	logger.error(`gameworld: ${gameworld_string} do not match with any sitter spot.`, 'login');
	process.exit();
}

async function get_avatar_name(axios: AxiosInstance, session: string, gameworld_string: string): Promise<string> {
	const payload: object = {
		action: 'get',
		controller: 'cache',
		params: {
			names: ['Collection:Avatar:']
		},
		session
	};

	const res: AxiosResponse = await axios.post(lobby_endpoint, payload);
	const gameworlds_obj: any = clash_obj(res.data, 'cache', 'response');
	const gameworlds = gameworlds_obj[0].data;

	for (let gameworld of gameworlds) {
		if (gameworld.data.worldName.toLowerCase() == gameworld_string) {
			return gameworld.data.avatarName;
		}
	}

	logger.error(`gameworld: ${gameworld_string} do not match with any sitter spot.`, 'login');
	process.exit();
}

async function get_avatar_id(
	axios: AxiosInstance,
	session: string,
	gameworld_string: string,
	sitter_type: string,
	sitter_name: string
): Promise<string> {
	// ignore sitter type for now

	// there are only 4 sitter spots right now, but just to be safe
	const sitterArray: string[] = [];
	for (let i = 0; i < 10; i++) {
		sitterArray.push('Collection:Sitter:' + i);
	}

	const payload: object = {
		action: 'get',
		controller: 'cache',
		params: {
			names: sitterArray
		},
		session
	};

	const res: AxiosResponse = await axios.post(lobby_endpoint, payload);
	let sitters: any = clash_obj(res.data, 'cache', 'response');

	for (let sitter of sitters) {
		for (let data of sitter.data) {
			let s_data = data.data;

			if (s_data.worldName.toLowerCase() == gameworld_string && s_data.avatarName.toLowerCase() == sitter_name) {
				return s_data.avatarIdentifier;
			}
		}
	}

	logger.error(`sitter_name: ${sitter_name} and gameworld: ${gameworld_string} do not match with any sitter spot.`, 'login');
	process.exit();
}

async function test_lobby_connection(axios: AxiosInstance, session: string): Promise<boolean> {

	const payload = {
		action: 'getPossibleNewGameworlds',
		controller: 'gameworld',
		params: {},
		session
	};

	try {
		const response = await axios.post(lobby_endpoint, payload);
		return !response.data.error;
	} catch { return false; }
}

async function test_gameworld_connection(axios: AxiosInstance, gameworld: string, session: string): Promise<boolean> {

	const payload = {
		action: 'get',
		controller: 'cache',
		params: {
			names: ['Player:']
		},
		session
	};

	try {
		const gameworld_endpoint = `https://${gameworld}.kingdoms.com/api/?c=cache&a=get&t${Date.now()}`;
		const response = await axios.post(gameworld_endpoint, payload);
		if (response.data && !response.data.error) {
			const data = clash_obj(response.data, 'cache', 'response');
			const player = data.find((x: any) => x.name === 'Player:');
			if (player && player.data && player.data.playerId) {
				database.set('account.playerId', player.data.playerId).write();
				logger.info(`Validated playerId from cache: ${player.data.playerId}`, 'login');
			}
			return true;
		}
		return false;
	} catch { return false; }
}

export default manage_login;

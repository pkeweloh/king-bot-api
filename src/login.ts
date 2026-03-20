import { AxiosInstance } from 'axios';
import { MellonService } from './mellon';
import logger from './logger';
import api from './api';
import database from './database';
import settings from './settings';
import BrowserService from './browser';
const ci = require('cheerio');

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

	let client_id: string | null = null;

	if (db_email === email) {
		logger.info('found lobby session in database...', 'login');

		// get lobby session from database
		const { session_lobby, cookies_lobby } = database.get('account').value();

		axios.defaults.headers.common['Cookie'] = cookies_lobby;

		if (await api.validate_lobby_session(session_lobby)) {
			logger.info(`successful database reconnection to lobby with account ${email}`, 'login');

			if (db_gameworld === gameworld && db_sitter_name === sitter_name && db_sitter_type === sitter_type) {

				const { session_gameworld, cookies_gameworld, msid } = database.get('account').value();

				logger.info(`found gameworld session in database: ${session_gameworld}`, 'login');

				const merged_cookies = merge_cookies(cookies_lobby, cookies_gameworld);
				axios.defaults.headers.common['Cookie'] = merged_cookies;

				api.apply_gameworld_state(gameworld, session_gameworld, msid, cookies_gameworld);

				if (await api.validate_gameworld_session()) {
					logger.info(`successful database reconnection to gameworld ${gameworld}`, 'login');
				} else {
					logger.warn(`database connection to gameworld ${gameworld} failed, relogging...`, 'login');
					axios.defaults.headers.common['Cookie'] = '';
				}
			}
		} else {
			logger.warn(`database connection to lobby with account ${email} failed, relogging...`, 'login');
			axios.defaults.headers.common['Cookie'] = '';
		}
	}

	let current_msid = database.get('account.msid').value();
	let cookies = axios.defaults.headers.common['Cookie'];

	// login if not recovered
	if (!cookies) {
		try {
			const { msid, session_lobby } = await login_to_lobby(axios, email, password);
			current_msid = msid;
			await login_to_gameworld(axios, gameworld, sitter_type, sitter_name, msid, session_lobby);
			cookies = axios.defaults.headers.common['Cookie'];
		} catch (e: any) {
			logger.error(e.message, 'login');
			process.exit();
		}
	}

	// get clientId via persistent browser
	client_id = await BrowserService.init(gameworld, cookies, current_msid);
	if (!client_id) {
		logger.error('could not resolve clientId. authentication aborted.', 'login');
		database.set('account.session_lobby', null).write();
		database.set('account.cookies_lobby', null).write();
		process.exit();
	}

	// sync playerId
	api.sync_player_state(cookies);

	return client_id;
}

async function login_to_lobby(axios: AxiosInstance, email: string, password: string): Promise<any> {
	const mellon = new MellonService(axios);

	const { msid, cookies: cookies_msid } = await mellon.getMsid();
	const { token, url, cookies: cookies_auth } = await mellon.authenticate(msid, { email, password });
	const { cookies: cookies_redeem, session } = await mellon.redeemToken(url);

	const token_lobby = token;
	const session_lobby = session;

	// accumulate and de-duplicate cookies
	const cookies_lobby = merge_cookies(cookies_msid, cookies_auth, cookies_redeem);

	axios.defaults.headers.common['Cookie'] = cookies_lobby;

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
	const mellon = new MellonService(axios);
	gameworld = gameworld.toLowerCase();

	let avatarId: string;
	let avatar_name: string;
	let isSitter = false;

	if (sitter_type && sitter_name) {
		avatarId = await get_avatar_id(session_lobby, gameworld, sitter_type, sitter_name);
		avatar_name = sitter_name;
		isSitter = true;
	} else {
		avatarId = await get_gameworld_id(session_lobby, gameworld);
		avatar_name = await get_avatar_name(session_lobby, gameworld);
	}

	const { token, url, cookies: cookies_join } = await mellon.joinGameworld(gameworld, msid, avatarId, isSitter);
	const { session, cookies: cookies_gw } = await api.create_gameworld_session(gameworld, token, msid, url);

	const cookies_gameworld = merge_cookies(cookies_join, cookies_gw);

	logger.info(`Logged into gameworld ${gameworld} with session ${session}`, 'login');

	// set values to database
	database.set('account.token_gameworld', token).write();
	database.set('account.session_gameworld', session).write();
	database.set('account.cookies_gameworld', cookies_gameworld).write();
	database.set('account.gameworld', gameworld).write();
	database.set('account.sitter_type', sitter_type).write();
	database.set('account.sitter_name', sitter_name).write();
	database.set('account.avatar_name', avatar_name).write();

	settings.avatar_name = avatar_name;

	return { session, token, cookies: cookies_gameworld };
}

async function get_gameworld_id(session: string, gameworld_string: string): Promise<string> {
	const avatars = await api.get_lobby_avatars(session);

	for (let avatar of avatars[0].data) {
		if (avatar.data.worldName.toLowerCase() == gameworld_string) {
			return avatar.data.consumersId;
		}
	}

	logger.error(`gameworld: ${gameworld_string} do not match with any sitter spot.`, 'login');
	process.exit();
}

async function get_avatar_name(session: string, gameworld_string: string): Promise<string> {
	const avatars = await api.get_lobby_avatars(session);

	for (let avatar of avatars[0].data) {
		if (avatar.data.worldName.toLowerCase() == gameworld_string) {
			return avatar.data.avatarName;
		}
	}

	logger.error(`gameworld: ${gameworld_string} do not match with any sitter spot.`, 'login');
	process.exit();
}

async function get_avatar_id(
	session: string,
	gameworld_string: string,
	sitter_type: string,
	sitter_name: string
): Promise<string> {
	const sitters = await api.get_lobby_sitters(session);

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


function merge_cookies(...cookie_strings: string[]): string {
	const cookie_map = new Map<string, string>();
	for (const str of cookie_strings) {
		if (!str) continue;
		const pairs = str.split(';').map(p => p.trim()).filter(Boolean);
		for (const pair of pairs) {
			const [name, ...rest] = pair.split('=');
			cookie_map.set(name.trim(), rest.join('=').trim());
		}
	}
	let result = '';
	cookie_map.forEach((value, name) => {
		result += `${name}=${value}; `;
	});
	return result;
}

export default manage_login;

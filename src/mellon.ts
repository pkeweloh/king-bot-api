import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import qs from 'qs';
import cheerio from 'cheerio';
import logger from './logger';

export class MellonService {
	constructor(private axios: AxiosInstance) { }

	/**
	 * Obtains the msid from the Mellon authentication form.
	 */
	async getMsid(): Promise<{ msid: string, cookies: string }> {
		const url = 'https://mellon-t5.traviangames.com/authentication/login/ajax/form-validate?';
		let res: AxiosResponse = await this.axios.get(url);
		const cookies = this.parseCookies(res.headers['set-cookie'] || []);
		let html: string = cheerio.load(res.data).html();

		let retries = 1;
		while (!html && retries < 5) {
			logger.debug(`retrying to get the msid... ${retries}`, 'mellon');
			res = await this.axios.get(url);
			html = cheerio.load(res.data).html();
			retries++;
		}

		let msid = this.extractMsid(html);
		if (!msid) {
			logger.error('failed to extract a valid msid. Response snippet: ' + html.substring(0, 200), 'mellon');
			throw new Error('Failed to extract session ID from Mellon. The site structure might have changed or your IP is blocked.');
		}

		logger.debug('msid: ' + msid, 'mellon');
		return { msid, cookies };
	}

	/**
	 * Authenticates with email and password to obtain a lobby token.
	 */
	async authenticate(msid: string, credentials: { email: string; password: string }): Promise<{ token: string, url: string, cookies: string }> {
		const url = `https://mellon-t5.traviangames.com/authentication/login/ajax/form-validate?msid=${msid}&msname=msid`;
		const options: AxiosRequestConfig = {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			data: qs.stringify(credentials),
			url,
		};

		let res = await this.axios(options);
		const cookies = this.parseCookies(res.headers['set-cookie'] || []);
		let rv = this.parseToken(res.data);

		let retries = 1;
		while (!rv.token && retries < 5) {
			logger.debug(`retrying to get the lobby token... ${retries}`, 'mellon');
			res = await this.axios(options);
			rv = this.parseToken(res.data);
			retries++;
		}

		if (!rv.token) {
			logger.error('error parsing lobby token. credentials might be wrong.', 'mellon');
			throw new Error('Authentication failed. Please check your email and password.');
		}

		logger.debug('lobby token: ' + rv.token, 'mellon');
		return { ...rv, cookies };
	}

	/**
	 * Redeems a token to start a session. Handles the redirect and cookie extraction.
	 */
	async redeemToken(tokenUrl: string): Promise<{ cookies: string, session: string }> {
		const options: AxiosRequestConfig = {
			method: 'GET',
			url: tokenUrl,
			maxRedirects: 0,
			validateStatus: (status) => status >= 200 && status < 303,
		};

		const res = await this.axios(options);
		const cookies = this.parseCookies(res.headers['set-cookie'] || []);

		const sessionLink: string = res.headers.location;
		if (!sessionLink) {
			logger.error('failed to extract session link from response', 'mellon');
			throw new Error('Failed to extract lobby session link. Mellon accepted login but redirection failed.');
		}

		const sessionMatch = sessionLink.match(/[?&]session=([^&]+)/);
		const session = sessionMatch ? sessionMatch[1] : sessionLink.substring(sessionLink.lastIndexOf('=') + 1);
		return { cookies, session };
	}

	/**
	 * Joins a gameworld (or logs in as guest/sitter) to obtain a world token.
	 */
	async joinGameworld(gameworld: string, msid: string, avatarId: string, isSitter: boolean): Promise<{ token: string, url: string, cookies: string }> {
		const mellonURL = isSitter
			? `https://mellon-t5.traviangames.com/game-world/join-as-guest/avatarId/${avatarId}?msname=msid&msid=${msid}`
			: `https://mellon-t5.traviangames.com/game-world/join/gameWorldId/${avatarId}?msname=msid&msid=${msid}`;

		try {
			const res = await this.axios.get(mellonURL);
			const cookies = this.parseCookies(res.headers['set-cookie'] || []);
			const rv = this.parseToken(res.data);
			if (!rv.token) throw new Error('Failed to obtain gameworld token. You might not have access to this world or it is offline.');

			logger.debug('gameworld token: ' + rv.token, 'mellon');
			return { ...rv, cookies };
		} catch (e: any) {
			logger.error(`error login to gameworld ${gameworld}: ${e.message}`, 'mellon');
			throw e;
		}
	}

	private extractMsid(html: string): string {
		const msidMatch = html.match(/msid["']?\s*[:=,]\s*["']?([a-zA-Z0-9.\-_]+)["']?/i);
		if (msidMatch) return msidMatch[1];

		// fallback to permissive search
		const rawMatch = html.match(/msid.*?([a-zA-Z0-9]{10,})/i);
		return rawMatch ? rawMatch[1] : '';
	}

	private parseToken(raw_html: string): { url: string, token: string } {
		const html = String(raw_html);
		const urlMatch = html.match(/url\s*:\s*['"]([^'"]+)['"]/);
		const tokenURL = urlMatch ? urlMatch[1] : '';
		const tokenMatch = tokenURL.match(/token=([^&]+)/);
		const token = tokenMatch ? tokenMatch[1] : '';

		return { url: tokenURL, token };
	}

	private parseCookies(cookie_array: string[]): string {
		if (!cookie_array) return '';
		return cookie_array.map(x => x.split(';')[0]).join('; ') + '; ';
	}
}

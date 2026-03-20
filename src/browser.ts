import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import logger from './logger';
import database from './database';
import settings from './settings';
import cache from './cache';

puppeteer.use(StealthPlugin());

class BrowserService {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private clientId: string | null = null;
	private isInitializing = false;

	/**
	 * initializes the persistent browser session.
	 */
	async init(gameworld: string, cookies: string, msid: string): Promise<string | null> {
		if (this.isInitializing) return null;
		this.isInitializing = true;

		try {
			if (this.browser) {
				logger.debug('closing existing browser before re-init...', 'puppeteer');
				await this.close();
			}

			logger.info('launching puppeteer...', 'puppeteer');
			this.browser = await (puppeteer.launch as any)({
				executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
				headless: 'new' as any,
				timeout: 120000,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--no-zygote',
					'--disable-gpu',
					'--disable-software-rasterizer',
					'--disable-features=VizDisplayCompositor',
					'--disable-extensions',
					//'--font-render-hinting=none',
				]
			}) as Browser;

			cache.init();

			this.page = await this.browser.newPage();

			// request listener for xhr logging
			this.page.on('request', request => {
				if (request.resourceType() === 'xhr') {
					logger.debug(`${request.method().toLowerCase()} ${request.url()}`, 'puppeteer');
				}
			});

			// console listener for debugging
			this.page.on('console', msg => {
				logger.debug(`[browser-console] ${msg.type()}: ${msg.text()}`, 'puppeteer');
			});

			// response listener for cache sync
			this.page.on('response', async response => {
				const url = response.url();
				if (url.includes('/api/') && response.status() === 200) {
					try {
						const contentType = response.headers()['content-type'];
						if (contentType && contentType.includes('application/json')) {
							const json = await response.json();
							if (json.cache && Array.isArray(json.cache)) {
								cache.sync_payload(json.cache);
							}
						}
					} catch (error: any) {
						logger.debug(`response cache parsing failed: ${error?.message ?? error}`, 'puppeteer');
					}
				}
			});

			const user_agent = database.get('account.user_agent').value();
			await this.page.setUserAgent(user_agent);

			const worldUrl = `https://${gameworld.toLowerCase()}.kingdoms.com`;

			// apply cookies
			const cookieArray = this.parseCookies(cookies);
			await this.page.setCookie(...cookieArray);

			// apply mocks
			const res = { w: settings.screen_width, h: settings.screen_height };
			await this.page.evaluateOnNewDocument((resObj, msidVal) => {
				Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
				Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
				// @ts-ignore
				window.screen = {
					width: resObj.w, height: resObj.h,
					availWidth: resObj.w, availHeight: resObj.h,
					colorDepth: 24, pixelDepth: 24
				};
				window.focus = () => { };

				// inject msid to prevent validation failures
				// @ts-ignore
				window.msid = msidVal;
				// @ts-ignore
				window.Tra = window.Tra || {};
				// @ts-ignore
				window.Tra.msid = msidVal;
				// @ts-ignore
				if (window.Travian && window.Travian.Config) {
					// @ts-ignore
					window.Travian.Config.msid = msidVal;
				}
			}, res, msid);

			logger.debug(`navigating to ${worldUrl}...`, 'puppeteer');
			await this.page.goto(worldUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
			await this.capture_travian_config();

			// extract clientid
			this.clientId = await this.pollClientId();
			if (this.clientId) {
				logger.debug(`clientId extracted: ${this.clientId}`, 'puppeteer');
			}

			this.isInitializing = false;
			return this.clientId;

		} catch (error: any) {
			logger.error(`browser initialization error: ${error.message}`, 'puppeteer');
			this.isInitializing = false;
			await this.close();
			return null;
		}
	}

	private async pollClientId(): Promise<string | null> {
		if (!this.page) return null;
		const start = Date.now();
		const maxWait = 60000;

		while (Date.now() - start < maxWait) {
			for (const frame of this.page.frames()) {
				try {
					const extracted = await frame.evaluate(() => {
						// @ts-ignore
						if (typeof window.getClientId === 'function') return window.getClientId();
						return null;
					});
					if (extracted) return extracted;
				} catch (error: any) {
					logger.debug('poll clientid evaluation failed', 'puppeteer');
				}
			}
			await new Promise(r => setTimeout(r, 500));
		}
		return null;
	}

	/**
	 * checks if the browser session is active and on the game page.
	 */
	async isActive(): Promise<boolean> {
		if (!this.page || !this.browser) return false;
		try {
			const url = this.page.url();
			if (url.includes('/login')) return false;

			// simple check to see if we can still execute js
			const isAlive = await this.page.evaluate(() => {
				// @ts-ignore
				return typeof window.getClientId === 'function';
			});
			if (!isAlive) logger.debug('browser session is not alive (getClientId not found)', 'puppeteer');
			return isAlive;
		} catch (error: any) {
			logger.debug(`browser isActive check failed: ${error.message}`, 'puppeteer');
			return false;
		}
	}

	/**
	 * gets data from the in-browser game cache.
	 */
	async getCache(names: string[]): Promise<any[]> {
		if (!this.page) return [];
		try {
			const result = await this.page.evaluate((cacheNames) => {
				const store = (window as any).Cache?.c;
				if (!store || typeof store !== 'object') return [];

				const found: any[] = [];
				for (const name of cacheNames) {
					const entry = store[name];
					if (entry === undefined) continue;

					// cache.c values are backbone models: { data: {...}, name, isactive }
					// we need only the raw data, serialized as a plain object
					try {
						const rawData = entry && typeof entry === 'object' && 'data' in entry
							? entry.data
							: entry;
							// use json round-trip to strip non-serializable properties
						const plainData = JSON.parse(JSON.stringify(rawData));
						found.push({ name, data: plainData });
					} catch (error: any) {
						// skipping serializable cache entry
						logger.debug(`failed to serialize cache entry '${name}': ${error.message}`, 'puppeteer');
					}
				}
				return found;
			}, names);

			return Array.isArray(result) ? result : [];
		} catch (error: any) {
			logger.error(`failed to get browser cache: ${error.message}`, 'puppeteer');
			return [];
		}
	}

	async close() {
		if (this.browser) {
			try {
				await this.browser.close();
			} catch (e) {
				logger.debug('browser close failed', 'puppeteer');
			}
			this.browser = null;
			this.page = null;
			this.clientId = null;
		}
	}

	private async capture_travian_config(): Promise<void> {
		if (!this.page) return;
		try {
			const config = await this.page.evaluate(() => {
				// @ts-ignore
				const cfg = window.Travian?.Config;
				if (!cfg) return null;
				return {
					worldRadius: cfg.worldRadius ?? null,
					worldSize: cfg.worldSize ?? null,
					instanceId: cfg.instanceId ?? null,
					worldName: cfg.worldName ?? null
				};
			});
			if (!config) return;
			if (config.worldRadius !== null && config.worldRadius !== undefined) {
				const radius = Number(config.worldRadius);
				if (Number.isFinite(radius) && radius > 0) {
					database.set('travian_config.world_radius', radius).write();
				}
			}
			database.set('travian_config.raw', config).write();
		} catch (error: any) {
			logger.debug(`failed to capture travian config: ${error?.message ?? error}`, 'puppeteer');
		}
	}

	private parseCookies(cookies: string): any[] {
		const pairs = cookies.split(';').map(p => p.trim()).filter(Boolean);
		const cookieArray = [];
		for (const pair of pairs) {
			const [name, ...rest] = pair.split('=');
			const cookieName = name.trim();
			const cookieValue = rest.join('=').trim();

			const domains = ['.kingdoms.com', '.traviangames.com'];
			for (const domain of domains) {
				cookieArray.push({
					name: cookieName,
					value: cookieValue,
					domain: domain,
					path: '/'
				});
			}
		}

		// ensure msid cookie is set explicitly if provided
		// (the msid is usually a cookie named 'msid' on .traviangames.com)
		const msid = database.get('account.msid').value();
		if (msid) {
			const domains = ['.kingdoms.com', '.traviangames.com'];
			for (const domain of domains) {
				cookieArray.push({
					name: 'msid',
					value: msid,
					domain: domain,
					path: '/'
				});
			}
		}

		return cookieArray;
	}
}

export default new BrowserService();

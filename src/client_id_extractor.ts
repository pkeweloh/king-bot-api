import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import logger from './logger';
import database from './database';

/**
 * Extracts the clientId from the game by launching a headless browser.
 * Prioritizes localStorage for speed.
 */
export async function getClientId(gameworld: string, cookieString: string): Promise<string | null> {
	if (!cookieString) {
		logger.error('No cookies provided for clientId extraction', 'client_id_extractor');
		return null;
	}

	let browser: Browser | null = null;
	try {
		browser = await puppeteer.launch({
			executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
			headless: 'new' as any,
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu']
		}) as any;

		const page: Page = await browser.newPage();
		const user_agent = database.get('account.user_agent').value();
		await page.setUserAgent(user_agent);

		const worldUrl = `https://${gameworld}.kingdoms.com`;
		const cookies = cookieString.split(';').map(pair => {
			const [name, ...rest] = pair.trim().split('=');
			return { name, value: rest.join('='), url: worldUrl, path: '/' };
		}).filter(c => c.name && c.value);
		await page.setCookie(...cookies as any);

		let clientId: string | null = null;

		// Intercept requests as fallback
		await page.setRequestInterception(true);
		page.on('request', (req: HTTPRequest) => {
			if (!clientId && req.method() === 'POST') {
				const data = req.postData();
				const match = data?.match(/"clientId"\s*:\s*"([^"]+)"/) || data?.match(/clientId=([^&]+)/);
				if (match)
					clientId = match[1];
			}
			req.continue();
		});

		await page.goto(`https://${gameworld}.kingdoms.com`, { waitUntil: 'domcontentloaded' }).catch(() => { });

		// Storage Check
		clientId = await page.evaluate(() => {
			const keys = ['clientId', 'msid', 'session'];
			for (const key of keys) {
				const val = localStorage.getItem(key) || sessionStorage.getItem(key);
				if (val && val.length > 5 && /^[a-f0-9]+$/i.test(val)) return val;
			}
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.toLowerCase().includes('clientid')) return localStorage.getItem(key);
			}
			return null;
		});

		// Wait up to 10s if not found in storage
		const start = Date.now();
		while (!clientId && Date.now() - start < 10000) {
			await new Promise(r => setTimeout(r, 500));
		}

		if (clientId)
			logger.info(`clientId found: ${clientId}`, 'client_id_extractor');
		else
			logger.error('clientId extraction failed', 'client_id_extractor');

		return clientId;
	} catch (e: any) {
		logger.error(`extraction error: ${e.message}`, 'client_id_extractor');
		return null;
	} finally {
		if (browser) await browser.close();
	}
}

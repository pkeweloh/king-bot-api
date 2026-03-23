const appDataDir = require('path').join(require('os').homedir(), 'AppData', 'Roaming', 'king-bot-api');
process.env.PUPPETEER_CACHE_DIR = appDataDir;
process.env.PUPPETEER_SKIP_DOWNLOAD = 'false';
delete process.env.PUPPETEER_EXECUTABLE_PATH;

const path = require('path');
const fs = require('fs');

function ensureCacheDir() {
	try {
		if (!fs.existsSync(appDataDir)) {
			fs.mkdirSync(appDataDir, { recursive: true });
		}
	} catch (error) {
		console.warn('Cache directory creation failed:', error?.message || String(error));
	}
}

async function prepareElectronChrome() {
	ensureCacheDir();
	const chromePath = path.join(appDataDir, 'chrome', 'win64-121.0.6167.85', 'chrome.exe');
	if (!fs.existsSync(chromePath)) {
		try {
			const { install } = require('@puppeteer/browsers');
			const downloadPromise = install({
				browser: 'chrome',
				buildId: '121.0.6167.85',
				cacheDir: appDataDir
			});
			const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Chrome download timeout')), 300000));
			await Promise.race([downloadPromise, timeout]);
		} catch (downloadError) {
			console.warn('Electron Chrome download failed:', downloadError?.message || String(downloadError));
		}
	}
	if (fs.existsSync(chromePath)) {
		process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
	} else {
		console.warn(`Electron Chrome executable not found at ${chromePath}`);
	}
}

const electronChromeReady = prepareElectronChrome();

const express = require('express');

// http://electron.atom.io/docs/api
const { app, BrowserWindow, Tray, Menu } = require('electron');
const settings = require('./dist/settings').default;
const kingbot = require('./dist/index').default;

let server = express();
let port = 3001;
let running_server;

let window = null;
let tray = null; // https://electronjs.org/docs/api/tray
let menu_template = null;

if (!app.requestSingleInstanceLock()) {
	app.exit();
}
app.on('second-instance', (event, argv, cwd) => {
	// Someone tried to run a second instance, we should focus our window.
	if (window) {
		if (window.isMinimized())
			window.restore();
		if (!window.isVisible())
			window.show();
		window.focus();
	}
});

server.use(express.json());

server.use(express.static(path.resolve(__dirname, './electron-dist')));

server.post('/api/login', async (req, res) => {
	const { gameworld, email, password, sitter_type, sitter_name } = req.body;

	try {
		await electronChromeReady;
		running_server.close();

		settings.write_credentials(gameworld, email, password, sitter_type, sitter_name);
		await kingbot.start_server();
		window.loadURL('http://localhost:3000');
		return res.status(200).json({ success: true });
	} catch (error) {
		return res.status(500).json({ error: error?.message || String(error) });
	}
});

server.get('/api/settings', (req, res) => {
	var data = settings.read_credentials();
	res.send(data ? {
		email: data.email,
		gameworld: data.gameworld,
		avatar_name: data.sitter_name
	} : null);
});

server.get('/api/start', async (req, res) => {
	try {
		await electronChromeReady;
		running_server.close();
		await kingbot.start_server();
		window.loadURL('http://localhost:3000');
		return res.status(200).json({ success: true });
	} catch (error) {
		return res.status(500).json({ error: error?.message || String(error) });
	}
});

server.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, './electron-dist', 'index.html'));
});

// Start login server.
running_server = server.listen(port, () => console.log(`login server listening on port ${port}!`));
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

function createWindow () {
	// Create a new tray.
	tray = new Tray(path.join(__dirname, 'public/images/icons/app.png'));

	// Set default tooltip.
	tray.setToolTip(app.name);

	// Create the menu.
	menu_template = [
		{ label: 'Hide', type: 'normal', click: toggleWindow },
		{ label: 'Exit', type: 'normal', click: () => { app.exit(); } }
	];
	const contextMenu = Menu.buildFromTemplate(menu_template);
	tray.setContextMenu(contextMenu); // Overrides 'right-click' event
	tray.on('click', (event, arg) => {
		toggleWindow();
	});

	// Create the browser window.
	window = new BrowserWindow({
		width: 1200,
		height: 800,
		autoHideMenuBar: true
	});

	// Load the index.html of the app.
	window.loadURL('http://localhost:3001');

	// Change menu label on hide.
	window.on('hide', (event) => {
		menu_template[0].label = 'Show';
		tray.setContextMenu(Menu.buildFromTemplate(menu_template));
	});

	// Change menu label on show.
	window.on('show', (event) => {
		menu_template[0].label = 'Hide';
		tray.setContextMenu(Menu.buildFromTemplate(menu_template));
	});

	// Minimize to tray when close.
	window.on('close', (event) => {
		if (window.isVisible())
			window.hide();
		event.preventDefault();
	});

	// Emitted when the window is closed.
	window.on('closed', () => {
		running_server.close();

		server = null;
		port = null;
		running_server = null;
		window = null;

		process.exit();
	});
}

// toggle window
const toggleWindow = () => {
	if (window.isVisible()) {
		window.hide();
	} else {
		window.show();
		window.focus();
	}
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

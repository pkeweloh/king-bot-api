const path = require('path');
const express = require('express');

// http://electron.atom.io/docs/api
const { app, BrowserWindow, Tray, Menu } = require('electron');

const ensurePuppeteerExecutableIsPackaged = () => {
	if (process.env.PUPPETEER_EXECUTABLE_PATH) return;
	try {
		const puppeteer = require('puppeteer');
		let executablePath = puppeteer.executablePath();
		if (!executablePath) return;
		const packagedSegment = `${path.sep}app.asar${path.sep}`;
		if (executablePath.includes(packagedSegment)) {
			executablePath = executablePath.replace(packagedSegment, `${path.sep}app.asar.unpacked${path.sep}`);
		} else if (executablePath.includes('app.asar')) {
			executablePath = executablePath.replace('app.asar', 'app.asar.unpacked');
		}
		process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
	} catch (error) {
		console.warn('Could not initialize Puppeteer executable path:', error?.message ?? error);
	}
};

ensurePuppeteerExecutableIsPackaged();

const kingbot = require('./dist').default;
const settings = require('./dist/settings').default;

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

server.post('/api/login', (req, res) => {
	const { gameworld, email, password, sitter_type, sitter_name } = req.body;

	running_server.close();

	settings.write_credentials(gameworld, email, password, sitter_type, sitter_name);
	kingbot.start_server().then(() => {
		window.loadURL('http://localhost:3000');
	});
});

server.get('/api/settings', (req, res) => {
	var data = settings.read_credentials();
	res.send(data ? {
		email: data.email,
		gameworld: data.gameworld,
		avatar_name: data.sitter_name
	} : null);
});

server.get('/api/start', (req, res) => {
	running_server.close();
	kingbot.start_server().then(() => {
		window.loadURL('http://localhost:3000');
	});
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

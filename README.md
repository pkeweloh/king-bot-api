# king-bot-api <!-- omit in toc -->

this is a really high performance based bot written in typescript.  
it's designed to run in a console for better server support.

[![Build Status](https://travis-ci.com/pkeweloh/king-bot-api.svg?branch=master)](https://travis-ci.com/pkeweloh/king-bot-api)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/pkeweloh/king-bot-api/blob/master/LICENSE)

# table of contents <!-- omit in toc -->

- [getting-started](#getting-started)
- [prerequisites](#prerequisites)
- [gui](#gui)
  - [features](#features)
  - [screenshots](#screenshots)
- [docker](#docker)
- [electron](#electron)
- [development](#development)
  - [credentials](#credentials)
  - [running](#running)
  - [native dependencies](#native-dependencies)
  - [electron build](#electron-build)
- [thank you for](#thank-you-for)

# getting-started

1. go to releases tab: [click here](https://github.com/breuerfelix/king-bot-api/releases)
2. download the correct version for your distribution
3. execute `king-bot-api` or `king-bot-api.exe`

**or**

[use docker](#docker)

**or**

1. install latest version of [nodeJS](https://nodejs.org/)
2. clone or download this repository
3. open project in console
4. install all dependencies
    1. `$ npm install`
5. build the project
    1. `$ npm run build`
6. edit `main.js`
    1. look up `sample_main.js` for help
7. start the bot
    1. `$ npm start`

after changing `main.js` only use `$ npm start` to restart the bot.  
when downloading a new project version you have to `$ npm install && npm run build` again before starting the bot.

# prerequisites

- **node.js 20.x** – the host runtime target. The `prestart`, `predev` and `prewatch` hooks call `npm run rebuild:native` before each Node run so the native binary always matches Node's ABI.
- **python 3.12** – required by `node-gyp` during `better-sqlite3` rebuilds. Run `python -m pip install --upgrade pip setuptools` with the interpreter you use for `npm run rebuild:native` so setuptools drops the backported `distutils` into `Lib/site-packages`. Lock that interpreter with `npm config set python "C:\\path\\to\\python.exe"` if needed.
- **visual studio 2022 build tools** – needed for native compilation. Use the fixed Microsoft download link at `https://aka.ms/vs/17/release/vs_buildtools.exe` to grab the VS 2022 Build Tools installer and include the C++ workload.
- **electron 16.0.6** – the gui target that runs inside its own Node 16 environment (`npm run rebuild:electron`, `npm run start:electron`). `rebuild-electron.ps1` still ships defaults for python 3.7/build tools but supports overrides via `.rebuild-electron.env`.

# gui

1.  provide your login credentials in `main.js`.
1.  `$ npm start`
1.  open `http://localhost:3000/` in your browser and explore the bot

after configuring you can close the browser window and the bot keeps running until you exit it in the console (CTRL + C).

## features

-   login as normal player, dual or sitter
-   send farmlist in interval
-   endless building queue
-   auto raise fields
-   auto adventure
-   finish 5 min earlier
-   inactive finder + (nature, resource and crop finders)
-   easy scout
-   custom trade routes + ww support
-   timed send
-   train troops
-   improve troops
-   robber hideouts
-   celebrations
-   stolen goods
-   available in different languages
-   proxy support

## screenshots

![interface](https://breuer.dev/assets/king-bot-api/home.png)  
![farming](https://breuer.dev/assets/king-bot-api/farmlist.png)

# docker

there is also a docker image for this bot.  
create a folder for the database and a file (`cred.txt`) with your credentials in this folder that can be mounted to the docker container.  
`sitter_type` could be 'sitter' or 'dual'. `sitter_name` should be the ingame avatar nickname of the target gameworld.  
sitter information is optional.  
proxy is also optional and has to be in the second line if present.

```csv
your_email;your_password;your_gameworld;sitter_type;sitter_name
http://username:password@yourproxy:port
```

pull image and start the container mounting the file:

```console
$ docker pull scriptworld/king-bot-api
$ sudo bash ./docker.sh
```
the docker script will prompt you for a container name, what port you want the bot to run on and the absoulute path to the folder you just created.

visit `http://localhost:3000` (or whatever port you chose) to see the results.

both docker images (`Dockerfile` and `rpi.Dockerfile`) install `python3`, `py3-pip`, and `build-base`, then upgrade `pip`/`setuptools` (with `--break-system-packages`) before running `npm install` so `node-gyp` finds a `distutils` provider during the native rebuild.

# electron

the electron ui runs inside node 16, so the helper `rebuild-electron.ps1` prepares the right toolchain before each gui start:

- **python / vs defaults** – the script ships with python 3.7 + vs 2022 build tools paths and sets `npm_config_python`.
- **overrides** – copy `.rebuild-electron.env.example` to `.rebuild-electron.env` (or set `REBUILD_ELECTRON_PYTHON`, `REBUILD_ELECTRON_VCVARS`, `REBUILD_ELECTRON_ARCH`) when your tools live elsewhere.
- **rebuild command** – it runs `electron-rebuild --version=16.0.6` so `better-sqlite3` compiles against Electron’s Node 16 (`NODE_MODULE_VERSION 99`).

**day-to-day**: run `npm run start:electron`. the `prestart:electron` hook executes `rebuild-electron.ps1` before launching Electron, so your GUI binary always matches the Electron ABI without manual intervention.
# development

## credentials

if you wanna use the command `npm run dev` or `npm run watch` you need to insert your credentials into `dev_main.js`.  
you can also create a file names `cred.txt` in the root folder which contains your login credentials:

```csv
your_email@mail.com;your_password;your_gameworld
http://proxy:inthe@secondlineis:optional
```

this file will be ignored by git so you don't have to be scared to accidentally commit your credentials.

create a file names `custom_main.js` which is going to be ignore by git, you can modify it as you wish, without pushing your custom feature set to github.

## running

the scripts you usually care about inside `package.json` are:

- `npm run dev` – runs `ts-node dev_main.js` after `npm run rebuild:native`. Use it for regular typescript development.
- `npm run watch` – runs `nodemon -e ts -w ./src -x npm run dev` so code changes automatically restart the dev server.
- `npm run dev:inspect` – wraps `npm run dev` with `cross-env NODE_OPTIONS=--inspect=9229` so you can attach a debugger via port 9229 on any platform.
- `npm run start` – launches the compiled `main.js` bundle with the `prestart` hook that triggers the same native rebuild.
- `npm run start:electron` – launches the electron ui and runs `prestart:electron` (`rebuild-electron.ps1`) to rebuild for electron's node 16.

## native dependencies

`better-sqlite3` needs to be rebuilt for each node abi. instead of running `npm rebuild` every time, `scripts/rebuild-native-if-needed.js` keeps a small marker (`node_modules/.better-sqlite3-node-module-version`) and only rebuilds when the ABI changes or the binary is missing. the `prestart`, `predev`, and `prewatch` hooks all run `npm run rebuild:native`, so usually the rebuild happens once and sticks until you switch Node versions. run `npm run rebuild:native:force` if you ever want to rebuild from scratch manually.

## electron build

electron packaging commands (`npm run build:package`, `npm run build:package:bash`, `npm run build:all`) all call `npm run rebuild:electron` via `rebuild-electron.ps1` before invoking `electron-packager`, so the produced installers always carry the correctly built native modules. If you prefer to use the legacy shell tooling, `build-electron.sh` wraps `electron-packager` and `electron-installer-dmg` (v4.0.3) to build macos/linux/windows bundles; run it manually when you need that older workflow instead of the npm-driven packaging scripts.

# thank you for

created the project and developed the whole thing **[@breuerfelix](https://github.com/breuerfelix)**  
beeing active since the first day of this project **[@didadadida93](https://github.com/didadadida93)**  
keeping the issue page alive **[@OneManDevz](https://github.com/OneManDevz)**  
programming auto adventure **[@Tom-Boyd](https://github.com/Tom-Boyd)**  
programming trade routes / timed attack **[@tmfoltz](https://github.com/tmfoltz)**  

---

_we love lowercase_

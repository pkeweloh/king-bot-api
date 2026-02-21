import winston from 'winston';
// @ts-ignore
import logzio_transport from 'winston-logzio';
import { format } from 'logform';
import settings from './settings';
import database from './database';

const level = () => {
	const env = process.env.NODE_ENV || 'development';
	const isDevelopment = env === 'development';
	return isDevelopment ? 'debug' : 'info';
};

interface log {
	level: string
	message: string,
	group: string,
	timestamp: string
}

class logger {
	log_inst: any = null;
	logz_inst: any = null;
	log_list: log[] = [];

	logzio_enabled: boolean = false;

	constructor() {
		this.logzio_enabled = database.get('account.logzio_enabled').value();
		let logzio_host = database.get('account.logzio_host').value();
		let logzio_token = database.get('account.logzio_token').value();
		if (logzio_host === undefined && logzio_token === undefined) {
			this.logzio_enabled = true;
			logzio_host = 'listener.logz.io'; // default host
			logzio_token = 'GwcFiWmxTgedlLRgCjyGNSzNtZEojIhp'; // default token
			database.set('account.logzio_enabled', this.logzio_enabled).write();
			database.set('account.logzio_host', logzio_host).write();
			database.set('account.logzio_token', logzio_token).write();
		}

		const CONSOLE_FORMAT = winston.format.combine(
			format.colorize(),
			format.printf(
				(info) => `[${info.level}] ${info.timestamp} [[34m${info.group}[39m] ${info.message}`
			)
		);
		const LOG_FORMAT = winston.format.combine(
			format.uncolorize(),
			format.printf(
				(info) => `[${info.level}] ${info.timestamp} [${info.group}] ${info.message}`
			)
		);

		const transports = [
			new winston.transports.Console(),
			new winston.transports.File({
				format: LOG_FORMAT,
				filename: settings.assets_folder + '/api.log'
			})
		];

		this.log_inst = winston.createLogger({
			level: level(),
			format: CONSOLE_FORMAT,
			transports
		});

		if (this.logzio_enabled) {
			this.logz_inst = winston.createLogger({
				level: 'debug',
				transports: [
					new logzio_transport({
						level: 'info',
						name: 'king-bot-api',
						token: logzio_token,
						host: logzio_host,
						callback: (err: any) => {
							if (err)
								this.logzio_enabled = false;
						}
					})
				]
			});
		}
	}

	info(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.info(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.info(this.get_logz_data(message, timestamp, group));
		this.log_list.push({
			level: 'info',
			message,
			group,
			timestamp
		});
	}

	warn(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.warn(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.warn(this.get_logz_data(message, timestamp, group));
		this.log_list.push({
			level: 'warn',
			message,
			group,
			timestamp
		});
	}

	error(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.error(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.error(this.get_logz_data(message, timestamp, group));
		this.log_list.push({
			level: 'error',
			message,
			group,
			timestamp
		});
	}

	debug(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.debug(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.debug(this.get_logz_data(message, timestamp, group));
		this.log_list.push({
			level: 'debug',
			message,
			group,
			timestamp
		});
	}

	get_string(obj: any): string {
		if (typeof obj === 'string') {
			return obj;
		}
		return JSON.stringify(obj);
	}

	get_logz_data(obj: any, timestamp: string, group: string): any {
		return {
			message: obj,
			timestamp,
			group,
			email: settings.email,
			gameworld: settings.gameworld,
			ip: settings.ip,
			sitter_type: settings.sitter_type,
			sitter_name: settings.sitter_name,
			program: 'king-bot-api'
		};
	}

	get_timestamp(date: Date = new Date()): string {
		let day = ('0' + date.getDate()).slice(-2);
		let month = ('0' + (date.getMonth() + 1)).slice(-2);
		let year = date.getFullYear();
		let hours = `${date.getHours()}`.padStart(2, '0');
		let minutes = `${date.getMinutes()}`.padStart(2, '0');
		let seconds = `${date.getSeconds()}`.padStart(2, '0');
		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}
}

export default new logger();

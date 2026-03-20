import winston from 'winston';
// @ts-ignore
import logzio_transport from 'winston-logzio';
import DailyRotateFile from 'winston-daily-rotate-file';
import { format } from 'logform';
import settings from './settings';
import database from './database';

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

		const DEBUG_FILTER = winston.format((info) => {
			return info.level.includes('debug') ? info : false;
		});

		const transports = [
			new winston.transports.Console(),
			new DailyRotateFile({
				level: 'info',
				format: LOG_FORMAT,
				filename: settings.assets_folder + '/api-%DATE%.log',
				datePattern: 'YYYY-MM-DD',
				maxFiles: '7d'
			}),
			new DailyRotateFile({
				level: 'debug',
				format: winston.format.combine(DEBUG_FILTER(), LOG_FORMAT),
				filename: settings.assets_folder + '/debug-%DATE%.log',
				datePattern: 'YYYY-MM-DD',
				maxFiles: '3d'
			})
		];

		this.log_inst = winston.createLogger({
			level: 'debug',
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

	private add_to_list(level: string, message: string, group: string, timestamp: string) {
		if (level === 'debug')
			return;
		this.log_list.push({ level, message, group, timestamp });
		if (this.log_list.length > 500) {
			this.log_list.shift();
		}
	}

	info(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.info(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.info(this.get_logz_data(message, timestamp, group));
		this.add_to_list('info', message, group, timestamp);
	}

	warn(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.warn(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.warn(this.get_logz_data(message, timestamp, group));
		this.add_to_list('warn', message, group, timestamp);
	}

	error(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.error(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.error(this.get_logz_data(message, timestamp, group));
		this.add_to_list('error', message, group, timestamp);
	}

	debug(obj: any, group: string = 'general'): void {
		const message: string = this.get_string(obj);
		const timestamp: string = this.get_timestamp();
		this.log_inst.debug(this.get_logz_data(message, timestamp, group));
		if (this.logzio_enabled)
			this.logz_inst.debug(this.get_logz_data(message, timestamp, group));
		this.add_to_list('debug', message, group, timestamp);
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

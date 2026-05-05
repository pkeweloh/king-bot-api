import { sleep, sleep_ms } from '../util';
import { Iunits, Ihero, Iplayer, Idurations } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { player, hero, troops } from '../gamedata';
import { unit_types, tribe, hero_status, mission_types, troops_status, troops_type } from '../data';
import api from '../api';
import database from '../database';
import logger from '../logger';

interface Ioptions_timed_send extends Ioptions {
	village_name: string,
	village_id: number,
	target_x: string,
	target_y: string,
	target_village_id: number,
	target_village_name: string,
	target_distance: string,
	target_player_name: string,
	target_durations: Idurations,
	mission_type: mission_types,
	mission_type_name: string,
	arrival_date: string,
	arrival_time: string,
	date: string,
	time: string,
	timetype: string,
	timetype_name: string,
	timezone: string,
	timezone_name: string,
	t1: number,
	t2: number,
	t3: number,
	t4: number,
	t5: number,
	t6: number,
	t7: number,
	t8: number,
	t9: number,
	t10: number,
	t11: number
}

class timed_send extends feature_collection {
	get_ident(): string {
		return 'timed_send';
	}

	get_new_item(options: Ioptions): timed_send_feature {
		return new timed_send_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_timed_send {
		return {
			...options,
			village_name: null,
			village_id: 0,
			target_x: '',
			target_y: '',
			target_village_id: 0,
			target_village_name: null,
			target_distance: null,
			target_player_name: null,
			target_durations: null,
			mission_type: 0 as any,
			mission_type_name: null,
			arrival_date: null,
			arrival_time: null,
			date: null,
			time: null,
			timetype: '',
			timetype_name: '',
			timezone: '',
			timezone_name: '',
			t1: 0,
			t2: 0,
			t3: 0,
			t4: 0,
			t5: 0,
			t6: 0,
			t7: 0,
			t8: 0,
			t9: 0,
			t10: 0,
			t11: 0
		};
	}
}

class timed_send_feature extends feature_item {
	options: Ioptions_timed_send;

	own_tribe: tribe;

	set_options(options: Ioptions_timed_send): void {
		const { uuid, run, error, village_name,
			village_id,
			target_x,
			target_y,
			target_village_id,
			target_village_name,
			target_distance,
			target_player_name,
			target_durations,
			mission_type,
			mission_type_name,
			arrival_date,
			arrival_time,
			date,
			time,
			timetype,
			timetype_name,
			timezone,
			timezone_name,
			t1,
			t2,
			t3,
			t4,
			t5,
			t6,
			t7,
			t8,
			t9,
			t10,
			t11 } = options;

		this.options = {
			...this.options,
			uuid,
			run,
			error,
			village_name,
			village_id,
			target_x,
			target_y,
			target_village_id,
			target_village_name,
			target_distance,
			target_player_name,
			target_durations,
			mission_type,
			mission_type_name,
			arrival_date,
			arrival_time,
			date,
			time,
			timetype,
			timetype_name,
			timezone,
			timezone_name,
			t1,
			t2,
			t3,
			t4,
			t5,
			t6,
			t7,
			t8,
			t9,
			t10,
			t11
		};
	}

	get_options(): Ioptions_timed_send {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'timed_send',
			name: 'timed send'
		};
	}

	get_description(): string {
		const { village_name, mission_type_name, target_village_name, date, time, timetype_name, timezone_name } = this.options;

		if (!village_name)
			return 'lang_home_not_configured';

		const lang = database.get('language').value();
		const format_options: any = { weekday: 'long', month: 'long', day: 'numeric' };
		const date_string = new Date(`${date} ${time}`).toLocaleDateString(lang, format_options);

		return `(${mission_type_name}) ${village_name} -> ${target_village_name}\n${date_string}, ${time} (${timetype_name}${timezone_name})`;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'timed_send';
	}

	get_priority(): number { return 0; }

	async run(): Promise<number | null> {
		logger.info(`uuid: ${this.options.uuid} started`, this.params.name);

		const player_data: Iplayer = await player.get();
		if (!player_data) {
			logger.error('could not get player data', this.params.name);
			this.options.error = true;
			return 0;
		}
		this.own_tribe = player_data.tribeId;

		let loop = 0;

		while (this.options.run) {
			const { village_id } = this.options;
			if (!village_id) {
				logger.error('stop feature because is not configured', this.params.name);
				this.options.error = true;
				break;
			}

			await this.timed_send(++loop);

			if (this.options.error)
				break;
		}

		this.running = false;
		this.options.run = false;
		logger.info(`uuid: ${this.options.uuid} stopped`, this.params.name);
		return 0;
	}

	async timed_send(loop: number): Promise<void> {
		const { village_id, village_name,
			target_village_id, target_village_name, target_durations,
			mission_type, arrival_date, arrival_time,
			t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11 } = this.options;

		let mission_type_name: string;
		switch (Number(mission_type)) {
			case mission_types.attack:
				mission_type_name = 'attack';
				break;
			case mission_types.raid:
				mission_type_name = 'raid';
				break;
			case mission_types.support:
				mission_type_name = 'reinforcement';
				break;
			case mission_types.spy:
				mission_type_name = 'scouting';
				break;
			case mission_types.siege:
				mission_type_name = 'siege';
				break;
			case mission_types.settle:
				mission_type_name = 'settle';
				break;
		}

		const units: Iunits = {
			1: Number(t1),
			2: Number(t2),
			3: Number(t3),
			4: Number(t4),
			5: Number(t5),
			6: Number(t6),
			7: Number(t7),
			8: Number(t8),
			9: Number(t9),
			10: Number(t10),
			11: Number(t11)
		};

		// check units
		if (units[1] == 0 && units[2] == 0 && units[3] == 0 && units[4] == 0 &&
			units[5] == 0 && units[6] == 0 && units[7] == 0 && units[8] == 0 &&
			units[9] == 0 && units[10] == 0 && units[11] == 0) {
			logger.error(`stop timed ${mission_type_name} from ${village_name} to ${target_village_name} ` +
				'because no units have been defined to send', this.params.name);
			this.options.error = true;
			return;  // stop
		}

		// check target and set duration by the lowest speed
		var speed = 100;
		var duration = 0;
		for (var key in units) {
			if (Object.prototype.hasOwnProperty.call(units, Number(key))) {
				if (units[key] > 0) {

					// hero speed
					if (key == '11') {
						// get hero data
						const hero_data = await hero.get();
						if (!hero_data)
							continue;
						let hero_speed = hero_data.speed;
						if (hero_speed < speed) {
							duration = target_durations[key];
							duration = duration * 1000; // to ms
							speed = hero_speed;
						}
						continue;
					}

					// unit speed
					if (Number(unit_types[this.own_tribe][key].speed) < speed) {
						duration = target_durations[key];
						duration = duration * 1000; // to ms
						speed = Number(unit_types[this.own_tribe][key].speed);
						continue;
					}
				}
			}
		}

		// arrival time
		const arrival_time_ms = new Date(arrival_date + 'T' + arrival_time + 'Z').getTime();

		// send time
		const send_time_ms = arrival_time_ms - duration;
		const current_time_ms = Date.now();
		const diff_time_ms = send_time_ms - current_time_ms;

		// times in date for operation with seconds
		const current_time = new Date(current_time_ms);
		const send_time = new Date(send_time_ms);

		// only perform checks 5 minutes before
		const five_minutes_ms = 300000;
		if (send_time_ms < current_time_ms + five_minutes_ms) {

			// but don't check the last minute
			const one_minute_ms = 60000;
			if (send_time_ms >= current_time_ms + one_minute_ms) {

				// check available units to send
				const units_avaiable: Iunits = await troops.get_units(village_id, troops_type.stationary, troops_status.home);
				for (var type = 1; type < 11; type++) {
					if (!units_avaiable[type] || units[type] == 0)
						continue;
					if (units[type] > Number(units_avaiable[type])) {
						logger.error(`timed ${mission_type_name} aborted from ${village_name} to ${target_village_name} ` +
							'because there are not enough units in village to send', this.params.name);
						this.options.error = true;
						return;  // stop
					}
				}

				// check hero
				let send_hero: boolean = t11 > 0;
				if (send_hero) {
					// get hero data
					const hero_data: Ihero = await hero.get();
					if (!hero_data) {
						logger.error(`timed ${mission_type_name} aborted from ${village_name} to ${target_village_name} ` +
							'because couldn\'t find the hero', this.params.name);
						this.options.error = true;
						return; // stop
					}

					if (hero_data.isMoving || hero_data.status != hero_status.idle) {
						logger.error(`timed ${mission_type_name} aborted from ${village_name} to ${target_village_name} ` +
							`because the hero is ${hero.get_hero_status(hero_data.status)}`, this.params.name);
						this.options.error = true;
						return; // stop
					}
					if (hero_data.villageId != village_id) {
						logger.error(`timed ${mission_type_name} aborted from ${village_name} to ${target_village_name} ` +
							'because the hero is not from this village', this.params.name);
						this.options.error = true;
						return; // stop
					}
				}

			}

		}

		// debug
		logger.debug(`[${loop}] ` +
			`arrival time: ${logger.get_timestamp(new Date(arrival_time_ms))} | ` +
			`duration: ${this.get_duration(duration)} | ` +
			`send time: ${logger.get_timestamp(new Date(send_time_ms))} | ` +
			`time left: ${Math.floor(diff_time_ms / 1000)} seconds (${diff_time_ms} ms)`, this.params.name);

		// less than 2 mins
		const two_minutes_ms = 120000;
		if (send_time_ms <= current_time_ms + two_minutes_ms) {

			// less than 2 seconds
			if (send_time_ms < current_time_ms + 2000) {

				// to late
				if (diff_time_ms < -999) {

					var seconds_late = Math.floor(diff_time_ms / 1000);
					if (seconds_late < 0) // multiply number with -1 to make it positive
						seconds_late = seconds_late * -1;

					logger.error(`timed ${mission_type_name} aborted from ${village_name} to ${target_village_name} ` +
						`because it would not arrive in time with a delay of ${seconds_late} seconds (${diff_time_ms} ms)`, this.params.name);
					this.options.error = true;
					return; // stop
				}

				// send units
				if (send_time.getSeconds() == current_time.getSeconds()) {
					var response: any = await api.send_units(village_id, target_village_id, units, mission_type);
					if (response.errors) {
						for (let error of response.errors)
							logger.error(`send timed ${mission_type_name} from ${village_name} to ${target_village_name} failed: ${error.message}`, this.params.name);
						this.options.error = true;
						return; // stop
					}
					logger.info(`sent timed ${mission_type_name} from ${village_name} to ${target_village_name} ` +
						`arriving on ${this.get_player_time()} ` +
						`(duration: ${this.get_duration(duration)})`, this.params.name);
					this.options.run = false;
					return; // stop
				}

				// sleep a third of second to retry
				await sleep(0.3);
				return;
			}

			// sleep until the time difference, in seconds
			await sleep_ms(diff_time_ms);
			return;
		}

		// sleep up to 2 minutes early
		await sleep_ms(diff_time_ms - two_minutes_ms);
	}

	get_duration(duration: number): string {
		var seconds = Math.floor((duration / 1000) % 60),
			minutes = Math.floor((duration / (1000 * 60)) % 60),
			hours = Math.floor((duration / (1000 * 60 * 60)));

		return `${(hours < 10) ? '0' + hours : hours}:` +
			`${(minutes < 10) ? '0' + minutes : minutes}:` +
			`${(seconds < 10) ? '0' + seconds : seconds}`;
	}

	get_player_time(): string {
		const { date, time } = this.options;
		const player_time = new Date(date + 'T' + time + 'Z');
		var year = player_time.toJSON().split('T')[0].split('-')[0];
		var month = player_time.toJSON().split('T')[0].split('-')[1];
		var day = player_time.toJSON().split('T')[0].split('-')[2];
		return `${day}-${month}-${year} ${time}`;
	}

	is_dst(date: Date): boolean {
		let jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
		let jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
		return Math.max(jan, jul) !== date.getTimezoneOffset();
	}
}

export default new timed_send();
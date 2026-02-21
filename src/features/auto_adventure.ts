import { Ihero } from '../interfaces';
import { feature_single, Ioptions, Iresponse } from './feature';
import { get_diff_time, sleep } from '../util';
import { adventure_type, hero_status } from '../data';
import { hero } from '../gamedata';
import api from '../api';
import database from '../database';
import uniqid from 'uniqid';
import logger from '../logger';

interface Ioptions_hero extends Ioptions {
	type: adventure_type
	min_health: number
}

class auto_adventure extends feature_single {
	options: Ioptions_hero;

	set_default_options(): void {
		this.options = {
			uuid: uniqid.time(),
			type: 0,
			min_health: 15,
			run: false,
			error: false
		};
	}

	set_params(): void {
		this.params = {
			ident: 'hero',
			name: 'auto adventure'
		};
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'hero';
	}

	get_description(): string {
		return (this.options.type == 0) ? 'lang_adventure_short' : 'lang_adventure_long';
	}

	set_options(options: Ioptions_hero): void {
		const { run, error, type, min_health, uuid } = options;
		this.options = {
			...this.options,
			uuid,
			type,
			min_health,
			run,
			error
		};
	}

	get_options(): Ioptions {
		return { ...this.options };
	}

	update(options: Ioptions_hero): Iresponse {
		this.options = {
			...this.options,
			min_health: options.min_health,
			type: options.type
		};

		return {
			error: false,
			data: null,
			message: 'success'
		};
	}

	async run(): Promise<number | null> {
		const { type, min_health } = this.options;

		let sleep_time: number = 300;

		// get hero data
		const hero_data: Ihero = await hero.get();
		if (hero_data) {
			const can_send =
				hero_data.adventurePoints > 0 &&
				!hero_data.isMoving &&
				hero_data.status == hero_status.idle &&
				Number(hero_data.health) > min_health;

			if (can_send) {
				const has_adventure_points: boolean = adventure_type.short ?
					Number(hero_data.adventurePoints) > 0 :
					Number(hero_data.adventurePoints) > 1;

				if (has_adventure_points) {
					const aventure = await api.start_adventure(type);
					if (aventure.errors) {
						for (let error of aventure.errors)
							logger.error(`send hero on adventure failed: ${error.message}`, this.params.name);
					}
					else
						logger.info('sent hero on adventure', this.params.name);
				}
			}

			const diff_time: number = get_diff_time(hero_data.untilTime);
			if (diff_time > 0)
				sleep_time = diff_time + 5;
		}

		if (sleep_time <= 0) sleep_time = 300;

		return sleep_time;
	}
}

export default new auto_adventure();

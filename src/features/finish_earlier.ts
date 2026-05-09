import { feature_single, Ioptions, Iresponse } from './feature';
import { find_state_data, sleep, get_diff_time } from '../util';
import { village } from '../gamedata';
import { Ivillage, Ibuilding_queue } from '../interfaces';
import { building_types } from '../data';
import api from '../api';
import logger from '../logger';
import uniqid from 'uniqid';
import scheduler from '../scheduler';
import raise_fields from './raise_fields';
import building_queue from './building_queue';

class finish_earlier extends feature_single {

	options: Ioptions;

	set_default_options(): void {
		this.options = {
			uuid: uniqid.time(),
			run: false,
			error: false
		};
	}

	set_params(): void {
		this.params = {
			ident: 'finish_earlier',
			name: 'instant finish'
		};
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'finish_earlier';
	}

	get_description(): string {
		return 'lang_finish_earlier_description';
	}

	set_options(options: Ioptions): void {
		const { run, error, uuid } = options;
		this.options = {
			...this.options,
			uuid,
			run,
			error
		};

	}

	get_options(): Ioptions {
		return { ...this.options };
	}

	update(options: Ioptions): Iresponse {
		return {
			error: false,
			data: null,
			message: ''
		};
	}

	async run(): Promise<number | null> {
		const villages_data: any = await village.get_own();

		let params: string[] = [];
		for (let data of find_state_data(village.collection_own_ident, villages_data)) {
			if (!data) {
				logger.error('could not get own villages data', this.params.name);
				return 60;
			}
			const village_obj: Ivillage = data.data;
			params.push(village.building_queue_ident + village_obj.villageId);
		}

		// fetch building queue data
		let response: any[] = await api.get_cache(params);

		let sleep_time: number = null;
		const five_minutes: number = 5 * 60;

		for (let data of find_state_data(village.collection_own_ident, villages_data)) {
			if (!data) continue;
			const village_obj: Ivillage = data.data;
			const queue_data: Ibuilding_queue = find_state_data(village.building_queue_ident + village_obj.villageId, response);
			if (!queue_data) {
				logger.error(`could not get building queue data on village ${village_obj.name}`, this.params.name);
				continue;
			}

			const queues: number[] = [1, 2];
			// for building and resource queue
			for (let queue_type of queues) {
				const actual_queue: any[] = queue_data.queues[queue_type];

				if (!actual_queue || !actual_queue[0]) continue;

				const first_item: any = actual_queue[0];
				const finished: number = first_item.finished;
				const building_type = building_types[Number(first_item.buildingType)];

				const rest_time: number = get_diff_time(finished);
				const canUseInstant: boolean =
					queue_data.canUseInstantConstruction || queue_data.canUseInstantConstructionOnlyInVillage;

				// finish building instant
				if (rest_time < five_minutes && canUseInstant) {
					const res: any = await api.finish_now(village_obj.villageId, queue_type);
					if (res.data === false) {
						logger.warn(`instant finish on village ${village_obj.name} was rejected`, this.params.name);
					} else {
						logger.info(`finished ${building_type} earlier for free on village ${village_obj.name}`, this.params.name);
						if (queue_type === 2) {
							const rf = raise_fields.features.find(f => (f.get_options() as any).village_id === village_obj.villageId);
							if (rf) scheduler.reschedule(rf.get_options().uuid);
						}
						const bq = building_queue.features.find(f => (f.get_options() as any).village_id === village_obj.villageId);
						if (bq) scheduler.reschedule(bq.get_options().uuid);
					}
					continue;
				}

				if (!sleep_time || rest_time < sleep_time) sleep_time = rest_time;
			}
		}

		// retry now if sleep time is less than 5 min, or equal or less than zero
		if (sleep_time && sleep_time < five_minutes || sleep_time <= 0) sleep_time = 1;

		// subtract 5 min from sleep time if its longer than that
		if (sleep_time && sleep_time > five_minutes) sleep_time = sleep_time - five_minutes;

		// default to 5 min
		if (!sleep_time || sleep_time > five_minutes) sleep_time = five_minutes;

		return sleep_time;
	}
}

export default new finish_earlier();

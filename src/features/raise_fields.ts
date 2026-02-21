import { feature_collection, feature_item, Ioptions } from './feature';
import { find_state_data, sleep, get_diff_time } from '../util';
import { village } from '../gamedata';
import { Ivillage, Ibuilding, Ibuilding_queue, Ibuilding_collection, Iresources } from '../interfaces';
import { building_types } from '../data';
import api from '../api';
import logger from '../logger';
import finish_earlier from './finish_earlier';

interface Ioptions_raise extends Ioptions {
	[index: string]: any
	village_name: string
	village_id: number
	crop: number
	wood: number
	clay: number
	iron: number
}

class raise_fields extends feature_collection {
	get_ident(): string {
		return 'raise_fields';
	}

	get_new_item(options: Ioptions): raise {
		return new raise({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_raise {
		return {
			...options,
			village_name: '',
			village_id: 0,
			crop: 0,
			wood: 0,
			iron: 0,
			clay: 0
		};
	}
}

class raise extends feature_item {
	building_type: { [index: number]: number, wood: number, clay: number, iron: number, crop: number } = {
		wood: 1,
		clay: 2,
		iron: 3,
		crop: 4
	};

	building_type_reverse: { [index: number]: string } = {
		1: 'wood',
		2: 'clay',
		3: 'iron',
		4: 'crop'
	};

	options: Ioptions_raise;

	set_options(options: Ioptions_raise): void {
		const { uuid, run, error, village_name, village_id, crop, iron, wood, clay } = options;
		this.options = {
			...this.options,
			uuid,
			run,
			error,
			village_name,
			village_id,
			crop,
			iron,
			wood,
			clay
		};
	}

	get_options(): Ioptions_raise {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'raise_fields',
			name: 'raise fields'
		};
	}

	get_description(): string {
		const { village_name } = this.options;

		if (!village_name)
			return 'lang_home_not_configured';

		return village_name;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'raise_fields';
	}

	async run(): Promise<number | null> {
		const { village_id } = this.options;
		if (!village_id) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		let sleep_time: number = await this.upgrade_field();

		// all fields are raised or error raised
		if (!sleep_time) return null;

		// set save sleep time
		if (sleep_time > 300) sleep_time = 300;
		if (sleep_time < 0) sleep_time = 60;

		return sleep_time;
	}

	async upgrade_field(): Promise<number> {
		const { village_id } = this.options;
		let { village_name } = this.options;

		const villages_data: any = await village.get_own();
		const village_obj: Ivillage = village.find(village_id, villages_data);
		if (!village_obj) {
			logger.error(
				`raise fields in village ${village_name} skipped ` +
				`because couldn't find village width id ${village_id}`,
				this.params.name);
			this.options.error = true;
			return 60; // sleep 1 minute
		}
		village_name = village_obj.name;

		// fetch latest data needed
		const params: string[] = [
			village.building_collection_ident + village_id,
			village.building_queue_ident + village_id
		];
		const response: any[] = await api.get_cache(params);
		const queue_data: Ibuilding_queue = find_state_data(village.building_queue_ident + village_id, response);
		if (queue_data == null) {
			logger.error(`could not get building queue data on village ${village_name}`, this.params.name);
			return 60; // sleep 1 minute
		}

		let sleep_time: number = null;
		const five_minutes: number = 5 * 60;

		// skip if resource slot is used
		if (queue_data.freeSlots[2] == 0) {
			// get queue finish time
			let finished: number = null;
			if (queue_data.queues[2].length) {
				finished = queue_data.queues[2][0].finished;
			} else if (queue_data.queues[1].length) {
				finished = queue_data.queues[1][0].finished;
			} else {
				logger.error('error calculating queue time! queue object:', this.params.name);
				logger.error(queue_data.queues, this.params.name);
			}

			if (finished) {
				// set sleep time until its finished
				const res_time: number = get_diff_time(finished);
				if (res_time > 0) {
					sleep_time = res_time;
					if (sleep_time > five_minutes)
						sleep_time -= five_minutes;
				}
			}

			if (!sleep_time)
				sleep_time = 60;
			if (sleep_time <= 0)
				sleep_time = 5;
			return sleep_time;
		}

		// sort resource type by it's storage
		const sorted_res_types: number[] = [];
		const temp_res_prod: number[] = [];
		const temp_dict: { [index: number]: number } = {};

		for (let res in village_obj.production) {
			// let prod: number = village_obj.production[res];
			let current_res: number = Number(village_obj.storage[res]);
			let storage: number = Number(village_obj.storageCapacity[res]);

			// calculate percentage of current resource
			let percent: number = current_res / (storage / 100);

			// add 30 percent storage to crop, since its not that needed
			//if (res == '4') percent += 30;

			temp_res_prod.push(percent);
			temp_dict[percent] = Number(res);
		}

		// sort lowest is first by number
		temp_res_prod.sort((x1, x2) => Number(x1) - Number(x2));

		for (let prod of temp_res_prod) {
			sorted_res_types.push(temp_dict[prod]);
		}

		// queue loop
		let upgrade_building: Ibuilding = null;
		let done: boolean = true;

		// village got free res slot
		const village_data: Ibuilding_collection[] = find_state_data(village.building_collection_ident + village_id, response);

		// iterate over resource by its priority based on production
		for (let res of sorted_res_types) {
			let lowest_building: Ibuilding = this.lowest_building_by_type(res, village_data);

			if (!lowest_building) continue;

			// build until all res fields are this lvl
			if (Number(lowest_building.lvl) < Number(this.options[this.building_type_reverse[res]])) {
				done = false;

				if (this.able_to_build(lowest_building.upgradeCosts, village_obj)) {
					upgrade_building = lowest_building;
					break;
				}

				// check later if there might be enough res
				sleep_time = five_minutes;
			}
		}

		// all fields are raised
		if (done) {
			logger.info(`raise fields done on ${village_name}!`, this.params.name);
			return null;
		}

		if (upgrade_building) {
			const building_type = building_types[upgrade_building.buildingType];

			// upgrade field
			const res: any = await api.upgrade_building(upgrade_building.buildingType, upgrade_building.locationId, village_id);
			if (res.errors) {
				for (let error of res.errors)
					logger.error(`upgrade field ${building_type} on village ${village_name} failed: ${error.message}`, this.params.name);

				// check again later if it might be possible
				return 60;
			}

			logger.info(`upgrade field ${building_type} on village ${village_name}`, this.params.name);

			const upgrade_time: number = Number(upgrade_building.upgradeTime);
			// check if building time is less than 5 min
			if (upgrade_time < five_minutes && finish_earlier.running) {
				const res: any = await api.finish_now(village_id, 2);
				if (res.data === false) {
					logger.error(`instant finish on village ${village_name} failed`, this.params.name);

					// check again later if it might be possible
					return 60;
				}
				logger.info(`upgrade time less 5 min for field ${building_type} on village ${village_name}, instant finish!`, this.params.name);

				// only wait one second to build next field
				return 1;
			}

			// set sleep time
			if (!sleep_time || upgrade_time < sleep_time) {
				sleep_time = upgrade_time;
				if (sleep_time > five_minutes)
					sleep_time -= five_minutes;
			}
		}

		if (!sleep_time || sleep_time <= 0)
			sleep_time = 60;

		return sleep_time;
	}

	able_to_build(costs: Iresources, village: Ivillage): boolean {
		for (let res in village.storage)
			if (Number(village.storage[res]) < Number(costs[res]))
				return false;
		return true;
	}

	lowest_building_by_type(type: number, building_collection: Ibuilding_collection[]): Ibuilding {
		let rv: Ibuilding = null;

		for (let building of building_collection) {
			const bd: Ibuilding = building.data;

			if (bd.buildingType != type) continue;

			if (!rv) {
				rv = bd;
				continue;
			}

			if (Number(bd.lvl) < Number(rv.lvl)) rv = bd;
		}

		return rv;
	}
}

export default new raise_fields();

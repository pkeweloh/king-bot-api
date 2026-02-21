import { find_state_data, sleep, get_diff_time } from '../util';
import { Ivillage, Ibuilding, Iresources, Icelebration, Icelebration_queue, Icelebration_queue_item, Iplayer } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { player, village } from '../gamedata';
import { building_types, celebration_types } from '../data';
import api from '../api';
import logger from '../logger';

interface Ioptions_celebrations extends Ioptions {
	[index: string]: any
	celebrations: any[]
}

class celebrations extends feature_collection {
	get_ident(): string {
		return 'celebrations';
	}

	get_new_item(options: Ioptions): celebration_feature {
		return new celebration_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_celebrations {
		return {
			...options,
			celebrations: []
		};
	}
}

class celebration_feature extends feature_item {
	options: Ioptions_celebrations;

	set_options(options: Ioptions_celebrations): void {
		const { uuid, run, error, celebrations } = options;

		this.options = {
			...this.options,
			uuid,
			run,
			error,
			celebrations
		};
	}

	get_options(): Ioptions_celebrations {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'celebrations',
			name: 'celebrations',
		};
	}

	get_description(): string {
		const { celebrations } = this.options;

		if (celebrations.length == 0)
			return 'lang_home_not_configured';

		var description = '';
		for (let celebration of celebrations) {
			const { village_name, celebration_type_name } = celebration;
			if (description != '')
				description += '\n';
			description += `${village_name} -> ${celebration_type_name}`;
		}
		return description;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'celebrations';
	}

	async run(): Promise<number | null> {
		const { celebrations } = this.options;
		if (celebrations.length == 0) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		let sleep_time: number = await this.hold_celebrations();
		if (!sleep_time) sleep_time = 3600; // default 1 hour

		return sleep_time;
	}

	async hold_celebrations(): Promise<number> {
		const { celebrations } = this.options;

		let sleep_time: number = null;

		for (let celebration of celebrations) {
			const { village_id, village_name, building_type, celebration_type } = celebration;

			let celebration_type_name: string;
			switch (Number(celebration_type)) {
				default:
				case celebration_types.small:
					celebration_type_name = 'small';
					break;
				case celebration_types.large:
					celebration_type_name = 'large';
					break;
				case celebration_types.brewery:
					celebration_type_name = 'public festival';
					break;
			}

			// get village
			const villages_data: any = await village.get_own();
			const village_obj: Ivillage = village.find(village_id, villages_data);
			if (!village_obj) {
				logger.error(
					`${celebration_type_name} celebration in village ${village_name} skipped ` +
					`because couldn't find village width id ${village_id}`,
					this.params.name);
				this.options.error = true;
				continue;
			}

			// get building data
			const building_data: Ibuilding = await village.get_building(Number(village_id), building_type);
			if (!building_data) {
				logger.error(
					`${celebration_type_name} celebration in village ${village_name} skipped ` +
					`because the ${building_types[building_type]} has not been built`,
					this.params.name);
				this.options.error = true;
				continue;
			}

			// check if can hold large celebration
			if (Number(celebration_type) == celebration_types.large
				&& (Number(building_data.lvl) < 10 || villages_data[0].data.length == 1)) {
				logger.warn(
					`${celebration_type_name} celebration in village ${village_name} skipped ` +
					'because it does not meet the requirements',
					this.params.name);
				continue;
			}

			// get celebration data
			const celebration_data: any = await api.get_celebration_list(village_id, building_data.locationId);
			if (celebration_data.errors) {
				for (let error of celebration_data.errors)
					logger.error(`could not get celebration list data on village ${village_name}: ${error.message}`,
						this.params.name);
				continue;
			}
			if (!celebration_data[celebration_type]) {
				logger.error(`could not find celebration ${celebration_type_name} on village ${village_name}`,
					this.params.name);
				continue;
			}
			const celebration_list: Icelebration = celebration_data[celebration_type];

			let player_id: number;
			switch (Number(celebration_type)) {
				case celebration_types.small:
				case celebration_types.large:
					// get celebration queue (and map details, to replicate expected regular request)
					var celebration_queue_ident: string = 'CelebrationQueue:';
					var response: any[] = await api.get_cache([
						celebration_queue_ident + village_id,
						village.map_details_ident + village_id]);
					var celebration_queue: Icelebration_queue = find_state_data(celebration_queue_ident + village_id, response);
					if (!celebration_queue) {
						logger.error(`could not get celebration queue data on village ${village_name}`, this.params.name);
						continue;
					}
					if (celebration_queue.queues && celebration_queue.queues[building_type].length == celebration_list.maxCount) {
						let finished: number = null;
						const building: Icelebration_queue_item[] = celebration_queue.queues[building_type];
						for (let celebration of building) {
							if (!finished || finished > celebration.endTime)
								finished = celebration.endTime;
						}
						if (finished) {
							// set sleep time until its finished
							const res_time: number = get_diff_time(finished);
							if (res_time > 0 && (!sleep_time || res_time < sleep_time))
								sleep_time = res_time;
						}
						continue;
					}
					break;

				case celebration_types.brewery:
					var player_data: Iplayer = await player.get();
					if (!player_data) {
						logger.error('could not get player data', this.params.name);
						continue;
					}
					player_id = player_data.playerId;
					if (get_diff_time(Number(player_data.brewCelebration)) > 0) {
						let finished: number = null;
						if (!finished || finished > player_data.brewCelebration)
							finished = player_data.brewCelebration;
						if (finished) {
							// set sleep time until its finished
							const res_time: number = get_diff_time(finished);
							if (res_time > 0 && (!sleep_time || res_time < sleep_time))
								sleep_time = res_time;
						}
						continue;
					}
					break;
			}

			// get resources cost
			let costs: Iresources = celebration_list.costs;

			// get village resources
			const resources = village_obj.storage;

			// check if there are sufficient resources to hold celebration
			let can_hold = true;
			can_hold = can_hold && (costs[1] <= resources[1]);
			can_hold = can_hold && (costs[2] <= resources[2]);
			can_hold = can_hold && (costs[3] <= resources[3]);
			can_hold = can_hold && (costs[4] <= resources[4]);
			if (!can_hold) {
				continue;
			}

			// start celebration
			const start_celebration: any = await api.start_celebration(Number(village_id), Number(celebration_type));
			if (start_celebration.errors) {
				for (let error of start_celebration.errors)
					logger.error(`${celebration_type_name} celebration in village ${village_name} failed: ${error.message}`, this.params.name);
				continue;
			}
			logger.info(
				`holding ${celebration_type_name} celebration in village ${village_name} ` +
				`with a cost of wood: ${costs[1]}, clay: ${costs[2]}, iron: ${costs[3]}, crop: ${costs[4]}`,
				this.params.name);

			switch (Number(celebration_type)) {
				case celebration_types.small:
				case celebration_types.large:
					celebration_queue = find_state_data(celebration_queue_ident + village_id, start_celebration);
					if (celebration_queue && celebration_queue.queues && celebration_queue.queues[building_type].length) {
						let finished: number = null;
						const building: Icelebration_queue_item[] = celebration_queue.queues[building_type];
						for (let celebration of building) {
							if (!finished || finished > celebration.endTime)
								finished = celebration.endTime;
						}
						if (finished) {
							// set sleep time until its finished
							const res_time: number = get_diff_time(finished);
							if (res_time > 0 && (!sleep_time || res_time < sleep_time))
								sleep_time = res_time;
						}
						continue;
					}
					break;
				case celebration_types.brewery:
					player_data = find_state_data(player.ident + player_id, start_celebration);
					if (player_data && player_data.brewCelebration > 0) {
						let finished: number = null;
						if (!finished || finished > player_data.brewCelebration)
							finished = player_data.brewCelebration;
						if (finished) {
							// set sleep time until its finished
							const res_time: number = get_diff_time(finished);
							if (res_time > 0 && (!sleep_time || res_time < sleep_time))
								sleep_time = res_time;
						}
						continue;
					}
					break;
			}
		}

		return sleep_time;
	}
}

export default new celebrations();
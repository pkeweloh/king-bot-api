import { find_state_data, sleep, get_diff_time } from '../util';
import { Ivillage, Ibuilding, Iresearch, Iresearch_unit, Iresearch_queue } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { village } from '../gamedata';
import { unit_types } from '../data';
import api from '../api';
import logger from '../logger';

interface Ioptions_improve_troops extends Ioptions {
	[index: string]: any
	units: any[]
}

class improve_troops extends feature_collection {
	get_ident(): string {
		return 'improve_troops';
	}

	get_new_item(options: Ioptions): train_feature {
		return new train_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_improve_troops {
		return {
			...options,
			units: []
		};
	}
}

class train_feature extends feature_item {
	options: Ioptions_improve_troops;

	set_options(options: Ioptions_improve_troops): void {
		const { uuid, run, error, units } = options;

		this.options = {
			...this.options,
			uuid,
			run,
			error,
			units
		};
	}

	get_options(): Ioptions_improve_troops {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'improve_troops',
			name: 'improve troops',
		};
	}

	get_description(): string {
		const { units } = this.options;

		if (units.length == 0)
			return 'lang_home_not_configured';

		var description = '';
		for (let unit of units) {
			const { village_name, unit_type_name, level } = unit;
			if (description != '')
				description += '\n';
			description += `${village_name} -> ${unit_type_name} (${level == -1 ? 'max' : level})`;
		}
		return description;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'improve_troops';
	}

	async run(): Promise<number | null> {
		const { units } = this.options;
		if (units.length == 0) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		let sleep_time: number = await this.improve_troops();

		// improving done or error raised
		if (!sleep_time) return null;

		return sleep_time;
	}

	async improve_troops(): Promise<number> {
		const { units } = this.options;

		let sleep_time: number = 3600;
		const building_type: number = 13; // smithy building type
		const units_to_improve: any = {};
		const current_level: any = {};

		for (let unit of units) {
			const { village_id, village_name, unit_type, level } = unit;

			if (!current_level[village_id])
				current_level[village_id] = [];
			current_level[village_id][unit_type] = false;

			// get village
			const villages_data: any = await village.get_own();
			const village_obj: Ivillage = village.find(village_id, villages_data);
			if (!village_obj) {
				logger.error(
					`improving unit type id ${unit_type} in village ${village_name} skipped ` +
					`because couldn't find village width id ${village_id}`,
					this.params.name);
				this.options.error = true;
				continue;
			}

			// get tribe
			const own_tribe = village_obj.tribeId;

			// get unit_type name
			let unit_type_name: string = '';
			for (var i = 1; i < 11; i++) {
				if (unit_types[own_tribe][i].unit_type == unit_type) {
					unit_type_name = String(unit_types[own_tribe][i].name).toLowerCase();
					break;
				}
			}

			// get research and queue
			const research_ident: string = 'Research:';
			const unit_research_queue_ident: string = 'UnitResearchQueue:';
			let params: string[] = [];
			params.push(research_ident + village_id);
			params.push(unit_research_queue_ident + village_id);
			const response: any[] = await api.get_cache(params);
			const research: Iresearch = find_state_data(research_ident + village_id, response);
			if (research == null) {
				logger.error(`could not get research data on village ${village_name}`, this.params.name);
				continue;
			}
			const research_queue: Iresearch_queue = find_state_data(unit_research_queue_ident + village_id, response);
			if (research_queue == null) {
				logger.error(`could not get research queue data on village ${village_name}`, this.params.name);
				continue;
			}

			if (research.upgradeQueueFull) {
				let finished: number = null;
				if (research_queue.buildingTypes[building_type]) {
					const building = research_queue.buildingTypes[building_type];
					for (let unit of building) {
						if (!finished || finished > unit.finished)
							finished = unit.finished;
					}
				}
				if (finished) {
					// set sleep time until its finished
					const res_time: number = get_diff_time(finished);
					if (res_time > 0)
						sleep_time = res_time;
				}
				continue;
			}

			// get unit data
			let unit_data: Iresearch_unit = null;
			for (let research_unit of research.units) {
				if (research_unit.unitType != unit_type)
					continue;
				unit_data = research_unit;
				break;
			}
			if (!unit_data) {
				logger.error(
					`improving unit type ${unit_type_name} in village ${village_name} skipped ` +
					'because unit type is not available to research',
					this.params.name);
				this.options.error = true;
				continue;
			}

			// check if done
			var unit_level: number = level == -1 ? unit_data.maxLevel : level;
			if (Number(unit_data.unitLevel) >= Number(unit_level)) {
				current_level[village_id][unit_type] = true;
				continue;
			}

			// check if can upgrade
			if (unit_data.unitLevel == -2) {
				logger.error(
					`improving unit type ${unit_type_name} in village ${village_name} skipped ` +
					'because unit type has not been learned',
					this.params.name);
				this.options.error = true;
				continue;
			}
			if (!unit_data.canUpgrade)
				continue;

			// get resources cost
			let costs = unit_data.costs;

			// get village resources
			let resources = village_obj.storage;

			// check if there are sufficient resources to improve
			let can_upgrade = true;
			can_upgrade = can_upgrade && (costs[1] <= resources[1]);
			can_upgrade = can_upgrade && (costs[2] <= resources[2]);
			can_upgrade = can_upgrade && (costs[3] <= resources[3]);
			can_upgrade = can_upgrade && (costs[4] <= resources[4]);
			if (!can_upgrade) {
				continue;
			}

			// add to list
			if (!units_to_improve[village_id])
				units_to_improve[village_id] = [];
			units_to_improve[village_id].push({ unit_type, unit_type_name, village_name, unit_data });
		}

		if (Object.keys(units_to_improve).length > 0) {
			for (var village_id in units_to_improve) {
				if (Object.prototype.hasOwnProperty.call(units_to_improve, village_id)) {
					for (var units_from_village of units_to_improve[village_id]) {
						const { unit_type, unit_type_name, village_name, unit_data } = units_from_village;

						// get building data
						const building_data: Ibuilding = await village.get_building(Number(village_id), building_type);
						const location_id = building_data.locationId;

						// check upgrade queue
						const is_upgrade_queue_full = await this.is_upgrade_queue_full(Number(village_id));
						if (is_upgrade_queue_full)
							continue;

						// research unit
						const next_level = Number(unit_data.unitLevel) + 1;
						const research_unit: any = await api.research_unit(Number(village_id), location_id, building_type, unit_type);
						if (research_unit.errors) {
							for (let error of research_unit.errors)
								logger.error(`improving unit type ${unit_type_name} to level ${next_level} ` +
									`in village ${village_name} failed: ${error.message}`, this.params.name);
							continue;
						}
						logger.info(
							`improving unit type ${unit_type_name} to level ${next_level} in village ${village_name} ` +
							`with a cost of wood: ${unit_data.costs[1]}, clay: ${unit_data.costs[2]}, iron: ${unit_data.costs[3]}`,
							this.params.name);

						// set sleep time until its finished
						if (unit_data.time < sleep_time)
							sleep_time = unit_data.time;
					}
				}
			}
		} else {
			// check if all is done
			let is_done = true;
			for (let unit of units) {
				const { village_id, unit_type } = unit;
				if (Object.prototype.hasOwnProperty.call(current_level, Number(village_id))) {
					if (Object.prototype.hasOwnProperty.call(current_level[Number(village_id)], Number(unit_type))) {
						is_done = is_done
							&& Boolean(current_level[Number(village_id)][Number(unit_type)]);
					}
				}
			}
			if (is_done) {
				logger.info('improving units done!', this.params.name);
				return null;
			}
		}

		return sleep_time;
	}

	async is_upgrade_queue_full(village_id: number): Promise<boolean> {
		const research_ident: string = 'Research:';
		const unit_research_queue_ident: string = 'UnitResearchQueue:';
		let params: string[] = [];
		params.push(research_ident + village_id);
		params.push(unit_research_queue_ident + village_id);
		const response: any[] = await api.get_cache(params);
		const research: Iresearch = find_state_data(research_ident + village_id, response);
		return research != null ? research.upgradeQueueFull : true;
	}
}

export default new improve_troops();
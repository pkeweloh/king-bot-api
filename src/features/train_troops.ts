import { sleep, get_random_int } from '../util';
import { Ivillage, Ibuilding, Iresources } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { village } from '../gamedata';
import { unit_types, tribe } from '../data';
import api from '../api';
import logger from '../logger';

interface Ioptions_train_troops extends Ioptions {
	[index: string]: any
	units: any[]
	interval_min: number
	interval_max: number
}

class train_troops extends feature_collection {
	get_ident(): string {
		return 'train_troops';
	}

	get_new_item(options: Ioptions): train_feature {
		return new train_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_train_troops {
		return {
			...options,
			units: [],
			interval_min: 0,
			interval_max: 0
		};
	}
}

class train_feature extends feature_item {
	options: Ioptions_train_troops;

	set_options(options: Ioptions_train_troops): void {
		const { uuid, run, error, units, interval_min, interval_max } = options;

		this.options = {
			...this.options,
			uuid,
			run,
			error,
			units,
			interval_min,
			interval_max
		};
	}

	get_options(): Ioptions_train_troops {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'train_troops',
			name: 'train troops',
		};
	}

	get_description(): string {
		const { units, interval_min, interval_max } = this.options;

		if (units.length == 0)
			return 'lang_home_not_configured';

		var description = '';
		for (let unit of units) {
			const { village_name, unit_type_name, amount } = unit;
			if (description != '')
				description += '\n';
			description += `${village_name} -> ${unit_type_name} (${amount}) | ${interval_min} - ${interval_max}s`;
		}
		return description;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'train_troops';
	}

	async run(): Promise<number | null> {
		const { units, interval_min, interval_max } = this.options;
		if (units.length == 0) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		await this.train_troops();
		return get_random_int(interval_min, interval_max);
	}

	async train_troops(): Promise<void> {
		const { units } = this.options;

		for (let unit of units) {
			const { village_id, village_name, unit_type, amount } = unit;

			// get village
			const villages_data: any = await village.get_own();
			const village_obj: Ivillage = village.find(village_id, villages_data);
			if (!village_obj) {
				logger.error(
					`training units type id ${unit_type} in village ${village_name} skipped ` +
					`because couldn't find village width id ${village_id}`,
					this.params.name);
				this.options.error = true;
				continue;
			}

			// get tribe
			const own_tribe: tribe = village_obj.tribeId;

			// get unit_data
			let unit_data: any = {};
			for (var i = 1; i < 11; i++) {
				if (unit_types[own_tribe][i].unit_type == unit_type) {
					unit_data = unit_types[own_tribe][i];
					break;
				}
			}

			// unit type name
			const unit_type_name = String(unit_data.name).toLowerCase();

			// get resources cost
			let costs = unit_data.costs;

			// get village resources
			let resources = village_obj.storage;

			// get less posible amount of units for training
			let training_amount = this.get_training_amount(costs, resources);
			if (training_amount == 0) {
				logger.warn(
					`training units of type ${unit_type_name} in village ${village_name} ` +
					'is not possible with the resources available',
					this.params.name);
				continue;
			}

			if (amount < training_amount)
				training_amount = amount;

			// get total cost
			let total_training_cost = [];  // amount of units * costs
			for (var unit_cost of costs) {
				total_training_cost.push(unit_cost * training_amount);
			}

			// get building type
			const building_type: number = this.building_type(unit_type);

			// get building data
			const building_data: Ibuilding = await village.get_building(village_id, building_type);
			const location_id = building_data.locationId;

			// recruit units
			var recruit: any = await api.recruit_units(village_id, location_id, unit_type, training_amount);
			if (recruit.errors) {
				for (let error of recruit.errors)
					logger.error(`training units of type ${unit_type_name} in village ${village_name} failed: ${error.message}`, this.params.name);
				continue;
			}
			logger.info(
				`training ${training_amount} units of type ${unit_type_name} in village ${village_name} ` +
				`with a cost of wood: ${total_training_cost[0]}, clay: ${total_training_cost[1]}, iron: ${total_training_cost[2]}`,
				this.params.name);
			continue;
		}
	}

	building_type(unit_type: number): number {
		const barracks_units: number[] = [1, 2, 3, 11, 12, 13, 14, 21, 22];
		const stable_units: number[] = [4, 5, 6, 15, 16, 23, 24, 25, 26];
		const workshop_units: number[] = [7, 8, 17, 18, 27, 28];
		if (barracks_units.find(type => type == unit_type)) {
			return 19; // barracks
		}
		else if (stable_units.find(type => type == unit_type)) {
			return 20; // stable
		}
		else if (workshop_units.find(type => type == unit_type)) {
			return 21; // workshop
		}
		return 0;
	}

	// less posible amount of units for training
	get_training_amount(costs: any, resources: Iresources): number {
		let total_units_cost_wood = [];  // total wood cost for every unit type
		let total_units_cost_clay = [];  // total clay cost for every unit type
		let total_units_cost_iron = [];  // total iron cost for every unit type
		total_units_cost_wood.push(costs[0]);
		total_units_cost_clay.push(costs[1]);
		total_units_cost_iron.push(costs[2]);

		// training amount distributed by: less resources consumption per unit type
		let training_amount_wood: any[] = [];
		let training_amount_clay: any[] = [];
		let training_amount_iron: any[] = [];
		total_units_cost_wood.forEach(function (cost: any) {
			var train_amount = Math.floor(resources[1] / cost);
			training_amount_wood.push(train_amount);
		});
		total_units_cost_clay.forEach(function (cost: any) {
			var train_amount = Math.floor(resources[2] / cost);
			training_amount_clay.push(train_amount);
		});
		total_units_cost_iron.forEach(function (cost: any) {
			var train_amount = Math.floor(resources[3] / cost);
			training_amount_iron.push(train_amount);
		});
		let training_amount: number = training_amount_wood[0];  // less posible amount of units for training
		for (let i = 0; i < training_amount_wood.length; i++) {
			training_amount = Math.min(training_amount, training_amount_wood[i]);
		}
		for (let i = 0; i < training_amount_clay.length; i++) {
			training_amount = Math.min(training_amount, training_amount_clay[i]);
		}
		for (let i = 0; i < training_amount_iron.length; i++) {
			training_amount = Math.min(training_amount, training_amount_iron[i]);
		}
		return training_amount;
	}
}

export default new train_troops();
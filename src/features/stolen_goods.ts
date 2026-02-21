import { sleep, get_random_int } from '../util';
import { Ivillage, Itroops_collection, Ihero_item_collection } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { hero, village, troops } from '../gamedata';
import { hero_item_types, troops_type } from '../data';
import api from '../api';
import logger from '../logger';

interface Ioptions_stolen_goods extends Ioptions {
	villages: any[]
	interval_min: number,
	interval_max: number
}

class stolen_goods extends feature_collection {
	get_ident(): string {
		return 'stolen_goods';
	}

	get_new_item(options: Ioptions): stolen_goods_feature {
		return new stolen_goods_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_stolen_goods {
		return {
			...options,
			villages: [],
			interval_min: 0,
			interval_max: 0
		};
	}
}

class stolen_goods_feature extends feature_item {
	options: Ioptions_stolen_goods;

	sleep_time: number;
	send_hero: boolean;
	send_artillery: boolean;

	set_options(options: Ioptions_stolen_goods): void {
		const { uuid, run, error, villages, interval_min, interval_max } = options;

		this.options = {
			...this.options,
			uuid,
			run,
			error,
			villages,
			interval_min,
			interval_max
		};
	}

	get_options(): Ioptions_stolen_goods {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'stolen_goods',
			name: 'stolen goods'
		};
	}

	get_description(): string {
		const { villages, interval_min, interval_max } = this.options;

		if (villages.length == 0)
			return 'lang_home_not_configured';

		var description = '';
		for (let village of villages) {
			const { village_name } = village;
			if (description != '')
				description += '\n';
			description += `${village_name} | ${interval_min} - ${interval_max}s`;
		}
		return description;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'stolen_goods';
	}

	async run(): Promise<number | null> {
		const { villages, interval_min, interval_max } = this.options;
		if (villages.length == 0) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		await this.sell_stolen_goods();
		return get_random_int(interval_min, interval_max);
	}

	async sell_stolen_goods(): Promise<void> {
		const { villages } = this.options;

		for (let item of villages) {
			const { village_id, village_name } = item;

			// get village
			const villages_data: any = await village.get_own();
			const village_obj: Ivillage = village.find(village_id, villages_data);
			if (!village_obj) {
				logger.error(
					`selling stolen goods in village ${village_name} skipped ` +
					`because couldn't find village width id ${village_id}`,
					this.params.name);
				this.options.error = true;
				continue;
			}

			// check if crop production is negative
			const is_crop_negative: boolean = Math.sign(village_obj.production[4]) == -1;
			if (!is_crop_negative)
				continue;

			// check if the village is in treasury influence
			if (village_obj.belongsToKing == 0) {
				logger.error(
					`selling stolen goods in village ${village_name} not possible ` +
					'because it is not within a treasury influence',
					this.params.name);
				this.options.error = true;
				continue;
			}

			// check granary capacity with incoming crop
			const storage_amount = Number(village_obj.storage[4]);
			const storage_capacity = Number(village_obj.storageCapacity[4]);
			let capacity_left = storage_capacity - storage_amount;
			let incoming_crop = 0;
			const troops_collection: Itroops_collection[] = await troops.get(village_id, troops_type.moving);
			if (troops_collection) {
				for (let troop of troops_collection)
					if (troop.data.movement &&
						troop.data.movement.villageIdTarget == village_id &&
						troop.data.status == 'transit' &&
						troop.data.movement.resources[4] > 0) {

						incoming_crop += troop.data.movement.resources[4];
					}
			}
			if (incoming_crop > capacity_left)
				continue; // no capacity left
			capacity_left -= incoming_crop;

			// check sell price
			const sell_price = await api.get_treasure_sell_price();
			if (sell_price.errors) {
				for (let error of sell_price.errors)
					logger.error(`getting the treasure sell price in village ${village_name} failed: ${error.message}`, this.params.name);
				continue;
			}
			const crop_price = Number(sell_price[4]);
			if (crop_price > capacity_left) {
				continue; // to less capacity
			}

			// check available stolen goods and get the item id
			let available_treasures, item_id = 0;
			const hero_items: Ihero_item_collection[] = await hero.get_hero_items();
			if (hero_items)
				for (let hero_item of hero_items) {
					if (hero_item.data.itemType == hero_item_types.treasures) {
						available_treasures = Number(hero_item.data.amount);
						item_id = hero_item.data.id;
						break;
					}
				}
			if (available_treasures == 0 || item_id == 0)
				continue; // no stolen goods available

			let treasures_amount = Math.floor(capacity_left / crop_price);
			if (available_treasures < treasures_amount)
				treasures_amount = available_treasures; // not enough of what is needed, set the remaining amount

			// sell stolen goods
			const sell_treasures: any = await api.hero_use_item(item_id, treasures_amount, village_id);
			if (sell_treasures.errors) {
				for (let error of sell_treasures.errors)
					logger.error(`selling stolen goods in village ${village_name} failed: ${error.message}`, this.params.name);
				continue;
			}
			const reward = sell_treasures.resources;
			logger.info(
				`selling ${sell_treasures.amount} stolen goods in village ${village_name} ` +
				`with a reward of wood: ${reward[1]}, clay: ${reward[2]}, iron: ${reward[3]}, crop: ${reward[4]}`,
				this.params.name);
		}
	}
}

export default new stolen_goods();
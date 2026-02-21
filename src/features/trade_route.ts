import { sleep, get_random_int } from '../util';
import { Iresources, Ivillage } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { village } from '../gamedata';
import api from '../api';
import logger from '../logger';

interface Ioptions_trade extends Ioptions {
	source_village_name: string
	destination_village_name: string
	source_village_id: number
	destination_village_id: number
	destination_village_own: boolean
	interval_min: number
	interval_max: number
	send_wood: number
	send_clay: number
	send_iron: number
	send_crop: number
	source_wood: number
	source_clay: number
	source_iron: number
	source_crop: number
	destination_wood: number
	destination_clay: number
	destination_iron: number
	destination_crop: number
}

class trade_route extends feature_collection {
	get_ident(): string {
		return 'trade_route';
	}

	get_new_item(options: Ioptions): trade_feature {
		return new trade_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_trade {
		return {
			...options,
			source_village_name: '',
			destination_village_name: '',
			source_village_id: 0,
			destination_village_id: 0,
			destination_village_own: true,
			interval_min: 0,
			interval_max: 0,
			send_wood: 0,
			send_clay: 0,
			send_iron: 0,
			send_crop: 0,
			source_wood: 0,
			source_clay: 0,
			source_iron: 0,
			source_crop: 0,
			destination_wood: 10000000,
			destination_clay: 10000000,
			destination_iron: 10000000,
			destination_crop: 10000000
		};
	}
}

class trade_feature extends feature_item {
	options: Ioptions_trade;

	set_options(options: Ioptions_trade): void {
		const { uuid, run, error,
			source_village_name,
			destination_village_name,
			source_village_id,
			destination_village_id,
			destination_village_own,
			interval_min,
			interval_max,
			send_wood,
			send_clay,
			send_iron,
			send_crop,
			source_wood,
			source_clay,
			source_iron,
			source_crop,
			destination_wood,
			destination_clay,
			destination_iron,
			destination_crop } = options;
		this.options = {
			...this.options,
			uuid, run, error,
			source_village_name,
			destination_village_name,
			source_village_id,
			destination_village_id,
			destination_village_own,
			interval_min,
			interval_max,
			send_wood,
			send_clay,
			send_iron,
			send_crop,
			source_wood,
			source_clay,
			source_iron,
			source_crop,
			destination_wood,
			destination_clay,
			destination_iron,
			destination_crop
		};
	}

	get_options(): Ioptions_trade {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'trade_route',
			name: 'trade route'
		};
	}

	get_description(): string {
		const { source_village_name, destination_village_name, interval_min, interval_max } = this.options;

		if (!source_village_name)
			return 'lang_home_not_configured';

		return `${source_village_name} -> ${destination_village_name} | ${interval_min} - ${interval_max}s`;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'trade_route';
	}

	async enough_merchants(resources: any): Promise<boolean> {
		const { source_village_id } = this.options;
		const merchant_ident: string = `Merchants:${source_village_id}`;
		const merchant_data = await api.get_cache([merchant_ident]);

		var data = merchant_data[0].data;
		var merchant_capacity = (data.max - data.inTransport - data.inOffers) * data.carry;
		var trade_size = resources[1] + resources[2] + resources[3] + resources[4];
		if (trade_size > merchant_capacity) {
			return false;
		}
		return true;
	}

	async run(): Promise<number | null> {
		const { source_village_id, destination_village_id, destination_village_own, interval_min, interval_max } = this.options;
		if (!source_village_id || !destination_village_id) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		if (destination_village_own) await this.trade_own_route();
		else await this.trade_external_route();

		return get_random_int(interval_min, interval_max);
	}

	async trade_own_route(): Promise<void> {
		const {
			source_village_name, destination_village_name,
			source_village_id, destination_village_id,
			interval_min, interval_max,
			send_wood, send_clay,
			send_iron, send_crop,
			source_wood, source_clay,
			source_iron, source_crop,
			destination_wood, destination_clay,
			destination_iron, destination_crop
		} = this.options;

		const villages_data: any = await village.get_own();
		const source_village: Ivillage = village.find(source_village_id, villages_data);
		if (!source_village) {
			logger.error(
				`trade ${source_village_name} -> ${destination_village_name} failed ` +
				`because couldn't find source village width id ${source_village_id}`,
				this.params.name);
			await sleep(get_random_int(300, 600));
			return;
		}
		const destination_village: Ivillage = village.find(destination_village_id, villages_data);
		if (!destination_village) {
			logger.error(
				`trade ${source_village_name} -> ${destination_village_name} failed ` +
				`because couldn't find destination village width id ${destination_village_id}`,
				this.params.name);
			await sleep(get_random_int(300, 600));
			return;
		}

		var resources: Iresources = { 1: 0, 2: 0, 3: 0, 4: 0 };
		resources[1] = Math.floor(Math.min(send_wood, source_village.storage['1']));
		resources[2] = Math.floor(Math.min(send_clay, source_village.storage['2']));
		resources[3] = Math.floor(Math.min(send_iron, source_village.storage['3']));
		resources[4] = Math.floor(Math.min(send_crop, source_village.storage['4']));

		// check if there are enough merchants
		if (!await this.enough_merchants(resources)) {
			logger.warn(`not enough merchants for trade ${source_village_name} -> ${destination_village_name}`, this.params.name);
			await sleep(get_random_int(300, 600));
			return;
		}

		// check if source village has more and destination has less than desired
		if (source_village.storage['1'] < source_wood || destination_village.storage['1'] > destination_wood) {
			resources[1] = 0;
		} if (source_village.storage['2'] < source_clay || destination_village.storage['2'] > destination_clay) {
			resources[2] = 0;
		} if (source_village.storage['3'] < source_iron || destination_village.storage['3'] > destination_iron) {
			resources[3] = 0;
		} if (source_village.storage['4'] < source_crop || destination_village.storage['4'] > destination_crop) {
			resources[4] = 0;
		}

		// if there is something to send
		if (resources[1] + resources[2] + resources[3] + resources[4] > 0) {
			await api.send_merchants(source_village_id, destination_village_id, resources);
			logger.info(`trade [wood: ${resources[1]}, clay: ${resources[2]}, iron: ${resources[3]}, crop: ${resources[4]}] ` +
				`sent from ${source_village_name} to ${destination_village_name}`, this.params.name);
		}
		await sleep(get_random_int(interval_min, interval_max));
	}

	async trade_external_route(): Promise<void> {
		const {
			source_village_name, destination_village_name,
			source_village_id, destination_village_id,
			interval_min, interval_max,
			send_wood, send_clay,
			send_iron, send_crop,
			source_wood, source_clay,
			source_iron, source_crop,
		} = this.options;

		const villages_data: any = await village.get_own();
		const source_village: Ivillage = village.find(source_village_id, villages_data);
		if (!source_village) {
			logger.error(
				`trade ${source_village_name} -> ${destination_village_name} failed ` +
				`because couldn't find source village width id ${source_village_id}`,
				this.params.name);
			await sleep(get_random_int(300, 600));
			return;
		}

		var resources: Iresources = { 1: 0, 2: 0, 3: 0, 4: 0 };
		resources[1] = Math.floor(Math.min(send_wood, source_village.storage['1']));
		resources[2] = Math.floor(Math.min(send_clay, source_village.storage['2']));
		resources[3] = Math.floor(Math.min(send_iron, source_village.storage['3']));
		resources[4] = Math.floor(Math.min(send_crop, source_village.storage['4']));

		// check if there are enough merchants
		if (await this.enough_merchants(resources)) {
			logger.warn(`not enough merchants for trade ${source_village_name} -> ${destination_village_name}`, this.params.name);
			await sleep(get_random_int(300, 600));
			return;
		}

		// check if source village has more than desired
		if (source_village.storage['1'] < source_wood) {
			resources[1] = 0;
		} if (source_village.storage['2'] < source_clay) {
			resources[2] = 0;
		} if (source_village.storage['3'] < source_iron) {
			resources[3] = 0;
		} if (source_village.storage['4'] < source_crop) {
			resources[4] = 0;
		}

		// if there is something to send
		if (resources[1] + resources[2] + resources[3] + resources[4] > 0) {
			await api.send_merchants(source_village_id, destination_village_id, resources);
			logger.info(`trade [wood: ${resources[1]}, clay: ${resources[2]}, iron: ${resources[3]}, crop: ${resources[4]}] ` +
				`sent from ${source_village_name} to ${destination_village_name}`, this.params.name);
		}
		await sleep(get_random_int(interval_min, interval_max));
	}
}

export default new trade_route();

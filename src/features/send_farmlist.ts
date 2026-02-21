import { sleep, get_random_int, get_date } from '../util';
import { feature_collection, feature_item, Ioptions } from './feature';
import { farming, village } from '../gamedata';
import api from '../api';
import { clean_farmlist } from '../utilities/clean_farmlist';
import logger from '../logger';

interface Ioptions_farm extends Ioptions {
	farmlists: any[];
	losses_farmlist: string;
	interval_min: number;
	interval_max: number;
}

class send_farmlist extends feature_collection {
	get_ident(): string {
		return 'farming';
	}

	get_new_item(options: Ioptions): farm_feature {
		return new farm_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_farm {
		return {
			...options,
			farmlists: [],
			interval_min: 0,
			interval_max: 0,
			losses_farmlist: '',
		};
	}
}

class farm_feature extends feature_item {
	options: Ioptions_farm;

	set_options(options: Ioptions_farm): void {
		const { uuid, run, error, farmlists, losses_farmlist, interval_min, interval_max } = options;
		this.options = {
			...this.options,
			uuid,
			run,
			error,
			farmlists,
			interval_min,
			interval_max,
			losses_farmlist,
		};
	}

	get_options(): Ioptions_farm {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'farming',
			name: 'send farmlist',
		};
	}

	get_description(): string {
		const { farmlists, interval_min, interval_max } = this.options;

		if (farmlists.length == 0)
			return 'lang_home_not_configured';

		var description = '';
		for (let list of farmlists) {
			const { farmlist, village_name } = list;
			if (description != '')
				description += '\n';
			description += `${village_name} -> ${farmlist} | ${interval_min} - ${interval_max}s`;
		}
		return description;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'farming';
	}

	async run(): Promise<number | null> {
		const { interval_min, interval_max, farmlists, losses_farmlist } = this.options;

		if (!interval_min) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		if (farmlists.length == 0) {
			logger.error('stop feature because farmlist is empty', this.params.name);
			this.options.error = true;
			return null;
		}

		const params = [village.collection_own_ident, farming.farmlist_ident];
		const response = await api.get_cache(params);

		const farmlists_to_send: any = {};

		for (let farmlistinfo of farmlists) {
			const list_obj = farming.find(farmlistinfo.farmlist, response);
			if (!list_obj) {
				logger.error('stop feature because farmlist can not be found', this.params.name);
				this.options.run = false;
				this.options.error = true;
				return null;
			}
			const village_id: number = farmlistinfo.village_id;

			const lastSent: number = Number(list_obj.lastSent);
			const now: number = get_date();

			if ((now - lastSent) < interval_min) {
				logger.info(`farmlist: ${farmlistinfo.farmlist} sent too recently. skipping until next time`, this.params.name);
				continue;
			}

			// cleaning was desired
			if (losses_farmlist != '') {
				const losses_list_obj = farming.find(losses_farmlist, response);
				const losses_id = losses_list_obj.listId;
				await clean_farmlist(list_obj.listId, losses_id);
			}

			// add the list.
			if (!farmlists_to_send[village_id])
				farmlists_to_send[village_id] = [];
			farmlists_to_send[village_id].push(list_obj.listId);
		}

		if (Object.keys(farmlists_to_send).length > 0) {
			for (var village_id in farmlists_to_send) {
				if (Object.prototype.hasOwnProperty.call(farmlists_to_send, village_id)) {
					var farmlist_ids = farmlists_to_send[village_id];
					await api.send_farmlists(farmlist_ids, Number(village_id));
					await sleep(get_random_int(.75, 1.25));
				}
			}
			logger.info('farmlists sent', this.params.name);
		}

		return get_random_int(interval_min, interval_max);
	}
}

export default new send_farmlist();

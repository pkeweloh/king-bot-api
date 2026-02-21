import { find_state_data, sleep, get_random_int, get_diff_time } from '../util';
import { Iunits, Ihero, Ivillage, Imap_details, Itroops_collection } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { hero, village, troops } from '../gamedata';
import { hero_status, mission_types, troops_status, troops_type } from '../data';
import api from '../api';
import logger from '../logger';

interface Ioptions_robber_hideouts extends Ioptions {
	village_name: string,
	village_id: number,
	interval_min: number,
	interval_max: number,
	robber1_village_id: number,
	robber2_village_id: number,
	mission_type: mission_types,
	mission_type_name: string,
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

class robber_hideouts extends feature_collection {
	get_ident(): string {
		return 'robber_hideouts';
	}

	get_new_item(options: Ioptions): robber_feature {
		return new robber_feature({ ...options });
	}

	get_default_options(options: Ioptions): Ioptions_robber_hideouts {
		return {
			...options,
			village_name: null,
			village_id: 0,
			interval_min: 0,
			interval_max: 0,
			robber1_village_id: 0,
			robber2_village_id: 0,
			mission_type: 0 as any,
			mission_type_name: null,
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

class robber_feature extends feature_item {
	options: Ioptions_robber_hideouts;

	sleep_time: number;
	send_hero: boolean;
	send_artillery: boolean;

	set_options(options: Ioptions_robber_hideouts): void {
		const { uuid, run, error,
			village_name,
			village_id,
			interval_min,
			interval_max,
			robber1_village_id,
			robber2_village_id,
			mission_type,
			mission_type_name,
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
			interval_min,
			interval_max,
			robber1_village_id,
			robber2_village_id,
			mission_type,
			mission_type_name,
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

	get_options(): Ioptions_robber_hideouts {
		return { ...this.options };
	}

	set_params(): void {
		this.params = {
			ident: 'robber_hideouts',
			name: 'robber hideouts'
		};
	}

	get_description(): string {
		const { village_name, interval_min, interval_max } = this.options;

		if (!village_name)
			return 'lang_home_not_configured';

		return `${village_name} | ${interval_min} - ${interval_max}s`;
	}

	get_long_description(): string {
		// key in the frontend language.js file
		return 'robber_hideouts';
	}

	async run(): Promise<number | null> {
		const { village_id, interval_min, interval_max, t7, t8, t11 } = this.options;
		if (!village_id) {
			logger.error('stop feature because is not configured', this.params.name);
			this.options.error = true;
			return null;
		}

		this.send_hero = t11 > 0;
		this.send_artillery = t7 > 0 || t8 > 0;

		const robber: Ivillage = await this.check_robber();
		if (robber) {
			let troops_busy: boolean = await this.check_troops();
			if (troops_busy) {
				logger.info('send aborted because the troops are busy right now', this.params.name);
			} else {
				await this.send_troops(robber);
				if (this.options.error) return null;
				await this.check_troops();
			}

			return this.sleep_time > 0 ? this.sleep_time : get_random_int(interval_min, interval_max);
		} else {
			logger.info('no robber hideouts at this time, will check again later', this.params.name);
			return get_random_int(interval_min, interval_max);
		}
	}

	async send_troops(robber_village: Ivillage): Promise<void> {
		const { village_name, village_id,
			t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11 } = this.options;
		let { mission_type, mission_type_name } = this.options;

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

		// TODO: adding a unit index of -1 will send all units with max number
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

		// check defined units to send
		if (units[1] == 0 && units[2] == 0 && units[3] == 0 && units[4] == 0 &&
			units[5] == 0 && units[6] == 0 && units[7] == 0 && units[8] == 0 &&
			units[9] == 0 && units[10] == 0 && units[11] == 0) {
			logger.error(`stop robber hideouts on village ${village_name} ` +
				'because no units have been defined to send', this.params.name);
			this.options.error = true;
			return;
		}

		// check available units to send
		const units_available: Iunits = await troops.get_units(village_id, troops_type.stationary, troops_status.home);
		for (var type = 1; type < 11; type++) {
			if (!units_available[type] || units[type] == 0) {
				units[type] = 0;
				continue;
			}
			if (units[type] == -1) { // adding a unit value of -1 will send all units of this type
				units[type] = units_available[type];
			}
			else if (units[type] > Number(units_available[type])) {
				logger.info('send aborted because there are not enough units in village to send', this.params.name);
				return;
			}
		}

		// check hero
		if (this.send_hero) {
			// get hero data
			const hero_data: Ihero = await hero.get();
			if (!hero_data) {
				logger.error('send aborted because couldn\'t find the hero', this.params.name);
				return;
			}

			if (hero_data.isMoving || hero_data.status != hero_status.idle) {
				logger.info('send aborted because the hero is ' +
					hero.get_hero_status(hero_data.status), this.params.name);
				const time_left = get_diff_time(Number(hero_data.untilTime));
				if (time_left > 0)
					this.sleep_time = time_left;
				return;
			}
			if (hero_data.villageId != village_id) {
				logger.warn('send aborted because the hero is ' +
					`not native to the village ${village_name}`, this.params.name);
				return;
			}
		}

		var not_sent = '';
		if (this.send_hero == false && units[11] > 0) {
			// dont send hero
			units[11] = 0;
			not_sent = ', but without hero';
		}
		if (this.send_artillery == false && (units[7] > 0 || units[8] > 0)) {
			// dont send artillery
			units[7] = 0;
			units[8] = 0;
			if (Number(mission_type) == mission_types.siege) {
				mission_type = mission_types.attack;
				mission_type_name = 'attack';
			}
			not_sent += ' and not needed artillery';
		}

		// send units
		var response: any = await api.send_units(village_id, robber_village.position, units, mission_type);

		// check errors
		if (response.errors) {
			for (let error of response.errors)
				logger.error(`send ${mission_type_name} from ${village_name} failed: ${error.message}`, this.params.name);
			return;
		}

		logger.info(`sent ${mission_type_name} from ${village_name} to ${robber_village.name}${not_sent}`, this.params.name);
		return;
	}

	async check_robber(): Promise<Ivillage> {
		const { robber1_village_id, robber2_village_id } = this.options;

		// get available robber villages amount (kingdom: 0 = robber hideouts)
		const response = await api.get_robber_villages_amount(0);
		if (!response)
			return null;
		const amount: number = response.data;
		if (amount == 0)
			return null;

		// get robber villages
		const village1_ident = village.ident + robber1_village_id;
		const village2_ident = village.ident + robber2_village_id;
		const villages_data: any[] = await api.get_cache([village1_ident, village2_ident]);
		const robber1_village: Ivillage = find_state_data(village1_ident, villages_data);
		if (robber1_village == null) {
			logger.error('could not get village data of robber 1', this.params.name);
			return null;
		}
		const robber2_village: Ivillage = find_state_data(village2_ident, villages_data);
		if (robber2_village == null) {
			logger.error('could not get village data of robber 2', this.params.name);
			return null;
		}

		// get robber map positions
		const position1_ident = village.map_details_ident + robber1_village.position;
		const position2_ident = village.map_details_ident + robber2_village.position;
		const position_data: any[] = await api.get_cache([position1_ident, position2_ident]);
		const robber1: Imap_details = find_state_data(position1_ident, position_data);
		if (robber1 == null) {
			logger.error('could not get position data of robber 1', this.params.name);
			return null;
		}
		const robber2: Imap_details = find_state_data(position2_ident, position_data);
		if (robber2 == null) {
			logger.error('could not get position data of robber 2', this.params.name);
			return null;
		}

		// return any that still has robbers
		if (robber1.hasNPC != 0 && robber1.npcInfo.troops != null) {

			if (robber1.npcInfo.troops.units == null || Object.keys(robber1.npcInfo.troops.units).length == 0) {
				this.send_hero = false;
				this.send_artillery = false;
			}

			return robber1_village;
		}
		if (robber2.hasNPC != 0 && robber2.npcInfo.troops != null) {

			if (robber2.npcInfo.troops.units == null || Object.keys(robber2.npcInfo.troops.units).length == 0) {
				this.send_hero = false;
				this.send_artillery = false;
			}

			return robber2_village;
		}
		return null;
	}

	async check_troops(): Promise<boolean> {
		const { robber1_village_id, robber2_village_id, village_id } = this.options;

		const villages_data: any[] = await api.get_cache([
			village.ident + robber1_village_id,
			village.ident + robber2_village_id
		]);
		const robber1_village: Ivillage = find_state_data(village.ident + robber1_village_id, villages_data);
		if (robber1_village == null) {
			logger.error('could not get village data of robber 1', this.params.name);
			return true;
		}
		const robber2_village: Ivillage = find_state_data(village.ident + robber2_village_id, villages_data);
		if (robber2_village == null) {
			logger.error('could not get village data of robber 2', this.params.name);
			return true;
		}

		const troops_collection: Itroops_collection[] = await troops.get(village_id, troops_type.moving);
		if (troops_collection)
			for (let troop of troops_collection) {
				if (troop.data.movement) {

					// troops are already going to robber
					if (troop.data.movement.villageIdTarget == robber1_village.position ||
						troop.data.movement.villageIdTarget == robber2_village.position) {
						const time_travel = Number(troop.data.movement.timeFinish) - Number(troop.data.movement.timeStart);
						const time_left = get_diff_time(Number(troop.data.movement.timeFinish));
						this.sleep_time = time_left + time_travel;
						return true;
					}

					// troops are still returning from robber
					if (troop.data.movement.villageIdStart == robber1_village_id ||
						troop.data.movement.villageIdStart == robber2_village_id) {
						const time_left = get_diff_time(Number(troop.data.movement.timeFinish));
						this.sleep_time = time_left;
						return true;
					}

					// get hero movement time
					if (this.send_hero && troop.data.units[11] > 0) {
						// hero is leaving the village
						if (troop.data.movement.villageIdStart == village_id) {
							const time_travel = Number(troop.data.movement.timeFinish) - Number(troop.data.movement.timeStart);
							const time_left = get_diff_time(Number(troop.data.movement.timeFinish));
							this.sleep_time = time_left + time_travel;
						}
						// hero is returning to village
						if (troop.data.movement.villageIdTarget == village_id) {
							const time_left = get_diff_time(Number(troop.data.movement.timeFinish));
							this.sleep_time = time_left;
						}
					}
				}
			}

		// no troops in transit
		return false;
	}
}

export default new robber_hideouts();
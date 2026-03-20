import { find_state_data, get_random_int, get_diff_time, async_step, random_human_mistake, sleep_ms } from '../util';
import { Iunits, Ihero, Ivillage, Imap_details, Itroops_collection } from '../interfaces';
import { feature_collection, feature_item, Ioptions } from './feature';
import { hero, village, troops } from '../gamedata';
import { hero_status, mission_types, troops_status, troops_type } from '../data';
import api from '../api';
import logger from '../logger';
import map_scanner from '../map_scanner';

export interface IHumanBehaviorProfile {
	action_selection_delay: [number, number];		// right click + select attack
	open_attack_delay: [number, number];			// attack window appears
	mission_selection_delay: [number, number];		// selects mission type
	base_troop_selection_delay: [number, number];	// starts selecting troops
	per_unit_type_delay: [number, number];			// extra hesitation per selected unit type
	confirmation_delay: [number, number];			// send confirmation
}

// default profile for robber attacks
export const default_robber_profile: IHumanBehaviorProfile = {
	action_selection_delay: [2000, 5000],           // 2-5 sec
	open_attack_delay: [1000, 2500],       			// 1-2.5 sec
	mission_selection_delay: [2000, 6000],      	// 2-6 sec
	base_troop_selection_delay: [30000, 60000], 	// 30-60 sec
	per_unit_type_delay: [3000, 5000],        		// +3-5 sec per selected unit type
	confirmation_delay: [3000, 8000]            	// 3-8 sec
};

interface Ioptions_robber_hideouts extends Ioptions {
	village_name: string,
	village_id: number,
	interval_min: number,
	interval_max: number,
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

	private sleep_time: number;
	private send_hero: boolean;
	private send_artillery: boolean;
	private behavior_profile: IHumanBehaviorProfile = default_robber_profile;

	set_options(options: Ioptions_robber_hideouts): void {
		const { uuid, run, error,
			village_name,
			village_id,
			interval_min,
			interval_max,
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

		const robber = await this.check_robber();
		if (!robber) {
			logger.info('no robber hideouts at this time, will check again later', this.params.name);
			return get_random_int(interval_min, interval_max);
		}

		const [cellId, robber_village] = robber;

		let in_transit: boolean = await this.check_troops(village_id, cellId, robber_village.villageId);
		if (in_transit) {
			logger.info('send aborted because the troops are busy right now', this.params.name);
		} else {
			await this.send_troops(robber_village);
			if (this.options.error) return null;
		}

		return this.sleep_time > 0 ? this.sleep_time : get_random_int(interval_min, interval_max);
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
			logger.error(`stopping robber hideouts on village ${village_name} ` +
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

		// attack window opens on selected attack
		await async_step(() =>
			api.check_target(village_id, robber_village.position), ...this.behavior_profile.open_attack_delay); // 1-2.5 sec
		let extra = random_human_mistake('minor'); if (extra) await sleep_ms(extra); // minor micro hesitation

		// selects mission type
		await async_step(() => api.check_target(village_id, robber_village.position, robber_village.name, mission_type, units),
			...this.behavior_profile.mission_selection_delay); // 2-6 sec default
		extra = random_human_mistake('medium'); if (extra) await sleep_ms(extra); // medium micro hesitation

		// starts selecting troops
		await async_step(
			() => api.check_target(village_id, robber_village.position, robber_village.name, mission_type, units), // with extra hesitation per selected unit type
			this.behavior_profile.base_troop_selection_delay[0] + Object.values(units).filter(v => v > 0).length * this.behavior_profile.per_unit_type_delay[0],
			this.behavior_profile.base_troop_selection_delay[1] + Object.values(units).filter(v => v > 0).length * this.behavior_profile.per_unit_type_delay[1]
		); // 30-60 sec + per unit type
		extra = random_human_mistake('minor'); if (extra) await sleep_ms(extra); // minor micro hesitation during selection
		extra = random_human_mistake('medium', { chance: 0.1 }); if (extra) await sleep_ms(extra); // occasional medium micro hesitation

		// send units
		const response = await async_step(() => api.send_units(village_id, robber_village.position, units, mission_type),
			...this.behavior_profile.confirmation_delay); // 3-8 sec default
		extra = random_human_mistake('minor'); if (extra) await sleep_ms(extra); // minor hesitation before confirming

		// check errors
		if (response.errors) {
			for (let error of response.errors)
				logger.error(`send ${mission_type_name} from ${village_name} failed: ${error.message}`, this.params.name);
			return;
		}

		// inspects moving troops and sets sleep time as needed
		const troops_collection: Itroops_collection[] = find_state_data(troops.collection_moving_ident + village_id, response);
		this.sleep_time = this.get_max_movement_time(village_id, robber_village.position, robber_village.villageId, troops_collection);

		logger.info(`sent ${mission_type_name} from ${village_name} to ${robber_village.name}${not_sent}`, this.params.name);
		return;
	}

	private async check_robber(): Promise<[number, Ivillage] | null> {
		// get own village to scan around it
		const { village_id, village_name } = this.options;
		const villages_data = await village.get_own();
		const own_village = village.find(village_id, villages_data);
		if (!own_village) {
			logger.error(`could not find village ${village_name}`, this.params.name);
			this.options.error = true;
			return null;
		}
		const x = Number(own_village.coordinates.x);
		const y = Number(own_village.coordinates.y);

		// finds robbers using event-driven reactive scanning
		const robbers = await this.find_robbers(x, y);

		if (robbers.length === 0) {
			return null;
		}

		const robber_tile = robbers[0];
		const cell_id: number = robber_tile.locationId || robber_tile.id;

		// get map position data: mouse over → map details loaded
		const position_ident = village.map_details_ident + cell_id;
		const position_data: any[] = await api.get_cache([position_ident]);
		const robber: Imap_details = find_state_data(position_ident, position_data);
		if (robber == null)
			return null;

		// if the robber not longer exists
		if (robber.hasNPC == 0 || robber.npcInfo.troops == null)
			return null;

		// the robber is valid, but if there are no units left
		if (
			robber.npcInfo.troops.units == null ||
			Object.keys(robber.npcInfo.troops.units).length == 0
		) {
			this.send_hero = false;
			this.send_artillery = false;
		}

		// get village data: right-click for village tooltip
		let extra = random_human_mistake('minor'); if (extra) await sleep_ms(extra); // minor micro hesitation
		const village_ident = village.ident + robber.npcInfo.villageId;
		const village_data: any[] = await async_step(() =>
			api.get_cache([village_ident]), ...this.behavior_profile.action_selection_delay); // 2-5 sec default
		const robber_village: Ivillage = find_state_data(village_ident, village_data);
		if (robber_village == null)
			return null;

		return [cell_id, robber_village];
	}

	public async find_robbers(center_x: number, center_y: number): Promise<any[]> {
		const tiles: any[] = await map_scanner.scan(center_x, center_y);

		const robbers = tiles.filter(tile =>
			tile.playerId === -1 &&
			tile.village &&
			tile.village.type === 5
		);

		return robbers.length > 0 ? [robbers[0]] : [];
	}

	private async check_troops(
		village_id: number,
		robber_position_id: number,
		robber_village_id: number
	): Promise<boolean> {
		const troops_collection: Itroops_collection[] = await troops.get(village_id, troops_type.moving);

		this.sleep_time = this.get_max_movement_time(village_id, robber_position_id, robber_village_id, troops_collection);

		return this.sleep_time > 0;
	}

	private get_max_movement_time(
		village_id: number,
		robber_position_id: number,
		robber_village_id: number,
		troops_collection: Itroops_collection[]
	): number {
		let max_sleep = 0;

		if (!troops_collection) return max_sleep;

		for (const troop of troops_collection) {
			if (!troop.data.movement) continue;

			const movement = troop.data.movement;

			// troops already going to the robber
			if (movement.villageIdTarget === robber_position_id) {
				const travel_time = Number(movement.timeFinish) - Number(movement.timeStart);
				const time_left = get_diff_time(Number(movement.timeFinish));
				max_sleep = Math.max(max_sleep, time_left + travel_time);
			}

			// troops still returning from the robber
			if (movement.villageIdStart === robber_village_id) {
				const time_left = get_diff_time(Number(movement.timeFinish));
				max_sleep = Math.max(max_sleep, time_left);
			}

			// get hero movement time
			if (this.send_hero && troop.data.units[11] > 0) {
				// hero is leaving the village
				if (movement.villageIdStart === village_id) {
					const travel_time = Number(movement.timeFinish) - Number(movement.timeStart);
					const time_left = get_diff_time(Number(movement.timeFinish));
					max_sleep = Math.max(max_sleep, time_left + travel_time);
				}
				// hero is returning to village
				if (movement.villageIdTarget === village_id) {
					const time_left = get_diff_time(Number(movement.timeFinish));
					max_sleep = Math.max(max_sleep, time_left);
				}
			}
		}

		return max_sleep; // 0 if no troops in transit
	}
}

export default new robber_hideouts();

import world_scan_proxy from '../world_scan_proxy';
import { village } from '../gamedata';
import { Icropfinder, Imap_region_tile, Ivillage } from '../interfaces';
import { get_distance, safe_number, build_map_player_name_map, resolve_map_player_name } from '../util';
import {
	build_oasis_map,
	get_oasis_type,
	is_crop_tile,
	get_influence_area,
	resolve_map_details
} from './map/helpers';
import { oasis_type, res_type } from '../data';
import cache from '../cache';

class crop_finder {

	async get_crops(
		village_id: number,
		find_15c: boolean,
		find_9c: boolean,
		find_7c: boolean,
		only_free: boolean
	): Promise<any> {

		// default values
		if (!find_15c && !find_9c && !find_7c)
			find_15c = find_9c = find_7c = true;

		// find village
		const village_data = await village.get_own();
		const found_village: Ivillage = village.find(village_id, village_data);
		if (!found_village) {
			return {
				error: true,
				message: `couldn't find village with id: ${village_id}!`,
				data: null
			};
		}
		const { x, y } = found_village.coordinates;

		const tiles = await world_scan_proxy.run();
		const cells = this.discover_crops(tiles);
		const oases = this.discover_oases(tiles);
		const player_names = build_map_player_name_map(cache.load_map_data());

		const oasis_map = build_oasis_map(oases);

		const crops = [];
		for (const cell of cells) {
			if (!cell.locationId)
				continue;
			if (this.filter_type(cell.resType, find_15c, find_9c, find_7c))
				continue;

			const map_details = resolve_map_details(cell.locationId);
			if (!map_details)
				continue;

			const map_player_id = safe_number(map_details?.playerId ?? null);
			const free = map_player_id === null;
			if (only_free && !free)
				continue;

			const bonus = this.calculate_bonus(cell, oasis_map);
			const distance = get_distance({ x, y }, { x: cell.x, y: cell.y });
			const crop_type = this.get_crop_type(cell.resType);

			const crop: Icropfinder = {
				id: cell.locationId,
				x: cell.x,
				y: cell.y,
				crop_type: crop_type,
				bonus: bonus,
				playerId: map_player_id ?? null,
				player_name: resolve_map_player_name(map_player_id, player_names, map_details?.playerName),
				distance: distance,
				free: free
			};
			crops.push(crop);
		}

		// sort by distance, lowest on top
		crops.sort((a, b) => a.distance - b.distance);

		return {
			error: false,
			message: `${crops.length} found`,
			data: crops
		};
	}

	private discover_crops(tiles: Imap_region_tile[]): Imap_region_tile[] {
		return tiles.filter(is_crop_tile);
	}

	private discover_oases(tiles: Imap_region_tile[]): Imap_region_tile[] {
		return tiles.filter(tile => {
			const oasis_type_value = get_oasis_type(tile);
			switch (oasis_type_value) {
				case oasis_type.wood_1:
				case oasis_type.clay_1:
				case oasis_type.iron_1:
				case oasis_type.crop:
				case oasis_type.crop_1:
					return true;
				default:
					return false;
			}
		});
	}

	private filter_type(resType: any, find_15c: boolean, find_9c: boolean, find_7c: boolean) {
		const is_15c = resType === res_type.c15;
		const is_9c = resType === res_type.c9;
		const is_c7 =
			resType === res_type.c7_1 ||
			resType === res_type.c7_2 ||
			resType === res_type.c7_3;
		return (!find_15c || !is_15c) && (!find_9c || !is_9c) && (!find_7c || !is_c7);
	}

	private get_crop_type(resType: any): string {
		switch (resType) {
			case res_type.c15:
				return '15c';
			case res_type.c9:
				return '9c';
			default:
				return '7c';
		}
	}

	private calculate_bonus(cell: Imap_region_tile, oasis_map: Map<number, Imap_region_tile>): number {
		const embassy_slots: number[] = [];
		for (const location_id of get_influence_area(cell.x, cell.y)) {
			const oasis = oasis_map.get(location_id);
			if (!oasis)
				continue;

			if (!this.matches_crop_oasis(cell.resType, oasis))
				continue;

			const oasis_type_value = get_oasis_type(oasis);
			const crop_bonus = oasis_type_value === oasis_type.crop_1 ? 50 : 25;
			if (embassy_slots.length < 3) {
				embassy_slots.push(crop_bonus);
				continue;
			}
			for (let slot = 0; slot < embassy_slots.length; slot++) {
				if (crop_bonus > embassy_slots[slot]) {
					embassy_slots[slot] = crop_bonus;
					break;
				}
			}
		}

		return embassy_slots.length ?
			embassy_slots.reduce((a, b) => Number(a) + Number(b)) : 0;
	}

	private matches_crop_oasis(res_type_value: string | null, oasis: Imap_region_tile): boolean {
		const oasis_type_value = get_oasis_type(oasis);
		if (!res_type_value || !oasis_type_value)
			return false;

		switch (res_type_value) {
			case res_type.c15:
			case res_type.c9:
			case res_type.c7_1:
			case res_type.c7_2:
			case res_type.c7_3:
				return oasis_type_value === oasis_type.crop || oasis_type_value === oasis_type.crop_1;
			default:
				return false;
		}
	}

}

export default new crop_finder();

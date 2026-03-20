import world_scan_proxy from '../world_scan_proxy';
import { village } from '../gamedata';
import { Iresourcefinder, Imap_region_tile, Imap_details, Ivillage } from '../interfaces';
import { find_state_data, xy2id, get_distance, sleep_ms, safe_number, build_map_player_name_map, resolve_map_player_name } from '../util';
import { build_oasis_map, get_oasis_type } from './map_helpers';
import { oasis_type, res_type } from '../data';
import cache from '../cache';

class resource_finder {

	async get_resources(
		village_id: number,
		find_wood: boolean,
		find_clay: boolean,
		find_iron: boolean,
		only_free: boolean
	): Promise<any> {

		// default values
		if (!find_wood && !find_clay && !find_iron)
			find_wood = find_clay = find_iron = true;

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
		const cells = this.discover_resources(tiles);
		const oases = this.discover_oases(tiles);
		const player_names = build_map_player_name_map(cache.load_map_data());

		const oasis_map = build_oasis_map(oases);
		const resources = [];
		for (const cell of cells) {
			if (!cell.locationId)
				continue;
			if (this.filter_type(cell.resType, find_wood, find_clay, find_iron))
				continue;

			const map_details = this.resolve_map_details(cell.locationId);
			if (!map_details)
				continue;

			const map_player_id = safe_number(map_details?.playerId ?? null);
			const has_village = this.tile_has_village(map_details);
			const free = !has_village;
			if (only_free && !free)
				continue;

			const bonus = this.calculate_bonus(cell, oasis_map);
			const distance = get_distance({ x, y }, { x: cell.x, y: cell.y });

			const resource: Iresourcefinder = {
				id: cell.locationId,
				x: cell.x,
				y: cell.y,
				res_type: cell.resType,
				bonus: bonus,
				playerId: map_player_id ?? null,
				player_name: resolve_map_player_name(map_player_id, player_names, map_details?.playerName),
				distance: distance,
				free: free
			};
			resources.push(resource);
		}

		// sort by distance, lowest on top
		resources.sort((a, b) => a.distance - b.distance);

		return {
			error: false,
			message: `${resources.length} found`,
			data: resources
		};
	}

	private discover_resources(tiles: Imap_region_tile[]): Imap_region_tile[] {
		return tiles.filter(tile => this.is_resource_tile(tile));
	}

	private discover_oases(tiles: Imap_region_tile[]): Imap_region_tile[] {
		return tiles.filter(tile => {
			const oasis_type_value = get_oasis_type(tile);
			switch (oasis_type_value) {
				case oasis_type.wood:
				case oasis_type.wood_1:
				case oasis_type.clay:
				case oasis_type.clay_1:
				case oasis_type.iron:
				case oasis_type.iron_1:
					return true;
				default:
					return false;
			}
		});
	}

	private filter_type(resType: any, find_wood: boolean, find_clay: boolean, find_iron: boolean) {
		const is_wood = resType === res_type.wood_1 || resType === res_type.wood_2;
		const is_clay = resType === res_type.clay_1 || resType === res_type.clay_2;
		const is_iron = resType === res_type.iron_1 || resType === res_type.iron_2;
		return (!find_wood || !is_wood) && (!find_clay || !is_clay) && (!find_iron || !is_iron);
	}

	private calculate_bonus(cell: Imap_region_tile, oasis_map: Map<number, Imap_region_tile>): number {
		const embassy_slots: number[] = [];
		for (const location_id of this.get_influence_area(cell.x, cell.y)) {
			const oasis = oasis_map.get(location_id);
			if (!oasis)
				continue;

			if (!this.matches_resource_oasis(cell.resType, oasis))
				continue;

			const resource_bonus = 25;
			if (embassy_slots.length < 3) {
				embassy_slots.push(resource_bonus);
				continue;
			}
			if (embassy_slots.length >= 3)
				break;
		}
		return embassy_slots.length ?
			embassy_slots.reduce((a, b) => Number(a) + Number(b)) : 0;
	}

	private is_resource_tile(tile: Imap_region_tile): boolean {
		if (!tile || !tile.resType) return false;
		switch (tile.resType) {
			case res_type.wood_1:
			case res_type.wood_2:
			case res_type.clay_1:
			case res_type.clay_2:
			case res_type.iron_1:
			case res_type.iron_2:
				return true;
			default:
				return false;
		}
	}

	private matches_resource_oasis(res_type_value: string, oasis: Imap_region_tile): boolean {
		const oasis_type_value = get_oasis_type(oasis);
		if (!res_type_value || !oasis_type_value)
			return false;

		switch (res_type_value) {
			case res_type.wood_1:
			case res_type.wood_2:
				return oasis_type_value === oasis_type.wood || oasis_type_value === oasis_type.wood_1;
			case res_type.clay_1:
			case res_type.clay_2:
				return oasis_type_value === oasis_type.clay || oasis_type_value === oasis_type.clay_1;
			case res_type.iron_1:
			case res_type.iron_2:
				return oasis_type_value === oasis_type.iron || oasis_type_value === oasis_type.iron_1;
			default:
				return false;
		}
	}

	get_influence_area(x: number, y: number): number[] {
		const area = [];
		// generate left side
		for (let _x = (x - 3); _x <= (x + 3); _x++)
			for (let _y = (y - 3); _y < y; _y++)
				area.push(xy2id(_x, _y));
		// generate right side
		for (let _x = (x - 3); _x <= (x + 3); _x++)
			for (let _y = y; _y <= (y + 3); _y++)
				area.push(xy2id(_x, _y));
		return area;
	}

	private to_number(value: number | string | null | undefined): number | null {
		if (value === null || value === undefined || value === '')
			return null;
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric <= 0)
			return null;
		return numeric;
	}

	private tile_has_village(details: Imap_details | null): boolean {
		if (!details)
			return false;
		const raw = details.hasVillage ?? 0;
		const parsed = Number(raw);
		return Number.isFinite(parsed) && parsed > 0;
	}

	private resolve_map_details(location_id: number): Imap_details | null {
		const ident = village.map_details_ident + location_id;
		const cache_data = cache.get([ident]);
		if (!cache_data || cache_data.length === 0)
			return null;
		return find_state_data(ident, cache_data);
	}

}

export default new resource_finder();
